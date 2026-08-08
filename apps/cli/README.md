# Eidos CLI

`eidos` is the agent-first Rust interface to the open Eidos File format. It reads and modifies `.eidos` files directly, emits JSON only, and does not connect to Eidos Desktop.

## Responsibilities

- Create and inspect Eidos Files.
- Read logical tables, fields, relations, views, and file metadata.
- Query rows through the Eidos query model rather than raw SQL.
- Apply atomic row and schema mutations with optimistic revision checks.
- Validate file identity, structure, content, and supported semantics.
- Serve a local web editor for one file over HTTP on macOS, Linux, and Windows.

The CLI does not manage legacy Spaces, documents, Desktop RPC, version history, or sync. Use ordinary file tools for Markdown and attachments, and Graft for history/sync.

## Install

macOS and Linux:

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://download.eidos.space/cli/install.sh | sh
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
EIDOS_VERSION=0.36.0 EIDOS_INSTALL_DIR=/usr/local/bin sh install.sh
```

Standalone assets currently cover macOS arm64/x64, Linux x64, and Windows x64.

## Install the Eidos Skill for Codex

The CLI is the typed transaction boundary. The matching Eidos Skill teaches
Codex the safe `context` → `apply` → `validate` workflow and when to use Graft
for review or recovery. Install the Skill from the same public tag as the
stable CLI:

```bash
npx skills add \
  https://github.com/mayneyao/eidos/tree/cli-v0.36.0/skills/eidos \
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
  --title "Project Tracker" \
  --table Tasks \
  --label-field Title \
  --fields '[{"name":"Title","type":"text","nullable":false},{"name":"Status","type":"select"}]'

target/debug/eidos tracker.eidos context Tasks \
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

Both `eidos tracker.eidos inspect` and `eidos inspect tracker.eidos` are supported. Successful commands write one JSON document to stdout. Failed commands write one JSON error document to stderr and return a nonzero exit code.

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

The server binds `127.0.0.1` only. `--ui-dir <dir>` serves a different static
UI build instead of the embedded one. The embedded editor is available in the
published macOS, Linux, and Windows builds.

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

The CLI owns the version in `Cargo.toml`; Desktop app version bumps do not
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
without changing the repository's Desktop “Latest Release” pointer.

The workspace contains:

```text
apps/cli/
├── core/       # Eidos File format, query, mutation, and validation library
├── qjs-host/   # Embedded QuickJS host bridging the TypeScript runtime to rusqlite
├── src/        # JSON CLI and agent-facing normalization
└── tests/      # End-to-end external-agent contract tests
```

## License

AGPL-3.0
