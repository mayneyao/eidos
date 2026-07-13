# RFC：Space、Base 与 Changes 的产品交互

状态：草案，实施中
日期：2026-07-08
负责人：Eidos
相关文档：

- `eidos-space-base-storage.zh.md`
- `eidos-base-file-format.zh.md`
- `eidos-space-markdown-runtime.zh.md`
- `eidos-graft-space-versioning.zh.md`

## 实施状态（2026-07-13）

已经实现的 UX 包括：打开文件夹作为 Space、基于 Pierre Trees 的文件树、Files/Version
sidebar modes、独立 Notion 风格 Markdown editor、VS Code 风格 staged Changes、
Diff tabs、独立 History tab 和上下文 Codex 风格 Settings sidebar。Indexed quick
open 和紧凑的 Outline/Backlinks sections 已经接入，并且没有增加文档区 chrome。
当前 Space switcher 保持在侧边栏底部。

`.base` route 现已使用 production Grid 交互层，支持按可见区域分页加载、optimistic
cell edit、copy/paste、undo/redo、持久化 column layout、基于 compact ranges 的批量
删行、就地搜索以及持久化的嵌套筛选和多字段排序。Filter groups 复用原表格锚定式的
AND/OR 编辑模型，并支持派生 Formula/Lookup 字段。筛选/排序分页与批量删行使用同一个
结构化查询模型，因此删除的始终是 Grid 当前展示并选中的记录。Base 创建支持命名、
模板和原子发布。working Changes 与 History 也已提供 Base-aware table/row inspector。

每个 table 现在可以拥有多个彼此独立的 Grid views。紧凑的锚定 view switcher 支持
创建、重命名、复制、重排和删除，不打开居中弹窗；每个 view 分别保存 query、字段
显隐、列顺序和列宽。迁移导入的非 Grid view metadata 会继续保留并显示类型，但在
相应 renderer 完成前不会伪装成可工作的布局。

Base 导航现在按 workbook 层级组织，不再把 table 和 view 混在同一工具栏：当前 table 的
views 占据顶部 tab strip，tables 则作为 Excel 风格 sheets 常驻底部切换；view 新建与管理
仍锚定在顶部，保存状态移入底部 sheet bar。每个 sheet 的原生右键菜单也可以直接 Rename/Delete，
继续复用 workbook 已有的锚定重命名界面和破坏性确认，不新增另一套弹窗路径。Grid 同时复用了
legacy table 的实测 scrollbar
补偿：列宽未溢出时，sticky trailing row 不再为不存在的横向滚动条保留空白带；列宽溢出时
则完整保留原生横向滚动条高度。

Cmd+P 继续使用 Space 统一 Quick Open，不引入 Base 专用弹层。当前 tab 为 `.base` 时，
结果顶部会增加 `Tables in <file>.base` 上下文分组，可按 table 名、底层 table 标识或
Base 路径过滤并直接切换；普通文件结果仍在同一面板中。底部 sheets 同时支持
Ctrl+PageUp/PageDown 循环切换，保留高频键盘路径而不改变全局搜索的心智模型。

Desktop 全局快捷键现在会在监听器挂载到已聚焦主窗口时立即注册，因此 Cmd+P 和其余
shell shortcuts 首次启动即可使用，不再要求先失焦再重新聚焦。初始聚焦、后台启动、
renderer 分发以及 blur 后重新注册均已有 lifecycle tests 覆盖。

Base row mutation 现在会返回提交后的 metadata revision。Renderer 用 revision 识别延迟到达的
本地 file-watcher echo，不再把自己的 cell edit 当作外部文件替换并 reload 整个 Grid；普通
row/cell 保存也不会把所有 layout 暂时设为 disabled。外部修改仍会按新 revision 刷新。

Grid 的 range edit 现在会保留上述 optimistic 行为，同时避免每个 cell 分别执行一次
file open、IPC 和 transaction。Paste、fill 以及对应的 undo/redo 会先按 row 聚合，再通过
独立 Base runtime 的同一个 transaction 提交；任意一行失败都会回滚整个 range。行级
mutation revision 还会阻止旧响应覆盖较新的 optimistic 值。组件测试会断言整段 paste 和
undo 各只触发一次 batch call，真实 SQLite runtime 测试会断言后续 row 失败时前面修改也会
回滚。

Optimistic 保存失败后会先重新加载持久化 rows，再继续 mutation queue；原始错误会保留在
可关闭且可访问的 alert 中。恢复 reload 因此不会静默清除错误，也不会让后续排队编辑继续
运行在已经回滚的状态上。

Desktop shell 现在使用共享语义高度：titlebar 38px、surface workbar 40px、bottom statusbar
40px。Files/Version 分区栏与 Base view workbar 使用同一 workbar token，Space footer 与 Base
sheet bar 使用同一 statusbar token，跨 sidebar 和内容区共享的水平边界不再由组件各自写死。

Base workbar 现在按 editor 容器而不是整个窗口自适应。内容区变窄时，action labels 会收敛为
带完整可访问名称的图标控件，inline search 也会缩短，但 Search、Filter、Sort、Fields、
Import、新建记录和刷新能力都不会消失。View strip 隐藏原生滚动条，只在实际溢出时显示方向
按钮，并自动把 active view 滚回可视区域；所有宽度仍保持同一条 40px shell 边界。

file 字段现在使用从原表格交互适配出的 Base 专用多附件 cell。用户可以把文件导入
Space 可见的 `assets/` 目录、拖放到单元格、重排或移除附件、在 Eidos 中打开，或在
文件管理器中定位。日常附件编辑保持在 Grid overlay 内，只有必要的原生文件选择器会
中断工作流。

relation 字段现在沿用原表格交互：单元格显示关联记录标题，打开可搜索、多选的 Grid
overlay，并且只保存稳定 row IDs。formula 字段实时计算，按配置的 display type 只读
呈现；新建和编辑共用同一个锚定 CodeMirror composer，恢复 SQL/field completion、可搜索
reference browser、即时依赖/错误反馈和保存前的真实 Base row sample preview。两个流程都
不打开居中弹窗。

lookup/rollup 字段延续同一套表头驱动流程：用户在锚定字段面板中选择已有 relation、
target field 和 aggregation。派生值在 Grid 中保持只读，会随着 relation/target 修改刷新，
也可以继续供 formula 使用，不引入单独的配置页面。

字段配置现在统一进入 Grid 右侧的非模态 Property workspace。所有列头和 table structure
菜单都可以打开它；名称就地保存，基础 source field 可以显式确认后安全转换类型，Select/
Multi-select options 支持逐项新增、重命名、配色、拖拽排序和删除，Number 的 format、bar、
maximum、color 与 label 配置会直接作用到 Grid。删除 option 会在同一 Base transaction 中
清理已有 cell 引用。字段创建与后续 Property 编辑复用同一套 option rows，包含去重、配色和
拖拽排序；Number 创建与后续编辑也复用同一套 display controls。连续 Number 修改会基于最新
本地状态合并，option/Number mutation 被拒绝时会恢复最后持久化的展示。旧的逗号文本 Options
弹窗和字段 Rename 弹窗路径已经移除。
字段类型入口已经替换为共享的 Basic/Advanced 分类 picker，包含图标、说明、关键词搜索和确定性的
键盘选择；Base 不再把不同能力的字段压进一个无差别下拉列表。

Gallery 和 Kanban 现在已经接入与 Grid 相同的持久化 view lifecycle。Gallery 使用服务端分页数据、
响应式 card size、可选的空字段隐藏和共享 record inspector；Kanban 按 Select 字段分组，每组独立
分页，跨列拖动会持久化为字段修改，也可以直接在目标分组内新增记录。两个 layout 都复用当前 view
的搜索、筛选、排序、字段显隐和 Property workspace。
Gallery 会按当前宽度把 cards 编排成虚拟 rows，只挂载可见区域与 overscan；虚拟总高度来自服务端
总记录数，而不是已经加载的行数。相邻滚动会请求前后 100-row page，远距离拖动滚动条会直接请求目标
offset，不再从第一页逐页追赶，也不再显示手动 Load more。Renderer 最多保留 500 条 Gallery rows，
每个 Kanban 分组最多保留 250 条 rows；超过边界时从窗口另一侧淘汰，因此访问过的数据和 DOM 都不会
随浏览深度无界增长。动态测量仍允许封面和字段数量改变 card 高度，搜索定位可以直接加载目标窗口并
滚动到对应 record。
Gallery 可以选择 File 字段作为封面，并切换适应/裁切；文件二进制只通过 Space file boundary
读取，并转换为临时 object URL。Gallery 与 Kanban 共用 view 级封面资源读取器；多个 card 引用同一文件，
或虚拟滚动让 card 卸载后再次挂载时，会同时复用正在进行或近期完成的二进制读取和已创建的 Blob URL，
不再重复触发 Space IPC、磁盘 I/O、Blob 分配和图片源解码。引用计数租约会保证任一可见 card 使用期间
资源不会被提前 revoke；没有活跃引用的资源再受 64 个条目、64 MiB LRU 上限和 60 秒过期约束。view 销毁
或缓存淘汰会 revoke 共享 URL，失败读取不会进入缓存；封面图片使用 lazy asynchronous decoding。
Gallery 与 Kanban 的 card 共用悬浮菜单和原生右键菜单，可以打开
record details，并按稳定 row ID 进行确认删除。同一个右侧 record inspector 现在可以在 Grid、Gallery
和 Kanban 中编辑：primitive source fields 会就地自动保存，Formula/Lookup 等派生值保持只读，保存
成功后会更新当前 layout，并且不会关闭 inspector。File 字段支持从 Space 导入、拖放、移除、打开和
定位；Relation 字段复用目标表搜索边界，并按稳定 row ID 保存单选或多选结果。

就地 row search 现在会显示过滤后记录的位置与总数；Enter 和 Shift+Enter 可以在保持输入框焦点的
同时向前或向后循环。Grid 会滚动并高亮目标行；Gallery 和 Kanban 会滚动到目标 card，并在目标尚未
加载时自动补齐所需分页。

Kanban 现在会对大量 option 形成的列做横向虚拟化，浏览和拖动期间都只挂载可见列与 overscan；
靠近边缘滚动时，虚拟窗口会前移并注册新出现的 drop targets，不再在 drag start 瞬间挂载完整的
Select option 集合。直接拖动的成功、取消和保存失败回滚会通过 assertive live region 播报；
键盘 Move-to 仍可访问全部 options，作为等价的非指针操作路径保留。
Kanban 启动时使用一次 grouped-count query 获取所有列计数，只为横向窗口内、未折叠的列加载首批
records；每列内部再按动态高度做纵向虚拟滚动并自动分页。大量 Select options 不再等价于同等数量
的文件打开与首屏查询，大分组也不会把所有已加载 cards 同时挂载到 DOM。
Kanban mutation 的分页状态现在只在受影响的列内协调：移出已加载记录会同步回退来源列已经消费的
服务端游标；由于无法预知记录进入目标列后的服务端排序位置，目标列会从首批数据安全重扫，并按稳定
row ID 去重。Inspector 修改分组字段也复用同一套跨列迁移。没有激活搜索、筛选或排序时，分组内新增
记录只更新当前已挂载 board，不再让所有列重新挂载；存在 query 状态时仍会重新加载，以校准成员关系
和排序。

删除已经加载的 Gallery 或 Kanban card 也会在当前 view 内协调。文件 mutation 成功后才移除 card，
同时原位回退可见计数与已经消费的分页游标；父层不再让整个 card view 失效。Gallery 在显式刷新分页
期间还会继续挂载当前虚拟窗口，并在新首屏返回后原子替换。这样普通记录 mutation 不会出现空白 loading
帧、整批 card 重挂载或封面租约重复申请，同时筛选和排序刷新仍会最终收敛到服务端顺序。

当搜索、筛选、排序或显式 reload 改变分组查询时，Kanban 也遵循相同的 stale-while-revalidate
规则。匹配的列会在 grouped counts 和可见列首屏刷新期间继续挂载现有 cards，每个分页只在新结果
返回后替换。in-flight guard 会带上 query generation，因此旧请求结束时不能清除或重复触发新一代
的同名列请求。row count 通知只依赖分组 totals，不再因为 rows 数组或 loading 状态变化而让父编辑器
重渲染，避免大分组分页期间的额外工作。

Kanban 的渲染边界现在也与分页边界一致：group state 更新保留未受影响列的对象引用，列组件使用稳定的
move/collapse/load/create callbacks 和只随 Select options 变化的移动目标列表。单列首屏、自动分页或
loading 状态变化只重渲染该列，不会重算其他可见列。共享 record card 同样使用稳定 props 的 memo
边界，因此 Gallery 自动加载和 Kanban 局部更新不会重复执行未变化 card 的字段格式化、菜单构造和
cover 子树渲染；row 或 view 真正变化时仍会正常更新。

自动分页现在也有明确且可恢复的失败状态。Gallery 或 Kanban 请求失败后会关闭虚拟尾部触发器，
不会因为 loading 状态再次变化而连续重发相同请求；已经加载的 cards 会继续挂载，首屏/刷新失败和
下一页失败保持区分，原位 Retry 会按正确请求模式和当前游标恢复。因此单页暂时不可用不会形成
请求风暴，也不再要求用户重新加载整个 Base。可恢复错误只留在受影响的 Gallery 或 Kanban 列内，
不会在原位重试成功后仍残留一条全局 Base 错误提示。

CSV 导入的文件选择、分析和写入现在也保持锚定式、非模态工作流。原生 picker 返回后 mapping
panel 会立即打开；分析与导入显示真实 byte/row 进度，并可以原位取消。取消会终止隔离 worker、
等待 SQLite transaction 回滚，再解除当前 Base 的 mutation lock，因此重试不会和仍在退出的
worker 竞争，也不会留下部分 table 或 rows。

真实文件 Base versioning smoke 现在会创建 Grid、Gallery 和 Kanban metadata，关闭并重开文件，
编辑行，验证 Graft row diff，恢复初始 revision，再次重开并校验 records、派生值和三种 view
layout；恢复后的仓库状态为 clean。

原生 Desktop 也已经通过同一条产品链路验收：从 UI 新建命名的 Task tracker Base，编辑基础字段
和 Select cell，只 stage 该文件并创建版本，完整重启 Electron 后重开并校验记录，再制造 dirty edit，
最后从 History 恢复文件且不移动 HEAD。Graft 替换文件后，已打开的 Base 会立即刷新；恢复当前
版本时 worktree 会重新变为 clean。

与原表格 view 的当前能力对齐情况如下：

| 能力                                       | Base 状态                                  | 剩余边界                                                            |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------- |
| 持久化 view lifecycle 与独立 query/layout  | 自动与原生重启/恢复均已验收                | v1 暂无已知缺口                                                     |
| Gallery 字段显隐、空字段隐藏、card size    | 二维虚拟无限滚动与结果导航已工作           | v1 暂无已知缺口                                                     |
| Gallery cover                              | File 字段已工作                            | 旧 document-content 与 extension-block cover 不应耦合进独立 package |
| Card actions                               | 可编辑 Inspector 与删除已工作              | file-based Base 的 full-page row document 模型尚未定义              |
| Kanban Select 分组、计数、折叠、新增、拖动 | 横纵虚拟化、可见列懒加载和无障碍移动已工作 | v1 暂无已知缺口                                                     |
| Base merge conflict 审阅                   | 原生 row 审阅已验收                        | schema/opaque conflict 按设计使用明确的 whole-file fallback         |

这仍是第一版可工作交付切片，并未达到原表格 view 的完整能力。更多可移植 cover source 仍待完成。
Base 日常编辑和配置优先使用单元格内编辑、表头菜单、锚定 Popover 和渐进披露；居中弹窗只保留
给破坏性确认或必须中断当前工作流的决策。新增交互应先参考并复用原表格已经验证过的编辑方式，
不应仅为了实现方便把字段配置、记录编辑或 view 管理改成弹窗流程。

file Space Settings 已拆分为 General、Files/Obsidian、Versioning 和派生 Indexes；
legacy Space Settings 也已提供 server-owned migration preview、progress、validation、
reveal 和 open-new-Space actions。Settings 布局现在使用显式的 surface ownership：
简单设置行共享一层 Codex 风格分组边框，Account、provider、channel 等已有 Card/List
结构的富内容模块则保留自身容器，不再被通用 Card 二次包裹。这样会消除嵌套边框，
同时保持全局与 Space settings 的 section 节奏一致。原生 Space sync 与 path-first 文本 conflict
resolution 已通过双 Space Desktop 验收。Base conflict 现在会打开独立的非模态审阅 tab：
Graft 的 row/schema/opaque artifact 会保持结构化，row 值按 Base/current/incoming 字段对比，
每个受支持的 row 可以独立选择保留 current 或接受 incoming；schema 和 opaque conflict 会明确
降级为文件级选择。双 Space 原生验收已经覆盖 row-aware Diff、非模态审阅、接受 incoming row、
Base 自动 staged、双 parent merge continuation 和最终 push。

## 摘要

本 RFC 定义 Eidos 转向 file-based Markdown 文件和 `.base` 结构化数据文件后的产品交互模型。

UI 应该让存储模型变得清楚：

- Markdown 文件是文档。
- Base 文件是结构化数据工作簿。
- Assets 是普通文件。
- `.eidos/extensions/**` 是通过 Extensions UX 呈现的 Eidos 项目源码。
- 私有 `.eidos` 运行时状态保持隐藏。
- Graft 为可见 Space 做版本管理。

目标是避免把内部实现细节暴露成主要用户概念。

## 产品原则

Eidos 应该感觉像：

> 面向本地 Space 的结构化工作台。

而不是：

> 一个隐藏 SQLite 数据库外面套了个文件浏览器。

## 导航模型

主导航是 Space 文件树。

示例：

```txt
my-space
  notes/
    project.md
  tasks.base
  assets/
    image.png
```

默认行为：

- 点击 `.md` 打开 Markdown editor，
- 点击 `.base` 打开 Base workspace，
- 点击图片/PDF 打开预览，
- folders 可以展开/收起，
- `.eidos/` 和 `.graft/` 默认隐藏。

## 打开 Space

主要入口：

- Open Folder as Space，
- Open Recent Space，
- Create New Space。

打开已有文件夹时，Eidos 应检测：

```txt
.obsidian/
.eidos/
.graft/
*.base
*.md
```

检测不应该强制转换。它应该选择模式：

- plain Space，
- Obsidian-compatible Space，
- legacy Eidos Space，
- graft-enabled Space。

## 创建内容

新建内容命令：

```txt
New Markdown Note
New Base
New Folder
Import File
```

创建 Base 应该创建：

```txt
tasks.base
```

而不是：

```txt
.eidos/db.sqlite3
```

Base 创建流程：

1. 选择文件名，
2. 选择模板或空白，
3. 打开 Base editor，
4. 创建第一张表。

## Base 工作区

打开 `tasks.base` 应显示 Base 专属 workspace：

```txt
tasks.base
  Tables
    Tasks
    Projects
  Views
    Grid
    Kanban
```

预期 controls：

- table switcher，
- view switcher，
- add table，
- add field，
- import CSV，
- properties/settings，
- open file location。

交互规则：

- 现有 Eidos 表格是交互基线；引入新交互前，优先保留内联 cell editing、header actions、
  keyboard movement、clipboard 和 range selection，
- field 的新增和配置从 grid header 或相邻 controls 完成，
- table/view 配置使用 anchored menus 和 progressive disclosure，
- 居中弹窗默认被视为不良交互，不得用于日常编辑，
- 只有破坏性删除等必要场景可以要求确认。

Base 内部对象不应该作为单独 Space 文件出现。

## Markdown 编辑器

打开 Markdown 文件应该显示由该文件驱动的编辑器。

预期 controls：

- edit/preview，
- frontmatter support，
- attachments insertion，
- link autocomplete，
- optional backlink panel。

保存时写入 `.md` 文件。

## Changes UI

Changes UI 应该 path-first，并呈现 tree 结构。

示例：

```txt
Changes 4
  notes/
    project.md
  tasks.base
    Tasks table       +3 ~1
    Views metadata    ~1
  assets/
    image.png
```

规则：

- 先展示用户可见路径，
- 隐藏私有 `.eidos` 运行时状态，
- 通过 Extensions 产品视图展示 `.eidos/extensions/**`，
- 隐藏 `.graft/**`，
- 按文件夹分组，
- `.base` 作为可展开文件展示，
- 文本文件显示 text diff，
- 二进制文件显示 preview/summary，
- Base 文件显示 table-level diff。

Space mode 下，UI 不应该用这个作为主要变更项：

```txt
.eidos/db.sqlite3
```

## Commit 流程

Commit flow：

1. 用户 review changed paths，
2. 用户可选展开 `.base`，
3. 用户填写 message，
4. 用户 commit，
5. Eidos 在 history 中显示版本。

普通用户不应该需要理解 staging。

高级用户后续可以获得：

- include/exclude paths，
- commit selected，
- inspect raw graft status。

## History UI

History 应展示 Space-level commits：

```txt
Update tasks and project notes
  notes/project.md
  tasks.base
```

打开版本后可以：

- 查看 changed paths，
- 查看 Markdown diff，
- 查看 Base table diff，
- restore file/path，
- restore whole Space state。

## Sync UI

Sync 应被表述为 Space sync：

```txt
Push Space
Pull Space
Resolve conflicts
```

而不是同步 `.eidos/db.sqlite3`。

Payload hydration 应默认隐藏，除非需要用户操作：

- missing assets，
- download failed，
- conflict needs user choice。

## Settings

Settings 应拆成：

```txt
Space
  visible files
  ignored paths
  Obsidian compatibility

Versioning
  enable graft
  remote
  tracked paths advanced

Base
  default Base templates
  asset folder policy

Eidos Private State
  cache size
  rebuild indexes
```

Track/ignore 配置是高级设置。快速开始不应该迫使用户理解它。

## Empty States

新 Space empty state 应提供：

- create note，
- create Base，
- import Obsidian vault，
- enable versioning。

Base empty state 应提供：

- create first table，
- import CSV，
- use template。

Changes empty state：

```txt
No changes
```

而不是解释 graft internals 的教程。

## Migration UX

对 legacy spaces，Eidos 应显示：

```txt
This Space uses the legacy Eidos database model.
Export to Space/Base when ready.
```

Migration flow：

1. 解释目标布局，
2. 选择输出文件夹，
3. 预览数量，
4. 运行 export，
5. 显示 report，
6. 可选启用 graft。

不要 silent migration。

## 开放问题

1. `.obsidian/` 是否显示在文件树中？
2. Base tables 是在主文件树中挂在 `.base` 下，还是只在 Base workspace 内展示？
3. Changes 是否默认显示 Base generated diagnostics？
4. Commit selected paths 应该 v1 支持，还是放到后续？
5. 产品文案中 graft terminology 应该多可见？

## 推荐 UX 切片

围绕这个结构构建一个可点击 vertical slice：

```txt
sample-space/
  note.md
  tasks.base
  assets/image.png
```

这个 slice 应该证明：

- file tree 能区分 `.md`、`.base`、assets，
- Markdown editor 保存真实 `.md`，
- Base workspace 打开 `tasks.base`，
- Changes tree 显示这三个 changed paths，
- 展开 `tasks.base` 显示 table changes，
- 私有 `.eidos` 运行时状态保持隐藏。
