# Eidos Plugins 1.0

动态表格动作可声明 `icon: { paths: string[] }`，沿用 manifest 中受限的 24×24
单色 SVG 路径规范，禁止文件引用、外部图片和可执行标记。宿主校验后与内置菜单
图标使用相同尺寸及间距。

授权连接凭据在插件详情的设置页管理，不在 Grid 常驻工具栏中管理。工作区扩展
实例仅可授权宿主管理凭据的状态和保存操作；外部请求仍需存活的表格动作实例。
凭据继续按 Space、插件、连接和固定 URL 隔离。

插件主题增加 `--eidos-surface-hover` 和 `--eidos-surface-selected` 背景色变量；
`--eidos-muted` 保持为次要文字色。
插件容器将 `--eidos-color-scheme` 应用到文档根节点，并使用宿主共享主题解析的
`--eidos-scrollbar-thumb`、`--eidos-scrollbar-thumb-hover`、
`--eidos-scrollbar-thumb-active` 统一滚动条颜色；轨道和边角透明。
原生控件与滚动条跟随主题实时更新，无需重新挂载插件。

状态：Eidos 最终标准规范  
版本：1.0  
发布日期：2026-09-17  
规范控制：Eidos Project  
唯一规范语言：English  
所有者：Lite Adapter / UI；结构化数据语义归属 Eidos File 数据引擎（@eidos.space/eidos-file）

## 摘要

Eidos 插件规范定义了 Eidos Lite 桌面宿主下的扩展与应用开发模型。它构建了一个轻量、受控的沙箱隔离环境，允许插件贡献自定义视图（View）、上下文动作（Action）、文档格式化程序（Formatter）、动态表格动作提供者（Table Action Provider）以及受权限限制的文本、目录与 `.eidos` 结构化数据访问。符合规范的插件既可以在本地开发中直接免构建加载源码，也可以打包为不可变、完全离线可用的自包含安装包。

## 规范地位

本文为 Eidos Plugins 1.0 规范的说明性中文参考，所有术语与精确契约以英文规范为准。规范中的 **必须（MUST）**、**禁止（MUST NOT）**、**应当（SHOULD）**、**可以（MAY）** 遵循 RFC 2119 解释。

## 1. 目标与公共模型

插件既可以由开发者交付，也可以由 agent 根据用户需求即时创建、试运行和修改。
本地创作以源码为中心：写代码 → 加载 → 看结果 → 修改 → 重载。
打包用于分发，不是试用插件的前置条件。

公共 UI 贡献类型只有两种：

- **View**：由宿主挂载的界面，可以绑定页面、文本文档或数据表视图上下文。
- **Action**：用户触发的操作，声明所需上下文与数据访问范围。

placements 是入口位置，resources 是授权请求，settings 是配置，都不是新的插件类型。

插件还可以实现宿主定义的 provider 扩展点。Formatter 为宿主的“格式化文档”提供算法，
不是新的插件类型，也不需要声明自己的 Action 或快捷键。
CSV、Markdown、Journals、个人站点、时间线，以及导入导出，都通过这些基本概念表达。

规范属于 Lite Adapter / UI；`.eidos` 的数据语义归属于底层数据引擎。
符合规范的宿主必须实现下列所有规范小节并通过验收套件，未完全符合的实现禁止声明支持 Plugin 1.0。
插件只需实现自己声明的贡献。CLI／agent 工具另按第 12 节声明符合性。

1.0 不包含原生／Node／shell／任意网络访问、后台定时任务、插件间服务、任意权限、
Markdown 内嵌 renderer 插槽、宿主 DOM 或远程部署。本地静态站点生成通过输出授权实现，
公开托管需要未来单独的契约。

## 2. 身份与作用域

插件 ID 使用小写点分名称，例如 `example.journals`；各贡献和资源使用小写字母开头、
允许数字和连字符的本地 ID。完整贡献 ID 为 `<plugin-id>/<local-id>`。
标签是最长 128 字符、不含控制字符的非空纯文本。
发布版本为无前导零的三段数字，不支持 prerelease/build 后缀；apiVersion 固定为整数 1。

每个实例绑定不可变 revision、Space 会话、生命周期与授权代际。revision 表示内容，
不证明作者可信。插件统一安装到本机仓库，每个插件 ID 只有一个供所有 Space 共用的安装版本。
1.0 不提供 Space 专属安装、版本固定或全局启用继承。每个 Space 独立启用，默认禁用。
安装流程可在确认前明确说明同时启用当前 Space；没有打开 Space 时仅安装。
更新共享版本时保留各 Space 的启用、设置和授权，不扩大资源权限。
卸载影响所有 Space：终止实例、清除启用和默认编辑器关联、撤销资源授权；重装不自动恢复启用或授权。
实例、设置、页面路由、资源绑定和授权均按 Space 与插件 ID 隔离，不提供跨 Space 权限或全局数据实例。
打开顺序为显式选择 → Space 默认 → 内置。默认失效需提示并回退，显式选择失效需报错。
安装不能自行设置默认编辑器。同步来的文件夹或 `.eidos` 中的插件引用不能自动执行代码。

## 3. 描述文件与源码

常规项目使用 `plugin.json`。单个 TS／JS 文件也可以导出静态 `manifest`，两者归一化为
同一个清单，不存在两套协议。如果同时提供则报错。

加载器必须在**不执行源码**的情况下提取声明，只接受 JSON 兼容字面量、类型注解、
`as const` 和 `satisfies`；拒绝计算属性、展开、函数调用、导入值与字符串插值。

```text
plugin.json
  apiVersion, id, name, version
  icon?          矢量图标声明（SVG paths）
  extension?     动作注册入口
  views?         id, title, entry, context, access?, configuration?, icon?
  actions?       id, title, context, access?, extensions?, icon?
  placements?    入口位置及目标引用
  resources?     逻辑资源名称到授权声明
  settings?      插件配置声明
  storage?       设备本地二进制存储声明
  browser?       网络源与 Worker 声明
  formatters?    文档格式化程序声明
```

至少声明一个 view 或 action。未知字段、重复 ID、错误引用与上下文不匹配均拒绝。
导入模块（包括锁定依赖的包导出）还支持 .mjs。
入口为源码根内以 `./` 开头的 .ts/.tsx/.js/.jsx 模块，不接受绝对路径、`..`、反斜杠、
URL、query、fragment 或导出表达式。

Manifest 可声明 `"icon": { "paths": ["..."] }`（或本地文件/Data URL 格式）。路径使用 24 × 24 坐标、无填充、2 单位圆角描边，颜色跟随宿主主题。该插件图标代表产品品牌 Logo，在插件列表、详情和设置中展示；未声明则使用宿主默认图标。允许 1–16 个 SVG path 的 `d` 字符串，每条最多 2048 字符；不接收 SVG 标记、外部 URL 或可执行内容。图标随 manifest 离线分发。

具体的 view 和 action 也可声明各自的 `icon`（格式相同），用于将特定视图或编辑器（如思维导图视图）与插件本身的 Logo 区分开。当 view 或 action 未声明 `icon` 时，宿主回退使用 `manifest.icon`，若均未声明则使用宿主默认图标。在文件“打开方式”菜单和编辑器切换器中展示 view 图标。

View context 为 page/document/table/eidos；Action context 为 workspace/document/table。
文档、表和 eidos 视图上下文 access 默认为 read，可声明 write；page/workspace 通过命名资源获得数据权限。
文档 action 可限定扩展名。`.eidos` 不能通过 document 视图或文本文档动作接管。
专用 `context: "eidos"` 视图可声明 `file/open`，扩展名必须为 `[".eidos"]`。
该视图通过 `ctx.binding.file` 获取 `listTables()`（表 ID 和名称）、
`readTable(tableId)`（字段）、`readPluginConfig(tableId)` 和
`writePluginConfig(tableId, {value, expectedVersion})`。配置仍存入对应表的插件
命名空间并使用版本冲突检查；写入要求 `access: "write"`。宿主必须固定当前文件和
插件身份，拒绝跨文件表以及调用方提供的 session/plugin 覆盖。不暴露文本句柄、
文件系统句柄、记录读写或结构修改权限。

Action 声明定义可调用的操作能力。Lite 支持下文定义的动态表格动作提供器；插件在表级命名空间中自行管理动作配置。当前 manifest 校验器不接受 Action 的 `configuration` 和 `multiple`。

| placement       | 目标约束                                               |
| --------------- | ------------------------------------------------------ |
| navigation      | page view                                              |
| file/open       | document view 声明文本扩展名；eidos view 仅声明 .eidos |
| table/view      | table view                                             |
| plugin/settings | page view，置于插件详情设置区域                        |
| command-palette | action，有符合条件的上下文才启用                       |
| file/context    | document action                                        |
| table/context   | table action，出现在网格/表格右键上下文菜单            |
| view/toolbar    | 与目标 view 上下文匹配的 action；page 对应 workspace   |
| keybinding      | action，系统与宿主快捷键优先，冲突需可见               |

快捷键使用宿主的修饰键记法，例如 `Mod+Alt+F`；`Mod` 在 macOS 为 Command，
其他平台为 Control，`mac` 可覆盖 macOS 绑定，`linux` 可覆盖 Linux 绑定，未覆盖的平台使用 `key`。只有已启用且上下文匹配的 Action
注册快捷键。重复按键、输入法组合输入和宿主模态对话框内不执行 Action。
多个可用插件的相同快捷键均禁用并提示冲突，命令面板仍可执行。
快捷键和命令面板共用执行链路，在异步激活之前固定目标文档。

入口条件不执行表达式。任何触发渠道都检查相同权限，工具调用不能绕过 UI 条件。

纯 view 不需要 extension，也不需要 resolve/mount 包装。存在动作时，需要一个默认导出
Activate 的 extension；单文件 manifest 有动作且省略 extension 时，使用该文件自身。
View 入口默认导出 Mount；同一个兼容 view 可以出现在多个入口。

Journals 示例：

```json
{
  "apiVersion": 1,
  "id": "example.journals",
  "name": "Journals",
  "version": "1.0.0",
  "views": [
    {
      "id": "journal",
      "title": "Journals",
      "entry": "./journal.ts",
      "context": "page"
    }
  ],
  "placements": [{ "location": "navigation", "view": "journal" }],
  "resources": {
    "entries": {
      "kind": "directory",
      "title": "日记文件夹",
      "include": ["**/*.md"],
      "access": ["list", "read", "create", "write"]
    }
  }
}
```

entries 是逻辑名称，实际目录由用户绑定，不从源码路径或文件夹名称推导授权。

Lite Plugin API 1.3 另提供需显式声明的只读能力：
`workspace: { listMarkdownFiles: true }`。安装确认明确说明这项可枚举整个
Space 中 Markdown 文件名的权限后，Page View 可以调用
`HostUI.listMarkdownFiles(folder)` 列出 Space 相对目录中的 Markdown 路径。
一次最多返回 20,000 个路径及 `truncated` 标记，不提供正文。同一 Page View
可调用 `HostUI.openMarkdownFile(path)` 请宿主打开已存在的 Markdown 文件，
也不会拿到正文。路径仅限当前 Space，不遍历符号链接或受保护的实现目录；
这项权限不授予文档正文的读写能力。

Lite Plugin API 1.4 增加 `workspace.countMarkdownLines: true`，同时要求
`listMarkdownFiles: true`。Page View 可把自身通过 `listMarkdownFiles` 获得的
最多 400 个路径传给 `HostUI.countMarkdownLines(paths)`。宿主返回每个文件的
非空行数；文件不可用或超出文本预览上限时返回 `null`。正文不会传给插件。
安装确认会单独说明这项可获取当前 Space 内 Markdown 行数的权限。

Lite Plugin API 1.5 增加 `workspace.watchMarkdownFiles: true`，同时要求
`listMarkdownFiles: true`。运行中的 Page View 可调用
`HostUI.observeMarkdownFiles(folder, listener)` 订阅 Space 相对目录的变更，
并取得可释放的订阅对象。宿主合并文件系统事件；目录内 Markdown 文件或所在目录
发生变化时调用监听器，通知不包含文件路径或正文。Page View 需重新调用
`listMarkdownFiles` 获取当前数据。页面关闭或插件权限撤销后订阅终止；
安装确认会单独说明这项变更通知权限。

## 4. SDK 与生命周期

Lite 将 command-palette 入口与内置操作统一放入命令面板，默认快捷键为 macOS 的
Cmd+K、其他平台的 Ctrl+K，用户可修改。只有已启用插件贡献命令。文档命令根据当前
显示的文件判断可用性，不使用后台保留的预览或目录树选中项；管理页面和插件页面没有
隐式文档目标。面板打开时持续更新可用命令，执行前捕获目标，再异步激活插件。
插件视图获得焦点时也可打开命令面板。

SDK 核心包 `@eidos.space/plugin-sdk` 提供类型。作者使用 `import type`，转换后擦除。
宿主在沙箱内安装 bootstrap，构造 RPC 代理并在调用入口时注入 ctx，不要求作者 connect，
不暴露宿主全局对象。主进程对象和函数不会直接传进沙箱。

```ts
// 视图入口
export default function mount(ctx: ViewContext, root: HTMLElement) {
  root.textContent = "My page"
  return {
    dispose() {
      root.replaceChildren()
    },
  }
}

// 有动作时才需要的 extension 入口
export default function activate(ctx: ExtensionContext) {
  ctx.actions.register("format", async (invocation) => {
    // 使用 invocation.binding 和 invocation.resources。
  })
}
```

上面是两个独立入口，不应复制为一个具有两个默认导出的文件。入口可以异步，返回可选 Disposable。
ViewContext 有 binding、resources、settings、ui、signal、subscriptions；
ActionContext 有同样的公共能力，binding 由触发时捕获（支持 workspace、document 以及带有 table、可选 rowId、instanceId、actionTitle 与 config 的 table 绑定）；ExtensionContext 只有动作注册、
设置和生命周期，没有数据或导航能力，避免激活时隐藏访问数据。

不能注册未声明或重复动作。激活完成前必须注册全部声明动作，注册先暂存，成功后统一生效；
失败撤回所有资源。动作控制器按插件 revision × Space 会话懒加载，视图每次挂载独立运行。
动作目标在调用时固定，切换标签不会改变目标；没有匹配文件或表时不可用。
动作完成或失败时其资源句柄失效，保存在 extension 中不会延长权限。
关闭视图释放它的句柄，但不销毁共享工作副本。

1.0 的核心 SDK 只能 type-only 导入。纯工具函数、解析器、UI 库是普通依赖，可随产物打包；
宿主的文档管理、数据引擎、权限和设置实现不进入插件 bundle。API 兼容性由 manifest 的 apiVersion 决定。

回调留在沙箱，RPC 只传 opaque callback ID 与校验过的值。所有资源自动归属生命周期，
即使漏加 subscriptions 也会清理。停止时拒绝新调用、取消并撤销句柄，最多给返回的 dispose
两秒清理，再销毁容器；错误不能阻止后续清理。卸载不能撤回已提交数据，也不能承担保存草稿的职责。

## 5. 直接加载源码与离线安装包

宿主必须可以直接加载已授权的单文件／目录，不要求先 build/pack。
无第三方依赖的 TS 插件不要求用户另外安装 Node 或编译器；转换器和解析器由宿主提供。
IDE 类型包与包管理器是开发工具，不是简单插件执行的前置条件。

流程为：静态提取 → 校验 → 解析本地依赖 → 不可变源码快照 → 转换 → 授权 → 激活／挂载。
加载时不能自动执行构建配置、任意包脚本或源码。
支持 TS/JS/TSX/JSX、静态本地 ESM import、CSS、PNG/JPG/JPEG/WebP/GIF/SVG/WOFF2。
JSX 依赖需本地存在。拒绝非字面量动态 import、远程 import、Node builtins、native addon、
动态 require 和 eval；沙箱隔离继续阻止无法静态判定的违规行为。

第三方依赖需已显式安装并锁定，1.0 支持 package-lock.json 和 pnpm-lock.yaml。
可达依赖字节纳入 revision，宿主只解析认可的依赖存储链接，不把路径暴露给插件。
缺依赖时返回诊断和安装指引，不能在加载／重载中联网安装或执行 lifecycle scripts。
核心 SDK 类型可由宿主提供，因此单文件 check 不要求 node_modules。TS 转换不等于完整类型检查。

watch 监听可达源码、资源、清单与 lockfile，转换一致快照后再切换。
失败保留上一个有效版本；源码与安装包使用同一沙箱、bootstrap 和授权规则。

分发包 `.eidos-plugin` 为有大小限制的 gzip UTF-8 JSON：

```ts
interface PluginPackage {
  format: 1 | 2
  manifest: PluginManifest
  modules: Record<string, string>
}
```

modules 为入口键到自包含 ESM JS 的映射，源码中的 CSS／资源随各入口打包，不产生外部运行时依赖。
键必须恰好覆盖 view entry 和可选 extension，可共享入口；不是解压路径，不含任意附加可执行资源。
压缩前后总上限均为 16 MiB；解压有界、拒绝重复 JSON 键，加载前校验完整性。

源码 revision 覆盖归一化清单、源码／依赖和转换目标版本；安装包 revision 为压缩字节 SHA-256。
两种等价表示不要求哈希相同。哈希表示内容，不表示信任。
安装后无需网络或账号；不执行安装钩子，不任意解压文件。

### 官方插件市场

宿主读取 `https://raw.githubusercontent.com/eidos-space/registry/main/plugins.registry.json`。
目录使用 `schemaVersion: 1`，包含插件 ID、名称、描述、GitHub 仓库、固定版本、Release tag、附件名、SHA-256、预览标记、兼容性说明及可选图标。
旧扩展和主题目录保持独立，不能作为 Lite 插件安装。

安装时重新获取在线目录，下载固定的 GitHub Release 附件，验证 SHA-256 和 manifest ID/版本，然后执行普通包校验与权限确认。
目录上限 1 MiB，包上限 16 MiB；仅允许 HTTPS 及允许列表内的 GitHub 下载域名重定向。
浏览不会执行插件代码。成功目录会缓存供离线浏览，缓存不能授权新安装。
更新由用户主动安装，继续遵循本机安装和 Space 隔离规则。兼容性说明仅供参考，并非可执行检查。

Lite 的插件列表和详情页也接受拖入 `.eidos-plugin` 文件，复用文件选择器的包校验和
原生权限确认流程。根据 manifest ID 判断安装或替换，支持同版本替换；更新保留各
Space 的启用状态。多个文件依次处理。拖入源码目录不视为开发安装，无效包不能替换已有安装。

## 6. View 与路由

宿主自动调用默认 Mount 并提供独立 root DOM。页面内部路由是最多 2 KiB 的 opaque 字符串，
由宿主按插件页面保存；不是 URL、脚本或路径权限。
ui.navigate 只能打开当前插件在同一 Space 中声明的 page。
初始路由通过 binding.route 提供，默认空字符串；切换路由创建新挂载／生命周期，
再次打开相同视图与路由时优先聚焦已有挂载。

Manifest 可声明 `{ location: "plugin/settings", view: "<view-id>" }`，把已声明的 page 视图挂载在插件详情配置区域。它不增加权限，也不创建侧栏导航入口。Lite 仅在已打开 Space 且插件已启用时挂载。声明式标量设置仍是独立能力。网络源、目录、下载策略与数据格式属于插件，宿主不定义地图专用 API。

视图内可以使用 UI 库，但不能操作父页面 DOM；页面 UI 状态与文档内容分开。

文档视图绑定一份 TextDocument。Markdown 附件需额外的受控授权，不能因为打开文档就读整个文件夹。

表视图绑定现有数据表及已保存视图。持久化 type 为 `plugin:<plugin-id>/<view-id>`，
使用现有开放字符串规则；筛选、排序、字段等由底层数据引擎解释。
插件布局数据存于 properties 的 `eidos.plugin` 键下：`{ configVersion: 1, config: {} }`。
这里不存代码、包版本、令牌或秘密。

配置版本不支持或插件缺失时保留元数据，显示不可用或只读表格回退，并允许打开独立标准视图。
打开 `.eidos` 不能自动安装或执行插件。这利用已有自定义视图能力，不改变 File Format schema。

## 7. 授权资源

资源类型为 text、directory、eidos、output：

| 类型      | 权限                                                    |
| --------- | ------------------------------------------------------- |
| text      | read，另可申请 write                                    |
| directory | list/read/create/write/delete 分别声明；write 还需 read |
| eidos     | read，另可申请 write                                    |
| output    | write                                                   |

text/directory/eidos 绑定在当前 Space 内，output 可由用户显式选择 Space 外目录。
全局插件在每个 Space 分别绑定。有效权限是声明、用户授权、实例和宿主规则的交集。
View／Action 可以在各自生命周期内使用命名资源，不能发现未声明资源或转交跨 Space 句柄。

目录 include 是相对路径 glob：段内支持 `*`，整段 `**` 表示多级；不支持取反、brace、
字符类、绝对路径或 `..`。`**/*.md` 同时匹配根目录和子目录。
list 不暴露不匹配的名字，默认每页 100、最多 1000，按路径序排列；不兼容目录变化使 cursor 失效。

目录提供 list、openText、createText、inspect、deleteText。
createText 仅当文件不存在时原子创建并返回干净工作副本；已存在报 ALREADY_EXISTS。
inspect 返回磁盘 revision；删除需 delete 授权和该 revision，存在打开／脏工作副本时报 BUSY。
list 要求 list；openText 要求 read；inspect 要求 read 或 delete，仅返回 revision。
仅 create 权限创建后获得的句柄不能读取／编辑内容，除非还具有对应授权。
恢复能力沿用宿主，不承诺所有系统都有回收站；父目录创建也受 create 授权限制。
`.eidos` 不能经普通文本 API 修改。

禁止 traversal、绝对路径、symlink/reparse、宿主保护路径及其别名，操作时重新检查父目录竞争。
不能只做字符串前缀判断。插件源码目录、已安装包、授权／配置存储也不能通过数据权限修改。
撤销或更换绑定递增授权代际，使旧句柄失效。

Markdown 资源使用 ui.resolveAsset(document, relativePath)，要求文档授权加匹配的可读资源授权，
返回可撤销的局部 URL，支持经过内容／MIME 检查的图片和字体，SVG 只能作为图片使用。
不返回真实路径，不提供活动 HTML／脚本。ui.openLink 交给宿主导航或请求授权，不给调用者读权限。
插件默认不能直接获取网络 URL；只允许 browser.networkOrigins 明确声明的 HTTPS origin。

### 设备本地二进制存储

可选声明 `storage: { maxBytes }` 授予插件私有的设备本地二进制存储。
`maxBytes` 为 1 到 1073741824 的整数，安装审核必须显示该配额。
视图上下文提供 `storage.list(prefix?)`、`read(key)`、
`write(key, Uint8Array)` 和 `remove(key)`；不存在的对象读取为 null。
键是最多 100 个 ASCII 字符（字母、数字、`.`、`_`、`/`、`@`、`-`）的不透明名称，
不是文件系统路径。单对象上限 4 MiB，命名空间最多 25000 个对象，且受声明的总字节配额限制。
写入必须原子化，配额检查必须串行；调用必须来自当前已启用版本的有效插件实例。
存储按插件 ID 隔离，同设备的各 Space 共享，跨重启和重新安装保留，不参与 Space 同步。
插件必须提供大型可选下载的删除入口。

### 受限网络请求

视图还提供 `network.read({ url, range? })`，执行匿名 HTTPS GET，返回
`{ data: Uint8Array, status, etag? }`。URL 源必须包含在 `browser.networkOrigins` 中，
不允许凭据、重定向或自定义请求头。可选范围 `{ offset, length }` 使用安全整数，
响应最多 4 MiB，分段响应必须精确匹配请求范围。请求限时 20 秒，实例关闭时取消。
Lite 固定解析后的 IPv4 地址，拒绝回环、RFC1918、链路本地与共享地址段，保留 TLS 主机名验证；
支持系统 TUN 代理使用的 198.18/15 地址段。该能力用于读取不支持不透明源 CORS 的已声明来源，
不提供宿主 Cookie、凭据或文件系统权限。

## 8. 文本文档

```ts
interface TextDocument {
  read(): Promise<TextSnapshot>
  observe(listener: (state: TextSnapshot) => void): Promise<{
    snapshot: TextSnapshot
    subscription: Disposable
  }>
  edit(change: {
    text: string
    expectedVersion: string
    label?: string
    group?: string
  }): Promise<{ status: "applied" | "stale"; snapshot: TextSnapshot }>
  save(): Promise<{ status: "saved" | "conflict"; snapshot: TextSnapshot }>
  undo(): Promise<TextSnapshot>
  redo(): Promise<TextSnapshot>
}
```

快照包含完整 text、opaque 内容 version、encoding、bom、dirty、conflicted。
同一文件在 Space 会话内只有一份宿主工作副本，内置编辑器和插件共享。
observe 原子读取并订阅，初始值之后顺序交付事件；如果连续交付失败，明确终止并要求重新订阅，不能静默丢更新。

edit 仅在版本匹配时更新内存，stale 返回当前内容但不覆盖。
确认后的编辑由宿主统一管理脏状态、关闭提示与保存落盘。
插件仍需保护未确认输入、串行提交自己的编辑、正确处理 stale，不能盲目覆盖。
全文按原编码最多 2 MiB，保留 UTF-8/UTF-16LE/UTF-16BE 和 BOM；拒绝截断、二进制或不支持编码。
1.0 不需要按行／范围／流式 API。
read/observe 要求 read；edit/save/undo/redo 要求 write。无可用撤销／重做时返回原快照。
撤销／重做针对执行时的最新宿主状态，文本改变会产生新版本。

文档撤销统一交给宿主，嵌入的编辑器需关闭冲突的独立文本历史；选区／滚动可由视图管理。
每次有效 edit 默认一个历史项，同视图生命周期、同 group、连续两秒内且无外部编辑／保存／
撤销／重做／重载打断时合并成一次撤销。group 最多 128 字符，不跨生命周期合并，相同文本为 no-op。
每文档最多保留 100 项、16 MiB 编码历史，不影响当前内容或保存基准。

保存时捕获工作内容和磁盘 revision，串行执行。保存 V3 期间产生 V4，V3 成功后更新保存基准，
V4 若不同仍为 dirty，不能清除。返回最新工作状态。
干净文档的外部修改自动刷新，脏文档保留并标记冲突；由宿主提供明确确认后的重载／丢弃／保存副本。
原子替换沿用宿主规则，不声称能对不合作的外部程序提供 OS 级 CAS。

停用／重载插件保留宿主确认的工作副本；关闭文档、Space 或窗口提供保存／丢弃／取消。
确认并不保证崩溃恢复。超时、撤销和释放不能取消已提交的写入，不确定时检查实际状态后再重试。

### 文档格式化程序

清单可声明 `formatters: [{ id, title, extensions }]`。ID 在该数组内唯一，扩展名
采用文档 Action 的规则，禁止 `.eidos`。仅提供 formatter 的插件也是合法插件，
必须声明 extension 入口，并在激活返回之前恰好注册全部声明：

```ts
ctx.formatters.register("typography", {
  async format({ text, path, signal }) {
    return { text: await formatText(text, path, signal) }
  },
})
```

Provider 仅获得文本、Space 相对路径和取消信号，返回 `{ text: string }`，没有文档
句柄、资源句柄或编辑／保存接口。宿主通道也必须拒绝 formatter 直接发出的文档 RPC。
注册返回 Disposable，受扩展生命周期约束；禁用、撤销授权、关闭和超时取消执行，
迟到结果不得写入文档。

宿主固定目标和草稿版本，用一次可撤销的修改应用结果，保留编码、BOM 及文本大小限制。
期间的新输入会使旧结果失效，不能覆盖新内容。相同输出不增加历史、不改变 dirty 状态，
格式化不自动保存。原生编辑器的草稿变化或导航也必须取消其过期格式化请求。
每次调用以当前宿主编辑器的缓冲区为准，包括原生撤销或放弃修改后的内容，不能复用
插件侧此前格式化得到的工作副本。

宿主提供“格式化文档”“使用其他格式化程序…”和“配置默认格式化程序…”。只有当前
Space 已启用且匹配扩展名的 provider 可用。单个候选自动执行；多个候选没有可用默认值
时弹出选择。默认值按 Space 和扩展名隔离，可重置；默认 provider 不可用时提示选择，
不静默替换。一次性选择不修改默认值。默认快捷键为 macOS 的 ⇧⌥F、Windows 的
Shift+Alt+F、Linux 的 Ctrl+Shift+I，可在宿主快捷键设置中修改。
本契约不包含选区格式化或保存时自动格式化。

## 9. 结构化数据与输出

EidosResource 暴露一个受权限限制的 Eidos 表格数据引擎客户端（属性名为 `data`），提供对 `.eidos` 文件结构化数据（表、行、列、视图与模式）的安全访问，而不是裸 SQL 或平行的查询语言。固定允许的方法如下，参数／结果／校验／revision／错误沿用底层 Eidos File 数据引擎契约，RPC 统一异步：

| 授权               | 数据引擎方法                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| read               | inspect, listTables, getTable, listFields, listViews, getRow, queryRows, countRows, countRowsByField, aggregate |
| write（还需 read） | mutateRows, mutateSchema, createView, updateView, deleteView, reorderViews                                      |

SDK 从底层数据引擎的类型派生，不额外开放 connection、raw SQL、文件生命周期或管理接口。数据引擎错误保留原始 code/details，不压成 IO_ERROR。
EidosResource 提供 observeRevision(listener)，原子返回当前 revision 和订阅。
提交（包括其他编辑器的修改）产生失效通知，客户端通过授权数据引擎重新查询；可合并到最新 revision，
不携带其他表内容，不意味着跨文件快照，也不改变底层数据引擎语义。

TableContext 是绑定单一表和保存视图的适配接口，包含 tableId/viewId。
read() 返回绑定表的 fields 和 view。getPage({offset,limit}) 委托既有底层表格数据源，
固定使用宿主当前搜索、筛选和排序；offset 为非负安全整数，limit 为 1 到 1,000，
行键使用字段 tableColumnName，保留数据引擎投影语义。
aggregate(options) 提供分组与字段聚合（count, sum, average, min, max），由底层数据引擎高效完成。
updateProperties(properties) 替换绑定视图的 properties.plugin 并保留其他属性，要求宿主可写，
JSON 载荷最多 16,384 字符。只读记录视图也可保存配置，但不能修改记录。
openRecord(rowId) 核验记录属于绑定表后委托宿主打开。
observe(listener) 返回可释放的失效订阅；先订阅再读取，宿主表／视图／查询变化后重新查询。
通知可合并，不保证跨多页读取的事务快照。此接口不开放其他表、记录修改、schema 或视图生命周期操作。
启用的 table/view 贡献出现在既有视图菜单，类型保存为 plugin:<plugin-id>/<view-id>。
禁用或卸载插件保留保存视图及配置，使用既有未知视图回退。
结构化修改即时通过底层数据引擎提交，不属于文本草稿，没有 TextDocument.save，也不虚构跨文件事务。

OutputDirectory.begin 创建暂存 batch，提供 write(path,bytes,mediaType)、commit、dispose。
每文件最多 16 MiB，每 batch 最多 64 MiB／1000 文件。提交前校验完整计划，覆盖已有文件需宿主
确认并重新核对目标 revision，不隐式删除。返回逐文件结果并报告部分失败，不承诺多文件原子提交。
生命周期结束清理未提交暂存；不能自动执行或安装生成的文件。
write 接收 Uint8Array 并在调用时复制，重复路径报 ALREADY_EXISTS。
commit 只允许一次，结果 status 为 complete/partial/cancelled/failed，files 列出每个路径的
written/failed（code/message）/skipped 结果。取消仅指尚未写入任何目标时的用户取消，
部分写入必须报 partial；提交后再次写入／提交报 INSTANCE_CLOSED。响应不确定时不能自动重试。
个人站点可以读取文档和授权的数据引擎数据后输出 HTML/CSS/资源，预览使用现有页面沙箱。
任意本地服务器、带插件权限执行生成 HTML、部署、凭据与域名管理不属于 1.0。

## 10. 设置与宿主交互

设置为声明的扁平 boolean/string/number 键，含标题、默认值、可选描述、字符串枚举和数值范围。
提供 get/update/reset/observe，observe 返回初始有效值与 Disposable。
Settings 的 update(key,value)、reset(key) 隐式作用于当前实例的 Space 和插件 ID，不接受 scope 参数。
优先级为 Space 设置 → 清单默认，只开放当前插件声明的键。
变化只通知同一 Space 中有效值改变的实例。设置与授权记录按 Space 索引存储在本机，
按 Space 隔离不要求写入 Space 文件夹。设置不是秘密／blob 存储或执行授权。
不兼容旧值保留原始数据、使用合法默认值并显示诊断。
设置键遵循局部 ID 规则，数字必须有限，字符串最多 4 KiB，有效设置合计最多 64 KiB。
observe 采用与文本文档相同的原子订阅保证，具体类型以英文第 10 节为准。

### 表格配置

表格视图可声明 `configuration: { type: "object", properties: { ... } }`，
由宿主生成视图设置表单。属性必须包含 `title`、`type` 和 `default`，
支持 boolean、string 和 number，以及字符串枚举、数值范围和字符串类型的
`"x-field": true` 字段选择器。最多 32 个属性、16,384 个 JSON 字符；
未知关键字和非法默认值会被拒绝。值保存在视图的 `properties.plugin` 中，
`table.read()` 补齐默认值，`table.observe()` 通知读取方刷新。

插件自行管理的表级配置独立于视图属性，宿主必须将其保存到
`eidos__tables.settings_json` 的 `plugins[pluginId]` 下。值是插件拥有的
不透明 JSON 对象；宿主不解释动作定义、提示词或字段映射。插件可提供 YAML
导入导出，但不要求独立 YAML 文件。凭据不得保存在这里。

```ts
table.pluginConfig.read(): Promise<{ value: JsonObject | null; version: string }>
table.pluginConfig.write({ value, expectedVersion }): Promise<{ value: JsonObject | null; version: string }>
table.pluginConfig.observe(listener): Disposable
```

表和插件 ID 由宿主绑定，插件不能指定。未配置时返回 null，写入 null 仅删除
当前插件的命名空间。写入要求声明 write 权限且表可写。规范化 UTF-8 JSON
上限为 64 KiB。已有元数据非法时必须保留并报错，不得静默覆盖；其他表设置及
其他插件配置必须保留。

version 是当前插件配置的内容令牌，不是文件 revision 或递增计数器。过期令牌
必须导致写入失败。宿主在固定 Runtime revision 读取设置，并在相同 revision
执行 schema preflight/mutation。并发文件修改也可能导致失败，此时应重新读取，
不得盲目重试。observe 是失效通知，可能包含其他表变化，不发送初始值；调用方
应先订阅再读取。多个监听必须共存。

Lite 表格插件视图已实现此配置 API。表格动作通过
`ctx.actions.registerTableProvider(id, { getItems, run })` 注册，必须对应声明的
table action 和 `table/context` 位置。`getItems({table,signal})` 最多返回 100 项，
局部 ID 唯一，标题为纯文本，targets 为 row、selection、view。列菜单只允许读取
表元数据和插件配置。执行期间不暴露配置写入或 observe；
配置编辑应在挂载的表格视图完成。

宿主按当前有效查询冻结记录 ID，包含 Grid 尚未加载的记录；选区 endIndex 不包含
在范围内。工具栏处理全部筛选结果，在选区内右键处理该选区。后续新增记录不加入
本次任务。固定范围期间 revision 变化或超过 100,000 条时拒绝执行。
`target.read({offset,limit,fields})` 每次最多读取 100 条、64 个字段，返回本次任务
专用的 readToken，已删除记录跳过。`target.update({readToken,values})` 要求声明
write 权限，仅能原子更新已有记录中经过宿主样例校验所声明的字段；输入、输出或字段
定义变化时拒绝旧结果。不得改 schema、新增或删除记录，Runtime 负责类型校验，
宿主同一时刻只允许一个写入。

`task.preview(rows)` 作为兼容的样例和输出范围声明保留：宿主校验最多三条样例，
输出字段集合相同且最多 16 个，直接返回 true，不再展示确认预览。执行动作直接
应用结果。`task.report({completed,message})` 在表格右下角的非模态任务卡报告进度，
最后提供的 message 单独显示，在完成、出错和撤销/重做后保留，新任务开始时清空。
message 为最多 300 字符的纯文本，可包含插件计算的估算值。
任务卡可最小化和展开；关闭会移除窗口及最小化任务条，进度更新或完成不会重新弹出，
下一次执行会打开新任务卡。关闭窗口不取消执行。取消中断网络并阻止后续写入，已提交
的原子写入必须完成并保留撤销凭据。撤销按逆序恢复已完成记录，拒绝覆盖新编辑；
撤销生成反向凭据，重做直接恢复保存的结果，不重新调用插件或网络，并执行同样的
冲突检查。无变化结果不写入、不生成凭据。任务运行中不可撤销或重做。
凭据只保留在当前会话，最多 64 MiB，关闭表或开始下一次任务时释放。撤销遇到冲突
时会停止，之前已恢复的记录保留，并非整批事务。

manifest 的 `connections` 最多声明八个 `{title,url}` 固定 HTTPS 端点。宿主用
系统加密存储 Bearer key，按 Space、插件、连接和 URL 隔离，不向插件代码暴露，
不写入表 JSON 或插件包。`connections.request({connection,body})` 只允许向此固定
端点发送 JSON，禁止重定向和私有地址，固定 DNS，请求/响应上限 1/4 MiB，25 秒
超时。只有活跃任务可发请求，关闭实例会取消请求。Lite 每个插件实例的所有连接
合计最多两个在途请求，超出时返回忙碌错误；取消任务会终止该实例的全部在途请求。
这不允许并发写表。无安全加密能力时拒绝保存和使用。
当前 Lite 实现此执行契约，其他宿主完成相同约束前不得宣称支持。

连接可声明 `configurable: true`，由 Lite 插件设置管理完整 HTTPS endpoint、模型 ID
和加密密钥，manifest URL 仅为初始建议。配置按 Space/插件/连接隔离，不写入
`.eidos` 文件。更换 endpoint 必须重新输入密钥，仅修改模型可保留原密钥。宿主覆盖
请求体中的 model，保留大小、并发和网络限制，请求超时为 90 秒。
Eidos 文件视图可通过 `file.connections.configured(id)` 和
`file.connections.request({connection,body})` 使用声明的可配置连接，不可读取密钥或修改
连接配置。要求有效实例及匹配的 Space、拥有者和包版本；关闭实例取消请求。工作区
设置实例只能管理配置，不能发请求。其他宿主必须拒绝不支持的能力。
请求使用 Lite 自身的 User-Agent；OpenCode Go 额外携带按连接和当前实例生成的稳定
哈希 `x-opencode-session`，不发送原始实例票据或以密钥作为会话 ID。服务端 JSON 错误
消息在长度限制和密钥脱敏后返回插件；正常连接失败不触发编辑器降级界面。

不支持宿主管理的动作模板及 `pluginActions.instances`。Smart Actions 自行管理
动作列表、提示词、字段映射与 TypeSafe 接口，宿主负责菜单、任务窗口和数据权限。

HostUI 提供异步 notify、select、confirm、navigate、resolveAsset、openLink，文本最多 4 KiB。
取消必须显式返回，不能视为批准。插件不能伪造宿主权限提示，可受提示频率限制。
select 选项非空、最多 100 项且 ID 唯一；返回 selected/id 或 cancelled。
confirm 返回 confirmed/cancelled，openLink 返回 opened/cancelled，resolveAsset 返回局部 URL 字符串。
mount/dispose 契约不绑定框架。视图可在宿主提供的 root 中使用 React 等浏览器 UI 框架；
前端 UI 框架作为锁定的插件依赖打包，宿主不提供共享 React 实例。TSX 编译使用自动 JSX 转换（automatic JSX transform）。
编译器可在构建时解析锁定依赖中的字面量 CommonJS require；动态 require 和 Node/宿主模块仍被禁止。
插件释放时必须卸载框架 root 并清理文档订阅。

主题以 --eidos-background/foreground/muted/border/accent/font-family/color-scheme 注入，
值来自共享 UI 的白名单语义 token，变化不重建视图或丢失焦点／草稿。
不需要额外主题服务对象；宿主事件通过有归属的 typed observation 提供，不设任意全局事件总线。

## 11. 隔离与诊断

宿主签发的通道绑定 revision、实例、贡献、Space、句柄和授权代际，可信边界逐请求核对。
不能靠调用者提供的 ID 或路径证明权限。运行时阻止未声明的网络、eval、远程脚本、导航、弹窗
和自行创建的 frame。宿主可用进程／worker 实现隔离，不暴露原生运行时。

manifest 可选 browser 字段接受 workers?: boolean 和 networkOrigins?: string[]。
origin 必须为唯一的精确 HTTPS origin（最多 8 个），不含凭据、路径、通配符或 CSP 分隔符。
安装时展示网络来源及 Worker 能力；能力声明改变需要重新进行安装审阅。
workers: true 仅允许包内代码创建 Blob Worker，不允许远程脚本 Worker。
CSP 只放行声明 origin 的连接和图片，以及局部 data/blob 图片；默认仍禁用网络和 Worker。
在线底图是可选增强，不应让插件安装或离线替代方案依赖联网。

自包含插件包可以嵌入 WebAssembly 字节并在本地实例化。CSP 为此允许
`wasm-unsafe-eval`，仍禁止 JavaScript `unsafe-eval`。WASM 导入不会获得额外
宿主权限，网络、原生能力和文件系统仍须遵守既有能力授权边界。
iframe 不能共享宿主同源存储或特权文档状态。

激活／挂载 10 秒，动作 30 秒，每通道最多 64 个待处理 RPC，单请求 30 秒。
元数据请求最多 256 KiB，文本和输出按各自上限处理。
这些是协作式截止时间，不保证抢占同 renderer 的同步阻塞，也不保证独立崩溃隔离。

稳定错误码：INVALID_REQUEST、UNSUPPORTED_API、PERMISSION_DENIED、RESOURCE_UNBOUND、
DOCUMENT_UNAVAILABLE、INSTANCE_CLOSED、STALE_REVISION、ALREADY_EXISTS、BUSY、TOO_LARGE、
IO_ERROR、TIMEOUT、CANCELLED、REGISTRATION_CONFLICT、DEPENDENCY_MISSING、SOURCE_INVALID。
文本 stale/conflict 为结果，数据引擎错误单独保留语义。
所有 observe/observeRevision 支持可选的第二个 onError({code,message}) 回调，终止性交付失败
只调用一次并释放订阅；未提供回调时宿主显示诊断。主动释放不报错。
单个回调失败不影响其他插件或观察者。诊断包含插件、revision、Space、贡献、阶段与可得的源码位置，
默认不记录文档内容或秘密。agent 读取日志／插件文本时仍必须按不可信数据处理。

## 12. Agent 创作工具与版本接受

创作接口属于可信宿主工具，不属于插件 SDK。agent 获准修改源码，不自动获得执行代码或访问数据权限。
插件不能利用数据授权修改自身／其他插件，也不能调用安装或接受版本的工具。

| 命令                                                           | 行为                                           |
| -------------------------------------------------------------- | ---------------------------------------------- |
| `eidos plugin create <directory> --template action\|view`      | 生成最小项目，默认 view                        |
| `eidos plugin check <source>`                                  | 静态清单／引用／依赖／完整类型检查，不执行代码 |
| `eidos plugin dev <source> --space <target>`                   | 建立授权创作会话，加载并自动监听               |
| `eidos plugin inspect <session-id>`                            | 查看 revision、声明、授权、状态和有界诊断      |
| `eidos plugin invoke <session-id> <action-id> --target <json>` | 通过普通上下文和权限检查执行显式目标           |
| `eidos plugin accept <session-id> --revision <id>`             | 接受一个具体成功候选                           |
| `eidos plugin rollback <session-id> --revision <id>`           | 在当前授权下恢复保留的版本                     |
| `eidos plugin pack <source> --out <file>`                      | 校验并产生离线包，不激活                       |

CLI 与 agent 使用同一服务／规则，不能另开特权通道。所有命令支持结构化 --json，dev 输出版本化 JSONL 事件流。事件含 schemaVersion:1、sessionId、递增 sequence、phase、已知 revision 及
结构化诊断 code/message/file/line/column。阶段为 checking、transforming、awaiting-authorization、
activating、ready、failed、stopped、rolled-back。终止失败返回非零；watch 中候选失败可继续运行旧版本。
target 为 workspace，或带 Space 相对 path 的 document，或带 .eidos 相对 path、tableId、viewId、可选 rowId 与 instanceId 的 table
判别联合（精确 JSON 形状见英文第 12 节）。路径只用于选择，不授予权限；会话已固定 Space。
交互调用可省略 target 后使用宿主选择器，JSON／无交互调用必须指定。
缺失授权返回 awaiting-authorization 或结构化 PERMISSION_DENIED，没有交互输入不等于同意。

首次连接由宿主选择 Lite/Space 并授权插件身份、来源和权限上限，使用本地认证通道；
不能自动发现陌生目录并执行，不能开放未认证的网络重载接口。
inspect 区分请求与已授予的权限。

版本状态为草稿源码 → 校验候选 → 运行试用 → 已接受，不是四种插件。
同身份／目标／授权上限内的源码修改可自动重载，不反复确认；新增数据范围、操作、特权绑定或改变身份需追加授权。
接受由用户或获明确委托的 agent 决定，不由插件代码决定。

候选先校验暂存再替换。停止旧动作而不重放副作用；工作副本和设置保留，光标／滚动尽量恢复。
失败时恢复仍有有效权限的上一个版本，否则内置回退。有动作的版本接受前必须通过注册激活验证。
接受后保存自包含产物，重启不依赖源码或 node_modules。保留已接受版本和上一个有效试用版本，
更早版本可显式保留／清理。撤销的权限不能因回滚复活。
**回滚代码不会回滚文档、表格数据、输出文件、设置或授权。**

agent 与人的插件执行规则一致。类型检查成功不等于行为正确，还必须获取运行时／界面反馈。
创作循环不要求显式 build，也不要求每次修改都 pack 再安装。

## 13. 五个参考场景与验收

| 场景            | 贡献                             | 数据                                |
| --------------- | -------------------------------- | ----------------------------------- |
| CSV 编辑器      | document view、可选格式化 action | 当前 CSV 工作副本                   |
| Markdown 编辑器 | document view                    | 工作副本、受控附件、宿主撤销        |
| Journals        | page view、可选新建 action       | 授权 Markdown 目录                  |
| 个人站点        | page view、可选生成 action       | Markdown、只读 .eidos、可选输出目录 |
| 时间线          | table view                       | 受限数据表／已保存视图              |

英文稿为每组验收定义了稳定编号：M01 清单归一化；S01/S02 无显式构建源码加载与依赖；
P01 安装包边界；A01/A02 作用域与安全授权；V01 挂载／注册／调用绑定；D01/D02 工作副本、
保存竞态与历史；R01 文件夹和附件；E01 数据引擎与自定义视图；O01 输出；U01 设置与主题；
L01 生命周期与诊断；G01 agent 创作及权限、代码／数据回滚边界。

测试必须覆盖源码和安装包两条路径，并使用真实沙箱验证，不只依赖 mock。
建议先做源码加载与 views/actions，再做工作副本／授权，接入数据引擎／输出，最后打通创作闭环。
完整符合性要求全矩阵通过。后续兼容新增必须保持语义，破坏性变化升级 API major，不静默重解释 1.0。

## 插件兼容契约

清单可声明 `requires: { "pluginApi": "1.1.0" }`，使用无前导零的稳定三段版本，
每段必须是 JavaScript 安全整数。它表示最低插件 API，与 npm SDK 和产品版本独立。
宿主在安装、替换和执行前检查：主版本必须相同，最低要求不得高于宿主支持版本。
检查失败必须保留原安装。

宿主从视图上下文、扩展、动作、格式化器、连接、资源、设置、存储和浏览器权限推导
功能要求，开发者无需维护 capabilities 清单。共享定义位于
`packages/plugin-runtime/src/compatibility-data.json`。此实现的 Lite 支持 1.1.0，
CLI Serve 支持 1.0.0；这些标记不追溯适用于历史发行版。1.1.0 包含动态表格动作、
表格插件配置、任务、连接和 eidos 文件视图。CLI Serve 仅实现表格视图及声明的浏览器
权限，即使最低版本满足，也必须拒绝不支持的功能。API 版本不能代替宿主功能检查。

声明最低版本的包必须使用格式 2，格式 2 必须包含该声明，格式 1 不得包含。
旧版 Lite 和 CLI 安装器因此会拒绝新包，而不是忽略字段继续执行。历史 CLI Serve
直接加载本地包时未检查格式，此路径无法追溯保护，必须升级 CLI。未声明的格式 1 旧包仍可在功能满足
时加载，诊断结果标为未声明。静态清单无法证明任意动态调用的兼容性，使用新 API 时
作者仍需提高最低版本。兼容检查与权限授权独立，不引入日期兼容机制。

`eidos plugin doctor [package]` 在不安装、不执行插件的情况下报告宿主支持及兼容
结果。诊断命令成功并不表示兼容，调用者须检查 `compatible` 字段。Lite 插件详情
展示最低及宿主 API。注册表描述仅供参考，安装时以下载的包为准。
