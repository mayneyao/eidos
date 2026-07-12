# Eidos Storage RFCs

Status: Draft set, implementation in progress
Date: 2026-07-08
Implementation snapshot: 2026-07-12

This directory contains draft RFCs for moving Eidos toward a file-based storage model.

## Implementation Status

| RFC                   | Status                | Current implementation boundary                                                                                                                                                              |
| --------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Space/Base storage    | In progress           | The file-based slice, standalone Base runtime, Base-aware diffs, validated legacy export, and isolated remote acceptance work. Native remote dogfooding and file-based extensions remain.    |
| Markdown runtime      | Desktop accepted      | Real file tree, direct editing, safe saves, watcher, persistent derived index, quick open, wiki-link completion, outline, backlinks, attachments, IME, image paste, and long documents work. |
| Graft versioning      | Remote vertical slice | Local workflows pass native Desktop acceptance; persistent remote config/fetch/pull/push, path-first conflicts, two-parent continuation, and isolated two-Space acceptance now work.         |
| Product UX            | In progress           | Files/Version, Diff/History, contextual Settings, compact sync controls, conflict actions, the production Base grid, and legacy Migration Settings work. Native sync dogfooding remains.     |
| Base format/runtime   | Vertical slice        | The standalone package and paged Grid support primitive editing, table/field lifecycle, choice options, view layout, batch deletion, and streamed imports.                                   |
| File-based extensions | Not started           | The RFC remains the target design.                                                                                                                                                           |
| Legacy migration      | Real exports accepted | Standalone planning, atomic export, Desktop Settings, schema recovery, and 1.1M-row real-Space acceptance are complete; live derived recomputation remains.                                  |

The implementation order has intentionally changed from Base-first. The first
four milestones are now complete:

1. finish the Markdown file-based Space vertical slice,
2. stabilize local Graft versioning,
3. build the standalone Base package and vertical slice,
4. implement and accept legacy migration exports.

The next order is native remote/conflict dogfooding, followed by file-based
extensions and the remaining Base/product refinements.

Recommended reading order:

1. `eidos-space-base-storage.md`
   - Overall product/storage model.
2. `eidos-base-file-format.md`
   - `.base` SQLite file format and table runtime.
3. `eidos-space-markdown-runtime.md`
   - Markdown files as source of truth in Space mode.
4. `eidos-file-based-extensions.md`
   - Extension source files, private runtime state, trust, and graft tracking.
5. `eidos-graft-space-versioning.md`
   - Graft tracking, status, commit, sync, and conflict semantics.
6. `eidos-legacy-space-migration.md`
   - Migration from current `.eidos/db.sqlite3` spaces.
7. `eidos-space-base-product-ux.md`
   - Product interaction model for files, Base, Changes, history, and migration.

Chinese versions use the `.zh.md` suffix.
