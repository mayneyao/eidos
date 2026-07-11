# RFC: Product UX for Spaces, Bases, and Changes

Status: Draft, implementation in progress
Date: 2026-07-08
Owner: Eidos
Related:

- `eidos-space-base-storage.md`
- `eidos-base-file-format.md`
- `eidos-space-markdown-runtime.md`
- `eidos-graft-space-versioning.md`

## Implementation Status (2026-07-12)

Implemented UX includes opening folders as Spaces, a Pierre Trees-based file
tree, Files/Version sidebar modes, a standalone Notion-style Markdown editor,
VS Code-style staged Changes, Diff tabs, a dedicated History tab, and a
contextual Codex-style Settings sidebar. Indexed quick open and compact
Outline/Backlinks sections are integrated without adding document chrome. The
current Space switcher remains at the bottom of the sidebar.

The `.base` route now uses the production Grid interaction layer with paged
visible-region loading, optimistic cell edits, persisted column layout, and
compact range-based batch row deletion. Working Changes and History provide a
Base-aware table/row inspector. A compact structure menu exposes table/field
rename and delete actions plus select/multi-select option editing only when
requested.

File-Space Settings separates General, Files/Obsidian, Versioning, and derived
Indexes controls. Space sync, conflict resolution, and migration UX remain.

## Summary

This RFC defines the product interaction model for Eidos after moving toward file-based Markdown files and `.base` structured data files.

The UI should make the storage model obvious:

- Markdown files are documents.
- Base files are structured data workbooks.
- Assets are ordinary files.
- `.eidos/extensions/**` is Eidos-owned project source shown through Extensions UX.
- Private `.eidos` runtime state stays hidden.
- Graft versions the visible Space.

The goal is to avoid exposing internal implementation details as primary user concepts.

## Product Principle

Eidos should feel like:

> A structured workspace for local Spaces.

Not:

> A hidden SQLite database with a file browser bolted on.

## Navigation Model

The primary navigation is the Space file tree.

Example:

```txt
my-space
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

## Opening a Space

Primary entry points:

- Open Folder as Space,
- Open Recent Space,
- Create New Space.

When opening an existing folder, Eidos should detect:

```txt
.obsidian/
.eidos/
.graft/
*.base
*.md
```

Detection should not force conversion. It should choose a mode:

- plain Space,
- Obsidian-compatible Space,
- legacy Eidos Space,
- graft-enabled Space.

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

Base internals should not appear as separate Space files.

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

in Space mode.

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

History should show versions as Space-level commits:

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
- restore whole Space state.

## Sync UI

Sync should be framed as Space sync:

```txt
Push Space
Pull Space
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
Space
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

New Space empty state should offer:

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
This Space uses the legacy Eidos database model.
Export to Space/Base when ready.
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
sample-space/
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
