# RFC：Eidos Space 的文件化扩展机制

状态：草案
日期：2026-07-09
负责人：Eidos
相关文档：

- `eidos-space-base-storage.zh.md`
- `eidos-base-file-format.zh.md`
- `eidos-space-markdown-runtime.zh.md`
- `eidos-graft-space-versioning.zh.md`

## 摘要

File-based workspace 中，Eidos 扩展应该逐步转向 file-based source model。

用户/空间自定义扩展的 canonical source 应该作为普通文件放在 Space 中：

```txt
my-space/
  .eidos/
    extensions/
      kanban-view/
        extension.json
        index.tsx
        assets/

    cache/
      extensions/

    state/
      extensions.sqlite3
```

语义分层是：

- `.eidos/extensions/**` 是 Eidos 命名空间下的扩展源码，应该被 graft 追踪。
- `.eidos/cache/**`、`.eidos/state/**`、`.eidos/sessions/**` 和 `.eidos/indexes/**` 是私有运行时状态，应该被 graft 忽略。

这样可以保持 Space 心智模型一致：

```txt
.md            文档
.base          结构化数据
.eidos/extensions/** 用户可编程行为
.eidos/cache/**      私有运行时/cache 状态
.graft/**      版本管理元数据
```

## 背景动机

当前 Eidos 扩展机制已经有一个接近文件的外观。扩展会在 sidebar 中以虚拟路径出现：

```txt
~/.eidos/__EXTENSIONS__/<slug>.ts
~/.eidos/__EXTENSIONS__/<slug>.tsx
```

但这只是 `eidos__extensions` 表上的投影。源码、编译后代码、metadata、enabled state、bindings 和 marketplace id 都存在 workspace database 中。

这个模型对 database-native app 很方便，但它和 file-based 方向冲突：

- 扩展源码是用户/开发者创作的内容，
- 扩展源码会定义一个 space 的行为，
- 扩展源码应该能离开 Eidos 被阅读，
- 扩展源码应该能 diff、review、复制和版本管理，
- 扩展源码不应该隐藏在不透明的 `.eidos/db.sqlite3` row 中。

`.github/workflows` 是更好的类比：文件位于 app-specific hidden namespace，但它们仍然是项目拥有的源码/配置文件。隐藏目录用于避免根目录命名冲突，不决定内容是否应该进入版本管理。

如果用户打开一个带自定义 table view、file handler、folder handler 或 action 的 Space，这些定义应该是可见的 Space state。

## 目标

- 让用户/空间扩展源码变成真实文件。
- 默认用 graft 追踪扩展源码。
- 将生成态、本地态、secret 和运行时扩展状态保留在 `.eidos/` 下。
- 保留当前扩展概念：script extensions、block extensions、table views、file handlers、folder handlers、UDFs、tools 和 actions。
- 支持未来 marketplace extensions，但不把下载缓存和编译产物变成 canonical user state。
- 让扩展变更在 Changes UI 中表现为普通 path changes。
- 在运行 Space 中的扩展代码前建立明确的 trust boundary。

## 非目标

- 本 RFC 不定义完整 extension marketplace。
- 本 RFC 不定义完整 sandbox 实现。
- 本 RFC 不要求立刻移除 `eidos__extensions`。
- 本 RFC 不要求所有 built-in extensions 都变成 Space 文件。
- 本 RFC 不让扩展运行时缓存具备可移植性。

## 当前实现盘点

当前模型把扩展存放在 `eidos__extensions`：

```txt
id
slug
name
description
type
version
code
ts_code
meta
icon
marketplace_id
enabled
bindings
created_at
updated_at
```

Virtual file system 会把这张表映射成：

```txt
~/.eidos/__EXTENSIONS__/<slug>.ts
~/.eidos/__EXTENSIONS__/<slug>.tsx
```

这给 UI 提供了 file tree，但 source of truth 仍然是 database row。

目标模型应该反过来：

```txt
.eidos/extensions/<slug>/index.tsx       canonical source
.eidos/extensions/<slug>/extension.json  canonical manifest
.eidos/cache/extensions/**               generated build output
.eidos/state/extensions.sqlite3          local/private runtime state
```

## 目录布局

推荐默认布局：

```txt
my-space/
  .eidos/
    extensions/
      todo-actions/
        extension.json
        index.ts

      kanban-view/
        extension.json
        index.tsx
        assets/
          icon.svg

    cache/
      extensions/

    state/
      extensions.sqlite3

    secrets.sqlite3
```

未来可以支持 flat files，但 folder-based extensions 更适合作为默认，因为它能容纳 assets、tests、README 和多个模块。

## Extension Manifest

每个扩展文件夹应该包含 manifest：

```json
{
  "id": "kanban-view",
  "name": "Kanban View",
  "version": "0.1.0",
  "type": "block",
  "entry": "index.tsx",
  "meta": {
    "type": "tableView",
    "componentName": "KanbanView",
    "tableView": {
      "title": "Kanban",
      "type": "kanban",
      "description": "Render a table as a Kanban board"
    }
  },
  "permissions": {
    "files": "read",
    "network": false
  }
}
```

Manifest 是可移植 source state，可以被 graft 追踪。

编译产物不是可移植 source state，应该重建到 `.eidos/cache/extensions/**`。

## 状态分层

### 被追踪的源码状态

这些文件属于 Space，应该被追踪：

```txt
.eidos/extensions/<slug>/extension.json
.eidos/extensions/<slug>/index.ts
.eidos/extensions/<slug>/index.tsx
.eidos/extensions/<slug>/src/**
.eidos/extensions/<slug>/assets/**
.eidos/extensions/<slug>/README.md
```

它们回答的是：

> 这个 space 定义了什么行为？

### 私有运行时状态

这些文件属于 Eidos 私有状态，应该被忽略：

```txt
.eidos/cache/extensions/**
.eidos/state/extensions.sqlite3
.eidos/sessions/**
.eidos/indexes/**
```

它们回答的是：

> 当前这台机器上的 Eidos 实例构建过、信任过、启用过或缓存过什么？

### 本地 Secrets

Secrets 和敏感 bindings 不能被追踪。

推荐存储位置：

```txt
.eidos/secrets.sqlite3
.eidos/state/extensions.sqlite3
```

如果扩展需要可配置 bindings，manifest 可以定义 schema，但真实 secret values 保留在本地。

## Trust 与安全

文件化扩展会引入明确的 executable-code boundary。

Eidos 不应该在新打开或刚同步下来的 Space 中静默执行扩展代码。用户应该看到 trust prompt 或 extension review state。

推荐状态：

```txt
discovered
trusted
enabled
disabled
blocked
```

规则：

- Discovered extension 可见，但不能执行。
- Trust 是本地用户状态。
- Enabled/disabled 默认是本地状态。
- Permission grants 默认是本地状态。
- 扩展源码变化可以使 trust 失效，并要求重新 review。
- Marketplace-installed extensions 应该通过 ID/version 或 lock metadata 固定。

这也是为什么不应该把执行状态全部放进被追踪文件。

## Graft 语义

在默认宽追踪规则下，扩展源码表现为普通 path changes：

```txt
.eidos/extensions/kanban-view/extension.json
.eidos/extensions/kanban-view/index.tsx
.eidos/extensions/kanban-view/assets/icon.svg
```

Changes UI 应该先把它们展示成文件变更。v1 不需要 extension-specific diff 语义。

推荐 graft classification：

```txt
.eidos/extensions/**/*.ts     text
.eidos/extensions/**/*.tsx    text
.eidos/extensions/**/*.json   text
.eidos/extensions/**/assets/* text | binary by detection
.eidos/cache/extensions/**    ignored
.eidos/state/**               ignored
```

扩展源码被追踪，因为它是用户可见状态。编译产物被忽略，因为它是生成态。

## 产品 UX

File tree 可以默认隐藏 `.eidos/`，同时提供一个由 `.eidos/extensions/**` 支撑的 "Extensions" 产品视图。高级文件视图可以把 `.eidos/extensions/` 显示为普通文件夹。

Extension manager 应该把同一批扩展呈现为产品对象：

```txt
Extensions
  Kanban View
    Source: .eidos/extensions/kanban-view/index.tsx
    Status: trusted, enabled
    Permissions: files read, network denied
```

Extension editor 应该编辑真实源码文件，而不是 database virtual projection。

创建新扩展应该创建真实文件：

```txt
.eidos/extensions/<slug>/extension.json
.eidos/extensions/<slug>/index.tsx
```

禁用扩展应该更新本地运行时状态，不一定修改 manifest。

## 与 Base 的关系

Base 文件可以允许 extension-defined view types、actions 或 renderers。Base 应该通过稳定 extension ID 和 type 引用扩展能力，而不是引用编译后代码。

示例：

```txt
tasks.base
  eidos__views.view_type = "kanban"
  eidos__views.extension_id = "kanban-view"

.eidos/extensions/kanban-view/
  extension.json
  index.tsx
```

这让 Base 数据保持可移植，同时允许 UI runtime 在扩展存在且可信时解析更丰富的行为。

如果扩展缺失或不可信，Eidos 应该优雅降级：

- 显示原始表格，
- 显示 unsupported view message，
- 允许用户 trust/install 扩展，
- 避免破坏 Base 文件。

## Built-In Extensions

Eidos 内置扩展不需要放在 Space 中。

它们可以继续随 app bundle 分发：

```txt
app bundle / built-in registry
```

只有用户创作或 space-specific 的扩展才应该创建到 `.eidos/extensions/**`。

如果用户 eject 或自定义 built-in extension，Eidos 可以把它复制到 Space：

```txt
.eidos/extensions/ejected/<slug>/
```

Eject 之后，这份 copy 就变成用户源码状态，应该被追踪。

## Marketplace Extensions

Marketplace extensions 是混合模型：

- source/package identity 应该可复现，
- 下载代码和 build output 不应该意外变成用户状态，
- trust 和 permissions 应该保持显式。

推荐被追踪的 metadata：

```txt
.eidos/extensions.lock.json
```

或者：

```txt
.eidos/extensions/<slug>/extension.json
```

并带上 marketplace identity fields：

```json
{
  "id": "vendor.kanban-view",
  "version": "1.2.3",
  "source": {
    "type": "marketplace",
    "package": "vendor/kanban-view",
    "integrity": "sha256-..."
  }
}
```

下载包和编译结果应该放在 `.eidos/cache/extensions/**`。

## 迁移

从当前 database-backed extension model 迁移应该渐进进行。

### Phase 1：Export

新增 export command：

```txt
eidos extension export <slug> .eidos/extensions/<slug>/
```

它写出：

```txt
extension.json
index.ts or index.tsx
assets/
```

### Phase 2：Dual Read

Eidos 可以同时读取：

- legacy `eidos__extensions`，
- file-based `.eidos/extensions/**`。

File-based spaces 中，如果 slug 冲突，file-based extensions 应该优先。

### Phase 3：File-Based Create/Edit

File-based spaces 创建的新扩展写入 `.eidos/extensions/**`。

Extension editor 读取和写入真实文件。

### Phase 4：Runtime State Split

将 enabled state、trust state、permissions 和 bindings 移入 `.eidos/state/extensions.sqlite3`。

### Phase 5：Legacy Freeze

对新的 file-based spaces，停止把用户扩展创建到 `eidos__extensions`。

Legacy spaces 可以继续使用旧模型，直到迁移完成。

## 关键决策

1. 用户/空间扩展源码放在 `.eidos/extensions/**`。
2. `.eidos/extensions/**` 默认被 graft 追踪。
3. `.eidos/cache/**`、`.eidos/state/**`、`.eidos/sessions/**` 和 `.eidos/indexes/**` 是私有运行时状态，默认被 graft 忽略。
4. Built-in extensions 可以继续随 app bundle 分发。
5. Trust、enabled state、permissions 和 secret bindings 默认是本地私有状态。
6. 当前虚拟 `~/.eidos/__EXTENSIONS__` 模型是兼容层，不是目标 source of truth。

## 开放问题

1. 默认源码目录是否就叫 `.eidos/extensions/`，还是应该允许 Eidos 配置？
2. Enabled/disabled 是否存在团队共享状态，还是永远作为本地状态？
3. Marketplace extension locks 应该放在 `.eidos/extensions.lock.json`、每个 extension manifest，还是两者都支持？
4. 在默认启用 file-based extensions 前，最小 sandbox 是什么？
5. 扩展源码变化是否总是使 trust 失效，还是只在 entry files 和 manifests 变化时失效？
6. 扩展源码是否支持 dependencies，还是 v1 要求 single-file/bundled extensions？

## 推荐垂直切片

1. 支持发现 `.eidos/extensions/*/extension.json`。
2. 将 `entry` 编译到 `.eidos/cache/extensions/build/<id>/`。
3. 在 `.eidos/state/extensions.sqlite3` 存储 trust/enabled state。
4. 在 extension manager 中显示 discovered extensions。
5. 首次运行前显示 trust prompt。
6. 新建扩展时在 `.eidos/extensions/<slug>/` 下创建真实文件。
7. 在 graft Changes UI 中展示扩展文件变更。
