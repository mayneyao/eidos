import Foundation

/// Discovery is only a hint; every candidate must still pass pinned TLS.
final class PeerDiscovery: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
    private final class Candidates {
        private let condition = NSCondition()
        private var addresses: [String] = []
        private var seen = Set<String>()
        private var closed = false
        func offer(_ address: String) {
            condition.lock(); defer { condition.unlock() }
            if !closed && seen.insert(address).inserted { addresses.append(address); condition.signal() }
        }
        func close() { condition.lock(); closed = true; condition.broadcast(); condition.unlock() }
        func next(until deadline: Date, cancellation: String?) throws -> String? {
            condition.lock(); defer { condition.unlock() }
            while addresses.isEmpty && !closed && Date() < deadline {
                try SyncHTTP.checkCancellation(cancellation)
                _ = condition.wait(until: min(deadline, Date().addingTimeInterval(0.05)))
            }
            try SyncHTTP.checkCancellation(cancellation)
            return addresses.isEmpty ? nil : addresses.removeFirst()
        }
    }
    private let browser = NetServiceBrowser()
    private let fingerprint: String
    private let space: String?
    private var services: [NetService] = []
    private let candidates = Candidates()
    private var active = true
    init(fingerprint: String, space: String?) { self.fingerprint = fingerprint; self.space = space }
    static func find<T>(_ profile: PeerProfile, space: String?, verify: (String) throws -> T?) throws -> T? {
        let cancellation = Runtime.cancellation
        try SyncHTTP.checkCancellation(cancellation)
        let discovery = PeerDiscovery(fingerprint: profile.fingerprint, space: space)
        DispatchQueue.main.async {
            discovery.browser.delegate = discovery
            discovery.browser.schedule(in: .main, forMode: .default)
            discovery.browser.searchForServices(ofType: "_eidos-peer._tcp.", inDomain: "local.")
        }
        defer { DispatchQueue.main.async { discovery.finish() } }
        let deadline = Date().addingTimeInterval(8)
        // Keep discovering after a rejected/stale address instead of stopping at the first service.
        while let address = try discovery.candidates.next(until: deadline, cancellation: cancellation) {
            if let result = try verify(address) { return result }
        }
        return nil
    }
    private func finish() {
        active = false; browser.stop(); services.forEach { $0.stop() }; candidates.close()
    }
    func netServiceBrowser(_ browser: NetServiceBrowser, didNotSearch errorDict: [String: NSNumber]) { finish() }
    func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
        guard active else { return }
        services.append(service); service.delegate = self; service.schedule(in: .main, forMode: .default); service.resolve(withTimeout: 5)
    }
    static func endpoints(attributes: [String: Data], addresses: [Data], port: Int, fingerprint: String, space: String?) -> [String] {
        func text(_ key: String) -> String? { attributes[key].flatMap { String(data: $0, encoding: .utf8) } }
        guard text("v") == "1", text("fingerprint") == fingerprint,
              space == nil || text("space") == space, (1...65535).contains(port) else { return [] }
        return addresses.compactMap { data in
            let host: String? = data.withUnsafeBytes { bytes in
                guard data.count >= MemoryLayout<sockaddr_in>.size,
                      let address = bytes.baseAddress?.assumingMemoryBound(to: sockaddr.self),
                      address.pointee.sa_family == sa_family_t(AF_INET) else { return nil }
                var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                guard getnameinfo(address, socklen_t(data.count), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 else { return nil }
                return String(cString: host)
            }
            guard let host else { return nil }
            let url = "https://\(host):\(port)"
            return (try? PeerTunnel.endpoint(url)) == nil ? nil : url
        }
    }
    func netServiceDidResolveAddress(_ sender: NetService) {
        guard active, let data = sender.txtRecordData() else { return }
        for address in Self.endpoints(attributes: NetService.dictionary(fromTXTRecord: data), addresses: sender.addresses ?? [], port: sender.port, fingerprint: fingerprint, space: space) {
            candidates.offer(address)
        }
    }
}
