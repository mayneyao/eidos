import XCTest
@testable import EidosIOS

final class PeerAutoSyncTests: XCTestCase {
    func testEditorInvalidatesLeaseAndCancelsTransferWithoutGrantingDuplicateWork() throws {
        var cancelled: [String] = []
        let gate = PeerAutoSyncGate { cancelled.append($0) }
        let lease = try XCTUnwrap(gate.acquire("first"))
        XCTAssertTrue(gate.allowed("first", lease))
        XCTAssertNil(gate.acquire("duplicate"))
        let editor = gate.hold()
        XCTAssertEqual(cancelled, ["first"])
        XCTAssertFalse(gate.allowed("first", lease))
        gate.unhold(editor)
        XCTAssertFalse(gate.allowed("first", lease))
        gate.release("other")
        XCTAssertNil(gate.acquire("second"))
        gate.release("first")
        XCTAssertNotNil(gate.acquire("second"))
    }
    func testAllRetainedEditorOwnersMustReleaseBeforeCheckout() {
        let gate = PeerAutoSyncGate { _ in }
        let editor = gate.hold(), plugin = gate.hold()
        gate.unhold(editor)
        XCTAssertNil(gate.acquire("background"))
        gate.unhold(plugin)
        XCTAssertNotNil(gate.acquire("background"))
    }
    func testBrowserReadsWaitOnlyForCheckoutAndNotNetworkTransfer() {
        let gate = PeerAutoSyncGate { _ in }
        XCTAssertNotNil(gate.acquire("fetch"))
        XCTAssertTrue(gate.withBrowseRead {})
        gate.setApplying(true)
        XCTAssertFalse(gate.withBrowseRead { XCTFail("Must not read a partial checkout") })
        gate.setApplying(false)
        XCTAssertTrue(gate.withBrowseRead {})
    }
    func testPrivateMarkdownAndRecordDraftsDeferBeforeAccessingPeerHistory() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: root)
        let note = root.appendingPathComponent("note.md")
        try Data("disk".utf8).write(to: note)
        // No valid repository or endpoint is needed: draft guards run first.
        try FileManager.default.createDirectory(at: root.appendingPathComponent(".graft"), withIntermediateDirectories: true)
        let profile = PeerProfile(url: "https://127.0.0.1:1", fingerprint: String(repeating: "a", count: 64), token: "test", name: "Computer", space: "test")
        defer {
            try? DraftStore.shared.discard(note)
            try? FileManager.default.removeItem(at: root)
            try? FileManager.default.removeItem(at: space.privateRoot)
        }
        try DraftStore.shared.stage(note, text: "private draft", digest: LocalSpace.digest(Data("disk".utf8)))
        XCTAssertEqual(try PeerSync.pullUpdates(space, profile: profile, allowed: { true }), "skipped")
        try DraftStore.shared.discard(note)
        let records = space.privateRoot.appendingPathComponent("RecordDrafts")
        try FileManager.default.createDirectory(at: records, withIntermediateDirectories: true)
        try Data("{}".utf8).write(to: records.appendingPathComponent("draft.json"))
        XCTAssertEqual(try PeerSync.pullUpdates(space, profile: profile, allowed: { true }), "skipped")
        try FileManager.default.removeItem(at: records.appendingPathComponent("draft.json"))
        try Data("pending".utf8).write(to: records.appendingPathComponent("draft.pending"))
        XCTAssertEqual(try PeerSync.pullUpdates(space, profile: profile, allowed: { true }), "skipped")
        XCTAssertEqual(try String(contentsOf: note), "disk")
    }
}
