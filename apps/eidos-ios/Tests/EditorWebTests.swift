import XCTest
import SwiftUI
import WebKit
import PhotosUI
@testable import EidosIOS

final class EditorWebTests: XCTestCase {
    @MainActor
    func testRecordURLReplacesFileChromeAndReturnsToRetainedTable() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: root)
        let file = try space.create(markdown: false)
        let snapshot = try XCTUnwrap(try Runtime.call(file, "getSnapshot") as? [String: Any])
        let schema = try XCTUnwrap(try Runtime.call(file, "getSchemaPage", ["revision": snapshot["revision"]!, "limit": 200]) as? [String: Any])
        let table = try XCTUnwrap((schema["objects"] as? [[String: Any]])?.first { $0["object"] as? String == "table" })
        let label = try XCTUnwrap(table["labelFieldId"] as? String)
        let tableId = try XCTUnwrap(table["id"] as? String)
        let title = String(repeating: "很长的移动端记录标题", count: 8)
        _ = try Runtime.call(file, "mutateRows", ["tableId": tableId, "expectedRevision": snapshot["revision"]!, "changes": [["kind": "create", "clientKey": "route", "values": [label: title]]]])
        let page = try XCTUnwrap(try Runtime.call(file, "queryRows", ["tableId": tableId, "query": [:], "projection": ["fields": [label], "resolveRelations": []], "limit": 10]) as? [String: Any])
        let row = try XCTUnwrap((page["rows"] as? [[String: Any]])?.first)
        let rowId = try XCTUnwrap((row["id"] ?? row["_id"]) as? String)
        _ = try Runtime.call(file, "close")
        let editor = EditorController()
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = UIScreen.main.bounds
        window.rootViewController = UIHostingController(rootView: EditorView(file: file, space: space, dark: false, controller: editor, onLeave: {}))
        window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil; _ = try? Runtime.call(file, "close"); try? FileManager.default.removeItem(at: root) }
        let web = try await ready(editor, script: "!!document.querySelector('.eidos-file-detail-layout')")
        _ = try await web.callAsyncJavaScript("window.retainedTable=document.querySelector('.eidos-file-detail-layout'); location.hash='/records/'+[file,table,row].map(encodeURIComponent).join('/'); return true", arguments: ["file": file.path, "table": tableId, "row": rowId], in: nil, contentWorld: .page)
        _ = try await ready(editor, script: "(document.querySelector('[data-mobile-record-page] h1 textarea')?.value.length ?? 0) > 60")
        _ = try await ready(editor, script: "(()=>{const title=document.querySelector('[data-mobile-record-page] h1 textarea'); return title && title.clientHeight > parseFloat(getComputedStyle(title).lineHeight)*1.5 && title.scrollWidth <= title.clientWidth+1})()")
        XCTAssertTrue(editor.recordPage, "The native file navigation bar must be hidden")
        let fullPage = try await web.evaluateJavaScript("document.querySelector('[data-mobile-record-page]').parentElement===document.body && getComputedStyle(document.querySelector('.database-page')).visibility==='hidden'")
        XCTAssertEqual(fullPage as? Bool, true)
        capture(window, name: "iOS independent record page")
        editor.leave()
        _ = try await ready(editor, script: "!document.querySelector('[data-mobile-record-page]') && getComputedStyle(document.querySelector('.database-page')).visibility==='visible'")
        XCTAssertFalse(editor.recordPage)
        let retained = try await web.evaluateJavaScript("window.retainedTable===document.querySelector('.eidos-file-detail-layout')")
        XCTAssertEqual(retained as? Bool, true)
    }

    @MainActor
    func testSystemImportPickersCancelAndReopen() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: root)
        let file = try space.create(markdown: true)
        let editor = EditorController()
        let host = UIHostingController(rootView: EditorView(file: file, space: space, dark: false, controller: editor, onLeave: {}))
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = UIScreen.main.bounds
        window.rootViewController = host; window.makeKeyAndVisible()
        defer {
            window.isHidden = true; window.rootViewController = nil
            try? FileManager.default.removeItem(at: root)
            try? FileManager.default.removeItem(at: space.privateRoot)
        }
        let web = try await ready(editor, script: "!!document.querySelector('[contenteditable=true]')")
        for imagesOnly in [true, false, true] {
            _ = try await web.evaluateJavaScript("window.importResult = null; window.webkit.messageHandlers.eidos.postMessage({method:'files.import',params:{imagesOnly:\(imagesOnly)}}).then(value=>{window.importResult=value},error=>{window.importResult=String(error)}); true")
            for _ in 0..<50 {
                if host.presentedViewController != nil { break }
                try await Task.sleep(nanoseconds: 100_000_000)
            }
            let presented = try XCTUnwrap(host.presentedViewController)
            try await Task.sleep(nanoseconds: 500_000_000)
            capture(window, name: imagesOnly ? "iOS system photo picker" : "iOS system document picker")
            if imagesOnly {
                let picker = try XCTUnwrap(presented as? PHPickerViewController)
                XCTAssertEqual(picker.configuration.filter, .images)
                XCTAssertEqual(picker.configuration.selectionLimit, 0)
                picker.delegate?.picker(picker, didFinishPicking: [])
            } else {
                let picker = try XCTUnwrap(presented as? UIDocumentPickerViewController)
                XCTAssertTrue(picker.allowsMultipleSelection)
                picker.delegate?.documentPickerWasCancelled?(picker)
                picker.dismiss(animated: true)
            }
            _ = try await ready(editor, script: "Array.isArray(window.importResult) && window.importResult.length===0")
            for _ in 0..<50 {
                if host.presentedViewController == nil { break }
                try await Task.sleep(nanoseconds: 100_000_000)
            }
            XCTAssertNil(host.presentedViewController)
        }
    }
    @MainActor
    func testSharedRecordDraftSurvivesReopenAndCommitsOnce() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: root)
        let file = try space.create(markdown: false)
        let text = "iOS shared " + UUID().uuidString
        let batch = SharedBatch(id: UUID().uuidString, created: Date(), text: text, files: [])
        let inbox = try ShareInbox.root().appendingPathComponent(batch.id)
        try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        try JSONEncoder().encode(batch).write(to: inbox.appendingPathComponent("batch.json"))
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = UIScreen.main.bounds
        defer {
            window.isHidden = true; window.rootViewController = nil
            _ = try? Runtime.call(file, "close")
            try? FileManager.default.removeItem(at: inbox)
            try? FileManager.default.removeItem(at: root)
            try? FileManager.default.removeItem(at: space.privateRoot)
        }
        func mount() -> EditorController {
            let controller = EditorController()
            window.rootViewController = UIHostingController(rootView: EditorView(file: file, space: space, dark: false, controller: controller, onLeave: {}, shareBatch: batch))
            window.makeKeyAndVisible(); window.rootViewController?.view.layoutIfNeeded()
            return controller
        }
        let first = mount()
        let saveLabel = String(decoding: try JSONSerialization.data(withJSONObject: tr("保存记录"), options: .fragmentsAllowed), as: UTF8.self)
        let saveButton = "[...document.querySelectorAll('button')].find(b=>b.textContent===\(saveLabel))"
        let web = try await ready(first, script: "!!document.querySelector('.record-draft > div > button')")
        _ = try await web.evaluateJavaScript("document.querySelector('.record-draft > div > button').click()")
        _ = try await ready(first, script: "!!(\(saveButton))")
        let saved = try XCTUnwrap(RecordDraftStore.read(file, space: space, share: batch.id))
        XCTAssertTrue(String(decoding: try JSONSerialization.data(withJSONObject: saved), as: UTF8.self).contains(text))
        window.rootViewController = nil
        try await Task.sleep(nanoseconds: 200_000_000)
        let second = mount()
        let reopened = try await ready(second, script: "!!(\(saveButton))")
        let contents = try await reopened.evaluateJavaScript("document.body.textContent") as? String ?? ""
        XCTAssertTrue(contents.contains(text))
        let focused = try await reopened.evaluateJavaScript("(() => { const field=document.querySelector('.record-draft input, .record-draft textarea, .record-draft [contenteditable=true]'); if(!field) return false; field.focus(); return parseFloat(getComputedStyle(field).fontSize)>=16 && document.activeElement===field })()")
        XCTAssertEqual(focused as? Bool, true, "Record input must focus with a readable size that does not trigger iOS auto zoom")
        try await Task.sleep(nanoseconds: 500_000_000)
        let scale = try await reopened.evaluateJavaScript("visualViewport.scale") as? Double
        XCTAssertEqual(try XCTUnwrap(scale), 1, accuracy: 0.01)
        let hittable = try await reopened.evaluateJavaScript("(() => { const button=\(saveButton); const r=button.getBoundingClientRect(); const target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return button===target || button.contains(target) })()")
        XCTAssertEqual(hittable as? Bool, true, "Save must be reachable by touch, not covered by the inspector")
        capture(window, name: "iOS shared record draft")
        _ = try await reopened.evaluateJavaScript("(\(saveButton)).click()")
        for _ in 0..<100 {
            if !FileManager.default.fileExists(atPath: inbox.path) { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: inbox.path))
        XCTAssertNil(try RecordDraftStore.read(file, space: space, share: batch.id))
        let result = try space.search(text, cancelled: { false })
        XCTAssertEqual(result.matches.count, 1)
        XCTAssertNotNil(result.matches.first?.tableId)
    }
    @MainActor
    func testMarkdownURLDeletesOneCharacterAndPersists() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: root)
        let file = try space.create(markdown: true)
        try "https://example.com/page".write(to: file, atomically: true, encoding: .utf8)
        let editor = EditorController()
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = UIScreen.main.bounds
        window.rootViewController = UIHostingController(rootView: EditorView(file: file, space: space, dark: false, controller: editor, onLeave: {}))
        window.makeKeyAndVisible(); window.rootViewController?.view.layoutIfNeeded()
        defer {
            window.isHidden = true; window.rootViewController = nil
            try? FileManager.default.removeItem(at: root)
            try? FileManager.default.removeItem(at: space.privateRoot)
        }
        let web = try await ready(editor, script: "!!document.querySelector('.eme-content-editable a span')")
        let editable = try await web.evaluateJavaScript("document.querySelector('.eme-content-editable a').closest('[contenteditable=false]')===null")
        XCTAssertEqual(editable as? Bool, true)
        _ = try await web.evaluateJavaScript("(()=>{const root=document.querySelector('.eme-content-editable');root.focus();const text=root.querySelector('a span').firstChild;const range=document.createRange();range.setStart(text,text.length);range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range);document.execCommand('delete')})()")
        _ = try await ready(editor, script: "document.querySelector('.eme-content-editable').textContent==='https://example.com/pag' && document.querySelector('.eme-content-editable a').getAttribute('href')==='https://example.com/pag'")
        _ = try await web.callAsyncJavaScript("await window.eidosFlush(); return true", arguments: [:], in: nil, contentWorld: .page)
        XCTAssertEqual(try String(contentsOf: file, encoding: .utf8), "https://example.com/pag")
    }

    @MainActor
    func testMarkdownTailAfterCalloutAcceptsTyping() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: root)
        let file = try space.create(markdown: true)
        try "> [!note] Tail\n> Keep".write(to: file, atomically: true, encoding: .utf8)
        let editor = EditorController()
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = UIScreen.main.bounds
        window.rootViewController = UIHostingController(rootView: EditorView(file: file, space: space, dark: false, controller: editor, onLeave: {}))
        window.makeKeyAndVisible(); window.rootViewController?.view.layoutIfNeeded()
        defer {
            window.isHidden = true; window.rootViewController = nil
            try? FileManager.default.removeItem(at: root)
            try? FileManager.default.removeItem(at: space.privateRoot)
        }
        let web = try await ready(editor, script: "!!document.querySelector('.eme-content-editable [data-lexical-decorator]')")
        _ = try await web.evaluateJavaScript("(()=>{const root=document.querySelector('.eme-content-editable');const r=root.querySelector('[data-lexical-decorator]').getBoundingClientRect();for(const type of ['pointerdown','pointerup'])root.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:1,pointerType:'touch',button:0,clientX:r.left+40,clientY:r.bottom+24}))})()")
        _ = try await ready(editor, script: "document.querySelector('.eme-content-editable').lastElementChild.tagName==='P'")
        _ = try await web.evaluateJavaScript("document.execCommand('insertText',false,'New paragraph')")
        _ = try await ready(editor, script: "document.querySelector('.eme-content-editable').textContent.includes('New paragraph')")
        _ = try await web.callAsyncJavaScript("await window.eidosFlush(); return true", arguments: [:], in: nil, contentWorld: .page)
        XCTAssertTrue(try String(contentsOf: file, encoding: .utf8).contains("New paragraph"))
    }

    @MainActor private func ready(_ controller: EditorController, script: String) async throws -> WKWebView {
        for _ in 0..<150 {
            if let web = controller.web, (try? await web.evaluateJavaScript(script)) as? Bool == true { return web }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTFail("Web editor did not become ready")
        return try XCTUnwrap(controller.web)
    }
    @MainActor private func capture(_ window: UIWindow, name: String) {
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) }
        let attachment = XCTAttachment(image: image); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
        try? image.pngData()?.write(to: URL(fileURLWithPath: "/tmp/" + name.replacingOccurrences(of: " ", with: "-") + ".png"))
    }
    @MainActor
    func testDirectMarkdownEditingFlushesToDisk() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: root)
        let file = try space.create(markdown: true)
        let editor = EditorController()
        let host = UIHostingController(rootView: EditorView(file: file, space: space, dark: false, controller: editor, onLeave: {}))
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = UIScreen.main.bounds
        window.rootViewController = host; window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil; try? FileManager.default.removeItem(at: root) }
        host.loadViewIfNeeded(); host.view.layoutIfNeeded()
        for _ in 0..<100 {
            if let web = editor.web, (try? await web.evaluateJavaScript("!!document.querySelector('[contenteditable=true]')")) as? Bool == true { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let web = try XCTUnwrap(editor.web)
        let ready = try await web.evaluateJavaScript("!!document.querySelector('[contenteditable=true]')")
        XCTAssertEqual(ready as? Bool, true)
        _ = try await web.evaluateJavaScript("const editor=document.querySelector('[contenteditable=true]'); editor.focus(); const range=document.createRange(); range.selectNodeContents(editor); range.collapse(false); const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range); document.execCommand('insertText',false,' iOS persisted'); true")
        _ = try await web.callAsyncJavaScript("await window.eidosFlush(); return true", arguments: [:], in: nil, contentWorld: .page)
        XCTAssertTrue(try String(contentsOf: file).contains("iOS persisted"))
        let sourceButton = try await web.evaluateJavaScript("[...document.querySelectorAll('button')].some(e=>e.textContent==='源码')")
        XCTAssertEqual(sourceButton as? Bool, false)
        capture(window, name: "iOS direct Markdown editing")
    }
}
