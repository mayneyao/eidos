# @eidos.space/file-space

Independent file-based Space runtime for Eidos.

The package treats an ordinary local folder as the canonical source of truth.
It does not import Markdown into a database and does not create private state
inside the folder.

## Responsibilities

- safe Space-relative file reads and writes,
- file and directory creation, move, and removal,
- coalesced filesystem change notifications and stable read snapshots,
- rebuildable file and content indexes with optional disposable persistence,
- filename and full-text search,
- Markdown link/alias resolution and backlinks.

## Boundaries

This package does not own:

- Space registration or recent-Space configuration,
- Electron IPC or file pickers,
- React components,
- a required database implementation or `@eidos.space/core`,
- sync and version history,
- canonical Markdown content outside the original files.

Generated indexes are disposable. Recreating `FileSpaceIndex` from the folder
must always recover the current state.

## Example

```ts
import { FileSpaceIndex, SpaceFiles } from "@eidos.space/file-space"

const files = new SpaceFiles("/path/to/space")
const index = new FileSpaceIndex(files)

await files.createText("notes/idea.md", "# Idea")
const results = await index.search("idea")
```

Desktop hosts can persist the derived index without coupling the core runtime
to SQLite. The optional adapter stores it at `.eidos/indexes/markdown.sqlite3`:

```ts
import { openFileSpaceIndexStorage } from "@eidos.space/file-space/better-sqlite3"

const index = new FileSpaceIndex(files, {
  storage: openFileSpaceIndexStorage(files.root),
})
```

The adapter uses `better-sqlite3` as an optional peer dependency. It reuses
unchanged content after restart, writes watcher updates incrementally, and
recovers a damaged index by rebuilding from the Space. Deleting `.eidos/indexes`
never deletes or changes canonical Space files.

Tag filters use Markdown frontmatter and inline tags:

```ts
await index.search("tag:work")
await index.search("tag:project active")
```

A parent tag such as `tag:project` also matches nested tags such as
`#project/alpha`. Tag matching is case-insensitive.

Markdown frontmatter aliases participate in search, link resolution, and
backlinks:

```yaml
---
aliases: [Project Roadmap, 产品路线]
---
```

Both `[[Project Roadmap]]` and `[[产品路线]]` resolve to that file. Real file
names take precedence if an alias collides with another Markdown filename.

Heading fragments are preserved during link resolution, so links such as
`[[Project Roadmap#Milestones]]`, `[Milestones](./roadmap.md#milestones)`, and
same-file `#Heading` links can navigate to stable Markdown heading IDs.

Browser code that only needs Markdown parsing helpers can use the dedicated
browser-safe entry without pulling in the Node.js file runtime:

```ts
import { markdownHeadingSlug } from "@eidos.space/file-space/markdown"
```
