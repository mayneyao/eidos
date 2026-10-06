import XCTest
@testable import EidosIOS

final class PeerDiscoveryTests: XCTestCase, NetServiceDelegate {
    private var published: XCTestExpectation?
    func netServiceDidPublish(_ sender: NetService) { published?.fulfill() }
    private func address(_ host: String) -> Data {
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        inet_pton(AF_INET, host, &address.sin_addr)
        return withUnsafeBytes(of: &address) { Data($0) }
    }
    func testDiscoveryRequiresThePinnedComputerAndOptionalSpace() {
        let attributes = ["v": Data("1".utf8), "fingerprint": Data("identity".utf8), "space": Data("project".utf8)]
        let addresses = [address("192.168.1.20"), address("8.8.8.8"), Data([1])]
        XCTAssertEqual(PeerDiscovery.endpoints(attributes: attributes, addresses: addresses, port: 4567, fingerprint: "identity", space: "project"), ["https://192.168.1.20:4567"])
        XCTAssertEqual(PeerDiscovery.endpoints(attributes: attributes, addresses: addresses, port: 4567, fingerprint: "identity", space: nil), ["https://192.168.1.20:4567"])
        XCTAssertTrue(PeerDiscovery.endpoints(attributes: attributes, addresses: addresses, port: 4567, fingerprint: "other", space: nil).isEmpty)
        XCTAssertTrue(PeerDiscovery.endpoints(attributes: attributes, addresses: addresses, port: 4567, fingerprint: "identity", space: "closed").isEmpty)
        XCTAssertTrue(PeerDiscovery.endpoints(attributes: attributes, addresses: addresses, port: 0, fingerprint: "identity", space: nil).isEmpty)
    }
    func testBonjourKeepsTryingCandidatesAfterRejection() throws {
        let fingerprint = UUID().uuidString
        let service = NetService(domain: "local.", type: "_eidos-peer._tcp.", name: "Eidos-test-" + fingerprint, port: 45678)
        service.setTXTRecord(NetService.data(fromTXTRecord: ["v": Data("1".utf8), "fingerprint": Data(fingerprint.utf8), "space": Data("project".utf8)]))
        service.delegate = self
        published = expectation(description: "Bonjour published")
        service.publish()
        defer { service.stop(); published = nil }
        wait(for: [published!], timeout: 5)
        let rejected = expectation(description: "stale candidate rejected")
        let found = expectation(description: "Bonjour resolved")
        LocalSpace.io.async {
            let profile = PeerProfile(url: "https://127.0.0.1:1", fingerprint: fingerprint, token: "disposable", name: "Computer", space: "closed")
            do {
                var rejectedFirst = false
                let endpoint = try PeerDiscovery.find(profile, space: nil, verify: { url -> String? in
                    if url.hasSuffix(":45678") {
                        if !rejectedFirst { rejectedFirst = true; rejected.fulfill() }
                        return nil
                    }
                    return url
                })
                XCTAssertTrue(endpoint?.hasSuffix(":45679") == true, endpoint ?? "No endpoint")
            } catch { XCTFail(error.localizedDescription) }
            found.fulfill()
        }
        wait(for: [rejected], timeout: 5)
        let replacement = NetService(domain: "local.", type: "_eidos-peer._tcp.", name: "Eidos-new-" + fingerprint, port: 45679)
        replacement.setTXTRecord(service.txtRecordData())
        replacement.delegate = self
        published = expectation(description: "replacement published")
        replacement.publish()
        defer { replacement.stop() }
        wait(for: [published!], timeout: 5)
        wait(for: [found], timeout: 10)
    }
}
