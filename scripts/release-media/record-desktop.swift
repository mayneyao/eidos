import AppKit
import AVFoundation
import ScreenCaptureKit

@available(macOS 15.0, *)
final class RecordingDelegate: NSObject, SCRecordingOutputDelegate {
    var started = false
    var finished = false
    var failure: Error?
    func recordingOutputDidStartRecording(_ output: SCRecordingOutput) {
        started = true
        print("RECORDING_STARTED")
        fflush(stdout)
    }
    func recordingOutputDidFinishRecording(_ output: SCRecordingOutput) { finished = true }
    func recordingOutput(_ output: SCRecordingOutput, didFailWithError error: Error) { failure = error }
}

@main
struct Recorder {
    static func main() async throws {
        guard #available(macOS 15.0, *) else { throw NSError(domain: "Media", code: 1, userInfo: [NSLocalizedDescriptionKey: "macOS 15 or later required"]) }
        let args = Array(CommandLine.arguments.dropFirst())
        guard args.count == 8, let pid = Int32(args[0]), let x = Double(args[1]), let y = Double(args[2]), let width = Double(args[3]), let height = Double(args[4]), let duration = Double(args[5]), let scale = Double(args[6]), duration > 0, duration <= 60 else { throw NSError(domain: "Media", code: 2, userInfo: [NSLocalizedDescriptionKey: "Usage: recorder pid x y width height seconds scale output.mp4"]) }
        let url = URL(fileURLWithPath: args[7])
        guard !FileManager.default.fileExists(atPath: url.path) else { throw NSError(domain: "Media", code: 3, userInfo: [NSLocalizedDescriptionKey: "Output already exists"]) }
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first(where: { $0.displayID == CGMainDisplayID() }), content.applications.contains(where: { $0.processID == pid }) else { throw NSError(domain: "Media", code: 4, userInfo: [NSLocalizedDescriptionKey: "Target application or main display unavailable"]) }
        let desktopApps = Set(["com.apple.dock", "com.apple.wallpaper.agent", "com.apple.WindowManager"])
        let excludedWindows = content.windows.filter { window in
            guard let owner = window.owningApplication else { return true }
            return owner.processID != pid && !desktopApps.contains(owner.bundleIdentifier)
        }
        let filter = SCContentFilter(display: display, excludingWindows: excludedWindows)
        filter.includeMenuBar = false
        let config = SCStreamConfiguration()
        config.sourceRect = CGRect(x: x, y: y, width: width, height: height)
        config.width = Int(width * scale) / 2 * 2
        config.height = Int(height * scale) / 2 * 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        config.showsCursor = true
        config.capturesAudio = false
        config.captureMicrophone = false
        config.queueDepth = 6
        let delegate = RecordingDelegate()
        let recordingConfig = SCRecordingOutputConfiguration()
        recordingConfig.outputURL = url
        recordingConfig.videoCodecType = .h264
        recordingConfig.outputFileType = .mp4
        let output = SCRecordingOutput(configuration: recordingConfig, delegate: delegate)
        let stream = SCStream(filter: filter, configuration: config, delegate: nil)
        try stream.addRecordingOutput(output)
        try await stream.startCapture()
        let startDeadline = Date().addingTimeInterval(10)
        while !delegate.started && Date() < startDeadline && delegate.failure == nil { try await Task.sleep(for: .milliseconds(50)) }
        guard delegate.started else { throw delegate.failure ?? NSError(domain: "Media", code: 5, userInfo: [NSLocalizedDescriptionKey: "Recording did not start"]) }
        try await Task.sleep(for: .milliseconds(Int(duration * 1000)))
        try await stream.stopCapture()
        let finishDeadline = Date().addingTimeInterval(15)
        while !delegate.finished && Date() < finishDeadline && delegate.failure == nil { try await Task.sleep(for: .milliseconds(50)) }
        if let failure = delegate.failure { throw failure }
        guard delegate.finished else { throw NSError(domain: "Media", code: 6, userInfo: [NSLocalizedDescriptionKey: "Recording did not finalize"]) }
        print("RECORDING_FINISHED")
    }
}
