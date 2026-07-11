# RFC：从 Legacy Eidos Space 迁移到 Space/Base

状态：草案，尚未开始实施
日期：2026-07-08
负责人：Eidos
相关文档：

- `eidos-space-base-storage.zh.md`
- `eidos-base-file-format.zh.md`
- `eidos-space-markdown-runtime.zh.md`
- `eidos-graft-space-versioning.zh.md`

## 实施状态（2026-07-11）

尚未开始实施。export-mode migration 仍是第一目标，但会等待独立 Base 格式和校验
APIs 稳定后再开始。第一版不规划 silent migration 或 in-place migration。

## 摘要

本 RFC 定义从当前隐藏数据库式 Eidos Space 迁移到 file-based Markdown + Base 模型的策略。

当前模型：

```txt
.eidos/db.sqlite3     canonical app/user state
.eidos/files/**       managed file payloads
```

目标模型：

```txt
*.md                  Markdown documents
*.base                structured data
assets/**             user assets
.eidos/extensions/**  extension source
.eidos/cache/**       private/generated state
.eidos/state/**       local runtime state
.graft/**             version metadata
```

迁移应该优先采用 export-based 策略，可回滚、显式触发。第一版不应该悄悄把用户现有 space 原地改写成新模型。

## 目标

- 保留用户内容。
- 将旧文档转换为 Markdown 文件。
- 将旧表格转换为 `.base` 文件。
- 尽可能将 managed files 转成 Space assets。
- 生成 migration report。
- 允许用户在提交前预览。
- 避免第一版做破坏性原地迁移。

## 非目标

- 本 RFC 不要求完美迁移每个 legacy feature。
- 本 RFC 不要求删除旧 `.eidos/db.sqlite3`。
- 本 RFC 不要求 v1 对所有 spaces 提供一键迁移。
- 本 RFC 不定义每一种 Markdown 序列化细节。

## 源模型

Legacy Eidos spaces 可能包含：

```txt
.eidos/db.sqlite3
  eidos__docs
  eidos__tree
  eidos__files
  eidos__columns
  eidos__views
  eidos__references
  tb_<tableId>
  eidos__kv
  eidos__chats
  eidos__messages
  ...

.eidos/files/**
```

其中一部分是用户内容，一部分是私有/运行态状态。

## 目标模型

示例目标 Space：

```txt
my-space/
  notes/
    project.md
    ideas.md
  tasks.base
  assets/
    image.png
  .eidos/
    migration/
    indexes/
  .graft/
```

Canonical 用户内容：

- `.md`，
- `.base`，
- assets。

私有/生成态：

- `.eidos/indexes/**`，
- `.eidos/cache/**`，
- `.eidos/sessions/**`，
- migration logs。

## 迁移模式

### 导出模式

将 legacy space 导出到一个新的目标文件夹。

推荐作为第一版实现。

优点：

- 最安全，
- 容易回滚，
- 旧 space 保持不变。

### 原地迁移模式

将现有 space 原地转换成 file-based 形态。

应该稍后再做，并要求显式确认。

### 混合模式

保留 legacy `.eidos/db.sqlite3`，同时逐步添加 `.base` 文件。

适合开发期，但不应该成为最终产品叙事。

## 内容映射

### 文档

来源：

```txt
eidos__docs
eidos__tree
```

目标：

```txt
*.md
```

规则：

- document body 序列化为 Markdown，
- tree/folder path 决定输出路径，
- title 在安全时决定文件名，
- 重名文件使用确定性的 suffix，
- 必要时将文档元数据放进 frontmatter。

开放问题：

- 如何序列化非 Markdown 的 Lexical nodes，
- 如何表示嵌入表格/Base references，
- 是否在 frontmatter 中保留 document IDs。

### 表格

来源：

```txt
tb_<tableId>
eidos__columns
eidos__views
eidos__references
eidos__tree table nodes
```

目标：

```txt
*.base
```

规则：

- 复制用户数据表，
- 复制字段元数据，
- 复制视图元数据，
- 复制依赖元数据，
- 创建 `eidos__tables`，
- 写入 `eidos__meta`，
- 校验 formulas、links、lookups 和 generated columns。

导出策略：

- 一个 `main.base` 包含所有表，
- 每个 top-level table group 一个 `.base`，
- 用户选择分组。

推荐 v1：

```txt
main.base
```

因为它更容易保留 tables 之间的 links/lookups。

### 文件

来源：

```txt
.eidos/files/**
eidos__files
file field path strings
```

目标：

```txt
assets/**
```

规则：

- 将物理文件复制到可见 assets folder，
- 尽可能保留文件名，
- 使用稳定的冲突处理，
- 将 file field paths 改写为 Space-relative paths，
- 必要时改写 Markdown asset references。

### Tree 映射

来源：

```txt
eidos__tree
```

目标：

- 文档对应 folders 和 Markdown file paths，
- 表格对应 Base 内 `eidos__tables` rows，
- 可选 UI metadata 放在 `.eidos/`。

Legacy tree 不应该成为 canonical Space tree。

### 私有状态

不要作为用户内容迁移：

- sessions，
- chats/messages，除非用户显式导出，
- cache，
- generated indexes，
- local UI state，
- sync transient state。

## 迁移报告

每次迁移都应该生成：

```txt
.eidos/migration/<timestamp>/report.md
.eidos/migration/<timestamp>/mapping.json
```

Report 应包含：

- source path，
- target path，
- exported document count，
- exported table count，
- copied asset count，
- skipped items，
- warnings，
- errors，
- old ID 到 new path 的映射。

## 校验

在标记迁移成功之前：

- 所有导出的 Markdown 文件存在，
- 所有导出的 Base 文件通过 Base metadata validation，
- Base tables 可以打开，
- row counts 匹配，
- field counts 匹配，
- view counts 匹配，
- copied assets 存在，
- rewritten file references 尽可能可解析。

## Graft 初始化

导出后，Eidos 可以询问是否启用 graft：

```txt
.graft/
```

默认 Space tracking 应忽略私有 `.eidos` 运行时子目录，追踪用户可见文件，并追踪 `.eidos/extensions/**` 这类稳定 Eidos 项目文件。

Initial commit 应包含：

- Markdown 文件，
- Base 文件，
- assets，
- 被选择的稳定配置文件。

不应包含：

- migration cache，
- sessions，
- generated indexes。

## 回滚

Export mode 回滚很简单：

- 删除 target folder，
- 保留 source legacy space。

In-place migration 必须先创建 backup：

```txt
.eidos/backups/pre-Space-migration-<timestamp>/
```

In-place mode 在 restore 被测试前不应该发布。

## 开放问题

1. v1 应该把所有 tables 导出到 `main.base`，还是询问用户？
2. Lexical-only blocks 应该如何序列化为 Markdown？
3. `eidos__chats` 和 `eidos__messages` 是否可以导出为 Markdown transcripts？
4. 旧 graft history 应该保留，还是迁移后的 Space 从新 initial commit 开始？
5. Markdown frontmatter 应该写入多少 metadata？

## 推荐垂直切片

Legacy input：

```txt
.eidos/db.sqlite3
  one doc
  one table
  one file field
.eidos/files/logo.png
```

Output：

```txt
migrated-Space/
  notes/doc.md
  main.base
  assets/logo.png
  .eidos/migration/.../report.md
```

这个 slice 应该证明：

- document 导出为 Markdown，
- table 导出为 Base，
- asset 被复制，
- file field path 被改写，
- report 包含 mappings 和 warnings，
- source space 保持不变。
