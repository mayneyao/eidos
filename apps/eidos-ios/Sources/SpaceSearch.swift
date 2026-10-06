import SwiftUI

struct SearchMatch: Identifiable {
    let file: URL
    let detail: String
    var tableId: String? = nil
    var query: String = ""
    var id: String { file.path + "\n" + detail }
}

extension LocalSpace {
    func search(_ text: String, cancelled: () -> Bool) throws -> (matches: [SearchMatch], skipped: [String]) {
        let query = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return ([], []) }
        var matches: [SearchMatch] = []; var skipped: [String] = []
        func visit(_ directory: URL) throws {
            for file in try files(in: directory) {
                if cancelled() || matches.count >= 100 { return }
                if Self.isDirectory(file) { try visit(file); continue }
                do {
                    let relative = String(file.path.dropFirst(root.path.count + 1))
                    var matched = file.lastPathComponent.localizedCaseInsensitiveContains(query)
                    if ["md", "markdown", "txt"].contains(file.pathExtension.lowercased()),
                       (try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max) <= 2 * 1024 * 1024 {
                        let contents = try String(contentsOf: file, encoding: .utf8)
                        matched = matched || contents.localizedCaseInsensitiveContains(query)
                    }
                    if matched { matches.append(SearchMatch(file: file, detail: relative)) }
                    guard file.pathExtension.lowercased() == "eidos" else { continue }
                    let schema = try Runtime.call(file, "searchSchema") as? [String: Any] ?? [:]
                    let objects = schema["objects"] as? [[String: Any]] ?? []
                    for table in objects where table["object"] as? String == "table" {
                        if cancelled() || matches.count >= 100 { return }
                        guard let id = table["id"] as? String, let label = table["labelFieldId"] as? String else { continue }
                        let fields = objects.filter { $0["object"] as? String == "field" && $0["tableId"] as? String == id && ($0["systemRole"] == nil || $0["systemRole"] is NSNull) }.compactMap { $0["id"] as? String }
                        let result = try Runtime.call(file, "searchRows", ["tableId": id, "limit": 1, "query": ["search": ["text": query, "fields": fields]], "projection": ["fields": [label], "resolveRelations": []]]) as? [String: Any] ?? [:]
                        if let rows = result["rows"] as? [[String: Any]], let row = rows.first {
                            let value = (row["values"] as? [Any])?.first.map { String(describing: $0) } ?? ""
                            matches.append(SearchMatch(file: file, detail: "\(table["name"] as? String ?? "数据表") · \(value)", tableId: id, query: query))
                        }
                    }
                } catch { skipped.append(file.lastPathComponent) }
            }
        }
        try visit(root)
        return (matches, skipped)
    }
}

private final class SearchCancellation: @unchecked Sendable {
    private let lock = NSLock()
    private var value = false
    func cancel() { lock.lock(); value = true; lock.unlock() }
    var cancelled: Bool { lock.lock(); defer { lock.unlock() }; return value }
}

struct SpaceSearchView: View {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var appLanguage = "system"
    @Environment(\.locale) private var appLocale
    let space: LocalSpace
    let onOpen: (SearchMatch) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var matches: [SearchMatch] = []
    @State private var error: String?
    @State private var busy = false
    @State private var cancellation = SearchCancellation()
    var body: some View {
        NavigationStack {
            List {
                TextField(tr("搜索文件、笔记与记录"), text: $query).autocorrectionDisabled()
                if busy { ProgressView(tr("搜索中…")) }
                if let error { Text(error).foregroundStyle(.secondary) }
                ForEach(matches) { match in
                    Button { dismiss(); onOpen(match) } label: {
                        VStack(alignment: .leading) { Text(match.file.lastPathComponent); Text(match.detail).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
                    }
                }
                if !busy && !query.isEmpty && matches.isEmpty { Text(tr("没有找到匹配内容")).foregroundStyle(.secondary) }
            }.navigationTitle(tr("搜索")).navigationBarTitleDisplayMode(.inline)
                .toolbar { Button(tr("完成")) { dismiss() } }
                .onChange(of: query) { _, _ in search() }
                .onDisappear { cancellation.cancel() }
        }.presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
    }
    private func search() {
        cancellation.cancel()
        let token = SearchCancellation(); cancellation = token
        let entered = query
        busy = !entered.isEmpty; error = nil
        if entered.isEmpty { matches = []; return }
        LocalSpace.io.asyncAfter(deadline: .now() + 0.25) {
            guard !token.cancelled else { return }
            do {
                let result = try space.search(entered, cancelled: { token.cancelled })
                DispatchQueue.main.async {
                    guard !token.cancelled else { return }
                    matches = result.matches; busy = false
                    error = result.skipped.isEmpty ? nil : tr("{0} 个文件未能搜索", result.skipped.count)
                }
            } catch { DispatchQueue.main.async { if !token.cancelled { self.error = error.localizedDescription; busy = false } } }
        }
    }
}
