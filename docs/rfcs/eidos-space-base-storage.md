# RFC: Eidos Space/Base Storage Model

Status: Draft, implementation in progress
Date: 2026-07-08
Owner: Eidos

## Implementation Status (2026-07-12)

The project is implementing this RFC through a Markdown-first vertical slice.
File-based Spaces, direct file operations, derived Markdown indexing,
Space-root local Graft versioning, and the standalone `.base` format/runtime
foundation are implemented. Base-aware Graft diff expansion is also implemented
for working changes and historical versions: Eidos requests row details only
for the selected SQLite path, then displays table and row operations without
polluting normal status refreshes. The standalone legacy export runtime can now
plan and atomically produce validated Markdown + `main.base` + asset Spaces;
the Desktop migration flow is still pending. Remote sync and file-based
extensions are not implemented.

The phase order in this document is therefore descriptive rather than the
current execution order. The active order is Markdown Space, local Graft,
standalone Base runtime, then migration/extensions/sync.

## Summary

Eidos should move toward a file-based storage model:

- Markdown files remain normal files in the Space.
- Base files are user-visible structured data files in the Space.
- Eidos-owned state lives under `.eidos/`, with versioned source/config separated from private runtime state.
- Graft provides version management for the whole Space, with SQLite-aware diffs for Base files.

The target product story is not "Eidos stores an Obsidian vault inside a hidden database". The target story is:

> Eidos opens a local Space, keeps Markdown and assets as files, adds first-class structured Base files, and uses graft to version the whole Space.

This is a large product and architecture shift. It should be introduced gradually while the current `.eidos/db.sqlite3` model remains available during migration.

## Motivation

Eidos currently stores much of the app state in `.eidos/db.sqlite3`, including document-like state through tables such as `eidos__docs`. This makes sense for a database-native app, but it conflicts with the mental model of users coming from Obsidian:

- Obsidian users expect Markdown files to be the source of truth.
- They expect the Space to remain readable and editable without the original app.
- They are wary of hidden databases becoming the canonical document store.

At the same time, Eidos' strongest differentiation is not "better Markdown files". The stronger wedge is:

- structured tables,
- relational fields,
- views,
- formulas,
- app-like workflows,
- local-first version management.

The storage model should make that explicit. Markdown should stay Markdown. Eidos' structured data should become a first-class file format: Base.

## Product Positioning

Eidos should be positioned as a structured workspace for local Spaces.

Obsidian:

- Markdown Space is the core asset.
- Plugins add behavior around files.

Eidos:

- Space is still a local folder.
- Markdown files remain document assets.
- Base files are structured data assets.
- Graft versions the Space and understands Base internals.

The user-facing asset types are:

```txt
.md                Document
.base              Structured data workbook
.eidos/extensions  Programmable behavior
images             Assets
folders            Organization
```

This avoids forcing users to choose between "plain files" and "structured data". Eidos can offer both.

## Goals

- Make Base a first-class user-visible file format.
- Keep Markdown documents as files, not hidden database records.
- Let Eidos open existing Obsidian vaults as Spaces without importing them into a private canonical database.
- Use graft as a generic version management layer for the Space.
- Provide SQLite/table-aware status and diff for `.base` files.
- Use `.eidos/` as the Eidos namespace, while separating versioned source/config from private, local, and generated runtime state.
- Avoid showing Eidos internal runtime state as user changes.

## Non-Goals

- This RFC does not define the full Base schema.
- This RFC does not define the complete migration implementation.
- This RFC does not require removing the current `.eidos/db.sqlite3` model immediately.
- This RFC does not require Obsidian compatibility for every plugin-specific metadata format.
- This RFC does not make `.base` files opaque proprietary blobs. They should remain SQLite files under the hood.

## Core Concepts

### Space

A Space is a normal folder selected by the user.

It may contain Markdown files, Base files, assets, app config folders, and graft metadata.

Example:

```txt
my-space/
  notes/project.md
  notes/idea.md
  tasks.base
  research.base
  assets/image.png
  .obsidian/
  .eidos/
  .graft/
```

The Space root is the graft worktree root.

### Markdown Document

Markdown files are user-owned documents.

In the target model, Eidos does not treat `eidos__docs` as the canonical document body store for Markdown documents. The file contents are the source of truth.

Eidos may still build indexes, backlinks, caches, previews, embeddings, and search data from Markdown files. Those generated states belong in `.eidos/` and are not canonical.

### Base

A Base is a user-visible structured data file.

Recommended naming:

```txt
tasks.base
research.base
crm.base
```

A Base is a SQLite database under the hood. Product-wise, it should feel closer to an Excel workbook or Airtable base:

- one file,
- many tables,
- many views,
- field metadata,
- relations,
- formulas,
- filters,
- layout state,
- optional extension metadata.

Eidos can open a Base file directly, render it as tables/views, and provide table-level version diffs through graft.

### Eidos Namespace

`.eidos/` is reserved as Eidos' app namespace.

This namespace can contain both:

- versioned project state, such as `.eidos/extensions/**`,
- private runtime state, such as indexes, caches, sessions, secrets, and local UI state.

This follows the same broad pattern as `.github/workflows`: a hidden app-specific directory can contain project-owned files that are meant to be versioned. Hiddenness avoids root namespace collisions; it does not automatically make every file private.

Examples:

```txt
.eidos/
  extensions/
  indexes/
  cache/
  state/
  sessions/
  ui-state.sqlite3
  search.sqlite3
```

By default, private runtime subtrees should not appear in graft status. Stable source/config subtrees may be explicitly tracked.

Some data under `.eidos/` may be important to Eidos at runtime, but that does not automatically make it versioned user state. The default rule should be:

> If it is private, generated, machine-local, or session-local, it should not be tracked.

### Graft Repository

`.graft/` lives at the Space root.

This makes graft responsible for the whole Space worktree, while tracking and ignore rules define what is considered user state.

Graft should be generic. It should not need Eidos-specific hardcoding to understand that `.base` files are SQLite. It should use file detection and configured tracking rules.

## Target Storage Layout

```txt
my-space/
  notes/
    project.md
    idea.md

  tasks.base
  research.base

  assets/
    image.png
    diagram.svg

  .obsidian/
    app.json
    workspace.json

  .eidos/
    indexes/
    sessions/
    cache/
    ui-state.sqlite3

  .graft/
    config.toml
    ...
```

Canonical user state:

- Markdown files,
- Base files,
- extension source files under `.eidos/extensions/**`,
- user assets,
- optionally selected app config files such as stable `.obsidian/` settings.

Non-canonical/private state:

- `.eidos/indexes/**`,
- `.eidos/cache/**`,
- `.eidos/sessions/**`,
- `.eidos/ui-state.sqlite3`,
- `.graft/**`,
- temporary files,
- platform noise such as `.DS_Store`.

## Graft Tracking Semantics

In the current interim Eidos integration, default tracking is narrow:

```txt
track.default_roots:
  .eidos/db.sqlite3
  .eidos/files/**
```

That makes sense for the current hidden-database model.

In the target Space/Base model, graft should track user-visible Space assets and selected Eidos project files, while ignoring private runtime state.

Recommended target default:

```txt
track.default_roots:
  **/*
  .eidos/extensions/**

ignore:
  .graft/**
  .eidos/db.sqlite3
  .eidos/cache/**
  .eidos/indexes/**
  .eidos/sessions/**
  .eidos/state/**
  .eidos/secrets.sqlite3
  **/.DS_Store
  **/*.tmp
```

Optionally, Eidos may choose a stricter default:

```txt
track.default_roots:
  **/*.md
  **/*.base
  assets/**
  files/**
```

The stricter default is safer but less file-based. The broader default is easier for users to understand:

> Everything I can see in my Space is versioned, except app-private dot directories and temporary files.

The recommended product default is the broader file-based rule, with clear ignore rules.

## Status and Diff UI

The Changes UI should present changed paths like a code editor source control panel.

Example:

```txt
notes/project.md
tasks.base
assets/image.png
```

For ordinary text files:

- show text diff when possible,
- show binary summary when not.

For ordinary binary files:

- show file-level change summary,
- optionally show image preview or metadata.

For `.base` files:

- show the path as a file-level changed item,
- allow expanding into table-level changes,
- show row-level details when the user opens the diff.

Example:

```txt
tasks.base
  Tasks table       +3 ~1
  Projects table    +1
  Views metadata    ~2
```

This keeps the mental model unified:

> A Base is a file in the Space, but Eidos can inspect its internal SQLite changes.

The UI should not expose `.eidos/db.sqlite3` as the main user asset in the target model.

## Base File Format Requirements

A `.base` file should be a valid SQLite database.

Eidos should add enough metadata for reliable detection:

```txt
eidos__meta
  key TEXT PRIMARY KEY
  value TEXT
```

Suggested keys:

```txt
format = "eidos-base"
format_version = "1"
app = "eidos"
created_at = ...
updated_at = ...
```

The file should also be detectable by SQLite header, so generic SQLite tools can inspect it.

Recommended MIME type:

```txt
application/vnd.eidos.base+sqlite3
```

Open question: whether `.base` is too generic as a file extension. Product-wise it is strong, but implementation should be prepared for extension conflicts. Eidos can still identify a Base by SQLite metadata, not extension alone.

## Relationship to Existing Tables

The current Eidos database contains tables such as:

- `eidos__docs`,
- `eidos__tree`,
- `eidos__files`,
- `eidos__kv`,
- user tables,
- view metadata,
- field metadata.

In the target model:

- Markdown body content should not be stored in `eidos__docs` as canonical state.
- Base-specific tables, views, fields, and relations move into `.base` files.
- `.eidos/db.sqlite3` should shrink into workspace-private metadata, cache, local settings, and migration support.
- File metadata should be reconsidered. If a file is a normal Space file, its file system path may be the canonical identity. If it is an attachment inside a Base, the Base can reference it by relative path or managed payload ID.

`eidos__tree` needs a separate decision:

- For Space files, the file system tree should be the canonical tree.
- For Base internals, tables/views can have their own ordering and grouping inside the Base.
- Eidos may still keep UI organization metadata, but it should not become a second canonical file tree for Markdown files.

## Obsidian Interop

Eidos should be able to open an existing Obsidian vault as a Space.

Recommended behavior:

- read and write `.md` files directly,
- leave `.obsidian/` intact,
- do not require importing Markdown into `.eidos/db.sqlite3`,
- preserve ordinary assets and links,
- add `.base` files as Eidos-specific structured assets,
- add `.graft/` only when versioning is enabled.

Tracking `.obsidian/` should be a user/product decision:

- stable config may be useful to version,
- workspace/session layout is often local noise.

Recommended default:

```txt
ignore:
  .obsidian/workspace*.json
```

Other `.obsidian` files can be considered later.

## Migration Strategy

This should be a staged migration, not a flag day rewrite.

### Phase 1: Base File Support

Add support for creating and opening `.base` files while keeping the current `.eidos/db.sqlite3` model.

Milestones:

- create empty `.base`,
- open `.base`,
- list tables inside `.base`,
- edit table data in `.base`,
- detect `.base` as SQLite-backed Eidos Base.

### Phase 2: Graft Space Mode

Teach Eidos to initialize graft at Space root for user-visible files.

Milestones:

- `.graft/` at Space root,
- default ignore for private `.eidos` runtime subtrees,
- file-level status for Markdown/assets,
- SQLite-aware diff for `.base`.

### Phase 3: Markdown File Mode

Make Markdown files first-class editable documents backed by the file system.

Milestones:

- file tree from real file system,
- Markdown editor reads/writes `.md`,
- backlinks/search/indexes are generated state,
- no canonical doc-body dependency on `eidos__docs` for Space Markdown.

### Phase 4: Export Existing Spaces

Provide a migration/export path from current Eidos spaces.

Milestones:

- export `eidos__docs` documents to `.md`,
- export structured tables into one or more `.base` files,
- export attachments/assets to normal Space paths,
- preserve links as much as possible,
- write a migration report.

### Phase 5: Deprecate Hidden User Content

After `.md` and `.base` are stable, reduce `.eidos/db.sqlite3` to private state.

Milestones:

- new Spaces do not store canonical user docs in `.eidos/db.sqlite3`,
- new structured data lives in `.base`,
- `.eidos/db.sqlite3` contains only private/generated/local state.

## Compatibility With Current Graft Work

The current graft integration already moves in the right direction:

- `.graft` lives at the worktree root,
- graft can manage both SQLite and ordinary files,
- payload/external storage exists,
- status can show changed paths,
- SQLite paths can expand into table-level changes.

However, the current Eidos default tracking scope:

```txt
.eidos/db.sqlite3
.eidos/files/**
```

is only correct for the current hidden-database model. In Space/Base mode, it should be replaced by Space-level user file tracking plus explicit tracking for stable Eidos project files such as `.eidos/extensions/**`.

## Key Decisions

1. Base is a user-visible file, not a hidden `.eidos` database.
2. Markdown files are source of truth in Space mode.
3. `.eidos/` is the Eidos namespace; private runtime subtrees are ignored by default.
4. `.graft/` is at the Space root.
5. Graft tracks user-visible Space assets and selected Eidos project files.
6. `.base` files are SQLite databases with Eidos metadata.
7. Extension source belongs in `.eidos/extensions/**`, while extension runtime state belongs in `.eidos/cache/**` and `.eidos/state/**`.
8. Eidos Changes UI shows path-level changes first, then Base internals on expansion.

## Open Questions

1. Should the extension be `.base`, `.eidosbase`, or should Eidos support both?
2. Should the default Space tracking rule be broad `**/*` with ignores, or explicit `**/*.md`, `**/*.base`, `assets/**`?
3. Which `.obsidian/` files should be versioned by default?
4. Should Base attachments live as ordinary sibling files, inside a managed assets folder, or in a Base-specific payload directory?
5. Should a Space have one default Base, many Base files, or both?
6. How much of the current `eidos__tree` model survives for file-backed Markdown?
7. Should the default extension source folder be exactly `.eidos/extensions/`, or configurable?
8. What is the exact migration path for existing Eidos spaces that rely on `eidos__docs`?

## Proven Vertical Slice and Recommended Next Step

The following vertical slice is now implemented and covered by a repeatable
real-Base/Graft smoke test:

```bash
pnpm --filter eidos smoke:base-versioning
```

```txt
sample-space/
  note.md
  tasks.base
  assets/image.png
  .eidos/
  .graft/
```

It proves:

- Eidos can open the Space.
- Eidos can edit `note.md`.
- Eidos can open and edit `tasks.base`.
- Graft status shows `note.md`, `tasks.base`, and `assets/image.png`.
- Expanding `tasks.base` shows table- and row-level changes.
- `.eidos/sessions/**` never appears in status.

The compact Base editing surface has now been replaced with an adapter over the
existing production Grid interaction layer. Basic multi-table/field authoring,
keyboard workflows, selection, paste/fill behavior, and persisted column
layout are implemented without moving file-format responsibilities back into
`@eidos.space/core`.

The next step is to replace the 200-row snapshot with a paged Base data source,
then complete table/field rename and delete workflows and richer field
properties. After that interaction layer is stable, implement the previewable
legacy Space export to Markdown and Base files before remote sync.
