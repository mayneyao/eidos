# RFC：Eidos Space 的 Graft 版本管理

状态：草案，原生 Desktop 链路验收通过
日期：2026-07-08
负责人：Eidos
相关文档：

- `eidos-file-storage.zh.md`
- `eidos-file-format.zh.md`
- `eidos-space-markdown-runtime.zh.md`
- `eidos-file-based-extensions.zh.md`

## 实施状态（2026-07-27）

Eidos Desktop 现固定使用 Graft v0.8.1，发布 tag commit 为
`89b90628a55bccd9f159462fe94046ddb7de6169`。CLI 与 SQLite extension 仍随应用分发，
但职责已经分离：

- 普通物理 SQLite 文件是默认 worktree；
- Graft CLI 及其 typed repository service 是 control plane；
- SQLite extension 只作为可选 VFS/data plane；
- Eidos 不再通过任何 Graft PRAGMA 发送 repository operation。

对 legacy DataSpace，`.eidos/db.sqlite3` 始终是标准 SQLite 工具可以直接打开的物理文件，
并继续使用 Eidos 的标准 WAL 配置。v0.8 首次打开时，Desktop 只有在 `.eidos/.graft` 存在，
且数据库路径缺失、为空或没有 SQLite header 时，才判定它是旧 VFS worktree。此时先让 CLI
导出到临时物理数据库，校验 SQLite header，之后才替换空的旧 placeholder；任何非空、
非 SQLite 路径都不会被自动覆盖。

稳定提交顺序为：先完成 SQLite transaction；在连接仍打开时运行 `graft add`，让 Graft
online backup 纳入已经提交的 WAL frames；关闭连接；运行 `graft commit`；最后完整重开
Eidos connection（包括 extension 与 attached databases）。Pull、checkout、hard reset、
merge continue/abort 和 conflict resolution 等可能物化其它 worktree 状态的操作也只在
SQLite handle 关闭时运行。同一流程同时覆盖 WAL 与 rollback journal，不再把 checkpoint
当作 commit boundary。

Desktop 产品同步统一使用 `https://sync.eidos.space` 官方服务。Electron main 负责刷新
eidos.space OAuth access token、执行 discovery 与仓库管理请求、provision 仓库，并保存服务端
返回的权威 `remote_url`。该 URL 原样交给 v0.8 CLI，`https://` 和 `graft+https://` 使用
Graft HTTP Remote v1；access token 只通过 `GRAFT_REMOTE_TOKEN` 注入，不进入 URL 或 Graft
持久化配置。Desktop 不复制或翻译 remote protocol。filesystem remote 仅保留给本地 smoke，
S3 与 S3-compatible provider 不再是 Desktop 产品选项。

Graft v0.8 可以 stage page size 为 512 到 65536 字节的合法物理 SQLite worktree，底层
Graft storage 仍按 4096 字节分块；row diff/merge 会保留 STRICT、WITHOUT ROWID 表的声明主键
身份，包括复合主键和 BLOB key。可选的 `vfs=graft` 写入路径仍要求 SQLite page size 为 4096，
Desktop 不会把这项 VFS 限制施加到普通物理 worktree。

UI 继续提供 Changes、Staged Changes、path/directory stage/unstage/discard、文本 Diff
tabs、commit history、path restore 和 whole-Space restore，并隐藏私有 `.eidos` runtime
paths。Changes 与历史 inspector 会通过 path-scoped Graft row details，把 `.eidos` path
展开成紧凑的 table/column/row operations。

原生 Electron acceptance 现已覆盖：点击 Changes 打开独立文本 Diff tab、path 与
directory staging、commit、cursor 分页 history、单 path restore、whole-Space
restore 和目录 discard。Graft v0.5.3 使用向后兼容的 Base64 `file-blob-v2` object
替代 inline file blob 的二次复杂度 Base58 编码；验收机器上 165 KB Markdown 的
stage 从约 98 秒降至约 27 ms。

remote 垂直切片现已通过同一条 CLI control plane 实现。File Space Settings
负责 provision Eidos Sync；Version 顶部的紧凑菜单提供 fetch、pull、push、upstream、ahead
和 behind 状态。Pull 会阻止 dirty worktree。分叉 pull 产生的冲突在 Changes 中按
path 展示，点击打开 HEAD 到 merge-head 的 Diff tab，并可选择 ours、theirs 或把
当前文件作为解决结果。全部解决后，Create version 会使用 `merge --continue`，保留
两个 parent。

隔离的双 Space `fs://` 验收现已覆盖 initial push、clone、remote push、diverged
pull、conflict list、文本内容 diff、resolution、双 parent merge continuation 和
最终 push。Graft v0.5.4 同时修复普通 `graft clone <remote>`，默认以当前目录作为
worktree。

原生 Desktop dogfooding 也已通过真实 Files/Version UI 重复完整分叉链路：fetch
展示 ahead/behind，pull 产生 conflict，点击 path 打开双栏 Diff tab，Accept theirs
把 resolution 放入 Staged，Create version 保留双 parent，Push 后回到 clean 且
up-to-date。已有但没有 Eidos markers 的 `.graftignore` 保持用户所有，打开或 merge
remote repository 不再产生无关本地修改。

双 Space 原生 Eidos File 验收现在也已覆盖同一 SQLite row 的分叉修改：点击冲突 `.eidos` path
会打开 row-aware Diff tab；Resolve 会打开独立、非模态的审阅 tab，按 Eidos File、Current、
Incoming 展示字段值。接受 incoming row 后只 stage 该 Eidos File path，Create version 生成双
parent merge，Push 后 remote 指向 merge head，Space 回到 clean 且 up-to-date。schema 和
opaque SQLite conflicts 仍明确降级为 whole-file 选择。

以下产品决策取代本文较早的开放问题：

- path-level staging 进入 v1，并采用 VS Code 交互，
- History 从 Changes 打开为独立内容 tab，不作为 sidebar mode，
- 主 sidebar modes 保持 Files 和 Version，不规划 Logs mode，
- remote synchronization 使用显式 Pull/Push，而不是隐式 autosync，
- conflicts 继续在 Changes 中 path-first 展示；受支持的 Eidos File row conflict 会在不改变
  remote protocol 的前提下打开结构化审阅 tab。

## 摘要

本 RFC 定义当一个 Space 包含 Markdown 文件、Eidos File 文件、普通资源文件，以及 `.eidos/extensions/**` 这类 Eidos 命名空间下的项目文件时，Eidos 应该如何使用 graft。

目标模型：

- `.graft/` 位于 Space root。
- Graft 管理用户可见的 Space 资产和选定的 Eidos 项目文件。
- 私有 `.eidos` 运行时子目录默认忽略。
- Markdown 和普通文件是 file-level changes。
- `.eidos` 文件是 SQLite-backed paths，可以展开为 table-level changes。
- `.eidos/extensions/**` 源码文件是普通被追踪文件。
- Eidos 将 graft status 展示为路径树，而不是内部 `.eidos/db.sqlite3` 变更。

## 产品原则

用户应该感受到：

> Eidos 在为我的 Space 做版本管理，而不是在同步 Eidos 自己的私有运行目录。

版本管理应该匹配用户在 Space 中能看见、能理解的内容。

## 目标

- 使用 graft 作为 Space root 的版本管理层。
- 追踪 Markdown、Eidos File 文件和用户资源文件。
- 追踪用户/空间扩展源码文件。
- 默认忽略 `.graft/` 和私有 `.eidos` 运行时子目录。
- 先展示 path-level status。
- 将 `.eidos` 文件展开成 table/schema/view changes。
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
  tasks.eidos
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
- 它自然包含 Markdown、`.eidos`、图片、PDF 和其它用户文件，同时显式包含 `.eidos/extensions/**` 这类 Eidos 命名空间下的项目源码。

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
tasks.eidos
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

## Eidos File 展开

`.eidos` 文件首先作为一个路径展示：

```txt
tasks.eidos
```

展开后：

```txt
tasks.eidos
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
eidos__meta         Eidos File metadata changes
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
- 用户可以在 commit 前检查 `.eidos` 内部变更，
- 未来可以支持只 commit 选中的 paths。

## 文件存储策略

Graft 可以按文件类型和大小选择存储策略。

对 Eidos Space：

- text files 可以 inline，
- binary files 可以使用 external payload storage，
- `.eidos` 文件是 SQLite，应该使用 SQLite-aware storage/diff，
- 扩展源码文件是 text files，可以 inline，
- images/assets 可以使用 external payload storage。

存储策略不应该定义 tracking scope。Tracking 回答「这是不是用户状态？」Storage 回答「内容如何存储？」

## 冲突模型

冲突应该 path-first：

```txt
notes/project.md
tasks.eidos
assets/image.png
```

Markdown：

- 使用 text conflict UI。

普通二进制：

- 选择 ours/theirs 或 keep both。

`.eidos`：

- 尽可能展示 table-level conflicts，
- graft 支持时允许 row-level conflict resolution，
- 必要时 fallback 到 file-level resolution。

## Sync 模型

Graft remote sync 应同步：

- tracked Markdown files，
- tracked Eidos Files，
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
- `.eidos` 可展开内部变更，
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
ignore = [".graft/**", ".eidos/agent/**", ".eidos/cache/**", ".eidos/sessions/**", ".eidos/indexes/**", ".eidos/state/**", ...]
```

Agent conversation 是每 Space、默认关闭的例外。用户明确同意后，
`.eidos/agent/**` 会替换为 `.eidos/agent/local/**`，只有
`.eidos/agent/sessions/**` 可以进入普通 stage、commit 与 push 流程。关闭设置
会先撤销当前 conversation 变更的暂存选择，但不会抹除已提交或远端历史。

如果旧 repo 曾经追踪 `.eidos/sessions/**` 或其它私有路径，可能需要 cleanup migration。

## 剩余开放问题

1. `.obsidian/**` 是否默认追踪，还是部分 ignore？
2. 是否所有 binary files 都自动走 external payload storage？
3. Eidos 是否在设置中暴露 graft config，还是只提供 presets？

## 推荐垂直切片

```txt
sample-space/
  note.md
  tasks.eidos
  assets/image.png
  .eidos/sessions/session.jsonl
```

这个 slice 应该证明：

- graft status 显示 `note.md`、`tasks.eidos` 和 `assets/image.png`，
- graft status 不显示 `.eidos/sessions/session.jsonl`，
- commit 不需要手动 add，
- 展开 `tasks.eidos` 可以看到 table-level changes，
- commit 可以 push 和 clone，并带上所需 payloads。
