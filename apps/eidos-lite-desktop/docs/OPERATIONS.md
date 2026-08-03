# Eidos Lite Desktop operations

## Verification ladder

The builder reads the official icon sources from `apps/web-app/public` for all
three target families. `src/main/package-contract.test.ts` verifies their file
signatures together with the Lite app id, product name, author, and homepage;
electron-builder must not report default-icon or missing-author warnings.

Eidos Lite source-runtime tests use Electron 43's Node 24 mode so they exercise
the same built-in `node:sqlite` implementation as packaged utility processes.
Lite no longer participates in the repository's `better-sqlite3` Node/Electron
ABI switching; the main Eidos Desktop still owns that separate native workflow.

```bash
# Electron 43 node:sqlite contract, unit tests, and source integration
pnpm --filter @eidos.space/eidos-file test:node-sqlite
pnpm test:eidos-lite

# Explicit load gate (1k/10k Spaces, 10/100 MiB files, and Tables/CSV through 1m rows)
pnpm --filter @eidos.space/eidos-lite-desktop test:performance

# Real large-Space gate; mutations run only in an automatic temporary copy
EIDOS_LITE_LARGE_REPOSITORY_ROOT=/path/to/large-space \
  pnpm test:eidos-lite:performance:large

# Repeatable local whole-Space Remote gate using the resident SDK
pnpm smoke:eidos-lite-graft

# Public official service discovery (no login or writes)
pnpm smoke:eidos-lite-services

# Renderer/main/utility-process staging build
pnpm build:eidos-lite

# SDK native package, unsigned unpacked app, and packaged smoke
pnpm build:eidos-lite:dev
pnpm smoke:eidos-lite-packaged
```

Every Lite build removes the previous `dist-electron` directory before the
main-process bundle is emitted. The build and package gates then require the
fixed entry files plus exactly one current application, contracts, SQLite,
packaged-smoke, and startup-smoke chunk. Duplicate or unexpected output fails
the command, keeping obsolete hashes and test code out of `app.asar`.

`.github/workflows/eidos-lite-desktop-gates.yml` repeats the source and real
Graft SDK suite on Linux, then builds the unsigned staging package and runs the
same packaged smoke independently on `macos-15` (Apple Silicon) and
`macos-15-intel`. The workflow has read-only repository permissions and no
signing, artifact upload, release, or production-service step. A local ARM pass
does not count as Intel evidence; Public v1 requires both remote jobs to pass.

The performance load gate measures the real Space tree walker, recursive
watcher, native Eidos File validation/open path, and generated canonical
100,000-row and 1,000,000-row Tables. The million-row matrix gates first page,
Table switching, deep viewport jumps, search, filter, sort, row mutations,
metadata edits, physical field add/drop, and Text/Select conversion. A separate
streaming fixture gates one-million-row CSV analysis, transactional import, the
exact imported count, and the single final completed progress state. Fixture
generation is reported separately from user-visible timings.

Field conversion has its own independent-copy matrix: all editor conversion
algorithm families run at 100,000 rows, Text/Select metadata conversion and one
representative physical rewrite run at 1,000,000 rows, and invalid/File routes
must fail within their bounded budgets without mutation. The normative route
matrix and lossy policies live in `packages/eidos-file/FIELD-CONVERSION.md`.

The 10/100 MiB fixtures are valid SQLite files with padded extents, so they
prove file-size handling and open overhead but not representative 100 MiB
high-density user data. Packaged acceptance independently generates a canonical
100,000-row table after the cold-start measurement, then gates Explorer click
through renderer/main/utility open, row-count projection, a non-zero Glide
canvas, and two animation frames at 2,000 ms. The packaged check proves the
rendered first-frame boundary; the million-row Runtime/DataSource matrix proves
that viewport work remains bounded. Neither substitutes for long-session GPU
repaint profiling.

## Environment selection

Lite has exactly two service presets. It does not accept per-service URL
overrides.

| Command / override                                      | Compiled or selected environment |
| ------------------------------------------------------- | -------------------------------- |
| `pnpm dev:eidos-lite`                                   | staging                          |
| `pnpm build:eidos-lite`                                 | staging                          |
| `pnpm build:eidos-lite:dev`                             | staging                          |
| `EIDOS_LITE_ENVIRONMENT=production pnpm dev:eidos-lite` | production override              |
| `pnpm build:eidos-lite:production`                      | production compiled default      |

Staging resolves account and Billing responsibilities to
`https://staging.eidos.space` and Hosted Remote operations to
`https://sync-staging.eidos.space`. Production resolves them to
`https://eidos.space` and `https://sync.eidos.space`. An invalid
`EIDOS_LITE_ENVIRONMENT` aborts startup. Release packaging must start from
`build:eidos-lite:production`; do not package stale development assets.
Both build modes emit `dist-electron/eidos-lite-build-environment.json` from the
same value used by the compiler define. Build and package scripts reject a
missing or mismatched manifest. `EIDOS_LITE_ENVIRONMENT` remains a development
override only; packaged applications always use their compiled preset.

The renderer receives only the environment name and public origins through
typed IPC. It shows a **Staging** badge for development safety. Local Space open
and editing do not perform discovery, login, entitlement, Billing, or Remote
requests.

## File association and launch routing

The package registers only the `.eidos` extension; it deliberately has no
custom URL scheme. macOS `open-file` events and Windows/Linux second-instance
arguments enter the same main-process route. The route rejects missing,
non-file, non-`.eidos`, and final-component symlink inputs. It prefers the
deepest open or available recent canonical Space containing the real path and
falls back to the parent folder only for an unknown file. It queues only a
Space-relative path across preload. The renderer drains that one-shot queue
after the Space snapshot is available and opens the file in the existing
single-editor/LRU model.

Opening another file in the same canonical Space restores and focuses its
existing window. It must not create another Graft repository or another
`RepositorySession`. Opening a file whose parent is a different folder creates
a separate Space window and independent session. Reinstall/upgrade checks must
confirm the OS still routes `.eidos` files to Eidos Lite; uninstall must leave
the ordinary files untouched.

The Welcome screen and Space titlebar expose **Copy diagnostics**. Main builds
the JSON from an allowlist and owns the clipboard write; renderer never receives
credentials, raw errors, Remote URLs, absolute paths, Space names, repository
ids, file contents, or row data. The packaged smoke reads the same summary
without mutating the clipboard and rejects path/URL/credential-shaped values.

Main also writes owner-only structured JSONL logs under Electron's application
`logs` directory (`~/Library/Logs/Eidos Lite/eidos-lite.jsonl` on macOS).
The current file rotates at 2 MiB and retains at most four files. Logs cover
application/renderer/utility-process lifecycle, Sync enable/clone/run phases,
Graft command duration, and the SDK's safe HTTP request trace. Before a value is
written, bearer tokens, credential-shaped fields, emails, absolute paths,
service URLs, Space/repository identifiers, and object ids are removed. File
contents and row data are never passed to the logger. **Copy diagnostics**
includes the latest 80 already-redacted log events, so a normal support handoff
does not require copying the raw log directory.

Use [the release runbook](./RELEASE-RUNBOOK.md) for clean install, in-place
upgrade, binary rollback, association verification, support handoff, and the
remaining signed-update gates.

The packaged smoke launches the actual unpacked executable and loads its real
sandboxed preload and renderer in hidden `BrowserWindow` instances. It first
gates process launch through a usable Welcome window at 2,000 ms, including
Electron startup, main initialization, preload IPC, and renderer readiness. It
does not statically add the full smoke or native SQLite fixture builder to the
normal main-process entry. Smoke mode dynamically loads a small startup probe,
measures the same process-launch-to-usable-window boundary, and only then loads
the full fixture/acceptance continuation. This keeps full fixture setup outside
both normal application startup and the measured first-window critical path
without moving or weakening the launch timestamp. The Electron entry itself is
a minimal bootstrap: it records the first application timestamp, buffers any
macOS `open-file` event that arrives before the application module graph is
ready, transfers those paths to the normal launch queue, and dynamically loads
the application. Startup telemetry therefore separates executable-to-bootstrap
time from application-module loading without weakening file association. It
then binds a real empty Space, creates `Getting Started.eidos` through the
visible onboarding action, and requires the canonical editor to open the new
ordinary file. It then binds a temporary Space containing four real fixtures
in separate directories, clicks all four through the `@pierre/trees` Shadow
DOM, and requires one visible editor plus a three-entry renderer/runtime LRU.
It verifies canonical-path selection, records every
tree-click-to-canonical-editor latency, and requires their maximum to remain
within 1,500 ms. This includes renderer, main IPC, utility-process
spawn/open/validation, snapshot transfer, and editor render. It then routes a
real absolute `.eidos` path through the main-process launch handler, requires
the same Space window and one editor, and verifies Explorer selection. Keyboard
resize, collapse, and reopen stay inside the smoke. This keeps package
integration and layout errors
inside the regression boundary instead of testing only main-process services.
The smoke process must own the application single-instance lock. A collision
exits with code 2 before controller, IPC, Sync or utility setup and prints an
explicit ownership error; a missing result is reported as a startup-ownership
failure rather than a raw file-not-found exception. Do not treat an immediate
collision retry as a performance sample.
The smoke uses an isolated temporary Electron `userData` directory, opens the
Eidos Sync panel, and requires the staging, signed-out, `canEnable: false`, and
system-browser login-action projection. It never clicks sign-in or calls an
external mutation endpoint.
It asserts the canonical shared Editor Shell, View Tabs, Query Toolbar, Fields
action, Sheet Tabs, CSV import action, and View export action are present. It
previews and imports a real two-row CSV through typed preload/main/utility IPC,
requires numeric inference and the resulting SQLite table row count, and
asserts the native CSV save API is exposed without opening an interactive save
dialog. It creates a folder and Eidos File, renames,
moves, copies, and sends the copy to OS Trash; checks Recent Space persistence;
and verifies that an external rename invalidates the stale session. It then
requires that rename to surface as a typed **missing**, Local-safe issue and
restores the ordinary file before explicitly reopening it with a fresh runtime.
It then inserts and deletes a real row,
initializes the whole folder as a Local Graft repository, writes another row,
verifies row-aware whole-Space Changes, creates a checkpoint, reads its History
and diff, restores the initial checkpoint, verifies the same opaque runtime
session reopened at the historical row count, and confirms the restore created
a new child checkpoint. It kills the resident Graft utility process, requires
the next status call to open a fresh SDK session from durable state, then
closes the Space cleanly with no in-flight rejection. Finally it opens the
Version History panel and fails on any preload, renderer, console, or inline UI
error. Before closing, main injects an owner-only smoke sequence for offline,
authentication, revoked device, inactive entitlement, quota, protocol,
Remote-persistence, and Sync-process-crash failures. The packaged preload must
return eight typed failure envelopes with final phase timing, and the renderer
probe requires each result to leave a `retry-wait` or `paused` queue state and
reuses the same open `.eidos` session after every failure. The final injected
worker crash must schedule a background retry; after its one-second delay, the
real unconnected smoke Space pauses safely, proving the packaged timer,
preload/IPC status, attempt accounting, and Local runtime survival. This
injection exists only in packaged smoke startup; normal windows have an empty
sequence.

## Stable Graft supply chain

The runtime pins published `@eidos.space/graft@0.3.1`; npm selects one of its
five exact-version optional native packages for the current platform. Packaging
keeps the JavaScript wrapper in ASAR and unpacks only the selected native
package; `graft-worker.js` loads it directly in an Electron
utility process. The package has no install script and unsupported
platform/libc combinations fail explicitly.

Large repositories persist a derived classification snapshot beneath
`.graft/cache/sdk-status`. The SDK validates repository format, HEAD/index,
refs/config, ignore-source contents, and current path metadata before using it;
any mismatch triggers a full rebuild. This cache contains no Remote credential
and is not authoritative history. A utility crash/reopen must retain correct
status while reporting a persisted-snapshot hit on the next unchanged read.
History and Remote metadata reads use `repositoryMetadata()` and
`listRemotes()`, both of which examine zero worktree paths.

Checkpoint, stage, commit, fetch, and push operations serialize through the
repository coordinator without pausing ordinary local SQLite mutations.
Checkpoint acknowledges the new durable HEAD after stage + commit; status
reclassification, account access, Sync queue persistence, fetch, and push are
explicit background work. Pull, restore, clone, and recovery continue to use
the durable close → materialize → validate → reopen gate because they may
replace worktree bytes.

Lite packages only the published Node-API SDK wrapper and the selected native
package. There is no CLI runtime manifest, executable download, backend switch,
`GRAFT_REMOTE_TOKEN` process environment, or search of the user's `PATH`.

For large-repository regression testing, set
`EIDOS_LITE_LARGE_REPOSITORY_ROOT` to an existing clean repository and run the
large-Space performance command. The command reads the original for status and
summary measurements, creates two independent automatic temporary copies for
cold dirty-diff and checkpoint/restore measurements, and removes both copies
afterward. Keeping the copies independent prevents a diff from warming the
checkpoint path (or vice versa) and hiding cold-start regressions. Its shell gate measures
canonicalization plus the direct-root Explorer snapshot before any Graft
session is opened and must remain below one second. The extended gate separately
measures cold/hot incremental status, 50 history summaries, metadata-only
Changes, a selected path diff, full validation-tree construction, bounded Sync
preflight, batch ignore queries, and cold/hot tracked-ignore inventory. It also
closes the first repository session and requires a replacement session to hit
the persisted status snapshot. The original repository is never staged,
committed, restored, or given Remote state. Hot and persisted-reopen status, history, metadata
Changes, batch ignore, and cached inventory must each remain below their
bounded budgets; full validation-tree construction and preflight must remain
below three seconds with fewer than 100 ignore waves, the preflight IPC
projection below 64 KiB, and one selected path diff below three seconds. The
dirty-diff copy separately gates metadata-only Changes below one second, a cold
selected-path diff below five seconds, and its selected-table diff below three
seconds. The checkpoint copy separately gates a cold large-file checkpoint
below five seconds and a subsequent warm one-line checkpoint below two seconds. The
post-commit status rebuild is reported independently and is never included in
the checkpoint acknowledgement budget.

Cold session open/status is reported separately from UI readiness. The first
snapshot reads only direct root children and may show `Checking version history`
before a Graft utility exists. Directory expansion and Eidos File open take
priority and cancel/reschedule that background read. The renderer receives the
authoritative status when it completes; a repository error must not block local
browsing/editing. Do not reinterpret the placeholder as clean or permit a
version mutation before a real repository read.

```bash
EIDOS_LITE_LARGE_REPOSITORY_ROOT=/path/to/large-space \
  pnpm test:eidos-lite:performance:large
```

Packaged execution contains no CLI binary, does not spawn a Graft subprocess,
and does not search the user's `PATH`.

## Official staging gate

The lower-level Remote-only gate is skipped unless an operator already owns a
disposable repository credential:

```bash
EIDOS_LITE_STAGING_REMOTE_URL=https://sync-staging.eidos.space/<owner>/<repository> \
EIDOS_LITE_STAGING_REMOTE_TOKEN=<short-lived-repository-token> \
pnpm --filter @eidos.space/eidos-lite-desktop test:staging
```

The repository must be disposable and pre-provisioned by the real account,
entitlement, and Remote control planes. The gate pushes two real `.eidos`
files and one ordinary file, clones the Hosted Remote into isolation, and
opens both clones with the native runtime. Missing credentials, an HTTP 401,
or absent entitlement/provisioning is a blocked external gate—not success.

The preferred complete acceptance starts from the owner-only staging smoke
account state created by the account service:

```bash
EIDOS_LITE_STAGING_ACCOUNT_STATE=/absolute/path/to/smoke-account.json \
  pnpm smoke:eidos-lite-staging
```

`smoke:eidos-lite-staging` performs the real Lite Authorization Code + PKCE
flow against `staging.eidos.space`, verifies state and the exact 13128 loopback,
exchanges and refreshes the token, binds both tokens to the same durable device,
reads the versioned `read_write` grant and quota, provisions a disposable
Hosted Remote, and invokes the real-Graft whole-Space push/clone gate. It then
revokes the disposable device through the account API and requires the bound
token to fail with 401. Passwords and OAuth/Remote tokens stay in the owner-only
state file or child-process environment and are never printed.

If this gate provisions successfully but the first `refs/heads/main` request
returns 401, run the local explicit-push credential regression before changing
the Account or Remote service. The transport must retain the canonical Space
root across `configureRemote`/`setHttpBearerToken` and `push`; the SDK's public
`RepositorySession.target` is the `.graft` metadata path and is not the Space
identity. On 2026-07-29 this regression caught and fixed a reopen-before-every-
command bug, after which the unmodified published SDK completed the real
whole-Space staging push/clone and disposable OAuth revocation gate.

As of the architecture audit on 2026-07-28, both official Remote origins pass
public discovery and advertise Graft Remote v1. Staging declares
`https://staging.eidos.space` as its bearer authority; production declares
`https://eidos.space`. Both account origins also pass OIDC discovery for
authorization-code + refresh grants, PKCE S256, UserInfo, and JWKS. This does
not prove a complete Lite browser login.

The checked-out account-service source now registers the independent
`lite.desktop.eidos.space` public PKCE client with its exact 13128 loopback,
accepts it in the durable device-token contract, and exposes only `sub` plus the
versioned `sync_access` grant. Lite binds the stable device after issue and
refresh, fails closed on unknown grants, and provisions only for `read_write`.
The first push marker is written outside the Space only after Graft push and
native validation.

On 2026-07-28, staging account Worker version `3fce2946` deployed the reviewed
Lite OAuth/device increment. D1 verification, the existing account → grant →
Remote smoke, and the complete Lite OAuth acceptance above passed with a
disposable account (`read_write`, 10 GiB quota). The real-Graft gate pushed and
cloned two `.eidos` files plus an ordinary file, opened both clones with the
native runtime, and verified device revocation. This is staging acceptance
only; production remains an independent release gate.

The packaged staging UI was then accepted against the account-owned Hosted
Space using the resident SDK. Lite cold-cloned the complete Space into two
independent ordinary folders, including two `.eidos` files and ordinary
Markdown/TXT assets. A checkpoint created in the first clone was pushed and
materialized by `Sync Now` in the second clone while `eidos-project.eidos` was
open. The pull drained mutations, closed application SQLite handles, validated
the full worktree, reopened the editor runtime, and left no clone or recovery
journal. This test did not contact or mutate production.

The same two disposable clones also passed the divergence safety check. One
clone pushed a remote-only checkpoint while the other retained a distinct
local-only checkpoint. `Sync Now` fetched the new Remote head, reported
ahead+behind history, and stopped before materialization with “No files were
replaced.” The local-only file remained present, the remote-only file remained
absent from that worktree, and its open Eidos File editor stayed usable.

## Failure and recovery runbook

- **An open `.eidos` path disappears or changes identity:** close the stale
  runtime immediately and surface the typed issue. Do not recreate the file or
  let a replacement inherit the previous session capability. After the user or
  external tool restores the path, **Retry open** validates it and creates a
  fresh session.
- **A `.eidos` path becomes a symlink, directory, or special entry:** do not
  follow or mutate it. Offer reveal and History where available; require the
  path to become an ordinary in-Space file before reopening.
- **SQLite reports busy, unreadable, corrupt, or not-a-database:** preserve the
  original bytes and show the classified recovery notice. Busy and permission
  failures may retry after the external condition is removed. Corrupt files do
  not offer automatic repair; use reveal, a copied file, or whole-Space History.
- **CSV exceeds 16 MiB or is not valid UTF-8/CSV:** reject it before mutation
  with the canonical import dialog left recoverable. Parsing and field
  inference happen in the selected Eidos File utility runtime. A failed import
  must not publish a partial table; choose another file or correct the source.
- **SQLite reports `SQLITE_FULL` during CSV import or another mutation:** the
  native Runtime transaction must roll back the complete table/row/revision
  change, keep the `.eidos` file valid, and surface the capacity error. Free
  space, then retry through the same open runtime; do not create a recovery copy
  or claim a partial import. The destructive gate uses a real SQLite
  `max_page_count` limit rather than a mocked write error.
- **CSV export is canceled:** write nothing. The renderer receives no absolute
  output path. A confirmed export writes only the generated CSV bytes to the
  location selected by the native save dialog; it never changes the Space.

- **First Sync scope contains hidden or secret-like paths:** display the local
  paths and keep confirmation unchecked. Do not provision a Remote until the
  user explicitly accepts the complete manifest. Classification uses names and
  filesystem metadata only; it never reads or logs file contents.
- **First Sync scope contains a file of at least 100 MiB:** show its size and
  require the same explicit risk confirmation. Files over 1 GiB, symlinks, and
  unsupported filesystem entries block Sync rather than relying on a later
  HTTP 413 or following a link outside the Space.
- **The Space changes after scope review:** recompute the SHA-256 manifest and
  reject the stale approval. If Remote provisioning raced with the second
  check, leave the deterministic empty Remote unconnected and retry the same
  repository after a fresh review; never configure or push the widened scope.
- **The same Space is opened through another path or symlink:** canonicalize
  and focus the reserved/existing window before opening Graft or SQLite. Never
  create a second repository session for the alias.
- **A window closes during mutation or Sync:** remove it from navigation
  immediately, but retain its close promise in the controller. Application
  shutdown must wait for that promise to drain mutation and repository work,
  close runtime handles, and close the resident Graft session.
- **The operation journal cannot start because the state volume is full or
  unwritable:** abort before closing any SQLite handle or invoking Graft, return
  the Space gate to Ready, and keep Local editing available. A materializing
  operation must never start without its first durable owner-only journal
  entry. Data-volume `SQLITE_FULL` is covered independently by the native
  Eidos File transaction gate above.

- **Expected Sync failure reaches renderer:** do not throw a raw account,
  Remote, or Graft message over IPC. Return the main-classified failure plus
  failed-phase telemetry. Raw diagnostics remain in main and must already be
  credential-redacted.
- **Offline, timeout, DNS, or connection reset:** show **Offline**, keep Local
  editing enabled, and offer **Retry now**. Do not clear account state or touch
  the worktree.
- **401 or expired account session:** show **Paused: sign in**, clear unusable
  credentials through the account session contract, and start a fresh PKCE
  sign-in only after the user chooses it.
- **Revoked or conflicting device binding:** show the distinct device message
  and re-register only through a new sign-in. Never reuse the rejected bearer
  token.
- **Missing/blocked entitlement:** show **Paused: subscription** and open the
  selected official account origin on explicit user action. Pending Local
  checkpoints remain in the same repository.
- **Entitlement expires during a running Sync:** classify the active phase,
  pause the single whole-Space queue item without automatic retry, keep Local
  editing/checkpoints available, and persist no access token. After the account
  service reports restored write access, explicit **Retry now** reconciles the
  current repository and clears the durable item only after success.
- **HTTP 413 / quota exhausted:** show **Paused: storage full**. Never retry a
  write loop automatically; keep the durable whole-Space item and Local
  checkpoint, while fetch/export/recovery and Local editing remain available.
  After capacity is restored, explicit **Retry now** starts one fresh serialized
  reconciliation and clears the item only after success.
- **HTTP 426 / protocol mismatch:** stop Remote operations, show the official
  update action, and do not attempt compatibility guessing in Lite.
- **HTTP 404 / missing Hosted Space:** stop publishing and offer the
  account-owned Hosted Space list for re-clone. Do not rewrite the stored Remote
  marker automatically.
- **HTTP 409 / Remote ref race:** no force push. Re-fetch through **Retry now**;
  an ahead+behind result must return to the ordinary two-copy conflict flow.
- **HTTP 429 or 502/503/504:** keep Local state and offer retry. The failure
  contract carries a bounded retry hint. Queue a new serialized attempt with
  exponential delay; treat a valid `Retry-After` as a floor, never spin a tight
  loop, and pause after the fifth failed attempt.

The packaged smoke deterministically injects 404, 409, 413, 426, 429, 500,
502, 503, and 504 envelopes before the Space session is invoked. It asserts
typed classification, retry-versus-pause scheduling, Ready gate state, live
Eidos File runtime access, and unchanged ordinary-file metadata. These are
application recovery tests, not claims that the public staging service emitted
each response. Real staging 429/5xx acceptance remains an explicit external
fixture gate.

The owner-only OAuth staging smoke additionally uses a valid device-bound token
to request the protocol descriptor of a random, unprovisioned sibling
repository. The real Hosted Remote must return a `repository_not_found` HTTP 404. Graft SDK 0.1 normalizes the same failed fetch to `remote origin has no
branch main` without preserving the status, so Lite maps that exact SDK error to
the missing-Remote recovery path and verifies that no worktree file changed.
This is real staging evidence for 404 only; 409, 413, 429, and 5xx remain behind
explicit external staging gates.

- **HTTP 500 / Remote persistence failure:** do not claim that a ref was
  published. Preserve Local checkpoints and retry only as a new serialized
  repository operation.
- **Graft SDK unavailable or wrong version:** local editing remains available;
  Local versioning and Sync controls remain disabled and report the
  pinned/observed version.
- **Graft utility crashes:** reject its in-flight command. The OS releases the
  repository lock; the next repository operation starts a fresh utility,
  reopens the same Space, and reconstructs the session from durable `.graft`
  state. No PID file or daemon registration is recovered.
- **Space closes during repository work:** stop accepting new repository work,
  let the in-flight SDK operation settle, await session close, then release the
  utility process. Never kill a worker while its result is still authoritative.
- **Enable Versioning or checkpoint fails:** local file writes remain owned by
  the user. The gate attempts native validation and handle reopen, retains the
  recovery journal, surfaces the exact Graft failure, and never reports a
  completed checkpoint.
- **Restore is requested with local changes:** reject before closing handles.
  The user must create a checkpoint first, so no uncommitted local version can
  be silently replaced.
- **Restore uses a stale history head:** reject before materialization and ask
  the UI to refresh History. This is the optimistic concurrency boundary for
  local restore.
- **Restore fails after some paths materialize:** validate the resulting
  worktree and reopen handles. When both succeed, clear the operation journal,
  return the gate to Ready, and report the original command failure. The
  worktree remains visibly dirty and can be retried or checkpointed; never
  fabricate an all-or-nothing Graft result.
- **Restore validation fails:** do not stage or create the restore checkpoint.
  Keep the journal and failed gate state for explicit recovery.
- **Restore commit fails after validation:** reopen the validated worktree and
  leave it dirty, clear the completed recovery journal, and return local editing
  to Ready. No history entry is claimed until the official Graft commit
  succeeds.
- **Push fails:** keep local work and Graft metadata; never report synced. The
  next push is serialized behind the current Space operation. Retryable
  failures remain one coalesced pending whole-Space item; non-retryable
  failures pause.
- **Objects upload but Remote ref publication fails:** Graft owns the HTTP
  object/ref protocol; Lite must not reproduce or repair it. Treat the rejected
  SDK `push()` as `remote-persistence-failed`, leave the Local checkpoint and
  ordinary files untouched, keep SQLite handles open, return the Space gate to
  Ready, persist no credential/Remote URL in queue state, and schedule one new
  serialized retry. The deterministic application gate injects this result at
  the SDK boundary; a Remote-level partial-publish fixture remains external
  acceptance work.
- **Application exits while Sync is pending/running:** store only safe queue
  metadata under `userData/spaces/<space-id>`. A running item is reopened as
  pending on the next bind. Obtain a new in-memory account/Remote credential
  for the attempt; never serialize the prior token. If termination occurs while
  `push()` may be publishing the Remote ref, the fresh process must fetch and
  compare before writing: clear an already-published item without another push,
  or perform exactly one push when the Local ref remains ahead. The destructive
  process test covers both outcomes with unchanged ordinary/SQLite bytes and a
  fully cleared queue only after reconciliation succeeds.
- **User clicks Retry while a timer is waiting:** cancel the timer, reset the
  bounded attempt budget, and run the same queue item immediately. Do not start
  a parallel `RepositorySession` command.
- **A connected Space creates several checkpoints before Sync runs:** retain
  one pending item. Reconciliation always compares and transfers the entire
  current repository, so per-checkpoint network jobs would be both redundant
  and incorrect.
- **Fetch shows both Local and Hosted commits:** report a conflict before
  closing SQLite handles or running pull. Keep both refs and the local
  worktree unchanged; do not merge, reset, or force push. The conflict panel
  may copy Local ordinary files into a disconnected Recovery Space or cold
  clone Hosted into a separate connected folder. Both must re-fetch and
  re-authorize before opening a save dialog.
- **A conflict includes binary files:** never attempt a binary merge. **Copy
  Local Space** preserves the exact Local bytes in a disconnected Recovery
  Space; **Clone Hosted Space** preserves the exact Hosted bytes in a separate
  connected Recovery Space. Keep the original divergent Space unchanged, so
  all versions remain independently user-owned ordinary files.
- **Local Recovery copy:** require a clean checkpoint, drain mutations, close
  handles, exclude root `.graft`, reject symlinks, special files and nested
  `.graft`, validate all copied `.eidos` files, then atomically publish a new
  folder. Never attach the source Remote or Sync marker to the copy.
- **Recovery fails before publish:** remove only the exact coordinator-owned
  hidden sibling and retain the original divergent Space. Around the atomic
  rename boundary, use the same startup journal rules as Hosted clone.
- **Pull is required:** re-check that the Space is still clean and no longer
  diverged after fetch after stopping and draining mutations. If it changed,
  clear the pre-materialization journal and return to Ready without closing
  handles. Otherwise close handles through `SpaceOperationGate`, pull, validate
  every `.eidos`, and reopen the prior resident LRU.
- **Read-only account has local commits:** apply safe Hosted fast-forwards, but
  do not push. Report the remaining ahead count and keep local checkpoints.
- **OS credential encryption unavailable:** reject sign-in persistence. Never
  fall back to plaintext or store a token in the Space.
- **OAuth state/callback mismatch or timeout:** close the loopback listener,
  preserve Local mode, and require an explicit retry. Do not exchange the code.
- **Token refresh fails:** clear the unusable encrypted session and return to
  the signed-out gate. Do not pass an expired account token to Graft.
- **Entitlement/device/quota response is absent or unrecognized:** stop before
  repository provisioning. An unknown contract is a blocked gate, not an
  implicit entitlement.
- **Clone fails before publish:** remove only the exact hidden sibling created
  by the clone coordinator and clear its journal. Never create, overwrite, or
  delete the user-selected final destination.
- **Clone transport resets after writing partial staging content:** treat the
  SDK `ECONNRESET` as a pre-publish failure, close the Graft client, remove only
  the coordinator-owned hidden sibling, and clear its journal. Preserve every
  unrelated user-owned sibling in the destination parent. The deterministic
  gate injects the reset at the SDK boundary; it does not claim that staging
  emitted the failure.
- **Clone crashes around publish:** next launch reads the independent
  `userData/clone-operations` journal. An unpublished hidden sibling is
  removed; a folder already atomically published is validated and its external
  Sync marker is completed. If both paths exist or the journal is malformed,
  remove nothing and log an operator warning.
- **Pull/restore materialization fails:** keep the Space operation journal,
  validate the resulting worktree, reopen handles when safe, clear the journal,
  return to Ready, and surface the original failure. Keep the journal and failed
  gate only when validation or reopen fails. Never delete ordinary user files
  as automatic recovery.
- **Materialized `.eidos` is invalid:** leave the gate failed and journaled.
  Do not reopen editable handles. Offer retry or user-directed recovery in a
  later UI slice.
- **Utility runtime crashes:** reject only that file's pending calls. Closing
  and reopening the path creates a fresh process; the other cached files remain
  isolated. Packaged acceptance force-terminates a resident file utility and
  requires the same opaque session to reopen with its committed file identity,
  revision, table identities, and row counts unchanged.
- **Application crashes mid-operation:** the next session reads the journal and
  validates every `.eidos` before clearing it and making the Space available.
  The process-local LRU is not restored; no stale native handle survives the
  process crash.
- **Application is terminated during pull materialization:** the destructive
  process gate force-terminates a real child after handles close, the durable
  journal reaches `materializing`, and a worktree file changes. A fresh process
  must validate a real `.eidos`, reopen handles, clear the journal, return Ready,
  and accept a new Local mutation; it must not claim whether the interrupted
  pull completed beyond the validated worktree state.
- **External file delete, rename, symlink, or atomic replacement:** invalidate
  the old opaque session and return the editor to its empty state if it was
  active. The user can reopen the new path after Explorer refresh.
- **Copy/import preflight or validation fails:** publish no target when
  possible, remove hidden staging files and partial imports, reopen the prior
  resident LRU, and surface the filesystem or native validation error.
- **Conflict:** do not invent a merge. Preserve Graft's reported state and
  require an explicit conflict workflow before another materialization.
- **Sync appears slow:** inspect the visible phase timeline. Authorization and
  fetch are handle-safe; drain/close, pull, validation and reopen identify the
  materialization window. Final timings come from main and must match only
  phases actually executed.

Never place OAuth, entitlement, or Graft Remote tokens in the Space or journal,
and never emit them in command output or application logs.
