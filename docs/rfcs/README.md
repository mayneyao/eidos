# Eidos Storage RFCs

Status: Draft set
Date: 2026-07-08

This directory contains draft RFCs for moving Eidos toward a vault-native storage model.

Recommended reading order:

1. `eidos-vault-base-storage.md`
   - Overall product/storage model.
2. `eidos-base-file-format.md`
   - `.base` SQLite file format and table runtime.
3. `eidos-vault-markdown-runtime.md`
   - Markdown files as source of truth in vault mode.
4. `eidos-file-based-extensions.md`
   - Extension source files, private runtime state, trust, and graft tracking.
5. `eidos-graft-vault-versioning.md`
   - Graft tracking, status, commit, sync, and conflict semantics.
6. `eidos-legacy-space-migration.md`
   - Migration from current `.eidos/db.sqlite3` spaces.
7. `eidos-vault-base-product-ux.md`
   - Product interaction model for files, Base, Changes, history, and migration.

Chinese versions use the `.zh.md` suffix.
