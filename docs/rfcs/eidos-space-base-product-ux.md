# RFC: Product UX for Spaces, Bases, and Changes

Status: Draft, implementation in progress
Date: 2026-07-08
Owner: Eidos
Related:

- `eidos-space-base-storage.md`
- `eidos-base-file-format.md`
- `eidos-space-markdown-runtime.md`
- `eidos-graft-space-versioning.md`

## Implementation Status (2026-07-13)

Implemented UX includes opening folders as Spaces, a Pierre Trees-based file
tree, Files/Version sidebar modes, a standalone Notion-style Markdown editor,
VS Code-style staged Changes, Diff tabs, a dedicated History tab, and a
contextual Codex-style Settings sidebar. Indexed quick open and compact
Outline/Backlinks sections are integrated without adding document chrome. The
current Space switcher remains at the bottom of the sidebar.

The `.base` route now uses the production Grid foundation with paged
visible-region loading, optimistic cell edits, persisted column layout,
copy/paste, undo/redo, field visibility, header actions, compact range-based
batch row deletion, inline search, and persisted nested filters and multi-field
sorts. Filter groups reuse the original table's anchored AND/OR authoring model,
including derived Formula/Lookup fields. Filtered/sorted paging and range
deletion use the same structured query model, so a selection always mutates the
rows shown in the Grid. Base creation is named, template-aware, and publishes
the SQLite file atomically. Working Changes and History provide a Base-aware
table/row inspector.

Tables now support multiple independent Grid views. The compact anchored view
switcher creates, renames, duplicates, reorders, and deletes views without
opening a centered dialog; each view owns its query, field visibility, column
order, and width state. Imported non-Grid view metadata remains visible but is
not presented as a working layout until that renderer exists.

Base navigation now follows a workbook hierarchy instead of mixing tables and
views in one toolbar. The active table's views occupy the top tab strip, while
tables switch as Excel-style sheets in a persistent bottom bar; view creation
and management remain anchored to the view strip, and save state moves into the
sheet bar. Grid also reuses the legacy table's measured scrollbar compensation:
when columns fit, the sticky trailing row no longer reserves an empty horizontal
scrollbar band; when columns overflow, the native scrollbar keeps its full
height.

Cmd+P remains the Space-wide Quick Open instead of opening a Base-specific
dialog. When the active tab is a `.base`, a `Tables in <file>.base` contextual
group appears above normal file results and matches table names, raw table
identifiers, and the Base path. The bottom sheet bar also supports cycling with
Ctrl+PageUp/PageDown, adding a fast workbook path without changing the global
search mental model.

Base row mutations now return the committed metadata revision. The renderer
uses it to recognize the delayed file-watcher echo of its own cell edit instead
of treating that echo as an external replacement and reloading the entire Grid.
Routine row/cell saves also no longer disable every layout while pending;
external revisions still trigger a refresh.

The Desktop shell now uses shared semantic heights: a 38px titlebar, 40px
surface workbar, and 40px bottom statusbar. Files/Version section bars and the
Base view workbar consume the same workbar token; the Space footer and Base
sheet bar consume the same statusbar token. Components no longer hard-code
different heights for horizontal boundaries shared across sidebar and content.

File fields now use a Base-specific multi-attachment cell adapted from the
existing table interaction. Users can import files into the visible Space
`assets/` folder, drop files onto a cell, reorder or remove attachments, open
them in Eidos, or reveal them in the file manager. Routine attachment editing
stays inside the Grid overlay; only the necessary native file picker interrupts
the workflow.

Relation fields now follow the original table interaction: cells display linked
record titles and open a searchable, multi-select Grid overlay that stores only
stable row IDs. Formula fields calculate live, render readonly using their
configured display type, and are created or edited from the same anchored
CodeMirror composer. It restores SQL/field completion, a searchable reference
browser, immediate dependency/error feedback, and sample results from real Base
rows before saving. Neither workflow opens a centered modal.

Lookup/rollup fields extend that same header-driven flow: users choose an
existing relation, target field, and aggregation from an anchored field panel.
Derived values stay readonly in the Grid, refresh with relation/target edits,
and can feed formulas without introducing a separate configuration screen.

Field configuration now converges on a non-modal Property workspace at the
right edge of the Grid. Every column header and table-structure menu can open
it; names save inline, mutable source fields require explicit confirmation
before safe type conversion, Select/Multi-select options support per-item add,
rename, color, drag reorder, and delete, and Number format/bar/maximum/color/
label settings drive the live Grid. Removing an option cleans stored cell
references in the same Base transaction. Field creation and later Property
editing reuse the same option rows, including duplicate prevention, color, and
drag reorder. Number creation and later editing likewise reuse the same display
controls. Rapid Number changes merge locally instead of overwriting one another,
and rejected option/Number mutations restore the last persisted presentation.
The comma-text Options dialog and field Rename dialog path have been removed.
The field type control is now a shared, searchable Basic/Advanced picker with
icons, descriptions, keyword matching, and deterministic keyboard selection;
Base no longer presents field capabilities as an undifferentiated dropdown.

Gallery and Kanban now participate in the same persisted view lifecycle as
Grid. Gallery uses paged server data, responsive card sizing, optional empty
field suppression, and the shared record inspector. Kanban groups by a Select
field, pages each group independently, persists cross-column moves as field
edits, and creates records directly in the target group. Both layouts reuse the
active view's search, filters, sorts, field visibility, and Property workspace.
Gallery can use a File field as a fitted or cropped card cover; the binary is
read through the Space file boundary and exposed only as a temporary object
URL. Gallery and Kanban cards share hover and native context actions for opening
record details and confirmed deletion by stable row ID. The same right-side
record inspector is now editable across Grid, Gallery, and Kanban: primitive
source fields autosave inline, derived Formula/Lookup values remain readonly,
and successful edits update the active layout without closing the inspector.
File fields support Space import, drop, remove, open, and reveal actions;
Relation fields reuse the target-table search boundary and persist stable row
IDs for single or multiple selection.

Inline row search now reports the filtered record position and count. Enter and
Shift+Enter cycle forward and backward while the input keeps focus. Grid scrolls
to and highlights the target row; Gallery and Kanban scroll to the target card
and automatically fetch the required page before revealing it.

Kanban now horizontally virtualizes large option sets, mounting only the visible
columns plus overscan during normal navigation. An active drag temporarily
mounts every drop target so virtualization does not make valid destinations
unreachable. Direct moves announce success, cancellation, and failed-save
rollback through an assertive live region; the keyboard Move-to action remains
available as an equivalent non-pointer path.

CSV selection, analysis, and writing now follow the same anchored, non-modal
workflow. The mapping panel opens as soon as the native picker returns;
analysis and import expose real byte/row progress and can be canceled in place.
Cancellation terminates the isolated worker, waits for SQLite transaction
rollback, and only then releases the current Base mutation lock, so retrying
cannot race a worker that is still exiting or leave partial tables or rows.

The real-file Base versioning smoke now creates Grid, Gallery, and Kanban
metadata, closes and reopens the file, edits rows, verifies Graft row diffs,
restores the original revision, and reopens again to verify records, derived
values, and all three view layouts. The restored repository is clean.

Native Desktop acceptance now covers the same lifecycle through the product UI:
create a named Task tracker Base, edit primitive and Select cells, stage only
that file, create a version, fully restart Electron, reopen and verify the row,
make a dirty edit, and restore the file from History without moving HEAD. The
open Base refreshes immediately after Graft replaces the file and the worktree
returns to clean when restoring the current version.

Current parity with the original table views is explicit:

| Capability                                                | Base status                                   | Remaining boundary                                                                                           |
| --------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Persisted view lifecycle and per-view query/layout        | Automated and native restart/restore accepted | No known v1 gap                                                                                              |
| Gallery field visibility, empty-field hiding, card sizing | Working with result navigation                | No known v1 gap                                                                                              |
| Gallery cover                                             | File field working                            | Legacy document-content and extension-block covers are intentionally not coupled into the standalone package |
| Card actions                                              | Editable inspector and delete working         | A full-page row-document model is not yet defined for file-based Base                                        |
| Kanban Select grouping, counts, collapse, add, drag move  | Working with virtualized accessible moves     | No known v1 gap                                                                                              |
| Base merge conflict review                                | Native row review accepted                    | Schema/opaque conflicts intentionally use the explicit whole-file fallback                                   |

This is the first working delivery slice, not yet full parity with the original
table views. Additional portable cover sources remain. Routine Base
configuration uses inline controls, header menus, and anchored popovers. Modal
dialogs are reserved for destructive confirmation or other decisions that must
interrupt the workflow. New interactions should first adapt the proven editing
patterns from the original Eidos table; implementation convenience is not a
reason to move field configuration, record editing, or view management into a
modal.

File-Space Settings separates General, Files/Obsidian, Versioning, and derived
Indexes controls. Legacy-Space Settings also provides server-owned migration
preview, progress, validation, reveal, and open-new-Space actions. Native Space
sync and path-first text conflict resolution now pass a two-Space Desktop
acceptance flow. Base conflicts now open in a dedicated, non-modal review tab:
Graft row/schema/opaque artifacts remain structured, row values are compared as
Base/current/incoming fields, and each supported row can independently keep the
current value or accept the incoming value. Schema and opaque conflicts fall
back explicitly to a file-level choice. Native two-Space acceptance verifies
the row-aware Diff, non-modal review, incoming-row resolution, staged Base,
two-parent merge continuation, and final push.

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
- the existing Eidos table is the interaction baseline; preserve inline cell
  editing, header actions, keyboard movement, clipboard, and range selection
  before introducing a new interaction,
- centered modal dialogs are considered an undesirable default and must not be
  used for routine editing,
- destructive deletion may require confirmation,
- undo/redo should match the existing Eidos table unless the Base file model
  requires an explicit difference.

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
