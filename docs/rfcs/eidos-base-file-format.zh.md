# RFC：Eidos Base 文件格式与运行时

状态：草案，实施中
日期：2026-07-08
负责人：Eidos
相关文档：`eidos-space-base-storage.zh.md`

## 实施状态（2026-07-12）

独立的 `@eidos.space/base` package 已经可以创建、打开、校验并迁移真实 `.base`
SQLite 文件，而且不依赖 Eidos core 或 `@libsql/client`。当前实现包含 v1 metadata、
table registry、field/view/reference schemas、primitive fields 和 row CRUD，并通过显式
SQLite connection boundary 隔离实现；`better-sqlite3` adapter 位于独立的可选入口。

desktop file Space 已经可以创建和打开 `.base`。初始 HTML table 已替换为 production
Glide DataEditor 上的 Base adapter，恢复 keyboard navigation、rectangular selection、
copy/paste、fill handle、column reorder/resize，并支持创建 table/field 与持久化 Grid
order/width。Graft row diff 也已贯通 working Changes 和历史 inspector。

Base snapshot 现在只携带 row count，Grid 按可见区域请求并缓存 100-row pages；批量删行
使用 compact row ranges 在 runtime 内事务执行，不需要在 renderer 物化整表选择，并已用
10,000-row fixture 验证。完整 table/field rename/delete、更丰富字段语义和 legacy Space
导出仍待实现。

## 摘要

本 RFC 定义 Eidos Base 文件的第一版实现形态。

Base 文件是 Space 中用户可见的 `.base` 文件。它底层是 SQLite 数据库，并尽量复用当前 Eidos 的表格运行时：

- 命名为 `tb_<tableId>` 的用户数据表，
- 来自 `eidos__columns` 的字段元数据，
- 来自 `eidos__views` 的视图元数据，
- 来自 `eidos__references` 的字段依赖元数据，
- 现有 field types、view types、row IDs 和 system columns。

核心变化是所有权和打包方式：

> 表格不再隐藏在 workspace 的 `.eidos/db.sqlite3` 里，而是成为一个可移植 Base 文件的一部分。

Base v1 应该是当前表格模型的一次小心抽离，而不是重新发明一个 spreadsheet engine。

## 背景动机

Space/Base 存储模型 RFC 已经提出：Eidos 应该让 `.base` 成为 Space 中的一等资产。本 RFC 回答下一个问题：

> `.base` 文件内部到底有什么，它和当前 Eidos 表格实现是什么关系？

Eidos 已经有一套能力不错的表格系统：

- schema 创建，
- rows，
- fields，
- field properties，
- views，
- links，
- lookups，
- formulas，
- file fields，
- table-level UI state，
- SQLite-backed data。

目标是保留这些投入，同时解除表格和当前 workspace database/tree 模型之间的意外耦合。

## 当前实现盘点

当前表格运行时主要分散在这些模块中：

- `packages/core/sdk/table.ts`
- `packages/core/sdk/schema.ts`
- `packages/core/sdk/rows.ts`
- `packages/core/meta-table/column.ts`
- `packages/core/meta-table/view.ts`
- `packages/core/meta-table/reference.ts`
- `packages/core/meta-table/tree/base.ts`
- `packages/core/fields/*`

当前重要数据模型是：

```txt
tb_<tableId>        用户 rows
eidos__columns      field metadata 和 field-to-column 映射
eidos__views        view 定义
eidos__references   lookup/link/formula 依赖元数据
eidos__tree         当前 table registry 和 workspace node tree
```

用户表当前使用这种形态：

```sql
CREATE TABLE tb_<tableId> (
  _id TEXT PRIMARY KEY NOT NULL,
  title TEXT NULL,
  _created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  _last_edited_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  _created_by TEXT DEFAULT 'unknown',
  _last_edited_by TEXT DEFAULT 'unknown',
  ...
);
```

这个形态在 Base v1 中应该继续有效。

## 设计目标

- 尽量复用当前 table/field/view runtime。
- 让 `.base` 文件可移植、可独立打开。
- 保持 `.base` 是合法 SQLite 文件。
- 将 Base canonical state 和 Space/workspace 私有状态分开。
- 避免依赖 workspace `eidos__tree` 作为 canonical table registry。
- 允许 graft 将 `.base` 作为 SQLite 数据库 diff，并展示 table-level changes。
- 尽可能把生成态 indexes 和 caches 排除在 canonical Base state 之外。

## 非目标

- 本 RFC 不定义完整的多人协作协议。
- 本 RFC 不要求 v1 支持跨 Base relations。
- 本 RFC 不要求把文档嵌入 Base。
- 本 RFC 不要求把所有现有 Eidos 功能都迁入 Base v1。
- 本 RFC 不要求 Base 以纯文本格式可读。

## 文件身份

Base 文件应该是扩展名为 `.base` 的普通 SQLite 数据库：

```txt
.base
```

示例：

```txt
tasks.base
research.base
crm.base
```

Eidos 应该通过两层方式识别 Base：

- SQLite 文件头，
- 数据库内部的 Base 元信息。

不能只依赖扩展名。

推荐 MIME type：

```txt
application/vnd.eidos.base+sqlite3
```

## 元信息表

每个 Base 文件必须包含：

```sql
CREATE TABLE IF NOT EXISTS eidos__meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

必需 keys：

```txt
format = "eidos-base"
format_version = "1"
app = "eidos"
created_at = "<iso timestamp>"
updated_at = "<iso timestamp>"
```

可选 keys：

```txt
title = "Tasks"
description = "..."
default_table_id = "<tableId>"
schema_version = "1"
```

`format_version` 定义文件格式版本。`schema_version` 可以描述 Eidos 当前内部表格 schema 的迁移版本。

## 表注册表

当前 Eidos 把 table identity 和显示名存放在 `eidos__tree` 中。对于可移植 Base 文件来说，这个模型太宽了，因为 `eidos__tree` 同时还承载 workspace documents、folders 和 node layout。

Base v1 应该引入 Base 专属 table registry：

```sql
CREATE TABLE IF NOT EXISTS eidos__tables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  raw_table_name TEXT NOT NULL UNIQUE,
  position REAL,
  icon TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

规则：

- `id` 是 table ID。
- `raw_table_name` 通常是 `tb_<id>`。
- `name` 是用户看到的 table name。
- `position` 控制 Base 内 table 排序。

兼容性：

- 迁移期间，Eidos 可以将 `eidos__tree` 中的 table nodes 映射到 `eidos__tables`。
- Base v1 不应该要求完整 `eidos__tree`。
- 如果为了兼容临时保留 `eidos__tree`，它应该被视为 derived 或 legacy compatibility state，而不是未来的 canonical registry。

## 用户数据表

每张 Base table 将 rows 存储在 SQLite 表中：

```txt
tb_<tableId>
```

必需 system columns：

```sql
_id TEXT PRIMARY KEY NOT NULL,
title TEXT NULL,
_created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
_last_edited_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
_created_by TEXT DEFAULT 'unknown',
_last_edited_by TEXT DEFAULT 'unknown'
```

规则：

- `_id` 继续作为稳定 row identity。
- Row ID 继续使用当前 UUID 风格的 ID。
- `title` 继续作为默认可读 row title。
- 用户创建的 fields 映射到真实 SQLite columns。
- 真实列名继续使用当前 SQLite-compatible column names。

这能保留当前 `RowsManager`、`TableClient` 和大部分 `SchemaClient`。

## 字段元数据

Base v1 应该保留当前 `eidos__columns` 模型，同时把 storage codec 和
materialization 显式表达出来：

```sql
CREATE TABLE IF NOT EXISTS eidos__columns (
  name TEXT,
  type TEXT,
  table_name TEXT,
  table_column_name TEXT,
  property TEXT,
  storage_codec TEXT DEFAULT 'scalar',
  value_kind TEXT DEFAULT 'source',
  is_hidden INTEGER DEFAULT 0,
  is_derived INTEGER DEFAULT 0,
  source_table_column_name TEXT,
  depends_on TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(table_name, table_column_name)
);
```

含义：

- `name` 是显示名。
- `type` 是 Eidos field type。
- `table_name` 是物理数据表，例如 `tb_<tableId>`。
- `table_column_name` 是物理 SQLite column name。
- `property` 是 JSON。
- `storage_codec` 描述真实 cell 编码，例如 `scalar`、`csv_ids`、
  `json_array`、`relation`、`materialized_text`。
- `value_kind` 描述 column 是 `source`、`relation`、`derived`、
  `materialized` 还是 `system`。
- `is_hidden` 标记 link display field 等 system/helper fields。
- `is_derived` 标记 formula、lookup 和其他可重算的值。
- `depends_on` 是可选 JSON dependency metadata，供 runtime 和 diff tools 使用。

兼容性：

- 旧的 `INSERT INTO eidos__columns (name, type, table_name,
table_column_name, property)` 仍然有效，因为新增字段都有默认值。
- 旧的 Base runtime 可以先忽略这些新增列。
- 新的 diff/runtime 应该利用这些字段隐藏 derived 噪音，并解释
  materialized updates。

Base v1 应该保留当前 field types：

```txt
title
text
number
checkbox
date
datetime
file
multi-select
rating
select
url
formula
link
lookup
created-time
created-by
last-edited-time
last-edited-by
```

`_id` 和 `title` 等 system fields 可以为了兼容继续在 `eidos__columns` 中有记录。

## 字段类型语义

### 基础字段

Primitive fields 保持当前 SQLite 映射：

```txt
checkbox -> BOOLEAN
number   -> REAL
rating   -> INT
default  -> TEXT
```

当前 field conversion layer 继续负责 raw SQLite values 和 UI values 之间的转换。

### Select 与 Multi-Select

Select 和 multi-select options 继续以 JSON 形式存放在 `eidos__columns.property` 中。

这可以保留现有 UI 和 property editor 模型。

Multi-select cell values 可以继续使用 `storage_codec = 'csv_ids'`，前提是
cell 中存的是稳定 option IDs，且这些 IDs 永远不包含逗号或换行。用户可见的
option names 可以包含逗号，因为 name 存在 field metadata 中，而不是 cell
value 中。如果未来某个字段要存任意用户文本列表，应使用 `json_array`，不要使用
`csv_ids`。

### Formula 字段

Formula fields 当前映射为 SQLite generated columns。

Base v1 可以保留这个行为，但需要更严格的要求：

- formula 经过 Eidos transformation 后必须是合法 SQLite expression，
- formula 只能引用同一个 Base 内的 fields，
- formula 不应该依赖 workspace-local functions，除非 Base runtime 明确声明，
- migration 在写入 Base 前应该校验 formula columns。

### Link 字段

Link fields 当前存储 linked row IDs，并维护 `<field>__title` 这类 helper title columns。

Base v1 规则：

- link targets 默认在同一个 Base 内，
- 跨 Base links 不进入 v1 范围，
- link field metadata 继续存在 `eidos__columns.property` 中，
- link cell values 可以继续使用 `storage_codec = 'csv_ids'` 存稳定的 linked
  row IDs，
- dependency metadata 可以继续放在 `eidos__references`，
- helper columns 可以作为实现细节保留，但应该被建模成 hidden materialized
  fields，而不是 accidental columns。

关键规则是：comma-separated values 只适合稳定内部 ID。linked titles 这类显示文本
不能依赖逗号 split，除非它们有明确的安全编码。

### Lookup 字段

Lookup fields 依赖 link fields 和 target fields。

Base v1 应该保留 `eidos__references` 来建模这些依赖：

```sql
CREATE TABLE IF NOT EXISTS eidos__references (
  self_table_name TEXT,
  self_table_column_name TEXT,
  ref_table_name TEXT,
  ref_table_column_name TEXT,
  link_table_name TEXT,
  link_table_column_name TEXT,
  self GENERATED ALWAYS AS (self_table_name || '.' || self_table_column_name) STORED,
  ref GENERATED ALWAYS AS (ref_table_name || '.' || ref_table_column_name) STORED,
  link GENERATED ALWAYS AS (link_table_name || '.' || link_table_column_name) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (
    self_table_name,
    self_table_column_name,
    ref_table_name,
    ref_table_column_name,
    link_table_name,
    link_table_column_name
  )
);
```

Lookup result columns 应该标记为 `value_kind = 'derived'` 且 `is_derived = 1`。
它们可以存 materialized text，因为这会让 grid rendering、sorting 和基于 SQLite
trigger 的更新更简单。Graft/UI diff 应该把这些 derived updates 折叠到 source
field changes 后面，而不是当成用户主动修改的同级变化。

### File 字段

File fields 当前存储文件路径字符串。

Base v1 应该继续让 file field value 保持为字符串，但需要定义路径规则：

- remote URLs 保持不变，
- data URLs 保持不变，
- 本地 Space 资源尽量使用 Space-relative paths，
- Eidos 托管附件可以使用 Space 配置的 managed assets folder，
- 机器本地 absolute paths 不适合作为可移植 Base 的默认值。

Base 文件不应该默默把任意文件复制进自身。

## 视图

Base v1 应该保留当前 `eidos__views` 模型：

```sql
CREATE TABLE IF NOT EXISTS eidos__views (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  table_id TEXT NOT NULL,
  query TEXT NOT NULL,
  properties TEXT,
  filter TEXT,
  order_map TEXT,
  hidden_fields TEXT,
  position REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

v1 支持的 view types：

```txt
grid
gallery
kanban
doc_list
ext__*
```

规则：

- `table_id` 指向 `eidos__tables.id`。
- `query` 作用域限定在同一个 Base 内的 tables。
- `properties`、`filter`、`order_map`、`hidden_fields` 继续是 JSON。
- Views 属于 table，而不是 Space 文件树。

## 附件与资源

Base v1 默认不应该把任意二进制 payload 嵌入 `.base` SQLite 文件。

推荐模型：

```txt
my-space/
  tasks.base
  assets/
    image.png
```

`tasks.base` 内的 file fields 存储引用：

```txt
assets/image.png
https://example.com/file.pdf
```

开放问题：Eidos 是否也应该支持 Base 专属 managed assets folder：

```txt
tasks.assets/
  image.png
```

默认应该优先使用普通 Space assets，因为它们容易检查，也容易被 graft 版本管理。

## 生成态状态

当前 Eidos runtime 可能创建这些生成态：

- FTS tables，
- FTS triggers，
- semantic indexes，
- embeddings，
- caches，
- UI session state。

Base v1 应该默认把这些视为非 canonical，除非明确声明。

推荐规则：

```txt
Canonical:
  eidos__meta
  eidos__tables
  eidos__columns
  eidos__views
  eidos__references
  tb_<tableId>

Generated/private:
  fts_*
  embedding caches
  search indexes
  runtime sessions
  temporary tables
```

Generated/private state 最好放在 `.eidos/indexes/`，或按需重建。如果为了兼容必须临时放在 Base 内，graft diff 应该知道如何把它们归类为 diagnostics 或 generated state。

## 运行时架构

Base v1 应该引入运行时边界：

```txt
Space runtime:
  打开 Space
  管理文件树
  管理 .eidos 私有状态
  管理 graft repo

Base runtime:
  打开一个 .base SQLite 文件
  管理 tables、fields、views、rows
  基于该 Base 暴露现有 table APIs
```

当前代码可以通过让 `DataSpaceWithTable`、`SchemaClient`、`TableManager` 参数化到一个 Base database connection 来适配。

重要边界：

- Workspace/Space state 不应该是 table CRUD 的必需条件。
- Table CRUD 不应该要求 `eidos__tree` 作为 workspace tree。
- Base 应该拥有自己的 table registry。

## API 方向

当前 APIs：

```ts
eidos.currentSpace.schema.createTable(...)
eidos.currentSpace.table(tableId)
```

目标 Base-aware APIs 可以逐步演化为：

```ts
const base = await eidos.currentSpace.openBase("tasks.base")
await base.schema.createTable(...)
const Tasks = base.table("...")
```

过渡期兼容层：

```ts
eidos.currentSpace.schema
```

可以操作一个默认 Base。

## Graft Diff 语义

Graft 看到 `.base` 是一个 SQLite 文件路径：

```txt
tasks.base
```

Eidos 应该将它展示为：

```txt
tasks.base
  Tasks table       +3 ~1
  Projects table    +1
  Views metadata    ~2
```

映射规则：

- `tb_<tableId>` 的变更是该 table 的 row/data changes，
- `eidos__columns` 的变更是 field/schema changes，
- `eidos__views` 的变更是 view changes，
- `eidos__references` 的变更是 relation/dependency changes，
- `eidos__tables` 的变更是 table registry changes，
- generated tables 归类为 diagnostics/generated state。

Graft 不应该需要 Eidos-specific path hardcoding。它应该检测 `.base` 是 SQLite，并利用 schema/table metadata 生成有意义的摘要。

## 从当前 Space 迁移

从当前 `.eidos/db.sqlite3` 迁移到 `.base` 应该先采用 export-based 策略。

对每张被选择的 table：

1. 复制 `tb_<tableId>`。
2. 复制匹配的 `eidos__columns` rows。
3. 复制匹配的 `eidos__views` rows。
4. 复制匹配的 `eidos__references` rows。
5. 从 `eidos__tree` 的 table nodes 创建 `eidos__tables` rows。
6. 校验 field properties、formula generated columns、link helper columns 和 lookup dependencies。
7. 必要时重写 file field paths。
8. 写入 `eidos__meta`。

Base export 不包含：

- `eidos__docs`，
- workspace folders，
- chat/message/session tables，
- cache/index tables，
- global settings，
- Space file tree。

## 兼容阶段

### Phase 1：Base Schema 写入器

创建空 `.base` 文件，包含：

- `eidos__meta`，
- `eidos__tables`，
- `eidos__columns`，
- `eidos__views`，
- `eidos__references`。

### Phase 2：打开已有 Base

打开 `.base` 文件，并将当前 table APIs 挂载到它上面。

### Phase 3：导出一张表

将现有 Eidos 的一张 table 导出为 `.base` 文件。

### Phase 4：Multi-Table Base

支持一个 Base 内的多张 tables、views、links、lookups 和 formulas。

### Phase 5：Graft Diff

在 Changes UI 中显示 `.base` path-level changes，并支持 table-level expansion。

### Phase 6：默认 Base Runtime

新的 file-based Eidos workspace 将表格创建到 `.base` 文件中，而不是隐藏的 `.eidos/db.sqlite3`。

## 开放问题

1. `eidos__tables` 是否应该立即替代 Base 内的 `eidos__tree`，还是 v1 保留兼容 `eidos__tree`？
2. Base 专属 assets 应该使用 `tasks.assets/` 这类 sibling folders，还是普通 Space `assets/`？
3. FTS 和 embeddings 应该存在 `.base` 内、sidecar `.eidos/indexes/`，还是按需重建？
4. `.base` 是否默认允许 extension-defined view types？
5. 跨 Base links 应该表示为 file path + row ID，还是完全推迟？
6. `created_by` / `last_edited_by` 在 local-only Bases 中是否有实际语义，还是仅作为可选 metadata？

## 推荐垂直切片

先构建这个最小切片：

```txt
sample-space/
  tasks.base
  assets/logo.png
  .eidos/
  .graft/
```

`tasks.base` 包含：

- `eidos__meta`，
- `eidos__tables`，
- `eidos__columns`，
- `eidos__views`，
- 一张 `tb_<tableId>` 数据表，
- 一个 grid view，
- 一个 select field，
- 一个引用 `assets/logo.png` 的 file field。

这个 slice 应该证明：

- Eidos 可以创建 `tasks.base`。
- Eidos 可以打开 `tasks.base`。
- 现有 grid table UI 可以编辑 rows。
- Graft status 将 `tasks.base` 显示为 changed file。
- 展开 `tasks.base` 可以看到 row/schema/view changes。
- 私有 `.eidos` 运行时状态不会作为用户变更出现。
