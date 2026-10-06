import XCTest
@testable import EidosIOS

final class ParityTests: XCTestCase {
    func testPeerRoundtripOverPinnedTLS() throws {
        guard FileManager.default.fileExists(atPath: "/tmp/eidos-ios-peer-fixture.json") else { throw XCTSkip("Requires the disposable desktop peer fixture") }
        let done = expectation(description: "native peer round trip")
        LocalSpace.io.async {
            do { try self.peerRoundtrip() } catch { XCTFail(error.localizedDescription) }
            done.fulfill()
        }
        wait(for: [done], timeout: 180)
    }
    private func peerRoundtrip() throws {
        let fixture = URL(fileURLWithPath: "/tmp/eidos-ios-peer-fixture.json")
        guard FileManager.default.fileExists(atPath: fixture.path) else { throw XCTSkip("Requires the disposable desktop peer fixture") }
        let data = try JSONSerialization.jsonObject(with: Data(contentsOf: fixture)) as? [String: Any]
        let invitation = try PeerInvitation.parse(XCTUnwrap(data?["invitation"] as? String))
        let deviceKey = "peer-device:" + invitation.fingerprint
        let previousDevice = try DeviceSecrets.load(deviceKey)
        let previousDevices = UserDefaults.standard.stringArray(forKey: "peer-devices")
        defer {
            if let previousDevice { try? DeviceSecrets.save(deviceKey, data: previousDevice) }
            else { try? DeviceSecrets.remove(deviceKey) }
            if let previousDevices { UserDefaults.standard.set(previousDevices, forKey: "peer-devices") }
            else { UserDefaults.standard.removeObject(forKey: "peer-devices") }
        }
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: root)
        defer { _ = try? Runtime.call(root, "graft:close"); try? FileManager.default.removeItem(at: root); try? DeviceSecrets.remove(PeerSync.key(space)) }
        let tunnel = try PeerTunnel(url: invitation.url, fingerprint: invitation.fingerprint)
        defer { tunnel.close() }
        var token: String?
        for _ in 0..<20 {
            let response = try tunnel.call("/pair", token: invitation.ticket, body: ["name": "iOS simulator test"])
            if response["state"] as? String == "approved" { token = response["token"] as? String; break }
            Thread.sleep(forTimeInterval: 0.25)
        }
        let profile = PeerProfile(url: invitation.url, fingerprint: invitation.fingerprint, token: try XCTUnwrap(token), name: invitation.name, space: invitation.space)
        // A computer may offer another Space after the originally paired one closes.
        let closed = PeerProfile(url: profile.url, fingerprint: profile.fingerprint, token: profile.token, name: profile.name, space: "closed-space")
        XCTAssertTrue(try PeerSync.availableSpaces(closed).contains { $0.space == profile.space })
        try PeerSync.sync(space, profile: profile, progress: { _ in })
        XCTAssertEqual(try String(contentsOf: root.appendingPathComponent("note.md")), "from desktop")
        XCTAssertEqual(try Data(contentsOf: root.appendingPathComponent("assets/sample.bin")), Data([0, 255, 12, 8]))
        // The existing disposable desktop fixture waits for this marker.
        try Data("from Android".utf8).write(to: root.appendingPathComponent("note.md"), options: .atomic)
        try PeerSync.sync(space, profile: profile, progress: { _ in })
        XCTAssertNotNil(try Runtime.call(root.appendingPathComponent("data.eidos"), "getSnapshot"))
        if data?["conflicts"] as? Bool == true {
            func waitFor(_ phase: String) throws {
                let deadline = Date().addingTimeInterval(60)
                while Date() < deadline {
                    if try tunnel.call("/fixture", token: profile.token)["phase"] as? String == phase { return }
                    Thread.sleep(forTimeInterval: 0.2)
                }
                XCTFail("Desktop fixture did not reach " + phase)
            }
            _ = try tunnel.call("/fixture", token: profile.token, body: ["diverge": true])
            try waitFor("diverged")
            try Data("phone concurrent edit".utf8).write(to: root.appendingPathComponent("note.md"), options: .atomic)
            XCTAssertThrowsError(try PeerSync.sync(space, profile: profile, progress: { _ in })) { error in
                XCTAssertTrue(error.localizedDescription.contains("请到电脑"), error.localizedDescription)
            }
            XCTAssertNil(try MergeReview.load(space))
            XCTAssertEqual(try String(contentsOf: root.appendingPathComponent("note.md")), "phone concurrent edit")
            try Data("written while waiting".utf8).write(to: root.appendingPathComponent("waiting.md"), options: .atomic)
            XCTAssertThrowsError(try PeerSync.sync(space, profile: profile, progress: { _ in }))
            _ = try tunnel.call("/fixture", token: profile.token, body: ["reviewed": true])
            try waitFor("resolved")
            try PeerSync.sync(space, profile: profile, progress: { _ in })
            XCTAssertEqual(try String(contentsOf: root.appendingPathComponent("note.md")), "reviewed on desktop")
            XCTAssertEqual(try String(contentsOf: root.appendingPathComponent("waiting.md")), "written while waiting")
            _ = try tunnel.call("/fixture", token: profile.token, body: ["finished": true])
        }
        if data?["recovery"] as? Bool == true {
            try Data("edited while disconnected".utf8).write(to: root.appendingPathComponent("offline.md"), options: .atomic)
            _ = try tunnel.call("/fixture", token: profile.token, body: ["restart": true])
            Thread.sleep(forTimeInterval: 0.5)
            XCTAssertThrowsError(try tunnel.call("/spaces", token: profile.token, timeout: 1))
            _ = try Runtime.call(root, "graft:close")
            let reopened = try LocalSpace(root: root)
            let saved = try XCTUnwrap(PeerSync.load(reopened))
            try PeerSync.sync(reopened, profile: saved, progress: { _ in })
            let connected = try XCTUnwrap(PeerSync.load(reopened))
            XCTAssertNotEqual(connected.url, profile.url)
            XCTAssertEqual(connected.fingerprint, profile.fingerprint)
            XCTAssertEqual(connected.token, profile.token)
            let restored = try PeerSync.reconnect(profile)
            XCTAssertEqual(restored.url, connected.url)
            XCTAssertEqual(try String(contentsOf: root.appendingPathComponent("recovery.md")), "desktop restarted")
            XCTAssertEqual(try String(contentsOf: root.appendingPathComponent("offline.md")), "edited while disconnected")
            let resumed = try PeerTunnel(url: connected.url, fingerprint: connected.fingerprint)
            defer { resumed.close() }
            _ = try resumed.call("/fixture", token: connected.token, body: ["recovered": true])
        }
    }
    func testFolderTransferIsIsolatedAndRejectsLinksAndLiveWAL() throws {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let source = base.appendingPathComponent("Source")
        let space = try LocalSpace(root: base.appendingPathComponent("Space"))
        defer { try? FileManager.default.removeItem(at: base); try? FileManager.default.removeItem(at: space.privateRoot) }
        try FileManager.default.createDirectory(at: source, withIntermediateDirectories: true)
        try Data("note".utf8).write(to: source.appendingPathComponent("note.md"))
        try FileManager.default.createDirectory(at: source.appendingPathComponent(".graft"), withIntermediateDirectories: true)
        let imported = try space.importFolder(source, in: nil)
        XCTAssertEqual(try String(contentsOf: imported.appendingPathComponent("note.md")), "note")
        XCTAssertFalse(FileManager.default.fileExists(atPath: imported.appendingPathComponent(".graft").path))
        let second = try space.importFolder(source, in: nil)
        XCTAssertNotEqual(imported, second)
        try Data([1]).write(to: source.appendingPathComponent("data.eidos"))
        try Data([1]).write(to: source.appendingPathComponent("data.eidos-wal"))
        XCTAssertThrowsError(try space.importFolder(source, in: nil))
        try FileManager.default.removeItem(at: source.appendingPathComponent("data.eidos-wal"))
        try FileManager.default.createSymbolicLink(at: source.appendingPathComponent("escape"), withDestinationURL: base)
        XCTAssertThrowsError(try space.importFolder(source, in: nil))
    }
    func testGlobalSearchFindsNestedMarkdownAndCanonicalRecords() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: root)
        defer { _ = try? Runtime.call(root, "close"); try? FileManager.default.removeItem(at: root) }
        let folder = try space.createFolder("子目录", in: root)
        try Data("唯一关键词".utf8).write(to: folder.appendingPathComponent("note.md"))
        let result = try space.search("唯一关键词", cancelled: { false })
        XCTAssertEqual(result.matches.count, 1)
        XCTAssertEqual(result.matches[0].file.lastPathComponent, "note.md")
        _ = try space.create(markdown: false)
        let empty = try space.search("不存在", cancelled: { false })
        XCTAssertTrue(empty.matches.isEmpty)
        XCTAssertTrue(empty.skipped.isEmpty)
        XCTAssertTrue(try space.search("唯一关键词", cancelled: { true }).matches.isEmpty)
    }
    func testPeerAndCloudRejectUntrustedAddresses() throws {
        XCTAssertNoThrow(try PeerTunnel.endpoint("https://192.168.0.2:1234"))
        for address in ["http://192.168.0.2:1234", "https://8.8.8.8:443", "https://user@192.168.0.2:1234", "https://192.168.0.2:1234/path", "https://192.168.0.2:1234?x=1"] {
            XCTAssertThrowsError(try PeerTunnel.endpoint(address))
        }
        XCTAssertThrowsError(try PeerInvitation.parse("not a code"))
        XCTAssertThrowsError(try SyncEnvironment.validateRemote("https://example.com/me/space"))
        XCTAssertNoThrow(try SyncEnvironment.validateRemote(SyncEnvironment.remote + "/me/space"))
    }
}
