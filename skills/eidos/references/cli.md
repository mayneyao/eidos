# Eidos CLI reference

## Contents

- [Invocation](#invocation)
- [Agent Skill initialization](#agent-skill-initialization)
- [CLI upgrades](#cli-upgrades)
- [Inspection and creation](#inspection-and-creation)
- [Compact agent context](#compact-agent-context)
- [Query](#query)
- [Atomic matched update](#atomic-matched-update)
- [Row mutations](#row-mutations)
- [Agent-facing row commands](#agent-facing-row-commands)
- [Attachment commands](#attachment-commands)
- [Agent-facing schema commands](#agent-facing-schema-commands)
- [Runtime Formula and Lookup commands](#runtime-formula-and-lookup-commands)
- [Schema mutations](#schema-mutations)
- [View commands and mutations](#view-commands-and-mutations)
- [Validation](#validation)
- [Local web editor](#local-web-editor)
- [Logical values](#logical-values)
- [Errors](#errors)

## Invocation

Both forms are equivalent:

```bash
eidos inspect file.eidos
eidos file.eidos inspect
```

Eidos File data commands require an explicit file path; account commands and
`upgrade` do not. Interactive commands print readable key-value sections and
tables by default. Agents and scripts must pass `--json`; stdout then contains
one JSON document on success, while stderr contains one JSON error document on
failure:

```bash
eidos --json inspect file.eidos
```

Arguments containing JSON accept:

- inline JSON: `'{"Title":"Ship"}'`
- file input: `@/absolute/path/operation.json`
- stdin: `-`

## Agent Skill initialization

The Eidos Skill ships inside the CLI. It does not require Node.js, `npm`, or
`npx`:

```bash
# Install for the current Space/project.
eidos skills init

# Install for the current user and all projects.
eidos skills init --global
```

Use `--space <DIR>` (an alias for `--path <DIR>`) to initialize a different
Space. Initialization writes the standard `.agents/skills/eidos` directory and
is idempotent. If a file has been edited locally, the command stops with an
`already-exists` error; pass `--force` only when the bundled CLI version should
replace those edits.

## CLI upgrades

Upgrade a standalone installation to the latest stable release:

```bash
eidos upgrade
```

Select an exact release with `eidos upgrade --version <semver>`. The command
verifies the release checksum and the downloaded binary's version before it
replaces the current executable. It refuses downgrades unless `--force` is
explicitly passed. Windows finalizes the replacement immediately after the
running CLI process exits. Agents must run this command only when the user
explicitly requests a CLI upgrade.

## Inspection and creation

```bash
eidos --json inspect file.eidos
eidos --json tables file.eidos
eidos --json schema file.eidos
eidos --json schema file.eidos Tasks
```

`inspect` returns file identity, title, revision, counts, and capability flags. `schema` returns logical tables, fields, relations, formulas, lookups, and views. Revisions are canonical decimal strings.

Create an empty file:

```bash
eidos --json create tracker.eidos
```

Create a file with an initial table:

```bash
eidos --json create tracker.eidos \
  --table Tasks \
  --label-field Title \
  --fields '[
    {"name":"Title","type":"text","nullable":false},
    {"name":"Status","type":"select"},
    {"name":"Estimate","type":"integer"},
    {"name":"Tags","type":"multi-select"}
  ]'
```

Creation refuses to overwrite an existing path.

## Compact agent context

Combine the File revision, compact field definitions, and a bounded row query:

```bash
eidos --json context file.eidos Tasks \
  --fields Title,Status,Estimate \
  --where '{"op":"in","field":"Status","values":["todo","doing"]}' \
  --limit 50
```

Omit the table when the File has a default table or exactly one table. When
several tables exist without a default, the response lists table summaries
with `requiresTable: true`. Add `--full` to include stable schema IDs, system
fields, complete settings, relations, and views. Query options use the same
grammar as `query`.

## Query

```bash
eidos --json query file.eidos Tasks \
  --where '{"op":"eq","field":"Status","value":"doing"}' \
  --sort '[{"field":"Estimate","direction":"desc","nulls":"last"}]' \
  --fields Title,Status,Estimate \
  --limit 50 \
  --offset 0
```

Search requires explicit fields:

```bash
eidos --json query file.eidos Tasks --search ship --search-fields Title,Notes
```

Filter nodes accept `field` or `fieldId`:

```json
{"op":"and","args":[...]}
{"op":"or","args":[...]}
{"op":"not","arg":{...}}
{"op":"is-null","field":"Due"}
{"op":"is-not-null","field":"Owner"}
{"op":"eq","field":"Status","value":"done"}
{"op":"ne","field":"Status","value":"done"}
{"op":"lt","field":"Estimate","value":"5"}
{"op":"lte","field":"Estimate","value":"5"}
{"op":"gt","field":"Estimate","value":"1"}
{"op":"gte","field":"Estimate","value":"1"}
{"op":"between","field":"Estimate","lower":"2","upper":"8"}
{"op":"in","field":"Status","values":["todo","doing"]}
{"op":"contains","field":"Title","value":"CLI"}
{"op":"starts-with","field":"Title","value":"Ship"}
{"op":"ends-with","field":"Title","value":"today"}
{"op":"has-any","field":"Tags","values":["rust","agent"]}
{"op":"has-all","field":"Tags","values":["rust","agent"]}
{"op":"relation-has","field":"Owner","rowId":"019..."}
```

Rows are keyed by display names and always include `_id`. Integer values are returned as canonical decimal strings.

When a Table contains Formula, Lookup, or inverse Relation Fields, `query` and
`context` transparently use the Eidos Runtime evaluator. Derived Fields can be
projected, filtered, and sorted with the same `field`/`fieldId` query grammar;
their values are returned using Runtime logical value types.

## Atomic matched update

Use `apply` for the common read-check-update-validate loop:

```bash
eidos --json apply file.eidos - <<'JSON'
{
  "revision": "4",
  "table": "Tasks",
  "match": {"_id": "019..."},
  "expect": 1,
  "set": {"Status": "done"},
  "validate": "full",
  "returning": ["Title", "Status"]
}
JSON
```

`match` is a non-empty object of equality predicates joined with AND. `expect`
defaults to `1` and must equal the total matched row count. `set` is a non-empty
sparse values object. `validate` defaults to `full`; supported values are
`identity`, `structural`, `content`, `semantic`, and `full`. When `returning` is
omitted, the response includes `_id` plus the fields named by `set`.

The command opens one immediate transaction, evaluates the match, checks the
revision, updates all matched rows, validates the proposed state, and commits
only when validation succeeds. A stale revision or match-count mismatch makes
no change. This initial version updates existing rows only.

## Row mutations

Add one or multiple rows atomically:

```bash
eidos --json rows file.eidos add Tasks \
  --expected-revision 4 \
  --values '{"Title":"Ship CLI","Estimate":"3"}'

eidos --json rows file.eidos add Tasks \
  --expected-revision 5 \
  --values '[{"Title":"A"},{"Title":"B"}]'
```

Update one row using a sparse values object:

```bash
eidos --json rows file.eidos update Tasks 019... \
  --expected-revision 6 \
  --values '{"Status":"done"}'
```

Delete rows atomically:

```bash
eidos --json rows file.eidos delete Tasks 019... 019... --expected-revision 7
```

Successful mutations return the new `revision`. Creation also returns stable row IDs under `created[].rowId`.

## Agent-facing row commands

Use `rows upsert` when the caller has a stable business key but not a Row ID.
`--key` accepts one or more stored Field names or IDs; `--values` accepts one
object or an array of objects:

```bash
eidos --json rows upsert file.eidos \
  --table Tasks \
  --key "External ID" \
  --values '[{"External ID":"task-1","Title":"Ship CLI"},{"External ID":"task-2","Title":"Write docs"}]' \
  --expected-revision 8 \
  --dry-run
```

Each key must be non-null, refer to a stored user Field, and match at most one
existing row. The response includes `plan`, with one `create` or `update`
entry per input. Duplicate input keys, ambiguous existing matches, and all
request or coercion failures leave the File unchanged. Planned create Row IDs
are ephemeral; use the IDs returned by the committed apply.

Use `rows mutate` for a mixed batch in one Table:

```bash
eidos --json rows mutate file.eidos \
  --table Tasks \
  --expected-revision 8 \
  --changes '[
    {"kind":"update","rowId":"019...","values":{"Status":"done"}},
    {"kind":"create","clientKey":"task-3","values":{"External ID":"task-3","Title":"Review"}},
    {"kind":"delete","rowId":"019..."}
  ]'
```

The changes use the Runtime `RowChange` shape and commit atomically. Add
`--dry-run` to inspect the result while rolling back the transaction. Use the
existing `rows add/update/delete` commands when separate operations or exact
Row IDs are already part of the caller's plan.

## Attachment commands

Use the attachment commands for local File-field resources instead of writing
entry JSON through `rows update`:

```bash
eidos --json attachment import file.eidos \
  --table Tasks --row 019... --field Files \
  --source /absolute/path/report.pdf \
  --expected-revision 8

eidos --json attachment attach file.eidos \
  --table Tasks --row 019... --field Files \
  --uri assets/existing.pdf \
  --expected-revision 9

eidos --json attachment detach file.eidos \
  --table Tasks --row 019... --field Files \
  --entry 019... \
  --expected-revision 10

eidos --json attachment verify file.eidos --diagnostics-limit 100
```

`import` and `attach` append by default and accept repeated `--source` or
`--uri` flags. `--replace` replaces the entire selected cell but retains the
old physical files. `detach` accepts repeated `--entry` values or `--all` and
also retains physical files. `verify` scans all File Fields plus the managed
`assets/` tree; it exits nonzero for broken references and reports unreferenced
managed files as warnings.

See [attachments.md](attachments.md) for the storage model, rollback behavior,
path restrictions, limits, and recovery rules.

## Agent-facing schema commands

Use these commands for common schema intent. Table and Field references may be
display names or stable IDs; the JSON response includes the normalized
operation with stable IDs and the committed or planned revision:

```bash
eidos --json field add file.eidos \
  --table Tasks --name Due --type date --dry-run

eidos --json table create file.eidos \
  --name People \
  --label-field Name \
  --fields '[{"name":"Name","type":"text","nullable":false}]'

eidos --json relation add file.eidos \
  --table Tasks --name Owners --target-table People \
  --cardinality many --on-delete detach
```

The lifecycle commands are `table rename`, `table delete`, `field rename`,
and `field delete`. `field delete` accepts `--table` to disambiguate a name
and `--replacement-label-field` when deleting the current record-label Field.
All schema intent commands accept `--expected-revision` and `--dry-run`.
When the expected revision is omitted, the CLI uses the revision read when the
command starts. Formula and Lookup Fields use the canonical TypeScript Runtime
for preflight, dependency checks, and commit; `field add --type formula|lookup`
also accepts their Runtime definitions. `table create` can include Formula
fields in its initial field array; Relation and Lookup fields are added after
their referenced Tables/Fields exist.

## Runtime Formula and Lookup commands

Preview a Formula without changing the File. `--row-ids` is optional; when it
is present, the response contains sample values for those exact rows:

```bash
eidos --json formula preview file.eidos \
  --table Tasks \
  --name Total \
  --formula '"Estimate" * 2' \
  --type integer \
  --row-ids 019...
```

Create, update, or delete a Formula:

```bash
eidos --json formula add file.eidos \
  --table Tasks --name Total \
  --formula '"Estimate" * 2' --type integer \
  --expected-revision 8 --dry-run

eidos --json formula update file.eidos Total \
  --table Tasks --formula '"Estimate" + 1' --type integer \
  --expected-revision 8

eidos --json formula delete file.eidos Total \
  --table Tasks --expected-revision 9 --confirm-lossy
```

Formula result types are `text`, `number`, `integer`, `checkbox`, `date`,
`datetime`, and `url`. Runtime preflight returns the plan classification,
dependencies, diagnostics, and expiry; a non-dry-run command binds the commit
to that plan and the expected revision.

Formula accepts SQLite-spelled expressions (`||`, `IS NULL`, restricted
`CAST`, `IIF`, and searched `CASE`) and this fixed SQLite 3.45 scalar function
whitelist:

```text
ABS CEIL CEILING CHAR COALESCE CONCAT CONCAT_WS DATE DATETIME FLOOR FORMAT GLOB HEX
IFNULL IIF INSTR JULIANDAY LENGTH LIKE LOWER LTRIM MAX MIN NULLIF OCTET_LENGTH
PRINTF QUOTE REPLACE ROUND RTRIM SIGN STRFTIME SUBSTR SUBSTRING TIME TIMEDIFF
TRIM TYPEOF UNICODE UNIXEPOCH UPPER
```

It does not accept arbitrary SQL, aggregate/window functions, Host UDFs, or
former Eidos-only aliases such as `IF`, `IS_NULL`, and `DATE_ADD_DAYS`.

Create, update, or delete a Lookup after the source Relation and target Field
have stable IDs. Names are resolved by the CLI:

```bash
eidos --json lookup add file.eidos \
  --table Tasks --name OwnerScore \
  --relation-field Owners --target-field Score \
  --aggregate sum --expected-revision 10

eidos --json lookup update file.eidos OwnerScore \
  --table Tasks --relation-field Owners --target-field Score \
  --aggregate values --distinct --expected-revision 11

eidos --json lookup delete file.eidos OwnerScore \
  --table Tasks --expected-revision 12 --confirm-lossy
```

Lookup aggregates are `values`, `first`, `count`, `sum`, `average`, `min`, and
`max`. `--distinct` requests distinct values where the aggregate supports it.
Runtime validates relation ownership, target-table membership, aggregate/type
compatibility, and cross-Table dependency cycles. Formula and Lookup Fields
are read-only in row mutation commands. Deleting one is explicitly lossy:
`--dry-run` shows the plan, while a real deletion requires `--confirm-lossy`.

## Schema mutations

Every schema operation takes one JSON object and one expected revision. Add `--dry-run` to execute the same transaction and roll it back.
When a Runtime-backed Formula/Lookup deletion is explicitly lossy, add
`--confirm-lossy` only for the real commit after reviewing the dry-run plan.

IDs returned in a dry-run `createdObjects` array are ephemeral planning IDs. They will differ from IDs allocated by the real apply and must never be stored or used in later commands. Read actual IDs from the apply result.

```bash
eidos --json schema-apply file.eidos \
  --expected-revision 8 \
  --dry-run \
  --op '{"kind":"create-field","table":"Tasks","name":"Owner","type":"text"}'
```

Supported operations:

```json
{"kind":"create-table","name":"People","fields":[{"name":"Name","type":"text","nullable":false}],"labelField":"Name"}
{"kind":"create-field","table":"Tasks","name":"Due","type":"date"}
{"kind":"create-field","table":"Tasks","field":{"name":"Due","type":"date"}}
{"kind":"rename-table","table":"Tasks","name":"Work"}
{"kind":"rename-field","table":"Tasks","field":"Due","name":"Deadline"}
{"kind":"delete-field","table":"Tasks","field":"Deadline"}
{"kind":"delete-table","table":"Archive"}
{"kind":"set-file-title","title":"Work Tracker"}
{"kind":"set-default-table","table":"Tasks"}
{"kind":"set-default-table","table":null}
```

Forward Relation field:

```json
{
  "kind": "create-field",
  "table": "Tasks",
  "name": "Owners",
  "type": "relation",
  "definition": {
    "direction": "forward",
    "targetTable": "People",
    "cardinality": "many",
    "onDelete": "detach"
  }
}
```

Inverse Relation creation remains outside the high-level CLI intent surface.
Formula and Lookup creation is supported by the Runtime-backed commands above.

## View commands and mutations

### Agent-facing View commands

Prefer these commands for normal Agent requests. The CLI resolves Table, View,
and Field names, builds standard View layout JSON, chooses the next position,
and commits the resulting Runtime mutation atomically:

```bash
eidos --json view list file.eidos
eidos --json view inspect file.eidos "By status"

eidos --json view create file.eidos \
  --table Tasks \
  --name "By status" \
  --type kanban \
  --group-by Status

eidos --json view create file.eidos \
  --table Tasks \
  --name "Delivery calendar" \
  --type calendar \
  --date-by Due \
  --where '{"op":"is-not-null","field":"Due"}' \
  --sort '[{"field":"Due","direction":"asc"}]'
```

Use `--dry-run` to produce the resolved operation without changing the File:

```bash
eidos --json view create file.eidos \
  --table Tasks --name "By status" --type kanban \
  --group-by Status --dry-run
```

`view update` accepts `--name`, `--type`, `--where`, `--sort`, `--fields`,
`--hide-fields`, `--show-fields`, `--group-by`, `--date-by`, `--card-fields`,
`--cover-by`, `--card-size`, and Form presentation options. `view delete`
accepts a View name or stable ID and also supports `--dry-run`.

The standard type-specific options are:

- `grid`: `--fields`, `--hide-fields`, `--where`, and `--sort`.
- `gallery`: `--fields`, `--hide-fields`, `--card-fields`, `--cover-by`, and `--card-size`.
- `kanban`: gallery options plus `--group-by` and `--hide-empty-groups`.
- `calendar`: `--date-by`.
- `form`: `--fields`, `--hide-fields`, `--title`, `--description`, `--submit-label`, and `--success-message`.

All Field references may be display names or stable IDs. The response
contains `resolved`, the canonical low-level `request`, and `result`. A
dry-run result has `createdIdsAreEphemeral: true`; never reuse its generated
View ID. The command accepts both `view create file.eidos` and
`file.eidos view create` forms.

### Low-level View mutation

Use `schema` first and keep the current revision plus the stable Table, View,
and Field IDs. `view-apply` accepts the exact Runtime `ViewMutationRequest` and
commits all changes in one revision-checked transaction:

```bash
eidos --json view-apply file.eidos - <<'JSON'
{
  "expectedRevision": "8",
  "changes": [{
    "kind": "create-view",
    "clientKey": "calendar",
    "tableId": "019...",
    "name": "Calendar",
    "type": "calendar",
    "query": {},
    "layout": {"dateField": "019..."},
    "position": "1"
  }]
}
JSON
```

For Calendar, choose a same-Table `date` or `datetime` Field ID. The system
created-time or updated-time Field ID is also valid when the intended calendar
uses those values. If no suitable Field exists, create one first with
`schema-apply`, read its real ID from the result/schema, then create the View.

Update, reorder, and delete use stable View IDs:

```json
{"expectedRevision":"9","changes":[{"kind":"update-view","viewId":"019...","patch":{"name":"Schedule","position":"0"}}]}
{"expectedRevision":"10","changes":[{"kind":"delete-view","viewId":"019..."}]}
```

Create positions are required canonical int64 strings. Reordering is explicit:
submit one `update-view` position patch per affected View in the same request.
Saved query filter/sort references and standard layout field references must be
stable Field IDs, not display names. Unknown View types and layout keys remain
preserved without interpretation by the CLI Runtime layer.

## Validation

```bash
eidos --json validate file.eidos --level identity
eidos --json validate file.eidos --level structural
eidos --json validate file.eidos --level content
eidos --json validate file.eidos --level full --diagnostics-limit 100
```

The process exits nonzero when `valid` is false.

## Local web editor

`serve` hosts the full Eidos File web editor for one file over HTTP, with the
UI embedded in the binary. Mutations committed in the browser write straight
to the file, so the revision advances while the server runs.

```bash
eidos serve file.eidos --port 8420 --open
```

The server binds `127.0.0.1` by default and is available on macOS, Linux, and
Windows. On a trusted private network, `--lan` binds one detected private
interface and prints a paired browser URL. Use `--lan --host <ip>` to select an
exact RFC 1918, link-local, CGNAT/Tailscale, or IPv6 unique-local address. LAN
mode never binds a public or wildcard address.

Multiple paired browsers may edit through the same serialized Runtime writer;
committed revisions are pushed to other browsers. LAN mode is HTTP and should
not be used on an untrusted network. Prefer Serve for interactive review and
bulk edits that are easier in a grid; keep using the JSON commands for scripted
workflows.

When a private network is unavailable, `eidos serve file.eidos --relay --open`
signs in through eidos.space and publishes the loopback editor at a stable,
opaque `u-….eidos.ink` hostname. The OAuth token stays in memory and is not
included in the browser link. A later Relay serve for the same account takes
over the hostname. `--relay` and `--lan` are mutually exclusive; Relay request
bodies are limited to 4 MiB in the initial service.

## Logical values

- `text`, `url`, `select`: JSON string or `null` when nullable.
- `integer`: canonical decimal string is preferred; integral JSON numbers are accepted within the safe range.
- `number`: finite JSON number.
- `checkbox`: JSON boolean.
- `date`: `YYYY-MM-DD`.
- `datetime`: UTC instant such as `2026-07-25T12:00:00.000Z`.
- `multi-select`: unique JSON string array.
- `relation`: unique row-ID array. A one-cardinality Relation uses `[]` when unassigned and a one-item array when assigned; `nullable:false` means the stored array itself is never SQL `NULL`.
- `json`: JSON value encoded according to the format runtime.
- `file`: array of Eidos File entry objects.

Do not send values for `_id`, `_created_at`, or `_updated_at` when creating rows. Read `_id` from results.

## Errors

Errors use this shape:

```json
{ "error": { "code": "stale-revision", "message": "..." } }
```

Important codes include `invalid-request`, `invalid-value`, `invalid-query`,
`not-found`, `conflict`, `stale-revision`, `attachment-error`, and
`validation-failed`. Treat all as terminal for the attempted mutation.
Re-inspect and re-plan after `stale-revision`; do not replay the old write
automatically.
