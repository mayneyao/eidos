import Foundation

/// Private drafts never enter the synchronized Space. A submitted draft is retained
/// until native acknowledgement so interrupted submissions cannot be retried blindly.
enum RecordDraftStore {
    static func hasDraft(_ space: LocalSpace, under file: URL? = nil) -> Bool {
        let directory = space.privateRoot.appendingPathComponent("RecordDrafts")
        return ((try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []).contains { name in
            guard name.hasSuffix(".json") else { return false }
            guard let file else { return true }
            guard let data = try? Data(contentsOf: directory.appendingPathComponent(name)),
                  let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let document = value["_document"] as? String else { return true }
            let identity = LocalSpace.storageIdentity(file)
            return document == identity || document.hasPrefix(identity + "/")
        }
    }
    static func location(_ file: URL, space: LocalSpace, share: String?) throws -> URL {
        let directory = space.privateRoot.appendingPathComponent("RecordDrafts")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent(LocalSpace.digest(Data((LocalSpace.storageIdentity(file) + ":" + (share ?? "new")).utf8)) + ".json")
    }
    static func read(_ file: URL, space: LocalSpace, share: String?) throws -> [String: Any]? {
        let url = try location(file, space: space, share: share)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
    }
    static func save(_ value: [String: Any], file: URL, space: LocalSpace, share: String?) throws {
        var stored = value; stored["_document"] = LocalSpace.storageIdentity(file)
        let data = try JSONSerialization.data(withJSONObject: stored)
        guard data.count <= 8 * 1024 * 1024 else { throw LocalError.message(tr("记录草稿过大")) }
        try data.write(to: location(file, space: space, share: share), options: [.atomic, .completeFileProtectionUnlessOpen])
    }
    static func remove(_ file: URL, space: LocalSpace, share: String?) throws {
        let url = try location(file, space: space, share: share)
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
    }
}
