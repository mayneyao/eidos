import XCTest
import SwiftUI
import WebKit
@testable import EidosIOS

final class PluginFileHooksTests: XCTestCase {
    @MainActor
    func testEditorFollowsHookRenameAndResolvesPendingFileActions() async throws {
        let space = try LocalSpace(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let service = MobilePluginService(space: space)
        let preferences = UserDefaults.standard
        let saved = preferences.dictionaryRepresentation().filter { $0.key.hasPrefix("plugins.") }
        let manifest: [String: Any] = ["apiVersion": 1, "id": "test.hook-editor", "name": "Hooks", "version": "1.0.0", "requires": ["pluginApi": "3.3.0"], "extension": "./main.js", "hooks": [
            ["id": "save", "title": "Save", "event": "document.saved", "extensions": [".md"], "access": "write"]]]
        let code = "export default ctx => ctx.capabilities.hooks.register('save', ({event}) => ({name: /^# (.+)/.exec(event.document.text)[1]+'.md'}));"
        let data = try JSONSerialization.data(withJSONObject: ["format": 2, "manifest": manifest, "modules": ["./main.js": code]], options: .sortedKeys)
        let revision = LocalSpace.digest(data)
        let editor = EditorController()
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = UIScreen.main.bounds
        defer {
            window.isHidden = true; window.rootViewController = nil
            for key in preferences.dictionaryRepresentation().keys where key.hasPrefix("plugins.") { preferences.removeObject(forKey: key) }
            for (key, value) in saved { preferences.set(value, forKey: key) }
            try? FileManager.default.removeItem(at: service.directory.appendingPathComponent(revision + ".json"))
            try? FileManager.default.removeItem(at: space.root)
            try? FileManager.default.removeItem(at: space.privateRoot)
        }
        service.prepared = ["data": data, "manifest": manifest]
        _ = try service.handle("install", ["revision": revision, "enable": true])
        let old = space.root.appendingPathComponent("Old.md")
        try Data("# Old\nBody".utf8).write(to: old)
        window.rootViewController = UIHostingController(rootView: EditorView(file: old, space: space, dark: false, controller: editor, onLeave: {}))
        window.makeKeyAndVisible()
        var loaded = false
        for _ in 0..<150 {
            if let web = editor.web, (try? await web.evaluateJavaScript("document.querySelector('.eme-content-editable h1')?.textContent === 'Old'")) as? Bool == true { loaded = true; break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertTrue(loaded)
        let web = try XCTUnwrap(editor.web)
        _ = try await web.evaluateJavaScript("""
          (() => { window.hookIdentity = 'preserved'; const root = document.querySelector('.eme-content-editable');
          root.focus(); const range = document.createRange(); range.selectNodeContents(root.querySelector('h1'));
          getSelection().removeAllRanges(); getSelection().addRange(range); document.execCommand('insertText', false, 'New'); })()
        """)
        var edited = false
        for _ in 0..<150 {
            if (try await web.evaluateJavaScript("document.querySelector('.eme-content-editable h1')?.textContent === 'New'")) as? Bool == true { edited = true; break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertTrue(edited)
        let current = try await editor.savedFile()
        XCTAssertEqual(current.lastPathComponent, "New.md")
        XCTAssertEqual(editor.currentFile, current)
        XCTAssertTrue(editor.web === web)
        let identity = try await web.evaluateJavaScript("window.hookIdentity")
        XCTAssertEqual(identity as? String, "preserved")
        XCTAssertTrue(try String(contentsOf: current, encoding: .utf8).hasPrefix("# New\n"))
        let final = try space.rename(current, to: "Final.md")
        try space.trash(final)
        XCTAssertFalse(FileManager.default.fileExists(atPath: final.path))
    }

    func testLocalSaveRenameLinksAndDisable() throws {
        let space = try LocalSpace(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let service = MobilePluginService(space: space)
        let preferences = UserDefaults.standard
        let saved = preferences.dictionaryRepresentation().filter { $0.key.hasPrefix("plugins.") }
        let manifest: [String: Any] = ["apiVersion": 1, "id": "test.file-hooks", "name": "Hooks", "version": "1.0.0", "requires": ["pluginApi": "3.3.0"], "extension": "./main.js", "hooks": [
            ["id": "save", "title": "Save", "event": "document.saved", "extensions": [".md"], "access": "write"],
            ["id": "rename", "title": "Rename", "event": "file.renamed", "extensions": [".md"], "access": "write"]]]
        let code = #"""
        export default ctx => {
          ctx.subscriptions.add(ctx.capabilities.hooks.register('save', ({event}) => {
            const title = /^# (.+)/.exec(event.document.text)?.[1];
            return title && title !== /^# (.+)/.exec(event.previousText ?? '')?.[1] ? {name:title+'.md'} : undefined;
          }));
          ctx.subscriptions.add(ctx.capabilities.hooks.register('rename', ({event}) => {
            const name = event.path.split('/').pop().slice(0,-3);
            return event.document.text.startsWith('# ') ? {text:event.document.text.replace(/^# [^\n]+/, '# '+name)} : undefined;
          }));
        }
        """#
        let data = try JSONSerialization.data(withJSONObject: ["format": 2, "manifest": manifest, "modules": ["./main.js": code]], options: .sortedKeys)
        let revision = LocalSpace.digest(data)
        defer {
            for key in preferences.dictionaryRepresentation().keys where key.hasPrefix("plugins.") { preferences.removeObject(forKey: key) }
            for (key, value) in saved { preferences.set(value, forKey: key) }
            try? FileManager.default.removeItem(at: service.directory.appendingPathComponent(revision + ".json"))
            try? FileManager.default.removeItem(at: space.root)
            try? FileManager.default.removeItem(at: space.privateRoot)
        }
        service.prepared = ["data": data, "manifest": manifest]
        _ = try service.handle("install", ["revision": revision, "enable": true])
        let old = space.root.appendingPathComponent("Old.md")
        try Data("# Old\nBody".utf8).write(to: old)
        let digest = try XCTUnwrap(LocalSpace.readMarkdown(old)["digest"] as? String)
        let result = try DraftStore.shared.save(old, text: "# New\nBody", digest: digest, space: space)
        let new = try XCTUnwrap(result["url"] as? URL)
        XCTAssertEqual(new.lastPathComponent, "New.md")
        XCTAssertEqual(try String(contentsOf: new, encoding: .utf8), "# New\nBody")
        let index = space.root.appendingPathComponent("index.md")
        try Data("[link](New.md) [[New]] `[[New]]`".utf8).write(to: index)
        let renamed = try space.rename(new, to: "Final.md")
        XCTAssertEqual(try String(contentsOf: renamed, encoding: .utf8), "# Final\nBody")
        XCTAssertEqual(try String(contentsOf: index, encoding: .utf8), "[link](Final.md) [[Final]] `[[New]]`")
        _ = try service.handle("enable", ["id": "test.file-hooks", "enabled": false, "revision": revision])
        let finalDigest = try XCTUnwrap(LocalSpace.readMarkdown(renamed)["digest"] as? String)
        _ = try DraftStore.shared.save(renamed, text: "# Disabled", digest: finalDigest, space: space)
        XCTAssertTrue(FileManager.default.fileExists(atPath: renamed.path))
    }
}
