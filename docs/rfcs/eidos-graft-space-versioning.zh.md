# RFC：Eidos Space 的 Graft 版本管理

状态：草案，remote 垂直切片可用
日期：2026-07-08
负责人：Eidos
相关文档：

- `eidos-space-base-storage.zh.md`
- `eidos-base-file-format.zh.md`
- `eidos-space-markdown-runtime.zh.md`
- `eidos-file-based-extensions.zh.md`

## 实施状态（2026-07-12）

本地链路已经实现。普通操作通过持久 SQLite/Graft PRAGMA connection 执行，只有
repository initialization 仍是一次性 CLI。UI 已提供 Changes 与 Staged Changes、
path/directory stage/unstage/discard、文本 Diff tabs、commit history、path restore
和 whole-Space restore，并隐藏私有 `.eidos` runtime paths。
Changes 与历史 inspector 也已通过 path-scoped Graft row details，将 `.base` path
展开成紧凑的 table/column/row operations。

原生 Electron acceptance 现已覆盖：点击 Changes 打开独立文本 Diff tab、path 与
directory staging、commit、cursor 分页 history、单 path restore、whole-Space
restore 和目录 discard。Graft v0.5.3 使用向后兼容的 Base64 `file-blob-v2` object
替代 inline file blob 的二次复杂度 Base58 编码；验收机器上 165 KB Markdown 的
stage 从约 98 秒降至约 27 ms。

remote 垂直切片现已通过同一条持久 Graft connection 实现。File Space Settings
负责配置 remote；Version 顶部的紧凑菜单提供 fetch、pull、push、upstream、ahead
和 behind 状态。Pull 会阻止 dirty worktree。分叉 pull 产生的冲突在 Changes 中按
path 展示，点击打开 HEAD 到 merge-head 的 Diff tab，并可选择 ours、theirs 或把
当前文件作为解决结果。全部解决后，Create version 会使用 `merge-continue`，保留
两个 parent。

隔离的双 Space `fs://` 验收现已覆盖 initial push、clone、remote push、diverged
pull、conflict list、文本内容 diff、resolution、双 parent merge continuation 和
最终 push。Graft v0.5.4 同时修复普通 `graft clone <remote>`，默认以当前目录作为
worktree。剩余验收是原生 Desktop 视觉 dogfooding，以及更细的 Base row-level
conflict 展示。

以下产品决策取代本文较早的开放问题：

- path-level staging 进入 v1，并采用 VS Code 交互，
- History 从 Changes 打开为独立内容 tab，不作为 sidebar mode，
- 主 sidebar modes 保持 Files 和 Version，不规划 Logs mode，
- remote synchronization 使用显式 Pull/Push，而不是隐式 autosync，
- conflicts 继续在 Changes 中 path-first 展示；更细的 Base row resolution 可以在
  不改变 remote protocol 的前提下继续叠加。

## 摘要

本 RFC 定义当一个 Space 包含 Markdown 文件、Base 文件、普通资源文件，以及 `.eidos/extensions/**` 这类 Eidos 命名空间下的项目文件时，Eidos 应该如何使用 graft。

目标模型：

- `.graft/` 位于 Space root。
- Graft 管理用户可见的 Space 资产和选定的 Eidos 项目文件。
- 私有 `.eidos` 运行时子目录默认忽略。
- Markdown 和普通文件是 file-level changes。
- `.base` 文件是 SQLite-backed paths，可以展开为 table-level changes。
- `.eidos/extensions/**` 源码文件是普通被追踪文件。
- Eidos 将 graft status 展示为路径树，而不是内部 `.eidos/db.sqlite3` 变更。

## 产品原则

用户应该感受到：

> Eidos 在为我的 Space 做版本管理，而不是在同步 Eidos 自己的私有运行目录。

版本管理应该匹配用户在 Space 中能看见、能理解的内容。

## 目标

- 使用 graft 作为 Space root 的版本管理层。
- 追踪 Markdown、Base 文件和用户资源文件。
- 追踪用户/空间扩展源码文件。
- 默认忽略 `.graft/` 和私有 `.eidos` 运行时子目录。
- 先展示 path-level status。
- 将 `.base` 文件展开成 table/schema/view changes。
- 在普通 Eidos 流程中不要求用户手动 `graft add`。

## 非目标

- 本 RFC 不定义 graft 内部对象格式。
- 本 RFC 不定义网络 provider credentials。
- 本 RFC 不要求 Eidos 暴露每个 git-like command。
- 本 RFC 不要求 v1 有完美冲突 UI。

## 仓库布局

示例：

```txt
my-space/
  notes/project.md
  tasks.base
  .eidos/extensions/kanban-view/index.tsx
  assets/image.png
  .obsidian/
  .eidos/
  .graft/
```

`.graft/` 位于 `my-space/.graft`。

Graft worktree root 是 `my-space/`。

## 默认追踪规则

对 file-based Eidos，推荐默认使用宽追踪规则搭配 ignore：

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

选择宽追踪的原因：

- 它符合 Space 心智。
- 它不要求用户为每个新资源做分类。
- 它自然包含 Markdown、`.base`、图片、PDF 和其它用户文件，同时显式包含 `.eidos/extensions/**` 这类 Eidos 命名空间下的项目源码。

Eidos 可以暴露高级设置支持更严格的追踪，但默认应该容易理解：

> Space/project 内容被版本管理；app-private runtime state 不被版本管理。

## 显式用户追踪

部分用户可能希望排除或包含特定路径。

推荐配置概念：

```txt
track.default_roots   app/default Space tracking
track.user_roots      user-added tracking roots
ignore                ignored paths
```

普通 Eidos 使用不应该需要手动 add。显式 tracking 是高级设置，不是默认 workflow。

## Status 模型

Graft status 应该展示 changed paths：

```txt
notes/project.md
tasks.base
.eidos/extensions/kanban-view/index.tsx
assets/image.png
```

每个 path 有：

```txt
path
kind: text | binary | sqlite | directory
state: added | modified | deleted | renamed
storage: inline | external
```

Eidos UI 可以把 paths 组织成类似 VS Code 的树。

## Base 展开

`.base` 文件首先作为一个路径展示：

```txt
tasks.base
```

展开后：

```txt
tasks.base
  Tasks table       +3 ~1
  Projects table    +1
  Views metadata    ~2
  Fields schema     ~1
```

映射：

```txt
tb_<tableId>        row/data changes
eidos__tables       table registry changes
eidos__columns      field/schema changes
eidos__views        view changes
eidos__references   relation/dependency changes
eidos__meta         Base metadata changes
```

Generated tables 应该单独归类为 diagnostics，或默认隐藏。

## Commit 模型

Eidos 应该提供面向用户的 commit/snapshot 操作：

```txt
Message
Commit
```

普通行为：

- Eidos 从 graft status 计算 changed paths。
- 配置的 default roots 自动发现。
- 用户不需要手动 add。
- Commit 为 Space state 创建一个版本。

高级行为：

- 用户可以在 commit 前排除 paths，
- 用户可以在 commit 前检查 `.base` 内部变更，
- 未来可以支持只 commit 选中的 paths。

## 文件存储策略

Graft 可以按文件类型和大小选择存储策略。

对 Eidos Space：

- text files 可以 inline，
- binary files 可以使用 external payload storage，
- `.base` 文件是 SQLite，应该使用 SQLite-aware storage/diff，
- 扩展源码文件是 text files，可以 inline，
- images/assets 可以使用 external payload storage。

存储策略不应该定义 tracking scope。Tracking 回答「这是不是用户状态？」Storage 回答「内容如何存储？」

## 冲突模型

冲突应该 path-first：

```txt
notes/project.md
tasks.base
assets/image.png
```

Markdown：

- 使用 text conflict UI。

普通二进制：

- 选择 ours/theirs 或 keep both。

`.base`：

- 尽可能展示 table-level conflicts，
- graft 支持时允许 row-level conflict resolution，
- 必要时 fallback 到 file-level resolution。

## Sync 模型

Graft remote sync 应同步：

- tracked Markdown files，
- tracked Base files，
- tracked extension source files，
- tracked assets，
- 这些文件所需的 external payloads。

不应同步：

- `.eidos/sessions/**`，
- `.eidos/cache/**`，
- `.eidos/indexes/**`，
- `.eidos/state/**`，
- `.eidos/secrets.sqlite3`，
- `.graft/**` 作为用户内容。

## UI 要求

Changes UI 应展示：

- changed path count，
- path tree，
- 只在有帮助时显示 file type badges，
- `.base` 可展开内部变更，
- 默认隐藏 ignored/private state，
- refresh action，
- commit message 和 commit button。

它应该避免展示：

- Space mode 下将 `.eidos/db.sqlite3` 作为主要用户资产，
- `.eidos/sessions/**`，
- generated index churn。

## 从当前 Eidos Graft 集成迁移

当前过渡集成追踪：

```txt
.eidos/db.sqlite3
.eidos/files/**
```

这只适用于隐藏数据库模型。

Space mode 应替换为：

```txt
track.default_roots = ["**/*", ".eidos/extensions/**"]
ignore = [".graft/**", ".eidos/cache/**", ".eidos/sessions/**", ".eidos/indexes/**", ".eidos/state/**", ...]
```

如果旧 repo 曾经追踪 `.eidos/sessions/**` 或其它私有路径，可能需要 cleanup migration。

## 开放问题

1. `.obsidian/**` 是否默认追踪，还是部分 ignore？
2. Eidos v1 是否支持 path-level staging？
3. 发布前需要多少 row-level Base conflict resolution？
4. 是否所有 binary files 都自动走 external payload storage？
5. Eidos 是否在设置中暴露 graft config，还是只提供 presets？

## 推荐垂直切片

```txt
sample-space/
  note.md
  tasks.base
  assets/image.png
  .eidos/sessions/session.jsonl
```

这个 slice 应该证明：

- graft status 显示 `note.md`、`tasks.base` 和 `assets/image.png`，
- graft status 不显示 `.eidos/sessions/session.jsonl`，
- commit 不需要手动 add，
- 展开 `tasks.base` 可以看到 table-level changes，
- commit 可以 push 和 clone，并带上所需 payloads。
