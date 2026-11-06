import SwiftUI

private final class CustomSyncOperation: @unchecked Sendable {
    let id = UUID().uuidString
    private let lock = NSLock()
    private var stopped = false
    var cancelled: Bool { lock.lock(); defer { lock.unlock() }; return stopped }
    func cancel() {
        lock.lock(); stopped = true; lock.unlock()
        SyncHTTP.cancel(id); _ = eidos_ios_cancellation(id, 1)
    }
}

struct CustomSyncView: View {
    let space: LocalSpace
    let spaceName: String
    let onChange: () -> Void
    let onDownloaded: (SpaceEntry) -> Void
    @State private var profile: CustomSyncProfile?
    @State private var origin = ""
    @State private var token = ""
    @State private var password = ""
    @State private var name = ""
    @State private var server: CustomSyncServer?
    @State private var savedServer: CustomSyncServer?
    @State private var repositories: [CustomSyncRepository] = []
    @State private var selected: CustomSyncRepository?
    @State private var busy = false
    @State private var message = ""
    @State private var error: String?
    @State private var operation: CustomSyncOperation?
    @State private var disconnect = false
    @State private var review: MergeReview?
    @State private var showingReview = false
    @State private var rawURL = ""
    @State private var rawToken = ""
    @State private var rawName = ""
    private var validatedServer: CustomSyncServer? {
        guard let server, (try? CustomSyncClient.normalizedOrigin(origin)) == server.origin,
              token.isEmpty || token == server.token else { return nil }
        return server
    }

    var body: some View {
        List {
            Section {
                Text(tr("连接你自己部署的 Graft 服务器，无需 Eidos 账号。服务器访问密钥与 Space 同步密码保存在此设备的 Keychain。"))
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            if let profile {
                Section(tr("当前 Space")) {
                    Text(spaceName.isEmpty ? space.root.lastPathComponent : spaceName).font(.headline)
                    Text(profile.url).font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
                    Label(profile.uuid == nil ? tr("普通 Graft 仓库") : tr("端到端加密"), systemImage: profile.uuid == nil ? "externaldrive" : "lock")
                        .font(.subheadline)
                    if profile.url.hasPrefix("http:") { insecureWarning }
                    Button(tr("立即同步"), systemImage: "arrow.triangle.2.circlepath") { perform { try CustomSync.sync(space) } }
                    if review != nil { Button(tr("检查并合并")) { showingReview = true } }
                    Button(tr("发送本机版本")) { perform { try CustomSync.sync(space, publish: true) } }
                    Text(tr("首次连接空仓库可发送本机版本。服务器已有更新时会拒绝覆盖，请使用立即同步。"))
                        .font(.caption).foregroundStyle(.secondary)
                    Button(tr("断开此 Space 的服务器连接"), role: .destructive) { disconnect = true }
                }.disabled(busy)
            }
            Section(tr("自定义服务器")) {
                TextField("https://graft.example.com", text: $origin)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .accessibilityLabel(tr("服务器地址")).accessibilityIdentifier("custom-server-origin")
                SecureField(savedServer?.origin == (try? CustomSyncClient.normalizedOrigin(origin)) ? tr("访问密钥（留空保留已保存密钥）") : tr("服务器访问密钥"), text: $token)
                    .textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("custom-server-token")
                if origin.lowercased().hasPrefix("http:") { insecureWarning }
                Button(tr("读取服务器 Spaces")) { readRepositories() }.accessibilityIdentifier("custom-server-load")
            }.disabled(busy)
            if let server = validatedServer {
                Section(tr("服务器 Spaces")) {
                    if repositories.isEmpty { Text(tr("服务器尚无 Space")).foregroundStyle(.secondary) }
                    ForEach(repositories) { repository in
                        Button {
                            selected = repository; name = repository.displayName; password = ""
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(repository.displayName)
                                    Text(repository.uuid == nil ? tr("普通 Graft 仓库") : tr("端到端加密")).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                if selected == repository { Image(systemName: "checkmark") }
                            }
                        }.tint(.primary)
                    }
                    if let selected {
                        TextField(tr("本机 Space 名称"), text: $name)
                        if selected.uuid != nil { SecureField(tr("此 Space 的同步密码"), text: $password).textInputAutocapitalization(.never).autocorrectionDisabled() }
                        Button(tr("下载为新 Space")) { download(selected, server: server) }.accessibilityIdentifier("custom-server-download")
                        if profile?.url == selected.url, selected.uuid != nil {
                            Button(tr("更新此 Space 的密钥与密码")) {
                                let entered = password
                                perform { try CustomSync.connectEncrypted(space, client: CustomSyncClient(origin: server.origin, token: server.token), repository: selected, password: entered) }
                            }
                        }
                    }
                }.disabled(busy)
                if profile == nil {
                    Section(tr("上传当前 Space")) {
                        TextField(tr("Space 名称"), text: $name)
                        SecureField(tr("设置此 Space 的同步密码"), text: $password).textInputAutocapitalization(.never).autocorrectionDisabled()
                        Text(tr("创建新的加密 Space 并上传本机文件。其他设备需要相同的同步密码。"))
                            .font(.caption).foregroundStyle(.secondary)
                        Button(tr("开启此 Space 同步")) { create(server) }.accessibilityIdentifier("custom-server-create")
                    }.disabled(busy)
                }
            }
            Section {
                DisclosureGroup(tr("高级：连接普通 Graft 仓库")) {
                    Text(tr("仅用于不使用 Eidos 加密仓库管理协议的服务器。输入完整仓库地址；不会发送 Eidos 账号凭据。"))
                        .font(.caption).foregroundStyle(.secondary)
                    TextField("https://graft.example.com/namespace/repository", text: $rawURL)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityLabel(tr("远程地址"))
                    SecureField(tr("访问令牌（可选）"), text: $rawToken).textInputAutocapitalization(.never).autocorrectionDisabled()
                    if rawURL.lowercased().contains("http://") { insecureWarning }
                    if profile?.uuid == nil {
                        Button(tr("保存当前 Space 的连接")) {
                            let url = rawURL, token = rawToken
                            perform { try CustomSync.connect(space, url: url, token: token) }
                        }
                    }
                    TextField(tr("本机 Space 名称"), text: $rawName)
                    Button(tr("下载为新 Space")) {
                        let url = rawURL, token = rawToken, name = rawName
                        perform {
                            let entry = try CustomSync.download(name: name, url: url, token: token, catalog: SpaceCatalog())
                            deliver { onDownloaded(entry) }
                        }
                    }
                    Text(tr("普通仓库更新凭据时需要重新输入令牌；留空会清除旧令牌。更换仓库前请先断开。"))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }.disabled(busy)
            if busy || error != nil || !message.isEmpty {
                Section {
                    if busy { ProgressView(tr("正在处理…")) }
                    if let error { Text(error).foregroundStyle(.red) }
                    else if !message.isEmpty { Text(message).foregroundStyle(.secondary) }
                }
            }
        }.listStyle(.insetGrouped)
            .navigationTitle(tr("自定义服务器")).navigationBarTitleDisplayMode(.inline)
            .toolbar { if busy { Button(tr("停止")) { operation?.cancel() } } }
            .task { load() }
            .onDisappear { operation?.cancel() }
            .alert(tr("断开此 Space 的服务器连接？"), isPresented: $disconnect) {
                Button(tr("取消"), role: .cancel) {}
                Button(tr("断开"), role: .destructive) { perform { try CustomSync.disconnect(space) } }
            } message: { Text(tr("本机文件和历史版本会保留。")) }
            .sheet(isPresented: $showingReview) {
                if let review { MergeReviewView(space: space, onFinish: { showingReview = false; load(); onChange() }, review: review) }
            }
    }
    private var insecureWarning: some View {
        Text(tr("HTTP 会明文传输服务器访问密钥和普通仓库内容。加密同步需要 HTTPS，HTTP 仅支持本机回环测试。"))
            .font(.caption).foregroundStyle(.secondary)
    }
    private func load() {
        LocalSpace.io.async {
            do {
                let saved = try CustomSync.profile(space), savedServer = try CustomSyncClient.savedServer(), merge = try MergeReview.load(space)
                DispatchQueue.main.async {
                    profile = saved; review = merge
                    if origin.isEmpty { origin = saved?.serverOrigin ?? savedServer?.origin ?? "" }
                    if name.isEmpty { name = spaceName.isEmpty ? space.root.lastPathComponent : spaceName }
                    if rawURL.isEmpty, saved?.uuid == nil { rawURL = saved?.url ?? "" }
                    self.savedServer = savedServer
                }
            } catch { DispatchQueue.main.async { self.error = error.localizedDescription } }
        }
    }
    private func readRepositories() {
        let enteredOrigin = origin, enteredToken = token
        perform(success: tr("服务器已连接，请选择 Space 或上传当前 Space")) {
            let saved = try CustomSyncClient.savedServer()
            let normalized = try CustomSyncClient.normalizedOrigin(enteredOrigin)
            let access = enteredToken.isEmpty && saved?.origin == normalized ? saved?.token ?? "" : enteredToken
            let client = try CustomSyncClient(origin: normalized, token: access)
            let listed = try client.repositories()
            try client.remember()
            deliver { server = client.server; savedServer = client.server; repositories = listed; selected = nil; token = "" }
        }
    }
    private func create(_ server: CustomSyncServer) {
        let enteredName = name, enteredPassword = password
        perform {
            let client = try CustomSyncClient(origin: server.origin, token: server.token)
            try CustomSync.create(space, client: client, displayName: enteredName, password: enteredPassword)
        }
    }
    private func download(_ repository: CustomSyncRepository, server: CustomSyncServer) {
        let enteredName = name, enteredPassword = password
        perform {
            let entry: SpaceEntry
            if repository.uuid != nil {
                entry = try CustomSync.downloadEncrypted(name: enteredName, client: CustomSyncClient(origin: server.origin, token: server.token), repository: repository, password: enteredPassword, catalog: SpaceCatalog())
            } else {
                entry = try CustomSync.download(name: enteredName, url: repository.url, token: server.token, catalog: SpaceCatalog())
            }
            deliver { onDownloaded(entry) }
        }
    }
    private func deliver(_ action: @escaping () -> Void) {
        let identity = Runtime.cancellation
        DispatchQueue.main.async {
            guard let operation, operation.id == identity, !operation.cancelled else { return }
            action()
        }
    }
    private func perform(success: String = tr("已完成，本机文件可离线使用"), _ action: @escaping () throws -> Void) {
        guard !busy else { return }
        let current = CustomSyncOperation()
        let secrets = [token, rawToken, password, profile?.token ?? "", profile?.password ?? "", server?.token ?? ""].filter { !$0.isEmpty }
        operation = current; busy = true; error = nil; message = ""
        SyncHTTP.begin(current.id); _ = eidos_ios_cancellation(current.id, 0)
        LocalSpace.io.async {
            Runtime.cancellation = current.id
            defer { Runtime.cancellation = nil; SyncHTTP.end(current.id); _ = eidos_ios_cancellation(current.id, 2) }
            var failure: Error?
            do { try SyncHTTP.checkCancellation(current.id); try action() } catch { failure = error }
            let next = try? CustomSync.profile(space), merge = try? MergeReview.load(space)
            let text = failure.map { error in secrets.reduce(error.localizedDescription) { $0.replacingOccurrences(of: $1, with: "••••") } }
            DispatchQueue.main.async {
                guard operation?.id == current.id else { return }
                profile = next; review = merge; busy = false; operation = nil; password = ""; rawToken = ""
                error = current.cancelled ? nil : text
                message = current.cancelled ? tr("已停止。本机文件已保留，可重新同步。") : text == nil ? success : ""
                if !current.cancelled { onChange() }
            }
        }
    }
}
