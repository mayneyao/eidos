import SwiftUI

struct HistoryView: View {
    let space: LocalSpace
    @Environment(\.dismiss) private var dismiss
    @State private var commits: [[String: Any]] = []
    @State private var status = "正在读取本机版本…"
    @State private var error: String?
    @State private var busy = false
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(status)
                    if busy { ProgressView("正在处理本机版本…") }
                    Button("保存本机版本", systemImage: "clock.badge.checkmark") { load(checkpoint: true) }.disabled(busy)
                } footer: { Text("版本包含此 Space 的文件、记录与附件，无需账号或网络。草稿和回收站不进入版本。") }
                if let error { Section { Text(error).foregroundStyle(.red); Button("重试") { load() }.disabled(busy) } }
                Section("最近 50 个版本") {
                    ForEach(Array(commits.enumerated()), id: \.offset) { _, commit in
                        VStack(alignment: .leading) {
                            Text(commit["message"] as? String ?? "本机版本")
                            Text(String((commit["id"] as? String ?? "").prefix(12))).font(.caption.monospaced()).foregroundStyle(.secondary)
                        }
                    }
                    if commits.isEmpty && !busy { Text("尚无本机版本").foregroundStyle(.secondary) }
                }
            }.navigationTitle("本地版本").navigationBarTitleDisplayMode(.inline)
                .toolbar { Button("完成") { dismiss() }.disabled(busy) }
                .interactiveDismissDisabled(busy).task { load() }
        }
    }
    private func load(checkpoint: Bool = false) {
        guard !busy else { return }; busy = true; error = nil
        LocalSpace.io.async {
            do {
                let value = try Runtime.call(space.root, checkpoint ? "graft:checkpoint" : "graft:status") as? [String: Any] ?? [:]
                let current = value["status"] as? [String: Any] ?? [:]
                let dirty = current["dirty"] as? Bool == true || !(current["staged_changes"] as? [Any] ?? []).isEmpty
                let label = value["initialized"] as? Bool != true ? "尚未保存本机版本" : dirty ? "有尚未保存到版本的更改" : "本机版本已保存"
                let history = try Runtime.call(space.root, "graft:history") as? [String: Any] ?? [:]
                DispatchQueue.main.async { status = label; commits = history["commits"] as? [[String: Any]] ?? []; busy = false }
            } catch { DispatchQueue.main.async { self.error = error.localizedDescription; status = "未能读取本机版本"; busy = false } }
        }
    }
}

struct TrashView: View {
    let space: LocalSpace
    @Environment(\.dismiss) private var dismiss
    @State private var items: [TrashedFile] = []
    @State private var error: String?
    @State private var busy = false
    var body: some View {
        NavigationStack {
            List {
                if let error { Text(error).foregroundStyle(.red) }
                if items.isEmpty { Text("回收站为空").foregroundStyle(.secondary) }
                ForEach(items) { item in
                    VStack(alignment: .leading) {
                        Text(item.relativePath)
                        Text(item.date, style: .date).font(.caption).foregroundStyle(.secondary)
                        Button("恢复") { restore(item) }.disabled(busy)
                    }
                }
            }.navigationTitle("回收站").navigationBarTitleDisplayMode(.inline)
                .toolbar { Button("完成") { dismiss() }.disabled(busy) }
                .interactiveDismissDisabled(busy).task { reload() }
        }
    }
    private func reload() { do { items = try space.trashItems() } catch { self.error = error.localizedDescription } }
    private func restore(_ item: TrashedFile) {
        busy = true; error = nil
        LocalSpace.io.async {
            do { _ = try space.restore(item); DispatchQueue.main.async { busy = false; reload() } }
            catch { DispatchQueue.main.async { busy = false; self.error = error.localizedDescription } }
        }
    }
}
