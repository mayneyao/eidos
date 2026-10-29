import XCTest
import UIKit
@testable import EidosIOS

final class PeerInvitationTests: XCTestCase {
    private func code(_ url: String, urls: Any? = nil) throws -> String {
        var value: [String: Any] = ["version": 1, "url": url, "fingerprint": String(repeating: "a", count: 64), "ticket": String(repeating: "b", count: 43), "space": "test", "name": "Test"]
        if let urls { value["urls"] = urls }
        return "eidos-peer:" + (try JSONSerialization.data(withJSONObject: value)).base64EncodedString()
    }

    func testUnsupportedPrimaryDoesNotDiscardValidCandidates() throws {
        let parsed = try PeerInvitation.parse(code("https://198.18.0.1:12345", urls: ["https://192.168.0.109:12345"]))
        XCTAssertEqual(parsed.candidates.count, 2)
    }

    func testLegacyAndMalformedCandidates() throws {
        XCTAssertEqual(try PeerInvitation.parse(code("https://192.168.0.1:12345")).candidates.count, 1)
        for urls: Any in ["invalid", Array(repeating: "https://192.168.0.1:12345", count: 9), ["https://192.168.0.1:12345/path"], ["http://192.168.0.1:12345"]] {
            XCTAssertThrowsError(try PeerInvitation.parse(code("https://192.168.0.1:12345", urls: urls)))
        }
        for host in ["8.8.8.8", "198.18.0.1", "169.254.1.1", "100.64.0.1", "localhost", "192.168.001.1", "192.168.1.1.2", "192..168.1.1"] {
            XCTAssertThrowsError(try PeerTunnel.endpoint("https://\(host):12345"), host)
        }
    }

    func testCancellingInvitationDiscoveryStopsPromptly() throws {
        let invitation = try PeerInvitation.parse(code("https://198.18.0.1:12345"))
        let identity = UUID().uuidString
        let entered = expectation(description: "resolving")
        let finished = expectation(description: "cancelled")
        SyncHTTP.begin(identity)
        defer { SyncHTTP.end(identity) }
        DispatchQueue.global().async {
            entered.fulfill()
            defer { finished.fulfill() }
            do { _ = try invitation.resolvedURL(cancellation: identity); XCTFail("Expected cancellation") }
            catch { XCTAssertEqual((error as NSError).code, NSURLErrorCancelled) }
        }
        wait(for: [entered], timeout: 1)
        SyncHTTP.cancel(identity)
        wait(for: [finished], timeout: 1)
    }

    func testDesktopPairingCandidatesAndDiscovery() async throws {
        #if targetEnvironment(simulator)
        let fixture = URL(fileURLWithPath: "/tmp/eidos-ios348-fixture.json")
        guard FileManager.default.fileExists(atPath: fixture.path) else { throw XCTSkip("Requires opt-in Desktop fixture") }
        let values = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: fixture)) as? [String: String])
        let original = try PeerInvitation.parse(XCTUnwrap(values["invitation"]))
        let qr = try XCTUnwrap(values["qr"]?.split(separator: ",").last)
        let image = try XCTUnwrap(UIImage(data: XCTUnwrap(Data(base64Encoded: String(qr))))?.cgImage)
        XCTAssertEqual(try PeerQRCode.invitation(in: image), values["invitation"])
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
            DispatchQueue.global().async {
                do {
                    for host in [nil, "198.18.0.1", "10.255.255.254"] as [String?] {
                        let url = host.map { "https://\($0):\(URLComponents(string: original.url)!.port!)" } ?? original.url
                        let invitation = PeerInvitation(version: 1, url: url, fingerprint: original.fingerprint, ticket: original.ticket, space: original.space, name: original.name, urls: [original.url])
                        let address = try invitation.resolvedURL()
                        XCTAssertEqual(address, original.url)
                        print("IOS348 verified \(address), primary \(url)")
                        if host != "10.255.255.254" { continue }
                        let tunnel = try PeerTunnel(url: address, fingerprint: original.fingerprint)
                        defer { tunnel.close() }
                        let name = "iOS348-" + UUID().uuidString
                        var token: String?
                        for _ in 0..<10 {
                            let result = try tunnel.call("/pair", token: invitation.ticket, body: ["name": name], timeout: 3)
                            if let accepted = result["token"] as? String { token = accepted; break }
                            Thread.sleep(forTimeInterval: 0.1)
                        }
                        _ = try tunnel.call("/spaces", token: XCTUnwrap(token), timeout: 3)
                        print("IOS348 paired via \(address), primary \(url)")
                    }
                    let legacy = PeerInvitation(version: 1, url: "https://198.18.0.1:12345", fingerprint: original.fingerprint, ticket: original.ticket, space: original.space, name: original.name)
                    let discovered = try legacy.resolvedURL()
                    XCTAssertTrue(original.candidates.contains(discovered))
                    print("IOS348 legacy Bonjour verified: \(discovered)")
                    let wrongPin = PeerInvitation(version: 1, url: original.url, fingerprint: String(repeating: "0", count: 64), ticket: original.ticket, space: original.space, name: original.name)
                    XCTAssertThrowsError(try wrongPin.resolvedURL())
                    let identity = UUID().uuidString
                    SyncHTTP.begin(identity); SyncHTTP.cancel(identity)
                    defer { SyncHTTP.end(identity) }
                    XCTAssertThrowsError(try original.resolvedURL(cancellation: identity))
                    done.resume()
                } catch { done.resume(throwing: error) }
            }
        }
        #else
        throw XCTSkip("Simulator fixture only")
        #endif
    }
}
