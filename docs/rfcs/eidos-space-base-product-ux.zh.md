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

Grid 列统计现在使用和可见记录相同的 view query。列头的 `Calculate` 子菜单会为每列持久化一个
兼容的聚合，并把结果直接显示在已有 trailing row，不增加工具栏或弹窗。当前 view 配置的所有列
会由独立 Base runtime 在持久 query worker 中通过一次参数化聚合查询完成；Renderer 不扫描已加载
分页，也不会同步阻塞 SQLite。搜索、筛选、显式刷新、成功 row mutation、字段删除以及不兼容的
字段类型转换都会确定性地刷新或清理持久化统计。

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
offset，不再从第一页逐页追赶，也不再显示手动 Load more。Renderer 最多保留 300 条 Gallery rows，
每个 Kanban 分组最多保留 150 条 rows；超过边界时从窗口另一侧淘汰，因此访问过的数据和 DOM 都不会
随浏览深度无界增长。动态测量仍允许封面和字段数量改变 card 高度，搜索定位可以直接加载目标窗口并
滚动到对应 record。
自动分页的进度与重试控件会通过零高度 sticky 层浮在 Gallery viewport 上，不会因为请求开始或结束而
改变虚拟滚动高度、推动可见 cards。
Gallery 会在浏览器绘制前的 layout 阶段读取 editor 容器真实宽度，因此首个可见帧直接使用最终的
响应式列数，不再先按 virtualizer 的 1024px fallback 排列、随后跳变。Resize Observer 返回的宽度
会先取整并去重再进入 React state，避免列断点附近的亚像素抖动造成无意义重渲染。
只有 Gallery 首屏或查询刷新会重新统计筛选后的总数；后续虚拟窗口请求会携带经过校验的已知 total，
因此滚动不会为每一页重复完整 `COUNT(*)`。Kanban 同样把 grouped-count query 的各分组 total 复用于
可见列分页。显式刷新、搜索、筛选、排序以及过期空尾页仍会重新校准权威总数。
自然 row 顺序和基于存储字段显式排序的连续向前 page 都会携带 opaque cursor。Gallery 和每个 Kanban
分组会把 cursor 与有界 row window 一起保存。自然顺序下一页会转换成
`WHERE __base_rowid > ? ORDER BY __base_rowid LIMIT ?`；排序 cursor 则绑定标准化后的搜索、筛选与排序
query，并记录上一页最后一行的排序值和 rowid。Runtime 不会把所有边界拼成一个大型 `OR`，而是按
“完全相同 tuple 后的 rowid、最后一个排序字段边界、逐级向前的字段边界”生成互斥且有序的短范围查询，
让可丢弃 view index 可以直接 seek，同时保持 SQLite 的 NULL、`COLLATE NOCASE`、混合升降序和 rowid
tie-break 语义。派生字段排序、超过 8 个排序字段、远距离滚动条跳转和向前回看仍回退到 offset paging，
以保持正确性并限制 cursor 大小；分页失败重试会保留完全相同的 cursor。在本地 100 万行 SQLite
基线上，200 次带筛选的自然顺序深分页读取使用 `OFFSET` 约 1.62 秒，使用 rowid cursor 低于 0.01 秒。
复合索引排序的 200 次深分页使用 `OFFSET` 约 0.78 秒；直接拼接的 `OR` cursor 反而退化到 1.58 秒，
按顺序执行的范围分支约为 0.02 秒。
这些分页和分组计数请求由当前 Space 持有的两个持久只读 worker 有界并行执行。Space 操作门现在使用
公平读写语义：Gallery 分页与多个可见 Kanban 列可以同时进入；排队中的 Base mutation、文件写入或
Graft restore 仍保持独占，并且不会被后到的读取越过。4 个并发可见列读取因此从 1 条串行执行通道变为
2 条有界通道，同时不会把同步 SQLite 工作搬回 Electron 主线程。重复虚拟滚动会复用已经校验的 Base
runtime；每个 worker 的 8 文件 LRU 上限避免文件描述符无界增长。文件 fingerprint 会在原地写入或
原子替换后强制重开，打包后的 worker smoke 已覆盖深分页、分组总数以及替换失效。
独立 Base runtime 还会为 Gallery 排序前缀和 Kanban 分组+排序前缀维护可丢弃的 SQLite 查询索引。
索引跟随 view lifecycle，在被索引字段转换或删除后重建，并在旧文件以 migration 模式打开时一次性修复；
它们只加速物理表，不进入 Base metadata 语义契约。可写 Base lifecycle 会先创建或修复索引，再由只读
query workers 使用；worker cache 记录打开后的 fingerprint，因此不会立刻无意义地重开未变化文件。
在同一台机器的 10 万行交付基线上，
远距离 Gallery 排序页从约 90 ms 降到 2 ms，Kanban 分组尾页从约 4 ms 降到 2 ms。
虚拟 row、card 和 column 的动态测量会按 animation frame 批处理，位移 wrapper 建立 layout/style
containment；Resize Observer 与布局失效因此被限制在已挂载 overscan 窗口内，同时保留可变高度与自动
无限滚动。row/card 的外层 wrapper identity 现在绑定绝对虚拟位置，不再在远距离分页到达后从 placeholder
key 切换为 record ID。数据 hydration 只更新 record 子树，不会卸载负责测量和 transform 的 wrapper；
record card 自身仍按稳定 row ID 建立身份边界，拖拽或局部组件状态不会在记录间串用。Gallery 和 Kanban
均有回归测试直接验证 placeholder hydration 前后保持同一个 DOM 节点。
Gallery 和 Kanban 都可以在各自的锚定式 view 设置中选择 File 或 URL 字段作为封面，并配置
适应/裁切和隐藏空字段；这些入口与共享 card renderer 已有能力保持一致。文件二进制只通过
Space file boundary 读取，并转换为临时 object URL；HTTP(S) URL 字段则直接渲染，不触发
binary read。Gallery 与 Kanban 共用 view 级封面资源读取器；多个 card 引用同一文件，
或虚拟滚动让 card 卸载后再次挂载时，会同时复用正在进行或近期完成的二进制读取和已创建的 Blob URL，
不再重复触发 Space IPC、磁盘 I/O、Blob 分配和图片源解码。引用计数租约会保证任一可见 card 使用期间
资源不会被提前 revoke；没有活跃引用的资源再受 64 个条目、64 MiB LRU 上限和 60 秒过期约束。view 销毁
或缓存淘汰会 revoke 共享 URL，失败读取不会进入缓存；封面图片使用 lazy asynchronous decoding。
二进制读取现在统一进入最多 6 个并发任务的调度队列。每个虚拟 card 持有可取消租约：滚动导致 card
在排队读取开始前卸载时，该请求会直接退出且不会越过 Space IPC boundary；已经开始但随后失效的读取
完成后也只会 revoke object URL，不会写入缓存。回归基线验证了并发上限为 2 时第三个请求必须等待，
以及已取消的排队请求不会触发任何二进制读取。
Gallery 与 Kanban 的 card 共用悬浮菜单和原生右键菜单，可以打开
record details，并按稳定 row ID 进行确认删除。同一个右侧 record inspector 现在可以在 Grid、Gallery
和 Kanban 中编辑：primitive source fields 会就地自动保存，Formula/Lookup 等派生值保持只读，保存
成功后会更新当前 layout，并且不会关闭 inspector。File 字段支持从 Space 导入、拖放、移除、打开和
定位；Relation 字段复用目标表搜索边界，并按稳定 row ID 保存单选或多选结果。
完整 card 表面也可以直接打开 inspector，不再要求用户先发现 hover icon。Gallery card 会进入键盘
焦点顺序，并支持 Enter 或 Space；虚拟 row wrapper 会从 accessibility tree 中移除，使 records 保持
正确的 list 语义。Button 和 menu action 仍独立处理事件，pointer 移动超过 6px 则抑制 card 打开，
因此 Kanban drag 不会意外弹出 record details。

就地 row search 现在会显示过滤后记录的位置与总数；Enter 和 Shift+Enter 可以在保持输入框焦点的
同时向前或向后循环。Grid 会滚动并高亮目标行；Gallery 和 Kanban 会滚动到目标 card，并在目标尚未
加载时自动补齐所需分页。

Kanban 现在会对大量 option 形成的列做横向虚拟化，浏览和拖动期间都只挂载可见列与 overscan；
靠近边缘滚动时，虚拟窗口会前移并注册新出现的 drop targets，不再在 drag start 瞬间挂载完整的
Select option 集合。直接拖动的成功、取消和保存失败回滚会通过 assertive live region 播报；
键盘 Move-to 仍可访问全部 options，作为等价的非指针操作路径保留。拖拽浮层直接读取 draggable
metadata 中稳定的 record title，不再序列化并重新插入整张 card DOM，因此即使 card 带封面和多个
可见字段，开始拖拽的预览复杂度仍为常数级。浮层统一使用主题 token 和兼容 reduced-motion 的
opacity 反馈，不再硬编码明暗色或加入装饰性的旋转、缩放。Pointer drag 需要明确移动 6px 才会
激活；card 内 button、link 和 input 的 pointer/keyboard 事件仍由控件自身处理。Base blocking
mutation 会直接禁用 card 拖拽，取消或落回原列也不再显示成功移动的高亮。
移动反馈改为稳定的 selector store：开始拖拽不会再向所有已挂载 cards 广播 context 更新，跨列移动完成
时也只重渲染高亮状态真正变化的 card。
Kanban 启动时使用一次 grouped-count query 获取所有列计数，只为横向窗口内、未折叠的列加载首批
records；每列内部再按动态高度做纵向虚拟滚动并自动分页。大量 Select options 不再等价于同等数量
的文件打开与首屏查询，大分组也不会把所有已加载 cards 同时挂载到 DOM。
Gallery 与 Kanban 的纵向虚拟滚动还会把实际滚动面限制在 12,000,000px，避免 Electron/Chromium
在 16,777,215px 附近截断 CSS layout 高度；物理滚动位置会映射到完整的逻辑记录范围。TanStack
内部 measurement 窗口最多保留 4,096 条，并以 1,024 条为分段前移；相邻窗口至少保留 75% 重叠。
这会削减 79.5% 的单列表 measurement entries；验收机上三次百万记录聚焦回归的平均测试耗时从
617ms 降到 582ms，完整测试进程平均峰值 RSS 从 212MiB 降到 207MiB。跨段时会清理另一份按
record key 累积的动态高度缓存，再只重测当前挂载元素，因此长时间滚动不会为每个曾访问 record
永久保留高度。百万条回归会从真实物理滚动终点分别请求 Gallery 的 999,900 和 Kanban 的
999,950 offset，同时验证滚动高度、measurement 数量、DOM 和 row window 均保持有界。
横向虚拟化也会约束已经访问过的列数据：当前窗口及两侧各两个相邻列保留 row window，离开的旧列会
释放记录，拖动期间则暂停回收。回收 effect 现在只依赖横向窗口、列数和拖动状态，不再因为单列 rows
或 loading 状态变化而重新扫描全部 Select options。200 个 options 的分页回归证明，一列开始加载下一页
时只执行 1 次包含 201 个 groups 的必要更新扫描，修复前会执行 2 次。
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
loading 状态变化只重渲染该列，不会重算其他可见列。每个已挂载 Kanban draggable/card pair 也有独立的
稳定 props memo 边界，因此同列 loading、record creation 输入和 page append 不会重渲染保留中的
cards。共享 record card 为 Gallery 分页保留相同边界：未变化记录不会重复执行字段格式化、菜单构造和
cover 子树渲染；row 或 view 真正变化时仍会正常更新。Card 移动保存时的 disabled 状态只传播到源列和
目标列，因此持久化开始与结束都不会增加无关可见 card 的渲染次数。每个 Kanban 虚拟 card wrapper
也只比较其索引对应的 row 与相关交互状态；分页、重试和行内新建状态不会再触碰保留中的 wrapper。
失败分页 Retry 回归中的可见 row 解析从 5 个虚拟项收敛为唯一的失败占位项。

Kanban 的行内新增组件会在列渲染边界之下独立持有草稿、提交和可恢复错误状态。输入内容时只更新表单，
不会重新执行整列虚拟器并重建可见虚拟项列表。对应回归将每次输入更新触发的虚拟器调用从 1 次降为
0 次，同时保留已有的新建、取消和失败重试行为。

Grouped counts 同时也是 Kanban 空分组的权威结果。计数为 0 的分组会清空旧窗口并直接进入已加载空态，
不再额外发起分页查询；刷新前后没有变化的空分组还会保留对象引用。在 200 个选项且只有 1 个非空分组
的稀疏看板中，首屏分页请求从 6 次降为 1 次，横向访问空列不会产生新请求；同一次刷新触发的空列
虚拟器调用也从 16 次降为 0 次。

Gallery 的虚拟行现在还会在 card 外形成第二层 memo 边界。分页进度、重试和其他只属于父组件的状态
不再重建已挂载 row wrapper；page merge 也只会重渲染可见 slot 真正新增或改变记录的 wrapper。
失败无限分页的 Retry 回归中，替换 page 返回前的已挂载虚拟行重复构造从 3 行降为 0 行。

Card 渲染元数据现在按 view 计算一次，而不是让每个可见 record 重复计算。字段顺序、封面字段、字段
数量限制和 Select/Multi-select option 索引会被 Gallery 或 Kanban 的可见窗口共享。未打开的操作菜单
不会预先展开全部 Move-to options。Kanban 的所有可见列还会保留同一个 board 级 Move-to option 数组，
不再为每列复制全部目标；每张 card 只携带当前禁用目标，活跃 move lock 只暴露给其源列和目标列。Desktop 原生子菜单只为每张已挂载 card 保留一个共享批次描述和
一个点击分发器，只有真正打开该 card 的右键菜单时才物化 Electron menu items；它不会为每个 option
挂载或常驻一个 React 节点、effect、菜单对象和闭包。主题状态也从每个可见字段一次订阅收敛为每张 card
一次。Inspector 修改非分组字段时只替换记录所在 group，未受影响列和 card 的 memo 边界会保持原引用；
可见列加载与横向 fallback geometry 也只依赖 option/window signature，不再随 rows 数组变化重复执行。
回归测试会证明 200 个移动目标、6 个可见列只保留 1 个 option 数组引用；菜单打开前读取 0 个 option label、
DOM 保持常数级，当前列保持禁用且点击仍能正确分发，
并验证一列中的 card 修改不会触发另一列 card 渲染。

自动分页现在也有明确且可恢复的失败状态。Gallery 或 Kanban 请求失败后会关闭虚拟尾部触发器，
不会因为 loading 状态再次变化而连续重发相同请求；已经加载的 cards 会继续挂载，首屏/刷新失败和
下一页失败保持区分，原位 Retry 会按正确请求模式和当前游标恢复。因此单页暂时不可用不会形成
请求风暴，也不再要求用户重新加载整个 Base。可恢复错误只留在受影响的 Gallery 或 Kanban 列内，
不会在原位重试成功后仍残留一条全局 Base 错误提示。Kanban grouped-count 失败遵循相同边界：首次
count 失败会结束 busy 状态并在板内提供 Retry；刷新 count 失败则保持已挂载列可交互，通过紧凑
retry bar 恢复，而不是替换整个板或永久停在 loading。首屏、刷新和自动分页失败都会成为局部
alert live region，加载进度则保持 status region；辅助技术可以感知恢复入口，同时不会再生成一条
重复的全局 Base alert。

锚定式 Base 创建、重命名、view 设置、Filter/Sort 和字段 Property workspace 共同遵循可恢复的
transaction 边界：保存期间不能关闭或重复提交，失败后保留当前草稿并只显示一条局部错误，父编辑器
仍会加载持久化快照，但不会再追加第二条全局 Base alert。Formula 与 Lookup 编辑器也使用同一规则，
并按稳定的 field identity 维持一次打开会话；恢复快照即使重新分配 field 对象，也不能覆盖仍打开的
公式、relation/target/aggregation 草稿或局部错误。保存会同步拦截重复快捷键和提交，锁定所有可编辑
控件与退出动作，只有成功才关闭，失败则原位保留可重试状态。只有没有自身恢复界面的 toolbar
mutation 继续使用全局 Base alert。

Record Inspector 自动保存与 Kanban 行内新建也遵循同一套局部恢复边界。Inspector 写入失败后即使父层
重新加载持久化 Base 快照，仍会保留并显示当前 optimistic 字段值；在用户解决冲突前锁定其他字段编辑，
并提供明确的 Retry 与 Discard change。Retry 会重新提交保留值，Discard 则采用最新持久化 row。Kanban
会在目标列保留失败的新建表单与 title，同步拦截连续点击，并通过同一个 Add 动作原位重试，不再生成
全局 Base alert。Card 移动失败仍只回滚受影响的列并在局部播报恢复。Board 边界现在会串行化 card
移动：一笔 optimistic move 持久化期间，其源列和目标列入口会禁用，board 暴露 `aria-busy`，同步
guard 会拦截所有其他移动事件，包括 React 来不及重绘 disabled 状态前到达的事件。只有持久化成功后才
播报完成；失败会恢复唯一一份权威 row 并解锁受影响列，既避免第一笔 move 失败、第二笔 move 已排队时
同一 row 同时残留在两列，也不会让每个可见 card 都失效并重渲染。

Grid 的单格写入和批量粘贴现在也拥有锚定式恢复界面。持久化失败后 optimistic 值会继续显示，父层恢复
快照不会再追加第二条全局错误，Grid 会原位提供 Retry 与 Discard，不引入 modal。连续快速编辑仍立即
显示，但写入会按顺序执行；如果较早的写入失败，尚未发送的后续编辑会合并进同一个可恢复 transaction，
不会基于缺失的前置状态继续落盘。用户 Retry 保留的整组修改或 Discard 回持久化 row 之前，Grid 会暂停
新的写入；Discard 同时重置局部 undo history，避免已经放弃的草稿又被意外重放。

Base 的次级工作区现在根据 active editor 的实际可用空间响应，而不是使用整个应用窗口宽度。Grid、
Gallery 和 Kanban 在主 view 至少还能保留 440px 时，将 320px Record Inspector 或 Field Property
panel 保持在 flex 布局中；低于由此得到的 760px 内容断点后，同一个 panel 会成为不透明的右侧覆盖层，
不再挤压或重新测量表格/card viewport。Panel 保留关闭动作和完整内容，也可以收缩到 editor 全宽，
无需引入 modal。Formula composer 使用独立容器断点：600px 以上保持 editor 与 reference browser 双栏，
以下重排为单栏并限制 reference list 高度；低于 420px 时 display selector 使用全宽。Formula popover
同时受当前可用 viewport 高度约束并在内部滚动，因此 Desktop 窗口缩小时，editor、preview、references
和保存动作仍然可达。

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

| 能力                                       | Base 状态                                   | 剩余边界                                                            |
| ------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------- |
| 持久化 view lifecycle 与独立 query/layout  | 自动与原生重启/恢复均已验收                 | v1 暂无已知缺口                                                     |
| Grid 列统计                                | view 级配置、worker 聚合并复用 trailing row | v1 暂无已知缺口                                                     |
| Gallery 字段显隐、空字段隐藏、card size    | 二维虚拟无限滚动与结果导航已工作            | v1 暂无已知缺口                                                     |
| Gallery 与 Kanban cover                    | File/URL、适应/裁切和隐藏空字段均已工作     | 旧 document-content 与 extension-block cover 不应耦合进独立 package |
| Card actions                               | 可编辑 Inspector 与删除已工作               | file-based Base 的 full-page row document 模型尚未定义              |
| Kanban Select 分组、计数、折叠、新增、拖动 | 横纵虚拟化、可见列懒加载和无障碍移动已工作  | v1 暂无已知缺口                                                     |
| Base merge conflict 审阅                   | 原生 row 审阅已验收                         | schema/opaque conflict 按设计使用明确的 whole-file fallback         |

这仍是第一版可工作交付切片，并未达到原表格 view 的完整能力。可移植的 File 与 URL cover
已经满足 v1 Base 边界；旧 document-content 与 extension-block cover 明确保留在独立 package 之外。
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
