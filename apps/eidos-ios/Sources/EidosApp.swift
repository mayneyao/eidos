import SwiftUI
import LocalAuthentication

@main
struct EidosApp: App {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var language = "system"
    @Environment(\.scenePhase) private var scenePhase
    @State private var systemLanguages = Locale.preferredLanguages
    init() { BackgroundSync.register() }
    var body: some Scene { WindowGroup {
        SpaceView()
            .environment(\.locale, Locale(identifier: AppLanguage.resolve(language, languages: systemLanguages)))
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { systemLanguages = Locale.preferredLanguages }
            }
    } }
}

struct SpaceView: View {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var appLanguage = "system"
    @Environment(\.locale) private var appLocale
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var controller = EditorController()
    @State private var space: LocalSpace?
    @State private var selection: URL?
    @State private var searchTarget: SearchMatch?
    @State private var directory: URL?
    @State private var error: String?
    @State private var catalog: SpaceCatalog?
    @State private var entries: [SpaceEntry] = []
    @State private var currentName = tr("本机 Space")
    @State private var creatingSpace = false
    @State private var creatingForSync = false
    @State private var spaceName = ""
    @State private var pluginPages: [PluginNavigationPage] = []
    @State private var confirmingDeletion = false
    @State private var deletingSpace = false
    @State private var editorGeneration = 0
    var body: some View {
        Group {
            ZStack {
                if let space {
                    SpaceNavigation(space: space, pages: pluginPages, open: { searchTarget = nil; selection = $0 }, onCreateSpace: { spaceName = tr("同步 Space"); creatingForSync = true; creatingSpace = true }, onDownloaded: { entry in
                        do {
                            let updated = try SpaceCatalog()
                            catalog = updated; entries = updated.spaces
                            switchSpace(entry, showSync: true)
                        } catch { self.error = error.localizedDescription }
                    }, onOpenSpace: { entry in switchSpace(entry) }, initiallySync: creatingForSync, spaceName: currentName) {
                        FileBrowser(space: space, onPluginsChanged: refreshPlugins, directory: $directory, spaceName: currentName, onOpen: { searchTarget = nil; selection = $0 }, onSearch: { searchTarget = $0; selection = $0.file })
                            .id(space.root)
                            .toolbar {
                                ToolbarItem(placement: .principal) {
                                    Menu {
                                        ForEach(entries) { entry in Button(entry.name) { switchSpace(entry) } }
                                        Divider()
                                        Button(tr("新建 Space"), systemImage: "plus") { spaceName = ""; creatingForSync = false; creatingSpace = true }
                                        Button(tr("删除此 Space 的本地数据"), role: .destructive) { confirmingDeletion = true }
                                    } label: {
                                        HStack(spacing: 4) { Text(currentName).lineLimit(1); Image(systemName: "chevron.down").font(.caption) }.font(.headline)
                                    }
                                    .accessibilityLabel(tr("切换 Space"))
                                }
                            }
                    }.id(space.root)
                    .allowsHitTesting(selection == nil).accessibilityHidden(selection != nil)
                } else if let error { Text(error).foregroundStyle(.red) }
                else { ProgressView(tr("正在打开本机 Space…")) }
                if let file = selection {
                    NavigationStack {
                        EditorView(file: file, space: space!, dark: colorScheme == .dark, controller: controller, onLeave: { selection = nil }, initialTable: searchTarget?.tableId ?? "", initialQuery: searchTarget?.query ?? "")
                            .id("\(file.path):\(editorGeneration)")
                            .toolbar(controller.recordPage ? .hidden : .visible, for: .navigationBar)
                            .navigationTitle(file.lastPathComponent)
                            .navigationBarTitleDisplayMode(.inline)
                            .toolbar {
                                ToolbarItem(placement: .topBarLeading) { Button(tr("返回")) { controller.leave() } }
                                ToolbarItem(placement: .topBarTrailing) {
                                    FileRouteMenu(file: file, space: space!, controller: controller,
                                        renamed: { selection = $0 }, removed: { selection = nil },
                                        refresh: { editorGeneration += 1 })
                                }
                                ToolbarItem(placement: .principal) {
                                    HStack(spacing:8) {
                                        Text(file.lastPathComponent).font(.headline).lineLimit(1).truncationMode(.middle)
                                    }
                                }
                            }
                    }.background(Color(uiColor: .systemBackground))
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .disabled(deletingSpace)
            .overlay { if deletingSpace { ProgressView(tr("正在验证或删除本地 Space…")).padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12)) } }
            .alert(tr("删除「{0}」？", currentName), isPresented: $confirmingDeletion) {
                Button(tr("取消"), role: .cancel) {}
                Button(tr("验证身份并删除"), role: .destructive) { authenticateDeletion() }
            } message: { Text(tr("将永久删除此手机上的文件、版本历史和草稿，无法撤销。电脑上的副本和设备配对会保留。下一步需要通过手机系统解锁验证。")) }
            .onAppear {
                guard space == nil, !deletingSpace else { return }
                do {
                    let catalog = try SpaceCatalog(); self.catalog = catalog
                    entries = catalog.spaces
                    switchSpace(catalog.selected)
                }
                catch { self.error = error.localizedDescription }
            }
            .onChange(of: scenePhase) { _, phase in
                if phase != .active { controller.flush() }
                if phase == .background { BackgroundSync.schedule() }
            }
            .alert(tr("新建 Space"), isPresented: $creatingSpace) {
                TextField(tr("名称"), text: $spaceName)
                Button(tr("取消"), role: .cancel) {}
                Button(tr("创建")) {
                    do { if let entry = try catalog?.create(spaceName) { entries = catalog?.spaces ?? []; switchSpace(entry, showSync: creatingForSync) } }
                    catch { self.error = error.localizedDescription }
                }
            }
            .alert(tr("操作未完成"), isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button(tr("好"), role: .cancel) {}
            } message: { Text(error ?? "") }
        }
    }
    private func refreshPlugins() {
        guard let space else { return }
        pluginPages = (try? MobilePluginService(space: space).navigationPages()) ?? []
    }
    private func authenticateDeletion() {
        guard !deletingSpace, selection == nil, let catalog, let space,
              let entry = entries.first(where: { catalog.root($0) == space.root }) else { return }
        let context = LAContext()
        context.localizedCancelTitle = tr("取消")
        var failure: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &failure) else {
            error = tr("请先在手机系统设置中设置锁屏密码，再删除 Space"); return
        }
        deletingSpace = true
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: tr("验证身份以删除「{0}」的本地数据", entry.name)) { success, _ in
            DispatchQueue.main.async {
                guard success else { deletingSpace = false; return }
                guard self.space?.root == space.root, selection == nil else { deletingSpace = false; return }
                // Detach file and plugin bridges before the queued storage removal.
                self.space = nil
                pluginPages = []
                LocalSpace.io.async {
                    var failure: String?
                    do { try SpaceCatalog().deleteLocal(entry) }
                    catch { failure = error.localizedDescription }
                    DispatchQueue.main.async {
                        deletingSpace = false
                        do {
                            let updated = try SpaceCatalog()
                            self.catalog = updated; entries = updated.spaces
                            switchSpace(updated.selected)
                        } catch { self.error = error.localizedDescription }
                        if let failure { self.error = failure }
                    }
                }
            }
        }
    }
    private func switchSpace(_ entry: SpaceEntry, showSync: Bool = false) {
        guard let catalog else { return }
        do {
            try catalog.select(entry)
            let local = try LocalSpace(root: catalog.root(entry))
            creatingForSync = showSync
            space = local; directory = local.root; currentName = entry.name
            refreshPlugins()
        } catch { self.error = error.localizedDescription }
    }
}
