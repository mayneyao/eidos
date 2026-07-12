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
清理已有 cell 引用。旧的逗号文本 Options 弹窗和字段 Rename 弹窗路径已经移除。

Gallery 和 Kanban 现在已经接入与 Grid 相同的持久化 view lifecycle。Gallery 使用服务端分页数据、
响应式 card size、可选的空字段隐藏和共享 record inspector；Kanban 按 Select 字段分组，每组独立
分页，跨列拖动会持久化为字段修改，也可以直接在目标分组内新增记录。两个 layout 都复用当前 view
的搜索、筛选、排序、字段显隐和 Property workspace。
Gallery 可以选择 File 字段作为封面，并切换适应/裁切；文件二进制只通过 Space file boundary
读取，并转换为临时 object URL。Gallery 与 Kanban 的 card 共用悬浮菜单和原生右键菜单，可以
打开 record details，并按稳定 row ID 进行确认删除。同一个右侧 record inspector 现在可以在
Grid、Gallery 和 Kanban 中编辑：primitive source fields 会就地自动保存，Formula/Lookup 等派生值
保持只读，保存成功后会更新当前 layout，并且不会关闭 inspector。File 字段支持从 Space 导入、
拖放、移除、打开和定位；Relation 字段复用目标表搜索边界，并按稳定 row ID 保存单选或多选结果。

就地 row search 现在会显示过滤后记录的位置与总数；Enter 和 Shift+Enter 可以在保持输入框焦点的
同时向前或向后循环。Grid 会滚动并高亮目标行；Gallery 和 Kanban 会滚动到目标 card，并在目标尚未
加载时自动补齐所需分页。

Kanban 现在会对大量 option 形成的列做横向虚拟化，常规浏览只挂载可见列和 overscan；开始拖动时
会临时挂载所有 drop target，避免虚拟化让合法目标不可达。直接拖动的成功、取消和保存失败回滚会
通过 assertive live region 播报；键盘 Move-to 仍作为等价的非指针操作路径保留。

真实文件 Base versioning smoke 现在会创建 Grid、Gallery 和 Kanban metadata，关闭并重开文件，
编辑行，验证 Graft row diff，恢复初始 revision，再次重开并校验 records、派生值和三种 view
layout；恢复后的仓库状态为 clean。原生 UI 重启验收与这条自动化生命周期证据分开记录。

与原表格 view 的当前能力对齐情况如下：

| 能力                                       | Base 状态                      | 剩余边界                                                            |
| ------------------------------------------ | ------------------------------ | ------------------------------------------------------------------- |
| 持久化 view lifecycle 与独立 query/layout  | 自动重开/恢复已验收            | 仍需原生 UI 重启验收                                                |
| Gallery 字段显隐、空字段隐藏、card size    | 已工作，包含结果导航           | v1 暂无已知缺口                                                     |
| Gallery cover                              | File 字段已工作                | 旧 document-content 与 extension-block cover 不应耦合进独立 package |
| Card actions                               | 可编辑 Inspector 与删除已工作  | file-based Base 的 full-page row document 模型尚未定义              |
| Kanban Select 分组、计数、折叠、新增、拖动 | 已支持虚拟化和无障碍移动       | v1 暂无已知缺口                                                     |
| Base merge conflict 审阅                   | 已支持结构化 row/schema/opaque | 仍需双 Space 原生 UI 的 row-conflict 验收                           |

这仍是第一版可工作交付切片，并未达到原表格 view 的完整能力。更多可移植 cover source 和原生 UI
生命周期验收仍待完成。
Base 日常编辑和配置优先使用单元格
内编辑、表头菜单、锚定 Popover 和渐进披露；居中弹窗只保留给破坏性确认或必须中断
当前工作流的决策。新增交互应先参考并复用原表格已经验证过的编辑方式，不应仅为了
实现方便把字段配置、记录编辑或 view 管理改成弹窗流程。

file Space Settings 已拆分为 General、Files/Obsidian、Versioning 和派生 Indexes；
legacy Space Settings 也已提供 server-owned migration preview、progress、validation、
reveal 和 open-new-Space actions。原生 Space sync 与 path-first 文本 conflict
resolution 已通过双 Space Desktop 验收。Base conflict 现在会打开独立的非模态审阅 tab：
Graft 的 row/schema/opaque artifact 会保持结构化，row 值按 Base/current/incoming 字段对比，
每个受支持的 row 可以独立选择保留 current 或接受 incoming；schema 和 opaque conflict 会明确
降级为文件级选择。仍需双 Space 原生 UI 的 row-conflict 验收。

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
