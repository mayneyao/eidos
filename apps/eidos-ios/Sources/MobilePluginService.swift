import Foundation
import Security
import zlib

private final class PluginDownload: NSObject, URLSessionDataDelegate {
    let limit: Int
    let package: Bool
    var data = Data()
    var response: HTTPURLResponse?
    var failure: Error?
    let finished = DispatchSemaphore(value: 0)
    init(limit: Int, package: Bool) { self.limit = limit; self.package = package }
    static func trusted(_ url: URL) -> Bool {
        url.scheme == "https" && url.user == nil && url.password == nil && url.port == nil &&
        ["raw.githubusercontent.com","github.com","release-assets.githubusercontent.com","objects.githubusercontent.com"].contains(url.host ?? "")
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(package && request.url.map(Self.trusted) == true ? request : nil)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        self.response = response as? HTTPURLResponse
        completionHandler(response.expectedContentLength > limit ? .cancel : .allow)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        if self.data.count + data.count > limit { failure = LocalError.message(tr("响应超过大小限制")); dataTask.cancel() }
        else { self.data.append(data) }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        failure = failure ?? error; finished.signal()
    }
    static func request(_ request: URLRequest, limit: Int, package: Bool = false) throws -> Data {
        guard let url = request.url, url.scheme == "https", url.user == nil, url.password == nil,
              !package || trusted(url) else { throw LocalError.message(tr("不允许的网络地址")) }
        let delegate = PluginDownload(limit: limit, package: package)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 25
        configuration.timeoutIntervalForResource = 30
        let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        session.dataTask(with: request).resume()
        guard delegate.finished.wait(timeout: .now() + 35) == .success else { throw LocalError.message(tr("请求超时")) }
        if let error = delegate.failure { throw error }
        guard let status = delegate.response?.statusCode, (200...299).contains(status) else { throw LocalError.message(tr("网络请求失败")) }
        return delegate.data
    }
}

final class MobilePluginService {
    let space: LocalSpace
    let directory: URL
    var prepared: [String: Any]?
    let preferences = UserDefaults.standard
    init(space: LocalSpace) {
        self.space = space
        directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Plugins")
        let legacy = "plugins." + LocalSpace.digest(Data(space.root.path.utf8)) + "."
        let stable = "plugins." + LocalSpace.digest(Data(LocalSpace.storageIdentity(space.root).utf8)) + "."
        if legacy != stable {
            for (name, value) in preferences.dictionaryRepresentation() where name.hasPrefix(legacy) {
                let destination = stable + name.dropFirst(legacy.count)
                if preferences.object(forKey: destination) == nil { preferences.set(value, forKey: destination) }
                preferences.removeObject(forKey: name)
            }
        }
    }
    private func json(_ data: Data) throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw LocalError.message(tr("无效插件数据")) }
        return value
    }
    private func id(_ value: Any?) throws -> String {
        guard let value = value as? String, value.range(of: "^[a-z][a-z0-9.-]{1,127}$", options: .regularExpression) != nil else { throw LocalError.message(tr("无效插件 ID")) }
        return value
    }
    private func records() -> [[String: Any]] { preferences.array(forKey: "plugins.installed") as? [[String: Any]] ?? [] }
    private func key(_ id: String, _ name: String) -> String { "plugins." + LocalSpace.digest(Data(LocalSpace.storageIdentity(space.root).utf8)) + "." + id + "." + name }
    private func program(_ id: String) throws -> [String: Any] {
        guard let record = records().first(where: { ($0["manifest"] as? [String:Any])?["id"] as? String == id }),
              (record["manifest"] as? [String:Any])?["kind"] as? String != "theme",
              let revision = record["revision"] as? String, preferences.string(forKey: key(id,"enabled")) == revision else { throw LocalError.message(tr("插件未启用")) }
        guard revision.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw LocalError.message(tr("插件版本无效，请重新安装")) }
        let target = directory.appendingPathComponent(revision + ".json")
        if !FileManager.default.fileExists(atPath: target.path) {
            // Older installations stored packages per Space despite a global install index.
            // Recover only a digest-verified package from our private application storage.
            let roots = directory.deletingLastPathComponent().appendingPathComponent("Spaces")
            for root in (try? FileManager.default.contentsOfDirectory(at: roots, includingPropertiesForKeys: nil)) ?? [] {
                let source = root.appendingPathComponent("Plugins").appendingPathComponent(revision + ".json")
                if let data = try? Data(contentsOf: source), LocalSpace.digest(data) == revision {
                    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                    try data.write(to: target, options: [.atomic, .completeFileProtectionUnlessOpen])
                    break
                }
            }
        }
        guard FileManager.default.fileExists(atPath: target.path) else { throw LocalError.message(tr("插件包缺失，请在插件管理中重新安装")) }
        let data = try Data(contentsOf: target)
        guard LocalSpace.digest(data) == revision else { throw LocalError.message(tr("插件校验失败")) }
        return try json(data)
    }
    func navigationPages() throws -> [PluginNavigationPage] {
        let installed = try handle("list", [:]) as? [[String: Any]] ?? []
        var seen = Set<String>()
        return installed.filter { $0["enabled"] as? Bool == true }.flatMap { record -> [PluginNavigationPage] in
            guard let manifest = record["manifest"] as? [String: Any], let plugin = manifest["id"] as? String else { return [] }
            let views = manifest["views"] as? [[String: Any]] ?? []
            return (manifest["placements"] as? [[String: Any]] ?? []).compactMap { placement in
                guard placement["location"] as? String == "navigation", let viewID = placement["view"] as? String,
                      let view = views.first(where: { $0["id"] as? String == viewID && $0["kind"] as? String == "page" }),
                      let title = view["title"] as? String else { return nil }
                let page = PluginNavigationPage(plugin: plugin, view: viewID, title: title)
                return seen.insert(page.id).inserted ? page : nil
            }
        }.sorted { $0.id < $1.id }
    }
    func fileHookPlan(_ event: [String: Any]) throws -> [String: Any]? {
        let installed = (try handle("list", [:]) as? [[String: Any]] ?? []).filter { $0["enabled"] as? Bool == true }
            .sorted { (($0["manifest"] as? [String: Any])?["id"] as? String ?? "") < (($1["manifest"] as? [String: Any])?["id"] as? String ?? "") }
        for record in installed {
            guard let manifest = record["manifest"] as? [String: Any], let plugin = manifest["id"] as? String,
                  let path = event["path"] as? String else { continue }
            let hooks = manifest["hooks"] as? [[String: Any]] ?? []
            for hook in hooks where hook["event"] as? String == event["type"] as? String &&
                (hook["extensions"] as? [String] ?? []).contains(where: { path.lowercased().hasSuffix($0.lowercased()) }) {
                do {
                    let package = try program(plugin)
                    guard let modules = package["modules"] as? [String: String], let entry = manifest["extension"] as? String, let code = modules[entry] else { continue }
                    var settings: [String: Any] = [:]
                    for (name, declaration) in manifest["settings"] as? [String: [String: Any]] ?? [:] {
                        settings[name] = preferences.object(forKey: key(plugin, name)) ?? declaration["default"]
                    }
                    func ids(_ kind: String) -> [String] { (manifest[kind] as? [[String: Any]] ?? []).compactMap { $0["id"] as? String } }
                    let input: [String: Any] = ["event": event, "settings": settings, "hook": hook["id"] ?? "", "hooks": ids("hooks"), "actions": ids("actions"), "formatters": ids("formatters")]
                    let result = try Runtime.call(space.root, "runFileHook", ["code": code, "input": input, "declaration": hook]) as? [String: Any]
                    guard preferences.string(forKey: key(plugin, "enabled")) == record["revision"] as? String else { continue }
                    if let plan = result?["plan"] as? [String: Any], !plan.isEmpty { return plan }
                } catch { NSLog("Eidos hook skipped %@: %@", plugin, error.localizedDescription) }
            }
        }
        return nil
    }
    func fileViews(_ file: URL) throws -> [PluginNavigationPage] {
        guard !LocalSpace.isDirectory(file) else { return [] }
        let installed = try handle("list", [:]) as? [[String: Any]] ?? []
        return installed.filter { $0["enabled"] as? Bool == true }.flatMap { record -> [PluginNavigationPage] in
            guard let manifest = record["manifest"] as? [String: Any], let plugin = manifest["id"] as? String else { return [] }
            let views = manifest["views"] as? [[String: Any]] ?? []
            return views.compactMap { view in
                guard view["kind"] as? String == "file", let id = view["id"] as? String,
                      let title = view["title"] as? String,
                      (manifest["placements"] as? [[String: Any]] ?? []).contains(where: {
                          $0["location"] as? String == "file/open" && $0["view"] as? String == id &&
                          ($0["extensions"] as? [String] ?? []).contains("." + file.pathExtension.lowercased())
                      }) else { return nil }
                return PluginNavigationPage(plugin: plugin, view: id, title: title)
            }
        }.sorted { $0.id < $1.id }
    }
    private func path(_ value: Any?, allowRoot: Bool = false) throws -> URL {
        guard let path = value as? String, !path.hasPrefix("/"), !path.contains("\\"), !path.contains(":"),
              !path.split(separator:"/").contains(where: { $0.hasPrefix(".") }) else { throw LocalError.message(tr("无效文件路径")) }
        return try space.checked(space.root.appendingPathComponent(path), allowRoot: allowRoot)
    }
    private func stat(_ url: URL) throws -> [String:Any] {
        let info = try url.resourceValues(forKeys: [.isDirectoryKey,.fileSizeKey,.contentModificationDateKey])
        return ["path":String(url.path.dropFirst(space.root.path.count+1)), "name":url.lastPathComponent,
                "kind":info.isDirectory == true ? "directory" : "file", "size":info.fileSize ?? 0,
                "modifiedAtMs":(info.contentModificationDate?.timeIntervalSince1970 ?? 0)*1000,
                "extension":url.pathExtension.isEmpty ? "" : "."+url.pathExtension,"isDirectory":info.isDirectory == true]
    }
    private func secret(_ account: String, save: String? = nil) throws -> String? {
        let query: [String:Any] = [kSecClass as String:kSecClassGenericPassword, kSecAttrService as String:"space.eidos.plugins", kSecAttrAccount as String:account]
        if let save {
            let data = Data(save.utf8)
            let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String:data] as CFDictionary)
            if status == errSecItemNotFound {
                var insert = query; insert[kSecValueData as String] = data
                insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
                guard SecItemAdd(insert as CFDictionary,nil) == errSecSuccess else { throw LocalError.message(tr("无法保存连接密钥")) }
            } else if status != errSecSuccess { throw LocalError.message(tr("无法保存连接密钥")) }
            return nil
        }
        var read = query; read[kSecReturnData as String] = true; read[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(read as CFDictionary,&result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw LocalError.message(tr("无法读取连接密钥")) }
        return String(data:data,encoding:.utf8)
    }
    private func registry() throws -> [[String:Any]] {
        let url = URL(string:"https://raw.githubusercontent.com/eidos-space/registry/main/plugins.registry.json")!
        let registry = try json(PluginDownload.request(URLRequest(url:url),limit:2*1024*1024,package:true))
        guard registry["schemaVersion"] as? Int == 1, let entries = registry["plugins"] as? [[String:Any]], entries.count <= 1000 else { throw LocalError.message(tr("无效插件市场")) }
        return entries
    }
    private func unpack(_ data: Data) throws -> Data {
        guard data.count <= 16*1024*1024 else { throw LocalError.message(tr("插件超过 16 MiB")) }
        var stream = z_stream()
        guard inflateInit2_(&stream,31,ZLIB_VERSION,Int32(MemoryLayout<z_stream>.size)) == Z_OK else { throw LocalError.message(tr("无法读取插件压缩包")) }
        defer { inflateEnd(&stream) }
        return try data.withUnsafeBytes { input in
            stream.next_in = UnsafeMutablePointer(mutating:input.bindMemory(to:Bytef.self).baseAddress)
            stream.avail_in = uInt(data.count)
            var output = Data(), buffer = [UInt8](repeating:0,count:65536)
            while true {
                let status = buffer.withUnsafeMutableBytes { bytes -> Int32 in
                    stream.next_out = bytes.bindMemory(to:Bytef.self).baseAddress; stream.avail_out = 65536
                    return inflate(&stream,Z_NO_FLUSH)
                }
                let count = 65536-Int(stream.avail_out)
                guard output.count+count <= 16*1024*1024 else { throw LocalError.message(tr("插件解压后超过 16 MiB")) }
                output.append(contentsOf:buffer.prefix(count))
                if status == Z_STREAM_END { return output }
                guard status == Z_OK, count > 0 || stream.avail_in > 0 else { throw LocalError.message(tr("插件压缩包已损坏")) }
            }
        }
    }
    func prepareImport(_ url: URL) throws -> [String:Any] {
        prepared = nil
        guard (try url.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? Int.max) <= 16*1024*1024 else { throw LocalError.message(tr("插件超过 16 MiB")) }
        let data = try unpack(Data(contentsOf:url))
        let value = try json(data)
        guard String(data:data,encoding:.utf8) != nil, let manifest = value["manifest"] as? [String:Any] else { throw LocalError.message(tr("无效插件包")) }
        // The trusted bundled workbench runs canonical source/manifest validation before install.
        prepared = ["data":data,"manifest":manifest]
        return ["manifest":manifest,"raw":String(decoding:data,as:UTF8.self),"revision":LocalSpace.digest(data),"origin":tr("本地文件（未通过市场校验）")]
    }
    func handle(_ method: String, _ p: [String:Any]) throws -> Any {
        switch method {
        case "readme":
            let pluginId = try id(p["id"])
            let cacheKey = "plugin-readme:" + pluginId
            var cached = preferences.dictionary(forKey:cacheKey)
            if let fetchedAt = cached?["fetchedAt"] as? Double, Date().timeIntervalSince1970 - fetchedAt < 86400 {
                cached?["cached"] = true
                return cached ?? [:]
            }
            do {
                guard let entry = try registry().first(where:{ $0["id"] as? String == pluginId }),
                      let repo = entry["repo"] as? String,
                      repo.range(of:"^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$",options:.regularExpression) != nil else { return NSNull() }
                var failure: Error = LocalError.message(tr("说明加载失败"))
                for branch in ["main","master"] {
                    do {
                        let base = "https://raw.githubusercontent.com/\(repo)/\(branch)/"
                        let data = try PluginDownload.request(URLRequest(url:URL(string:base + "README.md")!),limit:1024*1024)
                        guard let markdown = String(data:data,encoding:.utf8) else { throw LocalError.message(tr("无效 README 编码")) }
                        let result: [String:Any] = ["markdown":markdown,"baseUrl":base,"fetchedAt":Date().timeIntervalSince1970]
                        preferences.set(result,forKey:cacheKey)
                        return result
                    } catch { failure = error }
                }
                throw failure
            } catch {
                if var cached { cached["cached"] = true; return cached }
                throw error
            }
        case "list":
            return records().map { record -> [String:Any] in
                var record = record
                let id = (record["manifest"] as? [String:Any])?["id"] as? String ?? ""
                record["enabled"] = (record["manifest"] as? [String:Any])?["kind"] as? String != "theme" && preferences.string(forKey:key(id,"enabled")) == record["revision"] as? String
                return record
            }
        case "market": return try registry()
        case "prepare":
            prepared = nil
            let pluginId = try id(p["id"])
            guard let entry = try registry().first(where: { $0["id"] as? String == pluginId }),
                  let repo = entry["repo"] as? String, let tag = entry["tag"] as? String,
                  let asset = entry["asset"] as? String, let hash = entry["sha256"] as? String,
                  repo.range(of:"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$",options:.regularExpression) != nil,
                  tag.range(of:"^[A-Za-z0-9_.-]+$",options:.regularExpression) != nil,
                  asset == pluginId + "-" + (entry["version"] as? String ?? "") + ".eidos-plugin",
                  let url = URL(string:"https://github.com/\(repo)/releases/download/\(tag)/\(asset)") else { throw LocalError.message(tr("无效市场条目")) }
            let bytes = try PluginDownload.request(URLRequest(url:url),limit:16*1024*1024,package:true)
            guard LocalSpace.digest(bytes) == hash else { throw LocalError.message(tr("插件校验和不匹配")) }
            let data = try unpack(bytes), value = try json(data)
            guard String(data:data,encoding:.utf8) != nil, let manifest = value["manifest"] as? [String:Any],
                  manifest["id"] as? String == pluginId, manifest["version"] as? String == entry["version"] as? String else { throw LocalError.message(tr("插件身份不匹配")) }
            prepared = ["data":data,"manifest":manifest]
            return ["manifest":manifest,"raw":String(decoding:data,as:UTF8.self),"revision":LocalSpace.digest(data),"origin":tr("插件市场（SHA-256 已匹配）")]
        case "install":
            guard let prepared, let data = prepared["data"] as? Data, let manifest = prepared["manifest"] as? [String:Any] else { throw LocalError.message(tr("请先检查插件包")) }
            let pluginId = try id(manifest["id"]), revision = LocalSpace.digest(data)
            guard p["revision"] as? String == revision else { throw LocalError.message(tr("插件包已变更，请重新检查后安装")) }
            try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
            try data.write(to:directory.appendingPathComponent(revision+".json"),options:[.atomic,.completeFileProtectionUnlessOpen])
            var records = records().filter { ($0["manifest"] as? [String:Any])?["id"] as? String != pluginId }
            records.append(["manifest":manifest,"revision":revision])
            preferences.set(records,forKey:"plugins.installed"); self.prepared = nil
            // This service retains the originating LocalSpace; selection changes cannot
            // redirect the permission grant. Grants remain bound to reviewed bytes.
            if manifest["kind"] as? String != "theme" {
                preferences.set(revision,forKey:key(pluginId,"enabled"))
            }
            return NSNull()
        case "enable":
            let pluginId = try id(p["id"])
            guard let record = records().first(where: { ($0["manifest"] as? [String:Any])?["id"] as? String == pluginId }) else { throw LocalError.message(tr("插件未安装")) }
            if (record["manifest"] as? [String:Any])?["kind"] as? String == "theme", p["enabled"] as? Bool == true {
                throw LocalError.message(tr("移动端不支持插件主题"))
            }
            preferences.set(p["enabled"] as? Bool == true ? record["revision"] : nil,forKey:key(pluginId,"enabled"))
            return NSNull()
        case "uninstall":
            let pluginId = try id(p["id"])
            preferences.set(records().filter { ($0["manifest"] as? [String:Any])?["id"] as? String != pluginId },forKey:"plugins.installed")
            preferences.removeObject(forKey:key(pluginId,"enabled"))
            for name in preferences.dictionaryRepresentation().keys where name.hasPrefix(key(pluginId,"")) { preferences.removeObject(forKey:name) }
            let query: [String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"space.eidos.plugins",kSecReturnAttributes as String:true,kSecMatchLimit as String:kSecMatchLimitAll]
            var credentials: CFTypeRef?
            if SecItemCopyMatching(query as CFDictionary,&credentials) == errSecSuccess {
                for record in credentials as? [[String:Any]] ?? [] {
                    if let account = record[kSecAttrAccount as String] as? String, account.hasPrefix(key(pluginId,"connection:")) {
                        SecItemDelete([kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"space.eidos.plugins",kSecAttrAccount as String:account] as CFDictionary)
                    }
                }
            }
            return NSNull()
        case "package": return try program(id(p["id"]))
        case "files":
            var items = [[String:Any]]()
            func visit(_ directory: URL, depth: Int) throws {
                guard depth <= 32, items.count <= 10000 else { throw LocalError.message(tr("目录过大")) }
                if !FileManager.default.fileExists(atPath:directory.path) { return }
                for file in try space.files(in:directory) {
                    items.append(try stat(file))
                    if p["recursive"] as? Bool == true && LocalSpace.isDirectory(file) { try visit(file,depth:depth+1) }
                }
            }
            try visit(path(p["path"] ?? "",allowRoot:true),depth:0)
            return items
        case "stat": return (try? stat(path(p["path"]))) ?? NSNull() as Any
        case "readText": return try LocalSpace.readMarkdown(path(p["path"]))
        case "readBinary":
            let url = try path(p["path"])
            guard (try url.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? Int.max) <= 16*1024*1024 else { throw LocalError.message(tr("文件超过 16 MiB")) }
            return try Data(contentsOf:url).base64EncodedString()
        case "writeText":
            let url = try path(p["path"])
            guard url.pathExtension.lowercased() != "eidos", let text = p["text"] as? String, text.utf8.count <= 2*1024*1024 else { throw LocalError.message(tr("无效文本写入")) }
            return try LocalSpace.io.sync {
                try FileManager.default.createDirectory(at:url.deletingLastPathComponent(),withIntermediateDirectories:true)
                if FileManager.default.fileExists(atPath:url.path) {
                    let original = try LocalSpace.readMarkdown(url)
                    _ = try LocalSpace.saveMarkdown(url,text:text,expectedDigest:original["digest"] as! String)
                } else { try Data(text.utf8).write(to:url,options:[.atomic,.completeFileProtectionUnlessOpen]) }
                return NSNull()
            }
        case "runtime":
            let url = try path(p["path"])
            guard url.pathExtension.lowercased() == "eidos", let operation = p["method"] as? String else { throw LocalError.message(tr("无效 Runtime 请求")) }
            return try LocalSpace.io.sync { try Runtime.call(url,operation,p["request"] ?? [:]) }
        case "settingGet": return preferences.object(forKey:key(try id(p["id"]),p["key"] as? String ?? "")) ?? NSNull()
        case "settingSet":
            let key = key(try id(p["id"]),p["key"] as? String ?? "")
            preferences.set(p["value"] is NSNull ? nil : p["value"],forKey:key)
            return NSNull()
        case "connectionSave", "connectionStatus", "connectionRequest":
            let pluginId = try id(p["id"]), connection = p["connection"] as? String ?? ""
            let manifest = try program(pluginId)["manifest"] as? [String:Any]
            guard let declaration = (manifest?["connections"] as? [String:[String:Any]])?[connection], let declaredURL = declaration["url"] as? String else { throw LocalError.message(tr("连接未声明")) }
            let account = key(pluginId,"connection:"+connection)
            if method == "connectionSave" {
                let target = p["url"] as? String ?? declaredURL
                guard declaration["configurable"] as? Bool == true || target == declaredURL,
                      let url = URL(string:target), url.scheme == "https", url.user == nil, url.password == nil, url.host != nil else { throw LocalError.message(tr("无效连接 URL")) }
                let data = try JSONSerialization.data(withJSONObject:["url":target,"token":p["token"] as? String ?? ""])
                _ = try secret(account,save:String(decoding:data,as:UTF8.self)); return NSNull()
            }
            let saved = try secret(account)
            if method == "connectionStatus" { return saved != nil }
            guard let saved else { throw LocalError.message(tr("请先配置连接")) }
            let config = try json(Data(saved.utf8))
            guard let target = config["url"] as? String, let url = URL(string:target),
                  declaration["configurable"] as? Bool == true || target == declaredURL else { throw LocalError.message(tr("连接授权已变更")) }
            var request = URLRequest(url:url); request.httpMethod = "POST"
            request.setValue("application/json",forHTTPHeaderField:"Content-Type")
            request.setValue("Bearer " + (config["token"] as? String ?? ""),forHTTPHeaderField:"Authorization")
            let body = try JSONSerialization.data(withJSONObject:p["body"] ?? [:])
            guard body.count <= 1024*1024 else { throw LocalError.message(tr("请求超过大小限制")) }
            request.httpBody = body
            return try json(PluginDownload.request(request,limit:2*1024*1024))
        default: throw LocalError.message(tr("不支持的插件操作"))
        }
    }
}
