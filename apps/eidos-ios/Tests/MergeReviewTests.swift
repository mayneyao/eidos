import XCTest
import SwiftUI
@testable import EidosIOS

final class MergeReviewTests: XCTestCase {
    @MainActor
    func testDivergenceLoadsNativeReviewAndPreservesChosenVersion() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let desktop = try LocalSpace(root: root.appendingPathComponent("desktop"))
        let phone = try LocalSpace(root: root.appendingPathComponent("phone"))
        let remote = root.appendingPathComponent("remote")
        try FileManager.default.createDirectory(at: remote, withIntermediateDirectories: true)
        defer { _ = try? Runtime.call(phone.root, "graft:close"); try? FileManager.default.removeItem(at: root) }
        let config = ["url": "fs://" + remote.path]
        try Data("original".utf8).write(to: desktop.root.appendingPathComponent("note.md"))
        _ = try Runtime.call(desktop.root, "graft:checkpoint")
        _ = try Runtime.call(desktop.root, "graft:configureRemote", config)
        _ = try Runtime.call(desktop.root, "graft:push")
        _ = try Runtime.call(phone.root, "graft:clone", config)
        try Data("desktop edit".utf8).write(to: desktop.root.appendingPathComponent("note.md"))
        _ = try Runtime.call(desktop.root, "graft:checkpoint")
        _ = try Runtime.call(desktop.root, "graft:push")
        try Data("phone edit".utf8).write(to: phone.root.appendingPathComponent("note.md"))
        _ = try Runtime.call(phone.root, "graft:checkpoint")
        _ = try Runtime.call(phone.root, "graft:fetch")
        XCTAssertThrowsError(try SyncAccount.mergeFetched(phone))
        _ = try Runtime.call(phone.root, "graft:close")
        let review = try XCTUnwrap(MergeReview.load(phone))
        XCTAssertEqual(review.unresolved, 1)
        XCTAssertEqual(review.paths.first?.path, "note.md")
        XCTAssertEqual(review.paths.first?.hasOurs, true)
        XCTAssertEqual(review.paths.first?.hasTheirs, true)
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene); window.frame = UIScreen.main.bounds
        window.rootViewController = UIHostingController(rootView: MergeReviewView(space: phone, onFinish: {}, review: review))
        window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil }
        try await Task.sleep(nanoseconds: 300_000_000)
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) }
        try image.pngData()?.write(to: URL(fileURLWithPath: "/tmp/iOS-conflict-review.png"))
        let attachment = XCTAttachment(image: image); attachment.name = "iOS conflict review"; attachment.lifetime = .keepAlways; add(attachment)
        _ = try Runtime.call(phone.root, "graft:chooseMergePath", ["stateToken": review.token, "path": "note.md", "side": "theirs"])
        let resolved = try XCTUnwrap(MergeReview.load(phone))
        XCTAssertEqual(resolved.unresolved, 0)
        _ = try Runtime.call(phone.root, "graft:continueMerge", ["stateToken": resolved.token])
        XCTAssertNil(try MergeReview.load(phone))
        XCTAssertEqual(try String(contentsOf: phone.root.appendingPathComponent("note.md")), "desktop edit")
    }
}
