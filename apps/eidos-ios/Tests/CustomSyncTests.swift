import XCTest
@testable import EidosIOS

final class CustomSyncTests: XCTestCase {
    func testCustomAddressesAreIndependentOfTheAccountEnvironment() throws {
        XCTAssertEqual(try CustomSyncClient.normalizedOrigin(" HTTPS://My-Server.example:8443/ "), "https://my-server.example:8443")
        XCTAssertEqual(try CustomSyncClient.normalizedOrigin("http://192.168.1.8:8080"), "http://192.168.1.8:8080")
        XCTAssertEqual(try CustomSync.normalizedURL("graft+https://my-server.example:8443/personal/notes/"), "https://my-server.example:8443/personal/notes")
        XCTAssertEqual(try CustomSync.normalizedURL("http://192.168.1.8:8080/custom/notes"), "http://192.168.1.8:8080/custom/notes")
        for value in ["https://user:secret@host", "https://host/path", "https://host?q=1", "https://host#x", "https://host:0", "file:///tmp", "https://host /", "https://"] {
            XCTAssertThrowsError(try CustomSyncClient.normalizedOrigin(value), value)
        }
        for value in ["https://host/", "https://host", "https://user:secret@host/repo", "https://host/repo?secret=x", "https://host/repo#x", "fs:///tmp/remote", "https://host/a/%2e%2e/b"] {
            XCTAssertThrowsError(try CustomSync.normalizedURL(value), value)
        }
        XCTAssertThrowsError(try CustomSync.requireEncryptedTransport("http://192.168.1.8/personal/notes"))
        XCTAssertNoThrow(try CustomSync.requireEncryptedTransport("http://127.0.0.1:8765/personal/notes"))
        XCTAssertNoThrow(try CustomSync.requireEncryptedTransport("https://my-server.example/personal/notes"))
    }

    func testEncryptedDescriptorRejectsUnsupportedOrChangedIdentity() throws {
        let uuid = UUID().uuidString.lowercased()
        let value: [String: Any] = ["profile": "encrypted-remote-v1", "version": 1, "suite": 1, "uuid": uuid]
        XCTAssertEqual(try CustomSyncClient.encryptionUUID(value), uuid)
        XCTAssertNil(try CustomSyncClient.encryptionUUID(nil))
        let unsupported: [[String: Any]] = [
            ["profile": "encrypted-remote-v1", "version": 2, "suite": 1, "uuid": uuid],
            ["profile": "encrypted-remote-v1", "version": 1, "suite": 2, "uuid": uuid],
            ["profile": "encrypted-remote-v1", "version": 1, "suite": 1, "uuid": "wrong"],
            ["profile": "plaintext", "version": 1, "suite": 1, "uuid": uuid],
        ]
        for value in unsupported { XCTAssertThrowsError(try CustomSyncClient.encryptionUUID(value)) }
        XCTAssertThrowsError(try CustomSyncClient(origin: "https://host", token: "short"))
        XCTAssertNoThrow(try CustomSyncClient(origin: "https://my-server.example", token: String(repeating: "x", count: 32)))
    }

    func testDiscoveryNeverSendsCredentialsToAnAdvertisedForeignServer() throws {
        let origin = "https://self-hosted.example:8443", token = String(repeating: "s", count: 32)
        var requests: [URLRequest] = []
        let client = try CustomSyncClient(origin: origin, token: token) { request in
            requests.append(request)
            return ["protocol": "graft-remote", "version": 1, "remote_url_template": "https://attacker.example/personal/{repository}",
                    "authentication": ["scheme": "bearer", "authority": origin],
                    "management": ["repositories": "https://attacker.example/api/graft/repositories"]]
        }
        XCTAssertThrowsError(try client.repositories())
        XCTAssertEqual(requests.count, 1)
        XCTAssertEqual(requests[0].url?.absoluteString, origin + "/.well-known/graft")
        XCTAssertNil(requests[0].value(forHTTPHeaderField: "Authorization"))
    }

    func testServerListingChecksMembershipAndEncryptedDescriptor() throws {
        let origin = "https://self-hosted.example", token = String(repeating: "s", count: 32), uuid = UUID().uuidString.lowercased()
        let encryption: [String: Any] = ["profile": "encrypted-remote-v1", "version": 1, "suite": 1, "uuid": uuid]
        var paths: [String] = []
        let client = try CustomSyncClient(origin: origin, token: token) { request in
            let path = try XCTUnwrap(request.url?.path); paths.append(path)
            if path == "/.well-known/graft" {
                XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
                return ["protocol": "graft-remote", "version": 1, "remote_url_template": origin + "/personal/{repository}",
                        "authentication": ["scheme": "bearer", "authority": origin], "management": ["repositories": origin + "/api/graft/repositories"]]
            }
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer " + token)
            if path == "/api/graft/repositories" {
                return ["namespace": "personal", "repositories": [["name": "notes", "display_name": "My Notes", "remote_url": origin + "/personal/notes", "encryption": encryption]]]
            }
            return ["protocol": "graft-remote", "version": 1, "encryption": encryption]
        }
        let repository = try XCTUnwrap(try client.repositories().first)
        XCTAssertEqual(repository.displayName, "My Notes")
        XCTAssertEqual(repository.uuid, uuid)
        try client.verify(repository)
        XCTAssertThrowsError(try client.verify(CustomSyncRepository(name: "notes", displayName: "My Notes", url: origin + "/personal/notes", uuid: UUID().uuidString.lowercased())))
        XCTAssertTrue(paths.contains("/personal/notes"))
    }

    func testCustomDownloadCatalogKeepsPartialTransfersOutsideNavigation() throws {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: base) }
        let documents = base.appendingPathComponent("documents"), support = base.appendingPathComponent("support")
        let url = "https://my-server.example/personal/notes"
        let catalog = try SpaceCatalog(documents: documents, support: support)
        let original = catalog.selected
        let entry = try catalog.prepareCustom(name: "Server Notes", url: url)
        XCTAssertFalse(catalog.spaces.contains(entry))
        XCTAssertEqual(catalog.selected, original)
        let restarted = try SpaceCatalog(documents: documents, support: support)
        XCTAssertEqual(try restarted.prepareCustom(name: "Retry", url: url), entry)
        XCTAssertThrowsError(try restarted.completeCustom(url: url + "-other", entry: entry))
        try restarted.completeCustom(url: url, entry: entry)
        let completed = try SpaceCatalog(documents: documents, support: support)
        XCTAssertTrue(completed.spaces.contains(entry))
        XCTAssertEqual(completed.selected, original)
        XCTAssertThrowsError(try completed.prepareCustom(name: "Duplicate", url: url))
    }

    func testRawConnectionPersistsWithoutAccountAndCannotReplaceAnotherRemote() throws {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: base)
        defer {
            _ = try? Runtime.call(space.root, "graft:close")
            try? DeviceSecrets.remove(CustomSync.key(space))
            try? FileManager.default.removeItem(at: base)
        }
        let first = "https://my-server.example/personal/notes"
        try CustomSync.connect(space, url: first, token: "first-token")
        _ = try Runtime.call(space.root, "graft:close")
        XCTAssertEqual(try CustomSync.profile(space), CustomSyncProfile(url: first, token: "first-token"))
        XCTAssertThrowsError(try CustomSync.connect(space, url: "https://other.example/personal/notes", token: "replacement-token"))
        XCTAssertEqual(try CustomSync.profile(space)?.token, "first-token")
        XCTAssertEqual(try CustomSync.normalizedURL(try XCTUnwrap(CustomSync.origin(space))), first)
        try CustomSync.connect(space, url: first, token: "")
        XCTAssertEqual(try CustomSync.profile(space)?.token, "")
        XCTAssertNotEqual(CustomSync.key(space), SyncAccount.profileKey(space))
        try Data("local content".utf8).write(to: space.root.appendingPathComponent("note.md"))
        try CustomSync.disconnect(space)
        XCTAssertNil(try CustomSync.profile(space))
        XCTAssertNil(try CustomSync.origin(space))
        XCTAssertEqual(try String(contentsOf: space.root.appendingPathComponent("note.md")), "local content")
    }

    func testInterruptedInitializationRetainsItsExactServerIntent() throws {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: base)
        defer { try? DeviceSecrets.remove(CustomSync.pendingKey(space)); try? FileManager.default.removeItem(at: base) }
        let intent = CustomSyncProfile(url: "https://server.example/personal/initial", token: String(repeating: "s", count: 32), serverOrigin: "https://server.example", uuid: UUID().uuidString.lowercased(), password: "original password")
        try DeviceSecrets.save(CustomSync.pendingKey(space), data: JSONEncoder().encode(intent))
        var requested = false
        let client = try CustomSyncClient(origin: "https://server.example", token: intent.token) { _ in requested = true; return [:] }
        XCTAssertThrowsError(try CustomSync.create(space, client: client, displayName: "Retry", password: "different password"))
        XCTAssertFalse(requested, "Retry must not provision another repository")
        XCTAssertEqual(try CustomSync.pendingProfile(space), intent)
    }

    func testEncryptedSelfHostedRoundtripWithoutAnAccount() throws {
        let fixture = URL(fileURLWithPath: "/tmp/eidos-ios-custom-sync-fixture.json")
        guard FileManager.default.fileExists(atPath: fixture.path) else { throw XCTSkip("Requires scripts/fixtures/mobile-custom-sync-server.mjs") }
        let info = try JSONSerialization.jsonObject(with: Data(contentsOf: fixture)) as? [String: Any]
        let origin = try XCTUnwrap(info?["origin"] as? String)
        guard URL(string: origin)?.host == "127.0.0.1" else { throw XCTSkip("Disposable loopback fixture only") }
        let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let source = try LocalSpace(root: base.appendingPathComponent("source"))
        let catalog = try SpaceCatalog(documents: base.appendingPathComponent("documents"), support: base.appendingPathComponent("support"))
        var copied: LocalSpace?
        defer {
            for space in [source, copied].compactMap({ $0 }) {
                _ = try? Runtime.call(space.root, "graft:close")
                try? DeviceSecrets.remove(CustomSync.key(space)); try? DeviceSecrets.remove(CustomSync.pendingKey(space))
                try? FileManager.default.removeItem(at: space.privateRoot)
            }
            try? FileManager.default.removeItem(at: base)
        }
        let token = "mobile-custom-sync-synthetic-token-00000000", password = "iOS synthetic sync password"
        let client = try CustomSyncClient(origin: origin, token: token)
        try Data("desktop original".utf8).write(to: source.root.appendingPathComponent("note.md"))
        try Data([0, 128, 255, 1]).write(to: source.root.appendingPathComponent("asset.bin"))
        _ = try Runtime.call(source.root.appendingPathComponent("data.eidos"), "create", ["title": "iOS encrypted test"])
        XCTAssertNil(try SyncAccount.profile(source))
        try CustomSync.create(source, client: client, displayName: "iOS custom server test", password: password)
        let saved = try XCTUnwrap(CustomSync.profile(source))
        let repository = try XCTUnwrap(try client.repositories().first { $0.url == saved.url })
        let entry = try CustomSync.downloadEncrypted(name: "Downloaded server Space", client: client, repository: repository, password: password, catalog: catalog)
        let phone = try LocalSpace(root: catalog.root(entry)); copied = phone
        XCTAssertEqual(try String(contentsOf: phone.root.appendingPathComponent("note.md")), "desktop original")
        XCTAssertEqual(try Data(contentsOf: phone.root.appendingPathComponent("asset.bin")), Data([0, 128, 255, 1]))
        let database = phone.root.appendingPathComponent("data.eidos")
        let snapshot = try XCTUnwrap(try Runtime.call(database, "getSnapshot") as? [String: Any])
        let schema = try Runtime.call(database, "getSchemaPage", ["revision": snapshot["revision"]!, "limit": 200]) as? [String: Any]
        XCTAssertFalse((schema?["objects"] as? [[String: Any]] ?? []).isEmpty)
        let originalProfile = try XCTUnwrap(CustomSync.profile(phone))
        _ = try Runtime.call(phone.root, "graft:close")
        XCTAssertThrowsError(try CustomSync.connectEncrypted(phone, client: client, repository: repository, password: "wrong password"))
        XCTAssertEqual(try CustomSync.profile(phone), originalProfile)
        let wrongKey = try CustomSyncClient(origin: origin, token: String(repeating: "w", count: 32))
        XCTAssertThrowsError(try CustomSync.connectEncrypted(phone, client: wrongKey, repository: repository, password: password))
        XCTAssertEqual(try CustomSync.profile(phone), originalProfile)
        try Data("phone update".utf8).write(to: phone.root.appendingPathComponent("note.md"))
        try CustomSync.sync(phone)
        try CustomSync.sync(source)
        XCTAssertEqual(try String(contentsOf: source.root.appendingPathComponent("note.md")), "phone update")
        try Data("server divergence".utf8).write(to: source.root.appendingPathComponent("note.md"))
        try CustomSync.sync(source)
        try Data("phone divergence".utf8).write(to: phone.root.appendingPathComponent("note.md"))
        XCTAssertThrowsError(try CustomSync.sync(phone))
        let review = try XCTUnwrap(MergeReview.load(phone))
        XCTAssertGreaterThan(review.unresolved, 0)
        XCTAssertEqual(try String(contentsOf: phone.root.appendingPathComponent("note.md")), "phone divergence")
        _ = try Runtime.call(phone.root, "graft:abortMerge", ["stateToken": review.token])
        try CustomSync.disconnect(phone)
        XCTAssertNil(try CustomSync.profile(phone))
        XCTAssertEqual(try String(contentsOf: phone.root.appendingPathComponent("note.md")), "phone divergence")
    }

    func testProvisioningRetryKeepsOneRepositoryAfterLostResponse() throws {
      for fault in ["lost-response", "verify-failed", "cancelled"] {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: base)
        defer { _ = try? Runtime.call(space.root, "graft:close"); try? DeviceSecrets.remove(CustomSync.pendingKey(space)); try? FileManager.default.removeItem(at: base) }
        let origin = "https://self-hosted.example", uuid = UUID().uuidString.lowercased()
        let encryption: [String: Any] = ["profile": "encrypted-remote-v1", "version": 1, "suite": 1, "uuid": uuid]
        var putNames: [String] = [], created = Set<String>()
        let client = try CustomSyncClient(origin: origin, token: String(repeating: "s", count: 32)) { request in
            let path = try XCTUnwrap(request.url?.path)
            if path == "/.well-known/graft" { return ["protocol": "graft-remote", "version": 1, "remote_url_template": origin + "/personal/{repository}", "authentication": ["scheme": "bearer", "authority": origin], "management": ["repositories": origin + "/api/graft/repositories"]] }
            if request.httpMethod == "PUT" {
                let name = try XCTUnwrap(request.url?.lastPathComponent); putNames.append(name)
                let first = created.insert(name).inserted
                if first && fault == "lost-response" { throw LocalError.message("synthetic response lost after server commit") }
                if first && fault == "cancelled" { throw URLError(.cancelled) }
                return ["created": first, "namespace": "personal", "repository": name, "remote_url": origin + "/personal/" + name, "encryption": encryption]
            }
            if fault == "verify-failed" && putNames.count == 1 { throw LocalError.message("synthetic descriptor read failed") }
            return ["protocol": "graft-remote", "version": 1, "encryption": encryption]
        }
        XCTAssertThrowsError(try CustomSync.prepareInitialization(space, client: client, displayName: "Retry", password: "synthetic password"))
        XCTAssertNotNil(try CustomSync.pendingProfile(space))
        let repository = try CustomSync.prepareInitialization(space, client: client, displayName: "Retry", password: "synthetic password")
        XCTAssertEqual(putNames.count, 2); XCTAssertEqual(Set(putNames).count, 1); XCTAssertEqual(created.count, 1)
        XCTAssertEqual(try CustomSync.pendingProfile(space)?.uuid, uuid)
        XCTAssertEqual(repository.uuid, uuid)
      }
    }
    func testPasswordBudgetRejectsOversizeUtf8BeforeProvisioning() throws {
        XCTAssertNoThrow(try CustomSync.validatePassword(String(repeating: "😀", count: 256)))
        XCTAssertThrowsError(try CustomSync.validatePassword(String(repeating: "😀", count: 257)))
        let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: base)
        defer { try? DeviceSecrets.remove(CustomSync.pendingKey(space)); try? FileManager.default.removeItem(at: base) }
        var requested = false
        let client = try CustomSyncClient(origin: "https://self-hosted.example", token: String(repeating: "s", count: 32)) { _ in requested = true; return [:] }
        XCTAssertThrowsError(try CustomSync.prepareInitialization(space, client: client, displayName: "Oversize", password: String(repeating: "😀", count: 257)))
        XCTAssertFalse(requested)
        XCTAssertNil(try CustomSync.pendingProfile(space))
    }
}
