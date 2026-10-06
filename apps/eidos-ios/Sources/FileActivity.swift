import Foundation

struct FileActivity: Codable {
    static let changed = Notification.Name("EidosFileActivityChanged")
    var favorites: [String] = []
    var recent: [String] = []
    static func load(_ space: LocalSpace) throws -> Self {
        let url = space.privateRoot.appendingPathComponent("file-activity.json")
        guard FileManager.default.fileExists(atPath: url.path) else { return Self() }
        return try JSONDecoder().decode(Self.self, from: Data(contentsOf: url))
    }
    func save(_ space: LocalSpace) throws {
        try FileManager.default.createDirectory(at: space.privateRoot, withIntermediateDirectories: true)
        try JSONEncoder().encode(self).write(to: space.privateRoot.appendingPathComponent("file-activity.json"), options: .atomic)
        NotificationCenter.default.post(name: Self.changed, object: space.root)
    }
    static func path(_ file: URL, space: LocalSpace) -> String { String(file.path.dropFirst(space.root.path.count + 1)) }
    func files(_ paths: [String], space: LocalSpace) -> [URL] {
        paths.compactMap { relative in
            guard let file = try? space.checked(space.root.appendingPathComponent(relative)), FileManager.default.fileExists(atPath: file.path) else { return nil }
            return file
        }
    }
}
