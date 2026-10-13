import Foundation

/// Races verified results, with independent cancellation for every losing probe.
enum PeerRace {
    private final class Results<T> {
        let condition = NSCondition()
        var value: T?
        var remaining: Int
        init(_ count: Int) { remaining = count }
        func finish(_ result: T?) {
            condition.lock(); defer { condition.unlock() }
            if value == nil { value = result }
            remaining -= 1
            condition.broadcast()
        }
    }

    static func first<T>(cancellation: String?, probes: [(String) throws -> T?]) throws -> T? {
        try SyncHTTP.checkCancellation(cancellation)
        let results = Results<T>(probes.count)
        let group = DispatchGroup()
        let identities = probes.map { _ in UUID().uuidString }
        defer {
            identities.forEach { SyncHTTP.cancel($0) }
            group.notify(queue: .global(qos: .utility)) {
                identities.forEach { SyncHTTP.end($0) }
            }
        }
        for (probe, identity) in zip(probes, identities) {
            SyncHTTP.begin(identity)
            group.enter()
            DispatchQueue.global(qos: .userInitiated).async {
                defer { group.leave() }
                results.finish(try? probe(identity))
            }
        }
        results.condition.lock(); defer { results.condition.unlock() }
        while results.value == nil && results.remaining > 0 {
            try SyncHTTP.checkCancellation(cancellation)
            _ = results.condition.wait(until: Date().addingTimeInterval(0.05))
        }
        try SyncHTTP.checkCancellation(cancellation)
        return results.value
    }
}
