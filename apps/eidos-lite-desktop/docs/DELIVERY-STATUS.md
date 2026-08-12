# Eidos Lite Desktop delivery status

Last audited: 2026-08-13

## Verdict

The current branch is the source for **Eidos Lite 0.1.6**. Local Spaces and
versioning are public desktop capabilities; Eidos Sync remains an invite-only
private preview backed by the official Hosted Remote.

This verdict preserves the product boundary: one window owns one ordinary
folder Space, one Space owns one Graft repository and one Hosted Remote, and
the UI displays one active Eidos File while retaining at most three runtimes
in an in-memory LRU. The product deliberately does not expose multi-file tabs.

## Delivered capability

| Area                    | Internal-candidate status | Evidence boundary                                                                                                                                                 |
| ----------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independent application | Ready                     | Focused Electron main, sandboxed preload, utility processes, renderer, bundle id, package config, and tests                                                       |
| Local Space             | Ready                     | New/Open/Recent ordinary folders, canonical one-window ownership, Pierre Explorer, watcher, ordinary-file system open and recoverable file operations             |
| Eidos File editing      | Ready                     | Canonical `eidos-file-ui` Grid/View/Query/Fields/Sheet UI, real SQLite transactions, one active editor and a three-runtime LRU                                    |
| Local versioning        | Ready                     | Whole-Space status, Changes, row-aware diff, History, checkpoint, forward-only restore and stable-change automatic checkpoints through the resident Graft SDK     |
| Sync control plane      | Staging-ready             | Independent PKCE/device/grant flow, preflight upload scope, official Hosted Remote provisioning, background queue, typed failures and Local-safe recovery         |
| Whole-Space Sync        | Private-preview ready     | Real staging push/clone/pull and divergence acceptance is recorded in [Operations](./OPERATIONS.md); reviewed merge uses the published Graft SDK 0.3.11           |
| Recovery                | Release verified          | Durable merge reopen/abort, operation journals, close/validate/reopen materialization, two-copy recovery, external invalidation, and utility crash reopen         |
| Diagnostics             | Internal-ready            | Main-owned allowlisted Copy diagnostics excludes credentials, URLs, paths, Space/repository identity and user content                                             |
| Distribution operations | Runbook-ready             | Clean install, upgrade, binary rollback, association, support and uninstall procedure in [Release runbook](./RELEASE-RUNBOOK.md)                                  |
| Languages               | Source-ready              | System/English/Simplified Chinese preference, native menu/dialog translation, Lite core surfaces, and shared Eidos File editor locale                             |
| Release and updates     | Implementation-ready      | Isolated `lite-v*` workflow, five platform/architecture packages, fail-closed signing/notarization, product-specific stable/beta feeds, and Settings update state |

## Current verification record

The final local audit passed:

- The reviewed merge source integration passes one real local-Graft dual-client
  E2E: common ancestor -> Policy v1 CAS -> text/binary/real `.eidos` conflicts
  with Local-only, Hosted-only, and same-field row changes -> cell choice -> SDK
  reopen -> stale CAS rejection -> remaining table choices -> path unresolve ->
  full validation -> two-parent continue -> push/fetch equality. The same test
  covers partial resolution, reopen, abort, cancellation, idempotent status,
  and a transient filesystem Remote failure. Graft SDK 0.3.11 is pinned in the
  lockfile, and the real merge flow passed against the published registry
  package.

- Lite source suite: 106 files and 558 tests passed; 186 tests were explicitly
  skipped. The skipped cases are the 158-case opt-in schema matrix,
  opt-in performance, external staging/discovery, large-repository, and local
  release-SDK gates, not hidden successes. With the exact Graft 0.3.11 release
  build, the complete schema matrix separately passed all 158/158 cases in
  354.44 seconds. It covers compatible directory-wide schema
  unions, validated rebuilds, every conflict family in both whole-file
  directions, SQLite internal structures, malformed-file diagnostics, Eidos
  stable identities, Runtime validation, stale/reopen/abort, and safe failure.
  Two validation-required candidate families retain an executable Graft API
  gap documented in the compatibility matrix; their safe Local recovery path
  passes and is not mislabeled as an automatic merged result.
- Published Graft SDK integration: 14 passed, covering whole-Space push/clone,
  diff/restore, retained session lifecycle, memory-only HTTP credentials and
  divergence analysis. The published Graft 0.3.11 merge E2E also passed both
  availability and full dual-client cases.
- Explicit performance load: 16 passed. Explorer with 1,000 entries was 14.4
  ms; a stable change in a 10,000-entry watcher was 38.7 ms; 10 MiB and 100 MiB
  native opens were 103.6 ms and 98.9 ms; the canonical 100,000-row first page
  was 3.7 ms and cell-commit P95 was 1.86 ms.
- The exact 1,425,218-byte Elden Ring CSV fixture imported 10,111 data rows and
  9 columns in 202.9-268.9 ms after the bulk-write fix, versus a 10,355.0 ms
  baseline. The complete row-aware Graft diff contained 10,126 row changes and
  completed in 98.4 ms. Version History retains all 102 pages while mounting at
  most 100 row-diff records; its first page server-rendered in 58.4 ms. The
  packaged import/diff flow was also directly accepted by the product owner.
- Production-mode compile and environment-manifest verification passed for
  `https://eidos.space` and `https://sync.eidos.space`. The approved
  `lite-v0.1.4` workflow then built all five targets, deployed the update
  router, and verified every stable metadata route at version 0.1.4.
- The public macOS arm64 ZIP matched `SHA256SUMS` at
  `6179de506523d6cb88a55505da6a54c81d25fa0e9f4425ba400e13deda6ca472`.
  Its Developer ID signature, notarization ticket, Gatekeeper assessment, and
  production packaged smoke all passed; the downloaded artifact reached a
  usable window in 1,910 ms with zero console errors and Graft SDK 0.3.11.
- The latest unsigned staging package passed the complete packaged smoke with
  zero console errors. The normal main-process entry no longer imports the
  packaged-smoke fixture builder or native SQLite chunk; it dynamically loads
  the 1.78 KiB startup probe only in smoke mode and the 38.25 KiB continuation
  only after the Welcome window is usable. The application bundle fell from
  191 KiB to 156 KiB. Two rebuilt first-launch samples passed at 1,972 ms and
  1,986 ms against the 2,000 ms ceiling; same-build reruns passed at 405 ms and
  463 ms. Explorer-to-editor P95 stayed between 848.4 ms and 884.2 ms,
  including the rendered 100,000-row Grid, and all runs reported zero console
  errors. This closes the test-only static-load defect, but the narrow
  first-launch margin still does not establish a repeated clean-machine P95.
- Phase-level startup telemetry now preserves six contiguous durations whose
  sum must equal the unchanged parent-process launch budget. A newly rebuilt
  unsigned package failed at 2,257 ms: 2,010 ms (89%) elapsed before the first
  main-module statement, 55 ms covered main-to-ready plus IPC setup, and 191 ms
  covered Welcome creation, renderer load and DOM usability. Its same-build
  rerun passed at 386 ms, split into 169 ms before main, 40 ms for ready/IPC and
  177 ms for the Welcome renderer. This locates the remaining rebuild variance
  before application initialization; it does not waive signed clean-machine
  acceptance or relabel a warm run as P95.
- A 0.41 KiB Electron bootstrap now timestamps before dynamically loading the
  156.74 KiB application module graph while buffering early macOS `open-file`
  events until the application listener takes ownership. The final rebuilt
  unsigned package passed at 1,820 ms: 1,573 ms (86%) before the bootstrap,
  only 21 ms loading the application graph, 47 ms for ready/IPC and 178 ms for
  the usable Welcome renderer. Its complete packaged acceptance also passed
  the 100,000-row Grid at 898.6 ms and reported zero console errors. This shows
  further application-module splitting cannot remove the dominant unsigned
  first-launch cost; signed clean-machine measurement remains the valid gate.
- Single-instance ownership is now deterministic in packaged verification. A
  smoke process that cannot own its isolated Electron instance exits with code
  2 before controller/IPC/Sync/utility setup and prints an explicit lock error;
  the harness translates a missing report into a startup-ownership diagnostic
  instead of raw `ENOENT`. An isolated shared-`userData` collision verified the
  exact exit, message and absence of a result, while a normal complete run of
  the same package passed at 366 ms with zero console errors.
- The delivery audit found that repeated Vite builds had accumulated 28 files
  and 1.5 MiB in `dist-electron`, including three application chunks, four
  SQLite chunks, five copies of each smoke chunk and obsolete `preload.mjs`.
  The new output verifier rejected that exact state. The main build now removes
  the generated directory first and requires five fixed entries plus exactly
  one current copy of each dynamic boundary. The clean output contains 10 files
  and 480 KiB; the rebuilt `app.asar` fell from about 3.4 MiB to 2.4 MiB and its
  manifest contains only those 10 Electron files. The package-only command
  independently re-runs the same gate. The rebuilt complete packaged smoke
  passed at 409 ms, rendered the 100,000-row Grid in 849.3 ms and reported zero
  console errors.
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
- A real child process now enters the production durable queue and
  `SyncExecutor`, reaches the SDK-facing push-publication boundary, and is
  force-terminated while the item is durably `running`. A fresh process turns
  it into `crash-recovery/pending`, obtains a new memory-only credential and
  re-fetches before acting. Both uncertain Hosted outcomes are covered: an
  already-published ref causes zero repeat pushes; an unpublished ref causes
  exactly one push. Both clear the queue only after success while preserving
  ordinary and fully validated SQLite bytes and a Ready operation gate.
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
- A real child process is force-terminated after production
  `SpaceOperationGate` closes handles, journals `materializing`, and changes the
  worktree. A fresh gate validates a real `.eidos`, reopens, clears the journal,
  returns Ready, and accepts a new mutation without inventing a pull outcome.
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
   variance. The smoke-only static native load is removed and the latest
   rebuilt first launches passed, but 1,972-1,986 ms has insufficient release
   margin compared with 405-463 ms same-build reruns.
2. Keep the configured GitHub release gates green on macOS Apple Silicon and
   Intel workers for every `lite-v*` tag.
3. Build and exercise real Windows x64 and Linux arm64/x64 installers, including
   `.eidos` association, native Graft package loading and credential storage.
4. Complete clean-machine in-place upgrade and rollback from 0.1.3 to the
   signed/notarized 0.1.4 package. Signing, notarization, stable update metadata,
   public checksum, and direct launch verification are complete.
5. Complete at least two weeks of two-device dogfood using real Spaces and the
   official staging subscription/Credits path.
6. Re-run the owner-only staging OAuth acceptance for the release candidate,
   including subscription/Credits refresh, whole-Space enable, second-device
   clone, offline edits, divergence and both recovery copies.
7. Add destructive automation for Remote-level object-written/ref-publish
   failure and delayed/duplicate/out-of-order Credits webhooks. Application
   process termination at the SDK-facing publication boundary is covered.
8. Provide the Sync service status page, alerting, quota dashboard and service
   runbook, and reconcile Privacy/Pricing/application copy for upload scope and
   encryption claims.
9. Obtain explicit authorization before any future production mutation,
   deployment, push, PR, merge or release.

## Next delivery sequence

Exercise the signed 0.1.3 -> 0.1.4 upgrade and rollback on a clean Mac, then
execute the owner-only staging acceptance and start two-device dogfood. In
parallel, close the real Windows/Linux hardware, destructive test matrix, and
service-operations gates.
