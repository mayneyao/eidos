import XCTest
@testable import EidosIOS

final class SpaceCatalogTests: XCTestCase {
    func testDeleteLocalSpacePreservesOtherFilesAndCreatesFreshLastSpace() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let documents = root.appendingPathComponent("Documents")
        let support = root.appendingPathComponent("Support")
        let catalog = try SpaceCatalog(documents: documents, support: support)
        let original = catalog.selected
        let local = try LocalSpace(root: catalog.root(original))
        let file = local.root.appendingPathComponent("note.md")
        try Data("private draft".utf8).write(to: file)
        try DraftStore.shared.stage(file, text: "unsaved", digest: "old")
        let second = try catalog.create("保留")
        let kept = catalog.root(second).appendingPathComponent("keep.md")
        try Data("keep".utf8).write(to: kept)
        try catalog.deleteLocal(original)
        XCTAssertFalse(FileManager.default.fileExists(atPath: local.root.path))
        XCTAssertFalse(DraftStore.shared.hasDraft(under: local.root))
        XCTAssertEqual(try String(contentsOf: kept, encoding: .utf8), "keep")
        XCTAssertEqual(catalog.spaces, [second])
        try catalog.deleteLocal(second)
        XCTAssertEqual(catalog.spaces.count, 1)
        XCTAssertNotEqual(catalog.selected.id, second.id)
        XCTAssertFalse(FileManager.default.fileExists(atPath: kept.path))
        XCTAssertEqual(try SpaceCatalog(documents: documents, support: support).spaces, catalog.spaces)
    }
    func testPeerDownloadStaysHiddenUntilCompletionAndRetriesReuseItsDirectory() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let documents = root.appendingPathComponent("Documents")
        let support = root.appendingPathComponent("Support")
        func catalog() throws -> SpaceCatalog { try SpaceCatalog(documents: documents, support: support) }
        let profile = PeerProfile(url: "https://192.168.1.2:1234", fingerprint: String(repeating: "a", count: 64), token: "test", name: "工作", space: "remote")
        let pending = try catalog().preparePeer(profile)
        XCTAssertEqual(try catalog().spaces.count, 1)
        XCTAssertEqual(try catalog().preparePeer(profile), pending)
        try catalog().completePeer(profile, entry: pending)
        XCTAssertEqual(try catalog().spaces.count, 2)
        XCTAssertEqual(try catalog().preparePeer(profile), pending)
        XCTAssertNotEqual(try catalog().selected, pending)
    }
    func testRestoresSelectedSpaceAndPreservesOriginalDirectory() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let documents = root.appendingPathComponent("Documents")
        let support = root.appendingPathComponent("Support")
        let catalog = try SpaceCatalog(documents: documents, support: support)
        let original = catalog.selected
        XCTAssertEqual(catalog.root(original), documents.appendingPathComponent("Space", isDirectory: true))
        let second = try catalog.create("工作")
        let note = try LocalSpace(root: catalog.root(second)).create(markdown: true)
        let restored = try SpaceCatalog(documents: documents, support: support)
        XCTAssertEqual(restored.selected, second)
        XCTAssertTrue(FileManager.default.fileExists(atPath: note.path))
        try restored.select(original)
        XCTAssertEqual(try SpaceCatalog(documents: documents, support: support).selected, original)
        XCTAssertThrowsError(try restored.create("../escape"))
    }
}
