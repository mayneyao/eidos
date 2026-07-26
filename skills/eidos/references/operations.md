# Eidos File workflows

## Contents

- [Read-only analysis](#read-only-analysis)
- [Create a tracker](#create-a-tracker)
- [Safe row update](#safe-row-update)
- [Safe schema change](#safe-schema-change)
- [Forward Relation](#forward-relation)
- [Delete data](#delete-data)
- [Recover from errors](#recover-from-errors)
- [Review with Graft](#review-with-graft)

## Read-only analysis

1. Inspect file identity and capabilities.
2. Read the logical schema.
3. Query a narrow projection with a bounded limit.
4. Report the file revision with findings so the user knows the snapshot.

```bash
eidos research.eidos inspect
eidos research.eidos schema Papers
eidos research.eidos query Papers --fields Title,Status,Published --limit 100
```

Never derive Eidos field semantics from physical SQLite table or column names.

## Create a tracker

Create the complete initial table in one operation, then validate:

```bash
eidos create tracker.eidos \
  --title "Launch Tracker" \
  --table Tasks \
  --label-field Title \
  --fields '[
    {"name":"Title","type":"text","nullable":false},
    {"name":"Status","type":"select","settings":{"options":[{"name":"todo"},{"name":"doing"},{"name":"done"}]}},
    {"name":"Estimate","type":"integer"},
    {"name":"Tags","type":"multi-select"}
  ]'

eidos tracker.eidos validate --level full
```

If creation fails, the CLI removes the incomplete new file. It never overwrites an existing file.

## Safe row update

Inspect and select exact rows first:

```bash
eidos tracker.eidos inspect
eidos tracker.eidos query Tasks \
  --where '{"op":"eq","field":"Status","value":"doing"}' \
  --fields Title,Status
```

Use `_id` from the result. Re-inspect immediately before mutation and use that exact revision:

```bash
eidos tracker.eidos rows update Tasks 019... \
  --expected-revision 12 \
  --values '{"Status":"done"}'

eidos tracker.eidos validate --level full
```

For batch creation, one `rows add` with a JSON array is atomic and preferable to separate calls.

## Safe schema change

Run the exact operation as a dry run, confirm the file revision did not change, then apply it using the same revision only if no other writer intervened:

```bash
eidos tracker.eidos inspect

eidos tracker.eidos schema-apply \
  --expected-revision 12 \
  --dry-run \
  --op '{"kind":"create-field","table":"Tasks","name":"Due","type":"date"}'

eidos tracker.eidos schema-apply \
  --expected-revision 12 \
  --op '{"kind":"create-field","table":"Tasks","name":"Due","type":"date"}'

eidos tracker.eidos validate --level full
```

Treat every `createdObjects[].id` returned by the dry run as ephemeral. The real apply allocates different stable IDs.

Adding a non-null scalar field to a non-empty table is rejected because existing rows would have no valid value. Add it nullable, populate it, and only use a later supported migration to strengthen the constraint.

## Forward Relation

Create the target table first, capture the new revision, then create the Relation in a separate schema transaction:

```bash
eidos tracker.eidos schema-apply \
  --expected-revision 12 \
  --op '{"kind":"create-table","name":"People","fields":[{"name":"Name","type":"text","nullable":false}],"labelField":"Name"}'

eidos tracker.eidos schema-apply \
  --expected-revision 13 \
  --op '{"kind":"create-field","table":"Tasks","name":"Owners","type":"relation","definition":{"direction":"forward","targetTable":"People","cardinality":"many","onDelete":"detach"}}'
```

Add target rows, obtain their `_id` values, then assign a Relation as an array of row IDs:

```bash
eidos tracker.eidos rows update Tasks 019-task... \
  --expected-revision 15 \
  --values '{"Owners":["019-person..."]}'
```

Supported `onDelete` policies are `restrict`, `detach`, and `preserve`.
Even one-cardinality Relations use `[]` for unassigned and a one-item array for assigned values. Relation fields report `nullable:false` because their stored array is never SQL `NULL`; an empty array is the logical unassigned state.

## Delete data

Deletion requires exact scope and the latest revision.

For rows, query first and keep the exact `_id` set visible in the plan:

```bash
eidos tracker.eidos rows delete Tasks 019... 019... --expected-revision 20
```

For a field or table, dry-run first:

```bash
eidos tracker.eidos schema-apply \
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
