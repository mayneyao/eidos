import SwiftUI
import WebKit
import UniformTypeIdentifiers
import PhotosUI

struct EditorView: UIViewRepresentable {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var appLanguage = "system"
    @Environment(\.locale) private var appLocale
    let file: URL
    let space: LocalSpace
    let dark: Bool
    let controller: EditorController
    let onLeave: () -> Void
    var initialTable = ""
    var initialQuery = ""
    var shareBatch: SharedBatch? = nil
    func makeCoordinator() -> Coordinator {
        let coordinator = Coordinator(file: file, space: space, dark: dark, controller: controller, onLeave: onLeave)
        coordinator.initialTable = initialTable; coordinator.initialQuery = initialQuery
        coordinator.shareBatch = shareBatch
        return coordinator
    }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "eidos")
        config.setURLSchemeHandler(context.coordinator, forURLScheme: "eidos")
        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = context.coordinator
        web.isOpaque = false
        web.backgroundColor = .systemBackground
        web.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.web = web
        controller.web = web
        controller.currentFile = file
        controller.tables = []
        controller.selectedTable = ""
        controller.recordPage = false
        controller.onUnavailable = onLeave
        web.load(URLRequest(url: URL(string: "eidos://app/editor/index.html")!))
        return web
    }
    func updateUIView(_ web: WKWebView, context: Context) {
        web.evaluateJavaScript("window.eidosSetLocale?.('\(AppLanguage.locale)')", completionHandler: nil)
    }
    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        coordinator.importReply?(nil,tr("页面已关闭")); coordinator.importReply = nil
        web.configuration.userContentController.removeScriptMessageHandler(forName: "eidos", contentWorld: .page)
        coordinator.queue.async { _ = try? Runtime.call(coordinator.file, "close") }
    }
    final class Coordinator: NSObject, WKScriptMessageHandlerWithReply, WKURLSchemeHandler, WKNavigationDelegate, UIDocumentPickerDelegate, PHPickerViewControllerDelegate {
        var file: URL
        let space: LocalSpace
        let dark: Bool
        let onLeave: () -> Void
        let controller: EditorController
        let queue = LocalSpace.io
        let pluginNonce = UUID().uuidString
        var initialTable = ""
        var initialQuery = ""
        var shareBatch: SharedBatch?
        weak var web: WKWebView?
        var importReply: ((Any?, String?) -> Void)?
        init(file: URL, space: LocalSpace, dark: Bool, controller: EditorController, onLeave: @escaping () -> Void) { self.file = file; self.space = space; self.dark = dark; self.controller = controller; self.onLeave = onLeave }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
            guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.scheme == "eidos",
                  message.frameInfo.request.url?.host == "app",
                  let body = message.body as? [String: Any], let method = body["method"] as? String else {
                replyHandler(nil, tr("无效编辑器请求")); return
            }
            let params = body["params"] as? [String: Any] ?? [:]
            if method == "files.import" {
                guard importReply == nil else { replyHandler(nil,tr("正在选择文件")); return }
                importReply = replyHandler
                var presenter = web?.window?.rootViewController
                while let presented = presenter?.presentedViewController { presenter = presented }
                guard let presenter else { importReply = nil; replyHandler(nil,tr("无法打开文件选择器")); return }
                if params["imagesOnly"] as? Bool == true {
                    var configuration = PHPickerConfiguration()
                    configuration.filter = .images
                    configuration.selectionLimit = 0
                    let picker = PHPickerViewController(configuration: configuration)
                    picker.delegate = self
                    presenter.present(picker, animated: true)
                } else {
                    let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.data], asCopy: true)
                    picker.allowsMultipleSelection = true
                    picker.delegate = self
                    presenter.present(picker, animated: true)
                }
                return
            }
            if method == "editor.recordPage" {
                guard controller.web === web else { replyHandler(nil, tr("文件会话已结束")); return }
                controller.recordPage = params["active"] as? Bool ?? false
                replyHandler(NSNull(), nil); return
            }
            if method == "editor.tables" {
                guard controller.web === web else { replyHandler(nil, tr("文件会话已结束")); return }
                controller.tables = (params["tables"] as? [[String:String]] ?? []).compactMap { entry in
                    guard let id = entry["id"], let name = entry["name"] else { return nil }
                    return EditorTable(id:id,name:name)
                }
                controller.selectedTable = params["selected"] as? String ?? ""
                replyHandler(NSNull(),nil); return
            }
            if method == "leave" { replyHandler(NSNull(), nil); onLeave(); return }
            if method == "keyboard.hide" { web?.endEditing(true); replyHandler(NSNull(), nil); return }
            if method == "openLink" {
                guard let text = params["url"] as? String, let url = URL(string: text), ["https", "http", "mailto"].contains(url.scheme ?? "") else { replyHandler(nil, tr("暂不支持此链接")); return }
                UIApplication.shared.open(url); replyHandler(NSNull(), nil); return
            }
            queue.async {
                do {
                    let result: Any
                    switch method {
                    case "plugin.catalog":
                        let service = MobilePluginService(space:self.space)
                        let installed = try service.handle("list",[:]) as? [[String:Any]] ?? []
                        result = try installed.filter { record in
                            let manifest = record["manifest"] as? [String:Any] ?? [:]
                            let views = manifest["views"] as? [[String:Any]] ?? []
                            return record["enabled"] as? Bool == true && manifest["kind"] as? String != "theme" &&
                                params["themeOnly"] as? Bool != true && views.contains { ($0["capabilities"] as? [String])?.contains("eidos/table") == true }
                        }.map { record in
                            try service.handle("package",["id":(record["manifest"] as? [String:Any])?["id"] ?? ""])
                        }
                    case "init":
                        var document: [String: Any] = ["path":self.file.lastPathComponent,"kind":self.file.pathExtension.lowercased() == "eidos" ? "eidos" : "markdown", "dark":self.dark]
                        document["recordPath"] = LocalSpace.storageIdentity(self.file)
                        document["initialTable"] = self.initialTable
                        document["initialQuery"] = self.initialQuery
                        if let batch = self.shareBatch {
                            document["share"] = ["id": batch.id, "text": batch.text, "files": batch.files]
                        }
                        document["recordDraft"] = (try RecordDraftStore.read(self.file, space: self.space, share: self.shareBatch?.id)) as Any? ?? NSNull()
                        if document["kind"] as? String == "markdown" { document.merge(try DraftStore.shared.read(self.file)) { _, new in new } }
                        result = document
                    case "recordDraft.read":
                        result = (try RecordDraftStore.read(self.file, space: self.space, share: self.shareBatch?.id)) as Any? ?? NSNull()
                    case "recordDraft.save":
                        guard self.file.pathExtension.lowercased() == "eidos" else { throw LocalError.message(tr("无效记录草稿")) }
                        try RecordDraftStore.save(params, file: self.file, space: self.space, share: self.shareBatch?.id)
                        result = NSNull()
                    case "recordDraft.remove":
                        try RecordDraftStore.remove(self.file, space: self.space, share: self.shareBatch?.id)
                        result = NSNull()
                    case "share.import":
                        guard let batch = self.shareBatch else { throw LocalError.message(tr("没有待保存的分享")) }
                        let root = try ShareInbox.root().appendingPathComponent(batch.id)
                        let sources = try batch.files.map { try LocalSpace.resource($0, under: root) }
                        result = try LocalSpace.importEditorFiles(document: self.file, sources: sources)
                    case "share.complete":
                        guard let batch = self.shareBatch else { throw LocalError.message(tr("没有待保存的分享")) }
                        let inbox = try ShareInbox.root().appendingPathComponent(batch.id)
                        if FileManager.default.fileExists(atPath: inbox.path) { try FileManager.default.removeItem(at: inbox) }
                        try RecordDraftStore.remove(self.file, space: self.space, share: batch.id)
                        result = NSNull()
                    case "markdown.save":
                        guard self.file.pathExtension.lowercased() != "eidos", let text = params["text"] as? String, let digest = params["digest"] as? String else { throw LocalError.message(tr("无效 Markdown 保存请求")) }
                        var saved = try DraftStore.shared.save(self.file, text: text, digest: digest, space: self.space)
                        if let updated = saved.removeValue(forKey: "url") as? URL {
                            self.file = updated
                            DispatchQueue.main.async { self.controller.currentFile = updated }
                        }
                        result = saved
                    case "markdown.keepDraft":
                        guard self.file.pathExtension.lowercased() != "eidos", let text = params["text"] as? String, let digest = params["digest"] as? String else { throw LocalError.message(tr("无效草稿")) }
                        try DraftStore.shared.stage(self.file, text: text, digest: digest)
                        result = NSNull()
                    case "markdown.discardDraft":
                        guard self.file.pathExtension.lowercased() != "eidos" else { throw LocalError.message(tr("无效草稿")) }
                        try DraftStore.shared.discard(self.file)
                        result = NSNull()
                    case "runtime":
                        guard self.file.pathExtension.lowercased() == "eidos", let operation = params["method"] as? String else { throw LocalError.message(tr("无效 Runtime 请求")) }
                        guard !["create", "close"].contains(operation), !operation.hasPrefix("graft:"), !operation.hasPrefix("publish:") else { throw LocalError.message(tr("不允许此操作")) }
                        result = try Runtime.call(self.file, operation, params["request"] ?? [:])
                    default: throw LocalError.message(tr("不支持的编辑器操作：{0}", method))
                    }
                    DispatchQueue.main.async { replyHandler(result, nil) }
                } catch { DispatchQueue.main.async { replyHandler(nil, error.localizedDescription) } }
            }
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.targetFrame?.isMainFrame == false {
                decisionHandler(navigationAction.request.url?.scheme == "about" ? .allow : .cancel)
                return
            }
            var destination = navigationAction.request.url.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) }
            destination?.fragment = nil
            decisionHandler(destination?.url?.absoluteString == "eidos://app/editor/index.html" ? .allow : .cancel)
        }
        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { importReply?([],nil); importReply = nil }
        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            picker.dismiss(animated: true)
            guard let reply = importReply else { return }
            Task { @MainActor in
                let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
                defer {
                    try? FileManager.default.removeItem(at: directory)
                    importReply = nil
                }
                do {
                    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                    var urls: [URL] = []
                    for (index, result) in results.enumerated() {
                        let destination = directory.appendingPathComponent(String(index))
                        try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
                        let url: URL = try await withCheckedThrowingContinuation { continuation in
                            result.itemProvider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { source, error in
                                guard let source else {
                                    continuation.resume(throwing: error ?? LocalError.message(tr("无法读取照片"))); return
                                }
                                do {
                                    let target = destination.appendingPathComponent(source.lastPathComponent)
                                    try FileManager.default.copyItem(at: source, to: target)
                                    continuation.resume(returning: target)
                                } catch { continuation.resume(throwing: error) }
                            }
                        }
                        urls.append(url)
                    }
                    let sources = urls
                    let entries: Any = try await withCheckedThrowingContinuation { continuation in
                        queue.async {
                            do { continuation.resume(returning: try LocalSpace.importEditorFiles(document: self.file, sources: sources)) }
                            catch { continuation.resume(throwing: error) }
                        }
                    }
                    reply(entries, nil)
                } catch { reply(nil, error.localizedDescription) }
            }
        }
        func documentPicker(_ controller: UIDocumentPickerViewController,didPickDocumentsAt urls: [URL]) {
            guard let reply = importReply else { return }; importReply = nil
            queue.async {
                do { let entries = try LocalSpace.importEditorFiles(document:self.file,sources:urls); DispatchQueue.main.async { reply(entries,nil) } }
                catch { DispatchQueue.main.async { reply(nil,error.localizedDescription) } }
            }
        }
        func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
            do {
                guard let url = urlSchemeTask.request.url, url.host == "app" else { throw LocalError.message(tr("无效资源")) }
                let root: URL
                let path: String
                if url.path.hasPrefix("/editor/") {
                    guard let bundleRoot = Bundle.main.resourceURL else { throw LocalError.message(tr("编辑器资源缺失")) }
                    root = bundleRoot.appendingPathComponent("editor")
                    path = String(url.path.dropFirst("/editor/".count))
                } else if url.path.hasPrefix("/document/") {
                    root = file.deletingLastPathComponent()
                    path = String(url.path.dropFirst("/document/".count))
                    guard ["png", "jpg", "jpeg", "gif", "webp", "avif"].contains(URL(fileURLWithPath: path).pathExtension.lowercased()) else { throw LocalError.message(tr("不支持的图片类型")) }
                } else { throw LocalError.message(tr("资源不存在")) }
                let target = try LocalSpace.resource(path, under: root)
                if url.path.hasPrefix("/document/"), (try target.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max) > 16 * 1024 * 1024 {
                    throw LocalError.message(tr("图片超过 16 MB"))
                }
                var data = try Data(contentsOf: target)
                if url.path == "/editor/index.html" {
                    data = Data(String(decoding:data,as:UTF8.self).replacingOccurrences(of:"__EIDOS_PLUGIN_NONCE__",with:pluginNonce).utf8)
                }
                if target.pathExtension == "html" {
                    data = Data(String(decoding: data, as: UTF8.self).replacingOccurrences(of: "__EIDOS_LOCALE__", with: AppLanguage.locale).utf8)
                }
                let mime = ["js":"application/javascript", "css":"text/css", "html":"text/html"][target.pathExtension] ?? UTType(filenameExtension: target.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
                urlSchemeTask.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: "utf-8"))
                urlSchemeTask.didReceive(data)
                urlSchemeTask.didFinish()
            } catch { urlSchemeTask.didFailWithError(error) }
        }
        func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
    }
}

struct EditorTable: Identifiable { let id: String; let name: String }

final class EditorController: ObservableObject {
    @Published var currentFile: URL?
    @Published var recordPage = false
    @Published var tables: [EditorTable] = []
    @Published var selectedTable = ""
    weak var web: WKWebView?
    func manageTable(_ mode: String) {
        guard let web else { return }
        Task { @MainActor in
            _ = try? await web.callAsyncJavaScript("window.eidosManageTables?.(mode)", arguments:["mode":mode], in:nil, contentWorld:.page)
        }
    }
    func selectTable(_ id: String) {
        guard let web else { return }
        Task { @MainActor in
            _ = try? await web.callAsyncJavaScript("window.eidosSelectTable?.(id)", arguments:["id":id], in:nil, contentWorld:.page)
        }
    }
    var onUnavailable: (() -> Void)?
    @MainActor
    func savedFile() async throws -> URL {
        guard let web else { throw LocalError.message(tr("编辑器尚未就绪")) }
        _ = try await web.callAsyncJavaScript("if (!window.eidosFlush) throw new Error('编辑器尚未就绪'); await window.eidosFlush()", arguments: [:], in: nil, contentWorld: .page)
        guard self.web === web, let currentFile else { throw LocalError.message(tr("编辑器尚未就绪")) }
        return currentFile
    }
    func flush() {
        guard let web else { return }
        var task = UIBackgroundTaskIdentifier.invalid
        task = UIApplication.shared.beginBackgroundTask(withName: "Save editor") {
            if task != .invalid { UIApplication.shared.endBackgroundTask(task); task = .invalid }
        }
        web.callAsyncJavaScript("await window.eidosFlush?.()", arguments: [:], in: nil, in: .page, completionHandler: { _ in
            if task != .invalid { UIApplication.shared.endBackgroundTask(task); task = .invalid }
        })
    }
    func leave() {
        guard let web else { onUnavailable?(); return }
        web.evaluateJavaScript("typeof window.eidosLeave === 'function' ? (window.eidosLeave('back'), true) : false") { result, error in
            // An uninitialized or terminated WebView has no draft to flush.
            // A live editor owns departure and keeps save failures visible.
            if error != nil || result as? Bool != true { self.onUnavailable?() }
        }
    }
}
