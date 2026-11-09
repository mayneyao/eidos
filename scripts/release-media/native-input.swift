import AppKit
import ApplicationServices
import CoreGraphics

// Native input and window geometry only. Video is captured by the ScreenCaptureKit helper.
let args = Array(CommandLine.arguments.dropFirst())
let environment = ProcessInfo.processInfo.environment
var postedKeys: [CGKeyCode] = []
func fail(_ message: String) -> Never {
    // A failed audit write must never leave Command/Shift (or a main key) held.
    // These emergency releases reject the take; they are not publishable input.
    for code in postedKeys.reversed() {
        let release = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false)
        release?.flags = []
        release?.post(tap: .cghidEventTap)
    }
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}
func number(_ index: Int) -> Double {
    guard args.indices.contains(index), let value = Double(args[index]), value.isFinite else { fail("Missing numeric argument") }
    return value
}
func emit(_ value: Any) {
    guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), let text = String(data: data, encoding: .utf8) else { fail("Invalid result") }
    print(text)
}
func checkForeground() {
    guard let expected = environment["EIDOS_MEDIA_TARGET_PID"], let pid = Int32(expected), NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else { fail("Target application lost foreground focus; stopping native input") }
}
// Log the actual post call in the same monotonic clock as the recorder. Ordinary
// text is indexed, never copied into this private event log or the public HUD.
func postKey(_ event: CGEvent?, code: CGKeyCode, down: Bool, kind: String, modifiers: [String], characterIndex: Int? = nil) {
    guard let event else { fail("Could not create native keyboard event") }
    let start = DispatchTime.now().uptimeNanoseconds
    event.post(tap: .cghidEventTap)
    let end = DispatchTime.now().uptimeNanoseconds
    if down { postedKeys.append(code) } else { postedKeys.removeAll { $0 == code } }
    guard let path = environment["EIDOS_MEDIA_INPUT_TIMELINE"] else { return }
    guard path.hasPrefix("/"), let origin = environment["EIDOS_MEDIA_RECORDING_START_NS"], let originNs = UInt64(origin), start >= originNs else { fail("Invalid recording timeline clock or absolute path") }
    let label = kind == "key" ? environment["EIDOS_MEDIA_KEY_LABEL"] : nil
    var item: [String: Any] = [
        "type": "keyboard", "kind": kind, "phase": down ? "down" : "up",
        "keyCode": Int(code), "modifiers": modifiers,
        "postStartedNs": String(start), "postCompletedNs": String(end),
        "targetPid": environment["EIDOS_MEDIA_TARGET_PID"] ?? "",
        "relevant": label != nil
    ]
    if let label { item["label"] = label }
    if let characterIndex { item["characterIndex"] = characterIndex }
    do {
        var data = try JSONSerialization.data(withJSONObject: item, options: [.sortedKeys])
        data.append(0x0a)
        let file = try FileHandle(forWritingTo: URL(fileURLWithPath: path))
        defer { try? file.close() }
        try file.seekToEnd()
        try file.write(contentsOf: data)
    } catch { fail("Could not persist native input timeline; reject this take") }
}
func windows(_ pid: pid_t) -> [[String: Any]] {
    let rows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    return rows.filter { ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) && ($0[kCGWindowLayer as String] as? Int) == 0 }.map {
        ["id": $0[kCGWindowNumber as String] ?? 0, "title": $0[kCGWindowName as String] ?? "", "bounds": $0[kCGWindowBounds as String] ?? [:]]
    }
}
func move(_ point: CGPoint) {
    let start = CGEvent(source: nil)?.location ?? point
    for i in 1...30 {
        let t = Double(i) / 30
        let ease = t * t * (3 - 2 * t)
        let p = CGPoint(x: start.x + (point.x - start.x) * ease, y: start.y + (point.y - start.y) * ease)
        CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
        usleep(10_000)
    }
}
guard let action = args.first else { fail("Expected info, bounds, move, click, key or type") }
if ["move", "click", "key", "type"].contains(action) {
    checkForeground()
}
switch action {
case "info":
    emit(["screenCapture": CGPreflightScreenCaptureAccess(), "accessibility": AXIsProcessTrusted(), "frontmostPid": NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0, "windows": windows(pid_t(number(1)))])
case "activate":
    let app = AXUIElementCreateApplication(pid_t(number(1)))
    AXUIElementSetAttributeValue(app, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
    usleep(300_000)
case "bounds":
    guard AXIsProcessTrusted() else { fail("Accessibility permission is required") }
    let app = AXUIElementCreateApplication(pid_t(number(1)))
    var value: CFTypeRef?
    AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &value)
    let candidates = value as? [AXUIElement] ?? []
    let window = candidates.first { candidate in
        var title: CFTypeRef?
        AXUIElementCopyAttributeValue(candidate, kAXTitleAttribute as CFString, &title)
        return args.count <= 6 || (title as? String) == args[6]
    }
    guard let window else { fail("No matching application window") }
    var point = CGPoint(x: number(2), y: number(3))
    var size = CGSize(width: number(4), height: number(5))
    let positionResult = AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, AXValueCreate(.cgPoint, &point)!)
    let sizeResult = AXUIElementSetAttributeValue(window, kAXSizeAttribute as CFString, AXValueCreate(.cgSize, &size)!)
    guard positionResult == .success, sizeResult == .success else { fail("Could not set window geometry") }
    AXUIElementPerformAction(window, kAXRaiseAction as CFString)
    AXUIElementSetAttributeValue(app, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
    usleep(300_000)
    emit(windows(pid_t(number(1))))
case "move", "click":
    guard AXIsProcessTrusted() else { fail("Accessibility permission is required") }
    let point = CGPoint(x: number(1), y: number(2))
    move(point)
    if action == "click" {
        CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
        usleep(60_000)
        CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
    }
case "key":
    guard AXIsProcessTrusted() else { fail("Accessibility permission is required") }
    let key = CGKeyCode(number(1))
    let names = args.count > 2 ? args[2].split(separator: "+").map(String.init) : []
    guard Set(names).isSubset(of: ["command", "shift"]), Set(names).count == names.count else { fail("Expected command, shift or command+shift") }
    let modifiers: [(CGKeyCode, CGEventFlags, String)] = [(55, .maskCommand, "command"), (56, .maskShift, "shift")].filter { names.contains($0.2) }
    var flags: CGEventFlags = []
    var held: [String] = []
    for (code, flag, name) in modifiers {
        flags.insert(flag); held.append(name)
        let modifier = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true)
        modifier?.flags = flags
        postKey(modifier, code: code, down: true, kind: "modifier", modifiers: held)
    }
    defer {
        for (code, flag, name) in modifiers.reversed() {
            flags.remove(flag); held.removeAll { $0 == name }
            let modifier = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false)
            modifier?.flags = flags
            postKey(modifier, code: code, down: false, kind: "modifier", modifiers: held)
        }
    }
    let down = CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: true)
    let up = CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: false)
    down?.flags = flags; up?.flags = flags
    postKey(down, code: key, down: true, kind: "key", modifiers: held)
    usleep(40_000)
    postKey(up, code: key, down: false, kind: "key", modifiers: held)
case "type":
    guard AXIsProcessTrusted(), args.count > 1 else { fail("Accessibility permission and text are required") }
    for (index, character) in args[1].enumerated() {
        let units = Array(String(character).utf16)
        for isDown in [true, false] {
            let event = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: isDown)
            event?.flags = []
            event?.keyboardSetUnicodeString(stringLength: units.count, unicodeString: units)
            postKey(event, code: 0, down: isDown, kind: "text", modifiers: [], characterIndex: index)
        }
        usleep(85_000)
    }
default: fail("Unknown action")
}
