import Foundation
import CryptoKit
import Security
import AuthenticationServices
import UIKit

enum SyncEnvironment {
    #if DEBUG
    static let account = "https://staging.eidos.space"
    static let remote = "https://sync-staging.eidos.space"
    static let publish = "https://publish-staging.eidos.space"
    static let client = "ios.dev.eidos.space"
    #else
    static let account = "https://eidos.space"
    static let remote = "https://sync.eidos.space"
    static let publish = "https://publish.eidos.space"
    static let client = "ios.eidos.space"
    #endif
    static let callback = "space.eidos.ios://oauth/callback"
    static func validateRemote(_ text: String) throws {
        guard let url = URLComponents(string: text), url.scheme == "https", url.host == URL(string: remote)?.host,
              url.port == nil, url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              url.path.range(of: "^/[A-Za-z0-9_-]+/[A-Za-z0-9._-]+$", options: .regularExpression) != nil else { throw LocalError.message(tr("云端 Space 地址不属于当前环境")) }
    }
}

struct CloudProfile: Codable { let url: String; let subject: String }

/// Invoke on LocalSpace.io so refresh-token rotation and local file writes are serialized.
enum SyncAccount {
    private static let key = "account:" + SyncEnvironment.client
    private static let loginKey = "login:" + SyncEnvironment.client
    static func stored() throws -> [String: Any]? { try DeviceSecrets.load(key).map { try JSONSerialization.jsonObject(with: $0) as? [String: Any] ?? [:] } }
    private static func save(_ value: [String: Any]) throws { try DeviceSecrets.save(key, data: JSONSerialization.data(withJSONObject: value)) }
    static func signOut() throws { try DeviceSecrets.remove(key); try DeviceSecrets.remove(loginKey) }
    static func request(_ url: String, method: String = "GET", body: [String: Any]? = nil, token: String? = nil) throws -> [String: Any] {
        guard let target = URL(string: url), target.scheme == "https" else { throw LocalError.message(tr("无效服务地址")) }
        var request = URLRequest(url: target); request.httpMethod = method; request.timeoutInterval = 30
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        return try SyncHTTP.request(request)
    }
    private static func base64(_ data: Data) -> String { data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
    private static func random() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw LocalError.message(tr("无法生成登录凭据")) }
        return base64(Data(bytes))
    }
    static func beginLogin() throws -> URL {
        let discovery = try request(SyncEnvironment.account + "/api/auth/.well-known/openid-configuration")
        guard discovery["issuer"] as? String == SyncEnvironment.account,
              discovery["authorization_endpoint"] as? String == SyncEnvironment.account + "/api/auth/oauth2/authorize",
              discovery["token_endpoint"] as? String == SyncEnvironment.account + "/api/auth/oauth2/token",
              (discovery["code_challenge_methods_supported"] as? [String])?.contains("S256") == true else { throw LocalError.message(tr("账号服务配置不匹配")) }
        let state = try random(), verifier = try random()
        try DeviceSecrets.save(loginKey, data: JSONSerialization.data(withJSONObject: ["state": state, "verifier": verifier, "created": Date().timeIntervalSince1970]))
        var url = URLComponents(string: SyncEnvironment.account + "/api/auth/oauth2/authorize")!
        url.queryItems = ["client_id": SyncEnvironment.client, "redirect_uri": SyncEnvironment.callback, "response_type": "code", "scope": "openid profile email offline_access", "state": state, "code_challenge": base64(Data(SHA256.hash(data: Data(verifier.utf8)))), "code_challenge_method": "S256"].map { URLQueryItem(name: $0.key, value: $0.value) }
        return url.url!
    }
    private static func exchange(_ parameters: [String: String]) throws -> [String: Any] {
        var values = parameters; values["client_id"] = SyncEnvironment.client
        var components = URLComponents(); components.queryItems = values.map { URLQueryItem(name: $0.key, value: $0.value) }
        var request = URLRequest(url: URL(string: SyncEnvironment.account + "/api/auth/oauth2/token")!)
        request.httpMethod = "POST"; request.timeoutInterval = 30
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data((components.percentEncodedQuery ?? "").replacingOccurrences(of: "+", with: "%2B").utf8)
        var result = try SyncHTTP.request(request)
        guard let access = result["access_token"] as? String, !access.isEmpty,
              (result["token_type"] as? String ?? "Bearer").lowercased() == "bearer",
              let expires = result["expires_in"] as? Double, (1...31_536_000).contains(expires) else { throw LocalError.message(tr("账号服务返回无效凭证")) }
        result["expiresAt"] = Date().timeIntervalSince1970 + expires
        return result
    }
    static func finishLogin(_ url: URL) throws {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false), url.absoluteString.components(separatedBy: "?").first == SyncEnvironment.callback, components.fragment == nil,
              let data = try DeviceSecrets.load(loginKey), let pending = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let created = pending["created"] as? Double, (0...600).contains(Date().timeIntervalSince1970 - created) else { throw LocalError.message(tr("登录请求已过期")) }
        let items = components.queryItems ?? []
        guard items.filter({ $0.name == "state" }).count == 1, items.first(where: { $0.name == "state" })?.value == pending["state"] as? String else { throw LocalError.message(tr("登录校验失败")) }
        try DeviceSecrets.remove(loginKey)
        guard !items.contains(where: { $0.name == "error" }), items.filter({ $0.name == "code" }).count == 1,
              let code = items.first(where: { $0.name == "code" })?.value, !code.isEmpty,
              let verifier = pending["verifier"] as? String else { throw LocalError.message(tr("登录已取消或回调无效")) }
        var tokens = try exchange(["grant_type": "authorization_code", "code": code, "code_verifier": verifier, "redirect_uri": SyncEnvironment.callback])
        let user = try request(SyncEnvironment.account + "/api/auth/oauth2/userinfo", token: tokens["access_token"] as? String)
        guard let subject = user["sub"] as? String, !subject.isEmpty else { throw LocalError.message(tr("无法识别登录账号")) }
        tokens["subject"] = subject; tokens["name"] = user["email"] ?? user["name"] ?? subject
        try save(tokens)
    }
    static func accessToken(register: Bool = true) throws -> String {
        guard var value = try stored(), let subject = value["subject"] as? String else { throw LocalError.message(tr("请先登录 Eidos 账号")) }
        if (value["expiresAt"] as? Double ?? 0) <= Date().timeIntervalSince1970 + 60 {
            guard let refresh = value["refresh_token"] as? String, !refresh.isEmpty else { throw LocalError.message(tr("登录已过期，请重新登录")) }
            var next = try exchange(["grant_type": "refresh_token", "refresh_token": refresh])
            next["subject"] = subject; next["name"] = value["name"]
            if next["refresh_token"] == nil { next["refresh_token"] = refresh }
            try save(next); value = next
        }
        guard let access = value["access_token"] as? String else { throw LocalError.message(tr("无效账号凭据")) }
        if register {
            let defaults = UserDefaults.standard
            let id = defaults.string(forKey: "sync-device-id") ?? UUID().uuidString
            defaults.set(id, forKey: "sync-device-id")
            _ = try request(SyncEnvironment.account + "/api/sync/devices/register", method: "POST", body: ["stableDeviceId": id, "displayName": "iOS · Eidos", "platform": "unknown", "appVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0"], token: access)
        }
        return access
    }
    static func repositories() throws -> [[String: Any]] {
        let discovery = try request(SyncEnvironment.remote + "/.well-known/graft")
        guard discovery["service"] as? String == "eidos-graft-remote", discovery["version"] as? Int == 1,
              (discovery["authentication"] as? [String: Any])?["authority"] as? String == SyncEnvironment.account else { throw LocalError.message(tr("同步服务配置不匹配")) }
        return try request(SyncEnvironment.remote + "/api/graft/repositories", token: accessToken())["repositories"] as? [[String: Any]] ?? []
    }
    static func profileKey(_ space: LocalSpace) -> String { "cloud:" + LocalSpace.storageIdentity(space.root) }
    static func profile(_ space: LocalSpace) throws -> CloudProfile? { try DeviceSecrets.load(profileKey(space)).map { try JSONDecoder().decode(CloudProfile.self, from: $0) } }
    static func connect(_ space: LocalSpace, url: String, clone: Bool) throws {
        try SyncEnvironment.validateRemote(url)
        guard let subject = try stored()?["subject"] as? String else { throw LocalError.message(tr("请先登录")) }
        let token = try accessToken()
        if clone {
            guard try space.files().isEmpty, !FileManager.default.fileExists(atPath: space.root.appendingPathComponent(".graft").path) else { throw LocalError.message(tr("请在空 Space 中下载云端文件")) }
            _ = try Runtime.call(space.root, "graft:clone", ["url": url, "token": token])
        } else {
            _ = try Runtime.call(space.root, "graft:configureRemote", ["url": url, "token": token])
        }
        try DeviceSecrets.save(profileKey(space), data: JSONEncoder().encode(CloudProfile(url: url, subject: subject)))
    }
    static func sync(_ space: LocalSpace) throws {
        guard let profile = try profile(space), try stored()?["subject"] as? String == profile.subject else { throw LocalError.message(tr("请登录此 Space 所属账号")) }
        try SyncEnvironment.validateRemote(profile.url)
        guard try MergeReview.load(space) == nil else { throw LocalError.message(tr("请先处理当前合并")) }
        _ = try Runtime.call(space.root, "graft:clearCredentials")
        _ = try Runtime.call(space.root, "graft:configureRemote", ["url": profile.url, "token": accessToken()])
        _ = try Runtime.call(space.root, "graft:checkpoint")
        _ = try Runtime.call(space.root, "graft:fetch")
        try mergeFetched(space)
        _ = try Runtime.call(space.root, "graft:push")
    }
    static func mergeFetched(_ space: LocalSpace) throws {
        _ = try Runtime.call(space.root, "graft:beginMerge")
        if let pending = try MergeReview.load(space) {
            _ = try Runtime.call(space.root, "graft:mergeMetadata", ["stateToken": pending.token])
            if let review = try MergeReview.load(space) {
                guard review.unresolved == 0 else { throw LocalError.message(tr("双方版本已保留，请处理合并")) }
                _ = try Runtime.call(space.root, "graft:continueMerge", ["stateToken": review.token])
            }
        }
    }
}

final class AccountLogin: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
    func start(url: URL, completion: @escaping (Result<URL, Error>) -> Void) {
        session = ASWebAuthenticationSession(url: url, callbackURLScheme: "space.eidos.ios") { url, error in
            if let url { completion(.success(url)) } else { completion(.failure(error ?? LocalError.message(tr("登录已取消")))) }
        }
        session?.presentationContextProvider = self
        if session?.start() != true { completion(.failure(LocalError.message(tr("无法打开登录页面")))) }
    }
}
