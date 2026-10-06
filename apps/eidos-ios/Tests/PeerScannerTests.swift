import XCTest
import CoreImage
import CoreImage.CIFilterBuiltins
@testable import EidosIOS

final class PeerScannerTests: XCTestCase {
    func testSpacesAreScopedToDeviceAndDownloadedCopiesSurviveOffline() {
        func profile(_ device: String, _ space: String) -> PeerProfile {
            PeerProfile(url: "https://192.168.1.20:12345", fingerprint: device, token: "test", name: device, space: space, spaceName: space)
        }
        let saved = [profile("air", "shared"), profile("mini", "shared")]
        let remote = [profile("air", "shared"), profile("air", "work"), profile("mini", "other")]
        let air = deviceSpaceList("air", available: remote, downloaded: saved)
        XCTAssertEqual(air.map(\.space), ["shared", "work"])
        XCTAssertTrue(air.allSatisfy { $0.fingerprint == "air" })
        XCTAssertEqual(deviceSpaceList("mini", available: remote, downloaded: saved).map(\.space), ["shared", "other"])
        XCTAssertEqual(deviceSpaceList("air", available: [], downloaded: saved).map(\.space), ["shared"])
        XCTAssertTrue(deviceSpaceList("unknown", available: remote, downloaded: saved).isEmpty)
    }
    private func image(_ text: String) throws -> CGImage {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        let output = try XCTUnwrap(filter.outputImage).transformed(by: CGAffineTransform(scaleX: 4, y: 4))
        let extent = output.extent.insetBy(dx: -20, dy: -20)
        let framed = output.composited(over: CIImage(color: .white).cropped(to: extent))
        return try XCTUnwrap(CIContext().createCGImage(framed, from: extent))
    }
    func testRecognizesADesktopInvitationAndPinsItsIdentity() throws {
        let invitation = PeerInvitation(version: 1, url: "https://192.168.1.20:12345", fingerprint: String(repeating: "a", count: 64), ticket: String(repeating: "b", count: 43), space: "project", name: "My computer")
        let encoded = try JSONEncoder().encode(invitation).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        let code = "eidos-peer:" + encoded
        let scanned = try XCTUnwrap(PeerQRCode.invitation(in: image(code)))
        XCTAssertEqual(scanned, code)
        XCTAssertEqual(try PeerInvitation.parse(scanned).fingerprint, invitation.fingerprint)
    }
    func testRejectsOtherQRCodesAndUntrustedInvitationAddresses() throws {
        XCTAssertThrowsError(try PeerQRCode.invitation(in: image("https://example.com")))
        let invitation = PeerInvitation(version: 1, url: "https://8.8.8.8:12345", fingerprint: String(repeating: "a", count: 64), ticket: String(repeating: "b", count: 43), space: "project", name: "My computer")
        let code = "eidos-peer:" + (try JSONEncoder().encode(invitation)).base64EncodedString()
        XCTAssertThrowsError(try PeerQRCode.invitation(in: image(code)))
    }
}
