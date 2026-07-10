# RFC: Migration From Legacy Eidos Spaces to Space/Base

Status: Draft
Date: 2026-07-08
Owner: Eidos
Related:

- `eidos-space-base-storage.md`
- `eidos-base-file-format.md`
- `eidos-space-markdown-runtime.md`
- `eidos-graft-space-versioning.md`

## Summary

This RFC defines a migration strategy from the current hidden-database Eidos Space model to the file-based Markdown + Base model.

Current model:

```txt
.eidos/db.sqlite3     canonical app/user state
.eidos/files/**       managed file payloads
```

Target model:

```txt
*.md                  Markdown documents
*.base                structured data
assets/**             user assets
.eidos/extensions/**  extension source
.eidos/cache/**       private/generated state
.eidos/state/**       local runtime state
.graft/**             version metadata
```

Migration should be export-based first, reversible, and explicit. It should not silently rewrite a user's existing space into the new model.

## Goals

- Preserve user content.
- Convert old documents to Markdown files.
- Convert old tables to `.base` files.
- Convert managed files into Space assets where possible.
- Keep a migration report.
- Allow users to preview before committing.
- Avoid destructive in-place migration as the first implementation.

## Non-Goals

- This RFC does not require perfect migration of every legacy feature.
- This RFC does not require deleting old `.eidos/db.sqlite3`.
- This RFC does not require one-click migration for all spaces in v1.
- This RFC does not define every Markdown serialization detail.

## Source Model

Legacy Eidos spaces may contain:

```txt
.eidos/db.sqlite3
  eidos__docs
  eidos__tree
  eidos__files
  eidos__columns
  eidos__views
  eidos__references
  tb_<tableId>
  eidos__kv
  eidos__chats
  eidos__messages
  ...

.eidos/files/**
```

Some current concepts are user content. Others are private/runtime state.

## Target Model

Example target Space:

```txt
my-space/
  notes/
    project.md
    ideas.md
  tasks.base
  assets/
    image.png
  .eidos/
    migration/
    indexes/
  .graft/
```

Canonical user content:

- `.md`,
- `.base`,
- assets.

Private/generated:

- `.eidos/indexes/**`,
- `.eidos/cache/**`,
- `.eidos/sessions/**`,
- migration logs.

## Migration Modes

### Export Mode

Export a legacy space into a new target folder.

Recommended first implementation.

Pros:

- safest,
- easy rollback,
- old space remains untouched.

### In-Place Mode

Transform an existing space into file-based shape.

Should come later and require explicit confirmation.

### Hybrid Mode

Keep legacy `.eidos/db.sqlite3` while adding `.base` files gradually.

Useful during development, but should not be the final product story.

## Content Mapping

### Documents

Source:

```txt
eidos__docs
eidos__tree
```

Target:

```txt
*.md
```

Rules:

- document body is serialized to Markdown,
- tree/folder path determines output path,
- title determines filename when safe,
- duplicate names get deterministic suffixes,
- document metadata can be stored in frontmatter if needed.

Open questions:

- how to serialize non-Markdown Lexical nodes,
- how to represent embedded tables/Base references,
- whether document IDs should be preserved in frontmatter.

### Tables

Source:

```txt
tb_<tableId>
eidos__columns
eidos__views
eidos__references
eidos__tree table nodes
```

Target:

```txt
*.base
```

Rules:

- copy user data tables,
- copy field metadata,
- copy view metadata,
- copy dependency metadata,
- create `eidos__tables`,
- write `eidos__meta`,
- validate formulas, links, lookups, and generated columns.

Export strategies:

- one `main.base` containing all tables,
- one `.base` per top-level table group,
- user-selected grouping.

Recommended v1:

```txt
main.base
```

because it preserves links/lookups between tables more easily.

### Files

Source:

```txt
.eidos/files/**
eidos__files
file field path strings
```

Target:

```txt
assets/**
```

Rules:

- copy physical files into a visible assets folder,
- preserve filenames when possible,
- use stable collision handling,
- rewrite file field paths to Space-relative paths,
- rewrite Markdown asset references when needed.

### Tree

Source:

```txt
eidos__tree
```

Target:

- folders and Markdown file paths for documents,
- `eidos__tables` rows for Base tables,
- optional UI metadata under `.eidos/`.

The legacy tree should not become the canonical Space tree.

### Private State

Do not migrate as user content:

- sessions,
- chats/messages unless explicitly exported,
- cache,
- generated indexes,
- local UI state,
- sync transient state.

## Migration Report

Every migration should produce:

```txt
.eidos/migration/<timestamp>/report.md
.eidos/migration/<timestamp>/mapping.json
```

Report should include:

- source path,
- target path,
- exported document count,
- exported table count,
- copied asset count,
- skipped items,
- warnings,
- errors,
- old ID to new path mapping.

## Validation

Before marking migration successful:

- all exported Markdown files exist,
- all exported Base files pass Base metadata validation,
- Base tables can be opened,
- row counts match,
- field counts match,
- view counts match,
- copied assets exist,
- rewritten file references resolve where possible.

## Graft Initialization

After export, Eidos may offer to enable graft:

```txt
.graft/
```

Default Space tracking should ignore private `.eidos` runtime subtrees, track user-visible files, and track stable Eidos project files such as `.eidos/extensions/**`.

The initial commit should include:

- Markdown files,
- Base files,
- assets,
- selected stable config files.

It should not include:

- migration cache,
- sessions,
- generated indexes.

## Rollback

Export mode rollback is simple:

- delete the target folder,
- keep the source legacy space.

In-place migration must create a backup first:

```txt
.eidos/backups/pre-Space-migration-<timestamp>/
```

In-place mode should not ship until restore has been tested.

## Open Questions

1. Should v1 export all tables into `main.base` or ask the user?
2. How should Lexical-only blocks be serialized to Markdown?
3. Should `eidos__chats` and `eidos__messages` be exportable as Markdown transcripts?
4. Should old graft history be preserved or should migrated Spaces start with a new initial commit?
5. How much metadata should be written into Markdown frontmatter?

## Recommended Vertical Slice

Legacy input:

```txt
.eidos/db.sqlite3
  one doc
  one table
  one file field
.eidos/files/logo.png
```

Output:

```txt
migrated-Space/
  notes/doc.md
  main.base
  assets/logo.png
  .eidos/migration/.../report.md
```

The slice should prove:

- document exports to Markdown,
- table exports to Base,
- asset is copied,
- file field path is rewritten,
- report includes mappings and warnings,
- source space remains unchanged.
