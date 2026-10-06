import SwiftUI

struct PublishView: View {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var appLanguage = "system"
    @Environment(\.locale) private var appLocale
    let space: LocalSpace
    let file: URL
    @Environment(\.dismiss) private var dismiss
    @State private var slug = ""
    @State private var access = "public"
    @State private var password = ""
    @State private var busy = false
    @State private var ready = false
    @State private var privateAccess = false
    @State private var subject = ""
    @State private var host = ""
    @State private var binding: [String: Any]?
    @State private var error: String?
    @State private var confirmation = false
    @State private var removing = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(file.lastPathComponent)
                    TextField(tr("发布路径"), text: $slug).autocorrectionDisabled().textInputAutocapitalization(.never).disabled(binding != nil)
                    Picker(tr("访问方式"), selection: $access) {
                        Text(tr("公开")).tag("public")
                        if privateAccess { Text(tr("私有")).tag("private"); Text(tr("密码访问")).tag("password") }
                    }
                    if access == "password" { SecureField(tr("访问密码"), text: $password) }
                    if let url = publicationURL { Link(tr("打开发布页面"), destination: url) }
                }
                if let error { Section { Text(error).foregroundStyle(.red); Button(tr("重新加载")) { load() } } }
                if busy { ProgressView(tr("正在处理发布…")) }
                Section {
                    Button(binding == nil ? tr("发布") : tr("更新发布")) { removing = false; confirmation = true }.disabled(!ready || slug.isEmpty || (access == "password" && password.isEmpty))
                    if binding != nil { Button(tr("取消发布"), role: .destructive) { removing = true; confirmation = true }.disabled(!ready) }
                }
            }.disabled(busy).navigationTitle(tr("发布")).navigationBarTitleDisplayMode(.inline)
                .toolbar { Button(tr("完成")) { dismiss() }.disabled(busy) }
                .interactiveDismissDisabled(busy).task { load() }
                .alert(removing ? tr("取消发布？") : tr("确认发布？"), isPresented: $confirmation) {
                    Button(tr("取消"), role: .cancel) {}
                    Button(tr("确认")) { publish() }
                } message: { Text(removing ? tr("线上页面将停止提供访问，本机文件保留。") : tr("将上传此文件及引用的附件。访问方式：{0}。", access == "public" ? tr("公开") : access == "private" ? tr("私有") : tr("密码访问"))) }
        }
    }
    private var publicationURL: URL? {
        guard binding != nil, !host.isEmpty else { return nil }
        return URL(string: "https://" + host)?.appendingPathComponent(slug)
    }
    private func bindingURL(_ subject: String) -> URL {
        let relative = String(file.path.dropFirst(space.root.path.count + 1))
        let key = LocalSpace.digest(Data((SyncEnvironment.publish + "\n" + subject + "\n" + relative).utf8))
        return space.privateRoot.appendingPathComponent("Publications").appendingPathComponent(key + ".json")
    }
    private func load() {
        guard !busy else { return }; busy = true; error = nil
        LocalSpace.io.async {
            do {
                guard let identity = try SyncAccount.stored()?["subject"] as? String else { throw LocalError.message(tr("请先在同步页面登录 Eidos 账号")) }
                let token = try SyncAccount.accessToken(register: false)
                let user = try SyncAccount.request(SyncEnvironment.account + "/api/publish/userinfo", token: token)
                guard user["sub"] as? String == identity, let grant = user["publish_access"] as? [String: Any], grant["state"] as? String == "active" else { throw LocalError.message(tr("当前账号暂时无法发布")) }
                guard file.pathExtension.lowercased() != "eidos" || grant["plan"] as? String != "free" else { throw LocalError.message(tr("发布 .eidos 文件需要 Publish Pro")) }
                let tenant = try SyncAccount.request(SyncEnvironment.publish + "/api/tenant", token: token)
                guard let host = tenant["canonicalHost"] as? String else { throw LocalError.message(tr("无法读取发布地址")) }
                let saved = try? Data(contentsOf: bindingURL(identity))
                let stored = saved.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
                DispatchQueue.main.async {
                    subject = identity; self.host = host; privateAccess = grant["privatePublications"] as? Bool == true
                    binding = stored; slug = stored?["slug"] as? String ?? file.deletingPathExtension().lastPathComponent
                    access = stored?["accessMode"] as? String ?? "public"; ready = true; busy = false
                }
            } catch { DispatchQueue.main.async { self.error = error.localizedDescription; busy = false; ready = false } }
        }
    }
    private func publish() {
        busy = true; error = nil
        let identity = subject, entered = slug, mode = access, secret = password, old = binding, remove = removing
        LocalSpace.io.async {
            do {
                guard try SyncAccount.stored()?["subject"] as? String == identity else { throw LocalError.message(tr("账号已改变，请重新打开发布页面")) }
                guard !DraftStore.shared.hasDraft(under: file) else { throw LocalError.message(tr("请先保存文件草稿")) }
                var request: [String: Any] = ["origin": SyncEnvironment.publish, "token": try SyncAccount.accessToken(register: false), "slug": entered, "access": mode, "password": secret, "path": String(file.path.dropFirst(space.root.path.count + 1)), "operationId": UUID().uuidString]
                if let id = old?["publicationId"] { request["publicationId"] = id }
                var failure: Error?
                var value: [String: Any]?
                do { value = try Runtime.call(space.root, remove ? "publish:unpublish" : "publish:publish", request) as? [String: Any] }
                catch {
                    failure = error
                    let progress = try? Runtime.call(space.root, "publish:progress") as? [String: Any]
                    value = progress?["publication"] as? [String: Any]
                }
                if var value, value["publicationId"] is String {
                    value["slug"] = entered
                    let path = bindingURL(identity)
                    try FileManager.default.createDirectory(at: path.deletingLastPathComponent(), withIntermediateDirectories: true)
                    try JSONSerialization.data(withJSONObject: value).write(to: path, options: .atomic)
                    DispatchQueue.main.async { binding = value }
                }
                if let failure { throw failure }
                DispatchQueue.main.async { busy = false; password = "" }
            } catch { DispatchQueue.main.async { busy = false; self.error = error.localizedDescription } }
        }
    }
}
