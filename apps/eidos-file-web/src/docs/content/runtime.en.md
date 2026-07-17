# Build an Eidos File editor with the runtime

This guide builds the complete path from a local `.eidos` file to an editable React surface. `@eidos.space/eidos-file` owns data semantics; `@eidos.space/eidos-file-ui` owns the shared editing experience. Your host owns files, Workers, permissions, recovery, and saving.

## Architecture and package responsibilities

```text
local .eidos file
  → host file adapter
  → Worker-owned SQLite connection
  → @eidos.space/eidos-file
  → EidosFileEditorDataSource messages
  → @eidos.space/eidos-file-ui
  → your editor shell and save controls
```

| Layer                        | Responsibility                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `@eidos.space/eidos-file`    | Validate the format; query and mutate rows; manage fields, relations, Formula, Lookup, views, and CSV                 |
| `@eidos.space/eidos-file-ui` | Render the core Grid, editor controls, plugin slots, and explicitly imported view or workflow plugins                 |
| SQLite driver                | Implement `EidosFileConnection` for `better-sqlite3`, SQLite WASM, or another synchronous SQLite engine               |
| Host application             | Open files, run the Worker, track dirty state, recover edits, resolve assets, and save or download the final database |

Do not duplicate Eidos File schema rules in the UI or file adapter. A compatible editor routes every query and mutation through the runtime.

## Install

```bash
pnpm add @eidos.space/eidos-file
```

For Node.js or Electron with `better-sqlite3`:

```bash
pnpm add @eidos.space/eidos-file better-sqlite3
```

React hosts can add the shared editor separately:

```bash
pnpm add @eidos.space/eidos-file-ui react react-dom
```

Browser hosts also need a SQLite WASM implementation. The examples below use:

```bash
pnpm add @sqlite.org/sqlite-wasm
```

## Suggested project structure

```text
src/eidos-file/
├── runtime.worker.ts      opens SQLite and owns EidosFileRuntime
├── worker-client.ts       typed request/response client
├── file-session.ts        open, permission, fingerprint, save, recovery
├── editor-source.ts       EidosFileEditorDataSource adapter
├── editor.tsx             tables, views, query toolbar, editor surface
└── custom-views/          optional host renderers
```

Keep the SQLite connection and `EidosFileRuntime` alive for the whole editing session. A cell edit should update the working database, not reimport or rewrite the entire file.

## Create an Eidos File in Node.js

The optional `better-sqlite3` entry point opens real files and returns a `EidosFileRuntime`.

```ts
import { createEidosFile } from "@eidos.space/eidos-file/better-sqlite3"

const eidosFile = createEidosFile("./projects.eidos", {
  title: "Projects",
  defaultTable: { name: "Projects" },
})

const table = eidosFile.listTables()[0]

eidosFile.addField(table.id, {
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

eidosFile.insertRow(table.id, {
  title: "Publish Eidos File documentation",
  status: "Active",
})

eidosFile.close()
```

`createEidosFile` refuses to overwrite a non-empty file and requires the `.eidos` extension.

## Open and query an Eidos File

```ts
import { openEidosFile } from "@eidos.space/eidos-file/better-sqlite3"

const eidosFile = openEidosFile("./projects.eidos")
const table = eidosFile.listTables()[0]

const page = eidosFile.getRowPage(table.id, 0, 100, {
  search: "documentation",
  sorts: [{ field: "status", direction: "asc" }],
})

console.log(page.total, page.rows)
eidosFile.close()
```

Pages are limited to 500 records. Reuse `page.total` as `totalHint` for the next page and pass `page.nextCursor` when present. The runtime can then avoid repeated counts and use cursor paging where the query permits it.

## Edit records and schema

```ts
const row = eidosFile.insertRow(table.id, { title: "New project" })

eidosFile.updateRow(table.id, String(row._id), {
  status: "Planned",
})

eidosFile.updateField(table.id, "status", {
  name: "Project status",
})

eidosFile.deleteRow(table.id, String(row._id))
```

Use runtime methods for schema changes. They keep physical SQLite columns and Eidos File metadata consistent, normalize JSON-array values, and reject writes to system or derived fields.

Multi-step schema and batch operations run in SQLite transactions. Keep the in-memory runtime open while the user is editing; do not reopen the entire file for every cell change.

## Provide a SQLite driver

The core package does not depend on Node.js. A driver implements this synchronous connection contract:

```ts
import type {
  EidosFileRunResult,
  EidosFileSqlParams,
} from "@eidos.space/eidos-file"

interface EidosFileConnection {
  exec(sql: string): void
  query<T extends object>(sql: string, params?: EidosFileSqlParams): T[]
  get<T extends object>(sql: string, params?: EidosFileSqlParams): T | undefined
  run(sql: string, params?: EidosFileSqlParams): EidosFileRunResult
  runMany?(sql: string, parameterSets: readonly EidosFileSqlParams[]): void
  transaction<T>(operation: () => T): T
  close?(): void
}
```

Construct the runtime after your driver has opened and validated a SQLite database:

```ts
import { EidosFileRuntime, validateEidosFile } from "@eidos.space/eidos-file"

const connection = createMySQLiteConnection()
const result = validateEidosFile(connection)
if (!result.valid) throw new Error("Not a valid Eidos File")

const eidosFile = new EidosFileRuntime(connection, true)
```

The second constructor argument tells the runtime to close the connection when `eidosFile.close()` runs.

## Browser architecture

SQLite work should not run on the React main thread. A browser host should use this boundary:

```text
FileSystemFileHandle or imported File
  → private working copy (OPFS or memory)
  → Web Worker
  → SQLite WASM driver implementing EidosFileConnection
  → EidosFileRuntime
  → page and mutation messages
  → React UI
```

The Eidos File Web Editor uses a Worker and SQLite WASM. It keeps a working database open for incremental edits, pages rows instead of refetching the whole table, and writes a consistent database image only when the user saves.

### Implement `EidosFileConnection` inside the Worker

SQLite WASM's OO1 API maps directly to the runtime contract. The essential methods look like this:

```ts
import type {
  EidosFileConnection,
  EidosFileRunResult,
  EidosFileSqlParams,
} from "@eidos.space/eidos-file"
import type sqlite3InitModule from "@sqlite.org/sqlite-wasm"

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>
type SqliteDatabase = InstanceType<Sqlite3["oo1"]["DB"]>

export class SQLiteWasmConnection implements EidosFileConnection {
  constructor(private readonly db: SqliteDatabase) {}

  exec(sql: string) {
    this.db.exec(sql)
  }

  query<T extends object>(sql: string, params: EidosFileSqlParams = []) {
    return this.db.selectObjects(sql, params) as T[]
  }

  get<T extends object>(sql: string, params: EidosFileSqlParams = []) {
    return this.query<T>(sql, params)[0]
  }

  run(sql: string, params: EidosFileSqlParams = []): EidosFileRunResult {
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

A production driver should also implement `runMany` and nested transactions with SQLite savepoints. Normalize `ArrayBuffer` and typed-array results to `Uint8Array`, because `EidosFileSqlPrimitive` uses `Uint8Array` for binary values.

### Open once, then expose small Worker actions

After importing the file into an OPFS or in-memory working database, validate it and create one runtime:

```ts
import { EidosFileRuntime, validateEidosFile } from "@eidos.space/eidos-file"

const connection = new SQLiteWasmConnection(database)
connection.exec(
  "PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL;"
)

const validation = validateEidosFile(connection)
if (!validation.valid) {
  throw new Error(validation.errors.map((issue) => issue.message).join("; "))
}

const runtime = new EidosFileRuntime(connection, true)
```

Keep the message protocol semantic. The UI should request pages and mutations, not arbitrary SQL:

```ts
import type {
  EidosFileFieldPlacement,
  EidosFileRow,
  EidosFileRowPageProjection,
  EidosFileRowQuery,
  CreateEidosFileFieldInput,
  UpdateEidosFileFieldInput,
  UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"

type WorkerAction =
  | { type: "snapshot" }
  | {
      type: "page"
      tableId: string
      offset: number
      limit: number
      query: EidosFileRowQuery
      totalHint?: number
      cursor?: string
      projection?: EidosFileRowPageProjection
    }
  | { type: "row"; tableId: string; rowId: string }
  | {
      type: "group-counts"
      tableId: string
      columnName: string
      query: EidosFileRowQuery
    }
  | { type: "insert-row"; tableId: string; row: EidosFileRow }
  | {
      type: "update-row"
      tableId: string
      rowId: string
      changes: EidosFileRow
    }
  | {
      type: "update-field"
      tableId: string
      columnName: string
      changes: UpdateEidosFileFieldInput
    }
  | {
      type: "add-field"
      tableId: string
      field: CreateEidosFileFieldInput
      placement?: EidosFileFieldPlacement
    }
  | { type: "delete-field"; tableId: string; columnName: string }
  | { type: "update-view"; viewId: string; changes: UpdateEidosFileViewInput }
  | { type: "export" }
```

Build snapshots from runtime metadata rather than exposing the connection:

```ts
function snapshot(path: string, runtime: EidosFileRuntime): EidosFileSnapshot {
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

## Adapt the runtime for Eidos File UI

`@eidos.space/eidos-file-ui` consumes a small asynchronous `EidosFileEditorDataSource`. This is intentionally different from the synchronous SQLite connection: the data source can cross a Worker or IPC boundary.

```ts
interface EidosFileEditorDataSource {
  getSnapshot(): Promise<EidosFileSnapshot>
  getPage(
    tableId,
    offset,
    limit,
    query,
    totalHint?,
    cursor?,
    projection?
  ): Promise<EidosFileRowPage>
  calculateColumnStats(
    tableId,
    configs,
    query
  ): Promise<EidosFileColumnStatResult[]>
  insertRow(tableId, row): Promise<EidosFileRowMutationResult>
  updateRow(tableId, rowId, changes): Promise<EidosFileRowMutationResult>
  updateField(tableId, columnName, changes): Promise<EidosFileSnapshot>
  addField(tableId, field, placement?): Promise<EidosFileSnapshot>
  deleteField(tableId, columnName): Promise<EidosFileSnapshot>
  updateView(viewId, changes): Promise<EidosFileSnapshot>
}
```

Keep this adapter thin. Query compilation, field conversions, grouping, and derived-field behavior belong in `@eidos.space/eidos-file`, not in React.

### Make the Worker client the data source

The main-thread client can implement `EidosFileEditorDataSource` directly. A single typed `call` method correlates requests and responses; each public method maps to one semantic Worker action.

```ts
import type {
  EidosFileColumnStatConfig,
  EidosFileColumnStatResult,
  EidosFileFieldPlacement,
  EidosFileRow,
  EidosFileRowGroupCount,
  EidosFileRowMutationResult,
  EidosFileRowPage,
  EidosFileRowPageProjection,
  EidosFileRowQuery,
  EidosFileSnapshot,
  CreateEidosFileFieldInput,
  UpdateEidosFileFieldInput,
  UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"
import type { EidosFileEditorDataSource } from "@eidos.space/eidos-file-ui"

export class WorkerEidosFileSource implements EidosFileEditorDataSource {
  constructor(private readonly call: <T>(action: WorkerAction) => Promise<T>) {}

  getSnapshot() {
    return this.call<EidosFileSnapshot>({ type: "snapshot" })
  }

  getPage(
    tableId: string,
    offset: number,
    limit: number,
    query: EidosFileRowQuery,
    totalHint?: number,
    cursor?: string,
    projection?: EidosFileRowPageProjection
  ) {
    return this.call<EidosFileRowPage>({
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
    return this.call<EidosFileRow | null>({ type: "row", tableId, rowId })
  }

  getGroupCounts(
    tableId: string,
    columnName: string,
    query: EidosFileRowQuery
  ) {
    return this.call<EidosFileRowGroupCount[]>({
      type: "group-counts",
      tableId,
      columnName,
      query,
    })
  }

  calculateColumnStats(
    tableId: string,
    configs: EidosFileColumnStatConfig[],
    query: EidosFileRowQuery
  ) {
    return this.call<EidosFileColumnStatResult[]>({
      type: "column-stats",
      tableId,
      configs,
      query,
    })
  }

  insertRow(tableId: string, row: EidosFileRow) {
    return this.call<EidosFileRowMutationResult>({
      type: "insert-row",
      tableId,
      row,
    })
  }

  updateRow(tableId: string, rowId: string, changes: EidosFileRow) {
    return this.call<EidosFileRowMutationResult>({
      type: "update-row",
      tableId,
      rowId,
      changes,
    })
  }

  updateField(
    tableId: string,
    columnName: string,
    changes: UpdateEidosFileFieldInput
  ) {
    return this.call<EidosFileSnapshot>({
      type: "update-field",
      tableId,
      columnName,
      changes,
    })
  }

  addField(
    tableId: string,
    field: CreateEidosFileFieldInput,
    placement?: EidosFileFieldPlacement
  ) {
    return this.call<EidosFileSnapshot>({
      type: "add-field",
      tableId,
      field,
      placement,
    })
  }

  deleteField(tableId: string, columnName: string) {
    return this.call<EidosFileSnapshot>({
      type: "delete-field",
      tableId,
      columnName,
    })
  }

  updateView(viewId: string, changes: UpdateEidosFileViewInput) {
    return this.call<EidosFileSnapshot>({
      type: "update-view",
      viewId,
      changes,
    })
  }
}
```

`getRow` enables complete record inspectors. `getGroupCounts` enables Kanban without downloading all records. Those two methods are optional in the interface, but provide them for feature-complete built-in views. `calculateColumnStats` is required: Grid forwards the active search, filter, and sort query so the runtime can calculate footer summaries without downloading the table into React.

In the Worker, return a `EidosFileRowMutationResult` after inserts and updates:

```ts
import type {
  EidosFileRow,
  EidosFileRowMutationResult,
} from "@eidos.space/eidos-file"

function mutationResult(
  tableId: string,
  row: EidosFileRow
): EidosFileRowMutationResult {
  return {
    tableId,
    row,
    rowCount: runtime.countRows(tableId),
    revision: runtime.info().updatedAt,
  }
}
```

## Assemble the React editor

The shared package separates the shell from the renderer. Your host owns active table/view selection and save controls, while `EidosFileEditorView` owns Grid routing and resolves Gallery, Kanban, or custom views from explicitly imported Eidos File plugins.

```tsx
import { useMemo, useState } from "react"
import type {
  EidosFileSnapshot,
  UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"
import {
  EidosFileEditorContent,
  EidosFileEditorRoot,
  EidosFileEditorView,
  EidosFileEditorWorkbar,
  EidosFileQueryToolbar,
  EidosFileSheetTabStrip,
  EidosFileUIProvider,
  EidosFileViewTabStrip,
  type EidosFileEditorDataSource,
} from "@eidos.space/eidos-file-ui"
import "@eidos.space/eidos-file-ui/styles.css"

export function EidosFileEditor({
  source,
  initialSnapshot,
}: {
  source: EidosFileEditorDataSource
  initialSnapshot: EidosFileSnapshot
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

  async function updateView(changes: UpdateEidosFileViewInput) {
    if (!view) return
    setSnapshot(await source.updateView(view.id, changes))
    setDirty(true)
  }

  return (
    <EidosFileUIProvider themeName="light">
      <EidosFileEditorRoot>
        <EidosFileEditorWorkbar>
          <EidosFileViewTabStrip
            views={table.views}
            activeViewId={view?.id}
            onSelect={(id) =>
              setViewByTable((current) => ({
                ...current,
                [table.table.id]: id,
              }))
            }
          />
          <EidosFileQueryToolbar
            fields={table.fields}
            filter={view?.filter ?? null}
            sorts={view?.sorts ?? []}
            search={search}
            onSearchChange={setSearch}
            onFilterChange={(filter) => updateView({ filter })}
            onSortsChange={(sorts) => updateView({ sorts })}
          />
        </EidosFileEditorWorkbar>

        <EidosFileEditorContent>
          <EidosFileEditorView
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
        </EidosFileEditorContent>

        <EidosFileSheetTabStrip
          tables={snapshot.tables.map((item) => item.table)}
          activeTableId={table.table.id}
          status={dirty ? "Unsaved changes" : "Saved"}
          onSelect={setTableId}
        />
      </EidosFileEditorRoot>
    </EidosFileUIProvider>
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

Eidos File cells contain references, not uploaded bytes. Supply host resolvers through `EidosFileUIProvider`:

```tsx
<EidosFileUIProvider
  themeName={theme}
  resolveAssetUrl={(path) => assetStore.url(path)}
  resolveFilePreview={(path) => previewStore.url(path)}
>
  {editor}
</EidosFileUIProvider>
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

Continue with [Build custom views](#/docs/custom-views) to connect a data source to the shared Eidos File UI.
