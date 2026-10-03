import SwiftUI
import WebKit
import UniformTypeIdentifiers

struct EditorView: UIViewRepresentable {
    let file: URL
    let dark: Bool
    let controller: EditorController
    let onLeave: () -> Void
    func makeCoordinator() -> Coordinator { Coordinator(file: file, dark: dark, onLeave: onLeave) }
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
        controller.onUnavailable = onLeave
        web.load(URLRequest(url: URL(string: "eidos://app/editor/index.html")!))
        return web
    }
    func updateUIView(_ web: WKWebView, context: Context) {}
    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "eidos", contentWorld: .page)
        coordinator.queue.async { _ = try? Runtime.call(coordinator.file, "close") }
    }
    final class Coordinator: NSObject, WKScriptMessageHandlerWithReply, WKURLSchemeHandler, WKNavigationDelegate {
        let file: URL
        let dark: Bool
        let onLeave: () -> Void
        let queue = LocalSpace.io
        weak var web: WKWebView?
        init(file: URL, dark: Bool, onLeave: @escaping () -> Void) { self.file = file; self.dark = dark; self.onLeave = onLeave }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
            guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.scheme == "eidos",
                  message.frameInfo.request.url?.host == "app",
                  let body = message.body as? [String: Any], let method = body["method"] as? String else {
                replyHandler(nil, "无效编辑器请求"); return
            }
            let params = body["params"] as? [String: Any] ?? [:]
            if method == "leave" { replyHandler(NSNull(), nil); onLeave(); return }
            if method == "keyboard.hide" { web?.endEditing(true); replyHandler(NSNull(), nil); return }
            if method == "openLink" {
                guard let text = params["url"] as? String, let url = URL(string: text), ["https", "http", "mailto"].contains(url.scheme ?? "") else { replyHandler(nil, "暂不支持此链接"); return }
                UIApplication.shared.open(url); replyHandler(NSNull(), nil); return
            }
            queue.async {
                do {
                    let result: Any
                    switch method {
                    case "init":
                        var document: [String: Any] = ["path":self.file.lastPathComponent,"kind":self.file.pathExtension.lowercased() == "eidos" ? "eidos" : "markdown", "dark":self.dark]
                        if document["kind"] as? String == "markdown" { document.merge(try DraftStore.shared.read(self.file)) { _, new in new } }
                        result = document
                    case "markdown.save":
                        guard self.file.pathExtension.lowercased() != "eidos", let text = params["text"] as? String, let digest = params["digest"] as? String else { throw LocalError.message("无效 Markdown 保存请求") }
                        result = try DraftStore.shared.save(self.file, text: text, digest: digest)
                    case "markdown.keepDraft":
                        guard self.file.pathExtension.lowercased() != "eidos", let text = params["text"] as? String, let digest = params["digest"] as? String else { throw LocalError.message("无效草稿") }
                        try DraftStore.shared.stage(self.file, text: text, digest: digest)
                        result = NSNull()
                    case "markdown.discardDraft":
                        guard self.file.pathExtension.lowercased() != "eidos" else { throw LocalError.message("无效草稿") }
                        try DraftStore.shared.discard(self.file)
                        result = NSNull()
                    case "runtime":
                        guard self.file.pathExtension.lowercased() == "eidos", let operation = params["method"] as? String else { throw LocalError.message("无效 Runtime 请求") }
                        guard !["create", "close"].contains(operation), !operation.hasPrefix("graft:") else { throw LocalError.message("不允许此操作") }
                        result = try Runtime.call(self.file, operation, params["request"] ?? [:])
                    default: throw LocalError.message("不支持的编辑器操作：\(method)")
                    }
                    DispatchQueue.main.async { replyHandler(result, nil) }
                } catch { DispatchQueue.main.async { replyHandler(nil, error.localizedDescription) } }
            }
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            decisionHandler(navigationAction.request.url?.absoluteString == "eidos://app/editor/index.html" ? .allow : .cancel)
        }
        func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
            do {
                guard let url = urlSchemeTask.request.url, url.host == "app" else { throw LocalError.message("无效资源") }
                let root: URL
                let path: String
                if url.path.hasPrefix("/editor/") {
                    guard let bundleRoot = Bundle.main.resourceURL else { throw LocalError.message("编辑器资源缺失") }
                    root = bundleRoot.appendingPathComponent("editor")
                    path = String(url.path.dropFirst("/editor/".count))
                } else if url.path.hasPrefix("/document/") {
                    root = file.deletingLastPathComponent()
                    path = String(url.path.dropFirst("/document/".count))
                    guard ["png", "jpg", "jpeg", "gif", "webp", "avif"].contains(URL(fileURLWithPath: path).pathExtension.lowercased()) else { throw LocalError.message("不支持的图片类型") }
                } else { throw LocalError.message("资源不存在") }
                let target = try LocalSpace.resource(path, under: root)
                if url.path.hasPrefix("/document/"), (try target.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max) > 16 * 1024 * 1024 {
                    throw LocalError.message("图片超过 16 MB")
                }
                let data = try Data(contentsOf: target)
                let mime = ["js":"application/javascript", "css":"text/css", "html":"text/html"][target.pathExtension] ?? UTType(filenameExtension: target.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
                urlSchemeTask.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: "utf-8"))
                urlSchemeTask.didReceive(data)
                urlSchemeTask.didFinish()
            } catch { urlSchemeTask.didFailWithError(error) }
        }
        func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
    }
}

final class EditorController: ObservableObject {
    weak var web: WKWebView?
    var onUnavailable: (() -> Void)?
    func leave() {
        guard let web else { onUnavailable?(); return }
        web.evaluateJavaScript("typeof window.eidosLeave === 'function' ? (window.eidosLeave('back'), true) : false") { result, error in
            // An uninitialized or terminated WebView has no draft to flush.
            // A live editor owns departure and keeps save failures visible.
            if error != nil || result as? Bool != true { self.onUnavailable?() }
        }
    }
}
