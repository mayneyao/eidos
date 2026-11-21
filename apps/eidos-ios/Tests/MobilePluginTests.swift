import XCTest
import SwiftUI
import WebKit
import zlib
@testable import EidosIOS

final class MobilePluginTests: XCTestCase {
    @MainActor
    func testPublishedGPXAndDashboardInWKWebView() async throws {
        let fixtures = URL(fileURLWithPath: ProcessInfo.processInfo.environment["EIDOS_PLUGIN_FIXTURES"] ?? "/tmp/eidos-mobile-plugin-fixtures")
        let index = fixtures.appendingPathComponent("registry.json")
        try XCTSkipUnless(FileManager.default.fileExists(atPath: index.path), "Provide the published GPX and Dashboard archives")
        let registry = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: index)) as? [String: Any])
        let entries = try XCTUnwrap(registry["plugins"] as? [[String: Any]])
        let space = try LocalSpace(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let service = MobilePluginService(space: space)
        let preferences = UserDefaults.standard
        let previous = preferences.dictionaryRepresentation().filter { $0.key.hasPrefix("plugins.") }
        var stored: [(URL, Data?)] = []
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = UIScreen.main.bounds
        defer {
            window.isHidden = true; window.rootViewController = nil
            for key in preferences.dictionaryRepresentation().keys where key.hasPrefix("plugins.") { preferences.removeObject(forKey: key) }
            for (key, value) in previous { preferences.set(value, forKey: key) }
            for (url, data) in stored {
                if let data { try? data.write(to: url) } else { try? FileManager.default.removeItem(at: url) }
            }
            try? FileManager.default.removeItem(at: space.root)
            try? FileManager.default.removeItem(at: space.privateRoot)
        }
        func install(_ id: String) async throws {
            let entry = try XCTUnwrap(entries.first { $0["id"] as? String == id })
            let archive = fixtures.appendingPathComponent(try XCTUnwrap(entry["asset"] as? String))
            XCTAssertEqual(LocalSpace.digest(try Data(contentsOf: archive)), entry["sha256"] as? String)
            let prepared = try service.prepareImport(archive)
            let manifest = try await NativePluginValidator().validate(try XCTUnwrap(prepared["raw"] as? String))
            let revision = try XCTUnwrap(prepared["revision"] as? String)
            try service.reviewManifest(manifest, revision: revision)
            let url = service.directory.appendingPathComponent(revision + ".json")
            stored.append((url, try? Data(contentsOf: url)))
            _ = try service.handle("install", ["revision": revision])
        }
        func findWeb(_ view: UIView) -> WKWebView? {
            if let web = view as? WKWebView { return web }
            return view.subviews.compactMap(findWeb).first
        }
        func open(_ name: String, plugin: String, view: String) throws -> WKWebView {
            let controller = UIHostingController(rootView: MobilePluginView(space: space, dark: false, open: { _ in }, pluginId: plugin, viewId: view, filePath: name))
            window.rootViewController = controller
            window.makeKeyAndVisible()
            controller.view.layoutIfNeeded()
            return try XCTUnwrap(findWeb(controller.view))
        }
        func waitFor(_ web: WKWebView, _ expression: String) async throws {
            for _ in 0..<160 {
                if (try? await web.evaluateJavaScript(expression)) as? Bool == true { return }
                try await Task.sleep(nanoseconds: 100_000_000)
            }
            let body = try? await web.evaluateJavaScript("document.body.innerText")
            XCTFail("\(expression) was not observed. \(String(describing: body))")
        }
        let route = "Routes/Mobile.gpx"
        try FileManager.default.createDirectory(at: space.root.appendingPathComponent("Routes"), withIntermediateDirectories: true)
        try Data(#"""
        <gpx version="1.1" creator="Eidos" xmlns="http://www.topografix.com/GPX/1/1">
          <trk><name>Mobile route</name><trkseg>
            <trkpt lat="31.23" lon="121.47"><ele>11</ele><time>2025-01-01T01:00:00Z</time></trkpt>
            <trkpt lat="31.24" lon="121.48"><ele>27</ele><time>2025-01-01T01:00:10Z</time></trkpt>
          </trkseg></trk>
        </gpx>
        """#.utf8).write(to: space.root.appendingPathComponent(route))
        try await install("eidos.gpx-viewer")
        let gpx = try open(route, plugin: "eidos.gpx-viewer", view: "map")
        gpx.configuration.userContentController.addUserScript(WKUserScript(source: "addEventListener('message', event => { if (event.data?.test === 'gpx') window.gpxProof = event.data })", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        gpx.configuration.userContentController.addUserScript(WKUserScript(source: #"""
        if (window !== window.parent) {
          let played = false;
          const timer = setInterval(() => {
            if (!document.querySelector('[data-loaded=true]')) return;
            if (!played) {
              played = true;
              document.querySelector('#toggle-details').click();
              document.querySelector('#play').click();
            }
            if (document.querySelector('#scrub').value !== '1') return;
            clearInterval(timer);
            parent.postMessage({test:'gpx', charts: document.querySelectorAll('#elevation path,#speed path').length, map: !!document.querySelector('#map canvas'), notice: document.querySelector('#map-status').textContent}, '*');
          }, 100);
        }
        """#, injectionTime: .atDocumentEnd, forMainFrameOnly: false))
        gpx.reload()
        try await waitFor(gpx, "window.gpxProof?.charts === 2")
        let details = try await gpx.evaluateJavaScript("window.gpxProof")
        print("Published GPX WKWebView: \(details as? [String: Any] ?? [:])")
        let capture = XCTAttachment(image: UIGraphicsImageRenderer(bounds: window.bounds).image { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) })
        capture.name = "GPX track playback and elevation in WKWebView"
        capture.lifetime = .keepAlways
        add(capture)

        try Data("{}".utf8).write(to: space.root.appendingPathComponent("Home.dashboard"))
        try await install("eidos.dashboard")
        let dashboard = try open("Home.dashboard", plugin: "eidos.dashboard", view: "main")
        dashboard.configuration.userContentController.addUserScript(WKUserScript(source: #"""
        if (window === window.parent) {
          addEventListener('message', event => { if (event.data?.test === 'dashboard') window.dashboardError = event.data.message });
        } else {
          const interval = setInterval(() => {
            const error = document.querySelector('[role=alert]');
            if (!error) return;
            clearInterval(interval);
            parent.postMessage({test:'dashboard', message:error.textContent}, '*');
          }, 100);
        }
        """#, injectionTime: .atDocumentEnd, forMainFrameOnly: false))
        dashboard.reload()
        try await waitFor(dashboard, "window.dashboardError === 'Dashboard requires Eidos Lite plugin API 3.2'")
    }

    @MainActor
    func testPublishedCanvasEditsAndReopensInWKWebView() async throws {
        let fixtures = URL(fileURLWithPath: ProcessInfo.processInfo.environment["EIDOS_PLUGIN_FIXTURES"] ?? "/tmp/eidos-t02-canvas-fixtures")
        let archive = fixtures.appendingPathComponent("eidos.canvas-0.5.7.eidos-plugin")
        try XCTSkipUnless(FileManager.default.fileExists(atPath: archive.path), "Provide the published Canvas 0.5.7 archive")
        XCTAssertEqual(LocalSpace.digest(try Data(contentsOf: archive)), "18eccc992758156c3be6a1efb85d2c1b6e1556087432e13871a3320a149462c2")
        let space = try LocalSpace(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let service = MobilePluginService(space: space)
        let preferences = UserDefaults.standard
        let previous = preferences.dictionaryRepresentation().filter { $0.key.hasPrefix("plugins.") }
        let prepared = try service.prepareImport(archive)
        let revision = try XCTUnwrap(prepared["revision"] as? String)
        let stored = service.directory.appendingPathComponent(revision + ".json")
        let previousArchive = try? Data(contentsOf: stored)
        defer {
            for key in preferences.dictionaryRepresentation().keys where key.hasPrefix("plugins.") { preferences.removeObject(forKey: key) }
            for (key, value) in previous { preferences.set(value, forKey: key) }
            if let previousArchive { try? previousArchive.write(to: stored) } else { try? FileManager.default.removeItem(at: stored) }
            try? FileManager.default.removeItem(at: space.root)
            try? FileManager.default.removeItem(at: space.privateRoot)
        }
        let installed = previous["plugins.installed"] as? [[String: Any]] ?? []
        preferences.set(installed.filter { ($0["manifest"] as? [String: Any])?["id"] as? String != "eidos.canvas" }, forKey: "plugins.installed")
        let manifest = try await NativePluginValidator().validate(try XCTUnwrap(prepared["raw"] as? String))
        XCTAssertEqual(try service.reviewManifest(manifest, revision: revision), [".canvas"])
        _ = try service.handle("install", ["revision": revision, "setFileDefaults": true])
        let file = space.root.appendingPathComponent("Canvas.canvas")
        let fixture = #"{"nodes":[{"id":"a","type":"text","text":"Mobile canvas","x":0,"y":0,"width":260,"height":150},{"id":"b","type":"text","text":"Second card","x":340,"y":0,"width":260,"height":150}],"edges":[{"id":"edge","fromNode":"a","toNode":"b","label":"Connected"}]}"#
        try Data(("\u{FEFF}" + fixture).utf8).write(to: file)
        let view = try XCTUnwrap(service.defaultFileView(file))
        XCTAssertEqual(view.id, "eidos.canvas:viewer")

        let host = UIHostingController(rootView: MobilePluginView(space: space, dark: false, open: { _ in }, pluginId: view.plugin, viewId: view.view, filePath: file.lastPathComponent))
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = UIScreen.main.bounds
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil }
        func findWeb(_ view: UIView) -> WKWebView? {
            if let web = view as? WKWebView { return web }
            return view.subviews.compactMap(findWeb).first
        }
        host.view.layoutIfNeeded()
        let web = try XCTUnwrap(findWeb(host.view))
        let inspect = "window.canvasProof=null;addEventListener('message',e=>{if(e.data?.type==='canvas-test-proof')window.canvasProof=e.data;});"
        let edit = #"""
          const timer = setInterval(() => {
            const card = document.querySelector('[data-node-id="a"]');
            const edge = document.querySelector('[data-edge-id="edge"] .edge-line');
            if (!card || !edge) return;
            clearInterval(timer);
            parent.postMessage({type:'canvas-test-proof', text:card.innerText, nodes:document.querySelectorAll('[data-node-id]').length, edges:document.querySelectorAll('.edge-line').length}, '*');
            card.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
            const input = document.querySelector('.inline-draft textarea');
            if (input) { input.value = 'Saved from iOS'; input.dispatchEvent(new FocusEvent('blur')); }
          }, 100);
        """#
        web.configuration.userContentController.addUserScript(WKUserScript(source: inspect, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web.configuration.userContentController.addUserScript(WKUserScript(source: edit, injectionTime: .atDocumentEnd, forMainFrameOnly: false))
        func waitFor(_ expression: String) async throws {
            for _ in 0..<200 {
                if (try? await web.evaluateJavaScript(expression)) as? Bool == true { return }
                try await Task.sleep(nanoseconds: 100_000_000)
            }
            let diagnostics = try? await web.evaluateJavaScript("JSON.stringify({text:document.body.innerText,proof:window.canvasProof})")
            throw LocalError.message("Timed out: \(expression). Page: \(String(describing: diagnostics))")
        }
        web.reload()
        try await waitFor("window.canvasProof?.nodes === 2 && window.canvasProof.edges === 1 && window.canvasProof.text.includes('Mobile canvas')")
        try await waitFor("document.querySelector('.document-actions button')?.disabled === false")
        _ = try await web.evaluateJavaScript("document.querySelector('.document-actions button').click()")
        var bytes = try Data(contentsOf: file)
        for _ in 0..<100 {
            if String(decoding: bytes, as: UTF8.self).contains("Saved from iOS") { break }
            try await Task.sleep(nanoseconds: 100_000_000)
            bytes = try Data(contentsOf: file)
        }
        XCTAssertTrue(bytes.starts(with: [0xEF, 0xBB, 0xBF]))
        XCTAssertTrue(String(decoding: bytes, as: UTF8.self).contains("Saved from iOS"))
        web.reload()
        try await waitFor("window.canvasProof?.nodes === 2 && window.canvasProof.edges === 1 && window.canvasProof.text.includes('Saved from iOS')")
        let capture = XCTAttachment(image: UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        })
        capture.name = "Published Canvas saved and reopened on iOS"
        capture.lifetime = .keepAlways
        add(capture)
    }

    @MainActor
    func testPublishedPackagesValidateAndInstallInSimulator() async throws {
        let fixtures = URL(fileURLWithPath: ProcessInfo.processInfo.environment["EIDOS_PLUGIN_FIXTURES"] ?? "/tmp/eidos-mobile-plugin-fixtures")
        guard FileManager.default.fileExists(atPath: fixtures.appendingPathComponent("registry.json").path) else { throw XCTSkip("Download SHA-256 verified registry archives to EIDOS_PLUGIN_FIXTURES") }
        let registry = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: fixtures.appendingPathComponent("registry.json"))) as? [String:Any])
        let entries = try XCTUnwrap(registry["plugins"] as? [[String:Any]])
        let space = try LocalSpace(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let service = MobilePluginService(space: space)
        let preferences = UserDefaults.standard
        let saved = preferences.dictionaryRepresentation().filter { $0.key.hasPrefix("plugins.") }
        var files: [(URL, Data?)] = []
        defer {
            for key in preferences.dictionaryRepresentation().keys where key.hasPrefix("plugins.") { preferences.removeObject(forKey: key) }
            for (key, value) in saved { preferences.set(value, forKey: key) }
            for (url, original) in files {
                if let original { try? original.write(to: url) } else { try? FileManager.default.removeItem(at: url) }
            }
            try? FileManager.default.removeItem(at: space.root)
            try? FileManager.default.removeItem(at: space.privateRoot)
        }
        for entry in entries {
            let url = fixtures.appendingPathComponent(try XCTUnwrap(entry["asset"] as? String))
            XCTAssertEqual(LocalSpace.digest(try Data(contentsOf: url)), entry["sha256"] as? String)
            let prepared = try service.prepareImport(url)
            let revision = try XCTUnwrap(prepared["revision"] as? String)
            let manifest: [String: Any]
            do {
                manifest = try await NativePluginValidator().validate(try XCTUnwrap(prepared["raw"] as? String))
            } catch is NativePluginValidator.Rejected {
                XCTAssertTrue(["eidos.recent-history", "eidos.forest-theme", "eidos.maple-theme"].contains(entry["id"] as? String ?? ""))
                continue
            }
            XCTAssertEqual(manifest["id"] as? String, entry["id"] as? String)
            XCTAssertFalse((manifest["name"] as? String ?? "").hasPrefix("%"))
            try service.reviewManifest(manifest, revision: revision)
            let file = service.directory.appendingPathComponent(revision + ".json")
            files.append((file, try? Data(contentsOf: file)))
            _ = try service.handle("install", ["revision": revision])
            let records = try XCTUnwrap(service.handle("list", [:]) as? [[String:Any]])
            XCTAssertTrue(records.contains { ($0["manifest"] as? [String:Any])?["id"] as? String == entry["id"] as? String && $0["enabled"] as? Bool == true })
            _ = try service.handle("package", ["id": entry["id"]!])
        }
    }

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
    func testFileDefaultsRequireFreshReviewedInstallAndStayInOriginatingSpace() async throws {
        let first = try LocalSpace(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let second = try LocalSpace(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let origin = MobilePluginService(space: first)
        let other = MobilePluginService(space: second)
        let preferences = UserDefaults.standard
        let saved = preferences.dictionaryRepresentation().filter { $0.key.hasPrefix("plugins.") }
        var packages: [URL] = []
        defer {
            for key in preferences.dictionaryRepresentation().keys where key.hasPrefix("plugins.") { preferences.removeObject(forKey: key) }
            for (key, value) in saved { preferences.set(value, forKey: key) }
            for url in packages { try? FileManager.default.removeItem(at: url) }
            for space in [first, second] { try? FileManager.default.removeItem(at: space.root) }
        }
        func sample(_ space: LocalSpace, _ name: String) throws -> URL {
            let file = space.root.appendingPathComponent(name)
            try Data().write(to: file)
            return file
        }
        func review(_ service: MobilePluginService, _ name: String, version: String = "1.0.0", reviewed: Bool = true) async throws -> (revision: String, extensions: [String]) {
            let raw = """
            {
              "format": 2,
              "manifest": {
                "apiVersion": 1, "id": "test.\(name)", "name": "Test", "version": "\(version)",
                "requires": {"pluginApi": "3.0.0"},
                "views": [
                  {"id": "view", "title": "Main", "kind": "file", "entry": "./main.js", "capabilities": ["document"]},
                  {"id": "alt", "title": "Alternative", "kind": "file", "entry": "./main.js"},
                  {"id": "page", "title": "Page", "kind": "page", "entry": "./main.js"}
                ],
                "placements": [
                  {"location": "file/open", "view": "view", "extensions": [".canvas", ".txt", ".other"]},
                  {"location": "file/open", "view": "view", "extensions": [".canvas", ".xml"]},
                  {"location": "file/open", "view": "alt", "extensions": [".other", ".eidos"]},
                  {"location": "navigation", "view": "page"}
                ]
              },
              "modules": {"./main.js": "export function mount() { return () => {} }"}
            }
            """
            let data = Data(raw.utf8)
            let original = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            let revision = LocalSpace.digest(data)
            service.prepared = ["data": data, "manifest": try XCTUnwrap(original["manifest"])]
            packages.append(service.directory.appendingPathComponent(revision + ".json"))
            guard reviewed else { return (revision, []) }
            let manifest = try await NativePluginValidator().validate(raw)
            return (revision, try service.reviewManifest(manifest, revision: revision))
        }
        let canvas = try sample(first, "Sketch.CANVAS")
        let otherCanvas = try sample(second, "Sketch.canvas")
        let ambiguous = try sample(first, "Ambiguous.other")
        let eidos = try sample(first, "Data.eidos")

        let unchecked = try await review(origin, "unchecked")
        XCTAssertEqual(unchecked.extensions, [".canvas", ".txt", ".xml"])
        _ = try origin.handle("install", ["revision": unchecked.revision])
        XCTAssertNil(origin.defaultFileView(canvas))
        XCTAssertEqual(try origin.fileViews(canvas).map(\.id), ["test.unchecked:view"])

        let accepted = try await review(origin, "accepted")
        XCTAssertThrowsError(try origin.handle("install", ["revision": "stale", "setFileDefaults": true]))
        XCTAssertNil(origin.defaultFileView(canvas))
        _ = try origin.handle("install", ["revision": accepted.revision, "setFileDefaults": true])
        XCTAssertEqual(MobilePluginService(space: first).defaultFileView(canvas)?.id, "test.accepted:view")
        XCTAssertNil(origin.defaultFileView(ambiguous))
        XCTAssertNil(origin.defaultFileView(eidos))
        XCTAssertTrue(try origin.fileViews(eidos).contains { $0.id == "test.accepted:alt" })
        XCTAssertNil(other.defaultFileView(otherCanvas))

        let replacement = try await review(other, "replacement")
        _ = try other.handle("install", ["revision": replacement.revision, "setFileDefaults": true])
        XCTAssertEqual(origin.defaultFileView(canvas)?.id, "test.accepted:view")
        XCTAssertEqual(other.defaultFileView(otherCanvas)?.id, "test.replacement:view")

        let update = try await review(origin, "replacement", version: "2.0.0")
        XCTAssertTrue(update.extensions.isEmpty)
        _ = try origin.handle("install", ["revision": update.revision, "setFileDefaults": true])
        let unreviewed = try await review(origin, "unreviewed", reviewed: false)
        _ = try origin.handle("install", ["revision": unreviewed.revision, "setFileDefaults": true])
        XCTAssertEqual(origin.defaultFileView(canvas)?.id, "test.accepted:view")
        XCTAssertNil(other.defaultFileView(otherCanvas))

        _ = try origin.handle("enable", ["id": "test.accepted", "enabled": false])
        XCTAssertNil(origin.defaultFileView(canvas))
        _ = try origin.handle("enable", ["id": "test.accepted", "enabled": true])
        XCTAssertEqual(origin.defaultFileView(canvas)?.id, "test.accepted:view")
        try Data(count: 2 * 1024 * 1024 + 1).write(to: canvas)
        XCTAssertNil(origin.defaultFileView(canvas))
        try Data([0xff]).write(to: canvas)
        XCTAssertNil(origin.defaultFileView(canvas))
        try Data().write(to: canvas)
        try Data("damaged".utf8).write(to: origin.directory.appendingPathComponent(accepted.revision + ".json"))
        XCTAssertNil(origin.defaultFileView(canvas))
        origin.clearFileDefault(canvas)
        XCTAssertFalse(origin.hasFileDefault(canvas))
        _ = try origin.handle("uninstall", ["id": "test.replacement"])
        XCTAssertFalse(other.hasFileDefault(otherCanvas))
    }

    @MainActor
    func testJournalsMigratesAcrossSpacesAndOpensNavigation() async throws {
        let fixtures = URL(fileURLWithPath: ProcessInfo.processInfo.environment["EIDOS_PLUGIN_FIXTURES"] ?? "/tmp/eidos-mobile-plugin-fixtures")
        let archive = fixtures.appendingPathComponent("eidos.journals-0.5.3.eidos-plugin")
        try XCTSkipUnless(FileManager.default.fileExists(atPath: archive.path), "Provide the published Journals 0.5.3 archive")
        let index = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: fixtures.appendingPathComponent("registry.json"))) as? [String: Any])
        let release = try XCTUnwrap((index["plugins"] as? [[String: Any]])?.first { $0["id"] as? String == "eidos.journals" })
        let first = try LocalSpace(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let second = try LocalSpace(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let service = MobilePluginService(space: second)
        let bytes = try Data(contentsOf: archive)
        XCTAssertEqual(LocalSpace.digest(bytes), release["sha256"] as? String)
        let data = try service.inspectMarketArchive(bytes, release: MobileMarketRelease(release)).data
        let package = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let manifest = try XCTUnwrap(package["manifest"] as? [String: Any])
        let revision = LocalSpace.digest(data)
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
        let manifest = try await NativePluginValidator().validate(try XCTUnwrap(prepared["raw"] as? String))
        try service.reviewManifest(manifest, revision: try XCTUnwrap(prepared["revision"] as? String))
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
