import SwiftUI

private struct ShareRecordTarget: Identifiable {
    let id = UUID()
    let file: URL
    let batch: SharedBatch
}

struct ShareInboxView: View {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var appLanguage = "system"
    @Environment(\.locale) private var appLocale
    let space: LocalSpace
    let initialDirectory: URL
    let onSaved: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var batches: [SharedBatch] = []
    @State private var directory: URL?
    @State private var folders: [URL] = []
    @State private var databases: [URL] = []
    @State private var recordTarget: ShareRecordTarget?
    @StateObject private var editor = EditorController()
    @Environment(\.colorScheme) private var colorScheme
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            List {
                Section(tr("保存位置")) {
                    Text((directory ?? initialDirectory) == space.root ? tr("当前 Space") : (directory ?? initialDirectory).lastPathComponent)
                    if let directory, directory != space.root { Button(tr("上一级")) { self.directory = directory.deletingLastPathComponent(); reload() } }
                    ForEach(folders, id: \.self) { folder in Button(folder.lastPathComponent, systemImage: "folder") { directory = folder; reload() } }
                }
                Section(tr("待保存的分享")) {
                    if batches.isEmpty { Text(tr("没有待保存的分享")).foregroundStyle(.secondary) }
                    ForEach(batches) { batch in
                        VStack(alignment: .leading, spacing: 8) {
                            if !batch.text.isEmpty { Text(batch.text).lineLimit(3) }
                            Text(tr("{0} 个附件", batch.files.count)).font(.caption).foregroundStyle(.secondary)
                            Button(tr("保存到此位置")) { save(batch) }
                            ForEach(databases, id: \.self) { file in
                                Button(tr("填写记录 · ") + file.lastPathComponent, systemImage: "tablecells") { recordTarget = ShareRecordTarget(file: file, batch: batch) }
                            }
                        }
                    }
                }
                if let error { Text(error).foregroundStyle(.red) }
                if busy { ProgressView(tr("正在保存…")) }
            }.disabled(busy).navigationTitle(tr("接收分享")).navigationBarTitleDisplayMode(.inline)
                .toolbar { Button(tr("完成")) { dismiss() }.disabled(busy) }
                .interactiveDismissDisabled(busy).task { directory = initialDirectory; reload() }
                .fullScreenCover(item: $recordTarget, onDismiss: reload) { target in
                    NavigationStack {
                        EditorView(file: target.file, space: space, dark: colorScheme == .dark, controller: editor, onLeave: { recordTarget = nil }, shareBatch: target.batch)
                            .navigationTitle(target.file.lastPathComponent).navigationBarTitleDisplayMode(.inline)
                            .toolbar(editor.recordPage ? .hidden : .visible, for: .navigationBar)
                            .toolbar { Button(tr("返回")) { editor.leave() } }
                    }.interactiveDismissDisabled()
                }
        }
    }
    private func reload() {
        do {
            batches = try ShareInbox.batches()
            folders = try space.files(in: directory ?? initialDirectory).filter(LocalSpace.isDirectory)
            databases = try space.files(in: directory ?? initialDirectory).filter { $0.pathExtension.lowercased() == "eidos" && !LocalSpace.isDirectory($0) }
        } catch { self.error = error.localizedDescription }
    }
    private func save(_ batch: SharedBatch) {
        busy = true; error = nil
        let parent = directory ?? initialDirectory
        LocalSpace.io.async {
            do {
                let source = try ShareInbox.root().appendingPathComponent(batch.id)
                let staging = space.privateRoot.appendingPathComponent("ShareImports").appendingPathComponent(batch.id)
                defer { try? FileManager.default.removeItem(at: staging) }
                let destination = try space.checked(parent.appendingPathComponent("分享-" + batch.id))
                let receipt = try JSONEncoder().encode(batch)
                // A stable destination makes a retry after process termination idempotent.
                if !FileManager.default.fileExists(atPath: destination.path) {
                    try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
                    if !batch.text.isEmpty { try Data(batch.text.utf8).write(to: staging.appendingPathComponent("笔记.md"), options: .atomic) }
                    for name in batch.files {
                        let file = try LocalSpace.resource(name, under: source)
                        let target = staging.appendingPathComponent(name)
                        if !FileManager.default.fileExists(atPath: target.path) { try FileManager.default.copyItem(at: file, to: target) }
                    }
                    try receipt.write(to: staging.appendingPathComponent(".share-receipt"), options: .atomic)
                    try FileManager.default.moveItem(at: staging, to: destination)
                } else {
                    guard let previous = try? Data(contentsOf: destination.appendingPathComponent(".share-receipt")),
                          let recorded = try? JSONDecoder().decode(SharedBatch.self, from: previous),
                          recorded.id == batch.id, recorded.text == batch.text, recorded.files == batch.files else {
                        throw LocalError.message(tr("目标位置已存在其他内容，请选择另一文件夹"))
                    }
                }
                try FileManager.default.removeItem(at: source)
                DispatchQueue.main.async { busy = false; reload(); onSaved() }
            } catch { DispatchQueue.main.async { busy = false; self.error = error.localizedDescription } }
        }
    }
}
