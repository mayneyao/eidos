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
        guard !FileManager.default.fileExists(atPath: target.path) else { throw LocalError.message("同名文件已存在") }
        try FileManager.default.createDirectory(at: target, withIntermediateDirectories: false)
        return target
    }
    func rename(_ source: URL, to name: String) throws -> URL {
        let source = try checked(source)
        try Self.validateName(name)
        guard !DraftStore.shared.hasDraft(under: source) else { throw LocalError.message("此文件有未保存草稿，请先打开并保存草稿再重命名") }
        if !Self.isDirectory(source), ["eidos", "md", "markdown"].contains(source.pathExtension.lowercased()),
           URL(fileURLWithPath: name).pathExtension.lowercased() != source.pathExtension.lowercased() {
            throw LocalError.message("重命名时请保留原扩展名")
        }
        let destination = source.deletingLastPathComponent().appendingPathComponent(name)
        if source == destination { return source }
        guard !FileManager.default.fileExists(atPath: destination.path) else { throw LocalError.message("同名文件已存在") }
        _ = try Runtime.call(root, "close")
        try FileManager.default.moveItem(at: source, to: destination)
        return destination
    }
    func trash(_ source: URL) throws {
        let source = try checked(source)
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
        guard UUID(uuidString: item.id) != nil else { throw LocalError.message("无效回收项目") }
        let destination = try checked(root.appendingPathComponent(item.relativePath))
        guard !FileManager.default.fileExists(atPath: destination.path) else { throw LocalError.message("原位置已有同名文件，请先重命名该文件后再恢复") }
        let parent = try checked(destination.deletingLastPathComponent(), allowRoot: true)
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
        let folder = privateRoot.appendingPathComponent("Trash").appendingPathComponent(item.id)
        try FileManager.default.moveItem(at: folder.appendingPathComponent("payload"), to: destination)
        try? FileManager.default.removeItem(at: folder)
        return destination
    }
    func exportSnapshot(_ source: URL) throws -> URL {
        let source = try checked(source)
        guard !Self.isDirectory(source) else { throw LocalError.message("请逐个导出文件") }
        _ = try Runtime.call(root, "close")
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("Exports").appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let copy = folder.appendingPathComponent(source.lastPathComponent)
        try FileManager.default.copyItem(at: source, to: copy)
        return copy
    }
}
