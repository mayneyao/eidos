import XCTest
import SwiftUI
import WebKit
import PhotosUI
@testable import EidosIOS

final class EditorWebTests: XCTestCase {
    @MainActor
    func testCreatesFormulaFromMobileFieldsAndRendersAfterReopen() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: root)
        let file = root.appendingPathComponent("Formula.eidos")
        _ = try Runtime.call(file, "create", [
            "title": "Formula QA",
            "fields": [
                ["clientKey": "title", "name": "Title", "kind": "text", "position": "0"],
                ["clientKey": "quantity", "name": "Quantity", "kind": "integer", "position": "1"],
            ],
        ])
        let snapshot = try XCTUnwrap(try Runtime.call(file, "getSnapshot") as? [String: Any])
        let revision = try XCTUnwrap(snapshot["revision"] as? String)
        let schema = try XCTUnwrap(try Runtime.call(file, "getSchemaPage", ["revision": revision, "limit": 200]) as? [String: Any])
        let objects = try XCTUnwrap(schema["objects"] as? [[String: Any]])
        let table = try XCTUnwrap(objects.first { $0["object"] as? String == "table" })
        let tableId = try XCTUnwrap(table["id"] as? String)
        let labelId = try XCTUnwrap(table["labelFieldId"] as? String)
        let quantity = try XCTUnwrap(objects.first { $0["object"] as? String == "field" && $0["name"] as? String == "Quantity" })
        let quantityId = try XCTUnwrap(quantity["id"] as? String)
        let inserted = try XCTUnwrap(try Runtime.call(file, "mutateRows", [
            "tableId": tableId, "expectedRevision": revision,
            "changes": [["kind": "create", "clientKey": "row", "values": [labelId: "One item", quantityId: "5"]]],
        ]) as? [String: Any])
        let rowId = try XCTUnwrap((inserted["created"] as? [[String: Any]])?.first?["rowId"] as? String)
        _ = try Runtime.call(file, "close")

        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = UIScreen.main.bounds
        defer {
            window.isHidden = true
            window.rootViewController = nil
            _ = try? Runtime.call(file, "close")
            try? FileManager.default.removeItem(at: root)
            try? FileManager.default.removeItem(at: space.privateRoot)
        }
        func openEditor() async throws -> (EditorController, WKWebView) {
            let editor = EditorController()
            window.rootViewController = UIHostingController(rootView: EditorView(
                file: file, space: space, dark: false, controller: editor, onLeave: {}
            ))
            window.makeKeyAndVisible()
            let web = try await ready(editor, script: "!!document.querySelector('.eidos-file-detail-layout')")
            return (editor, web)
        }
        func showRecord(_ web: WKWebView) async throws {
            _ = try await web.callAsyncJavaScript(
                "location.hash='/records/'+[file,table,row].map(encodeURIComponent).join('/'); return true",
                arguments: ["file": file.path, "table": tableId, "row": rowId], in: nil, contentWorld: .page
            )
        }
        let (editor, web) = try await openEditor()
        _ = try await web.evaluateJavaScript("document.querySelector('button[aria-label=\"View settings\"], button[aria-label=\"视图设置\"]').click(); true")
        _ = try await ready(editor, script: "!!document.querySelector('.mobile-fields-trigger')")
        _ = try await web.evaluateJavaScript("document.querySelector('.mobile-fields-trigger').click(); true")
        _ = try await ready(editor, script: "!!document.querySelector('.eidos-mobile-fields-list button')")
        _ = try await web.evaluateJavaScript("[...document.querySelectorAll('.eidos-mobile-fields-list button')].find(b=>['New field','新建字段'].includes(b.textContent.trim())).click(); true")
        _ = try await ready(editor, script: "!!document.querySelector('.eidos-mobile-fields-create [data-eidos-file-field-type-trigger]')")
        _ = try await web.evaluateJavaScript("document.querySelector('.eidos-mobile-fields-create [data-eidos-file-field-type-trigger]').click(); true")
        _ = try await ready(editor, script: "!!document.querySelector('[data-eidos-file-field-type=formula]')")
        _ = try await web.evaluateJavaScript("document.querySelector('[data-eidos-file-field-type=formula]').click(); true")
        _ = try await ready(editor, script: "!!document.querySelector('[data-eidos-file-formula-composer]')")
        _ = try await web.evaluateJavaScript("""
            (() => { const name = document.querySelector('.eidos-mobile-fields-create form input');
              Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(name, 'Doubled');
              name.dispatchEvent(new Event('input', {bubbles:true}));
              document.querySelector('.eidos-file-formula-display-select').click();
              return true;
            })()
            """)
        _ = try await ready(editor, script: "!!document.querySelector('[role=option]:has([data-eidos-file-field-type-icon=integer])')")
        _ = try await web.evaluateJavaScript("document.querySelector('[role=option]:has([data-eidos-file-field-type-icon=integer])').click(); true")
        _ = try await web.callAsyncJavaScript("""
            document.querySelector(`[data-formula-reference$=":${quantity}"]`).click();
            const expression = document.querySelector('textarea[aria-label="Formula expression"]');
            expression.focus();
            expression.setSelectionRange(expression.value.length, expression.value.length);
            return document.execCommand('insertText', false, ' *');
            """, arguments: ["quantity": quantityId], in: nil, contentWorld: .page)
        _ = try await ready(editor, script: """
            !!document.querySelector('[data-eidos-file-formula-status=error]')
                && document.querySelector('.eidos-mobile-fields-create button[type=submit]')?.disabled === true
            """)
        _ = try await web.evaluateJavaScript("document.execCommand('insertText', false, ' 2')")
        _ = try await ready(editor, script: "document.querySelector('[data-eidos-file-formula-status=valid]')?.textContent.trim() === '10'")
        _ = try await ready(editor, script: """
            (() => { const button = document.querySelector('.eidos-mobile-fields-create button[type=submit]');
              const rect = button.getBoundingClientRect();
              return !button.disabled && button.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));
            })()
            """)
        capture(window, name: "t01-formula-ios-preview-20261121")
        _ = try await web.evaluateJavaScript("document.querySelector('.eidos-mobile-fields-create button[type=submit]').click(); true")
        _ = try await ready(editor, script: "!!document.querySelector('button[aria-label=\"Edit Doubled properties\"],button[aria-label=\"编辑Doubled属性\"]')")
        _ = try await web.evaluateJavaScript("document.querySelector('[data-mobile-page]:not([hidden]) > header button[aria-label=\"Close\"], [data-mobile-page]:not([hidden]) > header button[aria-label=\"关闭\"]').click(); true")
        _ = try await ready(editor, script: "!document.querySelector('.eidos-mobile-fields-content')")
        try await showRecord(web)
        func renderedValue(_ value: String) -> String {
            """
            [...document.querySelectorAll('[data-eidos-record-property]')].some(
              e=>e.innerText.includes('Doubled') && e.querySelector('.eidos-mobile-record-value')?.textContent.trim()==='\(value)')
            """
        }
        _ = try await ready(editor, script: renderedValue("10"))
        _ = try await web.evaluateJavaScript("""
            (() => { const field = document.querySelector('input[aria-label=Quantity]'); field.focus();
              Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, '7');
              field.dispatchEvent(new Event('input', {bubbles:true}));
              return true;
            })()
            """)
        _ = try await web.evaluateJavaScript("document.querySelector('input[aria-label=Quantity]').blur(); true")
        _ = try await ready(editor, script: renderedValue("14"))
        window.rootViewController = nil
        _ = try Runtime.call(file, "close")
        let (reopenedEditor, reopenedWeb) = try await openEditor()
        try await showRecord(reopenedWeb)
        _ = try await ready(reopenedEditor, script: renderedValue("14"))
        capture(window, name: "t01-formula-ios-reopen-20261121")
    }

    @MainActor
    func testTodayFormulaRendersAfterReopeningTheWKWebView() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: root)
        let file = try space.create(markdown: false)
        let snapshot = try XCTUnwrap(try Runtime.call(file, "getSnapshot") as? [String: Any])
        let revision = try XCTUnwrap(snapshot["revision"] as? String)
        let schema = try XCTUnwrap(try Runtime.call(file, "getSchemaPage", ["revision": revision, "limit": 200]) as? [String: Any])
        let table = try XCTUnwrap((schema["objects"] as? [[String: Any]])?.first { $0["object"] as? String == "table" })
        let tableId = try XCTUnwrap(table["id"] as? String)
        let label = try XCTUnwrap(table["labelFieldId"] as? String)
        let plan = try XCTUnwrap(try Runtime.call(file, "preflightSchema", [
            "expectedRevision": revision,
            "change": [
                "kind": "create-field", "tableId": tableId,
                "field": [
                    "clientKey": "today", "name": "Formula for the day", "kind": "formula", "position": "1",
                    "definition": ["sourceText": "TODAY()", "resultType": "date"],
                ],
            ],
        ]) as? [String: Any])
        let saved = try XCTUnwrap(try Runtime.call(file, "mutateSchema", [
            "expectedRevision": revision,
            "planToken": try XCTUnwrap(plan["planToken"] as? String),
            "actionsHash": try XCTUnwrap(plan["actionsHash"] as? String),
        ]) as? [String: Any])
        _ = try Runtime.call(file, "mutateRows", [
            "tableId": tableId, "expectedRevision": try XCTUnwrap(saved["revision"] as? String),
            "changes": [["kind": "create", "clientKey": "row", "values": [label: "Keep this record"]]],
        ])
        let page = try XCTUnwrap(try Runtime.call(file, "queryRows", [
            "tableId": tableId, "query": [:], "limit": 10,
            "projection": ["fields": [label], "resolveRelations": []],
        ]) as? [String: Any])
        let rowId = try XCTUnwrap((page["rows"] as? [[String: Any]])?.first?["id"] as? String)
        _ = try Runtime.call(file, "close")

        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = UIScreen.main.bounds
        defer {
            window.isHidden = true
            window.rootViewController = nil
            _ = try? Runtime.call(file, "close")
            try? FileManager.default.removeItem(at: root)
            try? FileManager.default.removeItem(at: space.privateRoot)
        }
        for _ in 0..<2 {
            let editor = EditorController()
            window.rootViewController = UIHostingController(rootView: EditorView(
                file: file, space: space, dark: false, controller: editor, onLeave: {}
            ))
            window.makeKeyAndVisible()
            let web = try await ready(editor, script: "!!document.querySelector('.eidos-file-detail-layout')")
            _ = try await web.callAsyncJavaScript(
                "location.hash='/records/'+[file,table,row].map(encodeURIComponent).join('/'); return true",
                arguments: ["file": file.path, "table": tableId, "row": rowId], in: nil, contentWorld: .page
            )
            _ = try await ready(editor, script: """
                document.querySelector('[data-mobile-record-page] h1 textarea')?.value === 'Keep this record'
                """)
            let rendered = try await web.evaluateJavaScript("""
                (() => {
                    const text = document.body.innerText;
                    const now = new Date();
                    const formats = new Intl.DateTimeFormat('en-CA', {
                        year: 'numeric', month: '2-digit', day: '2-digit'
                    }).formatToParts(now);
                    const date = ['year', 'month', 'day'].map(k => formats.find(p => p.type === k).value).join('-');
                    const visibleDates = [
                        date,
                        new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(now),
                        new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(now),
                    ];
                    const dateShown = visibleDates.some(value => text.includes(value))
                        || !!document.querySelector(`[title="${date}"]`);
                    return { text, dateShown: text.includes('Formula for the day') && dateShown };
                })()
                """) as? [String: Any]
            XCTAssertEqual(rendered?["dateShown"] as? Bool, true, String(describing: rendered?["text"]))
            window.rootViewController = nil
            _ = try Runtime.call(file, "close")
        }
    }

    @MainActor
    func testMarkdownPreviewsSpaceRelativeImagesAfterReopening() async throws {
        let sandbox = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let space = try LocalSpace(root: sandbox.appendingPathComponent("Space"))
        defer {
            try? FileManager.default.removeItem(at: sandbox)
            try? FileManager.default.removeItem(at: space.privateRoot)
        }
        let manager = FileManager.default
        let source = space.root.appendingPathComponent("Source Notes/assets")
        let target = space.root.appendingPathComponent("Target Folder")
        let nested = target.appendingPathComponent("assets")
        let hidden = space.root.appendingPathComponent(".hidden")
        for directory in [source, nested, hidden] {
            try manager.createDirectory(at: directory, withIntermediateDirectories: true)
        }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: 16, height: 12), format: format).pngData { renderer in
            UIColor.systemTeal.setFill()
            renderer.fill(CGRect(x: 0, y: 0, width: 16, height: 12))
        }
        let original = source.appendingPathComponent("My photo.png")
        let outside = sandbox.appendingPathComponent("outside.png")
        for path in [original, target.appendingPathComponent("local.png"), nested.appendingPathComponent("local.png"),
                     hidden.appendingPathComponent("hidden.png"), outside, space.root.appendingPathComponent("not-an-image.txt")] {
            try image.write(to: path)
        }
        try manager.createSymbolicLink(at: space.root.appendingPathComponent("inside-link.png"), withDestinationURL: original)
        try manager.createSymbolicLink(at: space.root.appendingPathComponent("outside-link.png"), withDestinationURL: outside)
        try manager.createSymbolicLink(at: space.root.appendingPathComponent("root-link"), withDestinationURL: space.root)
        let oversize = space.root.appendingPathComponent("oversize.png")
        try image.write(to: oversize)
        let handle = try FileHandle(forWritingTo: oversize)
        try handle.truncate(atOffset: 16 * 1024 * 1024 + 1)
        try handle.close()
        let file = target.appendingPathComponent("Draft.md")
        let markdown = """
        # Attachment preview

        ![Moved](../Source%20Notes/assets/My%20photo.png)

        ![Same folder](local.png)

        ![Child folder](assets/local.png)
        """
        try Data(markdown.utf8).write(to: file)

        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = UIScreen.main.bounds
        defer { window.isHidden = true; window.rootViewController = nil }
        for pass in 1...2 {
            let editor = EditorController()
            window.rootViewController = UIHostingController(rootView: EditorView(file: file, space: space, dark: false, controller: editor, onLeave: {}))
            window.makeKeyAndVisible(); window.rootViewController?.view.layoutIfNeeded()
            let decoded = """
            ['Moved', 'Same folder', 'Child folder'].every(alt => {
              const img = document.querySelector('img[alt="' + alt + '"]');
              return img?.complete && img.naturalWidth === 16 && img.naturalHeight === 12
                && img.getBoundingClientRect().width > 0;
            })
            """
            let web = try await ready(editor, script: decoded)
            let displayed = try await web.evaluateJavaScript(decoded) as? Bool
            XCTAssertEqual(displayed, true, "All local images must decode on open \(pass)")
            if pass == 1 && displayed == true {
                let denied = ["outside-link.png", "inside-link.png", "root-link/Source%20Notes/assets/My%20photo.png",
                              ".hidden/hidden.png", "not-an-image.txt", "oversize.png",
                              "Target%20Folder/%2e%2e%2f%2e%2e%2foutside.png"]
                let outcomes = try await web.callAsyncJavaScript("""
                const { imageRoot } = await window.webkit.messageHandlers.eidos.postMessage({ method: 'init' });
                return await Promise.all(paths.map(path => new Promise(resolve => {
                  const image = new Image();
                  image.onload = () => resolve('loaded');
                  image.onerror = () => resolve('blocked');
                  setTimeout(() => resolve('timeout'), 3000);
                  image.src = imageRoot + path;
                })));
                """, arguments: ["paths": denied], in: nil, contentWorld: .page) as? [String]
                XCTAssertEqual(outcomes, denied.map { _ in "blocked" })
            }
            window.rootViewController = nil
        }
        XCTAssertEqual(try Data(contentsOf: file), Data(markdown.utf8))
        XCTAssertEqual(try Data(contentsOf: original), image)
    }

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
        let web = try await ready(editor, script: "!!document.querySelector('[contenteditable=true]') && typeof window.eidosFlush === 'function'")
        _ = try await web.evaluateJavaScript("const editor=document.querySelector('[contenteditable=true]'); editor.focus(); const range=document.createRange(); range.selectNodeContents(editor); range.collapse(false); const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range); document.execCommand('insertText',false,' iOS persisted'); true")
        _ = try await ready(editor, script: "document.querySelector('[contenteditable=true]')?.textContent.includes('iOS persisted') && typeof window.eidosFlush === 'function'")
        _ = try await web.callAsyncJavaScript("await window.eidosFlush(); return true", arguments: [:], in: nil, contentWorld: .page)
        XCTAssertTrue(try String(contentsOf: file).contains("iOS persisted"))
        let sourceButton = try await web.evaluateJavaScript("[...document.querySelectorAll('button')].some(e=>e.textContent==='源码')")
        XCTAssertEqual(sourceButton as? Bool, false)
        capture(window, name: "iOS direct Markdown editing")
    }
}
