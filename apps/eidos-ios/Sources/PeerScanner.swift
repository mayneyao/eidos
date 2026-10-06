import SwiftUI
import AVFoundation
import CoreImage

enum PeerQRCode {
    private static let lock = NSLock()
    private static let detector = CIDetector(ofType: CIDetectorTypeQRCode, context: CIContext(), options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])
    static func invitation(in image: CGImage) throws -> String? {
        try invitation(in: CIImage(cgImage: image))
    }
    static func invitation(in image: CIImage) throws -> String? {
        lock.lock(); defer { lock.unlock() }
        guard let detector else { throw LocalError.message(tr("无法识别二维码，请使用配对码。")) }
        let features = detector.features(in: image).compactMap { $0 as? CIQRCodeFeature }
        for feature in features {
            guard let code = feature.messageString else { continue }
            if (try? PeerInvitation.parse(code)) != nil { return code }
        }
        if !features.isEmpty { throw LocalError.message(tr("这不是 Eidos 配对二维码，请扫描电脑「设备直连」中的二维码。")) }
        return nil
    }
}

private final class PeerCamera: NSObject, ObservableObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    enum State { case checking, ready, denied, unavailable }
    let session = AVCaptureSession()
    @Published var state = State.checking
    @Published var message = tr("扫描电脑上的 Eidos 配对二维码")
    var onCode: ((String) -> Void)?
    private let queue = DispatchQueue(label: "eidos.peer.camera")
    private var active = false
    private var configured = false
    private var delivered = false
    private var lastFrame = Date.distantPast
    func start() {
        queue.async { [self] in active = true; delivered = false }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: activate()
        case .notDetermined:
            // A simulator has no camera; keep the pairing-code fallback immediately usable.
            guard AVCaptureDevice.default(for: .video) != nil else { state = .unavailable; return }
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async { if granted { self?.activate() } else { self?.state = .denied } }
            }
        default: state = .denied
        }
    }
    private func activate() {
        queue.async { [self] in
            guard active else { return }
            do {
                if !configured {
                    guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) ?? AVCaptureDevice.default(for: .video) else {
                        DispatchQueue.main.async { self.state = .unavailable }; return
                    }
                    let input = try AVCaptureDeviceInput(device: device)
                    let output = AVCaptureVideoDataOutput()
                    output.alwaysDiscardsLateVideoFrames = true
                    output.setSampleBufferDelegate(self, queue: queue)
                    session.beginConfiguration()
                    defer { session.commitConfiguration() }
                    session.sessionPreset = .high
                    guard session.canAddInput(input), session.canAddOutput(output) else { throw LocalError.message(tr("无法开启相机")) }
                    session.addInput(input); session.addOutput(output)
                    configured = true
                }
                if !session.isRunning { session.startRunning() }
                DispatchQueue.main.async { self.state = .ready }
            } catch { DispatchQueue.main.async { self.state = .unavailable } }
        }
    }
    func stop() {
        queue.async { [self] in active = false; if session.isRunning { session.stopRunning() } }
    }
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard active, !delivered, Date().timeIntervalSince(lastFrame) >= 0.2,
              let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lastFrame = Date()
        do {
            if let code = try PeerQRCode.invitation(in: CIImage(cvPixelBuffer: buffer)) {
                delivered = true
                session.stopRunning()
                DispatchQueue.main.async { self.onCode?(code) }
            }
        } catch {
            DispatchQueue.main.async { self.message = tr("这不是 Eidos 配对二维码，请扫描电脑「设备直连」中的二维码。") }
        }
    }
}

private final class PeerCameraPreview: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    override func layoutSubviews() {
        super.layoutSubviews()
        guard let connection = (layer as? AVCaptureVideoPreviewLayer)?.connection else { return }
        let angle: CGFloat
        switch window?.windowScene?.interfaceOrientation {
        case .landscapeLeft: angle = 180
        case .landscapeRight: angle = 0
        case .portraitUpsideDown: angle = 270
        default: angle = 90
        }
        if connection.isVideoRotationAngleSupported(angle) { connection.videoRotationAngle = angle }
    }
}
private struct PeerCameraView: UIViewRepresentable {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var appLanguage = "system"
    @Environment(\.locale) private var appLocale
    let session: AVCaptureSession
    func makeUIView(context: Context) -> PeerCameraPreview {
        let view = PeerCameraPreview()
        let preview = view.layer as! AVCaptureVideoPreviewLayer
        preview.session = session; preview.videoGravity = .resizeAspectFill
        return view
    }
    func updateUIView(_ uiView: PeerCameraPreview, context: Context) {}
}

struct PeerScannerView: View {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var appLanguage = "system"
    @Environment(\.locale) private var appLocale
    let onCode: (String) -> Void
    let onManualCode: () -> Void
    @StateObject private var camera = PeerCamera()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                if camera.state == .ready {
                    PeerCameraView(session: camera.session)
                        .accessibilityHidden(true)
                    Text(camera.message).font(.subheadline).padding(.horizontal)
                        .accessibilityIdentifier("peer-scanner-instructions")
                } else if camera.state == .checking {
                    ProgressView(tr("正在开启相机…")).frame(maxHeight: .infinity)
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            Label(camera.state == .denied ? tr("需要相机权限") : tr("当前设备无法使用相机"), systemImage: "camera")
                                .font(.title2).fontWeight(.semibold)
                            Text(camera.state == .denied ? tr("允许 Eidos 使用相机来扫描配对二维码，或直接粘贴配对码。") : tr("可以复制电脑上的配对码，粘贴后连接。"))
                                .foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                            if camera.state == .denied {
                                Button(tr("打开系统设置")) { if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) } }
                            }
                        }.frame(maxWidth: .infinity, alignment: .leading).padding(24)
                    }
                }
                Button(tr("使用配对码")) { camera.stop(); dismiss(); onManualCode() }
                    .padding(.bottom).accessibilityIdentifier("peer-scanner-manual")
            }
            .navigationTitle(tr("扫描配对二维码")).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(tr("取消")) { camera.stop(); dismiss() } } }
        }
        .onAppear {
            camera.onCode = { code in camera.stop(); dismiss(); onCode(code) }
            camera.start()
        }
        .onDisappear { camera.stop(); camera.onCode = nil }
        .onChange(of: scenePhase) { _, phase in if phase == .active { camera.start() } else { camera.stop() } }
    }
}
