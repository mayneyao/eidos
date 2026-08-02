# Eidos File Format 1.0

Status: Final Eidos Standard  
Version: 1.0  
Published: 2026-07-21  
Editor and change controller: Eidos Project  
Canonical language: English

## Abstract

Eidos File is an open, local-first persistence format for multidimensional
tables. An Eidos File is one SQLite database with the `.eidos` extension.
Stored source fields are ordinary SQLite columns whose names and raw values
are intentionally close to what users see. Stable IDs preserve references
across rename and reorder without turning user data into opaque physical
names.

This specification defines only the bytes, SQLite schema, canonical raw
values, persisted definitions, revision postconditions, and format-validity
rules of Eidos File Format 1.0. It deliberately does not define logical query
results, derived evaluation, platform file access, Worker transport, or user
interaction. Those contracts are owned respectively by
[Eidos Runtime 1.0](./eidos-runtime-1.0.md),
[Eidos Adapter 1.0](./eidos-adapter-1.0.md), and
[Eidos UI 1.0](./eidos-ui-1.0.md).

## Status of This Document

This is the normative Eidos File Format 1.0 specification and the persistence
layer of the [Eidos 1.0 specification suite](./README.md). Design RFCs,
implementation source, package API reports, product documentation, fixtures,
and translations are informative and do not override it.

Publication defines the conformance target; it does not assert that an
existing implementation already conforms.

Examples, notes, rationale, and appendices marked informative are
non-normative. All other sections are normative.

## 1. Conformance

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and
**OPTIONAL** are interpreted as BCP 14 terms only when written in capitals.

The conformance labels are:

1. **EF-Reader-1.0** reads and validates canonical state without changing it.
   It preserves every unknown optional member or extension it rewrites.
2. **EF-Writer-1.0** satisfies EF-Reader-1.0 and creates or changes canonical
   state atomically while maintaining every committed File invariant.

A product MUST state its labels. File conformance does not imply Runtime,
Adapter, or UI conformance. Conversely, every ER-Reader-1.0 or ER-Writer-1.0
implementation depends on an EF-Reader-1.0 or EF-Writer-1.0 implementation as
specified by Eidos Runtime 1.0.

Within this document, **Reader** and **Writer** abbreviate EF-Reader-1.0 and
EF-Writer-1.0 respectively.

A conforming implementation MUST reject an unknown required feature before
returning canonical data. It MUST preserve unknown optional extension state
when it can do so losslessly, or refuse the write. Merely exposing SQLite rows
without applying the Reference Policy and format validation is not
EF-Reader-1.0 conformance.

## 2. Terminology

- **canonical state**: the authoritative persisted user data and metadata
  defined here. If canonical and generated state disagree, canonical state
  controls and generated state is discarded or rebuilt.
- **canonical value**: the one authoritative serialized value of a stored
  Field. A canonical value is sufficient, together with canonical metadata,
  to reconstruct every derived representation of that Field.
- **generated state**: a value or structure that can be discarded and rebuilt
  solely from canonical state, such as an index, parsed AST, dependency edge,
  compiled plan, reverse edge, resolved label, thumbnail, or materialized
  projection. Generated state may occur inside the SQLite file only where this
  specification explicitly permits it.
- **Host-private state**: state outside the published `.eidos` main database.
  It is governed by Eidos Adapter 1.0 and is never part of this format.
- **UI state**: interaction state governed by Eidos UI 1.0. Saved View
  definition documents are canonical; current focus, selection, scroll, draft,
  and placeholders are not.
- **stored field**: an editable source field backed by a user-table column.
- **virtual field**: a Formula, Lookup, or inverse Relation computed from
  canonical state and not backed by a source column.
- **display name**: the user-facing table or field name.
- **physical name**: the quoted SQLite table or column name.
- **Record Label Field**: the one Field ID stored for a Table as its default
  row-label source. Its logical evaluation is defined by Eidos Runtime 1.0.
- **forward Relation**: a stored Field whose canonical raw value is an ordered
  list of target Row IDs.
- **inverse Relation**: a virtual Field definition that identifies one forward
  Relation and has no stored mirror column.
- **Lookup definition**: persisted Field-ID references and aggregate options
  for a Runtime projection through a Relation.
- **Formula source**: a persisted, human-readable expression containing quoted
  Field names. Parsing and evaluation are Runtime concerns.
- **unresolved Relation**: a stored target Row ID whose target row is missing.

`NULL`, an empty string, zero, false, and an empty list are distinct.

## 3. Design Invariants

1. The canonical state inside the `.eidos` file is authoritative; a UI model,
   generated index, or cache is not.
2. Stored source fields are real SQLite columns. Their physical names and raw
   values match user-visible names and values whenever SQLite permits.
3. Stable Table, Field, Row, View, and File IDs identify objects across rename,
   reorder, references, and merges. IDs do not make physical names opaque.
4. Every row is identified by its UUIDv7 `_id`. A hidden SQLite `rowid`, when
   present, is never Eidos identity and is never persisted in a reference.
5. Every Table has exactly one Record Label Field, but no fixed `Title` or
   `Name` Field is required.
6. Single Select stores its option name as TEXT. Multi-select stores an ordered
   JSON array of option names. Options have no separate IDs or canonical table.
7. A forward Relation is a real JSON column containing ordered Row IDs. An
   inverse Relation definition stores no mirror column.
8. Formula and Lookup definitions are canonical; parsed forms, dependency
   edges, and results are generated and are not canonical materialized columns.
9. Multi-valued query indexes are generated state. The source column remains
   authoritative and sufficient to rebuild every index.
10. Every transaction that changes canonical state is atomic and leaves the
    file valid; a true no-op does not change revision.
11. A third-party implementation can recover persisted meaning from this
    specification and full logical meaning from the specification suite,
    without Eidos application code.
12. Canonical state, generated state, Host-private state, and UI state never
    silently substitute for one another.

## 4. Container and Identification

An Eidos File MUST be a SQLite 3 database beginning with
`SQLite format 3\0`. Readers and Writers MUST use SQLite 3.45.0 or later, or an
implementation with observably equivalent behavior for every required schema,
SQL, JSON, date/time, and transaction operation in this specification. The
encoding MUST be UTF-8.

Every connection MUST enable:

```sql
PRAGMA foreign_keys = ON;
PRAGMA trusted_schema = OFF;
```

Identity constants are:

```text
extension:       .eidos
media type:      application/vnd.eidos+sqlite3
application ID:  0x45494453 (ASCII EIDS)
schema revision: 1
format version:  1.0
```

```sql
PRAGMA application_id = 1162429523;
PRAGMA user_version = 1;
```

A Reader MUST verify the SQLite header, application ID, user version, and
singleton `eidos__meta` row. The extension alone is insufficient.

Rollback journals, WAL files, shared-memory files, locks, and recovery copies
are not format members. An exchanged or published Eidos File consists of one
self-contained SQLite main database. Producing that postcondition, including
writer quiescence and WAL checkpointing, is specified by
[Eidos Adapter 1.0](./eidos-adapter-1.0.md); EF-Readers MUST NOT require a
sidecar to interpret a published file.

## 5. Common Encodings

### 5.1 UUIDs

Persistent IDs MUST be UUIDv7 values conforming to RFC 9562. SQLite, public
APIs, JSON, and CSV all use the same lowercase, hyphenated 36-octet TEXT form:

```text
0198c0f4-7b10-7e2e-8bc9-f28a3e11a621
```

The exact shape is `xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx`, where every `x` is
a lowercase hexadecimal digit and `y` is one of `8`, `9`, `a`, or `b`. Nil,
uppercase, braced, URN, 32-character unhyphenated, and BLOB forms are not
canonical Eidos File IDs.

ID columns use SQLite TEXT with `BINARY` collation. Because case and hyphen
positions are fixed, bytewise TEXT order is the same as unsigned RFC UUID byte
order; UUIDv7 therefore retains timestamp-prefix locality. A Writer SHOULD use
a monotonic UUIDv7 generation method for multiple IDs created in one
millisecond. Rename and reorder never change IDs.

Once an object has been committed, its File, Table, Field, Row, or View ID is
immutable. Reassigning an ID is not an update: it deletes one identity and
creates another, subject to all dependency and revision rules. A clone or fork
that intentionally assigns a new File ID creates a new File identity; an
EF-Writer MUST NOT mutate `eidos__meta.file_id` in place.

The one-representation rule is intentional: a third-party editor can inspect,
copy, validate, bind, and join an ID without byte-order conversion. An
implementation MAY derive a binary UUID in memory or private cache, but it MUST
NOT persist that as a second canonical ID. Every SQL and JSON validator MUST
measure the UTF-8 byte length, reject U+0000, require exactly 32 hexadecimal
digits after removing the four fixed hyphens, and enforce the lowercase,
version, and variant rules above. SQLite `length(TEXT)` alone is insufficient
because it stops at an embedded U+0000.

### 5.2 Time and date

A date is TEXT in the exact calendar-only form `YYYY-MM-DD`. It has no time or
time zone. An instant, including a `datetime`, is TEXT in the exact 24-octet
UTC form:

```text
YYYY-MM-DDTHH:MM:SS.sssZ
```

This is the millisecond-precision UTC subset of RFC 3339. The year is
`0001..9999`; leap-second spellings are not canonical. An EF-Writer accepts and
commits only the canonical date and instant spellings above. Acceptance of
offset input, precision conversion, rounding, carry, confirmation, and
preflight reporting are conversion contracts owned by Eidos Runtime 1.0; this
format defines no non-canonical Writer input representation and permits no
implicit precision loss.

Canonical date and instant strings use the default SQLite `BINARY` collation.
Because every value is normalized and fixed-width, bytewise order equals
chronological order, so ordinary indexes support range filters and sorting
without a conversion expression. SQLite date/time functions can consume these
values directly. Runtime and CSV bindings expose the same canonical strings.
An Adapter MAY maintain a Host-private numeric projection or expression index
for duration-heavy workloads, but it MUST remain outside the published SQLite
main database and MUST NOT become a second stored value.

### 5.3 JSON

JSON MUST conform to RFC 8259 and I-JSON constraints: unique object keys,
valid Unicode, and binary64-compatible numbers. Larger integers and exact
decimals are strings.

Canonical JSON uses RFC 8785 JCS. Object keys are sorted, arrays retain order,
and insignificant whitespace is absent. Strings are not Unicode-normalized.

## 6. Reference Policy and Human-Readable Physical Names

Every reference belongs to exactly one of these namespaces:

| Reference       | Required use                                                                                                                                | Forbidden use                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| stable ID       | metadata foreign keys, API operations, View/query documents, Relation values, Lookup definitions, dependency graphs, cursors, logical merge | SQLite object lookup by concatenating the ID into an opaque table/column name |
| display `name`  | UI, Formula source, CSV display headers                                                                                                     | durable structural reference outside the owning name namespace                |
| `physical_name` | quoted SQLite DDL and SQL against the current file                                                                                          | API identity, Relation value, Formula source, merge identity                  |

Table, Field, Row, View, and File IDs never change on rename. Formula is the
only canonical structure that refers to a Field by display name; its parsed
reference nodes are rewritten atomically on Field rename. Every other
canonical structural reference uses a stable ID. SQL compilation resolves an
ID through metadata to the current `physical_name` and then quotes that name.

### 6.1 General rule

`eidos__tables.name` and `eidos__fields.name` are display names.
`physical_name` is the exact SQLite object name. A Writer MUST quote physical
names as SQLite identifiers and MUST NOT concatenate them as unquoted SQL.
Quoting is exactly `"` + the name with every `"` doubled + `"`; values remain
bound parameters and are never identifier-quoted.

Table names MUST be unique within one File under SQLite `NOCASE` comparison.
Field names MUST be unique within one Table under the same comparison; the
three system Fields occupy `_id`, `_created_at`, and `_updated_at` in that
namespace. Fields in different Tables MAY have the same name. View names MUST
be unique within one Table as specified by Section 13.

SQLite `NOCASE` folds ASCII `A` through `Z` only. Eidos File Format 1.0 deliberately
uses that exact portable rule for identifier collision detection. Non-ASCII
names are compared by their UTF-8 code units and are not normalized. A Writer
MUST preserve the user's Unicode spelling and MUST NOT apply NFC, NFKC, locale
case conversion, or transliteration to a name.

For every Table and every stored Field, the canonical mapping is exactly:

```text
physical_name = display name
```

The equality is byte-for-byte BINARY equality. Formula, Lookup, and inverse
Relation Fields have `physical_name = NULL` because they have no stored column.
Spaces, Chinese text, punctuation, SQL keywords, and `x__` prefixes are valid
quoted SQLite identifiers and do not justify changing the name.

### 6.2 Name validity and conflicts

Table, Field, and View names MUST contain 1 through 1,024 UTF-8 octets, contain
only Unicode scalar values, and exclude U+0000. A Table name MUST NOT begin
with `sqlite_` or `eidos__` under ASCII case-insensitive comparison. The
`sqlite_` namespace belongs to SQLite and `eidos__` belongs to this format.

The Writer MUST reject an invalid, reserved, or `NOCASE`-duplicate name before
executing DDL. It MUST NOT truncate, decorate, suffix, transliterate, or map a
name into another persistent identifier. A rename conflict check excludes the
object being renamed.

Examples:

```text
display name       physical name
Tasks              Tasks
项目               项目
Project Status     Project Status
Order              Order
Status             Status
x__vendor__Tasks    x__vendor__Tasks
```

The stable Field ID remains necessary for Field and Formula identity, Lookup,
inverse Relation, View, rename detection, dependency diagnostics, and logical
diff. It is not the column name and is not written into Formula source.

### 6.3 Rename

A table rename updates `name` and `physical_name` to the same new name and uses
`ALTER TABLE ... RENAME TO`. For a table rename that changes only ASCII case
under SQLite identifier comparison, the Writer MUST use two `ALTER TABLE`
statements in the same transaction through an unoccupied transient internal
identifier. That identifier is never canonical state.

A stored-field rename similarly uses `ALTER TABLE ... RENAME COLUMN`. The
Field ID remains unchanged, so ID-based structural dependencies require no
rewrite. Formula source is the exceptional name-based reference. Its AST
rewrite is a Runtime semantic operation: an EF-only Writer MUST delegate a
stored-field rename to an ER-Writer or refuse it whenever the Table contains a
Formula definition. It MUST NOT perform textual search-and-replace. A table
rename alone does not change same-Table Formula Field names and does not require
Formula rewriting.

A Writer MUST set `PRAGMA legacy_alter_table=OFF`, keep foreign-key enforcement
enabled, and regenerate Eidos Relation triggers after any structural rename.
SQLite rewrites trigger/view references for supported renames, but regeneration
from canonical metadata is the conformance authority. If any parse, dependency,
or ambiguity check fails, the whole rename MUST roll back.

A Writer MUST NOT silently rename physical objects merely because an old
collision disappeared. It SHOULD normalize only on an explicit rename or
explicit repair operation.

## 7. Canonical Metadata Schema

`eidos__meta` is a typed singleton, not a key/value bag. The name `meta` is
normative: the row describes the format and file as a whole; `manifest` would
incorrectly imply an inventory and `file` would obscure that its values are
metadata. A typed row gives SQLite and third-party tools discoverable columns,
foreign keys, and type constraints. Writers MUST NOT put arbitrary application
preferences in this table.

The following is the complete Eidos File Format 1.0 metadata DDL portion of the
creation transaction. Together with the singleton continuation below, it was
executed as written with SQLite 3.53.1; it uses only behavior available in the
required SQLite 3.45 baseline. Writer and validator requirements in Sections 5
and 18 remain authoritative.

```sql
PRAGMA encoding = 'UTF-8';
PRAGMA foreign_keys = ON;
PRAGMA trusted_schema = OFF;

BEGIN IMMEDIATE;

PRAGMA application_id = 1162429523;
PRAGMA user_version = 1;

CREATE TABLE eidos__tables(
  id TEXT PRIMARY KEY COLLATE BINARY
    CHECK(length(CAST(id AS BLOB))=36 AND instr(id,char(0))=0
      AND substr(id,9,1)='-' AND substr(id,14,1)='-'
      AND substr(id,15,1)='7' AND substr(id,19,1)='-'
      AND substr(id,20,1) IN ('8','9','a','b') AND substr(id,24,1)='-'
      AND lower(id)=id AND length(CAST(replace(id,'-','') AS BLOB))=32
      AND replace(id,'-','') NOT GLOB '*[^0-9a-f]*'),
  name TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK(length(CAST(name AS BLOB)) BETWEEN 1 AND 1024
      AND instr(name,char(0))=0
      AND lower(substr(name,1,7)) NOT IN ('sqlite_','eidos__')),
  physical_name TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK(length(CAST(physical_name AS BLOB)) BETWEEN 1 AND 1024
      AND instr(physical_name,char(0))=0
      AND physical_name COLLATE BINARY = name COLLATE BINARY),
  label_field_id TEXT NOT NULL COLLATE BINARY,
  position INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(settings_json) AND json_type(settings_json)='object'),
  created_at TEXT NOT NULL
    CHECK(length(CAST(created_at AS BLOB))=24
      AND created_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(created_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+0 seconds')=created_at,0)),
  updated_at TEXT NOT NULL
    CHECK(length(CAST(updated_at AS BLOB))=24
      AND updated_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(updated_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0 seconds')=updated_at,0)),
  FOREIGN KEY(label_field_id) REFERENCES eidos__fields(id)
    DEFERRABLE INITIALLY DEFERRED
) STRICT, WITHOUT ROWID;

CREATE TABLE eidos__fields(
  id TEXT PRIMARY KEY COLLATE BINARY
    CHECK(length(CAST(id AS BLOB))=36 AND instr(id,char(0))=0
      AND substr(id,9,1)='-' AND substr(id,14,1)='-'
      AND substr(id,15,1)='7' AND substr(id,19,1)='-'
      AND substr(id,20,1) IN ('8','9','a','b') AND substr(id,24,1)='-'
      AND lower(id)=id AND length(CAST(replace(id,'-','') AS BLOB))=32
      AND replace(id,'-','') NOT GLOB '*[^0-9a-f]*'),
  table_id TEXT NOT NULL COLLATE BINARY
    REFERENCES eidos__tables(id) ON DELETE CASCADE,
  name TEXT NOT NULL
    CHECK(length(CAST(name AS BLOB)) BETWEEN 1 AND 1024 AND instr(name,char(0))=0),
  physical_name TEXT COLLATE NOCASE
    CHECK(physical_name IS NULL OR
      (length(CAST(physical_name AS BLOB)) BETWEEN 1 AND 1024
       AND instr(physical_name,char(0))=0
       AND physical_name COLLATE BINARY = name COLLATE BINARY)),
  type TEXT NOT NULL CHECK(type IN (
    'text','number','integer','checkbox','date','datetime','url','json',
    'select','multi-select','file','relation','formula','lookup'
  )),
  system_role TEXT CHECK(system_role IN ('row-id','created-time','updated-time')),
  nullable INTEGER NOT NULL DEFAULT 1 CHECK(nullable IN (0,1)),
  position INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(settings_json) AND json_type(settings_json)='object'),
  created_at TEXT NOT NULL
    CHECK(length(CAST(created_at AS BLOB))=24
      AND created_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(created_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+0 seconds')=created_at,0)),
  updated_at TEXT NOT NULL
    CHECK(length(CAST(updated_at AS BLOB))=24
      AND updated_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(updated_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0 seconds')=updated_at,0)),
  UNIQUE(table_id,name COLLATE NOCASE),
  UNIQUE(table_id,physical_name COLLATE NOCASE),
  CHECK(physical_name IS NOT NULL OR type IN ('relation','formula','lookup')),
  CHECK(system_role IS NULL OR
    (system_role='row-id' AND type='text' AND physical_name='_id' AND nullable=0) OR
    (system_role='created-time' AND type='datetime'
      AND physical_name='_created_at' AND nullable=0) OR
    (system_role='updated-time' AND type='datetime'
      AND physical_name='_updated_at' AND nullable=0))
) STRICT, WITHOUT ROWID;

CREATE UNIQUE INDEX eidos__fields_one_system_role
  ON eidos__fields(table_id,system_role) WHERE system_role IS NOT NULL;

CREATE TABLE eidos__meta(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  format_major INTEGER NOT NULL CHECK(format_major=1),
  format_minor INTEGER NOT NULL CHECK(format_minor=0),
  file_id TEXT NOT NULL UNIQUE COLLATE BINARY
    CHECK(length(CAST(file_id AS BLOB))=36 AND instr(file_id,char(0))=0
      AND substr(file_id,9,1)='-' AND substr(file_id,14,1)='-'
      AND substr(file_id,15,1)='7' AND substr(file_id,19,1)='-'
      AND substr(file_id,20,1) IN ('8','9','a','b') AND substr(file_id,24,1)='-'
      AND lower(file_id)=file_id
      AND length(CAST(replace(file_id,'-','') AS BLOB))=32
      AND replace(file_id,'-','') NOT GLOB '*[^0-9a-f]*'),
  title TEXT NOT NULL
    CHECK(length(CAST(title AS BLOB)) BETWEEN 1 AND 1024 AND instr(title,char(0))=0),
  default_table_id TEXT COLLATE BINARY
    REFERENCES eidos__tables(id) DEFERRABLE INITIALLY DEFERRED,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
  created_at TEXT NOT NULL
    CHECK(length(CAST(created_at AS BLOB))=24
      AND created_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(created_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+0 seconds')=created_at,0)),
  updated_at TEXT NOT NULL
    CHECK(length(CAST(updated_at AS BLOB))=24
      AND updated_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(updated_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0 seconds')=updated_at,0))
) STRICT, WITHOUT ROWID;

CREATE TRIGGER eidos__meta_no_delete BEFORE DELETE ON eidos__meta
BEGIN SELECT RAISE(ABORT,'eidos_meta_required'); END;

CREATE TRIGGER eidos__meta_no_key_update BEFORE UPDATE OF singleton ON eidos__meta
BEGIN SELECT RAISE(ABORT,'eidos_meta_singleton'); END;

CREATE TABLE eidos__features(
  name TEXT PRIMARY KEY COLLATE BINARY
    CHECK(length(CAST(name AS BLOB)) BETWEEN 1 AND 255 AND instr(name,char(0))=0),
  version TEXT NOT NULL
    CHECK(length(CAST(version AS BLOB)) BETWEEN 1 AND 64 AND instr(version,char(0))=0),
  required INTEGER NOT NULL DEFAULT 0 CHECK(required IN (0,1)),
  config_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(config_json) AND json_type(config_json)='object')
) STRICT, WITHOUT ROWID;

CREATE TABLE eidos__relation_fields(
  field_id TEXT PRIMARY KEY COLLATE BINARY
    REFERENCES eidos__fields(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK(direction IN ('forward','inverse')),
  target_table_id TEXT NOT NULL COLLATE BINARY REFERENCES eidos__tables(id),
  cardinality TEXT NOT NULL CHECK(cardinality IN ('one','many')),
  inverse_of_field_id TEXT COLLATE BINARY
    REFERENCES eidos__fields(id) ON DELETE RESTRICT,
  on_delete TEXT DEFAULT 'restrict'
    CHECK(on_delete IN ('restrict','detach','preserve')),
  CHECK((direction='forward' AND inverse_of_field_id IS NULL AND on_delete IS NOT NULL)
     OR (direction='inverse' AND inverse_of_field_id IS NOT NULL
         AND cardinality='many' AND on_delete IS NULL))
) STRICT, WITHOUT ROWID;

CREATE UNIQUE INDEX eidos__relation_one_inverse
  ON eidos__relation_fields(inverse_of_field_id)
  WHERE inverse_of_field_id IS NOT NULL;

CREATE TABLE eidos__formula_fields(
  field_id TEXT PRIMARY KEY COLLATE BINARY
    REFERENCES eidos__fields(id) ON DELETE CASCADE,
  source_text TEXT NOT NULL
    CHECK(length(CAST(source_text AS BLOB)) BETWEEN 1 AND 4096),
  result_type TEXT NOT NULL
    CHECK(result_type IN ('text','number','integer','checkbox','date','datetime','url','json'))
) STRICT, WITHOUT ROWID;

CREATE TABLE eidos__lookup_fields(
  field_id TEXT PRIMARY KEY COLLATE BINARY
    REFERENCES eidos__fields(id) ON DELETE CASCADE,
  relation_field_id TEXT NOT NULL COLLATE BINARY REFERENCES eidos__fields(id),
  target_field_id TEXT NOT NULL COLLATE BINARY REFERENCES eidos__fields(id),
  aggregate TEXT NOT NULL
    CHECK(aggregate IN ('values','first','count','sum','average','min','max')),
  distinct_values INTEGER NOT NULL DEFAULT 0 CHECK(distinct_values IN (0,1))
) STRICT, WITHOUT ROWID;

CREATE TABLE eidos__views(
  id TEXT PRIMARY KEY COLLATE BINARY
    CHECK(length(CAST(id AS BLOB))=36 AND instr(id,char(0))=0
      AND substr(id,9,1)='-' AND substr(id,14,1)='-'
      AND substr(id,15,1)='7' AND substr(id,19,1)='-'
      AND substr(id,20,1) IN ('8','9','a','b') AND substr(id,24,1)='-'
      AND lower(id)=id AND length(CAST(replace(id,'-','') AS BLOB))=32
      AND replace(id,'-','') NOT GLOB '*[^0-9a-f]*'),
  table_id TEXT NOT NULL COLLATE BINARY
    REFERENCES eidos__tables(id) ON DELETE CASCADE,
  name TEXT NOT NULL
    CHECK(length(CAST(name AS BLOB)) BETWEEN 1 AND 1024 AND instr(name,char(0))=0),
  type TEXT NOT NULL
    CHECK(length(CAST(type AS BLOB)) BETWEEN 1 AND 64 AND instr(type,char(0))=0),
  query_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(query_json) AND json_type(query_json)='object'),
  layout_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(layout_json) AND json_type(layout_json)='object'),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
    CHECK(length(CAST(created_at AS BLOB))=24
      AND created_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(created_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+0 seconds')=created_at,0)),
  updated_at TEXT NOT NULL
    CHECK(length(CAST(updated_at AS BLOB))=24
      AND updated_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(updated_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0 seconds')=updated_at,0)),
  UNIQUE(table_id,name COLLATE NOCASE)
) STRICT, WITHOUT ROWID;
```

Before committing the still-open creation transaction, the creating Writer
MUST insert the one meta row with
`(singleton,format_major,format_minor)=(1,1,0)`. A valid file MUST always contain
that row. The application ID, user version, schema, and singleton therefore
commit or roll back together. Circular Table → label Field and Field → Table
references are intentionally deferred so a Table and its required Fields can
be created atomically.

An executable empty-file example is:

```sql
INSERT INTO eidos__meta(
  singleton,format_major,format_minor,file_id,title,revision,created_at,updated_at
) VALUES(
  1,1,0,'01890f43-5c7e-7000-8000-000000000001','Untitled',0,
  '2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'
);
COMMIT;
```

`settings_json`, `config_json`, `query_json`, and `layout_json` MUST be JCS
objects even though SQLite's `json_valid` guard alone cannot enforce JCS.
Critical identity and dependency data is normalized. Presentation settings and
option catalogs are canonical metadata, but they never duplicate a cell value.
Tables, Fields, and Views are ordered by `(position,id COLLATE BINARY)`; duplicate
positions are valid, so ID is the deterministic tiebreaker. Writers MAY
renumber positions atomically without changing identity or value semantics.

## 8. User Tables and Field Types

Each `eidos__tables` row has one physical table named by
`eidos__tables.physical_name`:

```sql
CREATE TABLE "项目 表"(
  "_id" TEXT PRIMARY KEY COLLATE BINARY
    CHECK(length(CAST("_id" AS BLOB))=36 AND instr("_id",char(0))=0
      AND substr("_id",9,1)='-'
      AND substr("_id",14,1)='-' AND substr("_id",15,1)='7'
      AND substr("_id",19,1)='-' AND substr("_id",20,1) IN ('8','9','a','b')
      AND substr("_id",24,1)='-' AND lower("_id")="_id"
      AND length(CAST(replace("_id",'-','') AS BLOB))=32
      AND replace("_id",'-','') NOT GLOB '*[^0-9a-f]*'),
  "_created_at" TEXT NOT NULL
    CHECK(length(CAST("_created_at" AS BLOB))=24
      AND "_created_at" GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr("_created_at",1,4)<>'0000'
      AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ',
        "_created_at",'+0 seconds')="_created_at",0)),
  "_updated_at" TEXT NOT NULL
    CHECK(length(CAST("_updated_at" AS BLOB))=24
      AND "_updated_at" GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr("_updated_at",1,4)<>'0000'
      AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ',
        "_updated_at",'+0 seconds')="_updated_at",0)),
  "名称" TEXT NOT NULL,
  "评分" INTEGER,
  "标签" TEXT NOT NULL DEFAULT '[]'
    CHECK(json_valid("标签") AND json_type("标签")='array')
) STRICT, WITHOUT ROWID;

CREATE TRIGGER eidos__row_id_immutable__01890f435c7e70008000000000000010
BEFORE UPDATE OF "_id" ON "项目 表"
WHEN NEW."_id" IS NOT OLD."_id"
BEGIN SELECT RAISE(ABORT,'EIDOS_ROW_ID_IMMUTABLE'); END;
```

Changes to `_id` are rejected; assigning the same value is a no-op. Every table
registers one `row-id`, one `created-time`,
and one `updated-time` system role mapped to `_id`, `_created_at`, and
`_updated_at`. Those roles use ordinary `text`/`datetime` field types; system
role is orthogonal to type. No fixed `Title`, `Name`, or other user Field is
required.

Core storage is:

| Field type         | Physical storage       | Canonical raw value or definition      |
| ------------------ | ---------------------- | -------------------------------------- |
| `text`             | named TEXT column      | string or NULL                         |
| `number`           | named REAL column      | finite binary64 or NULL                |
| `integer`          | named INTEGER column   | signed int64 or NULL                   |
| `checkbox`         | named INTEGER column   | false, true, or NULL                   |
| `date`             | named TEXT column      | canonical date or NULL                 |
| `datetime`         | named TEXT column      | canonical instant or NULL              |
| `url`              | named TEXT column      | RFC 3986 URI-reference or NULL         |
| `file`             | named TEXT JSON column | ordered file list                      |
| `json`             | named TEXT JSON column | canonical JSON or NULL                 |
| `select`           | named TEXT column      | option name or NULL                    |
| `multi-select`     | named TEXT JSON column | ordered option-name list               |
| forward `relation` | named TEXT JSON column | ordered Row-ID list                    |
| inverse `relation` | no column              | definition in `eidos__relation_fields` |
| `formula`          | no column              | definition in `eidos__formula_fields`  |
| `lookup`           | no column              | definition in `eidos__lookup_fields`   |

This table defines File storage only. The one normative cross-layer overview
of mutation, filtering, sorting, grouping, search, whole-cell aggregation,
semantic summary, Formula/Lookup, Record Label, CSV, and UI/Adapter ownership
is the Eidos Runtime 1.0 Section 5.2 Field capability matrix. A sample
`.eidos` matrix or rendered documentation embed is illustrative and MUST NOT
replace either normative table.

Stored and forward Relation Fields MUST have a non-NULL `physical_name`.
Formula, Lookup, and inverse Relation Fields MUST have `physical_name = NULL`.
Structural validation MUST enforce this complete, mutually exclusive subtype
matrix:

| `eidos__fields` kind     | Required auxiliary row                           | Forbidden auxiliary rows  |
| ------------------------ | ------------------------------------------------ | ------------------------- |
| stored non-Relation type | none                                             | Relation, Formula, Lookup |
| forward `relation`       | exactly one forward `eidos__relation_fields` row | Formula, Lookup           |
| inverse `relation`       | exactly one inverse `eidos__relation_fields` row | Formula, Lookup           |
| `formula`                | exactly one `eidos__formula_fields` row          | Relation, Lookup          |
| `lookup`                 | exactly one `eidos__lookup_fields` row           | Relation, Formula         |

Every auxiliary `field_id` MUST therefore identify the matching Field type;
an unreferenced or mismatched auxiliary row is a structural error. The forward
or inverse direction determines the physical-name rule above. Deleting a
forward Relation with an inverse MUST explicitly delete or retarget the inverse
Field first; deletion of a definition row never authorizes leaving a
`type='relation'` Field without its required definition.

Exact STRICT declarations are:

```text
text, select, url,
date, datetime             -> TEXT
number                     -> REAL
integer                    -> INTEGER
checkbox                   -> INTEGER CHECK(value IS NULL OR value IN (0, 1))
file, multi-select,
forward relation           -> TEXT NOT NULL DEFAULT '[]' with JSON-array CHECK
json                       -> TEXT with JSON CHECK when non-NULL
```

For a stored scalar or `json` Field, `nullable=0` means that the physical
column has `NOT NULL`; `nullable=1` means that it omits `NOT NULL`. These are
exact structural counterparts, and extra constraints MUST NOT silently narrow
the declared raw domain. File, Multi-select, and forward Relation Fields always
have `nullable=0` because their empty value is `[]`, not SQL `NULL`. Inverse
Relation Fields also have `nullable=0` because their derived list may be empty
but is not NULL. Formula and Lookup Fields have `nullable=1` in core 1.0 because
EF cannot prove non-NULL derived evaluation. All three system roles have
`nullable=0` as required by Section 7.

The registry is intentionally small. `rating` is not a Field type; it is an
Integer display setting, for example:

```json
{ "display": { "kind": "rating", "max": 5, "min": 0 } }
```

Display bounds affect presentation and input assistance only. They MUST NOT
change the Integer raw domain or make an otherwise valid stored int64 invalid.
Validation rules that constrain raw data, when desired by a future feature,
are not display settings.

`number` and `integer` are distinct because not every signed int64 is exactly
representable as binary64. A Number raw value MUST be finite; negative zero is
normalized to positive zero before storage. An Integer raw
value is the complete signed SQLite int64 range. The lossless public binding
is defined by Eidos Runtime 1.0 and does not create a second on-disk encoding.

Date and datetime columns MUST additionally enforce or receive equivalent
Writer validation for these templates, where `<column>` is replaced by the
quoted physical column name:

```sql
-- date
CHECK (
  <column> IS NULL OR (
    length(CAST(<column> AS BLOB)) = 10
    AND <column> GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND substr(<column>, 1, 4) <> '0000'
    AND coalesce(strftime('%Y-%m-%d', <column>, '+0 days') = <column>, 0)
  )
)

-- datetime / instant
CHECK (
  <column> IS NULL OR (
    length(CAST(<column> AS BLOB)) = 24
    AND <column> GLOB
      '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
    AND substr(<column>, 1, 4) <> '0000'
    AND coalesce(
      strftime('%Y-%m-%dT%H:%M:%fZ', <column>, '+0 seconds') = <column>,
      0
    )
  )
)
```

Every metadata `created_at`/`updated_at` and user-table
`_created_at`/`_updated_at` value MUST satisfy the instant rule. A portable
Writer obtains the current value with
`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`; an implementation MAY instead bind an
equivalent canonical value from the Clock port defined by Eidos Runtime 1.0.

The URL raw value is the user's URI-reference. Writers validate RFC 3986
syntax but do not resolve, fetch, normalize, percent-decode, or rewrite it.
Resolution, network permission, and opening a URI are Adapter and UI concerns.

### 8.1 User-table organization

User tables MUST be STRICT. EF-Readers and EF-Writers MUST support both
ordinary SQLite rowid tables and `WITHOUT ROWID` tables. A Writer
creating a new user table SHOULD use `STRICT, WITHOUT ROWID`: UUID TEXT is the
actual primary key, so this avoids a second hidden integer key and duplicate
primary-key B-tree. A Writer MUST preserve an existing table's organization
unless an explicit optimization operation rebuilds it atomically.

The UUIDv7 `_id` is the only Eidos Row identity in either organization. A
hidden SQLite `rowid`, `oid`, or `_rowid_`, when available, is a physical
implementation detail and MUST NOT be persisted in metadata or a Relation, or
treated as stable across `VACUUM` or table rebuild. Metadata tables use the
exact organization declared in Section 7.

### 8.2 Record Label Field

Every Table MUST have exactly one Record Label Field referenced by
`eidos__tables.label_field_id` at every committed valid revision. It MUST
belong to that Table. A low-level Writer may select the `row-id` system Field.
A product MAY create an ordinary `Name` text Field by default, but neither its
name nor its existence is a format rule.

The Record Label Field's declared logical result MUST be a primitive scalar:

```text
text number integer checkbox date datetime url select
```

A stored Field of one of those types may be the Record Label Field. A Formula
MAY be the Record Label Field only when its persisted `result_type` is one of
those scalar types. A Lookup MUST NOT be the Record Label Field in core 1.0:
its exact scalar/list result shape is inferred by Runtime and is not persisted
in `eidos__lookup_fields`. A required future feature that persistently declares
an exact scalar Lookup result may relax that rule. Relation, inverse Relation,
Multi-select, File, JSON, and list values MUST NOT be Record Label Fields.

The stored role is table-wide: all references to a Table observe this one
Field ID. Evaluation and Relation resolution are defined by Eidos Runtime 1.0;
presentation and placeholders are defined by Eidos UI 1.0. A View definition
does not redefine the role.

Changing or deleting the current Record Label Field MUST select a valid
replacement in the same transaction. The source value or virtual-field
definition is canonical; any resolved or formatted label is generated state.

### 8.3 File values

A File value is an ordered canonical JSON array:

```json
[
  {
    "id": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e",
    "mediaType": "image/png",
    "name": "diagram.png",
    "size": "18234",
    "uri": "assets/diagram.png"
  }
]
```

Each object MUST contain canonical UUIDv7 `id`, non-empty `name`, RFC 6838
`mediaType`, `uri`, and `size` as the one canonical non-negative int64 decimal
string. The size string is `"0"` or begins with `1..9` followed by zero or more
ASCII digits, and its numeric value is at most `9223372036854775807`; a JSON
number is not canonical. Unknown object members are
preserved. The five required members are metadata plus one resource reference;
they do not create an attachment object store inside SQLite.

Core 1.0 permits exactly these File-entry URI classes:

1. a relative URI-reference such as `assets/diagram.png`;
2. an absolute `https:` URI; or
3. a canonical inline image Data URL.

A relative reference uses `/`, has no scheme or authority, resolves against
the directory containing the Eidos File, and MUST NOT be absolute or escape
that directory after percent-decoding and dot-segment removal. A Reader or
Writer MUST NOT reinterpret it against a process working directory,
application origin, web-page base URL, or another File. Moving the `.eidos`
file together with its relative assets preserves the references; moving it
alone may leave them unresolved without making the canonical value invalid.

An inline image URI has exactly this form:

```text
data:<mediaType>;base64,<payload>
```

For example, this entry contains one 68-octet PNG and no separate asset:

```json
{
  "id": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45f",
  "mediaType": "image/png",
  "name": "dot.png",
  "size": "68",
  "uri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
}
```

The scheme and `base64` marker are lowercase. `<mediaType>` is the exact
ASCII-lowercase `image/*` type also stored in the entry's `mediaType` member,
with no Data-URL media-type parameters. `<payload>` is canonical padded RFC
4648 Base64 using the standard alphabet, with no whitespace or non-alphabet
characters. Its decoded length MUST equal the decimal `size`, MUST be at least
one octet, and MUST NOT exceed 1,048,576 octets. The complete JSON cell still
obeys the 16 MiB limit in Section 19. `image/svg+xml` is valid stored data but
does not authorize unsandboxed inline rendering.

For relative and `https:` entries, the referenced bytes are external and MUST
NOT be duplicated into a SQLite BLOB, hidden attachment table, or second
canonical value. A Data URL is the deliberately narrow exception: its decoded
image bytes are embedded once in the canonical `uri` string and MUST NOT also
be copied elsewhere in the File. File existence, authorization, upload,
download, resolution, preview generation, and external-asset garbage
collection belong to Eidos Adapter 1.0. Rendering belongs to Eidos UI 1.0.

### 8.4 Stored type changes

This format defines the committed state after a type change, not the
user-facing conversion policy. A committed change MUST retain the Field ID,
make the metadata type and physical column declaration agree, encode every
non-NULL cell in the destination canonical form, preserve the user-table
organization unless an explicit optimization was requested, leave all
dependencies valid, and increment the file revision exactly once.

The complete conversion classification, preflight report, lossless and lossy
algorithms, confirmation token, dependency revalidation, and error behavior
are owned by [Eidos Runtime 1.0](./eidos-runtime-1.0.md). A low-level EF-Writer
that does not implement that operation MUST NOT claim that SQLite affinity or
a permissive `CAST` is an Eidos type conversion. It may only publish a
resulting file after all destination raw values and structural invariants
validate in one transaction. No conversion may create a second canonical raw
column.

## 9. Select and Multi-Select

Option names are raw values. There is no Option ID, `eidos__options`, or
`eidos__selections` table.

Single Select stores TEXT directly:

```text
In Progress
```

Multi-select stores an ordered unique JSON string array:

```json
["Backend", "Urgent"]
```

The optional display catalog is part of Field `settings_json`:

```json
{
  "options": [
    { "color": "gray", "name": "Todo" },
    { "color": "blue", "name": "In Progress" },
    { "color": "green", "name": "Done" }
  ]
}
```

For a Select or Multi-select Field, core 1.0 recognizes `options` exactly when
it is an array of JSON objects. Each entry has required string member `name`
and optional string member `color`; additional members are presentation data
and MUST be preserved byte-semantically through JCS parsing/serialization.
Entry order is presentation order. `name` is any valid Select value, including
the empty string. Names in one catalog MUST be unique by exact Unicode string.
`color` and additional members have no raw-value or identity semantics; a UI
that does not recognize them uses its fallback decoration. On other Field
types an `options` setting is unknown preserved settings data, not a catalog.

A stored value not
present in the catalog remains valid canonical data and MUST be preserved.
Presentation of an unconfigured value is owned by Eidos UI 1.0. Removing
catalog metadata MUST NOT silently delete cell data.

Editing the catalog alone does not rename or invalidate stored values. The
atomic option-rename and merge operations, including their treatment of cells
and View query documents, are defined by Eidos Runtime 1.0. Their committed
result remains subject to the raw encodings above. Formula string literals are
ordinary source text and are never structural option references.

An ordinary SQLite index on a Select column is permitted generated access
state. Any Multi-select reverse index is non-canonical and MUST be rebuildable
from the JSON column; it MUST NOT introduce Option IDs into this file.

## 10. Relation

### 10.1 Forward storage

A forward Relation is a real source column containing an ordered unique array
of lowercase UUID strings:

```json
["0198c72d-82b5-7968-b163-98be4b747702"]
```

Cardinality `one` permits zero or one element; `many` permits zero or more.
The column, not an edge index, is canonical. Resolved Record Label values are
generated display data and MUST NOT be written into the Relation cell.

The canonical schema has no global edge-value table. `eidos__relation_fields`
defines Relation endpoints and policy; it does not duplicate cell values.

Writers MUST validate JSON shape, UUID syntax, uniqueness, and cardinality on
insert and update. Target existence is not a raw-value constraint: a missing
target is an unresolved Relation value and its Row ID remains canonical.
Eidos Runtime 1.0 defines which operations may create one and how it is
reported; EF-Writers MUST NOT silently detach it merely to make a reference
resolvable.

The cold direct-join shape is ordinary SQLite and requires no ID conversion:

```sql
SELECT source."_id", CAST(item.key AS INTEGER) AS position, target."_id"
FROM "<source-table>" AS source
JOIN json_each(source."<relation-column>") AS item
JOIN "<target-table>" AS target ON target."_id" = item.value
ORDER BY source."_id" COLLATE BINARY, position;
```

### 10.2 Record-label reference

A Relation cell stores Row IDs only. It MUST NOT store a target Record Label,
resolved object, or presentation placeholder. The target Table's
`label_field_id` is the sole persisted label-role reference. Batched
resolution, unresolved-result shape, and evaluation errors are defined by
Eidos Runtime 1.0; display fallback belongs to Eidos UI 1.0.

### 10.3 Inverse Relation

If forward Field `F` belongs to Table `S` and targets Table `T`, inverse
Field `I` is structurally valid only when:

- `I` belongs to `T`;
- `I.inverse_of_field_id = F`;
- `I.target_table_id = S`;
- `I.cardinality = 'many'`;
- `I.physical_name = NULL`; and
- its `eidos__relation_fields.on_delete` is explicitly `NULL` rather than the
  column's forward-Relation default.

The inverse definition stores no mirror column or edge rows. Its value,
ordering, dependency behavior, and query evaluation are defined by Eidos
Runtime 1.0 and MUST be derived from `F`'s canonical JSON arrays. Eidos File
Format 1.0 has no target-unique one-to-one Relation definition.

### 10.4 Deletion

A logical delete operation MUST declare its complete per-Table Row-ID delete
set before mutating canonical rows. Forward Relation values owned by a source
row in that delete set disappear with the row and are not surviving incoming
references. For each forward Relation from source Table `S` to target Table
`T`, deleting target IDs applies the policy to source rows that are not in the
operation's delete set for `S`:

| Policy     | Required behavior                                                                           |
| ---------- | ------------------------------------------------------------------------------------------- |
| `restrict` | abort when any surviving source array contains an ID in the target delete set               |
| `detach`   | remove every target-delete-set ID from every surviving source array in the same transaction |
| `preserve` | leave surviving source arrays unchanged, creating unresolved values                         |

`restrict` is the default both for the Writer operation and for an omitted
forward `eidos__relation_fields.on_delete` value. The Writer MUST preflight the
whole delete set against canonical arrays before executing any row delete.
For `detach`, it performs set-based array updates first, preserves array order,
and gives every affected surviving source row the operation's one bound
canonical instant as `_updated_at`. It may clear outgoing Relation arrays on
rows that are themselves being deleted before issuing physical deletes; those
intermediate changes never commit independently. This procedure makes self
Relations, cycles, and multi-row deletes independent of SQLite row visitation
order.

Deleting a referenced Table or Field is restricted until dependent Relation
and Lookup definitions are removed or retargeted in the same structural
transaction. Because Formula source and View documents require upper-layer
parsers, an EF-only Writer MUST delegate or refuse a Field deletion or type
change whenever the owning Table has Formula or View definitions that could
refer to it. A suite-capable semantic Writer may proceed only after validated
dependency removal or rewrite. Deleting a forward Relation that has an inverse
also requires deleting or retargeting that inverse Field first.

A portable trigger for `restrict` may scan `json_each(source.column)`. A
portable `detach` trigger may rebuild arrays with `json_group_array` while
preserving `json_each.key` order. An implementation MAY use a verified derived
reverse index instead, but the JSON source column always wins if they differ.

User tables MUST reject `_id` value changes while permitting assignment of the
same value. A portable trigger is:

```sql
CREATE TRIGGER "eidos__row_id_immutable__<table-id-hex>"
BEFORE UPDATE OF "_id" ON "<physical-table-name>"
WHEN NEW."_id" IS NOT OLD."_id"
BEGIN
  SELECT RAISE(ABORT, 'EIDOS_ROW_ID_IMMUTABLE');
END;
```

In generated object names, `<table-id-hex>` and `<field-id-hex>` mean the
canonical UUID with hyphens removed; this is only an identifier suffix. In the
templates below, `<target-uuid>` is simply `OLD."_id"`. For different source
and target Tables, both `<source-survives-in-scan>` and
`<source-survives-in-update>` are the literal `1`. For a self Relation they are
respectively `source."_id"<>OLD."_id"` and
`"<source-table>"."_id"<>OLD."_id"`. No UUID conversion is required.

A portable `restrict` trigger for each incoming forward Relation is:

```sql
CREATE TRIGGER "eidos__relation_restrict__<field-id-hex>"
BEFORE DELETE ON "<target-table>"
WHEN EXISTS (
  SELECT 1
  FROM "<source-table>" AS source,
       json_each(CASE WHEN json_valid(source."<relation-column>")
                      THEN source."<relation-column>" ELSE '[]' END) AS item
  WHERE item.value = <target-uuid>
    AND <source-survives-in-scan>
)
BEGIN
  SELECT RAISE(ABORT, 'EIDOS_RELATION_RESTRICT');
END;
```

A portable `detach` trigger is:

```sql
CREATE TRIGGER "eidos__relation_detach__<field-id-hex>"
BEFORE DELETE ON "<target-table>"
WHEN EXISTS (
  SELECT 1
  FROM "<source-table>" AS source,
       json_each(CASE WHEN json_valid(source."<relation-column>")
                      THEN source."<relation-column>" ELSE '[]' END) AS item
  WHERE item.value = <target-uuid>
    AND <source-survives-in-scan>
)
BEGIN
  UPDATE "<source-table>"
  SET "<relation-column>" = (
        SELECT coalesce(
          json_group_array(item.value ORDER BY CAST(item.key AS INTEGER)), '[]')
        FROM json_each(CASE
          WHEN json_valid("<source-table>"."<relation-column>")
          THEN "<source-table>"."<relation-column>" ELSE '[]' END) AS item
        WHERE item.value <> <target-uuid>
      ),
      "_updated_at" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE <source-survives-in-update>
  AND EXISTS (
    SELECT 1
    FROM json_each(CASE
      WHEN json_valid("<source-table>"."<relation-column>")
      THEN "<source-table>"."<relation-column>" ELSE '[]' END) AS item
    WHERE item.value = <target-uuid>
  );
END;
```

`preserve` installs no target-delete trigger. These row triggers are a
single-target safety net for unspecialized SQLite mutation; they do not define
the set semantics of a conforming Runtime/Writer delete operation. In
particular, the detach template's SQLite `now` is statement time only. A
conforming Writer performs the set-based detach with its bound operation
instant before issuing target deletes, so the safety trigger does not perform
the canonical detach. A generally writable connection MUST refuse a multi-row
target delete that has not gone through the set-based preflight.

Relation creation, retargeting, column rename, table rename, and `on_delete`
changes MUST create, regenerate, or remove the affected triggers in the same
structural transaction. Table rename changes neither Table ID nor stored
Relation arrays. An EF-Writer MAY use behaviorally equivalent triggers backed
by a generated reverse index. A validator checks trigger behavior, not only
trigger names.

Forward Relation columns also require insert/update validation behavior:

- the value is a JSON array;
- every element is a lowercase hyphenated UUID string;
- no target ID occurs twice;
- cardinality `one` has at most one element.

The following concrete shape is the INSERT trigger. The UPDATE trigger uses
the distinct name `eidos__relation_validate_update__<field-id-hex>` and replaces
`BEFORE INSERT` with `BEFORE UPDATE OF "<relation-column>"`; both use `NEW`.
For cardinality `many`, omit the final `json_array_length` clause.

```sql
CREATE TRIGGER "eidos__relation_validate_insert__<field-id-hex>"
BEFORE INSERT ON "<source-table>"
WHEN NOT json_valid(NEW."<relation-column>")
  OR json_type(CASE WHEN json_valid(NEW."<relation-column>")
                    THEN NEW."<relation-column>" ELSE '[]' END)<>'array'
  OR EXISTS (
    SELECT 1
    FROM json_each(CASE WHEN json_valid(NEW."<relation-column>")
                        THEN NEW."<relation-column>" ELSE '[]' END) AS item
    WHERE item.type<>'text' OR length(CAST(item.value AS BLOB))<>36
      OR instr(item.value,char(0))<>0
      OR substr(item.value,9,1)<>'-' OR substr(item.value,14,1)<>'-'
      OR substr(item.value,15,1)<>'7' OR substr(item.value,19,1)<>'-'
      OR substr(item.value,20,1) NOT IN ('8','9','a','b')
      OR substr(item.value,24,1)<>'-' OR lower(item.value)<>item.value
      OR length(CAST(replace(item.value,'-','') AS BLOB))<>32
      OR replace(item.value,'-','') GLOB '*[^0-9a-f]*'
  )
  OR (SELECT count(*) FROM json_each(
        CASE WHEN json_valid(NEW."<relation-column>")
             THEN NEW."<relation-column>" ELSE '[]' END))
     <> (SELECT count(DISTINCT value COLLATE BINARY) FROM json_each(
        CASE WHEN json_valid(NEW."<relation-column>")
             THEN NEW."<relation-column>" ELSE '[]' END))
  OR json_array_length(CASE WHEN json_valid(NEW."<relation-column>")
                            THEN NEW."<relation-column>" ELSE '[]' END)>1
BEGIN
  SELECT RAISE(ABORT,'EIDOS_RELATION_INVALID');
END;
```

These triggers enforce raw shape. JCS spelling remains Writer validation;
target existence is reported separately because unresolved IDs are valid raw
Relation values. A Writer that makes raw table mutation impossible MAY provide behaviorally
equivalent pre-commit validation instead, but a generally writable `.eidos`
SQLite connection MUST install the triggers.

### 10.5 Generated reverse state

A reverse edge index, resolved label, or materialized inverse value is
generated state. It MUST NOT replace, amend, or validate against any authority
other than the forward JSON column and canonical metadata. An in-file reverse
edge table is not part of Eidos File Format 1.0. Planning and Host-private
index requirements are defined by Eidos Runtime 1.0 and Eidos Adapter 1.0.

## 11. Formula Definition Storage

A Formula Field has `type='formula'`, `physical_name=NULL`, and exactly one
row in `eidos__formula_fields`. That row stores only:

- the Formula Field ID;
- `source_text`, a non-empty UTF-8 expression of at most 4096 octets; and
- its declared scalar `result_type`.

Formula source is the sole canonical expression representation. It uses the
exact current display name of a same-Table Field, double-quoted as an
identifier; an embedded double quote is doubled. The grammar, canonical
serializer, function signatures, type and NULL rules, diagnostics, and
evaluation are defined solely by
[Eidos Runtime 1.0](./eidos-runtime-1.0.md). ER conformance additionally
requires the source to parse under that grammar, resolve every reference
exactly once in its owning Table, and agree with its declared result type.
EF conformance validates and preserves the storage shape without inventing a
second parser.

A parsed AST, resolved Field-ID reference, dependency edge, compiled SQL,
sample, and evaluated result are generated state and MUST NOT appear as a
second expression or result column. Field rename is the one name-reference
migration. Eidos Runtime 1.0 defines the AST rewrite and its atomic
postconditions; an EF-only Writer preserves `source_text` byte-for-byte and
refuses an affected rename rather than
guessing with textual replacement.

## 12. Lookup and Dependency Definition Storage

A Lookup Field has `type='lookup'`, `physical_name=NULL`, and exactly one
row in `eidos__lookup_fields`. Its four canonical parameters are the
Relation Field ID, target Field ID, aggregate name, and `distinct_values`
flag declared by the DDL.

The Relation Field MUST belong to the Lookup owner's Table. The target Field
MUST belong to that Relation definition's target Table. A Lookup may target a
stored Field, system Field, Relation, Formula, or Lookup when allowed by the
Runtime type rules. A Formula, Lookup, or inverse Relation result MUST NOT be
stored in a user-table column.

A Runtime-usable File MUST have an acyclic file-wide derived dependency graph.
The graph nodes, edge construction, nested flattening, ordering, typed
distinctness, aggregates, cycle diagnostics, and evaluation are owned by
Eidos Runtime 1.0. Parsed edges and topological plans are generated state;
stable Field IDs in the definition rows are canonical.

## 13. Saved View Definition Storage

A View is the row in `eidos__views` identified by its stable View ID.
`query_json` and `layout_json` are JCS objects and all structural Field
references inside them use Field IDs. Neither object may contain copied cell
values, resolved labels, generated SQL, cursors, page data, current selection,
focus, scroll position, drafts, or open-panel state.

For a core View, Eidos Runtime 1.0 determines whether `query_json` is a usable
Query Document and owns its meaning. Eidos UI 1.0 does the same for
`layout_json` and the standard `grid`, `gallery`, and `kanban` types. The empty
query object denotes the Runtime default query. The selected View is UI state
and is not stored in `eidos__meta`. EF conformance requires JCS storage and
stable-ID references, but does not duplicate either upper-layer JSON schema.

A Reader MUST preserve unknown View types and unknown JSON members. An
extension that changes query meaning rather than adding ignorable presentation
metadata MUST declare a corresponding `required=1` row in `eidos__features`;
a Reader or Writer that does not support that exact feature tuple MUST refuse
semantic access or canonical writes as specified in Section 20.

## 14. Canonical Write and Revision Postconditions

Every transaction that changes canonical state MUST choose one canonical
operation instant before its first canonical mutation, use that bound value for
every affected `updated_at`, leave all File invariants valid, and increment
`eidos__meta.revision` exactly once immediately before commit. It MUST set
`eidos__meta.updated_at` to that same instant. A transaction that makes no
canonical change MUST NOT change the revision or any timestamp. Generated-only
index or trigger repair does not increment the revision unless it also changes
canonical metadata.

Row creation sets `_created_at` and `_updated_at` to the same transaction
instant. A later change to any canonical source cell in that row sets
`_updated_at`; a derived result changing because another row changed does
not. A committed row or metadata object's `created_at` never changes. Schema
object `updated_at` values follow the same operation-instant rule. Committed
File, Table, Field, Row, and View IDs are immutable as specified in Section
5.1. Revision is a non-negative signed int64 logical counter, not wall time, a
content digest, a SQLite `data_version`, or a merge clock. A Writer MUST refuse
a canonical change at `9223372036854775807` rather than wrap.

A logical operation may touch metadata, physical schema, source rows, Relation
triggers, and saved definitions, but its canonical effects MUST commit or roll
back together. Its request order, expected-revision behavior, timestamps,
conversion policy, and public result are owned by Eidos Runtime 1.0. Locking,
publication, external-change detection, and recovery are owned by Eidos
Adapter 1.0.

## 15. State Placement

The following placement is normative:

| State                                                                                                                                                             | Format status                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| required metadata rows, user-table source columns, Select catalogs, Relation/Formula/Lookup definitions, saved View documents                                     | canonical                                                   |
| required Eidos triggers and ordinary scalar SQLite indexes derived from canonical metadata                                                                        | permitted in-file generated/access state                    |
| parsed ASTs, dependency edges, compiled SQL, reverse multi-value indexes, FTS, embeddings, thumbnails, derived values, resolved labels, pages, groups, aggregates | not canonical; MUST NOT be required from the published file |
| permissions, recovery copies, working copies, source handles, writer leases, numeric projections and expression indexes                                           | Adapter state, outside the format                           |
| focus, selection, scroll, drafts, optimistic placeholders, current View                                                                                           | UI state, outside the format                                |

An EF-Reader MUST interpret canonical state without any generated object except
the required trigger behavior used for safe writes. If permitted in-file
generated state disagrees with canonical metadata or source columns, the
canonical state controls and the generated state is discarded or rebuilt.
Multi-value reverse indexes and materialized virtual results MUST remain
outside the published File in version 1.0.

An optional scalar access index has the exact name
`eidos__index__<field-id-hex>`, where the suffix is the stored Field UUID with
hyphens removed. It is a non-unique, non-partial index on exactly that Field's
quoted physical column with the column's declared collation; expressions and
additional columns are forbidden in this reserved generated namespace. A
non-reserved generated index MAY cover one or more direct stored scalar
columns (`text`, `number`, `integer`, `checkbox`, `date`, `datetime`, `url`,
or `select`), but it MUST be non-unique, non-partial, contain no expression, and
use each declared column collation; a Reader may discard it. Required metadata
indexes and Eidos trigger names are those declared or templated in Sections 7
and 10. No other undeclared `eidos__*` object is permitted.

## 16. CSV Boundary (Informative)

CSV is not Eidos File canonical state and cannot by itself recreate stable IDs,
NULL versus empty Text, Formula or Lookup definitions, Relation endpoints,
timestamps, Field settings, or Views. Exact round-trip therefore uses the
`.eidos` file. The optional display-export and typed-import binding is
specified by Eidos Runtime 1.0 and follows RFC 4180; this format assigns no
second canonical CSV representation.

## 17. External Version-Management Boundary

A version manager, including Graft, sees one published, self-contained
`.eidos` main database. It may classify canonical changes as follows:

| Object                                          | Meaning                                                     |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `eidos__tables`, `eidos__fields`                | table/field schema, Record Label role, and physical mapping |
| `eidos__relation_fields`                        | Relation definitions and deletion policies                  |
| `eidos__formula_fields`, `eidos__lookup_fields` | virtual-field definitions                                   |
| `eidos__views`                                  | query and layout metadata                                   |
| user-named tables                               | source rows, Select text, Multi-select JSON, Relation JSON  |

The file format does not define checkout, merge, locking, or replacement.
Whole-file restore and durable publication are Adapter operations; logical
merge and post-merge validation are Runtime operations. Stable IDs and the
canonical/raw distinction above are the complete boundary a version manager
may rely on. No Graft-specific table or sidecar is part of Eidos File Format 1.0.

## 18. File Validation

File validation has three format-owned levels:

1. **identity** checks the SQLite header, UTF-8 encoding, application ID,
   `user_version`, typed singleton meta row, format version, and every
   required feature `(name,version)` tuple and version-selected config schema
   before exposing canonical rows;
2. **structural** additionally checks the required metadata objects against
   Section 7, foreign keys, physical-name mappings, user-table columns,
   affinities, collations, STRICT/row organization, exact subtype-row and
   `nullable` matrices, system roles, Record Label eligibility, and required
   Relation/row-ID trigger behavior, plus Section 15 index restrictions;
3. **content** additionally streams every canonical raw cell and JSON document,
   validates Sections 5 and 8–10, verifies stable-ID references whose targets
   are format objects, and runs SQLite integrity checks.

An unresolved Relation target is a content warning, not a format error.
Formula grammar, Lookup type/DAG rules, Query Document meaning, and standard
layout meaning are reported by the owning Runtime or UI validator and do not
change an otherwise preserved EF-level storage shape.
At EF level, reference validation is limited to normalized metadata columns
and File-owned JSON shapes whose reference locations this specification
defines. Field IDs embedded in Runtime Query Documents or UI layout documents
are verified by their owning validators, not guessed by an EF validator.

Diagnostics MUST have a stable code, severity (`fatal`, `error`,
`warning`, or `info`), and, when known, File/Table/Field/Row/View ID plus a
metadata or JSON path. A caller-supplied positive diagnostic limit bounds
output; the result reports `truncated=true` when more diagnostics exist.
Ordering is severity, code, stable IDs, then path, all ascending by BINARY
bytes. Fatal means safe inspection cannot continue; error forbids an EF-Writer
commit; warning does not.

Core 1.0 diagnostic codes and severities are exact:

| Stage      | Code                                                                                                 | Severity and condition class                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| identity   | `file-not-sqlite`                                                                                    | fatal: input cannot be safely opened as SQLite 3                               |
| identity   | `file-identity-invalid`                                                                              | error: application ID, user version, meta singleton, or File ID identity fails |
| identity   | `file-format-unsupported` / `file-feature-unsupported`                                               | error: version or required feature is unsupported                              |
| structural | `file-core-object-invalid` / `file-metadata-invalid`                                                 | error: required/forbidden core object or typed metadata/JSON shape fails       |
| structural | `file-foreign-key-invalid` / `file-physical-schema-invalid`                                          | error: declared reference or user-table/column/STRICT/row organization fails   |
| structural | `file-definition-invalid` / `file-trigger-invalid` / `file-index-invalid` / `file-extension-invalid` | error: corresponding definition/object rule fails                              |
| content    | `file-cell-invalid` / `file-json-invalid` / `file-reference-invalid`                                 | error: corresponding canonical raw value or stable metadata reference fails    |
| content    | `file-unresolved-relation`                                                                           | warning: a canonical Relation target is unresolved                             |
| content    | `file-integrity-invalid`                                                                             | fatal for `quick_check` other than `ok`; error for a `foreign_key_check` row   |

A Table/Field/Row/View-specific finding includes every safely known stable ID;
malformed identity instead uses its metadata/JSON path. A content-cell finding
includes Table, Field, and Row IDs, and an unresolved Relation includes those
same three. File-level findings omit inapplicable IDs. Optional members sort
absent before present. A supported required extension may add only
`x.<vendor>.<code>`, with both tokens using Section 20's extension-token
grammar. Core validators emit no other code.

Structural discovery MUST read `sqlite_schema` as data. It MUST NOT select
from arbitrary file-defined views, execute file-defined virtual tables, or
cause undeclared triggers to run. Unknown objects in `eidos__*` are errors
unless this format version declares them. Extension objects are allowed only
under Section 20.

Content validation includes these commands; the first returns no rows and the
second returns exactly `ok`:

```sql
PRAGMA foreign_key_check;
PRAGMA quick_check;
```

An EF-Writer MUST run affected structural/content checks before commit and
roll back on error. A newly created or published File MUST pass all three
levels. Eidos Runtime 1.0 defines the public validation operation and adds
semantic/full levels; Eidos Adapter 1.0 defines the safe-open sequence and
platform resource controls.

## 19. Security Considerations

Every Eidos File is untrusted input. EF-Readers and EF-Writers MUST disable
trusted schema and extension loading, bind values, quote physical identifiers,
refuse `ATTACH` and `writable_schema` in format operations, and avoid
executing undeclared schema objects. Required core triggers are regenerated
from canonical metadata rather than trusted as source code. An unknown trigger
attached to a core or user table makes the file unsafe to write.

Format hard limits are 1,024 UTF-8 octets for a table, field, view, or file
title; 4,096 UTF-8 octets for Formula source; 10,000 elements in one
Multi-select, Relation, or File array; and 16 MiB for one canonical JSON cell.
The smaller limits encoded directly in Section 7 also apply. A value over a
hard limit is not Eidos File Format 1.0 content. There is no universal total-file or
row-count limit; an Adapter or Runtime advertises lower operational limits and
returns a bounded error rather than partially reading a value.

URI validation never grants authority to fetch, reveal, decode for display, or
write a resource. Relative File URIs cannot escape the File's scoped asset
root. A Data URL is untrusted active input despite containing no network
location; its media type, Base64, decoded size, decoder cost, and presentation
isolation remain bounded. Security bootstrap, authorizers, defensive mode,
busy/deadline policy, Worker isolation, permissions, and asset authorization
are owned by Eidos Adapter 1.0.

## 20. Extensibility and Versioning

`eidos__meta.format_major/minor` define persisted semantics;
`PRAGMA user_version` identifies this exact physical schema. A feature version
is an opaque, case-sensitive BINARY token; implementations MUST NOT infer
SemVer compatibility. Support means recognizing the exact `(name,version)`
tuple and validating `config_json` under the schema selected by that version.
An unknown tuple, unsupported version, or unsupported/invalid required config
with `required=1` makes EF-Reader and EF-Writer conformance unavailable until
the implementation supports it. A tool MAY expose an explicitly uninterpreted
byte copy, but MUST NOT label that result canonical Eidos data.

An optional `required=0` feature MUST be semantically ignorable by an
implementation that does not know it. Unknown optional feature state must be
preserved byte-semantically or the Writer refuses the write. A feature that
changes a core raw value, query result, mutation postcondition, or other
non-ignorable meaning MUST be `required=1`.

Extensions use unregistered `x__<vendor>__*` names, where `vendor` is a
non-empty lowercase ASCII token of letters, digits, and underscores beginning
with a letter. An `x__*` table registered in `eidos__tables` is a user Table,
not an extension object. A third-party feature name MUST use
`x__<vendor>__<feature>`, where `feature` follows the same token grammar. Every
unregistered `x__<vendor>__*` schema object MUST have at least one feature row
with that exact vendor prefix; an orphan vendor object is a structural error.
An extension MUST NOT create a new `eidos__*` object, attach a trigger to a
core/user table, shadow a user physical name, or reinterpret a core raw value.
Extension tables and indexes are canonical only for the declared extension.

A compatible clarification may add examples and tests but cannot change an
existing valid byte/value interpretation. Any persisted meaning change
requires a new File Format version. Upper-layer API, port, and interaction
versions are independent as defined by the suite index.

## 21. Media Type Registration Template

This subsection is a registration template and does not claim that the vendor
media type has been registered with IANA.

```text
Type name: application
Subtype name: vnd.eidos+sqlite3
Required parameters: N/A
Optional parameters: N/A
Encoding considerations: binary
Security considerations: Section 19 and +sqlite3 considerations apply.
Interoperability considerations: SQLite 3 database with application ID
  0x45494453 and Eidos File Format 1.0 schema.
Published specification: this document
Applications: local-first multidimensional table editors and data tools
Fragment identifier considerations: N/A
Magic numbers: "SQLite format 3\\0" at offset 0; 0x45494453 at offset 68
File extension: .eidos
Intended usage: COMMON
Change controller: Eidos Project
```

## 22. File Conformance Tests

An EF conformance manifest records implementation name/version, SQLite
version, conformance label, supported optional features, and each vector ID.
At minimum, shared fixtures and executable SQL MUST cover:

- exact Section 7 DDL and empty-file creation;
- atomic creation/rollback, header, application ID, version, singleton, and
  required-feature tuple/version/config negatives;
- canonical UUIDv7 in every ID position, extra-hyphen and U+0000-suffix
  negatives, and direct Relation-to-Row joins with no representation conversion;
- fixed date/instant parsing, malformed 24-octet and year-0000 negatives,
  BINARY ordering, and SQLite date-function round-trip;
- JCS objects, arrays, Unicode, duplicate-key, non-finite, and size negatives;
- Chinese, spaces, keywords, quotes, exact physical/display equality,
  ASCII-NOCASE duplicate rejection, system-column collision rejection,
  1,024-octet rejection, reserved table-prefix rejection, `x__` user Tables,
  and case-only table rename;
- ordinary STRICT rowid and `STRICT, WITHOUT ROWID` user tables with identical
  canonical Row IDs;
- every subtype-row/physical-name/`nullable` matrix branch and every stored
  Field declaration and boundary raw value, including int64
  extrema, binary64 finite extrema and negative-zero normalization, NULL/empty
  distinctions, and File objects; File vectors include valid/unresolved
  relative and `https:` references, canonical inline images, Base64 alphabet/
  padding/size/media-type mismatch negatives, traversal after percent-decoding,
  and the 1 MiB inline-image boundary;
- Select without Option IDs, unconfigured raw values, and ordered unique
  Multi-select strings;
- forward Relation shape/cardinality, distinct INSERT/UPDATE validator names,
  inverse definition shape/lifecycle, immutable Row ID, and set-based
  restrict/detach/preserve behavior for self, cyclic, and multi-row deletes;
- exact Formula/Lookup/View definition storage without materialized results;
- exactly one EF-decidable compatible Record Label Field per Table, including
  rejection of core Lookup labels;
- immutable object IDs/`created_at`, canonical-change, no-op, rollback,
  one-operation-instant timestamps, and revision-overflow
  postconditions;
- unknown optional extension preservation, orphan extension-object rejection,
  and unknown/unsupported required feature tuple refusal;
- permitted scalar indexes and rejection of unique, partial, expression,
  multi-value, or undeclared reserved indexes;
- undeclared core objects, hostile views/triggers, malformed schemas, and
  bounded diagnostics;
- `foreign_key_check`, `quick_check`, reopen, and byte-semantic round-trip.

EF-Reader vectors never require Runtime evaluation. EF-Writer vectors compare
the reopened canonical state and validity, not SQLite page layout or
byte-for-byte database equality. Runtime, Adapter, and UI conformance vectors
are owned by their corresponding specifications.

## Appendix A. Worked Example (Informative)

The SQLite source table is directly understandable:

```sql
CREATE TABLE "Tasks" (
  "_id" TEXT COLLATE BINARY PRIMARY KEY,
  "_created_at" TEXT NOT NULL,
  "_updated_at" TEXT NOT NULL,
  "Title" TEXT,
  "Status" TEXT,
  "Tags" TEXT NOT NULL DEFAULT '[]',
  "Project" TEXT NOT NULL DEFAULT '[]',
  "Estimate" REAL
) STRICT;
```

A row can contain:

```text
Title    = "Ship format"
Status   = "In Progress"
Tags     = ["Backend","Urgent"]
Project  = ["0198c72d-82b5-7968-b163-98be4b747702"]
Estimate = 8.5
```

Metadata may add persisted virtual-field definitions:

```text
Projects.Budget with tax = Formula("Budget" * 1.2)
Tasks.Project budget     = Lookup(Project, Budget with tax, first)
Tasks.Label              = Formula("Title" || "Project budget")
```

`Tasks.Title` and `Projects.Name` are ordinary user Fields selected by their
Tables' `label_field_id`; they are not fixed system Fields. The Relation cell
continues to store only its Row-ID array. Resolution of that array and
evaluation of the definitions belong to Eidos Runtime 1.0.

Only stored Fields and a forward Relation appear in
`PRAGMA table_xinfo("Tasks")`. Formula and Lookup appear only in Eidos
metadata; no materialized result column is canonical.

Renaming `Status` to `State` renames the real SQLite column but preserves the
Field ID and atomically rewrites parsed Formula reference nodes. An option
rename is a Runtime operation, not a second catalog-only raw encoding.

## Appendix B. Why Field IDs Remain (Informative)

Human-readable physical names optimize inspectability. They are still mutable
locations: users rename them, name conflicts must be resolved before commit,
and two branches can rename the same field differently. Lookup, inverse
Relation, View, Formula identity, dependency diagnostics, and logical diff need
identity that survives those operations.

The Field ID supplies that identity but does not obscure storage. The SQLite
column is exactly the display name; metadata connects that column to a stable
Field ID. Human-authored Formula source intentionally uses quoted Field names.
A rename keeps the ID and atomically rewrites only parsed Formula reference
nodes; a merge chooses the final Field name before reserializing affected
Formula source.

## Appendix C. Reproducible SQLite Verification (Informative)

The final storage choices and every complete or substituted SQL template were
rechecked with system SQLite 3.53.1 on 2026-07-21. All schema, quoted Chinese,
identifier, temporal, Relation, rename, trigger, STRICT, rowid, and
`WITHOUT ROWID` examples in this document executed successfully;
`PRAGMA foreign_key_check` returned no rows and `PRAGMA quick_check` returned
`ok`. Duplicate Relation input and `restrict` deletion returned their required
errors; `detach` retained array order; SQLite rename rewrote the tested trigger
references. The SQL uses no feature newer than the required SQLite 3.45
baseline. The performance measurements below were recorded on 2026-07-20.

For the row-organization measurement, two databases used 4,096-byte pages and
the same 200,000 monotonically ordered UUIDv7-like canonical TEXT keys plus
Text, Number, and Datetime columns. The only DDL difference was:

```sql
CREATE TABLE rows(_id TEXT PRIMARY KEY COLLATE BINARY,
  label TEXT, score REAL, created TEXT) STRICT;
-- versus
CREATE TABLE rows(_id TEXT PRIMARY KEY COLLATE BINARY,
  label TEXT, score REAL, created TEXT) STRICT, WITHOUT ROWID;

WITH RECURSIVE seq(i) AS (
  SELECT 1 UNION ALL SELECT i+1 FROM seq WHERE i<200000
)
INSERT INTO rows
SELECT printf('%08x-%04x-7%03x-8%03x-%012x',
              i>>28,(i>>12)&65535,i&4095,(i>>8)&4095,i),
       'Record '||i, i/10.0, '2025-01-01T00:00:00.000Z'
FROM seq;
```

After identical inserts, `ANALYZE`, and `VACUUM`, reproduce size/plans with:

```sh
sqlite3 ordinary.db "SELECT name,sum(pgsize) FROM dbstat GROUP BY name"
sqlite3 without.db  "SELECT name,sum(pgsize) FROM dbstat GROUP BY name"
sqlite3 ordinary.db "EXPLAIN QUERY PLAN SELECT label FROM rows WHERE _id=?"
sqlite3 without.db  "EXPLAIN QUERY PLAN SELECT label FROM rows WHERE _id=?"
```

The ordinary file was 27,541,504 bytes: 18,444,288 for the row table plus
9,084,928 for its UUID unique index. `WITHOUT ROWID` was 17,829,888 bytes and
used its PRIMARY KEY directly, a 35.3% total reduction. Point lookup used the
UUID index/PRIMARY KEY in both. This supports the Section 8.1 default; it is not
a universal performance claim, so both organizations remain conforming.

For Relation access, 100,000 source rows each stored three canonical Row IDs
(300,000 edges). The cold and warm queries were:

```sql
CREATE TABLE sources(_id TEXT PRIMARY KEY COLLATE BINARY,
  rel TEXT NOT NULL CHECK(json_valid(rel) AND json_type(rel)='array'))
  STRICT, WITHOUT ROWID;

WITH RECURSIVE seq(i) AS (
  SELECT 1 UNION ALL SELECT i+1 FROM seq WHERE i<100000
)
INSERT INTO sources
SELECT printf('%08x-%04x-7%03x-8%03x-%012x',
              i>>28,(i>>12)&65535,i&4095,(i>>8)&4095,i),
       json_array(
         printf('00000000-0000-7000-8000-%012x',i%10000),
         printf('00000000-0000-7000-8000-%012x',(i+1)%10000),
         printf('00000000-0000-7000-8000-%012x',(i+2)%10000))
FROM seq;

SELECT count(*)
FROM sources AS s, json_each(s.rel) AS j
WHERE j.value=:target;

CREATE TABLE reverse_edges(source_id TEXT,target_id TEXT,position INTEGER,
  PRIMARY KEY(target_id,source_id,position)) STRICT, WITHOUT ROWID;
INSERT INTO reverse_edges
SELECT s._id,j.value,CAST(j.key AS INTEGER)
FROM sources AS s,json_each(s.rel) AS j;

SELECT count(*) FROM reverse_edges WHERE target_id=:target;
```

Both returned 30. The cold plan scanned sources plus `json_each` and took
approximately 32.4 ms; the Host-private `(target_id,source_id,position)`
PRIMARY KEY lookup took approximately 0.064 ms on the same run. Creation of the
300,000-edge cache took approximately 236 ms. This is why the readable JSON
array remains canonical while a warm reverse index is recommended and
disposable.

## Normative References

- [BCP 14](https://www.rfc-editor.org/info/bcp14)
- [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339)
- [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986)
- [RFC 2397: The `data` URL scheme](https://www.rfc-editor.org/rfc/rfc2397)
- [RFC 4648: Base-N encodings](https://www.rfc-editor.org/rfc/rfc4648)
- [RFC 6838](https://www.rfc-editor.org/rfc/rfc6838)
- [RFC 7493 — I-JSON](https://www.rfc-editor.org/rfc/rfc7493)
- [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259)
- [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785)
- [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562)
- [SQLite ALTER TABLE](https://www.sqlite.org/lang_altertable.html)
- [SQLite Date And Time Functions](https://www.sqlite.org/lang_datefunc.html)
- [SQLite Datatypes](https://www.sqlite.org/datatype3.html)
- [SQLite Database File Format](https://www.sqlite.org/fileformat.html)
- [SQLite Foreign Keys](https://www.sqlite.org/foreignkeys.html)
- [SQLite JSON Functions](https://www.sqlite.org/json1.html)
- [SQLite Keywords and Identifier Quoting](https://www.sqlite.org/lang_keywords.html)
- [SQLite Built-in Aggregate Functions](https://www.sqlite.org/lang_aggfunc.html)
- [SQLite PRAGMA Statements](https://www.sqlite.org/pragma.html)
- [SQLite Rowid Tables](https://www.sqlite.org/rowidtable.html)
- [SQLite STRICT Tables](https://www.sqlite.org/stricttables.html)
- [SQLite WITHOUT ROWID](https://www.sqlite.org/withoutrowid.html)
- [SQLite Expressions](https://www.sqlite.org/lang_expr.html)

## Informative References

- [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180)
- [SQLite as an Application File Format](https://www.sqlite.org/appfileformat.html)
- [SQLite Security](https://www.sqlite.org/security.html)
- [SQLite Limits](https://www.sqlite.org/limits.html)
- [SQLite Online Backup API](https://www.sqlite.org/backup.html)
- [IANA `+sqlite3`](https://www.iana.org/assignments/media-type-structured-suffix/media-type-structured-suffix.xhtml)
- [W3C Specification Guidelines](https://www.w3.org/TR/qaframe-spec/)
