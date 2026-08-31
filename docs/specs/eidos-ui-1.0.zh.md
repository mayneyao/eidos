# Eidos UI 1.0 中文参考

状态：Eidos 最终标准的参考翻译  
版本：1.0  
发布日期：2026-07-21  
修订日期：2026-08-23
编辑与变更控制：Eidos Project  
规范语言：英文

## 摘要

Eidos UI 1.0 定义 Eidos Runtime 之上的可移植展示与交互契约。独立实现者
无需引入 Eidos App 源码，也无需知道 SQLite、浏览器 Worker 或 native driver
如何部署，就可以实现 Viewer、Row Editor 或 Schema Editor。

Eidos UI 只能通过 `RuntimeClient` 读取和修改逻辑数据；open、permission、
publication、conflict、recovery 与 asset 则独立通过 `HostServices`。UI 永远不能
得到 SQLite statement、physical identifier、generated SQL、Host filesystem path、
native handle 或 canonical-file write primitive。

本文拥有通用 async consumption、交互状态、editing affordance、accessibility 与
renderer isolation 契约。[Eidos 标准视图 1.0](./eidos-standard-views-1.0.zh.md) 是
normative companion，拥有 Grid、Gallery、Kanban、Calendar 与 Form 的 layout 含义和
View-specific interaction。Logical value、query、mutation、revision 与 error 的含义归
[Eidos Runtime 1.0](./eidos-runtime-1.0.md)；文件字节和持久编码归
[Eidos File Format 1.0](./eidos-file-1.0.md)；平台和 persistence mechanism 归
[Eidos Adapter 1.0](./eidos-adapter-1.0.md)。

## 1. 文档地位与规范性术语

英文正文是唯一 normative 文档；本中文文档是 informative 参考。发布定义
conformance target，不代表任何现有产品已经符合。

英文正文中大写的 **MUST**、**MUST NOT**、**REQUIRED**、**SHALL**、
**SHALL NOT**、**SHOULD**、**SHOULD NOT**、**RECOMMENDED**、
**NOT RECOMMENDED**、**MAY** 与 **OPTIONAL** 按 BCP 14 解释。本中文参考用
“必须/不得/应当/不应/可以”对应其强度；若翻译存在歧义，以英文为准。

标成 informative 的 example 和 rationale 不构成要求。本文的 JSON Schema、
状态转换、interface shape、默认值和 conformance vector 都是英文规范的
normative 内容。

## 2. 范围与依赖边界

UI 层恰好有两个向下依赖：

```text
Eidos UI
  ├── RuntimeClient ── logical schema, rows, queries, derived values, mutations
  └── HostServices  ── open, permission, save, conflict, recovery, assets
```

`RuntimeClient` 是 Eidos Runtime 1.0 所有 public operation 的 async binding。
`HostServices` 是 Eidos Adapter 1.0 所有 Host operation 的 async、capability-scoped
binding。它们可以使用 in-process call、structured-clone message、IPC 或其他
transport，但 UI 可观察结果必须一致。

第 5.2 节 optional framework-native `AssetPresenter` 只是已获授权 Host lease 的
presentation callback，不是第三个 data/authority service；它不能解析 canonical URI 或
acquire bytes。

Eidos UI：

- 必须用 stable ID 寻址 File、Table、Field、View 与 Row；
- 必须用 Field ID 寻址 Row value，不能用 display name 或 physical name；
- 必须把 Runtime validation 和 mutation result 视为唯一权威；
- 必须把 draft、focus、selection、scroll、optimistic overlay 和本地 formatting
  留在 canonical value 之外；
- 不得打开或解析 SQLite database；
- 不得发 SQL、quote SQLite identifier、推导 physical name，或取得 connection、
  prepared statement；
- 不得取得 filesystem path、`FileSystemFileHandle`、file descriptor、native
  database handle、Worker-global object 或 raw save callback；
- 不得在 presentation layer 重做 Formula、Lookup、Relation、filter、sort、
  aggregate、conversion、deletion policy 或 revision 语义；
- 不得绕过 `RuntimeClient` 修改 metadata 或 source bytes。

UI 可以为了即时反馈做 advisory parsing。结果必须清楚标为 provisional；它不能
授权 write，不能拒绝 Runtime 接受的值，也不能替代 Runtime 的权威 diagnostic。

## 3. Conformance profiles

实现声明以下一个或多个 label：

| Label           | 必须实现                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `EU-Viewer-1.0` | open session、negotiate capability、展示标准 View 与 logical value、分页与取消 read、提供 accessible read-only interaction       |
| `EU-Editor-1.0` | 全部 Viewer 要求、atomic row editing、paste、delete、saved View editing、conflict handling、session undo 与 publication          |
| `EU-Schema-1.0` | 全部 Editor 要求、Table/Field 两阶段 schema preflight/application、dependency disclosure、conversion 与 destructive confirmation |

Profile 是累积的：Schema 包含 Editor，Editor 包含 Viewer。UI conformance label
不表示同一组件也实现 Runtime、Adapter 或 File Format。

五种标准 View type 及其要求由 Eidos 标准视图 1.0 统一定义，并包含在上述 label 中。
Extension profile 可以增加其他 understood View type，但不会改变 standard View
baseline，且必须定义自己的 prerequisite 与 conformance test。

`EU-Viewer-1.0` 测试环境必须提供 `ER-Reader-1.0` 和 `EA-Host-1.0` Host。
`EU-Editor-1.0` 还要求 `ER-Writer-1.0`、row mutation、Runtime
`mutationUndo`、view mutation、按 negotiated durability publication，以及第 11.3
节的 undo behavior；任何通过 Adapter Transport 提供的 Runtime 还必须具备 Host
commit reconciliation。
`EU-Schema-1.0` 再要求 schema preflight 与 schema mutation。Negotiation
没有提供 prerequisite 时，UI 必须 disable 或不显示操作；不得显示一个已知必然因
capability 缺失而失败的 control。

产品必须公开：

1. UI conformance labels；
2. 接受的 Runtime 和 Host protocol versions；
3. 是否支持 trusted 或 isolated third-party renderer；
4. 低于 negotiated Runtime/Host limit 的任何自身资源上限。

## 4. 术语与导入类型

- **logical row**：Row ID 加 ordered logical-value array，并与 page 的 ordered
  `{fieldId,valueType}` column descriptor 一一对应。
- **projected absence**：某 Field 未被请求，因此没有 Field-ID member；它和
  member 存在且为 `null` 不同。
- **resolved presentation**：与 canonical logical value 分开返回的 generated
  label 或 preview data，例如 Relation label。
- **draft**：UI state 拥有、尚未 commit 的用户输入。
- **optimistic overlay**：Runtime mutation 未完成时展示的可撤销、仅 UI projection。
- **revision**：lossless Runtime revision。UI 把它当作 opaque monotonic
  concurrency token，绝不能对它做 binary64 arithmetic。
- **standard View**：type 为 `grid`、`gallery`、`kanban`、`calendar` 或 `form` 的
  View，定义见 Eidos 标准视图 1.0。
- **renderer**：把 View 和 Runtime result 转为 interactive surface 的代码；可能是
  trusted application code，也可能是 isolated third-party code。
- **asset lease**：用于展示一个 File entry 的、time- and purpose-scoped Host result，
  不暴露 storage path 或 authority。

以下类型从 Eidos Runtime 1.0 导入并保持 Runtime 含义：
`RuntimeSnapshot`、`RuntimeCapabilities`、`RuntimeLimits`、
`GetSchemaPageRequest`、`SchemaPage`、`SchemaDescriptor`、`LogicalValue`、
`RowQuery`、`SavedViewQuery`、`ProjectionSpec`、`ProjectedRow`、`RowPage`、
`RowBatch`、`FileEntry`、`AggregateRequest`、`AggregateResponse`、
`AggregateResult`、`GroupRequest`、`GroupPage`、`GroupRowsRequest`、
`GroupRowPage`、`FormulaPreviewRequest`、`FormulaPreviewResult`、`RowMutation`、
`MutationResult`、`ViewChange`、`ViewMutationRequest`、`ViewMutationResult`、
`SchemaPreflightRequest`、`SchemaPreflightResult`、`SchemaMutationRequest`、
`SchemaMutationResult`、`SchemaDependencyPage`、`CsvExportRequest`、
`CsvExportResult`、`CsvImportRequest`、`CsvImportResult`、`ValidationRequest`、
`ValidationReport`、`RuntimeError`、`RuntimeDiagnostic`、
`CommitReconciliation`、`TypeRef`、`FormulaResultType`、`JsonObject`、`Revision`、
`CancellationSignal`、`RuntimeEvent`。

UI 不得 widen、coerce 或 reinterpret 导入类型。尤其 int64 decimal string 与 Text
即使都使用 JSON string，也不能混为一谈；logical type 由 Field descriptor 决定。

## 5. Bootstrap、capability negotiation 与精确 client

### 5.1 RuntimeClient

下面是 Eidos Runtime language-neutral binding 的 generated mirror；它只对 UI 如何
消费该 binding 具有规范性，Eidos Runtime 仍是唯一 type/API owner。具体语言可以
改变命名风格，但必须一对一提供相同 input、output、cancellation 和 error 的
operation。若 mirror 发生差异，以 Runtime 为准，suite build 必须失败。

```ts
interface RequestContext {
  requestId: string // 1..128 UTF-8 octets, no U+0000; epoch-unique while unresolved
  deadlineMilliseconds?: number // integer in 1..9007199254740991
  signal?: CancellationSignal
}

interface RuntimeClient {
  negotiate(
    request: { protocol: "eidos-runtime"; versions: ["1.0"] },
    context: RequestContext
  ): Promise<{
    version: "1.0"
    capabilities: RuntimeCapabilities
    limits: RuntimeLimits
  }>

  getSnapshot(
    request: { minimumRevision?: Revision },
    context: RequestContext
  ): Promise<RuntimeSnapshot>

  getSchemaPage(
    request: GetSchemaPageRequest,
    context: RequestContext
  ): Promise<SchemaPage>

  queryRows(
    request: {
      tableId: string
      query: RowQuery
      projection: ProjectionSpec
      limit: number
      cursor?: string
      direction?: "forward" | "backward"
    },
    context: RequestContext
  ): Promise<RowPage>

  getRowsById(
    request: {
      tableId: string
      rowIds: string[]
      projection: ProjectionSpec
    },
    context: RequestContext
  ): Promise<RowBatch>

  aggregate(
    request: AggregateRequest,
    context: RequestContext
  ): Promise<AggregateResponse>

  groupRows(request: GroupRequest, context: RequestContext): Promise<GroupPage>

  queryGroupRows(
    request: GroupRowsRequest,
    context: RequestContext
  ): Promise<GroupRowPage>

  previewFormula(
    request: FormulaPreviewRequest,
    context: RequestContext
  ): Promise<FormulaPreviewResult>

  mutateRows(
    request: RowMutation,
    context: RequestContext
  ): Promise<MutationResult>

  revertMutation?(
    request: { undoToken: string; expectedRevision: Revision },
    context: RequestContext
  ): Promise<MutationResult>

  mutateView(
    request: ViewMutationRequest,
    context: RequestContext
  ): Promise<ViewMutationResult>

  preflightSchema(
    request: SchemaPreflightRequest,
    context: RequestContext
  ): Promise<SchemaPreflightResult>

  getSchemaPlanDependencies(
    request: { planToken: string; cursor?: string; limit: number },
    context: RequestContext
  ): Promise<SchemaDependencyPage>

  mutateSchema(
    request: SchemaMutationRequest,
    context: RequestContext
  ): Promise<SchemaMutationResult>

  validate(
    request: ValidationRequest,
    context: RequestContext
  ): Promise<ValidationReport>

  exportCsv?(
    request: CsvExportRequest,
    context: RequestContext
  ): Promise<CsvExportResult>

  importCsv?(
    request: CsvImportRequest,
    context: RequestContext
  ): Promise<CsvImportResult>

  cancel(request: { requestId: string }): Promise<void>
  subscribe?(listener: (event: RuntimeEvent) => void): () => void
  close(context: RequestContext): Promise<void>
}
```

上面使用的 exact View/Formula-preview request shape 是：

```ts
type ViewChange =
  | {
      kind: "create-view"
      clientKey: string
      tableId: string
      name: string
      type: string
      query: SavedViewQuery
      layout: JsonObject
      position: string
    }
  | {
      kind: "update-view"
      viewId: string
      patch: {
        name?: string
        type?: string
        query?: SavedViewQuery
        layout?: JsonObject
        position?: string
      }
    }
  | { kind: "delete-view"; viewId: string }

interface ViewMutationRequest {
  expectedRevision: Revision
  changes: ViewChange[]
}

interface FormulaPreviewRequest {
  tableId: string
  fieldId?: string
  candidateName?: string
  sourceText: string
  declaredResultType: FormulaResultType
  rowIds?: string[]
}

interface FormulaPreviewResult {
  fileId: string
  revision: Revision
  valid: boolean
  inferredType?: FormulaResultType
  dependencies?: string[]
  rows?: Array<{ rowId: string; value?: LogicalValue; error?: RuntimeError }>
  diagnostics: RuntimeDiagnostic[]
  diagnosticsTruncated: boolean
}
```

同一 `changes` array 中一个 View ID 不得出现两次。Formula preview 在
`valid=true` 时同时含 `inferredType`、`dependencies`、`rows`；每个 row 恰好有
`value` 或 `error` 中一个，顺序按 requested `rowIds`，未提供时按 Runtime sample
order。`valid=false` 时这三项全部省略，且至少有一个 error diagnostic。
`diagnosticsTruncated` 仅在还有 ordered diagnostic 被省略时为 true。编辑已有 Formula
发送 `fieldId` 并省略 `candidateName`；创建时省略 `fieldId`，发送 proposed unique
`candidateName`，使 Runtime 能检测 candidate self-cycle。Preview output 是 generated
state，绝不能授权 Formula save。

UI 消费以下 exact `RuntimeCapabilities` member：

| Member            | 对 UI 的含义                                         |
| ----------------- | ---------------------------------------------------- |
| `readRows`        | `queryRows`、`getRowsById` 可用                      |
| `schemaPaging`    | revision-bound `getSchemaPage` 可用；Viewer 必需     |
| `cursorPaging`    | opaque forward/backward cursor 可用；Viewer 必需     |
| `aggregate`       | 带 revision 的 `aggregate` 可用；Viewer 必需         |
| `groupRows`       | `groupRows`、`queryGroupRows` 可用；标准 Kanban 必需 |
| `formulaPreview`  | `previewFormula` 可用                                |
| `mutateRows`      | canonical row mutation 可用                          |
| `mutationUndo`    | optional Runtime undo extension 可用                 |
| `mutateView`      | saved View query/layout mutation 可用                |
| `schemaPreflight` | `preflightSchema`、`getSchemaPlanDependencies` 可用  |
| `mutateSchema`    | plan-token schema application 可用                   |
| `validate`        | Runtime validation report 可用                       |
| `events`          | 可以 subscribe revision hint                         |
| `csvExport`       | optional `exportCsv` 存在                            |
| `csvImport`       | optional `importCsv` 存在，且可创建 canonical row    |

UI 消费以下完整 `RuntimeLimits`：

```ts
interface RuntimeLimits {
  requestBytesMax: number
  responseBytesMax: number
  schemaPageSizeMax: number
  pageSizeMax: number
  projectionFieldsMax: number
  rowsByIdMax: number
  mutationRowsMax: number
  mutationCellsMax: number
  mutationBytesMax: number
  aggregateItemsMax: number
  groupPageSizeMax: number
  formulaPreviewRowsMax: number
  filterDepthMax: number
  filterNodesMax: number
  sortFieldsMax: number
  groupFieldsMax: number
  searchBytesMax: number
  listElementsMax: number
  logicalValueBytesMax: number
  formulaBytesMax: number
  formulaNodesMax: number
  formulaDepthMax: number
  diagnosticsMax: number
  foregroundTimeMsMax: number
  csvBytesMax: number
  schemaPlanEntriesMax: number
  schemaPlanBytesMax: number
  undoEntriesMax: number
  undoBytesMax: number
}
```

每项都必须存在，并且是 `1..2147483647` 的 JSON safe integer。每个 capability
member 都必须存在且为 boolean。Member 缺失是 protocol error；忽略未知 future
member。Viewer 要求 `readRows`、`schemaPaging`、`cursorPaging`、`aggregate`、
`groupRows`、`validate`；Editor 另要求 `mutateRows`、`mutationUndo`、
`mutateView`；Schema 另要求 `schemaPreflight`、`mutateSchema`。

对于 transported client，这些 Runtime limit 已经是 Runtime 与 Adapter Transport
limit 的 effective minimum。UI 不发现或应用第二个隐藏 transport ceiling；conforming
composition 绝不声明一个必然被拒绝的 request/page。

每个 non-optional Runtime method 在 capability=false 时仍然存在，并拒绝为
`unsupported`；UI 不应发起这种可预知失败的调用。`revertMutation`、`subscribe`、
`exportCsv`、`importCsv` 仅在对应 capability 为 true 时存在。尤其 transported
`RuntimeClient` 报告 `events=false` 并省略 `subscribe`；Adapter request/response
Transport profile 不承载 Runtime event。

Capability dependency 精确导入：`cursorPaging`、`aggregate`、`groupRows`、
`csvExport` 要求 `readRows`；`groupRows` 还要求 `cursorPaging`；`mutationUndo`、
`csvImport` 要求 `mutateRows`；`mutateSchema` 要求 `schemaPreflight`。矛盾 descriptor
是 protocol error，不能由 UI 猜测如何绕过。UI 产生的 request ID 遵守前述固定
边界，除此之外保持 opaque；Transport facade 可以在内部另配 epoch-unique wire ID。

`revertMutation` 与 `mutationUndo` 对 Runtime/Viewer 是 optional，但对
`EU-Editor-1.0` 是 required，使 paste/delete 与 Relation side effect 都能完整 undo。
没有它们的 UI 仍可提供不符合 Editor label 的 basic editing，但不能声明
`EU-Editor-1.0`。

`cancel` 是 idempotent。发出 cancel request 不等于证明 mutation 没有 commit。
Transported mutation 返回 `unknown-commit` 时，按第 5.2 节 trusted Host
replacement-epoch 流程处理；不能查询旧 `RuntimeClient` 来 reconciliation。

`events=true` 时，`RuntimeEvent` 是使用 Runtime exact shape 的 hint。它从不携带可
取代 operation result 的 canonical value。Event revision 改变时，UI invalidates
affected cache 并重新取得 snapshot 或 page。没有 event 时，UI 使用自己的 operation
result、Host state change、explicit refresh 或 bounded `getSnapshot` polling，不得虚构
event channel。

`RuntimeClient` 来自 `HostServices.openSource` 或 `createSource` 时，UI 调
`HostServices.close`；Transport 恰好调用一次 Runtime `close`，然后关闭其
Connection。直接 embedded 的 Runtime-only surface 自己调 Runtime `close`；同一
client 不得两边都调。

### 5.2 HostServices

UI-facing Host binding 由 Eidos Adapter 第 13 节拥有。下面的 generated mirror 供
UI implementer 使用，且必须保持 mechanically equivalent；它不创建第二份定义：

```ts
interface HostServices {
  negotiate(
    request: { protocol: "eidos-host"; versions: ["1.0"] },
    context: RequestContext
  ): Promise<{
    version: "1.0"
    serviceCapabilities: HostServiceCapabilities
    limits: HostLimits
  }>

  openSource(
    request: {
      sourceToken: string // composition-layer opaque token only
      access: "read" | "readwrite"
    },
    context: RequestContext
  ): Promise<{
    sessionId: string
    runtime: RuntimeClient
    state: HostSessionState
  }>

  createSource(
    request: {
      destinationToken: string
      title: string
    },
    context: RequestContext
  ): Promise<{
    sessionId: string
    runtime: RuntimeClient
    state: HostSessionState
  }>

  requestWritePermission(
    request: {
      sessionId: string
    },
    context: RequestContext
  ): Promise<HostSessionState>

  save(
    request: {
      sessionId: string
    },
    context: RequestContext
  ): Promise<HostSaveResult>

  saveCopy(
    request: {
      sessionId: string
      destinationToken: string
      adopt: "keep-current" | "adopt-copy"
    },
    context: RequestContext
  ): Promise<HostSaveCopyResult>

  reconcileCommit(
    request: {
      sessionId: string
    },
    context: RequestContext
  ): Promise<HostCommitReconciliationResult>

  resolveConflict(
    request: {
      sessionId: string
      strategy: "reload" | "save-copy" | "merge"
      conflictToken: string
      destinationToken?: string
      adopt?: "keep-current" | "adopt-copy"
    },
    context: RequestContext
  ): Promise<HostConflictResult>

  listRecovery(
    request: {
      sessionId: string
    },
    context: RequestContext
  ): Promise<HostRecoveryReport>

  restoreRecovery(
    request: {
      sessionId: string
      recoveryToken: string
    },
    context: RequestContext
  ): Promise<HostRecoveryResult>

  discardRecovery(
    request: {
      sessionId: string
      recoveryToken: string
    },
    context: RequestContext
  ): Promise<HostRecoveryResult>

  acquireAsset(
    request: {
      sessionId: string
      sourceToken: string
    },
    context: RequestContext
  ): Promise<{ entry: FileEntry }>

  acquireRemoteAsset?(
    request: {
      sessionId: string
      uri: string
      name?: string
    },
    context: RequestContext
  ): Promise<{ entry: FileEntry }>

  resolveAsset(
    request: {
      sessionId: string
      entryId: string
      purpose: "thumbnail" | "preview" | "download"
    },
    context: RequestContext
  ): Promise<AssetLease>

  resolveUrlImage?(
    request: {
      sessionId: string
      uri: string
      purpose: "thumbnail" | "preview"
    },
    context: RequestContext
  ): Promise<UrlImageLease>

  releaseAsset(
    request: { sessionId: string; leaseId: string },
    context: RequestContext
  ): Promise<void>
  close(request: { sessionId: string }, context: RequestContext): Promise<void>
  subscribe(
    sessionId: string,
    listener: (state: HostSessionState) => void
  ): () => void
}
```

Facade result record 的 exact shape 是：

```ts
type HostPhase =
  | "opening"
  | "ready-readonly"
  | "ready-clean"
  | "ready-dirty"
  | "publishing"
  | "commit-unknown"
  | "conflict"
  | "recovery-required"
  | "fatal"
  | "closed"

interface HostServiceCapabilities {
  canOpenSource: true
  canCreateSource: boolean
  canRequestPermission: boolean
  canSaveCopy: boolean
  canReconcileCommit: boolean
  canResolveConflict: boolean
  canRecover: boolean
  canUseAssets: boolean
}

interface HostCapabilities {
  canWriteCurrent: boolean
  canSaveCopy: boolean
  canRequestPermission: boolean
  hasRecovery: boolean
  assetReadSchemes: string[]
  assetWriteSchemes: string[]
  casGuarantee: "strong" | "cooperative" | "none"
  atomicReplace: boolean
  durability: "durable" | "best-effort"
}

interface HostLimits {
  sourceBytesMax: string
  candidateBytesMax: string
  recoveryBytesMax: string
  recoveryEntriesMax: number
  recoveryRetentionSecondsMax: number
  assetBytesMax: string
  assetPreviewBytesMax: string
  concurrentAssetLeasesMax: number
  concurrentSessionsMax: number
}

interface HostError {
  code:
    | "invalid-request"
    | "unsupported"
    | "invalid-source"
    | "conflict"
    | "permission-denied"
    | "source-changed"
    | "writer-unavailable"
    | "publication-failed"
    | "recovery-required"
    | "asset-unavailable"
    | "cancelled"
    | "deadline-exceeded"
    | "resource-limit"
    | "io-error"
    | "unknown-commit"
    | "closed"
    | "fatal"
  message: string
  retryable: boolean
  details?: JsonObject
}

interface HostSessionState {
  sessionId: string
  phase: HostPhase
  capabilities: HostCapabilities
  limits: HostLimits
  fileId?: string
  revision?: Revision
  conflictToken?: string
  error?: HostError
}

interface HostSaveResult {
  state: HostSessionState
}
interface HostSaveCopyResult {
  state: HostSessionState
  adopted: boolean
  runtime?: RuntimeClient
}
interface HostCommitReconciliationResult {
  state: HostSessionState
  outcome: "committed" | "rolled-back" | "conflict"
  runtime?: RuntimeClient
  reconciliation?: CommitReconciliation
}
interface HostConflictResult {
  state: HostSessionState
  runtime?: RuntimeClient
}
interface HostRecoveryResult {
  state: HostSessionState
  runtime?: RuntimeClient
}
interface HostRecoveryReport {
  items: Array<{
    recoveryToken: string
    fileId: string
    revision: Revision
    createdAt: string
    size: string
  }>
}

interface AssetLease {
  leaseId: string
  entryId: string
  purpose: "thumbnail" | "preview" | "download"
  mediaType: string
  name: string
  size: string
  expiresAt: string
  resourceToken: string
}

interface UrlImageLease {
  leaseId: string
  purpose: "thumbnail" | "preview"
  mediaType: string
  size: string
  expiresAt: string
  resourceToken: string
}
```

只有 action 创建新 Runtime epoch 时，`HostConflictResult.runtime`、
`HostRecoveryResult.runtime` 或适用的 `HostCommitReconciliationResult.runtime` 才存在。
UI 立即 revoke 对旧 client 的所有 reference，旧 epoch 的关闭由 Host 拥有；UI
negotiate 新 client，并取得 snapshot/schema 后才能 display。仅为替换 epoch 而调用
`HostServices.close` 是禁止的，因为这会关闭 stable Host session。旧 epoch 的 cursor、
schema-plan token、preview、subscription、Runtime undo/redo token 全部失效；UI 应清除
而不是在新 epoch 中 probe。保留的 UI draft 在 refresh 后明确 resubmit 前仍非 canonical。
Recovery item 不泄露 source name/path。`resourceToken` 只交给 Host-approved presenter，
不能当 canonical URI 解读。

`sourceToken`、`destinationToken`、`sessionId`、`conflictToken`、
`recoveryToken` 与 `leaseId` 都是 opaque capability。UI 只能按 operation 要求
compare 或 return；不得 decode、在其 lifetime 以外持久化、从中推导 path，或暴露
给 untrusted renderer。

`saveCopy(adopt:"keep-current")` 保持当前 session/source state，且不返回 Runtime；
`adopt-copy` 返回新 Runtime epoch 和 copy 的 clean state。`resolveConflict` 仅对
`save-copy` 精确要求 `destinationToken` 与 `adopt`，对其他 strategy 禁止两者。

Open 前的 `HostServiceCapabilities` 只声明 operation availability；它不能声明
source-specific permission、CAS、atomicity 或 durability。Opened session 中的
`HostCapabilities` 声明 `canWriteCurrent`、`canSaveCopy`、
`canRequestPermission`、`hasRecovery`、`assetReadSchemes`、
`assetWriteSchemes`、`casGuarantee`、`atomicReplace` 与 `durability`。
`assetReadSchemes` 和 `assetWriteSchemes` 是 Host 识别的 scheme name 数组，包括特殊
`relative` token 或 `data`/`https` 等 lowercase scheme；UI 本身不得实现 scheme。
`casGuarantee` 是 `strong`、`cooperative` 或 `none`；
`atomicReplace` 是 boolean；`durability` 是 `durable` 或 `best-effort`。
`HostLimits` 精确声明 `sourceBytesMax`、`candidateBytesMax`、`assetBytesMax`、
`recoveryBytesMax`、`recoveryEntriesMax`、`recoveryRetentionSecondsMax`、`assetPreviewBytesMax`、
`concurrentAssetLeasesMax` 与 `concurrentSessionsMax`。五项 byte limit 是
non-negative int64 decimal string；四项 count/seconds limit 是 `0..2147483647` 的 JSON integer。
每个 1.0 member 必须存在；缺失 member 是 protocol error，未知 future member
忽略。Zero 会禁用对应 size-bearing Host operation/flow，绝不表示 unlimited。尤其
`recoveryRetentionSecondsMax=0` 会禁用 recovery；它既不表示 immediate expiry，也不
表示没有 time-based expiry。只有 recovery byte、entry、retention limit 都为 positive
时 recovery 才可用，否则 Host 不得暴露 read-write Runtime。Positive retention value
是 service maximum，不保证任一 item 一定存活到该 age。Host 与 UI 中更小的 limit
生效。UI 必须 lossless 比较 byte limit，不能经过 binary64。

Negotiated limit 是 service maximum。Open 后及每次 state event 时，UI 使用
effective `HostSessionState.limits`，不能继续按 stale、更大的 maximum 发起工作。

这是 UI-facing derived capability record，不是 Adapter publication capability
record。Composition layer 用 Adapter `writeCurrent` 加当前可用 permission/
writer-lease state 推导 `canWriteCurrent`，用 `saveCopy` 推导 `canSaveCopy`，用
platform permission operation 推导 `canRequestPermission`，用 Transport prepared-commit
和 Host reopen/reconciliation profile 推导 `canReconcileCommit`，用 `recovery` 推导
`hasRecovery`，并从 scoped asset port 推导 asset scheme array。`casGuarantee`、
`atomicReplace`、`durability` 保持 Adapter value。UI 永远不取得 `writerLease` 或
publication port。`sourceBytesMax` 与 `candidateBytesMax` 和 asset limit 一样，都是
lossless decimal byte limit。

只有另行 negotiate 了 Runtime/product merge capability，UI 才能显示 `merge`
conflict strategy。Adapter 或 Host 支持本身不定义 logical merge semantics。

能通过 Adapter Transport 返回 read-write Runtime 的 Host service，
`canReconcileCommit` 为 true。它不让 UI 取得 commit receipt。Runtime 返回
`unknown-commit` 后，UI 把旧 RuntimeClient 视为 permanently fatal，等待 Host phase
进入 `commit-unknown`，并且只从 trusted application surface 调用
`HostServices.reconcileCommit({sessionId})`。不得对旧 client 调用 `getSnapshot`、
`getRowsById`、retry mutation 或发送任何其他 operation。

Outcome 为 `committed` 时，replacement `runtime` 和 validated `reconciliation` 同时
存在。UI 使用其中 operation tag 和 persistent-ID mapping settle pending action，但从
replacement Runtime refetch live projection。`rolled-back` 时 replacement `runtime`
存在而 `reconciliation` 省略；UI 先 refresh，新 mutation 需要 explicit user action。
`conflict` 时两者都省略，UI 进入普通 Host conflict/recovery flow。前两种已判定结果
中，UI 原子替换 client，negotiate、取得新 snapshot/schema sequence 和 visible row，
之后才能离开 unknown edit state。Reconciliation 不复活 undo token、returned-row
projection 或其他旧 epoch generated state，因此不能宣称 reconciled commit 可由 Runtime
undo。UI 绝不能取得、展示、持久化、记录或让 renderer 处理 Host-private receipt。

`HostServices` 是 Adapter 拥有、product composition layer 提供给 UI 的精确
UI-facing `EA-Host-1.0` binding。它不是 Adapter `PublicationPort`，也不暴露
lower-level operation。Source/destination picker 属于 composition layer，只产生
opaque token，永远不让 path 或 native handle 经过 UI code。

可复用 Eidos UI library 必须把 `HostServices` 暴露为 injected constructor/provider
dependency；不得把 relative-path、network 或 Data-URL handling 隐藏在 package-global
resolver 中。embedding application 实现 `HostServices.resolveAsset`，因此由它决定如何
在 active session 内解析 entry ID，也可以 deny/omit 任意 scheme。

如果 UI framework 不能直接消费 `AssetLease.resourceToken`，UI library 还必须暴露
等价的 injected presentation binding：

```ts
interface AssetPresenter<Surface> {
  renderImage(request: {
    sessionId: string
    lease: AssetLease
    altText: string
  }): Surface
  loadImage?(request: {
    sessionId: string
    lease: AssetLease
    altText: string
  }): Promise<CanvasImageSource>
  activate(
    request: {
      sessionId: string
      lease: AssetLease
      action: "open" | "download"
    },
    context: RequestContext
  ): Promise<void>
}
```

`Surface` 是 framework-native、non-canonical presentation object，不通过 Runtime 或
Adapter Transport。presenter 只消费 scoped lease/token；它不会得到 native path、
database handle，也没有重新解释 canonical URI 的权限。`loadImage` 是 Grid renderer
使用的 optional Canvas-native 等价能力：trusted presenter 解码 lease token，只返回
drawable image source。Grid 不得用 `FileEntry.uri` 构造该 source，也不得自行解释
`resourceToken`。同一 trusted composition layer 可以同时提供两种 binding。presenter
缺失时 inline image/open/download action disabled；`loadImage` 缺失时只禁用 Canvas
thumbnail。两种情况仍可使用第 10 节的 metadata/icon/URI fallback。

### 5.3 Negotiation 顺序

每个 session 中，UI 必须：

1. 在展示 open/create operation 前 negotiate `HostServices`；
2. 只用 composition layer 因用户或 embedding-host intent 产生的 token 调用
   `openSource`，或只用 explicit create-only destination token 与 title 调用
   `createSource`；
3. 在请求 snapshot 前 negotiate 返回的 `RuntimeClient`；
4. 用两份 descriptor 决定 enabled feature 和 request size；
5. 获取 bounded `RuntimeSnapshot` header；
6. 从该 exact revision 用 `getSchemaPage` 分页取得 schema；
7. 只在 File ID、revision 和当前 surface 所需 descriptor 已知后展示 canonical
   content。

`RuntimeSnapshot` 只含 File identity/title/default Table 和 decimal-string schema
count；它不内嵌 Table、Field、View 或 feature。第一次 schema request 恰为
`{revision:snapshot.revision,limit}`，省略 cursor，`limit` 在
`1..schemaPageSizeMax`。UI 原样回传每个 `nextCursor` 直到 null，并验证每页 File ID/
revision、descriptor shape、stable-ID uniqueness，以及最终数量与 `schemaCounts`
一致。Object 保持 Runtime 的 feature/Table/Field/View block order。Page revision
不同或返回 `stale-revision` 时，丢弃整个 partial schema sequence，从新 snapshot
重启；绝不混合不同 revision 的 descriptor。

UI 可以显示 shell 并渐进 index 已验证 page，但在解释某 surface 所需的所有
descriptor 到齐前，不得展示对应 Table/View/cell control。公开的较低 UI
schema-object limit 应显示为 accessible resource-limit state，不能以此 silent omit
object 或假装 Runtime header 已含完整 schema。

Protocol-major mismatch 对该 session 是 fatal。缺少 optional capability 时显示
disabled/absent control 及 accessible reason，不能 speculative call。

## 6. UI 边界的 logical value binding

本节定义 UI 如何处理 Runtime binding；value meaning 仍由 Runtime 1.0 拥有。

```json
{
  "fileId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c450",
  "tableId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c462",
  "revision": "7",
  "projectionHash": "bb254f58231f24195b3de76cc45a24352258f34c77492c410511b4040104d810",
  "columns": [
    {
      "fieldId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e",
      "name": "Score",
      "valueType": "integer",
      "source": "stored",
      "writable": true
    },
    {
      "fieldId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45f",
      "name": "Notes",
      "valueType": "text",
      "source": "stored",
      "writable": true
    },
    {
      "fieldId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c460",
      "name": "Project",
      "valueType": "relation",
      "source": "stored",
      "writable": true
    }
  ],
  "rows": [
    {
      "id": "0198c72d-82b5-7968-b163-98be4b747702",
      "values": [
        "9223372036854775807",
        "Hello",
        ["0198c72d-82b5-7968-b163-98be4b747703"]
      ],
      "resolvedRelations": [
        {
          "column": 2,
          "items": [
            {
              "id": "0198c72d-82b5-7968-b163-98be4b747703",
              "state": "resolved",
              "labelFieldId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c464",
              "labelType": "text",
              "label": "Roadmap"
            }
          ]
        }
      ]
    }
  ],
  "nextCursor": null,
  "previousCursor": null
}
```

规则：

1. 每个 `ColumnDescriptor` 恰为
   `{fieldId,name,valueType,source,writable}`；`source` 是 `stored`、`formula`、
   `lookup` 或 `inverse-relation`，UI projection 中绝无 physical name。Columns
   unique，顺序等于 requested Field order。每行 `values` array 与其长度/index
   含义严格一致；`name` 只用于 presentation，绝不标识 value。
2. Field 不在 `columns` 中才表示未 projection；array member 为 `null` 才是
   projected logical null。Empty string、false、numeric zero、empty list 各不相同。
3. Text、URL、Select、Date、Datetime 以 string 到达；UI 不得只因展示而 normalize
   或 rewrite。
4. Integer 是 canonical base-10 int64 string。Input、draft equality、clipboard
   round-trip 和 mutation submission 必须 lossless；禁止经过 binary64 `number`。
5. Number 是 finite JSON number，negative zero 已 normalize 为 zero；NaN 和
   infinity 永远不是 valid value。
6. Checkbox 是 boolean；logical null 不是 false。
7. JSON 是 canonical JCS text。Values array 中 JSON `null` 表示 logical null；JSON
   literal null 是 JSON string `"null"`。UI 可以 parse text 编辑，但提交时必须是
   canonical JCS text，并保留 JSON type、object key、array order、exact string。
8. Multi-select 是 ordered unique string array。Select option name 就是 value，没有
   Option ID。
9. Forward/inverse Relation 是 ordered Row-ID array。若
   `ProjectionSpec.resolveRelations` 为空，`resolvedRelations` 必须省略；否则每行都
   必须存在，且恰有每个 requested Relation column 一项，按 `column` 升序，只能指向
   projected Relation column。其 `items` length、ID、order 必须与
   `values[column]` 完全相同。Item 只能是
   `{id,state:"unresolved"}` 或
   `{id,state:"resolved",labelFieldId,labelType,label}`。Resolved label 可以为 null；
   unresolved item 没有任何 `label*` member。Label 绝不能替换 mutation 中的 ID
   array。
10. File 是 ordered File-entry object array。每个 entry 的 `size` 是 non-negative
    int64 decimal string，必须 lossless。UI 把 entry `id` 交给
    `HostServices.resolveAsset`，不得自行 fetch、resolve 或 join entry URI。canonical
    `uri` 只能作为 inert display/copy text 和第 10 节 fallback；relative、`https:` 与
    `data:` 使用同一个 Host call。
11. Formula/Lookup result 使用 declared Runtime result type；list 仍是 list，不能为了
    edit flatten 成 comma-delimited Text。
12. System Row ID 和 timestamp 是具有 Field metadata read-only role 的普通
    projected logical value。

Columnar page 是 Runtime 唯一 read-row representation。UI 可以临时建立 Field-ID
index，但不得暴露/持久化第二种 canonical row shape。Sparse insert/update mutation
仍用 Field-ID-keyed map，使 omitted Field 无歧义，也避免 positional write 写错 Field。

这是实质 wire-size 选择，不是为了不透明而不透明。100 row × 20 Field 的 page 若用
keyed row object，会重复 72,000 UTF-8 bytes 的 36-char Field ID；单一 column header
只需 720 bytes，在 JSON quote/separator 之前已节省 71,280 bytes。Descriptor 仍暴露
stable Field ID/logical type，不需要 physical name 或 private code。

`ProjectionSpec` 恰为 `{fields:FieldId[],resolveRelations:FieldId[]}`。
`RowPage` 恰为
`{fileId,tableId,revision,projectionHash,columns,rows,nextCursor,previousCursor}`；
每个 cursor 必须显式为 string 或 null。`projectionHash` 是 JCS object
`{"fields":[...],"resolveRelations":[...]}` 的 lowercase hex SHA-256。`fields`
不得 duplicate；`resolveRelations` 去重、按其在 `fields` 中的出现顺序排列，是
`fields` subset 且只能含 Relation Field。UI rendering 前验证 page shape，绝不把
display name 当 lookup key。Columns 按
`fields`，rows 按 Runtime query order。

UI 消费的 Runtime schema page 暴露 stable ID、display name、logical type、role、
setting、definition、position、write flag；绝不暴露 `physical_name`、quoted identifier、
generated SQL 或 native metadata。Transport 添加这些 member 就不属于本 binding，
UI 也不得转发给 renderer。

`getRowsById` 只接受 unique Row ID；duplicate 是 `invalid-request`。返回的
`RowBatch` 与 `RowPage` 共享
`{fileId,tableId,revision,projectionHash,columns,rows}`，没有 cursor，另含
`missingRowIds`。Existing row 和 missing ID 各自保留 request order。UI 必须使用
`missingRowIds`，不能从 positional hole 推断 absence。

Formatting 是 presentation state。UI 可以 localize Number、Integer、Date、Datetime、
Checkbox，但 raw copy、edit initialization 和 mutation submission 必须使用 Runtime
binding。Display formatter 只有能 round-trip 整个 logical domain 时才能兼作 parser。

## 7. State ownership 与 invalidation

| State                                                                                                | Authority                           | UI rule                                         |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------- |
| source row、metadata、saved View query/layout、field settings                                        | Runtime 暴露的 File canonical state | 只从 Runtime result 展示，只通过 Runtime mutate |
| Formula/Lookup/inverse result、resolved label、query page、aggregate、dependency report              | Runtime-generated state             | 只按 File ID、revision、request hash cache      |
| file handle、lock、recovery journal、publication version、permission grant、asset capability         | Host-private state                  | 只能引用 opaque token                           |
| focus、selection、scroll、open panel、draft text、optimistic overlay、local undo cursor、placeholder | UI state                            | 除非明确 canonical mutation 需要，否则绝不提交  |

Page cache key 必须包括 File ID、revision、Table ID、canonical query hash、
projection hash、cursor 和 direction。Revision 改变后，所有未被明确声明对新 revision
仍有效的 page、aggregate、resolved label、preview、schema preflight token 都失效。
Partial ordinary schema-page sequence 也失效；schema-plan dependency sequence 只在
Runtime 明确规定的 retained plan token 和 immutable base revision 下仍可读取。
Optimistic overlay 与 page cache 分开保存。

Missing 或 logical-null Record Label 可以显示 localized placeholder。Placeholder 不是
logical value，不能作为 raw data copy，也不得出现在 Relation/row mutation 中。

## 8. 标准 View

[Eidos 标准视图 1.0](./eidos-standard-views-1.0.zh.md) 是 normative companion，
定义内建 `grid`、`gallery`、`kanban`、`calendar` 与 `form` View 的持久化
layout 含义、默认值、renderer 配置与 View-specific interaction。

现有 `EU-Viewer-1.0`、`EU-Editor-1.0` 与 `EU-Schema-1.0` profile 包含其中
适用的要求，不增加额外 conformance label。Eidos UI 仍拥有通用 RuntimeClient/
HostServices 消费、state、mutation、accessibility、localization 与 renderer-isolation
行为。

Unknown View type 与采用新版不受支持 query 语义的 View 遵循 Eidos 标准视图 1.0
第 3.3 节。UI 必须按该文档第 3.1 与 3.3 节保留 unknown 和 non-applicable layout
member。

## 9. Bounded read、projection 与 rendering

### 9.1 Request construction

UI 只请求当前 surface 需要的 Field：visible Field、Record Label、card/group Field、
Form question Field 和 Runtime-required query output。Relation label 必须在 page projection 中请求，
不能每个 Relation cell 一次 read。不适合自然分页的 bounded batch 使用
`getRowsById`；禁止在 row/cell render loop 中调用 `getRowsById`。

默认 page limit 是 `min(100, limits.pageSizeMax)`；资源受限设备可以更小，不得超过
negotiated limit。`ProjectionSpec.fields` 不超过 `projectionFieldsMax`，
`getRowsById.rowIds` 不超过 `rowsByIdMax`；默认 group-page limit 是
`min(50, groupPageSizeMax)`。相邻方向各最多 prefetch 一页；单 View unresolved page read 应不
超过三个。Conforming UI 的默认 cache 取八页或 10,000 projected row-field value
先达到者；实现可以允许用户配置更高值。

Cursor paging 是 baseline。Cursor 是 Runtime-scoped opaque value；UI 只回传。不得
decode cursor、从中合成 offset，也不得在 query、projection、File ID 或 revision
变化后复用。

`aggregate` 返回单一 `AggregateResponse`，不是 bare result array。Display 前，UI
验证 File ID、Table ID、revision、result count 和 request-key order。Active revision
不同则执行与 row page 相同的 snapshot reconciliation；不得把某 revision 的
aggregate 与另一 revision 的 row 合并展示为同一结果。

`groupRows` 为每个 returned group 返回第一批 bounded row。某组的
`nextRowCursor` 非 null 时，UI 原样传给
`queryGroupRows({cursor,limit,direction?})`；不得重复 `groupRows`、构造 ordinary row
query 或在本地猜测 membership 来继续该组。只有 File/Table/revision、projection
hash、column 和 exact group key 仍与 mounted group 一致，才接受 `GroupRowPage`。
其 forward/backward cursor 和 display-order rule 与 ordinary row cursor 完全相同。
Group-page cursor 继续 `groupRows`；组内 row cursor 只能通过 `queryGroupRows` 继续；
两类 namespace 绝不互换。

### 9.2 Virtualization

Grid、Gallery、Kanban、Calendar 在不 materialize 所有 row 的情况下仍须可交互。
Virtualization 是实现技术，不是 canonical state。Virtual item 用 Row ID 而不是
visual index 作 key，因而 reorder/filter/new revision 不能把 draft 或 selection
转移到另一个 row。

UI 可以把 Runtime total 当 estimate；必须容忍 unknown/changing total，在 focused
Row ID 仍存在时保持 focus，并 announce material result-count change。Scroll offset、
measured size、prefetch position 不得写入 `ViewDescriptor.layout`。

### 9.3 Latest-wins rule

每个 mounted result surface 维护 monotonically increasing local generation。
Table、View、query、search、projection 或 revision 改变时：

1. generation 加一；
2. 请求取消旧 read；
3. 以新 generation 发 read；
4. 只有 response generation 与 request hash 仍匹配时才应用。

旧 generation 的 late success、late error、late cancellation 全部丢弃。即使
transport 声称支持 cancellation 也必须执行本规则，因为 cancel 会与 completion race。

应用 current-generation `RowPage`/`RowBatch` 前，UI 验证 File ID、Table ID、
projection hash、column/value length、resolved Relation invariant 和 revision。
Page revision 与 active snapshot 不同时先 reconciliation snapshot；不能把两个
revision 的 row splice 到同一 surface。

### 9.4 不在本地执行权威语义

UI 可以展示 debounced preview，但 committed row set、order、group、aggregate、
Formula、Lookup、Relation resolution、logical-null behavior、search result 必须来自 Runtime。
UI 不得再对 Runtime page 做 locale sort/filter 并把它当 saved View result。对明确
标注、已经 fully loaded 的 ephemeral selection 做 client-side sort 不属于 saved View。

## 10. Field presentation 与 editability

Editability 由 Runtime `ColumnDescriptor.writable`、Field role 和 negotiated write
capability 决定。UI 不得从 `valueType` 或 `source` 推断 write permission。
`writable:false` 表示不能 cell commit；仍可以 filter、sort、copy、display。

| Field/role                         | Presentation                                       | Cell editability                                                                            |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Text、URL                          | scalar text；合格 URL 是经 policy-check 的 link    | editable stored value                                                                       |
| URL 且 `display.kind="image"`      | Host-leased image，再 inert URL fallback           | editable URL；presentation 不重写 value                                                     |
| Number                             | localized finite number，并提供 raw-copy path      | editable stored value                                                                       |
| Integer                            | lossless decimal input；可 localized display       | editable stored value                                                                       |
| Integer 且 `display.kind="rating"` | rating affordance 加 accessible numeric value      | editable Integer；display min/max 只引导 input，不得 clamp existing value                   |
| Checkbox                           | nullable 时 tri-state                              | editable stored value                                                                       |
| Date                               | 无 timezone 的 calendar date                       | editable stored value                                                                       |
| Datetime                           | localized instant，并明确 display timezone         | editable stored value                                                                       |
| JSON                               | structured 或 textual JSON editor                  | Runtime validation 后 editable                                                              |
| Select                             | raw option name 加 catalog color/label decoration  | editable；unconfigured raw name 仍可展示/选择                                               |
| Multi-select                       | ordered raw option-name chips                      | editable；保留 order                                                                        |
| File                               | image preview，再 type icon，再 inert URI fallback | 只能通过 Host acquisition（`acquireAsset` 或 `acquireRemoteAsset`）后 Runtime mutation 编辑 |
| forward Relation                   | ordered target Row ID 加 separate resolved label   | 通过 paged target selector 编辑                                                             |
| inverse Relation                   | generated source Row ID                            | read-only                                                                                   |
| Formula                            | generated declared result                          | read-only；definition 属 Schema UI                                                          |
| Lookup                             | generated scalar/list                              | read-only；definition 属 Schema UI                                                          |
| Row ID、created time、updated time | system value                                       | read-only                                                                                   |
| unknown optional Field kind        | typed/raw fallback 加 diagnostic                   | read-only；除非 registered isolated renderer 获得 explicit scoped writer capability         |

Table 当前 Record Label Field 在所有场合提供 row title，包括 Relation selector。
不能假设存在 `Title` 或 `Name` Field。切换 Record Label role 是 schema operation。
Label value/role 改变后 Relation presentation 必须动态更新；resolved label 绝不能写回
Relation cell。

Table settings surface 可以暴露可选 Content Field。Selector 只能提供普通 stored、
non-system Text Field 和明确的未设置选项。未配置 Content Field 时，打开记录保留标准
detail panel。配置后，在标准 Grid、Gallery、Kanban 或 Calendar surface 打开记录时，
应展示居中的 record page：Record Label 提供 page title，其他 Field 保持紧凑、可编辑的
metadata；Content Field 从通用列表移出，使用专用 Markdown preview/source editor。

Markdown presentation 是 generated、non-canonical state。Raw HTML 与不安全 URL
scheme 必须保持 inert；remote image 不能触发 ambient network fetch。External link 只能
通过 Host 的 explicit URL activation boundary 激活。编辑底层 Text value 时遵循普通
atomic row mutation 与 optimistic-state 规则。

每个面向用户的 Field 类型选择器，包括创建、转换、CSV mapping 以及 Formula
结果/展示类型控件，必须在关闭状态的 trigger 和每个菜单行中，用同一个 canonical
Field type icon 配合本地化类型名称。图标只是辅助信息：可见文字和 accessible name
仍然必须存在。

配置过的 Select 或 Multi-select option 出现在 Grid editor、记录界面、过滤控件、
card、group 或其他标准 UI surface 时，UI 必须保留其 catalog color decoration 和
可见 option name。已知 catalog color 不得退化成纯文字显示；颜色也不能成为 option
value 或 selection state 的唯一载体。

Unresolved Relation item 在原位置显示 Row ID 加 localized unresolved status。它不是
empty Relation，绝不能 silent remove。Detach 是 explicit ordered-ID mutation；以后
resolve 时只替换 generated presentation。

Option catalog 只是 decoration/input assistance。Catalog 中不存在的 value 显示为
unconfigured raw value，不能 replace/drop。Option rename 调用 Runtime 的 option-rename
schema/data migration；UI 不得把它实现成 label-only edit。

Select Field property surface 必须把 create-time default 展示为**无默认值**或恰好
一个 configured option。选择后通过 ordinary revision-checked schema path 提交
`settings.defaultOption`。rename 当前 default option 时，必须在同一 atomic option
rename 中 retarget default；删除当前 default catalog entry 时，必须在同一 metadata
mutation 中清除 default。Multi-select 不得显示此控件。UI 不通过预填 draft cell
模拟该行为：只有 create mutation 省略该 Field 时，Runtime 才应用 default。

Select 或 Multi-select editor 中显式的“新建选项”操作必须先提交完整、更新后的 Field
option catalog。只有 metadata mutation 成功后，UI 才能使用其返回的 revision 提交 cell
value。Catalog mutation 被拒绝或 stale 时不得发出 cell mutation；之后的 cell mutation
若失败，catalog entry 作为合法的零使用选项保留。此用户操作不同于 CSV import 中被禁止的
implicit option inference。

Date input 原样发送 calendar value。Datetime display 使用 user/Host 选择的 IANA
timezone identifier，并在 editor 附近清楚暴露。DST overlap/gap input 必须先得到
unambiguous instant 或 offset；提交值遵守 Runtime canonical UTC binding。Locale 与
timezone 是 UI state，除非 extension 明确定义 canonical setting。Host 可以把该选择
暴露为跟随系统的 preference 或固定 IANA zone。解析 preference 后，标准 Grid、card、
record detail、filter input 与 Calendar surface 必须对 Datetime、created-time、
updated-time 的展示及 Calendar day grouping 使用同一 zone。修改该 UI preference 不得
重写已存储的 instant 或 date-only value。

在标准文本展示中，不包含 user information 的非空 absolute `http:` 或 `https:` URL
可以激活。Grid 必须用 link affordance 展示合格 value，包括 link color，以及 pointer
hover 到文字时的下划线；在已渲染文字上 primary click 必须直接 dispatch 到 embedding
Host 的 URL activator，不得先打开 cell editor。点击文字之外的区域仍执行普通 Grid
selection；编辑继续使用 Grid 的显式 edit gesture。以 URL 展示的 scalar URL
Formula/Lookup result 也遵守该规则，但 value 仍为只读。

激活时 UI 传递 exact raw value，不得 fetch、probe、normalize 或写回。Embedding Host
必须独立验证 destination，并可以执行更严格的 navigation policy。Relative value、
不支持的 scheme、credential-bearing value、malformed value、超过 negotiated UI bound
的 value，或者 Host activator 缺失时，均保持 inert 且可 copy。Activation failure 只
报告错误，不改变 value。Desktop Host 通过 privileged external navigation boundary
打开合格 destination，不依赖 renderer `window.open`。

普通 URL Field 对 network fetch 保持 inert，不得只因 cell visible 就 fetch。Field
settings 声明 `display.kind="image"` 的 scalar URL Field 或 scalar URL
Formula/Lookup result，只有在
value 是 non-empty absolute `https:`、cell 位于 bounded rendered window、Host 声明
`https` 并实现 optional `resolveUrlImage` 且当前 policy 允许时，才可请求图片。Grid 与
image-capable card surface 使用 `AssetPresenter.loadImage`，对相同 URL 去重、限制并发、
取消 stale generation，并在 decode 或 eviction 后 release lease。release lease 后，UI 应在 session-scoped、以 exact URL 为 key
的 bounded memory cache 中保留近期 decoded image，避免 row 离开再进入 rendered window 时
重新发起 network request。该 cache 必须同时限制 entry count 与 estimated decoded bytes，
使用 LRU 等 bounded eviction，并在 Host session 或 authorization context 结束时清空；不得
成为 canonical state、cross-session/cross-authorization cache 或 persistent storage。URL 仍是 editable/copyable/exported value；empty、non-HTTPS、
denied、unsupported、failed 或 unavailable 时 fallback 为 inert text，绝不 mutation。
Record Label 与 Relation label 始终使用 text fallback，不触发该 image flow。

CSV import 可以基于 bounded header name 与 URL syntax 建议该 setting，但 planning/import
期间不得 fetch 或 probe image。该 setting 是 Field-wide default，因此 Grid 与其他
image-capable surface 共享；View layout 继续拥有 dimension、visibility、card cover 与 fit。
持久 setting 不授予 Host network authority。

File presentation 使用以下 deterministic ladder：

1. entry declared `mediaType` 为 `image/*` 时，UI 应在 item 处于 rendered surface
   期间请求 `thumbnail` lease，并通过 injected `AssetPresenter` 把返回资源渲染为 image。
   只有 `canUseAssets`、entry URI class、当前 Host policy、byte/decode limit 与
   concurrent-lease limit 都允许时才能请求。因此 `https:` 永远不会造成未经批准的
   network request；canonical inline Data URL 即使无需 network，也经过同一 Host boundary。
   Canvas-backed Grid 使用 `AssetPresenter.loadImage`，decode 完成后重绘对应 cell，并在
   row 离开 bounded render window 时 release lease。这个 optional presenter method 缺失
   时必须 fallback，不能改用 canonical URI。
2. thumbnail pending、denied、unsupported、unsafe、over-limit 或 failed 时，以及每个
   non-image entry，UI 应显示由 declared media-type family 的 trusted mapping 选择的
   non-executing icon。filename suffix 只能作为 display hint，不能作为 authority；
   unknown type 使用 generic file icon。显示 icon 不需要 asset resolution。
3. graphical icon presentation 不可用时，UI 必须把 inert raw `uri` 显示为可 select/copy
   text。即使 preview 或 icon 成功，每个 File surface 也必须通过 accessible detail/copy
   action 提供 URI fallback。长值可以 visual elide，但 lossless copy 暴露完整 string。

整个 ladder 中 entry `name` 都是 primary accessible label；media type 与 lossless size
应当可发现。Open/download 是 explicit user action：UI 请求对应 Host lease，再交给
`AssetPresenter.activate`；绝不 navigate 到 canonical URI。Preview/activation failure
仍保留 File entry、name、metadata 与 URI fallback，展示 diagnostic，且绝不 mutation。

## 11. Row editing 与 optimistic state

### 11.1 Atomic commit

Keystroke 只改 draft，不改 canonical state。Commit 发一个 `mutateRows` request，
包含 Field-ID-keyed logical value、最新 `expectedRevision`，以及 commit 后所需每个
value 的 `returning` projection。Success 从 `returnedRows` 与 revision 应用；若 UI
省略 `returning`，必须在展示 committed derived value 前 refetch。UI 不得用 draft
自己构造 authoritative success row。

Multi-cell paste 只在本地 parse/validate 作 preview，然后作为一个 atomic Runtime
mutation 提交。Rectangle 超过 negotiated row/cell/byte limit 时，UI 必须拒绝单次
paste，或在执行前明确说明 partial-commit behavior 后提供 labeled chunked import。
普通 paste 不得 silent split。

Delete 对 selected revision 捕获的 stable Row ID 操作。Visual range 在 delete request
前转成 Row ID。若 Runtime 提供 preflight，UI 展示 count 和 Relation/dependency
consequence。不得把 changed visual index range 转成另一组 row。

Success result 若 `changed:false`，就是 no-op：UI 移除 draft/overlay，但不能虚构新
revision、timestamp、dirty state 或 undo entry。`not-found` 零变更。Batch 含
duplicate/overlapping Row ID 时是 `invalid-request`；UI 修正 selection 后提交新
request，不能把 batch 的一部分当成 committed。

### 11.2 Optimistic 状态机

每个 edit batch 遵守：

| State        | 可进入                                      | 必须行为                                                                                                                             |
| ------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `clean`      | `drafting`                                  | 显示 canonical Runtime result                                                                                                        |
| `drafting`   | `submitting`, `clean`                       | draft 可辨识；Escape/cancel 丢弃                                                                                                     |
| `submitting` | `committed`, `rejected`, `stale`, `unknown` | optimistic overlay 仅 UI；disable duplicate submit                                                                                   |
| `committed`  | `clean`                                     | 用 returned row/revision 替换，invalidate old cache，必要时 announce success                                                         |
| `rejected`   | `drafting`, `clean`                         | 移除 overlay，保留可修正 input，把 Runtime diagnostic 关联到 Field                                                                   |
| `stale`      | `submitting`, `drafting`, `clean`           | 移除 overlay 并 refresh；verified-safe Field reapplication 可以回到 `submitting`，否则显示 conflict                                  |
| `unknown`    | `clean`, `drafting`                         | revoke 旧 Runtime client；只通过 Host reconciliation，安装 returned epoch 后 refetch，再判断是否安全发起新的 user-submitted mutation |

同一 Row+Field 同时只有一个 unresolved mutation 可以拥有 optimistic overlay。若
Runtime negotiation 允许，non-overlapping mutation 可以并行，但 expected revision
和 completion order 仍以 Runtime 为准。最简单的 conforming Editor 串行 mutation。

收到 `stale-revision` 后，rejected request 已知 rollback。UI 只有先获取 fresh
snapshot 和 current Row，才可以执行 verified-safe Field reapplication。UI 必须把
reapplication 当作使用 fresh revision 的新 mutation；仅凭 `retryable` 绝不构成授权。
只有同时满足以下条件，才允许自动 reapply：

- target Row 仍然存在；
- 每个 edited Field 都保持相同 stable descriptor，并且仍是没有 Relation、File、
  derived 或 system side effect 的普通 stored Field；
- 每个 edited Field 的 current logical value 都等于 UI 开始 drafting 前观察到的值；
- 对同一次 submission 最多自动 reapply 一次。

authoritative returned Row 和 revision 替换 optimistic state。第二次
`stale-revision`、target Field 已变化、value overlap 或 verification 失败时，回到
`stale` 并保留 draft，等待 explicit user choice。Unknown commit outcome、delete、
option rename、Relation policy effect、File import、schema/View change 和 lossy
conversion 不得自动 reapply。

### 11.3 Undo/redo

Undo 是新的 Runtime mutation，不是 byte rollback。每个 committed action 记录
returned revision、affected stable ID 与 Runtime 提供的 undo token。Undo request 使用
current revision 调 `revertMutation`；成功会消费该 token，redo 使用 result 返回的
inverse token。UI 删除 `evictedUndoTokens` 中列出的每个 token。Undo 较晚 action 后，
UI 可以继续使用下一个更早的 token，因为 Runtime 检查完整 affected-state
applicability，而不是 token 的 original revision。成功的 schema mutation 会清空 UI
的 row undo/redo history，因为 Runtime 会使这些 token 失效。

Editor 必须在 session open 期间为 successful single-row edit 和一次 atomic
paste/delete 提供 undo/redo。因此它要求 negotiated `mutationUndo`/
`revertMutation`；没有它们就不能声明 `EU-Editor-1.0`。不得声称可 undo 后再构造
不完整的 Relation/delete effect。中间出现 conflicting revision 时，undo 进入
conflict flow，不是 unconditional write。

Submission 前 cancel 只丢 UI state。Submission 后 cancel 请求 Runtime cancellation，
但必须等待 authoritative settlement：known rollback 进入 `rejected`，committed
success 优先，只有 `unknown-commit` 才进入 `unknown` 和 Host reconciliation flow。
它不是 Undo。

### 11.4 CSV operation

CSV export/import 分别 negotiation。只有 `csvExport=true` 且 `exportCsv` 存在时展示
export；只有 `csvImport=true` 且 `importCsv` 存在时展示 import；read-only binding
因此可以 export 而不能 import。UI 不得从一项 capability 推导另一项。

Export 提交 stable Field ID，在 result 的 File/Table/revision 下消费 returned owned
CSV octet。UI 不得把 bytes 当 JSON、base64 编入 Runtime payload，或把不同 revision
的 row 表示为同一 export。Import 提交 explicit CSV-index-to-Field-ID mapping、不超过
`csvBytesMax` 的 owned UTF-8 bytes 和 current `expectedRevision`。Header name 只作
advisory，绝不 resolve Field。Returned `createdRows` 和 revision 是 authoritative；
changed import 遵守与 row mutation 相同的 dirty state、unknown-commit reconciliation
和 optional undo-token rule。UI 可以 preview parsing、spreadsheet-formula risk 和
batching，但 Runtime 才是权威；UI 不得 silent split 一次 atomic import 或 auto-create
option value。

## 12. Schema 与 View editing

### 12.1 两阶段契约

每个 Table/Field structural change、Field conversion、Record Label change、option
rename 和 destructive delete 使用两阶段：

1. `preflightSchema({change, expectedRevision})` 返回 plan token、classification
   （`metadata-only`、`lossless-rewrite`、`explicit-lossy`、`forbidden`）、affected
   row count、total dependency count 和第一 dependency page、warning、value-change
   summary、truncation flag 和 expiry/binding；
2. UI 展示 structured result，允许时再调用
   `mutateSchema({planToken, expectedRevision, actionsHash,
confirmLossy:true?})`。

Token 是 opaque，Runtime 把它绑定到 File、revision 和 exact change。UI 不得 edit、
revision 改变后 reuse，或自行 manufacture。Returned `fileId` 必须与 active File
一致，`actionsHash` 必须和 token 原样一起发送。`forbidden` 不可 apply；
`explicit-lossy` 必须另有一次明确指出丢失内容的 confirmation，且只有该 action 后才
发送 boolean。Stale/expired plan 回到 preflight。

本地 name/Formula/type/layout check 都是 advisory。Commit control 仍必须走 Runtime
preflight/application；Runtime diagnostic 替换或补充 local diagnostic。

`dependencyCount` 是 total decimal-string count。Initial `dependencies` array 是第一
ordered page；存在 `dependencyCursor` 时，UI 用
`getSchemaPlanDependencies({planToken,cursor,limit})` 获取每个 continuation，原样
回传 `nextCursor` 直到 null。接受 page 前必须满足
`page.fileId === preflight.fileId === activeSnapshot.fileId`，并验证 base `revision`、
unchanged `dependencyCount`、stable-ID uniqueness，以及 table/field/view 后 ID 的顺序。
Plan expiry/eviction 重新 preflight；File revision 改变会阻止 apply，即使 Runtime 仍可
读取 immutable dependency page。UI 必须提供 complete dependency set 的 bounded paged
disclosure；在用户有机会遍历前不得 apply destructive/lossy plan。File-ID mismatch 是
protocol 或 stale-session failure；拒绝该 page，绝不展示为 dependency data。

`warningsTruncated` 与 `valueChangesTruncated` 相互独立。任何一项为 true，UI 必须
明显说明 negotiated diagnostic limit 省略了更多 ordered detail；仍展示从不 truncate
的 classification、`affectedRows`、`dependencyCount`。Visible prefix 不能冒充完整
impact report。

### 12.2 Rename 与 conversion

UI rename request 只包含 stable object ID 和 new display name。不得包含
`physical_name`、quoted SQL、alternate physical name 或 generated Formula SQL。
Reference rewrite 属 Runtime；Runtime 强制 stored object 的 physical name 与 display
name 精确相等。

只改变 rating presentation setting 是 Integer display-settings edit，不是 Field
conversion。Type conversion 使用 Runtime conversion matrix/plan classification。UI
必须展示 metadata-only、lossless rewrite、explicitly lossy 或 forbidden；不得从
SQLite coercion 或样本自行推断安全性。

UI 构造 exact tagged `convert-field` leaf。Scalar destination 始终含
`toNullable`；Multi-select/File 省略；Relation 则含完整 forward Relation definition。
Selected conversion control 按 Runtime canonical policy order 形成 unique `policies`
array。不得发送 singular `policy`、irrelevant policy、implicit nullability choice 或
incomplete Relation target。

Delete 当前 Record Label Field 时，同一 proposed schema change 必须提供 valid
replacement。Delete referenced Field/Table 时显示完整 Runtime dependency report；
dependency 即使在 hidden View/Field 中也不能隐藏。

### 12.3 View change

View name、type、saved query、layout 是带 `expectedRevision` 的 canonical mutation。
Search text、current tab、selection、collapsed UI panel、scroll、hover 都是 UI state，
不得写入 View metadata。

`create-view` 始终提供 explicit canonical int64-decimal `position`；update 只通过
`patch.position` 改 order。UI 从 latest View descriptor 推导值；若无可用 in-range
insertion position，则提交 intentional atomic position-patch set。不得省略 create
position、期待 Runtime append，或把 visual array index 当 persistent identity。

Layout edit 只更新 Eidos 标准视图 1.0 定义的 known key，并保留 unknown key。Saved query edit 发送
Field ID 和 Runtime logical filter value，不能发送 display/physical name。Operator/
type compatibility 和 query result 以 Runtime 为准。

Filter label 必须保留 Runtime 第 7.1 节的 total-Boolean semantics。具体而言，
**不是**发送 `ne`；**不包含**发送 `not(contains(...))`；**均不属于**对 scalar
发送 `not(in(...))`，对 list 发送 `not(has-any(...))`。这些 negative label 会包含
scalar Field value 为 null 的 row。产品不得用 raw SQL `<>`、`NOT LIKE` 或其他会
泄漏 SQL UNKNOWN 的 expression 实现它们。

**为空**与**不为空**是 shape-aware label。对 scalar 分别发送 `is-null` 与
`is-not-null`；对 Multi-select、File、Relation 或其他 list result 分别发送 `eq []`
与 `ne []`。Runtime list value 是 non-null，empty list 不用 null 表示。即使 editor
内部 compatibility model 使用不同 operator name，加载和保存 View 时也必须保留
这些语义。

Date 与 Datetime filter control 必须提供**是**、**早于**、**晚于**、**不晚于**、
**不早于**、**介于**、**相对今天**、**为空**与**不为空**。**介于**接收有顺序且包含
首尾的 lower/upper value，并发送 `between`。

**相对今天**提供 direction（**过去**、**未来**或**本期**）与 unit（**日**、**周**、
**月**或**年**），并发送一个 `relative-date` leaf。控件必须把 direction 与 unit 持久
保存在 View 中，绝不能把条件冻结为 absolute date。重新打开时必须保留两个选择；
reference instant、calendar-period rule 与 inclusive boundary 仍以 Runtime 为准。UI
应说明结果会随当前日期更新，也可以用日历预览计算区间，但预览不能成为 canonical state。

Eidos 标准视图 1.0 的通用 Fields 控件以及适用的 Grid、Card、Kanban、Calendar、
Form 控件是 Editor required surface，不是 optional authoring convenience。每个控件通过一次 revision-checked
View mutation 提交；当前 renderer 没有 row 或 visible Field 时仍须可用；成功或
conflict 后都必须反映最新返回的 View descriptor。

标准 workbar 的 query/layout action cluster 使用稳定顺序：**搜索、筛选、排序、字段**。
搜索是最左侧的 non-contextual action，字段紧跟在排序右侧。Schema creation
（`+ Property`）与 host action 位于该 cluster 之后，并与 Fields 保持独立，因为它们创建
或操作 resource，而不是配置 active View。

Fields 是唯一的主要 Field 浏览入口。每一行必须提供三个独立且无歧义的 target：显隐
checkbox 更新 View visibility，drag handle 更新适用的 Field order，名称/type target
打开 Field schema property。触发其中一个 target 不得连带触发另外两个。Grid column
header 的 property command 可以保留为 contextual shortcut，但 Editor 不得要求用户去
发现另一个 structure menu 才能查看 Field。

### 12.4 结构顺序交互

Table、View 与 Field 的顺序统一使用 direct-manipulation 交互模型。产品只要开放
canonical Table `position`、View `position`、`fieldOrder` 或 `cardFields` 顺序，就必须
提供可识别的拖拽 affordance，在这些 surface 使用一致的 drag-handle pattern，并且不得
用独立的“上移”“下移”、上箭头、下箭头按钮或 menu command 改变该结构顺序。

Reorder affordance 必须支持键盘操作：`Space` 或 `Enter` 开始和完成 keyboard drag；
drag active 时用方向键选择 insertion position；`Escape` 取消。UI 在不移动 focus 的
前提下 announce pickup、当前位置、drop 与 cancellation。该 keyboard drag contract
就是 non-pointer path；不得为了 accessibility 重新添加 up/down control。

一维 reorder list 必须把 drag feedback 限制在 primary axis。尤其 vertical Field 或
card-Field reorder 在拖拽时不得出现横向滚动条、横向 layout shift 或 cross-axis drop
position。

Drag result 只能用 stable ID 表达。UI 可以 optimistic projection，但必须提交一次带
revision check 的 atomic mutation（或 Runtime 规定的 atomic position-patch set）；成功后
用返回 descriptor 替换 projection，失败或 conflict 时恢复最后 authoritative order。
除非能精确保留所有未显示 member，否则 reorder list 被 filter 时必须 disable drag。

本规则只约束结构顺序。Saved row sort 的升序/降序、搜索结果的上一条/下一条以及
Kanban Row move 是 semantic operation，不会因此变成结构 reorder control。

### 12.5 Formula、Lookup、Relation definition

Formula editor 展示并提交 Runtime `sourceText`，其中 reference 是 quoted human
Field name。Autocomplete 按 Runtime grammar 插入 escaped quoted form；不得把
generated SQL、compiled AST 或 Field ID 当 human source 展示。Existing Formula 用
`fieldId` preview；新 Formula 用 `candidateName`。通过双击、Enter 或 Space 激活只读
Formula result cell 时，必须打开该 Formula editor。编辑器由记录单元格打开时，preview
request 必须把该记录放入 `rowIds`，使可见示例保持在用户当前上下文；编辑器还必须锚定
该来源单元格，并通过碰撞处理留在可见 workbench 内。从 Field settings 打开时可以使用
Runtime sample order 和 host 的全局编辑器位置。Resolved preview 的
`valid:false` 是 candidate-analysis result，不是 failed request；UI 展示 diagnostic，
不得读取省略的 inferred-type/dependency/row member。Thrown Runtime error 走普通
request handling；`diagnosticsTruncated` 始终披露。Preview diagnostic/sample value 对
commit 仍是 provisional；最终以 schema preflight/application 为准。Field rename 后，
UI refresh 并展示 Runtime rewrite 后的 source，不能自行 text substitution。

Lookup editor 用 stable ID 选择 Relation/target Field，展示 current name，且只提交
Runtime 的 `aggregate`、`distinctValues` setting。Lookup 1.0 没有独立 order setting：
Relation 和 nested-value occurrence order 才是权威。它不能在本地 authoritative
flatten、aggregate、type-check、cycle-detect 或拒绝 nested Lookup。Relation editor 通过
schema preflight 提交 target Table ID、inverse source Field ID、cardinality、deletion
policy；绝不创建 mirror value column。

## 13. Host lifecycle、conflict、recovery 与 asset

`HostSessionState.phase` 是：

```text
opening ready-readonly ready-clean ready-dirty publishing
commit-unknown conflict recovery-required fatal closed
```

State 还带 `sessionId`，适用时带 File ID、Runtime revision、
capability change、conflict token、recovery summary 和 redacted Host error。文件是否
published 以 Host state 为准；logical content 以 Runtime revision 为准。
Runtime revision、Host base/content token、Adapter `dataVersion`、request ID 属于
不同 namespace。UI 不得取得 Host base/content token 或 `dataVersion`、展示 token 或
相互替换；conflict/recovery token 只能回传给定义它的 operation。

UI 必须：

- `opening`：显示 progress 和有效 cancel；不能展示另一 session 的 stale content。
- `ready-readonly`：只读展示。用户请求 edit 时，说明所需 access；仅当
  `canRequestPermission` 为 true 且由用户 action 触发时调用
  `requestWritePermission`。Grant 后必须重新 negotiate Runtime/Host capability、
  refresh snapshot，之后才能 enable write。
- `ready-clean`：把 Runtime revision 展示为匹配 opened 或 published Host baseline，
  并移除 dirty indicator。不得声称本 session 发布了一个最初只是打开的 file。
  `durability` 为 `best-effort` 时不得声称 crash-durable。只读 original source 仍可在
  writable private Runtime 中为 ready-clean 且可编辑，此时
  `canWriteCurrent=false`、`canSaveCopy=true`。
- `ready-dirty`：区分 session 内 committed data 和按 negotiated durability
  successfully published 的 data；只有 negotiated 且 disclosed 时可 autosave。
- `publishing`：阻止 duplicate save 并 disable 新 canonical mutation；mutation race
  由 Host 在执行前以 Runtime `busy` 拒绝。可以继续 row read。Close 等待或请求
  mandatory Host cancellation contract；replacement 开始后，UI 等待 verified
  publish/recovery outcome。
- `commit-unknown`：冻结所有 canonical Runtime operation 并 revoke 旧 RuntimeClient。
  提供 bounded reconciliation progress/cancel semantics；当
  `canReconcileCommit=true` 时调用 `reconcileCommit`。不得暴露 raw receipt、允许 retry
  或读取旧 epoch。State 省略 `revision`，因为 outcome 尚未证明，但可以保留 known
  File ID。只安装和 bootstrap 为 decided outcome 返回的 replacement Runtime。
- `conflict`：停止 save 与 automatic write replay；只提供 negotiated action。
  `reload` 警告 unpublished change；`save-copy` 保存 separate copy；`merge` 展示
  Host/Runtime merge diagnostic。
- `recovery-required`：展示 Host recovery summary 和 report 提供的 action，不得
  silent choose candidate。
- `fatal`：安全时保留可 export draft，给出 redacted explanation，只提供 safe retry。

Offline storage、缺失 writer lease、暂时不可 publication 时，session 保持明显的
`ready-dirty`；UI 不得改称 saved。只在 capability 可用时提供 retry/Save Copy，并
保留 Host recovery guidance。

Dirty session 调 `close` 前，UI 提供 `save`、`discard`、`cancel`。`save` 先完成
publication；`cancel` 不调用 `close`；只有 explicit `discard` 直接 `close`。关闭窗口
不等于 implicit discard；recovery discard 也必须 explicit user action。

`AssetLease` 只含 `leaseId`、`entryId`、purpose、media type、name、lossless int64
decimal-string `size`、expiry 和 presentation-safe opaque URL/token。UI 必须执行
negotiated size/lease limit，surface 移除时 release，expiry/session close 后停止使用。
不得把 File-entry URI 变成 network request，不得让 active content 继承 application
origin，不得跨 File/session 使用 lease。
UI 只能把 lease 交给 injected `AssetPresenter` 或精确等价的 platform-native presenter；
可复用 UI package 不得使用把 canonical relative/`https:`/`data:` URI 直接返回为
presentation URL 的 default identity resolver。

`acquireAsset` 返回 Host-staged File-entry logical object，其 ID 由 Runtime 分配。UI
在 sparse Runtime mutation 中原样提交，只能 reorder/remove 整个 entry；不得
manufacture/rewrite `uri`、`size`、`mediaType` 或 asset ID。Row mutation 失败也不
授权 UI 删除 acquired asset；cleanup 属 Host policy。

当 optional `acquireRemoteAsset` 存在且 `assetWriteSchemes` 包含 `https` 时，可编辑
File surface 应提供显式“从 URL 添加”操作。该操作接收一个 absolute HTTPS URI 和
optional display filename，再将两者提交给 Host。普通 paste、CSV import、render、scroll
以及打开 File editor 都不得隐式调用该操作。Host 返回由 Runtime 分配的 `FileEntry`；
UI 对它执行与 `acquireAsset` 相同的 unchanged-object 与 failed-mutation 规则。缺少该
operation 或 capability 时隐藏或禁用入口，但不会使已有 HTTPS File entry 失效。

Asset preview 是 untrusted content。HTML、带 active feature 的 SVG、PDF、office
document、media metadata 必须按 Host isolation/download policy render。Preview
失败绝不修改或删除 File logical value。

## 14. Renderer、plugin 与 isolation

Embedding application 明确 trust、statically linked 的 renderer 可以在 application
realm 运行。只传 `RuntimeClient` 不等于 sandbox；代码仍可行使该 client 全部
capability 和 realm ambient authority。产品必须标为 trusted application code，不能
宣称 security boundary。

Third-party 或 file-supplied renderer 必须在 separate restricted realm/process 运行。
它只取得针对 selected File/Table/View/query/projection/asset-purpose/mutation 的 proxy
capability。Host 验证每个 proxied request；在 renderer UI 隐藏 method 不是授权。

Web Host 中，untrusted code 必须使用 cross-origin sandboxed frame 或 dedicated Worker
及 structured-clone message boundary。Sandboxed frame 不得把 script execution 与
same-origin authority 组合成可 escape sandbox 的配置。Desktop Host 必须提供 context
isolation 加 separate renderer/worker process 或等效 restricted realm。禁止 raw native
IPC、Node/process global、filesystem API、HostServices 与 unscoped RuntimeClient。

Message 必须 schema-validated、bounded、按 request ID correlate；任何会扩大 authority
的 unexpected member 都拒绝。Cancellation/close revoke outstanding capability。
Renderer output 按 untrusted 处理：text 不是 HTML、URL activation 要 policy check，
accessibility 要求仍适用。

没有 renderer 时仍保留 unknown View metadata。安装或卸载 renderer 本身不 rewrite
View。

## 15. Accessibility、keyboard、localization 与 motion

### 15.1 Baseline

Conforming standard View 以及完整 edit/save/conflict/recovery process 必须达到
WCAG 2.2 Level AA。Interactive tabular Grid 应遵循 WAI-ARIA APG Grid pattern，同时
仍直接满足 WCAG；APG example 是 guidance，不能代替测试。

每个 value/control 都有从 user-visible Table/Field/View name 与 purpose 推导的
accessible name。Color/icon/position/motion 不能单独承载 type、selection、option、
error、dirty 或 conflict state。Status、validation、save、result-count change 用
non-disruptive status message，除非必须即时处理。

Virtualized content 必须在已知时暴露正确 logical row/column count、rendered item
logical index，并保持 persistent accessible focus target。没有 equivalent semantic
interaction surface 的 canvas-only representation 不符合。

### 15.2 Keyboard contract

Grid：

| Key                              | 不在 editor 内时的必须结果                                  |
| -------------------------------- | ----------------------------------------------------------- |
| `Tab` / `Shift+Tab`              | 把 Grid 当成一个 tab stop 进入/离开；不能 tab 遍历每个 cell |
| Arrow keys                       | 移动一个 logical cell；必要时请求下一 bounded page          |
| `Home` / `End`                   | current row 的 first/last cell                              |
| 平台 `Ctrl/Command+Home` / `End` | first/last logical cell；允许 bounded loading/progress      |
| `Enter` 或 `F2`                  | 进入 focused editable cell；否则 activate primary action    |
| `Escape`                         | cancel current draft/editor；第二次关闭 transient UI        |
| `Space`                          | toggle applicable checkbox/selection，不滚动                |
| 平台 copy/paste shortcut         | copy raw logical value 或打开 atomic paste preview          |
| `Delete` / `Backspace`           | selection/editability check 后才 request clear/delete       |

Active cell editor 拥有普通 text-navigation key，并说明 commit/cancel。Focus 必须可见、
不被遮挡。Gallery/Kanban 提供等效 linear keyboard navigation 与 named group/card。
结构性的 Table/View/Field reorder 遵循第 12.4 节 keyboard drag contract，且不得添加
up/down control；不属于结构排序的 Row/card move 必须提供 non-drag alternative。

### 15.3 Localization 与 time

UI text、accessible name、formatting、input affordance 可本地化。Canonical option
name 和 user-authored Table/Field/View name 是 data，不得翻译。Unicode input 原样
保留。

Locale formatting 不改变 raw copy/mutation value。Date 无 timezone；Datetime 是在
明确选择的 IANA timezone 展示的 instant，tooltip/detail 必须可看到 zone/offset。
Ambiguous local input 提交前解决，不能 silent guess。

UI 必须尊重 platform reduced-motion preference。没有 animation 时 essential state
change 仍可感知；animation 不得 block input、encode canonical state 或延迟
commit/cancel semantics。

## 16. Error、security 与 resource limit

Runtime error 使用 stable envelope
`{code,message,retryable,path?,fileId?,tableId?,fieldId?,rowId?,currentRevision?,details?}`；`path` 是 logical
request path，绝不是 filesystem path。行为由 Runtime/Host structured error code
驱动。Host baseline code 是 `invalid-request`、`unsupported`、`invalid-source`、
`conflict`、`permission-denied`、`source-changed`、`writer-unavailable`、
`publication-failed`、`recovery-required`、`asset-unavailable`、`cancelled`、
`deadline-exceeded`、`resource-limit`、`io-error`、`unknown-commit`、`closed` 与
`fatal`。Human
message 是 localized UI text；ordinary UI/renderer 不得看到 raw
SQLite message、generated SQL、native stack trace、path、token、handle。单独开启的
diagnostic export 可以含 redacted detail。

`RuntimeDiagnostic` 必须不 narrowing 地消费。尤其
`semantic-cycle.relatedFieldIds` 是 Runtime 的 exact ordered closed cycle；UI 保留该
stable-ID sequence，可以用同一 schema revision 的 name decoration。不得 reorder、
deduplicate、用 name 替换，或只因参与 Field 被 hidden 就丢弃。

只有 idempotent read 可以 bounded、cancelable auto retry。Mutation、save、conflict、
recovery action 在 completion status 已知前不得 retry。Authentication/permission
denial 不触发循环。

User-authored string 都是不可信输入，默认按 text render。Markdown、HTML、Formula、
URL、SVG、asset metadata 不授予 script/navigation/network/filesystem authority。
Clipboard export 按目标 format escape；paste 是 data，不是 executable markup。

UI 必须遵守每项 negotiated Runtime/Host limit，并自行 bound：

- unresolved read、mutation batch、rendered row/card、cached page、Relation selector
  result、diagnostic、undo history；
- Formula preview row 和 frequency；
- asset byte、decode dimension、concurrent lease、object-URL lifetime；
- 调 Runtime 前的 filter depth 和 UI-generated query node；
- renderer message size、rate、lifetime、outstanding request count。

达到 limit 时显示 recoverable accessible state 和 bounded alternative。不得 silent
truncate logical value、Relation list、paste、delete selection 或 schema impact report。

## 17. Conformance test 与可执行 transcript

### 17.1 Harness protocol

UI conformance harness 提供 mock `RuntimeClient`/`HostServices`，并从 accessibility
tree 驱动 semantic action。Transcript 是 JSON array，每个 step 恰好包含一种：

- `mock`：注册 pending/immediate method result/error；
- `user`：在 accessible target 执行 semantic action；
- `resolve`：settle 已注册 pending call；
- `expectCall`：断言 method 和 partial argument；
- `expectNoCall`：断言当前没有匹配 call；
- `expectUI`：断言 accessible state、logical target 或 visible raw value。

未知 step member 禁止。`mock.id` 与 `resolve.id` correlate，并作为 matching call 的
harness-assigned `requestId`；`expectCall`/
`expectNoCall` 可以带 `args`/`after` constraint。`expectUI:"state"` 使用本文
state name。
Implementation adapter 把 `cell:<row-id>:<field-id>` 等 semantic target 映射到 control；
测试不依赖 DOM framework 或 pixel。

Step grammar 是 exact：`mock` 带 `id`，以及 `pending:true`、`result`、`error` 中
恰好一个；immediate result/error settle 下一个 matching call。`resolve` 带先前 ID，
并带 `result` 或 `error` 中恰好一个，除非 result 已在 mock 注册。`user` 可以带
`target`、`value`、`to`、`policy` 和/或 `fixture`；`fixture` 若存在，是一个包含该
semantic action 的 named harness input 的 object。`expectCall` 可带
partial-JSON `args`；`expectNoCall` 可带 correlation `after`；`expectUI` 带 `target`
和/或 `value`。Partial JSON matching 对 object 做 recursive member match，对 scalar/
array 做 exact match。

### 17.2 Required vectors

下面 JSON 是最小 executable transcript set；其中 UUID 都是 syntactically valid
fixture identifier：

```json
[
  {
    "vector": "EU-VIEW-INT64-RELATION-001",
    "profile": "EU-Viewer-1.0",
    "steps": [
      { "mock": "runtime.queryRows", "id": "page", "pending": true },
      {
        "user": "open-view",
        "target": "view:0198c6b9-c9a3-7cb9-82d0-dfb39d51c461"
      },
      {
        "resolve": "page",
        "result": {
          "fileId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c450",
          "tableId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c462",
          "revision": "7",
          "projectionHash": "b0808415331f82d371d9a04511dcbaed7ab22fffb20bafd26b0f5bfedade022c",
          "columns": [
            {
              "fieldId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e",
              "name": "Score",
              "valueType": "integer",
              "source": "stored",
              "writable": true
            },
            {
              "fieldId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c460",
              "name": "Project",
              "valueType": "relation",
              "source": "stored",
              "writable": true
            }
          ],
          "rows": [
            {
              "id": "0198c72d-82b5-7968-b163-98be4b747702",
              "values": [
                "9223372036854775807",
                ["0198c72d-82b5-7968-b163-98be4b747703"]
              ],
              "resolvedRelations": [
                {
                  "column": 1,
                  "items": [
                    {
                      "id": "0198c72d-82b5-7968-b163-98be4b747703",
                      "state": "resolved",
                      "labelFieldId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c464",
                      "labelType": "text",
                      "label": "Roadmap"
                    }
                  ]
                }
              ]
            }
          ],
          "nextCursor": null,
          "previousCursor": null
        }
      },
      {
        "expectUI": "raw-value",
        "target": "cell:0198c72d-82b5-7968-b163-98be4b747702:0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e",
        "value": "9223372036854775807"
      },
      {
        "expectUI": "relation-label",
        "target": "cell:0198c72d-82b5-7968-b163-98be4b747702:0198c6b9-c9a3-7cb9-82d0-dfb39d51c460",
        "value": "Roadmap"
      },
      { "expectNoCall": "runtime.getRowsById" }
    ]
  },
  {
    "vector": "EU-VIEW-LATEST-WINS-002",
    "profile": "EU-Viewer-1.0",
    "steps": [
      { "mock": "runtime.queryRows", "id": "old", "pending": true },
      { "user": "set-search", "value": "old" },
      { "mock": "runtime.queryRows", "id": "new", "pending": true },
      { "user": "set-search", "value": "new" },
      { "expectCall": "runtime.cancel", "args": { "requestId": "old" } },
      {
        "resolve": "new",
        "result": {
          "fileId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c450",
          "tableId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c462",
          "revision": "7",
          "projectionHash": "4efcb37076a87698cbe05b2dd2c08d6b185db2a5bebcf2dafccdc772f32fd76a",
          "columns": [],
          "rows": [
            { "id": "0198c72d-82b5-7968-b163-98be4b747704", "values": [] }
          ],
          "nextCursor": null,
          "previousCursor": null
        }
      },
      {
        "resolve": "old",
        "result": {
          "fileId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c450",
          "tableId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c462",
          "revision": "7",
          "projectionHash": "4efcb37076a87698cbe05b2dd2c08d6b185db2a5bebcf2dafccdc772f32fd76a",
          "columns": [],
          "rows": [
            { "id": "0198c72d-82b5-7968-b163-98be4b747705", "values": [] }
          ],
          "nextCursor": null,
          "previousCursor": null
        }
      },
      {
        "expectUI": "row-visible",
        "target": "row:0198c72d-82b5-7968-b163-98be4b747704"
      },
      {
        "expectUI": "row-absent",
        "target": "row:0198c72d-82b5-7968-b163-98be4b747705"
      }
    ]
  },
  {
    "vector": "EU-EDIT-STALE-003",
    "profile": "EU-Editor-1.0",
    "steps": [
      { "mock": "runtime.mutateRows", "id": "edit", "pending": true },
      {
        "user": "edit-cell",
        "target": "cell:0198c72d-82b5-7968-b163-98be4b747702:0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e",
        "value": "9"
      },
      { "user": "commit-cell" },
      {
        "expectCall": "runtime.mutateRows",
        "args": {
          "expectedRevision": "7",
          "tableId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c462"
        }
      },
      {
        "resolve": "edit",
        "error": {
          "code": "stale-revision",
          "message": "revision changed",
          "retryable": true,
          "currentRevision": "8"
        }
      },
      { "expectUI": "state", "value": "stale" },
      { "expectNoCall": "runtime.mutateRows", "after": "edit" },
      {
        "expectUI": "conflict-visible",
        "target": "cell:0198c72d-82b5-7968-b163-98be4b747702:0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e"
      }
    ]
  },
  {
    "vector": "EU-SCHEMA-LOSSY-004",
    "profile": "EU-Schema-1.0",
    "steps": [
      { "mock": "runtime.preflightSchema", "id": "plan", "pending": true },
      {
        "user": "request-field-conversion",
        "target": "field:0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e",
        "to": "integer",
        "policy": "truncate-toward-zero"
      },
      {
        "expectCall": "runtime.preflightSchema",
        "args": {
          "expectedRevision": "7",
          "change": {
            "kind": "convert-field",
            "fieldId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e",
            "to": "integer",
            "toNullable": true,
            "policies": ["truncate-toward-zero"]
          }
        }
      },
      {
        "resolve": "plan",
        "result": {
          "fileId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c450",
          "planToken": "opaque-plan",
          "baseRevision": "7",
          "actionsHash": "ac3a9dc4e728647eb4256a525e0b1dba561e604cbc2140fe6372ee9fa1a33b8e",
          "classification": "explicit-lossy",
          "affectedRows": "12",
          "dependencyCount": "0",
          "dependencies": [],
          "warnings": [
            {
              "code": "fraction-loss",
              "severity": "warning",
              "fieldId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e"
            }
          ],
          "warningsTruncated": false,
          "valueChanges": [
            {
              "code": "fraction-truncated",
              "rows": "12",
              "tableId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c462",
              "fieldId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e"
            }
          ],
          "valueChangesTruncated": false,
          "expiresInMilliseconds": 300000,
          "expiresAt": "2026-07-21T12:05:00.000Z"
        }
      },
      { "expectUI": "lossy-confirmation", "value": "12" },
      { "expectNoCall": "runtime.mutateSchema" },
      { "user": "confirm-lossy" },
      {
        "expectCall": "runtime.mutateSchema",
        "args": {
          "planToken": "opaque-plan",
          "expectedRevision": "7",
          "actionsHash": "ac3a9dc4e728647eb4256a525e0b1dba561e604cbc2140fe6372ee9fa1a33b8e",
          "confirmLossy": true
        }
      }
    ]
  },
  {
    "vector": "EU-LAYOUT-PRESERVE-005",
    "profile": "EU-Editor-1.0",
    "steps": [
      {
        "mock": "runtime.mutateView",
        "id": "layout",
        "result": {
          "fileId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c450",
          "revision": "8",
          "changed": true,
          "createdViews": [],
          "affectedViewIds": ["0198c6b9-c9a3-7cb9-82d0-dfb39d51c461"]
        }
      },
      {
        "user": "set-row-density",
        "target": "view:0198c6b9-c9a3-7cb9-82d0-dfb39d51c461",
        "value": "compact",
        "fixture": {
          "layout": {
            "rowDensity": "standard",
            "vendor.example": { "mode": "x" }
          }
        }
      },
      {
        "expectCall": "runtime.mutateView",
        "args": {
          "expectedRevision": "7",
          "changes": [
            {
              "kind": "update-view",
              "viewId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c461",
              "patch": {
                "layout": {
                  "rowDensity": "compact",
                  "vendor.example": { "mode": "x" }
                }
              }
            }
          ]
        }
      }
    ]
  },
  {
    "vector": "EU-HOST-ASSET-006",
    "profile": "EU-Viewer-1.0",
    "steps": [
      {
        "user": "activate-preview",
        "target": "file-entry:0198c6b9-c9a3-7cb9-82d0-dfb39d51c463"
      },
      {
        "expectCall": "host.resolveAsset",
        "args": {
          "entryId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c463",
          "purpose": "preview"
        }
      },
      { "expectNoCall": "network.fetch-entry-uri" },
      { "user": "close-preview" },
      { "expectCall": "host.releaseAsset" }
    ]
  },
  {
    "vector": "EU-SCHEMA-DEPENDENCY-PAGE-007",
    "profile": "EU-Schema-1.0",
    "steps": [
      {
        "mock": "runtime.preflightSchema",
        "id": "dependency-plan",
        "pending": true
      },
      {
        "mock": "runtime.getSchemaPlanDependencies",
        "id": "dependency-page",
        "pending": true
      },
      {
        "user": "request-field-rename",
        "target": "field:0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e",
        "value": "Score 2"
      },
      {
        "expectCall": "runtime.preflightSchema",
        "args": {
          "expectedRevision": "7",
          "change": {
            "kind": "rename-field",
            "fieldId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e",
            "name": "Score 2"
          }
        }
      },
      {
        "resolve": "dependency-plan",
        "result": {
          "fileId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c450",
          "planToken": "opaque-dependency-plan",
          "baseRevision": "7",
          "actionsHash": "3766fcc1be2fdb1265bc3ee6e64ff6276cedeb3e4a7b3e52b24836e1b0018169",
          "classification": "lossless-rewrite",
          "affectedRows": "0",
          "dependencyCount": "2",
          "dependencies": [
            { "object": "field", "id": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45f" }
          ],
          "dependencyCursor": "opaque-dependency-cursor",
          "warnings": [
            {
              "code": "dependent-source-rewritten",
              "severity": "info",
              "fieldId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45f"
            }
          ],
          "warningsTruncated": false,
          "valueChanges": [],
          "valueChangesTruncated": false,
          "expiresInMilliseconds": 300000,
          "expiresAt": "2026-07-21T12:05:00.000Z"
        }
      },
      {
        "expectCall": "runtime.getSchemaPlanDependencies",
        "args": {
          "planToken": "opaque-dependency-plan",
          "cursor": "opaque-dependency-cursor"
        }
      },
      {
        "resolve": "dependency-page",
        "result": {
          "fileId": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c450",
          "revision": "7",
          "dependencyCount": "2",
          "dependencies": [
            { "object": "field", "id": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c460" }
          ],
          "nextCursor": null
        }
      },
      { "expectUI": "schema-dependency-count", "value": "2" },
      {
        "expectUI": "schema-dependency-visible",
        "target": "field:0198c6b9-c9a3-7cb9-82d0-dfb39d51c460"
      }
    ]
  }
]
```

此外所有 profile 必须测试 logical null/empty、unknown View/layout preservation、advisory 与
authoritative validation、cancellation race、limit error、accessible keyboard
completion、reduced motion、localized format/raw round-trip、permission denial、
conflict、recovery、asset expiry、injected HostServices/AssetPresenter、relative/
`https:`/`data:` entry 从 image thumbnail 到 media icon 再到 lossless URI 的 fallback、
zero direct URI fetch/navigation，以及 isolated-renderer capability revocation。Editor 还须
覆盖 atomic paste、delete/undo、stale conflict，以及 Host commit-reconciliation 的
三种 outcome；必须断言 fatal 旧 RuntimeClient 上没有任何 read/retry，并对每个 returned
replacement client 完整执行 negotiation/snapshot/schema bootstrap。Editor 还须覆盖
Table、View、`fieldOrder`、`cardFields` 的 pointer 与 keyboard drag completion，并断言
不存在结构性的 up/down control。还必须执行 Eidos 标准视图 1.0 中适用的
conformance tests，包括五种内建 type、所有 View 专用 key、type change 时
non-applicable/unknown key 的保留，以及 generated aggregate/group result 绝不进入
layout。Schema 还须覆盖
四种 conversion classification、dependency paging/display、display-name-only rename、
plan expiry。

## 18. 引用

以下一手规范直接支撑本文要求：

- [Eidos File Format 1.0](./eidos-file-1.0.md)
- [Eidos Runtime 1.0](./eidos-runtime-1.0.md)
- [Eidos Adapter 1.0](./eidos-adapter-1.0.md)
- [Eidos 标准视图 1.0](./eidos-standard-views-1.0.zh.md)
- [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) 与
  [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) — normative terminology
- [RFC 2397](https://www.rfc-editor.org/rfc/rfc2397) — inline Data URL 与其
  media-type security boundary
- [RFC 6454](https://www.rfc-editor.org/rfc/rfc6454) — non-server-based URI 的
  origin isolation
- [JSON Schema Draft 2020-12 Core](https://json-schema.org/draft/2020-12/json-schema-core)
  与 [Validation](https://json-schema.org/draft/2020-12/json-schema-validation)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — accessibility conformance
- [WAI-ARIA APG Grid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)
  — interactive grid role 与 keyboard guidance
- [WHATWG HTML Workers](https://html.spec.whatwg.org/multipage/workers.html)、
  [structured clone](https://html.spec.whatwg.org/multipage/structured-data.html#safe-passing-of-structured-data)、
  [iframe sandboxing](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox)
  — isolated Web execution 与 message boundary
- [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) — timestamp input basis
- [IANA Time Zone Database](https://www.iana.org/time-zones) — display timezone identifier

实现本规范不要求 React、任何 component/grid library、特定 rendering engine、pixel
system 或 Eidos application 源码。
