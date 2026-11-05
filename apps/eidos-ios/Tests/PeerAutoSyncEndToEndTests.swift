import XCTest
@testable import EidosIOS

/// Opt-in: a real PeerService, pinned TLS, native Graft and the production
/// automatic coordinator. BGProcessing OS launch is a separate physical-device gate.
final class PeerAutoSyncEndToEndTests: XCTestCase {
    private var profile: PeerProfile!
    private var controlToken = ""
    private var controlTunnel: PeerTunnel!
    private var checks: [String] = []

    private func io<T>(_ action: @escaping () throws -> T) async throws -> T {
        try await withCheckedThrowingContinuation { continuation in
            LocalSpace.io.async { continuation.resume(with: Result { try action() }) }
        }
    }
    private func control(_ action: String, _ extra: [String: Any] = [:]) throws -> [String: Any] {
        var body = extra; body["action"] = action
        return try controlTunnel.call("/auto-fixture", token: controlToken, body: body, timeout: 10, cancellation: nil)
    }
    private func head(_ space: LocalSpace) throws -> String {
        let result = try XCTUnwrap(try Runtime.call(space.root, "graft:status") as? [String: Any])
        return try XCTUnwrap((result["status"] as? [String: Any])?["current_head"] as? String)
    }
    private func assertHead(_ space: LocalSpace, _ expected: String?) async throws {
        let actual = try await io { try self.head(space) }
        XCTAssertEqual(actual, expected)
    }
    private func pull() async throws {
        let id = UUID().uuidString
        guard eidos_ios_cancellation(id, 0) else { throw LocalError.message("Cannot begin test operation") }
        SyncHTTP.begin(id)
        defer { _ = eidos_ios_cancellation(id, 2); SyncHTTP.end(id) }
        try await io {
            Runtime.cancellation = id
            defer { Runtime.cancellation = nil }
            PeerAutoSync.background(id)
        }
    }
    private func waitForGate() async throws {
        for _ in 0..<100 {
            if try control("status")["entered"] as? Bool == true { return }
            try await Task.sleep(for: .milliseconds(50))
        }
        throw LocalError.message("Native automatic fetch did not reach the real desktop gate")
    }
    private func withSpace(_ name: String, _ body: (LocalSpace, String) async throws -> Void) async throws {
        let entry = try await io { try PeerSync.download(self.profile, progress: { _ in }) }
        let space = try await io { try LocalSpace(root: SpaceCatalog().root(entry)) }
        let previous = try await io { try self.head(space) }
        let manual = try XCTUnwrap(try control("downloaded")["manualSyncs"] as? Int)
        do {
            try await body(space, previous)
            XCTAssertEqual(try control("status")["manualSyncs"] as? Int, manual, "Automatic pull must not enter /sync")
            checks.append(name)
        } catch {
            _ = try? control("release")
            try? await io { try SpaceCatalog().deleteLocal(entry) }
            throw error
        }
        try await io { try SpaceCatalog().deleteLocal(entry) }
    }

    func testActualNativeAutomaticPullSafety() async throws {
        let fixture = URL(fileURLWithPath: "/tmp/eidos-ios-auto-fixture.json")
        guard FileManager.default.fileExists(atPath: fixture.path) else { throw XCTSkip("Requires peer-auto-sync.manual.test.ts") }
        let isolated = try await io {
            let catalog = try SpaceCatalog()
            guard catalog.spaces.count == 1, catalog.selected.id == "local" else { return false }
            return try PeerSync.load(LocalSpace(root: catalog.root(catalog.selected))) == nil
        }
        guard isolated else { throw LocalError.message("Use a fresh, isolated simulator application") }
        let config = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: fixture)) as? [String: Any])
        controlToken = try XCTUnwrap(config["controlToken"] as? String)
        let invitation = try PeerInvitation.parse(try XCTUnwrap(config["invitation"] as? String))
        controlTunnel = try PeerTunnel(url: invitation.url, fingerprint: invitation.fingerprint)
        defer { controlTunnel.close() }
        var token: String?
        for _ in 0..<100 {
            let result = try controlTunnel.call("/pair", token: invitation.ticket, body: ["name": "iOS auto E2E"], cancellation: nil)
            if result["state"] as? String == "approved" { token = result["token"] as? String; break }
            try await Task.sleep(for: .milliseconds(100))
        }
        profile = PeerProfile(url: invitation.url, fingerprint: invitation.fingerprint, token: try XCTUnwrap(token), name: "Auto E2E", space: invitation.space)
        try await withSpace("clean-fast-forward-and-foreground-coalescing") { space, previous in
            let advanced = try self.control("advance", ["label": "ios-clean"])
            let count = try XCTUnwrap(try self.control("status")["updates"] as? Int)
            PeerAutoSync.request(); PeerAutoSync.request()
            let current = try await self.io { try self.head(space) }
            XCTAssertEqual(current, advanced["head"] as? String)
            XCTAssertNotEqual(current, previous)
            XCTAssertEqual(try String(contentsOf: space.root.appendingPathComponent("note.md")), "ios-clean")
            XCTAssertEqual(try self.control("status")["updates"] as? Int, count + 1)
            try await self.pull()
            try await self.assertHead(space, current)
        }
        try await withSpace("dirty-markdown-and-attachment") { space, previous in
            try Data("local Markdown".utf8).write(to: space.root.appendingPathComponent("note.md"), options: .atomic)
            let attachment = space.root.appendingPathComponent("assets/sample.bin")
            try Data([9, 8, 7]).write(to: attachment, options: .atomic)
            _ = try self.control("advance", ["label": "ios-dirty"])
            try await self.pull()
            try await self.assertHead(space, previous)
            XCTAssertEqual(try String(contentsOf: space.root.appendingPathComponent("note.md")), "local Markdown")
            XCTAssertEqual(try Data(contentsOf: attachment), Data([9, 8, 7]))
        }
        try await withSpace("canonical-sqlite-local-write") { space, previous in
            let database = space.root.appendingPathComponent("data.eidos")
            try await self.io {
                let snapshot = try XCTUnwrap(try Runtime.call(database, "getSnapshot") as? [String: Any])
                let schema = try XCTUnwrap(try Runtime.call(database, "getSchemaPage", ["revision": snapshot["revision"]!, "limit": 200]) as? [String: Any])
                let table = try XCTUnwrap((schema["objects"] as? [[String: Any]])?.first { $0["object"] as? String == "table" })
                let label = try XCTUnwrap(table["labelFieldId"] as? String)
                _ = try Runtime.call(database, "mutateRows", ["tableId": table["id"]!, "expectedRevision": snapshot["revision"]!, "changes": [["kind": "create", "clientKey": "local", "values": [label: "local SQLite write"]]]])
                _ = try Runtime.call(database, "close")
            }
            let bytes = try Data(contentsOf: database)
            _ = try self.control("advance", ["label": "ios-sqlite-dirty"])
            try await self.pull()
            try await self.assertHead(space, previous)
            XCTAssertEqual(try Data(contentsOf: database), bytes)
        }
        try await withSpace("disk-edit-during-real-fetch") { space, previous in
            _ = try self.control("advance", ["label": "ios-concurrent"])
            _ = try self.control("arm", ["gate": "graft"])
            let task = Task { try await self.pull() }
            try await self.waitForGate()
            // Deliberately act as an external filesystem writer outside the IO queue.
            try Data("external edit during fetch".utf8).write(to: space.root.appendingPathComponent("note.md"), options: .atomic)
            _ = try self.control("release")
            try await task.value
            try await self.assertHead(space, previous)
            XCTAssertEqual(try String(contentsOf: space.root.appendingPathComponent("note.md")), "external edit during fetch")
        }
        try await withSpace("cancel-real-native-fetch-and-retry") { space, previous in
            let remote = try self.control("advance", ["label": "ios-cancelled"])
            _ = try self.control("arm", ["gate": "graft"])
            let task = Task { try await self.pull() }
            try await self.waitForGate()
            PeerAutoSync.cancelActive()
            let start = Date()
            try await task.value
            XCTAssertLessThan(Date().timeIntervalSince(start), 5)
            _ = try self.control("release")
            try await self.assertHead(space, previous)
            try await self.pull()
            try await self.assertHead(space, remote["head"] as? String)
        }
        try await withSpace("real-editor-owner-starts-during-fetch") { space, previous in
            _ = try self.control("advance", ["label": "ios-editor"])
            _ = try self.control("arm", ["gate": "graft"])
            let task = Task { try await self.pull() }
            try await self.waitForGate()
            let editor = await MainActor.run {
                EditorView(file: space.root.appendingPathComponent("note.md"), space: space, dark: false, controller: EditorController(), onLeave: {}).makeCoordinator()
            }
            try await task.value
            _ = try self.control("release")
            try await self.io { try DraftStore.shared.stage(space.root.appendingPathComponent("note.md"), text: "unsaved editor draft", digest: LocalSpace.digest(Data(contentsOf: space.root.appendingPathComponent("note.md")))) }
            try await self.pull()
            try await self.assertHead(space, previous)
            XCTAssertTrue(DraftStore.shared.hasDraft(under: space.root))
            withExtendedLifetime(editor) {}
        }
        try await withSpace("clean-but-diverged-commits") { space, _ in
            try await self.io {
                try Data("local independent commit".utf8).write(to: space.root.appendingPathComponent("local.md"), options: .atomic)
                _ = try Runtime.call(space.root, "graft:checkpoint")
            }
            let local = try await self.io { try self.head(space) }
            _ = try self.control("advance", ["label": "ios-diverged"])
            try await self.pull()
            try await self.assertHead(space, local)
            XCTAssertEqual(try String(contentsOf: space.root.appendingPathComponent("local.md")), "local independent commit")
        }
        try JSONSerialization.data(withJSONObject: ["checks": checks, "osBackgroundLaunch": "not supported on Simulator"], options: [.prettyPrinted]).write(to: URL(fileURLWithPath: "/tmp/eidos-ios-auto-result.json"), options: .atomic)
        try await io { try PeerSync.forgetDevice(invitation.fingerprint) }
    }
}
