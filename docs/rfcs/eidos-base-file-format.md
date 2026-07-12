# RFC: Eidos Base File Format and Runtime

Status: Draft, implementation in progress
Date: 2026-07-08
Owner: Eidos
Related: `eidos-space-base-storage.md`

## Implementation Status (2026-07-12)

The standalone `@eidos.space/base` package now creates, opens, validates, and
migrates real `.base` SQLite files without depending on Eidos core or
`@libsql/client`. It implements the v1 metadata, table registry, field/view/
reference schemas, primitive fields, and row CRUD through an explicit SQLite
connection boundary. A `better-sqlite3` adapter is isolated in its own optional
entry point.

Desktop file Spaces can create and open `.base` files. The initial HTML table
has been replaced by a Base adapter over the production Glide DataEditor
interaction layer, restoring keyboard navigation, rectangular selection,
copy/paste, scoped undo/redo, fill handles, column reordering, column resizing,
field visibility, header actions, and the existing date/rating cells without
coupling the Base runtime to `@eidos.space/core`. Desktop initializes a hidden
temporary Base and atomically renames it into place, so interrupted creation
cannot publish a zero-byte canonical `.base`. Users can create, rename, and
delete tables and fields, edit select/multi-select choices, and persist grid
order/width/visibility state inside `eidos__views` in the Base file. Structural
deletes also clean dependent references and view layout metadata transactionally.
The view runtime and Desktop UI now cover creation, rename, duplication,
ordering, deletion protection, switching, and per-view query/layout state for
multiple Grid views. Gallery and Kanban metadata remain portable but their live
renderers are not part of this delivery slice.

New file fields use the `json_array` storage codec and store normalized
Space-relative paths rather than private database payload identifiers. The
runtime still reads legacy comma/newline values. Desktop restores the existing
multi-file thumbnail/reorder/remove behavior while importing new attachments
as ordinary visible files under `assets/`; Graft therefore versions the Base
reference and the asset itself through their normal paths.

Relation fields now store stable target row IDs as JSON arrays and hydrate
their display titles in bounded batches. The Grid reuses the original table's
searchable multi-record overlay, while the runtime protects referenced tables
and display fields from invalid deletion. Formula fields are live, readonly
query projections rather than stale materialized text: the standalone package
parses SQLite expressions, resolves raw columns or `prop("Field name")`, orders
formula dependencies, rejects cycles, and makes calculated values available to
normal paging, filtering, sorting, edits, and Graft row diffs. Field creation
and formula editing remain in anchored table controls rather than centered
dialogs.

Graft row diffs are preserved through the Desktop boundary and shown as compact
table/column/row changes in both the working Changes tab and historical version
inspector. Pure `updated_at` metadata noise and internal audit columns are
hidden in the UI, while structural changes remain tracked at the whole-file
level.

Base snapshots now carry row counts instead of capped row arrays. The Grid
requests 100-row pages around the visible region, caches loaded pages, and
passes compact row ranges to transactional batch deletion without materializing
an entire selection in the renderer. The runtime path is covered with a
10,000-row fixture. The public runtime now also exposes a migration-oriented
import boundary for advanced field metadata, views, references, materialized
derived values, and historical system columns. The legacy migration package
uses this boundary to produce validated multi-table `main.base` exports. CSV
import, lookup/rollup fields, and richer formula completion/preview remain.
Desktop Settings now
provides preview, progress, validation issues, export, and open-new-Space UX for
these legacy exports. Batched imports reuse prepared statements and migration
reads use a rowid cursor; a real 1,110,847-row export completed in about 15.1
seconds and passed all Base/count validation.

## Summary

This RFC defines the first implementation shape for Eidos Base files.

A Base file is a user-visible `.base` file in a Space. It is a SQLite database under the hood and reuses the current Eidos table runtime as much as possible:

- user data tables named `tb_<tableId>`,
- field metadata from `eidos__columns`,
- view metadata from `eidos__views`,
- field dependency metadata from `eidos__references`,
- existing field types, view types, row IDs, and system columns.

The main change is ownership and packaging:

> Tables stop being hidden inside the workspace `.eidos/db.sqlite3` and become part of a portable Base file.

Base v1 should be a small extraction of the existing table model, not a new spreadsheet engine.

## Motivation

The storage model RFC says that Eidos should make `.base` files first-class assets inside a Space. This RFC answers the next question:

> What exactly is inside a `.base` file, and how does it relate to the current Eidos table implementation?

Eidos already has a capable table system:

- schema creation,
- rows,
- fields,
- field properties,
- views,
- links,
- lookups,
- formulas,
- file fields,
- table-level UI state,
- SQLite-backed data.

The goal is to preserve that investment while removing the accidental coupling between tables and the current workspace database/tree model.

## Current Implementation Snapshot

The current table runtime is spread across these modules:

- `packages/core/sdk/table.ts`
- `packages/core/sdk/schema.ts`
- `packages/core/sdk/rows.ts`
- `packages/core/meta-table/column.ts`
- `packages/core/meta-table/view.ts`
- `packages/core/meta-table/reference.ts`
- `packages/core/meta-table/tree/base.ts`
- `packages/core/fields/*`

The important current data model is:

```txt
tb_<tableId>        user rows
eidos__columns      field metadata and field-to-column mapping
eidos__views        view definitions
eidos__references   lookup/link/formula dependency metadata
eidos__tree         current table registry and workspace node tree
```

User tables currently use this shape:

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

This shape should remain valid in Base v1.

## Design Goals

- Reuse the current table/field/view runtime with minimal rewrite.
- Make a `.base` file portable and independently openable.
- Keep `.base` valid SQLite.
- Keep Base canonical state separate from Space/workspace private state.
- Avoid depending on the workspace `eidos__tree` as the canonical table registry.
- Allow graft to diff `.base` as a SQLite database and show table-level changes.
- Keep generated indexes and caches out of canonical Base state when possible.

## Non-Goals

- This RFC does not define a full multi-user collaboration protocol.
- This RFC does not require cross-Base relations in v1.
- This RFC does not require embedding documents inside Base.
- This RFC does not require moving all existing Eidos features into Base v1.
- This RFC does not require Base to be readable as plain text.

## File Identity

A Base file should be a normal SQLite database with extension:

```txt
.base
```

Example:

```txt
tasks.base
research.base
crm.base
```

Eidos should identify a Base by both:

- SQLite file header,
- Base metadata inside the database.

Extension alone is not enough.

Recommended MIME type:

```txt
application/vnd.eidos.base+sqlite3
```

## Metadata Table

Every Base file must contain:

```sql
CREATE TABLE IF NOT EXISTS eidos__meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

Required keys:

```txt
format = "eidos-base"
format_version = "1"
app = "eidos"
created_at = "<iso timestamp>"
updated_at = "<iso timestamp>"
```

Optional keys:

```txt
title = "Tasks"
description = "..."
default_table_id = "<tableId>"
schema_version = "1"
```

`format_version` defines the file format. `schema_version` can describe Eidos' current internal table schema migration level.

## Table Registry

Current Eidos stores table identity and display name in `eidos__tree`. That is too broad for a portable Base file because `eidos__tree` also models workspace documents, folders, and node layout.

Base v1 should introduce a Base-specific table registry:

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

Rules:

- `id` is the table ID.
- `raw_table_name` is normally `tb_<id>`.
- `name` is the user-facing table name.
- `position` controls table ordering inside the Base.

Compatibility:

- During migration, Eidos can map table nodes from `eidos__tree` into `eidos__tables`.
- Base v1 should not require a full `eidos__tree`.
- If a compatibility `eidos__tree` is temporarily kept, it should be treated as derived or legacy compatibility state, not the future canonical registry.

## User Data Tables

Each Base table stores rows in a SQLite table:

```txt
tb_<tableId>
```

Required system columns:

```sql
_id TEXT PRIMARY KEY NOT NULL,
title TEXT NULL,
_created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
_last_edited_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
_created_by TEXT DEFAULT 'unknown',
_last_edited_by TEXT DEFAULT 'unknown'
```

Rules:

- `_id` remains the stable row identity.
- Row IDs should continue using the current UUID-style IDs.
- `title` remains the default human-readable row title.
- User-created fields map to physical SQLite columns.
- Physical columns should keep using existing SQLite-compatible column names.

This preserves the current `RowsManager`, `TableClient`, and much of `SchemaClient`.

## Field Metadata

Base v1 should keep the current `eidos__columns` model, while making storage
codec and materialization explicit:

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

Meaning:

- `name` is the display name.
- `type` is the Eidos field type.
- `table_name` is the physical data table, such as `tb_<tableId>`.
- `table_column_name` is the physical SQLite column name.
- `property` is JSON.
- `storage_codec` describes the physical cell encoding, such as `scalar`,
  `csv_ids`, `json_array`, `relation`, or `materialized_text`.
- `value_kind` describes whether the column is `source`, `relation`,
  `derived`, `materialized`, or `system`.
- `is_hidden` marks system/helper fields such as link display fields.
- `is_derived` marks formula, lookup, and other recomputable values.
- `depends_on` is optional JSON dependency metadata for runtime and diff tools.

Compatibility:

- Existing `INSERT INTO eidos__columns (name, type, table_name,
table_column_name, property)` calls remain valid because the new fields have
  defaults.
- Existing Base runtimes can ignore the new columns at first.
- New diff/runtime code should use them to suppress derived noise and explain
  materialized updates.

Base v1 should preserve current field types:

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

System fields such as `_id` and `title` may continue to have records in `eidos__columns` for compatibility.

## Field Type Semantics

### Primitive Fields

Primitive fields should keep their current SQLite mapping:

```txt
checkbox -> BOOLEAN
number   -> REAL
rating   -> INT
default  -> TEXT
```

The current field conversion layer remains responsible for translating between raw SQLite values and UI values.

### Select and Multi-Select

Select and multi-select options remain stored in `eidos__columns.property` as JSON.

This preserves the existing UI and property editor model.

Multi-select cell values may continue to use `storage_codec = 'csv_ids'` when
the stored values are stable option IDs that never contain commas or newlines.
User-facing option names may contain commas because names live in field metadata,
not in the cell value. If a future field stores arbitrary user text lists, it
should use `json_array` instead of `csv_ids`.

### Formula

New Base formula fields are stored as metadata and evaluated as ordered,
readonly query projections. This avoids stale materialized values and lets a
formula definition change without rebuilding the physical user table. Imported
legacy generated/materialized formula columns remain readable for compatibility.

Base v1 requirements:

- formulas must be valid SQLite expressions after Eidos transformation,
- formulas must only reference fields in the same Base,
- formulas should not depend on workspace-local functions unless declared by the Base runtime,
- dependency order and cycles must be validated before a formula is saved,
- filtering and sorting must use the same calculated projection as row paging,
- migration should validate formula definitions or preserve materialized legacy values explicitly.

### Link

Link fields store stable linked row IDs and resolve titles from the target table.

Base v1 rules:

- link targets are inside the same Base by default,
- cross-Base links are out of scope for v1,
- link field metadata remains in `eidos__columns.property`,
- new link cell values use `storage_codec = 'relation'` with a JSON array of
  stable linked row IDs; legacy CSV IDs remain readable,
- dependency metadata can remain in `eidos__references`,
- resolved titles are transient display data and are not written as accidental
  helper columns.

The important rule is that comma-separated values are only valid for stable
internal IDs. Display text such as linked titles should not rely on comma
splitting unless it is explicitly encoded.

### Lookup

Lookup fields depend on link fields and target fields.

Base v1 should keep `eidos__references` to model these dependencies:

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

Lookup result columns should be marked as `value_kind = 'derived'` and
`is_derived = 1`. They may store materialized text because it keeps grid
rendering, sorting, and SQLite-trigger-based updates simple. Graft/UI diff
should group or hide these derived updates behind the source field changes.

### File

File fields currently store file path strings.

Base v1 should keep file field values as strings, but define path rules:

- remote URLs remain unchanged,
- data URLs remain unchanged,
- local Space assets should use Space-relative paths when possible,
- Eidos-managed attachments may use a managed assets folder configured by the Space,
- absolute machine-local paths should be discouraged in portable Bases.

The Base file should not silently copy arbitrary files into itself.

## Views

Base v1 should keep the current `eidos__views` model:

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

Supported view types in v1:

```txt
grid
gallery
kanban
doc_list
ext__*
```

Rules:

- `table_id` points to `eidos__tables.id`.
- `query` is scoped to tables inside the same Base.
- `properties`, `filter`, `order_map`, and `hidden_fields` remain JSON.
- Views belong to a table, not to the Space file tree.

## Attachments and Assets

Base v1 should not embed arbitrary binary payloads inside the `.base` SQLite file by default.

Recommended model:

```txt
my-space/
  tasks.base
  assets/
    image.png
```

File fields inside `tasks.base` store references such as:

```txt
assets/image.png
https://example.com/file.pdf
```

Open question: whether Eidos should also support Base-specific managed asset folders:

```txt
tasks.assets/
  image.png
```

The default should favor normal Space assets because they are easy to inspect and version with graft.

## Generated State

The current Eidos runtime may create generated state such as:

- FTS tables,
- FTS triggers,
- semantic indexes,
- embeddings,
- caches,
- UI session state.

Base v1 should treat these as non-canonical unless explicitly declared otherwise.

Recommended rule:

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

Generated/private state should preferably live under `.eidos/indexes/` or be rebuilt on demand. If generated tables must live inside the Base temporarily for compatibility, graft diff should know how to classify them as diagnostics or generated state.

## Runtime Architecture

Base v1 should introduce a runtime boundary:

```txt
Space runtime:
  opens Space
  manages file tree
  manages .eidos private state
  manages graft repo

Base runtime:
  opens one .base SQLite file
  manages tables, fields, views, rows
  exposes existing table APIs against that Base
```

Current code can be adapted by parameterizing `DataSpaceWithTable`/`SchemaClient`/`TableManager` around a Base database connection.

Important separation:

- Workspace/Space state should not be required for table CRUD.
- Table CRUD should not require `eidos__tree` as the workspace tree.
- Base should have its own table registry.

## API Direction

Current APIs:

```ts
eidos.currentSpace.schema.createTable(...)
eidos.currentSpace.table(tableId)
```

Target Base-aware APIs can evolve toward:

```ts
const base = await eidos.currentSpace.openBase("tasks.base")
await base.schema.createTable(...)
const Tasks = base.table("...")
```

Compatibility layer:

```ts
eidos.currentSpace.schema
```

may operate on a default Base during transition.

## Graft Diff Semantics

Graft sees `.base` as a SQLite file path:

```txt
tasks.base
```

Eidos should present it as:

```txt
tasks.base
  Tasks table       +3 ~1
  Projects table    +1
  Views metadata    ~2
```

Mapping rules:

- changes in `tb_<tableId>` are row/data changes for that table,
- changes in `eidos__columns` are field/schema changes,
- changes in `eidos__views` are view changes,
- changes in `eidos__references` are relation/dependency changes,
- changes in `eidos__tables` are table registry changes,
- generated tables are grouped as diagnostics/generated state.

Graft should not need Eidos-specific path hardcoding. It should detect `.base` as SQLite and use schema/table metadata to produce meaningful summaries.

## Migration From Current Spaces

Migration from current `.eidos/db.sqlite3` to `.base` should be export-based first.

For each selected table:

1. Copy `tb_<tableId>`.
2. Copy matching `eidos__columns` rows.
3. Copy matching `eidos__views` rows.
4. Copy matching `eidos__references` rows.
5. Create `eidos__tables` rows from table nodes in `eidos__tree`.
6. Validate field properties, formula definitions/materialized compatibility values, relation IDs, and lookup dependencies.
7. Rewrite file field paths if needed.
8. Write `eidos__meta`.

Out of scope for Base export:

- `eidos__docs`,
- workspace folders,
- chat/message/session tables,
- cache/index tables,
- global settings,
- Space file tree.

## Compatibility Phases

### Phase 1: Base Schema Writer

Create empty `.base` files with:

- `eidos__meta`,
- `eidos__tables`,
- `eidos__columns`,
- `eidos__views`,
- `eidos__references`.

### Phase 2: Open Existing Base

Open a `.base` file and mount current table APIs against it.

### Phase 3: Export One Table

Export one existing Eidos table into a `.base` file.

### Phase 4: Multi-Table Base

Support multiple tables, views, links, lookups, and formulas inside a single Base.

### Phase 5: Graft Diff

Show `.base` path-level changes and table-level expansion in Changes UI.

### Phase 6: Default Base Runtime

New file-based Eidos workspaces create tables in `.base` files instead of hidden `.eidos/db.sqlite3`.

## Open Questions

1. Should `eidos__tables` replace `eidos__tree` immediately inside Base, or should v1 keep a compatibility `eidos__tree`?
2. Should Base-specific assets use sibling folders such as `tasks.assets/`, or normal Space assets such as `assets/`?
3. Should FTS and embeddings live inside `.base`, sidecar `.eidos/indexes/`, or be rebuilt on demand?
4. Should `.base` allow extension-defined view types by default?
5. Should cross-Base links be represented as file-path plus row ID, or deferred entirely?
6. Should `created_by`/`last_edited_by` be meaningful in local-only Bases, or treated as optional metadata?

## Recommended Vertical Slice

Build this first:

```txt
sample-space/
  tasks.base
  assets/logo.png
  .eidos/
  .graft/
```

`tasks.base` contains:

- `eidos__meta`,
- `eidos__tables`,
- `eidos__columns`,
- `eidos__views`,
- one `tb_<tableId>` data table,
- one grid view,
- one select field,
- one file field referencing `assets/logo.png`.

The slice should prove:

- Eidos can create `tasks.base`.
- Eidos can open `tasks.base`.
- Existing grid table UI can edit rows.
- Graft status shows `tasks.base` as a changed file.
- Expanding `tasks.base` shows row/schema/view changes.
- private `.eidos` runtime state does not appear as user changes.
