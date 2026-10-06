import Foundation

struct TrashedFile: Codable, Identifiable {
    let id: String
    let relativePath: String
    let date: Date
}

extension LocalSpace {
    func createFolder(_ name: String, in directory: URL) throws -> URL {
        try Self.validateName(name)
        let target = try checked(directory, allowRoot: true).appendingPathComponent(name)
        guard !FileManager.default.fileExists(atPath: target.path) else { throw LocalError.message(tr("同名文件已存在")) }
        try FileManager.default.createDirectory(at: target, withIntermediateDirectories: false)
        return target
    }
    func rename(_ source: URL, to name: String) throws -> URL {
        let source = try checked(source)
        try Self.validateName(name)
        guard !DraftStore.shared.hasDraft(under: source), !RecordDraftStore.hasDraft(self, under: source) else { throw LocalError.message(tr("此文件有未保存草稿，请先打开并保存草稿再重命名")) }
        if !Self.isDirectory(source), ["eidos", "md", "markdown"].contains(source.pathExtension.lowercased()),
           URL(fileURLWithPath: name).pathExtension.lowercased() != source.pathExtension.lowercased() {
            throw LocalError.message(tr("重命名时请保留原扩展名"))
        }
        let destination = source.deletingLastPathComponent().appendingPathComponent(name)
        if source == destination { return source }
        guard !FileManager.default.fileExists(atPath: destination.path) else { throw LocalError.message(tr("同名文件已存在")) }
        _ = try Runtime.call(root, "close")
        try FileManager.default.moveItem(at: source, to: destination)
        return destination
    }
    func trash(_ source: URL) throws {
        let source = try checked(source)
        guard !RecordDraftStore.hasDraft(self, under: source) else { throw LocalError.message(tr("请先保存或放弃此文件的记录草稿")) }
        _ = try Runtime.call(root, "close")
        let item = TrashedFile(id: UUID().uuidString, relativePath: String(source.path.dropFirst(root.standardizedFileURL.path.count + 1)), date: Date())
        let folder = privateRoot.appendingPathComponent("Trash").appendingPathComponent(item.id)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try JSONEncoder().encode(item).write(to: folder.appendingPathComponent("info.json"), options: .atomic)
        try FileManager.default.moveItem(at: source, to: folder.appendingPathComponent("payload"))
    }
    func trashItems() throws -> [TrashedFile] {
        let folder = privateRoot.appendingPathComponent("Trash")
        guard FileManager.default.fileExists(atPath: folder.path) else { return [] }
        return try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil).compactMap { entry in
            guard FileManager.default.fileExists(atPath: entry.appendingPathComponent("payload").path),
                  let data = try? Data(contentsOf: entry.appendingPathComponent("info.json")),
                  let item = try? JSONDecoder().decode(TrashedFile.self, from: data), item.id == entry.lastPathComponent else { return nil }
            return item
        }.sorted { $0.date > $1.date }
    }
    func restore(_ item: TrashedFile) throws -> URL {
        guard UUID(uuidString: item.id) != nil else { throw LocalError.message(tr("无效回收项目")) }
        let destination = try checked(root.appendingPathComponent(item.relativePath))
        guard !FileManager.default.fileExists(atPath: destination.path) else { throw LocalError.message(tr("原位置已有同名文件，请先重命名该文件后再恢复")) }
        let parent = try checked(destination.deletingLastPathComponent(), allowRoot: true)
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
        let folder = privateRoot.appendingPathComponent("Trash").appendingPathComponent(item.id)
        try FileManager.default.moveItem(at: folder.appendingPathComponent("payload"), to: destination)
        try? FileManager.default.removeItem(at: folder)
        return destination
    }
    func exportSnapshot(_ source: URL) throws -> URL {
        let source = try checked(source, allowRoot: true)
        guard !DraftStore.shared.hasDraft(under: source), !RecordDraftStore.hasDraft(self, under: source) else { throw LocalError.message(tr("请先保存草稿后再导出")) }
        _ = try Runtime.call(root, "close")
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("Exports").appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let copy = folder.appendingPathComponent(source.lastPathComponent)
        if Self.isDirectory(source) { try Self.copyFolder(source, to: copy) }
        else { try FileManager.default.copyItem(at: source, to: copy) }
        return copy
    }

    func importFolder(_ source: URL, in directory: URL?) throws -> URL {
        let access = source.startAccessingSecurityScopedResource()
        defer { if access { source.stopAccessingSecurityScopedResource() } }
        let parent = try checked(directory ?? root, allowRoot: true)
        try Self.validateName(source.lastPathComponent)
        let target = availableURL(source.lastPathComponent, extension: "", in: parent)
        let staging = privateRoot.appendingPathComponent("Imports").appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: staging) }
        var coordinationError: NSError?
        var failure: Error?
        NSFileCoordinator().coordinate(readingItemAt: source, options: [], error: &coordinationError) { coordinated in
            do { try Self.copyFolder(coordinated, to: staging) } catch { failure = error }
        }
        if let failure { throw failure }
        if let coordinationError { throw coordinationError }
        try FileManager.default.moveItem(at: staging, to: target)
        return target
    }

    private static func copyFolder(_ source: URL, to destination: URL) throws {
        var count = 0; var bytes = 0
        func copy(_ source: URL, _ target: URL) throws {
            let values = try source.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .isRegularFileKey, .fileSizeKey])
            guard values.isSymbolicLink != true else { throw LocalError.message(tr("不支持导入或导出符号链接")) }
            count += 1
            guard count <= 20_000 else { throw LocalError.message(tr("文件夹超过 20000 个项目")) }
            if values.isDirectory == true {
                try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
                for entry in try FileManager.default.contentsOfDirectory(at: source, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]) {
                    guard !entry.lastPathComponent.hasSuffix("-wal"), !entry.lastPathComponent.hasSuffix("-shm"), !entry.lastPathComponent.hasSuffix("-journal") else { continue }
                    try copy(entry, target.appendingPathComponent(entry.lastPathComponent))
                }
            } else {
                guard values.isRegularFile == true else { throw LocalError.message(tr("不支持此文件类型")) }
                if source.pathExtension.lowercased() == "eidos" {
                    let wal = URL(fileURLWithPath: source.path + "-wal")
                    if (try? wal.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0 > 0 {
                        throw LocalError.message(tr("请先关闭来源中的 Eidos 文件，再传输文件夹"))
                    }
                }
                bytes += values.fileSize ?? 0
                guard bytes <= 1024 * 1024 * 1024 else { throw LocalError.message(tr("单次文件夹传输限 1 GiB")) }
                try FileManager.default.copyItem(at: source, to: target)
            }
        }
        do { try copy(source, destination) }
        catch { try? FileManager.default.removeItem(at: destination); throw error }
    }
}
