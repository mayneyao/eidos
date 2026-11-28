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
    var urls: [String]? = nil

    var candidates: [String] {
        var seen = Set<String>()
        return ([url] + (urls ?? [])).filter { seen.insert($0).inserted }
    }

    static func parse(_ code: String) throws -> PeerInvitation {
        let value = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard value.hasPrefix("eidos-peer:"), value.utf8.count <= 8192 else { throw LocalError.message(tr("请输入电脑显示的设备配对码")) }
        var encoded = String(value.dropFirst("eidos-peer:".count)).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
        guard let data = Data(base64Encoded: encoded) else { throw LocalError.message(tr("无效配对码")) }
        let invitation = try JSONDecoder().decode(Self.self, from: data)
        guard invitation.version == 1, invitation.fingerprint.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              invitation.ticket.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else { throw LocalError.message(tr("无效配对凭据")) }
        guard (invitation.urls?.count ?? 0) <= 8 else { throw LocalError.message(tr("无效设备地址")) }
        for address in invitation.candidates { _ = try PeerTunnel.address(address) }
        return invitation
    }

    /// No ticket is sent until one allowed address verifies the invited certificate.
    func resolvedURL(cancellation: String? = Runtime.cancellation) throws -> String {
        func verify(_ url: String, _ identity: String) throws -> String? {
            let tunnel = try PeerTunnel(url: url, fingerprint: fingerprint)
            defer { tunnel.close() }
            var request = URLRequest(url: URL(string: tunnel.baseURL + "/")!)
            request.httpMethod = "HEAD"
            request.timeoutInterval = 2
            _ = try SyncHTTP.request(request, cancellation: identity, probe: true)
            return url
        }
        let allowed = candidates.filter { (try? PeerTunnel.endpoint($0)) != nil }
        if let address = try PeerRace.first(cancellation: cancellation, probes: allowed.map { url in
            { identity in try verify(url, identity) }
        }) { return address }
        let profile = PeerProfile(url: url, fingerprint: fingerprint, token: "", name: name, space: space)
        if let address = try PeerDiscovery.find(profile, space: space, cancellation: cancellation, verify: { url in
            try SyncHTTP.checkCancellation(cancellation)
            do { return try verify(url, cancellation ?? UUID().uuidString) }
            catch { try SyncHTTP.checkCancellation(cancellation); return nil }
        }) { return address }
        if allowed.isEmpty {
            throw LocalError.message(tr("配对地址 {0} 无法用于局域网连接。请在电脑上重新生成配对码。", URLComponents(string: url)?.host ?? url))
        }
        throw LocalError.message(tr("无法连接电脑。请确认两台设备在同一局域网、电脑已开启设备同步，并允许 Eidos Lite 通过防火墙。"))
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

struct PeerEndpointUnreachableError: Error {
    let underlying: Error
}

/// A loopback-only byte tunnel keeps credentials and Graft traffic inside pinned TLS.
/// Neither Bonjour metadata nor an IP address grants trust.
final class PeerTunnel {
    private let acceptQueue = DispatchQueue(label: "space.eidos.ios.peer.accept", qos: .userInitiated)
    private let stateLock = NSLock()
    private let slots = DispatchSemaphore(value: 12)
    private let listener: NWListener
    private var connections: [UUID: (NWConnection, NWConnection)] = [:]
    private var isClosed = false
    private var remoteConnectFailed = false
    private var port: UInt16 = 0
    private let onTransfer: (Int64, Int64) -> Void
    private var received: Int64 = 0
    private var sent: Int64 = 0
    private var reported = Date.distantPast
    var remoteURL: String { "graft+http://127.0.0.1:\(port)/peer/space" }
    var baseURL: String { "http://127.0.0.1:\(port)" }
    var hadRemoteConnectFailure: Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return remoteConnectFailed
    }

    static func address(_ text: String) throws -> (String, UInt16) {
        guard let url = URLComponents(string: text), url.scheme == "https", let host = url.host,
              let port = url.port, (1...65535).contains(port), url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil, url.path.isEmpty else { throw LocalError.message(tr("无效设备地址")) }
        return (host, UInt16(port))
    }
    static func endpoint(_ text: String) throws -> (String, UInt16) {
        let (host, port) = try address(text)
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4, parts.allSatisfy({ part in
            !part.isEmpty && part.allSatisfy { $0 >= "0" && $0 <= "9" } &&
                (part.count == 1 || part.first != "0") && UInt8(part) != nil
        }) else { throw LocalError.message(tr("设备同步仅支持局域网 IPv4 地址")) }
        let bytes = parts.compactMap { UInt8($0) }
        guard bytes.count == 4, bytes[0] == 10 || bytes[0] == 127 || (bytes[0] == 192 && bytes[1] == 168) || (bytes[0] == 172 && (16...31).contains(bytes[1])) else { throw LocalError.message(tr("设备同步仅支持局域网 IPv4 地址")) }
        return (host, port)
    }

    init(url: String, fingerprint: String, onTransfer: @escaping (Int64, Int64) -> Void = { _, _ in }) throws {
        self.onTransfer = onTransfer
        let (host, remotePort) = try Self.endpoint(url)
        let localTcp = NWProtocolTCP.Options()
        localTcp.noDelay = true
        let parameters = NWParameters(tls: nil, tcp: localTcp)
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
            self.slots.wait()
            self.stateLock.lock()
            let stopped = self.isClosed
            self.stateLock.unlock()
            if stopped {
                local.cancel()
                self.slots.signal()
                return
            }
            let connQueue = DispatchQueue(label: "space.eidos.ios.peer.conn", qos: .userInitiated)
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
            }, connQueue)
            let remoteTcp = NWProtocolTCP.Options()
            remoteTcp.noDelay = true
            remoteTcp.enableKeepalive = true
            remoteTcp.keepaliveIdle = 30
            let remote = NWConnection(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: remotePort)!, using: NWParameters(tls: tls, tcp: remoteTcp))
            let id = UUID()
            self.stateLock.lock()
            if self.isClosed {
                self.stateLock.unlock()
                local.cancel()
                remote.cancel()
                self.slots.signal()
                return
            }
            self.connections[id] = (local, remote)
            self.stateLock.unlock()

            let closeLock = NSLock()
            var released = false
            let closeConn = { [weak self] in
                closeLock.lock()
                let shouldRelease = !released
                released = true
                closeLock.unlock()
                guard shouldRelease else { return }
                local.cancel()
                remote.cancel()
                if let self {
                    self.stateLock.lock()
                    self.connections.removeValue(forKey: id)
                    self.stateLock.unlock()
                    self.slots.signal()
                }
            }
            local.stateUpdateHandler = { state in
                if case .failed = state { closeConn() }
                else if case .cancelled = state { closeConn() }
            }
            var remoteReady = false
            remote.stateUpdateHandler = { [weak self] state in
                switch state {
                case .failed:
                    if !remoteReady, let self {
                        self.stateLock.lock()
                        if !self.isClosed { self.remoteConnectFailed = true }
                        self.stateLock.unlock()
                    }
                    closeConn()
                case .cancelled:
                    closeConn()
                case .ready:
                    remoteReady = true
                    self?.pipe(local, remote, sending: true, close: closeConn)
                    self?.pipe(remote, local, sending: false, close: closeConn)
                default: break
                }
            }
            local.start(queue: connQueue)
            remote.start(queue: connQueue)
        }
        listener.start(queue: acceptQueue)
        guard ready.wait(timeout: .now() + 10) == .success, port != 0 else { listener.cancel(); throw failure ?? LocalError.message(tr("无法建立设备连接")) }
    }
    private func pipe(_ source: NWConnection, _ destination: NWConnection, sending: Bool, close: @escaping () -> Void) {
        source.receive(minimumIncompleteLength: 1, maximumLength: 262144) { [weak self] data, _, ended, error in
            if error != nil { close(); return }
            if let self, let data {
                var snapshot: (Int64, Int64)?
                self.stateLock.lock()
                if sending { self.sent += Int64(data.count) } else { self.received += Int64(data.count) }
                let now = Date()
                if now.timeIntervalSince(self.reported) >= 0.25 {
                    self.reported = now
                    snapshot = (self.received, self.sent)
                }
                self.stateLock.unlock()
                if let snapshot { self.onTransfer(snapshot.0, snapshot.1) }
            }
            destination.send(content: data, isComplete: ended, completion: .contentProcessed { error in
                if error != nil || ended { close() } else { self?.pipe(source, destination, sending: sending, close: close) }
            })
        }
    }
    func close() {
        stateLock.lock()
        if isClosed {
            stateLock.unlock()
            return
        }
        isClosed = true
        let active = connections
        connections.removeAll()
        let rx = received
        let tx = sent
        stateLock.unlock()
        onTransfer(rx, tx)
        listener.cancel()
        active.values.forEach { $0.0.cancel(); $0.1.cancel() }
    }
    deinit { close() }

    func call(_ route: String, token: String, body: [String: Any] = [:], timeout: TimeInterval = 120, cancellation: String? = Runtime.cancellation) throws -> [String: Any] {
        var request = URLRequest(url: URL(string: baseURL + route)!)
        request.httpMethod = "POST"; request.timeoutInterval = timeout
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try SyncHTTP.request(request, cancellation: cancellation)
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
    static func request(_ request: URLRequest, cancellation: String? = Runtime.cancellation, probe: Bool = false) throws -> [String: Any] {
        let done = DispatchSemaphore(value: 0)
        var outcome: Result<[String: Any], Error> = .failure(LocalError.message(tr("请求超时")))
        let session = URLSession(configuration: .ephemeral, delegate: SyncHTTP(), delegateQueue: nil)
        let id = UUID()
        if let cancellation {
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
                if probe {
                    guard !(300...399).contains(response.statusCode) else { throw LocalError.message(tr("服务响应无效")) }
                    outcome = .success([:]); return
                }
                guard let data, data.count <= 4 * 1024 * 1024, let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw LocalError.message(tr("服务响应无效")) }
                guard (200...299).contains(response.statusCode) else { throw LocalError.message(value["error"] as? String ?? tr("服务请求失败（{0}）", response.statusCode)) }
                outcome = .success(value)
            } catch { outcome = .failure(error) }
        }.resume()
        guard done.wait(timeout: .now() + request.timeoutInterval + 5) == .success else { throw LocalError.message(tr("请求超时")) }
        return try outcome.get()
    }
}

enum PeerEndpointCache {
    private struct Entry {
        let profile: PeerProfile
        let spaces: [PeerProfile]
        let verifiedAt: Date
    }
    private static let lock = NSLock()
    private static var entries: [String: Entry] = [:]
    private static let ttl: TimeInterval = 15

    static func record(_ profile: PeerProfile, spaces: [PeerProfile]) {
        lock.lock()
        entries[profile.fingerprint] = Entry(profile: profile, spaces: spaces, verifiedAt: Date())
        lock.unlock()
    }

    static func invalidate(_ fingerprint: String) {
        lock.lock()
        entries.removeValue(forKey: fingerprint)
        lock.unlock()
    }

    static func cached(fingerprint: String, space: String?) -> (profile: PeerProfile, spaces: [PeerProfile])? {
        lock.lock()
        defer { lock.unlock() }
        guard let entry = entries[fingerprint], Date().timeIntervalSince(entry.verifiedAt) < ttl else {
            return nil
        }
        guard let space else { return (entry.profile, entry.spaces) }
        guard let match = entry.spaces.first(where: { $0.space == space }) else { return nil }
        return (match, entry.spaces)
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
    static func availableSpaces(_ device: PeerProfile, cancellation: String? = Runtime.cancellation, saveEndpoint: Bool = true, useCache: Bool = false) throws -> [PeerProfile] {
        let verified = try reconnectWithSpaces(device, requireSpace: false, cancellation: cancellation, useCache: useCache)
        try SyncHTTP.checkCancellation(cancellation)
        if saveEndpoint { try saveDevice(verified.profile) }
        return verified.spaces
    }
    private static func spaceProfiles(_ result: [String: Any], connected: PeerProfile) throws -> [PeerProfile] {
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
    static func pullUpdates(_ space: LocalSpace, profile: PeerProfile, allowed: () -> Bool) throws -> String {
        func safe() throws -> Bool {
            // A locked/unreadable recovery directory is unknown state, not clean.
            let recordDrafts = space.privateRoot.appendingPathComponent("RecordDrafts")
            for directory in [DraftStore.shared.root, recordDrafts] {
                do {
                    let entries = try FileManager.default.contentsOfDirectory(atPath: directory.path)
                    if directory == recordDrafts && !entries.isEmpty { return false }
                }
                catch let error as NSError {
                    if error.domain != NSCocoaErrorDomain || error.code != NSFileReadNoSuchFileError { return false }
                }
            }
            guard allowed(), !DraftStore.shared.hasDraft(under: space.root), !RecordDraftStore.hasDraft(space),
                  let saved = try load(space), saved.fingerprint == profile.fingerprint,
                  saved.space == profile.space, saved.token == profile.token else { return false }
            let catalog = try SpaceCatalog()
            return catalog.spaces.contains { LocalSpace.storageIdentity(catalog.root($0)) == LocalSpace.storageIdentity(space.root) && catalog.peerSpaceID(for: $0, fingerprint: profile.fingerprint) == profile.space }
        }
        guard FileManager.default.fileExists(atPath: space.root.appendingPathComponent(".graft").path), try safe() else { return "skipped" }
        let connected = try reconnect(profile)
        let tunnel = try PeerTunnel(url: connected.url, fingerprint: connected.fingerprint)
        defer { tunnel.close() }
        _ = try Runtime.call(space.root, "graft:peerConfigure", ["url": tunnel.remoteURL, "token": profile.token])
        let checked = try Runtime.call(space.root, "graft:peerAutoCheck") as? [String: Any] ?? [:]
        guard checked["outcome"] as? String == "ready", let expected = checked["expectedHead"] as? String else { return "skipped" }
        let remote = try tunnel.call("/updates", token: profile.token, timeout: 10)
        guard remote["protocol"] as? Int == 1, remote["space"] as? String == profile.space, let target = remote["head"] as? String else { return "skipped" }
        if target == expected { return "unchanged" }
        _ = try Runtime.call(space.root, "graft:peerFetch")
        try SyncHTTP.checkCancellation(Runtime.cancellation)
        return try PeerAutoSync.withCheckout {
            guard try safe() else { return "skipped" }
            let result = try Runtime.call(space.root, "graft:peerAutoApply", ["expectedHead": expected, "expectedTarget": target]) as? [String: Any] ?? [:]
            return result["outcome"] as? String ?? "skipped"
        }
    }
    private static func isRetryableEndpointError(_ error: Error) -> Bool {
        if error is PeerEndpointUnreachableError { return true }
        if let urlError = error as? URLError {
            return urlError.code != .cancelled
        }
        return false
    }
    static func sync(_ space: LocalSpace, profile: PeerProfile, progress: (String) -> Void) throws {
        guard try MergeReview.load(space) == nil else { throw LocalError.message(tr("请先完成或中止当前合并")) }
        let cached = PeerEndpointCache.cached(fingerprint: profile.fingerprint, space: profile.space)?.profile
        do {
            let activeProfile: PeerProfile
            if let cached {
                activeProfile = cached
            } else {
                progress(tr("正在查找已配对电脑"))
                activeProfile = try reconnect(profile)
            }
            try syncWithConnectedProfile(space, profile: activeProfile, progress: progress)
        } catch {
            guard cached != nil, isRetryableEndpointError(error) else { throw error }
            try SyncHTTP.checkCancellation(Runtime.cancellation)
            PeerEndpointCache.invalidate(profile.fingerprint)
            progress(tr("正在查找已配对电脑"))
            let fresh = try reconnect(profile, useCache: false)
            try syncWithConnectedProfile(space, profile: fresh, progress: progress)
        }
    }
    private static func syncWithConnectedProfile(_ space: LocalSpace, profile: PeerProfile, progress: (String) -> Void) throws {
        try DeviceSecrets.save(key(space), data: JSONEncoder().encode(profile))
        try saveDevice(profile)
        let tunnel = try PeerTunnel(url: profile.url, fingerprint: profile.fingerprint, onTransfer: Runtime.peerTransfer ?? { _, _ in })
        defer { tunnel.close() }
        // Saved remotes point at the previous tunnel's ephemeral loopback port.
        // Checkpoint and publish can hydrate history, so update it before either.
        _ = try Runtime.call(space.root, "graft:peerConfigure", ["url": tunnel.remoteURL, "token": profile.token])
        let check = try Runtime.call(space.root, "graft:peerSyncCheck") as? [String: Any] ?? [:]
        let hasHead = check["hasHead"] as? Bool ?? false
        let needsPublish = check["needsPublish"] as? Bool ?? hasHead
        let localClean = check["clean"] as? Bool ?? false
        let localHead = check["currentHead"] as? String
        let peerHead = check["peerHead"] as? String
        if needsPublish {
            progress(tr("保存本机版本")); _ = try Runtime.call(space.root, "graft:checkpoint")
            if let peerHead, peerHead.count == 64 {
                _ = try? tunnel.call("/incoming/seed", token: profile.token, body: ["baseHead": peerHead], timeout: 10)
            }
            progress("发送本机版本")
            do {
                _ = try Runtime.call(space.root, "graft:peerPublish", ["url": tunnel.remoteURL.replacingOccurrences(of: "/peer/space", with: "/peer/incoming"), "token": profile.token])
            } catch {
                if tunnel.hadRemoteConnectFailure { throw PeerEndpointUnreachableError(underlying: error) }
                throw error
            }
        }
        progress(tr("电脑正在合并版本"))
        let prepared: [String: Any]
        do {
            prepared = try tunnel.call("/sync", token: profile.token, body: ["incoming": needsPublish])
        } catch {
            if tunnel.hadRemoteConnectFailure, !(error is URLError && (error as! URLError).code == .cancelled) {
                throw PeerEndpointUnreachableError(underlying: error)
            }
            throw error
        }
        guard prepared["protocol"] as? Int == 2 else { throw LocalError.message(tr("请更新电脑端后再同步。本机文件已保留。")) }
        guard prepared["state"] as? String == "ready" else { throw LocalError.message(tr("双方版本已保留。请到电脑的「同步」处理冲突，完成后回到手机点击「同步」。")) }
        if !needsPublish && localClean, let localHead, !localHead.isEmpty, let remoteHead = prepared["head"] as? String, remoteHead == localHead {
            return
        }
        progress("获取清单")
        do {
            _ = try Runtime.call(space.root, "graft:peerFetch")
        } catch {
            if tunnel.hadRemoteConnectFailure { throw PeerEndpointUnreachableError(underlying: error) }
            throw error
        }
        progress("写入文件")
        let result = try Runtime.call(space.root, "graft:peerFastForward") as? [String: Any] ?? [:]
        guard result["outcome"] as? String != "needs_merge" else { throw LocalError.message(tr("电脑版本有新变化，本机文件已保留。请重新同步；如仍有冲突，请到电脑处理。")) }
    }
    static func reconnect(_ profile: PeerProfile, requireSpace: Bool = true, useCache: Bool = true) throws -> PeerProfile {
        try reconnectWithSpaces(profile, requireSpace: requireSpace, cancellation: Runtime.cancellation, useCache: useCache).profile
    }
    private static func reconnectWithSpaces(_ profile: PeerProfile, requireSpace: Bool, cancellation: String?, useCache: Bool = true) throws -> (profile: PeerProfile, spaces: [PeerProfile]) {
        if useCache, let hit = PeerEndpointCache.cached(fingerprint: profile.fingerprint, space: requireSpace ? profile.space : nil) {
            return hit
        }
        func verify(_ url: String, cancellation: String) throws -> (profile: PeerProfile, spaces: [PeerProfile])? {
            try SyncHTTP.checkCancellation(cancellation)
            do {
                let tunnel = try PeerTunnel(url: url, fingerprint: profile.fingerprint)
                defer { tunnel.close() }
                let result = try tunnel.call("/spaces", token: profile.token, timeout: 2, cancellation: cancellation)
                let connected = PeerProfile(url: url, fingerprint: profile.fingerprint, token: profile.token, name: profile.name, space: profile.space, spaceName: profile.spaceName)
                let spaces = try spaceProfiles(result, connected: connected)
                PeerEndpointCache.record(connected, spaces: spaces)
                if !requireSpace {
                    return (connected, spaces)
                }
                guard let match = spaces.first(where: { $0.space == profile.space }) else { return nil }
                return (match, spaces)
            } catch {
                try SyncHTTP.checkCancellation(cancellation)
                return nil
            }
        }
        var addresses = [profile.url]
        if let data = try DeviceSecrets.load("peer-device:" + profile.fingerprint) {
            let device = try JSONDecoder().decode(PeerProfile.self, from: data)
            if device.fingerprint == profile.fingerprint, device.url != profile.url { addresses.append(device.url) }
        }
        var probes: [(String) throws -> (profile: PeerProfile, spaces: [PeerProfile])?] = addresses.map { url in
            { identity in try verify(url, cancellation: identity) }
        }
        probes.append { identity in
            try PeerDiscovery.find(profile, space: requireSpace ? profile.space : nil, cancellation: identity) { url in
                try verify(url, cancellation: identity)
            }
        }
        if let connected = try PeerRace.first(cancellation: cancellation, probes: probes) { return connected }
        throw LocalError.message(tr("未找到已配对电脑，请确认同一局域网且电脑已开启此 Space 的设备同步"))
    }
}
