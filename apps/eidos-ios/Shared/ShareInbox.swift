import Foundation

struct SharedBatch: Codable, Identifiable {
    let id: String
    let created: Date
    let text: String
    let files: [String]
}

enum ShareInbox {
    static let group = "group.space.eidos.ios"
    static func root() throws -> URL {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
            throw NSError(domain: "EidosShare", code: 1, userInfo: [NSLocalizedDescriptionKey: "无法打开分享存储，请检查 App Group 配置"])
        }
        let root = container.appendingPathComponent("Inbox", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }
    static func batches() throws -> [SharedBatch] {
        try FileManager.default.contentsOfDirectory(at: root(), includingPropertiesForKeys: nil).compactMap { directory in
            guard UUID(uuidString: directory.lastPathComponent) != nil,
                  let data = try? Data(contentsOf: directory.appendingPathComponent("batch.json")),
                  let batch = try? JSONDecoder().decode(SharedBatch.self, from: data), batch.id == directory.lastPathComponent,
                  batch.files.allSatisfy({ !$0.contains("/") && !$0.contains("\\") && !$0.hasPrefix(".") }) else { return nil }
            return batch
        }.sorted { $0.created < $1.created }
    }
}
