# RFC: Eidos Space and Markdown Runtime

Status: Draft, usable vertical slice
Date: 2026-07-08
Owner: Eidos
Related:

- `eidos-space-base-storage.md`
- `eidos-base-file-format.md`

## Implementation Status (2026-07-12)

Implemented:

- file-system-backed Space tree and file CRUD,
- safe atomic Markdown saves with external-change detection,
- file watching and renderer refresh events,
- a standalone Lexical Markdown editor package,
- basic CommonMark/GFM editing, attachments, wiki links, and source preservation,
- Markdown-aware list/Enter/Backspace/Tab behavior, Markdown and image
  paste/drop, automatic links, floating inline formatting, and block selection,
- a rebuildable search/link/tag/backlink index persisted at
  `.eidos/indexes/markdown.sqlite3`,
- indexed quick open, editor wiki-link completion, outline, and backlinks UI.

The standalone editor currently has 54 package acceptance tests. Desktop host
integration tests also cover runtime loading, save behavior, and conflict paths.

The Desktop index scans filesystem metadata on startup so files remain
authoritative, but reuses unchanged content and parsed Markdown metadata from
the disposable SQLite cache. Watcher changes update it incrementally; explicit
Rebuild and corrupt-schema recovery recreate it entirely from Space files.

Remaining for this slice:

- native Desktop acceptance for IME, OS clipboard/image paste, and very long
  documents,
- finer-grained marquee selection inside list containers and additional fenced
  code presentation polish.

## Summary

This RFC defines how Eidos should open and edit a Space where Markdown files are the canonical document state.

The target model:

- The Space file system is the canonical document tree.
- `.md` files are read and written directly.
- `eidos__docs` is not the canonical Markdown body store in Space mode.
- `.eidos/` stores generated indexes, caches, sessions, and local UI state.
- `.base` files provide structured data inside the same Space.

This lets Eidos open Obsidian vaults as Spaces without importing the user's documents into a hidden primary database.

## Product Principle

Space mode should preserve the user's trust:

> If a user opens the Space with another editor, their Markdown documents are still there.

Eidos can add better editing, tables, views, search, agents, and versioning. It should not make Markdown depend on `.eidos/db.sqlite3` as the source of truth.

## Goals

- Read and write Markdown documents as real files.
- Use the real file system tree as the canonical document tree.
- Keep Spaces created from Obsidian vaults usable outside Eidos.
- Let Eidos build indexes and backlinks without owning the document body.
- Keep Eidos-private state out of graft status by default.
- Preserve a path for Eidos-native features that need metadata.

## Non-Goals

- This RFC does not define the full Markdown parser/editor implementation.
- This RFC does not require compatibility with every Obsidian plugin.
- This RFC does not require all old Eidos documents to migrate immediately.
- This RFC does not define Base internals.

## Runtime Boundaries

Space mode should separate three runtimes:

```txt
Space runtime:
  opens the folder
  reads the real file tree
  resolves Space-relative paths
  manages .eidos private state
  manages graft

Markdown runtime:
  opens .md files
  parses frontmatter/body
  edits and saves Markdown
  emits file-change events

Base runtime:
  opens .base SQLite files
  manages tables/fields/views/rows
```

The Markdown runtime should not require `DataSpaceWithTable`. The Base runtime should not require the Markdown document tree.

## File Tree

The left file tree in Space mode should be backed by the file system, not `eidos__tree`.

Example:

```txt
my-space/
  notes/project.md
  tasks.base
  assets/image.png
  .obsidian/
  .eidos/
  .graft/
```

Default tree behavior:

- show normal user files and folders,
- hide `.graft/`,
- hide `.eidos/` by default,
- expose `.eidos/extensions/**` through the Extensions product view rather than the normal document tree,
- optionally show `.obsidian/` depending on user settings,
- recognize `.md` as documents,
- recognize `.base` as Eidos Base files.

`eidos__tree` may continue to exist for legacy spaces or app-internal metadata, but it should not be the canonical Space file tree.

## Markdown Source of Truth

In Space mode:

```txt
notes/project.md
```

is the canonical document body.

Eidos may store derived metadata:

```txt
.eidos/indexes/markdown.sqlite3
.eidos/search.sqlite3
.eidos/cache/previews/
```

but those stores are rebuildable. If the file and index disagree, the file wins.

## Document Metadata

Document metadata should prefer portable Markdown mechanisms:

- YAML frontmatter,
- inline Markdown links,
- file path,
- file system timestamps when appropriate.

Optional Eidos metadata can live in frontmatter:

```yaml
---
id: 019f...
title: Project Plan
tags:
  - work
---
```

Rules:

- Eidos should not require an `id` for ordinary Markdown files.
- If Eidos writes IDs, they should be stable and non-invasive.
- Eidos-specific frontmatter should be minimal.
- Missing metadata should be reconstructed from path and content.

## Links and References

Space mode should support common Markdown link styles:

```txt
[Project](./project.md)
![](../assets/image.png)
[[Project]]
```

Eidos can build a backlink index in `.eidos/`, but the Markdown files remain canonical.

Open questions:

- How much wiki-link syntax should be supported in v1?
- Should Eidos normalize links when files are renamed?
- Should links to Base tables/rows use custom URI syntax or Markdown links?

## Attachments

Attachments should be ordinary Space files by default:

```txt
assets/image.png
files/report.pdf
```

Markdown documents reference them using relative paths.

Eidos may offer managed attachment folders, but the files should remain visible and versionable by graft.

## Obsidian Interop

When opening an Obsidian vault as a Space, Eidos should:

- leave `.obsidian/` intact,
- read Markdown files directly,
- preserve frontmatter and links where possible,
- not import documents into `eidos__docs` as canonical state,
- add `.eidos/` only for private Eidos state,
- add `.graft/` only when versioning is enabled,
- add `.base` files only when the user creates structured data.

`.obsidian/workspace*.json` should usually be treated as local UI state, not shared user content.

## Indexing

Generated indexes may include:

- full-text search,
- backlink graph,
- outline/headings,
- tags,
- embeddings,
- preview cache.

These should live under `.eidos/` and be ignored by graft by default.

Recommended invariant:

> Deleting `.eidos/indexes/**` should not destroy user content.

## Watch and Refresh

Eidos should watch the Space for file changes:

- external editor changes,
- file rename,
- file delete,
- asset updates,
- Base file updates.

The watcher should update indexes and UI state, not silently import files into a hidden document table.

## Legacy Compatibility

Existing Eidos spaces may still depend on:

```txt
eidos__docs
eidos__tree
.eidos/db.sqlite3
```

Compatibility should be explicit:

- legacy spaces continue to open through the old model,
- Space mode opens real files,
- migration/export converts old docs to `.md`,
- new file-based spaces should not create canonical Markdown in `eidos__docs`.

## API Direction

Target APIs:

```ts
const Space = await eidos.openSpace(path)
const doc = await Space.openMarkdown("notes/project.md")
await doc.save(markdown)

const base = await Space.openBase("tasks.base")
await base.schema.createTable(...)
```

Compatibility APIs may route to a default Space/base during transition, but new code should make the target explicit.

## Open Questions

1. Should Eidos create stable document IDs in frontmatter by default?
2. How should Eidos represent links from Markdown to Base tables or rows?
3. Should `.obsidian/` be visible in the file tree by default?
4. Should the Markdown editor preserve formatting byte-for-byte where possible?
5. Which generated indexes are required for a good first version?

## Recommended Vertical Slice

```txt
sample-space/
  notes/project.md
  assets/image.png
  .eidos/
```

The slice should prove:

- Eidos opens the Space.
- The file tree comes from the file system.
- Eidos edits `notes/project.md`.
- An external edit to the file appears in Eidos.
- `.eidos/indexes/**` can be deleted and rebuilt.
- No canonical document body is written to `eidos__docs`.
