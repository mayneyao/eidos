# Base: an open, local-first table format

Base is a portable multidimensional table stored as a single `.base` file. The file is a standard SQLite database containing records, typed fields, relations, and saved views. You can open it in Eidos, inspect it with SQLite tools, or build your own compatible application.

Base is local by default. Opening a file in the Base Web Editor does not require an account and does not upload the database to a server.

## Open and edit a Base

1. Open [base.eidos.space](#/).
2. Choose **Open .base file**, or start with the included sample.
3. Edit records and properties in Grid, Gallery, or Kanban.
4. Save your changes.

Chromium-based browsers can write back to the original file after you grant permission. Other browsers use an honest copy workflow: the editor imports a private working copy and downloads a new `.base` file when you save.

## What one file contains

A Base keeps the information needed to understand and present the data together:

- one or more user tables;
- field names, types, options, and relations;
- saved views with filters, sorting, order, and layout properties;
- file identity and format version;
- formula and lookup definitions.

Grid, Gallery, Kanban, and custom views all read the same records. A view is presentation and query state, not a duplicate of the table.

## Choose how you work

| Tool                   | Best for                                                                   |
| ---------------------- | -------------------------------------------------------------------------- |
| Base Web Editor        | Open or edit a local `.base` file without installing an app                |
| Eidos Desktop          | Work with Base files alongside documents, assets, extensions, and local AI |
| SQLite tools           | Inspect stored values or integrate with existing data workflows            |
| `@eidos.space/base`    | Build a compatible runtime, importer, exporter, or host application        |
| `@eidos.space/base-ui` | Embed the shared Base editor and register custom view renderers            |

## Data ownership and privacy

Your `.base` file is the source of truth. The Web Editor processes it in a browser worker with SQLite WASM. File contents are not sent to Eidos servers.

Browser recovery storage may retain a private local working copy when there are unsaved changes. You can discard that copy from the editor. Clearing the site's browser data also removes it.

## Version control with Graft

Base defines the file format and table behavior. Graft adds Git-like version control for SQLite: commits, row-aware diffs, branches, restore, and repository synchronization.

Open [Version Control](https://graft.eidos.space/) to learn how Graft versions SQLite databases. Version control remains an explicit workflow; a `.base` file does not require Graft.

## Continue reading

- [Base file format v1](#/docs/format) — the stable SQLite contract and value encodings.
- [Build a Base editor](#/docs/runtime) — connect files, a Worker, the runtime, save state, and shared UI.
- [Build custom views](#/docs/custom-views) — compose the shared UI and register a renderer.
