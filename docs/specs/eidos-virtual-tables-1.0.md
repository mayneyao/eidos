# Eidos Virtual Tables 1.0

Status: Draft Eidos Standard Profile\
Version: 1.0\
Published: 2026-09-24\
Editor and change controller: Eidos Project\
Canonical language: English

## Abstract

This profile specifies the integration of SQLite Virtual Tables (`vtab`) into
[Eidos File Format 1.0](./eidos-file-1.0.md) databases. It defines how an `.eidos`
database container hosts, queries, configures, and mutates virtual tables backed by
external single-sources-of-truth (such as local filesystem metadata via `fs_meta`),
while preserving canonical Eidos View definitions, Field metadata, sorting,
filtering, and [Graft Version Control](../../graft/README.md) compatibility.

The profile introduces conformance labels:

- **`EF-VTab-1.0`**: File Format level virtual table declarations, metadata schema, and
  relaxation rules for non-UUIDv7 row identifiers.
- **`ER-VTab-1.0`**: Runtime level table capability enforcement, query pushdown, and
  restricted mutation translation.
- **`EA-VTab-1.0`**: Adapter/Host level native module resolution, extension loading, and
  sandboxing allowlist rules.

## Status of This Document

Runtime validation MUST reject an unknown required virtual-table profile or a
required module absent from `PRAGMA module_list` before inspecting virtual-table
columns or rows. A `vtab:` prefix alone does not establish support. The current
implementation supports only the `fs_meta` profile with its native module loaded.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and
**OPTIONAL** are interpreted as BCP 14 terms only when written in capitals,
as specified by RFC 2119 and RFC 8174.

English is normative. Chinese translations are informative section-aligned
references. Implementations MUST NOT claim conformance until status becomes Final.

## 1. Position, Scope, and Ownership

This specification extends the canonical [Eidos 1.0 Specification Suite](./README.md):

```text
Eidos UI 1.0
    │  calls RuntimeClient
    ▼
Eidos Runtime 1.0 (ER-VTab-1.0)
    │  enforces table capabilities (insert/update/delete)
    │  compiles virtual table queries and updates
    ▼
Eidos Adapter 1.0 (EA-VTab-1.0)
    │  resolves & loads approved native SQLite extensions (e.g. libfs_meta)
    │  manages connection lifecycle & sandboxing
    ▼
Eidos File Format 1.0 (EF-VTab-1.0)
    │  declares vtab feature in eidos__features
    │  stores views, fields, sorts, filters in eidos__* metadata tables
    ▼
External Storage / Filesystem
       single source of truth for rows & attributes (e.g. xattr / ADS)
```

Ownership rules:

- **Eidos File Format** owns the canonical metadata tables (`eidos__*`), feature
  declarations, and persisted schema.
- **Eidos Runtime** owns logical capability checks, row mutation planning, and
  view projection over the virtual table.
- **Eidos Adapter** owns native extension loading, module verification, and platform
  file access.
- **Virtual Table Module** (e.g. `fs_meta`) owns external physical data access,
  index filtering, and attribute storage.

## 2. Invariants

1. **External Authority (SSOT)**: The external storage (e.g. the local directory
   tree and file extended attributes) is the authoritative Single Source of Truth
   for virtual table rows. A virtual table MUST NOT create physical user B-tree data
   pages inside the `.eidos` SQLite database.
2. **Metadata Durability**: Saved Views (`eidos__views`), Field metadata
   (`eidos__fields`), View Filters (`eidos__view_filters`), and View Sorts
   (`eidos__view_sorts`) remain canonical state inside the `.eidos` database file and
   MUST be preserved across sessions and versioned by Graft.
3. **Capability Honesty**: A virtual table declares its mutation capabilities
   (`insert`, `delete`, `update`, `alterSchema`). The Runtime and UI MUST honor
   these capabilities and MUST NOT display or accept actions that violate them.
4. **Host Sandboxing**: An `.eidos` file MUST NOT trigger the execution of arbitrary
   native code. The host Adapter MUST enforce a strict compile-time or runtime
   allowlist of approved virtual table modules.

## 3. Feature Declaration (`eidos__features`)

An `.eidos` database utilizing a virtual table MUST declare the dependency in
`eidos__features` as specified in Eidos File Format 1.0 Section 13:

```sql
INSERT INTO eidos__features (name, required, config_json)
VALUES (
  'vtab:fs_meta',
  1,
  '{"module":"fs_meta","root":".","namespace":"space.eidos.meta"}'
);
```

- **`name`**: MUST follow the pattern `vtab:<module_name>`, where `<module_name>` is
  the identifier of the required virtual table engine (e.g., `vtab:fs_meta`).
- **`required`**: Set to `1` if opening or interacting with the database requires
  the module. An EF-Reader or EF-Writer lacking the declared module MUST refuse
  canonical writes and report `unsupported-feature: vtab:<module_name>`.
- **`config_json`**: A canonical JSON object containing configuration parameters
  passed to the module during initialization.

## 4. Table Metadata and Capabilities (`eidos__tables`)

A virtual table is registered as a user Table in `eidos__tables`.

### 4.1. SQLite Physical Schema

The physical table is created via SQLite's `CREATE VIRTUAL TABLE` statement:

```sql
CREATE VIRTUAL TABLE "files" USING fs_meta(
  root = '.',
  namespace = 'space.eidos.meta',
  fields = 'tags TEXT, rating INTEGER, status TEXT'
);
```

### 4.2. `settings_json` Schema

The `eidos__tables.settings_json` document MUST include a `vtab` configuration block:

```json
{
  "tableType": "virtual",
  "vtabModule": "fs_meta",
  "capabilities": {
    "insert": false,
    "delete": false,
    "update": true,
    "alterSchema": true
  },
  "vtabConfig": {
    "root": ".",
    "namespace": "space.eidos.meta"
  }
}
```

#### Fields:

- **`tableType`** (`"virtual"`): Identifies the table as a virtual table.
- **`vtabModule`** (`string`): The module name corresponding to the `vtab:<module>`
  feature declaration.
- **`capabilities`** (`object`):
  - **`insert`** (`boolean`): If `false`, the row set is strictly determined by the
    external source. The UI MUST hide row-insertion affordances (such as "+ New Row"
    buttons or append draft rows). Runtime `mutateRows` requests with `kind: "create"`
    MUST be rejected.
  - **`delete`** (`boolean | "clear_meta"`): If `false`, row deletion is prohibited.
    If `"clear_meta"`, deleting a row clears its custom metadata attributes without
    deleting the underlying external entity (e.g. physical file on disk).
  - **`update`** (`boolean`): If `true`, mutations to writable fields are supported.
  - **`alterSchema`** (`boolean`): If `true`, adding, renaming, or removing user-defined
    custom fields is supported.
- **`vtabConfig`** (`object`): Module-specific initialization arguments.

## 5. Field Schema and Identity (`eidos__fields`)

### 5.1. Primary Key (`row-id`) Relaxation

Standard Eidos File Format 1.0 requires every row to be identified by a UUIDv7 `_id`.
Under `EF-VTab-1.0`:

1. The virtual table's primary key column (associated with `system_role = 'row-id'`)
   MAY be a non-UUIDv7 canonical identifier, provided it is unique, non-null, and
   collated predictably (e.g. UTF-8 POSIX relative file path).
2. The identifier MUST NOT contain null bytes (`\0`).
3. The column is immutable and read-only.

### 5.2. Field Partitioning

Fields in a virtual table are partitioned into two categories:

| Category             | Description                                                                                                                                                | `writable` | Physical Column       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------- |
| **System / Derived** | Intrinsic properties generated by the external source (e.g. `_id`, `name`, `path`, `extension`, `size`, `mimetype`, `_created_at`, `_updated_at`, `file`). | `false`    | Read-only vtab column |
| **User Custom**      | Editable attributes stored in external metadata envelopes (e.g. `tags`, `rating`, `status`).                                                               | `true`     | Dynamic vtab column   |

System fields MUST include `isSystem: true`, `readOnly: true`, and `writable: false` in their `settings_json`. Conforming UI and Runtime implementations MUST enforce that these columns cannot be edited, deleted, or converted:

- **`name`** (`type: "text"`): Physical file name, designated as the Record Label Field (`label_field_id`).
- **`path`** (`type: "text"`): Canonical relative POSIX file path, identical in value to `_id`.
- **`extension`** (`type: "select"`): File extension, rendered as a single-select tag badge with `options: []`.
- **`size`** (`type: "integer"`): Physical file size in bytes.
- **`mimetype`** (`type: "text"`): Guessed MIME media type based on file extension (e.g. `image/png`, `text/plain`, `application/pdf`), enabling single-condition filter queries across media types (e.g. `starts with image/`).
- **`file`** (`type: "file"`): Built-in file attachment reference.

Default user-custom metadata fields include:

- **`tags`** (`type: "multi-select"`): Multi-select tags persisted as a JSON array string in extended attributes.
- **`rating`** (`type: "integer"`): 0–5 score configured with `settings_json: { "control": "rating", "display": { "kind": "rating", "min": 0, "max": 5 } }`, rendering as an interactive star rating in the UI.

Every virtual table MUST designate one field as the Table's Record Label Field
(`eidos__tables.label_field_id`). For filesystem virtual tables, this MUST reference
the `name` (file name) field.

### 5.3. Built-in `file` Attachment Field

Custom fields retain the canonical `physical_name = name` mapping. Their
`settings_json.vtabStorageKey` identifies the external attribute independently;
renaming a field MUST preserve that key and MUST NOT erase or migrate its values.
Legacy fields without a key use their original physical name. New custom fields
use unique keys so recreating a deleted name cannot revive old values. The native
`fields` argument accepts a JSON array of `{name, type, key}` definitions; names
are SQL identifiers, while `key` selects the metadata envelope entry.

For filesystem virtual tables (`fs_meta`), a built-in field with `type: "file"` (physical column `file TEXT`) is provided:

1. The `file` column evaluates dynamically to a canonical Eidos File attachment JSON array:
   ```json
   [
     {
       "id": "<uuid-v7>",
       "mediaType": "<mime>",
       "name": "<filename>",
       "size": "<size>",
       "uri": "<rel_path>"
     }
   ]
   ```
2. For directories, the `file` column evaluates to `NULL`.
3. The attachment `id` is a deterministic UUIDv7 derived from the file's relative path, ensuring stable resolution across query cycles and re-scans.
4. The attachment `uri` is relative to the owning database directory, including
   the configured scan-root prefix, with non-ASCII or unsafe characters percent-encoded.
   Row IDs remain relative to the scan root. In-memory databases retain scan-root-relative URIs.
5. In Gallery View, setting `layout_json.coverField` to this field ID enables automatic card cover rendering for image files directly from the local disk.
6. The host Runtime resolves `uri` relative to the containing directory of `files.eidos` using the existing `resolveEidosFileAttachment` protocol.

## 6. Runtime Semantics (`ER-VTab-1.0`)

A conforming `ER-VTab-1.0` Runtime implementation MUST satisfy the following execution
contracts:

### 6.1. Query Compilation

1. `queryRows` generates standard SQL `SELECT` queries against the physical virtual table.
2. Filter criteria (`EidosFilterCondition`) and sort orders (`EidosSortCondition`)
   are translated into SQL `WHERE` and `ORDER BY` clauses to enable SQLite `xBestIndex`
   query optimization pushdown.

### 6.2. Mutation Enforcement

When `mutateRows` is called:

1. **Row Creation (`kind: "create"`)**: If `capabilities.insert` is `false`, the Runtime
   MUST immediately abort the transaction with:
   ```json
   {
     "code": "table-mutation-not-supported",
     "message": "Virtual table does not support row creation"
   }
   ```
2. **Row Update (`kind: "update"`)**:
   - The Runtime MUST verify that only writable custom fields are targeted.
   - Any attempt to update a system-role field (`row-id`, `created-time`, `updated-time`)
     or a read-only field MUST be rejected with `read-only-field`.
   - The mutation is dispatched via SQLite `UPDATE`:
     ```sql
     UPDATE "files" SET "tags" = ? WHERE "_id" = ?;
     ```
3. **Row Deletion (`kind: "delete"`)**:
   - If `capabilities.delete` is `false`, the Runtime MUST reject the operation with
     `table-mutation-not-supported`.
   - If `capabilities.delete` is `"clear_meta"` or `true`, the Runtime issues:
     ```sql
     DELETE FROM "files" WHERE "_id" = ?;
     ```

### 6.3. Revision Postconditions

Normal transaction and savepoint rollback MUST restore external metadata bytes,
including the absence of an envelope. Schema changes finish before retired keys
are removed using the final virtual-table instance, so failed field deletion can
roll back both the schema and metadata. Dropping a virtual table with pending
metadata writes MUST fail rather than discard its rollback journal. These are
in-process rollback guarantees: xattr/ADS writes are not part of SQLite's durable
journal, so abrupt process termination and independent external writers are not
covered by SQLite crash atomicity. Hosts MUST NOT claim otherwise.

- Metadata transactions modifying `eidos__views`, `eidos__fields`, or table settings
  MUST increment `eidos__meta.revision` and update `eidos__meta.updated_at` as specified
  by Eidos File Format 1.0 Section 14.
- Mutations strictly altering external virtual table attributes (such as editing a tag)
  MAY commit without incrementing `eidos__meta.revision` if no `.eidos` database pages
  were changed, or MAY increment revision according to the host transaction coordinator.

## 7. Adapter & Host Lifecycle (`EA-VTab-1.0`)

A conforming `EA-VTab-1.0` Adapter owns the execution boundary:

1. **Extension Loading**: The host Adapter MUST enable extension loading
   (`sqlite3_enable_load_extension` or `db.enableLoadExtension(true)`) only during
   initialization of authorized connections.
2. **Module Allowlist**: The host MUST maintain a strict allowlist of permitted
   virtual table modules. Requests to load unapproved modules MUST be rejected.
3. **Module Resolution**: For a declared module `fs_meta`, the host resolves the
   platform-specific binary:
   - macOS arm64 / x86_64: `libfs_meta.dylib`
   - Linux x86_64: `libfs_meta.so`
   - Windows x86_64: `fs_meta.dll`
4. **Environment Isolation**: Native dynamic libraries MUST be bundled within the
   host application or verified via cryptographic hash before execution.

## 8. Specific Profile: `fs_meta` Profile

The `fs_meta` profile defines standard behavior for filesystem metadata virtual tables:

### 8.1. Module Parameters

- **`root`**: The path to the scanned directory, relative to the directory containing
  the owning `.eidos` database (including attached databases), never the host working
  directory. Defaults to `'.'`. Lite stores relative roots in new files. Existing
  absolute roots retain their explicit binding and are not automatically migrated.
  SQL string parameters MUST decode doubled quote delimiters. Lite requires
  `fs_meta_root_mode()` to return `database` before using the native extension.
- **`namespace`**: The extended attribute namespace key. MUST default to
  `space.eidos.meta`.
- **`fields`**: JSON array of `{name, type, key}` custom field definitions. Legacy
  comma-separated name/affinity definitions remain readable, using the name as key.

### 8.2. Default Field Mapping

| Field Name    | Type       | System Role    | Writable | Description                           |
| ------------- | ---------- | -------------- | -------- | ------------------------------------- |
| `id` / `_id`  | `text`     | `row-id`       | `false`  | POSIX relative path from root         |
| `name`        | `text`     | None (Label)   | `false`  | Basename of file or folder            |
| `extension`   | `text`     | None           | `false`  | File extension (without dot)          |
| `size`        | `integer`  | None           | `false`  | File size in bytes                    |
| `mimetype`    | `text`     | None           | `false`  | Guessed MIME media type               |
| `file`        | `file`     | None           | `false`  | Attachment JSON entry array           |
| `_created_at` | `datetime` | `created-time` | `false`  | File creation time (ISO 8601 UTC)     |
| `_updated_at` | `datetime` | `updated-time` | `false`  | File modification time (ISO 8601 UTC) |

## 9. Graft Version Control Compatibility

1. **Opaque Virtual Rows**: Virtual tables have `rootpage = 0` in SQLite's schema.
   Graft's `graft-sqlite` engine ignores virtual table rows during row-level diffing
   and merge operations (`OpaqueChangeReason::VirtualTable`).
2. **Schema & View Tracking**: The DDL definition in `sqlite_schema` and all
   `eidos__*` metadata records (views, filters, sorts, field configurations) are
   tracked as standard relational records by Graft.
3. **Collaboration Convergence**: Pulling, branching, and merging `.eidos` files
   containing virtual tables safely merges view layouts and column definitions using
   [Eidos System Metadata Merge 1.0](./eidos-system-metadata-merge-1.0.md) without
   conflicting on external filesystem contents.
