# Eidos File and Eidos Lite

## Product boundary

This repository contains the current Eidos product line and one focused
standalone utility:

- **Eidos File** is the open SQLite-backed data format, portable Runtime, shared
  React UI, browser editor, local serve UI, and agent-first CLI.
- **Eidos Lite** is the focused Electron desktop host for folders containing
  `.eidos` and ordinary files, with local Graft history and optional Sync.
- **SQLite Web Viewer** is a read-only browser utility for inspecting arbitrary
  SQLite-compatible files. It does not define Eidos File semantics.

Retired application code is archived on `legacy/0.32`. Do not reintroduce its
database Space, Web App, AI, extension, migration, or Desktop runtime packages
into the current branch.

## Repository map

```text
apps/
├── cli/                 # Rust CLI and embedded `eidos serve` runtime
├── docs/                # Current Eidos File / Lite documentation site
├── download/            # CLI installers and Lite update routing Worker
├── eidos-file-web/      # editor.eidos.space browser editor
├── eidos-lite-desktop/  # Primary Electron desktop application
├── graft-remote/        # Hosted Lite Sync protocol service
└── sqlite-web-viewer/   # Standalone read-only SQLite browser utility
packages/
├── eidos-file/          # Format and Runtime implementation (MIT)
├── eidos-file-ui/       # Shared React editor UI and semantic theme (MIT)
└── eidos-file-serve/    # UI embedded by `eidos serve`
docs/specs/              # Normative Eidos File 1.0 specification suite
skills/eidos/            # Public CLI workflow skill
```

## Architecture invariants

- The canonical layer order is File Format → Runtime → Adapter → UI. Ownership
  and conformance labels are defined in `docs/specs/README.md`.
- Eidos File semantics live in `packages/eidos-file`; hosts must not redefine
  filter, field, conversion, revision, or validation behavior.
- Web, Lite, and CLI Serve consume `packages/eidos-file-ui`. Shared components,
  semantic tokens, source aliases, and host styles belong there.
- Browser SQLite uses `@sqlite.org/sqlite-wasm`. Lite uses Node's built-in
  `node:sqlite` through its Electron utility boundary.
- Lite owns filesystem access, locking, publication, Graft, account, and Sync
  concerns; renderer code does not receive raw filesystem or SQLite handles.
- Graft Sync is optional. Local files must remain usable offline and while
  signed out.

## Development commands

Run JavaScript commands from the repository root after `pnpm install`.

```bash
pnpm dev:eidos-lite
pnpm build:eidos-lite:dev
pnpm test:eidos-lite
pnpm test:eidos-lite:performance
pnpm smoke:eidos-lite-packaged

pnpm dev:eidos-file-web
pnpm build:eidos-file-web
pnpm test:eidos-file
pnpm build:sqlite-web-viewer
pnpm test:sqlite-web-viewer

pnpm build:docs
pnpm typecheck
pnpm lint
pnpm format:check
```

### Eidos Lite development UI verification

- Start the development application only with `pnpm dev:eidos-lite` from this
  repository root. Do not use `electron`, `pnpm exec electron`, or an Electron
  binary directly for development UI testing; those commands can open
  Electron's default app or a built renderer without the Vite development
  environment.
- Before using Computer Use against Eidos Lite, verify that the inspected
  window's document URL starts with `http://localhost:5179/` (Vite normalizes
  its `127.0.0.1` listener to this URL) and that the listening process working
  directory belongs to this checkout. The application name is not proof:
  unpackaged Electron processes share the `com.github.Electron` bundle
  identifier, and `Eidos Lite` can select the installed application in
  `/Applications` instead of the development window.
- Never select an unpackaged development instance with a generic Computer Use
  lookup such as `getApp("Electron")`. Multiple checkouts share Electron's
  display name and bundle identifier, and a generic lookup can surface an
  unrelated checkout's bare default-app window. Before the first app selection,
  inspect the process listening on port `5179`, resolve its Electron process and
  executable under this checkout, and select Computer Use by that exact absolute
  `Electron.app` path. If the exact current-checkout instance cannot be selected,
  stop without selecting or raising any other Electron window.
- Treat Electron's page that says "To run a local app" as an invalid bare
  Electron launch, never as Eidos Lite. Stop and correct the launch before
  performing or reporting any UI verification.
- If port `5179` or the Electron single-instance lock is already occupied,
  inspect the owning command and working directory first. Do not switch to the
  installed application, reuse another worktree's Electron window, or terminate
  an unrelated process merely to make the test proceed.

CLI work stays inside its Rust workspace:

```bash
cd apps/cli
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo build --release --locked
```

The CLI's QuickJS Runtime and serve UI are generated but committed. Refresh
them after changing their sources:

```bash
pnpm --filter @eidos.space/eidos-file build:quickjs
pnpm --filter @eidos.space/eidos-file-serve build
```

## Testing and native runtimes

- Keep package tests co-located with source and use the package's own Vitest
  config.
- `packages/eidos-file` tests the browser, `better-sqlite3`, and built-in
  `node:sqlite` adapters separately. Do not use one adapter as proof for another.
- Eidos Lite source-runtime tests execute through Electron's Node mode using
  `scripts/run-electron-node.mjs`.
- Run focused tests first, then the retained product build/typecheck gates.

## Code style

- Use strict TypeScript and avoid `any` in new code.
- Use React functional components and hooks.
- Use Tailwind and semantic CSS variables; do not fork Eidos File UI theme
  tokens in a host.
- Format with Oxfmt and lint with Oxlint.
- Preserve user changes in dirty worktrees and use `apply_patch` for edits.

## Releases

- `@eidos.space/eidos-file` and `@eidos.space/eidos-file-ui` release as a
  shared-version cohort. Tags use `eidos-file-packages-v<semver>` and npm
  publication must run through
  `.github/workflows/publish-eidos-file-packages.yml` with GitHub OIDC. Never
  run `npm publish` locally or use a workstation npm token.
- Eidos Lite versions live in `apps/eidos-lite-desktop/package.json`; tags use
  `lite-v<semver>`.
- CLI versions live in `apps/cli/Cargo.toml`; tags use `cli-v<semver>` and stable
  releases update `apps/cli/LATEST`.
- Eidos File Web deploys independently to `editor.eidos.space`.
- The download Worker serves CLI installers and Lite update metadata.
- Use `.codex/skills/eidos-release` for release-specific validation and proof.

## Documentation

- English files in `docs/specs` are normative. Chinese files are informative
  translations and must stay aligned.
- Runtime behavior changes require matching specification text and conformance
  tests when the contract changes.
- Keep docs focused on shipped Eidos File and Eidos Lite behavior. Historical
  implementation records belong on the legacy branch, not in this tree.
