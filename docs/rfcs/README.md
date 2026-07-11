# Eidos Storage RFCs

Status: Draft set, implementation in progress
Date: 2026-07-08
Implementation snapshot: 2026-07-11

This directory contains draft RFCs for moving Eidos toward a file-based storage model.

## Implementation Status

| RFC                   | Status                | Current implementation boundary                                                                                                              |
| --------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Space/Base storage    | In progress           | File-based Spaces and Space-root Graft exist; Base files do not.                                                                             |
| Markdown runtime      | Usable vertical slice | Real file tree, direct Markdown editing, safe saves, watcher, derived index, links, and attachments exist. Search/backlink UI is incomplete. |
| Graft versioning      | Local workflow usable | Changes, staging, commit, diff, history, path restore, and Space restore exist. Remote sync, conflicts, and Base-aware diffs do not.         |
| Product UX            | In progress           | Files/Version sidebar modes, Diff/History tabs, and contextual Settings exist. Base, Sync, and Migration UX do not.                          |
| Base format/runtime   | Not started           | The implementation will live in a standalone package and will not depend on `@libsql/client`.                                                |
| File-based extensions | Not started           | The RFC remains the target design.                                                                                                           |
| Legacy migration      | Not started           | Implementation waits for the Base runtime and export format.                                                                                 |

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
