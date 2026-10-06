import Foundation
import Network
import Security
import CryptoKit

struct PeerInvitation: Codable {
    let version: Int
    let url: String
    let fingerprint: String
    let ticket: String
    let space: String
    let name: String

    static func parse(_ code: String) throws -> PeerInvitation {
        let value = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard value.hasPrefix("eidos-peer:"), value.utf8.count <= 8192 else { throw LocalError.message(tr("请输入电脑显示的设备配对码")) }
        var encoded = String(value.dropFirst("eidos-peer:".count)).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
        guard let data = Data(base64Encoded: encoded) else { throw LocalError.message(tr("无效配对码")) }
        let invitation = try JSONDecoder().decode(Self.self, from: data)
        guard invitation.version == 1, invitation.fingerprint.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              invitation.ticket.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else { throw LocalError.message(tr("无效配对凭据")) }
        _ = try PeerTunnel.endpoint(invitation.url)
        return invitation
    }
}

struct PeerProfile: Codable {
    let url: String
    let fingerprint: String
    let token: String
    let name: String
    let space: String
    var spaceName: String? = nil
}

enum DeviceSecrets {
    static func load(_ key: String) throws -> Data? {
        var result: CFTypeRef?
        let status = SecItemCopyMatching([kSecClass: kSecClassGenericPassword, kSecAttrService: "space.eidos.ios.sync", kSecAttrAccount: key, kSecReturnData: true, kSecMatchLimit: kSecMatchLimitOne] as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw LocalError.message(tr("无法读取设备凭据（{0}）", status)) }
        return result as? Data
    }
    static func save(_ key: String, data: Data) throws {
        let query: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrService: "space.eidos.ios.sync", kSecAttrAccount: key]
        let updated = SecItemUpdate(query as CFDictionary, [kSecValueData: data] as CFDictionary)
        if updated == errSecSuccess { return }
        guard updated == errSecItemNotFound else { throw LocalError.message(tr("无法保存设备凭据（{0}）", updated)) }
        var entry = query; entry[kSecValueData] = data; entry[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let added = SecItemAdd(entry as CFDictionary, nil)
        guard added == errSecSuccess else { throw LocalError.message(tr("无法保存设备凭据（{0}）", added)) }
    }
    static func remove(_ key: String) throws {
        let status = SecItemDelete([kSecClass: kSecClassGenericPassword, kSecAttrService: "space.eidos.ios.sync", kSecAttrAccount: key] as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw LocalError.message(tr("无法移除设备凭据（{0}）", status)) }
    }
}

/// A loopback-only byte tunnel keeps credentials and Graft traffic inside pinned TLS.
/// Neither Bonjour metadata nor an IP address grants trust.
final class PeerTunnel {
    private let queue = DispatchQueue(label: "space.eidos.ios.peer")
    private let listener: NWListener
    private var connections: [UUID: (NWConnection, NWConnection)] = [:]
    private var port: UInt16 = 0
    private let onTransfer: (Int64, Int64) -> Void
    private var received: Int64 = 0
    private var sent: Int64 = 0
    private var reported = Date.distantPast
    var remoteURL: String { "graft+http://127.0.0.1:\(port)/peer/space" }
    var baseURL: String { "http://127.0.0.1:\(port)" }

    static func endpoint(_ text: String) throws -> (String, UInt16) {
        guard let url = URLComponents(string: text), url.scheme == "https", let host = url.host,
              let port = url.port, (1...65535).contains(port), url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil, url.path.isEmpty else { throw LocalError.message(tr("无效设备地址")) }
        let bytes = host.split(separator: ".").compactMap { UInt8($0) }
        guard bytes.count == 4, bytes[0] == 10 || bytes[0] == 127 || (bytes[0] == 192 && bytes[1] == 168) || (bytes[0] == 172 && (16...31).contains(bytes[1])) else { throw LocalError.message(tr("设备同步仅支持局域网 IPv4 地址")) }
        return (host, UInt16(port))
    }

    init(url: String, fingerprint: String, onTransfer: @escaping (Int64, Int64) -> Void = { _, _ in }) throws {
        self.onTransfer = onTransfer
        let (host, remotePort) = try Self.endpoint(url)
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        listener = try NWListener(using: parameters)
        let ready = DispatchSemaphore(value: 0)
        var failure: Error?
        listener.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready: self?.port = self?.listener.port?.rawValue ?? 0; ready.signal()
            case .failed(let error): failure = error; ready.signal()
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] local in
            guard let self else { local.cancel(); return }
            guard self.connections.count < 8 else { local.cancel(); return }
            let tls = NWProtocolTLS.Options()
            sec_protocol_options_set_min_tls_protocol_version(tls.securityProtocolOptions, .TLSv12)
            sec_protocol_options_set_verify_block(tls.securityProtocolOptions, { _, trust, complete in
                let value = sec_trust_copy_ref(trust).takeRetainedValue()
                guard let chain = SecTrustCopyCertificateChain(value) as? [SecCertificate], let certificate = chain.first else { complete(false); return }
                let digest = SHA256.hash(data: SecCertificateCopyData(certificate) as Data).map { String(format: "%02x", $0) }.joined()
                guard digest == fingerprint else { complete(false); return }
                SecTrustSetPolicies(value, SecPolicyCreateBasicX509())
                SecTrustSetAnchorCertificates(value, [certificate] as CFArray)
                SecTrustSetAnchorCertificatesOnly(value, true)
                complete(SecTrustEvaluateWithError(value, nil))
            }, self.queue)
            let remote = NWConnection(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: remotePort)!, using: NWParameters(tls: tls, tcp: NWProtocolTCP.Options()))
            let id = UUID(); self.connections[id] = (local, remote)
            let close = { [weak self] in self?.connections.removeValue(forKey: id); local.cancel(); remote.cancel() }
            local.stateUpdateHandler = { if case .failed = $0 { close() } }
            remote.stateUpdateHandler = { state in
                if case .failed = state { close() }
                if case .ready = state { self.pipe(local, remote, sending: true, close: close); self.pipe(remote, local, sending: false, close: close) }
            }
            local.start(queue: self.queue); remote.start(queue: self.queue)
            self.queue.asyncAfter(deadline: .now() + 180) { if self.connections[id] != nil { close() } }
        }
        listener.start(queue: queue)
        guard ready.wait(timeout: .now() + 10) == .success, port != 0 else { listener.cancel(); throw failure ?? LocalError.message(tr("无法建立设备连接")) }
    }
    private func pipe(_ source: NWConnection, _ destination: NWConnection, sending: Bool, close: @escaping () -> Void) {
        source.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, ended, error in
            if error != nil { close(); return }
            if let self, let data {
                if sending { self.sent += Int64(data.count) } else { self.received += Int64(data.count) }
                if Date().timeIntervalSince(self.reported) >= 0.25 { self.reported = Date(); self.onTransfer(self.received, self.sent) }
            }
            destination.send(content: data, isComplete: ended, completion: .contentProcessed { error in
                if error != nil || ended { close() } else { self?.pipe(source, destination, sending: sending, close: close) }
            })
        }
    }
    func close() { queue.sync { onTransfer(received, sent); listener.cancel(); connections.values.forEach { $0.0.cancel(); $0.1.cancel() }; connections.removeAll() } }
    deinit { listener.cancel() }

    func call(_ route: String, token: String, body: [String: Any] = [:], timeout: TimeInterval = 120) throws -> [String: Any] {
        var request = URLRequest(url: URL(string: baseURL + route)!)
        request.httpMethod = "POST"; request.timeoutInterval = timeout
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try SyncHTTP.request(request)
    }
}

final class SyncHTTP: NSObject, URLSessionTaskDelegate {
    private static let lock = NSLock()
    private static var sessions: [UUID: (String, URLSession)] = [:]
    private static var stopped = Set<String>()
    static func begin(_ identity: String) { lock.lock(); stopped.remove(identity); lock.unlock() }
    static func cancel(_ identity: String) {
        lock.lock(); stopped.insert(identity)
        let active = sessions.values.filter { $0.0 == identity }.map { $0.1 }
        lock.unlock()
        active.forEach { $0.invalidateAndCancel() }
    }
    static func end(_ identity: String) { lock.lock(); stopped.remove(identity); lock.unlock() }
    static func checkCancellation(_ identity: String?) throws {
        guard let identity else { return }
        lock.lock(); let cancelled = stopped.contains(identity); lock.unlock()
        if cancelled { throw URLError(.cancelled) }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    static func request(_ request: URLRequest) throws -> [String: Any] {
        let done = DispatchSemaphore(value: 0)
        var outcome: Result<[String: Any], Error> = .failure(LocalError.message(tr("请求超时")))
        let session = URLSession(configuration: .ephemeral, delegate: SyncHTTP(), delegateQueue: nil)
        let id = UUID()
        if let cancellation = Runtime.cancellation {
            lock.lock()
            if stopped.contains(cancellation) { lock.unlock(); session.invalidateAndCancel(); throw LocalError.message(tr("已停止")) }
            sessions[id] = (cancellation, session); lock.unlock()
        }
        defer { lock.lock(); sessions.removeValue(forKey: id); lock.unlock(); session.invalidateAndCancel() }
        session.dataTask(with: request) { data, response, error in
            defer { done.signal() }
            do {
                if let error { throw error }
                guard let response = response as? HTTPURLResponse else { throw LocalError.message(tr("服务响应无效")) }
                guard let data, data.count <= 4 * 1024 * 1024, let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw LocalError.message(tr("服务响应无效")) }
                guard (200...299).contains(response.statusCode) else { throw LocalError.message(value["error"] as? String ?? tr("服务请求失败（{0}）", response.statusCode)) }
                outcome = .success(value)
            } catch { outcome = .failure(error) }
        }.resume()
        guard done.wait(timeout: .now() + request.timeoutInterval + 5) == .success else { throw LocalError.message(tr("请求超时")) }
        return try outcome.get()
    }
}

enum PeerSync {
    static func saveDevice(_ profile: PeerProfile) throws {
        try DeviceSecrets.save("peer-device:" + profile.fingerprint, data: JSONEncoder().encode(profile))
        var fingerprints = UserDefaults.standard.stringArray(forKey: "peer-devices") ?? []
        if !fingerprints.contains(profile.fingerprint) { fingerprints.append(profile.fingerprint) }
        UserDefaults.standard.set(fingerprints, forKey: "peer-devices")
    }
    static func pairedDevices() throws -> [PeerProfile] {
        let catalog = try SpaceCatalog()
        var devices = try (UserDefaults.standard.stringArray(forKey: "peer-devices") ?? []).compactMap { fingerprint in
            try DeviceSecrets.load("peer-device:" + fingerprint).map { try JSONDecoder().decode(PeerProfile.self, from: $0) }
        }
        for entry in catalog.spaces {
            if let profile = try load(LocalSpace(root: catalog.root(entry))),
               !devices.contains(where: { $0.fingerprint == profile.fingerprint }) { devices.append(profile); try saveDevice(profile) }
        }
        return devices
    }
    static func forgetDevice(_ fingerprint: String, catalog supplied: SpaceCatalog? = nil) throws {
        let catalog = try supplied ?? SpaceCatalog()
        for entry in catalog.spaces {
            let space = try LocalSpace(root: catalog.root(entry))
            if try load(space)?.fingerprint == fingerprint { try DeviceSecrets.remove(key(space)) }
        }
        try DeviceSecrets.remove("peer-device:" + fingerprint)
        UserDefaults.standard.set((UserDefaults.standard.stringArray(forKey: "peer-devices") ?? []).filter { $0 != fingerprint }, forKey: "peer-devices")
    }
    static func availableSpaces(_ device: PeerProfile) throws -> [PeerProfile] {
        let connected = try reconnect(device, requireSpace: false)
        try saveDevice(connected)
        let tunnel = try PeerTunnel(url: connected.url, fingerprint: connected.fingerprint)
        defer { tunnel.close() }
        let result = try tunnel.call("/spaces", token: connected.token)
        return try (result["spaces"] as? [[String: Any]] ?? []).map { item in
            guard let id = item["id"] as? String, let url = item["url"] as? String else { throw LocalError.message(tr("电脑返回了无效 Space")) }
            _ = try PeerTunnel.endpoint(url)
            return PeerProfile(url: url, fingerprint: connected.fingerprint, token: connected.token, name: connected.name, space: id, spaceName: item["name"] as? String ?? id)
        }
    }
    static func key(_ space: LocalSpace) -> String { "peer:" + LocalSpace.storageIdentity(space.root) }
    static func downloadedProfile(_ space: LocalSpace, entry: SpaceEntry, catalog: SpaceCatalog, devices: [PeerProfile]) throws -> PeerProfile? {
        if let saved = try load(space) { return saved }
        // Reuse completed local data only after this computer is paired again.
        // The catalog carries identity, never the revoked connection credential.
        for device in devices {
            if let id = catalog.peerSpaceID(for: entry, fingerprint: device.fingerprint) {
                return PeerProfile(url: device.url, fingerprint: device.fingerprint, token: device.token,
                    name: device.name, space: id, spaceName: entry.name)
            }
        }
        return nil
    }
    static func load(_ space: LocalSpace) throws -> PeerProfile? {
        guard let data = try DeviceSecrets.load(key(space)) else { return nil }
        let profile = try JSONDecoder().decode(PeerProfile.self, from: data)
        if let device = try DeviceSecrets.load("peer-device:" + profile.fingerprint) {
            return PeerProfile(url: profile.url, fingerprint: profile.fingerprint, token: try JSONDecoder().decode(PeerProfile.self, from: device).token, name: profile.name, space: profile.space, spaceName: profile.spaceName)
        }
        return profile
    }
    static func download(_ profile: PeerProfile, progress: (String) -> Void) throws -> SpaceEntry {
        let catalog = try SpaceCatalog()
        let entry = try catalog.preparePeer(profile)
        let destination = try LocalSpace(root: catalog.root(entry))
        defer { _ = try? Runtime.call(destination.root, "graft:close"); _ = try? Runtime.call(destination.root, "close") }
        try sync(destination, profile: profile, progress: progress)
        try finalizeDownload(destination, progress: progress)
        // Reload at registration so other locally created Spaces stay intact.
        try SpaceCatalog().completePeer(profile, entry: entry)
        UserDefaults.standard.set(Date(), forKey: "peer-last-sync:" + LocalSpace.storageIdentity(destination.root))
        return entry
    }
    // Finalization checks paths only. File format and host capability checks
    // belong to opening a document, never the download's critical path.
    static func finalizeDownload(_ space: LocalSpace, progress: (String) -> Void) throws {
        progress("正在完成下载")
        let enumerator = FileManager.default.enumerator(at: space.root, includingPropertiesForKeys: [.isSymbolicLinkKey], options: [.skipsHiddenFiles])
        while let file = enumerator?.nextObject() as? URL {
            try SyncHTTP.checkCancellation(Runtime.cancellation)
            let values = try file.resourceValues(forKeys: [.isSymbolicLinkKey])
            guard values.isSymbolicLink != true else { throw LocalError.message(tr("下载包含不支持的符号链接")) }
        }
        UserDefaults.standard.removeObject(forKey: "peer-download-unsupported:" + LocalSpace.storageIdentity(space.root))
    }
    static func downloadWarnings(_ space: LocalSpace) -> [String] {
        UserDefaults.standard.stringArray(forKey: "peer-download-unsupported:" + LocalSpace.storageIdentity(space.root)) ?? []
    }
    static func sync(_ space: LocalSpace, profile: PeerProfile, progress: (String) -> Void) throws {
        guard try MergeReview.load(space) == nil else { throw LocalError.message(tr("请先完成或中止当前合并")) }
        progress(tr("正在查找已配对电脑"))
        let profile = try reconnect(profile)
        try DeviceSecrets.save(key(space), data: JSONEncoder().encode(profile))
        try saveDevice(profile)
        let tunnel = try PeerTunnel(url: profile.url, fingerprint: profile.fingerprint, onTransfer: Runtime.peerTransfer ?? { _, _ in })
        defer { tunnel.close() }
        // Saved remotes point at the previous tunnel's ephemeral loopback port.
        // Checkpoint and publish can hydrate history, so update it before either.
        _ = try Runtime.call(space.root, "graft:peerConfigure", ["url": tunnel.remoteURL, "token": profile.token])
        let status = try Runtime.call(space.root, "graft:status") as? [String: Any] ?? [:]
        let hasHead = (status["status"] as? [String: Any])?["current_head"] is String
        if hasHead {
            progress(tr("保存本机版本")); _ = try Runtime.call(space.root, "graft:checkpoint")
            progress("发送本机版本")
            _ = try Runtime.call(space.root, "graft:peerPublish", ["url": tunnel.remoteURL.replacingOccurrences(of: "/peer/space", with: "/peer/incoming"), "token": profile.token])
        }
        progress(tr("电脑正在合并版本"))
        let prepared = try tunnel.call("/sync", token: profile.token, body: ["incoming": hasHead])
        guard prepared["protocol"] as? Int == 2 else { throw LocalError.message(tr("请更新电脑端后再同步。本机文件已保留。")) }
        guard prepared["state"] as? String == "ready" else { throw LocalError.message(tr("双方版本已保留。请到电脑的「同步」处理冲突，完成后回到手机点击「同步」。")) }
        progress("获取清单")
        _ = try Runtime.call(space.root, "graft:peerFetch")
        progress("写入文件")
        let result = try Runtime.call(space.root, "graft:peerFastForward") as? [String: Any] ?? [:]
        guard result["outcome"] as? String != "needs_merge" else { throw LocalError.message(tr("电脑版本有新变化，本机文件已保留。请重新同步；如仍有冲突，请到电脑处理。")) }
    }
    static func reconnect(_ profile: PeerProfile, requireSpace: Bool = true) throws -> PeerProfile {
        let cancellation = Runtime.cancellation
        func verify(_ url: String) throws -> PeerProfile? {
            try SyncHTTP.checkCancellation(cancellation)
            do {
                let tunnel = try PeerTunnel(url: url, fingerprint: profile.fingerprint)
                defer { tunnel.close() }
                let result = try tunnel.call("/spaces", token: profile.token, timeout: 2)
                if !requireSpace {
                    return PeerProfile(url: url, fingerprint: profile.fingerprint, token: profile.token, name: profile.name, space: profile.space, spaceName: profile.spaceName)
                }
                let spaces = result["spaces"] as? [[String: Any]] ?? []
                guard let match = spaces.first(where: { $0["id"] as? String == profile.space }), let endpoint = match["url"] as? String else { return nil }
                _ = try PeerTunnel.endpoint(endpoint)
                return PeerProfile(url: endpoint, fingerprint: profile.fingerprint, token: profile.token, name: profile.name, space: profile.space, spaceName: profile.spaceName)
            } catch {
                try SyncHTTP.checkCancellation(cancellation)
                return nil
            }
        }
        if let connected = try verify(profile.url) { return connected }
        if let data = try DeviceSecrets.load("peer-device:" + profile.fingerprint) {
            let device = try JSONDecoder().decode(PeerProfile.self, from: data)
            if device.fingerprint == profile.fingerprint, device.url != profile.url,
               let connected = try verify(device.url) { return connected }
        }
        if let connected = try PeerDiscovery.find(profile, space: requireSpace ? profile.space : nil, verify: verify) { return connected }
        throw LocalError.message(tr("未找到已配对电脑，请确认同一局域网且电脑已开启此 Space 的设备同步"))
    }
}
