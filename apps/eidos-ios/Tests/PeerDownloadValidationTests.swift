import XCTest
@testable import EidosIOS

final class PeerDownloadValidationTests: XCTestCase {
    func testFinalizationPreservesOpaqueFilesWithoutValidation() async throws {
        let fixture = URL(fileURLWithPath: "/tmp/eidos-ios-files.eidos")
        guard FileManager.default.fileExists(atPath: fixture.path) else { throw XCTSkip("Requires an explicit files.eidos fixture copy") }
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
            LocalSpace.io.async {
                let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
                defer { try? FileManager.default.removeItem(at: root) }
                do {
                    let space = try LocalSpace(root: root)
                    let file = root.appendingPathComponent("files.eidos")
                    try FileManager.default.copyItem(at: fixture, to: file)
                    let before = try Data(contentsOf: file)
                    var stages: [String] = []
                    try PeerSync.finalizeDownload(space) { stages.append($0) }
                    XCTAssertEqual(PeerSync.downloadWarnings(try LocalSpace(root: root)), [])
                    XCTAssertEqual(try Data(contentsOf: file), before)
                    XCTAssertEqual(stages.count, 1)
                    XCTAssertEqual(stages[0], "正在完成下载")
                    try Data("not a SQLite database".utf8).write(to: root.appendingPathComponent("broken.eidos"))
                    try PeerSync.finalizeDownload(space) { _ in }
                    XCTAssertEqual(try String(contentsOf: root.appendingPathComponent("broken.eidos"), encoding: .utf8), "not a SQLite database")
                    XCTAssertThrowsError(try Runtime.call(root.appendingPathComponent("broken.eidos"), "validate", ["level": "identity"]))
                    let link = root.appendingPathComponent("linked.eidos")
                    try FileManager.default.createSymbolicLink(at: link, withDestinationURL: fixture)
                    XCTAssertThrowsError(try PeerSync.finalizeDownload(space) { _ in })
                    done.resume()
                } catch { done.resume(throwing: error) }
            }
        }
    }

    func testProgressUsesCurrentTransferStage() throws {
        let progress = try JSONDecoder().decode(PeerTransferProgress.self, from: Data("{\"download\":{\"transferred\":25,\"total\":100,\"planned\":true},\"upload\":{\"transferred\":10,\"total\":20,\"planned\":true}}".utf8))
        XCTAssertNil(PeerTransferProgress.Transfer(transferred: 25, total: 100).fraction)
        XCTAssertEqual(progress.transfer(for: "下载数据")?.fraction, 0.25)
        XCTAssertNil(progress.transfer(for: "获取清单"))
        XCTAssertNil(progress.transfer(for: "写入文件"))
        XCTAssertEqual(progress.stage(for: "获取清单"), "下载数据")
        XCTAssertEqual(progress.stage(for: "写入文件"), "写入文件")
        XCTAssertEqual(progress.transfer(for: "发送本机版本")?.fraction, 0.5)
        XCTAssertNil(progress.transfer(for: "正在完成下载 1/15"))
        XCTAssertNil(PeerTransferProgress.Transfer(transferred: 0, total: nil).fraction)
    }
}
