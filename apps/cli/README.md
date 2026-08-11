# Eidos CLI

`eidos` is the agent-first Rust interface to the open Eidos File format. It
reads and modifies `.eidos` files directly, prints readable terminal output by
default, and does not require a running Eidos application.

## Responsibilities

- Create and inspect Eidos Files.
- Read logical tables, fields, relations, views, and file metadata.
- Query rows through the Eidos query model rather than raw SQL.
- Apply atomic row and schema mutations with optimistic revision checks.
- Validate file identity, structure, content, and supported semantics.
- Serve a local web editor for one file over HTTP on macOS, Linux, and Windows.

The CLI does not manage Space lifecycle, ordinary documents, application RPC,
version history, or Sync. Use ordinary file tools for text and attachments,
and Graft for history or Sync.

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
EIDOS_VERSION=0.36.6 EIDOS_INSTALL_DIR=/usr/local/bin sh install.sh
```

Standalone assets currently cover macOS arm64/x64, Linux x64, and Windows x64.

## Install the Eidos Skill for Codex

The CLI is the typed transaction boundary. The matching Eidos Skill teaches
Codex the safe `context` → `apply` → `validate` workflow and when to use Graft
for review or recovery. Install the Skill from the same public tag as the
stable CLI:

```bash
npx skills add \
  https://github.com/mayneyao/eidos/tree/cli-v0.36.6/skills/eidos \
  --skill eidos -g -a codex -y
```

This uses the open [`skills`](https://github.com/vercel-labs/skills) installer
and requires Node.js 18 or newer. Start a new Codex task after installation,
then try:

```text
Use the Eidos skill to inspect ./tracker.eidos.
Show context first and do not mutate yet.
```

The versioned GitHub path keeps the Agent workflow aligned with the installed
CLI rather than following the repository's moving development branch.

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

Lower-level mutation commands remain available for creation, deletion, and
automation that already owns stable row IDs. They require the current revision:

```bash
target/debug/eidos tracker.eidos rows add Tasks \
  --expected-revision 1 \
  --values '{"Title":"Ship CLI","Status":"doing"}'

target/debug/eidos tracker.eidos validate --level full
```

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

Relay assigns the account a stable opaque `u-….eidos.ink` hostname and uses an
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

## Safety model

- The CLI owns physical SQLite mapping; callers use logical table and field names or stable IDs.
- Every mutation is atomic.
- `--expected-revision` prevents writes based on stale reads.
- `context` combines compact schema discovery with a bounded logical query.
- `apply` validates the proposed final state before committing matched updates.
- `schema-apply --dry-run` executes and rolls back the exact schema transaction.
- `validate --level full` should follow a completed write workflow.
- Raw SQLite writes are unsupported.

The alpha supports stored scalar/list fields and forward Relations. It preserves and reports existing Formula, Lookup, inverse Relation, and view metadata but does not create or evaluate virtual fields yet.

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
