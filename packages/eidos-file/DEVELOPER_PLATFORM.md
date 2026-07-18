# Eidos File developer platform

This document records the implementation audit behind the public package
boundary. It describes current code, not a future app SDK.

## What “file” means in Eidos today

| Area             | Current responsibility                                                                                                             | Public-platform decision                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| File-based Space | A folder is the source of truth; `@eidos.space/file-space` reads, writes, watches, previews, and indexes Markdown and binary files | Remains a Node/Desktop Space runtime. It is not part of the Eidos File SDK               |
| File handlers    | Installed extension contributions select editors for Markdown, code, media, and other paths                                        | Remains the Eidos extension system. Public React views use a separate trusted registry   |
| Eidos File       | A `.eidos` SQLite database with portable tables, fields, views, relations, queries, and mutations                                  | Owned by `@eidos.space/eidos-file`                                                       |
| Browser editor   | File picker/import fallback, SQLite WASM, save state, conflict checks, and recovery                                                | Reusable lifecycle moved behind `@eidos.space/eidos-file/browser` and `EidosFileSession` |
| Desktop editor   | File Space services and Electron-owned filesystem access provide an app-specific data source                                       | Stays behind the same public `EidosFileDataSource`; IPC is never public                  |
| React editor     | Grid, Gallery, Kanban, view routing, selection, commands, and host theme                                                           | Owned by `@eidos.space/eidos-file-ui`                                                    |

## Coupling audit

- `@eidos.space/eidos-file` main entry is framework-agnostic and browser-safe.
  `better-sqlite3` and SQLite WASM are isolated to explicit subpaths.
- `@eidos.space/eidos-file-ui` depends on React and DOM APIs, but not Eidos
  routes, Zustand stores, Electron, or application aliases.
- `@eidos.space/file-space` uses Node filesystem capabilities and remains
  unsuitable for browser embedding.
- Existing Space file handlers receive Eidos extension context and app-owned
  filesystem APIs. They are not interchangeable with trusted React views.
- Asset previews are host resolvers. Views receive URLs, never unrestricted
  filesystem access.

## Minimal public model

```text
EidosFileHandle ──read/write/CAS──> EidosFileSession
                                           │
                                  EidosFileRuntimeAdapter
                                           │
                                    EidosFileDataSource
                                           │
                                      React View Host
```

The handle owns descriptor identity, permissions, and persistence. The runtime
owns format validation and data semantics. The session owns asynchronous
lifecycle and recovery. The view host owns selection, local state, commands,
theme, and rendering.

## First-release scope

Included:

- `.eidos` format validation, migration, query, paging, and mutation;
- browser import, native picker, save, Save As, conflict, recovery, and cleanup;
- Node/Electron `better-sqlite3` entry;
- typed React provider, hooks, view host, Grid, optional Gallery/Kanban plugins,
  and trusted custom view registration;
- light/dark theme tokens and precompiled standalone CSS.

Out of scope:

- the complete Eidos app shell or Space navigation;
- Markdown/Base format ownership and Base UI;
- arbitrary File Space handlers or extension installation;
- untrusted code execution, remote file upload, sync, collaboration, or auth;
- hidden access to Eidos stores, routes, IPC, filesystem, or database singletons;
- a generic document framework for formats that do not share Eidos File
  runtime semantics.
