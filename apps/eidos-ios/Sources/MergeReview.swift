import SwiftUI

struct MergePath: Identifiable {
    var id: String { path }
    let path: String
    let resolved: Bool
    let hasOurs: Bool
    let hasTheirs: Bool
}

struct MergeReview {
    let token: String
    let unresolved: Int
    let paths: [MergePath]

    static func load(_ space: LocalSpace) throws -> MergeReview? {
        guard FileManager.default.fileExists(atPath: space.root.appendingPathComponent(".graft").path) else { return nil }
        let state = try Runtime.call(space.root, "graft:mergeStatus") as? [String: Any] ?? [:]
        guard state["state"] as? String != "none" else { return nil }
        guard let token = state["state_token"] as? String, let unresolved = state["unmerged_count"] as? Int else { throw LocalError.message(tr("无法读取合并状态")) }
        var paths: [MergePath] = []
        var after: String?
        repeat {
            var params: [String: Any] = ["stateToken": token]
            if let after { params["after"] = after }
            let page = try Runtime.call(space.root, "graft:mergePaths", params) as? [String: Any] ?? [:]
            guard let items = page["items"] as? [[String: Any]] else { throw LocalError.message(tr("无法读取冲突文件")) }
            for item in items {
                guard let path = item["path"] as? String else { throw LocalError.message(tr("无效冲突路径")) }
                paths.append(MergePath(path: path, resolved: item["state"] as? String == "resolved", hasOurs: item["has_ours"] as? Bool == true, hasTheirs: item["has_theirs"] as? Bool == true))
            }
            after = page["next_cursor"] as? String
        } while after != nil
        return MergeReview(token: token, unresolved: unresolved, paths: paths)
    }
}

struct MergeReviewView: View {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var appLanguage = "system"
    @Environment(\.locale) private var appLocale
    let space: LocalSpace
    let onFinish: () -> Void
    @State var review: MergeReview
    @State private var error: String?
    @State private var busy = false
    @State private var comparison: [String: [String]] = [:]
    @State private var choice: (MergePath, String)?
    @State private var abort = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(review.unresolved == 0 ? tr("所有文件已处理，可以保存合并") : tr("{0} 个文件需要选择版本", review.unresolved))
                    if busy { ProgressView(tr("正在处理…")) }
                    if let error { Text(error).foregroundStyle(.red); Button(tr("刷新状态")) { perform {} } }
                } footer: { Text(tr("进度已保存在本机。完成或中止合并后可继续编辑文件。")) }
                ForEach(review.paths) { file in
                    Section(file.path) {
                        if file.resolved { Label(tr("已处理"), systemImage: "checkmark") }
                        else {
                            if file.path.lowercased().hasSuffix(".eidos") {
                                Text(tr("选择整个数据文件会采用该版本的所有表和记录。")).font(.footnote).foregroundStyle(.secondary)
                            }
                            if ["md", "markdown", "txt"].contains(URL(fileURLWithPath: file.path).pathExtension.lowercased()) {
                                Button(tr("查看两个版本")) { compare(file) }
                                if let values = comparison[file.path] {
                                    Text(tr("本机")).font(.headline)
                                    Text(values[0]).textSelection(.enabled)
                                    Text(tr("远端")).font(.headline)
                                    Text(values[1]).textSelection(.enabled)
                                }
                            }
                            Button(file.hasOurs ? tr("保留本机文件") : tr("采用本机删除")) { choice = (file, "ours") }
                            Button(file.hasTheirs ? tr("使用远端文件") : tr("采用远端删除")) { choice = (file, "theirs") }
                        }
                    }
                }
                Section {
                    Button(tr("保存合并")) { finish(abort: false) }.disabled(review.unresolved != 0)
                    Button(tr("中止合并"), role: .destructive) { abort = true }
                }
            }.disabled(busy).navigationTitle(tr("合并版本")).navigationBarTitleDisplayMode(.inline)
                .interactiveDismissDisabled()
                .alert(tr("选择整个文件版本"), isPresented: Binding(get: { choice != nil }, set: { if !$0 { choice = nil } })) {
                    Button(tr("取消"), role: .cancel) { choice = nil }
                    Button(tr("确认选择")) {
                        if let (file, side) = choice {
                            let token = review.token
                            perform { _ = try Runtime.call(space.root, "graft:chooseMergePath", ["stateToken": token, "path": file.path, "side": side]) }
                        }
                        choice = nil
                    }
                } message: { Text(tr("将采用所选的整个文件状态，另一端对此文件的改动不会进入合并结果。历史版本仍保留。")) }
                .alert(tr("中止这次合并？"), isPresented: $abort) {
                    Button(tr("继续处理"), role: .cancel) {}
                    Button(tr("确认中止"), role: .destructive) { finish(abort: true) }
                } message: { Text(tr("恢复开始合并前的本机版本，放弃本次合并选择。远端版本仍保留。")) }
        }
    }
    private func finish(abort: Bool) {
        let token = review.token
        perform { _ = try Runtime.call(space.root, abort ? "graft:abortMerge" : "graft:continueMerge", ["stateToken": token]) }
    }
    private func perform(_ work: @escaping () throws -> Void) {
        guard !busy else { return }; busy = true; error = nil
        LocalSpace.io.async {
            var failure: Error?
            do { try work() } catch { failure = error }
            do {
                let next = try MergeReview.load(space)
                let message = failure?.localizedDescription
                DispatchQueue.main.async {
                    busy = false; error = message
                    if let next { review = next } else { onFinish() }
                }
            } catch { DispatchQueue.main.async { busy = false; self.error = error.localizedDescription } }
        }
    }
    private func compare(_ file: MergePath) {
        let token = review.token
        perform {
            let values = try ["ours", "theirs"].map { side -> String in
                let result = try Runtime.call(space.root, "graft:mergeText", ["stateToken": token, "path": file.path, "side": side]) as? [String: Any] ?? [:]
                let content = result["content"] as? [String: Any] ?? [:]
                switch content["state"] as? String {
                case "utf8": return content["content"] as? String ?? ""
                case "absent": return tr("此版本中没有这个文件")
                case "too_large": return tr("文件超过预览大小（32 KB）")
                default: return tr("此文件不支持文本预览")
                }
            }
            DispatchQueue.main.async { comparison[file.path] = values }
        }
    }
}
