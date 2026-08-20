# Eidos File workflows

## Contents

- [Read-only analysis](#read-only-analysis)
- [Create a tracker](#create-a-tracker)
- [Safe row update](#safe-row-update)
- [Safe schema change](#safe-schema-change)
- [Create a Calendar view](#create-a-calendar-view)
- [Forward Relation](#forward-relation)
- [Delete data](#delete-data)
- [Recover from errors](#recover-from-errors)
- [Review with Graft](#review-with-graft)

## Read-only analysis

Use one compact context call for ordinary analysis and report its revision:

```bash
eidos --json context research.eidos Papers --fields Title,Status,Published --limit 100
```

Use `context --full` or `schema` only when detailed metadata is relevant. Never
derive Eidos field semantics from physical SQLite table or column names.

## Create a tracker

Create the complete initial table in one operation, then validate:

```bash
eidos --json create tracker.eidos \
  --table Tasks \
  --label-field Title \
  --fields '[
    {"name":"Title","type":"text","nullable":false},
    {"name":"Status","type":"select","settings":{"options":[{"name":"todo"},{"name":"doing"},{"name":"done"}]}},
    {"name":"Estimate","type":"integer"},
    {"name":"Tags","type":"multi-select"}
  ]'

eidos --json validate tracker.eidos --level full
```

If creation fails, the CLI removes the incomplete new file. It never overwrites an existing file.

## Safe row update

Load a narrow context, then use its revision and an exact match:

```bash
eidos --json context tracker.eidos Tasks \
  --where '{"op":"eq","field":"Status","value":"doing"}' \
  --fields Title,Status
```

```bash
eidos --json apply tracker.eidos \
  '{"revision":"12","table":"Tasks","match":{"_id":"019..."},"expect":1,"set":{"Status":"done"},"returning":["Title","Status"]}'
```

`apply` checks revision and match count, validates inside its transaction, and
returns the committed row. A separate final validation call is unnecessary.
For batch creation, one `rows add` with a JSON array is atomic and preferable
to separate calls; validate after lower-level mutations.

## Safe schema change

Run the exact operation as a dry run, confirm the file revision did not change, then apply it using the same revision only if no other writer intervened:

```bash
eidos --json inspect tracker.eidos

eidos --json schema-apply tracker.eidos \
  --expected-revision 12 \
  --dry-run \
  --op '{"kind":"create-field","table":"Tasks","name":"Due","type":"date"}'

eidos --json schema-apply tracker.eidos \
  --expected-revision 12 \
  --op '{"kind":"create-field","table":"Tasks","name":"Due","type":"date"}'

eidos --json validate tracker.eidos --level full
```

Treat every `createdObjects[].id` returned by the dry run as ephemeral. The real apply allocates different stable IDs.

Adding a non-null scalar field to a non-empty table is rejected because existing rows would have no valid value. Add it nullable, populate it, and only use a later supported migration to strengthen the constraint.

## Create a Calendar view

Read the full schema, select the owning Table ID and a same-Table `date` or
`datetime` Field ID, then submit one View mutation at that revision:

```bash
eidos --json schema tracker.eidos Tasks

eidos --json view-apply tracker.eidos - <<'JSON'
{
  "expectedRevision": "13",
  "changes": [{
    "kind": "create-view",
    "clientKey": "delivery-calendar",
    "tableId": "019-table...",
    "name": "Delivery calendar",
    "type": "calendar",
    "query": {},
    "layout": {"dateField": "019-due-field..."},
    "position": "1"
  }]
}
JSON

eidos --json validate tracker.eidos --level full
```

Do not substitute the displayed Table/Field names in the View document. Stable
IDs keep the Calendar valid across renames. If the File changed after schema
inspection, handle `stale-revision` by re-reading and replanning.

## Forward Relation

Create the target table first, capture the new revision, then create the Relation in a separate schema transaction:

```bash
eidos --json schema-apply tracker.eidos \
  --expected-revision 12 \
  --op '{"kind":"create-table","name":"People","fields":[{"name":"Name","type":"text","nullable":false}],"labelField":"Name"}'

eidos --json schema-apply tracker.eidos \
  --expected-revision 13 \
  --op '{"kind":"create-field","table":"Tasks","name":"Owners","type":"relation","definition":{"direction":"forward","targetTable":"People","cardinality":"many","onDelete":"detach"}}'
```

Add target rows, obtain their `_id` values, then assign a Relation as an array of row IDs:

```bash
eidos --json rows tracker.eidos update Tasks 019-task... \
  --expected-revision 15 \
  --values '{"Owners":["019-person..."]}'
```

Supported `onDelete` policies are `restrict`, `detach`, and `preserve`.
Even one-cardinality Relations use `[]` for unassigned and a one-item array for assigned values. Relation fields report `nullable:false` because their stored array is never SQL `NULL`; an empty array is the logical unassigned state.

## Delete data

Deletion requires exact scope and the latest revision.

For rows, query first and keep the exact `_id` set visible in the plan:

```bash
eidos --json rows tracker.eidos delete Tasks 019... 019... --expected-revision 20
```

For a field or table, dry-run first:

```bash
eidos --json schema-apply tracker.eidos \
  --expected-revision 21 \
  --dry-run \
  --op '{"kind":"delete-field","table":"Tasks","field":"Obsolete"}'
```

The CLI blocks deletion of system fields, referenced Relation targets, defaults, labels without replacement, and known Formula/Lookup/view dependencies.

## Recover from errors

`stale-revision` means the file changed after planning:

1. Stop; do not retry the old command.
2. Inspect the new revision.
3. Query the affected rows and schema again.
4. Reconcile the user's intent with the new state.
5. Apply a newly planned mutation using the new revision.

On `invalid-value` or `invalid-query`, read schema and correct logical types or field references. Do not coerce values by editing physical storage.

On validation failure, stop further writes. Preserve the file, report diagnostics, and use Graft restore if the user authorizes it.

## Review with Graft

If an ancestor directory contains `.graft`, the `.eidos` mutation participates in the Space's version history. After mutation, show the Graft status or diff available in the installed Graft CLI. Do not create a commit, push, pull, merge, or restore unless the user explicitly requested that operation.
