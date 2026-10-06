# Eidos Plugins — API 3.1

状态：源码树实现契约；可用性以已安装宿主为准

Plugin API：3.1.0

本文为信息性中文说明，[英文规范](./eidos-lite-plugins-1.0.md)为准。

本文定义 Adapter / UI 边界的插件接口。Eidos File 格式与数据语义由对应规范定义。
英文文档是唯一规范性版本；本文为中文参考。

## 1. 目标与公共模型

插件提供 View、用户触发的 Action 或文档 Formatter。View 严格只有 page 和 file。
文本、媒体、Eidos 文件与表格通过能力访问。主题是独立的数据包。

视图使用 mount 入口，扩展使用 activate 并注册动作与格式化器。
宿主提供版本化编辑和任务接口。

宿主在执行视图前验证所需数据能力，不能暴露永远返回 unsupported 的占位方法。
宿主允许实现较小能力集合；运行期间仍可能撤销权限或拒绝具体操作。

## 2. 身份与作用域

插件 ID、贡献项 ID 与 placement 引用保持稳定。安装是设备级；启用、设置与连接授权按
Space 隔离。私有二进制存储归设备上的插件；表格插件配置保存在文件内。

Lite 将 `.eidos-plugin` 包关联到桌面宿主。从操作系统打开包（包括应用启动时）必须
进入与插件设置相同的包验证和确认流程。清单 ID 已安装时进入更新流程；版本不同时
展示已安装版本与新包版本。取消或包无效时，已安装版本必须保持不变。打开包不能
隐式启用任何 Space 中的插件；更新保留各 Space 原有的启用状态。多个系统打开请求
按顺序处理。

Binding 仅描述资源与定位，不授予权限。FileRef 的 ID 是上下文内的显示身份，
不是持久文件 ID 或权限凭证。宿主可附加相对路径与名称；没有文件元数据的表格会话使用
`id: "current"` 指代当前绑定文件，插件不能将它持久化为可移植文件身份。

操作权限来自宿主维护的实例、owner、Space、包版本、贡献项权限和当前调用，
不能由来宾传入的 ID 决定。

## 3. 描述文件与源码

使用 plugin.json 或单文件 TS/JS 的静态 manifest 导出。读取描述信息不执行插件代码。
入口仍为本地 ./ 路径；未知字段、重复 ID、无效 placement 必须拒绝。
SDK 只提供类型，使用 import type。

```ts
interface ViewDeclaration {
  id: string
  title: string
  entry: string
  kind: "page" | "file"
  capabilities?: Array<
    "document" | "eidos/schema" | "eidos/table" | "eidos/config"
  >
  access?: "read" | "write"
  configuration?: ViewConfiguration
  icon?: PluginIconDefinition
}
```

Page 不能声明绑定文件的数据能力。File view 可组合 eidos/schema、eidos/table、eidos/config。
每项声明只提供 capabilities.eidos 中对应的成员，父命名空间不隐含授权。未知或重复能力必须拒绝。
document 用于文本文件，不能与 Eidos 能力组合。未声明数据能力时，通过 filesystem 访问普通文件和媒体；
不能根据扩展名自动授予未声明能力。

access 默认为 read，是贡献项级权限上限。Page 同时具有工作区授权时可以显式声明 write。
Action 声明继续使用 workspace/file/document/table context 和 access，它们是调用条件，
不是 View 分类。

Lite 可执行包声明 requires.pluginApi 为 3.0.0；Serve 使用相同 major，但仅实现较小表格能力集合。
版本不授予权限。API 1.x/2.x 可执行包必须源码迁移，不能假装使用新上下文。

### 主题插件

主题声明 kind: theme、theme.stylesheet，CSS 及嵌入字体需要校验；
不允许可执行贡献、设置或授权。主题全局选择，不按 Space 启用。
Lite 保留未变更的纯数据 API 1.6.0 主题契约；Serve 不支持宿主主题。

## 4. SDK 与生命周期

View 默认导出 mount(ctx, root)；extension 默认导出 activate(ctx)，在激活结束前注册
已声明的 action/formatter。注册先暂存，失败不发布部分结果。两种入口均可同步／异步
返回 Disposable。

ViewContext 有 binding、capabilities、signal、subscriptions 四个入口。
Binding 为 page 加 route，或 file 加 FileRef，以及可选的 Eidos table/view location。
所有操作从 capabilities 开始，binding 只描述资源身份与元数据。
声明的数据能力位于 capabilities.document 或 capabilities.eidos 的对应成员。

Lite 额外提供受限 fs、network、storage、settings 和 ui；声明的连接通过 capabilities.connections 使用。
Serve 仅提供 eidos.table 与通知操作。
跨宿主 SDK 中可能缺失的服务必须是可选类型，调用前检查。
TextFileViewContext 和 TableFileViewContext 是类型组合，不增加 View 类型，也不创建权限。

View 仅暴露 settings.get；Lite Action 还支持 settings.set/reset。
HostUI 提供 notify，
openFile/navigate 为宿主可选操作；openFile 的相对路径仍由宿主校验和授权。

ExtensionContext 通过 capabilities.actions/formatters 注册，不暴露不可用的 settings。
文档 Action 的 binding 是文件身份，编辑能力位于 capabilities.document。
表格 Provider 在 capabilities.eidos 中提供 table（身份与 readContext）和 config（只读）。
getItems 仅接收这些 Eidos 成员及 signal；run 额外获得 capabilities.target、task、connections。
Provider 的配置读取限定在绑定表格和本插件命名空间。

能力、句柄与观察属于会话／调用。释放时取消工作、释放订阅，迟到调用失败。
插件释放 React root 等资源并忽略取消后的结果。观察失败不能阻塞其他订阅；
文档初始快照与后续事件保留原有交付顺序。

## 5. 直接加载源码与离线安装包

编译器静态检查描述文件、类型并打包浏览器模块，不执行插件代码、构建配置或安装脚本。
外部依赖要求受支持锁文件与匹配的本地安装身份，这不等于认证发布者。

包仍为包含 format、manifest、modules 的 gzip UTF-8 JSON。
声明入口与模块覆盖必须一致；压缩和解压均限制 16 MiB。
共享打包器拒绝重复 JSON key、无效脚本和外部模块导入。
format 2 必须包含 requires，format 1 不能包含。哈希标识确切包字节。
旧宿主必须拒绝不兼容新包，不能自动替换成旧 API。

源码变化先检查再重挂载；失败保留／恢复上次可用代码。权限声明变化重新审查。
自动源码更新是临时状态，安装才持久化包版本；回退代码不撤销数据写入或外部副作用。

## 6. View 与路由

navigation 和 plugin/settings 对应 page。file/open 对应非 table 绑定的 file view；
table/view 对应声明 eidos/table 的 file view。声明 eidos/schema 或 eidos/config 的 file/open
视图只匹配 .eidos，document 能力不能
宣称处理二进制 .eidos。媒体通过普通 file view 流式访问，不再需要 media View。

Placement、命令面板、菜单、工具栏和快捷键引用已声明贡献项，不授予额外权限。
表格绑定携带内部定位，实际表格权限始终由宿主验证。Page route 是插件拥有的不透明字符串，
不是文件系统路径。迁移应保留已保存视图 ID、路由和默认文件关联。

## 7. 授权资源

Lite 支持 `sidebar/explorer` 贡献位置，引用 page View。贡献必须替换完整探索器区域，包括 Space 标题和探索器工具栏；宿主不得在活动替代探索器上方添加内置标题、搜索、排序或创建控件。窗口导航和应用控制属于此区域之外的宿主外壳。用户通过插件管理页按 Space 选择替代探索器，并可返回内置探索器。挂载前校验声明和启用状态；插件不可用或失败时必须恢复完整内置探索器，包括标题，并提供恢复入口。临时的宿主文本搜索覆盖层必须保留插件挂载和浏览状态。侧边栏 View 同样遵循沙箱、访问级别、版本校验和释放契约。仅此位置提供 `capabilities.explorer`：`read()` 返回 `{ rootDirectory, activePath, sort }`；`watch(listener)` 订阅变化并返回可释放订阅，不提供初始回调。路径相对 Space；root 为 null 表示 Space，activePath 为 null 表示未打开文件。此上下文不授予文件权限，文件打开通过 `ui.openFile` 使用宿主的编辑器选择。

Lite API 3.1 提供独立的 `ctx.capabilities.filemeta` 能力，通过 sqlite-fs-meta 原生 namespace API 实现 `read(path, namespace)` 和 `patch(path, namespace, { set?, remove? })`。`workspace.filemeta` 声明 1–16 个不重复 namespace 和可选 `write: true`。namespace 以 ASCII 字母或数字开始，后续允许字母、数字、`.`、`_`、`-`，最多 255 字节。读取默认仅限绑定文件，Space 范围读取要求 `workspace.files`；写入同时要求属性写权限和当前贡献项 `access: "write"`，不授予内容写权限。读取完整 JSON 对象，包括 files.eidos 未定义的字段，缺失 namespace 返回 `{}`。patch 保留其他键；null 是值，remove 删除键。set/remove 重叠、无效键、非 JSON 值及超过 1 MiB 的 patch 必须在写入前失败。键不能为空、不能含 NUL、最多 1024 字节；patch 最多 1024 个键、嵌套深度 32。文件系统原生限制可能更小。损坏的属性不能被静默覆盖。宿主校验 Space 路径，拒绝符号链接、目录、缺失文件；Unix 写入拒绝多重硬链接。属性操作立即作用于文件系统，不是 Eidos File 事务或跨进程并发保证。修改使 filesystem watch 失效。这些能力仅适用于 Lite，其他宿主在兼容性检查中拒绝相关声明。

Filesystem 能力提供 readText/writeText、readBinary/writeBinary、list/stat、delete/rename、
getUrl、watch。Lite 校验路径、范围、受保护文件和 I/O。文本上限 2 MiB，二进制上限 16 MiB；
宿主流 URL 不暴露原生句柄。

Lite API 3.1 的 `fs.list(folder, options?)` 支持 recursive（默认 true）、includeDirectories（默认 false）及已有扩展名筛选。`recursive: false, includeDirectories: true` 必须返回当前层级并包含空目录；扩展名筛选只作用于文件。FileStat 可提供 modifiedAtMs 用于排序。枚举任意目录仍需要 workspace 权限；绑定文件的伴随文件列表不授予目录遍历权限。

文件贡献项具有受限文件目录／伴随文件范围。更广的 Space 访问要求 workspace.files；
workspace Action 的 context 本身不提供权限。写入还要求当前贡献项 access: write，
包级工作区写授权不能使只读贡献项可写。权限取声明、授权、贡献项和生命周期的交集。

直接文本／二进制写入、删除、重命名不能绕过插件服务中已有工作副本：返回 BUSY，
调用方使用 document 编辑和保存。这不是跨进程通用事务保证；直接 filesystem 写入不是
乐观并发编辑接口。

私有 storage 提供 list/read/write/delete、声明配额、原子串行写入；单对象上限 4 MiB，
最多 25000 对象。匿名网络读取仍是限定域名的受限 HTTPS 请求，不暴露凭据。

## 8. 文本文档

Document 提供 read、observe、edit、save、undo、redo。
edit 参数为 text、expectedVersion，可选 label/group，修改工作副本并返回 applied/stale 与快照；
save 返回 saved/conflict 与快照。过期修改不能覆盖新内容，磁盘冲突保留草稿，
不得悄悄更新版本重试。编码、BOM、换行与显式保存语义保持不变。

宿主拥有共享撤销和可恢复草稿。不能因上下文路径变化就用直接文件写入替代。
Formatter 通过 capabilities.formatters 注册，接收 text/path/signal 并返回 text；
宿主检查版本／上下文后应用可撤销编辑，不给 formatter 文档写句柄。

## 9. 结构化数据与输出

Eidos 操作按职责组织在 ctx.capabilities.eidos 下：

- schema 由 eidos/schema 声明，提供 listTables()、readTable(tableId)，读取整个绑定文件的表结构。
  表格视图也可使用，不授予记录读取权限。
- table 由 eidos/table 声明，提供 readContext/readRows/aggregate/setViewConfig/openRecord/watch，
  操作当前表格和已保存视图。必须具有表格绑定，调用方不能通过 ID 重新绑定。
  setViewConfig 完整替换 view.properties.plugin，调用方应先合并需要保留的字段。
- config 由 eidos/config 声明，提供 read(tableId)、write(tableId, { value, expectedVersion })、
  watch(tableId, listener)。仅访问本插件的配置命名空间。文件绑定可选择文件内的表格；
  表格绑定仅能访问当前表格，即使同时声明 eidos/schema 也不能扩大配置范围。

配置写入要求贡献项 write、expectedVersion 及宿主修改权限，并保留其他命名空间和未知设置。
配置观察返回可释放的失效通知订阅，不发送初始快照，可能包含无关变更；订阅者先读取，再在通知后重新读取。
宿主在配置写入成功及绑定文件变更时发送通知，释放后停止交付。声明顺序不能改变语义。

查询范围、字段 ID、派生值和校验由 Eidos File Runtime 定义，不暴露 SQLite。
Lite 支持三个成员；Serve 仅支持 eidos/table，声明其不支持的能力应在挂载前被兼容检查拒绝。

## 10. 设置与宿主交互

Settings 按 Space/plugin 存储，读取修改写回保留未知值。私有缓存与加密凭据留在设备；
表格插件配置随文件移动。界面使用注入的语义主题变量，框架依赖由插件自行打包。

动态表格 Action 使用 activate/registerTableProvider、getItems、run。
宿主冻结目标集合并签发 readToken。插件分页遍历、重新检查字段、响应取消，仅更新已授权
输出范围。task.declareOutputs 校验输出样本并确定可写字段范围，返回 Promise<void>，样本无效时拒绝；输出样本的规范 JSON 表示以 UTF-8 编码计算，最多 4 MiB。
每次运行在写入前声明一次。样本使用有效的 readToken、具有相同的输出字段集合，
对样本记录的后续写入必须与声明的样本值一致。
task.report 提供进度。逐行写入为增量提交；取消不回滚已完成记录。
undo/redo 使用宿主保存并检查冲突的值，不重放外部请求。

ctx.capabilities.connections 独立于 Eidos 数据能力。Lite 视图和普通动作提供 isConfigured/request，
表格动作运行提供 request。调用要求已声明连接和有效上下文。普通动作请求绑定调用 ID，
结束时取消；后续调用不能使旧句柄恢复有效。Connections 由宿主管理凭据、数据／并发限制与生命周期。可配置模型服务连接使用用户在宿主中设置的端点、模型和凭据。秘密不进入插件代码、文件设置、安装包或诊断。
超时不能证明外部操作没有发生。

## 11. 隔离与诊断

插件在隔离容器运行，不能由宿主 import/eval/Node VM 直接执行。
iframe 使用 allow-scripts，不提供同源宿主权限。CSP 拒绝未声明网络、脚本和原生 API；
worker／域名能力需要声明与校验，WASM 不额外获得权限。

每次请求检查 owner、Space、版本、贡献项和调用。保留激活／挂载期限、取消、
每通道最多 64 个待处理 RPC 和载荷限制。这些是协作式期限，不承诺抢占同步死循环
或独立隔离共享 renderer 崩溃。宿主必须明确实际提供的隔离保证。

稳定错误包括 INVALID_REQUEST、UNSUPPORTED_API、PERMISSION_DENIED、INSTANCE_CLOSED、
STALE_REVISION、ALREADY_EXISTS、BUSY、TOO_LARGE、IO_ERROR、TIMEOUT、CANCELLED、
REGISTRATION_CONFLICT、DEPENDENCY_MISSING、SOURCE_INVALID。文本冲突仍为类型化结果。
诊断文本是不可信输入，默认不记录文档内容或凭据。

## 12. Agent 创作工具与版本接受

plugin-tools 负责 create/templates/check/pack。CLI plugin 管理／检查包，旧创作命令不是别名。
检查使用实际宿主 profile；编译通过不等于运行验证。Agent 保留源码、ID、数据、设置和锁文件，
报告准确的已验证宿主。

迁移改变声明和上下文路径，不改变文件格式或已存插件命名空间。
activate、task.declareOutputs、配置 key、数据 schema 无需一起修改。
插件自身确需修改 schema 时，单独提供迁移与降级测试。插件作者负责自己的数据迁移；
任务写入按增量完成。

## 13. 参考场景与验收

必须验证声明支持的 profile，包括：

- page/file 两种 View 的导航与 file/open。
- 文本保存重开、undo/redo、过期编辑及磁盘冲突。
- 通用文件／媒体不会获得未声明的 document/eidos 能力。
- 表格查询／配置范围、目标分页、取消和部分撤销。
- 缺少数据能力在执行前拒绝，没有顶层别名或携带操作的 binding。
- Eidos 能力组合与声明顺序无关，伪造请求不能访问未声明能力。
- 结构读取权限不能扩大表格查询和配置范围。
- 配置观察接收写入及外部失效通知，释放后停止。
- 连接独立于 Eidos 数据能力，并随调用结束失效。
- 包级写授权不能使只读贡献项可写。
- 直接写入不能绕过已有插件工作副本。
- 关闭重挂载无遗留句柄或重复注册。
- 相同表格视图代码可在 Lite/Serve 使用，并判断宿主可选能力。
- 旧版本要求／声明失败时保留已有可用安装。

## 插件兼容契约

两个源码树宿主均声明可执行 API 3.0.0。TypeScript 与 Rust 共用
packages/plugin-runtime/src/compatibility-data.json 的能力清单。
View kind 产生 view.page/view.file，绑定数据能力产生 data.document、data.eidos/schema、data.eidos/table、data.eidos/config；普通文件视图需要 data.file 支持。
主题保留独立未变更契约。旧 format 1 的诊断可能返回未声明版本，不能将其视为 API 3 一致性承诺。

SDK 包版本、插件版本和产品版本相互独立。check --target 必须拒绝不支持的能力；
doctor 要检查 compatible:false。源码实现与已发布可用性分别报告，本地构建通过不代表已经发布。
