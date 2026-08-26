<div align="center">
  <h1 align="center">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="static/assets/images/eidos-logo-horizontal-dark.webp">
      <img alt="Eidos" height="150" src="static/assets/images/eidos-logo-horizontal-light.webp">
    </picture>
  </h1>
  <h3>A single-file relational spreadsheet, for you and your agent.</h3>
  <p>
    Eidos File is an open, single-file format built on standard SQLite.<br />
    Eidos Lite is the desktop app for working with Eidos Files and ordinary files in a local folder.
  </p>
  <p>
    <a href="https://eidos.space/download#eidos-lite"><img src="https://img.shields.io/badge/download-Eidos%20Lite-8b5cf6.svg?style=flat-square" alt="Download Eidos Lite" /></a>
    <a href="https://docs.eidos.space/"><img src="https://img.shields.io/badge/docs-eidos.space-0ea5e9.svg?style=flat-square" alt="Eidos documentation" /></a>
    <a href="https://discord.gg/cGQqjeFpZq"><img src="https://img.shields.io/badge/chat-Discord-7289da.svg?style=flat-square" alt="Chat on Discord" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-AGPL%20v3-blue.svg?style=flat-square" alt="AGPL v3 license" /></a>
  </p>
  <p>
    <a href="./README.md">English</a> · <a href="./README.zh.md">中文</a>
  </p>
</div>

<p align="center">
  <img alt="Eidos Lite showing a relational spreadsheet for a personal library with typed fields, relations, and multiple views" src="static/assets/images/eidos-lite-grid.webp" width="1280" />
</p>

## Get started

- **Desktop:** [Download Eidos Lite](https://eidos.space/download#eidos-lite) to work with a local folder. No account is required for local use.
- **Browser:** Open [editor.eidos.space](https://editor.eidos.space/) to create or edit a local `.eidos` file without installing anything.
- **CLI:** Install `eidos` to create, inspect, query, update, and serve Eidos Files.

macOS or Linux:

```bash
curl -fsSL https://download.eidos.space/cli/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://download.eidos.space/cli/install.ps1 | iex
```

Create a file and open it locally:

```bash
eidos create example.eidos \
  --table Tasks \
  --label-field Title \
  --fields '[{"name":"Title","type":"text"},{"name":"Status","type":"select"}]'
eidos serve example.eidos --open
```

See the [Eidos CLI guide](./apps/cli/README.md) for agent and automation workflows.

## Repository

- [`packages/eidos-file`](./packages/eidos-file) implements the Eidos File format and Runtime.
- [`packages/eidos-file-ui`](./packages/eidos-file-ui) provides the shared React editor UI.
- [`apps/eidos-lite-desktop`](./apps/eidos-lite-desktop) is the desktop app.
- [`apps/eidos-file-web`](./apps/eidos-file-web) powers the browser editor.
- [`apps/cli`](./apps/cli) contains the agent-first CLI and local server.
- [`apps/sqlite-web-viewer`](./apps/sqlite-web-viewer) is a standalone, read-only SQLite viewer.

Eidos Lite uses [Graft](https://github.com/eidos-space/graft) for local version
history and optional Sync. Graft is developed as an independent,
developer-facing version-control system for application state.

## Development

Requirements: Node.js `22.23.1`, Corepack, and Rust stable for CLI work.

```bash
corepack enable
pnpm install --frozen-lockfile

pnpm dev:eidos-lite
pnpm dev:eidos-file-web
pnpm test:eidos-file
```

CLI development stays in its Rust workspace:

```bash
cd apps/cli
cargo test --workspace --locked
```

See the [documentation site](./apps/docs) and the normative
[Eidos File specifications](./docs/specs) for more detail.

## License

The repository is licensed under AGPL v3. The reusable
[`@eidos.space/eidos-file`](./packages/eidos-file) and
[`@eidos.space/eidos-file-ui`](./packages/eidos-file-ui) packages are released
under MIT.
