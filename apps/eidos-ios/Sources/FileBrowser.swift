import SwiftUI
import UniformTypeIdentifiers

private struct ExportFile: Identifiable { let id = UUID(); let url: URL }
private struct NameAction: Identifiable { let id = UUID(); let source: URL? }
private struct PublishFile: Identifiable { let id = UUID(); let url: URL }
private struct FileActionTarget: Identifiable { let url: URL; var id: String { url.path } }
private struct PluginFileTarget: Identifiable { let file: URL; let view: PluginNavigationPage; var id: String { file.path + view.id } }

struct FileBrowser: View {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var appLanguage = "system"
    @Environment(\.locale) private var appLocale
    let space: LocalSpace
    var onPluginsChanged: () -> Void = {}
    @Binding var directory: URL?
    var spaceName = tr("本机 Space")
    let onOpen: (URL) -> Void
    var onSearch: ((SearchMatch) -> Void)? = nil
    @Environment(\.scenePhase) private var scenePhase
    @State private var files: [URL] = []
    @State private var search = ""
    @State private var searching = false
    @AppStorage("file-sort-by") private var sortBy = "name"
    @AppStorage("file-sort-descending") private var sortDescending = false
    @State private var metadata: [URL: URLResourceValues] = [:]
    @State private var busy = false
    @State private var error: String?
    @State private var importing = false
    @State private var importingFolder = false
    @State private var nameAction: NameAction?
    @State private var name = ""
    @State private var export: ExportFile?
    @State private var publication: PublishFile?
    @State private var history = false
    @State private var trash = false
    @State private var plugins = false
    @State private var merge: MergeReview?
    @State private var checkingMerge = true
    @State private var filePlugin: PluginFileTarget?
    @State private var activity = FileActivity()
    @State private var inbox = false
    @State private var languageSettings = false
    @State private var actionTarget: FileActionTarget?
    @Environment(\.colorScheme) private var colorScheme
    var body: some View {
        List {
            if directory == nil || directory == space.root {
                if !activity.files(activity.favorites, space: space).isEmpty {
                    Section(tr("收藏")) {
                        ForEach(activity.files(activity.favorites, space: space), id: \.self) { file in fileRow(file, showPath: true) }
                    }
                }
                if !activity.files(activity.recent, space: space).isEmpty {
                    Section(tr("最近使用")) {
                        ForEach(activity.files(activity.recent, space: space), id: \.self) { file in fileRow(file, showPath: true) }
                    }
                }
            }
            Section(directory == nil || directory == space.root ? tr("文件") : FileActivity.path(directory!, space: space)) {
                ForEach(sortedFiles, id: \.self) { file in
                    fileRow(file)
                }
                if files.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(tr("从一份资料开始")).font(.headline)
                        Text(tr("新建笔记或导入 .eidos 文件。\n所有文件保存在这台设备上。")).foregroundStyle(.secondary)
                    }.padding(.vertical, 24).listRowSeparator(.hidden)
                }
            }
        }
        .listStyle(.plain).scrollContentBackground(.hidden)
        .background(Color(uiColor: .systemBackground))
        .disabled(busy || checkingMerge || merge != nil)
        .navigationTitle(directory == space.root ? spaceName : directory?.lastPathComponent ?? spaceName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let directory, directory != space.root {
                ToolbarItem(placement: .topBarLeading) { Button(tr("上一级")) { self.directory = directory.deletingLastPathComponent(); search = ""; reload() }.disabled(busy) }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Menu(tr("排序"), systemImage: "arrow.up.arrow.down") {
                        Picker(tr("排序依据"), selection: $sortBy) {
                            Text(tr("名称")).tag("name")
                            Text(tr("修改时间")).tag("modified")
                            Text(tr("类型")).tag("type")
                        }
                        Picker(tr("排序方向"), selection: $sortDescending) {
                            Text(tr("升序")).tag(false)
                            Text(tr("降序")).tag(true)
                        }
                        Text(tr("文件夹始终置顶"))
                    }
                    Button(tr("本地版本"), systemImage: "clock.arrow.circlepath") { history = true }
                    Button(tr("插件"), systemImage: "puzzlepiece.extension") { plugins = true }
                    Button(tr("语言"), systemImage: "globe") { languageSettings = true }
                    Button(tr("回收站"), systemImage: "trash") { trash = true }
                    Button(tr("接收分享"), systemImage: "tray.and.arrow.down") { inbox = true }
                    Button(tr("导出 Space"), systemImage: "square.and.arrow.up") { share(space.root) }
                } label: { Image(systemName: "ellipsis.circle") }.accessibilityLabel(tr("Space 操作")).disabled(busy)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { searching = true } label: { Image(systemName: "magnifyingglass") }.accessibilityLabel(tr("搜索")).disabled(busy)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button(tr("新建笔记"), systemImage: "doc.badge.plus") { create(markdown: true) }
                    Button(tr("新建 .eidos 文件"), systemImage: "tablecells.badge.ellipsis") { create(markdown: false) }
                    Button(tr("新建文件夹"), systemImage: "folder.badge.plus") {
                        operate {
                            let parent = directory ?? space.root
                            let target = space.availableURL("Untitled", extension: "", in: parent)
                            let folder = try space.createFolder(target.lastPathComponent, in: parent)
                            return { open(folder) }
                        }
                    }
                    Button(tr("导入文件"), systemImage: "square.and.arrow.down") { importing = true }
                    Button(tr("导入文件夹"), systemImage: "folder") { importingFolder = true }
                } label: { Image(systemName: "plus") }.accessibilityLabel(tr("添加文件")).disabled(busy)
            }
        }
        .overlay(alignment: .bottom) { if busy { ProgressView(tr("正在处理…")).padding().background(.regularMaterial).clipShape(.capsule) } }
        .sheet(isPresented: $languageSettings) { LanguageSettings().presentationDetents([.medium]) }
        .alert(tr("操作未完成"), isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button(tr("好"), role: .cancel) {} } message: { Text(error ?? "") }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.data], allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls): if let url = urls.first { operate { let file = try space.importFile(url, in: directory); return { open(file) } } }
            case .failure(let failure): error = failure.localizedDescription
            }
        }
        .sheet(item: $nameAction) { action in
            NavigationStack {
                Form { TextField(tr("名称"), text: $name).autocorrectionDisabled().textInputAutocapitalization(.never) }
                    .navigationTitle(action.source == nil ? tr("新建文件夹") : tr("重命名"))
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button(tr("取消")) { nameAction = nil } }
                        ToolbarItem(placement: .confirmationAction) { Button(tr("保存")) {
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
        .fileImporter(isPresented: $importingFolder, allowedContentTypes: [.folder]) { result in
            switch result {
            case .success(let source): operate { _ = try space.importFolder(source, in: directory); return {} }
            case .failure(let failure): error = failure.localizedDescription
            }
        }
        .sheet(item: $export, onDismiss: clearExports) { item in ShareFileView(url: item.url) }
        .sheet(item: $publication) { item in PublishView(space: space, file: item.url) }
        .sheet(isPresented: $searching) {
            SpaceSearchView(space: space) { match in
                searching = false
                DispatchQueue.main.async {
                    if let onSearch, match.tableId != nil { onSearch(match) }
                    else { open(match.file) }
                }
            }
        }
        .sheet(isPresented: $history) { HistoryView(space: space) }
        .sheet(isPresented: $inbox, onDismiss: reload) { ShareInboxView(space: space, initialDirectory: directory ?? space.root, onSaved: reload) }
        .fullScreenCover(isPresented: Binding(get: { merge != nil }, set: { _ in })) {
            if let merge { MergeReviewView(space: space, onFinish: { self.merge = nil; reload() }, review: merge) }
        }
        .sheet(isPresented: $trash, onDismiss: reload) { TrashView(space: space) }
        .fullScreenCover(isPresented: $plugins, onDismiss: { reload(); onPluginsChanged() }) {
            NavigationStack {
                NativePluginManagerView(space:space) { file in
                    plugins = false
                    DispatchQueue.main.asyncAfter(deadline:.now()+0.3) { onOpen(file) }
                }
                .navigationTitle(tr("插件")).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement:.cancellationAction) { Button(tr("返回")) { plugins = false } } }
            }
        }
        .sheet(item: $actionTarget) { target in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(target.url.lastPathComponent).font(.headline).lineLimit(2).padding(20)
                    fileActions(target.url)
                }
            }
            .buttonStyle(.plain).frame(maxWidth: .infinity, alignment: .leading)
            .presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
        }
        .onAppear(perform: reload)
        .onReceive(NotificationCenter.default.publisher(for: FileActivity.changed).receive(on: RunLoop.main)) { notification in
            guard notification.object as? URL == space.root else { return }
            if let updated = try? FileActivity.load(space) { activity = updated }
        }
        .fullScreenCover(item: $filePlugin, onDismiss: reload) { target in
            NavigationStack {
                MobilePluginView(space: space, dark: colorScheme == .dark, open: { file in filePlugin = nil; onOpen(file) },
                    pluginId: target.view.plugin, viewId: target.view.view, filePath: FileActivity.path(target.file, space: space))
                .navigationTitle(target.file.lastPathComponent).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarLeading) { Button(tr("返回")) { filePlugin = nil } } }
            }
        }
        .onChange(of: scenePhase) { _, phase in if phase == .active && !busy { reload() } }
    }
    private func fileRow(_ file: URL, showPath: Bool = false) -> some View {
        HStack(spacing: 12) {
            Button { open(file) } label: {
                HStack(spacing: 16) {
                    Image(systemName: LocalSpace.isDirectory(file) ? "folder" : file.pathExtension == "eidos" ? "tablecells" : "doc.text")
                        .font(.system(size: 22)).frame(width: 24)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(file.lastPathComponent).lineLimit(1).truncationMode(.middle)
                        Text(showPath ? FileActivity.path(file, space: space) : LocalSpace.isDirectory(file) ? tr("文件夹") : file.pathExtension == "eidos" ? tr("Eidos 数据文件") : ["md", "markdown"].contains(file.pathExtension) ? "Markdown" : file.pathExtension.uppercased())
                            .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }.frame(minHeight: 56).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityIdentifier(showPath ? "recent-" + file.path : file.lastPathComponent)
                // The native context menu cooperates with List scrolling on
                // iOS 17; a custom long-press recognizer consumes row drags.
                .contextMenu { fileActions(file) }
            Button { actionTarget = FileActionTarget(url: file) } label: {
                Image(systemName: "ellipsis").frame(width: 44, height: 44)
            }.buttonStyle(.plain).accessibilityLabel(tr("更多 ") + file.lastPathComponent)
        }.foregroundStyle(.primary).listRowSeparator(.hidden)
    }
    private func action(_ title: String, icon: String, destructive: Bool = false, perform: @escaping () -> Void) -> some View {
        Button {
            actionTarget = nil
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: perform)
        } label: {
            Label(title, systemImage: icon).frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 24).frame(minHeight: 52)
                .foregroundStyle(destructive ? Color.red : Color.primary)
        }
    }
    @ViewBuilder private func fileActions(_ file: URL) -> some View {
        if !LocalSpace.isDirectory(file) {
            Menu {
                Button(tr("默认打开方式"), systemImage: "doc") { actionTarget = nil; open(file) }
                ForEach((try? MobilePluginService(space: space).fileViews(file)) ?? []) { view in
                    Button(view.title, systemImage: "puzzlepiece.extension") {
                        actionTarget = nil
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { filePlugin = PluginFileTarget(file: file, view: view) }
                    }
                }
            } label: {
                Label(tr("打开方式"), systemImage: "arrow.up.forward.app")
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 24).frame(minHeight: 52)
            }
        }
        action(activity.favorites.contains(FileActivity.path(file, space: space)) ? tr("取消收藏") : tr("收藏"), icon: "star") {
            do {
                let path = FileActivity.path(file, space: space)
                if activity.favorites.contains(path) { activity.favorites.removeAll { $0 == path } } else { activity.favorites.append(path) }
                try activity.save(space)
            } catch { self.error = error.localizedDescription }
        }
        action(tr("重命名"), icon: "pencil") { name = file.lastPathComponent; nameAction = NameAction(source: file) }
        action(LocalSpace.isDirectory(file) ? tr("导出文件夹") : tr("导出文件"), icon: "square.and.arrow.up") { share(file) }
        action(tr("移到回收站"), icon: "trash", destructive: true) { operate { try space.trash(file); return {} } }
    }
    private func open(_ file: URL) {
        do {
            let path = FileActivity.path(file, space: space)
            activity.recent.removeAll { $0 == path }; activity.recent.insert(path, at: 0)
            activity.recent = Array(activity.recent.prefix(12)); try activity.save(space)
        } catch { self.error = error.localizedDescription; return }
        if LocalSpace.isDirectory(file) { directory = file; search = ""; reload() }
        else if ["md", "markdown", "eidos"].contains(file.pathExtension.lowercased()) { onOpen(file) }
        else { share(file) }
    }
    private func share(_ file: URL) { operate { let copy = try space.exportSnapshot(file); return { export = ExportFile(url: copy) } } }
    private func reload() {
        do {
            activity = try FileActivity.load(space)
            files = try space.files(in: directory)
            metadata = Dictionary(uniqueKeysWithValues: files.map { ($0, (try? $0.resourceValues(forKeys: [.isDirectoryKey, .contentModificationDateKey])) ?? URLResourceValues()) })
        } catch { self.error = error.localizedDescription }
        checkingMerge = true
        LocalSpace.io.async {
            do {
                let review = try MergeReview.load(space)
                DispatchQueue.main.async { merge = review; checkingMerge = false }
            } catch { DispatchQueue.main.async { self.error = error.localizedDescription; checkingMerge = false } }
        }
    }
    private var sortedFiles: [URL] {
        files.sorted { left, right in
            let leftDirectory = metadata[left]?.isDirectory == true
            let rightDirectory = metadata[right]?.isDirectory == true
            if leftDirectory != rightDirectory { return leftDirectory }
            var comparison = ComparisonResult.orderedSame
            if sortBy == "modified" {
                comparison = (metadata[left]?.contentModificationDate ?? .distantPast).compare(metadata[right]?.contentModificationDate ?? .distantPast)
            } else if sortBy == "type" && !leftDirectory {
                comparison = left.pathExtension.localizedStandardCompare(right.pathExtension)
            }
            if comparison == .orderedSame { comparison = left.lastPathComponent.localizedStandardCompare(right.lastPathComponent) }
            if comparison == .orderedSame { comparison = left.path.compare(right.path) }
            return sortDescending ? comparison == .orderedDescending : comparison == .orderedAscending
        }
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
