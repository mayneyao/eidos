import Foundation

/// Process-local authority only. The IO queue still owns all file replacement.
final class PeerAutoSyncGate {
    private let lock = NSLock()
    private var editors = Set<UUID>()
    private var generation = 0
    private var active: String?
    private var applying = false
    private let cancel: (String) -> Void
    init(cancel: @escaping (String) -> Void) { self.cancel = cancel }
    func hold() -> UUID {
        let id = UUID()
        lock.lock(); editors.insert(id); generation += 1; let operation = active; lock.unlock()
        if let operation { cancel(operation) }
        return id
    }
    func unhold(_ id: UUID) { lock.lock(); editors.remove(id); generation += 1; lock.unlock() }
    func cancelActive() {
        lock.lock(); let operation = active; lock.unlock()
        if let operation { cancel(operation) }
    }
    func acquire(_ operation: String) -> Int? {
        lock.lock(); defer { lock.unlock() }
        guard active == nil, editors.isEmpty else { return nil }
        active = operation
        return generation
    }
    func allowed(_ operation: String, _ lease: Int) -> Bool {
        lock.lock(); defer { lock.unlock() }
        return active == operation && generation == lease && editors.isEmpty
    }
    func release(_ operation: String) {
        lock.lock(); if active == operation { active = nil }; lock.unlock()
    }
    func setApplying(_ value: Bool) { lock.lock(); applying = value; lock.unlock() }
    var isApplying: Bool { lock.lock(); defer { lock.unlock() }; return applying }
    func withBrowseRead(_ body: () -> Void) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard !applying else { return false }
        body()
        return true
    }
}

/// Scheduling and editor authority live in the Adapter. GraftHost owns the
/// shared clean-worktree, expected-head and fast-forward rules.
enum PeerAutoSync {
    static let changed = Notification.Name("EidosPeerUpdatesApplied")
    static let settled = Notification.Name("EidosPeerCheckoutSettled")
    private static let gate = PeerAutoSyncGate(cancel: cancel)

    final class EditorLease {
        private let id = gate.hold()
        deinit { gate.unhold(id) }
    }
    private static func cancel(_ operation: String) {
        _ = eidos_ios_cancellation(operation, 1); SyncHTTP.cancel(operation)
    }
    static func cancelActive() {
        gate.cancelActive()
    }
    static var isApplying: Bool { gate.isApplying }
    static func withBrowseRead(_ body: () -> Void) -> Bool { gate.withBrowseRead(body) }
    static func withCheckout<T>(_ body: () throws -> T) rethrows -> T {
        gate.setApplying(true)
        defer { gate.setApplying(false) }
        return try body()
    }
    /// Called from the foreground; never takes focus or presents progress/errors.
    static func request() {
        let operation = UUID().uuidString
        guard let lease = gate.acquire(operation) else { return }
        guard eidos_ios_cancellation(operation, 0) else { gate.release(operation); return }
        SyncHTTP.begin(operation)
        // Bound discovery/transfer even when the foreground is otherwise idle.
        let timeout = DispatchWorkItem { cancel(operation) }
        DispatchQueue.global().asyncAfter(deadline: .now() + 45, execute: timeout)
        LocalSpace.io.async {
            Runtime.cancellation = operation
            defer {
                Runtime.cancellation = nil; timeout.cancel()
                _ = eidos_ios_cancellation(operation, 2); SyncHTTP.end(operation); gate.release(operation)
            }
            perform(operation, lease: lease)
        }
    }
    /// Existing BGProcessingTask supplies cancellation and the serialized IO queue.
    static func background(_ operation: String) {
        guard let lease = gate.acquire(operation) else { return }
        defer { gate.release(operation) }
        perform(operation, lease: lease)
    }
    private static func perform(_ operation: String, lease: Int) {
        guard let catalog = try? SpaceCatalog() else { return }
        // Rotate the first candidate so one unavailable/large Space cannot
        // monopolize every bounded foreground or OS background opportunity.
        let spaces = catalog.spaces
        let start = UserDefaults.standard.integer(forKey: "peer-auto-cursor") % max(1, spaces.count)
        UserDefaults.standard.set((start + 1) % max(1, spaces.count), forKey: "peer-auto-cursor")
        for entry in Array(spaces.dropFirst(start)) + Array(spaces.prefix(start)) {
            guard gate.allowed(operation, lease), (try? SyncHTTP.checkCancellation(operation)) != nil else { break }
            var updated = false
            defer {
                if !updated { DispatchQueue.main.async { NotificationCenter.default.post(name: settled, object: catalog.root(entry)) } }
            }
            do {
                let space = try LocalSpace(root: catalog.root(entry))
                guard let profile = try PeerSync.load(space),
                      catalog.peerSpaceID(for: entry, fingerprint: profile.fingerprint) == profile.space else { continue }
                let result = try PeerSync.pullUpdates(space, profile: profile) { gate.allowed(operation, lease) }
                if result == "updated" {
                    updated = true
                    UserDefaults.standard.set(Date(), forKey: "peer-last-sync:" + LocalSpace.storageIdentity(space.root))
                    DispatchQueue.main.async { NotificationCenter.default.post(name: changed, object: space.root) }
                }
            } catch { /* Offline, denied, cancelled, old gateway: retry next time. */ }
        }
    }
}
