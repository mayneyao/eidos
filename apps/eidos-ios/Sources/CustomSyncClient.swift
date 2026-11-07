import Foundation

struct CustomSyncRepository: Identifiable, Equatable {
    var id: String { url }
    let name: String
    let displayName: String
    let url: String
    let uuid: String?
}

struct CustomSyncServer: Codable, Equatable {
    let origin: String
    let token: String
}

/// Desktop-compatible personal Graft management. Never follows redirects or
/// reads Eidos account credentials. Only same-origin server URLs are accepted.
struct CustomSyncClient {
    let server: CustomSyncServer
    private let send: (URLRequest) throws -> [String: Any]
    static let serverKey = "custom-sync-server"
    static func savedServer() throws -> CustomSyncServer? {
        try DeviceSecrets.load(serverKey).map { try JSONDecoder().decode(CustomSyncServer.self, from: $0) }
    }
    static func normalizedOrigin(_ input: String) throws -> String {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.contains(where: { $0.isWhitespace }), let value = URLComponents(string: text),
              ["http", "https"].contains(value.scheme?.lowercased() ?? ""), let host = value.host, !host.isEmpty,
              value.user == nil, value.password == nil, value.query == nil, value.fragment == nil,
              value.path.isEmpty || value.path == "/", value.port.map({ (1...65535).contains($0) }) ?? true else {
            throw LocalError.message(tr("请输入服务器 HTTP 或 HTTPS 地址，不含路径、账号或查询"))
        }
        var result = value; result.scheme = value.scheme?.lowercased(); result.host = host.lowercased(); result.path = ""
        if (result.scheme == "https" && result.port == 443) || (result.scheme == "http" && result.port == 80) { result.port = nil }
        guard let origin = result.url?.absoluteString else { throw LocalError.message(tr("无效服务器地址")) }
        return origin
    }
    init(origin: String, token: String, send: @escaping (URLRequest) throws -> [String: Any] = { try SyncHTTP.request($0) }) throws {
        let token = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (32...512).contains(token.count), !token.unicodeScalars.contains(where: { CharacterSet.whitespacesAndNewlines.contains($0) || CharacterSet.controlCharacters.contains($0) }) else {
            throw LocalError.message(tr("请输入服务器访问密钥（至少 32 个字符）"))
        }
        server = CustomSyncServer(origin: try Self.normalizedOrigin(origin), token: token)
        self.send = send
    }
    private func request(_ path: String, method: String = "GET", body: [String: Any]? = nil, authenticated: Bool = true) throws -> [String: Any] {
        guard path.hasPrefix("/"), !path.hasPrefix("//"), let url = URL(string: server.origin + path),
              var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw LocalError.message(tr("服务器返回不可信地址"))
        }
        parts.path = ""; parts.query = nil; parts.fragment = nil
        guard parts.url?.absoluteString == server.origin else { throw LocalError.message(tr("服务器返回不可信地址")) }
        var request = URLRequest(url: url); request.httpMethod = method; request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("1", forHTTPHeaderField: "Graft-Protocol")
        if authenticated { request.setValue("Bearer " + server.token, forHTTPHeaderField: "Authorization") }
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        do { return try send(request) }
        catch { throw LocalError.message(error.localizedDescription.replacingOccurrences(of: server.token, with: "••••")) }
    }
    func discover() throws {
        let result = try request("/.well-known/graft", authenticated: false)
        let auth = result["authentication"] as? [String: Any], management = result["management"] as? [String: Any]
        guard result["protocol"] as? String == "graft-remote", result["version"] as? Int == 1,
              result["remote_url_template"] as? String == server.origin + "/personal/{repository}",
              auth?["scheme"] as? String == "bearer", auth?["authority"] as? String == server.origin,
              management?["repositories"] as? String == server.origin + "/api/graft/repositories" else {
            throw LocalError.message(tr("服务器协议不兼容或发现信息不可信"))
        }
    }
    static func validName(_ value: String) -> Bool {
        value.range(of: "^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$", options: .regularExpression) != nil
    }
    static func encryptionUUID(_ value: Any?) throws -> String? {
        guard let value, !(value is NSNull) else { return nil }
        guard let encryption = value as? [String: Any], encryption["profile"] as? String == "encrypted-remote-v1",
              encryption["version"] as? Int == 1, encryption["suite"] as? Int == 1,
              let uuid = encryption["uuid"] as? String,
              uuid.range(of: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", options: .regularExpression) != nil else {
            throw LocalError.message(tr("服务器加密身份不受支持"))
        }
        return uuid
    }
    func repositories() throws -> [CustomSyncRepository] {
        try discover()
        let result = try request("/api/graft/repositories")
        guard result["namespace"] as? String == "personal", let items = result["repositories"] as? [[String: Any]] else {
            throw LocalError.message(tr("服务器仓库列表无效"))
        }
        let repositories = try items.map { item -> CustomSyncRepository in
            guard let name = item["name"] as? String, Self.validName(name),
                  let url = item["remote_url"] as? String, url == server.origin + "/personal/" + name,
                  let displayName = (item["display_name"] ?? item["name"]) as? String, !displayName.isEmpty, displayName.count <= 80,
                  !displayName.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else {
                throw LocalError.message(tr("服务器仓库列表无效"))
            }
            return CustomSyncRepository(name: name, displayName: displayName, url: url, uuid: try Self.encryptionUUID(item["encryption"]))
        }
        guard Set(repositories.map(\.url)).count == repositories.count else { throw LocalError.message(tr("服务器仓库列表无效")) }
        return repositories
    }
    func verify(_ repository: CustomSyncRepository) throws {
        guard Self.validName(repository.name), repository.url == server.origin + "/personal/" + repository.name else { throw LocalError.message(tr("服务器返回不可信地址")) }
        try discover()
        let value = try request("/personal/" + repository.name)
        guard value["protocol"] as? String == "graft-remote", value["version"] as? Int == 1,
              try Self.encryptionUUID(value["encryption"]) == repository.uuid, repository.uuid != nil else {
            throw LocalError.message(tr("服务器加密身份已变化，请检查连接"))
        }
    }
    func provision(displayName: String, name: String, resuming: Bool = false) throws -> CustomSyncRepository {
        let displayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !displayName.isEmpty, displayName.count <= 80, !displayName.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else {
            throw LocalError.message(tr("Space 名称需要 1–80 个字符"))
        }
        try discover()
        guard UUID(uuidString: name) != nil, Self.validName(name) else { throw LocalError.message(tr("服务器返回不可信地址")) }
        let value = try request("/api/graft/repositories/" + name, method: "PUT", body: ["display_name": displayName, "encryption": "encrypted-remote-v1"])
        guard let created = value["created"] as? Bool, (created || resuming), value["namespace"] as? String == "personal", value["repository"] as? String == name,
              value["remote_url"] as? String == server.origin + "/personal/" + name,
              let uuid = try Self.encryptionUUID(value["encryption"]) else { throw LocalError.message(tr("服务器未创建新的加密仓库")) }
        let repository = CustomSyncRepository(name: name, displayName: displayName, url: server.origin + "/personal/" + name, uuid: uuid)
        try verify(repository)
        return repository
    }
    func remember() throws { try DeviceSecrets.save(Self.serverKey, data: JSONEncoder().encode(server)) }
}
