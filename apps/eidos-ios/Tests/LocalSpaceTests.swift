import XCTest
@testable import EidosIOS

final class LocalSpaceTests: XCTestCase {
    func testFoldersRenameTrashRestoreAndSnapshot() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: root)
        defer { try? FileManager.default.removeItem(at: root); try? FileManager.default.removeItem(at: space.privateRoot) }
        let folder = try space.createFolder("Folder", in: root)
        let note = try space.create(markdown: true, in: folder)
        XCTAssertEqual(try space.files().map(\.path), [folder.path])
        XCTAssertEqual(try space.files(in: folder), [note])
        XCTAssertThrowsError(try space.createFolder("../escape", in: root))
        XCTAssertThrowsError(try space.createFolder(".graft", in: root))
        let renamed = try space.rename(note, to: "Renamed.md")
        XCTAssertThrowsError(try space.rename(renamed, to: "Renamed.eidos"))
        let snapshot = try space.exportSnapshot(renamed)
        defer { try? FileManager.default.removeItem(at: snapshot.deletingLastPathComponent()) }
        try Data("new".utf8).write(to: renamed)
        XCTAssertNotEqual(try Data(contentsOf: renamed), try Data(contentsOf: snapshot))
        try space.trash(folder)
        XCTAssertTrue(try space.files().isEmpty)
        let item = try XCTUnwrap(try space.trashItems().first)
        XCTAssertEqual(try space.restore(item).path, folder.path)
        XCTAssertEqual(try String(contentsOf: renamed, encoding: .utf8), "new")
        XCTAssertTrue(try space.trashItems().isEmpty)
        let imported = try space.importFile(renamed, in: folder)
        XCTAssertNotEqual(imported, renamed)
        XCTAssertEqual(try Data(contentsOf: imported), try Data(contentsOf: renamed))
        let link = root.appendingPathComponent("outside")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: root.deletingLastPathComponent())
        XCTAssertThrowsError(try space.create(markdown: true, in: link))
        XCTAssertThrowsError(try space.createFolder("escape", in: link))
    }
    func testDraftSurvivesReopenAndNeverOverwritesExternalChanges() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: root)
        defer { try? FileManager.default.removeItem(at: root) }
        let file = try space.create(markdown: true)
        let drafts = DraftStore(root: root.appendingPathComponent("private-drafts"))
        let initial = try LocalSpace.readMarkdown(file)
        let digest = try XCTUnwrap(initial["digest"] as? String)
        try drafts.stage(file, text: "Recovered", digest: digest)
        let reopened = DraftStore(root: drafts.root)
        XCTAssertEqual(try reopened.read(file)["text"] as? String, "Recovered")
        XCTAssertEqual(try reopened.read(file)["recovered"] as? Bool, true)
        try Data("External edit".utf8).write(to: file)
        XCTAssertThrowsError(try reopened.save(file, text: "Recovered", digest: digest))
        XCTAssertEqual(try String(contentsOf: file, encoding: .utf8), "External edit")
        XCTAssertEqual(try reopened.read(file)["digest"] as? String, digest)
        XCTAssertEqual(try reopened.read(file)["text"] as? String, "Recovered")
        let current = LocalSpace.digest(try Data(contentsOf: file))
        _ = try reopened.save(file, text: "Resolved", digest: current)
        XCTAssertNil(try reopened.read(file)["recovered"])
    }
    func testGraftCheckpointIncludesLocalFileAndReopens() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: root)
        defer { _ = try? Runtime.call(root, "close"); try? FileManager.default.removeItem(at: root) }
        _ = try space.create(markdown: true)
        _ = try space.create(markdown: false)
        let saved = try XCTUnwrap(try Runtime.call(root, "graft:checkpoint") as? [String: Any])
        XCTAssertEqual(saved["initialized"] as? Bool, true)
        let history = try XCTUnwrap(try Runtime.call(root, "graft:history") as? [String: Any])
        XCTAssertEqual((history["commits"] as? [Any])?.count, 1)
        XCTAssertThrowsError(try Runtime.call(root, "graft:push"))
    }
    func testMarkdownAtomicSaveAndConflict() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let space = try LocalSpace(root: root)
        let file = try space.create(markdown: true)
        let initial = try LocalSpace.readMarkdown(file)
        let digest = try XCTUnwrap(initial["digest"] as? String)
        _ = try LocalSpace.saveMarkdown(file, text: "# 离线保存", expectedDigest: digest)
        XCTAssertEqual(try String(contentsOf: file, encoding: .utf8), "# 离线保存")
        XCTAssertThrowsError(try LocalSpace.saveMarkdown(file, text: "lost", expectedDigest: digest))
        XCTAssertEqual(try String(contentsOf: file, encoding: .utf8), "# 离线保存")
        XCTAssertNotEqual(space.availableURL("笔记", extension: "md"), file)
    }
    func testResourceTraversalAndSymlink() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let root = directory.appendingPathComponent("Space")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        try Data("secret".utf8).write(to: directory.appendingPathComponent("secret"))
        XCTAssertThrowsError(try LocalSpace.resource("../secret", under: root))
        try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("escape"), withDestinationURL: root.deletingLastPathComponent())
        XCTAssertThrowsError(try LocalSpace.resource("escape/secret", under: root))
        XCTAssertThrowsError(try LocalSpace.resource("escape/missing", under: root))
    }
    func testRuntimeOnIOSCreateReopenAndRejectHostSQL() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: root)
        defer { _ = try? Runtime.call(root, "close"); try? FileManager.default.removeItem(at: root) }
        let file = try space.create(markdown: false)
        _ = try Runtime.call(file, "close")
        let snapshot = try XCTUnwrap(try Runtime.call(file, "getSnapshot") as? [String: Any])
        XCTAssertNotNil(snapshot["revision"])
        XCTAssertThrowsError(try Runtime.call(file, "executeSql", ["sql":"DROP TABLE x"]))
        XCTAssertThrowsError(try Runtime.call(file, "create", ["title":"overwrite"]))
    }
}
