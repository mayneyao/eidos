import SwiftUI
import WebKit
import UniformTypeIdentifiers

struct PluginNavigationPage: Identifiable, Hashable {
    let plugin: String
    let view: String
    let title: String
    var id: String { plugin + ":" + view }
}

struct MobilePluginView: UIViewRepresentable {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var appLanguage = "system"
    @Environment(\.locale) private var appLocale
    let space: LocalSpace
    let dark: Bool
    let open: (URL) -> Void
    var pluginId: String? = nil
    var readme = false
    var viewId: String? = nil
    var filePath: String? = nil
    var showManager: () -> Void = {}
    func makeCoordinator() -> Coordinator { Coordinator(space:space,dark:dark,open:open,showManager:showManager) }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let launch = pluginId.map { id in
            if let viewId {
                var value = ["id": id, "view": viewId]
                if let filePath { value["path"] = filePath }
                return value
            }
            return ["id": id, "mode": readme ? "readme" : "tools"]
        }
        let launchJSON = launch.flatMap { try? JSONSerialization.data(withJSONObject:$0) }.map { String(decoding:$0,as:UTF8.self) } ?? "null"
        configuration.userContentController.addUserScript(WKUserScript(source:"window.eidosMobileIOS = window.webkit.messageHandlers.mobilePlugin; window.eidosMobileBoot = {token:'',dark:\(dark),launch:\(launchJSON)};",injectionTime:.atDocumentStart,forMainFrameOnly:true))
        configuration.userContentController.addScriptMessageHandler(context.coordinator,contentWorld:.page,name:"mobilePlugin")
        configuration.setURLSchemeHandler(context.coordinator,forURLScheme:"eidos")
        let web = WKWebView(frame:.zero,configuration:configuration)
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.navigationDelegate = context.coordinator
        context.coordinator.web = web
        web.load(URLRequest(url:URL(string:"eidos://app/editor/plugins.html")!))
        return web
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {
        uiView.evaluateJavaScript("window.eidosSetLocale?.('\(AppLanguage.locale)')", completionHandler: nil)
    }
    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        coordinator.closed = true
        coordinator.importReply?(nil,tr("页面已关闭")); coordinator.importReply = nil
        web.configuration.userContentController.removeScriptMessageHandler(forName:"mobilePlugin",contentWorld:.page)
        web.stopLoading()
    }
    final class Coordinator: NSObject, WKScriptMessageHandlerWithReply, WKURLSchemeHandler, WKNavigationDelegate, UIDocumentPickerDelegate {
        let service: MobilePluginService
        let dark: Bool
        let open: (URL) -> Void
        let showManager: () -> Void
        let queue = DispatchQueue(label:"space.eidos.ios.plugins")
        weak var web: WKWebView?
        var closed = false
        var importReply: ((Any?,String?) -> Void)?
        init(space: LocalSpace,dark: Bool,open: @escaping (URL) -> Void,showManager: @escaping () -> Void) {
            service = MobilePluginService(space:space); self.dark = dark; self.open = open; self.showManager = showManager
        }
        func webView(_ web: WKWebView,didFinish navigation: WKNavigation!) {
            guard web.url?.absoluteString == "eidos://app/editor/plugins.html" else { return }
            // ES modules can finish evaluating after WKWebView's navigation callback.
            // The trusted entry module starts itself once its dependencies are ready.
        }
        func userContentController(_ controller: WKUserContentController,didReceive message: WKScriptMessage,replyHandler: @escaping (Any?,String?) -> Void) {
            guard !closed, message.frameInfo.isMainFrame, message.frameInfo.request.url?.absoluteString == "eidos://app/editor/plugins.html",
                  let body = message.body as? [String:Any], let method = body["method"] as? String else { replyHandler(nil,tr("无效插件宿主请求")); return }
            let params = body["params"] as? [String:Any] ?? [:]
            if method == "readme.openLink" {
                guard let text = params["url"] as? String, let url = URL(string:text), ["https","http"].contains(url.scheme ?? "") else { replyHandler(nil,tr("不支持此链接")); return }
                UIApplication.shared.open(url); replyHandler(NSNull(),nil); return
            }
            if method == "manager.open" { showManager(); replyHandler(NSNull(),nil); return }
            if method == "import" {
                guard importReply == nil else { replyHandler(nil,tr("正在选择插件")); return }
                importReply = replyHandler
                let picker = UIDocumentPickerViewController(forOpeningContentTypes:[.data],asCopy:true)
                picker.delegate = self
                var presenter = web?.window?.rootViewController
                while let presented = presenter?.presentedViewController { presenter = presented }
                presenter?.present(picker,animated:true)
                return
            }
            queue.async {
                do {
                    if method == "openFile" {
                        guard let path = params["path"] as? String else { throw LocalError.message(tr("文件路径缺失")) }
                        let url = try self.service.space.checked(self.service.space.root.appendingPathComponent(path))
                        guard ["md","markdown","eidos"].contains(url.pathExtension.lowercased()) else { throw LocalError.message(tr("此文件请从资料页打开")) }
                        DispatchQueue.main.async { if !self.closed { self.open(url) }; replyHandler(NSNull(),nil) }
                    } else {
                        let result = try self.service.handle(method,params)
                        DispatchQueue.main.async { replyHandler(result,nil) }
                    }
                } catch { DispatchQueue.main.async { replyHandler(nil,error.localizedDescription) } }
            }
        }
        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { importReply?(nil,tr("已取消")); importReply = nil }
        func documentPicker(_ controller: UIDocumentPickerViewController,didPickDocumentsAt urls: [URL]) {
            guard let url = urls.first, let reply = importReply else { return }
            importReply = nil
            queue.async {
                let access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                do {
                    let prepared = try self.service.prepareImport(url)
                    DispatchQueue.main.async { reply(prepared,nil) }
                } catch { DispatchQueue.main.async { reply(nil,error.localizedDescription) } }
            }
        }
        func webView(_ web: WKWebView,decidePolicyFor action: WKNavigationAction,decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            let isMain = action.targetFrame?.isMainFrame ?? true
            decisionHandler(!isMain || action.request.url?.absoluteString == "eidos://app/editor/plugins.html" ? .allow : .cancel)
        }
        func webView(_ web: WKWebView,start task: WKURLSchemeTask) {
            do {
                guard let url = task.request.url, url.host == "app", url.path.hasPrefix("/editor/"),
                      let root = Bundle.main.resourceURL?.appendingPathComponent("editor") else { throw LocalError.message(tr("资源不存在")) }
                let file = try LocalSpace.resource(String(url.path.dropFirst("/editor/".count)),under:root)
                var data = try Data(contentsOf:file)
                if file.pathExtension == "html" {
                    data = Data(String(decoding: data, as: UTF8.self).replacingOccurrences(of: "__EIDOS_LOCALE__", with: AppLanguage.locale).utf8)
                }
                let mime = ["html":"text/html","js":"text/javascript","css":"text/css"][file.pathExtension] ?? "application/octet-stream"
                task.didReceive(URLResponse(url:url,mimeType:mime,expectedContentLength:data.count,textEncodingName:"utf-8"))
                task.didReceive(data); task.didFinish()
            } catch { task.didFailWithError(error) }
        }
        func webView(_ web: WKWebView,stop task: WKURLSchemeTask) {}
    }
}
