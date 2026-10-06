import Foundation

struct SpaceEntry: Codable, Identifiable, Equatable {
    let id: String
    var name: String
}

final class SpaceCatalog {
    private struct State: Codable { var selected: String; var spaces: [SpaceEntry]; var peerDownloads: [String: SpaceEntry]?; var peerSpaces: [String: SpaceEntry]? }
    private let documents: URL
    private let index: URL
    private var state: State
    var spaces: [SpaceEntry] { state.spaces }
    var selected: SpaceEntry { state.spaces.first { $0.id == state.selected } ?? state.spaces[0] }

    init(documents: URL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0], support: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]) throws {
        self.documents = documents
        index = support.appendingPathComponent("space-catalog.json")
        if FileManager.default.fileExists(atPath: index.path) {
            state = try JSONDecoder().decode(State.self, from: Data(contentsOf: index))
            guard !state.spaces.isEmpty,
                  Set(state.spaces.map(\.id)).count == state.spaces.count,
                  state.spaces.allSatisfy({ $0.id == "local" || UUID(uuidString: $0.id) != nil }) else {
                throw LocalError.message(tr("Space 列表损坏，原始文件仍保留在本机"))
            }
        } else {
            state = State(selected: "local", spaces: [SpaceEntry(id: "local", name: tr("本机 Space"))])
        }
    }

    func root(_ entry: SpaceEntry) -> URL {
        // Preserve the original Space and its existing recovery-draft identities.
        entry.id == "local" ? documents.appendingPathComponent("Space", isDirectory: true)
            : documents.appendingPathComponent("Spaces", isDirectory: true).appendingPathComponent(entry.id, isDirectory: true)
    }

    func select(_ entry: SpaceEntry) throws {
        guard state.spaces.contains(where: { $0.id == entry.id }) else { throw LocalError.message(tr("Space 不存在")) }
        _ = try LocalSpace(root: root(entry))
        var next = state; next.selected = entry.id
        try save(next)
    }

    @discardableResult func create(_ name: String) throws -> SpaceEntry {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        try LocalSpace.validateName(name)
        let entry = SpaceEntry(id: UUID().uuidString, name: name)
        _ = try LocalSpace(root: root(entry))
        var next = state; next.spaces.append(entry); next.selected = entry.id
        try save(next)
        return entry
    }

    // Download identity survives removal of pairing credentials. Pending downloads
    // are deliberately excluded, so an interrupted transfer is not marked complete.
    func peerSpaceID(for entry: SpaceEntry, fingerprint: String) -> String? {
        guard state.spaces.contains(where: { $0.id == entry.id }) else { return nil }
        let prefix = fingerprint + ":"
        return state.peerSpaces?.first(where: { $0.value.id == entry.id && $0.key.hasPrefix(prefix) })
            .map { String($0.key.dropFirst(prefix.count)) }
    }

    func preparePeer(_ profile: PeerProfile) throws -> SpaceEntry {
        let key = profile.fingerprint + ":" + profile.space
        if let entry = state.peerSpaces?[key] { return entry }
        if let entry = state.peerDownloads?[key] { return entry }
        let base = String((profile.spaceName ?? profile.name).unicodeScalars.filter { !CharacterSet.controlCharacters.contains($0) }.map(String.init).joined().prefix(60))
            .replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: "\\", with: "-").replacingOccurrences(of: ":", with: "-")
        var name = base.isEmpty || base.hasPrefix(".") ? tr("电脑 Space") : base
        let existing = state.spaces + Array((state.peerDownloads ?? [:]).values)
        var number = 2
        let original = name
        while existing.contains(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) { name = original + " (\(number))"; number += 1 }
        let entry = SpaceEntry(id: UUID().uuidString, name: name)
        _ = try LocalSpace(root: root(entry))
        var next = state
        if next.peerDownloads == nil { next.peerDownloads = [:] }
        next.peerDownloads?[key] = entry
        try save(next)
        return entry
    }

    func completePeer(_ profile: PeerProfile, entry: SpaceEntry) throws {
        let key = profile.fingerprint + ":" + profile.space
        if state.peerSpaces?[key] == entry { return }
        guard state.peerDownloads?[key] == entry else { throw LocalError.message(tr("下载 Space 已变更，请重试")) }
        var next = state
        next.spaces.append(entry)
        if next.peerSpaces == nil { next.peerSpaces = [:] }
        next.peerSpaces?[key] = entry
        next.peerDownloads?.removeValue(forKey: key)
        try save(next)
    }

    private func save(_ next: State) throws {
        try FileManager.default.createDirectory(at: index.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(next).write(to: index, options: [.atomic, .completeFileProtectionUnlessOpen])
        state = next
    }

    // Run on LocalSpace.io after system authentication, with the editor closed.
    func deleteLocal(_ entry: SpaceEntry) throws {
        guard state.spaces.contains(entry) else { throw LocalError.message(tr("Space 已不存在")) }
        let local = try LocalSpace(root: root(entry))
        _ = try Runtime.call(local.root, "graft:close")
        _ = try Runtime.call(local.root, "close")
        var next = state
        next.spaces.removeAll { $0.id == entry.id }
        if next.spaces.isEmpty {
            let replacement = SpaceEntry(id: UUID().uuidString, name: tr("本机 Space"))
            _ = try LocalSpace(root: root(replacement))
            next.spaces = [replacement]
        }
        if next.selected == entry.id { next.selected = next.spaces[0].id }
        next.peerSpaces = next.peerSpaces?.filter { $0.value.id != entry.id }
        next.peerDownloads = next.peerDownloads?.filter { $0.value.id != entry.id }
        let quarantine = documents.appendingPathComponent(".deleted-space-" + UUID().uuidString)
        try FileManager.default.moveItem(at: local.root, to: quarantine)
        do { try save(next) }
        catch { try? FileManager.default.moveItem(at: quarantine, to: local.root); throw error }
        try DeviceSecrets.remove(PeerSync.key(local))
        try DeviceSecrets.remove(SyncAccount.profileKey(local))
        UserDefaults.standard.removeObject(forKey: "background-sync:" + LocalSpace.storageIdentity(local.root))
        UserDefaults.standard.removeObject(forKey: "background-result:" + entry.id)
        try DraftStore.shared.discardAll(under: local.root)
        if FileManager.default.fileExists(atPath: local.privateRoot.path) { try FileManager.default.removeItem(at: local.privateRoot) }
        try FileManager.default.removeItem(at: quarantine)
    }
}
