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

The `.base` route now uses the production Grid foundation with paged
visible-region loading, optimistic cell edits, persisted column layout,
copy/paste, undo/redo, field visibility, header actions, compact range-based
batch row deletion, inline search, and persisted multi-field filters and sorts.
Filtered/sorted paging and range deletion use the same structured query model,
so a selection always mutates the rows shown in the Grid. Base creation is
named, template-aware, and publishes the SQLite file atomically. Working
Changes and History provide a Base-aware table/row inspector.

Tables now support multiple independent Grid views. The compact anchored view
switcher creates, renames, duplicates, reorders, and deletes views without
opening a centered dialog; each view owns its query, field visibility, column
order, and width state. Imported non-Grid view metadata remains visible but is
not presented as a working layout until that renderer exists.

File fields now use a Base-specific multi-attachment cell adapted from the
existing table interaction. Users can import files into the visible Space
`assets/` folder, drop files onto a cell, reorder or remove attachments, open
them in Eidos, or reveal them in the file manager. Routine attachment editing
stays inside the Grid overlay; only the necessary native file picker interrupts
the workflow.

Relation fields now follow the original table interaction: cells display linked
record titles and open a searchable, multi-select Grid overlay that stores only
stable row IDs. Formula fields calculate live, render readonly using their
configured display type, and are created or edited from anchored field controls
with field insertion shortcuts. Neither workflow opens a centered modal.

Base is still in delivery closure, not product acceptance. Advanced nested
filter authoring, lookup/rollup fields, richer formula completion and preview,
Gallery/Kanban layouts,
accessible table semantics, and a complete native
create/edit/restart/version/restore run remain. Routine Base configuration uses
inline controls, header menus, and anchored popovers. Modal dialogs are
reserved for destructive confirmation or other decisions that must interrupt
the workflow. New interactions should first adapt the proven editing patterns
from the original Eidos table; implementation convenience is not a reason to
move field configuration, record editing, or view management into a modal.

File-Space Settings separates General, Files/Obsidian, Versioning, and derived
Indexes controls. Legacy-Space Settings also provides server-owned migration
preview, progress, validation, reveal, and open-new-Space actions. Native Space
sync and path-first text conflict resolution now pass a two-Space Desktop
acceptance flow. Richer Base row-level conflict presentation remains.

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

Interaction rules:

- adding and configuring fields happens from the grid header or adjacent
  controls,
- table/view configuration uses anchored menus and progressive disclosure,
- routine editing must not open centered modal dialogs,
- destructive deletion may require confirmation,
- keyboard, clipboard, range selection, and undo/redo should match the existing
  Eidos table unless the Base file model requires an explicit difference.

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
