// Human-written behavior, shared by the English and Chinese reference renderer.
export const notes = {
  "PluginEvents.on": [
    "The event name determines the listener parameter type. Returns a Disposable; dispose() is idempotent. Unknown event names, non-function listeners and undeclared event permissions throw synchronously.",
    "事件名决定监听器参数类型。返回 Disposable，dispose() 可重复调用。未知事件名、非函数监听器和未声明的事件权限会同步抛错。",
  ],
  'PluginEventMap."file.opened"': [
    "Successful file-open metadata. See FileOpenedEvent.",
    "成功打开文件的元数据，字段见 FileOpenedEvent。",
  ],
  "FileOpenedEvent.id": ["Host-generated event identity, usable for deduplication.", "宿主生成的事件标识，可用于去重。"],
  "FileOpenedEvent.path": ["File path relative to the current Space.", "相对当前 Space 的文件路径。"],
  "FileOpenedEvent.timestamp": ["Time of the successful open, in Unix milliseconds.", "成功打开的时间，单位为 Unix 毫秒。"],
  "PluginManifest.background": [
    "A separate Worker-style entry. network: true permits public HTTPS/WSS after approval; up to eight exact networkOrigins optionally restrict it. bluetooth: true grants the selected device, optionally narrowed by a service whitelist. Device IDs are chosen by the host. API 3.6 adds autoStart: true for approved startup on Space opening, and fileHistory: true for file-open metadata in the owner window and Space; fileHistory does not grant file contents.",
    "独立的 Worker 风格入口。network: true 经授权允许公网 HTTPS/WSS，可用最多八个精确 networkOrigins 收窄。bluetooth: true 授权选中设备，可用服务白名单限制。设备 ID 由宿主选择。API 3.6 支持 autoStart: true，经授权随 Space 打开自动启动；fileHistory: true 监听所属窗口和 Space 的文件打开元数据，不授予文件内容。",
  ],
  "PluginBackground.isRunning": [
    "Lite API 3.6. Returns true only for a ready, unrevoked run in the current window and Space. Does not start a background or prompt for permission.",
    "Lite API 3.6。仅当前窗口和 Space 存在已就绪、未撤销的实例时返回 true。不会启动后台或请求授权。",
  ],
  "BackgroundHost.spaceId": [
    "Lite API 3.6. Background modules access this host object through globalThis.ctx. Identifies the current Space, not a filesystem path.",
    "Lite API 3.6。后台模块通过 globalThis.ctx 访问宿主对象。此字段标识当前 Space，不是文件系统路径。",
  ],
  "BackgroundHost.instanceId": [
    "Unique to this run. Changes after stop/restart; remains stable when Views close.",
    "唯一标识本次运行，停止并重启后改变，关闭 View 不改变。",
  ],
  "BackgroundHost.events": [
    "Requires background.fileHistory: true and host approval. events.on(\"file.opened\", listener) returns a disposable listener for successful file opens, with no initial snapshot or replay. Events contain metadata only and stop on revocation. See the background guide for counting rules.",
    "需声明 background.fileHistory: true 并经宿主授权。events.on(\"file.opened\", listener) 返回可取消的成功打开监听，不提供初始快照或历史回放。事件仅含元数据，撤销后停止发送。统计口径见后台指南。",
  ],
  "BackgroundHost.storage": [
    "Requires storage.maxBytes. Uses the same plugin-private device-local binary store and quota as Views/actions. Shared across Spaces; use spaceId in keys when separation is needed. Concurrent read-modify-write operations are not transactions.",
    "需声明 storage.maxBytes。与 View/action 共用插件私有、本机二进制存储和配额。跨 Space 共享，需要区分时在键中包含 spaceId。并发读改写不是事务。",
  ],
  "PluginManifest.fileTemplates": [
    "Static UTF-8 templates, up to 256 KiB each. The referenced document View must have a matching file/open placement.",
    "静态 UTF-8 模板，每个最多 256 KiB。引用的 document View 必须有匹配的 file/open 挂载声明。",
  ],
  "PluginManifest.description": [
    "An optional nonempty plain-text line, at most 1024 UTF-16 code units.",
    "可选的非空单行纯文本，最多 1024 个 UTF-16 代码单元。",
  ],
  "PluginBackground.start": [
    "Start the plugin background with host approval. Reuses an existing run.",
    "经宿主授权启动插件 background，已有运行实例时复用。",
  ],
  "PluginBackground.stop": [
    "Stop the current run and release its resources and grants.",
    "停止当前实例并释放其资源和授权。",
  ],
  "PluginBackground.requestDevice": [
    "Open the native BLE picker. Confirmation replaces the current run; cancellation leaves it running.",
    "打开原生 BLE 选择器。确认会替换当前实例，取消则保留。",
  ],
  "PluginBackground.postMessage": [
    "Send a raw JSON-compatible message; completion does not mean the background finished processing it.",
    "发送兼容 JSON 的原始消息；调用完成不代表 background 已处理完毕。",
  ],
  "PluginBackground.request": [
    "Send a request envelope and wait for a response with the same requestId. Rejects on timeout.",
    "发送请求封套并等待相同 requestId 的响应，超时会拒绝。",
  ],
  "PluginBackground.onMessage": [
    "Subscribe to raw messages from the current run. Dispose when the caller closes; resubscribe after restarting the background.",
    "订阅当前实例的原始消息。调用方关闭时释放订阅，background 重启后重新订阅。",
  ],
  "TextDocument.read": [
    "Read the current working-copy snapshot, including unsaved changes.",
    "读取当前工作副本快照，包含未保存的修改。",
  ],
  "TextDocument.observe": [
    "Return an initial snapshot together with a subscription to later changes.",
    "返回初始快照和后续变化的订阅。",
  ],
  "TextDocument.edit": [
    "Replace working-copy text when expectedVersion matches. A stale result leaves newer content intact.",
    "expectedVersion 匹配时替换工作副本文本，stale 结果不会覆盖较新的内容。",
  ],
  "TextDocument.save": [
    "Save the working copy. A disk conflict returns conflict and preserves the draft.",
    "保存工作副本；磁盘冲突时返回 conflict 并保留草稿。",
  ],
  "TextDocument.undo": [
    "Undo an edit and return the resulting snapshot.",
    "撤销编辑并返回结果快照。",
  ],
  "TextDocument.redo": [
    "Redo an edit and return the resulting snapshot.",
    "重做编辑并返回结果快照。",
  ],
  "PluginFileSystem.readText": [
    "Read file text, up to 2 MiB.",
    "读取文件文本，上限 2 MiB。",
  ],
  "PluginFileSystem.writeText": [
    "Write text, creating parent directories when needed.",
    "写入文本，按需创建父目录。",
  ],
  "PluginFileSystem.readBinary": [
    "Read file bytes, up to 16 MiB.",
    "读取文件字节，上限 16 MiB。",
  ],
  "PluginFileSystem.writeBinary": [
    "Write file bytes, up to 16 MiB.",
    "写入文件字节，上限 16 MiB。",
  ],
  "PluginFileSystem.delete": [
    "Delete a permitted file. Open working copies are protected with BUSY.",
    "删除有权限的文件，已打开的工作副本受 BUSY 保护。",
  ],
  "PluginFileSystem.rename": [
    "Move a regular file within the Space. Existing targets fail with ALREADY_EXISTS.",
    "在 Space 内移动普通文件，目标已存在时返回 ALREADY_EXISTS。",
  ],
  "PluginFileSystem.list": [
    "List permitted files; defaults to recursive, file-only listing. Use includeDirectories for directory trees.",
    "列出有权限的文件，默认递归且仅包含文件；目录树使用 includeDirectories。",
  ],
  "PluginFileSystem.stat": [
    "Read file metadata; return null if the file is absent.",
    "读取文件元数据，不存在时返回 null。",
  ],
  "PluginFileSystem.getUrl": [
    "Get a streaming media URL; omitting path uses the bound file where supported.",
    "获取流式媒体地址，在支持的绑定文件上下文中可省略 path。",
  ],
  "PluginFileSystem.watch": [
    "Subscribe to file or directory changes. Release the returned subscription when finished.",
    "订阅文件或目录变化，使用结束后释放返回的订阅。",
  ],
  "PluginStorage.list": [
    "List stored objects, optionally filtered by key prefix.",
    "列出存储对象，可按键前缀过滤。",
  ],
  "PluginStorage.read": [
    "Read object bytes, or null for an absent key.",
    "读取对象字节，键不存在时返回 null。",
  ],
  "PluginStorage.write": [
    "Write an object within the plugin's storage quota.",
    "在插件存储配额内写入对象。",
  ],
  "PluginStorage.delete": [
    "Delete a private stored object.",
    "删除私有存储对象。",
  ],
  "PluginFileMeta.read": [
    "Read the complete namespace object; a missing namespace returns an empty object.",
    "读取完整命名空间对象，缺失时返回空对象。",
  ],
  "PluginFileMeta.patch": [
    "Set or remove selected keys while preserving all other keys.",
    "设置或删除指定键，同时保留其他键。",
  ],
  "PluginSettings.get": ["Read a declared setting.", "读取已声明的设置。"],
  "PluginSettings.set": [
    "Set a declared setting from an ordinary action context.",
    "从普通命令上下文写入已声明的设置。",
  ],
  "PluginSettings.reset": [
    "Reset a setting to its declared default.",
    "将设置恢复为声明的默认值。",
  ],
  "HostUI.notify": ["Show a host notification.", "显示宿主通知。"],
  "HostUI.exportFile": [
    "Ask the host to export generated bytes; cancellation is a result, not a failure.",
    "请求宿主导出生成的字节，取消是正常返回结果。",
  ],
  "HostUI.openFile": [
    "Open an existing Space-relative file in the host.",
    "在宿主中打开已有的 Space 相对路径文件。",
  ],
  "HostUI.navigate": [
    "Navigate to a plugin page View, optionally supplying its route.",
    "跳转到插件的页面 View，可传入页面路由。",
  ],
  "HostResources.listViews": [
    "List available file previews or saved Eidos views for a relative path.",
    "列出相对路径可用的文件预览或已保存的 Eidos 视图。",
  ],
  "HostResources.mount": [
    "Mount a host-rendered read-only resource in a rectangular element.",
    "在矩形元素中挂载由宿主渲染的只读资源。",
  ],
  "ResourceMount.refresh": [
    "Reload the referenced resource.",
    "重新加载引用的资源。",
  ],
  "ExplorerContext.read": [
    "Read the current explorer display state synchronously.",
    "同步读取当前目录树展示状态。",
  ],
  "ExplorerContext.watch": [
    "Subscribe to state changes without an initial callback.",
    "订阅状态变化，不触发初始回调。",
  ],
  "EidosSchema.listTables": [
    "List tables in the current Eidos file.",
    "列出当前 Eidos 文件中的表格。",
  ],
  "EidosSchema.readTable": [
    "Read the selected table's fields within the current file.",
    "读取当前文件中指定表格的字段。",
  ],
  "EidosTable.readContext": [
    "Read fields and saved-view information for the bound table.",
    "读取绑定表格的字段与已保存视图信息。",
  ],
  "EidosTable.readRows": [
    "Read a page of records from the bound table.",
    "分页读取绑定表格中的记录。",
  ],
  "EidosTable.aggregate": [
    "Aggregate records using field IDs and the selected metric.",
    "按字段 ID 和指定指标聚合记录。",
  ],
  "EidosTable.setViewConfig": [
    "Replace the saved view's plugin configuration. Merge retained keys before calling.",
    "替换已保存视图的插件配置，调用前应自行合并需要保留的键。",
  ],
  "EidosTable.openRecord": ["Open a record in the host.", "在宿主中打开记录。"],
  "EidosTable.watch": [
    "Receive invalidation hints; reread current data after a notification.",
    "接收失效通知，收到后重新读取当前数据。",
  ],
  "EidosConfig.read": [
    "Read this plugin's configuration and version for a table.",
    "读取指定表格中本插件的配置及版本。",
  ],
  "EidosConfig.write": [
    "Replace configuration if expectedVersion matches; a stale version fails with STALE_REVISION.",
    "expectedVersion 匹配时替换配置，版本过期会返回 STALE_REVISION。",
  ],
  "EidosConfig.watch": [
    "Subscribe to invalidation hints without an initial value. Notifications may include unrelated changes.",
    "订阅失效通知，不包含初始值；通知可能包含无关变更。",
  ],
  "PluginNetwork.read": [
    "Deprecated. Use global fetch; for byte ranges, send a Range header and verify a 206 response before consuming it. Retained for compatibility with existing plugins.",
    "已废弃。使用全局 fetch；读取字节范围时发送 Range 请求头，并在消费响应前检查状态码为 206。此接口仅为已有插件保留兼容。",
  ],
  "PluginConnections.isConfigured": [
    "Check whether the user configured the declared connection.",
    "检查用户是否已配置声明的连接。",
  ],
  "PluginConnections.request": [
    "Send a JSON request using host-managed connection credentials.",
    "通过宿主管理的连接凭据发送 JSON 请求。",
  ],
}
