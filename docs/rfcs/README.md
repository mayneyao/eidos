# Eidos Storage RFCs

Status: Draft set, implementation in progress
Date: 2026-07-08
Implementation snapshot: 2026-07-12

This directory contains draft RFCs for moving Eidos toward a file-based storage model.

## Implementation Status

| RFC                   | Status                | Current implementation boundary                                                                                                                                        |
| --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Space/Base storage    | In progress           | The core file-based vertical slice, standalone Base runtime, and Base-aware diffs work. Migration, remote sync, and file-based extensions remain.                      |
| Markdown runtime      | Usable vertical slice | Real file tree, direct editing, safe saves, watcher, indexed quick open, wiki-link completion, outline, backlinks, and attachments exist. Persistent indexes remain.   |
| Graft versioning      | Local workflow usable | Changes, staging, commit, diff, history, restore, and Base table/row inspection work. Remote sync and conflicts remain.                                                |
| Product UX            | In progress           | Files/Version, Diff/History, contextual Settings, and the paged production Base grid work. Sync and Migration UX remain.                                               |
| Base format/runtime   | Vertical slice        | The standalone package and paged Grid support primitive editing, table/field lifecycle, choice options, view layout, and batch deletion; CSV and richer fields remain. |
| File-based extensions | Not started           | The RFC remains the target design.                                                                                                                                     |
| Legacy migration      | Not started           | Implementation waits for the Base runtime and export format.                                                                                                           |

The implementation order has intentionally changed from Base-first to:

1. finish the Markdown file-based Space vertical slice,
2. stabilize local Graft versioning,
3. build the standalone Base package and vertical slice,
4. add legacy migration, file-based extensions, remote sync, and conflicts.

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
