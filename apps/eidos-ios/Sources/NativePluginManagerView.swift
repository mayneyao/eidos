import SwiftUI
import WebKit
import UniformTypeIdentifiers

private struct ManagedPlugin: Identifiable {
    let manifest: [String:Any]
    let enabled: Bool
    var id: String { manifest["id"] as? String ?? "" }
    var name: String { manifest["name"] as? String ?? id }
    var version: String { manifest["version"] as? String ?? "" }
    var isTheme: Bool { manifest["kind"] as? String == "theme" }
}

private func pluginPermissions(_ manifest: [String:Any]) -> String {
    var lines = [tr("可读取所选文件或数据表。")]
    if let files = (manifest["workspace"] as? [String:Any])?["files"], files as? Bool == true || files is [String:Any] {
        lines.append(files as? Bool == true || (files as? [String:Any])?["write"] as? Bool == true ? tr("可读取和修改当前 Space 的普通文件。") : tr("可读取当前 Space 的普通文件。"))
    }
    if ["views","actions"].contains(where: { key in (manifest[key] as? [[String:Any]] ?? []).contains { $0["access"] as? String == "write" } }) {
        lines.append(tr("包含写入操作，可修改资料。"))
    }
    if manifest["connections"] != nil { lines.append(tr("可通过已配置的连接发送资料；密钥由本机保管。")) }
    let origins = (manifest["browser"] as? [String:Any])?["networkOrigins"] as? [String] ?? []
    lines += origins.isEmpty ? [tr("不允许联网")] : origins.map { tr("允许联网：") + $0 }
    return lines.joined(separator:"\n")
}

@MainActor
private final class NativePluginManagerModel: ObservableObject {
    @Published var installed: [ManagedPlugin] = []
    @Published var market: [[String:Any]] = []
    @Published var busy = false
    @Published var loadingMarket = false
    @Published var marketLoaded = false
    @Published var error: String?
    @Published var review: [String:Any]?
    private let service: MobilePluginService
    private let queue = DispatchQueue(label:"space.eidos.plugins.manager")
    private let validator = NativePluginValidator()
    init(space: LocalSpace) { service = MobilePluginService(space:space) }
    private func call(_ method: String, _ params: [String:Any] = [:]) async throws -> Any {
        try await withCheckedThrowingContinuation { continuation in
            queue.async {
                do { continuation.resume(returning:try self.service.handle(method,params)) }
                catch { continuation.resume(throwing:error) }
            }
        }
    }
    func refresh() async throws {
        installed = (try await call("list") as? [[String:Any]] ?? []).compactMap { record in
            guard let manifest = record["manifest"] as? [String:Any] else { return nil }
            return ManagedPlugin(manifest:manifest,enabled:record["enabled"] as? Bool == true)
        }
    }
    func run(_ operation: @escaping () async throws -> Void) {
        guard !busy else { return }; busy = true; error = nil
        Task {
            defer { busy = false }
            do { try await operation(); try await refresh() }
            catch { self.error = error.localizedDescription }
        }
    }
    func browse() {
        guard !loadingMarket else { return }; loadingMarket = true; error = nil
        Task {
            defer { loadingMarket = false }
            do { market = (try await call("market") as? [[String:Any]] ?? []).filter { $0["category"] as? String != "themes" }; marketLoaded = true }
            catch { self.error = error.localizedDescription }
        }
    }
    func prepare(id: String) {
        run { try await self.reviewPackage(try await self.call("prepare",["id":id])) }
    }
    func importFile(_ url: URL) {
        run {
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            let prepared: [String:Any] = try await withCheckedThrowingContinuation { continuation in
                self.queue.async {
                    do { continuation.resume(returning:try self.service.prepareImport(url)) }
                    catch { continuation.resume(throwing:error) }
                }
            }
            try await self.reviewPackage(prepared)
        }
    }
    private func reviewPackage(_ value: Any) async throws {
        guard let prepared = value as? [String:Any], let raw = prepared["raw"] as? String else { throw LocalError.message(tr("无效插件包")) }
        try await validator.validate(raw)
        review = prepared
    }
    func install() {
        guard let revision = review?["revision"] else { return }
        run { _ = try await self.call("install",["revision":revision]); self.review = nil }
    }
    func enable(_ plugin: ManagedPlugin, _ enabled: Bool) {
        run { _ = try await self.call("enable",["id":plugin.id,"enabled":enabled]) }
    }
    func uninstall(_ plugin: ManagedPlugin) {
        run { _ = try await self.call("uninstall",["id":plugin.id]) }
    }
}

struct NativePluginManagerView: View {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var appLanguage = "system"
    @Environment(\.locale) private var appLocale
    let space: LocalSpace
    let open: (URL) -> Void
    @StateObject private var model: NativePluginManagerModel
    @Environment(\.colorScheme) private var colorScheme
    @State private var importing = false
    @State private var enabling: ManagedPlugin?
    @State private var removing: ManagedPlugin?
    @State private var details: ManagedPlugin?
    @State private var readme: ManagedPlugin?
    @State private var opened: ManagedPlugin?
    @State private var detailAction: (plugin: ManagedPlugin, remove: Bool)?
    init(space: LocalSpace, open: @escaping (URL) -> Void) {
        self.space = space; self.open = open
        _model = StateObject(wrappedValue:NativePluginManagerModel(space:space))
    }
    @State private var discover = false
    @State private var query = ""
    @State private var category = "全部"
    var body: some View {
        VStack(spacing:0) {
            HStack(spacing:28) {
                tab(tr("发现"),market:true)
                tab(tr("已安装"),market:false)
                Spacer()
            }.padding(.horizontal,20)
            Divider()
            if model.busy || model.loadingMarket { ProgressView().frame(maxWidth:.infinity).padding(8) }
            if let error = model.error { Text(error).font(.caption).foregroundStyle(.red).padding(.horizontal,20) }
            ZStack {
                installedPane.opacity(discover ? 0 : 1).allowsHitTesting(!discover).accessibilityHidden(discover)
                marketPane.opacity(discover ? 1 : 0).allowsHitTesting(discover).accessibilityHidden(!discover)
            }
        }
        .accessibilityIdentifier("native-plugin-manager")
        .toolbar { ToolbarItem(placement:.topBarTrailing) {
            Menu {
                Button(tr("导入插件包"),systemImage:"square.and.arrow.down") { importing = true }
                Button(tr("检查更新"),systemImage:"arrow.clockwise") { discover = true; model.browse() }
            } label: { Image(systemName:"ellipsis") }.accessibilityLabel(tr("插件更多操作")).disabled(model.busy)
        } }
        .fileImporter(isPresented:$importing,allowedContentTypes:[.data]) { result in
            switch result { case .success(let url): model.importFile(url); case .failure(let error): model.error = error.localizedDescription }
        }
        .task { do { try await model.refresh() } catch { model.error = error.localizedDescription } }
        .sheet(isPresented:Binding(get:{ model.review != nil },set:{ if !$0 { model.review = nil } })) { reviewSheet }
        .sheet(item:$details,onDismiss:{
            guard let action = detailAction else { return }
            detailAction = nil
            if action.remove { removing = action.plugin } else { opened = action.plugin }
        }) { plugin in detailSheet(plugin) }
        .fullScreenCover(item:$opened,onDismiss:{ Task { try? await model.refresh() } }) { plugin in
            NavigationStack {
                MobilePluginView(space:space,dark:colorScheme == .dark,open:open,pluginId:plugin.id,showManager:{ opened = nil })
                    .navigationTitle(plugin.name).navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement:.cancellationAction) { Button(tr("返回")) { opened = nil } } }
            }
        }
        .fullScreenCover(item:$readme) { plugin in
            NavigationStack {
                MobilePluginView(space:space,dark:colorScheme == .dark,open:open,pluginId:plugin.id,readme:true)
                    .navigationTitle(plugin.name).navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement:.cancellationAction) { Button(tr("返回")) { readme = nil } } }
            }
        }
        .alert(tr("启用插件"),isPresented:Binding(get:{ enabling != nil },set:{ if !$0 { enabling = nil } })) {
            Button(tr("取消"),role:.cancel) { enabling = nil }
            Button(tr("启用")) { if let plugin = enabling { model.enable(plugin,true) }; enabling = nil }
        } message: { Text(enabling.map { pluginPermissions($0.manifest) } ?? "") }
        .alert(tr("卸载插件"),isPresented:Binding(get:{ removing != nil },set:{ if !$0 { removing = nil } })) {
            Button(tr("取消"),role:.cancel) { removing = nil }
            Button(tr("卸载"),role:.destructive) { if let plugin = removing { model.uninstall(plugin) }; removing = nil }
        } message: { Text(tr("将从此设备的所有 Space 移除该插件，本地资料不会被删除。")) }
    }
    private func tab(_ title: String, market: Bool) -> some View {
        Button {
            discover = market
            if market && !model.marketLoaded { model.browse() }
        } label: {
            VStack(spacing:13) {
                Text(title).font(.subheadline.weight(discover == market ? .semibold : .regular)).foregroundStyle(discover == market ? Color.primary : Color.secondary)
                Rectangle().fill(discover == market ? Color.primary : Color.clear).frame(height:2)
            }.fixedSize(horizontal:true,vertical:false).padding(.top,14)
        }.buttonStyle(.plain)
    }
    private func glyph(_ id: String) -> some View {
        let symbol = ["eidos.markmap":"point.3.connected.trianglepath.dotted","eidos.chart":"chart.bar","eidos.map":"map","eidos.journals":"book.closed","eidos.smart-actions":"bolt"][id] ?? "puzzlepiece.extension"
        return Image(systemName:symbol).font(.system(size:24,weight:.regular)).frame(width:40,height:40).foregroundStyle(.primary).accessibilityHidden(true)
    }
    private var installedPane: some View {
        ScrollView {
            LazyVStack(alignment:.leading,spacing:0) {
                Text(tr("当前 Space")).font(.subheadline.weight(.semibold)).padding(.top,20)
                Text(tr("开关仅影响当前 Space")).font(.caption).foregroundStyle(.secondary).padding(.top,4).padding(.bottom,14)
                if model.installed.isEmpty {
                    Text(tr("还没有安装插件")).font(.headline).padding(.top,24)
                    Text(tr("从发现页选择插件，或导入本地插件包。")).font(.subheadline).foregroundStyle(.secondary).padding(.vertical,8)
                    Button(tr("浏览插件市场")) { discover = true; if !model.marketLoaded { model.browse() } }
                }
                ForEach(model.installed) { plugin in
                    HStack(spacing:12) {
                        Button { readme = plugin } label: {
                            HStack(spacing:12) {
                                glyph(plugin.id)
                                VStack(alignment:.leading,spacing:4) {
                                    Text(plugin.name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                                    Text(plugin.isTheme ? tr("移动端不支持主题") : plugin.manifest["description"] as? String ?? tr("文件视图与工具")).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                                    Text(plugin.version).font(.caption2).foregroundStyle(.secondary)
                                }.frame(maxWidth:.infinity,alignment:.leading)
                            }.padding(.vertical,20).contentShape(Rectangle())
                        }.buttonStyle(.plain)
                        Button { details = plugin } label: { Image(systemName:"ellipsis").frame(width:44,height:44) }.accessibilityLabel(tr("管理 ") + plugin.name).buttonStyle(.plain)
                        Toggle(tr("启用 ") + plugin.name,isOn:Binding(get:{ plugin.enabled },set:{ value in
                            if value { enabling = plugin } else { model.enable(plugin,false) }
                        })).labelsHidden().accessibilityLabel(tr("启用 ") + plugin.name).disabled(model.busy || plugin.isTheme).tint(.primary)
                    }
                    Divider()
                }
            }.padding(.horizontal,20).padding(.bottom,24)
        }
    }
    private func categoryName(_ entry: [String:Any]) -> String {
        ["knowledge-and-writing":"知识记录","data-visualization":"数据视图","automation":"自动化"][entry["category"] as? String ?? ""] ?? "其他"
    }
    private var marketPane: some View {
        VStack(spacing:0) {
            HStack(spacing:10) {
                Image(systemName:"magnifyingglass").foregroundStyle(.secondary)
                TextField(tr("搜索插件"),text:$query).autocorrectionDisabled()
                if !query.isEmpty { Button { query = "" } label: { Image(systemName:"xmark.circle.fill").foregroundStyle(.secondary) }.accessibilityLabel(tr("清空插件搜索")) }
            }.padding(12).background(Color.primary.opacity(0.045),in:RoundedRectangle(cornerRadius:12)).padding(.horizontal,20).padding(.vertical,14)
            ScrollView(.horizontal,showsIndicators:false) {
                HStack(spacing:8) {
                    ForEach(["全部","知识记录","数据视图","自动化","其他"],id:\.self) { title in
                        Button { category = title } label: {
                            Text(tr(title)).font(.caption.weight(category == title ? .semibold : .regular)).padding(.horizontal,12).padding(.vertical,9)
                                .background(category == title ? Color.primary.opacity(0.09) : Color.clear,in:Capsule())
                                .overlay(Capsule().strokeBorder(Color.primary.opacity(0.1)))
                        }.buttonStyle(.plain).accessibilityAddTraits(category == title ? .isSelected : [])
                    }
                }.padding(.horizontal,20)
            }
            ScrollView {
                let matches = model.market.filter { entry in
                    (category == "全部" || categoryName(entry) == category) && (query.isEmpty || ((entry["name"] as? String ?? "") + " " + (entry["description"] as? String ?? "")).localizedCaseInsensitiveContains(query))
                }
                LazyVStack(alignment:.leading,spacing:0) {
                    Text(tr("{0} 个插件", matches.count)).font(.caption2).foregroundStyle(.secondary).padding(.vertical,20)
                    if model.marketLoaded && matches.isEmpty { Text(tr("没有匹配的插件")).font(.subheadline).foregroundStyle(.secondary).padding(.vertical,24) }
                    ForEach(matches.indices,id:\.self) { index in
                        let entry = matches[index]
                        HStack(spacing:12) {
                            glyph(entry["id"] as? String ?? "")
                            VStack(alignment:.leading,spacing:4) {
                                Text(entry["name"] as? String ?? tr("插件")).font(.subheadline.weight(.semibold))
                                Text(entry["description"] as? String ?? "").font(.caption).foregroundStyle(.secondary).lineLimit(2)
                                Text(tr(categoryName(entry)) + " · " + (entry["version"] as? String ?? "")).font(.caption2).foregroundStyle(.secondary)
                            }.frame(maxWidth:.infinity,alignment:.leading)
                                .contentShape(Rectangle()).onTapGesture { readme = ManagedPlugin(manifest:entry,enabled:false) }
                                .accessibilityAddTraits(.isButton)
                            Button(marketAction(entry)) { model.prepare(id:entry["id"] as? String ?? "") }.buttonStyle(.bordered).tint(.primary).disabled(model.busy || marketAction(entry) == tr("已安装"))
                        }.padding(.vertical,20)
                        Divider()
                    }
                    if model.error != nil { Button(tr("重试")) { model.browse() }.padding(.vertical,16) }
                }.padding(.horizontal,20).padding(.bottom,24)
            }
        }
    }
    private func marketAction(_ entry: [String:Any]) -> String {
        guard let plugin = model.installed.first(where:{ $0.id == entry["id"] as? String }) else { return tr("安装") }
        return plugin.version == entry["version"] as? String ? tr("已安装") : tr("更新")
    }
    private var reviewSheet: some View {
        NavigationStack {
            let manifest = model.review?["manifest"] as? [String:Any] ?? [:]
            Form {
                Section { Text(manifest["name"] as? String ?? tr("插件")); Text(manifest["version"] as? String ?? ""); Text(model.review?["origin"] as? String ?? "") }
                Section(tr("权限")) { Text(pluginPermissions(manifest)) }
                Section { Text(tr("安装后将在发起安装的 Space 启用。更新后需重新在其他 Space 启用。")) }
                if let error = model.error { Text(error).foregroundStyle(.red) }
                Button(tr("安装")) { model.install() }.disabled(model.busy)
            }.navigationTitle(tr("确认安装")).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement:.cancellationAction) { Button(tr("取消")) { model.review = nil }.disabled(model.busy) } }
        }.interactiveDismissDisabled(model.busy)
    }
    private func detailSheet(_ plugin: ManagedPlugin) -> some View {
        NavigationStack {
            Form {
                Section { Text(plugin.manifest["description"] as? String ?? ""); Text(plugin.id + " · " + plugin.version).font(.caption) }
                Section(tr("权限")) { Text(pluginPermissions(plugin.manifest)) }
                if plugin.enabled { Button(tr("打开插件")) { detailAction = (plugin,false); details = nil } }
                Button(tr("卸载插件"),role:.destructive) { detailAction = (plugin,true); details = nil }
            }.navigationTitle(plugin.name).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement:.cancellationAction) { Button(tr("关闭")) { details = nil } } }
        }.presentationDetents([.medium,.large])
    }
}

/** Validates package source with the shared parser without displaying or running a plugin. */
final class NativePluginValidator: NSObject, WKURLSchemeHandler, WKNavigationDelegate {
    private var web: WKWebView?
    private var reply: CheckedContinuation<Void,Error>?
    private var raw = ""
    private var timeout: DispatchWorkItem?
    @MainActor func validate(_ raw: String) async throws {
        try await withCheckedThrowingContinuation { continuation in
            self.raw = raw; reply = continuation
            let configuration = WKWebViewConfiguration()
            configuration.websiteDataStore = .nonPersistent()
            configuration.setURLSchemeHandler(self,forURLScheme:"eidos")
            let web = WKWebView(frame:.zero,configuration:configuration)
            self.web = web; web.navigationDelegate = self
            let timeout = DispatchWorkItem { [weak self] in self?.finish(.failure(LocalError.message(tr("插件校验超时")))) }
            self.timeout = timeout; DispatchQueue.main.asyncAfter(deadline:.now()+30,execute:timeout)
            web.load(URLRequest(url:URL(string:"eidos://app/editor/plugins.html")!))
        }
    }
    private func finish(_ result: Result<Void,Error>) {
        let reply = self.reply; self.reply = nil
        timeout?.cancel(); timeout = nil; web?.stopLoading(); web = nil; raw = ""
        reply?.resume(with:result)
    }
    func webView(_ web: WKWebView,didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            do {
                _ = try await web.callAsyncJavaScript("if (!window.eidosMobileValidate) await new Promise(resolve => addEventListener('eidos-mobile-ready',resolve,{once:true})); window.eidosMobileValidate(raw); return true;",arguments:["raw":raw],in:nil,contentWorld:.page)
                finish(.success(()))
            } catch { finish(.failure(error)) }
        }
    }
    func webView(_ web: WKWebView,didFailProvisionalNavigation navigation: WKNavigation!,withError error: Error) { finish(.failure(error)) }
    func webView(_ web: WKWebView,start task: WKURLSchemeTask) {
        do {
            guard let url = task.request.url, url.host == "app", url.path.hasPrefix("/editor/"), let root = Bundle.main.resourceURL?.appendingPathComponent("editor") else { throw LocalError.message(tr("资源不存在")) }
            let file = try LocalSpace.resource(String(url.path.dropFirst("/editor/".count)),under:root)
            let data = try Data(contentsOf:file)
            let mime = ["html":"text/html","js":"text/javascript","css":"text/css"][file.pathExtension] ?? "application/octet-stream"
            task.didReceive(URLResponse(url:url,mimeType:mime,expectedContentLength:data.count,textEncodingName:"utf-8")); task.didReceive(data); task.didFinish()
        } catch { task.didFailWithError(error) }
    }
    func webView(_ web: WKWebView,stop task: WKURLSchemeTask) {}
}
