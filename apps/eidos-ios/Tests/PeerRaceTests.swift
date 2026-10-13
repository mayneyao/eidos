import XCTest
@testable import EidosIOS

final class PeerRaceTests: XCTestCase {
    func testVerifiedResultBypassesFailureAndCancelsStaleProbe() throws {
        let entered = DispatchSemaphore(value: 0)
        let cancelled = expectation(description: "losing probe cancelled")
        let value: String? = try PeerRace.first(cancellation: nil, probes: [
            { _ in nil },
            { identity in
                entered.signal()
                defer { cancelled.fulfill() }
                while true { try SyncHTTP.checkCancellation(identity); Thread.sleep(forTimeInterval: 0.01) }
            },
            { _ in
                guard entered.wait(timeout: .now() + 1) == .success else { XCTFail("Probe did not start"); return nil }
                return "verified"
            },
        ])
        XCTAssertEqual(value, "verified")
        wait(for: [cancelled], timeout: 1)
    }

    func testAllFailuresFinish() throws {
        let value: String? = try PeerRace.first(cancellation: nil, probes: [
            { _ in nil }, { _ in throw URLError(.cannotConnectToHost) },
        ])
        XCTAssertNil(value)
    }

    func testCallerCancellationStopsProbes() {
        let identity = UUID().uuidString
        SyncHTTP.begin(identity)
        defer { SyncHTTP.end(identity) }
        let entered = expectation(description: "probe started")
        let stopped = expectation(description: "race stopped")
        let cancelled = expectation(description: "probe cancelled")
        DispatchQueue.global().async {
            defer { stopped.fulfill() }
            do {
                let _: String? = try PeerRace.first(cancellation: identity, probes: [{ probe in
                    entered.fulfill()
                    defer { cancelled.fulfill() }
                    while true { try SyncHTTP.checkCancellation(probe); Thread.sleep(forTimeInterval: 0.01) }
                }])
                XCTFail("Expected cancellation")
            } catch { XCTAssertEqual((error as NSError).code, NSURLErrorCancelled) }
        }
        wait(for: [entered], timeout: 1)
        SyncHTTP.cancel(identity)
        wait(for: [stopped, cancelled], timeout: 1)
    }
}
