# Eidos CLI reference

## Contents

- [Invocation](#invocation)
- [CLI upgrades](#cli-upgrades)
- [Inspection and creation](#inspection-and-creation)
- [Compact agent context](#compact-agent-context)
- [Query](#query)
- [Atomic matched update](#atomic-matched-update)
- [Row mutations](#row-mutations)
- [Schema mutations](#schema-mutations)
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

## Schema mutations

Every schema operation takes one JSON object and one expected revision. Add `--dry-run` to execute the same transaction and roll it back.

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

Formula, Lookup, and inverse Relation creation is intentionally rejected in the alpha.

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

Important codes include `invalid-request`, `invalid-value`, `invalid-query`, `not-found`, `conflict`, `stale-revision`, and `validation-failed`. Treat all as terminal for the attempted mutation. Re-inspect and re-plan after `stale-revision`; do not replay the old write automatically.
