import CryptoKit
import XCTest
@testable import EidosIOS

/// Opt-in integration test against the Desktop whole-Space fixture. Never opens
/// the user's original folder; the server owns a complete isolated copy.
final class RealSpacePeerSyncTests: XCTestCase {
    func testCompleteSpaceDownloadAndReconnect() async throws {
        let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("real-space-fixture.json")
        let fixture = FileManager.default.fileExists(atPath: cache.path) ? cache : URL(fileURLWithPath: "/tmp/eidos-ios-real-space.json")
        guard let modified = try? fixture.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate,
              Date().timeIntervalSince(modified) < 900 else { throw XCTSkip("Requires a running whole-Space Desktop fixture") }
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
            LocalSpace.io.async {
                do { try self.exercise(fixture); done.resume() }
                catch { done.resume(throwing: error) }
            }
        }
    }

    private func exercise(_ fixture: URL) throws {
        let configuration = try JSONSerialization.jsonObject(with: Data(contentsOf: fixture)) as! [String: Any]
        let invitation = try PeerInvitation.parse(try XCTUnwrap(configuration["invitation"] as? String))
        let control = try PeerTunnel(url: invitation.url, fingerprint: invitation.fingerprint)
        defer { control.close() }
        var failure: String?
        defer { _ = try? control.call("/fixture", token: "", body: failure.map { ["finished": true, "error": $0] } ?? ["finished": true]) }
        do {
            var token: String?
            let deadline = Date().addingTimeInterval(30)
            while token == nil, Date() < deadline {
                let reply = try control.call("/pair", token: invitation.ticket, body: ["name": "iOS whole-Space verification"])
                token = reply["token"] as? String
                if token == nil { Thread.sleep(forTimeInterval: 0.25) }
            }
            let device = PeerProfile(url: invitation.url, fingerprint: invitation.fingerprint, token: try XCTUnwrap(token), name: invitation.name, space: invitation.space)
            try PeerSync.saveDevice(device)
            let profile = try XCTUnwrap(try PeerSync.availableSpaces(device).first)
            let catalog = try SpaceCatalog()
            let pending = try catalog.preparePeer(profile)
            let resumed = FileManager.default.fileExists(atPath: catalog.root(pending).appendingPathComponent(".graft").path)
            let started = Date()
            let thermalAtStart = ProcessInfo.processInfo.thermalState.rawValue
            let freeBytesAtStart = (try FileManager.default.attributesOfFileSystem(forPath: catalog.root(pending).path)[.systemFreeSize] as? NSNumber)?.int64Value ?? -1
            var received: Int64 = 0
            var sent: Int64 = 0
            Runtime.peerTransfer = { received = $0; sent = $1 }
            defer { Runtime.peerTransfer = nil }
            let operation = UUID().uuidString
            XCTAssertTrue(eidos_ios_cancellation(operation, 0))
            Runtime.cancellation = operation
            defer { Runtime.cancellation = nil; _ = eidos_ios_cancellation(operation, 2) }
            let sampleLock = NSLock()
            var samples: [[String: Int64]] = []
            let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .utility))
            timer.schedule(deadline: .now(), repeating: .milliseconds(100))
            timer.setEventHandler {
                guard let value = PeerTransferProgress.read(operation)?.download, value.planned == true, let total = value.total else { return }
                sampleLock.lock(); defer { sampleLock.unlock() }
                samples.append(["transferred": value.transferred, "total": total])
            }
            timer.resume()
            defer { timer.cancel() }
            var stages: [[String: Any]] = []
            let entry = try PeerSync.download(profile) { stages.append(["stage": $0, "seconds": Date().timeIntervalSince(started)]); print("REAL_SPACE_STAGE: " + $0) }
            timer.cancel()
            let finalTransfer = try XCTUnwrap(PeerTransferProgress.read(operation)?.download)
            sampleLock.lock(); let observed = samples; sampleLock.unlock()
            try JSONSerialization.data(withJSONObject: observed).write(to: fixture.deletingLastPathComponent().appendingPathComponent("eidos-ios-planned-progress.json"))
            XCTAssertEqual(finalTransfer.planned, true)
            XCTAssertEqual(finalTransfer.transferred, finalTransfer.total)
            XCTAssertEqual(Set(observed.compactMap { $0["total"] }), Set([try XCTUnwrap(finalTransfer.total)]))
            XCTAssertTrue(observed.contains { $0["transferred"]! < $0["total"]! })
            XCTAssertTrue(zip(observed, observed.dropFirst()).allSatisfy { $0["transferred"]! <= $1["transferred"]! })
            let root = try SpaceCatalog().root(entry)
            let firstSeconds = Date().timeIntervalSince(started)
            let manifest = try XCTUnwrap(try control.call("/fixture", token: "", body: ["manifest": true])["manifest"] as? [[String: Any]])
            guard !manifest.isEmpty else { throw LocalError.message("Desktop returned an empty manifest") }
            func verifyFiles() throws -> Int {
                var bytes = 0
                for item in manifest {
                    let path = try XCTUnwrap(item["path"] as? String)
                    let handle = try FileHandle(forReadingFrom: root.appendingPathComponent(path))
                    defer { try? handle.close() }
                    var hash = SHA256(); var offset = 0
                    while var data = try handle.read(upToCount: 1024 * 1024), !data.isEmpty {
                        if path.hasSuffix(".eidos") {
                            for start in [24, 92, 96] {
                                for index in start..<(start + 4) where index >= offset && index < offset + data.count { data[index - offset] = 0 }
                            }
                        }
                        hash.update(data: data); offset += data.count
                    }
                    guard offset == item["bytes"] as? Int,
                          hash.finalize().map({ String(format: "%02x", $0) }).joined() == item["contentSha256"] as? String else {
                        throw LocalError.message("File verification failed: " + path)
                    }
                    bytes += offset
                }
                return bytes
            }
            let bytes = try verifyFiles()
            let initialProof: [String: Any] = ["files": manifest.count, "bytes": bytes, "downloadSeconds": firstSeconds, "wireReceived": received, "wireSent": sent, "stages": stages, "root": root.path, "resumed": resumed, "thermalAtStart": thermalAtStart, "thermalAtEnd": ProcessInfo.processInfo.thermalState.rawValue, "freeBytesAtStart": freeBytesAtStart]
            try JSONSerialization.data(withJSONObject: initialProof, options: [.prettyPrinted]).write(to: fixture.deletingLastPathComponent().appendingPathComponent("eidos-ios-real-space-proof.json"))
            if configuration["downloadOnly"] as? Bool == true { return }
            // A new tunnel must work after the first download's tunnel closes.
            let space = try LocalSpace(root: root)
            defer { _ = try? Runtime.call(root, "graft:close"); _ = try? Runtime.call(root, "close") }
            _ = try control.call("/fixture", token: "", body: ["phase": "first-reconnect"])
            let reconnectStarted = Date()
            var reconnectStages: [[String: Any]] = []
            try PeerSync.sync(space, profile: profile) { reconnectStages.append(["stage": $0, "seconds": Date().timeIntervalSince(reconnectStarted)]); print("REAL_SPACE_RECONNECT: " + $0) }
            XCTAssertEqual(try verifyFiles(), bytes)
            var measurements: [[String: Any]] = [["phase": "first-reconnect", "seconds": Date().timeIntervalSince(reconnectStarted), "wireReceived": received, "wireSent": sent, "stages": reconnectStages]]
            if configuration["performance"] as? Bool == true {
                func measure(_ phase: String) throws {
                    _ = try control.call("/fixture", token: "", body: ["phase": phase])
                    let begin = Date()
                    var stages: [[String: Any]] = []
                    try PeerSync.sync(space, profile: profile) { stages.append(["stage": $0, "seconds": Date().timeIntervalSince(begin)]) }
                    measurements.append(["phase": phase, "seconds": Date().timeIntervalSince(begin), "wireReceived": received, "wireSent": sent, "stages": stages])
                    try JSONSerialization.data(withJSONObject: measurements, options: [.prettyPrinted]).write(to: fixture.deletingLastPathComponent().appendingPathComponent("eidos-ios-performance.json"))
                }
                try measure("noop")
                try Data("from mobile\n".utf8).write(to: root.appendingPathComponent("sync-performance-mobile.md"))
                let database = root.appendingPathComponent("sync-performance.eidos")
                _ = try Runtime.call(database, "create", ["title": "Sync performance"])
                let snapshot = try XCTUnwrap(try Runtime.call(database, "getSnapshot") as? [String: Any])
                let schema = try XCTUnwrap(try Runtime.call(database, "getSchemaPage", ["revision": snapshot["revision"]!, "limit": 200]) as? [String: Any])
                let table = try XCTUnwrap((schema["objects"] as? [[String: Any]])?.first { $0["object"] as? String == "table" })
                let tableId = try XCTUnwrap(table["id"] as? String)
                let label = try XCTUnwrap(table["labelFieldId"] as? String)
                _ = try Runtime.call(database, "mutateRows", ["tableId": tableId, "expectedRevision": snapshot["revision"]!, "changes": [["kind": "create", "clientKey": "performance", "values": [label: "edited on mobile"]]]])
                _ = try Runtime.call(database, "close")
                try measure("upload")
                XCTAssertEqual(try control.call("/fixture", token: "")["mobile"] as? String, "from mobile\n")
                let options: [String: Any] = ["tableId": tableId, "label": label]
                let received = try control.call("/fixture", token: "", body: ["database": options])
                XCTAssertTrue(String(describing: received["databaseRows"]).contains("edited on mobile"))
                _ = try control.call("/fixture", token: "", body: ["mutation": "from desktop\n", "database": ["tableId": tableId, "label": label, "insert": true]])
                try measure("incremental-download")
                XCTAssertEqual(try String(contentsOf: root.appendingPathComponent("sync-performance-desktop.md"), encoding: .utf8), "from desktop\n")
                let rows = try Runtime.call(database, "queryRows", ["tableId": tableId, "query": [:], "projection": ["fields": [label], "resolveRelations": []], "limit": 50])
                XCTAssertTrue(String(describing: rows).contains("edited on desktop"))
                _ = try Runtime.call(database, "close")
            }
            var result = initialProof
            result["measurements"] = measurements
            result["reconnect"] = true
            try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted]).write(to: fixture.deletingLastPathComponent().appendingPathComponent("eidos-ios-real-space-proof.json"))
            print("REAL_SPACE_PASS: \(manifest.count) files, \(bytes) bytes, \(firstSeconds) seconds")
        } catch {
            failure = error.localizedDescription
            throw error
        }
    }
}
