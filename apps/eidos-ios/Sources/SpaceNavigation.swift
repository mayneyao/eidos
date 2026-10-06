import SwiftUI

struct SpaceNavigation<Files: View>: View {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var appLanguage = "system"
    @Environment(\.locale) private var appLocale
    let space: LocalSpace
    let pages: [PluginNavigationPage]
    let open: (URL) -> Void
    var onCreateSpace: () -> Void = {}
    var onDownloaded: (SpaceEntry) -> Void = { _ in }
    var onOpenSpace: (SpaceEntry) -> Void = { _ in }
    var initiallySync = false
    var spaceName = ""
    @ViewBuilder let files: () -> Files
    @Environment(\.colorScheme) private var colorScheme
    @State private var selected = "files"
    @State private var visited = Set<String>()
    @State private var overflow: PluginNavigationPage?
    @State private var choosingPage = false
    private var inline: [PluginNavigationPage] { Array(pages.prefix(pages.count > 2 ? 1 : 2)) }
    var body: some View {
        TabView(selection: $selected) {
            NavigationStack { files().navigationBarTitleDisplayMode(.inline) }
                .tabItem { Label(tr("资料"), systemImage: "folder") }.tag("files")
            SyncView(space: space, onChange: {}, embedded: true, onCreateSpace: onCreateSpace, onDownloaded: onDownloaded, onOpenSpace: { entry in selected = "files"; onOpenSpace(entry) }, spaceName: spaceName)
                .tabItem { Label(tr("同步"), systemImage: "arrow.triangle.2.circlepath") }.tag("sync")
            ForEach(inline) { page in
                NavigationStack {
                    if visited.contains(page.id) { plugin(page) }
                }.tabItem { Label(page.title, systemImage: "doc.text") }.tag(page.id)
            }
            if pages.count > 2 {
                NavigationStack {
                    if let overflow { plugin(overflow).id(overflow.id) }
                }.tabItem { Label(tr("更多"), systemImage: "ellipsis") }.tag("more")
            }
        }
        .sheet(isPresented: $choosingPage) {
            NavigationStack {
                List(pages.dropFirst(inline.count)) { page in
                    Button(page.title) { overflow = page; selected = "more"; choosingPage = false }
                }.listStyle(.plain).navigationTitle(tr("更多页面")).navigationBarTitleDisplayMode(.inline)
            }.presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
        }
        .toolbar(.hidden, for: .tabBar)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                Divider()
                HStack(spacing: 0) {
                    tab(tr("资料"), icon: "folder", id: "files")
                    tab(tr("同步"), icon: "arrow.triangle.2.circlepath", id: "sync")
                    ForEach(inline) { page in tab(page.title, icon: "doc.text", id: page.id) }
                    if pages.count > 2 { tab(tr("更多"), icon: "ellipsis", id: "more") }
                }.padding(.top, 8).padding(.bottom, 6)
            }.background(Color(uiColor: .systemBackground))
        }
        .onChange(of: selected) { _, value in visited.insert(value) }
        .onAppear { if initiallySync { selected = "sync" } }
        .onChange(of: pages.map(\.id)) { _, ids in
            if !["files", "sync", "more"].contains(selected), !ids.contains(selected) { selected = "files" }
            if selected == "more", pages.count <= 2 { selected = "files" }
            if let overflow, !ids.contains(overflow.id) { self.overflow = nil }
        }
    }
    private func tab(_ title: String, icon: String, id: String) -> some View {
        Button { if id == "more" { choosingPage = true } else { selected = id } } label: {
            VStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 21, weight: selected == id ? .semibold : .regular))
                    .frame(width: 60, height: 30)
                    .background(selected == id ? Color.primary.opacity(0.08) : .clear, in: Capsule())
                Text(title).font(.caption).lineLimit(1)
            }.frame(maxWidth: .infinity).frame(minHeight: 48).contentShape(Rectangle())
        }.buttonStyle(.plain).foregroundStyle(selected == id ? Color.primary : Color.secondary)
            .accessibilityLabel(title).accessibilityAddTraits(selected == id ? .isSelected : [])
            .accessibilityIdentifier("main-tab-" + id)
    }
    private func plugin(_ page: PluginNavigationPage) -> some View {
        MobilePluginView(space: space, dark: colorScheme == .dark, open: open, pluginId: page.plugin, viewId: page.view)
            .navigationTitle(page.title).navigationBarTitleDisplayMode(.inline)
    }
}
