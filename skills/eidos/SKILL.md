---
name: eidos
description: Safely inspect, query, validate, and modify open `.eidos` structured-data files, attachments, and saved Views with the agent-first Rust `eidos` CLI. Use for any request that reads or changes an Eidos File, including tables, rows, File fields, filters, relations, Views, task trackers, and revision conflicts. Never use raw SQLite writes.
---

# Eidos File

Use `eidos` as the typed transaction boundary for `.eidos` files and their File-field attachments. Use ordinary filesystem tools for standalone Markdown, and Graft for history or sync when an enclosing directory has `.graft`.

Before the first operation, run `eidos --version`. If the command is unavailable, stop and direct the user to `https://eidos.space/download#agent-setup`; do not install software without the user's request.

This Skill is bundled with the Eidos CLI, so it does not require Node.js,
`npm`, or `npx`. To initialize or update it for the current Space, run:

```bash
eidos self skill init
```

To make it available to all of the user's projects, run:

```bash
eidos self skill init --global
```

The initializer writes the standard `.agents/skills/eidos` layout. It is
idempotent and refuses to replace an edited file unless `--force` is explicit.

Always pass the global `--json` flag for structured reads, mutations, and validation. Human-readable output is the interactive default; Agent workflows must use the stable JSON contract explicitly.

## Eidos 2.0 Command Architecture

The CLI is structured into 3 core namespaces + operational namespaces:

- **`eidos file <new|inspect>`**: File lifecycle, metadata inspection, and structural validation.
- **`eidos schema <dump|apply|table|field|view>`**: Schema inspection, migrations, tables, fields (including formulas, relations, and lookups), and saved views.
- **`eidos data <query|mutate|asset>`**: Data retrieval (including `--compact` agent context), atomic row updates, batch mutations, and file-field asset management.
- **`eidos serve`**: Local web editor.
- **`eidos cloud <publish|collect|login|whoami|logout>`**: Cloud collaboration and publishing.
- **`eidos self <upgrade|skill>`**: CLI self-management and agent skill initialization.
- **`eidos plugin <install|list|search|info|uninstall|doctor>`**: Plugin installation and management.

Legacy 1.x flat commands (`eidos context`, `eidos apply`, `eidos rows`, etc.) remain supported as aliases for compatibility.

## Start with one compact context

Locate the exact file, then load only the table and fields needed using `data query --compact`:

```bash
eidos --json data query data.eidos Tasks --compact --fields Title,Status --limit 50
```

Omit the table when the File has a default or only one table. Use `--where`, `--sort`, or `--search` to narrow rows. Use `--full` only when stable schema IDs, system fields, relations, or views are needed.

## Update matched rows atomically

Prefer `data mutate` for ordinary updates. It asserts the revision and exact match count, updates all matched rows, runs validation against the proposed state, and commits only when valid:

```bash
eidos --json data mutate data.eidos - <<'JSON'
{
  "revision": "4",
  "table": "Tasks",
  "match": {"_id": "019..."},
  "expect": 1,
  "set": {"Status": "done"},
  "returning": ["Title", "Status"]
}
JSON
```

Match stable `_id` values when available. Keep `expect` exact; never broaden a zero- or multi-match result. Successful `data mutate` output already includes the new revision, returned rows, and pre-commit validation report.

## Upsert and batch rows by intent

Use `data mutate` with `--key` when the user gives a stable business key but the Agent does not have Row IDs. It accepts one object or an array, updates a single matching row, or creates it when absent:

```bash
eidos --json data mutate data.eidos \
  --table Tasks \
  --key "External ID" \
  --insert '[{"External ID":"task-1","Title":"Ship CLI","Status":"doing"}]' \
  --expected-revision 4 \
  --dry-run
```

The key must use stored, non-null Fields and identify at most one existing row.
Duplicate input keys and ambiguous matches fail without changing the File. Use
`data mutate` with a batch JSON payload when one atomic request must mix `create`, `update`, and `delete`
changes for one Table:

```bash
eidos --json data mutate data.eidos \
  --table Tasks \
  --expected-revision 4 \
  --payload '{"changes":[{"kind":"update","rowId":"019...","values":{"Status":"done"}},{"kind":"create","clientKey":"new-task","values":{"Title":"Document"}},{"kind":"delete","rowId":"019..."}]}'
```

Both commands support `--dry-run`; planned create IDs are ephemeral. Legacy `rows upsert/mutate/add/update/delete` commands remain available as hidden compatibility aliases.

## Manage attachments through the CLI

Never copy a local attachment and then hand-build its File entry. Use
`data asset import` (or `attachment import`) so the CLI owns the portable name, `assets/` destination,
UUIDv7, media type, byte count, rollback, and revision-checked cell update:

```bash
eidos --json data asset import data.eidos \
  --table Tasks --row 019... --field Files \
  --source /absolute/path/report.pdf \
  --expected-revision 4
```

Repeat `--source` to import several files in one revision. Add `--replace` only
when the user intends to replace every existing entry in that cell; detached
physical files are retained. Use `data asset attach --uri assets/name.ext`
only for a file that already exists under the directory containing the
`.eidos` file. Use `data asset detach --entry <entry-id>` to remove references,
and `data asset verify` to detect missing, changed, unsafe, conflicting, or
orphaned local assets.

Do not delete a physical asset merely because one entry was detached; another
row may still reference it. Read [references/attachments.md](references/attachments.md)
whenever the request adds, replaces, removes, moves, verifies, or repairs File
Field attachments.

## Create and manage Views by intent

Prefer `schema view` commands for normal Agent work. They resolve
Table, View, and Field names to stable IDs, choose safe default positions, and
build standard View layout metadata. Use `--dry-run` when the user needs to
review the planned View before writing it:

```bash
eidos --json schema view create data.eidos \
  --table Tasks \
  --name "By status" \
  --type kanban \
  --group-by Status \
  --dry-run
```

After the plan is understood, remove `--dry-run` to commit. Calendar uses
`--date-by`; Gallery/Kanban use `--card-fields`, `--cover-by`, and
`--card-size`; standard Views accept `--where`, `--sort`, `--fields`, and
`--hide-fields` where applicable. Use `schema view list` or `schema view inspect` when the
existing View definition matters. Use `schema apply` for low-level Runtime mutation documents.

Do not automatically retry a View mutation after `stale-revision`; re-read the
File and re-plan so the new View state is not based on stale metadata.

## Change schema by intent

Prefer `schema table` and `schema field` commands for common schema requests. They accept display names, resolve them to stable IDs, and use the same revision-checked atomic transaction as `schema apply`:

```bash
eidos --json schema field add data.eidos \
  --table Tasks \
  --name Due \
  --type date \
  --dry-run

eidos --json schema table create data.eidos \
  --name People \
  --fields '[{"name":"Name","type":"text"}]'

# Relation fields are defined directly through field add:
eidos --json schema field add data.eidos \
  --table Tasks \
  --name Owners \
  --type relation \
  --target-table People \
  --cardinality many \
  --on-delete detach

eidos --json schema table update data.eidos Tasks \
  --record-label Title \
  --content-field Notes \
  --position 1 \
  --dry-run

eidos --json schema field update data.eidos Estimate \
  --table Tasks \
  --type integer \
  --dry-run

eidos --json schema field update data.eidos Owners \
  --table Tasks \
  --cardinality one \
  --dry-run
```

Use `table update` for name, settings, record label, Markdown content Field,
position, and default-Table changes. Use `field update` for name, settings,
position, record-label selection, stored-type conversion, and atomic option
renames. Conversion uses the editor's recommended Runtime policies by default;
review the dry-run classification and add `--confirm-lossy` only when the real
commit is intentionally lossy. File Fields are never converted: use attachment
commands instead. Use `relation update` for target, cardinality, or deletion
policy changes.

Use `schema table rename/delete` and `schema field rename/delete` for simple lifecycle
changes; dry-run deletions and supply `--replacement-label-field` when removing
a Table's current record-label Field. `--expected-revision` is optional for a
single command and defaults to the revision read at command start; pass the
revision from a prior `data query`, `file inspect`, or dry-run when the mutation is part
of a multi-step plan. Use `schema apply` for low-level batch payloads.

Do not automatically retry a schema mutation after `stale-revision`; reload
schema/context and re-plan the requested change.

CLI invocations do not share Runtime mutation tokens, so there is no durable
cross-command `undo`. Recover a committed mistake from Eidos Lite/Graft history
or a known-good File copy; do not describe a dry run as an undo mechanism.

## Use Runtime Formula and Lookup intent

Formula and Lookup semantics are evaluated by the canonical Eidos Runtime, not
by ad hoc SQL or a second Rust expression engine. Use `schema field preview` before
creating a Formula when the expression or result type came from a user:

```bash
eidos --json schema field preview data.eidos \
  --table Tasks \
  --name Total \
  --formula '"Estimate" * 2' \
  --type integer \
  --row-ids 019...
```

Formula is a fixed SQLite 3.45 scalar-expression subset, not arbitrary SQL.
Use `||`, `IS NULL`, `CAST(... AS TEXT|INTEGER|REAL)`, `IIF`, and searched
`CASE`. The function whitelist is:

```text
ABS CEIL CEILING CHAR COALESCE CONCAT CONCAT_WS DATE DATETIME FLOOR FORMAT GLOB HEX
IFNULL IIF INSTR JULIANDAY LENGTH LIKE LOWER LTRIM MAX MIN NULLIF OCTET_LENGTH
PRINTF QUOTE REPLACE ROUND RTRIM SIGN STRFTIME SUBSTR SUBSTRING TIME TIMEDIFF
TRIM TYPEOF UNICODE UNIXEPOCH UPPER
```

Do not invent aliases or use former Eidos-only names such as `IF`, `IS_NULL`,
`LOWER_ASCII`, or `DATE_ADD_DAYS`. Date/time formats and modifiers must be
string literals; clock/timezone-dependent forms are rejected. For example:

```text
FORMAT('%d小时%d分钟', FLOOR("Seconds" / 3600), ROUND(("Seconds" % 3600) / 60))
```

Create or update a Formula with Runtime type checking, dependency analysis,
cycle detection, and revision-checked preflight/commit:

```bash
eidos --json schema field add data.eidos \
  --table Tasks --name Total \
  --type formula --formula '"Estimate" * 2' --result-type integer \
  --expected-revision 4 --dry-run

eidos --json schema field update data.eidos Total \
  --table Tasks --formula '"Estimate" * 3' --result-type integer \
  --expected-revision 4
```

Create a Lookup after its Relation and target Field exist. Relation and target
references may be names or stable IDs; `aggregate` is one of `values`,
`first`, `count`, `sum`, `average`, `min`, and `max`:

```bash
eidos --json schema field add data.eidos \
  --table Tasks --name OwnerScore \
  --type lookup \
  --relation-field Owners --target-field Score \
  --aggregate sum --expected-revision 5
```

`schema table create` may include Formula fields in its initial field array and is
also routed through Runtime; Relation and Lookup fields still require an
existing Table/Relation and should be added afterward.

`data query` automatically uses Runtime evaluation when a Table has
Formula, Lookup, or inverse Relation Fields. Their filters, sorts, projections,
and returned values therefore use derived values instead of null placeholders.
Formula and Lookup Fields are read-only for row mutations. Use
`schema field delete`; deletion is explicitly lossy, so
preview it first and pass `--confirm-lossy` only after confirming the impact.
Do not retry after a dependency or cycle error without replanning the schema.

## Manage plugins device-wide

Plugins are installed into the device-wide plugin catalog (`~/.eidos/plugins/`),
shared seamlessly by the CLI, `eidos serve`, and Eidos Lite desktop.

```bash
# Search the official plugin registry
eidos --json plugin search chart

# List installed plugins (or browse marketplace with --marketplace)
eidos --json plugin list
eidos --json plugin list --marketplace

# View detailed plugin info
eidos --json plugin info eidos.chart

# Install a plugin from registry or local .eidos-plugin package
eidos --json plugin install eidos.chart
eidos --json plugin install ./my-plugin.eidos-plugin --unpack

# Uninstall a plugin
eidos --json plugin uninstall eidos.chart
```

## Use the guarded path for multi-step mutations

`data mutate` with `--match` and `--set` updates existing rows. For inserts, batch changes, schema
changes, and saved View lifecycle changes:

1. Use the revision returned by the newest `data query --compact` or `file inspect` when a
   mutation depends on a prior read. High-level commands can otherwise use the
   current revision read at command start.
2. Use `data mutate --insert`, `data mutate` with a JSON payload, `schema table/field`, or
   `schema view create/update/delete` commands. Use `schema apply`
   only when the exact lower-level mutation document is required.
3. Dry-run schema changes, especially deletions, before committing them.
4. Run `file inspect --full` after the final committed mutation.

Before destructive changes, identify exact IDs and summarize impact. Never mutate with `sqlite3`, ad hoc SQL, or a generic SQLite library.

## Handle concurrency deliberately

Do not automatically retry `stale-revision`. Re-run `context`, reconcile the affected rows, and form a new request. Do not write an existing File while Eidos Lite, Eidos File Web, or another editor has it open during the alpha.

Read [references/cli.md](references/cli.md) only for advanced filters, logical
value types, saved Views, creation, or the complete command grammar. Read
[references/operations.md](references/operations.md) only for relations,
Calendar creation, schema changes, deletion, recovery, or Graft workflows.
