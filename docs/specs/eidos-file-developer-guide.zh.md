# Eidos File 开发者快速上手

状态：非规范性开发指南  
适用版本：Eidos 1.0 规范套件与 `@eidos.space/eidos-file` 公开 API

> 本文帮助开发者先跑通 SDK，再理解一次打开、查询、修改和保存背后的数据流。它不新增格式或 API 规则。若示例与英文规范冲突，以对应层的英文规范为准。

## 你会完成什么

读完后，你应该能够：

1. 用 Node.js 创建或打开一个 `.eidos` 文件；
2. 创建表、添加一行、分页查询并观察 revision 变化；
3. 知道普通字段、关系、公式和视图分别保存在哪里；
4. 用正式的 `RuntimeClient` 完成协商、加载 schema、查询和 mutation；
5. 解释“工作库已经提交”和“原文件已经安全保存”的区别；
6. 为 Browser、Desktop 或 React Viewer 选择正确的接入层。

本文使用“阅读清单”作为贯穿示例。

## 先选对 SDK 入口

`@eidos.space/eidos-file` 目前提供两类入口。它们服务于不同复杂度的应用。

| 入口                                | 适合                                                             | 特点                                                      |
| ----------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| `createEidosFile` / `openEidosFile` | Node 脚本、CLI、可信单进程工具                                   | 最快上手；直接返回 `EidosFileRuntime`                     |
| `Runtime.create` / `Runtime.open`   | 新的 Browser/Desktop 产品、跨线程 UI、需要完整保存生命周期的应用 | 使用正式的 `RuntimeClient`、`ConnectionPort` 和 Host 边界 |

建议先跑通便利 API，再阅读正式边界。两者操作的是同一种 Eidos File，但抽象层级不同。

## 五分钟 Node.js 示例

### 1. 安装

```bash
pnpm add @eidos.space/eidos-file better-sqlite3
```

示例使用 Node.js ESM 和 TypeScript。

### 2. 创建文件、表和第一条记录

```ts
import { resolve } from "node:path"

import { createEidosFile } from "@eidos.space/eidos-file/better-sqlite3"

const filePath = resolve("reading-list.eidos")
const runtime = createEidosFile(filePath, {
  title: "我的阅读资料库",
})

try {
  const books = runtime.createTable({
    name: "阅读清单",
    fields: [
      { name: "书名", type: "text", isRecordLabel: true },
      {
        name: "状态",
        type: "select",
        property: {
          options: [
            { name: "想读", color: "gray" },
            { name: "阅读中", color: "blue" },
            { name: "已读", color: "green" },
          ],
        },
      },
      { name: "页数", type: "integer" },
      { name: "已读", type: "checkbox" },
      { name: "开始日期", type: "date" },
    ],
  })

  const beforeInsert = runtime.info().revision

  const book = runtime.insertRow(books.id, {
    书名: "献给阿尔吉侬的花束",
    状态: "阅读中",
    页数: 320,
    已读: false,
    开始日期: "2026-07-01",
  })

  console.log({
    rowId: book._id,
    beforeInsert,
    afterInsert: runtime.info().revision,
  })
} finally {
  runtime.close()
}
```

首次运行时，逻辑 revision 大致这样变化：

```text
创建空文件          revision 0
创建“阅读清单”表    revision 1
新增第一条记录      revision 2
```

每个成功且确实改变内容的逻辑 mutation 只让 revision 增加一次。事务失败时，表数据、元数据和 revision 会一起回滚。

`createEidosFile` 要求目标不存在或为空，不会把已有文件当空白模板覆盖。

### 3. 再次打开并查询

```ts
import { resolve } from "node:path"

import { openEidosFile } from "@eidos.space/eidos-file/better-sqlite3"

const runtime = openEidosFile(resolve("reading-list.eidos"), {
  readonly: true,
})

try {
  const table = runtime
    .listTables()
    .find((candidate) => candidate.name === "阅读清单")

  if (!table) throw new Error("没有找到阅读清单")

  const fields = runtime.listFields(table.id)
  const wanted = fields
    .filter((field) => ["书名", "状态", "页数"].includes(field.name))
    .map((field) => field.id)

  const page = runtime.queryRows(table.id, {
    fields: wanted,
    limit: 20,
  })

  for (const row of page.rows) {
    console.log(row.id, row.fields)
  }
} finally {
  runtime.close()
}
```

`queryRows` 返回稳定的 Row ID，以及以 Field ID 为 key 的逻辑值。便利写入 API 可以接受字段名，读取结果仍鼓励使用稳定 ID。改字段名后，调用方只要继续持有 Field ID，就不需要猜新的名字。

### 4. 先验证，再处理外部文件

```ts
import { inspectEidosFile } from "@eidos.space/eidos-file/better-sqlite3"

const report = inspectEidosFile("reading-list.eidos")

if (!report.valid) {
  console.error(report.errors)
  process.exitCode = 1
}
```

`openEidosFile` 本身也会验证文件。`inspectEidosFile` 更适合导入队列、CLI 检查器或错误报告流程，因为它不会返回一个可写 Runtime。

### 便利 API 的边界

`EidosFileRuntime` 很适合可信的单进程工具。它直接拥有 SQLite connection，mutation 提交后，目标数据库已经改变。

它不是完整的 Eidos Adapter / Host 保存生命周期。生产级 Browser/Desktop 产品还要处理：

- 私有工作库；
- 文件权限和 writer lease；
- 原文件被外部替换时的冲突；
- 保存前恢复副本；
- 原子替换或明确降级；
- 发布后的摘要和重新打开验证。

这些需求对应下面的正式 Runtime 接入方式。

## 先建立底层心智模型

Eidos 1.0 分成四层：

```text
你的 UI / 业务代码
       │
       │ RuntimeClient：表、字段、查询、公式、mutation
       ▼
Runtime：唯一解释逻辑语义的层
       │
       │ ConnectionPort：受限、带类型的 SQLite 操作
       ▼
Adapter：Browser WASM 或 Desktop better-sqlite3
       │
       ▼
私有 SQLite 工作库

可信 Host ──权限 / 恢复 / 冲突 / 保存──► 正式 .eidos 文件
```

这里有四个经常混淆的对象：

| 对象                | 它是什么                                   | 谁可以持有                |
| ------------------- | ------------------------------------------ | ------------------------- |
| source              | 用户选中的原始 `.eidos` 文件               | Host                      |
| working database    | 当前会话实际查询和修改的私有 SQLite 数据库 | Adapter 与 Runtime        |
| `RuntimeClient`     | UI 和业务代码使用的逻辑 API                | 可信 UI，或经过约束的代理 |
| `RuntimeHostBridge` | 生成发布快照、分配文件条目的窄接口         | 仅可信 Host               |

正式产品中，UI 不接收路径、原始 SQLite connection 或 `RuntimeHostBridge`。Runtime 也不会自己打开路径、弹权限框或覆盖文件。

## 打开一个文件，背后发生了什么

### 打开流程

```text
1. Host 读取 source，并记录它的身份与内容摘要
2. Host/Adapter 建立可写的私有 working database
3. Adapter 把 working database 包装成 ConnectionPort
4. Runtime.open 验证 Eidos File，再建立 Runtime service
5. 调用方 negotiate，确认版本、能力和限制
6. 调用方读取 snapshot 和与该 revision 绑定的 schema
7. UI 才开始请求行数据
```

关键点是：`Runtime.open` 接收的是 `ConnectionPort`，不是文件路径。把 source 复制到工作库、授予权限和决定如何保存，都是 Host 的责任。

### Desktop ConnectionPort 示例

下面假设可信 Host 已经准备好 `workingPath`。为了简化示例，没有包含恢复、锁和最终发布。

```ts
import { randomBytes } from "node:crypto"
import { performance } from "node:perf_hooks"

import Database from "better-sqlite3"
import {
  Runtime,
  type CancellationPort,
  type RequestContext,
  type RuntimeEnvironment,
} from "@eidos.space/eidos-file"
import { BetterSqlite3ConnectionPort } from "@eidos.space/eidos-file/better-sqlite3"

const cancellation: CancellationPort = {
  cancelled: () => false,
  onCancel: () => () => undefined,
}

const environment: RuntimeEnvironment = {
  clock: {
    nowInstant: () => new Date().toISOString(),
    nowMilliseconds: () => performance.now(),
  },
  entropy: {
    randomBytes: (length) => Uint8Array.from(randomBytes(length)),
  },
}

let requestSequence = 0
const context = (label: string): RequestContext => ({
  requestId: `${label}-${++requestSequence}`,
  deadlineMilliseconds: 30_000,
})

const workingPath = process.env.EIDOS_WORKING_PATH
if (!workingPath) throw new Error("请设置 EIDOS_WORKING_PATH")

const database = new Database(workingPath, {
  fileMustExist: true,
})
const connection = new BetterSqlite3ConnectionPort(database)

const { service: runtime, hostBridge } = await Runtime.open(
  connection,
  environment,
  "readwrite",
  { cancellation, deadlineMilliseconds: 30_000 }
)
```

`BetterSqlite3ConnectionPort` 会建立必要的 SQLite 安全设置和能力探测。Browser 对应实现是 `SQLiteWasmConnectionPort`，并应放在 Dedicated Worker 中。

### 为什么第一步是 negotiate

```ts
const negotiated = await runtime.negotiate(
  { protocol: "eidos-runtime", versions: ["1.0"] },
  context("negotiate")
)

if (!negotiated.capabilities.readRows) {
  throw new Error("当前 Runtime 不能读取行")
}

console.log(negotiated.limits.pageSizeMax)
```

不要根据平台名称猜能力。CSV、schema mutation、撤销、事件或 Formula preview 都可能是可选能力。请求大小、页大小和并发资源也必须服从协商结果。

### snapshot 只给概要，不会塞入整份 schema

```ts
const snapshot = await runtime.getSnapshot({}, context("snapshot"))

console.log({
  fileId: snapshot.fileId,
  revision: snapshot.revision,
  title: snapshot.title,
  counts: snapshot.schemaCounts,
})
```

接着按页读取同一 revision 的 schema：

```ts
import type {
  FieldDescriptor,
  SchemaDescriptor,
  TableDescriptor,
} from "@eidos.space/eidos-file"

const objects: SchemaDescriptor[] = []
let cursor: string | undefined

do {
  const page = await runtime.getSchemaPage(
    {
      revision: snapshot.revision,
      limit: Math.min(100, negotiated.limits.schemaPageSizeMax),
      ...(cursor ? { cursor } : {}),
    },
    context("schema-page")
  )

  objects.push(...page.objects)
  cursor = page.nextCursor ?? undefined
} while (cursor)

const table = objects.find(
  (object): object is TableDescriptor =>
    object.object === "table" && object.name === "阅读清单"
)

if (!table) {
  throw new Error("没有找到阅读清单")
}

const fields = objects.filter(
  (object): object is FieldDescriptor =>
    object.object === "field" && object.tableId === table.id
)
```

schema 对象包含 Table、Field、View 和 feature。每一页都绑定 File ID 与 revision；revision 改变后，不要把旧页和新页拼在一起。

## 查询数据的数据流

找到字段后，只请求当前功能需要的 projection：

```ts
const titleField = fields.find((field) => field.name === "书名")
const statusField = fields.find((field) => field.name === "状态")
const pagesField = fields.find((field) => field.name === "页数")

if (!titleField || !statusField || !pagesField) {
  throw new Error("示例字段不完整")
}

const projection = {
  fields: [titleField.id, statusField.id, pagesField.id],
  resolveRelations: [],
}

const firstPage = await runtime.queryRows(
  {
    tableId: table.id,
    query: {
      sort: [
        {
          fieldId: titleField.id,
          direction: "asc",
          nulls: "last",
        },
      ],
    },
    projection,
    limit: Math.min(50, negotiated.limits.pageSizeMax),
  },
  context("query-books")
)

for (const row of firstPage.rows) {
  const valuesByField = Object.fromEntries(
    firstPage.columns.map((column, index) => [
      column.fieldId,
      row.values[index],
    ])
  )
  console.log(row.id, valuesByField)
}
```

结果采用 columnar shape：`columns[n]` 描述 `row.values[n]`。这样一页只发送一次字段描述，适合跨 Worker 传输和大表分页。

如果 `nextCursor` 非空，下一页必须复用相同的 Table、query 和 projection，并原样传回 cursor。cursor 是 Runtime 生成的 opaque 值，不能解析或跨 revision 复用。

公式、查找和关系解析都由 Runtime 在查询时完成。UI 不应收到结果后再实现一套自己的权威排序、公式或空值规则。

## 添加一行时，数据怎样变化

### SDK 调用

正式 Runtime API 使用 Field ID 写值，并要求调用方带上自己看到的 revision：

```ts
const beforeMutation = await runtime.getSnapshot(
  {},
  context("before-create-row")
)

const result = await runtime.mutateRows(
  {
    tableId: table.id,
    expectedRevision: beforeMutation.revision,
    returning: projection,
    changes: [
      {
        kind: "create",
        clientKey: "new-book-1",
        values: {
          [titleField.id]: "献给阿尔吉侬的花束",
          [statusField.id]: "阅读中",
          // Runtime 1.0 的公开边界用十进制字符串表示 Integer。
          [pagesField.id]: "320",
        },
      },
    ],
  },
  context("create-book")
)

const rowId = result.created.find(
  (entry) => entry.clientKey === "new-book-1"
)?.rowId

console.log({
  rowId,
  revision: result.revision,
  returnedRows: result.returnedRows,
})
```

`clientKey` 只用于把本地草稿和 Runtime 分配的 Row ID 对应起来，不是持久化记录身份。

### Runtime 内部顺序

```text
App
 │ mutateRows(expectedRevision, Field-ID values)
 ▼
Runtime
 │ 1. 检查 capability、request 大小、Table/Field/Row 身份
 │ 2. 比较 expectedRevision 和当前 revision
 │ 3. 验证逻辑类型、null、列表、关系与字段可写性
 │ 4. 开启一个 write transaction
 │ 5. 分配 Row ID 与统一时间
 │ 6. 写用户表，并执行关系/约束检查
 │ 7. 若确实改变内容，让 eidos__meta.revision 增加一次
 │ 8. 生成 returning projection
 │ 9. COMMIT；任一步失败则整体 ROLLBACK
 ▼
MutationResult(new revision, created Row ID, returned rows)
```

若启用了跨线程 transport commit barrier，Runtime 会在 SQLite COMMIT 前准备一份可用于“提交结果不确定”时核对的 receipt。它解决的是 Worker/进程中断时“到底提交了没有”，不是把 working database 发布回 source。

### SQLite 里实际改变了什么

假设没有名称碰撞，“阅读清单”会是一张可直接查看的用户表。新增行后，它大致包含：

```text
阅读清单
├── _id           新分配的稳定 Row ID
├── _created_at   本次 mutation 的统一 UTC 时间
├── _updated_at   新记录与 created_at 相同
├── 书名          "献给阿尔吉侬的花束"
├── 状态          "阅读中"
└── 页数          INTEGER 320
```

同时，`eidos__meta.revision` 从旧值变成新值，文件更新时间随同一 mutation 更新。

没有发生这些事：

- 不会为 Gallery、Kanban 或另一个 View 复制一行；
- 不会把 Formula、Lookup 或反向 Relation 结果写成第二份权威值；
- 不会把 resolved Relation label 写回关系列；
- 不会把缓存当作新的事实来源。

关系字段的原始列保存有顺序的目标 Row ID 列表。Multi-select 和 File 也使用规范化列表表示。Formula、Lookup 和反向 Relation 是 virtual Field，没有对应的普通用户列。

### 为什么需要 expectedRevision

它是乐观并发控制。调用方说：“我基于 revision 7 做这次修改。”如果 Runtime 已经到 revision 8，它返回 `stale-revision`，而不是把旧编辑盲目覆盖到新状态。

处理方式是重新获取 snapshot 和受影响记录，让用户或业务规则决定是否重做。Mutation 不能因为 `retryable` 就自动重放。

## 创建表或改 schema：为什么要分两步

行 mutation 可以直接验证。schema 变化可能影响公式、关系、视图或大量已有值，所以正式 API 先 preflight，再 apply。

### 创建表

```ts
const current = await runtime.getSnapshot({}, context("before-schema"))

const plan = await runtime.preflightSchema(
  {
    expectedRevision: current.revision,
    change: {
      kind: "create-table",
      clientKey: "books-table",
      name: "阅读清单",
      position: "0",
      fields: [
        {
          clientKey: "title-field",
          name: "书名",
          kind: "text",
          position: "0",
        },
        {
          clientKey: "status-field",
          name: "状态",
          kind: "select",
          position: "1",
          settings: {
            options: [
              { name: "想读", color: "gray" },
              { name: "阅读中", color: "blue" },
              { name: "已读", color: "green" },
            ],
          },
        },
        {
          clientKey: "pages-field",
          name: "页数",
          kind: "integer",
          position: "2",
        },
      ],
      labelFieldClientKey: "title-field",
    },
  },
  context("plan-create-table")
)

if (plan.classification === "forbidden") {
  throw new Error(plan.warnings.map((warning) => warning.message).join("; "))
}

const applied = await runtime.mutateSchema(
  {
    expectedRevision: current.revision,
    planToken: plan.planToken,
    actionsHash: plan.actionsHash,
  },
  context("apply-create-table")
)

const tableId = applied.createdObjects.find(
  (object) =>
    object.object === "table" &&
    "clientKey" in object &&
    object.clientKey === "books-table"
)?.id
```

`planToken` 绑定当前 File、revision 和 exact change。revision 变化、token 过期或请求内容改变后，要重新 preflight。

`create-table` 可以直接包含普通字段和 Formula，但 Relation 与 Lookup 要在目标对象已经存在后通过单独 schema change 建立。精确 Runtime 层也不会自动替新表创建默认 View；需要时再用 `mutateView` 明确创建。

### 改名时发生什么

字段改名的 plan 会收集依赖。apply 时：

- Field ID 不变；
- Relation、Lookup 和 View 继续引用同一个 Field ID；
- Formula 中真正的字段引用按语法重写；
- 需要时重命名普通 SQLite 列；
- 所有动作在同一个逻辑 mutation 中完成，revision 只增加一次；
- 任一依赖无法安全处理时，整体回滚。

这就是上层代码应保存稳定 ID，而不是把显示名称当永久 key 的原因。

### 有损转换

preflight 的 classification 只有四类：

- `metadata-only`：只改元数据；
- `lossless-rewrite`：需要改写，但不丢语义；
- `explicit-lossy`：会丢失或合并值；
- `forbidden`：不能执行。

只有向用户明确展示影响后，`explicit-lossy` 才能带 `confirmLossy: true` apply。不要根据 SQLite 的自动类型转换自行判断安全性。

## working database 提交，不等于 source 已保存

这是 Eidos 集成最重要的边界。

`mutateRows` 成功表示：当前 Runtime 的 working database 已经提交了一个新逻辑 revision。它不自动证明用户最初选择的 source 已经被安全替换。

完整状态通常是：

```text
ready-clean
    │ mutateRows / mutateSchema / mutateView
    ▼
ready-dirty
    │ Host 创建冻结发布快照
    ▼
publishing
    │ 验证目标未变化 + 写入 + 摘要/重开验证
    ├──► ready-clean
    ├──► conflict
    └──► recovery-required
```

### Host 怎样取得候选文件

可信 Host 使用 `hostBridge` 从 exact revision 创建冻结的 main-database snapshot：

```ts
const publication = await hostBridge.createPublicationSnapshot(
  { maxBytes: String(512 * 1024 * 1024) },
  context("publication-snapshot")
)

try {
  console.log(publication.fileId, publication.revision)
  // publication.bytes 是分块读取的 ByteSource。
  // Host 在这里执行 Save Copy，或完整的安全覆盖发布流程。
} finally {
  await publication.release()
}
```

发布候选只包含单个自洽的 SQLite main database。WAL、锁、working database、恢复记录和缓存都不是交换文件的一部分。

生产 Host 在覆盖原文件前还要：

1. 保存并验证恢复候选；
2. 在 writer lease 下重新检查 source 身份和内容 token；
3. 优先写临时文件并做原子替换；
4. 平台不支持原子替换时明确降级，执行 recovery-before-write；
5. 关闭后重新读取目标，核对摘要和 Eidos validity；
6. 只有验证成功后才清理恢复记录并报告 clean。

Save Copy 写到独立目标。它不需要覆盖 source，但仍要验证输出。逻辑 revision 在“生成或发布副本”时不会再次增加，因为保存不是新的数据 mutation。

会话结束时先关闭 Runtime，再由拥有 connection 的 Host 关闭底层资源：

```ts
await runtime.close(context("close-runtime"))
connection.close()
```

## Browser 与 Desktop 怎样组合

### Browser

推荐组合：

```text
Window UI
   │ structured-clone transport
Dedicated Worker
   ├── Runtime
   ├── SQLiteWasmConnectionPort
   └── 私有 WASM working database

Window/Host
   └── 文件选择、权限、下载/覆盖、恢复与附件 capability
```

不要把 SQLite database、原始 handle 或 `ConnectionPort` 发到 Window。Window 只持有 transport 后的 `RuntimeClient` 和高层 `HostServices`。

浏览器可能只能导入私有副本并下载 Save Copy；支持 File System Access 的浏览器才可能获授权覆盖原文件。两者使用相同 Runtime 语义，但发布能力不同。

可参考：

- [`SQLiteWasmConnectionPort`](../../packages/eidos-file/src/sqlite-wasm.ts)
- [Web Worker 组合示例](../../apps/eidos-file-web/src/runtime/eidos-file.worker.ts)
- [Browser Host 示例](../../apps/eidos-file-web/src/files/browser-host-services.ts)

### Desktop

Desktop 使用 `BetterSqlite3ConnectionPort`，但应放在专用 Worker、线程或进程中，避免同步 SQLite 阻塞 UI。Host 持有路径、锁、恢复和发布能力，Renderer 仍只消费受限 API。

可参考 [`BetterSqlite3ConnectionPort`](../../packages/eidos-file/src/better-sqlite3.ts)。

## 接入 React Viewer

如果应用已经实现 `HostServices`，UI 只需组合 Kernel、Runtime Provider 和标准 View：

```tsx
import { useEffect, useMemo } from "react"
import type { HostServices } from "@eidos.space/eidos-file"
import { EidosUIKernel } from "@eidos.space/eidos-file-ui/kernel"
import {
  EidosStandardView,
  EidosUIRuntimeProvider,
} from "@eidos.space/eidos-file-ui/runtime-platform"

export function Viewer({
  host,
  sourceToken,
}: {
  host: HostServices
  sourceToken: string
}) {
  const kernel = useMemo(() => new EidosUIKernel(host), [host])

  useEffect(() => {
    void kernel.openSource({ sourceToken, access: "read" })
    return () => {
      void kernel.close()
    }
  }, [kernel, sourceToken])

  return (
    <EidosUIRuntimeProvider kernel={kernel}>
      <EidosStandardView />
    </EidosUIRuntimeProvider>
  )
}
```

`sourceToken` 是 Host 发放的 opaque token，不是文件路径。Kernel 会按顺序完成 Host negotiation、Runtime negotiation、snapshot 和 schema bootstrap。

标准 View 消费 Runtime 返回的 Grid、Gallery 或 Kanban 数据，不会在 React 中重新实现 Formula、Lookup、Relation、filter 或 group 语义。

## 调试时怎样查看底层数据

### 首选验证 API

```ts
const report = await runtime.validate(
  { level: "full" },
  context("validate-full")
)

for (const diagnostic of report.diagnostics) {
  console.log(diagnostic.severity, diagnostic.code, diagnostic.message)
}
```

先检查 `negotiated.capabilities.validate`。结构化 code 用于程序分支，message 用于日志或界面提示。

### 只读 SQLite 检查

```ts
import Database from "better-sqlite3"

const database = new Database("reading-list.eidos", {
  fileMustExist: true,
  readonly: true,
})

database.pragma("trusted_schema = OFF")

console.log(
  database
    .prepare(
      "SELECT file_id, format_major, format_minor, revision, title FROM eidos__meta"
    )
    .get()
)

console.log(
  database
    .prepare('SELECT "_id", "书名", "状态", "页数" FROM "阅读清单" LIMIT 10')
    .all()
)

database.close()
```

Eidos File 的用户 Table 与 stored Field 始终使用显示名称作为 SQLite 物理名称。Table
名称按 `NOCASE` 在文件内唯一，且不能以 `sqlite_` 或 `eidos__` 开头；Field 名称按
`NOCASE` 在所属 Table 内唯一。

通用 SQLite 工具适合只读检查。直接写用户表可能绕过 revision、关系删除策略、Formula 依赖和 schema 原子性。

## 常见错误与处理方式

### `stale-revision`

当前文件已被另一个 mutation 推进。重新读取 snapshot 和受影响数据，再决定是否提交新的显式 mutation。不要直接重放旧请求。

### `invalid-value`

检查 Field 类型和 public logical encoding。尤其注意：Integer 是十进制字符串；Date 是 `YYYY-MM-DD`；Datetime 是毫秒精度 UTC instant；Relation 是 Row ID 列表。

### `resource-limit`

根据 negotiation 返回的 limit 缩小 page、projection 或 mutation batch。不要静默截断一个逻辑值或一次用户粘贴。

### `unknown-commit`

旧 Runtime epoch 不再可信。停止读写，通过 Host reconciliation 建立 replacement Runtime，再判断操作是否提交。不要自动 retry。

### `corrupt-file` 或验证 diagnostic

停止写入，保留 source 和 recovery。根据 validation level、diagnostic code 和支持版本决定只读、恢复或拒绝打开。

## 开发时最容易踩的坑

- 把 `Runtime.open` 当成“打开路径”：它只打开一个已经建立好的 `ConnectionPort`。
- 让 UI 直接执行 SQL：这样会复制 Runtime 语义并扩大权限边界。
- 用表名或字段名作为长期引用：显示名称可以改；SDK 边界应使用稳定 ID。
- 把 `mutateRows` 成功显示成“已保存到原文件”：它只证明 working database 已提交。
- 把 Formula、Lookup 或 inverse Relation 当作普通可写列：它们是派生结果。
- 每条 Relation 单独查询一次名称：在 projection 中请求 relation resolution，按页批量获取。
- 用 offset 扫完整张大表：正式 Runtime 使用绑定 revision 和 query 的 cursor。
- 把 unknown optional metadata 丢掉：不理解时保留，无法保留时拒绝写入。
- 在 Browser Window 里运行长期 SQLite 工作：使用 Dedicated Worker 和 transport。
- 把缓存、WAL 或 recovery 当作分享文件：发布物只是一份验证过的 `.eidos` main database。

## 一条推荐的实现顺序

1. 用 Node 便利 API 创建测试文件，熟悉 Table、Field、Row 和 revision；
2. 用只读 SQLite 检查器观察元数据表与用户表；
3. 切到 `RuntimeClient`，实现 negotiate、snapshot、schema paging 和 queryRows；
4. 加入 `mutateRows`，严格传 expectedRevision 和 Field ID；
5. 用 schema preflight/apply 实现建表、改名和类型转换；
6. 让 Adapter 在 Worker/线程中提供 ConnectionPort；
7. 让 Host 实现 source、working database、恢复、冲突和 publication；
8. 最后接入 `EidosUIKernel` 或自己的 UI；UI 不重新实现数据语义。

## 继续阅读

| 你正在实现                      | 先读                                         | 重点章节                                              |
| ------------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| validator、只读检查器、原始导出 | [Eidos File Format 1.0](./eidos-file-1.0.md) | 文件身份、schema、值编码、validity                    |
| 查询、公式、关系、mutation      | [Eidos Runtime 1.0](./eidos-runtime-1.0.md)  | negotiation、snapshot、query、mutation、validation    |
| Browser/Desktop 文件生命周期    | [Eidos Adapter 1.0](./eidos-adapter-1.0.md)  | ConnectionPort、Host lifecycle、publication、recovery |
| Viewer、Editor 或 schema UI     | [Eidos UI 1.0](./eidos-ui-1.0.md)            | bootstrap、分页、编辑状态、冲突与只读行为             |

中文参考译本和 conformance label 入口见 [Eidos 规范索引](./README.zh.md)。

仓库内还可以直接查看：

- [Runtime package README](../../packages/eidos-file/README.md)
- [Runtime/Adapter 平台说明](../../packages/eidos-file/DEVELOPER_PLATFORM.md)
- [React UI package README](../../packages/eidos-file-ui/README.md)
- [Eidos File Web 参考应用](../../apps/eidos-file-web/src/app.tsx)
