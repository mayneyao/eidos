# RFC: Product UX for Vaults, Bases, and Changes

Status: Draft
Date: 2026-07-08
Owner: Eidos
Related:

- `eidos-vault-base-storage.md`
- `eidos-base-file-format.md`
- `eidos-vault-markdown-runtime.md`
- `eidos-graft-vault-versioning.md`

## Summary

This RFC defines the product interaction model for Eidos after moving toward vault-native Markdown files and `.base` structured data files.

The UI should make the storage model obvious:

- Markdown files are documents.
- Base files are structured data workbooks.
- Assets are ordinary files.
- `.eidos/extensions/**` is Eidos-owned project source shown through Extensions UX.
- Private `.eidos` runtime state stays hidden.
- Graft versions the visible vault.

The goal is to avoid exposing internal implementation details as primary user concepts.

## Product Principle

Eidos should feel like:

> A structured workspace for local vaults.

Not:

> A hidden SQLite database with a file browser bolted on.

## Navigation Model

The primary navigation is the vault file tree.

Example:

```txt
my-vault
  notes/
    project.md
  tasks.base
  assets/
    image.png
```

Default behavior:

- clicking `.md` opens Markdown editor,
- clicking `.base` opens Base workspace,
- clicking image/PDF opens preview,
- folders expand/collapse,
- `.eidos/` and `.graft/` are hidden by default.

## Opening a Vault

Primary entry points:

- Open Folder as Vault,
- Open Recent Vault,
- Create New Vault.

When opening an existing folder, Eidos should detect:

```txt
.obsidian/
.eidos/
.graft/
*.base
*.md
```

Detection should not force conversion. It should choose a mode:

- plain vault,
- Obsidian-style vault,
- legacy Eidos space,
- graft-enabled vault.

## Creating Content

New content commands:

```txt
New Markdown Note
New Base
New Folder
Import File
```

Creating a Base should create:

```txt
tasks.base
```

not:

```txt
.eidos/db.sqlite3
```

Base creation flow:

1. choose file name,
2. choose template or blank,
3. open Base editor,
4. create first table.

## Base Workspace

Opening `tasks.base` should show a Base-specific workspace:

```txt
tasks.base
  Tables
    Tasks
    Projects
  Views
    Grid
    Kanban
```

Expected controls:

- table switcher,
- view switcher,
- add table,
- add field,
- import CSV,
- properties/settings,
- open file location.

Base internals should not appear as separate vault files.

## Markdown Editor

Opening a Markdown file should show an editor backed by that file.

Expected controls:

- edit/preview where appropriate,
- frontmatter support,
- attachments insertion,
- link autocomplete,
- optional backlink panel.

Saving writes to the `.md` file.

## Changes UI

Changes UI should be path-first and tree-shaped.

Example:

```txt
Changes 4
  notes/
    project.md
  tasks.base
    Tasks table       +3 ~1
    Views metadata    ~1
  assets/
    image.png
```

Rules:

- show user-visible paths first,
- hide private `.eidos` runtime state,
- show `.eidos/extensions/**` through the Extensions product view,
- hide `.graft/**`,
- group by folders,
- show `.base` as a file that can expand,
- show text diff for text files,
- show preview/summary for binary files,
- show table-level diff for Base files.

The UI should not lead with:

```txt
.eidos/db.sqlite3
```

in vault mode.

## Commit Flow

Commit flow:

1. user reviews changed paths,
2. user optionally expands `.base`,
3. user writes message,
4. user commits,
5. Eidos shows version in history.

Normal users should not need to understand staging.

Advanced users may later get:

- include/exclude paths,
- commit selected,
- inspect raw graft status.

## History UI

History should show versions as vault-level commits:

```txt
Update tasks and project notes
  notes/project.md
  tasks.base
```

Opening a version should allow:

- view changed paths,
- inspect Markdown diff,
- inspect Base table diff,
- restore file/path,
- restore whole vault state.

## Sync UI

Sync should be framed as vault sync:

```txt
Push vault
Pull vault
Resolve conflicts
```

It should not be framed as syncing `.eidos/db.sqlite3`.

Payload hydration should be hidden unless action is needed:

- missing assets,
- failed download,
- conflict needs user choice.

## Settings

Settings should separate:

```txt
Vault
  visible files
  ignored paths
  Obsidian compatibility

Versioning
  enable graft
  remote
  tracked paths advanced

Base
  default Base templates
  asset folder policy

Eidos Private State
  cache size
  rebuild indexes
```

Track/ignore configuration is advanced. Quick start should not force users to learn it.

## Empty States

New vault empty state should offer:

- create note,
- create Base,
- import Obsidian vault,
- enable versioning.

Base empty state should offer:

- create first table,
- import CSV,
- use template.

Changes empty state:

```txt
No changes
```

not a tutorial about graft internals.

## Migration UX

For legacy spaces:

Eidos should show:

```txt
This space uses the legacy Eidos database model.
Export to Vault/Base when ready.
```

Migration flow:

1. explain target layout,
2. choose output folder,
3. preview counts,
4. run export,
5. show report,
6. optionally enable graft.

No silent migration.

## Open Questions

1. Should `.obsidian/` be shown in the file tree?
2. Should Base tables appear under the `.base` file in the main tree, or only inside the Base workspace?
3. Should Changes show generated diagnostics for Base files by default?
4. Should commit selected paths be in v1 or later?
5. How visible should graft terminology be in product copy?

## Recommended UX Slice

Build a clickable vertical slice around:

```txt
sample-vault/
  note.md
  tasks.base
  assets/image.png
```

The slice should prove:

- file tree distinguishes `.md`, `.base`, assets,
- Markdown editor saves real `.md`,
- Base workspace opens `tasks.base`,
- Changes tree shows all three changed paths,
- expanding `tasks.base` shows table changes,
- private `.eidos` runtime state remains hidden.
