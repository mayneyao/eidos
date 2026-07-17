# Build a Base editor with the runtime

This guide builds the complete path from a local `.base` file to an editable React surface. `@eidos.space/base` owns data semantics; `@eidos.space/base-ui` owns the shared editing experience. Your host owns files, Workers, permissions, recovery, and saving.

## Architecture and package responsibilities

```text
local .base file
  → host file adapter
  → Worker-owned SQLite connection
  → @eidos.space/base
  → BaseEditorDataSource messages
  → @eidos.space/base-ui
  → your editor shell and save controls
```

| Layer                  | Responsibility                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `@eidos.space/base`    | Validate the format; query and mutate rows; manage fields, relations, Formula, Lookup, views, and CSV                 |
| `@eidos.space/base-ui` | Render Grid, Gallery, Kanban, field controls, record inspectors, query controls, and custom view renderers            |
| SQLite driver          | Implement `BaseConnection` for `better-sqlite3`, SQLite WASM, or another synchronous SQLite engine                    |
| Host application       | Open files, run the Worker, track dirty state, recover edits, resolve assets, and save or download the final database |

Do not duplicate Base schema rules in the UI or file adapter. A compatible editor routes every query and mutation through the runtime.

## Install

```bash
pnpm add @eidos.space/base
```

For Node.js or Electron with `better-sqlite3`:

```bash
pnpm add @eidos.space/base better-sqlite3
```

React hosts can add the shared editor separately:

```bash
pnpm add @eidos.space/base-ui react react-dom
```

Browser hosts also need a SQLite WASM implementation. The examples below use:

```bash
pnpm add @sqlite.org/sqlite-wasm
```

## Suggested project structure

```text
src/base/
├── runtime.worker.ts      opens SQLite and owns BaseRuntime
├── worker-client.ts       typed request/response client
├── file-session.ts        open, permission, fingerprint, save, recovery
├── editor-source.ts       BaseEditorDataSource adapter
├── editor.tsx             tables, views, query toolbar, editor surface
└── custom-views/          optional host renderers
```

Keep the SQLite connection and `BaseRuntime` alive for the whole editing session. A cell edit should update the working database, not reimport or rewrite the entire file.

## Create a Base in Node.js

The optional `better-sqlite3` entry point opens real files and returns a `BaseRuntime`.

```ts
import { createBaseFile } from "@eidos.space/base/better-sqlite3"

const base = createBaseFile("./projects.base", {
  title: "Projects",
  defaultTable: { name: "Projects" },
})

const table = base.listTables()[0]

base.addField(table.id, {
  name: "Status",
  columnName: "status",
  type: "select",
  property: {
    options: [
      { value: "Planned", color: "gray" },
      { value: "Active", color: "blue" },
      { value: "Done", color: "green" },
    ],
  },
})

base.insertRow(table.id, {
  title: "Publish Base documentation",
  status: "Active",
})

base.close()
```

`createBaseFile` refuses to overwrite a non-empty file and requires the `.base` extension.

## Open and query a Base

```ts
import { openBaseFile } from "@eidos.space/base/better-sqlite3"

const base = openBaseFile("./projects.base")
const table = base.listTables()[0]

const page = base.getRowPage(table.id, 0, 100, {
  search: "documentation",
  sorts: [{ field: "status", direction: "asc" }],
})

console.log(page.total, page.rows)
base.close()
```

Pages are limited to 500 records. Reuse `page.total` as `totalHint` for the next page and pass `page.nextCursor` when present. The runtime can then avoid repeated counts and use cursor paging where the query permits it.

## Edit records and schema

```ts
const row = base.insertRow(table.id, { title: "New project" })

base.updateRow(table.id, String(row._id), {
  status: "Planned",
})

base.updateField(table.id, "status", {
  name: "Project status",
})

base.deleteRow(table.id, String(row._id))
```

Use runtime methods for schema changes. They keep physical SQLite columns and Base metadata consistent, normalize JSON-array values, and reject writes to system or derived fields.

Multi-step schema and batch operations run in SQLite transactions. Keep the in-memory runtime open while the user is editing; do not reopen the entire file for every cell change.

## Provide a SQLite driver

The core package does not depend on Node.js. A driver implements this synchronous connection contract:

```ts
import type { BaseRunResult, BaseSqlParams } from "@eidos.space/base"

interface BaseConnection {
  exec(sql: string): void
  query<T extends object>(sql: string, params?: BaseSqlParams): T[]
  get<T extends object>(sql: string, params?: BaseSqlParams): T | undefined
  run(sql: string, params?: BaseSqlParams): BaseRunResult
  runMany?(sql: string, parameterSets: readonly BaseSqlParams[]): void
  transaction<T>(operation: () => T): T
  close?(): void
}
```

Construct the runtime after your driver has opened and validated a SQLite database:

```ts
import { BaseRuntime, validateBase } from "@eidos.space/base"

const connection = createMySQLiteConnection()
const result = validateBase(connection)
if (!result.valid) throw new Error("Not a valid Base file")

const base = new BaseRuntime(connection, true)
```

The second constructor argument tells the runtime to close the connection when `base.close()` runs.

## Browser architecture

SQLite work should not run on the React main thread. A browser host should use this boundary:

```text
FileSystemFileHandle or imported File
  → private working copy (OPFS or memory)
  → Web Worker
  → SQLite WASM driver implementing BaseConnection
  → BaseRuntime
  → page and mutation messages
  → React UI
```

The Base Web Editor uses a Worker and SQLite WASM. It keeps a working database open for incremental edits, pages rows instead of refetching the whole table, and writes a consistent database image only when the user saves.

### Implement `BaseConnection` inside the Worker

SQLite WASM's OO1 API maps directly to the runtime contract. The essential methods look like this:

```ts
import type {
  BaseConnection,
  BaseRunResult,
  BaseSqlParams,
} from "@eidos.space/base"
import type sqlite3InitModule from "@sqlite.org/sqlite-wasm"

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>
type SqliteDatabase = InstanceType<Sqlite3["oo1"]["DB"]>

export class SQLiteWasmConnection implements BaseConnection {
  constructor(private readonly db: SqliteDatabase) {}

  exec(sql: string) {
    this.db.exec(sql)
  }

  query<T extends object>(sql: string, params: BaseSqlParams = []) {
    return this.db.selectObjects(sql, params) as T[]
  }

  get<T extends object>(sql: string, params: BaseSqlParams = []) {
    return this.query<T>(sql, params)[0]
  }

  run(sql: string, params: BaseSqlParams = []): BaseRunResult {
    const statement = this.db.prepare(sql)
    try {
      if (params.length) statement.bind(params)
      statement.step()
    } finally {
      statement.finalize()
    }
    const lastInsertRowid = this.db.selectValue("SELECT last_insert_rowid()")
    return {
      changes: this.db.changes(),
      lastInsertRowid:
        typeof lastInsertRowid === "number" ||
        typeof lastInsertRowid === "bigint"
          ? lastInsertRowid
          : 0,
    }
  }

  transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE")
    try {
      const result = operation()
      this.db.exec("COMMIT")
      return result
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
  }

  close() {
    this.db.close()
  }
}
```

A production driver should also implement `runMany` and nested transactions with SQLite savepoints. Normalize `ArrayBuffer` and typed-array results to `Uint8Array`, because `BaseSqlPrimitive` uses `Uint8Array` for binary values.

### Open once, then expose small Worker actions

After importing the file into an OPFS or in-memory working database, validate it and create one runtime:

```ts
import { BaseRuntime, validateBase } from "@eidos.space/base"

const connection = new SQLiteWasmConnection(database)
connection.exec(
  "PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL;"
)

const validation = validateBase(connection)
if (!validation.valid) {
  throw new Error(validation.errors.map((issue) => issue.message).join("; "))
}

const runtime = new BaseRuntime(connection, true)
```

Keep the message protocol semantic. The UI should request pages and mutations, not arbitrary SQL:

```ts
import type {
  BaseFieldPlacement,
  BaseRow,
  BaseRowPageProjection,
  BaseRowQuery,
  CreateBaseFieldInput,
  UpdateBaseFieldInput,
  UpdateBaseViewInput,
} from "@eidos.space/base"

type WorkerAction =
  | { type: "snapshot" }
  | {
      type: "page"
      tableId: string
      offset: number
      limit: number
      query: BaseRowQuery
      totalHint?: number
      cursor?: string
      projection?: BaseRowPageProjection
    }
  | { type: "row"; tableId: string; rowId: string }
  | {
      type: "group-counts"
      tableId: string
      columnName: string
      query: BaseRowQuery
    }
  | { type: "insert-row"; tableId: string; row: BaseRow }
  | { type: "update-row"; tableId: string; rowId: string; changes: BaseRow }
  | {
      type: "update-field"
      tableId: string
      columnName: string
      changes: UpdateBaseFieldInput
    }
  | {
      type: "add-field"
      tableId: string
      field: CreateBaseFieldInput
      placement?: BaseFieldPlacement
    }
  | { type: "delete-field"; tableId: string; columnName: string }
  | { type: "update-view"; viewId: string; changes: UpdateBaseViewInput }
  | { type: "export" }
```

Build snapshots from runtime metadata rather than exposing the connection:

```ts
function snapshot(path: string, runtime: BaseRuntime): BaseSnapshot {
  return {
    path,
    metadata: runtime.info(),
    tables: runtime.listTables().map((table) => ({
      table,
      fields: runtime.listFields(table.id),
      views: runtime.listViews(table.id),
      rowCount: runtime.countRows(table.id),
    })),
  }
}
```

The File System Access API can write back to an authorized original file in Chromium-based browsers. A host without a persistent file handle must describe saving as download or Save As, never as replacement of the original.

## Adapt the runtime for Base UI

`@eidos.space/base-ui` consumes a small asynchronous `BaseEditorDataSource`. This is intentionally different from the synchronous SQLite connection: the data source can cross a Worker or IPC boundary.

```ts
interface BaseEditorDataSource {
  getSnapshot(): Promise<BaseSnapshot>
  getPage(
    tableId,
    offset,
    limit,
    query,
    totalHint?,
    cursor?,
    projection?
  ): Promise<BaseRowPage>
  insertRow(tableId, row): Promise<BaseRowMutationResult>
  updateRow(tableId, rowId, changes): Promise<BaseRowMutationResult>
  updateField(tableId, columnName, changes): Promise<BaseSnapshot>
  addField(tableId, field, placement?): Promise<BaseSnapshot>
  deleteField(tableId, columnName): Promise<BaseSnapshot>
  updateView(viewId, changes): Promise<BaseSnapshot>
}
```

Keep this adapter thin. Query compilation, field conversions, grouping, and derived-field behavior belong in `@eidos.space/base`, not in React.

### Make the Worker client the data source

The main-thread client can implement `BaseEditorDataSource` directly. A single typed `call` method correlates requests and responses; each public method maps to one semantic Worker action.

```ts
import type {
  BaseFieldPlacement,
  BaseRow,
  BaseRowGroupCount,
  BaseRowMutationResult,
  BaseRowPage,
  BaseRowPageProjection,
  BaseRowQuery,
  BaseSnapshot,
  CreateBaseFieldInput,
  UpdateBaseFieldInput,
  UpdateBaseViewInput,
} from "@eidos.space/base"
import type { BaseEditorDataSource } from "@eidos.space/base-ui"

export class WorkerBaseSource implements BaseEditorDataSource {
  constructor(private readonly call: <T>(action: WorkerAction) => Promise<T>) {}

  getSnapshot() {
    return this.call<BaseSnapshot>({ type: "snapshot" })
  }

  getPage(
    tableId: string,
    offset: number,
    limit: number,
    query: BaseRowQuery,
    totalHint?: number,
    cursor?: string,
    projection?: BaseRowPageProjection
  ) {
    return this.call<BaseRowPage>({
      type: "page",
      tableId,
      offset,
      limit,
      query,
      totalHint,
      cursor,
      projection,
    })
  }

  getRow(tableId: string, rowId: string) {
    return this.call<BaseRow | null>({ type: "row", tableId, rowId })
  }

  getGroupCounts(tableId: string, columnName: string, query: BaseRowQuery) {
    return this.call<BaseRowGroupCount[]>({
      type: "group-counts",
      tableId,
      columnName,
      query,
    })
  }

  insertRow(tableId: string, row: BaseRow) {
    return this.call<BaseRowMutationResult>({
      type: "insert-row",
      tableId,
      row,
    })
  }

  updateRow(tableId: string, rowId: string, changes: BaseRow) {
    return this.call<BaseRowMutationResult>({
      type: "update-row",
      tableId,
      rowId,
      changes,
    })
  }

  updateField(
    tableId: string,
    columnName: string,
    changes: UpdateBaseFieldInput
  ) {
    return this.call<BaseSnapshot>({
      type: "update-field",
      tableId,
      columnName,
      changes,
    })
  }

  addField(
    tableId: string,
    field: CreateBaseFieldInput,
    placement?: BaseFieldPlacement
  ) {
    return this.call<BaseSnapshot>({
      type: "add-field",
      tableId,
      field,
      placement,
    })
  }

  deleteField(tableId: string, columnName: string) {
    return this.call<BaseSnapshot>({
      type: "delete-field",
      tableId,
      columnName,
    })
  }

  updateView(viewId: string, changes: UpdateBaseViewInput) {
    return this.call<BaseSnapshot>({ type: "update-view", viewId, changes })
  }
}
```

`getRow` enables complete record inspectors. `getGroupCounts` enables Kanban without downloading all records. They are optional in the interface, but provide them for feature-complete built-in views.

In the Worker, return a `BaseRowMutationResult` after inserts and updates:

```ts
import type { BaseRow, BaseRowMutationResult } from "@eidos.space/base"

function mutationResult(tableId: string, row: BaseRow): BaseRowMutationResult {
  return {
    tableId,
    row,
    rowCount: runtime.countRows(tableId),
    revision: runtime.info().updatedAt,
  }
}
```

## Assemble the React editor

The shared package separates the shell from the renderer. Your host owns active table/view selection and save controls, while `BaseEditorView` owns the active Grid, Gallery, Kanban, or custom view.

```tsx
import { useMemo, useState } from "react"
import type { BaseSnapshot, UpdateBaseViewInput } from "@eidos.space/base"
import {
  BaseEditorContent,
  BaseEditorRoot,
  BaseEditorView,
  BaseEditorWorkbar,
  BaseQueryToolbar,
  BaseSheetTabStrip,
  BaseUIProvider,
  BaseViewTabStrip,
  type BaseEditorDataSource,
} from "@eidos.space/base-ui"
import "@eidos.space/base-ui/styles.css"

export function BaseEditor({
  source,
  initialSnapshot,
}: {
  source: BaseEditorDataSource
  initialSnapshot: BaseSnapshot
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [tableId, setTableId] = useState<string>(
    initialSnapshot.metadata.defaultTableId ??
      initialSnapshot.tables[0]!.table.id
  )
  const [viewByTable, setViewByTable] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")
  const [dirty, setDirty] = useState(false)

  const table = snapshot.tables.find((item) => item.table.id === tableId)!
  const view = useMemo(() => {
    const requested = viewByTable[table.table.id]
    return (
      table.views.find((item) => item.id === requested) ??
      table.views.find((item) => item.type === "grid") ??
      table.views[0]
    )
  }, [table, viewByTable])

  async function updateView(changes: UpdateBaseViewInput) {
    if (!view) return
    setSnapshot(await source.updateView(view.id, changes))
    setDirty(true)
  }

  return (
    <BaseUIProvider themeName="light">
      <BaseEditorRoot>
        <BaseEditorWorkbar>
          <BaseViewTabStrip
            views={table.views}
            activeViewId={view?.id}
            onSelect={(id) =>
              setViewByTable((current) => ({
                ...current,
                [table.table.id]: id,
              }))
            }
          />
          <BaseQueryToolbar
            fields={table.fields}
            filter={view?.filter ?? null}
            sorts={view?.sorts ?? []}
            search={search}
            onSearchChange={setSearch}
            onFilterChange={(filter) => updateView({ filter })}
            onSortsChange={(sorts) => updateView({ sorts })}
          />
        </BaseEditorWorkbar>

        <BaseEditorContent>
          <BaseEditorView
            source={source}
            table={table}
            view={view}
            search={search}
            onMutation={() => setDirty(true)}
            onSnapshot={(next) => {
              setSnapshot(next)
              setDirty(true)
            }}
            onError={console.error}
          />
        </BaseEditorContent>

        <BaseSheetTabStrip
          tables={snapshot.tables.map((item) => item.table)}
          activeTableId={table.table.id}
          status={dirty ? "Unsaved changes" : "Saved"}
          onSelect={setTableId}
        />
      </BaseEditorRoot>
    </BaseUIProvider>
  )
}
```

The editor component should fill a container with an explicit height. The built-in renderers virtualize their content inside that container.

## Implement open, dirty, save, and recovery states

Treat file state as a state machine, not a boolean:

```text
empty → opening → clean → dirty → saving → saved
                            ↘ error
                            ↘ conflict
```

Use this save sequence:

1. Read the original file and record a fingerprint such as size and last-modified time.
2. Import bytes into the Worker-owned working database.
3. Mark the session dirty after every successful row, field, or view mutation.
4. Persist a recovery copy in OPFS when possible.
5. On Save, run `PRAGMA integrity_check`, export the working database, and compare the original fingerprint again.
6. If the original changed, stop and offer Reload, Save As, or an explicit overwrite.
7. Write only after permission is granted, then reread the file to verify the write.

In browsers with `FileSystemFileHandle`, Save can target the original file. In fallback browsers, Save must download a new file. Keep failed saves dirty and leave the working database open so the user can retry or Save As.

Do not export the full SQLite file after each cell edit. Edits are incremental inside the working connection; exporting is a user-initiated save boundary.

## Resolve File fields

Base File cells contain references, not uploaded bytes. Supply host resolvers through `BaseUIProvider`:

```tsx
<BaseUIProvider
  themeName={theme}
  resolveAssetUrl={(path) => assetStore.url(path)}
  resolveFilePreview={(path) => previewStore.url(path)}
>
  {editor}
</BaseUIProvider>
```

The host decides whether a reference points to a Space-relative asset, a Blob URL, or an allowed remote URL. Keep that policy outside field renderers.

## Operational checklist

- Validate a file before exposing records.
- Keep SQLite and heavy queries inside a Worker in browsers.
- Page large tables; do not load every row to sort or filter in UI code.
- Keep unsaved edits recoverable after a write failure.
- Detect changes to the original file before overwriting it.
- Close runtimes and release file handles when switching files.
- Preserve unknown view types and properties even when no renderer is installed.

## Next step

Continue with [Build custom views](#/docs/custom-views) to connect a data source to the shared Base UI.
