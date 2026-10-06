import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let status = UILabel()
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        status.text = tr("正在保存到 Eidos…"); status.numberOfLines = 0; status.textAlignment = .center
        status.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(status)
        let close = UIButton(type: .system); close.setTitle(tr("关闭"), for: .normal)
        close.addTarget(self, action: #selector(finish), for: .touchUpInside)
        close.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(close)
        NSLayoutConstraint.activate([status.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24), status.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24), status.centerYAnchor.constraint(equalTo: view.centerYAnchor), close.topAnchor.constraint(equalTo: status.bottomAnchor, constant: 20), close.centerXAnchor.constraint(equalTo: view.centerXAnchor)])
        Task { await capture() }
    }
    @objc private func finish() { extensionContext?.completeRequest(returningItems: nil) }
    private func capture() async {
        var directory: URL?
        do {
            let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
            guard !providers.isEmpty, providers.count <= 100 else { throw failure(tr("请选择 1 至 100 个项目")) }
            let id = UUID().uuidString
            let target = try ShareInbox.root().appendingPathComponent(id, isDirectory: true); directory = target
            try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
            var texts: [String] = []; var files: [String] = []; var total = 0
            for provider in providers {
                if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
                    let item = try await load(provider, UTType.fileURL.identifier)
                    guard let source = item as? URL else { throw failure(tr("无法读取分享文件")) }
                    let access = source.startAccessingSecurityScopedResource()
                    defer { if access { source.stopAccessingSecurityScopedResource() } }
                    let name = UUID().uuidString + "-" + source.lastPathComponent
                    try copy(source, to: target.appendingPathComponent(name), total: &total); files.append(name)
                } else if let type = provider.registeredTypeIdentifiers.first(where: { UTType($0)?.conforms(to: .image) == true || UTType($0)?.conforms(to: .pdf) == true }) {
                    let name = UUID().uuidString + "." + (UTType(type)?.preferredFilenameExtension ?? "bin")
                    let destination = target.appendingPathComponent(name)
                    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                        provider.loadFileRepresentation(forTypeIdentifier: type) { source, error in
                            do {
                                if let error { throw error }
                                guard let source else { throw self.failure(tr("无法读取附件")) }
                                let size = try source.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                                guard size <= 64 * 1024 * 1024 else { throw self.failure(tr("单文件不能超过 64 MiB")) }
                                try FileManager.default.copyItem(at: source, to: destination)
                                continuation.resume()
                            } catch { continuation.resume(throwing: error) }
                        }
                    }
                    total += try destination.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                    files.append(name)
                } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    if let url = try await load(provider, UTType.url.identifier) as? URL { texts.append(url.absoluteString) }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    if let text = try await load(provider, UTType.plainText.identifier) as? String { texts.append(text) }
                } else { throw failure(tr("不支持此分享类型，请通过文件导入")) }
                guard total <= 128 * 1024 * 1024 else { throw failure(tr("单次分享不能超过 128 MiB")) }
            }
            let text = texts.joined(separator: "\n\n")
            guard text.utf8.count <= 2 * 1024 * 1024, !text.isEmpty || !files.isEmpty else { throw failure(tr("分享内容为空或文本过大")) }
            let batch = SharedBatch(id: id, created: Date(), text: text, files: files)
            try JSONEncoder().encode(batch).write(to: target.appendingPathComponent("batch.json"), options: [.atomic, .completeFileProtectionUnlessOpen])
            status.text = tr("已保存。打开 Eidos 后选择保存位置。")
            finish()
        } catch {
            if let directory { try? FileManager.default.removeItem(at: directory) }
            status.text = error.localizedDescription
        }
    }
    private func load(_ provider: NSItemProvider, _ type: String) async throws -> NSSecureCoding {
        try await withCheckedThrowingContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type, options: nil) { value, error in
                if let error { continuation.resume(throwing: error) }
                else if let value { continuation.resume(returning: value) }
                else { continuation.resume(throwing: self.failure(tr("分享项目为空"))) }
            }
        }
    }
    private func copy(_ source: URL, to target: URL, total: inout Int) throws {
        let values = try source.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true, let size = values.fileSize, size <= 64 * 1024 * 1024 else { throw failure(tr("文件不可读或超过 64 MiB")) }
        total += size
        guard total <= 128 * 1024 * 1024 else { throw failure(tr("单次分享不能超过 128 MiB")) }
        try FileManager.default.copyItem(at: source, to: target)
    }
    private func failure(_ text: String) -> NSError { NSError(domain: "EidosShare", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
}
