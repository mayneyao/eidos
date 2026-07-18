# Eidos File format v1

A `.eidos` file is a SQLite 3 database with a small set of metadata tables and one or more user tables. This page defines the public Eidos File format v1 contract.

## File identity

| Property         | Value                           |
| ---------------- | ------------------------------- |
| File extension   | `.eidos`                        |
| SQLite header    | `SQLite format 3\0`             |
| MIME type        | `application/vnd.eidos+sqlite3` |
| `format`         | `eidos-file`                    |
| `format_version` | `1`                             |
| `schema_version` | `1`                             |

Consumers should check both the SQLite header and Eidos File metadata. A SQLite database is not an Eidos File merely because it uses the `.eidos` extension.

## Database layout

```text
project.eidos
├── eidos__meta
├── eidos__tables
├── eidos__columns
├── eidos__views
├── eidos__references
└── tb_<table_id>        one or more user tables
```

Names beginning with `eidos__` are reserved for Eidos File metadata. User tables are registered in `eidos__tables`; do not discover them by scanning table-name prefixes alone.

## Metadata tables

### `eidos__meta`

Stores file-level key/value metadata. Required keys are `format`, `format_version`, `app`, `created_at`, and `updated_at`. Common optional keys include `schema_version`, `title`, `description`, and `default_table_id`.

### `eidos__tables`

Registers each logical table. `id` is stable, `name` is user-facing, and `raw_table_name` is the physical SQLite name `tb_<id>`. Renaming a table does not change its ID or physical table name.

### `eidos__columns`

Describes every system, stored, relation, and derived field. Important columns are:

| Column              | Meaning                                                      |
| ------------------- | ------------------------------------------------------------ |
| `name`              | User-facing field name                                       |
| `type`              | Logical field type                                           |
| `table_name`        | Owning physical table                                        |
| `table_column_name` | Stable column or projection name                             |
| `property`          | Type-specific JSON object                                    |
| `storage_codec`     | `scalar`, `json_array`, `relation`, or `materialized_text`   |
| `value_kind`        | `source`, `relation`, `derived`, `materialized`, or `system` |
| `is_hidden`         | Default visibility flag                                      |
| `is_derived`        | Whether the runtime computes the value                       |
| `depends_on`        | JSON dependency description                                  |

### `eidos__views`

Stores saved view state. Each view belongs to a table and has a stable `id`, user-facing `name`, open-ended `type`, structured filter and sort state, field order, hidden fields, and renderer-specific `properties`.

The built-in view types are `grid`, `gallery`, and `kanban`. Other strings are valid and remain round-trippable so a host can register a custom renderer.

### `eidos__references`

Stores schema-level field references used to connect related fields. Relation cell values themselves remain in the user table.

## User tables and row identity

Every user table is named `tb_<table_id>` and begins with six system columns:

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

Runtime-created table IDs are UUIDs without hyphens. Runtime-created row IDs are standard UUID strings. IDs have no `table_`, `row_`, or `view_` business prefix; treat every ID as opaque.

Stored source and relation fields have physical columns. Formula and Lookup fields are runtime projections and do not create physical columns.

## Field value encodings

| Field type                       | SQLite value                 | Example                |
| -------------------------------- | ---------------------------- | ---------------------- |
| Text, title, URL, date, datetime | `TEXT`                       | `"Ship v1"`            |
| Number                           | numeric                      | `12.5`                 |
| Checkbox                         | integer boolean              | `0` or `1`             |
| Rating                           | integer                      | `4`                    |
| Select                           | direct `TEXT` value          | `"In progress"`        |
| Multi-select                     | JSON array text              | `["Backend","Urgent"]` |
| File                             | JSON array text              | `["assets/spec.pdf"]`  |
| Link                             | JSON array of target row IDs | `["019f…"]`            |
| Formula                          | derived projection           | no physical column     |
| Lookup                           | derived scalar or JSON array | no physical column     |

Select options use `{ "value", "color" }`. The cell stores the same value shown to the user; there is no separate option ID/name mapping.

Multi-select, File, and Link use valid JSON arrays rather than comma-separated strings. This preserves commas inside values, ordering, and unambiguous parsing. Empty stored arrays are represented as SQL `NULL`; readers should also accept an empty JSON array where one is produced by a derived result.

File values are references, usually normalized paths relative to the surrounding Space. An Eidos File does not embed attachment bytes in the cell.

## Formula and Lookup

Formula definitions live in field metadata and are compiled into safe SQLite expressions by the Eidos File runtime. Lookup traverses a Link field, reads a target field, and applies one of these aggregates: `first`, `values`, `count`, `sum`, `average`, `min`, or `max`.

Lookup can target another Lookup. Array-producing targets are flattened one level at each boundary, preserving relation order and element order. Cycles are invalid, and the maximum Lookup nesting depth is 32.

Because Formula and Lookup values are derived at query time, changing source data immediately changes their result without maintaining a second stored copy.

## Saved views

A view does not own records. It stores how a table should be queried and presented:

- renderer type;
- filter tree and sort order;
- visible and hidden fields;
- field order;
- renderer-specific properties such as Gallery cover fields or Kanban grouping.

A compatible reader may fall back to Grid when a renderer is unavailable, but it should preserve the original view type and properties when saving.

## Reading and writing safely

SQLite tools can inspect Eidos File values directly. For application writes, prefer `@eidos.space/eidos-file`: it validates identifiers and metadata, normalizes JSON values, keeps related metadata consistent, and wraps multi-step operations in transactions.

If another tool edits stored rows directly, it must preserve `_id` uniqueness and valid field encodings. Schema edits should go through the runtime rather than raw `ALTER TABLE`, because physical columns and `eidos__columns` form one public contract.

## Related guides

- [Build with Eidos File](build.en.md)
- [Try the Eidos File Web Editor](/)
