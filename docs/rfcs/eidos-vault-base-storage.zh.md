# RFC：Eidos Vault/Base 存储模型

状态：草案
日期：2026-07-08
负责人：Eidos

## 摘要

Eidos 应该逐步转向一种 vault-native 的存储模型：

- Markdown 文件仍然是 vault 里的普通文件。
- Base 文件是 vault 里用户可见的一等结构化数据文件。
- Eidos 命名空间下的状态放在 `.eidos/` 下，但需要区分可版本管理的 source/config 和私有运行时状态。
- Graft 为整个 vault 提供版本管理，并且能对 Base 文件提供 SQLite 级别的 diff。

目标产品叙事不应该是「Eidos 把 Obsidian vault 存进一个隐藏数据库」。目标叙事应该是：

> Eidos 打开一个本地 vault，保留 Markdown 和资源文件的文件形态，新增一等的结构化 Base 文件，并使用 graft 为整个空间提供版本管理。

这是一次产品底座级别的改动，不应该一次性完成。迁移期间，当前 `.eidos/db.sqlite3` 模型可以继续存在。

## 背景动机

当前 Eidos 把大量 app state 存在 `.eidos/db.sqlite3` 中，包括类似文档正文的状态，例如 `eidos__docs`。这对一个 database-native app 来说是合理的，但它和 Obsidian 用户的心智模型冲突：

- Obsidian 用户预期 Markdown 文件就是 source of truth。
- 他们预期 vault 离开原 app 也依然可读、可编辑。
- 他们天然警惕隐藏数据库成为文档的主存储。

与此同时，Eidos 最强的差异化并不是「更好的 Markdown 文件管理」。更强的切入点是：

- 结构化表格，
- 关系字段，
- 视图，
- 公式，
- app-like workflow，
- local-first 版本管理。

存储模型应该明确表达这一点：Markdown 保持 Markdown，Eidos 的结构化数据应该成为一种一等文件格式：Base。

## 产品定位

Eidos 应该被定位成面向本地 vault 的结构化工作台。

Obsidian：

- Markdown vault 是核心资产。
- 插件围绕文件提供增强能力。

Eidos：

- Vault 仍然是一个本地文件夹。
- Markdown 文件仍然是文档资产。
- Base 文件是结构化数据资产。
- Graft 为 vault 提供版本管理，并理解 Base 的内部变更。

用户可见的资产类型是：

```txt
.md       文档
.base     结构化数据工作簿
.eidos/extensions 用户可编程行为
images    资源文件
folders   组织结构
```

这避免了让用户在「纯文件」和「结构化数据」之间二选一。Eidos 可以同时提供两者。

## 目标

- 让 Base 成为用户可见的一等文件格式。
- 保持 Markdown 文档为普通文件，而不是隐藏数据库记录。
- 让 Eidos 能直接打开现有的 Obsidian-style vault，而不需要把 Markdown 导入到私有主数据库。
- 使用 graft 作为 vault 的通用版本管理层。
- 为 `.base` 文件提供 SQLite/table-aware 的 status 和 diff。
- 将 `.eidos/` 作为 Eidos namespace，同时区分可版本管理的 source/config 与私有、本地、生成态运行时状态。
- 避免把 Eidos 内部运行态展示成用户需要处理的变更。

## 非目标

- 本 RFC 不定义完整的 Base schema。
- 本 RFC 不定义完整的迁移实现。
- 本 RFC 不要求立刻移除当前 `.eidos/db.sqlite3` 模型。
- 本 RFC 不要求兼容 Obsidian 每一种插件私有元数据格式。
- 本 RFC 不把 `.base` 做成不透明的私有二进制格式。它底层应该仍然是 SQLite 文件。

## 核心概念

### Vault

Vault 是用户选择的普通文件夹。

它可以包含 Markdown 文件、Base 文件、资源文件、app 配置目录和 graft 元数据。

示例：

```txt
my-vault/
  notes/project.md
  notes/idea.md
  tasks.base
  research.base
  assets/image.png
  .obsidian/
  .eidos/
  .graft/
```

Vault root 就是 graft worktree root。

### Markdown 文档

Markdown 文件是用户拥有的文档。

在目标模型中，Eidos 不应该把 `eidos__docs` 当作 Markdown 文档正文的 canonical store。文件内容本身就是 source of truth。

Eidos 仍然可以基于 Markdown 文件生成索引、backlink、缓存、预览、embedding 和搜索数据。这些生成态属于 `.eidos/`，不是 canonical state。

### Base

Base 是用户可见的结构化数据文件。

推荐命名：

```txt
tasks.base
research.base
crm.base
```

Base 底层是 SQLite 数据库。产品心智上，它更接近 Excel workbook 或 Airtable base：

- 一个文件，
- 多张表，
- 多个视图，
- 字段元数据，
- 关系，
- 公式，
- 过滤器，
- 布局状态，
- 可选的扩展元数据。

Eidos 可以直接打开一个 Base 文件，将其渲染成表格和视图，并通过 graft 提供表格级版本 diff。

### Eidos Namespace

`.eidos/` 是 Eidos 的 app namespace。

这个 namespace 可以同时包含：

- 可版本管理的 project state，例如 `.eidos/extensions/**`，
- 私有运行时状态，例如 indexes、caches、sessions、secrets 和本地 UI state。

这和 `.github/workflows` 是同一类模式：隐藏的 app-specific 目录里也可以包含应该版本管理的项目文件。隐藏目录用于避免根目录命名冲突，不自动说明所有内容都是私有态。

示例：

```txt
.eidos/
  extensions/
  indexes/
  cache/
  state/
  sessions/
  ui-state.sqlite3
  search.sqlite3
```

默认情况下，私有运行时子目录不应该出现在 graft status 中。稳定的 source/config 子目录可以被显式追踪。

某些 `.eidos/` 下的数据对 Eidos 运行很重要，但这不等于它们就是需要版本化的用户状态。默认规则应该是：

> 如果某个状态是私有的、生成的、机器本地的、会话级的，它就不应该被追踪。

### Graft 仓库

`.graft/` 位于 vault root。

这样 graft 负责整个 vault worktree，而 tracking 和 ignore 规则定义哪些内容被视为用户状态。

Graft 应该保持通用，不需要写死 Eidos 专属逻辑来理解 `.base` 文件是 SQLite。它应该基于文件检测和配置的 tracking rules 工作。

## 目标存储布局

```txt
my-vault/
  notes/
    project.md
    idea.md

  tasks.base
  research.base

  assets/
    image.png
    diagram.svg

  .obsidian/
    app.json
    workspace.json

  .eidos/
    indexes/
    sessions/
    cache/
    ui-state.sqlite3

  .graft/
    config.toml
    ...
```

Canonical user state：

- Markdown 文件，
- Base 文件，
- `.eidos/extensions/**` 下的扩展源码文件，
- 用户资源文件，
- 可选的稳定 app 配置文件，例如部分 `.obsidian/` 设置。

非 canonical / 私有状态：

- `.eidos/indexes/**`,
- `.eidos/cache/**`,
- `.eidos/sessions/**`,
- `.eidos/ui-state.sqlite3`,
- `.graft/**`,
- 临时文件，
- 平台噪音，例如 `.DS_Store`。

## Graft 追踪语义

在当前过渡期的 Eidos 集成中，默认追踪范围很窄：

```txt
track.default_roots:
  .eidos/db.sqlite3
  .eidos/files/**
```

这对当前隐藏数据库模型是合理的。

但在目标 Vault/Base 模型中，graft 应该追踪用户可见的 vault 资产和选定的 Eidos 项目文件，并忽略私有运行态。

推荐目标默认值：

```txt
track.default_roots:
  **/*
  .eidos/extensions/**

ignore:
  .graft/**
  .eidos/db.sqlite3
  .eidos/cache/**
  .eidos/indexes/**
  .eidos/sessions/**
  .eidos/state/**
  .eidos/secrets.sqlite3
  **/.DS_Store
  **/*.tmp
```

Eidos 也可以选择更保守的默认值：

```txt
track.default_roots:
  **/*.md
  **/*.base
  assets/**
  files/**
```

保守默认值更安全，但不够 vault-native。更宽的默认值更容易被用户理解：

> 我在 vault 里看得见的内容都会被版本管理，除了 app 私有 dot 目录和临时文件。

推荐的产品默认是更宽的 vault-native 规则，并搭配清晰的 ignore 规则。

## Status 与 Diff UI

Changes UI 应该像代码编辑器的 source control 面板一样展示 changed paths。

示例：

```txt
notes/project.md
tasks.base
assets/image.png
```

对于普通文本文件：

- 能显示 text diff 时显示 text diff，
- 不能显示时显示文件级摘要。

对于普通二进制文件：

- 显示文件级变更摘要，
- 可选显示图片预览或元数据。

对于 `.base` 文件：

- 先作为一个文件路径展示，
- 允许展开成表格级变更，
- 用户打开 diff 后再展示 row-level 细节。

示例：

```txt
tasks.base
  Tasks table       +3 ~1
  Projects table    +1
  Views metadata    ~2
```

这样可以保持统一心智：

> Base 是 vault 里的一个文件，但 Eidos 能检查它内部的 SQLite 变更。

目标模型下，UI 不应该把 `.eidos/db.sqlite3` 暴露成主要用户资产。

## Base 文件格式要求

`.base` 文件应该是合法 SQLite 数据库。

Eidos 应该写入足够的元数据，以便可靠识别：

```txt
eidos__meta
  key TEXT PRIMARY KEY
  value TEXT
```

建议 keys：

```txt
format = "eidos-base"
format_version = "1"
app = "eidos"
created_at = ...
updated_at = ...
```

文件也应该能通过 SQLite header 被识别，这样通用 SQLite 工具可以检查它。

推荐 MIME type：

```txt
application/vnd.eidos.base+sqlite3
```

开放问题：`.base` 作为扩展名是否过于泛化。产品上它很强，但实现上要准备好处理扩展名冲突。Eidos 不应该只靠扩展名识别 Base，而应该同时检查 SQLite 元数据。

## 和现有表结构的关系

当前 Eidos 数据库包含这些表：

- `eidos__docs`,
- `eidos__tree`,
- `eidos__files`,
- `eidos__kv`,
- 用户表，
- view 元数据，
- field 元数据。

在目标模型中：

- Markdown 正文不应该以 `eidos__docs` 作为 canonical state。
- Base 专属的表、视图、字段和关系迁移到 `.base` 文件里。
- `.eidos/db.sqlite3` 应该收缩为 workspace 私有元数据、缓存、本地设置和迁移支持。
- 文件元数据需要重新考虑。如果文件是普通 vault 文件，它的文件系统路径可以是 canonical identity。如果它是 Base 内部引用的附件，Base 可以通过相对路径或托管 payload ID 引用它。

`eidos__tree` 需要单独决策：

- 对 vault 文件来说，真实文件系统树应该是 canonical tree。
- 对 Base 内部来说，tables/views 可以在 Base 内部拥有自己的排序和分组。
- Eidos 可以继续保存 UI 组织元数据，但它不应该成为 Markdown 文件的第二套 canonical tree。

## Obsidian 互操作

Eidos 应该能直接打开现有的 Obsidian-style vault。

推荐行为：

- 直接读写 `.md` 文件，
- 保留 `.obsidian/`，
- 不要求把 Markdown 导入到 `.eidos/db.sqlite3`，
- 保留普通资源文件和链接，
- 将 `.base` 文件作为 Eidos 专属结构化资产加入 vault，
- 只有在启用版本管理时才添加 `.graft/`。

是否追踪 `.obsidian/` 应该是一个产品/用户决策：

- 稳定配置可能适合版本管理，
- workspace/session layout 通常是本地噪音。

推荐默认 ignore：

```txt
ignore:
  .obsidian/workspace*.json
```

其它 `.obsidian` 文件可以后续再决策。

## 迁移策略

这应该是分阶段迁移，而不是一次性重写。

### Phase 1：Base 文件支持

在保留当前 `.eidos/db.sqlite3` 模型的同时，新增创建和打开 `.base` 文件的能力。

里程碑：

- 创建空 `.base`，
- 打开 `.base`，
- 列出 `.base` 内部 tables，
- 编辑 `.base` 内表格数据，
- 检测 `.base` 是 SQLite-backed Eidos Base。

### Phase 2：Graft Vault Mode

让 Eidos 能在 vault root 初始化 graft，用于用户可见文件。

里程碑：

- `.graft/` 位于 vault root，
- 默认 ignore `.eidos/cache/**`、`.eidos/indexes/**`、`.eidos/sessions/**` 和 `.eidos/state/**`，
- Markdown/assets 有文件级 status，
- `.base` 有 SQLite-aware diff。

### Phase 3：Markdown File Mode

让 Markdown 文件成为由文件系统承载的一等可编辑文档。

里程碑：

- 文件树来自真实文件系统，
- Markdown 编辑器直接读写 `.md`，
- backlinks/search/indexes 是生成态，
- vault Markdown 不再依赖 `eidos__docs` 存正文。

### Phase 4：导出现有 Spaces

为当前 Eidos spaces 提供迁移/导出路径。

里程碑：

- 将 `eidos__docs` 导出为 `.md`，
- 将结构化表格导出到一个或多个 `.base` 文件，
- 将 attachments/assets 导出为普通 vault 路径，
- 尽量保留链接关系，
- 写入迁移报告。

### Phase 5：弃用隐藏用户内容

当 `.md` 和 `.base` 稳定后，将 `.eidos/db.sqlite3` 收缩为私有状态库。

里程碑：

- 新 vault 不再把 canonical 用户文档存进 `.eidos/db.sqlite3`，
- 新结构化数据进入 `.base`，
- `.eidos/db.sqlite3` 只包含私有、生成、本地状态。

## 和当前 Graft 工作的兼容

当前 graft 集成已经在朝正确方向移动：

- `.graft` 位于 worktree root，
- graft 可以管理 SQLite 和普通文件，
- payload/external storage 已经存在，
- status 可以展示 changed paths，
- SQLite paths 可以展开为 table-level changes。

但当前 Eidos 默认追踪范围：

```txt
.eidos/db.sqlite3
.eidos/files/**
```

只适用于当前隐藏数据库模型。在 Vault/Base mode 中，它应该被替换为 vault-level 用户文件追踪，并显式追踪 `.eidos/extensions/**` 这类稳定 Eidos 项目文件。

## 关键决策

1. Base 是用户可见文件，不是隐藏 `.eidos` 数据库。
2. Vault mode 下 Markdown 文件是 source of truth。
3. `.eidos/` 是 Eidos namespace；私有运行时子目录默认忽略。
4. `.graft/` 位于 vault root。
5. Graft 追踪用户可见的 vault 资产和选定的 Eidos 项目文件。
6. `.base` 文件是带 Eidos 元数据的 SQLite 数据库。
7. 扩展源码属于 `.eidos/extensions/**`，扩展运行时状态属于 `.eidos/cache/**` 和 `.eidos/state/**`。
8. Eidos Changes UI 先展示 path-level changes，再在展开 Base 时展示内部变更。

## 开放问题

1. 扩展名应该是 `.base`、`.eidosbase`，还是两者都支持？
2. 默认 vault tracking 应该是宽规则 `**/*` 搭配 ignore，还是显式规则 `**/*.md`、`**/*.base`、`assets/**`？
3. 哪些 `.obsidian/` 文件应该默认进入版本管理？
4. Base attachments 应该作为普通 sibling files、托管 assets 目录，还是 Base 专属 payload 目录？
5. 一个 vault 应该默认有一个 Base、多个 Base，还是两者都支持？
6. 当前 `eidos__tree` 模型在 file-backed Markdown 中还保留多少？
7. 默认扩展源码目录是否就叫 `.eidos/extensions/`，还是应该可配置？
8. 对依赖 `eidos__docs` 的现有 Eidos spaces，精确迁移路径是什么？

## 推荐下一步

构建一个很小的 vertical slice：

```txt
sample-vault/
  note.md
  tasks.base
  assets/image.png
  .eidos/
  .graft/
```

这个 slice 应该证明：

- Eidos 可以打开 vault。
- Eidos 可以编辑 `note.md`。
- Eidos 可以打开并编辑 `tasks.base`。
- Graft status 显示 `note.md`、`tasks.base` 和 `assets/image.png`。
- 展开 `tasks.base` 可以看到 table-level changes。
- `.eidos/sessions/**` 永远不会出现在 status 中。

这个 slice 能在完整迁移之前验证产品模型是否真正自洽。
