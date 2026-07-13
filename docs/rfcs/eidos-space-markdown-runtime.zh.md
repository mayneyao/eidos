# RFC：Eidos Space 与 Markdown 运行时

状态：草案，垂直切片可用
日期：2026-07-08
负责人：Eidos
相关文档：

- `eidos-space-base-storage.zh.md`
- `eidos-base-file-format.zh.md`

## 实施状态（2026-07-13）

已经实现：

- 文件系统驱动的 Space tree 和文件 CRUD，
- 带外部变化检测的安全原子 Markdown 保存，
- file watcher 和 renderer refresh events，
- 独立的 Lexical Markdown editor package，
- 基础 CommonMark/GFM 编辑、附件、wiki links 和 source preservation，
- 符合 Markdown 语义的 list/Enter/Backspace/Tab 行为、Markdown 与图片
  paste/drop、自动链接、浮动行内格式工具栏和 block 选择，
- 持久化在 `.eidos/indexes/markdown.sqlite3` 的可重建
  search/link/tag/backlink index，
- indexed quick open、编辑器 wiki-link completion、outline 和 backlinks UI。
- 内置 Base、Markdown、图片、音频、视频和 PDF opener，并为没有专用 opener
  的文件提供有上限的只读文本兜底预览；binary 文件不会把内容 bytes 发送到
  renderer。

独立编辑器当前有 57 个 package acceptance tests；Desktop host integration
tests 也覆盖了 runtime loading、保存行为和冲突处理路径。

Desktop 启动时仍会扫描文件系统元数据以保证文件具有最终权威；未变化的正文和
Markdown 解析结果直接复用可删除的 SQLite cache。Watcher 变化会增量更新，显式
Rebuild 和损坏 schema 恢复都会完全从 Space 文件重建索引。

未知文件的兜底检查最多读取 512 KiB，接受严格 UTF-8 和带 BOM 的 UTF-16，
拒绝包含 NUL、大量控制字符或非法编码的内容；更大的文本预览会明确标记为
truncated。专用 opener 始终优先，watcher 刷新兜底预览时也不会用 loading state
替换整个文档区域。检查失败后可以直接在当前 tab 重试，无需重新打开文件。Runtime
测试同时锁定 512 KiB 边界落在 UTF-8 多字节字符内部的情况，避免把合法文本误判为
binary。

带语言标记的 fenced code 使用 Lexical 0.47 Prism extension 提供语法高亮、行号和
紧凑语言标签；未标记语言的 fence 会保持 unset，确保高亮不会改变 Markdown 语义。

原生 Electron acceptance 现已覆盖 list 的 Enter/Backspace/Tab、IME 组合输入与删除、
系统图片粘贴及 asset 落盘、Cmd+S，以及包含 5,000 个 blocks 的 Markdown 文档。
验收机器上长文档打开约 1.88 秒、文本编辑约 258 ms、保存约 234 ms。当前垂直切片的
原生验收边界已经闭合，后续长文档工作属于性能优化，而不是正确性缺口。

## 摘要

本 RFC 定义 Eidos 如何打开和编辑一个以 Markdown 文件作为 canonical document state 的 Space。

目标模型：

- Space 文件系统是真实文档树。
- `.md` 文件被直接读写。
- Space mode 下，`eidos__docs` 不再是 Markdown 正文的 canonical store。
- `.eidos/` 存放生成态索引、缓存、会话、本地 UI 状态。
- `.base` 文件在同一个 Space 中提供结构化数据能力。

这样 Eidos 可以把 Obsidian vault 作为 Space 直接打开，而不需要把用户文档导入到隐藏主数据库。

## 产品原则

Space mode 应该保留用户的安全感：

> 用户用其它编辑器打开 Space 时，Markdown 文档仍然在那里。

Eidos 可以增加更好的编辑器、表格、视图、搜索、agent 和版本管理，但不应该让 Markdown 依赖 `.eidos/db.sqlite3` 作为 source of truth。

## 目标

- 将 Markdown 文档作为真实文件读写。
- 使用真实文件系统树作为 canonical document tree。
- 保持从 Obsidian vault 打开的 Space 离开 Eidos 也可用。
- 让 Eidos 可以构建索引和 backlinks，但不拥有文档正文。
- 默认不把 Eidos 私有状态展示到 graft status。
- 为需要元数据的 Eidos-native 能力保留空间。

## 非目标

- 本 RFC 不定义完整 Markdown parser/editor 实现。
- 本 RFC 不要求兼容每一种 Obsidian 插件。
- 本 RFC 不要求所有旧 Eidos 文档立即迁移。
- 本 RFC 不定义 Base 内部格式。

## 运行时边界

Space mode 应该拆成三个运行时：

```txt
Space runtime:
  打开文件夹
  读取真实文件树
  解析 Space-relative paths
  管理 .eidos 私有状态
  管理 graft

Markdown runtime:
  打开 .md 文件
  解析 frontmatter/body
  编辑并保存 Markdown
  发出 file-change events

Base runtime:
  打开 .base SQLite 文件
  管理 tables/fields/views/rows
```

Markdown runtime 不应该依赖 `DataSpaceWithTable`。Base runtime 也不应该依赖 Markdown 文档树。

## 文件树

Space mode 的左侧文件树应该来自文件系统，而不是 `eidos__tree`。

示例：

```txt
my-space/
  notes/project.md
  tasks.base
  assets/image.png
  .obsidian/
  .eidos/
  .graft/
```

默认文件树行为：

- 展示普通用户文件和文件夹，
- 隐藏 `.graft/`，
- 默认隐藏 `.eidos/`，
- 通过 Extensions 产品视图展示 `.eidos/extensions/**`，而不是放进普通文档树，
- 根据用户设置决定是否展示 `.obsidian/`，
- 将 `.md` 识别为文档，
- 将 `.base` 识别为 Eidos Base 文件。

`eidos__tree` 可以继续为 legacy spaces 或 app-internal metadata 存在，但它不应该是 Space 文件树的 canonical source。

## Markdown 的 Source of Truth

Space mode 下：

```txt
notes/project.md
```

就是 canonical document body。

Eidos 可以存储派生元数据：

```txt
.eidos/indexes/markdown.sqlite3
.eidos/search.sqlite3
.eidos/cache/previews/
```

但这些存储必须是可重建的。如果文件和索引冲突，文件获胜。

## 文档元数据

文档元数据应该优先使用可移植的 Markdown 机制：

- YAML frontmatter，
- Markdown links，
- 文件路径，
- 适当情况下使用文件系统时间戳。

可选的 Eidos 元数据可以存在 frontmatter：

```yaml
---
id: 019f...
title: Project Plan
tags:
  - work
---
```

规则：

- 普通 Markdown 文件不应该强制需要 `id`。
- 如果 Eidos 写入 ID，它应该稳定且不打扰用户。
- Eidos-specific frontmatter 应该保持最少。
- 缺失元数据应该能从路径和内容重建。

## 链接与引用

Space mode 应该支持常见 Markdown link 形式：

```txt
[Project](./project.md)
![](../assets/image.png)
[[Project]]
```

Eidos 可以在 `.eidos/` 下构建 backlink index，但 Markdown 文件仍然是 canonical。

开放问题：

- v1 要支持多少 wiki-link 语法？
- 文件重命名时，Eidos 是否应该自动规范化 links？
- 指向 Base tables/rows 的链接应该使用自定义 URI，还是 Markdown link？

## 附件

附件默认应该是普通 Space 文件：

```txt
assets/image.png
files/report.pdf
```

Markdown 文档通过相对路径引用它们。

Eidos 可以提供 managed attachment folders，但文件仍然应该可见，并可被 graft 版本管理。

## Obsidian 互操作

把 Obsidian vault 作为 Space 打开时，Eidos 应该：

- 保留 `.obsidian/`，
- 直接读取 Markdown 文件，
- 尽可能保留 frontmatter 和 links，
- 不把文档导入 `eidos__docs` 作为 canonical state，
- 只将 `.eidos/` 用于私有 Eidos 状态，
- 只有启用版本管理时才添加 `.graft/`，
- 只有用户创建结构化数据时才添加 `.base` 文件。

`.obsidian/workspace*.json` 通常应该被视为本地 UI 状态，而不是共享用户内容。

## 索引

生成态索引可以包括：

- full-text search，
- backlink graph，
- outline/headings，
- tags，
- embeddings，
- preview cache。

这些应该放在 `.eidos/` 下，并默认被 graft 忽略。

推荐不变量：

> 删除 `.eidos/indexes/**` 不应该造成用户内容丢失。

## Watch 与刷新

Eidos 应该监听 Space 文件变化：

- 外部编辑器修改，
- 文件重命名，
- 文件删除，
- 资源文件更新，
- Base 文件更新。

Watcher 应该更新索引和 UI 状态，而不是悄悄把文件导入隐藏文档表。

## Legacy 兼容

已有 Eidos spaces 可能仍然依赖：

```txt
eidos__docs
eidos__tree
.eidos/db.sqlite3
```

兼容性应该显式处理：

- legacy spaces 继续通过旧模型打开，
- Space mode 打开真实文件，
- migration/export 将旧 docs 转成 `.md`，
- 新的 file-based spaces 不再在 `eidos__docs` 中创建 canonical Markdown。

## API 方向

目标 APIs：

```ts
const Space = await eidos.openSpace(path)
const doc = await Space.openMarkdown("notes/project.md")
await doc.save(markdown)

const base = await Space.openBase("tasks.base")
await base.schema.createTable(...)
```

过渡期兼容 APIs 可以路由到默认 Space/base，但新代码应该显式表达目标对象。

## 开放问题

1. Eidos 是否应该默认在 frontmatter 中创建稳定 document ID？
2. Markdown 到 Base tables/rows 的链接应该如何表示？
3. `.obsidian/` 是否默认显示在文件树中？
4. Markdown 编辑器是否需要尽可能 byte-for-byte 保留格式？
5. 第一版需要哪些生成态索引才能体验足够好？

## 推荐垂直切片

```txt
sample-space/
  notes/project.md
  assets/image.png
  .eidos/
```

这个 slice 应该证明：

- Eidos 可以打开 Space。
- 文件树来自文件系统。
- Eidos 可以编辑 `notes/project.md`。
- 外部修改文件后 Eidos 能感知。
- `.eidos/indexes/**` 可以删除并重建。
- 不会把 canonical document body 写入 `eidos__docs`。
