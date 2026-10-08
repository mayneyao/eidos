import XCTest
import SwiftUI
import WebKit
import zlib
@testable import EidosIOS

final class MobilePluginTests: XCTestCase {
    func testInstallationGrantsOnlyOriginatingSpaceAndReviewedRevision() throws {
        let first = try LocalSpace(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let second = try LocalSpace(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let origin = MobilePluginService(space:first)
        let other = MobilePluginService(space:second)
        let preferences = UserDefaults.standard
        let saved = preferences.dictionaryRepresentation().filter { $0.key.hasPrefix("plugins.") }
        let input = first.root.appendingPathComponent("test.eidos-plugin")
        var packages: [URL] = []
        defer {
            for key in preferences.dictionaryRepresentation().keys where key.hasPrefix("plugins.") { preferences.removeObject(forKey:key) }
            for (key,value) in saved { preferences.set(value,forKey:key) }
            for url in packages { try? FileManager.default.removeItem(at:url) }
            for space in [first,second] {
                try? FileManager.default.removeItem(at:space.root)
                try? FileManager.default.removeItem(at:space.privateRoot)
            }
        }
        func prepare(_ version: String, theme: Bool = false) throws -> [String:Any] {
            let manifest: [String:Any] = ["id":"test.auto-enable","name":"Auto enable","version":version,"kind":theme ? "theme" : "plugin"]
            let data = try JSONSerialization.data(withJSONObject:["format":2,"manifest":manifest,"modules":[:]],options:.sortedKeys)
            var stream = z_stream()
            XCTAssertEqual(deflateInit2_(&stream,Z_DEFAULT_COMPRESSION,Z_DEFLATED,31,8,Z_DEFAULT_STRATEGY,ZLIB_VERSION,Int32(MemoryLayout<z_stream>.size)),Z_OK)
            defer { deflateEnd(&stream) }
            var archive = Data(count:data.count + 256)
            let capacity = archive.count
            let status = data.withUnsafeBytes { source in
                archive.withUnsafeMutableBytes { destination in
                    stream.next_in = UnsafeMutablePointer(mutating:source.bindMemory(to:Bytef.self).baseAddress)
                    stream.avail_in = uInt(data.count)
                    stream.next_out = destination.bindMemory(to:Bytef.self).baseAddress
                    stream.avail_out = uInt(capacity)
                    return deflate(&stream,Z_FINISH)
                }
            }
            XCTAssertEqual(status,Z_STREAM_END)
            archive.count = Int(stream.total_out)
            try archive.write(to:input)
            let prepared = try origin.prepareImport(input)
            packages.append(origin.directory.appendingPathComponent((try XCTUnwrap(prepared["revision"] as? String)) + ".json"))
            return prepared
        }
        func enabled(_ service: MobilePluginService) throws -> Bool {
            let records = try XCTUnwrap(service.handle("list",[:]) as? [[String:Any]])
            return records.first { ($0["manifest"] as? [String:Any])?["id"] as? String == "test.auto-enable" }?["enabled"] as? Bool == true
        }
        let initial = try prepare("1.0.0")
        XCTAssertFalse(try enabled(origin))
        XCTAssertThrowsError(try origin.handle("install",["revision":"stale"]))
        XCTAssertFalse(try enabled(origin))
        // A newly selected Space has its own service while the originating install completes.
        _ = try other.handle("list",[:])
        _ = try origin.handle("install",["revision":initial["revision"]!])
        XCTAssertTrue(try enabled(origin))
        XCTAssertFalse(try enabled(other))
        _ = try other.handle("enable",["id":"test.auto-enable","enabled":true])
        let same = try origin.prepareImport(input)
        _ = try origin.handle("install",["revision":same["revision"]!])
        XCTAssertTrue(try enabled(other))
        let update = try prepare("2.0.0")
        _ = try origin.handle("install",["revision":update["revision"]!])
        XCTAssertTrue(try enabled(origin))
        XCTAssertFalse(try enabled(other))
        _ = try prepare("3.0.0")
        try Data("invalid".utf8).write(to:input)
        XCTAssertThrowsError(try origin.prepareImport(input))
        XCTAssertThrowsError(try origin.handle("install",["revision":update["revision"]!]))
        XCTAssertTrue(try enabled(origin))
        let theme = try prepare("4.0.0",theme:true)
        _ = try origin.handle("install",["revision":theme["revision"]!])
        XCTAssertFalse(try enabled(origin))
    }

    @MainActor
    func testJournalsMigratesAcrossSpacesAndOpensNavigation() async throws {
        let fixture = URL(fileURLWithPath: "/tmp/eidos-journals-qa.json")
        try XCTSkipUnless(FileManager.default.fileExists(atPath: fixture.path), "Provide the installed Journals package")
        let data = try Data(contentsOf: fixture)
        let package = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let manifest = try XCTUnwrap(package["manifest"] as? [String: Any])
        let revision = LocalSpace.digest(data)
        let first = try LocalSpace(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let second = try LocalSpace(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let service = MobilePluginService(space: second)
        let preferences = UserDefaults.standard
        let saved = preferences.dictionaryRepresentation().filter { $0.key.hasPrefix("plugins.") }
        let target = service.directory.appendingPathComponent(revision + ".json")
        let previousPackage = try? Data(contentsOf: target)
        defer {
            for key in preferences.dictionaryRepresentation().keys where key.hasPrefix("plugins.") { preferences.removeObject(forKey: key) }
            for (key, value) in saved { preferences.set(value, forKey: key) }
            for space in [first, second] { try? FileManager.default.removeItem(at: space.root); try? FileManager.default.removeItem(at: space.privateRoot) }
            if let previousPackage { try? previousPackage.write(to: target) } else { try? FileManager.default.removeItem(at: target) }
        }
        let legacy = first.privateRoot.appendingPathComponent("Plugins")
        try FileManager.default.createDirectory(at: legacy, withIntermediateDirectories: true)
        try data.write(to: legacy.appendingPathComponent(revision + ".json"))
        if previousPackage != nil { try FileManager.default.removeItem(at: target) }
        preferences.set([["manifest": manifest, "revision": revision]], forKey: "plugins.installed")
        _ = try service.handle("enable", ["id": "eidos.journals", "enabled": true])
        let page = try XCTUnwrap(try service.navigationPages().first)
        XCTAssertEqual(page.plugin, "eidos.journals")
        _ = try service.handle("package", ["id": page.plugin])
        XCTAssertEqual(try Data(contentsOf: target), data)
        var opened: [URL] = []
        let host = UIHostingController(rootView: MobilePluginView(space: second, dark: false, open: { opened.append($0) }, pluginId: page.plugin, viewId: page.view))
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene); window.frame = UIScreen.main.bounds
        window.rootViewController = host; window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil }
        func findWeb(_ view: UIView) -> WKWebView? {
            if let web = view as? WKWebView { return web }
            return view.subviews.compactMap(findWeb).first
        }
        host.view.layoutIfNeeded()
        let web = try XCTUnwrap(findWeb(host.view))
        web.configuration.userContentController.addUserScript(WKUserScript(source: "window.guestCalls=[]; addEventListener('message',e=>{if(e.data?.protocol==='eidos-plugin') guestCalls.push(e.data.method)});", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web.configuration.userContentController.addUserScript(WKUserScript(source: "const todayTimer=setInterval(()=>{const button=document.querySelector('.jn-today');if(button && !button.disabled){clearInterval(todayTimer);button.click()}},100);", injectionTime: .atDocumentEnd, forMainFrameOnly: false))
        web.reload()
        var rendered = false
        for _ in 0..<200 {
            rendered = (try? await web.evaluateJavaScript("window.guestCalls?.includes('view.ready')")) as? Bool == true
            if rendered { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertTrue(rendered, "Journals must render its page controls")
        let body = try await web.evaluateJavaScript("document.body.textContent") as? String ?? ""
        XCTAssertFalse(body.contains("插件启动失败"), body)
        for _ in 0..<100 {
            if !opened.isEmpty { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let journal = try XCTUnwrap(opened.first, "Today's journal must be writable from the page")
        XCTAssertTrue(FileManager.default.fileExists(atPath: journal.path))
        try Data("Keep my journal".utf8).write(to: journal)
        web.reload()
        for _ in 0..<100 {
            if opened.count > 1 { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertEqual(opened.count, 2)
        XCTAssertEqual(try String(contentsOf: journal, encoding: .utf8), "Keep my journal")
        try await Task.sleep(nanoseconds: 700_000_000)
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) }
        let attachment = XCTAttachment(image: image); attachment.name = "iOS Journals navigation"; attachment.lifetime = .keepAlways; add(attachment)
        try image.pngData()?.write(to: URL(fileURLWithPath: "/tmp/iOS-journals-navigation.png"))
        _ = try service.handle("enable", ["id": page.plugin, "enabled": false])
        XCTAssertTrue(try service.navigationPages().isEmpty)
    }
    @MainActor
    func testNativeManagerUsesCanonicalPackageValidation() async throws {
        let raw = #"{"format":2,"manifest":{"apiVersion":1,"id":"test.native","name":"Native","version":"1.0.0","requires":{"pluginApi":"3.0.0"},"views":[{"id":"main","title":"Native","kind":"file","access":"read","entry":"./main.js"}],"placements":[{"location":"file/open","view":"main","extensions":[".txt"]}]},"modules":{"./main.js":"export function mount() { return () => {} }"}}"#
        let validator = NativePluginValidator()
        try await validator.validate(raw)
        do { try await validator.validate("{}"); XCTFail("Invalid package accepted") }
        catch { XCTAssertFalse(error.localizedDescription.isEmpty) }
    }

    func testPreviouslyEnabledThemeCannotLoadOrReactivate() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root:root)
        let preferences = UserDefaults.standard
        let previous = preferences.object(forKey:"plugins.installed")
        let key = "plugins." + LocalSpace.digest(Data(space.root.path.utf8)) + ".test.theme.enabled"
        defer {
            preferences.set(previous,forKey:"plugins.installed")
            preferences.removeObject(forKey:key)
            try? FileManager.default.removeItem(at:root)
            try? FileManager.default.removeItem(at:space.privateRoot)
        }
        preferences.set([["manifest":["id":"test.theme","kind":"theme"],"revision":"old"]],forKey:"plugins.installed")
        preferences.set("old",forKey:key)
        let service = MobilePluginService(space:space)
        let installed = try XCTUnwrap(try service.handle("list",[:]) as? [[String:Any]])
        XCTAssertEqual(installed.first?["enabled"] as? Bool,false)
        XCTAssertThrowsError(try service.handle("enable",["id":"test.theme","enabled":true]))
        XCTAssertThrowsError(try service.handle("package",["id":"test.theme"]))
        _ = try service.handle("enable",["id":"test.theme","enabled":false])
        XCTAssertNil(preferences.object(forKey:key))
    }

    @MainActor
    func testPublishedMarkmapInWKWebView() async throws {
        let fixtures = ProcessInfo.processInfo.environment["PLUGIN_FIXTURES"] ?? "/tmp/eidos-mobile-plugins"
        let registryURL = URL(fileURLWithPath: fixtures).appendingPathComponent("registry.json")
        try XCTSkipUnless(FileManager.default.fileExists(atPath: registryURL.path), "Provide published plugin fixtures")
        let registry = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf:registryURL)) as? [String:Any])
        let entry = try XCTUnwrap((registry["plugins"] as? [[String:Any]])?.first { $0["id"] as? String == "eidos.markmap" })
        let archive = URL(fileURLWithPath:fixtures).appendingPathComponent(try XCTUnwrap(entry["asset"] as? String))
        XCTAssertEqual(LocalSpace.digest(try Data(contentsOf:archive)), entry["sha256"] as? String)
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root:root)
        let service = MobilePluginService(space:space)
        let savedPreferences = UserDefaults.standard.dictionaryRepresentation().filter { $0.key.hasPrefix("plugins.") }
        defer {
            for key in UserDefaults.standard.dictionaryRepresentation().keys where key.hasPrefix("plugins.") { UserDefaults.standard.removeObject(forKey:key) }
            for (key,value) in savedPreferences { UserDefaults.standard.set(value,forKey:key) }
            try? FileManager.default.removeItem(at:root)
            try? FileManager.default.removeItem(at:space.privateRoot)
        }
        let prepared = try service.prepareImport(archive)
        XCTAssertThrowsError(try service.handle("install",["revision":"stale-review"]))
        _ = try service.handle("install",["revision":prepared["revision"]!])
        _ = try service.handle("enable",["id":"eidos.markmap","enabled":true])
        try Data("# Mobile\n\n- WKWebView plugin\n".utf8).write(to:root.appendingPathComponent("note.md"))
        let controller = UIHostingController(rootView:MobilePluginView(space:space,dark:false,open:{ _ in },pluginId:"eidos.markmap"))
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene); window.frame = UIScreen.main.bounds
        window.rootViewController = controller
        window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil }
        func find(_ view: UIView) -> WKWebView? {
            if let web = view as? WKWebView { return web }
            return view.subviews.compactMap(find).first
        }
        controller.loadViewIfNeeded()
        controller.view.layoutIfNeeded()
        for _ in 0..<50 {
            if find(controller.view) != nil { break }
            try await Task.sleep(nanoseconds:100_000_000)
        }
        let web = try XCTUnwrap(find(controller.view))
        func waitFor(_ expression: String) async throws {
            for _ in 0..<150 {
                if (try? await web.evaluateJavaScript(expression)) as? Bool == true { return }
                try await Task.sleep(nanoseconds:100_000_000)
            }
            let body = try? await web.evaluateJavaScript("JSON.stringify({text:document.body.innerText,calls:window.guestCalls,frames:document.querySelectorAll('iframe').length})")
            XCTFail("Timed out: \(expression). Page: \(String(describing:body))")
        }
        try await waitFor("!!document.querySelector('select[aria-label=\"选择文件\"], select[aria-label=\"Choose file\"]')")
        let uuid = try await web.evaluateJavaScript("typeof crypto.randomUUID === 'function'")
        XCTAssertEqual(uuid as? Bool,true)
        _ = try await web.evaluateJavaScript("window.guestCalls=[]; addEventListener('message',e=>{if(e.data?.protocol==='eidos-plugin') guestCalls.push(e.data.method)}); const file=document.querySelector('select[aria-label=\"选择文件\"], select[aria-label=\"Choose file\"]'); file.value='note.md'; file.dispatchEvent(new Event('change')); [...document.querySelectorAll('button')].find(e=>e.textContent==='Markmap').click(); true")
        try await waitFor("guestCalls.includes('document.observe') && guestCalls.includes('view.ready')")
        // view.ready precedes the plugin's first animated layout.
        try await Task.sleep(nanoseconds: 700_000_000)
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) }
        try image.pngData()?.write(to: URL(fileURLWithPath: "/tmp/iOS-markmap.png"))
        let capture = XCTAttachment(image: image); capture.name = "Published Markmap on iOS"; capture.lifetime = .keepAlways; add(capture)
    }
}
