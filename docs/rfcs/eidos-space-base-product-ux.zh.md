# RFC：Space、Base 与 Changes 的产品交互

状态：草案，实施中
日期：2026-07-08
负责人：Eidos
相关文档：

- `eidos-space-base-storage.zh.md`
- `eidos-base-file-format.zh.md`
- `eidos-space-markdown-runtime.zh.md`
- `eidos-graft-space-versioning.zh.md`

## 实施状态（2026-07-12）

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
呈现，并通过带字段插入快捷项的锚定字段控制创建或修改；两个流程都不打开居中弹窗。

lookup/rollup 字段延续同一套表头驱动流程：用户在锚定字段面板中选择已有 relation、
target field 和 aggregation。派生值在 Grid 中保持只读，会随着 relation/target 修改刷新，
也可以继续供 formula 使用，不引入单独的配置页面。

Base 仍处于 delivery closure，而不是产品验收。更丰富的 formula completion/preview、
Gallery/Kanban layouts、无障碍表格语义和完整原生
create/edit/restart/version/restore 验收仍未完成。Base 日常编辑和配置优先使用单元格
内编辑、表头菜单、锚定 Popover 和渐进披露；居中弹窗只保留给破坏性确认或必须中断
当前工作流的决策。新增交互应先参考并复用原表格已经验证过的编辑方式，不应仅为了
实现方便把字段配置、记录编辑或 view 管理改成弹窗流程。

file Space Settings 已拆分为 General、Files/Obsidian、Versioning 和派生 Indexes；
legacy Space Settings 也已提供 server-owned migration preview、progress、validation、
reveal 和 open-new-Space actions。原生 Space sync 与 path-first 文本 conflict
resolution 已通过双 Space Desktop 验收；仍需更细的 Base row-level conflict 展示。

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
