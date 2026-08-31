# Eidos CLI

`eidos` is the agent-first Rust interface to the open Eidos File format. It
reads and modifies `.eidos` files directly, prints readable terminal output by
default, and does not require a running Eidos application.

## Responsibilities

- Create and inspect Eidos Files.
- Read logical tables, fields, relations, views, and file metadata.
- Query rows through the Eidos query model rather than raw SQL.
- Apply atomic row, saved View, and schema mutations with optimistic revision checks.
- Upsert rows by stored business keys and apply mixed row batches atomically.
- Import, attach, detach, and verify File-field attachments without hand-building metadata.
- Create and update standard Views from user-facing Table and Field names.
- Create, rename, and delete Tables and Fields, and create forward Relations from user-facing intent.
- Preview and manage Formula and Lookup Fields through the canonical Runtime.
- Query Formula and Lookup values, including filters and sorts, through Runtime evaluation.
- Validate file identity, structure, content, and supported semantics.
- Serve a local web editor for one file over HTTP on macOS, Linux, and Windows.
- Publish immutable Eidos File or Markdown Versions, including attachments, to a stable read-only URL.
- Upgrade its own installation from a verified standalone release.
- Initialize the bundled Agent Skill for a Space/project or the current user.

The CLI does not manage Space lifecycle, ordinary documents, application RPC,
version history, or Sync. Use ordinary file tools for standalone text,
`eidos attachment` for Eidos File attachments, and Graft for history or Sync.

## Install

macOS and Linux:

```bash
curl -fsSL https://download.eidos.space/cli/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://download.eidos.space/cli/install.ps1 | iex
```

The installers resolve the stable version from [`LATEST`](./LATEST), download
the exact `cli-v<version>` GitHub Release asset, and verify it against the
release `SHA256SUMS` before replacing an existing binary. Unix installs to
`~/.local/bin` by default; Windows also adds that directory to the user PATH.
The short URLs are served by the `apps/download` Worker.

Pin a version or installation directory with environment variables:

```bash
EIDOS_VERSION=0.37.1 EIDOS_INSTALL_DIR=/usr/local/bin sh install.sh
```

Standalone assets currently cover macOS arm64/x64, Linux x64, and Windows x64.

Upgrade an existing standalone installation to the latest stable version:

```bash
eidos upgrade
```

The command uses the same release pointer, platform archive, and
`SHA256SUMS` contract as the installers. It verifies the downloaded binary's
reported version before replacing the currently running executable. A current
version is a no-op; use `--version <semver>` to select an exact release and
`--force` only when intentionally reinstalling or downgrading. The containing
directory must be writable by the current user. On Windows, the verified
replacement is finalized by a one-time helper immediately after the running
CLI process exits.

## Initialize the Eidos Skill for an Agent

The CLI is the typed transaction boundary. It also bundles the matching Eidos
Skill, so initialization does not require Node.js, `npm`, or `npx`:

```bash
# Install in the current Space/project.
eidos skills init

# Install for the current user and all projects.
eidos skills init --global
```

Use `eidos skills init --space <DIR>` to initialize another Space. The command
writes the standard `.agents/skills/eidos` layout. It is safe to repeat; if a
file has local edits, pass `--force` explicitly to update it from the bundled
CLI Skill. Start a new Agent task after initialization, then try:

```text
Use the Eidos skill to inspect ./tracker.eidos.
Show context first and do not mutate yet.
```

## Quick start

```bash
cargo build

target/debug/eidos create tracker.eidos \
  --table Tasks \
  --label-field Title \
  --fields '[{"name":"Title","type":"text"},{"name":"Status","type":"select"}]'

target/debug/eidos tracker.eidos context Tasks \
  --fields Title,Status \
  --limit 50
```

Pass the global `--json` flag when a script or Agent needs the stable machine
contract:

```bash
target/debug/eidos --json context tracker.eidos Tasks \
  --fields Title,Status \
  --limit 50
```

For ordinary row updates, `apply` combines exact matching, revision checking,
returning rows, and validation before commit:

```bash
target/debug/eidos tracker.eidos apply - <<'JSON'
{
  "revision": "1",
  "table": "Tasks",
  "match": {"_id": "019..."},
  "expect": 1,
  "set": {"Status": "doing"},
  "returning": ["Title", "Status"]
}
JSON
```

For synchronization without pre-known Row IDs, use a stored business key:

```bash
target/debug/eidos --json rows upsert tracker.eidos \
  --table Tasks \
  --key "External ID" \
  --values '[{"External ID":"task-1","Title":"Ship CLI"}]' \
  --expected-revision 1 \
  --dry-run
```

Use `rows mutate` for a mixed create/update/delete batch that must commit as
one revision. Both commands support JSON from inline input, `@path`, or stdin.

Lower-level mutation commands remain available for creation, deletion, and
automation that already owns stable row IDs. They require the current revision:

```bash
target/debug/eidos tracker.eidos rows add Tasks \
  --expected-revision 1 \
  --values '{"Title":"Ship CLI","Status":"doing"}'

target/debug/eidos tracker.eidos validate --level full
```

Use the attachment intent commands for File Fields. They own file staging,
portable collision names, metadata, revision checks, and rollback:

```bash
target/debug/eidos --json attachment import tracker.eidos \
  --table Tasks --row 019... --field Files \
  --source /absolute/path/report.pdf \
  --expected-revision 2

target/debug/eidos --json attachment verify tracker.eidos
```

`attachment attach` references a verified file that is already below the
`.eidos` file's directory. `attachment detach` removes exact File-entry IDs
but deliberately retains physical files.

Create standard Views directly from user-facing names. The command resolves
stable IDs, applies type-specific defaults, and can show the exact plan with
`--dry-run`:

```bash
target/debug/eidos --json view create tracker.eidos \
  --table Tasks \
  --name "By status" \
  --type kanban \
  --group-by Status \
  --dry-run

target/debug/eidos --json view create tracker.eidos \
  --table Tasks \
  --name "Delivery calendar" \
  --type calendar \
  --date-by Due
```

Use `view list`, `view inspect`, `view update`, and `view delete` for the
remaining lifecycle operations. `view-apply` remains available when an Agent
needs to submit an exact Runtime mutation document.

Schema intent commands cover the common Agent path and resolve names to stable
IDs before applying one revision-checked transaction:

```bash
target/debug/eidos --json field add tracker.eidos \
  --table Tasks --name Due --type date --dry-run

target/debug/eidos --json table create tracker.eidos \
  --name People --label-field Name \
  --fields '[{"name":"Name","type":"text","nullable":false}]'

target/debug/eidos --json relation add tracker.eidos \
  --table Tasks --name Owners --target-table People --on-delete detach
```

Use `table rename/delete` and `field rename/delete` for lifecycle changes.
`schema-apply` remains available for supported schema payloads that need
lower-level control. Formula and Lookup Fields use the embedded TypeScript
Runtime for preflight, dependency checks, cycle detection, and commit:

```bash
target/debug/eidos --json formula preview tracker.eidos \
  --table Tasks --name Total \
  --formula '"Estimate" * 2' --type integer

target/debug/eidos --json formula add tracker.eidos \
  --table Tasks --name Total \
  --formula '"Estimate" * 2' --type integer --expected-revision 3 --dry-run

target/debug/eidos --json lookup add tracker.eidos \
  --table Tasks --name OwnerScore \
  --relation-field Owners --target-field Score \
  --aggregate sum --expected-revision 4
```

`query` and `context` automatically evaluate Formula, Lookup, and inverse
Relation Fields when present. Inverse Relation creation remains outside the
high-level CLI intent surface. Deleting Formula or Lookup Fields is explicitly
lossy and requires `--confirm-lossy` after a dry run. A `table create` field
array may include Formula fields; Relation and Lookup fields are added after
their referenced schema exists.

For advanced automation, the equivalent low-level Calendar mutation uses the
stable Table and date Field IDs returned by `schema`:

```bash
target/debug/eidos tracker.eidos view-apply - <<'JSON'
{
  "expectedRevision": "2",
  "changes": [{
    "kind": "create-view",
    "clientKey": "calendar",
    "tableId": "019...",
    "name": "Calendar",
    "type": "calendar",
    "query": {},
    "layout": {"dateField": "019..."},
    "position": "1"
  }]
}
JSON
```

The same command supports `update-view` and `delete-view`; explicit position
patches reorder Views. View queries and Calendar layout references use stable
Field IDs so renames do not change their meaning.

Both `eidos tracker.eidos inspect` and `eidos inspect tracker.eidos` are
supported. Commands print readable key-value sections and tables by default.
With `--json`, successful commands write one JSON document to stdout and
failures write one JSON error document to stderr. Failures return a nonzero
exit code in either mode.

## Local web editor

`eidos serve` hosts a dedicated Eidos File web editor over HTTP with the UI
embedded in the binary. The editor lives in
[`packages/eidos-file-serve`](../../packages/eidos-file-serve) on top of
`@eidos.space/eidos-file-ui`, and the TypeScript runtime runs inside an
embedded QuickJS engine on a rusqlite bridge, so every committed mutation
writes straight to the file — there is no separate save step.

```bash
target/debug/eidos serve tracker.eidos --port 8420 --open
```

Relative File entries and uploads remain disabled until an existing assets
folder is explicitly mounted. With a mount, the embedded UI can preview,
open, download, choose, drop, paste, and upload files in File fields:

```bash
target/debug/eidos serve tracker.eidos --assets-dir ./assets --open
```

The mount resolves only `assets/<name>` references and never falls back to a
guessed sibling or working-directory path.

The server binds `127.0.0.1` by default. Use `--lan` to bind one detected
private interface and print a paired access link for other devices on that
trusted network:

```bash
target/debug/eidos serve tracker.eidos --lan
target/debug/eidos serve tracker.eidos --lan --host 192.168.1.20
```

LAN API access requires the printed link to establish a browser session, and
Host/Origin checks remain restricted to the exact bound address. Multiple
paired browsers can edit through the same serialized Runtime writer and
receive committed revisions live. LAN mode uses HTTP, so do not use it on an
untrusted network.

When private-network access is unavailable, sign in with an eidos.space
account and publish the same loopback server through Eidos Relay:

```bash
target/debug/eidos login
target/debug/eidos whoami
target/debug/eidos serve tracker.eidos --relay --open
```

Relay assigns the account a stable opaque `r-….eidos.ink` hostname and uses an
outbound WebSocket, so the CLI does not bind a public interface. `eidos login`
stores a renewable session in an owner-only user configuration file; later
Relay commands silently reuse or refresh it without an operating-system
credential prompt. `eidos logout` removes that local credential.

By default, opening the Relay URL asks the browser to sign in with the same
eidos.space account that claimed the hostname. Relay verifies account
ownership and creates a host-only browser session; the URL contains no access
key. OAuth tokens never enter the browser URL or the local Serve process.

Create an explicit guest link only when you want to share the running file
with a browser that does not have the owner's account:

```bash
target/debug/eidos serve tracker.eidos --relay --share
```

`--share` prints a fragment-key link that pairs the guest browser with this
Serve process. Starting another Relay serve for the same account takes over
the hostname and invalidates earlier browser sessions. Local and LAN modes
remain account-free.

`--ui-dir <dir>` serves a different static UI build instead of the embedded
one. The embedded editor is available in the published macOS, Linux, and
Windows builds.

Run `eidos --help` and the repository Skill at [`../../skills/eidos/SKILL.md`](../../skills/eidos/SKILL.md) for the complete command and safe-agent workflow.

## Hosted Publish access

Sign in to the
[Publish account page](https://eidos.space/account?tab=publish), create a
Publish CLI key, and store it as `EIDOS_PUBLISH_TOKEN`. The CLI uses
`https://publish.eidos.space` by default; set `EIDOS_PUBLISH_ORIGIN` only when
targeting another environment.

The key is shown only once and grants write access only to the Publish control
plane. Keep it in the current shell or a secret manager; never commit it.
Confirm the installed build has `eidos publish --help` before following the
workflow.

Publish a public resource with a tenant-local slug:

```bash
eidos publish tracker.eidos --slug tracker
```

Markdown uses the same command. Relative links and images are discovered from
the document directory and uploaded as immutable attachments:

```bash
eidos publish docs/guide.md --slug guide
```

Markdown must be UTF-8 and no larger than 16 MiB. It is rendered once as a
script-free static page; raw HTML is not executed. Standard Publish accepts an
`.eidos` entrypoint up to 256 MiB; Custom accounts can receive a higher
account-specific limit. Source attachments remain limited to 1 GiB, and equal
SHA-256 content is stored once per account.

Publish a local Form View, then collect completed responses into its original
Table with the Publication ID from the publish result:

```bash
eidos publish feedback.eidos --slug feedback --form-view "Public feedback"
eidos collect feedback.eidos \
  --publication 7300a083-df92-49d8-945d-1e0bae0eac18
```

The Collector imports each Row and its retry receipt atomically. Submitted
attachments are verified and deduplicated in a local content-addressed asset
directory. Republish after changing the Form View or target schema; collection
fails closed when the local schema no longer matches the published revision.

The CLI displays hashing, upload, preparation, and activation progress. The
slug becomes the URL path, contains 1–64 lowercase letters, digits, or hyphens,
and identifies one long-lived resource. Publishing new bytes to the same slug
creates an immutable Version while preserving the URL and current access
policy. The complete canonical Source Bundle fingerprint includes attachment
digests; an identical active fingerprint reuses the current Version instead of
creating redundant history. A different slug creates another resource. Resource and Version counts
are not quotas; deduplicated account storage and inactive history age are.

Publish can protect a resource with a password. The CLI prompts twice
without echo and never places the password in the URL or command arguments:

```bash
eidos publish tracker.eidos --slug tracker --password
```

For non-interactive automation, set `EIDOS_PUBLISH_PASSWORD` and still pass
`--password`. Remove password protection explicitly with `--remove-password`.
Republishing without either option preserves the resource's existing access
policy. Password sessions last up to 12 hours, and rotating or removing the
password invalidates existing sessions immediately.

Owner-only account access remains available through:

```bash
eidos publish tracker.eidos --slug tracker --visibility private
```

Use the global `--json` flag for one stable result document in automation;
interactive progress is intentionally omitted in JSON mode. The result includes
`publishFingerprint` and `versionCreated` for deterministic change detection. The complete
plan limits, access behavior, setup, and troubleshooting guide is
in [Publish a file](../docs/src/content/docs/cli/publish.mdx).

## Safety model

- The CLI owns physical SQLite mapping; callers use logical table and field names or stable IDs.
- Every mutation is atomic.
- `--expected-revision` prevents writes based on stale reads.
- `context` combines compact schema discovery with a bounded logical query.
- `apply` validates the proposed final state before committing matched updates.
- `rows upsert` resolves stored business keys and plans create/update actions in one transaction.
- `rows mutate` applies mixed RowChange batches atomically, with `--dry-run` rollback support.
- `attachment import/attach/detach` performs revision-checked File-field changes; `attachment verify` checks external local assets.
- `schema-apply --dry-run` executes and rolls back the exact schema transaction.
- Runtime-backed lossy Formula/Lookup deletes require `--confirm-lossy` on the real commit.
- `view create/update/delete --dry-run` resolves intent and rolls back the exact View transaction.
- `view-apply` uses the Runtime View mutation document and one revision-checked transaction.
- `validate --level full` should follow a completed write workflow.
- Raw SQLite writes are unsupported.

The CLI supports stored scalar/list fields, forward Relations, saved View
lifecycle operations, and Runtime-backed Formula/Lookup evaluation. Formula
and Lookup fields are read-only in row mutations. The CLI preserves existing
inverse Relation metadata but does not create inverse Relations through the
high-level intent surface.

## Development

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo build --release
```

The embedded artifacts are generated but committed, so a clean checkout builds
with cargo alone. Refresh them after changing the runtime or the serve UI:

```bash
# QuickJS runtime bundle (packages/eidos-file) -> qjs-host/bundle/
pnpm --filter @eidos.space/eidos-file build:quickjs

# Serve UI (packages/eidos-file-serve) -> qjs-host/ui/
pnpm --filter @eidos.space/eidos-file-serve build
```

## Standalone release

The CLI owns the version in `Cargo.toml`; Eidos Lite version bumps do not
change it. To prepare a CLI release:

1. Update `apps/cli/Cargo.toml` to the exact semantic version.
2. Run `cargo check --workspace` in `apps/cli` and commit the resulting
   `Cargo.lock` change.
3. For a stable release, update `apps/cli/LATEST` to the same version.
4. Rewrite `apps/cli/RELEASE_NOTES.md` for that exact CLI version. Keep it
   scoped to standalone CLI behavior; do not use monorepo-generated notes.
5. Run the formatter, Clippy, tests, and installer test.
6. Tag the validated commit as `cli-v<version>` and push the branch and tag.

The tag triggers
[`build-and-release-cli.yml`](../../.github/workflows/build-and-release-cli.yml),
which rebuilds and verifies four platform archives, generates `SHA256SUMS`,
and creates a dedicated GitHub Release from the checked-in CLI release notes
without changing the repository's Eidos Lite “Latest Release” pointer.

The workspace contains:

```text
apps/cli/
├── core/       # Eidos File format, query, mutation, and validation library
├── qjs-host/   # Embedded QuickJS host bridging the TypeScript runtime to rusqlite
├── src/        # CLI output, commands, and agent-facing normalization
└── tests/      # End-to-end external-agent contract tests
```

## License

AGPL-3.0
