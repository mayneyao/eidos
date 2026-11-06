import Foundation

struct CustomSyncProfile: Codable, Equatable {
    let url: String
    let token: String
    var serverOrigin: String? = nil
    var uuid: String? = nil
    var password: String? = nil
}

/// Call on LocalSpace.io. Account credentials never enter this path.
enum CustomSync {
    static func validatePassword(_ password: String) throws {
        guard (1...1024).contains(password.utf8.count) else { throw LocalError.message(tr("同步密码需要 1–1024 个 UTF-8 字节")) }
    }
    static func key(_ space: LocalSpace) -> String { "custom-sync:" + LocalSpace.storageIdentity(space.root) }
    static func pendingKey(_ space: LocalSpace) -> String { "custom-sync-pending:" + LocalSpace.storageIdentity(space.root) }
    static func pendingProfile(_ space: LocalSpace) throws -> CustomSyncProfile? {
        try DeviceSecrets.load(pendingKey(space)).map { try JSONDecoder().decode(CustomSyncProfile.self, from: $0) }
    }
    static func profile(_ space: LocalSpace) throws -> CustomSyncProfile? {
        try DeviceSecrets.load(key(space)).map { try JSONDecoder().decode(CustomSyncProfile.self, from: $0) }
    }
    static func normalizedURL(_ input: String) throws -> String {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "^graft\\+", with: "", options: .regularExpression)
        guard !text.contains(where: { $0.isWhitespace || $0.isNewline }),
              var parts = URLComponents(string: text), ["https", "http"].contains(parts.scheme?.lowercased() ?? ""),
              let host = parts.host, !host.isEmpty, parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil, parts.port.map({ (1...65535).contains($0) }) ?? true,
              !parts.path.isEmpty, parts.path != "/", !parts.path.split(separator: "/").contains(where: { $0 == "." || $0 == ".." }) else {
            throw LocalError.message(tr("请输入完整的 Graft 仓库 HTTP 或 HTTPS 地址，不含账号、查询或片段"))
        }
        parts.scheme = parts.scheme?.lowercased(); parts.host = host.lowercased()
        if (parts.scheme == "https" && parts.port == 443) || (parts.scheme == "http" && parts.port == 80) { parts.port = nil }
        parts.path = parts.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        parts.path = "/" + parts.path
        guard let value = parts.url?.absoluteString else { throw LocalError.message(tr("无效服务器地址")) }
        return value
    }
    static func transportURL(_ url: String) -> String { url.hasPrefix("http:") ? "graft+" + url : url }
    private static func plainRequest(url: String, token: String) -> [String: Any] {
        var value: [String: Any] = ["url": transportURL(url)]
        if !token.isEmpty { value["token"] = token }
        return value
    }
    static func origin(_ space: LocalSpace) throws -> String? {
        guard FileManager.default.fileExists(atPath: space.root.appendingPathComponent(".graft").path) else { return nil }
        let result = try Runtime.call(space.root, "graft:remotes") as? [String: Any]
        return (result?["remotes"] as? [[String: Any]])?.first { $0["name"] as? String == "origin" }?["url"] as? String
    }
    static func connect(_ space: LocalSpace, url: String, token: String) throws {
        let url = try normalizedURL(url)
        guard try SyncAccount.profile(space) == nil else { throw LocalError.message(tr("此 Space 已连接账号服务，请先断开原连接")) }
        guard try MergeReview.load(space) == nil else { throw LocalError.message(tr("请先处理当前合并")) }
        let previous = try profile(space)
        guard previous?.uuid == nil else { throw LocalError.message(tr("此 Space 使用加密同步，请在服务器 Spaces 中更新凭据")) }
        if let current = try origin(space) {
            guard (try? normalizedURL(current)) == url else { throw LocalError.message(tr("此 Space 已连接其他远端，请先断开原连接")) }
        }
        let next = CustomSyncProfile(url: url, token: token.trimmingCharacters(in: .whitespacesAndNewlines))
        // Save credentials before mutating the native connection. A failed native
        // operation restores the old profile and drops ephemeral credentials.
        try DeviceSecrets.save(key(space), data: JSONEncoder().encode(next))
        do {
            if try origin(space) != nil { _ = try Runtime.call(space.root, "graft:clearCredentials") }
            _ = try Runtime.call(space.root, "graft:configureRemote", plainRequest(url: url, token: next.token))
        } catch {
            _ = try? Runtime.call(space.root, "graft:close")
            if let previous { try DeviceSecrets.save(key(space), data: JSONEncoder().encode(previous)) }
            else { try DeviceSecrets.remove(key(space)) }
            throw error
        }
    }
    private static func authorize(_ space: LocalSpace) throws -> CustomSyncProfile {
        guard let saved = try profile(space) else { throw LocalError.message(tr("请先连接自定义服务器")) }
        let url = try normalizedURL(saved.url)
        guard let origin = try origin(space), (try? normalizedURL(origin)) == url else {
            throw LocalError.message(tr("远端配置已变化，请重新检查连接"))
        }
        if let uuid = saved.uuid, let password = saved.password, let server = saved.serverOrigin {
            let client = try CustomSyncClient(origin: server, token: saved.token)
            let repository = CustomSyncRepository(name: URL(string: url)?.lastPathComponent ?? "", displayName: "", url: url, uuid: uuid)
            guard try client.repositories().contains(where: { $0.url == url && $0.uuid == uuid }) else { throw LocalError.message(tr("服务器加密身份已变化，请检查连接")) }
            try client.verify(repository)
            _ = try Runtime.call(space.root, "graft:encryptedUnlock", encryptedRequest(space, profile: saved, password: password))
        } else {
            _ = try Runtime.call(space.root, "graft:clearCredentials")
            _ = try Runtime.call(space.root, "graft:configureRemote", plainRequest(url: url, token: saved.token))
        }
        return saved
    }
    private static func encryptedRequest(_ space: LocalSpace, profile: CustomSyncProfile, password: String) throws -> [String: Any] {
        guard let uuid = profile.uuid else { throw LocalError.message(tr("服务器加密身份不受支持")) }
        return ["url": profile.url, "token": profile.token, "uuid": uuid, "password": password,
                "stateDirectory": space.privateRoot.appendingPathComponent("encrypted-sync").appendingPathComponent(uuid).path]
    }
    static func connectEncrypted(_ space: LocalSpace, client: CustomSyncClient, repository: CustomSyncRepository, password: String, initialize: Bool = false) throws {
        try validatePassword(password)
        guard let uuid = repository.uuid, !password.isEmpty else { throw LocalError.message(tr("请输入此 Space 的同步密码")) }
        try requireEncryptedTransport(repository.url)
        guard try SyncAccount.profile(space) == nil else { throw LocalError.message(tr("此 Space 已连接账号服务，请先断开原连接")) }
        guard try MergeReview.load(space) == nil else { throw LocalError.message(tr("请先处理当前合并")) }
        if let previous = try profile(space) {
            guard previous.url == repository.url, previous.uuid == uuid else { throw LocalError.message(tr("此 Space 已连接其他远端，请先断开原连接")) }
        }
        if let current = try origin(space) {
            guard (try? normalizedURL(current)) == repository.url else { throw LocalError.message(tr("此 Space 已连接其他远端，请先断开原连接")) }
        }
        try client.verify(repository)
        let saved = CustomSyncProfile(url: repository.url, token: client.server.token, serverOrigin: client.server.origin, uuid: uuid, password: password)
        do {
            _ = try Runtime.call(space.root, initialize ? "graft:encryptedInitialize" : "graft:encryptedUnlock", encryptedRequest(space, profile: saved, password: password))
            try DeviceSecrets.save(key(space), data: JSONEncoder().encode(saved))
            if initialize { try DeviceSecrets.remove(pendingKey(space)) }
        } catch {
            _ = try? Runtime.call(space.root, "graft:close")
            throw error
        }
    }
    static func create(_ space: LocalSpace, client: CustomSyncClient, displayName: String, password: String) throws {
        let repository = try prepareInitialization(space, client: client, displayName: displayName, password: password)
        try connectEncrypted(space, client: client, repository: repository, password: password, initialize: true)
    }
    static func prepareInitialization(_ space: LocalSpace, client: CustomSyncClient, displayName: String, password: String) throws -> CustomSyncRepository {
        try validatePassword(password)
        guard !password.isEmpty else { throw LocalError.message(tr("请输入此 Space 的同步密码")) }
        guard try profile(space) == nil, try SyncAccount.profile(space) == nil else { throw LocalError.message(tr("此 Space 已连接其他远端，请先断开原连接")) }
        try requireEncryptedTransport(client.server.origin)
        guard !DraftStore.shared.hasDraft(under: space.root), !RecordDraftStore.hasDraft(space) else { throw LocalError.message(tr("请先保存或处理本地草稿")) }
        let pending = try pendingProfile(space)
        let repository: CustomSyncRepository
        if let pending {
            guard pending.serverOrigin == client.server.origin, pending.password == password else {
                throw LocalError.message(tr("请使用上次初始化的服务器和同步密码继续连接"))
            }
            if pending.uuid == nil {
                repository = try client.provision(displayName: displayName, name: URL(string: pending.url)?.lastPathComponent ?? "", resuming: true)
            } else {
                repository = CustomSyncRepository(name: URL(string: pending.url)?.lastPathComponent ?? "", displayName: displayName, url: pending.url, uuid: pending.uuid)
            }
        } else {
            guard try origin(space) == nil else { throw LocalError.message(tr("此 Space 已连接其他远端，请先断开原连接")) }
            _ = try Runtime.call(space.root, "graft:checkpoint")
            let name = UUID().uuidString.lowercased()
            let intent = CustomSyncProfile(url: client.server.origin + "/personal/" + name, token: client.server.token, serverOrigin: client.server.origin, password: password)
            try DeviceSecrets.save(pendingKey(space), data: JSONEncoder().encode(intent))
            repository = try client.provision(displayName: displayName, name: name)
        }
        let confirmed = CustomSyncProfile(url: repository.url, token: client.server.token, serverOrigin: client.server.origin, uuid: repository.uuid, password: password)
        try DeviceSecrets.save(pendingKey(space), data: JSONEncoder().encode(confirmed))
        return repository
    }
    static func requireEncryptedTransport(_ url: String) throws {
        let endpoint = URL(string: url)
        guard endpoint?.scheme == "https" || (endpoint?.scheme == "http" && ["localhost", "127.0.0.1", "::1", "[::1]"].contains(endpoint?.host ?? "")) else {
            throw LocalError.message(tr("加密同步需要 HTTPS；HTTP 仅支持本机回环测试。请为服务器配置 HTTPS。"))
        }
    }
    static func sync(_ space: LocalSpace, publish: Bool = false) throws {
        guard !DraftStore.shared.hasDraft(under: space.root), !RecordDraftStore.hasDraft(space) else {
            throw LocalError.message(tr("请先保存或处理本地草稿"))
        }
        guard try MergeReview.load(space) == nil else { throw LocalError.message(tr("请先处理当前合并")) }
        _ = try authorize(space)
        _ = try Runtime.call(space.root, "graft:checkpoint")
        if !publish {
            _ = try Runtime.call(space.root, "graft:fetch")
            try SyncAccount.mergeFetched(space)
        }
        _ = try Runtime.call(space.root, "graft:push")
    }
    static func disconnect(_ space: LocalSpace) throws {
        guard try MergeReview.load(space) == nil else { throw LocalError.message(tr("请先处理当前合并")) }
        guard let saved = try profile(space) else { return }
        if let current = try origin(space) {
            guard (try? normalizedURL(current)) == saved.url else { throw LocalError.message(tr("远端配置已变化，请重新检查连接")) }
            _ = try Runtime.call(space.root, "graft:disconnectRemote")
        }
        try DeviceSecrets.remove(key(space))
    }
    static func download(name: String, url: String, token: String, catalog: SpaceCatalog) throws -> SpaceEntry {
        let url = try normalizedURL(url)
        let entry = try catalog.prepareCustom(name: name, url: url)
        let space = try LocalSpace(root: catalog.root(entry))
        // Interrupted clones keep their isolated destination. Retry fetches and
        // applies the same remote; never point a clone at a visible local Space.
        if FileManager.default.fileExists(atPath: space.root.appendingPathComponent(".graft").path) {
            try connect(space, url: url, token: token)
            _ = try authorize(space)
            _ = try Runtime.call(space.root, "graft:fetch")
            let result = try Runtime.call(space.root, "graft:fastForward") as? [String: Any]
            guard result?["outcome"] as? String != "needs_merge" else { throw LocalError.message(tr("下载状态需要检查，本机 Space 未被替换")) }
        } else {
            guard try space.files().isEmpty else { throw LocalError.message(tr("下载目录已有文件，本机 Space 未被替换")) }
            _ = try Runtime.call(space.root, "graft:clone", plainRequest(url: url, token: token))
            try connect(space, url: url, token: token)
        }
        try catalog.completeCustom(url: url, entry: entry)
        return entry
    }
    static func downloadEncrypted(name: String, client: CustomSyncClient, repository: CustomSyncRepository, password: String, catalog: SpaceCatalog) throws -> SpaceEntry {
        try validatePassword(password)
        guard let uuid = repository.uuid, !password.isEmpty else { throw LocalError.message(tr("请输入此 Space 的同步密码")) }
        try requireEncryptedTransport(repository.url)
        try client.verify(repository)
        let entry = try catalog.prepareCustom(name: name, url: repository.url)
        let space = try LocalSpace(root: catalog.root(entry))
        let saved = CustomSyncProfile(url: repository.url, token: client.server.token, serverOrigin: client.server.origin, uuid: uuid, password: password)
        do {
            if FileManager.default.fileExists(atPath: space.root.appendingPathComponent(".graft").path) {
                try connectEncrypted(space, client: client, repository: repository, password: password)
                _ = try Runtime.call(space.root, "graft:fetch")
                let result = try Runtime.call(space.root, "graft:fastForward") as? [String: Any]
                guard result?["outcome"] as? String != "needs_merge" else { throw LocalError.message(tr("下载状态需要检查，本机 Space 未被替换")) }
            } else {
                guard try space.files().isEmpty else { throw LocalError.message(tr("下载目录已有文件，本机 Space 未被替换")) }
                _ = try Runtime.call(space.root, "graft:encryptedClone", encryptedRequest(space, profile: saved, password: password))
                try DeviceSecrets.save(key(space), data: JSONEncoder().encode(saved))
            }
            try catalog.completeCustom(url: repository.url, entry: entry)
            return entry
        } catch {
            _ = try? Runtime.call(space.root, "graft:close")
            throw error
        }
    }
}
