import SwiftUI

@main
struct EidosApp: App {
    var body: some Scene { WindowGroup { SpaceView() } }
}

struct SpaceView: View {
    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var controller = EditorController()
    @State private var space: LocalSpace?
    @State private var selection: URL?
    @State private var directory: URL?
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Group {
                if let file = selection {
                    EditorView(file: file, dark: colorScheme == .dark, controller: controller) { selection = nil }
                        .id(file)
                        .navigationTitle(file.lastPathComponent)
                        .toolbar { ToolbarItem(placement: .topBarLeading) { Button("返回") { controller.leave() } } }
                } else if let space {
                    FileBrowser(space: space, directory: $directory) { selection = $0 }
                } else if let error { Text(error).foregroundStyle(.red) }
                else { ProgressView("正在打开本机 Space…") }
            }
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                guard space == nil else { return }
                do { let local = try LocalSpace(); space = local; directory = local.root }
                catch { self.error = error.localizedDescription }
            }
        }
    }
}
