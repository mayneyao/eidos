# Eidos CLI

`eidos` is the agent-first Rust interface to the open Eidos File format. It reads and modifies `.eidos` files directly, emits JSON only, and does not connect to Eidos Desktop.

## Responsibilities

- Create and inspect Eidos Files.
- Read logical tables, fields, relations, views, and file metadata.
- Query rows through the Eidos query model rather than raw SQL.
- Apply atomic row and schema mutations with optimistic revision checks.
- Validate file identity, structure, content, and supported semantics.

The CLI does not manage legacy Spaces, documents, Desktop RPC, version history, or sync. Use ordinary file tools for Markdown and attachments, and Graft for history/sync.

## Quick start

```bash
cargo build

target/debug/eidos create tracker.eidos \
  --title "Project Tracker" \
  --table Tasks \
  --label-field Title \
  --fields '[{"name":"Title","type":"text","nullable":false},{"name":"Status","type":"select"}]'

target/debug/eidos tracker.eidos inspect
target/debug/eidos tracker.eidos query Tasks --limit 50
```

Mutation commands require the current revision:

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

The workspace contains:

```text
apps/cli/
├── core/       # Eidos File format, query, mutation, and validation library
├── src/        # JSON CLI and agent-facing normalization
└── tests/      # End-to-end external-agent contract tests
```

## License

AGPL-3.0
