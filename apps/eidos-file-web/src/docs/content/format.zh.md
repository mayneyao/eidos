# Eidos File 文件格式 v1

`.eidos` 文件是一个 SQLite 3 数据库，其中包含少量元数据表，以及一个或多个用户数据表。本文定义公开、稳定的 Eidos File 格式 v1 契约。

## 文件标识

| 属性             | 值                              |
| ---------------- | ------------------------------- |
| 文件扩展名       | `.eidos`                        |
| SQLite 文件头    | `SQLite format 3\0`             |
| MIME type        | `application/vnd.eidos+sqlite3` |
| `format`         | `eidos-file`                    |
| `format_version` | `1`                             |
| `schema_version` | `1`                             |

读取方应同时检查 SQLite 文件头和 Eidos File 元数据。仅仅使用 `.eidos` 扩展名，并不能让普通 SQLite 数据库成为 Eidos File。

## 数据库布局

```text
project.eidos
├── eidos__meta
├── eidos__tables
├── eidos__columns
├── eidos__views
├── eidos__references
└── tb_<table_id>        一个或多个用户数据表
```

以 `eidos__` 开头的名称由 Eidos File 元数据保留。用户数据表必须登记在 `eidos__tables` 中；不要只扫描表名前缀来识别它们。

## 元数据表

### `eidos__meta`

保存文件级键值元数据。必需 key 包括 `format`、`format_version`、`app`、`created_at` 与 `updated_at`；常见可选 key 包括 `schema_version`、`title`、`description` 与 `default_table_id`。

### `eidos__tables`

登记每个逻辑数据表。`id` 是稳定标识，`name` 面向用户，`raw_table_name` 是 `tb_<id>` 形式的物理 SQLite 表名。重命名数据表不会改变其 ID 或物理表名。

### `eidos__columns`

描述系统字段、存储字段、关系字段与派生字段。关键列包括：

| 列                  | 含义                                                        |
| ------------------- | ----------------------------------------------------------- |
| `name`              | 用户看到的字段名称                                          |
| `type`              | 逻辑字段类型                                                |
| `table_name`        | 所属物理表                                                  |
| `table_column_name` | 稳定的列名或 projection 名称                                |
| `property`          | 类型专用 JSON object                                        |
| `storage_codec`     | `scalar`、`json_array`、`relation` 或 `materialized_text`   |
| `value_kind`        | `source`、`relation`、`derived`、`materialized` 或 `system` |
| `is_hidden`         | 默认隐藏状态                                                |
| `is_derived`        | 是否由 runtime 计算                                         |
| `depends_on`        | JSON 依赖描述                                               |

### `eidos__views`

保存视图状态。每个视图属于一个数据表，包含稳定 `id`、用户可见 `name`、开放的 `type`、结构化筛选与排序、字段顺序、隐藏字段和 renderer 专用 `properties`。

内置视图类型是 `grid`、`gallery` 与 `kanban`。其他字符串同样有效并应被无损保留，宿主可以为其注册自定义 renderer。

### `eidos__references`

保存连接相关字段的 schema 级引用。Relation cell 的实际值仍保存在用户数据表中。

## 用户数据表与记录 ID

每个用户数据表命名为 `tb_<table_id>`，并包含六个系统列：

```sql
CREATE TABLE "tb_<table_id>" (
  _id TEXT PRIMARY KEY NOT NULL,
  title TEXT NULL,
  _created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  _last_edited_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  _created_by TEXT DEFAULT 'unknown',
  _last_edited_by TEXT DEFAULT 'unknown'
);
```

Runtime 创建的 table ID 是移除连字符的 UUID，row ID 是标准 UUID 字符串。ID 不带 `table_`、`row_` 或 `view_` 业务前缀；请始终将 ID 视为不透明值。

Source 与 Relation 字段拥有物理列。Formula 和 Lookup 是 runtime projection，不创建物理列。

## 字段值编码

| 字段类型                         | SQLite 值                 | 示例                   |
| -------------------------------- | ------------------------- | ---------------------- |
| Text、title、URL、date、datetime | `TEXT`                    | `"Ship v1"`            |
| Number                           | 数值                      | `12.5`                 |
| Checkbox                         | 整数布尔值                | `0` 或 `1`             |
| Rating                           | 整数                      | `4`                    |
| Select                           | 直接 `TEXT` 值            | `"In progress"`        |
| Multi-select                     | JSON array 文本           | `["Backend","Urgent"]` |
| File                             | JSON array 文本           | `["assets/spec.pdf"]`  |
| Link                             | 目标 row ID 的 JSON array | `["019f…"]`            |
| Formula                          | 派生 projection           | 无物理列               |
| Lookup                           | 派生标量或 JSON array     | 无物理列               |

Select option 使用 `{ "value", "color" }`。Cell 直接保存用户看到的 value，不存在独立的 option ID/name 映射。

Multi-select、File 与 Link 使用合法 JSON array，不使用逗号拼接字符串。这样可以保留值内逗号、顺序，并保证解析无歧义。空的存储型 array 使用 SQL `NULL`；派生结果也可能返回空 JSON array，读取方应正确处理两者。

File 值保存引用，通常是相对于所在 Space 的规范化路径；Eidos File cell 不会嵌入附件二进制内容。

## Formula 与 Lookup

Formula 定义保存在字段元数据中，由 Eidos File runtime 编译为受约束的 SQLite 表达式。Lookup 沿 Link 字段读取目标字段，并应用 `first`、`values`、`count`、`sum`、`average`、`min` 或 `max` 聚合。

Lookup 可以继续指向另一个 Lookup。产生 array 的目标会在每层边界展开一层，并保留 Relation 顺序和元素顺序。循环依赖无效，最大 Lookup 嵌套深度为 32。

Formula 与 Lookup 在查询时派生，因此源数据变化后会立即得到新结果，无需维护第二份存储值。

## 视图

视图不拥有记录，只保存查询和呈现同一数据表的方式：

- renderer 类型；
- 筛选树与排序；
- 显示与隐藏字段；
- 字段顺序；
- Gallery 封面、Kanban 分组等 renderer 专用属性。

Renderer 不可用时，兼容读取方可以回退到 Grid；保存时仍应保留原始视图类型及其属性。

## 安全读写

你可以用 SQLite 工具直接检查 Eidos File 值。应用写入应优先使用 `@eidos.space/eidos-file`：它会验证标识符与元数据、规范化 JSON 值、保持关联元数据一致，并用事务处理多步骤操作。

其他工具若直接编辑存储记录，必须保持 `_id` 唯一并写入合法字段编码。Schema 修改应通过 runtime 完成，而不是直接执行 `ALTER TABLE`，因为物理列与 `eidos__columns` 共同构成公开契约。

## 相关指南

- [基于 Eidos File 构建](#/docs/build)
- [体验 Eidos File Web Editor](#/)
