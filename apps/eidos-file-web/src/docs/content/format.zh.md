# Eidos File 1.0 文件格式

Eidos File 是扩展名为 `.eidos` 的 SQLite 3 Application File。唯一规范文本是
[Eidos File 1.0](https://github.com/mayneyao/eidos/blob/main/docs/specs/eidos-file-1.0.md)，
中文参考译本位于同一规范目录。

## 文件身份

| 属性                         | 值                              |
| ---------------------------- | ------------------------------- |
| 扩展名                       | `.eidos`                        |
| Media type                   | `application/vnd.eidos+sqlite3` |
| SQLite header                | `SQLite format 3\0`             |
| `PRAGMA application_id`      | `0x45494453`（`EIDS`）          |
| `PRAGMA user_version`        | `1`                             |
| `eidos__meta.format_version` | `1.0`                           |

Reader 必须同时验证这些身份和唯一 `eidos__meta` 行。SQLite、API、JSON 与 CSV 中
所有持久 ID 都使用同一种 RFC 9562 UUIDv7 表示：小写、带连字符的 36-character
`TEXT COLLATE BINARY`。BLOB、大写、花括号、URN 与 32-character 形式都不是 canonical
ID。连接必须开启 `foreign_keys` 并关闭 `trusted_schema`。

## Canonical layout

```text
project.eidos
├── eidos__meta
├── eidos__features
├── eidos__tables
├── eidos__fields
├── eidos__relation_fields
├── eidos__formula_fields
├── eidos__lookup_fields
├── eidos__views
└── 用户命名的 STRICT, WITHOUT ROWID tables
```

`eidos__tables.name` 与 `eidos__fields.name` 是 display name，`physical_name`
是真实 SQLite identifier。新建或明确重命名时，中文、空格、标点和 SQL keyword
都直接作为带引号的物理名；SQLite identifier collision 和保留的系统 Field 名才追加
稳定 UUID suffix。Table display name 以 `sqlite_`、`eidos__` 或 `x__` 开头时，
使用已经冻结的可读 fallback `t__<前-8-ID-hex>__<display-name>`（碰撞时按规范
扩展），因此物理对象不会落入保留 namespace。
同一 Table 内 Field name 按 SQLite `NOCASE` 唯一。

## User table 与值

每张用户 Table 都是 `STRICT, WITHOUT ROWID`，并包含：

```sql
"_id"         TEXT COLLATE BINARY PRIMARY KEY CHECK(length("_id") = 36)
"_created_at" TEXT NOT NULL
"_updated_at" TEXT NOT NULL
```

hidden SQLite `rowid` 不是 Eidos identity。每张 Table 恰好一个 Record Label
Field，但规范不要求固定 `Title` 或 `Name` Field。

| Field            | Canonical stored value           |
| ---------------- | -------------------------------- |
| Text、URL        | `TEXT` 或 `NULL`                 |
| Number           | finite `REAL` 或 `NULL`          |
| Integer          | `INTEGER` 或 `NULL`              |
| date、datetime   | 规范化 `TEXT` 或 `NULL`          |
| Checkbox         | `0`、`1` 或 `NULL`               |
| Select           | option name `TEXT`               |
| Multi-select     | ordered unique JSON string array |
| File             | ordered JSON object array        |
| JSON             | canonical JSON text              |
| Forward Relation | ordered unique JSON UUID array   |

date 必须是准确的 `YYYY-MM-DD`。datetime 以及所有 `created_at` / `updated_at`
必须使用固定 UTC 形式 `YYYY-MM-DDTHH:MM:SS.sssZ`。API 与 CSV 输入若带时区偏移，
写入前必须归一化为 UTC；除非调用方明确要求有损转换，否则拒绝亚毫秒精度。
固定宽度字符串使用 SQLite `BINARY` 顺序，因此字节序就是时间顺序。

Option 没有 ID 或独立 value table。可选展示 catalog 位于 `settings_json`：
`{ "options": [{ "name", "color" }] }`。Catalog 外的 raw cell value 仍是有效数据。

File item 必须包含 canonical UUIDv7 `id`、非空 `name`、RFC 6838
`mediaType`、`uri`，以及使用非负 int64 十进制字符串表示的 `size`。未知成员必须
保留。相对 URI 从 Eidos File 所在目录解析，使用 `/`，不能是绝对路径，也不能通过
`..` 逃逸；同时允许 HTTPS URI。二进制内容不保存在 SQLite cell 中；资产存在性、
授权、传输、解析与垃圾回收属于 Adapter 职责。

## Relation、Formula 与 Lookup

forward Relation 是真实 JSON source column；subtype metadata 保存 target Table、
cardinality 与 `restrict` / `detach` / `preserve` delete policy。inverse Relation
是 virtual reverse projection，不保存 mirror column 或 global edge table。

Formula source 中 Field reference 始终使用当前准确 name 的双引号形式：

```sql
"Estimate" * 1.2
coalesce("Project budget", 0)
```

Field rename 解析 Formula，只重写 reference nodes，不修改 string literals。
Formula、Lookup 与 inverse Relation 都是 virtual；全文件 Field-ID dependency graph
必须无环，Runtime 只按请求的 transitive dependencies 做 set-based evaluation。

## Query 与写入

View `query_json` / `layout_json` 使用 Field ID。projection、filter、multi-sort、
keyset paging、group 与 statistics 共用同一套 live logical values，包括 Formula
和 Lookup。

每个 logical mutation 必须在一个 transaction 内校验 expected revision、更新
canonical state、验证 invariant，并令 `eidos__meta.revision` 恰好加一；失败时完整
rollback。

generated index、resolved label、compiled plan 与 cache 都是可丢弃的 Host-private
state，不能成为解释 `.eidos` 文件的必要条件。

## Feature negotiation 与 extension

Feature support 是大小写敏感的准确 `(name, version)` tuple；版本不隐含 SemVer
兼容。遇到不支持或无效的 required feature 时，Reader 和 Writer 都不能声称
canonical conformance。未知 optional state 必须按字节语义保留，否则 Writer 必须
拒绝写入。

第三方 object 与 feature 使用 `x__<vendor>__*` namespace，每个 extension object
都必须有匹配的 feature declaration。Extension 不能新增 `eidos__*` object，不能向
core 或 user table 添加 trigger，不能遮蔽用户 physical name，也不能重新解释 core
raw value。

## 相关指南

- [基于 Eidos File 构建](build.zh.md)
- [体验 Eidos File Web Editor](/)
- [Eidos File 1.0](https://github.com/mayneyao/eidos/blob/main/docs/specs/eidos-file-1.0.md)
- [Eidos Runtime 1.0](https://github.com/mayneyao/eidos/blob/main/docs/specs/eidos-runtime-1.0.md)
- [Eidos Adapter 1.0](https://github.com/mayneyao/eidos/blob/main/docs/specs/eidos-adapter-1.0.md)
- [Eidos UI 1.0](https://github.com/mayneyao/eidos/blob/main/docs/specs/eidos-ui-1.0.md)
