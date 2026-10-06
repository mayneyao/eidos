import XCTest
@testable import EidosIOS

/// Explicit opt-in only: uses the staging smoke account and disposable content.
/// The companion account script completes consent without exposing credentials.
final class StagingSyncTests: XCTestCase {
    func testNativeStagingLoginSyncConflictAndPublish() async throws {
        let control = URL(fileURLWithPath: "/tmp/eidos-ios-staging-native")
        let marker = control.appendingPathComponent("enabled")
        guard let date = try? marker.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate,
              Date().timeIntervalSince(date) < 300 else { throw XCTSkip("Requires an explicitly enabled staging smoke session") }
        XCTAssertEqual(SyncEnvironment.account, "https://staging.eidos.space")
        guard SyncEnvironment.account == "https://staging.eidos.space" else { return }
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
            LocalSpace.io.async {
                do { try self.exercise(control); done.resume() }
                catch { done.resume(throwing: error) }
            }
        }
    }
    private func exercise(_ control: URL) throws {
        let accountKey = "account:" + SyncEnvironment.client
        let loginKey = "login:" + SyncEnvironment.client
        let previousAccount = try DeviceSecrets.load(accountKey)
        let previousLogin = try DeviceSecrets.load(loginKey)
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ios-staging-" + UUID().uuidString)
        let first = try LocalSpace(root: root.appendingPathComponent("first"))
        let second = try LocalSpace(root: root.appendingPathComponent("second"))
        defer {
            _ = try? Runtime.call(first.root, "graft:close")
            _ = try? Runtime.call(first.root, "close")
            for space in [first, second] {
                try? DeviceSecrets.remove(SyncAccount.profileKey(space))
                try? FileManager.default.removeItem(at: space.privateRoot)
            }
            try? FileManager.default.removeItem(at: root)
            if let previousAccount { try? DeviceSecrets.save(accountKey, data: previousAccount) }
            else { try? DeviceSecrets.remove(accountKey) }
            if let previousLogin { try? DeviceSecrets.save(loginKey, data: previousLogin) }
            else { try? DeviceSecrets.remove(loginKey) }
            for name in ["request", "callback", "enabled"] { try? FileManager.default.removeItem(at: control.appendingPathComponent(name)) }
        }
        let authorization = try SyncAccount.beginLogin()
        try Data(authorization.absoluteString.utf8).write(to: control.appendingPathComponent("request"), options: .atomic)
        let callback = control.appendingPathComponent("callback")
        let deadline = Date().addingTimeInterval(90)
        while !FileManager.default.fileExists(atPath: callback.path), Date() < deadline { Thread.sleep(forTimeInterval: 0.2) }
        let url = try XCTUnwrap(URL(string: String(contentsOf: callback, encoding: .utf8)))
        try SyncAccount.finishLogin(url)
        XCTAssertNotNil(try SyncAccount.stored()?["subject"])
        print("PASS: native iOS PKCE exchange and Keychain login")

        // Force the real native refresh path, preserving and restoring any prior account.
        var tokens = try XCTUnwrap(SyncAccount.stored()); tokens["expiresAt"] = 0
        try DeviceSecrets.save(accountKey, data: JSONSerialization.data(withJSONObject: tokens))
        _ = try SyncAccount.accessToken()
        _ = try SyncAccount.repositories()
        print("PASS: native iOS refresh and registered cloud access")

        let name = "ios-smoke-" + UUID().uuidString.lowercased()
        let provisioned = try SyncAccount.request(SyncEnvironment.remote + "/api/graft/repositories/" + name, method: "PUT", body: ["display_name": "iOS disposable smoke"], token: SyncAccount.accessToken())
        let remote = try XCTUnwrap(provisioned["remote_url"] as? String)
        try Data(name.utf8).write(to: control.appendingPathComponent("repository"), options: .atomic)
        let note = first.root.appendingPathComponent("note.md")
        try Data("# iOS staging smoke\n\nInitial content.\n".utf8).write(to: note)
        let database = try first.create(markdown: false)
        try SyncAccount.connect(first, url: remote, clone: false)
        _ = try Runtime.call(first.root, "graft:checkpoint")
        _ = try Runtime.call(first.root, "graft:push")
        try SyncAccount.connect(second, url: remote, clone: true)
        XCTAssertEqual(try String(contentsOf: second.root.appendingPathComponent("note.md")), try String(contentsOf: note))
        XCTAssertNotNil(try Runtime.call(second.root.appendingPathComponent(database.lastPathComponent), "getSnapshot"))
        print("PASS: native iOS provision, push, clone and Eidos database reopen")

        try Data("# Remote edit\n".utf8).write(to: note)
        try SyncAccount.sync(first)
        let otherNote = second.root.appendingPathComponent("note.md")
        try Data("# Local edit\n".utf8).write(to: otherNote)
        XCTAssertThrowsError(try SyncAccount.sync(second))
        _ = try Runtime.call(second.root, "graft:close")
        let conflict = try XCTUnwrap(MergeReview.load(second))
        XCTAssertGreaterThan(conflict.unresolved, 0)
        _ = try Runtime.call(second.root, "graft:chooseMergePath", ["stateToken": conflict.token, "path": "note.md", "side": "theirs"])
        let resolved = try XCTUnwrap(MergeReview.load(second))
        XCTAssertEqual(resolved.unresolved, 0)
        _ = try Runtime.call(second.root, "graft:continueMerge", ["stateToken": resolved.token])
        try SyncAccount.sync(second)
        XCTAssertEqual(try String(contentsOf: otherNote), "# Remote edit\n")
        print("PASS: native iOS cloud divergence, recovered review, resolution and push")

        var publish: [String: Any] = ["origin": SyncEnvironment.publish, "token": try SyncAccount.accessToken(register: false), "slug": name, "access": "public", "path": "note.md", "operationId": UUID().uuidString]
        var binding: String?
        defer {
            if let binding { publish["publicationId"] = binding; _ = try? Runtime.call(first.root, "publish:unpublish", publish) }
        }
        let uploaded = try XCTUnwrap(try Runtime.call(first.root, "publish:publish", publish) as? [String: Any])
        binding = try XCTUnwrap(uploaded["publicationId"] as? String)
        publish["publicationId"] = binding
        try Data("# iOS staging smoke updated\n".utf8).write(to: note)
        _ = try Runtime.call(first.root, "publish:publish", publish)
        _ = try Runtime.call(first.root, "publish:unpublish", publish)
        binding = nil
        print("PASS: native iOS Publish upload, update and unpublish")
    }
}
