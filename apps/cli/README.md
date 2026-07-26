# Eidos CLI

`eidos` is the agent-first Rust interface to the open Eidos File format. It reads and modifies `.eidos` files directly, emits JSON only, and does not connect to Eidos Desktop.

## Responsibilities

- Create and inspect Eidos Files.
- Read logical tables, fields, relations, views, and file metadata.
- Query rows through the Eidos query model rather than raw SQL.
- Apply atomic row and schema mutations with optimistic revision checks.
- Validate file identity, structure, content, and supported semantics.

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
EIDOS_VERSION=0.34.0 EIDOS_INSTALL_DIR=/usr/local/bin sh install.sh
```

Standalone assets currently cover macOS arm64/x64, Linux x64, and Windows x64.

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

## Standalone release

The CLI owns the version in `Cargo.toml`; Desktop app version bumps do not
change it. To prepare a CLI release:

1. Update `apps/cli/Cargo.toml` to the exact semantic version.
2. Run `cargo check --workspace` in `apps/cli` and commit the resulting
   `Cargo.lock` change.
3. For a stable release, update `apps/cli/LATEST` to the same version.
4. Run the formatter, Clippy, tests, and installer test.
5. Tag the validated commit as `cli-v<version>` and push the branch and tag.

The tag triggers
[`build-and-release-cli.yml`](../../.github/workflows/build-and-release-cli.yml),
which rebuilds and verifies four platform archives, generates `SHA256SUMS`,
and creates a dedicated GitHub Release without changing the repository's
Desktop “Latest Release” pointer.

The workspace contains:

```text
apps/cli/
├── core/       # Eidos File format, query, mutation, and validation library
├── src/        # JSON CLI and agent-facing normalization
└── tests/      # End-to-end external-agent contract tests
```

## License

AGPL-3.0
