# Eidos File 1.0 format

An Eidos File is a SQLite 3 application file with the `.eidos` extension. The
canonical, implementation-independent contract is
[Eidos File 1.0](https://github.com/mayneyao/eidos/blob/main/docs/specs/eidos-file-1.0.md).

## File identity

| Property                     | Value                           |
| ---------------------------- | ------------------------------- |
| Extension                    | `.eidos`                        |
| Media type                   | `application/vnd.eidos+sqlite3` |
| SQLite header                | `SQLite format 3\0`             |
| `PRAGMA application_id`      | `0x45494453` (`EIDS`)           |
| `PRAGMA user_version`        | `1`                             |
| `eidos__meta.format_version` | `1.0`                           |

Readers verify all of these identities and the singleton `eidos__meta` row.
The extension alone is not sufficient. Every persistent ID is the same RFC
9562 UUIDv7 representation in SQLite, APIs, JSON, and CSV: lowercase,
hyphenated, 36-character `TEXT COLLATE BINARY`. BLOB, uppercase, braced, URN,
and 32-character forms are not canonical IDs.

Every connection enables `foreign_keys` and disables `trusted_schema`.

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
└── user-named STRICT, WITHOUT ROWID tables
```

`eidos__tables.name` and `eidos__fields.name` are display names.
`physical_name` is the exact quoted SQLite identifier. A new or explicitly
renamed object first uses its display name verbatim—even when it contains
spaces, Chinese text, punctuation, or an SQL keyword. A stable UUID suffix is
added for a SQLite identifier collision and for reserved system Field names.
A Table display name beginning with `sqlite_`, `eidos__`, or `x__` uses the
frozen readable fallback `t__<first-8-id-hex>__<display-name>` (with the
specified bounded collision extension), so the physical object never enters a
reserved namespace.

Field names are unique within a Table under SQLite `NOCASE`. Field IDs remain
stable across rename and are used by Views, Lookup, inverse Relation, and the
dependency graph.

## User tables and values

Each user Table is `STRICT, WITHOUT ROWID` and contains:

```sql
"_id"         TEXT COLLATE BINARY PRIMARY KEY CHECK(length("_id") = 36)
"_created_at" TEXT NOT NULL
"_updated_at" TEXT NOT NULL
```

The hidden SQLite `rowid` is never Eidos identity. Every Table has exactly one
Record Label Field, but there is no required `Title` or `Name` Field.

| Field            | Canonical stored value           |
| ---------------- | -------------------------------- |
| Text, URL        | `TEXT` or `NULL`                 |
| Number           | finite `REAL` or `NULL`          |
| Integer          | `INTEGER` or `NULL`              |
| Date, datetime   | canonical `TEXT` or `NULL`       |
| Checkbox         | `0`, `1`, or `NULL`              |
| Select           | option name as `TEXT`            |
| Multi-select     | ordered unique JSON string array |
| File             | ordered JSON object array        |
| JSON             | canonical JSON text              |
| Forward Relation | ordered unique JSON UUID array   |

A date is exactly `YYYY-MM-DD`. A datetime and every `created_at` /
`updated_at` value use the fixed UTC form `YYYY-MM-DDTHH:MM:SS.sssZ`. API and
CSV offset inputs are normalized to UTC before storage; sub-millisecond input
is rejected unless the caller explicitly requests a lossy conversion. These
fixed-width strings use SQLite `BINARY` ordering, so lexical order is
chronological order.

Select options have no IDs or separate value table. The optional display
catalog lives in `settings_json` as `{ "options": [{ "name", "color" }] }`;
unconfigured raw cell values remain valid.

A File item contains canonical UUIDv7 `id`, non-empty `name`, RFC 6838
`mediaType`, `uri`, and `size` as a non-negative int64 decimal string. Unknown
members are preserved. Relative URIs resolve from the directory containing the
Eidos File, use `/`, and cannot be absolute or escape with `..`; HTTPS URIs are
also allowed. The bytes remain external to the SQLite cell. Asset existence,
authorization, transfer, resolution, and garbage collection belong to the
Adapter.

## Relation, Formula, and Lookup

A forward Relation is a real JSON source column. Its subtype row records the
target Table, cardinality, and `restrict`, `detach`, or `preserve` deletion
policy. An inverse Relation is a virtual reverse projection and stores no
mirror column or global edge table.

Formula source is one deterministic expression. Every Field reference uses
the exact current Field name as a double-quoted identifier, for example:

```sql
"Estimate" * 1.2
coalesce("Project budget", 0)
```

Field rename parses Formula source and rewrites only reference nodes; string
literals are unchanged. Formula, Lookup, and inverse Relation results are
virtual. Their file-wide Field-ID dependency graph must be acyclic, and Runtime
queries evaluate only requested transitive dependencies with set-based SQL.

## Queries and writes

View `query_json` and `layout_json` use Field IDs. Runtime projection,
filtering, multi-sort, keyset paging, grouping, and statistics operate over the
same live logical values, including Formula and Lookup results.

Every logical mutation is one transaction. It validates the optional expected
revision, updates canonical state, checks affected invariants, increments
`eidos__meta.revision` exactly once, and either commits everything or rolls it
all back.

Generated indexes, resolved labels, compiled plans, and caches are disposable
Host-private state. They are never required to interpret the `.eidos` file.

## Field capability matrix

The table below is not a screenshot or a second hand-maintained HTML table. It
opens the same self-contained `.eidos` sample offered by the editor template
picker and forces the embedded editor surface into read-only mode. Search it
here, download it, or open an editable copy from **Choose a template → Field
capability matrix**.

<div data-eidos-file-embed="field-capabilities"></div>

## Feature negotiation and extensions

Feature support is an exact, case-sensitive `(name, version)` tuple; versions
do not imply Semantic Versioning compatibility. An unsupported or invalid
required feature blocks canonical Reader and Writer conformance. Unknown
optional state must be preserved byte-semantically, otherwise the Writer must
refuse the write.

Third-party objects and features use the `x__<vendor>__*` namespace. Every
extension object needs a matching feature declaration. Extensions cannot add
`eidos__*` objects, attach triggers to core or user tables, shadow user physical
names, or reinterpret core raw values.

## Related guides

- [Build with Eidos File](build.en.md)
- [Try the Eidos File Web Editor](/)
- [Eidos File 1.0](https://github.com/mayneyao/eidos/blob/main/docs/specs/eidos-file-1.0.md)
- [Eidos Runtime 1.0](https://github.com/mayneyao/eidos/blob/main/docs/specs/eidos-runtime-1.0.md)
- [Eidos Adapter 1.0](https://github.com/mayneyao/eidos/blob/main/docs/specs/eidos-adapter-1.0.md)
- [Eidos UI 1.0](https://github.com/mayneyao/eidos/blob/main/docs/specs/eidos-ui-1.0.md)
