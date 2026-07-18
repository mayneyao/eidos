<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="static/assets/images/eidos-logo-horizontal-dark.webp">
    <img alt="Eidos" height="150" src="static/assets/images/eidos-logo-horizontal-light.webp">
  </picture>

  <h3>An offline-first, AI-powered personal data framework for local files and structured data.</h3>

  <p>
    In Eidos Desktop, a <strong>Space</strong> is a folder on your computer:
    Markdown stays Markdown, assets remain ordinary files, structured data lives
    in portable <code>.eidos</code> SQLite files, and Graft records versions
    across the Space.
  </p>

  <p>
    <a href="https://eidos.space/download">Download Desktop</a> ·
    <a href="https://editor.eidos.space">Open an Eidos File</a> ·
    <a href="https://docs.eidos.space">Documentation</a> ·
    <a href="https://discord.gg/cGQqjeFpZq">Discord</a>
  </p>

  <p><a href="./README.md">English</a> · <a href="./README.zh.md">简体中文</a></p>
</div>

> [!IMPORTANT]
> Eidos `0.34.0-beta.1` is an early-testing release for the transition from
> legacy database Spaces to file-based Spaces. Keep backups, and retain a
> legacy Space until you have reviewed its migration result. This beta is not
> recommended for production-critical data.

## What works today

- **File-based Spaces** — Register a local folder, browse its file tree, create,
  rename, move, delete, import, and search files without moving them into a
  proprietary container.
- **Markdown and ordinary files** — Edit `.md` files directly with autosave,
  links, headings, tags, backlinks, image assets, and external-change conflict
  handling. Other text, image, media, and binary files remain normal files in
  the Space.
- **Eidos Files** — Store structured records in portable `.eidos` files. Each
  file is a standard SQLite database with typed fields, relations, formulas,
  lookups, saved queries, and Grid, Gallery, and Kanban views.
- **Version history** — Use Graft to review Changes and Staged files, create
  versions, inspect text and structured diffs, browse history, restore files or
  a Space, and work with optional remotes.
- **Space Agent** — Run persistent Agent sessions with configurable model
  providers and approval modes. The Agent can work with Space files, inspect
  Eidos Files, use versioning tools, and invoke trusted Extension commands.
- **File-based Extensions (developer preview)** — Add commands, panels, file
  editors, and Eidos File views from packages stored inside the Space. Exact
  source snapshots require explicit trust and capability grants before they can
  run.

Core file editing works without an internet connection. Cloud model providers,
web search, Graft remotes, GitHub Extension installation, and downloads require
network access.

## The file-based Space model

A Space folder is the source of truth. Eidos works with the files in place:

| Content                                                    | Storage                          |
| ---------------------------------------------------------- | -------------------------------- |
| Notes and documents                                        | Ordinary `.md` files             |
| Images, PDFs, media, and other attachments                 | Ordinary files and folders       |
| Structured tables and views                                | Portable `.eidos` SQLite files   |
| Local Eidos state, indexes, Agent sessions, and Extensions | The managed `.eidos/` folder     |
| Version history                                            | The managed `.graft/` repository |

An Eidos File can be opened with ordinary SQLite tools or with the standalone
[Eidos File editor](https://editor.eidos.space). Graft versions Markdown,
attachments, and Eidos Files together instead of treating structured data as a
separate cloud service.

## Desktop and browser support

| Capability                            | Eidos Desktop | Eidos File editor |      Legacy Web/PWA       |
| ------------------------------------- | :-----------: | :---------------: | :-----------------------: |
| Folder-backed file Space              |      Yes      |        No         |            No             |
| Markdown and file-tree workflow       |      Yes      |        No         | Legacy database documents |
| Open and edit a local `.eidos` file   |      Yes      |        Yes        |            No             |
| Grid, Gallery, and Kanban             |      Yes      |        Yes        |   Legacy database views   |
| Graft version history and remotes     |      Yes      |        No         |            No             |
| Space Agent and file-based Extensions |      Yes      |        No         |            No             |

Desktop is the primary experience for file-based Spaces. The browser editor
works with one local `.eidos` file at a time: Chromium-based browsers can write
back to the original after permission is granted, while other browsers use an
explicit copy or download workflow. The existing Web/PWA application continues
to support legacy database Spaces during the transition; it is not the full
file-based Desktop experience.

## Download and quickstart

1. Download Eidos Desktop from [eidos.space/download](https://eidos.space/download).
2. Create or register a folder as a Space.
3. Add existing files, create a Markdown note, or create an Eidos File for
   structured data.
4. Open **Version** when you want to review changes and create a restorable
   version of the Space.
5. Open **Agent** to start a Space-scoped AI session.

The download page lists builds for Apple Silicon and Intel Macs, Windows x64,
and Linux x64. Beta coverage can vary by platform; consult the release notes
before relying on a build for important data.

To try the structured format without installing Desktop, open
[editor.eidos.space](https://editor.eidos.space) and choose a local `.eidos`
file or the included sample.

### Migrating a legacy Space

Legacy database Spaces remain available in Desktop. From a legacy Space, open
**Settings → Migration**, choose an empty folder, and review the exported
file-based Space. Migration creates a new Space and leaves the source unchanged.
Some documents that contain only legacy Lexical state require a recovery sidecar
instead of a complete Markdown conversion; inspect the generated migration
report before retiring the source Space.

## Development

Requirements:

- Node.js `22.23.1` (pinned in [`.node-version`](./.node-version))
- Corepack with the repository-pinned pnpm `10.12.4`

```bash
git clone https://github.com/mayneyao/eidos.git
cd eidos
corepack enable
pnpm install --frozen-lockfile
pnpm install:sqlite-ext
pnpm dev:desktop
```

Useful commands:

| Command                   | Purpose                                         |
| ------------------------- | ----------------------------------------------- |
| `pnpm dev:desktop`        | Run the Desktop app                             |
| `pnpm dev:eidos-file-web` | Run the standalone Eidos File editor            |
| `pnpm dev`                | Run the legacy Web/PWA app                      |
| `pnpm build:desktop:dev`  | Build and package an unsigned local Desktop app |
| `pnpm test`               | Run the Vitest suite                            |
| `pnpm typecheck`          | Type-check the monorepo                         |
| `pnpm lint`               | Run Oxlint                                      |

## Build with Eidos

Published MIT-licensed packages include:

- [`@eidos.space/eidos-file`](./packages/eidos-file) — headless runtime, format
  validation, browser lifecycle, queries, and mutations for `.eidos` files.
- [`@eidos.space/eidos-file-ui`](./packages/eidos-file-ui) — React host and
  reusable Grid, Gallery, and Kanban views.
- [`@eidos.space/core`](./packages/core) — core APIs for the legacy database
  runtime.
- [`@eidos.space/react`](./packages/react) — React integration for the legacy
  extension runtime.

The file-based Extension SDK and CLI are currently a developer preview built
from this monorepo. Start with
[`packages/extension-cli/README.md`](./packages/extension-cli/README.md) and run
the tooling through `pnpm extension:cli`; do not assume the preview packages have
the same stability guarantees as the published Eidos File packages.

## Project status

The `0.34` beta makes file-based Spaces the primary Desktop direction while
keeping legacy database Spaces available for compatibility and migration. The
new format, migration behavior, Extension host, Agent tools, and multi-platform
packaging remain under active testing. Optional Graft remotes are designed for
version transfer and backup workflows, not real-time collaborative editing.

Please report reproducible issues through
[GitHub Issues](https://github.com/mayneyao/eidos/issues) and include the app
version, operating system, and whether the Space is file-based or legacy.

## Community and license

- [Documentation](https://docs.eidos.space)
- [Discord](https://discord.gg/cGQqjeFpZq)
- [Contributors](https://github.com/mayneyao/eidos/graphs/contributors)

Eidos is licensed under [AGPL-3.0](./LICENSE). Selected integration packages,
including `@eidos.space/core`, `@eidos.space/react`,
`@eidos.space/eidos-file`, and `@eidos.space/eidos-file-ui`, are released under
the MIT License. Extensions under [`extensions/`](./extensions/) are also MIT
licensed; individual package manifests and license files remain authoritative.
