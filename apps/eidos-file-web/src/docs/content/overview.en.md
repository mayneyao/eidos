# Eidos File: an open, local-first table format

Eidos File is a portable multidimensional table stored as a single `.eidos` file. The file is a standard SQLite database containing records, typed fields, relations, and saved views. You can open it in Eidos, inspect it with SQLite tools, or build your own compatible application.

Eidos File is local by default. Opening a file in the Eidos File Web Editor does not require an account and does not upload the database to a server.

## Open and edit an Eidos File

1. Open [editor.eidos.space](#/).
2. Choose **Open .eidos file**, or start with the included sample.
3. Edit records and properties in Grid, Gallery, or Kanban.
4. Save your changes.

Chromium-based browsers can write back to the original file after you grant permission. Other browsers use an honest copy workflow: the editor imports a private working copy and downloads a new `.eidos` file when you save.

## What one file contains

An Eidos File keeps the information needed to understand and present the data together:

- one or more user tables;
- field names, types, options, and relations;
- saved views with filters, sorting, order, and layout properties;
- file identity and format version;
- formula and lookup definitions.

Grid, Gallery, Kanban, and custom views all read the same records. A view is presentation and query state, not a duplicate of the table.

## Choose how you work

| Tool                         | Best for                                                                    |
| ---------------------------- | --------------------------------------------------------------------------- |
| Eidos File Web Editor        | Open or edit a local `.eidos` file without installing an app                |
| Eidos Desktop                | Work with Eidos Files alongside documents, assets, extensions, and local AI |
| SQLite tools                 | Inspect stored values or integrate with existing data workflows             |
| `@eidos.space/eidos-file`    | Build a compatible runtime, importer, exporter, or host application         |
| `@eidos.space/eidos-file-ui` | Embed the shared Eidos File editor and register custom view renderers       |

## Data ownership and privacy

Your `.eidos` file is the source of truth. The Web Editor processes it in a browser worker with SQLite WASM. File contents are not sent to Eidos servers.

Browser recovery storage may retain a private local working copy when there are unsaved changes. You can discard that copy from the editor. Clearing the site's browser data also removes it.

## Version control with Graft

Eidos File defines the file format and table behavior. Graft adds Git-like version control for SQLite: commits, row-aware diffs, branches, restore, and repository synchronization.

Open [Version Control](https://graft.eidos.space/) to learn how Graft versions SQLite databases. Version control remains an explicit workflow; a `.eidos` file does not require Graft.

## Continue reading

- [Eidos File format v1](#/docs/format) — the stable SQLite contract and value encodings.
- [Build an Eidos File editor](#/docs/runtime) — connect files, a Worker, the runtime, save state, and shared UI.
- [Build custom views](#/docs/custom-views) — compose the shared UI and register a renderer.
