# RFC：Eidos File 文件格式与运行时

状态：已被 Eidos File 1.0 取代
日期：2026-07-08
负责人：Eidos
相关文档：`eidos-file-storage.zh.md`

> 本文只作为设计与实现记录保留。规范性格式与 runtime 契约见
> [Eidos File 1.0](../specs/eidos-file-1.0.md)，中文说明见
> [Eidos File 1.0 中文参考译本](../specs/eidos-file-1.0.zh.md)。本文不能作为
> conformance claim 的依据。

## 实施状态（2026-07-14）

独立的 `@eidos.space/eidos-file` package 已经可以创建、打开、校验并迁移真实 `.eidos`
SQLite 文件，而且不依赖 Eidos core 或 `@libsql/client`。当前实现包含 v1 metadata、
table registry、field/view/reference schemas、primitive fields 和 row CRUD，并通过显式
SQLite connection boundary 隔离实现；`better-sqlite3` adapter 位于独立的可选入口。

desktop file Space 已经可以创建和打开 `.eidos`。初始 HTML table 已替换为 production
Glide DataEditor 上的 Eidos File adapter，恢复 keyboard navigation、rectangular selection、
copy/paste、fill handle、column reorder/resize，并支持创建 table/field 与持久化 Grid
order/width。table/field 现已支持 create、rename、delete；非模态字段 Property workspace
支持 source field 类型转换、逐项编辑 select/multi-select choices 和 Number 展示配置。
新建 Select/Multi-select 字段也复用同一个逐项 option editor，不再通过逗号文本生成 choices；
option IDs 在创建时即稳定，名称保持可包含逗号的独立 metadata。
新建 Number 字段同样复用 Property workspace 的 display editor，可直接配置 format、bar maximum/
color 和 label visibility。连续展示配置会基于最新本地 property snapshot 合并；option 或 Number
mutation 被拒绝时，UI 会恢复到最后持久化状态。
类型转换会在事务中重建必要的 SQLite column 并迁移 values，删除 choice 也会同步清理已有
cell 引用；结构删除会清理依赖 references 与 view layout metadata。Graft
row diff 也已贯通 working Changes 和历史 inspector。
字段创建现在与 legacy table Property editor 共享同一个通用 field-type picker：用 Basic/
Advanced 分类、稳定图标、简短说明、关键词搜索和受控键盘选择替代无结构的 type 下拉框。
过滤时 active command item 会重置到可见匹配项，因此 Enter 不会误选已经隐藏的旧类型。

view runtime 与 Desktop UI 现已支持多个 Grid views 的创建、重命名、复制、排序、
删除保护、切换，以及各自独立的 query/layout state。Gallery 和 Kanban metadata 会
保持可移植；实时 renderer 也已接入同一套持久化 query/layout lifecycle。

新建 file 字段使用 `json_array` storage codec，保存经过归一化的 Space 相对路径，
而不是私有数据库 payload ID；runtime 仍可读取旧的逗号/换行值。Desktop 恢复原表格
的多文件缩略图、重排和移除交互，并把新附件作为 `assets/` 下用户可见的普通文件导入。
因此 Graft 会通过正常路径同时版本化 Eidos File 引用和资源文件本身。

relation 字段现在以 JSON array 保存稳定的目标 row IDs，并分批补全显示标题；Grid
复用原表格的可搜索多记录 overlay，runtime 会阻止删除仍被引用的 table 或显示字段。
formula 字段不再是容易过期的 materialized text，而是实时、只读的 query projection：
独立 package 会解析 SQLite expression，解析 raw column 或 `prop("字段名")`，排序公式
依赖、拒绝循环，并让计算值参与正常的分页、筛选、排序、编辑刷新和 Graft row diff。
字段创建和公式编辑继续使用锚定的表格控制，不打开居中弹窗。新建与编辑现在共用原有
CodeMirror SQL completion 基础设施；草稿先在 renderer 中编译，再通过只读 Desktop
runtime 调用对最多三条真实 Eidos File rows 做预览。非法表达式和循环依赖会在 Save/Create
可用前显示，预览不会修改 field metadata 或 row values。

lookup/rollup 字段同样是实时、只读的 query projection。它们通过 relation 字段派生值，
支持 first value、all values、count、sum、average、minimum 和 maximum，不会创建容易过期的
物理列。lookup 结果和 stored fields 使用同一套分页、筛选、排序 source，也可以继续作为
formula 的依赖；runtime 会阻止删除其 relation field 或 target field。创建和修改继续复用
锚定字段控制。

Eidos File snapshot 现在只携带 row count，Grid 按可见区域请求并缓存 100-row pages；批量删行
使用 compact row ranges 在 runtime 内事务执行，不需要在 renderer 物化整表选择，并已用
10,000-row fixture 验证。Gallery 和 Kanban 复用同一个 random-access page boundary，维护有界的
双向 row window：相邻浏览扩展窗口，远距离虚拟滚动直接替换到目标 offset；如果并发变化导致尾页为空，
会收敛 total 而不是形成重复请求循环。`EidosFileRowPageOptions.totalHint` 允许相同 query 的后续分页复用
已经确定的 total；Desktop boundary 会先校验 hint，runtime 再用它跳过重复 `COUNT(*)`。首屏和 query
刷新不传 hint，Gallery 因而每个 query generation 只统计一次，Kanban 则复用 grouped-count query 的
分组 totals。Desktop 的分页和分组计数现在通过每个 Space 一个持久 query worker 执行，不再在
Electron 主线程同步打开并完整校验文件。每个 worker 最多保留 8 个 LRU Eidos File runtimes；文件未变化时
直接复用，device/inode、大小、mtime 或 ctime 改变时会关闭旧 runtime，并重新打开和校验当前文件。
因此 Graft 原子回退或其他文件替换会在下一页返回前失效旧连接。查询超时会终止被阻塞的 worker，
Space lifecycle 清理则会拒绝未完成请求并关闭全部缓存连接。
Gallery 的双向窗口最多保留 300 行，Kanban 每个已加载分组最多保留 150 行；两者都只渲染
有界虚拟窗口。百万记录/百万卡片的几何回归测试会约束 Chromium layout size 和 measurement
数量，Gallery 在 viewport 移动时自动加载下一页，不需要手动点击。复用的 query runtime 现在
还会缓存 table/field 只读 metadata；每次读取都会检查 SQLite `data_version`，所有 runtime 写入
也会主动失效缓存，因此同 runtime 和其他连接产生的 schema 变化都能正确刷新。在包含 10,000
行、80 个字段的 fixture 上，连续读取 100 个自然顺序 card pages 从每页 4 次读取降到 2.02 次，
耗时中位数从 1.79ms/页降到 1.60ms/页，同时不改变 cursor 和 sort 语义。
公开 runtime 也已增加
migration-oriented import boundary，支持
导入高级 field metadata、views、references、materialized derived values 和历史 system
columns；legacy migration package 通过该边界生成经过校验的 multi-table `main.eidos`。
runtime 还提供按字段聚合的 grouped-count query；Kanban 用一次只读查询获取当前 filter/search
下的所有分组计数，再仅为可见列请求 row pages，避免按 option 重复打开 Eidos File 文件。
Desktop Settings 已提供这些 legacy exports 的 preview、progress、validation issues、
export 和 open-new-Space UX。批量导入会复用 prepared statement，迁移读取使用 rowid
cursor；一个包含 1,110,847 行的真实 Space 约 15.1 秒完成导出并通过全部 Eidos File/count 校验。

CSV import 已通过独立 Eidos File package 的 Node/Desktop 子入口实现，不会进入 browser-safe
根入口。Desktop 原生文件选择器只向 renderer 返回有时效的 token，不暴露源文件路径；
锚定 mapping panel 会展示 sample rows、推断字段类型、重复/空 header 归一化结果和异常行
提示。plan 与 import 现在都在 worker thread 中使用 streaming parser，并对文件、行数、列数、
record 和 cell 大小设置边界。导入前后都会核对源文件 fingerprint，避免选择后被替换的文件
静默进入 Eidos File。导入会创建新 table，将第一列映射为 title field，允许保守的类型覆盖，使用
prepared statement 批量写入，并在同一事务中提交 table metadata 与 rows。大文件导入现在也有
完整的进度和取消 UX：文件选择立即返回有时效的 token，分析和写入分别作为可观测 worker
operation 运行，锚定 mapping panel 会显示真实 bytes/rows 进度。取消会等待 worker 终止和
SQLite transaction 回滚后才释放 Space operation lock，因此不会留下半张 table 或部分 rows；
100,000-row cancellation smoke 已覆盖该不变量。CSV 不会被完整缓存在 Electron main process。

CSV export 同样复用独立 package 的字段显示与 RFC 4180 record 编码，并由 Desktop worker 直接
读取 Eidos File runtime。导出请求携带当前 view 的结构化 query 与可见字段顺序；worker 在只读 transaction
中按 500 行分页，优先使用 runtime cursor，无法使用 cursor 的派生排序则安全回退 offset。输出先写
同目录唯一临时文件，包含 UTF-8 BOM、CRLF record delimiter、Select/Multi-select 显示名和 relation
显示标题；只有全部行写完后才替换 save picker 的目标。renderer 与 Electron main 均不缓存完整 CSV。
真实跨页测试覆盖 1,205 行源表、filter/sort、603 行结果、进度和最终文件内容。

打开 Eidos File 现在会把 metadata 视为不可信文件边界：runtime 在暴露数据前校验 registry 数量、
枚举值、JSON shape、物理存储列、view references 以及 formula/lookup definitions。公式始终从
canonical formula text 重新编译，不信任缓存的 SQL/dependencies；嵌套查询、过大的 AST 和未在
allowlist 中的 SQLite function 都会被拒绝。row write 也会在同一事务中确认目标行存在后，才更新
Eidos File metadata。

## 摘要

本 RFC 定义 Eidos File 文件的第一版实现形态。

Eidos File 文件是 Space 中用户可见的 `.eidos` 文件。它底层是 SQLite 数据库，并尽量复用当前 Eidos 的表格运行时：

- 命名为 `tb_<tableId>` 的用户数据表，
- 来自 `eidos__columns` 的字段元数据，
- 来自 `eidos__views` 的视图元数据，
- 来自 `eidos__references` 的字段依赖元数据，
- 现有 field types、view types、row IDs 和 system columns。

核心变化是所有权和打包方式：

> 表格不再隐藏在 workspace 的 `.eidos/db.sqlite3` 里，而是成为一个可移植 Eidos File 文件的一部分。

Eidos File v1 应该是当前表格模型的一次小心抽离，而不是重新发明一个 spreadsheet engine。

## 背景动机

Space/Eidos File 存储模型 RFC 已经提出：Eidos 应该让 `.eidos` 成为 Space 中的一等资产。本 RFC 回答下一个问题：

> `.eidos` 文件内部到底有什么，它和当前 Eidos 表格实现是什么关系？

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

这个形态在 Eidos File v1 中应该继续有效。

## 设计目标

- 尽量复用当前 table/field/view runtime。
- 让 `.eidos` 文件可移植、可独立打开。
- 保持 `.eidos` 是合法 SQLite 文件。
- 将 Eidos File canonical state 和 Space/workspace 私有状态分开。
- 避免依赖 workspace `eidos__tree` 作为 canonical table registry。
- 允许 graft 将 `.eidos` 作为 SQLite 数据库 diff，并展示 table-level changes。
- 尽可能把生成态 indexes 和 caches 排除在 canonical Eidos File state 之外。

## 非目标

- 本 RFC 不定义完整的多人协作协议。
- 本 RFC 不要求 v1 支持跨 Eidos File relations。
- 本 RFC 不要求把文档嵌入 Eidos File。
- 本 RFC 不要求把所有现有 Eidos 功能都迁入 Eidos File v1。
- 本 RFC 不要求 Eidos File 以纯文本格式可读。

## 文件身份

Eidos File 文件应该是扩展名为 `.eidos` 的普通 SQLite 数据库：

```txt
.eidos
```

示例：

```txt
tasks.eidos
research.eidos
crm.eidos
```

Eidos 应该通过两层方式识别 Eidos File：

- SQLite 文件头，
- 数据库内部的 Eidos File 元信息。

不能只依赖扩展名。

推荐 MIME type：

```txt
application/vnd.eidos+sqlite3
```

## 元信息表

每个 Eidos File 文件必须包含：

```sql
CREATE TABLE IF NOT EXISTS eidos__meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

必需 keys：

```txt
format = "eidos-file"
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

当前 Eidos 把 table identity 和显示名存放在 `eidos__tree` 中。对于可移植 Eidos File 文件来说，这个模型太宽了，因为 `eidos__tree` 同时还承载 workspace documents、folders 和 node layout。

Eidos File v1 应该引入 Eidos File 专属 table registry：

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
- `position` 控制 Eidos File 内 table 排序。

兼容性：

- 迁移期间，Eidos 可以将 `eidos__tree` 中的 table nodes 映射到 `eidos__tables`。
- Eidos File v1 不应该要求完整 `eidos__tree`。
- 如果为了兼容临时保留 `eidos__tree`，它应该被视为 derived 或 legacy compatibility state，而不是未来的 canonical registry。

## 用户数据表

每张 Eidos File table 将 rows 存储在 SQLite 表中：

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

Eidos File v1 应该保留当前 `eidos__columns` 模型，同时把 storage codec 和
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
- 旧的 Eidos File runtime 可以先忽略这些新增列。
- 新的 diff/runtime 应该利用这些字段隐藏 derived 噪音，并解释
  materialized updates。

Eidos File v1 应该保留当前 field types：

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

新建 Eidos File formula 以 metadata 保存，并作为有依赖顺序的只读 query projection 实时
计算。这样修改公式定义不需要重建物理 user table，也不会留下过期 materialized value；
迁移导入的旧 generated/materialized formula columns 仍保持兼容可读。

Eidos File v1 要求：

- formula 经过 Eidos transformation 后必须是合法 SQLite expression，
- formula 只能引用同一个 Eidos File 内的 fields，
- formula 不应该依赖 workspace-local functions，除非 Eidos File runtime 明确声明，
- 保存前必须校验依赖顺序和循环依赖，
- 筛选、排序与 row paging 必须使用同一个计算 projection，
- migration 应校验 formula definition，或明确保留 materialized legacy values。

### Link 字段

Link fields 保存稳定的 linked row IDs，并从目标 table 解析显示标题。

Eidos File v1 规则：

- link targets 默认在同一个 Eidos File 内，
- 跨 Eidos File links 不进入 v1 范围，
- link field metadata 继续存在 `eidos__columns.property` 中，
- 新 link cell values 使用 `storage_codec = 'relation'` 和 JSON array 保存稳定的
  linked row IDs；旧 CSV IDs 仍可读取，
- dependency metadata 可以继续放在 `eidos__references`，
- resolved titles 是临时 display data，不写成 accidental helper columns。

关键规则是：comma-separated values 只适合稳定内部 ID。linked titles 这类显示文本
不能依赖逗号 split，除非它们有明确的安全编码。

### Lookup 字段

Lookup fields 依赖 link fields 和 target fields。新建 Eidos File lookup 是
metadata-backed、只读的 query projection，而不是物化 user column。runtime 通过
relation IDs 查询目标 table，并支持 first value、all values、count、sum、average、
minimum 和 maximum。lookup values 必须与 stored fields 参与同一套分页、筛选和排序
查询，formula 也可以依赖 lookup。

Eidos File v1 应该保留 `eidos__references` 来建模这些依赖：

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

Eidos File v1 应该继续让 file field value 保持为字符串，但需要定义路径规则：

- remote URLs 保持不变，
- data URLs 保持不变，
- 本地 Space 资源尽量使用 Space-relative paths，
- Eidos 托管附件可以使用 Space 配置的 managed assets folder，
- 机器本地 absolute paths 不适合作为可移植 Eidos File 的默认值。

Eidos File 文件不应该默默把任意文件复制进自身。

## 视图

Eidos File v1 应该保留当前 `eidos__views` 模型：

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
```

未知 view metadata 可以为前向兼容继续保留，但 v1 不承诺提供 `doc_list` 或
extension-defined view types 的 renderer。

规则：

- `table_id` 指向 `eidos__tables.id`。
- `query` 作用域限定在同一个 Eidos File 内的 tables。
- `properties`、`filter`、`order_map`、`hidden_fields` 继续是 JSON。
- Views 属于 table，而不是 Space 文件树。

## 附件与资源

Eidos File v1 默认不应该把任意二进制 payload 嵌入 `.eidos` SQLite 文件。

推荐模型：

```txt
my-space/
  tasks.eidos
  assets/
    image.png
```

`tasks.eidos` 内的 file fields 存储引用：

```txt
assets/image.png
https://example.com/file.pdf
```

开放问题：Eidos 是否也应该支持 Eidos File 专属 managed assets folder：

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

Eidos File v1 应该默认把这些视为非 canonical，除非明确声明。

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

Generated/private state 最好放在 `.eidos/indexes/`，或按需重建。如果为了兼容必须临时放在 Eidos File 内，graft diff 应该知道如何把它们归类为 diagnostics 或 generated state。

## 运行时架构

Eidos File v1 应该引入运行时边界：

```txt
Space runtime:
  打开 Space
  管理文件树
  管理 .eidos 私有状态
  管理 graft repo

Eidos File runtime:
  打开一个 .eidos SQLite 文件
  管理 tables、fields、views、rows
  基于该 Eidos File 暴露现有 table APIs
```

当前代码可以通过让 `DataSpaceWithTable`、`SchemaClient`、`TableManager` 参数化到一个 Eidos File database connection 来适配。

重要边界：

- Workspace/Space state 不应该是 table CRUD 的必需条件。
- Table CRUD 不应该要求 `eidos__tree` 作为 workspace tree。
- Eidos File 应该拥有自己的 table registry。

## API 方向

当前 APIs：

```ts
eidos.currentSpace.schema.createTable(...)
eidos.currentSpace.table(tableId)
```

目标 Eidos File-aware APIs 可以逐步演化为：

```ts
const base = await eidos.currentSpace.openEidosFile("tasks.eidos")
await base.schema.createTable(...)
const Tasks = base.table("...")
```

过渡期兼容层：

```ts
eidos.currentSpace.schema
```

可以操作一个默认 Eidos File。

## Graft Diff 语义

Graft 看到 `.eidos` 是一个 SQLite 文件路径：

```txt
tasks.eidos
```

Eidos 应该将它展示为：

```txt
tasks.eidos
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

Graft 不应该需要 Eidos-specific path hardcoding。它应该检测 `.eidos` 是 SQLite，并利用 schema/table metadata 生成有意义的摘要。

## 从当前 Space 迁移

从当前 `.eidos/db.sqlite3` 迁移到 `.eidos` 应该先采用 export-based 策略。

对每张被选择的 table：

1. 复制 `tb_<tableId>`。
2. 复制匹配的 `eidos__columns` rows。
3. 复制匹配的 `eidos__views` rows。
4. 复制匹配的 `eidos__references` rows。
5. 从 `eidos__tree` 的 table nodes 创建 `eidos__tables` rows。
6. 校验 field properties、formula definitions/materialized compatibility values、relation IDs 和 lookup dependencies。
7. 必要时重写 file field paths。
8. 写入 `eidos__meta`。

Eidos File export 不包含：

- `eidos__docs`，
- workspace folders，
- chat/message/session tables，
- cache/index tables，
- global settings，
- Space file tree。

## 兼容阶段

### Phase 1：Eidos File Schema 写入器

创建空 `.eidos` 文件，包含：

- `eidos__meta`，
- `eidos__tables`，
- `eidos__columns`，
- `eidos__views`，
- `eidos__references`。

### Phase 2：打开已有 Eidos File

打开 `.eidos` 文件，并将当前 table APIs 挂载到它上面。

### Phase 3：导出一张表

将现有 Eidos 的一张 table 导出为 `.eidos` 文件。

### Phase 4：Multi-Table Eidos File

支持一个 Eidos File 内的多张 tables、views、links、lookups 和 formulas。

### Phase 5：Graft Diff

在 Changes UI 中显示 `.eidos` path-level changes，并支持 table-level expansion。

### Phase 6：默认 Eidos File Runtime

新的 file-based Eidos workspace 将表格创建到 `.eidos` 文件中，而不是隐藏的 `.eidos/db.sqlite3`。

## Eidos File v1 决策与延后问题

1. `eidos__tables` 是 Eidos File 的 canonical table registry；v1 不增加兼容 `eidos__tree`。
2. file field 默认使用普通 Space 相对 `assets/` 路径；Eidos File 专属 sibling assets folder 留待后续按需实现。
3. FTS、embeddings 和 search caches 都属于 generated state，不进入 canonical Eidos File contract；实现可以重建或使用私有 sidecar。
4. v1 保证 Grid、Gallery 和 Kanban renderer；extension-defined views 归入延后的 file-based extensions RFC。
5. 跨 Eidos File links 延后；v1 relation 只指向同一 Eidos File 内的 rows。
6. `created_by` / `last_edited_by` 保持为可选本地 metadata；没有 identity 时默认使用 `unknown`。

## 推荐垂直切片

先构建这个最小切片：

```txt
sample-space/
  tasks.eidos
  assets/logo.png
  .eidos/
  .graft/
```

`tasks.eidos` 包含：

- `eidos__meta`，
- `eidos__tables`，
- `eidos__columns`，
- `eidos__views`，
- 一张 `tb_<tableId>` 数据表，
- 一个 grid view，
- 一个 select field，
- 一个引用 `assets/logo.png` 的 file field。

这个 slice 应该证明：

- Eidos 可以创建 `tasks.eidos`。
- Eidos 可以打开 `tasks.eidos`。
- 现有 grid table UI 可以编辑 rows。
- Graft status 将 `tasks.eidos` 显示为 changed file。
- 展开 `tasks.eidos` 可以看到 row/schema/view changes。
- 私有 `.eidos` 运行时状态不会作为用户变更出现。
