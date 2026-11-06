import SwiftUI

enum AppLanguage {
    static let key = "app-language"
    static let defaults = UserDefaults(suiteName: "group.space.eidos.ios") ?? .standard
    static let choices = ["system", "zh", "en"]
    static func resolve(_ preference: String, languages: [String]) -> String {
        if ["zh", "en"].contains(preference) { return preference }
        let language = languages.first?.lowercased().split(whereSeparator: { $0 == "-" || $0 == "_" }).first
        return language == "zh" ? "zh" : "en"
    }
    static var locale: String {
        resolve(defaults.string(forKey: key) ?? "system", languages: Locale.preferredLanguages)
    }
    static let english: [String: String] = {
        guard let url = Bundle.main.url(forResource: "en", withExtension: "json", subdirectory: "locales"),
              let data = try? Data(contentsOf: url),
              let result = try? JSONDecoder().decode([String: String].self, from: data) else { return [:] }
        return result
    }()
    static let customSyncEnglish: [String: String] = [
        "自定义服务器": "Custom server",
        "使用自己部署的 Graft 服务器，无需登录账号。": "Use your own Graft server without signing in.",
        "连接你自己部署的 Graft 服务器，无需 Eidos 账号。服务器访问密钥与 Space 同步密码保存在此设备的 Keychain。": "Connect to your own Graft server without an Eidos account. The server access key and Space sync password are stored in this device's Keychain.",
        "服务器地址": "Server address",
        "服务器访问密钥": "Server access key",
        "访问密钥（留空保留已保存密钥）": "Access key (leave empty to keep saved key)",
        "读取服务器 Spaces": "Browse server Spaces",
        "服务器 Spaces": "Server Spaces",
        "服务器尚无 Space": "No Spaces on this server",
        "服务器已连接，请选择 Space 或上传当前 Space": "Server connected. Select a Space or upload the current Space.",
        "普通 Graft 仓库": "Plain Graft repository",
        "端到端加密": "End-to-end encrypted",
        "本机 Space 名称": "Local Space name",
        "此 Space 的同步密码": "This Space's sync password",
        "设置此 Space 的同步密码": "Set this Space's sync password",
        "下载为新 Space": "Download as a new Space",
        "更新此 Space 的密钥与密码": "Update this Space's key and password",
        "上传当前 Space": "Upload current Space",
        "创建新的加密 Space 并上传本机文件。其他设备需要相同的同步密码。": "Create a new encrypted Space and upload local files. Other devices need the same sync password.",
        "开启此 Space 同步": "Enable sync for this Space",
        "断开此 Space 的服务器连接": "Disconnect this Space from the server",
        "断开此 Space 的服务器连接？": "Disconnect this Space from the server?",
        "首次连接空仓库可发送本机版本。服务器已有更新时会拒绝覆盖，请使用立即同步。": "Send local history to an empty repository for the first upload. Existing remote updates are protected; use Sync now to receive them.",
        "高级：连接普通 Graft 仓库": "Advanced: connect a plain Graft repository",
        "仅用于不使用 Eidos 加密仓库管理协议的服务器。输入完整仓库地址；不会发送 Eidos 账号凭据。": "For servers without Eidos encrypted repository management. Enter the complete repository URL. Eidos account credentials are never sent.",
        "保存当前 Space 的连接": "Save connection for current Space",
        "普通仓库更新凭据时需要重新输入令牌；留空会清除旧令牌。更换仓库前请先断开。": "Reenter the token when updating a plain connection; an empty token clears the previous one. Disconnect before changing repositories.",
        "HTTP 会明文传输服务器访问密钥和普通仓库内容。加密同步需要 HTTPS，HTTP 仅支持本机回环测试。": "HTTP sends the server access key and plain repository content without transport encryption. Encrypted sync requires HTTPS; HTTP is supported only for loopback testing.",
        "加密同步需要 HTTPS；HTTP 仅支持本机回环测试。请为服务器配置 HTTPS。": "Encrypted sync requires HTTPS. HTTP is supported only for loopback testing. Configure HTTPS on your server.",
        "已完成，本机文件可离线使用": "Completed. Local files are available offline.",
        "请输入完整的 Graft 仓库 HTTP 或 HTTPS 地址，不含账号、查询或片段": "Enter a complete HTTP or HTTPS Graft repository URL without credentials, query or fragment.",
        "请输入服务器 HTTP 或 HTTPS 地址，不含路径、账号或查询": "Enter an HTTP or HTTPS server origin without a path, credentials or query.",
        "请输入服务器访问密钥（至少 32 个字符）": "Enter the server access key (at least 32 characters).",
        "请输入此 Space 的同步密码": "Enter this Space's sync password.",
        "请使用上次初始化的服务器和同步密码继续连接": "Continue with the same server and sync password used for the interrupted setup.",
        "无效服务器地址": "Invalid server address",
        "服务器返回不可信地址": "The server returned an untrusted address.",
        "服务器协议不兼容或发现信息不可信": "The server protocol is incompatible or its discovery metadata is untrusted.",
        "服务器仓库列表无效": "The server repository list is invalid.",
        "服务器加密身份不受支持": "The server encryption identity is unsupported.",
        "服务器加密身份已变化，请检查连接": "The server encryption identity changed. Check the connection.",
        "服务器未创建新的加密仓库": "The server did not create a new encrypted repository.",
        "Space 名称需要 1–80 个字符": "Use a Space name of 1–80 characters.",
        "此 Space 已连接其他远端，请先断开原连接": "This Space is connected to another remote. Disconnect it first.",
        "此 Space 已连接账号服务，请先断开原连接": "This Space is connected to an account service. Disconnect it first.",
        "此 Space 使用加密同步，请在服务器 Spaces 中更新凭据": "This Space uses encrypted sync. Update its credentials in Server Spaces.",
        "请先连接自定义服务器": "Connect a custom server first.",
        "请先保存或处理本地草稿": "Save or resolve local drafts first.",
        "远端配置已变化，请重新检查连接": "The remote configuration changed. Check the connection again.",
        "下载状态需要检查，本机 Space 未被替换": "The download state needs review. Your local Space was not replaced.",
        "下载目录已有文件，本机 Space 未被替换": "The download directory already contains files. Your local Space was not replaced.",
        "此服务器 Space 已下载，请从 Space 列表打开": "This server Space is already downloaded. Open it from the Space list.",
    ]
}

func tr(_ source: String, _ arguments: Any...) -> String {
    let template = AppLanguage.locale == "en" ? AppLanguage.english[source] ?? AppLanguage.customSyncEnglish[source] ?? source : source
    let pattern = try! NSRegularExpression(pattern: "\\{(\\d+)\\}")
    let result = NSMutableString(string: template)
    for match in pattern.matches(in: template, range: NSRange(template.startIndex..., in: template)).reversed() {
        let index = Int((template as NSString).substring(with: match.range(at: 1)))!
        if arguments.indices.contains(index) { result.replaceCharacters(in: match.range, with: String(describing: arguments[index])) }
    }
    return result as String
}

struct LanguageSettings: View {
    @AppStorage(AppLanguage.key, store: AppLanguage.defaults) private var language = "system"
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form {
                Picker(tr("语言"), selection: $language) {
                    Text(tr("跟随系统")).tag("system")
                    Text("中文").tag("zh")
                    Text("English").tag("en")
                }.pickerStyle(.inline)
            }
            .navigationTitle(tr("语言"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(tr("完成")) { dismiss() } } }
        }
    }
}
