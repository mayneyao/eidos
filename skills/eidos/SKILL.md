---
name: eidos
description: Safely create, inspect, query, validate, and modify open `.eidos` structured-data files with the agent-first Rust `eidos` CLI. Use whenever a request reads or changes an Eidos File, including tables, rows, fields, filters, relations, and revision conflicts. Do not use raw SQLite writes.
---

# Eidos File

Use the `eidos` CLI as the typed transaction boundary for `.eidos` files. It emits JSON only and works directly on files; Eidos Desktop does not need to run.

## Route work by file type

- Use ordinary filesystem tools for Markdown, images, and attachments.
- Use `eidos` for every logical read or write of a `.eidos` file.
- Never mutate a `.eidos` file with `sqlite3`, ad hoc SQL, or a generic SQLite library.
- Use Graft separately for history, restore, and sync when the enclosing Space has a `.graft` directory.

## Follow the safe mutation loop

1. Locate the exact `.eidos` file. Never recursively guess when more than one candidate exists.
2. Run `eidos <file> inspect`, then `eidos <file> schema`.
3. Query only the rows needed to plan the change.
4. Immediately before writing, inspect again and capture its string `revision`.
5. For schema changes, run `schema-apply --dry-run` with that revision first.
6. Apply the row or schema mutation with `--expected-revision <revision>`.
7. Run `eidos <file> validate --level full` after the final mutation.
8. If the file is in a Graft worktree, show the resulting status or diff. Do not commit or push unless the user asked.

Do not automatically retry `stale-revision`. Re-inspect, re-query affected rows, and re-plan because another writer changed the file.

For this alpha, do not write an existing file while Eidos Desktop has it open. Ask the user to close that file first if concurrent editing is plausible.

## Invoke the CLI

Prefer file-first commands:

```bash
eidos data.eidos inspect
eidos data.eidos schema
eidos data.eidos query Tasks --limit 50
eidos data.eidos rows add Tasks --expected-revision 4 --values '{"Title":"Ship"}'
eidos data.eidos validate --level full
```

Command-first form such as `eidos inspect data.eidos` is also supported. Output is always one JSON document; `--json` is accepted but unnecessary. JSON arguments accept inline JSON, `@path`, or `-` for stdin.

Use display names for interactive work and stable IDs when persisting automation. Read row IDs from `_id`; read newly created IDs from `created` or `createdObjects` in mutation results.

## Guard destructive changes

Before deleting rows, fields, or tables:

- identify exact IDs and summarize impact;
- use the newest revision;
- dry-run schema deletions;
- never broaden a deletion after a lookup returns zero or multiple matches;
- validate afterward.

## Know the alpha boundary

The Rust CLI currently supports stored scalar/list fields and forward Relation fields. It preserves and reports existing Formula, Lookup, view, and inverse Relation metadata but does not create or evaluate those virtual fields. `full` validation checks file identity, storage structure, constraints, relations, and logical decoding; it does not prove Formula/Lookup evaluation parity yet.

Read [references/cli.md](references/cli.md) for command and JSON grammar. Read [references/operations.md](references/operations.md) for complete workflows and recovery rules.
