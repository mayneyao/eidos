import XCTest
import Network
@testable import EidosIOS

final class PeerLifecycleTests: XCTestCase {
    func testRePairingRecognizesCompletedDownloadWithoutRestoringOldCredentials() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let documents = root.appendingPathComponent("Documents"), support = root.appendingPathComponent("Support")
        let catalog = try SpaceCatalog(documents: documents, support: support)
        let fingerprint = UUID().uuidString
        let original = PeerProfile(url: "https://127.0.0.1:1234", fingerprint: fingerprint, token: "old", name: "Computer", space: "downloaded", spaceName: "Project")
        let entry = try catalog.preparePeer(original)
        let pendingLocal = try LocalSpace(root: catalog.root(entry))
        XCTAssertNil(try PeerSync.downloadedProfile(pendingLocal, entry: entry, catalog: catalog, devices: [original]))
        try catalog.completePeer(original, entry: entry)
        let local = try LocalSpace(root: catalog.root(entry))
        let note = try local.create(markdown: true)
        let content = try Data(contentsOf: note)
        let previous = UserDefaults.standard.stringArray(forKey: "peer-devices")
        defer {
            try? DeviceSecrets.remove(PeerSync.key(local)); try? DeviceSecrets.remove("peer-device:" + fingerprint)
            if let previous { UserDefaults.standard.set(previous, forKey: "peer-devices") }
            else { UserDefaults.standard.removeObject(forKey: "peer-devices") }
        }
        try DeviceSecrets.save(PeerSync.key(local), data: JSONEncoder().encode(original))
        try PeerSync.saveDevice(original)
        try PeerSync.forgetDevice(fingerprint, catalog: catalog)
        XCTAssertNil(try PeerSync.load(local))
        XCTAssertNil(try PeerSync.downloadedProfile(local, entry: entry, catalog: catalog, devices: []))
        let renewed = PeerProfile(url: "https://127.0.0.1:5678", fingerprint: fingerprint, token: "renewed", name: "Renamed computer", space: "another")
        try PeerSync.saveDevice(renewed)
        let reloaded = try SpaceCatalog(documents: documents, support: support)
        let restored = try XCTUnwrap(PeerSync.downloadedProfile(local, entry: entry, catalog: reloaded, devices: [renewed]))
        XCTAssertEqual(restored.space, original.space)
        XCTAssertEqual(restored.token, renewed.token)
        XCTAssertEqual(restored.url, renewed.url)
        XCTAssertEqual(try reloaded.preparePeer(restored).id, entry.id)
        XCTAssertEqual(try Data(contentsOf: note), content)
        XCTAssertEqual(reloaded.spaces.count, catalog.spaces.count)
        let other = PeerProfile(url: renewed.url, fingerprint: UUID().uuidString, token: "other", name: renewed.name, space: original.space)
        XCTAssertNil(try PeerSync.downloadedProfile(local, entry: entry, catalog: reloaded, devices: [other]))
    }
    func testSeedUnpairRegressionFixture() throws {
        #if targetEnvironment(simulator)
        guard FileManager.default.fileExists(atPath: "/tmp/eidos-ios-unpair-ui-fixture") else { throw XCTSkip("Opt-in UI fixture") }
        try PeerSync.saveDevice(PeerProfile(url: "https://127.0.0.1:9", fingerprint: "unpair-regression-fixture", token: "disposable", name: "Unpair regression fixture", space: "test"))
        #else
        throw XCTSkip("Seeds an isolated simulator UI fixture")
        #endif
    }
    func testStoppingDiscoveryReleasesTheStorageQueue() throws {
        let identity = UUID().uuidString
        let entered = expectation(description: "discovery entered")
        let stopped = expectation(description: "discovery cancelled")
        SyncHTTP.begin(identity)
        defer { SyncHTTP.end(identity) }
        LocalSpace.io.async {
            Runtime.cancellation = identity
            defer { Runtime.cancellation = nil; stopped.fulfill() }
            entered.fulfill()
            let profile = PeerProfile(url: "https://127.0.0.1:12345", fingerprint: UUID().uuidString, token: "disposable", name: "No computer", space: "missing")
            do { _ = try PeerDiscovery.find(profile, space: nil, verify: { _ -> String? in nil }); XCTFail("Discovery should be cancelled") }
            catch { XCTAssertEqual((error as NSError).code, NSURLErrorCancelled) }
        }
        wait(for: [entered], timeout: 1)
        SyncHTTP.cancel(identity)
        wait(for: [stopped], timeout: 1)
    }
    func testSpaceUsesTheLatestComputerCredentialAfterRePairing() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: root)
        let fingerprint = UUID().uuidString
        let previous = UserDefaults.standard.stringArray(forKey: "peer-devices")
        defer {
            try? FileManager.default.removeItem(at: root); try? DeviceSecrets.remove(PeerSync.key(space)); try? DeviceSecrets.remove("peer-device:" + fingerprint)
            if let previous { UserDefaults.standard.set(previous, forKey: "peer-devices") }
            else { UserDefaults.standard.removeObject(forKey: "peer-devices") }
        }
        let saved = PeerProfile(url: "https://127.0.0.1:12345", fingerprint: fingerprint, token: "old", name: "Computer", space: "project", spaceName: "My project")
        try DeviceSecrets.save(PeerSync.key(space), data: JSONEncoder().encode(saved))
        try PeerSync.saveDevice(PeerProfile(url: saved.url, fingerprint: fingerprint, token: "renewed", name: saved.name, space: "another"))
        let loaded = try XCTUnwrap(PeerSync.load(space))
        XCTAssertEqual(loaded.token, "renewed")
        XCTAssertEqual(loaded.space, "project")
        XCTAssertEqual(loaded.spaceName, "My project")
    }
    func testStoppingAnActivePeerRequestReleasesTheStorageQueue() throws {
        let queue = DispatchQueue(label: "peer-test-server")
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        let listener = try NWListener(using: parameters)
        var connections: [NWConnection] = []
        let ready = expectation(description: "server ready")
        let entered = expectation(description: "request received")
        let stopped = expectation(description: "request cancelled")
        let identity = UUID().uuidString
        SyncHTTP.begin(identity)
        defer { queue.sync { connections.forEach { $0.cancel() } }; listener.cancel(); SyncHTTP.end(identity) }
        listener.stateUpdateHandler = { if case .ready = $0 { ready.fulfill() } }
        listener.newConnectionHandler = { connection in
            connections.append(connection)
            connection.start(queue: queue)
            connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { _, _, _, _ in entered.fulfill() }
        }
        listener.start(queue: queue)
        wait(for: [ready], timeout: 3)
        var request = URLRequest(url: URL(string: "http://127.0.0.1:\(try XCTUnwrap(listener.port).rawValue)/sync")!)
        request.timeoutInterval = 5
        LocalSpace.io.async {
            Runtime.cancellation = identity
            defer { Runtime.cancellation = nil; stopped.fulfill() }
            do { _ = try SyncHTTP.request(request); XCTFail("Request should be cancelled") }
            catch { XCTAssertEqual((error as NSError).code, NSURLErrorCancelled) }
        }
        wait(for: [entered], timeout: 3)
        SyncHTTP.cancel(identity)
        wait(for: [stopped], timeout: 1)
    }

    func testForgettingAComputerKeepsFilesAndSpace() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let catalog = try SpaceCatalog(documents: root.appendingPathComponent("Documents"), support: root.appendingPathComponent("Support"))
        let entry = try catalog.create("Downloaded")
        let space = try LocalSpace(root: catalog.root(entry))
        let note = try space.create(markdown: true)
        let original = try Data(contentsOf: note)
        let fingerprint = UUID().uuidString
        let profile = PeerProfile(url: "https://127.0.0.1:1234", fingerprint: fingerprint, token: "disposable", name: "Test computer", space: "test")
        let previous = UserDefaults.standard.stringArray(forKey: "peer-devices")
        defer {
            try? DeviceSecrets.remove(PeerSync.key(space)); try? DeviceSecrets.remove("peer-device:" + fingerprint)
            if let previous { UserDefaults.standard.set(previous, forKey: "peer-devices") }
            else { UserDefaults.standard.removeObject(forKey: "peer-devices") }
        }
        try DeviceSecrets.save(PeerSync.key(space), data: JSONEncoder().encode(profile))
        try PeerSync.saveDevice(profile)
        try PeerSync.forgetDevice(fingerprint, catalog: catalog)
        XCTAssertNil(try PeerSync.load(space))
        XCTAssertNil(try DeviceSecrets.load("peer-device:" + fingerprint))
        XCTAssertEqual(try Data(contentsOf: note), original)
        XCTAssertTrue(catalog.spaces.contains(entry))
        XCTAssertEqual(UserDefaults.standard.stringArray(forKey: "peer-devices") ?? [], previous ?? [])
    }
}
