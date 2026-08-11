---
name: eidos
description: Safely inspect, query, validate, and modify open `.eidos` structured-data files with the agent-first Rust `eidos` CLI. Use for any request that reads or changes an Eidos File, including tables, rows, fields, filters, relations, task trackers, and revision conflicts. Never use raw SQLite writes.
---

# Eidos File

Use `eidos` as the typed transaction boundary for `.eidos` files. Use ordinary filesystem tools for Markdown and attachments, and Graft for history or sync when an enclosing directory has `.graft`.

Before the first operation, run `eidos --version`. If the command is unavailable, stop and direct the user to `https://eidos.space/download#agent-setup`; do not install software without the user's request.

Always pass the global `--json` flag for structured reads, mutations, and validation. Human-readable output is the interactive default; Agent workflows must use the stable JSON contract explicitly.

## Start with one compact context

Locate the exact file, then load only the table and fields needed:

```bash
eidos --json context data.eidos Tasks --fields Title,Status --limit 50
```

Omit the table when the File has a default or only one table. Use `--where`, `--sort`, or `--search` to narrow rows. Use `--full` only when stable schema IDs, system fields, relations, or views are needed.

## Update matched rows atomically

Prefer `apply` for ordinary updates. It asserts the revision and exact match count, updates all matched rows, runs validation against the proposed state, and commits only when valid:

```bash
eidos --json apply data.eidos - <<'JSON'
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

Match stable `_id` values when available. Keep `expect` exact; never broaden a zero- or multi-match result. Successful `apply` output already includes the new revision, returned rows, and pre-commit validation report.

## Use the guarded legacy path when needed

`apply` currently updates existing rows only. For creates, deletes, and schema changes:

1. Use the revision returned by the newest `context` or `inspect`.
2. Use `rows add`, `rows delete`, or `schema-apply --expected-revision`.
3. Dry-run schema changes, especially deletions.
4. Run `validate --level full` after the final committed mutation.

Before destructive changes, identify exact IDs and summarize impact. Never mutate with `sqlite3`, ad hoc SQL, or a generic SQLite library.

## Handle concurrency deliberately

Do not automatically retry `stale-revision`. Re-run `context`, reconcile the affected rows, and form a new request. Do not write an existing File while Eidos Lite, Eidos File Web, or another editor has it open during the alpha.

Read [references/cli.md](references/cli.md) only for advanced filters, logical value types, creation, or the complete command grammar. Read [references/operations.md](references/operations.md) only for relations, schema changes, deletion, recovery, or Graft workflows.
