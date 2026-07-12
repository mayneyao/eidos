# RFC: Graft Versioning for Eidos Spaces

Status: Draft, native Desktop workflow accepted
Date: 2026-07-08
Owner: Eidos
Related:

- `eidos-space-base-storage.md`
- `eidos-base-file-format.md`
- `eidos-space-markdown-runtime.md`
- `eidos-file-based-extensions.md`

## Implementation Status (2026-07-13)

The local workflow is implemented with a persistent SQLite/Graft PRAGMA
connection for normal operations; only repository initialization remains a
one-shot CLI operation. The UI provides Changes and Staged Changes, path and
directory stage/unstage/discard, text Diff tabs, commit history, path restore,
and whole-Space restore. Private `.eidos` runtime paths are hidden.
Working Changes and historical inspectors also expand `.base` paths into
compact table/column/row operations through path-scoped Graft row details.

Native Electron acceptance now covers a Changes click opening a dedicated text
Diff tab, path and directory staging, commit, cursor-paged history, single-path
restore, whole-Space restore, and directory discard. Graft v0.5.3 replaces the
quadratic Base58 encoding of inline file blobs with backward-compatible Base64
`file-blob-v2` objects. Staging the 165 KB acceptance Markdown file dropped from
about 98 seconds to about 27 ms on the acceptance machine.

The remote vertical slice is now implemented over the same persistent Graft
connection. File Space Settings configures the remote; the compact Version
toolbar exposes fetch, pull, push, upstream, ahead, and behind state. Pull
blocks dirty worktrees. Diverged pulls surface path-first conflicts in Changes,
open HEAD-to-merge-head Diff tabs, and offer ours, theirs, or current-file
resolution. Creating the next version after resolution uses `merge-continue`
and preserves both parents.

An isolated two-Space `fs://` acceptance covers initial push, clone, remote
push, diverged pull, conflict listing, text content diff, resolution,
two-parent merge continuation, and final push. Graft v0.5.4 also fixes plain
`graft clone <remote>` so it uses the current directory as the worktree.

Native Desktop dogfooding now repeats the diverged workflow through the actual
Files/Version UI: fetch exposes ahead/behind state, pull creates a conflict,
clicking the path opens the side-by-side Diff tab, accepting theirs stages the
resolution, Create version preserves both parents, and Push returns to a clean
up-to-date status. Existing unmarked `.graftignore` files remain user-owned, so
opening or merging a remote repository no longer creates an unrelated local
change.

Native two-Space Base acceptance now covers a divergent update to the same
SQLite row. Clicking the conflicted `.base` path opens a row-aware Diff tab;
Resolve opens a dedicated non-modal review tab with Base, Current, and Incoming
values. Accepting the incoming row stages only that Base path, Create version
produces a two-parent merge, and Push returns the remote to the merge head with
a clean, up-to-date Space. Schema and opaque SQLite conflicts deliberately
retain the explicit whole-file fallback.

Confirmed product decisions that supersede earlier open questions:

- path-level staging is part of v1 and follows the VS Code interaction model,
- History opens as a dedicated content tab from Changes, not as a sidebar mode,
- the primary sidebar modes remain Files and Version; no Logs mode is planned,
- remote synchronization is explicit Pull/Push rather than implicit autosync,
- conflicts remain path-first in Changes; supported Base row conflicts open a
  structured review tab without changing the remote protocol.

## Summary

This RFC defines how Eidos should use graft when a Space contains Markdown files, Base files, ordinary assets, and Eidos-owned project files such as `.eidos/extensions/**`.

The target model:

- `.graft/` lives at the Space root.
- Graft manages user-visible Space assets and selected Eidos-owned project files.
- Private `.eidos` runtime subtrees are ignored by default.
- Markdown and ordinary files are file-level changes.
- `.base` files are SQLite-backed paths with table-level expansion.
- `.eidos/extensions/**` source files are ordinary tracked files.
- Eidos presents graft status as a path tree, not as internal `.eidos/db.sqlite3` changes.

## Product Principle

Users should feel:

> Eidos versions my Space, not Eidos' private runtime directory.

Versioning should match what users can see and reason about in the Space.

## Goals

- Use graft as the versioning layer for the Space root.
- Track Markdown, Base files, and user assets.
- Track user/space extension source files.
- Ignore `.graft/` and private `.eidos` runtime subtrees by default.
- Show path-level status first.
- Expand `.base` files into table/schema/view changes.
- Avoid requiring users to manually `graft add` in normal Eidos flows.

## Non-Goals

- This RFC does not define graft's internal object format.
- This RFC does not define network provider credentials.
- This RFC does not require Eidos to expose every git-like command.
- This RFC does not require perfect conflict UI in v1.

## Repository Layout

Example:

```txt
my-space/
  notes/project.md
  tasks.base
  .eidos/extensions/kanban-view/index.tsx
  assets/image.png
  .obsidian/
  .eidos/
  .graft/
```

`.graft/` is at `my-space/.graft`.

Graft worktree root is `my-space/`.

## Default Tracking Rule

For file-based Eidos, the recommended default is broad tracking with ignores:

```txt
track.default_roots:
  **/*
  .eidos/extensions/**

ignore:
  .graft/**
  .eidos/db.sqlite3
  .eidos/cache/**
  .eidos/indexes/**
  .eidos/sessions/**
  .eidos/state/**
  .eidos/secrets.sqlite3
  **/.DS_Store
  **/*.tmp
```

Why broad tracking:

- It matches the Space mental model.
- It avoids forcing users to classify every new asset.
- It naturally includes Markdown, `.base`, images, PDFs, and other user files, while explicitly including `.eidos/extensions/**` as Eidos-owned project source.

Eidos may expose advanced settings for stricter tracking, but the default should be understandable:

> Space/project content is versioned; app-private runtime state is not.

## Explicit User Tracking

Some users may want to exclude or include specific paths.

Recommended config concepts:

```txt
track.default_roots   app/default Space tracking
track.user_roots      user-added tracking roots
ignore                ignored paths
```

Normal Eidos usage should not require a manual add step. Explicit tracking is an advanced setting, not the default workflow.

## Status Model

Graft status should be presented as changed paths:

```txt
notes/project.md
tasks.base
.eidos/extensions/kanban-view/index.tsx
assets/image.png
```

Each path has:

```txt
path
kind: text | binary | sqlite | directory
state: added | modified | deleted | renamed
storage: inline | external
```

Eidos UI can group paths into a VS Code-like tree.

## Base Expansion

`.base` files should appear as one path first:

```txt
tasks.base
```

When expanded:

```txt
tasks.base
  Tasks table       +3 ~1
  Projects table    +1
  Views metadata    ~2
  Fields schema     ~1
```

Mapping:

```txt
tb_<tableId>        row/data changes
eidos__tables       table registry changes
eidos__columns      field/schema changes
eidos__views        view changes
eidos__references   relation/dependency changes
eidos__meta         Base metadata changes
```

Generated tables should be grouped separately as diagnostics or hidden by default.

## Commit Model

Eidos should offer a user-facing commit/snapshot action:

```txt
Message
Commit
```

Normal behavior:

- Eidos calculates changed paths from graft status.
- Configured default roots are auto-discovered.
- User does not need to manually add files.
- Commit creates a version for the Space state.

Advanced behavior:

- users can exclude paths before commit,
- users can inspect `.base` internals before commit,
- users can commit only selected paths in a later version.

## File Storage Strategy

Graft can choose storage strategy by file type and size.

For Eidos Spaces:

- text files can be stored inline,
- binary files can use external payload storage,
- `.base` files are SQLite and should use SQLite-aware storage/diff,
- extension source files are text files and can be stored inline,
- images/assets can use external payload storage.

Storage strategy should not define tracking scope. Tracking answers "is this user state?" Storage answers "how is this content stored?"

## Conflict Model

Conflicts should be path-first:

```txt
notes/project.md
tasks.base
assets/image.png
```

For Markdown:

- text conflict UI can be used.

For ordinary binary:

- choose ours/theirs or keep both.

For `.base`:

- show table-level conflicts where possible,
- allow row-level conflict resolution when graft supports it,
- fall back to file-level resolution if needed.

## Sync Model

Graft remote sync should sync:

- tracked Markdown files,
- tracked Base files,
- tracked extension source files,
- tracked assets,
- external payloads required by those files.

It should not sync:

- `.eidos/sessions/**`,
- `.eidos/cache/**`,
- `.eidos/indexes/**`,
- `.eidos/state/**`,
- `.eidos/secrets.sqlite3`,
- `.graft/**` as user content.

## UI Requirements

Changes UI should show:

- changed path count,
- path tree,
- file type badges only when helpful,
- `.base` expandable internals,
- ignored/private state hidden by default,
- refresh action,
- commit message and commit button.

It should avoid showing:

- `.eidos/db.sqlite3` as the primary user asset in Space mode,
- `.eidos/sessions/**`,
- generated index churn.

## Migration From Current Eidos Graft Integration

Current interim integration tracks:

```txt
.eidos/db.sqlite3
.eidos/files/**
```

That is appropriate only for the hidden-database model.

Space mode should replace it with:

```txt
track.default_roots = ["**/*", ".eidos/extensions/**"]
ignore = [".graft/**", ".eidos/cache/**", ".eidos/sessions/**", ".eidos/indexes/**", ".eidos/state/**", ...]
```

Existing repos may need a cleanup migration if they previously tracked `.eidos/sessions/**` or other private paths.

## Remaining Open Questions

1. Should `.obsidian/**` be tracked by default or partially ignored?
2. Should external payload storage be automatic for all binary files?
3. Should Eidos expose graft config in settings or keep it hidden behind presets?

## Recommended Vertical Slice

```txt
sample-space/
  note.md
  tasks.base
  assets/image.png
  .eidos/sessions/session.jsonl
```

The slice should prove:

- graft status shows `note.md`, `tasks.base`, and `assets/image.png`,
- graft status does not show `.eidos/sessions/session.jsonl`,
- committing needs no manual add,
- expanding `tasks.base` shows table-level changes,
- the commit can be pushed and cloned with required payloads.
