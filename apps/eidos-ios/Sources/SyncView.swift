import SwiftUI

private final class SyncCancellation: @unchecked Sendable {
    let id = UUID().uuidString
    private let lock = NSLock()
    private var stopped = false
    var cancelled: Bool { lock.lock(); defer { lock.unlock() }; return stopped }
    func cancel() { lock.lock(); stopped = true; lock.unlock(); SyncHTTP.cancel(id); _ = eidos_ios_cancellation(id, 1) }
}

private enum PeerAvailability {
    case online(Set<String>), offline
    var isOnline: Bool { if case .online = self { return true }; return false }
    func canSync(_ space: String) -> Bool { if case .online(let spaces) = self { return spaces.contains(space) }; return false }
    func label(_ space: String? = nil) -> String {
        switch self {
        case .offline: return tr("暂不可连接 · 请确认同一 Wi-Fi，且电脑已开启设备同步")
        case .online(let spaces):
            if let space, !spaces.contains(space) { return tr("设备在线 · 此 Space 尚未开放同步") }
            return tr("在线 · 可以同步")
        }
    }
}

func deviceSpaceList(_ fingerprint: String, available: [PeerProfile], downloaded: [PeerProfile]) -> [PeerProfile] {
    let saved = downloaded.filter { $0.fingerprint == fingerprint }
    return saved + available.filter { remote in
        remote.fingerprint == fingerprint && !saved.contains { local in local.space == remote.space }
    }
}

private struct DownloadedPeerSpace {
    let entry: SpaceEntry
    let profile: PeerProfile
    let root: URL
    let synced: Date?
    let unsupportedFiles: [String]
}

struct SyncView: View {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var appLanguage = "system"
    @Environment(\.locale) private var appLocale
    let space: LocalSpace
    let onChange: () -> Void
    var embedded = false
    var onCreateSpace: () -> Void = {}
    var onDownloaded: (SpaceEntry) -> Void = { _ in }
    var onOpenSpace: (SpaceEntry) -> Void = { _ in }
    var spaceName = ""
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var profile: PeerProfile?
    @State private var busy = false
    @State private var checking = false
    @State private var message = ""
    @State private var waitingComputer: String?
    @State private var error: String?
    @State private var merge: MergeReview?
    @State private var forget = false
    @State private var forgetComputer: PeerProfile?
    @State private var devices: [PeerProfile] = []
    @State private var downloaded: [DownloadedPeerSpace] = []
    @AppStorage("sync-selected-device") private var selectedFingerprint = ""
    @State private var choosingDevice = false
    @State private var historySpace: LocalSpace?
    private var selectedDevice: PeerProfile? {
        devices.first { $0.fingerprint == selectedFingerprint } ?? devices.first
    }
    private var visibleSpaces: [PeerProfile] {
        guard let device = selectedDevice else { return [] }
        return deviceSpaceList(device.fingerprint, available: peerSpaces, downloaded: downloaded.map(\.profile))
    }
    @State private var availability: [String: PeerAvailability] = [:]
    @State private var availabilityCheck: SyncCancellation?
    @State private var peerSpaces: [PeerProfile] = []
    @State private var operation: SyncCancellation?
    @State private var enteringCode = false
    @State private var scanning = false
    @State private var addingComputer = false
    @State private var empty = false
    @State private var lastSynced: Date?
    @State private var history = false
    @State private var operationDevice: String?
    @State private var operationSpace: String?
    @State private var received: Int64 = 0
    @State private var sent: Int64 = 0
    @State private var transfer: PeerTransferProgress?
    var body: some View {
        NavigationStack {
            List {
                if devices.isEmpty { Section {
                    VStack(alignment: .leading, spacing: 20) {
                        if devices.isEmpty { pairingIntro }
                    }.padding(.vertical, 12)
                }.listRowSeparator(.hidden).disabled(busy) }
                if operationDevice == nil && (!message.isEmpty || error != nil) {
                    Section { operationStatus }.listRowSeparator(.hidden)
                }
                if let device = selectedDevice {
                    Section {
                        ForEach(visibleSpaces, id: \.space) { remote in
                            let local = downloaded.first { $0.profile.fingerprint == device.fingerprint && $0.profile.space == remote.space }
                            HStack(spacing: 12) {
                                Image(systemName: "folder").foregroundStyle(.secondary)
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(local?.entry.name ?? remote.spaceName ?? remote.space).font(.subheadline).fontWeight(.medium)
                                    Text(local.map { item in item.synced.map { tr("已下载 · ") + $0.formatted(date: .abbreviated, time: .shortened) } ?? tr("已下载 · 等待同步") } ?? tr("尚未下载到手机"))
                                        .font(.caption).foregroundStyle(.secondary)
                                    if local != nil, case .online(let offered)? = availability[device.fingerprint], !offered.contains(remote.space) {
                                        Text(tr("电脑尚未开放此 Space")).font(.caption).foregroundStyle(.secondary)
                                    }
                                    if let local, !local.unsupportedFiles.isEmpty {
                                        Text(local.unsupportedFiles.joined(separator: "、") + tr(" 已保留，需要电脑端支持的功能，暂无法在本机打开。"))
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                }.frame(maxWidth: .infinity, alignment: .leading)
                                Button(local == nil ? tr("下载") : tr("同步")) {
                                    if let local { syncDownloaded(local) } else { download(remote) }
                                }.buttonStyle(.bordered).tint(.primary)
                                    .disabled(busy || availability[device.fingerprint]?.canSync(remote.space) != true)
                                if let local {
                                    Menu {
                                        Button(tr("打开文件")) { onOpenSpace(local.entry) }
                                        Button(tr("本地版本")) {
                                            do { historySpace = try LocalSpace(root: local.root); history = true }
                                            catch { self.error = error.localizedDescription }
                                        }
                                    } label: { Image(systemName: "ellipsis").frame(minWidth: 32, minHeight: 44) }
                                    .accessibilityLabel(local.entry.name + tr(" 操作")).disabled(busy)
                                }
                            }.padding(.vertical, 10)
                            if operationDevice == device.fingerprint && operationSpace == remote.space { operationStatus }
                        }
                        if visibleSpaces.isEmpty {
                            Text(checking && availability[device.fingerprint] == nil ? tr("正在读取 Spaces…") : availability[device.fingerprint]?.isOnline == true ? tr("电脑尚未开放 Space") : tr("暂无可用 Space，请确认电脑已开放设备同步。"))
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                    } header: { Text(tr("这台电脑的 Spaces")).textCase(nil) }
                    Section {
                        Text(tr("已下载的 Space 可在「资料」中离线使用。")).font(.caption).foregroundStyle(.secondary)

                    }.listRowSeparator(.hidden)
                }
            }.listStyle(.plain).listItemTint(.primary).scrollContentBackground(.hidden)
                .background(Color(uiColor: .systemBackground))
                .safeAreaInset(edge: .top, spacing: 0) {
                    VStack(alignment: .leading, spacing: 8) {
                        if let device = selectedDevice {
                            HStack(spacing: 0) {
                                Button { choosingDevice = true } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: "laptopcomputer").foregroundStyle(.secondary)
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(device.name).font(.subheadline.weight(.medium)).lineLimit(2)
                                            Text(availability[device.fingerprint]?.label() ?? tr("正在检测连接…"))
                                                .font(.caption).foregroundStyle(.secondary)
                                        }.frame(maxWidth: .infinity, alignment: .leading)
                                        Image(systemName: "chevron.down").font(.caption).foregroundStyle(.secondary)
                                    }.padding(.vertical, 12).contentShape(Rectangle())
                                }.buttonStyle(.plain).accessibilityIdentifier("sync-device-selector").disabled(busy)
                                Menu {
                                    Button(tr("刷新设备状态"), systemImage: "arrow.clockwise") { refreshAvailability() }.disabled(checking)
                                    Button(tr("解除配对"), role: .destructive) { forgetComputer = device }
                                } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44).contentShape(Rectangle()) }
                                    .accessibilityLabel(tr("设备操作")).disabled(busy)
                            }
                            Divider()

                        }
                    }.padding(.horizontal, 16).padding(.bottom, 8).background(Color(uiColor: .systemBackground))
                }
                .navigationTitle(tr("同步")).navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if busy, let operation { Button(tr("停止")) { operation.cancel(); message = tr("正在停止，请稍候…") } }
                    else if !embedded { Button(tr("完成")) { dismiss(); onChange() } }
                }
                .interactiveDismissDisabled(busy)
                .task { refreshConnection() }
                .fullScreenCover(isPresented: $addingComputer) { pairingFlow }
                .sheet(isPresented: Binding(get: { enteringCode && !addingComputer }, set: { enteringCode = $0 })) { manualPairing }
                .fullScreenCover(isPresented: Binding(get: { scanning && !addingComputer }, set: { scanning = $0 })) {
                    PeerScannerView(onCode: { value in code = value; pair() }, onManualCode: { enteringCode = true })
                }
                .sheet(isPresented: $history) { if let historySpace { HistoryView(space: historySpace) } }
                .sheet(isPresented: $choosingDevice) {
                    NavigationStack {
                        List {
                            ForEach(devices, id: \.fingerprint) { device in
                                Button {
                                    selectedFingerprint = device.fingerprint; choosingDevice = false
                                    message = ""; error = nil
                                } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: "laptopcomputer").foregroundStyle(.secondary)
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(device.name)
                                            Text(availability[device.fingerprint]?.label() ?? tr("正在检测连接…")).font(.caption).foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                        if device.fingerprint == selectedDevice?.fingerprint { Image(systemName: "checkmark") }
                                    }.padding(.vertical, 8)
                                }.tint(.primary)
                            }
                        }.listStyle(.plain).navigationTitle(tr("选择设备")).navigationBarTitleDisplayMode(.inline)
                            .safeAreaInset(edge: .bottom) {
                                Button(tr("连接新设备"), systemImage: "plus") { choosingDevice = false; message = ""; error = nil; operationDevice = nil; operationSpace = nil; addingComputer = true }
                                    .buttonStyle(.plain).frame(maxWidth: .infinity, minHeight: 44).padding()
                                    .background(Color(uiColor: .systemBackground))
                            }
                    }.presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
                }
                .fullScreenCover(isPresented: Binding(get: { scanning && !addingComputer }, set: { scanning = $0 })) {
                    PeerScannerView(onCode: { value in code = value; pair() }, onManualCode: { enteringCode = true })
                }
                .alert(tr("解除与「{0}」的配对？", forgetComputer?.name ?? tr("电脑")), isPresented: Binding(get: { forgetComputer != nil }, set: { if !$0 { forgetComputer = nil } }), presenting: forgetComputer) { device in
                    Button(tr("取消"), role: .cancel) { forgetComputer = nil }
                    Button(tr("解除配对"), role: .destructive) {
                        // Alert dismissal clears forgetComputer before this action runs.
                        // Serialize removal with availability probes that save credentials.
                        availabilityCheck?.cancel()
                        run(success: tr("已解除配对"), initialMessage: tr("正在解除配对")) { _ in
                            try PeerSync.forgetDevice(device.fingerprint)
                        }
                    }
                } message: { _ in Text(tr("本机文件和历史版本会保留。重新连接需要再次配对。")) }
                .alert(tr("断开此 Space 的连接？"), isPresented: $forget) {
                    Button(tr("取消"), role: .cancel) {}
                    Button(tr("断开"), role: .destructive) {
                        do {
                            try DeviceSecrets.remove(PeerSync.key(space)); profile = nil; lastSynced = nil; message = ""
                            UserDefaults.standard.removeObject(forKey: "peer-last-sync:" + LocalSpace.storageIdentity(space.root))
                        } catch { self.error = error.localizedDescription }
                    }
                } message: { Text(tr("本机文件和历史版本会保留。")) }
        }
    }
    private var operationStatus: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let waitingComputer {
                Text(tr("等待电脑授权")).font(.title2).fontWeight(.medium)
                Text(waitingComputer).font(.headline)
            }
            if let error { Text(error.replacingOccurrences(of: "Space is closed", with: tr("电脑已关闭此 Space。请重新打开并开启设备同步。"))).foregroundStyle(.red) }
            else if !message.isEmpty { Text(tr(message)) }
            if busy {
                if let value = transfer?.transfer(for: message), let fraction = value.fraction, let total = value.total {
                    ProgressView(value: fraction)
                    Text("\(tr(message == "发送本机版本" ? "上传" : "下载")) \(Int(fraction * 100))% · \(ByteCountFormatter.string(fromByteCount: value.transferred, countStyle: .file)) / \(ByteCountFormatter.string(fromByteCount: total, countStyle: .file))")
                        .monospacedDigit().foregroundStyle(.secondary)
                } else {
                    ProgressView().frame(maxWidth: .infinity, alignment: .leading)
                    if message == "获取清单" { Text(tr("正在计算本次下载总量")).foregroundStyle(.secondary) }
                    if received > 0 || sent > 0 {
                        Text(tr("已接收 {0} · 已发送 {1}", ByteCountFormatter.string(fromByteCount: received, countStyle: .file), ByteCountFormatter.string(fromByteCount: sent, countStyle: .file)))
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }.font(waitingComputer == nil ? .caption : .body)
            .task(id: operation?.id) {
                guard let operation else { return }
                while !Task.isCancelled {
                    transfer = PeerTransferProgress.read(operation.id)
                    message = transfer?.stage(for: message) ?? message
                    try? await Task.sleep(for: .milliseconds(250))
                }
            }
    }
    private var pairingIntro: some View {
        VStack(alignment: .leading, spacing: 16) {
                        if true {
                            deviceRelationship(tr("你的电脑"))
                            Text(addingComputer ? tr("连接另一台电脑") : tr("连接你的电脑")).font(.title2).fontWeight(.medium)
                            Text(tr("无需账号。在同一 Wi-Fi 下连接，笔记与文件都留在你的设备上。"))
                                .font(.subheadline).foregroundStyle(.secondary)
                            Text(tr("在电脑打开「设置 → 设备」，显示配对二维码。")).font(.caption).foregroundStyle(.secondary)
                            Button { scanning = true } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: "qrcode.viewfinder")
                                    Text(tr("扫描配对二维码"))
                                }.foregroundStyle(Color(uiColor: .systemBackground)).frame(maxWidth: .infinity, minHeight: 36)
                            }.buttonStyle(.borderedProminent).buttonBorderShape(.roundedRectangle(radius: 12)).tint(.primary).disabled(busy)
                            Button(tr("使用配对码")) { enteringCode = true }.buttonStyle(.plain).disabled(busy)

                        }
        }
    }
    private var pairingFlow: some View {
        NavigationStack {
            ScrollView { pairingIntro.padding(24); if operationDevice == nil { operationStatus.padding(.horizontal, 24) } }
                .navigationTitle(tr("连接新设备")).navigationBarTitleDisplayMode(.inline)
                .toolbar { Button(tr("返回同步")) { operation?.cancel(); addingComputer = false } }
                .interactiveDismissDisabled(busy)
                .sheet(isPresented: $enteringCode) { manualPairing }
                .fullScreenCover(isPresented: $scanning) { PeerScannerView(onCode: { value in code = value; pair() }, onManualCode: { enteringCode = true }) }
        }
    }
    private var manualPairing: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(tr("粘贴电脑显示的配对码，连接后在电脑上允许此设备。")).font(.subheadline)
                                VStack(alignment: .leading, spacing: 16) {
                                    TextField(tr("粘贴电脑上的配对码"), text: $code, axis: .vertical)
                                        .lineLimit(2...5).autocorrectionDisabled().textInputAutocapitalization(.never)
                                        .accessibilityIdentifier("peer-pairing-code")
                                    PasteButton(payloadType: String.self) { values in
                                        if let value = values.first { code = value }
                                    }
                                    Button(tr("连接电脑")) { pair() }
                                        .buttonStyle(.borderedProminent)
                                        .disabled(code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
                                }
                    if operationDevice == nil { operationStatus }
                }.padding(24)
            }.navigationTitle(tr("输入配对码")).navigationBarTitleDisplayMode(.inline)
                .toolbar { Button(busy ? tr("取消配对") : tr("返回")) { if busy { operation?.cancel() }; enteringCode = false } }
                .interactiveDismissDisabled(busy)
        }
    }
    private func connectionTitle(_ profile: PeerProfile) -> String {
        if case .offline? = availability[profile.fingerprint] { return tr("电脑暂时离线") }
        return tr("已连接你的电脑")
    }
    private func deviceRelationship(_ computer: String) -> some View {
        HStack(spacing: 16) {
            deviceEndpoint(computer, "laptopcomputer")
            Image(systemName: "arrow.left.arrow.right").font(.body).foregroundStyle(.secondary)
            deviceEndpoint(tr("这台手机"), "iphone")
        }.padding(.vertical, 24).accessibilityElement(children: .combine)
    }
    private func deviceEndpoint(_ name: String, _ symbol: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: symbol).font(.system(size: 30, weight: .light)).foregroundStyle(.secondary)
                .frame(height: 34).accessibilityHidden(true)
            Text(name).font(.caption).multilineTextAlignment(.center)
        }.frame(maxWidth: .infinity)
    }
    private func pairingStep(_ number: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 16) {
            Text(number).font(.caption).foregroundStyle(.secondary).padding(.top, 3)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.subheadline).fontWeight(.medium)
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }.padding(.vertical, 4)
    }
    private func refreshConnection() {
        LocalSpace.io.async {
            do {
                let saved = try PeerSync.load(space), review = try MergeReview.load(space)
                let paired = try PeerSync.pairedDevices()
                let catalog = try SpaceCatalog()
                let localSpaces = try catalog.spaces.compactMap { entry -> DownloadedPeerSpace? in
                    let root = catalog.root(entry)
                    let local = try LocalSpace(root: root)
                    guard let link = try PeerSync.downloadedProfile(local, entry: entry, catalog: catalog, devices: paired) else { return nil }
                    return DownloadedPeerSpace(entry: entry, profile: link, root: root,
                        synced: UserDefaults.standard.object(forKey: "peer-last-sync:" + LocalSpace.storageIdentity(root)) as? Date,
                        unsupportedFiles: PeerSync.downloadWarnings(local))
                }
                let vacant = try space.files().isEmpty && !FileManager.default.fileExists(atPath: space.root.appendingPathComponent(".graft").path)
                let date = UserDefaults.standard.object(forKey: "peer-last-sync:" + LocalSpace.storageIdentity(space.root)) as? Date
                DispatchQueue.main.async {
                    profile = saved; merge = review; devices = paired; downloaded = localSpaces; empty = vacant; lastSynced = date
                    if !busy && paired.contains(where: { availability[$0.fingerprint] == nil }) { refreshAvailability() }
                }
            } catch { DispatchQueue.main.async { self.error = error.localizedDescription } }
        }
    }
    private func run(success: String = tr("已同步，可离线使用"), initialMessage: String = tr("正在连接…"), synced: Bool = false, target: LocalSpace? = nil, cancellation: SyncCancellation = SyncCancellation(), _ action: @escaping (@escaping (String) -> Void) throws -> Void) {
        guard !busy else { return }; busy = true; error = nil; message = initialMessage
        let targetSpace = target ?? space
        operation = cancellation; received = 0; sent = 0; transfer = nil
        SyncHTTP.begin(cancellation.id)
        _ = eidos_ios_cancellation(cancellation.id, 0)
        LocalSpace.io.async {
            Runtime.cancellation = cancellation.id
            Runtime.peerTransfer = { rx, tx in DispatchQueue.main.async { received = max(received, rx); sent = max(sent, tx) } }
            defer { Runtime.cancellation = nil; Runtime.peerTransfer = nil; SyncHTTP.end(cancellation.id); _ = eidos_ios_cancellation(cancellation.id, 2) }
            var failure: Error?
            do {
                guard !cancellation.cancelled else { throw LocalError.message(tr("已停止")) }
                try action { value in DispatchQueue.main.async { message = value; transfer = nil } }
            }
            catch { failure = error }
            let next = try? MergeReview.load(targetSpace)
            let saved = try? PeerSync.load(targetSpace)
            let cancelled = cancellation.cancelled
            let text = cancelled ? nil : failure?.localizedDescription
            DispatchQueue.main.async {
                busy = false; operation = nil; profile = saved; merge = next; error = text; waitingComputer = nil
                if cancelled { message = operationDevice == nil ? tr("配对已取消") : tr("已停止。本机文件已保留，可重新同步。") }
                else if text == nil {
                    message = success
                    if synced {
                        if let saved { if case .online(var spaces)? = availability[saved.fingerprint] { spaces.insert(saved.space); availability[saved.fingerprint] = .online(spaces) } }
                        lastSynced = Date()
                        UserDefaults.standard.set(lastSynced, forKey: "peer-last-sync:" + LocalSpace.storageIdentity(targetSpace.root))
                        onChange()
                    }
                }
                refreshConnection()
            }
        }
    }
    private func pair() {
        guard !busy else { return }
        operationDevice = nil; operationSpace = nil
        let entered = code
        let deviceName = String(decoding: UIDevice.current.name.utf16.prefix(80), as: UTF16.self)
        let cancellation = SyncCancellation()
        run(success: tr("请选择要下载的 Space"), cancellation: cancellation) { progress in
            let invitation = try PeerInvitation.parse(entered)
            let tunnel = try PeerTunnel(url: invitation.url, fingerprint: invitation.fingerprint)
            defer { tunnel.close() }
            var accepted = false
            defer {
                if !accepted {
                    // Cancellation stops normal requests; this bounded cleanup still
                    // uses the QR-pinned tunnel to dismiss the pending desktop prompt.
                    let previous = Runtime.cancellation
                    Runtime.cancellation = nil
                    _ = try? tunnel.call("/pair/cancel", token: invitation.ticket, timeout: 3)
                    Runtime.cancellation = previous
                }
            }
            let deadline = Date().addingTimeInterval(300)
            var token: String?
            while Date() < deadline {
                guard !cancellation.cancelled else { throw LocalError.message(tr("已停止配对")) }
                let result: [String: Any]
                do { result = try tunnel.call("/pair", token: invitation.ticket, body: ["name": deviceName.isEmpty ? "iOS · Eidos" : deviceName], timeout: 10) }
                catch { if error.localizedDescription == "Pairing code expired" { throw LocalError.message(tr("配对码已过期，请在电脑上生成新的配对码")) }; throw error }
                if result["state"] as? String == "approved" { token = result["token"] as? String; accepted = true; break }
                if result["state"] as? String == "rejected" { throw LocalError.message(tr("电脑已拒绝此设备，请在电脑上生成新的配对码后重试")) }
                DispatchQueue.main.async { waitingComputer = invitation.name }
                progress(tr("请到「{0}」的 Eidos Lite 配对弹窗点击「接受」。若未看到弹窗，请点击系统通知，或打开「设置 → 设备」。", invitation.name))
                Thread.sleep(forTimeInterval: 1)
            }
            guard let token, !token.isEmpty else { throw LocalError.message(tr("设备配对超时，请重新生成配对码")) }
            let profile = PeerProfile(url: invitation.url, fingerprint: invitation.fingerprint, token: token, name: invitation.name, space: invitation.space)
            try PeerSync.saveDevice(profile)
            let available = try PeerSync.availableSpaces(profile)
            DispatchQueue.main.async { peerSpaces = peerSpaces.filter { $0.fingerprint != profile.fingerprint } + available; selectedFingerprint = profile.fingerprint; availability[profile.fingerprint] = .online(Set(available.map(\.space))); enteringCode = false; addingComputer = false; code = "" }
        }
    }
    private func refreshAvailability() {
        guard !checking && !busy else { return }
        checking = true
        let cancellation = SyncCancellation()
        availabilityCheck = cancellation
        SyncHTTP.begin(cancellation.id)
        let paired = devices.sorted { $0.fingerprint == selectedDevice?.fingerprint && $1.fingerprint != selectedDevice?.fingerprint }
        LocalSpace.io.async {
            Runtime.cancellation = cancellation.id
            defer {
                Runtime.cancellation = nil
                SyncHTTP.end(cancellation.id)
                _ = eidos_ios_cancellation(cancellation.id, 2)
                DispatchQueue.main.async { checking = false; availabilityCheck = nil }
            }
            for device in paired {
                guard !cancellation.cancelled else { break }
                do {
                    let spaces = try PeerSync.availableSpaces(device)
                    DispatchQueue.main.async {
                        guard !cancellation.cancelled, devices.contains(where: { $0.fingerprint == device.fingerprint }) else { return }
                        availability[device.fingerprint] = .online(Set(spaces.map(\.space)))
                        peerSpaces = peerSpaces.filter { $0.fingerprint != device.fingerprint } + spaces
                    }
                } catch {
                    DispatchQueue.main.async {
                        guard !cancellation.cancelled, devices.contains(where: { $0.fingerprint == device.fingerprint }) else { return }
                        availability[device.fingerprint] = .offline
                    }
                }
            }
        }
    }
    private func syncDownloaded(_ item: DownloadedPeerSpace) {
        operationDevice = item.profile.fingerprint; operationSpace = item.profile.space
        do {
            let target = try LocalSpace(root: item.root)
            run(success: item.entry.name + tr(" 已同步，可离线使用"), synced: true, target: target) { progress in
                defer {
                    if target.root != space.root {
                        _ = try? Runtime.call(target.root, "graft:close")
                        _ = try? Runtime.call(target.root, "close")
                    }
                }
                try PeerSync.sync(target, profile: item.profile, progress: progress)
            }
        } catch { self.error = error.localizedDescription }
    }
    private func download(_ remote: PeerProfile) {
        operationDevice = remote.fingerprint; operationSpace = remote.space
        run { progress in
            let entry = try PeerSync.download(remote, progress: progress)
            DispatchQueue.main.async { onDownloaded(entry) }
        }
    }
}
