# RFC: Eidos File File Format and Runtime

Status: Eidos File v1 accepted
Date: 2026-07-08
Owner: Eidos
Related: `eidos-file-storage.md`

## Implementation Status (2026-07-14)

The standalone `@eidos.space/eidos-file` package now creates, opens, validates, and
migrates real `.eidos` SQLite files without depending on Eidos core or
`@libsql/client`. It implements the v1 metadata, table registry, field/view/
reference schemas, primitive fields, and row CRUD through an explicit SQLite
connection boundary. A `better-sqlite3` adapter is isolated in its own optional
entry point.

Desktop file Spaces can create and open `.eidos` files. The initial HTML table
has been replaced by an Eidos File adapter over the production Glide DataEditor
interaction layer, restoring keyboard navigation, rectangular selection,
copy/paste, scoped undo/redo, fill handles, column reordering, column resizing,
field visibility, header actions, and the existing date/rating cells without
coupling the Eidos File runtime to `@eidos.space/core`. Desktop initializes a hidden
temporary Eidos File and atomically renames it into place, so interrupted creation
cannot publish a zero-byte canonical `.eidos`. Users can create, rename, and
delete tables and fields. A non-modal field Property workspace supports source
field type conversion, per-item select/multi-select choice editing, and Number
presentation. Creating Select/Multi-select fields reuses the same per-item
option editor instead of generating choices from comma text; option IDs are
stable from creation and names remain independent metadata that may contain
commas. Creating Number fields also reuses the Property workspace's display
editor, including format, bar maximum/color, and label visibility. Consecutive
display edits merge against the latest local property snapshot, while rejected
option or Number mutations restore the last persisted UI state. Type conversion
transactionally rebuilds the SQLite column when needed and migrates values,
while deleting a choice also cleans stored cell
references. Grid order/width/visibility state persists inside `eidos__views` in
the Eidos File. Structural deletes also clean dependent references and view layout
metadata transactionally.
Field creation now uses the same generic field-type picker as the legacy table
Property editor: Basic/Advanced grouping, stable icons, concise descriptions,
keyword search, and controlled keyboard selection replace the unstructured type
dropdown. Filtering resets the active command item to a visible match, so Enter
cannot select a stale hidden type.
The view runtime and Desktop UI now cover creation, rename, duplication,
ordering, deletion protection, switching, and per-view query/layout state for
multiple Grid views. Gallery and Kanban are also live, portable renderers backed
by the same persisted query/layout lifecycle.

New file fields use the `json_array` storage codec and store normalized
Space-relative paths rather than private database payload identifiers. The
runtime still reads legacy comma/newline values. Desktop restores the existing
multi-file thumbnail/reorder/remove behavior while importing new attachments
as ordinary visible files under `assets/`; Graft therefore versions the Eidos File
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
dialogs. Both creation and editing now share the existing CodeMirror SQL
completion infrastructure. Drafts are compiled locally and then previewed
against up to three real Eidos File rows through a read-only Desktop runtime call;
invalid expressions and circular dependencies are shown before Save/Create is
enabled, and previewing never changes field metadata or row values.

Lookup and rollup fields are also live, readonly query projections. They derive
values through a relation field and support first value, all values, count,
sum, average, minimum, and maximum aggregation without adding stale physical
columns. Lookup results use the same paging/filtering/sorting source as stored
fields, can feed formula fields, and protect their relation and target fields
from invalid deletion. Creation and editing reuse anchored field controls.

Graft row diffs are preserved through the Desktop boundary and shown as compact
table/column/row changes in both the working Changes tab and historical version
inspector. Pure `updated_at` metadata noise and internal audit columns are
hidden in the UI, while structural changes remain tracked at the whole-file
level.

Eidos File snapshots now carry row counts instead of capped row arrays. The Grid
requests 100-row pages around the visible region, caches loaded pages, and
passes compact row ranges to transactional batch deletion without materializing
an entire selection in the renderer. The runtime path is covered with a
10,000-row fixture. Gallery and Kanban use the same random-access page boundary
to maintain bounded bidirectional row windows: adjacent navigation extends the
window, distant virtual-scroll jumps replace it at the requested offset, and an
empty stale tail response clamps the total instead of creating a retry loop.
`EidosFileRowPageOptions.totalHint` lets a caller reuse a total already established
for the identical query. The Desktop boundary validates the hint before the
runtime substitutes it for a repeated `COUNT(*)`; the first page and every
query refresh omit it. Gallery therefore counts once per query generation, and
Kanban page reads reuse the totals from its grouped-count query.
Desktop page and grouped-count reads now run through one persistent query
worker per Space instead of synchronously opening and validating the file on
the Electron main thread. Each worker retains at most eight LRU Eidos File runtimes;
unchanged files reuse their runtime, while device/inode, size, mtime, or ctime
changes close the stale runtime and reopen and validate the current file. This
also detects an atomic Graft restore or other file replacement before serving
the next page. Query timeouts terminate the blocked worker, and Space lifecycle
cleanup rejects outstanding requests and closes every cached connection.
Gallery keeps at most 300 rows in its bidirectional window and Kanban keeps at
most 150 rows per loaded group. Both render only bounded virtual windows;
million-record and million-card geometry tests keep Chromium layout sizes and
measurement counts bounded, while Gallery loads pages automatically as the
viewport moves. Reused query runtimes now also cache table/field read metadata.
Every read checks SQLite `data_version`, and all runtime writes invalidate the
cache, so both same-runtime and cross-connection schema changes remain visible.
On a 10,000-row, 80-field fixture, 100 contiguous natural-order card pages
dropped from 4 reads per page to 2.02 and from a 1.79 ms median to 1.60 ms per
page without changing cursor or sort semantics.
The public runtime now also exposes a migration-oriented
import boundary for advanced field metadata, views, references, materialized
derived values, and historical system columns. The legacy migration package
uses this boundary to produce validated multi-table `main.eidos` exports.
The runtime also exposes a grouped-count query by field. Kanban uses one
readonly query to obtain all group totals under the active filter/search, then
requests row pages only for visible columns instead of reopening the Eidos File once
per option.
Desktop Settings now
provides preview, progress, validation issues, export, and open-new-Space UX for
these legacy exports. Batched imports reuse prepared statements and migration
reads use a rowid cursor; a real 1,110,847-row export completed in about 15.1
seconds and passed all Eidos File/count validation.

CSV import is now implemented through the standalone Eidos File package's dedicated
Node/Desktop entry rather than the browser-safe root entry. The Desktop native
picker returns an expiring token instead of exposing the source path to the
renderer. An anchored mapping panel previews sample rows, inferred field types,
duplicate/blank header normalization, and malformed-row issues. Planning and
import run in a worker thread over a streaming parser with bounded file, row,
column, record, and cell sizes. The source fingerprint is checked before and
after import so replacing the selected file cannot silently import different
content. Import creates a new table, maps the first column to its title field,
allows conservative type overrides, batches prepared inserts, and commits table
metadata and rows in one transaction. Large imports now have complete progress
and cancellation UX: file selection returns an expiring token immediately,
analysis and writing run as separately observable worker operations, and the
anchored mapping panel reports real byte/row progress. Cancellation waits for
worker termination and SQLite transaction rollback before releasing the Space
operation lock, so it cannot leave a partial table or rows; a 100,000-row
cancellation smoke covers this invariant. The selected CSV is never buffered
in Electron's main process.

Opening an Eidos File now treats metadata as an untrusted file boundary. Validation
checks registry sizes, enum values, JSON shapes, stored-column existence, view
references, and formula/lookup definitions before exposing the runtime.
Formula execution always recompiles the canonical formula text, ignores cached
SQL/dependency metadata, rejects nested queries and excessive ASTs, and permits
only an explicit set of deterministic SQLite helpers. Row writes update Eidos File
metadata only after the target row is known to exist, in the same transaction.

## Summary

This RFC defines the Eidos File format and runtime boundary.

An Eidos File is a user-visible `.eidos` file in a Space. It is a SQLite database under the hood and reuses the current Eidos table runtime as much as possible:

- user data tables named `tb_<tableId>`,
- field metadata from `eidos__columns`,
- view metadata from `eidos__views`,
- field dependency metadata from `eidos__references`,
- existing field types, view types, row IDs, and system columns.

The main change is ownership and packaging:

> Tables stop being hidden inside the workspace `.eidos/db.sqlite3` and become part of a portable Eidos File.

Eidos File v1 should be a small extraction of the existing table model, not a new spreadsheet engine.

## Motivation

The storage model RFC says that Eidos should make `.eidos` files first-class assets inside a Space. This RFC answers the next question:

> What exactly is inside a `.eidos` file, and how does it relate to the current Eidos table implementation?

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

This shape should remain valid in Eidos File v1.

## Design Goals

- Reuse the current table/field/view runtime with minimal rewrite.
- Make a `.eidos` file portable and independently openable.
- Keep `.eidos` valid SQLite.
- Keep Eidos File canonical state separate from Space/workspace private state.
- Avoid depending on the workspace `eidos__tree` as the canonical table registry.
- Allow graft to diff `.eidos` as a SQLite database and show table-level changes.
- Keep generated indexes and caches out of canonical Eidos File state when possible.

## Non-Goals

- This RFC does not define a full multi-user collaboration protocol.
- This RFC does not require cross-Eidos File relations in v1.
- This RFC does not require embedding documents inside Eidos File.
- This RFC does not require moving all existing Eidos features into Eidos File v1.
- This RFC does not require Eidos File to be readable as plain text.

## File Identity

An Eidos File should be a normal SQLite database with extension:

```txt
.eidos
```

Example:

```txt
tasks.eidos
research.eidos
crm.eidos
```

Eidos should identify an Eidos File by both:

- SQLite file header,
- Eidos File metadata inside the database.

Extension alone is not enough.

Recommended MIME type:

```txt
application/vnd.eidos+sqlite3
```

## Metadata Table

Every Eidos File must contain:

```sql
CREATE TABLE IF NOT EXISTS eidos__meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

Required keys:

```txt
format = "eidos-file"
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

Current Eidos stores table identity and display name in `eidos__tree`. That is too broad for a portable Eidos File because `eidos__tree` also models workspace documents, folders, and node layout.

Eidos File v1 should introduce an Eidos File-specific table registry:

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
- `position` controls table ordering inside the Eidos File.

Compatibility:

- During migration, Eidos can map table nodes from `eidos__tree` into `eidos__tables`.
- Eidos File v1 should not require a full `eidos__tree`.
- If a compatibility `eidos__tree` is temporarily kept, it should be treated as derived or legacy compatibility state, not the future canonical registry.

## User Data Tables

Each Eidos File table stores rows in a SQLite table:

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

Eidos File v1 should keep the current `eidos__columns` model, while making storage
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
- Existing Eidos File runtimes can ignore the new columns at first.
- New diff/runtime code should use them to suppress derived noise and explain
  materialized updates.

Eidos File v1 should preserve current field types:

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

New Eidos File formula fields are stored as metadata and evaluated as ordered,
readonly query projections. This avoids stale materialized values and lets a
formula definition change without rebuilding the physical user table. Imported
legacy generated/materialized formula columns remain readable for compatibility.

Eidos File v1 requirements:

- formulas must be valid SQLite expressions after Eidos transformation,
- formulas must only reference fields in the same Eidos File,
- formulas should not depend on workspace-local functions unless declared by the Eidos File runtime,
- dependency order and cycles must be validated before a formula is saved,
- filtering and sorting must use the same calculated projection as row paging,
- migration should validate formula definitions or preserve materialized legacy values explicitly.

### Link

Link fields store stable linked row IDs and resolve titles from the target table.

Eidos File v1 rules:

- link targets are inside the same Eidos File by default,
- cross-Eidos File links are out of scope for v1,
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

Lookup fields depend on link fields and target fields. New Eidos File lookup fields
are metadata-backed, readonly query projections rather than materialized user
columns. The runtime resolves relation IDs against the target table and
supports first value, all values, count, sum, average, minimum, and maximum
aggregation. Lookup values participate in the same paging, filtering, and
sorting query as stored fields, and formulas may depend on them.

Eidos File v1 should keep `eidos__references` to model these dependencies:

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

Eidos File v1 should keep file field values as strings, but define path rules:

- remote URLs remain unchanged,
- data URLs remain unchanged,
- local Space assets should use Space-relative paths when possible,
- Eidos-managed attachments may use a managed assets folder configured by the Space,
- absolute machine-local paths should be discouraged in portable Bases.

The Eidos File should not silently copy arbitrary files into itself.

## Views

Eidos File v1 should keep the current `eidos__views` model:

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
```

Unknown view metadata may be retained for forward compatibility, but v1 does
not promise a renderer for `doc_list` or extension-defined view types.

Rules:

- `table_id` points to `eidos__tables.id`.
- `query` is scoped to tables inside the same Eidos File.
- `properties`, `filter`, `order_map`, and `hidden_fields` remain JSON.
- Views belong to a table, not to the Space file tree.

## Attachments and Assets

Eidos File v1 should not embed arbitrary binary payloads inside the `.eidos` SQLite file by default.

Recommended model:

```txt
my-space/
  tasks.eidos
  assets/
    image.png
```

File fields inside `tasks.eidos` store references such as:

```txt
assets/image.png
https://example.com/file.pdf
```

Open question: whether Eidos should also support Eidos File-specific managed asset folders:

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

Eidos File v1 should treat these as non-canonical unless explicitly declared otherwise.

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

Generated/private state should preferably live under `.eidos/indexes/` or be rebuilt on demand. If generated tables must live inside the Eidos File temporarily for compatibility, graft diff should know how to classify them as diagnostics or generated state.

## Runtime Architecture

Eidos File v1 should introduce a runtime boundary:

```txt
Space runtime:
  opens Space
  manages file tree
  manages .eidos private state
  manages graft repo

Eidos File runtime:
  opens one .eidos SQLite file
  manages tables, fields, views, rows
  exposes existing table APIs against that Eidos File
```

Current code can be adapted by parameterizing `DataSpaceWithTable`/`SchemaClient`/`TableManager` around an Eidos File database connection.

Important separation:

- Workspace/Space state should not be required for table CRUD.
- Table CRUD should not require `eidos__tree` as the workspace tree.
- Eidos File should have its own table registry.

## API Direction

Current APIs:

```ts
eidos.currentSpace.schema.createTable(...)
eidos.currentSpace.table(tableId)
```

Target Eidos File-aware APIs can evolve toward:

```ts
const base = await eidos.currentSpace.openEidosFile("tasks.eidos")
await base.schema.createTable(...)
const Tasks = base.table("...")
```

Compatibility layer:

```ts
eidos.currentSpace.schema
```

may operate on a default Eidos File during transition.

## Graft Diff Semantics

Graft sees `.eidos` as a SQLite file path:

```txt
tasks.eidos
```

Eidos should present it as:

```txt
tasks.eidos
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

Graft should not need Eidos-specific path hardcoding. It should detect `.eidos` as SQLite and use schema/table metadata to produce meaningful summaries.

## Migration From Current Spaces

Migration from current `.eidos/db.sqlite3` to `.eidos` should be export-based first.

For each selected table:

1. Copy `tb_<tableId>`.
2. Copy matching `eidos__columns` rows.
3. Copy matching `eidos__views` rows.
4. Copy matching `eidos__references` rows.
5. Create `eidos__tables` rows from table nodes in `eidos__tree`.
6. Validate field properties, formula definitions/materialized compatibility values, relation IDs, and lookup dependencies.
7. Rewrite file field paths if needed.
8. Write `eidos__meta`.

Out of scope for Eidos File export:

- `eidos__docs`,
- workspace folders,
- chat/message/session tables,
- cache/index tables,
- global settings,
- Space file tree.

## Compatibility Phases

### Phase 1: Eidos File Schema Writer

Create empty `.eidos` files with:

- `eidos__meta`,
- `eidos__tables`,
- `eidos__columns`,
- `eidos__views`,
- `eidos__references`.

### Phase 2: Open Existing Eidos File

Open a `.eidos` file and mount current table APIs against it.

### Phase 3: Export One Table

Export one existing Eidos table into a `.eidos` file.

### Phase 4: Multi-Table Eidos File

Support multiple tables, views, links, lookups, and formulas inside a single Eidos File.

### Phase 5: Graft Diff

Show `.eidos` path-level changes and table-level expansion in Changes UI.

### Phase 6: Default Eidos File Runtime

New file-based Eidos workspaces create tables in `.eidos` files instead of hidden `.eidos/db.sqlite3`.

## Eidos File v1 Decisions and Deferred Questions

1. `eidos__tables` is the canonical Eidos File table registry; v1 does not add a compatibility `eidos__tree`.
2. File fields default to normal Space-relative `assets/` paths. Eidos File-specific sibling asset folders remain optional future work.
3. FTS, embeddings, and search caches are generated state and stay outside the canonical Eidos File contract; implementations may rebuild them or use private sidecars.
4. V1 guarantees Grid, Gallery, and Kanban renderers. Extension-defined views belong to the deferred file-based extensions RFC.
5. Cross-Eidos File links are deferred. V1 relations target rows in the same Eidos File.
6. `created_by` and `last_edited_by` remain optional local metadata and default to `unknown` when no identity is available.

## Recommended Vertical Slice

Build this first:

```txt
sample-space/
  tasks.eidos
  assets/logo.png
  .eidos/
  .graft/
```

`tasks.eidos` contains:

- `eidos__meta`,
- `eidos__tables`,
- `eidos__columns`,
- `eidos__views`,
- one `tb_<tableId>` data table,
- one grid view,
- one select field,
- one file field referencing `assets/logo.png`.

The slice should prove:

- Eidos can create `tasks.eidos`.
- Eidos can open `tasks.eidos`.
- Existing grid table UI can edit rows.
- Graft status shows `tasks.eidos` as a changed file.
- Expanding `tasks.eidos` shows row/schema/view changes.
- private `.eidos` runtime state does not appear as user changes.
