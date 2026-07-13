# `@eidos.space/base`

Independent runtime for Eidos `.base` files.

A Base is a normal SQLite database containing portable table, field, view, and
relation metadata. The package has no dependency on `@eidos.space/core` or
`@libsql/client`. Its main entry works against a small synchronous connection
interface; the optional `@eidos.space/base/better-sqlite3` entry opens files in
the desktop runtime.

```ts
import { createBaseFile } from "@eidos.space/base/better-sqlite3"

const base = createBaseFile("tasks.base", {
  title: "Tasks",
  defaultTable: { name: "Tasks" },
})

base.insertRow(base.info().defaultTableId!, { title: "Ship Base v1" })
base.close()
```

Files remain valid SQLite databases and can be inspected with ordinary SQLite
tools.

Gallery sort prefixes and Kanban group/sort prefixes use ordinary disposable
SQLite indexes maintained by the view lifecycle. Opening with
`openBaseFile(path, { migrate: true })` repairs missing query indexes; callers
using another connection adapter can invoke `base.optimizeViewQueries()`
explicitly. Indexes accelerate paging but are not Base metadata or user data.
