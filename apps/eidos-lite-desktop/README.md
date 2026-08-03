# Eidos Lite Desktop

Eidos Lite is an independent Electron application for opening an ordinary
folder as a Space and working with multiple `.eidos` files in that folder.
It does not import the legacy Desktop application or its Markdown, extension,
AI, browser, or terminal architecture.

The independent package uses the checked-in official Eidos ICNS, ICO, and
1024px PNG as source assets for macOS, Windows, and Linux. A package contract
test prevents builds from silently falling back to the Electron icon or losing
the `space.eidos.lite` identity.

The current architecture slice supports local editing through an explicit
runtime mutation whitelist. The right-hand editor composes the same
`eidos-file-ui` View, Query, Fields, and Sheet controls as `eidos-file-web`,
while the left-hand Space Explorer uses the path-first `@pierre/trees` model.
The shared Sheet-create surface also imports CSV into a new table with local
preview and field inference, while View and Sheet context menus export CSV
through the same paged UI helper and a native Desktop save dialog.
The Explorer is collapsible, pointer/keyboard resizable, and remembers its
width; active file identity lives in one compact titlebar. Lite intentionally
has no multi-tab file UI: it displays one rich Eidos File and retains only the
three most recently used files in an in-memory LRU. The Explorer supports New
Eidos File, New Folder, rename, move, copy, recoverable Trash delete, and
ordinary-file import through the Space operation gate. New/Open/Recent Space
keeps the project model as normal user-owned folders. It proves the multi-file
Space model, isolated native runtimes, operation gating,
account-free Local versioning, row-aware Changes, History, forward-only
whole-Space restore, and whole-Space Graft push/clone without importing Classic
Desktop subsystems. Its service environment is one typed preset: development
and unsigned packages use official staging, while an explicit production build
selects the production account/Billing and Hosted Remote origins together. The
compiled main bundle carries a verified environment manifest, and packaged
applications ignore inherited environment overrides so a release cannot drift
to staging after packaging. The
Sync/Clone entry points now expose an independent Lite OAuth PKCE control plane,
OS-encrypted environment-scoped credentials, and a strict signed-out gate;
after login, main binds every issued or refreshed token to one stable local
device, reads the narrow Sync access grant, and enables provisioning only for
`read_write`. The first whole-Space push is serialized through the operation
gate, and Lite records a connected Remote only after Graft push plus native
worktree validation succeed. The staging account service implements the
independent Lite OAuth client and device contract, and the disposable real
OAuth + Hosted Remote acceptance is part of the operational verification
ladder. Clone now lists only account-owned Hosted Spaces, materializes into a
journaled hidden sibling, validates every Eidos File, and atomically publishes
the selected ordinary folder. Connected Spaces expose explicit Sync Now:
fetch remains handle-safe, divergence is reported before materialization,
pull runs behind full handle close/validate/reopen, and push is allowed only
for `read_write`.

The installer associates `.eidos` with Eidos Lite. A shell-opened file is
validated as an ordinary non-symlink file. Lite first reuses the deepest open
or recent canonical Space that contains it; an otherwise unknown file uses its
parent folder as the Space. The file is then selected. A second launch for the
same canonical Space focuses the existing window and reuses its three-entry
runtime LRU. Lite does not register an unimplemented URL protocol, create a
repository for one file inside an already known Space, or add a multi-tab
surface.

Packaged staging acceptance has exercised this exact UI path with the resident
SDK: whole-Space push, cold clone into a second ordinary folder, and pull while
an Eidos File editor handle was open all completed with full validation and
runtime reopen. Production remains a separate, explicitly authorized gate.

Ahead+behind Sync now offers two explicit recovery paths without changing the
divergent Space: copy Local ordinary files into a disconnected Recovery Space,
or cold-clone Hosted into a separate connected folder. Both publish atomically
into a new user-selected directory and open a new window. Sync also reports its
actual authorization, fetch, analysis, drain/close, pull, validation, reopen,
and push phases with main-process elapsed timing.

Expected Sync failures now cross preload as a typed result rather than an
Electron exception string. Main classifies offline/service, sign-in or revoked
device, entitlement, storage quota, protocol version, missing/conflicting
Remote, persistence failure, and isolated Sync-process crash. The panel always
states that Local files are safe and offers the matching retry, sign-in,
account, update, re-clone, History, or work-locally action. Credentials and raw
Remote diagnostics never enter renderer state.

A connected Space now has one main-owned background Sync item. Creating a
Local checkpoint coalesces the current whole-Space repository into that item;
the same executor serves background attempts and manual **Sync Now**. Retryable
failures use a five-attempt bounded exponential schedule and honor a bounded
`Retry-After` floor, while account, entitlement, quota, protocol, repository,
and local-change gates pause for explicit action. Crash-safe queue state lives
outside the ordinary Space under Electron `userData` and contains no
credentials. The titlebar and Sync panel expose queued, running, retry-wait,
and paused states. Local-only Spaces still neither log in nor create a Sync
queue.

Graft runs through the published `@eidos.space/graft@0.3.7` Node-API SDK.
Opening a Space does not open or classify its repository. The root Explorer and
local Eidos File runtime become usable first; the first background or explicit
version operation lazily starts one Electron utility process and retains one
`RepositorySession` for that Space. Normal status, diff, history, checkpoint,
restore, push, and clone paths use only the SDK; Lite contains no Graft CLI
adapter, subprocess fallback, or bundled CLI binary.

## Local development

From the repository root:

```bash
pnpm install
pnpm test:eidos-lite
pnpm --filter @eidos.space/eidos-lite-desktop test:performance
EIDOS_LITE_LARGE_REPOSITORY_ROOT=/path/to/large-space \
  pnpm test:eidos-lite:performance:large
pnpm smoke:eidos-lite-graft
pnpm smoke:eidos-lite-services
EIDOS_LITE_STAGING_ACCOUNT_STATE=/owner-only/path/to/smoke-account.json \
  pnpm smoke:eidos-lite-staging
pnpm build:eidos-lite
pnpm dev:eidos-lite
```

The standard performance command generates 100k/1m-row Eidos Files and a 1m-row
CSV, then gates Table open/switch/scroll/query, row and field mutations, field
conversion, CSV analysis, import, and final local completion.

`pnpm dev:eidos-lite`, `pnpm build:eidos-lite`, and
`pnpm build:eidos-lite:dev` default to `staging.eidos.space` plus
`sync-staging.eidos.space`. Use `EIDOS_LITE_ENVIRONMENT=production` for a
one-run local override. Release automation must use
`pnpm build:eidos-lite:production`, whose compiled default is `eidos.space`
plus `sync.eidos.space`. Values other than `staging` and `production` fail at
startup; Lite does not accept custom account, Billing, or Remote origins.

The real-Graft test uses the same resident SDK as the packaged application.

For an unsigned unpacked application and its process-boundary smoke:

```bash
pnpm build:eidos-lite:dev
pnpm smoke:eidos-lite-packaged
```

Packaging includes the platform-specific published Node-API package outside
ASAR for the utility process. Lite does not bundle, spawn, or search for the
Graft CLI.
The packaged smoke first opens a real empty Space, creates the first `.eidos`
file from the onboarding action, and requires the canonical editor to open it.
Before that it measures process launch through a usable Welcome renderer; it
also measures each tree click through main and the utility process to the
rendered canonical editor.
The smoke also generates a real 100,000-row Eidos File through the native
runtime, records preparation separately, and gates Explorer-to-sized-Grid
canvas first frame without treating that single frame as a scrolling P95.
It then performs real row mutations, asserts the canonical shared editor
controls and the staging service projection, opens four canonical paths
through the Pierre Shadow DOM and verifies the three-entry LRU, exercises the
same-window file-association route,
Explorer file lifecycle, resizes, collapses, and reopens the Explorer,
initializes Local versioning, reads row-aware Changes and History, creates and
restores whole-Space checkpoints, verifies the canonical CSV actions plus a
real preview/import in the isolated file runtime, and verifies that file
runtimes reopen with both checkpointed and restored data. It then injects 14 expected Sync
failure classes behind the packaged IPC boundary and requires every result to
be classified, actionable, Local-safe, and timed while the same open SQLite
runtime remains usable. It also requires typed queue status for every failure
and lets the final transient fault perform one real scheduled retry before
pausing safely. It opens the Eidos Sync panel from the real
packaged renderer and verifies the staging environment, signed-out state, login
action, no-provisioning gate, and the typed Clone/Sync preload surface without
opening a browser or mutating an external service.
Before exit, the main-owned smoke probe force-terminates a resident Eidos File
utility process, reuses the same opaque session, and requires the reopened
runtime to preserve the committed file identity, revision, table identities,
and row counts. It separately repeats the crash/reopen gate for the resident
Graft SDK utility process.

See [Architecture](./docs/ARCHITECTURE.md),
[Operations](./docs/OPERATIONS.md), and the
[install/upgrade/rollback runbook](./docs/RELEASE-RUNBOOK.md). The current
internal-candidate verdict, evidence, and explicit Public v1 gates live in
[Delivery status](./docs/DELIVERY-STATUS.md).
