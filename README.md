<div align="center">
  <h1 align="center">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="static/assets/images/eidos-logo-horizontal-dark.webp">
      <img alt="Eidos" height="150" src="static/assets/images/eidos-logo-horizontal-light.webp">
    </picture>
  </h1>
  <h3>Local-first personal data, in files you own.</h3>
  <p>
    Eidos Lite turns an ordinary folder into a fast, versioned workspace<br />
    powered by open SQLite-based <code>.eidos</code> files.
  </p>
  <p>
    <a href="./apps/eidos-lite-desktop"><img src="https://img.shields.io/badge/Eidos%20Lite-primary%20desktop-8b5cf6.svg?style=flat-square" alt="Eidos Lite is the primary desktop app" /></a>
    <a href="https://docs.eidos.space/"><img src="https://img.shields.io/badge/docs-eidos.space-0ea5e9.svg?style=flat-square" alt="Eidos documentation" /></a>
    <a href="https://discord.gg/cGQqjeFpZq"><img src="https://img.shields.io/badge/chat-Discord-7289da.svg?style=flat-square" alt="Chat on Discord" /></a>
    <a href="https://github.com/mayneyao/eidos/blob/dev/LICENSE"><img src="https://img.shields.io/badge/license-AGPL%20v3-blue.svg?style=flat-square" alt="AGPL v3 license" /></a>
  </p>
  <p>
    <a href="./README.md">English</a> · <a href="./README.zh.md">中文</a>
  </p>
</div>

> [!IMPORTANT]
> **Eidos Lite is now the primary Eidos product direction and the recommended desktop target for new development and testing.** The original Electron application is preserved as [Eidos Desktop Legacy](./apps/desktop) for existing users and maintenance. Public Lite distribution is still being prepared; contributors can run and package it today.

## Eidos Lite

Eidos Lite starts with a simple model: a **Space is an ordinary folder you own**. That folder can contain multiple `.eidos` files, and every `.eidos` file is a standard SQLite database that remains useful outside the app.

- **Local first** — open and edit local data immediately. Version history and cloud status become available progressively and do not define whether your files are usable.
- **Open files** — inspect `.eidos` databases with standard SQLite tools, import CSV data, and export your tables when you need them elsewhere.
- **Built-in versions** — review row-aware changes, add a meaningful version note, and restore a Space from local history.
- **Optional Sync** — connect a Space to the hosted service when you want another copy or another device. Local work remains available when you are offline or signed out.
- **Focused desktop experience** — Lite is independent from the Legacy app's web server, Markdown, AI, browser, terminal, and extension subsystems.
- **Designed for real datasets** — paged queries, virtualized tables, bounded change previews, and performance gates cover large SQLite files.

## Choose the right Eidos

| Product              | Status                           | Best for                                                                                            | Location                                                                                           |
| -------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Eidos Lite**       | **Primary · active development** | Local-first Spaces, `.eidos` files, versions, and optional Sync                                     | [`apps/eidos-lite-desktop`](./apps/eidos-lite-desktop)                                             |
| Eidos File Web       | Active                           | Opening one `.eidos` file in a browser                                                              | [`apps/eidos-file-web`](./apps/eidos-file-web) · [editor.eidos.space](https://editor.eidos.space/) |
| Eidos CLI            | Active                           | Inspecting and automating `.eidos` files from a terminal                                            | [`apps/cli`](./apps/cli)                                                                           |
| Eidos Desktop Legacy | Legacy maintenance               | Existing workspaces that depend on documents, AI, extensions, and the original web-app architecture | [`apps/desktop`](./apps/desktop)                                                                   |

## Run Eidos Lite

Requirements: Node.js `22.23.1` (pinned in [`.node-version`](./.node-version)) and Corepack.

```bash
git clone https://github.com/mayneyao/eidos.git
cd eidos
corepack enable
pnpm install --frozen-lockfile
pnpm dev:eidos-lite
```

Build an unsigned local app for hands-on testing:

```bash
pnpm build:eidos-lite:dev
```

Run the focused Lite verification suites:

```bash
pnpm test:eidos-lite
pnpm test:eidos-lite:performance
pnpm smoke:eidos-lite-packaged
```

See the [Eidos Lite development guide](./apps/eidos-lite-desktop/README.md) for its process model, security boundaries, Sync architecture, packaging gates, and operational checks.

<details>
<summary><strong>Working on Eidos Desktop Legacy?</strong></summary>

The original Desktop application reuses `apps/web-app`, runs a local HTTP service, and supports the earlier document, AI, and extension model. It remains in the repository for maintenance, but it is no longer the default desktop path.

```bash
pnpm install:sqlite-ext
pnpm dev:desktop
```

Read the [Legacy Desktop architecture guide](./apps/desktop/readme.md) before making changes.

</details>

## Open ecosystem

Eidos remains an extensible personal data framework. The repository includes the shared data engine, React bindings, browser editor, CLI, and the Legacy extension ecosystem. Start with the [documentation](https://docs.eidos.space/) or explore the repository map in [`AGENTS.md`](./AGENTS.md).

## Contributors

<a href="https://github.com/mayneyao/eidos/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=mayneyao/eidos" alt="Eidos contributors" />
</a>

## License

This project is licensed under AGPL v3. Specific packages are released under MIT to facilitate integration and ecosystem growth:

- `@eidos.space/core`: [MIT](./packages/core/LICENSE)
- `@eidos.space/react`: [MIT](./packages/react/LICENSE)

All extensions under [`extensions/`](./extensions/) are also released under the MIT License.
