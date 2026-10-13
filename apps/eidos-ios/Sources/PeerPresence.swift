import Combine
import Foundation
import Network

/// A foreground listener that wakes verification when peers or network paths change.
final class PeerPresence: NSObject, ObservableObject, NetServiceBrowserDelegate {
    @Published private(set) var revision = 0
    private var browser: NetServiceBrowser?
    private var monitor: NWPathMonitor?
    private var pending: DispatchWorkItem?
    private var fallback: Timer?
    var isRunning: Bool { browser != nil }
    let checks: OperationQueue = {
        let queue = OperationQueue()
        queue.name = "space.eidos.ios.peer-availability"
        queue.maxConcurrentOperationCount = 3
        queue.qualityOfService = .userInitiated
        return queue
    }()

    func start() {
        guard browser == nil else { return }
        let browser = NetServiceBrowser()
        self.browser = browser
        browser.delegate = self
        browser.searchForServices(ofType: "_eidos-peer._tcp.", inDomain: "local.")
        let monitor = NWPathMonitor()
        self.monitor = monitor
        monitor.pathUpdateHandler = { [weak self] _ in self?.changed() }
        monitor.start(queue: .main)
        fallback = Timer.scheduledTimer(withTimeInterval: 20, repeats: true) { [weak self] _ in self?.changed() }
        changed()
    }
    func stop() {
        pending?.cancel(); pending = nil
        fallback?.invalidate(); fallback = nil
        monitor?.cancel(); monitor = nil
        browser?.stop(); browser = nil
    }
    private func changed() {
        guard browser != nil else { return }
        pending?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.browser != nil else { return }
            self.revision += 1
        }
        pending = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15, execute: work)
    }
    func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) { changed() }
    func netServiceBrowser(_ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) { changed() }
}
