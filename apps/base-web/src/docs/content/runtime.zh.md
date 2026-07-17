# 使用 Runtime 构建 Base 编辑工具

本指南覆盖从本地 `.base` 文件到可编辑 React 界面的完整链路。`@eidos.space/base` 负责数据语义，`@eidos.space/base-ui` 负责共享编辑体验；宿主应用负责文件、Worker、权限、恢复与保存。

## 架构与 Package 职责

```text
本地 .base 文件
  → 宿主文件 adapter
  → Worker 内的 SQLite connection
  → @eidos.space/base
  → BaseEditorDataSource 消息
  → @eidos.space/base-ui
  → 你的编辑器 shell 与保存控件
```

| 层                     | 职责                                                                             |
| ---------------------- | -------------------------------------------------------------------------------- |
| `@eidos.space/base`    | 验证格式；查询和修改记录；管理字段、关系、Formula、Lookup、视图与 CSV            |
| `@eidos.space/base-ui` | 渲染 Grid、Gallery、Kanban、字段控件、记录面板、查询控件与自定义视图             |
| SQLite driver          | 为 `better-sqlite3`、SQLite WASM 或其他同步 SQLite 引擎实现 `BaseConnection`     |
| 宿主应用               | 打开文件、运行 Worker、跟踪 dirty 状态、恢复修改、解析资源并保存或下载最终数据库 |

不要在 UI 或文件 adapter 中复制 Base schema 规则。兼容编辑器应将查询与 mutation 全部交给 runtime。

## 安装

```bash
pnpm add @eidos.space/base
```

在 Node.js 或 Electron 中配合 `better-sqlite3`：

```bash
pnpm add @eidos.space/base better-sqlite3
```

React 宿主可以单独安装共享编辑器：

```bash
pnpm add @eidos.space/base-ui react react-dom
```

浏览器宿主还需要 SQLite WASM。下文示例使用：

```bash
pnpm add @sqlite.org/sqlite-wasm
```

## 推荐项目结构

```text
src/base/
├── runtime.worker.ts      打开 SQLite 并持有 BaseRuntime
├── worker-client.ts       类型化 request/response client
├── file-session.ts        打开、权限、指纹、保存与恢复
├── editor-source.ts       BaseEditorDataSource adapter
├── editor.tsx             数据表、视图、查询工具栏与编辑区
└── custom-views/          可选的宿主 renderer
```

整个编辑会话期间应保持 SQLite connection 与 `BaseRuntime` 打开。Cell 编辑只更新工作数据库，不应重新导入或重写整个文件。

## 在 Node.js 中创建 Base

可选的 `better-sqlite3` 入口可以打开真实文件，并返回 `BaseRuntime`。

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

`createBaseFile` 不会覆盖非空文件，并要求使用 `.base` 扩展名。

## 打开并查询 Base

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

单页最多返回 500 条记录。加载下一页时，可以把 `page.total` 作为 `totalHint` 复用，并在存在时传入 `page.nextCursor`；runtime 可以据此避免重复 count，并在查询允许时使用 cursor 分页。

## 编辑记录与 Schema

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

Schema 修改应使用 runtime 方法。它们会保持物理 SQLite 列与 Base 元数据一致、规范化 JSON array，并拒绝写入系统字段或派生字段。

多步骤 schema 与批量操作在 SQLite 事务中执行。用户编辑期间应保持 runtime 打开；不要为每次 cell 修改重新打开整个文件。

## 提供 SQLite Driver

核心 package 不依赖 Node.js。Driver 只需实现以下同步连接契约：

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

Driver 打开并验证 SQLite 数据库后，即可创建 runtime：

```ts
import { BaseRuntime, validateBase } from "@eidos.space/base"

const connection = createMySQLiteConnection()
const result = validateBase(connection)
if (!result.valid) throw new Error("Not a valid Base file")

const base = new BaseRuntime(connection, true)
```

构造函数的第二个参数表示调用 `base.close()` 时，同时关闭底层连接。

## 浏览器架构

React 主线程不应直接执行 SQLite 与重查询。浏览器宿主应建立以下边界：

```text
FileSystemFileHandle 或导入的 File
  → 私有工作副本（OPFS 或 memory）
  → Web Worker
  → 实现 BaseConnection 的 SQLite WASM driver
  → BaseRuntime
  → 分页与 mutation 消息
  → React UI
```

Base Web Editor 使用 Worker 与 SQLite WASM。编辑期间保持工作数据库打开并增量修改，通过分页避免重新获取整张表，只在用户保存时写出一致的数据库镜像。

### 在 Worker 中实现 `BaseConnection`

SQLite WASM 的 OO1 API 可以直接映射到 runtime 契约，核心方法如下：

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

生产 driver 还应实现 `runMany`，并使用 SQLite savepoint 支持嵌套 transaction。`ArrayBuffer` 与其他 typed array 结果应规范化为 `Uint8Array`，因为 `BaseSqlPrimitive` 使用 `Uint8Array` 表示二进制值。

### 只打开一次，然后暴露小型 Worker Action

将文件导入 OPFS 或内存工作数据库后，先验证，再创建唯一的 runtime：

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

消息协议应表达 Base 语义。UI 请求分页与 mutation，不应执行任意 SQL：

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

Snapshot 应从 runtime 元数据构建，不要将 connection 暴露给 UI：

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

在 Chromium 系浏览器中，File System Access API 可以在获得授权后写回原文件。无法持有文件 handle 的宿主必须将保存描述为下载或另存为，不能假装已经替换原文件。

## 为 Base UI 适配 Runtime

`@eidos.space/base-ui` 使用一个小型异步 `BaseEditorDataSource`。它与同步 SQLite connection 有意分离，因此可以跨越 Worker 或 IPC 边界。

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

这个 adapter 应保持轻量。查询编译、字段转换、分组和派生字段行为属于 `@eidos.space/base`，不应在 React 中重新实现。

### 让 Worker Client 直接成为 Data Source

主线程 client 可以直接实现 `BaseEditorDataSource`。一个类型化 `call` 方法负责关联 request/response，每个公开方法只映射到一个语义明确的 Worker action。

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

`getRow` 让记录面板可以取得完整记录；`getGroupCounts` 让 Kanban 无需下载全部记录即可分组。它们在 interface 中是可选方法，但完整支持内置视图时应实现。

Worker 在 insert 与 update 后应返回 `BaseRowMutationResult`：

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

## 组装 React 编辑器

共享 package 将 editor shell 与 renderer 分开。宿主负责 active table/view 选择与保存控件，`BaseEditorView` 负责当前 Grid、Gallery、Kanban 或自定义视图。

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

编辑器组件应填满一个具有明确高度的容器，内置 renderer 会在该容器中进行虚拟化。

## 实现打开、Dirty、保存与恢复状态

文件状态应使用状态机，而不是单个 boolean：

```text
empty → opening → clean → dirty → saving → saved
                            ↘ error
                            ↘ conflict
```

保存流程应按以下顺序完成：

1. 读取原文件，并记录 size、last-modified time 等指纹。
2. 将 bytes 导入 Worker 内的工作数据库。
3. 每次 row、field 或 view mutation 成功后将会话标记为 dirty。
4. 可用时将恢复副本保存在 OPFS。
5. 保存时运行 `PRAGMA integrity_check`，导出工作数据库，并再次比较原文件指纹。
6. 原文件发生变化时停止写入，并提供重新加载、另存为或明确覆盖。
7. 获得权限后才写入，写入完成后重新读取文件验证结果。

使用 `FileSystemFileHandle` 的浏览器可以保存回原文件；降级浏览器中的保存必须下载新文件。保存失败后保持 dirty，并继续持有工作数据库，让用户可以重试或另存为。

不要在每次 cell 编辑后导出完整 SQLite 文件。编辑发生在工作 connection 内，只有用户触发保存时才导出。

## 解析 File 字段

Base File cell 保存引用，不保存上传的二进制内容。通过 `BaseUIProvider` 提供宿主 resolver：

```tsx
<BaseUIProvider
  themeName={theme}
  resolveAssetUrl={(path) => assetStore.url(path)}
  resolveFilePreview={(path) => previewStore.url(path)}
>
  {editor}
</BaseUIProvider>
```

引用指向 Space 相对资源、Blob URL 或允许的远程 URL，由宿主策略决定；该策略不应写入字段 renderer。

## 运行检查清单

- 暴露记录前先验证文件。
- 在浏览器中将 SQLite 与重查询放入 Worker。
- 对大表进行分页，不要在 UI 中加载全部记录后再排序或筛选。
- 写入失败后仍保留可恢复的未保存修改。
- 覆盖原文件前检测它是否已被外部修改。
- 切换文件时关闭 runtime 并释放文件 handle。
- 即使 renderer 未安装，也要保留未知 view type 与 properties。

## 下一步

继续阅读[构建自定义视图](#/docs/custom-views)，将 data source 接入共享 Base UI。
