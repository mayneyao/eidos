# Eidos Lite Desktop operations

## Verification ladder

Run native-runtime operations sequentially. The repository shares one linked
`better-sqlite3` binary between Node and Electron.

```bash
# Node ABI, unit tests, and source integration
pnpm --filter @eidos.space/eidos-lite-desktop native:node
pnpm test:eidos-lite

# Repeatable local whole-Space Remote gate using the resident SDK
pnpm smoke:eidos-lite-graft

# Temporary adapter-parity gate using the verified CLI fallback
EIDOS_LITE_GRAFT_CLI_PATH=/absolute/path/to/graft \
  pnpm --filter @eidos.space/eidos-lite-desktop test:graft:cli

# Public official service discovery (no login or writes)
pnpm smoke:eidos-lite-services

# Renderer/main/utility-process staging build
pnpm build:eidos-lite

# Electron ABI, verified Graft bundle, unpacked package, and packaged smoke
pnpm build:eidos-lite:dev
pnpm smoke:eidos-lite-packaged
```

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

The renderer receives only the environment name and public origins through
typed IPC. It shows a **Staging** badge for development safety. Local Space open
and editing do not perform discovery, login, entitlement, Billing, or Remote
requests.

The packaged smoke launches the actual unpacked executable and loads its real
sandboxed preload and renderer in a hidden `BrowserWindow`. It binds a temporary
Space containing four real fixtures in separate directories, clicks all four
through the `@pierre/trees` Shadow DOM, and requires one visible editor plus a
three-entry renderer/runtime LRU. It verifies canonical-path selection,
keyboard resize, collapse, and reopen before exercising the editor. This keeps
package integration and layout errors
inside the regression boundary instead of testing only main-process services.
The smoke uses an isolated temporary Electron `userData` directory, opens the
Eidos Sync panel, and requires the staging, signed-out, `canEnable: false`, and
system-browser login-action projection. It never clicks sign-in or calls an
external mutation endpoint.
It asserts the canonical shared Editor Shell, View Tabs, Query Toolbar, Fields
action, and Sheet Tabs are present. It creates a folder and Eidos File, renames,
moves, copies, and sends the copy to OS Trash; checks Recent Space persistence;
and verifies that an external rename invalidates the stale session. It then
inserts and deletes a real row,
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

The normal runtime pins `@eidos.space/graft@0.1.0`. npm resolves one published
Node-API 8 optional package for macOS arm64/x64, Linux glibc arm64/x64, or
Windows x64. Packaging keeps the JavaScript wrapper in ASAR and unpacks only
the selected native package; `graft-worker.js` loads it directly in an Electron
utility process. The package has no install script and unsupported
platform/libc combinations fail explicitly.

`graft-runtime-manifest.json` still pins the official CLI release and
checksums for the temporary comparison/fallback adapter.
`EIDOS_LITE_GRAFT_BACKEND=cli` is the only switch to that adapter. Normal
packaged execution does not spawn the CLI or search the user's `PATH`.

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
pnpm --filter @eidos.space/eidos-lite-desktop native:node
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
- **HTTP 413 / quota exhausted:** show **Paused: storage full**. Never retry a
  write loop automatically; fetch/export/recovery and Local editing remain
  available.
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
  worktree, reopen handles when valid, retain the operation journal, and report
  a recoverable failure. The worktree remains visibly dirty and can be retried
  or checkpointed; never fabricate an all-or-nothing Graft result.
- **Restore validation fails:** do not stage or create the restore checkpoint.
  Keep the journal and failed gate state for explicit recovery.
- **Restore commit fails after validation:** reopen the validated worktree and
  leave it dirty with the journal retained. No history entry is claimed until
  the official Graft commit succeeds.
- **Push fails:** keep local work and Graft metadata; never report synced. The
  next push is serialized behind the current Space operation. Retryable
  failures remain one coalesced pending whole-Space item; non-retryable
  failures pause.
- **Application exits while Sync is pending/running:** store only safe queue
  metadata under `userData/spaces/<space-id>`. A running item is reopened as
  pending on the next bind. Obtain a new in-memory account/Remote credential
  for the attempt; never serialize the prior token.
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
- **Clone crashes around publish:** next launch reads the independent
  `userData/clone-operations` journal. An unpublished hidden sibling is
  removed; a folder already atomically published is validated and its external
  Sync marker is completed. If both paths exist or the journal is malformed,
  remove nothing and log an operator warning.
- **Pull/restore materialization fails:** keep the Space operation journal,
  validate the resulting worktree, reopen handles when safe, and surface the
  failure. Never delete ordinary user files as automatic recovery.
- **Materialized `.eidos` is invalid:** leave the gate failed and journaled.
  Do not reopen editable handles. Offer retry or user-directed recovery in a
  later UI slice.
- **Utility runtime crashes:** reject only that file's pending calls. Closing
  and reopening the path creates a fresh process; the other cached files remain
  isolated.
- **Application crashes mid-operation:** the next session reads the journal and
  validates every `.eidos` before clearing it and making the Space available.
  The process-local LRU is not restored; no stale native handle survives the
  process crash.
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
