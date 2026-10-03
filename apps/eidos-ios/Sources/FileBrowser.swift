import SwiftUI
import UniformTypeIdentifiers

private struct ExportFile: Identifiable { let id = UUID(); let url: URL }
private struct NameAction: Identifiable { let id = UUID(); let source: URL? }

struct FileBrowser: View {
    let space: LocalSpace
    @Binding var directory: URL?
    let onOpen: (URL) -> Void
    @Environment(\.scenePhase) private var scenePhase
    @State private var files: [URL] = []
    @State private var search = ""
    @State private var busy = false
    @State private var error: String?
    @State private var importing = false
    @State private var nameAction: NameAction?
    @State private var name = ""
    @State private var export: ExportFile?
    @State private var history = false
    @State private var trash = false
    var body: some View {
        List {
            Section {
                ForEach(files.filter { search.isEmpty || $0.lastPathComponent.localizedCaseInsensitiveContains(search) }, id: \.self) { file in
                    Button { open(file) } label: {
                        Label(file.lastPathComponent, systemImage: LocalSpace.isDirectory(file) ? "folder" : file.pathExtension == "eidos" ? "tablecells" : "doc.text")
                            .foregroundStyle(.primary).padding(.vertical, 5)
                    }.accessibilityIdentifier(file.lastPathComponent)
                        .contextMenu {
                            Button("重命名", systemImage: "pencil") { name = file.lastPathComponent; nameAction = NameAction(source: file) }
                            if !LocalSpace.isDirectory(file) { Button("导出文件", systemImage: "square.and.arrow.up") { share(file) } }
                            Button("移到回收站", systemImage: "trash", role: .destructive) { operate { try space.trash(file); return {} } }
                        }
                }
                if files.isEmpty { Text("新建笔记、文件夹或导入文件。").foregroundStyle(.secondary) }
            } footer: { Text("文件保存在本机，离线可用。账号与远程同步尚未接入。") }
        }
        .disabled(busy)
        .searchable(text: $search, prompt: "搜索当前目录文件名")
        .navigationTitle(directory == space.root ? "本机 Space" : directory?.lastPathComponent ?? "本机 Space")
        .toolbar {
            if let directory, directory != space.root {
                ToolbarItem(placement: .topBarLeading) { Button("上一级") { self.directory = directory.deletingLastPathComponent(); search = ""; reload() }.disabled(busy) }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("本地版本", systemImage: "clock.arrow.circlepath") { history = true }
                    Button("回收站", systemImage: "trash") { trash = true }
                } label: { Image(systemName: "ellipsis.circle") }.accessibilityLabel("Space 操作").disabled(busy)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("新建 Markdown", systemImage: "doc.badge.plus") { create(markdown: true) }
                    Button("新建 Eidos File", systemImage: "tablecells.badge.ellipsis") { create(markdown: false) }
                    Button("新建文件夹", systemImage: "folder.badge.plus") { name = ""; nameAction = NameAction(source: nil) }
                    Button("导入文件", systemImage: "square.and.arrow.down") { importing = true }
                } label: { Image(systemName: "plus") }.accessibilityLabel("添加文件").disabled(busy)
            }
        }
        .overlay(alignment: .bottom) { if busy { ProgressView("正在处理…").padding().background(.regularMaterial).clipShape(.capsule) } }
        .alert("操作未完成", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("好", role: .cancel) {} } message: { Text(error ?? "") }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.data], allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls): if let url = urls.first { operate { let file = try space.importFile(url, in: directory); return { open(file) } } }
            case .failure(let failure): error = failure.localizedDescription
            }
        }
        .sheet(item: $nameAction) { action in
            NavigationStack {
                Form { TextField("名称", text: $name).autocorrectionDisabled().textInputAutocapitalization(.never) }
                    .navigationTitle(action.source == nil ? "新建文件夹" : "重命名")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("取消") { nameAction = nil } }
                        ToolbarItem(placement: .confirmationAction) { Button("保存") {
                            let entered = name; nameAction = nil
                            operate {
                                if let source = action.source { _ = try space.rename(source, to: entered) }
                                else { _ = try space.createFolder(entered, in: directory ?? space.root) }
                                return {}
                            }
                        }.disabled(name.trimmingCharacters(in: .whitespaces).isEmpty) }
                    }
            }.presentationDetents([.medium])
        }
        .sheet(item: $export, onDismiss: clearExports) { item in ShareFileView(url: item.url) }
        .sheet(isPresented: $history) { HistoryView(space: space) }
        .sheet(isPresented: $trash, onDismiss: reload) { TrashView(space: space) }
        .onAppear(perform: reload)
        .onChange(of: scenePhase) { _, phase in if phase == .active && !busy { reload() } }
    }
    private func open(_ file: URL) {
        if LocalSpace.isDirectory(file) { directory = file; search = ""; reload() }
        else if ["md", "markdown", "eidos"].contains(file.pathExtension.lowercased()) { onOpen(file) }
        else { share(file) }
    }
    private func share(_ file: URL) { operate { let copy = try space.exportSnapshot(file); return { export = ExportFile(url: copy) } } }
    private func reload() {
        do { files = try space.files(in: directory) } catch { self.error = error.localizedDescription }
    }
    private func create(markdown: Bool) { operate { let file = try space.create(markdown: markdown, in: directory); return { onOpen(file) } } }
    private func operate(_ action: @escaping () throws -> (() -> Void)) {
        guard !busy else { return }; busy = true
        LocalSpace.io.async {
            do { let completion = try action(); DispatchQueue.main.async { busy = false; reload(); completion() } }
            catch { DispatchQueue.main.async { busy = false; self.error = error.localizedDescription } }
        }
    }
    private func clearExports() {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("Exports")
        LocalSpace.io.async { try? FileManager.default.removeItem(at: root) }
    }
}

struct ShareFileView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: [url], applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
