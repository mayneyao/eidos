import SwiftUI

struct FileRouteMenu: View {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var appLanguage = "system"
    @Environment(\.locale) private var appLocale
    let file: URL
    let space: LocalSpace
    let controller: EditorController
    let renamed: (URL) -> Void
    let removed: () -> Void
    let refresh: () -> Void
    @State private var favorite = false
    @State private var views: [PluginNavigationPage] = []
    @State private var hasFileDefault = false
    @State private var plugin: PluginNavigationPage?
    @State private var export: URL?
    @State private var naming = false
    @State private var name = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        Menu {
            Button(favorite ? tr("取消收藏") : tr("收藏"), systemImage: "star") {
                do {
                    var activity = try FileActivity.load(space)
                    let path = FileActivity.path(file, space: space)
                    if activity.favorites.contains(path) { activity.favorites.removeAll { $0 == path } }
                    else { activity.favorites.append(path) }
                    try activity.save(space); favorite = activity.favorites.contains(path)
                } catch { self.error = error.localizedDescription }
            }
            Menu {
                Button(tr("内置打开方式"), systemImage: "doc") {}
                ForEach(views) { view in
                    Button(view.title, systemImage: "puzzlepiece.extension") {
                        saved { _ in plugin = view }
                    }
                }
                if hasFileDefault {
                    Button(tr("为 {0} 文件恢复内置打开方式", "." + file.pathExtension.lowercased()), systemImage: "arrow.counterclockwise") {
                        MobilePluginService(space: space).clearFileDefault(file)
                        hasFileDefault = false
                    }
                }
            } label: { Label(tr("打开方式"), systemImage: "arrow.up.forward.app") }
            Button(tr("重命名"), systemImage: "pencil") { name = file.lastPathComponent; naming = true }
            Button(tr("导出文件"), systemImage: "square.and.arrow.up") {
                saved { current in export = try space.exportSnapshot(current) }
            }
            Button(tr("移到回收站"), systemImage: "trash", role: .destructive) {
                saved { current in try space.trash(current); removed() }
            }
        } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }
        .accessibilityLabel(tr("文件操作"))
        .disabled(busy)
        .task(id: file) {
            do {
                favorite = try FileActivity.load(space).favorites.contains(FileActivity.path(file, space: space))
                let service = MobilePluginService(space: space)
                views = try service.fileViews(file)
                hasFileDefault = service.hasFileDefault(file)
            } catch { self.error = error.localizedDescription }
        }
        .alert(tr("重命名"), isPresented: $naming) {
            TextField(tr("名称"), text: $name)
            Button(tr("取消"), role: .cancel) {}
            Button(tr("保存")) { saved { current in renamed(try space.rename(current, to: name)) } }
        }
        .alert(tr("操作失败"), isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button(tr("好")) { error = nil }
        } message: { Text(error ?? "") }
        .sheet(isPresented: Binding(get: { export != nil }, set: { if !$0 { export = nil } })) {
            if let export { ShareFileView(url: export) }
        }
        .fullScreenCover(item: $plugin, onDismiss: refresh) { view in
            MobilePluginCover(space: space, title: file.lastPathComponent, plugin: view.plugin,
                view: view.view, filePath: FileActivity.path(file, space: space),
                open: { url in plugin = nil; renamed(url) }, close: { plugin = nil })
        }
    }

    private func saved(_ action: @escaping (URL) throws -> Void) {
        guard !busy else { return }
        busy = true
        Task { @MainActor in
            defer { busy = false }
            do {
                let current = try await controller.savedFile()
                try action(current)
            } catch { self.error = error.localizedDescription }
        }
    }
}
