import Foundation

struct PeerTransferProgress: Decodable {
    struct Transfer: Decodable {
        let transferred: Int64
        let total: Int64?
        var planned: Bool? = nil
        var fraction: Double? {
            guard planned == true, let total, total > 0 else { return nil }
            return min(1, max(0, Double(transferred) / Double(total)))
        }
    }
    let download: Transfer?
    let upload: Transfer?

    static func read(_ identity: String) -> Self? {
        guard let pointer = eidos_ios_transfer_progress(identity) else { return nil }
        defer { eidos_ios_free(pointer) }
        return try? JSONDecoder().decode(Self.self, from: Data(String(cString: pointer).utf8))
    }

    func transfer(for stage: String) -> Transfer? {
        switch stage {
        case "下载数据": return download
        case "发送本机版本": return upload
        default: return nil
        }
    }

    func stage(for current: String) -> String {
        guard current == "获取清单" || current == "下载数据" else { return current }
        return download?.planned == true ? "下载数据" : "获取清单"
    }
}
