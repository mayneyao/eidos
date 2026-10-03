import CryptoKit
import Foundation

enum LocalError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
}

enum Runtime {
    // Native dispatch owns a dedicated OS thread; serial GCD queues can switch threads.
    static func call(_ url: URL, _ method: String, _ params: Any = [:]) throws -> Any {
        let data = try JSONSerialization.data(withJSONObject: params, options: [.fragmentsAllowed])
        let request = String(decoding: data, as: UTF8.self)
        guard let pointer = eidos_ios_execute(url.path, method, request) else {
            throw LocalError.message("Runtime 未返回结果")
        }
        defer { eidos_ios_free(pointer) }
        let result = try JSONSerialization.jsonObject(with: Data(String(cString: pointer).utf8)) as? [String: Any]
        guard result?["ok"] as? Bool == true else {
            throw LocalError.message(result?["error"] as? String ?? "Runtime 操作失败")
        }
        return result?["value"] ?? NSNull()
    }
}

final class LocalSpace {
    static let io = DispatchQueue(label: "space.eidos.ios.storage")
    let root: URL
    var privateRoot: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Spaces").appendingPathComponent(Self.digest(Data(Self.storageIdentity(root).utf8)))
    }
    // iOS may move the app's data container during an update. Private indexes
    // use a Documents-relative identity, never the transient container prefix.
    static func storageIdentity(_ url: URL) -> String {
        let path = url.standardizedFileURL.path
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].standardizedFileURL.path
        if path.hasPrefix(documents + "/") { return "documents:" + String(path.dropFirst(documents.count + 1)) }
        return path
    }
    init(root: URL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Space", isDirectory: true)) throws {
        self.root = root
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }
    func files(in directory: URL? = nil) throws -> [URL] {
        let directory = try checked(directory ?? root, allowRoot: true)
        return try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.isRegularFileKey, .isDirectoryKey, .isSymbolicLinkKey], options: [.skipsHiddenFiles])
            .filter { url in
                guard let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .isDirectoryKey, .isSymbolicLinkKey]) else { return false }
                return values.isSymbolicLink != true && (values.isDirectory == true || values.isRegularFile == true)
                    && !["wal", "shm", "journal"].contains(url.pathExtension.lowercased())
                    && !url.lastPathComponent.hasSuffix(".eidos-wal") && !url.lastPathComponent.hasSuffix(".eidos-shm")
            }
            .sorted { a, b in
                let ad = Self.isDirectory(a), bd = Self.isDirectory(b)
                return ad != bd ? ad : a.lastPathComponent.localizedStandardCompare(b.lastPathComponent) == .orderedAscending
            }
    }
    static func isDirectory(_ url: URL) -> Bool { (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true }
    func checked(_ url: URL, allowRoot: Bool = false) throws -> URL {
        let candidate = url.standardizedFileURL
        let base = root.standardizedFileURL.resolvingSymlinksInPath()
        let resolved = candidate.resolvingSymlinksInPath()
        guard (allowRoot && resolved == base) || resolved.path.hasPrefix(base.path + "/") else { throw LocalError.message("文件必须位于当前 Space 内") }
        var current = candidate
        while current.path != root.standardizedFileURL.path && current.path != "/" {
            guard !current.lastPathComponent.hasPrefix("."), (try? current.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) != true else { throw LocalError.message("不支持隐藏路径或符号链接") }
            current.deleteLastPathComponent()
        }
        return candidate
    }
    static func validateName(_ name: String) throws {
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !name.hasPrefix("."),
              !name.contains("/"), !name.contains("\\"), !name.contains(":"), !name.contains("\0"), name.utf8.count <= 200 else { throw LocalError.message("请输入有效名称（不含路径分隔符，且不以点开头）") }
    }
    func availableURL(_ name: String, extension ext: String, in directory: URL? = nil) -> URL {
        var index = 1
        let directory = directory ?? root
        func candidate(_ suffix: String) -> URL {
            let result = directory.appendingPathComponent(name + suffix)
            return ext.isEmpty ? result : result.appendingPathExtension(ext)
        }
        var url = candidate("")
        while FileManager.default.fileExists(atPath: url.path) {
            index += 1
            url = candidate(" \(index)")
        }
        return url
    }
    func create(markdown: Bool, in directory: URL? = nil) throws -> URL {
        let parent = try checked(directory ?? root, allowRoot: true)
        let url = availableURL(markdown ? "笔记" : "记录", extension: markdown ? "md" : "eidos", in: parent)
        if markdown { try Data("# 新笔记\n\n".utf8).write(to: url, options: [.atomic, .completeFileProtectionUnlessOpen]) }
        else { _ = try Runtime.call(url, "create", ["title":url.deletingPathExtension().lastPathComponent]) }
        return url
    }
    func importFile(_ source: URL, in directory: URL? = nil) throws -> URL {
        let parent = try checked(directory ?? root, allowRoot: true)
        try Self.validateName(source.lastPathComponent)
        let accessing = source.startAccessingSecurityScopedResource()
        defer { if accessing { source.stopAccessingSecurityScopedResource() } }
        let destination = availableURL(source.deletingPathExtension().lastPathComponent, extension: source.pathExtension, in: parent)
        let staging = privateRoot.appendingPathComponent("Imports").appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: staging) }
        let copy = staging.appendingPathComponent("payload")
        var coordinationError: NSError?
        var copyError: Error?
        NSFileCoordinator().coordinate(readingItemAt: source, options: [], error: &coordinationError) { url in
            do {
                let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
                guard values.isRegularFile == true, values.isSymbolicLink != true, (values.fileSize ?? Int.max) <= 64 * 1024 * 1024 else { throw LocalError.message("仅支持不超过 64 MB 的普通文件") }
                try FileManager.default.copyItem(at: url, to: copy)
                guard (try copy.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max) <= 64 * 1024 * 1024 else { throw LocalError.message("文件超过 64 MB") }
            } catch { copyError = error }
        }
        if let error = coordinationError ?? copyError as NSError? { throw error }
        try FileManager.default.moveItem(at: copy, to: destination)
        return destination
    }
    static func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    static func readMarkdown(_ url: URL) throws -> [String: Any] {
        guard (try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max) <= 2 * 1024 * 1024 else { throw LocalError.message("Markdown 编辑上限为 2 MB，请导出后使用其他编辑器打开") }
        let data = try Data(contentsOf: url)
        guard let text = String(data: data, encoding: .utf8) else { throw LocalError.message("Markdown 必须使用 UTF-8 编码") }
        return ["text":text, "digest":digest(data)]
    }
    static func saveMarkdown(_ url: URL, text: String, expectedDigest: String) throws -> [String: Any] {
        let data = Data(text.utf8)
        var coordinationError: NSError?
        var writeError: Error?
        NSFileCoordinator().coordinate(writingItemAt: url, options: .forReplacing, error: &coordinationError) { target in
            do {
                guard digest(try Data(contentsOf: target)) == expectedDigest else { throw LocalError.message("文件已在其他位置更改。当前草稿仍在编辑器中，请复制后重新打开。") }
                try data.write(to: target, options: [.atomic, .completeFileProtectionUnlessOpen])
            } catch { writeError = error }
        }
        if let error = coordinationError { throw error }
        if let error = writeError { throw error }
        return ["digest":digest(data)]
    }
    static func resource(_ path: String, under root: URL) throws -> URL {
        let candidate = root.appendingPathComponent(path).standardizedFileURL.resolvingSymlinksInPath()
        let base = root.standardizedFileURL.resolvingSymlinksInPath().path + "/"
        guard candidate.path.hasPrefix(base), try candidate.checkResourceIsReachable() else { throw LocalError.message("资源不存在或路径越界") }
        return candidate
    }
}
