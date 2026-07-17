# `@eidos.space/eidos-file`

Independent runtime for Eidos `.eidos` files.

An Eidos File is a normal SQLite database containing portable table, field, view, and
relation metadata. The package has no dependency on `@eidos.space/core` or
`@libsql/client`. Its main entry works against a small synchronous connection
interface; the optional `@eidos.space/eidos-file/better-sqlite3` entry opens files in
the desktop runtime.

```ts
import { createEidosFile } from "@eidos.space/eidos-file/better-sqlite3"

const eidosFile = createEidosFile("tasks.eidos", {
  title: "Tasks",
  defaultTable: { name: "Tasks" },
})

eidosFile.insertRow(eidosFile.info().defaultTableId!, {
  title: "Ship Eidos File v1",
})
eidosFile.close()
```

Files remain valid SQLite databases and can be inspected with ordinary SQLite
tools.

Gallery sort prefixes and Kanban group/sort prefixes use ordinary disposable
SQLite indexes maintained by the view lifecycle. Opening with
`openEidosFile(path, { migrate: true })` repairs missing query indexes; callers
using another connection adapter can invoke `eidosFile.optimizeViewQueries()`
explicitly. Indexes accelerate paging but are not Eidos File metadata or user data.
