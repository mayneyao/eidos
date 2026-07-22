# Eidos Storage RFCs

Status: Draft set, implementation in progress
Date: 2026-07-08
Implementation snapshot: 2026-07-17

This directory contains draft RFCs for moving Eidos toward a file-based storage model.

> **Normative specification:** [Eidos File 1.0](../specs/eidos-file-1.0.md).
> The documents in this directory are design and implementation records. Where
> they differ from Eidos File 1.0, the specification controls.

## Implementation Status

| RFC                       | Status                 | Current implementation boundary                                                                                                                                                                                                                                                                                      |
| ------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Space/Eidos File storage  | Eidos File v1 accepted | The file-based slice, standalone Eidos File runtime with live relation/formula/lookup fields, Eidos File-aware diffs, validated legacy export, native remote acceptance, and native record tabs work. File-based extensions remain separate.                                                                         |
| Markdown runtime          | Desktop accepted       | Real file tree, direct editing, safe saves, non-destructive external-conflict recovery, watcher, persistent derived index, quick open, wiki-link completion, outline, backlinks, attachments, IME, image paste, and long documents work.                                                                             |
| Graft versioning          | Desktop accepted       | Repository-scoped subprocess execution, bounded persistent fetch/pull/push, diverged text diff, path-first resolution, two-parent continuation, clean reconciliation, and final push are accepted.                                                                                                                   |
| Product UX                | Desktop accepted       | Files/Version, Diff/History, Settings, migration, native Eidos File lifecycle, two-Space row-conflict review, Eidos File v1 table-view parity, and native record-tab restore/split flows are accepted.                                                                                                               |
| Eidos File format/runtime | Eidos File v1 accepted | The standalone package supports structured queries and column aggregates, persisted Grid/Gallery/Kanban views, bounded virtual paging, rich fields, hardened validation, atomic range edits and undo, batch deletion, and streamed imports.                                                                          |
| File-based extensions     | P5 developer preview   | Isolated command Workers, text editors, semantic UI surfaces, public GitHub install/update, strict CLI scaffolding/checks, and cross-platform packed-package delivery gates work; stable v1 publication remains.                                                                                                     |
| Legacy migration          | Real exports accepted  | Standalone planning, atomic export, Desktop Settings, schema recovery, and 1.1M-row real-Space acceptance are complete; live derived recomputation remains.                                                                                                                                                          |
| Agent integration         | Integration candidate  | The mature provider/Skills/ToolLoop runtime and rich Agent UI are integrated with main-process run ownership, durable file-Space context and audit, scoped tool approval, legacy session import, lifecycle search/edit/fork/retry, and user-controlled conversation versioning. Packaged Desktop acceptance remains. |

The implementation order has intentionally changed from Eidos File-first. The first
four milestones are now complete:

1. finish the Markdown file-based Space vertical slice,
2. stabilize local Graft versioning,
3. build the standalone Eidos File package and vertical slice,
4. implement and accept legacy migration exports.

The Eidos File v1 delivery gate is now closed. File-based extensions remain a
separate developer preview rather than a blocker for the Eidos File release.

Recommended reading order:

1. `../specs/eidos-file-1.0.md`
   - Final, implementation-independent Eidos File contract.
2. `eidos-file-storage.md`
   - Overall product/storage model.
3. `eidos-file-format.md`
   - Superseded design and implementation record for the earlier runtime.
4. `eidos-space-markdown-runtime.md`
   - Markdown files as source of truth in Space mode.
5. `eidos-file-based-extensions.md`
   - Extension source files, private runtime state, trust, and graft tracking.
6. `eidos-graft-space-versioning.md`
   - Graft tracking, status, commit, sync, and conflict semantics.
7. `eidos-legacy-space-migration.md`
   - Migration from current `.eidos/db.sqlite3` spaces.
8. `eidos-file-product-ux.md`
   - Product interaction model for files, Eidos File, Changes, history, and migration.
9. `eidos-agent-integration.md`
   - Agent conversations, per-Space versioning consent, resource context, tools, permissions, and recovery for file-based Spaces.

Chinese versions use the `.zh.md` suffix.
