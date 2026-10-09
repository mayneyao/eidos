import SwiftUI

struct HistoryView: View {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var appLanguage = "system"
    @Environment(\.locale) private var appLocale
    let space: LocalSpace
    @Environment(\.dismiss) private var dismiss
    @State private var commits: [[String: Any]] = []
    @State private var status = tr("正在读取本机版本…")
    @State private var error: String?
    @State private var busy = false
    @State private var canCheckpoint = false
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(status).font(.headline)
                    Text(tr("保存数据文件、笔记和附件的本地版本，不会发送到电脑。")).font(.caption).foregroundStyle(.secondary)
                    if busy { ProgressView(tr("正在处理本机版本…")) }
                    Button(tr("保存本机版本"), systemImage: "clock.badge.checkmark") { load(checkpoint: true) }.disabled(busy || !canCheckpoint)
                }
                if let error { Section { Text(error).foregroundStyle(.red); Button(tr("重试")) { load() }.disabled(busy) } }
                Section(tr("最近 50 个版本")) {
                    ForEach(Array(commits.enumerated()), id: \.offset) { _, commit in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(commit["message"] as? String ?? tr("本机版本")).font(.body)
                            Text(String((commit["id"] as? String ?? "").prefix(12))).font(.caption.monospaced()).foregroundStyle(.secondary)
                        }
                    }
                    if commits.isEmpty && !busy { Text(tr("尚无本机版本")).foregroundStyle(.secondary) }
                }
            }.navigationTitle(tr("本地版本")).navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button(tr("完成")) { dismiss() }.disabled(busy) }
                    ToolbarItem(placement: .topBarTrailing) { Button(tr("刷新状态"), systemImage: "arrow.clockwise") { load() }.disabled(busy) }
                }
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
                let label = value["initialized"] as? Bool != true ? tr("尚未保存本机版本") : dirty ? tr("有尚未保存到版本的更改") : tr("本机版本已保存")
                let history = try Runtime.call(space.root, "graft:history") as? [String: Any] ?? [:]
                DispatchQueue.main.async { status = label; canCheckpoint = dirty || value["initialized"] as? Bool != true; commits = history["commits"] as? [[String: Any]] ?? []; busy = false }
            } catch { DispatchQueue.main.async { self.error = error.localizedDescription; status = tr("未能读取本机版本"); busy = false } }
        }
    }
}

struct TrashView: View {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var appLanguage = "system"
    @Environment(\.locale) private var appLocale
    let space: LocalSpace
    @Environment(\.dismiss) private var dismiss
    @State private var items: [TrashedFile] = []
    @State private var error: String?
    @State private var busy = false
    var body: some View {
        NavigationStack {
            List {
                if let error { Text(error).foregroundStyle(.red) }
                if items.isEmpty { Text(tr("回收站为空")).foregroundStyle(.secondary) }
                ForEach(items) { item in
                    VStack(alignment: .leading) {
                        Text(item.relativePath)
                        Text(item.date, style: .date).font(.caption).foregroundStyle(.secondary)
                        Button(tr("恢复")) { restore(item) }.disabled(busy)
                    }
                }
            }.navigationTitle(tr("回收站")).navigationBarTitleDisplayMode(.inline)
                .toolbar { Button(tr("完成")) { dismiss() }.disabled(busy) }
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
