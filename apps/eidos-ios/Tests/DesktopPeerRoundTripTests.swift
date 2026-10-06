import XCTest
@testable import EidosIOS

/// Requires the real development Desktop window and a Space downloaded through
/// its normal UI. Desktop conflict resolution is deliberately left to that UI.
final class DesktopPeerRoundTripTests: XCTestCase {
    func testDownloadedSpaceFinalizesWithoutContentValidation() async throws {
        let config = URL(fileURLWithPath: "/tmp/eidos-desktop-roundtrip.json")
        guard FileManager.default.fileExists(atPath: config.path) else { throw XCTSkip("Requires the Desktop UI verification session") }
        let options = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: config)) as? [String: Any])
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
            LocalSpace.io.async {
                do {
                    let catalog = try SpaceCatalog()
                    let spaces = try catalog.spaces.map { try LocalSpace(root: catalog.root($0)) }
                    let space = try XCTUnwrap(spaces.first { space in
                        guard let profile = try? PeerSync.load(space) else { return false }
                        return profile.fingerprint == options["fingerprint"] as? String && profile.space == options["space"] as? String
                    })
                    try PeerSync.finalizeDownload(space) { print("FINALIZATION: " + $0) }
                    XCTAssertEqual(PeerSync.downloadWarnings(try LocalSpace(root: space.root)), [])
                    done.resume()
                } catch { done.resume(throwing: error) }
            }
        }
    }

    func testCompleteSpaceEditsAndDesktopConflictReview() async throws {
        let config = URL(fileURLWithPath: "/tmp/eidos-desktop-roundtrip.json")
        guard FileManager.default.fileExists(atPath: config.path) else { throw XCTSkip("Requires the Desktop UI verification session") }
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
            LocalSpace.io.async {
                do { try self.exercise(config); done.resume() }
                catch { try? self.record(["phase": "failed", "error": error.localizedDescription]); done.resume(throwing: error) }
            }
        }
    }

    func testResumeAfterCompletedDesktopReview() async throws {
        let config = URL(fileURLWithPath: "/tmp/eidos-desktop-roundtrip.json")
        guard FileManager.default.fileExists(atPath: config.path) else { throw XCTSkip("Requires the Desktop UI verification session") }
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
            LocalSpace.io.async {
                do { try self.exercise(config, resumeOnly: true); done.resume() }
                catch { done.resume(throwing: error) }
            }
        }
    }

    private func record(_ value: [String: Any]) throws {
        try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted]).write(to: URL(fileURLWithPath: "/tmp/eidos-desktop-roundtrip-state.json"), options: .atomic)
    }

    private func exercise(_ config: URL, resumeOnly: Bool = false) throws {
        let options = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: config)) as? [String: Any])
        let fingerprint = try XCTUnwrap(options["fingerprint"] as? String)
        let remoteID = try XCTUnwrap(options["space"] as? String)
        let desktop = URL(fileURLWithPath: try XCTUnwrap(options["desktopRoot"] as? String))
        guard desktop.path == "/tmp/eidos-peer-goal-desktop/my-eidos-space" else { throw LocalError.message("Use the isolated Desktop verification copy") }
        let catalog = try SpaceCatalog()
        var selected: (LocalSpace, PeerProfile)?
        for entry in catalog.spaces {
            let space = try LocalSpace(root: catalog.root(entry))
            if let profile = try PeerSync.load(space), profile.fingerprint == fingerprint, profile.space == remoteID { selected = (space, profile); break }
        }
        let (space, profile) = try XCTUnwrap(selected, "Download this Desktop's complete Space through the app before running")
        defer { _ = try? Runtime.call(space.root, "graft:close"); _ = try? Runtime.call(space.root, "close") }
        let performance = space.root.appendingPathComponent("showcase/performance/perf-test.eidos")
        XCTAssertGreaterThan(try performance.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0, 500_000_000)
        let localNote = space.root.appendingPathComponent("sync-verification.md")
        let desktopNote = desktop.appendingPathComponent("sync-verification.md")
        func sync() throws { try PeerSync.sync(space, profile: profile) { print("DESKTOP_ROUNDTRIP: " + $0) } }
        func write(_ file: URL, _ text: String) throws { try Data(text.utf8).write(to: file, options: .atomic) }

        // Repeated verification starts from the Desktop's latest reviewed head,
        // including a resolution completed after an interrupted test run.
        try sync()
        if resumeOnly {
            XCTAssertEqual(try String(contentsOf: localNote, encoding: .utf8), "Desktop concurrent edit\n")
            try record(["phase": "review-resumed", "root": space.root.path])
            return
        }
        try write(localNote, "from iOS\n")
        try sync()
        XCTAssertEqual(try String(contentsOf: desktopNote, encoding: .utf8), "from iOS\n")
        try record(["phase": "ios-edit-received", "root": space.root.path])

        // Transfer an actual canonical database mutation in the full Space.
        let database = space.root.appendingPathComponent("sync-verification.eidos")
        if !FileManager.default.fileExists(atPath: database.path) { _ = try Runtime.call(database, "create", ["title": "Sync verification"]) }
        let snapshot = try XCTUnwrap(try Runtime.call(database, "getSnapshot") as? [String: Any])
        let schema = try XCTUnwrap(try Runtime.call(database, "getSchemaPage", ["revision": snapshot["revision"]!, "limit": 200]) as? [String: Any])
        let table = try XCTUnwrap((schema["objects"] as? [[String: Any]])?.first { $0["object"] as? String == "table" })
        let label = try XCTUnwrap(table["labelFieldId"] as? String)
        _ = try Runtime.call(database, "mutateRows", ["tableId": table["id"]!, "expectedRevision": snapshot["revision"]!, "changes": [["kind": "create", "clientKey": UUID().uuidString, "values": [label: "edited on iOS"]]]])
        _ = try Runtime.call(database, "close")
        try sync()
        let receivedDatabase = desktop.appendingPathComponent(database.lastPathComponent)
        let report = try Runtime.call(receivedDatabase, "validate", ["level": "full", "diagnosticsLimit": 100]) as? [String: Any]
        XCTAssertEqual(report?["valid"] as? Bool, true)
        let rows = try Runtime.call(receivedDatabase, "queryRows", ["tableId": table["id"]!, "query": [:], "projection": ["fields": [label], "resolveRelations": []], "limit": 50]) as? [String: Any]
        XCTAssertTrue((rows?["rows"] as? [[String: Any]] ?? []).contains { ($0["values"] as? [String])?.contains("edited on iOS") == true })
        _ = try Runtime.call(receivedDatabase, "close")
        try record(["phase": "database-edit-received", "root": space.root.path])

        try write(desktopNote, "Desktop concurrent edit\n")
        try write(localNote, "iOS concurrent edit\n")
        XCTAssertThrowsError(try sync()) { XCTAssertTrue($0.localizedDescription.contains("请到电脑"), $0.localizedDescription) }
        XCTAssertNil(try MergeReview.load(space))
        XCTAssertEqual(try String(contentsOf: localNote, encoding: .utf8), "iOS concurrent edit\n")
        try write(space.root.appendingPathComponent("sync-waiting.md"), "written while Desktop reviews the conflict\n")
        XCTAssertThrowsError(try sync())
        let marker = URL(fileURLWithPath: "/tmp/eidos-desktop-roundtrip-resolved")
        let requested = Date()
        try record(["phase": "needs-desktop-review", "root": space.root.path, "choose": "Desktop concurrent edit"])
        var resolved = false
        while Date().timeIntervalSince(requested) < 600 {
            // URL resource values cache metadata. Read fresh attributes so a
            // marker from a preceding run cannot hide the host's new signal.
            if let attributes = try? FileManager.default.attributesOfItem(atPath: marker.path),
               let modified = attributes[.modificationDate] as? Date,
               modified > requested { resolved = true; break }
            Thread.sleep(forTimeInterval: 0.25)
        }
        guard resolved else { throw LocalError.message("Desktop UI review was not completed") }
        try sync()
        XCTAssertEqual(try String(contentsOf: localNote, encoding: .utf8), "Desktop concurrent edit\n")
        XCTAssertEqual(try String(contentsOf: desktop.appendingPathComponent("sync-waiting.md"), encoding: .utf8), "written while Desktop reviews the conflict\n")
        try record(["phase": "passed", "root": space.root.path, "markdownUpload": true, "databaseUpload": true, "desktopConflictReview": true, "editsDuringConflict": true])
    }
}
