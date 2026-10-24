// Editorial metadata only. Signatures and member lists come from the SDK AST.
export const pages = [
  [
    "manifest",
    "Manifest",
    "Manifest",
    [
      "PluginManifest",
      "ViewDeclaration",
      "ViewConfiguration",
      "ActionDeclaration",
      "FormatterDeclaration",
      "FileHookDeclaration",
      "Placement",
      "ThemeDeclaration",
      "FileTemplateDeclaration",
      "SettingDeclaration",
      "BluetoothServicePermission",
    ],
    "views",
    "Declarations request capabilities; the host validates and grants access. apiVersion is the package protocol; requires.pluginApi is the minimum host API. Access defaults to read. Background requires Lite API 3.4; templates 3.2; hooks 3.3; file metadata and explorer 3.1.",
    "声明用于申请能力，宿主负责校验和授权。apiVersion 是包协议版本，requires.pluginApi 是宿主 API 最低版本。access 默认为 read。Background 要求 Lite API 3.4，模板要求 3.2，hooks 要求 3.3，文件属性和目录树要求 3.1。",
  ],
  [
    "context",
    "Context",
    "上下文",
    [
      "Mount",
      "Activate",
      "CommonContext",
      "Lifetime",
      "ViewContext",
      "ActionContext",
      "ExtensionContext",
      "ViewCapabilities",
      "CommonCapabilities",
      "TextFileViewContext",
      "TableFileViewContext",
      "TableActionContext",
    ],
    "views",
    "The host supplies contexts to mount, activate and action handlers. Optional capabilities depend on declarations, placement and host support. Check availability before use. Register disposables with subscriptions; signal ends with the caller scope, not with a shared background connection.",
    "宿主向 mount、activate 和命令处理器传入上下文。可选能力取决于声明、挂载位置和宿主支持，调用前应检查是否存在。将订阅加入 subscriptions；signal 随调用方作用域结束，共享 background 连接有独立的生命周期。",
  ],
  [
    "document",
    "document",
    "document",
    ["TextDocument"],
    "files",
    "Available to document file Views and document actions. Declare document; writes require access: write. observe returns the initial snapshot and a subscription. edit changes the working copy and returns stale on a version mismatch; save returns conflict on a disk conflict. Neither result is an exception. Preserve drafts and serialize edits.",
    "提供给 document 文件 View 和文档命令。声明 document，写入还需 access: write。observe 返回初始快照与订阅。edit 修改工作副本，版本不匹配返回 stale；save 遇到磁盘冲突返回 conflict。这两种结果不是异常。应保留草稿并串行编辑。",
  ],
  [
    "fs",
    "fs",
    "fs",
    ["PluginFileSystem"],
    "files",
    "Lite filesystem access is host-mediated. Space-wide reads require workspace.files; writes also require contribution write access. Text reads are limited to 2 MiB; binary I/O to 16 MiB. getUrl streams media. Direct mutation of an open working copy fails with BUSY; rename rejects existing targets with ALREADY_EXISTS.",
    "Lite 文件访问由宿主管理。跨 Space 文件读取需 workspace.files，写入还需贡献点的 write 权限。文本读取限制 2 MiB，二进制 I/O 限制 16 MiB。getUrl 提供流式媒体地址。直接修改已打开的工作副本会返回 BUSY，rename 遇到已有目标会返回 ALREADY_EXISTS。",
  ],
  [
    "filemeta",
    "filemeta",
    "filemeta",
    ["PluginFileMeta"],
    "files",
    "Lite API 3.1. Declare workspace.filemeta.namespaces; patch also needs filemeta.write and contribution write access. Paths are Space-relative. Missing namespaces return an empty object. patch preserves other keys; null is a value and remove deletes keys. Envelopes are limited to 1 MiB; filesystem limits can be smaller. Metadata grants do not grant content writes.",
    "Lite API 3.1。声明 workspace.filemeta.namespaces；patch 还需 filemeta.write 和贡献点的 write 权限。路径相对 Space。缺失命名空间返回空对象。patch 保留其他键；null 是值，remove 才删除键。数据上限 1 MiB，文件系统可能有更低限制。属性权限不包含文件内容写入。",
  ],
  [
    "background",
    "background",
    "background",
    ["PluginBackground", "BackgroundHost"],
    "background",
    "Lite API 3.4; requires manifest.background. bluetooth: true requests all GATT services on the user-selected device; an optional services whitelist narrows access. Omitted operation fields allow all supported operations; explicit fields deny omitted operations. network: true requests public HTTPS/WSS; networkOrigins optionally restricts it and takes precedence. start requests host approval and starts on demand. Initial approval is cancellable, has a five-minute deadline, and does not consume the command execution budget. Closing the initiating caller cancels pending startup; after readiness, closing a View does not stop the background. stop releases the run and connections. request uses matching requestId envelopes and a 30-second reply timeout after startup. Messages must be JSON-compatible. onMessage belongs to the current run and caller; subscribe again after restarting. requestDevice has a five-minute deadline: cancellation preserves the run, confirmation replaces it with a fresh device grant. Network and BLE permissions are independent of browser permissions.",
    "Lite API 3.4，需声明 manifest.background。bluetooth: true 申请用户选中设备的全部 GATT 服务，可用 services 白名单收窄；省略操作字段允许设备支持的全部操作，显式声明任意操作后未声明项禁止。network: true 申请公网 HTTPS/WSS，networkOrigins 白名单可选且优先。start 请求宿主授权并按需启动。首次授权可取消，最多等待五分钟，不计入命令执行预算。关闭发起调用方会取消尚未完成的启动；就绪后关闭 View 不停止 background。stop 释放运行实例和连接。request 使用匹配 requestId 的消息封套，启动后的回复超时为 30 秒。消息必须兼容 JSON。onMessage 属于当前运行实例和调用方，重启后需重新订阅。requestDevice 的截止时间为五分钟：取消保留当前实例，确认则用新设备授权替换实例。网络和 BLE 权限独立于浏览器权限。",
  ],
  [
    "events",
    "Host events",
    "宿主事件",
    ["PluginEvents", "PluginEventMap", "FileOpenedEvent"],
    "background",
    `Lite plugin API **3.6.0**. Background modules access host events through \`ctx.events\` on the injected \`BackgroundHost\`. Views and actions do not expose this interface; they communicate with the background through its message API.

## Supported events

| Event | Payload | Permission |
| --- | --- | --- |
| \`file.opened\` | \`FileOpenedEvent\` | \`background.fileHistory: true\` and host approval |

\`file.opened\` reports a successful workbench file open in the background's current window and Space. Content reads, resource previews, View rerenders and failed opens do not emit this event. It provides metadata only, without file-content access.

## Delivery and lifetime

Events are live notifications, without an initial snapshot, durable delivery or historical replay. Subscribing does not start a background or prompt for permission. Use \`background.autoStart\` for approved startup when the Space opens.

Each subscription can be disposed independently. Stopping the background destroys its subscriptions; revoking access ends delivery. Closing a View does not stop background listeners. A throwing listener does not prevent other listeners from running.

See the [background guide](/plugins/background/) for a subscription example and the Recent History plugin workflow.`,
    `Lite 插件 API **3.6.0**。后台模块通过宿主注入的 \`BackgroundHost\` 上的 \`ctx.events\` 订阅事件。View 和 action 暂不提供此接口，通过后台消息 API 与 background 通信。

## 支持的事件

| 事件 | 参数类型 | 权限 |
| --- | --- | --- |
| \`file.opened\` | \`FileOpenedEvent\` | \`background.fileHistory: true\` 及宿主授权 |

\`file.opened\` 表示后台所属窗口、当前 Space 中的一次成功文件打开。读取内容、预览资源、View 重渲染和打开失败不产生此事件。事件仅提供元数据，不授予文件内容访问权。

## 交付与生命周期

事件为实时通知，不提供初始快照、持久交付或历史回放。订阅不会启动后台，也不会弹出授权请求。需要随 Space 打开自动运行时，声明 \`background.autoStart\` 并由用户授权。

每次订阅可以独立取消。后台停止时所有订阅随之销毁，权限撤销后停止交付。关闭 View 不影响后台监听。一个监听器抛错不会阻止其他监听器执行。

订阅示例和最近打开插件的使用流程见[后台指南](/zh-cn/plugins/background/)。`,
  ],
  [
    "eidos",
    "eidos",
    "eidos",
    ["EidosCapabilities", "EidosSchema", "EidosTable", "EidosConfig"],
    "tables",
    "Declare eidos/schema, eidos/table or eidos/config. Lite supports all three; Serve supports table. Table operations target the bound table and use field IDs. Configuration writes require write access and expectedVersion; stale versions must be reconciled. watch sends invalidation hints, without an initial value; reread after notifications. setViewConfig replaces configuration rather than merging it.",
    "声明 eidos/schema、eidos/table 或 eidos/config。Lite 支持三者，Serve 支持 table。表格操作针对绑定表格并使用字段 ID。配置写入需 write 权限和 expectedVersion，版本过期时需重新读取并协调。watch 发送失效通知，不含初始值，收到通知后应重新读取。setViewConfig 替换配置，不会合并。",
  ],
  [
    "storage",
    "storage",
    "storage",
    ["PluginStorage"],
    "services",
    "Declare storage.maxBytes. Binary objects are private to the plugin and local to the device, persisting across View and app restarts. read returns null for an absent key. Writes are subject to the declared quota and host limits.",
    "声明 storage.maxBytes。二进制对象是插件私有的本机数据，跨 View 和应用重启保留。不存在的键读取为 null，写入受声明配额和宿主限制。",
  ],
  [
    "network",
    "Credential connections and legacy networking",
    "凭据连接与旧网络接口",
    ["PluginNetwork", "PluginConnections"],
    "services",
    "Use the global [fetch API](/plugins/api/fetch/) for HTTP requests in Lite Views, ordinary commands and backgrounds. Use connections when the host must store credentials and send an authenticated JSON request without exposing those credentials to plugin code; fetch does not inherit connection credentials. Connections are available in Views and ordinary actions, not backgrounds, and requests end with their caller. network.read is deprecated and retained only for existing plugins. New code uses fetch, including Range headers for byte-range requests. It follows browser.network or browser.networkOrigins grants, with an explicit whitelist taking precedence.",
    "Lite View、普通命令和 background 的 HTTP 请求统一使用全局 [fetch API](/zh-cn/plugins/api/fetch/)。需要由宿主保存凭据并代发 JSON 请求、避免插件代码接触密钥时，使用 connections；fetch 不会自动使用连接凭据。Connections 提供给 View 和普通命令，不提供给 background，请求随调用方结束而取消。network.read 已废弃，仅为已有插件保留兼容。新代码统一使用 fetch，字节范围读取使用 Range 请求头。它遵循 browser.network 或 browser.networkOrigins 授权，显式白名单优先。",
  ],
  [
    "settings",
    "settings",
    "settings",
    ["PluginSettings"],
    "services",
    "Keys and defaults come from manifest.settings. Views receive get only. Ordinary actions can also set and reset values. File hooks receive a resolved settings snapshot instead of this interface.",
    "键和默认值来自 manifest.settings。View 只能调用 get，普通命令还可 set 和 reset。文件 hooks 接收已解析的设置快照，而非此接口。",
  ],
  [
    "ui",
    "ui & resources",
    "ui 与 resources",
    ["HostUI", "HostResources", "ResourceMount"],
    "resources",
    "Check optional UI methods before calling. exportFile accepts a leaf filename and at most 16 MiB; Lite shows a save dialog, Serve starts a download, and actions/mobile do not expose it. It needs no filesystem write permission. Lite resources require workspace file read access, resolve paths from the bound file, and render up to 12 read-only panels within the Space; nested dashboards are unsupported. Dispose mounts with the View.",
    "调用前检查可选 UI 方法。exportFile 接受不含目录的文件名及最多 16 MiB 数据；Lite 显示保存对话框，Serve 发起下载，命令和移动端不提供此方法。它不需要文件写入权限。Lite resources 需要 workspace 文件读取权限，从绑定文件解析路径，在 Space 内最多渲染 12 个只读面板，不支持嵌套 Dashboard。View 关闭时应释放挂载。",
  ],
  [
    "explorer",
    "explorer",
    "explorer",
    ["ExplorerContext"],
    "explorer",
    "Lite API 3.1, only at sidebar/explorer. read is synchronous; watch has no initial callback. State is display metadata and does not grant filesystem authority. A null rootDirectory means the Space root; a null activePath means no open file.",
    "Lite API 3.1，仅 sidebar/explorer 挂载位置提供。read 同步返回，watch 没有初始回调。状态仅用于展示，不授予文件访问权限。rootDirectory 为 null 表示 Space 根目录，activePath 为 null 表示没有打开的文件。",
  ],
  [
    "actions",
    "Actions & hooks",
    "命令与 hooks",
    [
      "FormatterProvider",
      "FileHookHandler",
      "FileHookContext",
      "TableActionProvider",
      "TableActionCapabilities",
    ],
    "actions",
    "Register declared contributions through ExtensionContext. Formatters return text for an undoable edit. Hooks require API 3.3 and return plans for the event document, with no ambient filesystem/network/DOM access. Hooks run after successful local changes; hook failures do not roll them back. Table actions must await declareOutputs before updates; cancellation retains completed writes.",
    "通过 ExtensionContext 注册已声明的贡献点。格式化器返回文本，由宿主执行可撤销编辑。Hooks 需 API 3.3，只能返回事件文档的修改计划，没有环境文件、网络或 DOM 权限。Hooks 在本地修改成功后运行，失败不回滚此前修改。表格命令更新前必须等待 declareOutputs，取消会保留已完成的写入。",
  ],
  [
    "types",
    "Types & Errors",
    "类型与错误",
    [],
    "files",
    "Supporting data types are listed below. Error codes describe failures, not a guarantee that every method emits every code. Permission and lifetime checks happen in the host. Preserve user input on failure; do not retry non-idempotent writes blindly. Text edit stale and save conflict are result statuses, not error codes. Imported Eidos data types belong to @eidos.space/eidos-file; DOM and ECMAScript types use their standard definitions.",
    "下列为辅助数据类型。错误码表示失败类别，不代表每个方法都可能返回所有错误。权限和生命周期由宿主检查。失败时保留用户输入，不要盲目重试非幂等写入。文本编辑的 stale 和保存的 conflict 是返回状态，不是错误码。导入的 Eidos 数据类型属于 @eidos.space/eidos-file，DOM 与 ECMAScript 类型使用其标准定义。",
  ],
]
