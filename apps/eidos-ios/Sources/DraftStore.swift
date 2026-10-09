import Foundation

final class DraftStore {
    static let shared = DraftStore(root: FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("MarkdownDrafts"))
    struct Draft: Codable {
        let path: String
        let text: String
        let digest: String
    }
    let root: URL
    init(root: URL) { self.root = root }
    private func key(_ file: URL) -> URL { root.appendingPathComponent(LocalSpace.digest(Data(LocalSpace.storageIdentity(file).utf8))).appendingPathExtension("json") }
    func stage(_ file: URL, text: String, digest: String) throws {
        guard text.utf8.count <= 2 * 1024 * 1024 else { throw LocalError.message(tr("Markdown 编辑上限为 2 MB")) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try JSONEncoder().encode(Draft(path: LocalSpace.storageIdentity(file), text: text, digest: digest)).write(to: key(file), options: [.atomic, .completeFileProtectionUnlessOpen])
    }
    func read(_ file: URL) throws -> [String: Any] {
        var document = try LocalSpace.readMarkdown(file)
        guard FileManager.default.fileExists(atPath: key(file).path) else { return document }
        let draft = try JSONDecoder().decode(Draft.self, from: Data(contentsOf: key(file)))
        if LocalSpace.digest(Data(draft.text.utf8)) == document["digest"] as? String {
            try FileManager.default.removeItem(at: key(file))
        } else {
            document["text"] = draft.text
            document["digest"] = draft.digest
            document["recovered"] = true
        }
        return document
    }
    func save(_ file: URL, text: String, digest: String, space: LocalSpace? = nil) throws -> [String: Any] {
        let previousText = try LocalSpace.readMarkdown(file)["text"] as? String
        try stage(file, text: text, digest: digest)
        let result = try LocalSpace.saveMarkdown(file, text: text, expectedDigest: digest)
        // Disk contains the committed text even if draft cleanup is interrupted.
        try? FileManager.default.removeItem(at: key(file))
        if let updated = space?.runFileHooks(file, type: "document.saved", previousText: previousText) { return updated }
        return result
    }
    func discard(_ file: URL) throws {
        if FileManager.default.fileExists(atPath: key(file).path) { try FileManager.default.removeItem(at: key(file)) }
    }
    func hasDraft(under file: URL) -> Bool {
        guard let entries = try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) else { return false }
        return entries.contains { url in
            guard let data = try? Data(contentsOf: url), let draft = try? JSONDecoder().decode(Draft.self, from: data) else { return true }
            let identity = LocalSpace.storageIdentity(file)
            return draft.path == identity || draft.path.hasPrefix(identity + "/")
        }
    }

    func discardAll(under directory: URL) throws {
        guard FileManager.default.fileExists(atPath: root.path) else { return }
        let identity = LocalSpace.storageIdentity(directory)
        for url in try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) {
            guard let data = try? Data(contentsOf: url), let draft = try? JSONDecoder().decode(Draft.self, from: data),
                  draft.path == identity || draft.path.hasPrefix(identity + "/") else { continue }
            try FileManager.default.removeItem(at: url)
        }
    }
}
