# Eidos Lite Desktop delivery status

Last audited: 2026-07-29

## Verdict

The current branch is an **internal macOS Apple Silicon staging candidate**.
It is suitable for controlled dogfood with ordinary user-owned Space folders
and the official staging account/Hosted Remote. It is not a signed installer,
an Integrated Beta, or a Public v1 release.

This verdict preserves the product boundary: one window owns one ordinary
folder Space, one Space owns one Graft repository and one Hosted Remote, and
the UI displays one active Eidos File while retaining at most three runtimes
in an in-memory LRU. The product deliberately does not expose multi-file tabs.

## Delivered capability

| Area                    | Internal-candidate status | Evidence boundary                                                                                                                                                                |
| ----------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independent application | Ready                     | Independent Electron main, sandboxed preload, utility processes, renderer, bundle id, package config and tests; no Classic Desktop Space/legacy runtime imports                  |
| Local Space             | Ready                     | New/Open/Recent ordinary folders, canonical one-window ownership, Pierre Explorer, watcher, ordinary-file system open and recoverable file operations                            |
| Eidos File editing      | Ready                     | Canonical `eidos-file-ui` Grid/View/Query/Fields/Sheet UI, real SQLite transactions, one active editor and a three-runtime LRU                                                   |
| Local versioning        | Ready                     | Whole-Space status, Changes, row-aware diff, History, checkpoint, forward-only restore and stable-change automatic checkpoints through the resident Graft SDK                    |
| Sync control plane      | Staging-ready             | Independent PKCE/device/grant flow, preflight upload scope, official Hosted Remote provisioning, background queue, typed failures and Local-safe recovery                        |
| Whole-Space Sync        | Staging-ready             | Real staging push/clone/pull and divergence acceptance is recorded in [Operations](./OPERATIONS.md); credentials remain in main/SDK memory                                       |
| Recovery                | Internal-ready            | Clone journals, operation journals, close/validate/reopen materialization, two-copy divergence recovery, external-path invalidation, file-utility and Graft-utility crash reopen |
| Diagnostics             | Internal-ready            | Main-owned allowlisted Copy diagnostics excludes credentials, URLs, paths, Space/repository identity and user content                                                            |
| Distribution operations | Runbook-ready             | Clean install, upgrade, binary rollback, association, support and uninstall procedure in [Release runbook](./RELEASE-RUNBOOK.md)                                                 |

## Current verification record

The final local audit passed:

- Lite source and real-Graft suite: 131 passed, 8 explicitly skipped. The
  skipped cases are the opt-in performance and external staging/discovery
  gates, not hidden successes.
- Real Graft SDK integration: 6 passed, covering whole-Space push/clone,
  diff/restore, retained session lifecycle, memory-only HTTP credentials and
  divergence analysis.
- Explicit performance load: 4 passed. Explorer with 1,000 entries was 21.6
  ms; a stable change in a 10,000-entry watcher was 39.5 ms; 10 MiB and 100 MiB
  native opens were 257.8 ms and 128.3 ms; the canonical 100,000-row first page
  was 1.60 ms and cell-commit P95 was 1.76 ms.
- The exact 1,425,218-byte Elden Ring CSV fixture imported 10,111 data rows and
  9 columns in 202.9-268.9 ms after the bulk-write fix, versus a 10,355.0 ms
  baseline. The complete row-aware Graft diff contained 10,126 row changes and
  completed in 98.4 ms. Version History retains all 102 pages while mounting at
  most 100 row-diff records; its first page server-rendered in 58.4 ms. The
  packaged import/diff flow was also directly accepted by the product owner.
- Production-mode compile and environment-manifest verification passed for
  `https://eidos.space` and `https://sync.eidos.space`. No production request
  or mutation was performed.
- The latest unsigned staging package passed the complete packaged smoke with
  zero console errors. Across the latest two rebuild sequences, the first cold
  samples were correctly rejected at 2,213 ms and 2,163 ms against the 2,000 ms
  ceiling; clean same-build reruns passed at 737 ms and 404 ms. The latest
  dense 100,000-row fixture was created in 843.3 ms and produced a 2,050 x
  1,480 Grid first frame in 855.6 ms. Four Explorer-to-editor opens stayed
  below the 1,500 ms ceiling. These samples expose cold-start variance and do
  not establish a repeated-measurement P95.
- Packaged recovery force-terminated both a resident Eidos File utility and
  the Graft SDK utility. The same opaque Eidos File session reopened with its
  committed file id, revision, table identities and row counts unchanged.
- The operation gate rejects an initial owner-state journal `ENOSPC` before
  closing SQLite handles or entering Graft, then returns to Ready with Local
  mutations enabled. A separate real SQLite `SQLITE_FULL` gate locks the data
  file at its current page count, verifies complete CSV table/row/revision
  rollback and full file validity, then raises the limit and successfully edits
  through the same runtime.
- Clone recovery injects `ECONNRESET` after partial SDK staging output and
  verifies that no final folder is published, only the coordinator-owned hidden
  sibling is removed, unrelated user files survive, the journal clears, and
  the Graft client closes.
- The cross-layer push-publication gate injects an SDK rejection after reported
  object upload and verifies `SpaceSession -> SyncExecutor -> BackgroundSyncQueue`:
  ordinary files and SQLite handles remain untouched, the gate returns Ready,
  no success is reported, credentials/Remote URL are not persisted, and one
  serialized retry is scheduled. Remote protocol fault injection remains a
  separate external gate owned with Graft/Hosted Remote.
- Binary conflict recovery preserves distinct Local and Hosted byte sequences
  in independent ordinary Recovery Spaces without touching the original. The
  Local copy excludes `.graft` and remains disconnected; the Hosted clone has
  only its verified external Sync marker. Lite never attempts a binary merge.
- Entitlement expiry injected during the push phase pauses the durable
  whole-Space item without auto-retry or persisted credentials. After access is
  restored, explicit Retry reconciles the current repository and clears the
  item only on success.
- Quota crossing durably pauses the whole-Space item as Local-safe. Advancing
  the retry clock performs no additional Remote write; after capacity returns,
  explicit Retry succeeds and alone clears the item.
- TypeScript, oxlint over the Lite directory, oxfmt over all tracked Lite files
  and `git diff --check` passed.

The local unpacked candidate is:

```text
apps/eidos-lite-desktop/dist-app/mac-arm64/Eidos Lite.app
```

The Welcome entry is 168 KiB after the Space Explorer, Sync panel, History
panel and 1.37 MiB canonical editor were moved behind their first-use
boundaries. Vite still emits a large-chunk warning for that editor chunk and
leaves the three utility/preload URLs for Electron runtime resolution. The
package resolves those entries successfully and the measured startup,
Explorer-to-editor and Grid budgets include loading their required chunks.
Further editor-internal splitting remains optimization debt, not ignored
functional evidence.

## Gates that are not complete

The following must stay visibly open before Public v1:

1. Replace the single-launch cold-start check with a repeated clean-machine
   series and either keep its P95 within 2,000 ms or close the measured startup
   variance. The latest first launches exceeded the ceiling even though their
   same-build reruns passed.
2. Run the configured read-only GitHub gates on remote macOS Apple Silicon and
   Intel workers. They have not run because this branch has not been pushed and
   no PR was authorized.
3. Build and exercise real Windows x64 and Linux arm64/x64 installers, including
   `.eidos` association, native Graft package loading and credential storage.
4. Configure signing, macOS notarization and a signed update feed; verify clean
   install, in-place upgrade, update-source validation and rollback for every
   supported target.
5. Complete at least two weeks of two-device dogfood using real Spaces and the
   official staging subscription/Credits path.
6. Re-run the owner-only staging OAuth acceptance for the release candidate,
   including subscription/Credits refresh, whole-Space enable, second-device
   clone, offline edits, divergence and both recovery copies.
7. Add destructive automation for application termination during pull/publish,
   Remote-level object-written/ref-publish failure, and
   delayed/duplicate/out-of-order Credits webhooks.
8. Provide the Sync service status page, alerting, quota dashboard and service
   runbook, and reconcile Privacy/Pricing/application copy for upload scope and
   encryption claims.
9. Obtain explicit authorization before any production contact, signed build,
   deployment, push, PR, merge or release.

## Next delivery sequence

Run remote macOS gates first, then execute the owner-only staging candidate
acceptance and start two-device dogfood. In parallel, close the destructive
test matrix and service-operations gates. Only after those results are recorded
should signing/update work and production release approval begin.
