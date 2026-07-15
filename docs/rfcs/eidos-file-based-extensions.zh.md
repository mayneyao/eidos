# RFC：Eidos Space 的文件化扩展机制

状态：草案，v1 契约已冻结；P2b、P3 与 P4 开发者预览已实现
日期：2026-07-09
最后更新：2026-07-15
负责人：Eidos
相关文档：

- `eidos-space-base-storage.zh.md`
- `eidos-base-file-format.zh.md`
- `eidos-space-markdown-runtime.zh.md`
- `eidos-graft-space-versioning.zh.md`

## 实施状态（2026-07-15）

本 RFC 的存储、Manifest、trust、交付、最小 Worker 与 GitHub snapshot 安装边界已经冻结到
P2b、P3 和 P4。
当前开发分支已经实现严格 package inspection、有资源上限的变更监听、拒绝符号链接逃逸的宿主发现、
Extension Manager 诊断，以及通过内联交互创建真实本地扩展源码。结构合法的扩展显示为“未信任”，
而不是“就绪”；P2a 本地状态切片现在已经让“已停用”和“已启用”状态可达。Trust、enablement 和逐项
capability grant 由独立的 `@eidos.space/extension-state` package 持久化，并精确绑定 package ID、
content digest 和 permission hash。创建的源码会通过现有 Version Changes 边界展示，私有 cache staging
和 `.eidos/state/extensions.sqlite3` 仍被忽略。

P2b 开发者预览使用固定 Rollup/Oxc compiler 编译检查时得到的精确内存快照；每个启用 package
会按需在隐藏 sandboxed Electron renderer 与独立 session 内创建 Web Worker。当前只开放声明过的
command/menu、有大小上限的只读文本访问，以及宿主渲染的 notice、confirm、select UI。每次 capability
调用都会重新校验 source digest、permission hash、trust、enablement 和精确 grant。源码或本地状态
变化会终止活动 runtime；activation/invocation timeout、renderer crash、旧 generation、未声明 command
和私有路径都会默认失败。Markdown Task Counter 已接入命令面板与文件右键菜单。

P3 开发者预览会在固定的 sandboxed iframe document 中激活声明过的 text `fileEditors`。Document
session、revision、minimal edit、undo/redo、autosave 与 external-change conflict 全部由宿主管理；surface
拿不到 filesystem handle 或 navigation authority。仓库中的 Markdown Task Board 验证了完整的可编辑 UI
链路，同时仍可通过 Open With 切换到原生 Markdown editor。

P4 开发者预览可以接收公开 GitHub repository、可选 ref 与可选 monorepo package path，把它解析为
immutable commit，在同一
Space 文件系统的私有 staging 中下载有资源上限的 archive，拒绝危险条目与无效 package，并在原子安装
前展示 source/permission changes。被追踪的 per-package `extension.lock.json` 由 Eidos 管理。更新只手动
触发、永不覆盖本地修改，并让新快照重新回到 disabled 和 untrusted；无效 package 仍可卸载。Private
repository、自动更新与通用 network capability 仍属于后续阶段。

现有 bundled 和 database-backed extensions 继续作为兼容路径。

## 摘要

File-based workspace 中，Eidos 扩展应该逐步转向 file-based source model。

用户/空间自定义扩展的 canonical source 应该作为普通文件放在 Space 中：

```txt
my-space/
  .eidos/
    extensions/
      example.kanban-view/
        extension.json
        src/
          extension.ts
          view.tsx
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
.eidos/extensions/<publisher.name>/src/**         canonical source
.eidos/extensions/<publisher.name>/extension.json canonical manifest
.eidos/cache/extensions/**               generated build output
.eidos/state/extensions.sqlite3          local/private runtime state
```

## 目录布局

推荐默认布局：

```txt
my-space/
  .eidos/
    extensions/
      example.todo-actions/
        extension.json
        src/
          extension.ts

      example.markdown-task-counter/
        extension.json
        src/
          extension.ts

    cache/
      extensions/

    state/
      extensions.sqlite3

    secrets.sqlite3
```

Version 1 固定使用 `.eidos/extensions/<publisher.name>/`。暂不支持可配置 root 和 flat-file
package，因为稳定 package root 是 discovery、identity conflict、content digest、Graft diff 和
GitHub 安装的共同前提。

## Extension Manifest

每个扩展目录都包含 `extension.json`。唯一的机器可读契约是
`apps/docs/public/schemas/extension-manifest.schema.json`；本 RFC 不再维护另一套 legacy-shaped
Manifest。

```json
{
  "$schema": "https://docs.eidos.space/schemas/extension-manifest.schema.json",
  "manifestVersion": 1,
  "publisher": "example",
  "name": "markdown-task-counter",
  "displayName": "Markdown Task Counter",
  "version": "0.1.0",
  "engines": { "eidos": ">=0.34.0" },
  "entrypoints": { "worker": "src/extension.ts" },
  "contributes": {
    "commands": [
      {
        "id": "example.markdown-task-counter.count-tasks",
        "title": "Count Markdown tasks"
      }
    ]
  },
  "permissions": {
    "files": { "read": ["**/*.md"], "write": [] },
    "network": []
  }
}
```

Canonical package ID 是 `${publisher}.${name}`，所有 contribution ID 都属于这个 namespace。
Manifest v1 会拒绝未知字段，未来新增 capability 必须显式升级契约，不能静默改变已安装源码的含义。

Manifest 是可移植 source state，会被 Graft 追踪。

编译产物不是可移植 source state，应该重建到 `.eidos/cache/extensions/**`。

### Version 1 dependency policy

Version 1 只允许 package 内的 relative import 和 Eidos extension SDK。Bare third-party package、
Node.js/Electron built-in、非 literal dynamic import、package-manager lifecycle script 和 runtime
CDN import 都会被拒绝。Publisher 可以把可审查源码 vendoring 到 package root，再使用 relative
import。

Eidos 永远不会为扩展运行 `npm install`。更广泛的 dependency resolution 需要未来 Manifest
版本定义 lock、integrity、license 和 reproducible build 语义。

### Canonical digests

Version 1 有意采用保守 content digest：对除宿主管理的 `extension.lock.json` 之外，每个 installed
package file 的规范化相对路径和内容字节做 hash。因此只修改 README 也需要重新 review。这个规则
比仅 hash dependency graph 更严格，但边界显式，不会漏掉可执行 asset。

Canonical algorithm 有意保持可在 Eidos 之外实现：

1. 只接受 regular file 与 directory；复制或 hash 前拒绝 symbolic link 和 special file。
2. 把相对 package root 的每个 file path 转为 UTF-8 NFC，并统一使用 `/` separator；拒绝空 segment、
   `.`、`..`、NUL、NFC collision 和 case-folding collision。
3. 只排除 root-level、由宿主管理的 `extension.lock.json`；空 directory 不参与。
4. 按 unsigned UTF-8 byte order 排序 path。
5. 每个文件向 SHA-256 输入一条 record：
   `[u32be pathLength][pathBytes][u64be contentLength][contentBytes]`。
6. 结果编码为 `sha256:<lowercase hex>`。

Installer 只 hash 已复制的 staging snapshot，不 hash 正在变化的 source directory。Live Space scan
如果检测到 scan 期间 file metadata 改变，就重新执行。

Permission hash 独立根据规范化的 requested permission 计算：先排序 file-pattern 和 origin array，
再用 RFC 8785 JSON Canonicalization Scheme 序列化 normalized object，最后把 UTF-8 bytes hash 为
`sha256:<lowercase hex>`。Trust 由 package ID、content digest 和 permission hash 共同决定。Build
cache key 还会包含 host runtime ABI。

## 状态分层

### 被追踪的源码状态

这些文件属于 Space，应该被追踪：

```txt
.eidos/extensions/<publisher.name>/extension.json
.eidos/extensions/<publisher.name>/extension.lock.json
.eidos/extensions/<publisher.name>/src/**
.eidos/extensions/<publisher.name>/assets/**
.eidos/extensions/<publisher.name>/README.md
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
- 除宿主管理的 lock file 外，installed package 内任何文件变化都会改变 version 1 content digest，
  并使该 digest 的 trust 失效。
- Marketplace-installed extensions 应该通过 ID/version 或 lock metadata 固定。

已经实现的本地状态格式使用独立的 `trusted_snapshots`、`snapshot_enablements` 和
`permission_grants` 表。Enablement 绑定 snapshot 而不是只绑定 package：信任变化后的源码不能静默恢复
旧快照的 enabled flag 或 grants；撤销 trust 会级联清除二者。遇到未知 application ID 或 schema version
时不会删除或重建数据库，因为 trust decision 不是可丢弃的 cache。

这也是为什么不应该把执行状态全部放进被追踪文件。

## Graft 语义

在默认宽追踪规则下，扩展源码表现为普通 path changes：

```txt
.eidos/extensions/example.kanban-view/extension.json
.eidos/extensions/example.kanban-view/src/view.tsx
.eidos/extensions/example.kanban-view/assets/icon.svg
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
    Source: .eidos/extensions/example.kanban-view/
    Status: trusted, enabled
    Permissions: files read, network denied
```

Extension editor 应该编辑真实源码文件，而不是 database virtual projection。

创建新扩展应该创建真实文件：

```txt
.eidos/extensions/<publisher.name>/extension.json
.eidos/extensions/<publisher.name>/src/extension.ts
```

禁用扩展应该更新本地运行时状态，不一定修改 manifest。

## 与 Base 的关系

Base 文件可以允许 extension-defined view types、actions 或 renderers。Base 应该通过稳定 extension ID 和 type 引用扩展能力，而不是引用编译后代码。

示例：

```txt
tasks.base
  eidos__views.view_type = "kanban"
  eidos__views.extension_id = "example.kanban-view"

.eidos/extensions/example.kanban-view/
  extension.json
  src/view.tsx
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
.eidos/extensions/local.<name>/
```

Eject 之后，这份 copy 就变成用户源码状态，应该被追踪。

## Marketplace Extensions

Marketplace extensions 是混合模型：

- source/package identity 应该可复现，
- 下载代码和 build output 不应该意外变成用户状态，
- trust 和 permissions 应该保持显式。

每个 installed package 都把 provenance 放在源码旁边：

```txt
.eidos/extensions/<publisher.name>/extension.lock.json
```

Manifest 描述 package behavior；由宿主管理的 lock file 描述 installed snapshot 的来源：

```json
{
  "lockVersion": 1,
  "source": {
    "kind": "github",
    "repository": "https://github.com/vendor/kanban-view",
    "requested": "refs/tags/v1.2.3",
    "commit": "0123456789abcdef0123456789abcdef01234567"
  },
  "contentDigest": "sha256:..."
}
```

下载包和编译结果应该放在 `.eidos/cache/extensions/**`。
Version 1 不使用 central lock file；per-package lock 可以避免无关扩展更新发生 merge conflict，
也让复制后的 installed source 仍然自描述。
`contentDigest` 记录 installed baseline。如果当前 content 不匹配，package 不会因此无效，而是被标记为
locally modified，并阻止 update 静默覆盖它。Runtime trust 始终使用根据当前 package content
重新计算的 digest。

## 迁移

从当前 database-backed extension model 迁移应该渐进进行。

### Phase 1：Export

新增 export command：

```txt
eidos extension export <slug> --publisher <publisher>
```

它写出：

```txt
extension.json
src/extension.ts or src/view.tsx
assets/
```

### Phase 2：Dual Read

Eidos 可以同时读取：

- legacy `eidos__extensions`，
- file-based `.eidos/extensions/**`。

Dual read 期间，legacy row 与 file-based package 保持不同 identity。Export 会在本地 migration
state 中记录 legacy-to-canonical mapping。如果 canonical package ID 冲突，两个候选都被阻止，
直到用户解决冲突；Eidos 永远不会根据 slug match 自动选择要执行的代码。

### Phase 3：File-Based Create/Edit

File-based spaces 创建的新扩展写入 `.eidos/extensions/**`。

Extension editor 读取和写入真实文件。

### Phase 4：Runtime State Split

将 enabled state、trust state、permissions 和 bindings 移入 `.eidos/state/extensions.sqlite3`。

### Phase 5：Legacy Freeze

对新的 file-based spaces，停止把用户扩展创建到 `eidos__extensions`。

Legacy spaces 可以继续使用旧模型，直到迁移完成。

## 关键决策

1. 用户/空间扩展源码放在固定的 `.eidos/extensions/<publisher.name>/` root。
2. `.eidos/extensions/**` 默认被 graft 追踪。
3. `.eidos/cache/**`、`.eidos/state/**`、`.eidos/sessions/**` 和 `.eidos/indexes/**` 是私有运行时状态，默认被 graft 忽略。
4. Built-in extensions 可以继续随 app bundle 分发。
5. Trust、enabled state、permissions 和 secret bindings 默认是本地私有状态。
6. 当前虚拟 `~/.eidos/__EXTENSIONS__` 模型是兼容层，不是目标 source of truth。
7. Manifest v1 使用 `publisher`、`name`、显式 `entrypoints`、声明式 `contributes` 和
   capability-oriented `permissions`。
8. Version 1 只支持 relative package module 与 Eidos SDK，Eidos 永不执行 package-manager script。
9. GitHub provenance 存放在被追踪的 per-package `extension.lock.json`。
10. 除宿主管理的 lock file 外，installed package 内任何文件变化都会产生新的 version 1 content
    digest；trust 由 ID、content digest 和 permission hash 共同决定。

## 延后问题

以下问题不阻塞 version 1 foundation，明确延后：

1. 团队共享的 enablement 与 permission policy。
2. 任意 npm dependency 与 package-manager compatibility。
3. Community marketplace 或自动更新服务。
4. 没有用户可见 contribution trigger 的 background activation。
5. Binary custom-document 编辑，以及 mobile/web extension runtime。

## 交付计划

### P0：契约统一

- 让 Manifest Schema 成为唯一 v1 source of truth。
- 发布固定目录、digest、dependency、lock 和 local-state 规则。
- 在有 runtime evidence 之前，文档和可执行示例继续标记为 preview。

### P1：不可执行基础层

- 通过 host-internal project file boundary 发现 `.eidos/extensions/*/extension.json`；该边界
  不能访问 `.graft` 或无关 private state。
- 只 parse、validate、diagnose 和 hash package，不执行也不编译代码。
- 使用 generation token 监听 package 变化，旧 scan 结果不能覆盖新状态。
- Extension Manager 展示 invalid、incompatible、untrusted、disabled 或 ready 状态。
- 创建扩展模板时生成真实文件，并通过现有 Graft Changes UI 显示变更。

### P2a：本地信任状态

- 在 `.eidos/state/extensions.sqlite3` 中持久化 snapshot-bound trust、enablement 和逐项 capability grant。
- 每次状态变更前由宿主重新检查 package bytes，renderer 携带旧 digest 的请求必须失败。
- 所有 capability 默认拒绝；源码或请求权限变化后，旧 trust、enablement 和 grants 不再生效。
- 提供内联审阅和管理，但不编译、不执行代码。

### P2b：最小可执行 Worker

- 增加 per-package lazy worker 与 capability gateway。
- 支持声明式 command/menu、read-only file access，以及宿主渲染的 notice、select、confirm UI。
- 消费 P2a trust state，并补齐 timeout、termination、crash recovery，以及禁用所有第三方 package
  仍可安全启动的能力。
- 用 Markdown Task Counter 证明完整运行链路。

当前开发者预览已实现。固定的 transport-only preload 不暴露 Electron API，只负责把一条
`MessagePort` 传入 sandboxed host page。Runtime 编译不会安装依赖、发现配置，也不会重新打开可变的
package 文件。

### P3：UI Surface

- 先定义 text-document contract：versioned snapshot、minimal edit、dirty state、undo/redo、autosave、
  external-change conflict 和多个同步 view。
- 再通过独立 `MessagePort` capability channel 在 sandboxed iframe surface 中激活 `fileEditors`。
- 使用可编辑 Markdown Task Board 验证，而不是只读 demo。

当前 developer preview 已经实现。独立的 `@eidos.space/extension-surface-protocol` package 固定 UTF-16
edit offset、精确 base revision、有界 change batch、host-owned dirty/undo state、一次性的
compare-and-swap save token、external conflict resolution 与 multi-view broadcast。Desktop 宿主现在会
匹配受信任的 `fileEditors`、打开共享 document session、通过专用 `MessagePort` 在 opaque sandboxed
iframe 中激活 inspected UI bundle、传播宿主 appearance token，并提供 default editor 与 **Open with**
routing。

固定 iframe document 会拒绝 network、form、nested frame、remote asset 与 popup；main-window navigation
policy 还会阻止已经初始化的 surface 替换自己的 `srcdoc` document。Activation 前会重新校验 source 与
grant；每次 edit、save、undo、redo、resync、conflict decision 与 close 都必须经过 host-owned document
manager。仓库内的 Markdown Task Board 只修改一个 checkbox marker，验证完整链路，同时保留正常
autosave、undo、external-change 与 Graft 行为。

### P4：GitHub 安装

- 解析 immutable Git commit，在 staging tree 中验证，展示 source/permission changes，atomic vendor，
  并写入 per-package lock file。
- 首个版本只做手动更新，永不静默覆盖本地修改过的 source。

当前开发者预览已经为公开 repository-root package 和 monorepo package 实现。选定的 package path 会被
规范化、在相同 archive 限额下提取并写入 lock，更新时不能静默切换。Preview session 有短时限且绑定
Space；renderer 只能看到经过清理的 metadata 与已审阅 digest，不能接触 staging path 或 archive bytes。
安装与更新会在 Space operation lock 内重新验证。Package 在被单独批准之前保持 disabled 和 untrusted。

Built installer lifecycle 提供可重复的 smoke gate：

```bash
pnpm --filter eidos smoke:file-extension-install
```

它导入构建后的 package，解析受控的 GitHub commit/tarball response，然后针对临时 file Space 实际执行并
验证 install、update 和 uninstall，包括 lock provenance 与 staging cleanup。
