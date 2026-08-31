# Eidos Runtime 1.0 中文参考

状态：最终开放规范  
版本：1.0  
发布日期：2026-07-21  
修订日期：2026-08-08\
规范语言：英文

## 摘要

Eidos Runtime 是面向 [Eidos File Format 1.0](./eidos-file-1.0.zh.md)
数据库、与平台无关的逻辑引擎。它把 canonical SQLite 状态转化为使用 stable ID
的 schema descriptor、typed value、集合式 query、derived Field、atomic mutation、
conversion plan、validation report 和 revision event。因此，conforming
implementation 无需依赖 Eidos 产品源码，即可为 CLI、server、browser Worker、
Desktop process 或其他 editor 提供支持。

Runtime 从不打开 pathname、持有 native file handle、请求用户 permission、发布
文件字节或定义 presentation behavior。这些职责属于
[Eidos Adapter 1.0](./eidos-adapter-1.0.zh.md) 和
[Eidos UI 1.0](./eidos-ui-1.0.zh.md)。Runtime 接收一个已经打开的
`ConnectionPort`，以及明确提供的 clock、entropy 和 cancellation input。

## 本文档的地位

仅当 **MUST**、**MUST NOT**、**REQUIRED**、**SHALL**、**SHALL NOT**、
**SHOULD**、**SHOULD NOT**、**RECOMMENDED**、**NOT RECOMMENDED**、**MAY**
和 **OPTIONAL** 这些关键词全部以大写形式出现时，才应按 BCP 14 的说明解释。

英文文档是规范正文；中文文档是资料性参考。除非明确作为 exact shape、
algorithm、grammar、schema、truth table 或 conformance vector 引入，否则示例均为
资料性内容。

2026-08-08 修订属于 conformance correction：较早文本让 Filter node 继承了 SQL
three-valued logic。第 7.1 节现明确 intended total-Boolean product semantics，包括
null-inclusive negative predicate。Formula 的 null propagation 仍由第 9.3 节独立定义。

## 1. 在规范栈中的位置、范围与一致性

依赖边界如下：

```text
UI or processing tool
        |
        v
Runtime public service       logical IDs, values, queries, mutations, errors
        |
        v
Connection/environment ports SQL values, transactions, time, entropy, cancel
        |
        v
Eidos File Format            canonical bytes, schema, raw values, revision
```

Runtime 拥有：

- logical Field type 与无损 public value binding；
- raw storage 之上的 Reference Policy enforcement；
- Relation resolution、Formula parsing/evaluation 与 Lookup evaluation；
- filter、search、sort、keyset paging、grouping、aggregation 与 Field-aware summary；
- row、View 与 schema mutation semantics；
- conversion classification 与精确 conversion algorithm；
- optimistic revision concurrency、generated dependency state 与 error；
- semantic validation 与 Runtime conformance test。

Runtime 不拥有：

- SQLite container identity、metadata DDL、physical-name rule 或 canonical raw
  encoding；这些属于 File Format；
- path/handle access、driver ABI、lock、publication、recovery、asset、Worker/
  process transport 或 durability；这些属于 Adapter；
- layout meaning、input control、optimistic presentation、accessibility 或
  renderer isolation；这些属于 UI。

一致性 profile 如下：

- **ER-Reader-1.0**：打开一个符合 EF-Reader 的文件；暴露本规范规定的 schema、
  logical value、query、Relation、Formula、Lookup、aggregate/summary/group 与 validation
  behavior。
- **ER-Writer-1.0**：ER-Reader 加上 canonical row、View 和 schema mutation、
  conversion、revision postcondition 与 rollback behavior。它要求
  `EF-Writer-1.0` storage implementation。
- **ER-System-Merge-1.0**：由
  [Eidos 系统元数据合并 1.0](./eidos-system-metadata-merge-1.0.zh.md) 定义的可选 draft
  profile。它增加确定性三方 system metadata merge 并要求 ER-Writer；ER-Writer 不会
  自动隐含它。

implementation MUST 分别公布它支持的每一个标签。ER-Writer 蕴含 ER-Reader。
两者均不蕴含任何 Adapter 或 UI profile。

## 2. 术语与全局不变量

- **Canonical state**：由 Eidos File Format 持久化的状态。
- **Logical value**：Runtime 对一个 canonical raw value 或一个求值后的 virtual
  Field 所作的无损 typed interpretation。
- **Generated state**：可从 canonical state 派生出的 AST、dependency edge、
  compiled SQL、cursor、index、statistics、resolved label 与 cache。
- **Runtime instance**：绑定到一个 File ID 与一个已打开 `ConnectionPort` epoch
  的 logical engine。
- **Revision**：`eidos__meta.revision` 中的非负 signed int64，在 public boundary
  绑定为 canonical decimal string。
- **Request**：一个 public operation 及其 `RequestContext`。
- **Actual change**：canonical state 中已提交的差异。重写相同 canonical value
  不属于 actual change。
- **Plan**：generated、opaque、绑定 revision 的 schema preflight result。

Runtime 生成的 cursor、plan token 或 undo token 是匹配
`[A-Za-z0-9._~-]+` 的 1..256 个 ASCII octet。其 spelling 没有 semantics，
client 只按指示比较或返回它。caller request ID 是 1..128 个 UTF-8 octet，
不含 U+0000，除此之外均为 opaque。这些固定 bounds 参与 request/response
accounting；`evictedUndoTokens` array 还受 `undoEntriesMax` 与
`responseBytesMax` 约束。

File Format Reference Policy 的语义保持不变并继续由 File Format 拥有。Runtime
按下表应用该 owner-defined policy：

| Reference       | Runtime 用途                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------- |
| stable ID       | 每个 public structural reference、row identity、dependency、cursor binding 与 mutation target |
| display `name`  | descriptor、Formula human source、CSV header、diagnostic                                      |
| `physical_name` | 仅用于 private SQL compilation；永远不是 public value                                         |

Runtime MUST NOT 通过 public service 暴露 `physical_name`、quoted SQL、SQLite
`rowid`、compiled Formula SQL、AST node、path、handle 或 Adapter token。它通过
canonical metadata 解析每个 stable ID，在内部引用当前 physical name，并绑定
所有 value。

一个 user cell 只有一个 canonical raw value。Runtime MUST NOT 在文件中物化
Formula、Lookup、inverse Relation、label、normalized shadow 或 second-ID column。
generated cache 或 reverse index 可以丢弃，且 MUST NOT 改变 observable result。

## 3. Runtime 构造、Port 与生命周期

### 3.1 Factory 边界

embedding factory 恰好具有两个 logical operation：

```text
Runtime.open(connection, environment, mode, context) -> Promise<RuntimeBinding>
Runtime.create(connection, environment, createInput, context) -> Promise<RuntimeBinding>
```

`connection` 是 Adapter `ConnectionPort`，绝不是 path 或 native object。
`environment` 具有以下精确 trusted shape：

```ts
interface RuntimeEnvironment {
  clock: ClockPort
  entropy: EntropyPort
  transportCommitBarrier?: TransportCommitBarrier
}
```

`clock.nowInstant()` 提供 wall time，
`clock.nowMilliseconds()` 提供 monotonic time，`entropy.randomBytes(length)`
提供自有的 secure byte。`transportCommitBarrier` 当且仅当该 binding 通过 Adapter
Transport prepared-commit profile 提供服务时存在；direct binding 中不存在，
也绝不通过 `RuntimeClient` 暴露。每个 request 还恰好接收 Eidos Adapter 1.0
指定的一个 Adapter `CancellationPort`。public binding 接受
`RequestContext.signal`；
composition 把该 signal、显式 `cancel`、effective deadline 与 Transport
termination 适配为传给 Runtime/Connection work 的一个 CancellationPort。这两种
shape 不会作为相互竞争的 cancellation API 暴露。factory operation 的 `context`
是 `RuntimeFactoryContext`；`mode` 是 `read` 或 `readwrite`。`createInput` 为：

```ts
interface RuntimeFactoryContext {
  cancellation: CancellationPort
  deadlineMilliseconds?: number // positive JSON safe-integer duration
}

interface RuntimeCreateInput {
  title: string
  fileId?: string // explicit import/replay only; otherwise Runtime allocates
  createdAt?: string // explicit import/replay only; otherwise clock.nowInstant
}

interface RuntimeBinding {
  service: RuntimeService
  hostBridge: RuntimeHostBridge
}
```

受信任的 composition 还接收以下 narrow Host bridge；它不属于 `RuntimeClient`，
且绝不提供给 UI 或 renderer：

```ts
interface RuntimeHostBridge {
  allocateFileEntry(
    request: {
      name: string
      mediaType: string
      size: string
      uri: string
      extensions?: Record<string, JsonValue>
    },
    context: RequestContext
  ): Promise<FileEntry>
  createPublicationSnapshot(
    request: { maxBytes: string },
    context: RequestContext
  ): Promise<RuntimePublicationSnapshot>
}

interface RuntimePublicationSnapshot {
  fileId: string
  revision: string
  bytes: ByteSource
  release(): Promise<void>
}
```

只有 `service` 会包装为 `RuntimeClient` 或暴露给 application code；
`hostBridge` 保留在受信任的 Adapter/product composition 内。该 bridge 验证
metadata/URI/size，拒绝与 `id`、`name`、`mediaType`、`size` 或
`uri` collision 的 extension key，分配 UUIDv7 ID，并返回一个 inert logical
candidate。它不执行 row mutation。Host 仅在 staging/authorizing asset 后调用它；
只有 client 随后通过 `mutateRows` 提交该 exact entry，canonical state 才会改变。

bridge 与每次 File mutation 都精确执行 File Format 第 8.3 节。relative 与 `https:`
URI 保持 inert string。`data:` URI 只接受 canonical inline-image form；Runtime 在返回或
存储 entry 前验证 media-type match、RFC 4648 alphabet/padding、decoded byte count 与
1 MiB decoded limit。这些验证既不授权 presentation decode，也不授予 external resource
access。

`createPublicationSnapshot` 是唯一 Host save boundary。Runtime 通过相同的
serialized request queue 接纳它，等待所有更早 operation settle，并阻止更晚
operation 启动，直至 Adapter 完成 independent frozen image 且 outer read
transaction 结束。在该 transaction 中，Runtime 先读取 File ID/revision 以建立
SQLite snapshot，结束 statement，然后使用 Adapter `SnapshotContext` 调用
`ConnectionPort.snapshot`；其中 `maxBytes` 是 request value，CancellationPort/
deadline 从 public context 适配。由此，返回的 `ByteSource` 描述该精确 committed
identity/revision，并且不受后续 Runtime work 影响，始终 immutable。

`maxBytes` 是 canonical non-negative int64 decimal，MUST 不大于 current Host
`candidateBytesMax`；Adapter 在生成 streaming snapshot 时强制执行。Runtime 将
ConnectionSnapshot 的 idempotent `release` 与 source 一并返回。Host 将其 stream
给 hashing/File validation 与 publication，然后 MUST 在 `finally` path 调用
`release`；如果在交给 Host 前失败，则由 Runtime 自行 release。该 operation 不
改变 canonical state，也不授予 publication authority。Host MUST 以返回的
identity/revision 发布这些 exact byte，否则必须失败；它不能替换为更晚的
connection image。read 与 readwrite binding 都提供该 bridge。

`create` 要求一个空的可写数据库。它在一个 Adapter write transaction 中执行
File Format exact DDL 中的 schema statement（Adapter transaction 提供外层
`BEGIN IMMEDIATE`/`COMMIT`），插入 singleton meta row，然后在 commit 前验证
identity 与 structure。它不会嵌套 DDL 所展示的 transaction marker。这是 Adapter
常规“canonical write 前验证”bootstrap rule 的唯一 empty-create 例外；publication
或 return 前仍要执行 validation。它不创建默认 Table。提供 ID 或 time 是受信任的
embedding import/replay operation；Runtime 会精确验证，且 MUST NOT 默默修复。
普通产品创建会省略二者。

`open` 要求 ConnectionPort 的 Adapter 已经完成 secure bootstrap 与 mandatory
probe；Runtime 验证所报告的 capability，然后执行 File identity validation，
再返回 service。readwrite service 还会验证 EF-Writer 所需的 structural
precondition。它 MUST 失败，而不能在 open 期间写入 repair state。

两个 factory operation 均恰好 settle 一次。存在 factory
`deadlineMilliseconds` 时，它是 `1..9007199254740991` 内相同的 positive JSON
safe-integer duration，从 factory acceptance 开始按 monotonic clock 计时；其他值
以 `invalid-request` 拒绝。它们会在任何 work 前以及与普通 request 相同的 safe
point 应用 factory deadline 与 CancellationPort，并只使用第 4.3 节
`RuntimeError` shape 拒绝。`create` failure 会 rollback outer transaction；如果
Adapter 无法证明 rollback，factory 返回 `fatal`。failure 时不返回 binding，且
Runtime 永久停止使用 borrowed port。提供 port 的 composition owner 会在任一
factory failure 后将其关闭；Runtime 绝不背着 owner 关闭 port。

### 3.2 Port 使用

Runtime 按以下方式使用 Adapter transaction：

- 外层 read transaction 是 `BEGIN DEFERRED`，且 MUST 不执行任何 write；
- 外层 write transaction 是 `BEGIN IMMEDIATE`；
- nested work 使用 savepoint，并继承其 outer mode；
- 禁止 read-to-write escalation；
- Runtime 从不通过普通 statement operation 发送 transaction-control SQL。

一个 operation 接收一个 cancellation input。Runtime 会在 planning 前、bounded
batch 之间、取得 write transaction 前以及紧邻 commit point 前检查它。Adapter
interrupt 可以中止 SQL。commit 前取消会 rollback。与 commit 竞态或发生在 commit
之后的取消会返回 `unknown-commit`，除非 implementation 能证明结果；caller 通过
第 4.3 节的精确 detail 进行 reconciliation。任一 `unknown-commit` 都会使该
Runtime epoch 永久转入 `fatal`；此后只接受 `close`。

`clock.nowInstant()` 提供 canonical millisecond UTC instant，用于 canonical
timestamp 与 UUIDv7 time。monotonic clock 仅通过 `clock.nowMilliseconds()` 用于
deadline 与 elapsed budget，且永不持久化。Entropy 提供自有的、cryptographically
secure byte。Runtime MUST NOT 调用 ambient platform time、locale、timezone 或
randomness API。

### 3.3 UUIDv7 分配

Runtime 拥有 canonical ID allocation；Adapter 只提供 clock 与 entropy。普通
public create operation 允许 Runtime 分配 ID。只有标记为 import/replay 的 request
才接受显式 caller ID，且接受相同的 validation 与 uniqueness check。

在一个 Runtime instance 内，分配出的 UUIDv7 value 在 `BINARY` order 下 MUST
严格递增。generator：

1. 把 wall-clock instant 解析为其 signed Unix millisecond value；
2. 使用 `max(clockMillisecond,lastEmittedMillisecond)` 作为 48-bit UUID
   unsigned timestamp（存在 prior value 时），否则第一次 allocation 使用
   `clockMillisecond`；
3. 对一个新的、更晚 millisecond，以 secure entropy 填充 74 个非 version/
   non-variant payload bit；
4. 对相同或更早 millisecond，把此前 74-bit payload 当作一个 unsigned
   big-endian integer 加一；
5. 设置 version `7`、variant `10`，并序列化为 lowercase hyphenated
   36-character representation。

第一次 allocation 时，unsigned 48-bit Unix millisecond 范围之外的 clock value
无法编码，并会在 canonical work 前返回 `resource-limit`；已有 prior allocation
之后，向 epoch 前倒退的 value 与其他 backward clock 一样由相同 clamp 处理。
Payload overflow 会在 request deadline 约束下等待更晚且可表示的 wall millisecond，
否则返回 `resource-limit`。普通 created/updated Field 使用的 timestamp 仍是实际
wall-clock instant；只有 ID monotonicity 会被 clamp。conformance harness 注入固定
time 与 entropy。

### 3.4 生命周期

```text
opening -> open -> closing -> closed
             |
             +-------> fatal
```

`close` 是 idempotent。它拒绝新 request，取消或 settle queued request，在 outcome
已知时 rollback active work，释放全部 generated state，并永久停止使用其借用的
ConnectionPort。Adapter/composition owner 在 Runtime close 后关闭该 port。
进入 `closed` 或 `fatal` 后只有 `close` 有效。corruption、failed rollback、
invalid driver result 或无法判明的 internal invariant 是 fatal；普通 invalid
input、stale revision、busy、deadline 与 cancellation 则不是。

## 4. Public Service、协商与错误

### 4.1 Request context

每个 asynchronous binding 都保留以下与语言无关的 context：

```ts
interface RequestContext {
  requestId: string // unique among unresolved requests in this Runtime epoch
  deadlineMilliseconds?: number // positive JSON safe-integer duration
  signal?: CancellationSignal
}

interface CancellationSignal {
  readonly aborted: boolean
  onAbort(callback: () => void): () => void
}
```

Transport 可以增加 session、epoch 与 sequence Field；它们是 Adapter state，
而非 Runtime semantics。direct binding MAY 复用已 settled 的 request ID，但
Transport profile MAY 要求整个 epoch 范围内唯一。
`requestId` 遵循第 2 节固定的 `1..128` UTF-8-octet/no-NUL rule；存在
`deadlineMilliseconds` 时，其值在 `1..9007199254740991` 内。invalid context 在
queue admission 前是 `invalid-request`。这些 member 具有固定 independent bound，
因此 context 不计入 `requestBytesMax`；CancellationSignal 是 control handle，
而不是 payload data。
Runtime 在接受 request 时启动一个 monotonic budget，其值为
`min(deadlineMilliseconds,foregroundTimeMsMax)`；request 省略 deadline 时则为
`foregroundTimeMsMax`。budget 到期会返回 `deadline-exceeded`，但受第 3.2 节
commit-race rule 约束。budget 包括 queue、busy wait、`getSnapshot`
minimum-revision wait、planning、SQL 与 result encoding；任何 operation 都没有
unbounded foreground wait。

### 4.2 Capability 与 limit

`negotiate({protocol:"eidos-runtime",versions:["1.0"]})` 返回 version 1.0 或
`unsupported`。它会返回下面的每个 member；不得省略任何 member。

```ts
interface RuntimeCapabilities {
  readRows: boolean
  schemaPaging: boolean
  cursorPaging: boolean
  aggregate: boolean
  groupRows: boolean
  formulaPreview: boolean
  mutateRows: boolean
  mutationUndo: boolean
  mutateView: boolean
  schemaPreflight: boolean
  mutateSchema: boolean
  validate: boolean
  events: boolean
  csvExport: boolean
  csvImport: boolean
}

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

每个 limit 都是 `1..2147483647` 内的 JSON safe integer，并在产生 partial output
或 mutation 前强制执行。implementation MAY 公布低于 File Format hard limit 的
数值。ER-Reader 要求 `readRows`、`cursorPaging`、`aggregate`（包括
`summarizeFields`）、`groupRows`、
`schemaPaging`、`validate` 与 Formula/Lookup evaluation，即使
`formulaPreview=false` 亦然。
ER-Writer 还要求 `mutateRows`、`mutateView`、`schemaPreflight` 和
`mutateSchema`。`mutationUndo`、`events`、`formulaPreview`、`csvExport` 与
`csvImport` 描述 optional public operation。read-only binding 报告
`mutateRows=false`、`mutationUndo=false`、`mutateView=false`、
`mutateSchema=false` 与 `csvImport=false`。

Capability dependency 是精确的：`cursorPaging`、`aggregate`、`groupRows` 与
`csvExport` 各自要求 `readRows`；`groupRows` 还要求 `cursorPaging`；
`mutationUndo` 与 `csvImport` 各自要求 `mutateRows`；`mutateSchema` 要求
`schemaPreflight`。true capability 配合 false prerequisite 是 protocol error。
`aggregate=true` 同时覆盖 `aggregate` 与 `summarizeFields`；两者不能暴露更弱的
query/revision domain。每个 non-optional `RuntimeClient` method 始终存在：其 capability 为 false 时，
在执行 work 前以 `unsupported` 拒绝。`getSnapshot`、`cancel` 与 `close` 没有
capability bit，只要 lifecycle 允许就始终可用。

未知的 future capability 或 limit member 会被忽略。缺少任一 1.0 member、类型
错误、limit 为零或 capability 自相矛盾，均为 protocol error。
每个 input 与 output `LogicalValue` 都必须符合 `logicalValueBytesMax`，每个
successful result 都必须符合 `responseBytesMax`；否则 Runtime 会在产生 partial
result 前返回 `resource-limit`。

Limit accounting 是精确的：

| Limit                                 | Count                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `requestBytesMax`                     | 省略每个 nominal `OwnedBytes` member 后 Runtime operation payload 的 RFC 8785 JCS UTF-8 byte，不包括任何 Adapter envelope |
| `responseBytesMax`                    | 省略每个 nominal `OwnedBytes` member 后一个 successful Runtime result 的 JCS UTF-8 byte，不包括任何 Adapter envelope      |
| `schemaPageSizeMax`                   | `SchemaPage.objects.length` 或 `SchemaDependencyPage.dependencies.length`                                                 |
| `pageSizeMax`                         | 一个 ordinary page 或每个 group 中返回的 `ProjectedRow` 数量                                                              |
| `projectionFieldsMax`                 | `ProjectionSpec.fields.length`；resolve subset 不增加 column                                                              |
| `rowsByIdMax`                         | input `rowIds.length`                                                                                                     |
| `mutationRowsMax`                     | `RowMutation.changes.length`                                                                                              |
| `mutationCellsMax`                    | create/update map 中 Field-ID/value member 总数                                                                           |
| `mutationBytesMax`                    | 完整 `RowMutation` payload 的 JCS UTF-8 byte                                                                              |
| `aggregateItemsMax`                   | `AggregateRequest.items.length`                                                                                           |
| `groupPageSizeMax`                    | 一个 `GroupPage` 中返回的 group 数量                                                                                      |
| `formulaPreviewRowsMax`               | requested 或 sampled preview row                                                                                          |
| `filterDepthMax` / `filterNodesMax`   | root-at-1 depth / 全部 filter node                                                                                        |
| `sortFieldsMax` / `groupFieldsMax`    | Row-ID tiebreaker 之前的 client sort / group Field 数量                                                                   |
| `searchBytesMax`                      | `search.text` 的 UTF-8 byte                                                                                               |
| `listElementsMax`                     | 每个 input/result canonical list 或 flattened Lookup sequence 的 element 数量                                             |
| `logicalValueBytesMax`                | 一个 public `LogicalValue` 的 JCS UTF-8 byte，包括任何完整 list/File value                                                |
| `formulaBytesMax`                     | source text 的 UTF-8 byte                                                                                                 |
| `formulaNodesMax` / `formulaDepthMax` | 全部 AST node / root-at-1 AST depth                                                                                       |
| `diagnosticsMax`                      | 一个 result 中保留的 diagnostic 数量                                                                                      |
| `foregroundTimeMsMax`                 | 一个 foreground request 所接受的 monotonic elapsed millisecond                                                            |
| `csvBytesMax`                         | 一个 CSV import input 或 export output 中的 octet 数量                                                                    |
| `schemaPlanEntriesMax`                | 每个 Runtime epoch 保留的 live unapplied schema plan 数量                                                                 |
| `schemaPlanBytesMax`                  | 为 live schema plan 保留的 exact Host-private plan data 的 JCS UTF-8 byte                                                 |
| `undoEntriesMax`                      | deterministic oldest-first eviction 后每个 Runtime epoch 保留的 live undo token 数量                                      |
| `undoBytesMax`                        | 为 live token 保留的完整 logical before/post-state 的 JCS UTF-8 byte                                                      |

包含 nominal `OwnedBytes` 的 shape 只有一种 carrier-independent Runtime
accounting projection：JCS accounting 前省略该 member 及其 key，并在专用 byte
limit 下对 exact octet sequence 计数一次。1.0 中唯一这样的 member 是 CSV
`csv`，受 `csvBytesMax` 约束。direct binding 与 Transport attachment 使用相同
projection；attachment descriptor 或 envelope 属于 Adapter accounting，不改变
Runtime admission。省略只是一种 accounting projection——logical operation
shape 中该 member 仍为 required。

对 Transport composition，Adapter 从 `maxRequestBytes` 减去使用 negotiated
maximum ID length 的 envelope/descriptor JCS size，算出 maximum JCS payload
budget。它选择 Runtime page、projection、list、logical-value、CSV 与 result
limit，使其允许的 worst response carrier 不超过 Adapter `maxResponseBytes`。
`responseBytesMax` 是所得 payload-only ceiling。named attachment byte 由 Adapter
及其所属 operation 计数。Negotiation 返回这些 effective reduced value，而不是
未调整的 engine maximum。

### 4.3 Error record

一个 operation 要么返回其声明的 result，要么返回一个 structured error：

```ts
interface RuntimeError {
  code: RuntimeErrorCode
  message: string
  retryable: boolean
  path?: string // logical request/metadata path, never a filesystem path
  fileId?: string
  tableId?: string
  fieldId?: string
  rowId?: string
  currentRevision?: string
  details?: JsonObject
}

type RuntimeErrorCode =
  | "invalid-request"
  | "unsupported"
  | "not-found"
  | "already-exists"
  | "invalid-value"
  | "invalid-query"
  | "invalid-formula"
  | "cycle"
  | "constraint"
  | "stale-revision"
  | "conflict"
  | "forbidden"
  | "lossy-confirmation-required"
  | "invalid-plan"
  | "plan-expired"
  | "resource-limit"
  | "cancelled"
  | "deadline-exceeded"
  | "busy"
  | "corrupt-file"
  | "adapter-error"
  | "unknown-commit"
  | "closed"
  | "fatal"
```

`message` 包含 `1..4096` 个 Unicode scalar value，且不含 U+0000；它用于
diagnostic，MUST NOT 被解析。存在 `path` 时，它是指向 logical request/metadata
model 的 RFC 6901 JSON Pointer，最多 4096 个 Unicode scalar value，不含 U+0000，
且绝不是 filesystem path。完整 error JCS 必须符合 effective Adapter response
carrier；composition 只可以在 scalar boundary 缩短 `message` 以使其符合，绝不能
缩短 code、path、ID、revision 或 structured detail。`details` MUST NOT 包含 SQL、
与该 error 无关的 bound canonical value、path、credential、没有 stable wrapper
的 native code、stack trace 或 generated source。精确 code 控制 behavior。
invalid input 绝不下落为 raw SQLite error。

只有 `busy`、`deadline-exceeded`、`stale-revision`、`conflict`、`cancelled`、
或 `adapter-error` 允许 `retryable=true`；它绝不授权自动 replay mutation。

发生已知 rollback 的 `stale-revision` 后，caller 可以读取 current state、验证由
application 定义的 conflict policy，并使用 current revision 提交一个新 mutation。
这个新 request 的授权来自 fresh read 和 policy verification，而不是 `retryable`
或 rejected request。

`unknown-commit` 始终具有 `retryable=false`。在 transported binding 上，其 public
`details` 恰好是 `{reconciliationRequired:true}`。Adapter trusted composition
保留并验证 private commit receipt；`RuntimeClient` 与 UI 均不接收它。caller 调用
Adapter HostServices `reconcileCommit`，后者重新打开 private working database，
且仅在证明 outcome 后返回 replacement Runtime epoch 与 safe
`CommitReconciliation`。在没有 Transport barrier 的 direct binding 上，details
恰好是 `{baseRevision,commitRevision,reconciliation}`，并使用相同 matching rule。
direct caller 重新打开并验证同一个 exclusively owned working database：File ID
匹配且 revision 为 `commitRevision` 证明 commit，reconciliation 提供 persistent
ID；File ID 匹配且 revision 为 `baseRevision` 证明 rollback；其他所有 state 都是
conflict/fatal，绝不授权 replay。receipt/preparation 只在该 revision check 前证明
candidate outcome。

## 5. Public Schema 与 Logical Value

### 5.1 无损 scalar binding

Public JSON-compatible value 使用以下精确表示：

| Logical type             | Runtime/public value                                        |
| ------------------------ | ----------------------------------------------------------- |
| null                     | JSON `null`                                                 |
| text, select, URL        | JSON string                                                 |
| number                   | finite JSON number；`-0` 规范化为 `0`                       |
| integer, revision, count | 适用时为 canonical signed/non-negative int64 decimal string |
| checkbox                 | JSON boolean                                                |
| date                     | canonical `YYYY-MM-DD` string                               |
| datetime                 | canonical `YYYY-MM-DDTHH:MM:SS.sssZ` string                 |
| multi-select             | ordered unique string array                                 |
| Relation                 | ordered unique Row-ID string array                          |
| File                     | ordered `FileEntry` array                                   |

Integer 永远不是 JSON number。这可在 JavaScript、native 与 JSON transport
间保留所有 int64 value。

普通 Runtime value 已经 canonical。接受 external datetime text 的 UI/import
helper MUST 实现以下显式 normalization algorithm，绝不能把它隐藏在
`mutateRows` 内：parse 带有已知 numeric offset 或 `Z` 的 valid RFC 3339
date-time；拒绝 `-00:00` 与 leap-second `:60`；把所表示 instant 转换为 UTC；
严格输出 millisecond precision 与 `Z`。超过 millisecond 的 fraction 会被拒绝，
除非 caller 显式选择 `truncate` 或 round-to-nearest, ties-to-even；rounding 会跨
second、day、month 与 year carry，超出 0001..9999 的结果会被拒绝。缺少 fraction
时使用 `.000`。Date input 只接受真实的 proleptic-Gregorian `YYYY-MM-DD`，绝不
应用 timezone。helper 会在把 canonical value 提交前报告 spelling、offset 或
precision 是否改变。

```ts
interface JsonObject {
  [key: string]: JsonValue
}
type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject

interface FileEntry {
  id: string
  name: string
  mediaType: string
  size: string // canonical non-negative int64 decimal
  uri: string
  [extensionMember: string]: JsonValue
}

type Revision = string // canonical non-negative int64 decimal

type ScalarType =
  | "text"
  | "number"
  | "integer"
  | "checkbox"
  | "date"
  | "datetime"
  | "url"
  | "json"
  | "select"
  | "multi-select"
  | "file"
  | "relation"

type AtomicType =
  | "text"
  | "number"
  | "integer"
  | "checkbox"
  | "date"
  | "datetime"
  | "url"
  | "select"
  | "row-id"
  | "file-entry"

type TypeRef =
  | ScalarType
  | "row-id"
  | "file-entry"
  | { kind: "list"; element: AtomicType }

type LogicalValue =
  | null
  | boolean
  | number
  | string
  | FileEntry
  | LogicalValue[]
```

`TypeRef` 描述 logical result，而非 physical Field kind。Formula 具有声明的
`FormulaResultType`，它是第 9 节所列 File DDL exact subset。Lookup 可以暴露
`row-id`/`file-entry` atom 或 one-level list TypeRef：Multi-select element 是
`select`，Relation element 是 `row-id`，File element 是 `file-entry`。nested
list 由第 10 节 flatten，永不跨越 public boundary。`LogicalValue` 的具体含义由
Field/Column `TypeRef` 区分；JSON JCS text 与 Integer decimal 有意都使用 string。

每个 `JsonValue` 都是 acyclic，只包含 finite binary64 number，且对 JCS 有效。
FileEntry 的每个 required key 恰好出现一次；extension 不能 shadow required key，
并通过 JCS 保留。

精确 descriptor mapping 为：

| Field/role                                                        | `valueType`                                 |
| ----------------------------------------------------------------- | ------------------------------------------- |
| Row-ID system Field                                               | `row-id`                                    |
| created/updated-time system Field                                 | `datetime`                                  |
| stored text/number/integer/checkbox/date/datetime/url/json/select | 相同的 type token                           |
| stored Multi-select                                               | `multi-select`                              |
| stored File                                                       | `file`                                      |
| forward 或 inverse Relation                                       | `relation`                                  |
| Formula                                                           | 其声明的 `FormulaResultType`                |
| Lookup `values`                                                   | `{kind:"list",element:E}`                   |
| Lookup `first`/`min`/`max`                                        | element type `E`                            |
| Lookup `count`                                                    | `integer`                                   |
| Lookup `sum`                                                      | Integer `E` 时为 `integer`，否则为 `number` |
| Lookup `average`                                                  | `number`                                    |

Lookup element type `E` 是 flatten 后的 scalar/Formula/Lookup atom；Multi-select
贡献 `select`，File 贡献 `file-entry`，任一 Relation direction 贡献 `row-id`。
`values` Lookup 不能产生 nested list。该 mapping 还控制 filter operand、Relation
`labelType`、Formula static reference 与 UI renderer selection；implementation
MUST NOT 从 SQLite storage class 推断不同的 public type。

仅在 Formula static typing 内，Row-ID system reference 是 non-null `text` operand，
且只能产生普通 declared text/derived result；Formula 永不创建 `row-id` value。
在其他每个 public boundary，其 descriptor 与 typed equality 仍为 `row-id`。

Public operator compatibility 取决于 `valueType`，绝不取决于 Field kind 或 SQLite
storage class：

| Operation family                             | 接受的 `TypeRef`                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| typed `eq`/`ne`/`in`、`distinct-count`       | 每个 `TypeRef`；object 比较 RFC 8785 JCS byte，list 比较 length 与 ordered typed element |
| ordered comparison、sort、group、`min`/`max` | `text`、`url`、`select`、`row-id`、`integer`、`number`、`checkbox`、`date`、`datetime`   |
| relative week/month window                   | `date`、`datetime`                                                                       |
| `contains`/`starts-with`/`ends-with`         | `text`、`url`、`select`、`row-id`                                                        |
| search                                       | 第 5.2 与 7.1 节 Field-aware Search Fragment；绝不从 SQLite storage class 推断           |
| `sum`/`average`                              | `integer`、`number`                                                                      |

因此，对 Relation 执行 Lookup `first` 可 sort/group，因为其 `valueType` 是
`row-id`；对 File 执行 Lookup `first` 则不可，因为其 `valueType` 是
`file-entry`。`json`、`multi-select`、`file`、`relation`、`file-entry` 与每个
list TypeRef 对 ordinary typed operator 只能用于 equality/distinct；Field-aware
search 与 semantic summary 改用第 5.2、7.1、7.3 节的明确规则。Null 永远不是 ordered operand，但 sort
按 explicit null-rank 放置它，grouping 则形成一个 null group。

### 5.2 规范性 Field 能力矩阵

本矩阵是 core 1.0 每种 Field kind 的跨层索引。`C/D` 表示 whole-cell `count` 与
`distinct-count`；`O` 再包含 `min`/`max`；`N` 再包含 `sum`/`average`；`T`
表示准确 result `TypeRef`。标记为“特殊”的 cell 只能使用所指向的详细规则，不能
coerce physical SQLite value。Whole-cell aggregate 与 semantic summary 刻意分开：
前者把 ordered list 视为一个 typed value；后者使用第 7.3 节 Field-aware scalar 或
exploded value domain。

| Field kind       | Canonical / public value                       | Mutation | Filter                                        | Sort | Group | Search Fragment                                   | Whole-cell aggregate | Semantic summary                                              | Formula operand      | Lookup result        | Record Label | CSV                               | UI / Adapter boundary                                            |
| ---------------- | ---------------------------------------------- | -------- | --------------------------------------------- | ---- | ----- | ------------------------------------------------- | -------------------- | ------------------------------------------------------------- | -------------------- | -------------------- | ------------ | --------------------------------- | ---------------------------------------------------------------- |
| Row-ID system    | UUIDv7 TEXT / `row-id`                         | 只读     | `eq`、`ne`、`in`                              | 是   | 是    | 仅在明确请求其 Field ID 时搜索 UUID               | C/D/O                | selected row 与不同 stable ID                                 | text                 | `row-id` atom        | 特殊回退     | export；仅 explicit replay import | UI 通常隐藏；绝不是 SQLite `rowid`                               |
| created/updated  | UTC datetime TEXT / `datetime`                 | 只读     | equality、`in`、ordered range                 | 是   | 是    | 仅在充当 Record Label 时使用 canonical label text | C/D/O                | null/distinct、earliest/latest                                | 是                   | `datetime` atom      | 可用         | canonical UTC datetime            | UI 只 localize display                                           |
| Text             | TEXT / `text`                                  | 可写     | equality、`in`、contains/prefix/suffix        | 是   | 是    | raw string                                        | C/D/O                | null/empty/non-empty/distinct                                 | 是                   | `text` atom          | 可用         | text                              | ordinary text editor                                             |
| Number           | finite REAL / `number`                         | 可写     | equality、`in`、ordered range                 | 是   | 是    | 仅在充当 Record Label 时使用 canonical label text | C/D/O/N              | null/distinct/min/max/sum/average                             | 是                   | `number` atom        | 可用         | canonical finite number           | formatting 属于 UI state                                         |
| Integer          | INTEGER / int64 decimal string                 | 可写     | equality、`in`、ordered range                 | 是   | 是    | 仅在充当 Record Label 时使用 canonical label text | C/D/O/N              | null/distinct/min/max/sum/average                             | 是                   | `integer` atom       | 可用         | canonical int64 decimal           | `rating` 仅是 Integer display setting                            |
| Checkbox         | INTEGER 0/1 / Boolean                          | 可写     | equality、`in`                                | 是   | 是    | 仅在充当 Record Label 时使用 `true`/`false`       | C/D/O                | null/true/false count 与 ratio                                | 是                   | `checkbox` atom      | 可用         | `true` / `false`                  | Checkbox presentation 归 UI                                      |
| Date             | `YYYY-MM-DD` TEXT / `date`                     | 可写     | equality、`in`、ordered/relative range        | 是   | 是    | 仅在充当 Record Label 时使用 canonical label text | C/D/O                | null/distinct、earliest/latest、explicit bucket               | 是                   | `date` atom          | 可用         | canonical date                    | 无 timezone；calendar presentation 归 UI                         |
| Datetime         | UTC instant TEXT / `datetime`                  | 可写     | equality、`in`、ordered/relative range        | 是   | 是    | 仅在充当 Record Label 时使用 canonical label text | C/D/O                | null/distinct、earliest/latest、explicit UTC bucket           | 是                   | `datetime` atom      | 可用         | canonical UTC datetime            | UI localize；import 在 mutation 前 normalize                     |
| URL              | URI-reference TEXT / `url`                     | 可写     | equality、`in`、contains/prefix/suffix        | 是   | 是    | raw URI-reference                                 | C/D/O                | null/empty/non-empty/distinct；optional raw-scheme facet      | 是                   | `url` atom           | 可用         | raw URI-reference                 | explicit policy-checked link/copy；image display 使用 Host lease |
| Select           | Option-name TEXT / `select`                    | 可写     | equality、`in`、contains                      | 是   | 是    | Option name                                       | C/D/O                | null、observed Option facet、uncatalogued raw value           | text                 | `select` atom        | 可用         | Option name                       | color/icon 与 zero-use catalog entry 属于 UI state               |
| Multi-select     | unique Option-name JSON array / `multi-select` | 可写     | whole equality/`in`；`has-any`/`has-all`      | 否   | 否    | 每个 Option name                                  | C/D on whole array   | empty row、selection count、distinct Option、Option facet     | 否                   | list of `select`     | 否           | JCS string array                  | UI 渲染 chips 并补充 zero-use catalog entry                      |
| File             | FileEntry JSON array / `file`                  | 可写     | whole typed equality 与 `in`                  | 否   | 否    | entry name、非 `data:` URI、raw media type        | C/D on whole array   | File row、entry、exact byte、MIME/URI-kind facet、fan-out     | 否                   | list of `file-entry` | 否           | JCS FileEntry array               | UI 负责 preview/icon/URI fallback；Adapter resolve/read asset    |
| forward Relation | Row-ID JSON array / `relation`                 | 可写     | whole equality/`in`；membership               | 否   | 否    | target 当前 Record Label；unresolved Row ID       | C/D on whole array   | row、edge、distinct target、unresolved、fan-out、target facet | 否                   | list of `row-id`     | 否           | JCS Row-ID array                  | Runtime resolve label；UI 渲染 chooser/chips                     |
| inverse Relation | definition / virtual `relation`                | 只读     | whole equality/`in`；membership               | 否   | 否    | source 当前 Record Label                          | C/D on result array  | 与 forward Relation 相同的 edge/target summary                | 否                   | list of `row-id`     | 否           | 仅 export evaluated Row-ID array  | Runtime 执行 reverse projection；UI 只读                         |
| Formula          | definition / declared `T`                      | 只读     | 按 `T`                                        | 按 T | 按 T  | 按 `T`；充当 Record Label 时应用其专门规则        | 按 T                 | 按 `T`；row-value evaluation failure 为 null                  | 是，受 DAG 约束      | result atom          | 合格 scalar  | 仅 export evaluated value         | UI 分开展示只读结果与 definition                                 |
| Lookup scalar    | definition / inferred scalar `T`               | 只读     | 按 `T`                                        | 按 T | 按 T  | 按 `T`                                            | 按 T                 | 按 `T`                                                        | Formula-compatible T | result atom          | 否           | 仅 export evaluated value         | UI 展示只读 value 与 source path                                 |
| Lookup list      | definition / flattened list `T`                | 只读     | whole equality/`in`；typed element membership | 否   | 否    | 每个 flattened atom 的 fragment                   | C/D on whole list    | empty row、element、distinct atom、typed facet                | 否                   | flattened list       | 否           | 仅 export evaluated JCS array     | UI 使用 element renderer；public list 不嵌套                     |

File Format 负责 canonical/raw column 与 definition；Runtime 负责 logical value、
operator、Search Fragment、aggregate、summary 与 derived evaluation；Adapter 负责
需要授权的 asset resolution/content service；UI 负责 formatting、icon、localized
alias、preview 与 input affordance。可执行 template fixture 只是本矩阵的 example；
它不具规范性，也不能替代本表或下方详细规则。

完整 non-null order 是精确的。Text/URL/select/row-id 比较 unsigned UTF-8 byte
（`BINARY`）。Integer 比较 mathematical signed-int64 value。Number 比较
normalized finite binary64 numerical value；先把 `-0` normalize 为 `+0`。
Checkbox 按 `false < true` 排序。canonical date 与 datetime 比较 unsigned UTF-8
byte，对其 fixed encoding 而言这就是 chronological order。Mixed Integer/Number
comparison 将 Integer 视为 exact mathematical real value，与 finite binary64
value 进行 mathematical comparison；MUST NOT 先把超出 safe range 的 Integer
round 为 binary64。不同 non-numeric type 的 value 之间不进行 ordering comparison。

### 5.3 Snapshot

`getSnapshot({minimumRevision?})` 返回同一 committed revision 上有界的 File
header 与 schema count：

```ts
interface RuntimeSnapshot {
  fileId: string
  format: { major: 1; minor: 0 }
  revision: string
  title: string
  defaultTableId: string | null
  schemaCounts: {
    tables: string
    fields: string
    views: string
    features: string
  }
}

interface TableDescriptor {
  object: "table"
  id: string
  name: string
  labelFieldId: string
  position: string
  settings: JsonObject
}

interface FieldDescriptor {
  object: "field"
  id: string
  tableId: string
  name: string
  kind: ScalarType | "formula" | "lookup"
  valueType: TypeRef
  systemRole: "row-id" | "created-time" | "updated-time" | null
  nullable: boolean
  position: string
  settings: JsonObject
  writable: boolean
  definition?: RelationDefinition | FormulaDefinition | LookupDefinition
}

interface ViewDescriptor {
  object: "view"
  id: string
  tableId: string
  name: string
  type: string
  queryStatus?: "supported" | "unsupported"
  query: SavedViewQuery
  layout: JsonObject
  position: string
}

interface FeatureDescriptor {
  object: "feature"
  name: string
  version: string
  required: boolean
  config: JsonObject
}

type SchemaDescriptor =
  | TableDescriptor
  | FieldDescriptor
  | ViewDescriptor
  | FeatureDescriptor

interface GetSchemaPageRequest {
  revision: string
  limit: number
  cursor?: string
}

interface SchemaPage {
  fileId: string
  revision: string
  objects: SchemaDescriptor[]
  nextCursor: string | null
}
```

`getSnapshot` 有意是 bounded header state；schema 通过 `getSchemaPage` 取得。
count 是 non-negative int64 decimal string。page `limit` 为
`1..schemaPageSizeMax`。第一次 request 省略 cursor，并提供 snapshot revision。
cursor 绑定 Runtime epoch、File ID、revision 与下述 ordering。current revision
移动是 `stale-revision`；client 会丢弃 partial schema page，并从新 snapshot
重新开始。

Schema object 分为四个 block 排序：feature 按 `name BINARY`；Table 按
`(position,id BINARY)`；Field 先按 owner Table 的顺序，再按
`(position,id BINARY)`；View 同样先按 owner Table 的顺序，再按
`(position,id BINARY)`。position 是 signed int64 decimal string。object 不会跨
page 拆分。一个 page 包含最多为 requested `limit` 的最长 ordered prefix，且完整
result JCS 符合 `responseBytesMax`；仅在结尾或下一个完整 descriptor 会超过该
bound 时才包含更少 object。单个 descriptor 超过 `responseBytesMax` 会返回 `resource-limit`；
aggregate object count 不会使 header 或原本 bounded 的 page 从本质上变得无法
表示。settings/config/query/layout 是 parsed JSON object，持久化时其 serialization
使用 JCS。在所属 format rule 允许的地方保留 unknown extension member。任何
descriptor 都不包含 physical name。

`FieldDescriptor.definition` 当且仅当 Field 是 Relation、Formula 或 Lookup 时
存在，其他每个 Field 都不存在。`writable` 是 structural property，而不是 session
permission bit：对 non-system stored scalar/Multi-select/File Field 或 forward
Relation 恰好为 true；对每个 system Field、Formula、Lookup 与 inverse Relation
为 false。read-only binding 仍报告同一 descriptor，并通过 `unsupported` 单独
拒绝 mutation。

Record Label Field 是 stored eligible scalar，或具有 eligible persisted result
type 的 Formula。core 1.0 中 Lookup 绝不是 Record Label，因为其 inferred
scalar/list TypeRef 不由 File Format 持久化。Runtime 把任何 violation 视为
semantic invalidity，而不是根据 current row 猜测。

如果 `minimumRevision` 大于 current revision，Runtime 会等待该 revision、
cancellation、deadline 或 close。若 events 不可用，它 MAY 在 deadline 内轮询
Adapter `dataVersion`。较小或相等的值会立即返回。

## 6. Projection、Columnar Row 与 Relation Label

### 6.1 Projection

```ts
interface ProjectionSpec {
  fields: string[]
  resolveRelations: string[]
}

interface ColumnDescriptor {
  fieldId: string
  name: string
  valueType: TypeRef
  source: "stored" | "formula" | "lookup" | "inverse-relation"
  writable: boolean
}

interface ProjectedRow {
  id: string
  values: LogicalValue[]
  resolvedRelations?: Array<{
    column: number
    items: ResolvedRelationItem[]
  }>
}

type ResolvedRelationItem =
  | { id: string; state: "unresolved" }
  | {
      id: string
      state: "resolved"
      labelFieldId: string
      labelType: TypeRef
      label: LogicalValue
    }

interface RowPage {
  fileId: string
  tableId: string
  revision: string
  projectionHash: string
  columns: ColumnDescriptor[]
  rows: ProjectedRow[]
  nextCursor: string | null
  previousCursor: string | null
}

interface RowBatch {
  fileId: string
  tableId: string
  revision: string
  projectionHash: string
  columns: ColumnDescriptor[]
  rows: ProjectedRow[]
  missingRowIds: string[]
}
```

`fields` 不含 duplicate。`columns` 与每个 `values` array 严格按该顺序排列。
columnar shape 有意让每个 Field ID 在每页只发送一次；sparse mutation 仍为以
Field ID 为 key 的 map。response MUST NOT 增加第二种 name-keyed row
representation。

System-role Field 使用 `source:"stored"`；其 role 与 writability 位于 snapshot
descriptor 中。不存在第二种 `system` source category。

`resolveRelations` 不含 duplicate，是 `fields` 的 subset，且只能命名 forward
或 inverse Relation Field。对每个请求的 Relation column，一行在
`resolvedRelations` 中包含一个 entry，并按 ascending column index 排列。当且仅当
`resolveRelations=[]` 时该 member absent；否则每个 returned row 都存在，并恰好
包含 `resolveRelations.length` 个 entry。其
`items` 与该行 Relation value 具有完全相同的长度和 Row-ID 顺序。missing target
保留为 `{id,state:"unresolved"}`。resolved target 使用 target Table 当前的
Record Label Field；`label` 是其 logical scalar value，并且 MAY 为 null。
Resolution 是 projection，绝不是 canonical state。

`projectionHash` 是对以下内容精确进行 UTF-8 JCS serialization 后计算的
lowercase 64-character SHA-256：

```json
{ "fields": [], "resolveRelations": [] }
```

其中以请求的 array 替换对应内容，且不重排。empty hash 为：

```text
4efcb37076a87698cbe05b2dd2c08d6b185db2a5bebcf2dafccdc772f32fd76a
```

### 6.2 Page 与 batch 不变量

`queryRows` 返回 `RowPage`。`getRowsById` 返回 `RowBatch`，绝不返回 page。
二者都绑定一个 File ID、Table ID、revision 与 projection。Runtime MUST 在一个
consistent read transaction 中取得 page 及所有 Relation label，并且 MUST 使用
set-based join/batch，不能对每个 row 或 label 各执行一条 SQL statement。

`getRowsById.rowIds` 包含一个 requested Table 中的 canonical unique ID。existing
row 按 request order 出现；`missingRowIds` 按其 request order 包含 absent ID。
duplicate ID 是 `invalid-request`。在此 boundary，row identity 以 Table 为 scope：
requested Table 中不存在的 ID 始终报告在 `missingRowIds` 中，即使同一 spelling
出现在另一个 Table。Runtime MUST NOT 执行 cross-Table existence lookup 来分类。

由 row value 导致的 virtual evaluation failure（例如除以零或 numeric overflow）
会使 projected value 为 null。persisted metadata 中的 definition、type、
dependency 或 cycle failure 会使 request 成为 `corrupt-file`；绝不能默默转为
null。`invalid-formula` 保留给 invalid caller-supplied candidate/schema input，
不用于 persisted state。

## 7. Query、Filter、Sort、Paging、Grouping 与 Aggregation

### 7.1 RowQuery

public query document 只使用 stable Field ID：

```ts
interface RowQuery {
  filter?: FilterNode
  search?: { text: string; fields: string[] }
  sort?: Array<{
    fieldId: string
    direction: "asc" | "desc"
    nulls?: "first" | "last"
  }>
}

type FilterOperand = Exclude<LogicalValue, null>

type FilterNode =
  | { op: "and" | "or"; args: FilterNode[] }
  | { op: "not"; arg: FilterNode }
  | { op: "is-null" | "is-not-null"; fieldId: string }
  | {
      op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte"
      fieldId: string
      value: FilterOperand
    }
  | {
      op: "between"
      fieldId: string
      lower: FilterOperand
      upper: FilterOperand
    }
  | { op: "in"; fieldId: string; values: FilterOperand[] }
  | {
      op: "contains" | "starts-with" | "ends-with"
      fieldId: string
      value: string
    }
  | { op: "has-any" | "has-all"; fieldId: string; values: FilterOperand[] }
  | { op: "relation-has"; fieldId: string; rowId: string }
  | {
      op: "relative-date"
      fieldId: string
      direction: "past" | "next" | "this"
      unit: "day" | "week" | "month" | "year"
    }
```

以下 Draft 2020-12 JSON Schema 是 `RowQuery` 可执行的 structural validation。
Runtime 还会执行 Field/type/limit validation。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://spec.eidos.space/runtime/1.0/row-query.schema.json",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "filter": { "$ref": "#/$defs/filter" },
    "search": {
      "type": "object",
      "additionalProperties": false,
      "required": ["text", "fields"],
      "properties": {
        "text": { "type": "string", "minLength": 1 },
        "fields": {
          "type": "array",
          "minItems": 1,
          "uniqueItems": true,
          "items": { "$ref": "#/$defs/id" }
        }
      }
    },
    "sort": {
      "type": "array",
      "uniqueItems": true,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["fieldId", "direction"],
        "properties": {
          "fieldId": { "$ref": "#/$defs/id" },
          "direction": { "enum": ["asc", "desc"] },
          "nulls": { "enum": ["first", "last"] }
        }
      }
    }
  },
  "$defs": {
    "id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "filter": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["op", "args"],
          "properties": {
            "op": { "enum": ["and", "or"] },
            "args": { "type": "array", "items": { "$ref": "#/$defs/filter" } }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["op", "arg"],
          "properties": {
            "op": { "const": "not" },
            "arg": { "$ref": "#/$defs/filter" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["op", "fieldId"],
          "properties": {
            "op": { "enum": ["is-null", "is-not-null"] },
            "fieldId": { "$ref": "#/$defs/id" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["op", "fieldId", "value"],
          "properties": {
            "op": { "enum": ["eq", "ne", "lt", "lte", "gt", "gte"] },
            "fieldId": { "$ref": "#/$defs/id" },
            "value": { "not": { "type": "null" } }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["op", "fieldId", "lower", "upper"],
          "properties": {
            "op": { "const": "between" },
            "fieldId": { "$ref": "#/$defs/id" },
            "lower": { "not": { "type": "null" } },
            "upper": { "not": { "type": "null" } }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["op", "fieldId", "values"],
          "properties": {
            "op": { "enum": ["in", "has-any", "has-all"] },
            "fieldId": { "$ref": "#/$defs/id" },
            "values": {
              "type": "array",
              "items": { "not": { "type": "null" } }
            }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["op", "fieldId", "value"],
          "properties": {
            "op": { "enum": ["contains", "starts-with", "ends-with"] },
            "fieldId": { "$ref": "#/$defs/id" },
            "value": { "type": "string" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["op", "fieldId", "rowId"],
          "properties": {
            "op": { "const": "relation-has" },
            "fieldId": { "$ref": "#/$defs/id" },
            "rowId": { "$ref": "#/$defs/id" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["op", "fieldId", "direction", "unit"],
          "properties": {
            "op": { "const": "relative-date" },
            "fieldId": { "$ref": "#/$defs/id" },
            "direction": { "enum": ["past", "next", "this"] },
            "unit": { "enum": ["day", "week", "month", "year"] }
          }
        }
      ]
    }
  }
}
```

`filterDepthMax` 以 root 为 depth 1。`filterNodesMax` 计入每个 logical node 与
leaf node。每个 valid Filter node 都必须恰好求值为 TRUE 或 FALSE；Runtime 不得把
storage engine 的 SQL NULL/UNKNOWN 暴露为第三种 filter truth value。empty `and`
为 TRUE，empty `or` 为 FALSE；`not`、`and` 与 `or` 使用普通 Boolean logic：

| A   | B   | A AND B | A OR B |
| --- | --- | ------- | ------ |
| T   | T   | T       | T      |
| T   | F   | F       | T      |
| F   | F   | F       | F      |

`NOT T=F` 且 `NOT F=T`。root 恰好为 TRUE 时才选中 row。

null query operand 无效；client 必须明确使用 `is-null` 或 `is-not-null`。在 operand
valid 且 non-null 时，null Field value 的结果严格如下：

| Leaf operation                                                                                          | null Field 上的结果 |
| ------------------------------------------------------------------------------------------------------- | ------------------- |
| `is-null`                                                                                               | TRUE                |
| `is-not-null`                                                                                           | FALSE               |
| `ne`                                                                                                    | TRUE                |
| `eq`、ordered comparison、`between`、`in`、string predicate、relative window、`has-any`、`relation-has` | FALSE               |
| 带一个或多个 operand 的 `has-all`                                                                       | FALSE               |

与 operand 无关的恒等式仍然成立：empty `in` 与 empty `has-any` 为 FALSE；empty
`has-all` 为 TRUE。因此 `not(eq(field, value))`、`not(contains(field, text))` 与
`not(in(field, values))` 都会选中 Field value 为 null 的 row。`ne` 是 `eq` 的精确
Boolean complement，不是会传播 SQL NULL 的 SQL `<>`。例如 null Select Field
满足 `ne "p2"`。

Operator/type compatibility 是 normative：

| Operation                                  | 接受的 Field/result TypeRef                             |
| ------------------------------------------ | ------------------------------------------------------- |
| `is-null`、`is-not-null`、`eq`、`ne`、`in` | 每个 TypeRef                                            |
| `lt`、`lte`、`gt`、`gte`、`between`        | 第 5.1 节 sortable TypeRef                              |
| `contains`、`starts-with`、`ends-with`     | `text`、`url`、`select`、`row-id`                       |
| `has-any`、`has-all`                       | Multi-select、Relation、File 与每个 public list TypeRef |
| `relation-has`                             | forward 或 inverse Relation                             |
| `relative-date`                            | `date`、`datetime`                                      |

Operand MUST 具有 Field 的精确 logical type；Runtime 不执行 string、number、
Boolean、date 或 ID coercion。`eq` 使用 typed exact equality，`ne` 使用其
complement：JSON 使用精确 JCS text，`file-entry` object 使用完整 JCS object，
list/Multi-select/File/Relation 使用 length 加 ordered typed element equality。
`in` 是 typed `eq` comparison 的 Boolean OR。`contains`、`starts-with` 与
`ends-with` 在把 ASCII `A..Z` fold 为 `a..z` 后比较 Unicode scalar sequence；
非 ASCII 保持不变。`search` 使用同一 portable fold。

`relative-date` 通过 direction 与 unit 组合能力，而不是枚举每个快捷条件。Runtime
在 root query request 开始时捕获一个 canonical UTC reference instant `R`，同一
request 的所有 relative leaf 使用同一个 `R`。对于 `past` 与 `next`，day 和 week
分别是一个或七个精确的 24-hour day；month 和 year 将 `R` 按 UTC calendar 移动
一个单位，并把 day clamp 到 target month 最后一个 valid day。past 与 next window
均包含首尾，分别为 `[boundary,R]` 与 `[R,boundary]`。

对于 `this`，Runtime 选择包含 `R` 的 UTC calendar period：day 从 00:00 到当天最后
一毫秒；week 使用 ISO 周一到周日；month 是当前 calendar month；year 是当前 calendar
year。Datetime 比较 exact canonical instant；Date 则先把两个 bound 投影为 UTC
`YYYY-MM-DD` date，再进行 inclusive comparison。continuation cursor 必须绑定原始
`R`，同一 query 的分页不能让 window 移动。新的 root request（包括重新打开 saved
View）捕获新的 `R`；saved relative filter 因而持续保持 relative，绝不能被替换为
persisted absolute date。

Multi-select、File、Relation 与 list result 使用 `[]`，绝不使用 null。因此 empty
list 与 null 不同：empty list 上 `eq []` 为 TRUE、`is-null` 为 FALSE，与 non-empty
operand 的 membership 为 FALSE。`has-any` 与 `has-all` 使用 typed exact element
equality。`relation-has` 是优化后的精确 Row-ID membership test。Runtime 把 list
predicate 编译为 `json_each` 或等价 set operation；不得为每行各 fetch 一个 list。

SQL-backed implementation 必须在 logical composition 前把每个 leaf totalize。
SQLite 的 `IS`/`IS NOT` 与 `COALESCE(predicate, FALSE)` 是可用做法；若直接在
`NOT` 下生成 raw `=`、`<>`、ordered comparison、`IN` 或 `LIKE` expression，且没有
等价的 null handling，则不符合本规范。

Search 匹配 **Search Fragment**，绝不对 SQLite storage class cast 或 JSON
serialization 做搜索。对一行与一个 requested Field，Runtime 按以下顺序产生 fragment：

| Field/result                              | Search Fragment                                                                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`、`url`、`select`                   | logical string                                                                                                                                     |
| Row-ID system Field                       | UUID；把该 system Field ID 放入 `search.fields` 就是 explicit ID-search request                                                                    |
| Number、Integer、Checkbox、Date、Datetime | 无，但下方 Record Label 规则除外                                                                                                                   |
| Multi-select                              | 按 stored order 的每个 Option name                                                                                                                 |
| File                                      | 按 entry 顺序的 `name`、`mediaType`，以及仅 relative/`https:` URI；完整 `data:` URI/Base64 payload 永不参与搜索                                    |
| forward/inverse Relation                  | 每个 resolved target/source 当前 Record Label text；unresolved item 贡献其可见 Row-ID fallback                                                     |
| Formula 或 scalar Lookup                  | 其 result TypeRef 的 fragment；充当 Record Label 的 Formula 还应用 Record Label 规则                                                               |
| list Lookup                               | 按既定 Lookup 顺序的每个 flattened atom fragment；source metadata 提供 target/entry context 时，`row-id`/`file-entry` atom 使用 Relation/File 规则 |

**Record Label search text** 对 null 不存在；其他值为：text/URL/select 的 logical
string；Number 的 RFC 8785 number serialization；Integer 的 canonical decimal
string；Checkbox 的 lowercase `true`/`false`；Date/Datetime 的 canonical stored
spelling。该规则让 Relation search 跟随 portable UI 可展示的值，而不引入 locale
formatting；它不会让每个普通 numeric/date Field 都自动可搜索。

`search.fields` 包含 unique Field ID、non-empty，且最多 `projectionFieldsMax`
项。任一 requested Field 的任一 non-empty fragment，在把 ASCII `A..Z` fold 为
`a..z` 后包含 non-empty `search.text`，该行即匹配。Runtime 不执行 trim、
tokenization、Unicode normalization、percent-decode、locale collation、fuzzy
matching、recursive Relation traversal、asset resolution、network request、file
read、Base64 decode 或 implementation-dependent full-text tokenization。Relation
search 恰好跨一条 edge；同一 owner 的重复 fragment match 只返回一次。

Option rename、File-entry metadata mutation、Relation edge mutation、target Record
Label value/role mutation 与 Formula/Lookup dependency mutation 都在 commit
revision 改变 live result。Runtime MUST 以 set-wise cold plan（`json_each`/join 或
等价 bounded plan）执行 search，不得为每行、element 或 Relation target 单独查询。
generated FTS、fragment 与 reverse-edge index 都是 disposable state；warm result
MUST 与 cold result 完全相同。

### 7.2 Sort 与 keyset cursor

Sort Field ID 唯一，且具有第 5.1 节 exact sortable `valueType` token 之一。client
提供的 Row-ID system Field 只有作为最终 sort term 才有效。list、File、JSON 与
Relation sort 无效。两个 direction 的
null placement 都默认为 `last`。non-null order 使用上述 type
order；禁止 NaN/infinity 并 normalize negative zero 后，binary64 使用普通
numerical order。除非 Row ID 已是最后一个 sort term，否则 Runtime 追加 Row ID
`BINARY ASC` 作为最终 unique tiebreaker。

`queryRows` request 为：

```ts
interface QueryRowsRequest {
  tableId: string
  query: RowQuery
  projection: ProjectionSpec
  limit: number
  cursor?: string
  direction?: "forward" | "backward"
}
```

`limit` 为 `1..pageSizeMax`。返回的 row 始终采用 display sort order；
`backward` 选取 preceding slice，但在 return 前反转 internal scan。无论 request
未提供 cursor 时，forward/default 从第一行之前开始，backward 从最后一行之后
开始。无论 request direction 如何，`nextCursor` 都移向更晚的 display row，`previousCursor` 都移向
更早的 display row。null cursor 表示已到达该 boundary。

Cursor 是 opaque，至少绑定 Runtime epoch、File ID、Table ID、revision、
normalized query、projection hash、complete effective sort 与 boundary typed
value。来自其他 binding 的 cursor 是 `invalid-query`；来自旧 revision 的有效
binding 是 `stale-revision`。Runtime MUST 在 explicit null rank、每个 typed sort
value 与 Row ID 上使用 lexicographic keyset predicate。它 MUST NOT 使用与页码
成比例的 offset 实现 conforming paging。

每个 row、group 或 schema-object cursor 都是 stateless，或完全可由其
authenticated opaque content 与 current canonical snapshot 重新推导。Runtime
MUST NOT 要求 unbounded retained server-side cursor entry。它可以 authenticate
或 encrypt cursor content，并保留 bounded acceleration state，但丢失该 state
不能改变 cursor 的 result 或 error。schema-plan dependency cursor 则绑定第 12.2
节单独限定的 retained plan。

用于 cursor equality 的 normalized query 是 validation 后的 RFC 8785 JCS form：
absent `filter`/`search` 保持 absent，absent `sort` 表示为 `[]`，每个 absent sort
`nulls` 都插入为 `"last"`。保留 filter argument order、search Field order 与
client sort order；Runtime 不执行 commutative reordering。所有 operand 已是 exact
logical value。`limit`、paging direction 与 cursor 本身不属于 query hash，因此
同一个 boundary cursor 可以用不同的 permitted limit 沿任一 direction 遍历。

### 7.3 Aggregate 与 column statistics

```ts
interface AggregateRequest {
  tableId: string
  query?: RowQuery
  items: AggregateItem[]
}

type AggregateItem =
  | { key: string; op: "count-all" }
  | {
      key: string
      op: "count" | "distinct-count" | "sum" | "average" | "min" | "max"
      fieldId: string
    }
  | { key: string; op: "statistics"; fieldId: string }

type AggregateResult =
  | { key: string; value: LogicalValue }
  | { key: string; statistics: ColumnStatistics }

interface AggregateResponse {
  fileId: string
  tableId: string
  revision: string
  results: AggregateResult[]
}

interface ColumnStatistics {
  rows: string
  nulls: string
  distinct: string
  min?: LogicalValue
  max?: LogicalValue
  sum?: LogicalValue
  average?: number | null
}

interface FieldSummaryRequest {
  tableId: string
  query?: RowQuery
  items: FieldSummaryItem[]
}

interface FieldSummaryItem {
  key: string
  fieldId: string
  facet?: {
    dimension: FieldSummaryFacetDimension
    limit: number
  }
}

type FieldSummaryFacetDimension =
  | "value"
  | "relation-target"
  | "file-media-type"
  | "file-uri-kind"

interface FieldSummaryResponse {
  fileId: string
  tableId: string
  revision: string
  results: Array<{ key: string; summary: FieldSummary }>
}

interface FieldSummary {
  rowCount: string
  nullRowCount: string
  emptyRowCount: string
  nonEmptyRowCount: string
  valueCount: string
  distinctValueCount: string
  min?: LogicalValue
  max?: LogicalValue
  sum?: LogicalValue
  average?: number | null
  elementCountMin?: string | null
  elementCountMax?: string | null
  elementCountAverage?: number | null
  totalBytes?: string
  facet?: {
    dimension: FieldSummaryFacetDimension
    items: FieldSummaryFacet[]
    truncated: boolean
  }
}

type FieldSummaryFacet =
  | {
      kind: "value"
      value: LogicalValue
      rows: string
      occurrences: string
    }
  | {
      kind: "relation-target"
      rowId: string
      state: "unresolved"
      rows: string
      occurrences: string
    }
  | {
      kind: "relation-target"
      rowId: string
      state: "resolved"
      labelFieldId: string
      labelType: TypeRef
      label: LogicalValue
      rows: string
      occurrences: string
    }
  | {
      kind: "file-media-type" | "file-uri-kind"
      value: string
      rows: string
      occurrences: string
    }
```

Item key 是 unique non-empty string。`AggregateResponse.results` 保持 request
order，每个 value 都来自所报告的同一个 revision。`count-all` 统计 selected row；
`count` 统计 non-null value；`distinct-count` 统计 distinct non-null typed value。
count 为 non-negative int64 decimal string。`sum`/`average` 接受 Integer 或
Number。Integer sum 使用 unbounded accumulator，仅在结果位于范围内时返回
int64 decimal；out-of-range `sum` result 是 `constraint`，不得 wrap 或 coercion
为 REAL。Integer `average` 则把精确 unbounded mathematical sum 除以 non-null
count，并将该 rational 一次 round 为 nearest binary64, ties to even；不能仅因
intermediate sum 超出 int64 就失败。Number sum 先按 Row ID `BINARY` 排列普通
aggregate input，然后在每一 level 从左到右把 adjacent pair 相加，每次执行一次
IEEE 754 ties-to-even addition；最后一个落单 value 不变地提升至下一 level。
重复 level 直至只剩一个 value。Number average 使用 ties-to-even binary64，把
该 final binary64 sum 除以精确 non-null count，且只执行一次除法。non-finite
intermediate/result 是 `constraint`。empty sum/average/min/max 为 null。Lookup
numeric aggregate 对第 10 节中 already ordered flattened sequence 应用相同的
pair-reduction algorithm，而不引入 Row-ID reorder。

`min`/`max` 恰好接受第 5.1 节的 sortable TypeRef。`statistics` 始终返回
`rows`/`nulls`/`distinct`；对 sortable scalar 还返回 `min`/`max`，对 numeric
Field 还返回 `sum`/`average`。applicable member 必须存在，并在 empty input 时为
null；inapplicable optional member 会被省略。所有 member 在一次 set-based scan
中计算。若提供 convenience `countRows` binding，它 MUST 只是包含一个
`count-all` item 的 `aggregate`，且 MUST NOT 具有不同的 filter 或 revision
semantics。

上述 `aggregate` 与 `ColumnStatistics` 是 whole-cell operation。特别是，对
non-nullable Multi-select/File/Relation 执行 `count` 会把 `[]` 行也计入；
`distinct-count` 区分完整 ordered array。它们绝不能悄悄改成 exploded-element
semantics。

`summarizeFields` 是 Field-aware overview operation。item key 必须 unique 且
non-empty；`items` 有 `1..aggregateItemsMax` 项并保持 request order。同一 Field
可以用不同 key/facet dimension 重复请求。facet limit 是
`1..groupPageSizeMax`。除 `totalBytes` 外，每个 count 都是 non-negative int64
decimal string；`totalBytes` 是 canonical File-entry `size` 的精确 arbitrary-
precision non-negative decimal sum，只受 `responseBytesMax` 约束。

summary value domain 精确定义如下：

- `rowCount` 是同一 normalized `RowQuery` 选中的 row 数。
- `nullRowCount` 统计 scalar SQL/derived null。Multi-select、File、Relation 与
  list result 使用 `[]`，不是 null。
- `emptyRowCount` 统计 text/URL/select 的 non-null empty logical string，或
  zero-length Multi-select/File/Relation/list。null 不是 empty；JSON literal
  string/array 不会被重新解释。
- `nonEmptyRowCount = rowCount - nullRowCount - emptyRowCount`。
- non-null scalar 贡献一个 value；Multi-select 贡献 Option-name element，Relation
  贡献 Row ID，File 贡献完整 FileEntry object，list Lookup 贡献 flattened typed
  atom。其总数与 typed-distinct 数分别为 `valueCount` 与
  `distinctValueCount`。empty string 仍是 value，即使其 row 同时计入 empty。
- `min`/`max` 与 numeric `sum`/`average` 当且仅当该 scalar 或 exploded atomic
  domain 按第 5.1 节接受相应 operation 时存在；empty-result 与 arithmetic rule
  与 aggregate 相同。Formula row-value failure 已按第 6.2 节产生 null，因此属于
  null row，不存在第二个 hidden error population。
- `elementCountMin`/`elementCountMax`/`elementCountAverage` 仅对 list-shaped
  Field 存在并计入 zero-length row。前两个是 canonical non-negative int64
  decimal，average 是一次 rounded binary64；`rowCount` 为零时三者都为 null。
- `totalBytes` 仅对 File 或 `file-entry` atom list 存在。它只汇总 metadata；
  没有 entry 时为 `"0"`；Runtime 不 resolve、read、download、decode 或 inspect
  referenced bytes。

`value` facet 使用 summary domain 的 typed identity。`relation-target` 只适用于
Relation，或 Lookup path 能提供唯一 target Table 的 row-id list；identity 是 Row
ID，当前 Record Label 是 same-revision projection。相同 label 仍是不同 target，
unresolved target 仍是单独 Row-ID item。`file-media-type` 使用 exact stored media
type；`file-uri-kind` value 恰好是 `relative`、`https` 或 `data-image`。Catalog
alias、localized type name、icon 与 zero-use Select option 不是 Runtime facet value；
UI MAY 在收到结果后合并 zero-use catalog entry。

每个 facet item 同时报告 distinct owner `rows` 与 element 总 `occurrences`；同一
File row 有多个相同 media type entry 时两者可不同。facet 按 occurrences
descending、rows descending、再按 typed identity 的 RFC 8785 JCS bytes ascending
排序。`truncated` 当且仅当存在超出 requested limit 的 item。

response 与每个 projected Relation label 绑定同一个 revision。Runtime MUST 以
set-wise 或 bounded batch 计算所有 requested summary/facet，绝不能为每个 Field、
row、list element 或 Relation target 各执行一次 query。statistics、fragment 与
reverse-edge cache 都是 disposable generated state；cold scan 与 warm cache MUST
返回相同 member、count、label、order 与 truncation。

### 7.4 Grouping

```ts
interface GroupRequest {
  tableId: string
  query: RowQuery
  groupBy: string[]
  aggregates: AggregateItem[]
  projection: ProjectionSpec
  groupLimit: number
  rowsPerGroup: number
  cursor?: string
  direction?: "forward" | "backward"
}

interface GroupPage {
  fileId: string
  tableId: string
  revision: string
  projectionHash: string
  columns: ColumnDescriptor[]
  groups: Array<{
    key: LogicalValue[]
    count: string
    aggregates: AggregateResult[]
    rows: ProjectedRow[]
    nextRowCursor: string | null
  }>
  nextCursor: string | null
  previousCursor: string | null
}

interface GroupRowsRequest {
  cursor: string
  limit: number
  direction?: "forward" | "backward"
}

interface GroupRowPage {
  fileId: string
  tableId: string
  revision: string
  projectionHash: string
  columns: ColumnDescriptor[]
  groupKey: LogicalValue[]
  rows: ProjectedRow[]
  nextCursor: string | null
  previousCursor: string | null
}
```

`groupBy` 有 `1..groupFieldsMax` 个 unique Field ID，其 `valueType` 位于第 5.1 节
exact sortable/groupable allowlist 中。使用 JSON、`file-entry`、File、list 或
Relation grouping 无效。group key equality/order 使用与 filter/sort 相同的 typed
rule，并把 null 作为一个排在最前的 group。group 按 exact typed-key equality
coalesce，并按 key ascending lexicographic 排序；因为 Field TypeRef 固定，且每个
component order 都是 total，不再需要 implementation-defined tiebreaker。
`groupLimit` 为 `1..groupPageSizeMax`；`rowsPerGroup` 为 `1..pageSizeMax`。
`aggregates` 最多有 `aggregateItemsMax` 个 item，使用 unique non-empty key，并
遵循第 7.3 节的 exact aggregate type/arithmetic rule。

每个 group 内的 row 使用 query 的 effective sort，并 inline 返回。
`nextRowCursor` 在结尾为 null；否则原样传给 `queryGroupRows`，其 cursor 绑定
original File/Table/revision、normalized query、grouping、exact typed group key、
projection 与 effective row sort。其 `limit` 为 `1..pageSizeMax`；direction 与
returned display order 遵循 `queryRows`。Runtime MUST 用 set-based/window query
或 bounded batched query 取得 group、aggregate 与 inline row；每个 group 或每个
row 一条 query 不符合规范。group cursor 与 row cursor 使用相同的
revision/binding rule。

## 8. Relation 语义

```ts
interface ForwardRelationDefinition {
  direction: "forward"
  targetTableId: string
  cardinality: "one" | "many"
  onDelete: "restrict" | "detach" | "preserve"
}

interface InverseRelationDefinition {
  direction: "inverse"
  targetTableId: string
  cardinality: "many"
  inverseOfFieldId: string
}

type RelationDefinition = ForwardRelationDefinition | InverseRelationDefinition
```

forward Relation 的 logical value 是其 canonical ordered unique Row-ID array。
cardinality `one` 允许长度为零或一。Runtime 在执行 SQL 前拒绝 duplicate、
malformed 或 over-limit ID。普通 row mutation 只能增加当前存在于精确 target
Table 中的 ID。显式 import/replay operation MAY 仅为 `preserve` Relation 保留
unresolved ID，并且 MUST 报告；它不能伪造 resolved label。

inverse Relation 没有 raw column。对于 target row `t`，其 value 是 forward
array 包含 `t` 的每个 source Row ID，按 source Row ID `BINARY ASC` 排序。inverse
target Table 是 forward Relation 的 owner Table。它始终是 cardinality many 且
read-only。Runtime 以一次 set-based expansion 求值；在安全解析并引用 name 后，
等价于以下 private template：

```sql
SELECT source."_id"
FROM <source-table> AS source
JOIN json_each(source.<forward-column>) AS edge
  ON edge.type='text'
WHERE edge.value=?1
ORDER BY source."_id" COLLATE BINARY;
```

forward resolution 使用保留 `json_each.key` 的 set-based expansion：

```sql
SELECT owner."_id", edge.key, edge.value, target."_id"
FROM <owner-table> AS owner
JOIN json_each(owner.<forward-column>) AS edge ON edge.type='text'
LEFT JOIN <target-table> AS target ON target."_id"=edge.value
WHERE owner."_id" IN (<bounded-bindings>)
ORDER BY owner."_id" COLLATE BINARY, edge.key;
```

这些 template 是 algorithm，而不是 public SQL，也不允许拼接 identifier。Runtime
可以使用等价的 warm reverse index，但 cold 与 warm result MUST 相同。任何受影响
Relation mutation 或 revision change 都会 invalidate generated reverse state。

删除 target row 时，在同一 write transaction 中对每个受影响 forward Relation
应用 File Format trigger semantics：

- `restrict`：如果任一 target ID 被引用，以 `constraint` 和 stable Relation/
  target diagnostic 拒绝整个 operation；
- `detach`：删除每个已删 ID，保持 survivor order，并使用 operation timestamp
  对每个 changed source row 的 `_updated_at` 更新一次；
- `preserve`：array byte-for-byte 不变，因而这些 entry 变为 unresolved。

multi-row delete 会在 mutation 前以 set-wise 方式计算所有 restriction 与 detach
effect。它 MUST NOT 依赖 delete order。restriction 或 trigger 失败会 rollback
全部 row、timestamp 与 revision effect。Table/Field rename 不影响 Relation value，
因为 definition 与 cell 使用 stable ID。

## 9. Formula 语言与求值

### 9.1 Definition 与同 Table reference

```ts
type FormulaResultType =
  | "text"
  | "number"
  | "integer"
  | "checkbox"
  | "date"
  | "datetime"
  | "url"

interface FormulaDefinition {
  sourceText: string
  resultType: FormulaResultType
}
```

Formula source 是 human text。每个 Field reference 都是 Formula Field 所在 Table
中的精确 current display name，并包在 double quote 中；内嵌 `"` 要写成两次。
decoded spelling MUST 与 current display name byte-for-byte 相等。File Format 的
`NOCASE` uniqueness rule 防止有歧义的 ASCII variant，但不会让 variant spelling
变得有效。Formula 不能直接命名另一 Table 的 Field、遍历 Relation、访问 View
或引用 physical identifier。cross-table value 只能通过同一 Table 的 Lookup Field
进入。

source 可以引用该 Table 的 stored、system、Formula 或 Lookup Field。最终的
file-wide derived graph MUST acyclic。Formula Field 本身就是 graph node，即使
evaluation 可以 short-circuit 该 reference 亦然。conditional reachability 从不
豁免 cycle。

Formula 1.0 是 **Eidos SQLite 3.45 scalar-expression profile**。白名单函数与
源自 SQLite 的 expression construct，对于允许的 argument type 使用 SQLite
3.45 文档规定的语义；Formula 的 statically typed arithmetic 与 comparison
仍按第 9.3 节执行。该 profile 独立于 Host 使用的 SQLite library 版本：升级
Host 不会自动增加 Formula syntax 或 function。Runtime 解析下述固定 grammar
并生成 SQL，绝不把 Formula source 直接作为 SQL 执行。aggregate、window、
table-valued、connection-state、environment-dependent、non-deterministic、
extension 与 application-defined function 均不属于该 profile。

### 9.2 Lexical grammar

以下 EBNF 是 normative。quote 中的 literal text 必须精确；`{x}` 表示零次或多次，
`[x]` 表示 optional。

```ebnf
expression     = or-expression ;
or-expression  = and-expression, { "OR", and-expression } ;
and-expression = not-expression, { "AND", not-expression } ;
not-expression = [ "NOT" ], comparison ;
comparison     = concatenation,
                 [ ( ( "=" | "==" | "!=" | "<>" | "<" | "<="
                       | ">" | ">=" ), concatenation )
                   | ( "IS", [ "NOT" ], "NULL" ) ] ;
concatenation  = additive, { "||", additive } ;
additive       = multiplicative, { ( "+" | "-" ), multiplicative } ;
multiplicative = unary, { ( "*" | "/" | "%" ), unary } ;
unary          = [ "+" | "-" ], primary ;
primary        = "NULL" | "TRUE" | "FALSE" | number | string
               | field-reference | function-call
               | cast-expression | case-expression
               | "(", expression, ")" ;
function-call  = function-name, "(", [ expression,
                 { ",", expression } ], ")" ;
cast-expression = "CAST", "(", expression, "AS",
                  ( "TEXT" | "INTEGER" | "REAL" ), ")" ;
case-expression = "CASE", when-clause, { when-clause },
                  [ "ELSE", expression ], "END" ;
when-clause    = "WHEN", expression, "THEN", expression ;
function-name  = ASCII-letter, { ASCII-letter | ASCII-digit | "_" } ;
field-reference = '"', { identifier-char | '""' }, '"' ;
string         = "'", { string-char | "''" }, "'" ;
number         = ( "0" | nonzero-digit, { ASCII-digit } ),
                 [ ".", ASCII-digit, { ASCII-digit } ],
                 [ ( "e" | "E" ), [ "+" | "-" ],
                   ASCII-digit, { ASCII-digit } ] ;
```

`identifier-char` 是除 `"` 外的任意 Unicode scalar；双写的 `""` decode 为一个
quote。`string-char` 是除 `'` 外的任意 Unicode scalar；双写的 `''` decode 为
一个 apostrophe。backslash 没有 escape meaning。token 外只有 U+0020、tab、CR
与 LF 是 whitespace。keyword 与 function name 对 ASCII 不区分大小写；standard
serializer 输出 uppercase。无 fraction/exponent 的 numeric literal 在 int64
范围内时是 Integer；否则，当把精确 decimal rational 按 round-to-nearest,
ties-to-even 规则恰好舍入一次为 IEEE 754 binary64 后得到 finite value 时，它是
Number。decimal underflow 为 positive zero 是有效的。implementation 不得使用
locale parser，也不得在不执行该 final rounding 的情况下暴露 extended-precision
result。作为一项特殊 constant-folding rule，直接对 token
`9223372036854775808` 应用 unary `-` 会产生 Integer
`-9223372036854775808`；该 unsigned token 本身是 Number。因为 token 是
unsigned，且 unary 接受一个 optional sign，`--1` 无法 parse。其他所有导致
binary64 overflow 的 literal 均为 `invalid-formula`；unary minus 产生的任何
Number negative zero 都规范化为 positive zero。

该 grammar 不存在 comment、assignment、property/index access、array/object
literal、subquery、SQL fragment、semicolon、collation clause、user-defined
function 或 implicit Field reference。`CAST` target name 仅限上述三个 keyword，
不能使用任意 SQLite type name。`CASE` 仅支持 searched form；不支持
`CASE value WHEN ...` 这种 simple form。

### 9.3 Static type 与 operator

Null 是每种 Formula result 的可能 value，但不是独立的 declared type。提交
Formula 要求 inferred non-null result type 与 `resultType` 精确相等。

完整的 non-null Formula type universe 恰好是 `text`、`number`、`integer`、
`checkbox`、`date`、`datetime` 与 `url`。referenced Field 按以下 mapping
进入该 universe：`select` 与 `row-id` 变为 `text`；上述七种同名 type 保持自身。
这同等适用于 stored/system Field 与 scalar Formula/Lookup result。
`multi-select`、`file`、`relation`、`file-entry` 与 list TypeRef 不能作为 Formula
operand，即使对 `IS NULL` 也不行；引用其中任一项都是 `invalid-formula`。Formula
不能制造 `select`、`row-id`、File entry 或 list value。

Type checking 从 declared result type 进行 bidirectional 推导。`NULL` literal 是
bottom value：它接受 surrounding required type，但绝不自行选择 type。在
operator、`IIF`、`COALESCE`、`MIN` 或 `MAX` 中，non-null peer 决定其 type；
declared root type 可以流经 type-preserving construct，因此 `NULL`、
`IIF(TRUE,NULL,NULL)` 与 `COALESCE(NULL,NULL)` 对任意 declared Formula result
type 都有效。没有 expected/peer operand type 的 construct（例如
`NULL = NULL`）是 `invalid-formula`。`NULL IS NULL` 有效，因为其 operand 接受
任意 type。完成该 contextual step 后，应用下述全部普通 exact-type rule。

| Construct                | Accepted operands                          | Result           |
| ------------------------ | ------------------------------------------ | ---------------- |
| unary `+`, `-`           | Integer or Number                          | same type        |
| `+`, `-`, `*`            | numeric; Integer+Number promotes to Number | promoted numeric |
| `/`                      | numeric                                    | Number           |
| `%`                      | Integer, Integer                           | Integer          |
| concatenation            | any two scalar values                      | text             |
| `< <= > >=`              | same sortable scalar, or mixed numeric     | checkbox         |
| `= == != <>`             | same Formula type, or mixed numeric        | checkbox         |
| `IS NULL`, `IS NOT NULL` | any scalar                                 | checkbox         |
| `AND OR NOT`             | checkbox                                   | checkbox         |
| `CAST(X AS TEXT)`        | any scalar                                 | text             |
| `CAST(X AS INTEGER)`     | any scalar                                 | integer          |
| `CAST(X AS REAL)`        | any scalar                                 | number           |
| searched `CASE`          | checkbox condition 与同一 exact branch T   | T                |

`||`、`CAST`、`CASE`、`IS NULL` 与 `IS NOT NULL` 使用 SQLite 3.45 的 null
与 conversion behavior。具体而言，`||` 将 non-null scalar operand 转为 text 并
传播 null；`IS NULL` 与 `IS NOT NULL` 永不返回 null；省略 `CASE ELSE` 时结果为
null。`CASE`、`IIF`、`COALESCE`、`IFNULL`、`AND` 与 `OR` 使用 SQLite
short-circuit evaluation。除这些 construct 与下述 function-specific rule 外，
null operand 产生 null。与 Filter node 不同，
Formula Boolean operator 使用 three-valued logic：`NOT T=F`、`NOT F=T`、
`NOT null=null`；`T AND null=null`、`F AND null=F`、`T OR null=T` 且
`F OR null=null`。result type 为 Integer 的 Integer arithmetic 使用精确 signed
int64；overflow 产生 null。`/` 总是采用下述 Number-promotion
path，因此 Integer `INT64_MIN / -1` 得到 finite rounded Number result，而不是
Integer overflow。Integer `%` 使用 toward-zero truncation 的 quotient，并返回
`a - trunc(a/b) * b`；zero divisor 产生 null，且 `INT64_MIN % -1` 恰好为零。
对于 mixed arithmetic，每个 Integer operand 先按 ties-to-even 舍入一次为最近的
binary64，然后执行规定的 binary64 operation。mixed comparison 与 equality 则
按照第 5.1 节，以 exact mathematical Integer value 对 exact finite binary64
value 比较；它们不会先舍入 Integer。mixed `MIN`/`MAX` 按该 comparison 选择，且
由于 result type 为 Number，会把选中的 Integer 恰好转换一次为 binary64。
Number arithmetic 遵循 IEEE 754 binary64，并采用 round-to-nearest,
ties-to-even；NaN、infinity 或 negative-zero result 分别变为 null、null 或
positive zero。normalize 前 equality 把 positive zero 与 negative zero 视为
相等；JSON equality 比较 canonical JCS text。Formula sortable type 恰好是
text、number、integer、checkbox、date、datetime 与 URL，并使用第 5.1 节的
order。在 `CAST`、`||` 与有文档定义的 SQLite function signature 之外，不存在
text/numeric 或 date/datetime coercion。

### 9.4 Function whitelist

Formula 1.0 仅存在下列 ASCII-case-insensitive SQLite 3.45 scalar function。
`T` 表示一个 exact Formula type，`numeric` 表示 Integer 或 Number，`scalar`
表示任意 Formula scalar operand。下述 static signature 会限制 Formula 接受的
SQLite call；call 一旦通过，value、null handling、conversion、indexing、
formatting 与 error behavior 均按 SQLite 3.45 执行。

| Category          | Functions                  | Formula 接受的 argument                                   | Formula result    |
| ----------------- | -------------------------- | --------------------------------------------------------- | ----------------- |
| null and choice   | `COALESCE`                 | 2..16 个同一 T                                            | T                 |
| null and choice   | `IFNULL`                   | T, T                                                      | T                 |
| null and choice   | `IIF`                      | checkbox, T, T                                            | T                 |
| null and choice   | `NULLIF`                   | T, comparable T                                           | T                 |
| numeric           | `ABS`                      | numeric                                                   | 同一 numeric type |
| numeric           | `CEIL`, `CEILING`, `FLOOR` | numeric                                                   | 同一 numeric type |
| numeric           | `ROUND`                    | numeric；可选 Integer precision                           | Number            |
| numeric           | `SIGN`                     | numeric                                                   | Integer           |
| scalar comparison | `MAX`, `MIN`               | 2..16 个同一 sortable T                                   | T                 |
| text              | `CHAR`                     | 1..16 个 Integer                                          | text              |
| text              | `CONCAT`                   | 1..16 个 scalar value                                     | text              |
| text              | `CONCAT_WS`                | text separator，随后 1..15 个 scalar value                | text              |
| text              | `FORMAT`, `PRINTF`         | text format，随后 0..15 个 scalar value                   | text              |
| text              | `INSTR`                    | text, text                                                | Integer           |
| text              | `LENGTH`, `OCTET_LENGTH`   | text                                                      | Integer           |
| text              | `LOWER`, `UPPER`           | text                                                      | text              |
| text              | `LTRIM`, `RTRIM`, `TRIM`   | text；可选 text character set                             | text              |
| text              | `REPLACE`                  | text, text, text                                          | text              |
| text              | `SUBSTR`, `SUBSTRING`      | text, Integer start；可选 Integer length                  | text              |
| text              | `UNICODE`                  | text                                                      | Integer           |
| pattern           | `GLOB`                     | text pattern, text value                                  | checkbox          |
| pattern           | `LIKE`                     | text pattern, text value；可选 text escape                | checkbox          |
| inspection        | `HEX`, `QUOTE`, `TYPEOF`   | scalar                                                    | text              |
| date/time         | `DATE`                     | time value，随后 0..8 个 literal modifier                 | date              |
| date/time         | `DATETIME`                 | time value，随后 0..8 个 literal modifier                 | datetime          |
| date/time         | `TIME`                     | time value，随后 0..8 个 literal modifier                 | text              |
| date/time         | `JULIANDAY`                | time value，随后 0..8 个 literal modifier                 | Number            |
| date/time         | `UNIXEPOCH`                | time value，随后 0..8 个 literal modifier                 | Integer           |
| date/time         | `STRFTIME`                 | literal format, time value，随后 0..7 个 literal modifier | text              |
| date/time         | `TIMEDIFF`                 | time value, time value                                    | text              |

SQLite indexing 原样适用：`SUBSTR`/`SUBSTRING` position 从一开始；零使用
SQLite 文档规定的特殊行为；negative position 从末尾计数；negative length
选择 position 之前的字符。`CONCAT` 将 non-null value 转成 text 并跳过 null，
所有 value 均为 null 时也返回 empty text。`CONCAT_WS` 在 separator 为 null 时
返回 null，否则跳过 null value。默认 SQLite `LOWER` 与 `UPPER` 仅 fold ASCII
character。`FORMAT` 与 `PRINTF` 是 alias，使用 SQLite 内建 `printf()`
formatting rule，不使用 Host locale。

对于 date/time 行，time value 必须是 date 或 datetime operand、采用其中一种
type 的 null，或 string literal。literal `now` 按 ASCII-case-insensitive 比较后
判定为 `invalid-formula`。每个 modifier 与 `STRFTIME` format 都必须是 string
literal。modifier `localtime`、`utc` 与 `auto` 按
ASCII-case-insensitive 比较后均为 `invalid-formula`。`UNIXEPOCH` 还会拒绝
`subsec` 与 `subsecond`，以保持 static result 为 Integer。不得省略 time value。这些
限制移除了 clock、timezone 与 runtime-version dependency，同时保留 SQLite
calendar semantics。

旧 Eidos spelling 不产生任何 alias：`IF`、`IS_NULL`、`LOWER_ASCII`、
`UPPER_ASCII`、`DATE_ADD_DAYS`、`DATE_DIFF_DAYS`、
`DATETIME_ADD_MILLISECONDS` 与 `DATETIME_DIFF_MILLISECONDS` 均不受支持。
`MAX` 或 `MIN` 的 aggregate/window 用法、所有 table-valued function、
`random`、`randomblob`、`changes`、`last_insert_rowid`、`total_changes`、
`sqlite_version`、`sqlite_source_id`、`sqlite_compileoption_get`、
`sqlite_compileoption_used`、`sqlite_offset`、`load_extension`、`likely`、
`likelihood`、`unlikely`、`soundex`、`unhex`、`zeroblob`、JSON function 与
所有 Host UDF 均不属于 Formula 1.0。newer SQLite library 新增的所有 function
也不自动进入。Formula evaluation 仍然是 row、referenced canonical state 与
definition 的 pure function。所有 generated text 均受普通 Runtime response 与
logical-value byte limit 约束。

Runtime 构造时，Host 必须证明每个 whitelist function 都可调用。如果 SQLite build
省略了 compile-time optional function，Host 可以在同一个官方 SQLite name 下安装
deterministic、direct-only scalar compatibility function，但其 accepted value 与
SQLite storage-class result 必须匹配 SQLite 3.45。完整 profile 不可用时，Runtime
构造以 `unsupported-feature` 失败。

### 9.5 Dependency plan、evaluation 与 serializer

Runtime 解析 source，在 generated state 中把 reference node 解析为 Field ID，
从每个 referenced virtual Field 向 dependent Formula Field 添加 edge，并与第 10
节中相同 dependency-to-dependent direction 的 Lookup edge 合并。它在整个 File
上执行 cycle detection，并按 deterministic topological order 求值；independent
node 之间以 Field ID `BINARY` 为 tiebreaker。parsed AST、edge、plan 与 compiled
SQL 都是 generated state。

Runtime MUST 以 set-wise 方式对 page 与 aggregate 求值。它可以编译 safe SQL
或使用 vector batch，但不能把 user source 当作 SQL/JavaScript 执行，也不能每行
执行一条 query。short-circuit `IIF`、`CASE`、`COALESCE`、`IFNULL`、`AND` 与
`OR` 可避免未选择 branch 的 row
error，但不改变 static type/dependency check。

standard serializer 输出 uppercase keyword/function、canonical Integer
literal、双写的 string 与 identifier quote、comma 后一个 space，以及 infix
operator 两侧各一个 space。Number 使用 ECMA-262 `Number::toString`（即 RFC 8785
引用的 algorithm）产生的 shortest round-trippable finite binary64 spelling，
采用 lowercase `e` 及其规定的 exponent sign；但如果该 spelling 会 lex 为
in-range Integer token，则追加 `.0`，以保留 Number type（`1.0` 永不 serialize
为 Integer `1`）。

所有 repeated infix production 都是 left-associative，comparison 是
non-associative。serializer 保留 exact AST：它为 lower-precedence child、每个
equal binary precedence 的 right child、每个 nested comparison，以及可能形成
second sign 的 unary child 添加 parenthesis；它还会为 root 为 `NOT` 的 `NOT`
child 添加 parenthesis，因此 `NOT (NOT TRUE)` 绝不会变成不符合 grammar 的
`NOT NOT TRUE`。除此之外都省略 parenthesis。Runtime 创建或编辑的 Formula 使用
该 serializer。Reader 也接受 grammar-equivalent
whitespace/spelling，因此 `sourceText` 保持为 human source，而不是 hidden AST。

Field rename 时，Runtime 在旧 namespace 下 parse，把 resolved AST reference node
替换为新 Field name，serialize 每个受影响 Formula，并在 physical 与 metadata
rename 的同一 transaction 内重新验证 graph 与 result type。它绝不执行 textual
replacement。任何 ambiguity、parse/type/cycle failure 都会 rollback 整个 rename。

### 9.6 Formula preview

```ts
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
  revision: string
  valid: boolean
  inferredType?: FormulaResultType
  dependencies?: string[]
  rows?: Array<{ rowId: string; value?: LogicalValue; error?: RuntimeError }>
  diagnostics: RuntimeDiagnostic[]
  diagnosticsTruncated: boolean
}
```

当 `valid=true` 时，`inferredType`、`dependencies` 与 `rows` 都存在；parse、
name resolution、static typing、cycle 或 definition limit 失败时，`valid=false`，
三者都省略，并且 diagnostic 至少包含一个 error。这种 invalid candidate 是
preview result，而不是抛出的 `invalid-formula`；malformed request shape 与
request/resource limit 仍返回其普通 error。存在 `fieldId` 时，它必须标识
`tableId` 中 existing Formula Field；此时禁止 `candidateName`，candidate 会为
cycle analysis 替换该 graph node。没有 `fieldId` 时，必须提供 `candidateName`，
它遵循 Field name uniqueness，并在 Table namespace 中定义 fresh ephemeral node；
引用该 name 是 self-cycle。Dependency 是按首次 source occurrence order 排列的 unique Field ID。显式 row
ID 唯一并保持 request order；absent ID 产生 per-row `not-found` error。如果未
提供 ID，Runtime 会按 Row ID `BINARY` 取前 `formulaPreviewRowsMax` 行作为 sample。
每行恰好包含 `value` 或 `error` 之一。diagnostic 先按 source UTF-8 byte offset、
再按 code 排序，并在 `diagnosticsMax` 处 truncate；当且仅当后面仍有更多内容时
`diagnosticsTruncated=true`。Preview 不改变 state，也不授权后续 commit；schema
preflight 会在其绑定的 revision 重新 parse。

## 10. Lookup 求值与 Cross-Table DAG

```ts
interface LookupDefinition {
  relationFieldId: string
  targetFieldId: string
  aggregate: "values" | "first" | "count" | "sum" | "average" | "min" | "max"
  distinctValues: boolean
}
```

Relation Field 属于 Lookup owner 的 Table。它的 target Table 必须拥有 target
Field。forward 与 inverse Relation 都允许。target 可以是 stored、system、
Relation、Formula 或 Lookup。Lookup 不能引用 View、physical name、formatted
label 或 generated cache。

对一个 owner row，Runtime 按 Relation order 取得 Relation target row：forward
array order，或 inverse source-Row-ID `BINARY` order。unresolved target 不贡献
element。对按该顺序排列的每个 resolved target：

1. scalar target 贡献其一个 value，包括 null；
2. Multi-select、File、Relation 或 `values` Lookup 按已有顺序贡献其 element；
3. nested list 以 depth-first 方式递归 flatten，直至只剩一个 flat sequence。

Runtime 从不对 flatten 后的 sequence 排序。`distinctValues=true` 时，它保留每个
typed value 的首次 occurrence。null 等于 null；number 使用 normalized binary64
equality；Integer 使用 mathematical int64 equality；string 与 ID 使用精确
Unicode/BINARY equality；structured File entry 使用其 JCS public-object
equality。不同 logical type 的 value 永不相等。因此 distinct 保持 deterministic
first-occurrence order。

Aggregate behavior 为：

| Aggregate     | Result                                                        |
| ------------- | ------------------------------------------------------------- |
| `values`      | flat sequence，包括 null                                      |
| `first`       | 第一个 element，包括 null；empty 时为 null                    |
| `count`       | non-null element count，表示为 Integer decimal                |
| `sum`         | numeric non-null sum；empty 时为 null                         |
| `average`     | numeric non-null element 的 binary64 average；empty 时为 null |
| `min` / `max` | non-null element 的 typed sortable min/max；empty 时为 null   |

Distinct 在 aggregate 前应用，包括在 `count` 前。Integer 与 Number aggregate
按第 7 节的 arithmetic rule 处理已经定义好的 flat occurrence order；不会再次
sort。arithmetic overflow/non-finite output 是 row-evaluation failure，因此按第
6.2 节使该 Lookup cell 为 null，而不是 whole-request aggregate error。
`sum`/`average` 要求 numeric element type；`min`/`max` 要求一种 sortable
element type。inferred `valueType` 对
`values` 是 one-level list；对 `first`/`min`/`max` 是 element type；对 `count`
是 Integer；对 `sum` 是 Integer 或 Number；对 `average` 是 Number。empty
dataset 不会放宽 static type check。

每个 virtual dependency 都从 referenced virtual Field 向其 dependent
Formula/Lookup Field 添加 edge。即使 current Relation array 为空，
Lookup-through-Relation 仍然是 edge。Runtime 通过 depth-first color algorithm 或等价 strongly connected
component，在所有 Table 上检测 cycle。self-loop 或 size 大于一的 component 是
`cycle`。为生成 diagnostic，应考虑每个 simple directed cycle，把其 unique-ID
sequence 旋转到 smallest Field ID 位于首位，再把该首个 ID 追加一次作为 closing
element。用 Field-ID `BINARY` 逐 element 比较 normalized sequence；当一个是另一
个的 proper prefix 时，较短者在前。diagnostic 报告由此得到的 globally smallest
sequence。这是精确的 minimum-cycle rule；traversal/discovery order 不得改变它。

Runtime 以 topological order 对 acyclic graph 求值，并以 Field ID `BINARY` 作为
stable ready-node tiebreaker。它以 set-wise 方式展开 Relation row 与 target value，
保留 owner ID、relation ordinal、nested ordinal 与 typed value。page、aggregate
或 validation operation MUST NOT 对每个 owner row、Relation element、Formula
或 Lookup 分别执行一条 target query。generated edge table/reverse index MAY 让
warm evaluation 更快，但 cold 与 warm value 及 order 必须相同。

## 11. Public Operation 与 Atomic Mutation

### 11.1 精确 public service

Eidos Runtime 拥有以下完整 asynchronous binding。`RuntimeService` 与
`RuntimeClient` 是同一个 operation contract 的两个名称；前者是 factory result，
后者是 direct/Transport-facing binding。

```ts
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
    request: { minimumRevision?: string },
    context: RequestContext
  ): Promise<RuntimeSnapshot>
  getSchemaPage(
    request: GetSchemaPageRequest,
    context: RequestContext
  ): Promise<SchemaPage>
  queryRows(
    request: QueryRowsRequest,
    context: RequestContext
  ): Promise<RowPage>
  getRowsById(
    request: { tableId: string; rowIds: string[]; projection: ProjectionSpec },
    context: RequestContext
  ): Promise<RowBatch>
  aggregate(
    request: AggregateRequest,
    context: RequestContext
  ): Promise<AggregateResponse>
  summarizeFields(
    request: FieldSummaryRequest,
    context: RequestContext
  ): Promise<FieldSummaryResponse>
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
    request: { undoToken: string; expectedRevision: string },
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

type RuntimeService = RuntimeClient
```

每个 `Promise<T>` 恰好 settle 一次，返回 `T` 或第 4.3 节的 structured
`RuntimeError`；binding MUST NOT 用 raw driver 或 Host exception 代替。
`previewFormula` 始终存在，其 capability 为 false 时返回 `unsupported`。
`revertMutation`、`subscribe`、`exportCsv` 与 `importCsv` 当且仅当对应的
`mutationUndo`、`events`、`csvExport` 或 `csvImport` capability 为 true 时存在。
`cancel({requestId})` 是 idempotent，且只请求 cancellation；它不能证明 write
未 commit。convenience method 只能作为这些 operation 的精确 composition 存在。
特别是，`analyzeFormula` 是 Formula preview 或 Formula schema preflight，
`convertField` 是 schema preflight 后 application plan；两者都不能定义 alternate
semantics。

### 11.2 Row mutation shape

```ts
interface RowMutation {
  tableId: string
  expectedRevision: string
  returning?: ProjectionSpec
  changes: RowChange[]
}

type RowChange =
  | { kind: "create"; clientKey: string; values: Record<string, LogicalValue> }
  | { kind: "update"; rowId: string; values: Record<string, LogicalValue> }
  | { kind: "delete"; rowId: string }

interface MutationResult {
  fileId: string
  revision: string
  changed: boolean
  created: Array<{ clientKey: string; rowId: string }>
  affectedRows: Array<{ tableId: string; rowId: string }>
  returnedRows?: RowBatch
  undoToken?: string
  evictedUndoTokens?: string[]
}

type CreatedSchemaObject =
  | { id: string; object: "table"; clientKey: string }
  | { id: string; object: "field"; clientKey: string }
  | {
      id: string
      object: "field"
      systemRole: "row-id" | "created-time" | "updated-time"
    }

type CommitReconciliation =
  | {
      operation: "mutateRows" | "revertMutation"
      result: {
        fileId: string
        revision: string
        changed: true
        created: Array<{ clientKey: string; rowId: string }>
        affectedRows: Array<{ tableId: string; rowId: string }>
      }
    }
  | {
      operation: "mutateView"
      result: {
        fileId: string
        revision: string
        changed: true
        createdViews: Array<{ clientKey: string; viewId: string }>
        affectedViewIds: string[]
      }
    }
  | {
      operation: "mutateSchema"
      result: {
        fileId: string
        revision: string
        changed: true
        createdObjects: CreatedSchemaObject[]
        affectedTableIds: string[]
        affectedFieldIds: string[]
      }
    }
  | {
      operation: "importCsv"
      result: {
        fileId: string
        tableId: string
        revision: string
        changed: true
        createdRows: Array<{ recordIndex: number; rowId: string }>
      }
    }

interface TransportCommitBarrier {
  prepare(
    preparation: {
      fileID: string
      baseRevision: string
      commitRevision: string
      reconciliation: CommitReconciliation
    },
    context: RequestContext
  ): Promise<void>
}
```

普通 public service 中每个 Row ID 均由 Runtime 分配。显式 ID 仅存在于另行授权
的 embedding import/replay interface，绝不出现在 `RuntimeClient` 中，也绝不是
negotiated UI choice。`clientKey` 是 request-scoped non-empty correlation string；
它不持久化。client key 必须唯一。任何 Row ID 都不得出现在多于一个 change 中，
update/delete Row ID 只在 `tableId` 中解析；如果它在那里不存在，result 始终是
`not-found`，无论相同 spelling 是否出现在另一 Table。caller 编写的 `RowChange`
target 均属于这一个 Table；除非 schema plan 拥有该 transaction，否则另一 Table
中的显式 change 需要另一个 operation 与 revision。deterministic incoming
Relation-policy side effect 不是 caller 编写的 change，并可按下文规定影响其他
Table。

Create/update `values` 是 sparse Field-ID map。Runtime 拒绝 display name、
physical name、unknown Field、system Field、Formula、Lookup 与 inverse Relation
key。它在打开 write transaction 前验证完整 logical value。具有有效 File Format
`settings.defaultOption` 的 missing Select Field 使用该 exact option name。此规则
只用于 create，且只在 `values` 中没有该 Field ID 时运行；nullable Select 的显式
null 会抑制 default。其他 missing nullable Field 成为 null。missing Multi-select、
File 与 forward Relation Field 使用 `[]`。其他所有 missing non-null user Field
都是 `invalid-value`；不存在 implicit type default。Runtime 填充 Row ID 与
created/updated timestamp。CSV import/replay 保持其 explicit input contract；除非
它调用 ordinary row-create operation，否则不得推断此 create-time default。

display catalog 中不存在的 Select value 仍然有效。Multi-select 与 Relation value
必须已 ordered/unique；Runtime 不会默默 deduplicate。JSON Field input 是 JCS
text，而不是 object。date/datetime input 必须 canonical，除非明确选择的 schema/
CSV conversion 另有规定。

multi-row composition 基于 set，与 change order 无关。Runtime 首先为 create
分配 ID，形成 request Table 中完整的 proposed surviving row set，并声明其 delete
set。随后，对每个 incoming forward Relation，它使用显式 update 的 proposed
array（若存在），否则使用 current array，来求值 surviving source row；deleted
source row 被排除。仅当 composed array 仍包含 target delete-set ID 时，
`restrict` 才失败；`detach` 移除每个此类 ID 并保持 survivor order；`preserve`
保留该 operation 前已存在于 source row 的 occurrence。caller 不能在
`preserve` 下引入 target-delete-set ID。

最后，每个 newly introduced Relation ID 都必须在 proposed final target Table
（base row 减 delete 加 allocated create）中解析。existing unresolved occurrence
只能在其现有 `preserve` policy 下存续；再次提交它不会将其转化为 newly authorized
reference。这些 check 与所有 detach result 都在任何 SQL write 前计算。每个 final
source row 最多收到一个 updated timestamp。`returnedRows` 与 `affectedRows`
描述这份 fully composed post-policy state，包括 cross-Table detach row；trigger
execution order 不得改变 outcome。

使用 empty map 的 update 是 `invalid-request`。仅当至少一个 resulting canonical
cell 不同时，update 才改变 `_updated_at`。equal binary64 value 在 negative-zero
normalization 后比较；list/File value 比较 canonical JCS byte；其他 raw
value 比较其精确 canonical representation。

如果存在 `returning`，successful result 会在新 revision（或不变的 no-op
revision）包含 `returnedRows`，其中按 change order 列出所有 surviving created/
updated row 及 requested projection。deleted row 由 `affectedRows` 表示，不会
插入 `missingRowIds`。这是 optimistic client 使用的 authoritative post-commit
value。如果没有 `returning`，client 在把 locally derived value 当成 committed
前必须 refetch。

### 11.3 Transaction、revision 与 no-op rule

每次 write 时 Runtime：

1. 验证 request shape 与 bounded size；
2. 进入一个 Adapter `transaction("write",...)`；
3. 在该 transaction 内读取 `eidos__meta.revision` 并与 `expectedRevision` 比较；
4. 检查每个 target、dependency、Relation policy 与 final value；
5. 应用前计算所有 effect；
6. 应用 canonical change 并验证受影响 invariant；
7. 当且仅当 canonical state 改变时，把 revision 增加一次，并将 meta
   `updated_at` 设置为 operation wall-clock instant；
8. commit，然后发出 revision event。

对于每个 changed `mutateRows`、`revertMutation`、`mutateView`、`mutateSchema` 或
`importCsv`，第 7 步会从 tentative public result 构造唯一匹配的
`CommitReconciliation`，并保留至 outcome settlement。存在
`transportCommitBarrier` 时，Runtime 还会在第 8 步之前立即调用其 `prepare`；
此时 outer write transaction 仍 open，且没有 active statement。`fileID` 是 result
File ID，`baseRevision` 是第 3 步检查的 revision，`commitRevision` 恰为其 int64
successor，并等于 `reconciliation.result.revision`。operation tag 必须等于被调用
的 Runtime method。record 包含每个 server-allocated persistent ID 与 stable
postcondition，但有意排除 returned projection、diagnostic、undo/plan/cursor
token 与其他 epoch-private state。

reconciliation JCS 计入 `responseBytesMax`，而且在 transported 时也计入 Adapter
prepared-envelope limit。failure、no-op 或无法装入其可能的 direct error/
Transport carrier 的 record 不得 commit，也绝不调用 barrier。在 exact Adapter
receipt/ack protocol 后 barrier resolve 之前，Runtime MUST NOT 发出 COMMIT。
ack 前 rejection 导致 known rollback。ack 后 Runtime 尝试 COMMIT 恰好一次；
无法证明的 outcome 会使 Adapter epoch 成为 fatal，并由 transported facade 作为
`unknown-commit` 暴露，绝不自动 replay。direct binding 没有 barrier，采用普通
Adapter transaction outcome rule。

第 3 步不匹配是 `stale-revision`，带有 `currentRevision` 且无任何 side effect。
update/delete row 缺失是 `not-found`，并 rollback 整个 request。duplicate create
是 `already-exists`。restrict、invalid Relation 或任何 change failure 都会
rollback 全部 row、timestamp、detached Relation、metadata、generated
invalidation 与 revision。

只包含 equal update 的 request 返回 `changed=false`、不变 revision、empty
`affectedRows`，且没有 timestamp/event/undo effect。empty `changes` 无效。
Create 与 delete 始终是 actual change。只有当每个 persisted canonical value
完全相同时，position 或 JCS reserialization 才是 no-op；改变任何 persisted
position integer 都是 actual metadata change，即使 object identity 与 value
semantics 保持不变。revision
`9223372036854775807` 遇到任何 actual write 都以 `resource-limit` 拒绝；绝不
wrap。

所有 created/updated row 与 meta row 使用同一个 operation timestamp。`created`
遵循 create-change order。`affectedRows` 包含每个实际 changed row，包括
Relation-detach side effect；按 Table ID、再按 Row ID `BINARY` 排序，且无
duplicate。

### 11.4 Undo extension

当 `mutationUndo=true` 时，每个 successful changed `mutateRows` 和
`revertMutation` result 都包含 opaque `undoToken` 与 `evictedUndoTokens` array。
此时提供 `revertMutation({undoToken,expectedRevision})`。token 没有 public
encoding，并绑定 File ID、Runtime epoch、完整 affected-object logical
before-state 与 applicability post-state。该 post-state 覆盖 affected row
existence、ID、creation time、user value、Relation side effect，以及这些 object
完整的 incoming Relation/dependency frontier，但不包括 logical revision、meta
`updated_at`，也不包括 undo operation 必须推进的 row
`_updated_at` value。

Revert 在同一个 write transaction 中把 `expectedRevision` 与 current revision
比较，并验证 token 的完整 applicability post-state。它还会在 write 前计算普通
inverse 当前的 restrict/detach/preserve 与 dependency effect。current frontier
必须等于 saved frontier，且 inverse 会影响的每个 object 都必须属于 token 的
saved affected set；否则 result 是 `conflict`，而不是 expanded 或 partial undo。
revision mismatch 是
`stale-revision`；missing token 是 `not-found`；token 存在但 affected state 不再
match 是 `conflict`。每种 failure 均无任何 effect，并保留 token 可用。Success
consume token，restore 已保存的 Row ID、原始 creation time、user value 与
Relation effect，把新 operation timestamp 赋给受影响 updated/meta time，把
revision 增加一次，并返回一个可用作 redo 的新 inverse token。它不减少 revision，
也不 restore SQLite byte。由于 applicability 基于 affected state，而不是 original
revision，undo 一个 later action 后，较早的 non-conflicting token 可以重新变得
applicable，从而让 multi-step undo 跨 monotonically increasing revision 工作。

Runtime 最多保留 `undoEntriesMax` 个 live token，以及这些 token 完整 logical
before/post/frontier state 的 `undoBytesMax` JCS byte。changed commit 前，它计算新的 inverse
record。如果该 record 单独就超过 `undoBytesMax`，operation 会在 commit 前以
`resource-limit` 失败。否则 Runtime provisionally reserve 它；对于 revert
accounting，它先移除 successfully consumed token，再按 token-creation sequence
选择最早保留的 token，直至两个 limit 都满足。`evictedUndoTokens` 按 oldest
first 列出这些 selected token；没有选择时为空。successful revert 所 consume 的
token 不属于 eviction。consumption、insertion 与 eviction 只有在 canonical
commit 成功后才生效，因此 rollback 会 restore 精确 prior retention state。
successful schema mutation 会 invalidate 全部 row undo token，client 在该 result
后清除其 row history。No-op 与 failed operation 均不返回任一 undo member，也不
改变 retention state。

当 `mutationUndo=false` 时，不存在 token/member/operation。client 只有从完整
logical before-state 才能构造显式 inverse，且必须在 current revision 把它作为
新 mutation 提交。它 MUST NOT 推断缺失的 delete、Relation 或 virtual effect。

### 11.5 View mutation

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
  expectedRevision: string
  changes: ViewChange[]
}

interface ViewMutationResult {
  fileId: string
  revision: string
  changed: boolean
  createdViews: Array<{ clientKey: string; viewId: string }>
  affectedViewIds: string[]
}
```

`mutateView` 返回 `ViewMutationResult`；create mapping 使用 `clientKey`。
Runtime 分配 View ID。name、query Field reference 与 JCS shape 针对同一 Table
验证；Runtime 不解释 standard layout key。保留 unknown layout member。每个
request 中一个 View ID/client key 只能出现一次。create 时 position 是 required
canonical int64 decimal string，且只通过 explicit patch 改变；Runtime 从不
invent append position。`createdViews` 遵循 create-change order，
`affectedViewIds` unique 且按 `BINARY` order 排列。View change 遵循上述精确的
no-op、expected-revision、timestamp、single-increment 与 rollback rule。

## 12. Schema Preflight、Reference Rewrite 与 Conversion

### 12.1 Schema change vocabulary

每次 schema application 都从恰好一个 tagged `SchemaChange` 开始：

```ts
type SchemaChange =
  | SchemaLeafChange
  | { kind: "batch"; changes: SchemaLeafChange[] }

type SchemaLeafChange =
  | {
      kind: "create-table"
      clientKey: string
      name: string
      position: string
      settings?: JsonObject
      fields: NewField[]
      labelFieldClientKey?: string
    }
  | { kind: "set-file-title"; title: string }
  | { kind: "set-default-table"; tableId: string | null }
  | { kind: "delete-table"; tableId: string }
  | { kind: "rename-table"; tableId: string; name: string }
  | { kind: "set-table-settings"; tableId: string; settings: JsonObject }
  | { kind: "set-table-position"; tableId: string; position: string }
  | { kind: "create-field"; tableId: string; field: NewField }
  | { kind: "delete-field"; fieldId: string; replacementLabelFieldId?: string }
  | { kind: "rename-field"; fieldId: string; name: string }
  | { kind: "set-field-nullable"; fieldId: string; nullable: boolean }
  | { kind: "set-field-settings"; fieldId: string; settings: JsonObject }
  | { kind: "set-field-position"; fieldId: string; position: string }
  | { kind: "set-record-label"; tableId: string; fieldId: string }
  | { kind: "set-formula"; fieldId: string; definition: FormulaDefinition }
  | { kind: "set-lookup"; fieldId: string; definition: LookupDefinition }
  | { kind: "set-relation"; fieldId: string; definition: RelationDefinition }
  | ConvertFieldChange
  | {
      kind: "rename-option"
      fieldId: string
      from: string
      to: string
      collision: "reject" | "merge"
    }

type StoredFieldType =
  | "text"
  | "number"
  | "integer"
  | "checkbox"
  | "date"
  | "datetime"
  | "url"
  | "select"
  | "multi-select"
  | "file"
  | "relation"

interface NewField {
  clientKey: string
  name: string
  kind: StoredFieldType | "formula" | "lookup"
  position: string
  nullable?: boolean
  settings?: JsonObject
  definition?: RelationDefinition | FormulaDefinition | LookupDefinition
}

type ConversionPolicy =
  | "round-binary64"
  | "truncate-toward-zero"
  | "round-ties-even"
  | "zero-false-nonzero-true"
  | "utc-date"
  | "first"
  | "null-to-empty-list"

type ScalarStoredFieldType =
  | "text"
  | "number"
  | "integer"
  | "checkbox"
  | "date"
  | "datetime"
  | "url"
  | "select"

type ConvertFieldChange =
  | {
      kind: "convert-field"
      fieldId: string
      to: ScalarStoredFieldType
      toNullable: boolean
      policies?: ConversionPolicy[]
    }
  | {
      kind: "convert-field"
      fieldId: string
      to: "multi-select" | "file"
      policies?: ConversionPolicy[]
    }
  | {
      kind: "convert-field"
      fieldId: string
      to: "relation"
      definition: ForwardRelationDefinition
      policies?: ConversionPolicy[]
    }
```

New client key 是 request-scoped 且 unique。position 是 required canonical
int64 decimal string，可以相同；Runtime 从不 invent append position。settings
默认为 `{}`。Runtime 先分配新 Table ID，再依次分配其 Row-ID、created-time 与
updated-time Field ID，最后按 input order 分配 supplied Field ID。system Field
具有精确 display/physical name `_id`、`_created_at` 与 `_updated_at`，position
分别为 `-3`、`-2` 与 `-1`，settings 为 `{}`。supplied Field name 在 `NOCASE`
下 collision 无效。`create-table` 会 atomically 创建这些 system Field 与 supplied
Field。如果没有 `labelFieldClientKey`，Row-ID system Field 是 Record Label；
否则它命名一个 supplied compatible Field。只有 Relation、Formula 与 Lookup
恰好要求 definition，其他 kind 禁止 definition。

`create-table` 中禁止 Relation 与 Lookup Field；caller 在 Table 与 referenced
stable ID 存在后，通过后续 schema operation 添加它们。允许 Formula Field，且
在 allocation 后解析所有 supplied Field name。`create-field` 可以使用 base
revision 上仅含 stable-ID 的 definition 创建任意 kind。除 `create-table` 内的
`labelFieldClientKey` 外，不存在 implicit client-key object reference。

`nullable` 对 stored scalar Field 默认为 true；对 File、Multi-select、
forward/inverse Relation 固定为 false；对 core 1.0 的 Formula 与 Lookup 固定为
true。Runtime 拒绝相反的 request。physical `NOT NULL` 必须与 File Format matrix
精确一致。

`set-field-nullable` 只适用于 stored scalar Field。equal input 是 no-op。
任一方向改变 declaration 都是 `metadata-only`，因为 rebuild mechanism 本身不会
改变 canonical cell。只有不存在 SQL NULL 时才允许改为 non-nullable，否则
forbidden；不会 invent implicit default。转换为 scalar destination 时使用
required `toNullable`；list/forward-Relation destination 固定 non-null。

在 populated Table 上创建 stored Field 有精确的 fill behavior。nullable scalar
Field 以 SQL NULL 填充每个 existing row。只有 Table 为零行时才允许创建
non-nullable scalar Field；Runtime 1.0 中没有 general default/initial-value
member。Select `settings.defaultOption` 只影响之后创建的 row，绝不 backfill
existing row。Multi-select、File 与 forward Relation Field 以 canonical `[]`
填充每个 existing row。Formula、Lookup 与 inverse Relation Field 不添加
user-table column。

`convert-field.fieldId` 当前必须标识 stored scalar、Multi-select、File 或
forward Relation Field。system Field、Formula、Lookup 或 inverse Relation 以
`forbidden` 拒绝；改变这些 Field 的 definition 要使用各自专用 leaf operation。
转换为 Relation 始终创建 forward Relation，且 supplied complete
`ForwardRelationDefinition` 在 base revision 上验证。

`set-relation` 保持 direction。对于 forward Relation，只有在每个 current array
对新 target 与新的 `one` cardinality 都有效后，它才能改变 target Table、
cardinality 或 delete policy；raw array 不变时 plan 为 `metadata-only`。对于
inverse Relation，只有当 owning/target Table 满足第 8 节时，才能让它指向另一个
valid forward Relation；这也是 `metadata-only` generated-definition replacement。
禁止 forward↔inverse direction change：caller 要显式 delete 再 create Field，
从而不会默默丢弃或合成 stored column。按照 File Format，每个 committed inverse
Field 是其 forward Field 的 unique inverse；conflicting pair 是 forbidden。

存在 `policies` 时，其中元素唯一且必须遵循以下 canonical order：
`round-binary64`、`truncate-toward-zero`、
`round-ties-even`、`zero-false-nonzero-true`、`utc-date`、`first`、
`null-to-empty-list`。`truncate-toward-zero` 与 `round-ties-even` mutually
exclusive。Runtime 拒绝与 selected source/destination 无关的 policy。只有针对
一次 cell conversion 中互不重叠的 stage，才允许多个 policy。

`batch.changes` non-empty、ordered，且不含 nested batch。每个 stable-ID
reference 命名一个 base revision 上存在的 object。Runtime 把整个 batch 作为
一个 object，以一个 hash 和一个 transaction preflight。它不能在一个 revision
下应用多个分别 preflight 的 plan。

`set-file-title` 验证 File title domain。`set-default-table` 接受 null 或 existing
Table ID。Runtime 从不隐式选择 default。禁止删除 current default Table，除非
同一 batch 中更早的 leaf 已清除或 retarget default；同样禁止删除该 batch 中更早
选择的 target。

### 12.2 精确 two-phase contract

```ts
interface SchemaPreflightRequest {
  change: SchemaChange
  expectedRevision: string
}

interface SchemaPreflightResult {
  fileId: string
  planToken: string
  baseRevision: string
  actionsHash: string
  classification:
    | "metadata-only"
    | "lossless-rewrite"
    | "explicit-lossy"
    | "forbidden"
  affectedRows: string
  dependencyCount: string
  dependencies: SchemaDependency[]
  dependencyCursor?: string
  warnings: RuntimeDiagnostic[]
  warningsTruncated: boolean
  valueChanges: SchemaValueChange[]
  valueChangesTruncated: boolean
  expiresInMilliseconds: number
  expiresAt: string
}

interface SchemaValueChange {
  code: SchemaValueChangeCode
  rows: string
  tableId: string
  fieldId: string
}

type SchemaValueChangeCode =
  | "value-reencoded"
  | "binary64-rounded"
  | "fraction-truncated"
  | "integer-rounded"
  | "numeric-to-checkbox"
  | "datetime-to-date"
  | "null-to-empty-list"
  | "list-empty-to-null"
  | "list-tail-dropped"
  | "relation-detached"
  | "option-value-renamed"
  | "option-duplicate-collapsed"

interface SchemaDependency {
  object: "table" | "field" | "view"
  id: string
}

interface SchemaDependencyPage {
  fileId: string
  revision: string
  dependencyCount: string
  dependencies: SchemaDependency[]
  nextCursor: string | null
}

interface SchemaMutationRequest {
  planToken: string
  expectedRevision: string
  actionsHash: string
  confirmLossy?: true
}

interface SchemaMutationResult {
  fileId: string
  revision: string
  changed: boolean
  createdObjects: CreatedSchemaObject[]
  affectedTableIds: string[]
  affectedFieldIds: string[]
}
```

`actionsHash` 是对恰好为 `change` 的 UTF-8 JCS 计算得到的 lowercase SHA-256。
Dependency unique，先按 object kind `table`、`field`、`view`，再按 ID `BINARY`
排序。`dependencyCount` 是 total non-negative int64 decimal count。result 包含
不超过 `schemaPageSizeMax` 个 dependency 的 longest ordered prefix，并且其完整
preflight result 必须能装入 `responseBytesMax`；如果连 fixed result 加第一个
required dependency 都无法装入，preflight 返回 `resource-limit`，且不安装 plan。
当且仅当后面仍有更多时存在 `dependencyCursor`。UI 使用它调用
`getSchemaPlanDependencies`；后者的 `limit` 为 `1..schemaPageSizeMax`，cursor
绑定 plan/epoch/order，并在 plan expiry、eviction 或被一次 `mutateSchema`
application attempt consume 后返回 `plan-expired`。每页报告 plan 的 File ID、
作为 `revision` 的 immutable base revision，以及 total `dependencyCount`。即使
current File revision 移动，paging 仍在 immutable preflight snapshot 上继续；
该移动会按下文规定影响后续 `mutateSchema`，但不会改变 dependency output。每个
continuation page 采用与 `getSchemaPage` 相同的 longest-whole-prefix/
`responseBytesMax` rule。warning 与 value-change summary 是 stable-code record，
而非 localized prose。两者分别在其 defined order 后 deterministic truncate 于
`diagnosticsMax`，并报告对应 `*Truncated` flag；truncation 绝不隐藏
classification、total affected-row count 或 dependency count。

Preflight 只使用以下 core diagnostic code（extension 使用第 15 节的 namespace
rule）：

| Code                          | Severity | Exact trigger                                                 |
| ----------------------------- | -------- | ------------------------------------------------------------- |
| `fraction-loss`               | warning  | non-integral Number 被 truncate 或 round 为 Integer           |
| `precision-loss`              | warning  | Integer 被 round 为 binary64                                  |
| `truthiness-loss`             | warning  | exact 0/1 之外的 numeric value 映射为 Checkbox                |
| `time-loss`                   | warning  | non-midnight datetime 映射为 date                             |
| `null-distinction-loss`       | warning  | 两种实际 source category 通过 null/list policy 合并           |
| `list-tail-loss`              | warning  | `first` 丢弃一个或多个 list element                           |
| `option-merge-loss`           | warning  | option value/list occurrence 合并                             |
| `object-delete-loss`          | warning  | Table 或 Field 被删除                                         |
| `dependent-source-rewritten`  | info     | Formula source 或 saved-View operand 被 mechanically rewrite  |
| `dependency-blocked`          | error    | 未处理的 dependent 阻止该 leaf                                |
| `conversion-domain-invalid`   | error    | 至少一个 source value 没有 selected destination algorithm     |
| `non-nullability-blocked`     | error    | SQL NULL 会在没有 allowed mapping 时抵达 non-null destination |
| `relation-definition-invalid` | error    | target/direction/inverse ownership 或 target ID 无效          |
| `cardinality-blocked`         | error    | value 超过 requested Relation cardinality                     |
| `record-label-blocked`        | error    | delete/change 会导致没有 valid Record Label                   |

`forbidden` preflight plan 至少包含一个来自该表的 error；`explicit-lossy` plan 至少
包含一个对应 warning。只要 owning `tableId`/`fieldId`/`viewId` object 存在，
diagnostic 就包含它，且 `path` 指向 exact leaf member；删除 Table 或 Field 时标识
该 object。warning 采用第 15 节的一般 diagnostic order。

`valueChanges` 对每个 applicable code 与 owning `(tableId,fieldId)` pair 包含一条
positive row count record。`rows` 是该 Table 中发生该精确 transformation stage
的 unique row 数；一个 cell 经过两个显式命名 stage 时可计入两条 record，而
`affectedRows` 仍是 union。因此每条 core record 都存在 `tableId` 与 `fieldId`。
`value-reencoded` 覆盖没有更 specific code 的 changed raw representation；其他
code name 精确对应第 8、12.3 与 12.5 节的 algorithm/policy。record 依次按 code、
Table ID、Field ID 的 `BINARY` order 排序。

`expiresInMilliseconds` 是不大于 600000 的 positive safe integer。Runtime 把
`clock.nowMilliseconds()+expiresInMilliseconds` 记录为 authoritative monotonic
deadline。`expiresAt` 只是 wall-clock display estimate；wall time 移动时，它不能
延长或缩短 validity。

opaque token 绑定 Runtime epoch、File ID、base revision、actions hash、exact plan
与 monotonic expiry。它不是 canonical state，也不能跨 close 存续。Token lookup
与 error precedence 精确如下：

1. invalid request shape 或 token syntax 是 `invalid-plan`；
2. syntactically valid token 在本 epoch 没有 retained unapplied plan 时是
   `plan-expired`，包括 never-issued、other-epoch、consumed、expired 或 evicted
   token；
3. 对 retained plan，actions-hash mismatch 或 request `expectedRevision` 不等于
   base revision 是 `invalid-plan`；
4. expiry 是 `plan-expired`；
5. current File revision 已移动时是带 `currentRevision` 的 `stale-revision`；然后
6. forbidden plan 是 `forbidden`，没有 `confirmLossy:true` 的 explicit-lossy plan
   是 `lossy-confirmation-required`。

这条规则允许 bounded retention：不需要为 consumed/evicted plan 保留 tombstone，
而 absent well-formed token 永远不能授权执行。

Runtime 最多保留 `schemaPlanEntriesMax` 个 unapplied plan，以及这些 plan 的 exact
plan/dependency data 的 `schemaPlanBytesMax` JCS byte。安装 successful new
preflight 前，它先移除 expired entry，再按 creation sequence evict 最早 entry。
单个 plan 超过 byte cap 会返回 `resource-limit`，且不安装。查找已 evict plan
返回 `plan-expired`。只有 preflight successful return 时 admission/eviction 才
生效；failed/cancelled preflight 或 failed application 不会 evict unrelated plan。

application 进入一个 write transaction，重新检查 revision 及 current row 上的
每个 planned predicate，执行 exact plan，验证全部 dependency 与 affected
content，然后遵循 one-increment rule。failure 会 rollback 全部 schema、data、
Formula rewrite、View query、option catalog、timestamp 与 revision change。
plan 在一次进入 write transaction 的 application attempt 后即被 consume。Runtime
在该时刻移除其 unapplied entry，因此 plan token 及由其派生的每个 dependency
cursor 都会确定地返回 `plan-expired`，无论 transaction 最终 commit 还是 rollback。

`createdObjects` 遵循 exact allocation order。Table/supplied Field 恰好具有
`clientKey`；automatically created system Field 恰好具有 `systemRole`。
`affectedTableIds` 与 `affectedFieldIds` 各自按 ID `BINARY` order 包含一次
dependency 与 rebuild effect。

Classification 的含义：

- `metadata-only`：requested leaf 只改变 schema/definition metadata、创建新的
  canonical cell 或 rebuild declaration；它既不 rewrite pre-existing raw cell/
  dependent human source，也不丢弃 existing schema object/value distinction；
- `lossless-rewrite`：byte/source 改变，但指定 transform 对每个受影响 logical
  value 均为 injective，且其 inverse 可以恢复这些 value；
- `explicit-lossy`：至少一个 existing schema object 或 actual value distinction
  被一个 exact operation/policy 丢弃，并报告 count；
- `forbidden`：不存在 safe transform/definition，或 invariant/dependency 会失败。

对 composite change，最高 severity 决定结果：
`forbidden > explicit-lossy > lossless-rewrite > metadata-only`。

leaf classification 是 exhaustive；“rewrite”描述 canonical meaning，而不是
SQLite 是否恰好 rebuild table：

| Leaf                                                                                                  | Classification after validation                                                                                 |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `create-table`、`set-file-title`、`set-default-table`、`rename-table`、table settings/position        | metadata-only                                                                                                   |
| `delete-table`                                                                                        | explicit-lossy；同一 batch 未解决 dependency/default/restrict rule 时为 forbidden                               |
| `create-field`                                                                                        | metadata-only，使用第 12.1 节的精确 fill rule                                                                   |
| `delete-field`                                                                                        | explicit-lossy；label/dependency replacement 不完整时为 forbidden                                               |
| `rename-field`                                                                                        | 任一 Formula source 被 AST-rewrite 时为 lossless-rewrite，否则 metadata-only                                    |
| Field nullable/settings/position、Record Label、Formula、Lookup 与 same-direction Relation definition | 满足各自精确 validity predicate 后为 metadata-only                                                              |
| `convert-field`                                                                                       | 第 12.3 节 matrix                                                                                               |
| `rename-option` reject                                                                                | 没有 source occurrence 时 metadata-only/no-op，否则 lossless-rewrite                                            |
| `rename-option` merge                                                                                 | 没有 source occurrence 时 metadata-only/no-op；当且仅当 occurrence 合并时 explicit-lossy，否则 lossless-rewrite |
| `batch`                                                                                               | fully composed effect 的最高 severity                                                                           |

`affectedRows` 是整个 plan 删除 row 或创建、删除、rewrite canonical raw cell 的
unique `(tableId,rowId)` pair 数量。被多个 leaf 触及的 row 只计一次；仅被 scan、
virtual output 改变，或 metadata-only declaration rebuild 而 cell shape 不变的 row
不计数。创建/删除 stored Field 会计入每个 existing row，因为 canonical cell 被
创建/删除。

### 12.3 完整 stored-type conversion matrix

matrix 的行是 source row，列是 destination column。`M`、`L`、`X` 与 `F` 分别
表示上述四种 classification。对 cell 进行 classification 前，Runtime 应用下述
destination-nullability guard；该 guard 失败是 `F`，且覆盖 table entry。`?`
表示 preflight 有条件地扫描每个 relevant cell，包括只因该 guard 而需要的扫描。
slash 分隔的 letter 是下述 algorithm 中唯一可能成功的 class，否则结果为 `F`。
当 conversion 没有 cell byte 要 rewrite/discard 时，即使其一般 cell 显示 `L?`，
结果也是 `M`；classification 始终使用 complete actual domain，而非 sample。
在此 matrix 中，`relation` 表示 forward stored Relation；第 12.1 节排除了 virtual/
inverse source。

| from \\ to   | text | number | integer | checkbox | date | datetime | url  | json | select | multi-select | file    | relation |
| ------------ | ---- | ------ | ------- | -------- | ---- | -------- | ---- | ---- | ------ | ------------ | ------- | -------- |
| text         | M?   | L?     | L?      | L?       | M?   | M?       | M?   | L    | M?     | M?/L?/X      | M?/L?/X | M?/L?/X  |
| number       | L    | M?     | L?/X    | L?/X     | F    | F        | F    | L    | L      | F            | F       | F        |
| integer      | L    | L?/X   | M?      | M?/X     | F    | F        | F    | L?/X | L      | F            | F       | F        |
| checkbox     | L    | L      | M?      | M?       | F    | F        | F    | L    | L      | F            | F       | F        |
| date         | M?   | F      | F       | F        | M?   | L        | M?   | L    | M?     | F            | F       | F        |
| datetime     | M?   | F      | F       | F        | L?/X | M?       | M?   | L    | M?     | F            | F       | F        |
| url          | M?   | F      | F       | F        | M?   | M?       | M?   | L    | M?     | F            | F       | F        |
| json         | M?   | L?/X   | L?/X    | L?/X     | L?/X | L?/X     | L?/X | M?   | L?/X   | M?/L?/X      | M?/L?/X | M?/L?/X  |
| select       | M?   | L?     | L?      | L?       | M?   | M?       | M?   | L    | M?     | L?           | F       | F        |
| multi-select | M    | F      | F       | F        | F    | F        | F    | M    | L?/X   | M            | F       | M?       |
| file         | M    | F      | F       | F        | F    | F        | F    | M    | F      | F            | M       | F        |
| relation     | M    | F      | F       | F        | F    | F        | F    | M    | F      | M            | F       | M?       |

只有在 destination-nullability guard 成功后，value-identity conversion 才是
metadata-only。其他 cell 只使用以下 algorithm：

1. **Textual subtype。** Text/date/datetime/URL/select 共享 physical TEXT。
   `M?` 验证 destination domain 中的每个 string，但不 rewrite。Select 接受任意
   string，无论是否已配置。只有当每个 value 都恰好是 standard inverse
   spelling 时，Text/select 到 Number、Integer 或 Checkbox 才是 `L?`：shortest
   round-trippable finite binary64、canonical int64 decimal 或 lowercase
   `true`/`false`。不存在 trim、locale、thousands separator、Boolean synonym 或
   permissive SQLite cast。
2. **到 text/select。** Numeric/Boolean value 按上述 exact spelling serialize
   （Checkbox 使用 `true`/`false`）；这是 lossless。List/File/Relation 到
   text 会保留其 canonical JCS text byte。Date/datetime/URL/select 到 text，以及
   textual subtype 到 select 均无需 rewrite。
3. **Number 与 Integer。** Integer 到 Number 仅对可以精确表示为 binary64 的
   value 是 lossless；否则 `round-binary64` 是 explicit-lossy。Number 到
   Integer 仅对 integral、in-range value 是 lossless；否则，in-range result 可用
   `truncate-toward-zero` 或 `round-ties-even`；out-of-range 是 forbidden。
   Runtime 从不把这项工作委托给 SQLite `CAST`。
4. **Checkbox。** Checkbox 到 Integer 只改变 type metadata，因为两者都使用
   INTEGER 0/1，所以是 metadata-only；Checkbox 到 Number 把 0/1 rewrite 为
   REAL 0.0/1.0，且为 lossless。Integer 到 Checkbox 在每个 non-null value 均为
   0 或 1 时是 metadata-only；Number 到 Checkbox 在每个 non-null value 恰好为
   0.0 或 1.0 时是 lossless rewrite。否则，`zero-false-nonzero-true` policy 把
   zero 映射为 false，把其他每个 finite value 映射为 true，且为 explicit-lossy。
   exact 0/1 branch 不需要该 policy。
5. **Date/datetime。** Date 到 datetime 追加 `T00:00:00.000Z`，且为 lossless。
   Datetime 到 date 仅在每个 value 都为 UTC midnight 时是 lossless；否则
   `utc-date` 丢弃 time，属于 explicit-lossy。
6. **Select 与 list。** Select 到 Multi-select 把 non-null string 包装为 one-item
   array。每个 Multi-select/File/forward-Relation destination 在 physical 层都
   non-null；因此 source SQL NULL 会使 conversion forbidden，除非
   `null-to-empty-list` 明确把它映射为 `[]`。使用该 policy 时，Select-to-
   Multi-select 仍为 injective：只有 SQL NULL 映射为 `[]`，每个 string 映射为
   singleton，因此整个 valid conversion 是 lossless。对 Text 到 list，
   每个 non-null value 必须已经是 destination 的 exact canonical JCS，因此保持
   byte。不含 SQL NULL 时是 metadata-only。存在 SQL NULL 且使用
   `null-to-empty-list` 时，如果没有 non-null source value 是 destination empty
   array，则为 lossless-rewrite；如果这样的 value 也存在，则为 explicit-lossy；
   没有该 policy 时 forbidden。

   Multi-select 到 Select 把 singleton losslessly 映射为其 element。使用 policy
   `first` 时，只有 `toNullable=true` 才能把 empty array 映射为 SQL NULL；该 empty
   mapping 是 lossless，因为 source type 没有 SQL NULL，inverse 可恢复 `[]`。
   length 大于一时，只能在 `first` 下映射为其第一个 element，且为
   explicit-lossy。empty 到 non-nullable destination、或者没有 required policy
   的 empty/longer array 均为 forbidden。创建 Relation 还要求 target Table，且
   每个 string 都是能在该 target 中解析的 canonical ID。Multi-select-to-Relation
   与 Relation-to-Multi-select 在 validation 后保持 ordered JCS byte，且为
   metadata-only。除上述 Text preservation 外，File 没有 scalar/list
   coercion。

7. **Relation 到 Relation。** 保持相同 target/direction 是 metadata-only。只有
   每个 ID 都能在新 target Table 中 resolve 时才允许新 target Table，结果为
   `M?`；否则 forbidden。`convert-field` 从不改变 direction；same-direction
   `set-relation` rule 与 direction-flip prohibition 见第 12.1 节。

除上述显式选择的 `null-to-empty-list` policy 外，每种 conversion 中 null 都保持
SQL NULL。对于 scalar destination，`toNullable=true` 保留 source SQL NULL；
如果任一 conversion stage 产生 SQL NULL，则 `toNullable=false` 为 forbidden。
对于 non-null list destination，如果不使用 `null-to-empty-list`，source SQL NULL
为 forbidden。named policy 本身并不会强制 `explicit-lossy`；上述 complete actual-
domain injectivity rule 决定 `M`、`L` 或 `X`。Conversion 不会推断 option catalog、
relation target、File asset、timezone 或 default。

### 12.4 Rebuild 与 dependency algorithm

physical declaration change 使用 atomic table rebuild；permissive affinity、
`CAST` 或 partial in-place update 均不符合规范。Runtime：

1. 用上述 algorithm scan 并 transform 每个 value，在任何 DDL 前记录精确 count；
2. 创建受信任且经过 collision probe 的 temporary/rebuild table，它具有最终
   STRICT schema 以及原始 rowid/`WITHOUT ROWID` organization，但尚无 schema-
   global File-named index/trigger；
3. 使用 bound transformed value 复制每一 row，保留 Row ID 与 created
   timestamp；仅对 canonical row 实际改变的地方赋予一个 operation timestamp；
4. 删除 schema SQL attached to 或命名 old table 的每个 generated index/trigger
   （包括受影响的 cross-Table Relation trigger），从而释放其 schema-global
   canonical name；把 old table rename 为 staging name，把 rebuild table rename
   为 final physical name；随后删除 staged old table 及仍 attached to 它的每个
   object；
5. 更新 metadata/definition row 并 rewrite dependency；
6. 仅从 final canonical metadata 重新创建 File 允许的 index 以及 generated
   Relation/Row-ID trigger，包括受影响的 cross-Table set；
7. 证明不存在 old/rebuild object，再运行受影响的 structural/content/semantic
   check 与 foreign-key check，最后到达唯一 outer commit。

第一个 transient name 是 `eidos__rebuild_table__<full-table-id-hex>`；发生 collision
时依次追加 `__1`、`__2` 等，使用 smallest absent decimal suffix。old-table staging
name 使用相同 algorithm，并以 `eidos__rebuild_old_table__` 开头。这些 Writer-owned
name 只存在于 write transaction 内，Runtime 在使用前证明它们在 `sqlite_schema` 中
不存在。File validation 运行时或 commit 时不存在任何 transient object。任何 failure
都会 rollback 到精确的旧 table 与 metadata。

Rename 保留 stable ID。Field rename 按第 9 节 parse 并 rewrite Formula reference
node；View query 与 Lookup/Relation definition 已使用 ID。Table rename 不改变
Relation/Lookup/Formula reference。如果 dependent Formula、Lookup、Record Label
或 View 无法保持有效，则禁止 Field delete/type change；删除 current label 必须
包括一个 valid replacement。Runtime 会重新验证整个受影响 cross-table DAG。

### 12.5 Option rename 与 merge

`rename-option` 仅适用于 Select/Multi-select。`from` 与 `to` 是精确的 valid option
string，且 MUST 不同；相等时为 `invalid-request`。occurrence 指该 Field 的 catalog
`name`、Select cell、Multi-select element 或 typed saved-View operand。匹配的
Select `settings.defaultOption` 也是 occurrence，必须在同一 atomic operation 中
rename。使用 `collision:"reject"` 时，destination MUST 在任何位置都没有 occurrence；否则
preflight 为 `forbidden`。Runtime 替换每个精确 source occurrence。Multi-select
与 catalog order 保持不变，且 catalog entry 保留除其 `name` 外的全部 member。
存在 source occurrence 时为 lossless-rewrite。不存在时，preflight 为
`metadata-only`，且 application plan 是 canonical no-op。

使用 `collision:"merge"` 时，destination 可以存在；两个 value 都变为
destination，并删除 source catalog entry。replacement 产生的 duplicate
Multi-select member collapse 到首次 occurrence。如果两个 catalog entry 都存在，
destination entry 保持其 original position 与全部 original presentation member，
并移除 source entry；如果只有 source entry 存在，则在原位 rename 并保留其
member。没有 source occurrence 时 plan 为 `metadata-only`；当且仅当 existing
source/destination occurrence 或 list member coalesce 时为 `explicit-lossy`；其他
情况为 `lossless-rewrite`；它会报告 affected/collapsed row。Formula string
literal 是普通 text，绝不 rewrite。即使没有 catalog entry，unconfigured raw
value 也按 exact match rename；catalog-only removal 是单独的 metadata settings
change，绝不删除 cell。Runtime 识别并保留 File Format 第 9 节定义的精确
`settings.options` entry shape；它既不 invent Option ID，也不丢弃 unknown
presentation member。

## 13. Saved View 与 CSV

### 13.1 Saved View query 边界

saved View query 恰好是 `RowQuery` 的 persistent subset：

```ts
interface SavedViewQuery {
  filter?: FilterNode
  sort?: Array<{
    fieldId: string
    direction: "asc" | "desc"
    nulls?: "first" | "last"
  }>
}
```

有意不包含 ephemeral search text。UI 把 saved `SavedViewQuery` 与 current
search 合并为 `RowQuery` request，但不持久化 search。Runtime 针对 View 的 Table
验证每个 saved Field ID/operator/value。

Runtime 能理解完整 stored query 时，`ViewDescriptor.queryStatus` 为
`"supported"`，`query` 可执行。该 member 仅为 transport compatibility 而 optional；
缺省等同 `"supported"`。若 stored operator、sort semantic 或 query member 来自更新
Runtime，Runtime 返回 `queryStatus:"unsupported"`，在 `query` 中返回不可执行的
`{}` placeholder，并在内部保留原始 canonical query document。不得把 placeholder
当作该 View query 执行。省略 `query` 的 `mutateView` patch 必须原样保留原 document；
显式提供 `query` 才替换它。duplicate 必须原样保留 opaque document，或以
`unsupported` 失败；不得创建 partial copy。

malformed known syntax 仍是 `view-query-invalid`。unsupported query 不得被默默忽略，
也不得让 unrelated Table/View 不可用。无法安全隔离到 opaque View boundary 的
semantics 仍由 required File feature 拥有。

Runtime 把 `layout_json` 当作 JCS object，并保留 unknown member。它不解释 grid
width、hidden Field、grouping presentation、card layout、selection、focus、scroll
或 renderer state。standard layout meaning 属于 UI。Runtime `groupRows` 报告
canonical row data 中实际存在的 group；display catalog 中 zero-row entry 是 UI
catalog group，而不是 Runtime query group。因此 UI `showEmptyGroups` option MUST
在本地派生 empty catalog group，不得额外执行 Runtime query，也不得把它们当作
data。

### 13.2 CSV extension

当 `csvExport=true` 和/或 `csvImport=true` 时，Runtime 暴露对应的精确 optional
operation：

```ts
interface CsvExportRequest {
  tableId: string
  query: RowQuery
  fields: string[]
  includeHeader: boolean
}

interface CsvExportResult {
  fileId: string
  tableId: string
  revision: string
  csv: OwnedBytes
}

interface CsvImportRequest {
  tableId: string
  expectedRevision: string
  hasHeader: boolean
  columns: Array<{ csvIndex: number; fieldId: string }>
  csv: OwnedBytes
}

interface CsvImportResult {
  fileId: string
  tableId: string
  revision: string
  changed: boolean
  createdRows: Array<{ recordIndex: number; rowId: string }>
  undoToken?: string
  evictedUndoTokens?: string[]
}
```

`OwnedBytes` 是 language binding 中一个 immutable exact octet sequence 的 nominal
value，具有 JSON-safe-integer `byteLength`；它没有 JSON object encoding，且绝不
alias caller/SQLite/WASM memory。input 与 output 最多为 `csvBytesMax` 个 octet，
并使用第 4.2 节的 carrier-independent accounting projection。
direct binding 直接携带 `csv` member。Adapter Transport 从 JSON 中移除该 member，
只在 required named attachment slot `csv` 中携带完全相同的 byte，并在 Runtime
boundary 重建；它 MUST NOT 把 binary data 放入 JSON，也不得将其与 File
publication byte 混淆。Runtime 分配 imported Row ID。另行授权的 embedding
import/replay binding 可以定义显式 Row-ID CSV column，但该 member 不存在于
`CsvImportRequest` 与普通 `RuntimeClient` 中。

dialect 是 RFC 4180，并采用以下精确选择：

- encoding 是 valid UTF-8；接受单个 initial UTF-8 BOM，write 时省略；
- writer record separator 是 CRLF；reader 接受 CRLF 或 LF，但拒绝 bare CR；
- delimiter 是 comma；quote 是 `"`；quoted field 内的 quote 要 double；
- comment 与 alternate delimiter 不属于 Runtime 1.0；
- unquoted empty 表示 SQL NULL；quoted empty `""` 表示 empty text，对 non-text
  destination 无效，除非该 type 明确接受；
- write header 时使用 current display name。Import mapping 使用显式 CSV index
  与 stable Field ID；header text 本身永不标识 Field。

Export 只有一种 canonical writer spelling。SQL null 是 unquoted zero-octet
field。每个 non-null logical value 先成为下文规定的精确 text spelling。当且仅当
该 text 为空或包含 comma、quote、CR 或 LF 时，writer 才把它包入 quote，并把每个
embedded quote double；否则写为 unquoted text。每个 emitted record（包括最后
一个）都以 CRLF 结束。没有 selected row 时，若 `includeHeader=true`，output
恰好是 header 加 CRLF；否则为 zero octet。

Export `fields` non-empty、unique、受 `projectionFieldsMax` 约束，其顺序就是
精确 column order。record 在 result 所报告的 revision 上遵循 `queryRows` display
order。Formula/Lookup/inverse Relation 可以 export。会超过 `csvBytesMax`、
Adapter response byte 或 effective deadline 的 export 分别以 `resource-limit`/
`deadline-exceeded` 失败，不产生 partial public byte sequence。

Import `columns` non-empty，具有 unique zero-based `csvIndex` value 与 unique
writable Field ID，并受 `projectionFieldsMax` 约束。`hasHeader=true` 时，record 1
为 required 并被跳过；其 text 仅供参考。每个 data record 必须包含每个 mapped
index。extra unmapped column 会被忽略，而缺少 mapped column 会拒绝整个 import。
empty quoted/unquoted semantics 如上。`createdRows` 按 data-record order 排列，
报告每个 physical one-based `recordIndex`（因此有 header 时从 2 开始）与所分配
的 Row ID。

Scalar spelling 是第 5 节的 public value：Row ID 是 lowercase hyphenated UUID
text；Integer 是 canonical int64 decimal；Number 使用相同的 ECMA-262/RFC 8785
shortest round-trippable spelling（不含 Formula 的 type-preserving `.0` extension，
因为 destination Field 已提供 type）；Checkbox 是 lowercase `true`/`false`；
date/datetime 为 canonical；text/URL/select 保持不变。JSON 与每种 public object/
list value（包括 Multi-select、Relation、File、Lookup list 与 Lookup
`file-entry`）使用 RFC 8785 JCS text。Formula、Lookup 与 inverse Relation 可以
export，但不能作为 import destination。CSV 永不包含 second binary UUID 或
locale-formatted value。

Import 解析并验证整个 bounded request，然后执行一个普通 create-rows
transaction。data record 受 `mutationRowsMax` 约束，mapped cell 受
`mutationCellsMax` 约束，equivalent logical `RowMutation` 受
`mutationBytesMax` 约束。zero data record 在 unchanged revision 返回
`changed=false`。否则 revision 增加一次；当 `mutationUndo=true` 时遵循相同的
undo-token contract。一条 row error 会 rollback 所有 row，并报告 record/column
及 Field ID。它不推断 type、不 trim、不使用 SQLite cast、不 fetch asset，也不
auto-create option。client 以显式 bounded batch 导入更大文件，每个 batch 使用
返回的 next revision；Runtime 从不暗中 commit partial batch。

为保留 data，export 不会为形似 spreadsheet formula 的 text 添加 prefix。在
spreadsheet context 中打开 CSV 的 UI MUST 警告，或应用显式、reversible 的
presentation policy；这种 prefix 不是 canonical cell data。

## 14. Isolation、Transaction、Cache Invalidation 与 Event

每个 public read 观察一个 committed SQLite snapshot，并报告该 snapshot 的
revision。Runtime 从不把一个 revision 的 metadata 与另一个 revision 的 row 或
Relation label 合并。每个 Runtime instance 的 write 串行执行。创建 readwrite
binding 还要求 composition 在该 binding 的整个 epoch 内持有 working database
唯一的 logical Eidos writer claim；如果无法持有，则以 read-only 打开或返回
`busy`/`forbidden`。同一 composition 中的其他 connection 可以是 read-only。
该 claim 与 Adapter transaction lock 共同使 one-step revision receipt 可归因；
它不能替代对 hostile/non-conforming external file replacement 的检测。
一个 Runtime instance 恰好拥有其 factory 所获的一个 borrowed ConnectionPort，并串行化该 port
的所有使用；public call 可以 queue，但不打开或借用 hidden read connection。
需要 independent read concurrency 的 Host 会打开多个 read-only Runtime
binding，每个都有自己的 ConnectionPort、lifecycle、epoch、snapshot 与 limit。
它不能混用这些 binding 的 cursor 或 generated state。

Runtime 在复用 generated state 前检查 Adapter `dataVersion`。收到 external
change indication 后，它丢弃全部 schema、statement、dependency、reverse-index、
statistics 与 page cache，然后在 fresh transaction 中读取 File ID/revision。
如果 File ID 改变，检测到它的 operation 以 non-retryable `conflict` settle；随后
Runtime 进入 `fatal`，使用 prior File ID/last known revision 发出其 final `fatal`
event，并对之后每个非 `close` call 返回 `fatal`。`close` 仍为 idempotent，会
release borrowed-port claim 并转入 `closed`；composition owner 随后关闭 port。
该 identity-replacement case 是唯一也会终止 epoch 的 ordinary `conflict`。
canonical state 改变但没有 required revision postcondition 会返回 `corrupt-file`，
并同样进入 `fatal`。Adapter watcher event 只是 hint，绝不能替代此项检查。

Generated state MAY 按 File ID、revision、Table/Field ID、query hash 与
projection hash partition。它 MUST NOT 写入 core/user table、作为 canonical truth
返回或在 mismatch 后存续。Host-private side database/memory 可以保存 compiled
SQL、AST、dependency edge、reverse Relation index、column statistics、cursor 与
undo state。cold recompute 是 conformance authority。

当 `events=true` 时，listener 收到：

```ts
interface RuntimeEvent {
  kind: "revision-changed" | "schema-changed" | "fatal"
  fileId: string
  revision: string
  tableIds?: string[]
  fieldIds?: string[]
}
```

commit event 只在 success 后发生，并按 increasing revision order 排列。changed
row/View/CSV/undo commit 发出 `revision-changed`；changed schema commit 发出
`schema-changed`，后者也蕴含普通 revision change。`tableIds` 与 `fieldIds`
unique，按 `BINARY` 排序。Runtime 可以 coalesce adjacent event，同时保留 newest
revision 与 affected ID 的 sorted union；当任一 input 改变 schema 时，
`schema-changed` 胜过 `revision-changed`。listener delay 或 exception 不能 delay、
rollback commit 或使其失败。bounded dispatcher 可以 coalesce intermediate
event，但在 subscribed 期间必须最终交付 newest non-fatal revision。Event 是
invalidation hint：绝不携带 value、不授权 write、不证明 durability/publication，
也不替代 fresh snapshot。Unsubscribe 是 idempotent。fatal event 是最后一个
event。

## 15. Validation

```ts
interface ValidationRequest {
  level: "identity" | "structural" | "content" | "semantic" | "full"
  diagnosticsLimit: number
}

interface RuntimeDiagnostic {
  code: RuntimeDiagnosticCode
  severity: "fatal" | "error" | "warning" | "info"
  message?: string
  fileId?: string
  tableId?: string
  fieldId?: string
  rowId?: string
  viewId?: string
  path?: string
  sourceByteOffset?: number
  relatedFieldIds?: string[]
}

type RuntimeDiagnosticCode =
  | "file-not-sqlite"
  | "file-identity-invalid"
  | "file-format-unsupported"
  | "file-feature-unsupported"
  | "file-core-object-invalid"
  | "file-metadata-invalid"
  | "file-foreign-key-invalid"
  | "file-physical-schema-invalid"
  | "file-definition-invalid"
  | "file-trigger-invalid"
  | "file-index-invalid"
  | "file-extension-invalid"
  | "file-cell-invalid"
  | "file-json-invalid"
  | "file-reference-invalid"
  | "file-unresolved-relation"
  | "file-integrity-invalid"
  | "semantic-field-invalid"
  | "formula-parse-invalid"
  | "formula-name-invalid"
  | "formula-type-invalid"
  | "semantic-cycle"
  | "lookup-invalid"
  | "relation-invalid"
  | "record-label-invalid"
  | "view-query-invalid"
  | "option-catalog-invalid"
  | "validation-prerequisite-failed"
  | "fraction-loss"
  | "precision-loss"
  | "truthiness-loss"
  | "time-loss"
  | "null-distinction-loss"
  | "list-tail-loss"
  | "option-merge-loss"
  | "object-delete-loss"
  | "dependent-source-rewritten"
  | "dependency-blocked"
  | "conversion-domain-invalid"
  | "non-nullability-blocked"
  | "relation-definition-invalid"
  | "cardinality-blocked"
  | "record-label-blocked"
  | `x.${string}.${string}`

interface ValidationReport {
  fileId?: string
  revision?: string
  level: ValidationRequest["level"]
  valid: boolean
  diagnostics: RuntimeDiagnostic[]
  truncated: boolean
}
```

`diagnosticsLimit` 是 `1..diagnosticsMax` 内的 JSON safe integer；其他任何 value
都是 `invalid-request`。一个 report 的所有 stage 使用一个 Adapter read
transaction 与一个 SQLite snapshot。存在 `RuntimeDiagnostic.message` 与 `path`
时，它们遵循第 4.3 节的 scalar/NUL/JSON-Pointer bound。`sourceByteOffset` 是不大于
owning Formula source UTF-8 byte length 的 non-negative JSON safe integer。

`identity`、`structural` 与 `content` 执行 cumulative exact File Format level。
`semantic` 首先在同一 snapshot 中执行 identity 与 structural validation，然后
检查：

- 每个 Field definition kind、table ownership、target、result type 与
  writable/nullability rule；
- Formula grammar、精确 display-name spelling、static type 与 same-Table
  reference；
- Lookup/Formula file-wide DAG、target type、flattening 与 aggregate type；
- Relation direction/inverse pair 以及 endpoint/target-definition semantics；
- Record Label scalar compatibility，包括 core Lookup prohibition；
- 每个 saved View query Field/operator/value 与 required query feature；
- option catalog uniqueness 与 typed View literal。

`full` 按 identity、structural、content、semantic 的顺序运行，并包含 File-owned
foreign-key 与 quick check。identity 或 structural 发出 fatal/error 后会跳过后续
stage；content 发出 fatal/error 时，`full` 也会跳过 semantic。report 保留所有
已生成 diagnostic，并为第一个 skipped stage 添加一条 info
`validation-prerequisite-failed`，其 `path` 恰好为 `/structural`、`/content` 或
`/semantic`。它绝不会仅为产生更多 diagnostic 而 query unsafe user object。它不
验证 UI layout semantics、asset availability、publication durability 或 Host
permission。fatal/error 会使 `valid` 为 false；只有 warning/info 时为 true。

下列 File-stage code/severity assignment 由 File Format 第 18 节拥有；本表摘要其
Runtime 应用，并增加 semantic/staging row。owner definition 优先，所有 code 与
severity 都固定：

| Stage      | Code                                                                                                 | Severity and exact class                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| identity   | `file-not-sqlite`                                                                                    | fatal：byte 无法安全地作为 SQLite 3 打开                                        |
| identity   | `file-identity-invalid`                                                                              | error：application ID/user version/meta singleton 或 File ID identity 失败      |
| identity   | `file-format-unsupported` / `file-feature-unsupported`                                               | error：version 或 required feature 不受支持                                     |
| structural | `file-core-object-invalid` / `file-metadata-invalid`                                                 | error：required/forbidden core object 或 typed metadata row/JSON shape 失败     |
| structural | `file-foreign-key-invalid` / `file-physical-schema-invalid`                                          | error：declared reference 或 user-table/column/STRICT/row organization 失败     |
| structural | `file-definition-invalid` / `file-trigger-invalid` / `file-index-invalid` / `file-extension-invalid` | error：对应 File-owned definition/object rule 失败                              |
| content    | `file-cell-invalid` / `file-json-invalid` / `file-reference-invalid`                                 | error：对应 canonical raw value 或 stable metadata reference 失败               |
| content    | `file-unresolved-relation`                                                                           | warning：canonical Relation target unresolved                                   |
| content    | `file-integrity-invalid`                                                                             | `quick_check` 结果不是 `ok` 时为 fatal；出现 `foreign_key_check` row 时为 error |
| semantic   | `semantic-field-invalid`                                                                             | error：Field kind/ownership/type/writability/nullability semantics 失败         |
| semantic   | `formula-parse-invalid` / `formula-name-invalid` / `formula-type-invalid`                            | error：对应 persisted Formula rule 失败                                         |
| semantic   | `semantic-cycle`                                                                                     | error：存在精确 minimum dependency cycle                                        |
| semantic   | `lookup-invalid` / `relation-invalid`                                                                | error：对应 definition/type/endpoint semantics 失败                             |
| semantic   | `record-label-invalid` / `view-query-invalid` / `option-catalog-invalid`                             | error：对应 core semantic rule 失败                                             |
| staging    | `validation-prerequisite-failed`                                                                     | info：按上述定义跳过了后续 requested stage                                      |

对于 Table/Field/Row/View-specific finding，每个安全已知的 stable ID 都是 required；
malformed identity 则使用 `path` 指向 metadata location。Formula diagnostic 还要求
`fieldId`，并在 parsing 到达 source offset 时要求 `sourceByteOffset`。content cell
finding 要求 Table、Field 与 Row ID。unresolved Relation 要求三者全部存在。
`semantic-cycle` 还要求 `relatedFieldIds` 等于第 10 节的精确 normalized closed
cycle；其他所有 core code 均省略该 member。File-level finding 省略不适用 ID。
supported required extension 只能添加 `x.<vendor>.<code>`，其中两个 token 均使用
File extension token grammar；core Runtime 不发出其他 code。

Diagnostic 最多包含 `diagnosticsLimit` 条 record，并依次按 severity
（`fatal,error,warning,info`）、code、File/Table/Field/Row/View ID、path、source
offset，再按 `relatedFieldIds` 的 Field-ID sequence lexicographically 排序。在每个
optional sort position，absence 排在 presence 前；string 按 unsigned UTF-8/
BINARY byte 比较，offset 按 numeric 比较。`truncated=true` 表示至少省略了一条
later ordered diagnostic。Validation 是 read-only，MUST NOT repair、normalize、
执行 file-defined view/virtual table 或信任 unknown trigger。ER-Writer 在每次
commit 前运行受影响的 structural/content/semantic check。

## 16. Security 与 Resource Limit

每个 File、request、Formula、View query、JSON value、CSV byte 与 Adapter result
都不受信任。Runtime MUST：

- 只使用安全 bootstrap 的 ConnectionPort，bind value，从 validated metadata
  resolve 并 quote physical identifier，且绝不接受 SQL；
- 保持 trusted schema 与 extension loading disabled，并在 write 前拒绝
  undeclared trigger/object；
- 在 mutation 前验证完整 tagged value、UTF-8、UUID、JSON/JCS、date/time、URI
  与 list constraint；
- 使用 fixed grammar/whitelist parse Formula，绝不将其作为 host code 求值，也不
  暴露 Host/network/file/locale/time/randomness；
- 在 partial result 前强制执行 recursion/node/byte/list/page/mutation/aggregate/
  group/diagnostic 与 elapsed limit；
- 对 SQLite work 使用 set-based bounded plan 与 interrupt/deadline check；
- 从 public error/log 中 redact physical SQL、bound value、Formula compilation、
  path、token、credential、native handle 与 stack trace；
- 把 URL/File entry 视作 inert value；inline Data URL validation 不授予 fetch、
  decode-for-presentation 或 rendering authority。

URL `display.kind="image"` setting 只属于 presentation metadata。Runtime 保留并
返回它，但 CSV planning、validation、query、mutation、Formula/Lookup evaluation、
search 与 export 都不 probe image 或发 network request。实现若提供 CSV image-column
inference，只能使用 bounded header/value syntax，并原样保存 URL string。

通过 transported `RuntimeClient` 返回的 effective limit，是 Runtime semantic
limit 与 Adapter Transport request/result/time limit 的最小值。Composition 在
negotiation 期间使用 Adapter 声明的 byte-accounting rule 执行此 reduction。
它 MUST NOT 公布 active Transport 必然拒绝的 page/request。direct binding 只
报告自己的 effective process/Connection limit。

超过 limit 的 definition 或 request 为 `resource-limit`；Runtime 不会默默
truncate Formula、list、filter、mutation、CSV record、result page 或 diagnostic，
但在存在显式 `truncated` flag 时会设置该 flag。Deadline 与 cancellation check
不会削弱 transaction atomicity。hard Adapter termination 会使 Runtime epoch
fatal。

## 17. 一致性要求

### 17.1 Harness

ER harness 提供 conforming in-memory 或 `/tmp` ConnectionPort、固定的
Clock/Entropy/Cancellation port 与 File fixture。它会针对 ordinary STRICT rowid
user table 与 STRICT, WITHOUT ROWID user table 运行每个 Reader vector。Writer
harness 在每个 negative test 前 snapshot canonical table，并证明之后 canonical
state byte-equivalent 且 revision 不变。

Browser/WASM 与 Desktop/native implementation 运行相同的 logical vector。
Driver/Transport 差异可以改变 timing 或 private SQL，绝不能改变 typed value、
order、error 或 revision effect。Conformance test MUST NOT 只依赖 Eidos package
source 或 private fixture；published vector 包含所有 input 与 expected logical
output。

### 17.2 Required Reader family

ER-Reader 至少覆盖：

1. int64 minimum/maximum/zero、finite binary64 edge value、negative-zero
   normalization、Unicode、empty value、
   canonical date/datetime、File entry 与 malformed-value rejection，包括
   relative/`https:`/inline-image URI classes、exact Base64、media-type/decoded-size
   agreement 与 1 MiB boundary；
2. name 中含中文/space/keyword/quote 的 snapshot，且 public result 中没有任何
   physical name；
3. column/value length/order、两个 projection SHA-256 example、missing row
   batch，以及对 unresolved ID 保持相同长度的 Relation label resolution；
4. 所有 filter operator 与 T/F/U table；scalar、Multi-select、File、Relation、
   Formula、scalar/list Lookup、dynamic Record Label、unresolved ID 的 ASCII-fold
   Search Fragment，以及排除 JSON/Base64/asset read；typed sort、null placement、
   duplicate sort rejection、forward/backward keyset cursor 与 stale cursor error；
5. aggregate 的 empty/null/distinct/overflow/order 与 column statistics；每种
   scalar/list `summarizeFields` count、whole-cell 与 exploded identity、Relation/
   MIME/URI-kind facet、rows 与 occurrences、exact File bytes、query/revision
   binding、truncation 与 cold/warm equality；
6. 不使用 per-group query 的 grouped inline row 与 stable group cursor；
7. forward/inverse Relation order、cardinality、unresolved state、cold
   `json_each` 与 warm-index equality，以及 dynamic Record Label；
8. 每个 Formula grammar production/function/operator/null/overflow/date rule、
   quoted-name escaping、same-Table enforcement、standard serialization 与 row
   preview error；
9. Formula-to-Lookup、Lookup-to-Formula、nested Lookup、flatten、typed distinct、
   所有 aggregate、deterministic DAG order 与精确 cycle path；
10. 所有 validation level、deterministic diagnostic/truncation、hostile schema
    object、cancellation/deadline 与 resource limit。

### 17.3 Required Writer family

ER-Writer 还覆盖：

1. 使用 fixed clock/entropy 的 Runtime UUID allocation、同一/更早 millisecond
   monotonicity、普通 UI 省略 ID 与显式 trusted import check；
2. create/update/delete success、Table-scoped missing 与 duplicate-change failure、
   equal-value no-op、一个 operation timestamp、一次 revision increment、overflow
   refusal、full rollback 与 unknown-commit reconciliation；
3. 对 single、multi-row 与 self-Relation delete set 的 Relation
   restrict/detach/preserve，以及 survivor order、timestamp 与 rollback；
4. View create/update/delete、saved-search exclusion、unknown layout preservation
   与 query validation；
5. 使用 quoted Unicode/case-only name 的 Field/Table rename、Formula AST
   rewrite、Relation/Lookup/View survival 与 dependency rollback；
6. conversion matrix 每个 cell 的 boundary/conditional/lossy/forbidden value、
   exact policy、禁止 SQLite cast、table organization preservation、malformed/
   never-issued/consumed/evicted/expired/stale/hash-mismatch plan precedence，
   以及 lossy confirmation；
7. option rename/merge、unconfigured value、Multi-select dedup/order、View literal
   rewrite 与 untouched Formula literal；
8. post-commit generated-cache invalidation/event 与 cold/warm equality；
9. 公布 capability 时的 optional undo 与 CSV family。

### 17.4 Normative small vector

```json
{
  "projection": { "fields": [], "resolveRelations": [] },
  "sha256": "4efcb37076a87698cbe05b2dd2c08d6b185db2a5bebcf2dafccdc772f32fd76a"
}
```

```json
{
  "formula": "IIF(\"Done\", \"Amount\" + 1, 0)",
  "renamedField": { "from": "Amount", "to": "总额" },
  "rewritten": "IIF(\"Done\", \"总额\" + 1, 0)"
}
```

Formula vector 假定 `Done:checkbox`、`Amount:integer`，result 为 Integer。rename
后的 Field reference spelling 必须 byte-exact。implementation 会增加 published
exhaustive machine-readable vector；它们 MUST 标识 Runtime version，且不能默默
扩展 semantics。

## 18. 理由（资料性）

public row shape 采用 columnar，是因为一个 100-row × 20-Field page 否则会重复
2,000 个 UUID key。在本 test suite 使用的 representative vector 中，columnar
encoding 减少了 71,280 byte 的重复 Field-ID text，同时又未让 sparse write
变成 positional。Integer decimal string 与 JSON JCS text 避免 JavaScript
precision/null ambiguity。stable ID 让 rename 保持正确；human Formula name 保持
可读，并通过 AST 安全 rewrite。

SQLite 仍是 execution engine，而不是 public data model。strict typed binding、
generated set-based SQL、`json_each`、keyset predicate 与 optional index 利用
SQLite 的优势；与此同时，定义明确的 cold algorithm 防止 private cache 或 driver
变成第二种 format。

## 规范性参考资料

- [BCP 14: RFC 2119 and RFC 8174](https://www.rfc-editor.org/info/bcp14)
- [RFC 3339: Date and Time on the Internet](https://www.rfc-editor.org/rfc/rfc3339)
- [RFC 3986: URI Generic Syntax](https://www.rfc-editor.org/rfc/rfc3986)
- [RFC 2397：`data` URL scheme](https://www.rfc-editor.org/rfc/rfc2397)
- [RFC 4648：Base-N encodings](https://www.rfc-editor.org/rfc/rfc4648)
- [RFC 4180: Common Format and MIME Type for CSV](https://www.rfc-editor.org/rfc/rfc4180)
- [RFC 6901: JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901)
- [RFC 8259: JSON](https://www.rfc-editor.org/rfc/rfc8259)
- [RFC 8785: JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785)
- [RFC 9562: UUIDs](https://www.rfc-editor.org/rfc/rfc9562)
- [ECMA-262: `Number::toString`](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-number.tostring)
- [FIPS 180-4: Secure Hash Standard](https://doi.org/10.6028/NIST.FIPS.180-4)
- [JSON Schema Draft 2020-12 Core](https://json-schema.org/draft/2020-12/json-schema-core)
- [JSON Schema Draft 2020-12 Validation](https://json-schema.org/draft/2020-12/json-schema-validation)
- [SQLite Datatypes](https://www.sqlite.org/datatype3.html)
- [SQLite JSON Functions](https://www.sqlite.org/json1.html)
- [SQLite Transactions](https://www.sqlite.org/lang_transaction.html)
- [SQLite Query Planner](https://www.sqlite.org/queryplanner.html)
