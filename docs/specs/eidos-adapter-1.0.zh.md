# Eidos Adapter 1.0 中文参考

状态：Eidos 最终标准的中文参考  
版本：1.0  
发布日期：2026-07-21  
规范正文：[英文规范](./eidos-adapter-1.0.md)

## 摘要

Eidos Adapter 是 Eidos Runtime 下方的平台边界。它规定 Runtime 如何取得
精确的 SQLite 值，Host 如何打开并安全发布 Eidos File，以及 Runtime 调用
如何跨越 Worker 或进程边界。相同 Runtime 请求在浏览器、桌面、服务端和
命令行工具中必须保持相同含义。

本规范定义三个 port：

1. **ConnectionPort**：有序、无损的 SQLite 执行 ABI；
2. **PublicationPort**：source identity、writer lease、recovery 与独立
   `.eidos` 主数据库的安全发布；
3. **Transport Profile**：Worker/进程之间的 session、顺序、取消、背压和
   错误规则。

它不定义 Field、Formula、Lookup、Relation、query、mutation 或 UI 含义。
这些分别属于 Eidos File、Runtime 与 UI。

## 本文档的地位

英文文档是唯一规范正文；本文是逐项对应的参考译文。大写 **MUST**、
**MUST NOT**、**SHOULD**、**MAY** 等依
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) 与
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) 解释。除明确标为资料性的
内容外，算法、表格、默认值、状态迁移、port 形状与一致性要求都对应英文
规范。

## 1. 在规范栈中的位置

```text
UI ──calls──────────────► RuntimeClient
UI ──calls──────────────► HostServices
Runtime ──calls─────────► ConnectionPort / environment ports
Adapter composition ────► RuntimeHostBridge
Runtime ──interprets────► Eidos File Format
Adapter ──publishes─────► Eidos File Format
```

箭头表示 call/use 方向。Runtime 调用 Adapter 提供的 ports；trusted Adapter
composition 调用 `RuntimeHostBridge`。这些窄且 owner 分离的 interface 既不授予
Adapter logical semantics，也不授予 Runtime platform authority。

- [File Format](./eidos-file-1.0.zh.md) 拥有持久字节、schema、ID 和 canonical
  raw value；
- [Runtime](./eidos-runtime-1.0.zh.md) 拥有 logical value、query、派生求值、
  mutation、logical revision 和公开错误；
- 本文拥有 SQLite、平台、文件、Worker 与进程行为；
- [UI](./eidos-ui-1.0.zh.md) 拥有 RuntimeClient/HostServices 的消费、交互、
  presentation 与 accessibility。

Adapter **MUST NOT** 从 SQLite storage class 推断 Field 类型、解释 Formula/
Lookup、决定 query/filter/sort/group/conversion/delete 语义、把 driver 差异
变成 Runtime 行为，或向 UI 暴露 SQLite connection、SQL、path、native
handle、canonical 写原语，也不得定义 Runtime logical semantics 或 UI interaction
state。

Runtime 向 ConnectionPort 提供 trusted generated SQL，并向 PublicationPort 提供
File validation callback。Adapter 负责执行与发布，不决定这些 operation 的含义。

## 2. 术语与 token 隔离

- **Connection**：一个已打开 SQLite connection 及其 ConnectionPort 状态。
- **source**：取得 Eidos File 的、已授权的存储对象。
- **working database**：Runtime 实际操作的数据库，可为 source 或私有副本。
- **working ID**：一个可恢复 working-database incarnation 的 Adapter 私有身份；
  仅在 crash recovery 能证明连续性时保持稳定。
- **publication candidate**：已验证且自包含、可创建/替换 source 的 SQLite
  主数据库字节。
- **source ID**：Adapter 私有存储对象身份，不是 File ID。
- **content token**：某次观测到的 source 字节版本的不透明相等 token。
- **writer lease**：Adapter 管理的对一个 source 尝试发布的权利。
- **logical revision**：`eidos__meta.revision`，属于 Runtime/File。
- **data-version token**：每 Connection 的不透明 cache invalidation token。
- **request ID**：Transport 关联值，没有顺序或内容含义。
- **session ID**：一次 Runtime/Host session 的不透明身份。
- **epoch**：一次 Transport 实例身份；Worker/进程替换后改变。
- **commit receipt**：COMMIT 前的 Transport record，把一个 tentative changed
  Runtime result 绑定到其 request、File ID 与 revision transition。
- **owned bytes**：不依赖 statement 生命周期或发送方可变 buffer 的字节。
- **fatal**：connection/transport 不可复用。

| 值                 | 所有者           | 作用域                         | 唯一允许比较              | 禁止充当                |
| ------------------ | ---------------- | ------------------------------ | ------------------------- | ----------------------- |
| File ID            | File             | 持久文件寿命                   | UUID 相等                 | source/session identity |
| logical revision   | Runtime/File     | 一个 File ID                   | 整数相等/顺序             | digest/lock token       |
| content token      | PublicationPort  | 一次 source session            | 不透明相等                | logical revision        |
| working ID         | Adapter/Host     | 一个可恢复 working incarnation | 不透明相等                | source/File ID          |
| data-version token | ConnectionPort   | 一个打开 Connection            | 不透明相等                | 持久版本                |
| session ID         | Host/Transport   | 一次 session                   | 不透明相等                | File ID                 |
| epoch              | Transport        | 一次 transport 寿命            | 不透明相等                | logical revision        |
| request ID         | Transport caller | 一个 epoch                     | 不透明相等                | sequence number         |
| commit receipt     | Transport/Host   | 一个 prepared mutation         | 精确字段与 request digest | COMMIT 已发生的证明     |

## 3. 一致性 profiles 与先决条件

| 标签                | 必需 port 与先决条件                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `EA-Connection-1.0` | ConnectionPort、SQLite 3.45.0+、第 4 节 probes                                                     |
| `EA-Host-1.0`       | `EA-Connection-1.0`、PublicationPort、集成 `EF-Reader-1.0` validator                               |
| `EA-Browser-1.0`    | Connection + Host + Transport Profile + Dedicated Worker + SQLite/WASM + memory/import-export 基线 |
| `EA-Desktop-1.0`    | Connection + Host + Transport Profile + native SQLite + 专用数据库 Worker thread/process           |

Adapter 标签不要求 Runtime 标签；测试使用 conforming reference Runtime。
产品分别声明 `EF-*`、`ER-*`、`EA-*`、`EU-*`。声明 **MUST** 发布机器可读
capability record 并注明 `read-only` 或 `read-write`。后者满足前者。
Browser/Desktop 即使原 source 只读也 **MUST** 有可写 working database，可要求
Save Copy。

read-only Host 集成 `EF-Reader-1.0` validator；read-write Host 还必须集成
`EF-Writer-1.0` publication validator。Browser/Desktop 测试可注入 reference
validator，但 Adapter 仍不拥有 File 语义。

```json
{
  "adapterVersion": "1.0",
  "profiles": ["EA-Connection-1.0", "EA-Host-1.0"],
  "access": "read-write",
  "sqliteVersion": "3.45.0",
  "connection": {
    "json1": true,
    "returning": true,
    "strict": true,
    "int64": true,
    "scalarFunctions": true,
    "directOnlyFunctions": true,
    "interrupt": true,
    "snapshot": true,
    "defensiveMode": true,
    "busyTimeoutMs": 5000,
    "maxVariables": 32766,
    "maxSqlBytes": 1000000000,
    "maxValueBytes": 1000000000,
    "maxResultRows": 100000,
    "maxResultBytes": 16777216
  },
  "publication": {
    "writeCurrent": true,
    "saveCopy": true,
    "requestPermission": true,
    "recovery": true,
    "casGuarantee": "strong",
    "writerLease": "exclusive",
    "atomicReplace": true,
    "durability": "durable",
    "assetReadSchemes": ["relative", "data"],
    "assetWriteSchemes": ["relative", "data"]
  },
  "publicationLimits": {
    "sourceBytesMax": "10737418240",
    "candidateBytesMax": "10737418240",
    "recoveryBytesMax": "21474836480",
    "recoveryEntriesMax": 16,
    "recoveryRetentionSecondsMax": 604800,
    "assetBytesMax": "1073741824",
    "assetPreviewBytesMax": "67108864",
    "concurrentAssetLeasesMax": 16
  }
}
```

数值仅为示例，不是必需上限。capability 必须来自实际 probe；caller 不得超过
声明 limits。

## 4. SQLite 基线与打开时 probes

### 4.1 必需基线

ConnectionPort **MUST** 使用 SQLite 3.45.0+，并支持 UTF-8、精确 signed
int64、有限 binary64 REAL、所需 JSON SQL、STRICT、`RETURNING`、foreign
key、`trusted_schema`、deterministic scalar、transaction 与 savepoint。

### 4.2 强制 probes

Runtime 取得 Connection 前，Adapter **MUST** 在同一 connection 执行等价
probe；对象为 TEMP 或回滚，不改 canonical state：

```sql
PRAGMA foreign_keys = ON;
PRAGMA trusted_schema = OFF;
SELECT sqlite_version() AS version,
       sqlite_source_id() AS source_id;
SELECT json_valid('[]') AS valid_json,
       json_array_length('[1,2]') AS json_length;
PRAGMA foreign_keys;
PRAGMA trusted_schema;
SELECT CAST('-9223372036854775808' AS INTEGER) AS int64_min,
       CAST('9223372036854775807' AS INTEGER) AS int64_max,
       CAST(X'000102FF' AS BLOB) AS probe_blob;
```

probe transaction 内：

```sql
CREATE TEMP TABLE eidos_adapter_probe(
  id INTEGER PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
INSERT INTO eidos_adapter_probe(value)
VALUES ('ok')
RETURNING id, value;
DROP TABLE eidos_adapter_probe;
```

必须验证 version ≥3.45.0 且 source ID 非空、JSON 为 `1/2`、foreign keys 为 1、trusted schema
为 0、int64 边界精确、BLOB（含零）逐字节、STRICT、RETURNING 列顺序、
scalar 通过五种 storage class。compile options 不能代替运行 probe。失败为
`unsupported-capability`，关闭且不交给 Runtime。

## 5. ConnectionPort

### 5.1 带 tag 的值 ABI

```text
SqlValue =
  | { tag: "null" }
  | { tag: "integer", value: Int64Decimal }
  | { tag: "real", value: FiniteBinary64 }
  | { tag: "text", value: UnicodeString }
  | { tag: "blob", value: OwnedBytes }

Int64Decimal = "0" | "-"? [1-9] [0-9]*
```

范围为 `-9223372036854775808..9223372036854775807`；禁止 `+`、前导零、
`-0`、指数、空白。这是唯一 transport-neutral INTEGER 表示。内部可用 int64/
BigInt，禁止不安全 Number。REAL 必须有限；NaN/Infinity bind 时拒绝、读取时
`invalid-sql-value`。INTEGER/REAL 即使数值相同也 tag 不同。TEXT 是未做
Unicode normalization 的有效 UTF-8；非法 UTF-8 不替换。BLOB 输出在下一次
step/reset/finalize 前复制并归结果所有；输入复制或同步消费，caller 后续修改
不可见。Adapter 先看原 storage class，禁止借 SQLite 做隐式转换。

### 5.2 有序结果

```text
Column = { name: UnicodeString }
QueryResult = { columns: Column[], rows: SqlValue[][] }
```

row 长度等于列数，顺序等于 SQLite，重复/空列名保留；主要 ABI 禁止用按列名
key 的 object/map。Runtime SQL 为投影显式 alias。

```sql
SELECT 1 AS x, 2 AS x;
```

必须得到：

```json
{
  "columns": [{ "name": "x" }, { "name": "x" }],
  "rows": [
    [
      { "tag": "integer", "value": "1" },
      { "tag": "integer", "value": "2" }
    ]
  ]
}
```

### 5.3 操作

```text
ConnectionCapabilities = {
  adapterVersion: "1.0",
  sqliteVersion: UnicodeString,
  json1: Boolean,
  returning: Boolean,
  strict: Boolean,
  int64: Boolean,
  scalarFunctions: Boolean,
  directOnlyFunctions: Boolean,
  interrupt: Boolean,
  snapshot: true,
  defensiveMode: Boolean,
  busyTimeoutMs: PositiveSafeInteger,
  maxVariables: PositiveSafeInteger,
  maxSqlBytes: PositiveSafeInteger,
  maxValueBytes: PositiveSafeInteger,
  maxResultRows: PositiveSafeInteger,
  maxResultBytes: PositiveSafeInteger
}
```

所有 member 都必须存在，并反映经过 probe 或实际强制执行的行为。`json1`、
`returning`、`strict`、`int64`、`scalarFunctions` 与 `snapshot` 为 true。`interrupt` 只有在使用
已声明的 terminate cancellation profile 时才可以为 false；
`directOnlyFunctions` 与 `defensiveMode` 只有在分别采用第 5.5 节与第 6 节的精确
fallback 时才可以为 false。SQLite version 是运行时 dotted version，且至少为
3.45.0。Result limit 统计 row 数，并在返回任何 row 前按精确 tagged-value ABI
payload 统计字节。

```text
capabilities() -> ConnectionCapabilities
execSchema(sql) -> void
query(sql, bindings = []) -> QueryResult
get(sql, bindings = []) -> { columns, row: SqlValue[] | null }
run(sql, bindings = []) -> RunResult
runMany(sql, bindingSets) -> RunResult[]
registerScalar(definition, function) -> void
transaction(mode, operation) -> T
dataVersion() -> OpaqueToken
interrupt() -> void
snapshot(context) -> Promise<ConnectionSnapshot>
close() -> void
```

snapshot operation 的 context 与结果精确为：

```text
SnapshotContext = {
  cancellation: CancellationPort,
  deadlineMilliseconds?: PositiveSafeInteger,
  maxBytes: NonNegativeInt64Decimal
}

ConnectionSnapshot = {
  bytes: ByteSource,
  release() -> Promise<void>
}
```

`snapshot` 是唯一创建完整数据库 image 的 ConnectionPort operation。它 **MUST**
在 Adapter outer `read` transaction 内调用：先从 `main` read 并建立该
transaction 的 SQLite snapshot，且调用时没有 active statement；否则为
`invalid-argument`。返回值是该精确 snapshot 中 `main` 的 immutable、independently
owned bytes；建立 snapshot 后其他 connection 的 commit 不得进入这些 bytes，
TEMP 与 attached schema 不得进入。`ByteSource` 使用第 7.1 节 int64-sized
streaming interface，在 enclosing read transaction 结束后仍可读，直到
`release` resolve。Adapter 必须在 `snapshot` resolve 前完成独立 backup/frozen
image，绝不能返回 live Connection 的 view。

这些 bytes 必须可独立打开为一个 SQLite main database，包含该 snapshot 所需的
全部 committed page，且不依赖 rollback journal、WAL、shared-memory、VFS metadata、
lock file 或任何外部内容。Adapter 可在 `release` 前用 Host-private temporary
backing 保存 immutable sequence，可使用 Online Backup API、满足本契约的
`sqlite3_serialize` 或等价 VFS；当 committed page 仍只在 sidecar 中时，禁止复制
live main file。创建 snapshot 对 source Connection 只读。

Adapter 在构造 frozen image 时逐步计量 bytes；一旦完整 image 无法容纳于
`maxBytes`，必须停止、释放 partial backing 并返回 `resource-limit`，不得先生成
unbounded snapshot。Host 传入 effective `candidateBytesMax`。工作前与有界 backup/
serialization step 之间检查 cancellation/deadline；完整 image 已存在后成功优先于
后来 cancellation。失败后 enclosing read transaction 仍须可 rollback/close，无法
证明则 fatal。`release` asynchronous、幂等；完成后 read 返回 `adapter-closed`，并
删除 private backing。Connection `close` 释放全部未释放 ConnectionSnapshot。

只有 trusted Runtime/File validator 取得 port，不是公开 arbitrary SQL API。
binding 精确对应 `?1..?N`；missing/extra/named/out-of-range 均
`invalid-argument`，按 tag bind，identifier 由 Runtime quote。

`execSchema` 执行一个或多个 trusted 无结果 statement，不隐式 begin/commit。
`query` 执行恰好一个产生 rows 的 statement，不截断；带 `RETURNING` 的 mutation
必须在 Runtime `transaction("write", ...)` 内，普通 read 可不在；`get` 返回第一 row 或 null 并完成/
finalize。`run` 返回：

```text
RunResult = { changes: Int64Decimal, lastInsertRowid: Int64Decimal }
```

last rowid 从不是 Eidos Row ID。`runMany` prepare 一次、按顺序执行、每组一个
结果、不自建 transaction、首错停止；由外层 transaction 决定已有 effect。
任何路径 finalize，driver object/pointer 不逸出。

### 5.4 Transaction 与 savepoint

`mode` 精确为 `read` 或 `write`。outer read 执行 `BEGIN DEFERRED`，第一次 read
建立单一 SQLite snapshot，并以 `read-only` 拒绝所有非 read-only prepared
statement；outer write 执行 `BEGIN IMMEDIATE`。成功 COMMIT，throw/cancel ROLLBACK。
Adapter 用 [`sqlite3_stmt_readonly`](https://www.sqlite.org/c3ref/stmt_readonly.html)、
等价 authorizer 或等价 binding 强制只读；不能
只看方法名（传给 query 的 mutating statement 仍是 write），`query_only` 不能是
唯一防线。

嵌套调用使用 collision-proof Adapter-private savepoint：

```text
SAVEPOINT <private-name>;
-- nested operation
RELEASE <private-name>;
```

失败执行 `ROLLBACK TO <private-name>; RELEASE <private-name>;`。
继承 outer effective mode：write 中 read 可以且仍属 write transaction；read 中
write 在执行 SQL 前以 `read-only` 拒绝，禁止 read→write escalation。成功也仅在
outer COMMIT 后 durable。depth 按 Connection；不得重放部分 callback 或 interleave。

### 5.5 Deterministic scalar function

```text
ScalarDefinition = {
  name: ASCIIIdentifier,
  arity: Integer(0..127),
  deterministic: true,
  directOnly: true
}
```

1.0 不含 variadic。函数以 SqlValue 输入输出，pure/deterministic，不访问 file/
network/UI、不 SQL re-entry；throw 为 `sql-function-error`。每个 connection
注册 SQLite deterministic，并在可用时 DIRECTONLY；否则声明 false、保持
trusted schema off、禁止 schema 调用。函数名/语义属于 Runtime。

### 5.6 Data-version token

`dataVersion()` 仅能与同一打开 Connection 返回 token 做相等比较。自身 outer
mutation commit 或其他 connection 可见 commit 后、下次请求前必须改变。
建议把私有 local-commit counter 与 `PRAGMA data_version` 组合。它无需数字、
有序、跨 reopen 稳定或持久，绝不是 logical revision/content token。

### 5.7 Busy、cancellation 与 close

默认 busy timeout **5,000 ms**；更短 request deadline 优先。可在 effect 前
等待，但不得无限等待、重放部分 transaction、重试 constraint/corruption/I/O/
cancel 或隐藏 `BUSY_SNAPSHOT`。到期为 `busy`；`locked` 独立并保留 SQLite code。

`interrupt=true` 仅在可安全调用 `sqlite3_interrupt()` 时声明。queued cancel
不执行 SQL；active cancel interrupt 后 settlement/rollback，返回 `cancelled`
或 `deadline-exceeded`。先线性化的 COMMIT 仍成功。若 Connection 不支持，
Browser/Desktop 通过终止专用 Worker/process hard cancel，并使 session fatal。
capability=false 时调用 `interrupt()` 返回 `unsupported-capability`，不得假装 active
operation 已取消。

```text
opening -> open -> draining -> closed
             |         |
             +-------> fatal
```

close 幂等，拒绝新工作、处理 queue、尽量 rollback、finalize、释放并关闭。
corruption、rollback 失败、commit 结果不明、driver misuse、process loss 均 fatal。

### 5.8 注入 Runtime 的环境输入

Adapter 在 ConnectionPort 旁向 Runtime 的 abstract environment port 提供以下输入；
它们不是第四个核心 Adapter port，也不是 ambient global API：

```text
ClockPort = {
  nowInstant() -> CanonicalMillisecondUTCInstant,
  nowMilliseconds() -> NonNegativeFiniteBinary64
}

EntropyPort = {
  randomBytes(length) -> OwnedBytes
}

RuntimeEnvironment = {
  clock: ClockPort,
  entropy: EntropyPort,
  transportCommitBarrier?: TransportCommitBarrier
}

CancellationPort = {
  cancelled() -> Boolean,
  onCancel(callback) -> Unsubscribe
}
```

wall clock 精确返回 File Format 的毫秒 UTC
`YYYY-MM-DDTHH:MM:SS.sssZ`，只用于 canonical timestamp 与 UUIDv7 timestamp
部分。系统校时可后退；Runtime 的 UUIDv7 monotonic rule 处理相同/后退毫秒，
不得因此改写普通 timestamp Field。

monotonic clock origin 任意，在一个 Adapter epoch 内不下降，只用于 deadline、
busy budget、elapsed time；不得持久化、序列化、充当 wall time 或 revision。

entropy 返回请求长度的独立 CSPRNG owned bytes；production 用 OS 或 Web Crypto
[`crypto.getRandomValues`](https://www.w3.org/TR/WebCryptoAPI/#Crypto-method-getRandomValues)，
禁止 Math.random 或 time-derived PRNG。UUIDv7 allocation、bit layout、validation、
public creation semantics 按 [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562)
属于 Runtime；Adapter 只供 time/entropy。explicit caller ID 仅是 Runtime import/
replay 能力，不是 UI/Adapter 自行实现 UUID 语义。

每个 in-process Runtime request 得到 one-shot、幂等 CancellationPort，其 queued/
running/commit boundary 与 Transport cancel 相同；Adapter 接到 interrupt 或 hard
termination，并在 settle 时 unsubscribe。

`transportCommitBarrier` 恰好只在 Runtime binding 由第 9.5.1 节 prepared-commit
Transport profile 承载时存在；direct binding 中不存在。它是 trusted composition
state，不是 public service、canonical File state 或 ambient API。

locale、local timezone、host `Date`、platform clock object、mutable random generator
不得过界。conformance harness 可注入固定 instant、monotonic、entropy、cancel 点；
production/test 使用同一 interface。

## 6. 安全 bootstrap

Adapter 在 validation 或 Runtime SQL 前必须：

1. 只按请求的 read-only/read-write mode 打开 Adapter-scoped storage；
2. 拒绝不是 Adapter 自己创建的 SQLite URI parameter；
3. 禁用 extension loading；
4. 在支持时启用 extended result code；
5. 设置并验证 `PRAGMA foreign_keys=ON`；
6. 设置并验证 `PRAGMA trusted_schema=OFF`；
7. 在可用时启用 `SQLITE_DBCONFIG_DEFENSIVE`；
8. 应用 busy timeout 与 resource limit；
9. 执行第 4 节 probe；
10. 在任何 canonical write 前执行 File validation；唯一例外是创建新的空数据库：
    可在一个 write transaction 内安装精确 File DDL 与 singleton，但必须在该
    transaction commit 前完成 validation。

无法调用 defensive C API 时仅在声明 false、无 arbitrary SQL、trusted schema
off 且用 authorizer/封闭 API 强制禁令时 conform。不得向 untrusted caller 提供
extension、ATTACH/DETACH、writable_schema、arbitrary PRAGMA/DDL/trigger、
ConnectionPort 或 scalar registration。read-only 同时用 engine read-only open，
SHOULD query_only。journal mode 是 working policy，发布仍满足第 8 节。

## 7. PublicationPort

### 7.1 Port 与 identity

PublicationPort 是 async 且 capability-bearing。每个 async operation 都收到下列
签名中明确显示的末尾 `PublicationContext={cancellation:CancellationPort,
deadlineMilliseconds?:PositiveSafeInteger}` argument：

```text
openSource(opaqueGrant, desiredAccess, context) -> PublicationSession

PublicationSession:
  capabilities() -> PublicationCapabilities
  limits() -> PublicationLimits
  descriptor() -> SourceDescriptor
  readSource(expectedContentToken?, context) -> SourceSnapshot
  acquireWriterLease(context) -> WriterLease
  publish(candidate, expectedContentToken, writerLease, context) -> PublishResult
  saveCopy(opaqueDestinationGrant, candidate, destinationExpectation, context) -> PublishResult
  saveRecovery(recoveryRecord, context) -> RecoveryID
  listRecovery(context) -> RecoveryDescriptor[]
  readRecovery(recoveryID, context) -> RecoveryRecord
  discardRecovery(recoveryID, context) -> void
  acquireAsset(assetReference, mode, context) -> PublicationAssetLease
  resolveAsset(assetLease, context) -> { descriptor: AssetDescriptor, bytes: ByteSource }
  releaseAsset(assetLease, context) -> void
  close(context) -> void
```

`capabilities`、`limits` 与 `descriptor` 是该 session 的 synchronous immutable
snapshot。上面其他每个 arrow 都是 asynchronous，且恰好 settle 一次。

`opaqueGrant` 来自 trusted platform/product composition layer。UI 可以持有 opaque
grant token，但不得取得 path、native handle、storage credential、PublicationPort
或 source bytes。

`desiredAccess` 精确为 `read` 或 `readwrite`。核心 publication type 为：

```text
WriterLease = {
  leaseID: OpaqueString,
  sourceID: OpaqueString,
  level: "exclusive" | "cooperative",
  ttlMs?: PositiveSafeInteger
}

PublicationCandidate = {
  fileID: UUIDv7,
  logicalRevision: NonNegativeInt64Decimal,
  digest: LowercaseSHA256Hex,
  size: NonNegativeInt64Decimal,
  bytes: ByteSource
}

PublishResult = {
  descriptor: SourceDescriptor,
  fileID: UUIDv7,
  logicalRevision: NonNegativeInt64Decimal,
  digest: LowercaseSHA256Hex,
  durability: "durable" | "best-effort"
}

DestinationExpectation =
  | { mode: "create-only" }
  | { mode: "replace", sourceID: OpaqueString,
      contentToken: OpaqueToken }

PublicationCapabilities = {
  writeCurrent: Boolean,
  saveCopy: Boolean,
  requestPermission: Boolean,
  recovery: Boolean,
  casGuarantee: "strong" | "cooperative" | "none",
  writerLease: "exclusive" | "cooperative" | "none",
  atomicReplace: Boolean,
  durability: "durable" | "best-effort",
  assetReadSchemes: UnicodeString[],
  assetWriteSchemes: UnicodeString[]
}

PublicationLimits = {
  sourceBytesMax: NonNegativeInt64Decimal,
  candidateBytesMax: NonNegativeInt64Decimal,
  recoveryBytesMax: NonNegativeInt64Decimal,
  recoveryEntriesMax: NonNegativeSafeInteger,
  recoveryRetentionSecondsMax: NonNegativeSafeInteger,
  assetBytesMax: NonNegativeInt64Decimal,
  assetPreviewBytesMax: NonNegativeInt64Decimal,
  concurrentAssetLeasesMax: NonNegativeSafeInteger
}
```

`LowercaseSHA256Hex` 精确为 64 个 lowercase hexadecimal character，表示按
[NIST FIPS 180-4](https://doi.org/10.6028/NIST.FIPS.180-4) 定义、覆盖全部
candidate bytes 的 SHA-256。`size` 等于 ByteSource size；File ID/revision 等于
已验证 candidate metadata。Lease 只在所属 source/session、声明 level 与未过期
lifetime 内有效；`ttlMs` 若存在，从 lease acquire 起按注入的 monotonic clock
计量。任何 mismatch 都必须在写入前以 `writer-unavailable` 拒绝。

```text
SourceDescriptor = {
  sourceID: OpaqueString,
  displayName: UnicodeString,
  size: NonNegativeInt64Decimal,
  contentToken: OpaqueToken,
  lastModified?: CanonicalInstant,
  permission: "granted" | "prompt" | "denied" | "unavailable"
}
```

每个 capability/limit member 都必须存在。Scheme array 包含唯一 lowercase RFC
3986 scheme name，并按 `BINARY` 排序。Publication limit 为零会禁用相应 optional
operation，绝不能截断；零绝不表示 unlimited。特别地，
`recoveryRetentionSecondsMax=0` 会禁用 recovery，既不表示 immediate expiry，也不
表示没有 time-based expiry。Recovery 仅在 `recovery=true` 且
`recoveryBytesMax`、`recoveryEntriesMax`、`recoveryRetentionSecondsMax` 全为正值时
可用。第 8.6 节要求 writable Host 必须有 recovery，因此这三个 limit 任一为零的
`EA-Host-1.0` session 不得暴露 read-write Runtime。

其余精确 record 为：

```text
PublicationContext = {
  cancellation: CancellationPort,
  deadlineMilliseconds?: PositiveSafeInteger
}

AssetReference =
  | { kind: "uri", uri: UnicodeString }
  | { kind: "grant", token: OpaqueString }

ByteSource = {
  size: NonNegativeInt64Decimal,
  read(offset: NonNegativeInt64Decimal,
       length: NonNegativeSafeInteger,
       context: PublicationContext) -> OwnedBytes
}

SourceSnapshot = {
  descriptor: SourceDescriptor,
  bytes: ByteSource,
  release() -> Promise<void>
}

RecoveryRecord = {
  fileID: UUIDv7,
  logicalRevision: NonNegativeInt64Decimal,
  digest: LowercaseSHA256Hex,
  size: NonNegativeInt64Decimal,
  createdAt: CanonicalInstant,
  sourceID?: OpaqueString,
  baseContentToken?: OpaqueToken,
  bytes: ByteSource
}

RecoveryDescriptor = {
  recoveryID: OpaqueString,
  fileID: UUIDv7,
  logicalRevision: NonNegativeInt64Decimal,
  digest: LowercaseSHA256Hex,
  size: NonNegativeInt64Decimal,
  createdAt: CanonicalInstant
}

PublicationAssetLease = {
  leaseID: OpaqueString,
  mode: "read" | "import" | "write",
  expiresAt: CanonicalInstant
}

AssetDescriptor = {
  mediaType: UnicodeString,
  name: UnicodeString,
  size: NonNegativeInt64Decimal
}
```

`ByteSource` immutable。Read 要求 `offset<=size`，并精确返回
`min(length,size-offset)` 个 owned bytes（EOF 时包括零）；它绝不 alias mutable、
native 或 WASM buffer。SourceSnapshot descriptor 与 bytes 描述同一个 token。
每个 PublicationSession 最多有一个 live SourceSnapshot；Host 在 import/validation
后的 `finally` 中调用其 asynchronous、幂等 `release`。Release 后的 read 返回
`adapter-closed` 并删除 private backing；未 release 时再次 `readSource` 返回
`busy`，session close 会释放 orphan snapshot。
Recovery digest/size 与其 bytes 匹配；`readRecovery` 返回精确保存的 record。
`acquireAsset` 返回 `PublicationAssetLease`；`resolveAsset` 返回
`{descriptor:AssetDescriptor,bytes:ByteSource}`。Source read 中发生变化是
`source-changed`；禁止 mixed bytes。`listRecovery` 按 `createdAt` 降序、再按
`recoveryID` 的 `BINARY` 升序排序，且绝不超过 `recoveryEntriesMax`。

`ConnectionSnapshot.release`、`SourceSnapshot.release` 与 delegated
`RuntimePublicationSnapshot.release` 都是无参数 cleanup primitive；它们有意不可
取消，并总会完成资源释放，这不表示其他 async work 缺少 PublicationContext。

`assetReference` 是授权的 canonical URI 或 Host-resolved opaque source grant；
`mode` 为 `read`、`import` 或 `write`。UI 不直接提供任一种；composition facade
在调用 PublicationPort 前解析其 opaque `sourceToken` 或 Runtime File-entry ID。

Cancellation 是必需契约。任何 source/destination replacement 开始前，cancel/
deadline 都以 `cancelled`/`deadline-exceeded` 中止，source bytes 保持不变。一旦
replacement 开始，Adapter 延迟 cancellation，直到验证成功或确定进入
`recovery-required`；它返回这个已知 outcome，不得谎称取消。Read/open/asset
operation 在有界 read boundary 停止，并释放 partial private buffer。Close cancellation
绝不能跳过 lease/handle cleanup。

### 7.2 Source identity 与 content token

`sourceID` 在 Adapter scope 内标识 storage object。若可证明 object identity，rename
后应该保持；handle/path 指向检测到的 replacement 时必须改变。Path text 本身不够。
`contentToken` 只在 sourceID 加 open session 的 scope 内做 opaque equality；同一
identity 的相同 bytes 必须返回相等 token，不同 bytes 必须返回不等 token。Watcher/
timestamp 只是 hint，普通发布总通过用于 replacement 的同一 identity path 重验。

### 7.3 Read-only 与 permission

无 write permission、安全 lease 或 conforming publication 时，Adapter 必须以
read-only 打开 source；仍可提供 read-write private working database 与
`saveCopy=true`。`prompt` 不得触发 background prompt；user-activated composition
action 可以请求 permission 并替换 opaque grant。Denial 是 `permission-denied`，且
保留 working data/recovery。

### 7.4 Writer lease 与 CAS

| writerLease   | 保证                                                             |
| ------------- | ---------------------------------------------------------------- |
| `exclusive`   | platform lock 在比较与替换期间排除遵循相同 lock 的 writers       |
| `cooperative` | Host lease 排除 conforming Eidos Adapter，外部 writer 仍可能竞争 |
| `none`        | 无排他                                                           |

普通覆盖要求 exclusive/cooperative；none 仅 read-only 或显式 Save Copy。forced
overwrite 不属于 Adapter 1.0 PublicationPort，也从不是自动 conflict fallback。
returned lease 只属于 source publication；另有且仅有一个 session 可作为 working
file 的 logical Runtime writer。SQLite lock 仍必需。

| casGuarantee  | 行为                                                               |
| ------------- | ------------------------------------------------------------------ |
| `strong`      | expected-token compare 与 replace 在 exclusive lock 下同一线性化点 |
| `cooperative` | Eidos lease 下紧邻 replace 重验 token；外部 writer 仍可能竞争      |
| `none`        | 无 conditional overwrite；禁止普通覆盖                             |

publish 必须带 base token；不匹配在写前 `source-changed`，保留 candidate/
recovery，绝不自动 reload/merge/force。cooperative 发布后重读 digest。

### 7.5 Host 状态机

对每个 read-write Transport session，trusted Host（不是 Runtime）**MUST** 强制
working database 只有一个 exclusive logical writer。创建/import working
incarnation 时分配 fresh opaque `workingID`；仅当能证明同一个 crash-recovered
database 连续存在时，才能在 Worker/process replacement 后保留该值。Filename、
source ID 与 File ID 都不能单独证明连续性。Writable working store 必须被 scoped，
使非 Adapter connection/process 无法 canonical write；若 opened source 不能提供
这种排他，Host 必须让 Runtime 在 private copy 上运行并通过 PublicationPort 保存，
不能把 cooperative source lease 当作对任意 SQLite writer 的排他。Read-only direct
Connection 不受影响；此 working-writer invariant 与第 7.4 节 publication lease
不同。

```text
opening
  |-> ready-readonly
  `-> ready-clean -> ready-dirty -> publishing -> ready-clean
                         |             |-> conflict
                         |             `-> recovery-required
                         `----------------> conflict

ready-clean/ready-dirty -> commit-unknown
commit-unknown -> ready-clean | ready-dirty | conflict

any non-closed state -> fatal
any state -> closed
```

- `ready-readonly`：working Runtime 本身不能 mutate；并不只是原 source 无法覆盖。
- `ready-clean`：working logical revision 等于 opened/published baseline。只读 source
  的 writable private working database 也可以是 ready-clean，此时
  `canWriteCurrent=false`，通常 `canSaveCopy=true`。
- `ready-dirty`：Runtime 已 commit 更新的 logical revision。
- `publishing`：mutation 已 quiesce，正在验证/发布一个 frozen candidate revision；
  snapshot-safe read 可以继续。
- `conflict`：source identity/token 改变，dirty work 保留。
- `recovery-required`：destination outcome/validity 不确定，verified recovery
  candidate 已保留。
- `commit-unknown`：acknowledged mutation 丢失 final outcome 后，旧 Transport/
  Runtime epoch 已 fatal；Host 私有保留 receipt，只允许 reconciliation、recovery
  inspection 或 close。
- `fatal`：working connection 不可信，必须 reopen/restore。

dirty 只来自 Runtime 成功 logical mutation，不来自 data-version/cache write。
一次 session 至多一个 publication。第 13 节规定精确的 UI-facing HostServices
binding；它是 composition facade，不是第四 port，UI 绝不取得 PublicationPort。

## 8. Candidate 与发布

### 8.1 Quiesce 与 snapshot

Host 只能从 trusted Runtime host bridge
`createPublicationSnapshot({maxBytes}, context)` 取得 candidate input；`maxBytes` 是
session 的 effective `candidateBytesMax`。该 bridge 不是 RuntimeClient，绝不向 UI
暴露。它精确返回：

```text
RuntimePublicationSnapshot = {
  fileId: UUIDv7,
  revision: NonNegativeInt64Decimal,
  bytes: ByteSource,
  release() -> Promise<void>
}
```

Runtime 通过 public request queue 序列化此 bridge call，等待所有更早 mutation
commit/rollback，并在独立 ConnectionSnapshot 生成前阻止后续 operation 启动；同时
依赖第 7.5 节 Host sole-writer invariant。在一个 Adapter outer read transaction 中：

1. 从 `main` 读取 File ID/revision，建立 SQLite read snapshot；
2. 完成这些 statement；
3. 在 read transaction 结束前调用 `ConnectionPort.snapshot`；
4. 返回该 immutable `ByteSource` 及精确对应的 identity 值。

Host 按 effective `candidateBytesMax` 再验 size，在同一个 ByteSource 上 hash 并运行
File Writer publication validator，把 candidate 绑定到 File ID、logical revision、
byte length 与 digest；不得替换为更晚的 Connection image。在每个出口，Host 都在
publication 与所需 recovery copy 不再使用 backing storage 后，于 `finally` 中调用
RuntimePublicationSnapshot 的幂等 `release`。Bridge 持有 underlying
ConnectionSnapshot 并 delegate release；UI 不取得任何 release handle。Runtime/
Connection close 也释放 Host 未完成 cleanup 的 snapshot。

因为 source 已独立，Runtime internal queue 不必在 hash、validation 或
PublicationPort I/O 全程阻塞；但 trusted Host composition 必须在 publication settle
前保持 mutation-admission gate 关闭，防止更新 revision 越过 candidate。`publishing`
期间新 mutation 在执行前返回 Runtime `busy`；snapshot-safe read 可以继续。成功后
gate 在 `ready-clean` 重开；失败后在 `ready-dirty`/`conflict` 重开，或依
`recovery-required`/`fatal` 保持关闭。

PublicationPort source writer lease SHOULD 在 candidate validation 后、source token
重验/replace 前紧邻取得，以缩短 lock 时间；它不同于 session 的 logical Runtime
writer role。

SQLite Online Backup API 在遵守 locking rule 时可用。WAL mode 中禁止只复制 main
file；ConnectionPort 必须遵守 frozen backup/serialization 契约，或 quiesce 并
checkpoint 到没有 busy frame，使 main 独立于 `-wal`/`-shm`。发布物精确为一个
self-contained `.eidos` main database；journal、WAL、shared-memory、OPFS VFS
metadata、lock、temp、recovery 与 cache 都不是 File state。

### 8.2 Candidate validation

发布前调用 assembled implementation 提供的 `EF-Writer-1.0` validator，Adapter
不重写 File 语义；validator 建立 File-owned identity/schema、`quick_check` 与
`foreign_key_check` 要求。Adapter 另验 digest 全覆盖、bytes 不再可变、无需 sidecar、length
一致、size 在 limit。失败不改 source，保持 dirty。

### 8.3 安全 replacement

```text
atomicReplace: true | false
durability: "durable" | "best-effort"
```

atomic=true 时同 replacement domain staging、完整 write/flush、atomic replace、
可用时 flush containing metadata；失败后只能全 old 或全 candidate。false 时
触碰 source 前原子保存并验证 recovery，使用最强 commit，close、重读、验
digest；失败进入 recovery-required，不能声称 old 保留。durable 仅在可用 data/
metadata durability 完成后成功；best-effort 明示无此保证。

### 8.4 Postconditions

成功 publish 或 Save Copy 后必须满足：destination 与 candidate digest 相同；重读
为 self-contained valid Eidos File；descriptor/token 描述这些精确 bytes；不需要
stale journal；仅在这些条件全部成立后删除 recovery。

对于 `publish`，当前 session base token 变为返回 token，state 在 candidate
revision 变为 `ready-clean`。`saveCopy` 只建立 destination descriptor/token，不改变
当前 session 的 source、base token 或 dirty/clean state。Composition layer 可以
显式采用 copy，但必须先 close 旧 source，再打开新的 Runtime/Transport epoch；只有
这个独立 transition 成功后，copy 才是 clean。

source-change、permission、lease 或任何 replacement 前失败都不改变原 source，
candidate 保持 recoverable；不确定/non-atomic 失败是 `recovery-required`，绝不
clean。

Publication session `close` 幂等，释放 writer/asset lease 与 source handle，但不删
recovery record。

### 8.5 Save Copy 与外部 replacement

Save Copy 创建所选 destination，或显式替换它；它建立新的 source identity/token，
并发布完全相同的 candidate bytes。Storage location 变化本身绝不改变 File ID/
logical revision。`create-only` 在 object 已存在时以 `source-changed` 失败。
Replacement 要求 fresh grant 加精确 destination identity/content token，并在第 7.2
节同一线性化边界重验；mismatch 不改变 destination。Composition-layer
`destinationToken` 是 one-use，并绑定该 grant/expectation，而不向 UI 暴露任一者。
Composition layer 可选择保留旧 source 或采用新 source，但必须明确说明选择；
Adapter 不会静默 close/overwrite 旧 source。

外部变化时，clean session 可以用新 Connection/Transport epoch 按策略 reload；
dirty 进入 conflict 并保留两份；安全 action 只有确认 discard/reload、Save Copy、
Runtime/product merge，Adapter 不自动 merge。

### 8.6 Recovery

read-write Host 必须提供 Host-private recovery：

```text
HostRecoveryEnvelope = {
  recoveryID, workingID, sourceID, baseDigest, fileID, logicalRevision,
  createdAt,
  payload:
    | { kind: "candidate", candidateDigest, candidateLength, candidateBytes }
    | { kind: "working-snapshot", storageToken }
}
```

`HostRecoveryEnvelope` 是 Adapter-private storage model，不是第 7.1 节
PublicationPort `RecoveryRecord`，也不是第二个 port ABI。`workingID` 将其绑定到
第 7.5 节 exclusive working incarnation。公开 `saveRecovery` 接受第 7.1 节
self-contained byte record。Host 可以通过 private recovery implementation 创建/
更新 `working-snapshot`，但 `readRecovery` 返回前必须经 SQLite 打开、验证，并把它
materialize 为第 7.1 节精确 `RecoveryRecord` 与 immutable ByteSource；storage
optimization 不改变 caller 观察到的 record shape。

base/candidate digest 都是 lowercase
SHA-256，content token session 结束后仍可用。candidate 是 owned/self-contained/
valid；working-snapshot 是 transactionally consistent、durable Host-private SQLite
working DB，可保留私有 VFS journal，但 restore 时必须经 SQLite 打开验证、发布前
生成第 8 节 candidate；storageToken 不过 composition facade。

record + payload reference 原子更新；旧 revision 不覆盖新。non-atomic overwrite
必须使用 candidate payload；周期 autosave 可用 incremental durable working-snapshot，
不要求每 30 秒全量复制数据库。non-atomic write 前、dirty hard termination
前（安全可导出时）、dirty autosave、indeterminate I/O 丢连接前保存。默认 dirty
autosave **30 秒**，可缩短或声明最长 5 分钟；100 次 committed mutation 先到则
checkpoint。仅 verified publication、显式 discard 或已披露 expiry 后删除。

Recovery 在 platform guarantee 内跨 Worker/process restart 与普通 crash 存活；
绝不进入 `.eidos` canonical state。

### 8.7 Assets

File Format 第 8.3 节没有 attachment store。relative/`https:` File-entry URI 引用
SQLite 外的 bytes；canonical `data:` inline image 是唯一的 narrow exception，其 bytes
已在 URI text 中，但 UI 仍只能通过同一 scoped asset flow 访问。asset schemes 必须
声明；network 默认禁用。AssetLease 限定 authority，防 traversal/symlink/origin
escape/credential escalation，限制 bytes/time/media/decode，释放资源，不得因平台 path
变化重写 canonical URI。数据库与 asset 同操作时先 durable
stage assets，再 publish DB，保留 recovery manifest；失败宁可 orphan staged
asset，也不能发布指向 missing asset 的 DB；无真实 transaction 不声称跨资源原子。

capability token `relative` 表示没有 [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986)
scheme、只在 session scoped asset
root 中解析的 File URI，例如 `assets/diagram.png`。其他 token 是匹配
`[a-z][a-z0-9+.-]*` 的 lowercase RFC 3986 scheme，例如 `https`；`assets` 是 path
segment，不是 scheme。列出 network scheme 仍要求 Host 授权；writer 通常只列
`relative`，只有实现显式 remote File acquisition 时才加入 `https`，只有明确支持
bounded inline-image representation 时才加入 `data`。

`data` token 表示 Host 能验证并解析 canonical inline-image Data URL，不授权其他 Data
URL。resolve Host 必须核对 File entry declared media type/size 与 Data URL，拒绝
non-canonical Base64，在 allocation 前执行 1 MiB decoded format limit，并返回
purpose-scoped presentation token，不能把 decoded bytes 暴露给 UI code。inline SVG 与
所有含 active feature 的格式采用和 external content 相同的 isolation policy。

对 `relative`，scoped asset root 表示 opened `.eidos` source 所在目录或明确等价的
directory grant。没有该 root 的 Host 必须报告 entry unavailable，并从
`assetReadSchemes` 省略 `relative`；不得 fallback 到 web application origin、process
current directory、download directory 或猜测的 sibling path。打开 bytes 前必须完成
percent-decoding、dot-segment removal、symlink check 与 final containment。

asset import 时，Host policy 在调用 Runtime `allocateFileEntry` 前选择 canonical
representation：通常是 relative external reference；只有 image 在 format limit 内且
`assetWriteSchemes` 含 `data` 时才可选择 inline Data URL。UI 不选择 storage placement，
也不创建 URI。

optional remote File acquisition 接受 absolute `https:` URI 与 optional requested
filename。Host 只能在明确 user action 后 fetch，必须执行 `assetBytesMax` 与 network
deadline，取得 exact byte size、选择 safe filename、识别 safe media type，并以原始
requested URI 调用 Runtime `allocateFileEntry`；redirect 不得重写 canonical URI。
raster media type 与其他可 sniff format 必须从 bytes 验证；未知 generic file 使用安全的
declared/inferred type 或 `application/octet-stream`。operation 只返回 metadata，不把
remote bytes 复制进 relative asset root。每个 redirect target 都要重新授权，拒绝 URI
userinfo 与 HTTPS downgrade，不发送 ambient cookie/authorization/referrer，并遵守下文
loopback/private/address 规则。只有 `assetWriteSchemes` 包含 `https` 时 Host 才暴露该操作。

Host 还可以为 Field settings 声明 `display.kind="image"` 的 scalar URL Field 解析
image presentation。这是 read-only presentation flow，不是 File-entry acquisition：不创建
persistent ID，不要求 canonical state 含 `name`、`size` 或 `mediaType`，也不重写 URL。
UI-facing facade 只能通过 optional `resolveUrlImage` operation 与 `UrlImageLease` 暴露
该能力；low-level PublicationPort 仍只接收 authorized URI reference。

1.0 的 `resolveUrlImage` 只接受 absolute `https:` URI。只有 `assetReadSchemes` 含
`https` 且 Host policy 允许时才能访问 network。resolver 必须拒绝 URI userinfo 与 HTTPS
downgrade，限制 redirect 数并逐跳重新授权，不发送 ambient cookie、authorization 或
referrer；除非 explicit disclosed Host policy 授权，否则禁止 loopback/private/link-local/
reserved address。读取必须受 asset byte/time limit 约束，必须从 bytes 验证 supported raster
image。该策略可以识别平台代理为 hostname 返回的 synthetic DNS range，但不得因此授权
host 本身为 IP literal 的 URI，request 必须继续绑定原始 hostname，且不得扩展到其他
private 或 reserved range。不能只信 suffix；cache 按 Host authorization context 隔离。signed URL 与 query
credential 默认不得进入 log、telemetry、diagnostic 或 shared cache key。

## 9. Transport Profile

### 9.1 Scope

Transport 是 Browser/Desktop 的必需组成，但 1.0 没有独立标签。一个 channel
承载一个 document session；多文档产品为每个 session 使用独立 channel/epoch，或
提供可观察上完全相同的 isolation。它只传 Runtime public service，不暴露
Connection/PublicationPort。operation/payload 语义属于 Runtime；Transport 只处理
JSON-compatible typed data 与 explicit byte attachment。

1.0 envelope 是 request/response 加第 9.5.1 节 solicited pre-COMMIT barrier，不定义
unsolicited Runtime event message。因此经此 Transport 承载的 RuntimeClient 报告
`events=false` 并省略 `subscribe`；`HostServices.subscribe` 是独立 composition
facade state channel。未来 event envelope 需要新 Adapter protocol version，1.0
不得自行发明。

### 9.2 唯一 wire contract

唯一 wire contract 是第 9.3 节完整 JSON Schema 2020-12
所定义的 JSON logical envelope；没有第二套 browser/desktop message shape。它按
[Core](https://json-schema.org/draft/2020-12/json-schema-core) 与
[Validation](https://json-schema.org/draft/2020-12/json-schema-validation)
执行验证。

Browser structured-clone carrier 精确为：

```text
StructuredCloneCarrier = {
  envelope: AdapterWireEnvelope,
  buffers: ArrayBuffer[]
}
```

envelope 先通过同一 JSON Schema。Runtime endpoint 随后按 Eidos Runtime 精确 tagged
API type 验证 request `operation`/`payload`，client 对成功 `result` 做相同 validation。
Adapter envelope 故意把 payload/result 保持 generic JSON，是 owner separation，
不是跳过验证；receipt reconciliation 由 embedded `$defs.commitReconciliation`
执行验证。所有 applicable validation 在 state transition 前都必须通过。
`buffers.length` 等于 attachments 长度；第 N
个 owned buffer 对应第 N descriptor，byteLength 相同。descriptor 的 ID 与
`slot` 都唯一；owning Runtime operation contract 声明允许的 binary slots，并另收
slot-to-owned-bytes map。绝不扫描 payload JSON 寻找 marker；每 descriptor 必须
被接受并消费一次。Desktop IPC 等价。base64 payload、native pointer、driver
BLOB、ad-hoc BigInt 均不是 1.0 wire value。

Runtime 1.0 唯一 nominal `OwnedBytes` member 是 CSV `csv`。
`CsvImportRequest.csv` 连同 key 从 request JSON 移除，精确通过一个 slot 为 `csv` 的
request attachment 搬运；`CsvExportResult.csv` 同样从 result JSON 移除，精确通过
一个 slot 为 `csv` 的 response attachment 搬运。Endpoint/client 在验证 Runtime
request/result 前重建这个 required logical member。其他 1.0 Runtime operation 不
接受 attachment slot。

### 9.3 可执行 envelope schema

以下完整 document 是规范性的 Adapter framing 与 receipt schema。Runtime payload/
result 的含义仍由 Eidos Runtime 的 normative API type 与算法拥有。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://spec.eidos.space/adapter/1.0/wire.schema.json",
  "title": "Eidos Adapter Wire Envelope 1.0",
  "oneOf": [
    { "$ref": "#/$defs/hello" },
    { "$ref": "#/$defs/helloError" },
    { "$ref": "#/$defs/helloResult" },
    { "$ref": "#/$defs/request" },
    { "$ref": "#/$defs/success" },
    { "$ref": "#/$defs/failure" },
    { "$ref": "#/$defs/commitPrepared" },
    { "$ref": "#/$defs/commitAck" },
    { "$ref": "#/$defs/cancel" },
    { "$ref": "#/$defs/close" },
    { "$ref": "#/$defs/closeResult" }
  ],
  "$defs": {
    "opaque": { "type": "string", "minLength": 1, "maxLength": 128 },
    "requestID": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128,
      "pattern": "^[^\\u0000]+$"
    },
    "uuidv7": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "slot": { "type": "string", "pattern": "^[A-Za-z][A-Za-z0-9._-]{0,127}$" },
    "safeInteger": {
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    },
    "nonNegativeInt64": {
      "type": "string",
      "pattern": "^(?:0|[1-9][0-9]{0,17}|[1-8][0-9]{18}|9[01][0-9]{17}|92[01][0-9]{16}|922[0-2][0-9]{15}|9223[0-2][0-9]{14}|92233[0-6][0-9]{13}|922337[01][0-9]{12}|92233720[0-2][0-9]{10}|922337203[0-5][0-9]{9}|9223372036[0-7][0-9]{8}|92233720368[0-4][0-9]{7}|922337203685[0-3][0-9]{6}|9223372036854[0-6][0-9]{5}|92233720368547[0-6][0-9]{4}|922337203685477[0-4][0-9]{3}|9223372036854775[0-7][0-9]{2}|922337203685477580[0-7])$"
    },
    "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "attachment": {
      "type": "object",
      "required": ["id", "slot", "byteLength"],
      "properties": {
        "id": { "$ref": "#/$defs/opaque" },
        "slot": { "$ref": "#/$defs/slot" },
        "byteLength": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        }
      },
      "additionalProperties": false
    },
    "attachments": {
      "type": "array",
      "items": { "$ref": "#/$defs/attachment" },
      "maxItems": 1024
    },
    "limits": {
      "type": "object",
      "required": [
        "maxOutstandingRequests",
        "maxQueuedBytes",
        "maxRequestBytes",
        "maxResponseBytes",
        "defaultTimeoutMs",
        "maxTimeoutMs",
        "commitAckTimeoutMs"
      ],
      "properties": {
        "maxOutstandingRequests": {
          "type": "integer",
          "minimum": 1,
          "maximum": 65536
        },
        "maxQueuedBytes": {
          "type": "integer",
          "minimum": 1048576,
          "maximum": 9007199254740991
        },
        "maxRequestBytes": {
          "type": "integer",
          "minimum": 65536,
          "maximum": 9007199254740991
        },
        "maxResponseBytes": {
          "type": "integer",
          "minimum": 65536,
          "maximum": 9007199254740991
        },
        "defaultTimeoutMs": {
          "type": "integer",
          "minimum": 30000,
          "maximum": 9007199254740991
        },
        "maxTimeoutMs": {
          "type": "integer",
          "minimum": 30000,
          "maximum": 9007199254740991
        },
        "commitAckTimeoutMs": {
          "type": "integer",
          "minimum": 100,
          "maximum": 60000
        }
      },
      "additionalProperties": false
    },
    "adapterErrorCode": {
      "enum": [
        "adapter-closed",
        "invalid-argument",
        "invalid-sql-value",
        "unsupported-capability",
        "sql-error",
        "sql-function-error",
        "constraint",
        "busy",
        "locked",
        "cancelled",
        "deadline-exceeded",
        "resource-limit",
        "out-of-memory",
        "io-error",
        "corrupt",
        "not-a-database",
        "read-only",
        "permission-denied",
        "source-changed",
        "writer-unavailable",
        "publication-failed",
        "recovery-required",
        "asset-unavailable",
        "backpressure",
        "commit-outcome-unknown",
        "protocol-error",
        "transport-closed",
        "transport-fatal"
      ]
    },
    "adapterError": {
      "type": "object",
      "required": ["code", "message", "retryable", "fatal"],
      "properties": {
        "code": { "$ref": "#/$defs/adapterErrorCode" },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 4096,
          "pattern": "^[^\\u0000]+$"
        },
        "retryable": { "type": "boolean" },
        "fatal": { "type": "boolean" },
        "sqlitePrimaryCode": {
          "type": "integer",
          "minimum": 0,
          "maximum": 2147483647
        },
        "sqliteExtendedCode": {
          "type": "integer",
          "minimum": 0,
          "maximum": 2147483647
        },
        "details": true
      },
      "additionalProperties": false,
      "allOf": [
        {
          "if": {
            "required": ["code"],
            "properties": { "code": { "const": "commit-outcome-unknown" } }
          },
          "then": {
            "required": ["details"],
            "properties": {
              "retryable": { "const": false },
              "fatal": { "const": true },
              "details": { "$ref": "#/$defs/unknownCommitDetails" }
            }
          }
        }
      ]
    },
    "commitReconciliation": {
      "oneOf": [
        {
          "type": "object",
          "required": ["operation", "result"],
          "properties": {
            "operation": { "enum": ["mutateRows", "revertMutation"] },
            "result": {
              "type": "object",
              "required": [
                "fileId",
                "revision",
                "changed",
                "created",
                "affectedRows"
              ],
              "properties": {
                "fileId": { "$ref": "#/$defs/uuidv7" },
                "revision": { "$ref": "#/$defs/nonNegativeInt64" },
                "changed": { "const": true },
                "created": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["clientKey", "rowId"],
                    "properties": {
                      "clientKey": { "type": "string", "minLength": 1 },
                      "rowId": { "$ref": "#/$defs/uuidv7" }
                    },
                    "additionalProperties": false
                  }
                },
                "affectedRows": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["tableId", "rowId"],
                    "properties": {
                      "tableId": { "$ref": "#/$defs/uuidv7" },
                      "rowId": { "$ref": "#/$defs/uuidv7" }
                    },
                    "additionalProperties": false
                  },
                  "uniqueItems": true
                }
              },
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        },
        {
          "type": "object",
          "required": ["operation", "result"],
          "properties": {
            "operation": { "const": "mutateView" },
            "result": {
              "type": "object",
              "required": [
                "fileId",
                "revision",
                "changed",
                "createdViews",
                "affectedViewIds"
              ],
              "properties": {
                "fileId": { "$ref": "#/$defs/uuidv7" },
                "revision": { "$ref": "#/$defs/nonNegativeInt64" },
                "changed": { "const": true },
                "createdViews": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["clientKey", "viewId"],
                    "properties": {
                      "clientKey": { "type": "string", "minLength": 1 },
                      "viewId": { "$ref": "#/$defs/uuidv7" }
                    },
                    "additionalProperties": false
                  }
                },
                "affectedViewIds": {
                  "type": "array",
                  "items": { "$ref": "#/$defs/uuidv7" },
                  "uniqueItems": true
                }
              },
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        },
        {
          "type": "object",
          "required": ["operation", "result"],
          "properties": {
            "operation": { "const": "mutateSchema" },
            "result": {
              "type": "object",
              "required": [
                "fileId",
                "revision",
                "changed",
                "createdObjects",
                "affectedTableIds",
                "affectedFieldIds"
              ],
              "properties": {
                "fileId": { "$ref": "#/$defs/uuidv7" },
                "revision": { "$ref": "#/$defs/nonNegativeInt64" },
                "changed": { "const": true },
                "createdObjects": {
                  "type": "array",
                  "items": {
                    "oneOf": [
                      {
                        "type": "object",
                        "required": ["id", "object", "clientKey"],
                        "properties": {
                          "id": { "$ref": "#/$defs/uuidv7" },
                          "object": { "const": "table" },
                          "clientKey": { "type": "string", "minLength": 1 }
                        },
                        "additionalProperties": false
                      },
                      {
                        "type": "object",
                        "required": ["id", "object", "clientKey"],
                        "properties": {
                          "id": { "$ref": "#/$defs/uuidv7" },
                          "object": { "const": "field" },
                          "clientKey": { "type": "string", "minLength": 1 }
                        },
                        "additionalProperties": false
                      },
                      {
                        "type": "object",
                        "required": ["id", "object", "systemRole"],
                        "properties": {
                          "id": { "$ref": "#/$defs/uuidv7" },
                          "object": { "const": "field" },
                          "systemRole": {
                            "enum": ["row-id", "created-time", "updated-time"]
                          }
                        },
                        "additionalProperties": false
                      }
                    ]
                  }
                },
                "affectedTableIds": {
                  "type": "array",
                  "items": { "$ref": "#/$defs/uuidv7" },
                  "uniqueItems": true
                },
                "affectedFieldIds": {
                  "type": "array",
                  "items": { "$ref": "#/$defs/uuidv7" },
                  "uniqueItems": true
                }
              },
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        },
        {
          "type": "object",
          "required": ["operation", "result"],
          "properties": {
            "operation": { "const": "importCsv" },
            "result": {
              "type": "object",
              "required": [
                "fileId",
                "tableId",
                "revision",
                "changed",
                "createdRows"
              ],
              "properties": {
                "fileId": { "$ref": "#/$defs/uuidv7" },
                "tableId": { "$ref": "#/$defs/uuidv7" },
                "revision": { "$ref": "#/$defs/nonNegativeInt64" },
                "changed": { "const": true },
                "createdRows": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["recordIndex", "rowId"],
                    "properties": {
                      "recordIndex": { "$ref": "#/$defs/safeInteger" },
                      "rowId": { "$ref": "#/$defs/uuidv7" }
                    },
                    "additionalProperties": false
                  }
                }
              },
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        }
      ]
    },
    "commitReceipt": {
      "type": "object",
      "required": [
        "protocol",
        "version",
        "receiptID",
        "epoch",
        "sessionID",
        "workingID",
        "requestID",
        "sequence",
        "operation",
        "fileID",
        "baseRevision",
        "commitRevision",
        "requestDigest",
        "reconciliation"
      ],
      "properties": {
        "protocol": { "const": "eidos-commit-receipt" },
        "version": { "const": "1.0" },
        "receiptID": { "$ref": "#/$defs/opaque" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "workingID": { "$ref": "#/$defs/opaque" },
        "requestID": { "$ref": "#/$defs/requestID" },
        "sequence": { "$ref": "#/$defs/safeInteger" },
        "operation": { "$ref": "#/$defs/slot" },
        "fileID": { "$ref": "#/$defs/uuidv7" },
        "baseRevision": { "$ref": "#/$defs/nonNegativeInt64" },
        "commitRevision": { "$ref": "#/$defs/nonNegativeInt64" },
        "requestDigest": { "$ref": "#/$defs/sha256" },
        "reconciliation": { "$ref": "#/$defs/commitReconciliation" }
      },
      "additionalProperties": false
    },
    "unknownCommitDetails": {
      "type": "object",
      "required": ["commitReceipt"],
      "properties": {
        "commitReceipt": { "$ref": "#/$defs/commitReceipt" }
      },
      "additionalProperties": false
    },
    "runtimeErrorCode": {
      "enum": [
        "invalid-request",
        "unsupported",
        "not-found",
        "already-exists",
        "invalid-value",
        "invalid-query",
        "invalid-formula",
        "cycle",
        "constraint",
        "stale-revision",
        "conflict",
        "forbidden",
        "lossy-confirmation-required",
        "invalid-plan",
        "plan-expired",
        "resource-limit",
        "cancelled",
        "deadline-exceeded",
        "busy",
        "corrupt-file",
        "adapter-error",
        "closed",
        "fatal"
      ]
    },
    "runtimeError": {
      "type": "object",
      "required": ["code", "message", "retryable"],
      "properties": {
        "code": { "$ref": "#/$defs/runtimeErrorCode" },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 4096,
          "pattern": "^[^\\u0000]+$"
        },
        "retryable": { "type": "boolean" },
        "path": {
          "type": "string",
          "maxLength": 4096,
          "pattern": "^(?:/(?:[^~\\u0000]|~[01])*)*$"
        },
        "fileId": { "$ref": "#/$defs/uuidv7" },
        "tableId": { "$ref": "#/$defs/uuidv7" },
        "fieldId": { "$ref": "#/$defs/uuidv7" },
        "rowId": { "$ref": "#/$defs/uuidv7" },
        "currentRevision": { "$ref": "#/$defs/nonNegativeInt64" },
        "details": { "type": "object" }
      },
      "additionalProperties": false
    },
    "wireError": {
      "oneOf": [
        {
          "type": "object",
          "required": ["source", "error"],
          "properties": {
            "source": { "const": "adapter" },
            "error": { "$ref": "#/$defs/adapterError" }
          },
          "additionalProperties": false
        },
        {
          "type": "object",
          "required": ["source", "error"],
          "properties": {
            "source": { "const": "runtime" },
            "error": { "$ref": "#/$defs/runtimeError" }
          },
          "additionalProperties": false
        }
      ]
    },
    "hello": {
      "type": "object",
      "required": ["kind", "protocol", "versions"],
      "properties": {
        "kind": { "const": "hello" },
        "protocol": { "const": "eidos-adapter" },
        "versions": {
          "type": "array",
          "items": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+$" },
          "minItems": 1,
          "uniqueItems": true
        }
      },
      "additionalProperties": false
    },
    "helloError": {
      "type": "object",
      "required": ["kind", "protocol", "error"],
      "properties": {
        "kind": { "const": "hello-error" },
        "protocol": { "const": "eidos-adapter" },
        "error": { "$ref": "#/$defs/adapterError" }
      },
      "additionalProperties": false
    },
    "helloResult": {
      "type": "object",
      "required": [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "limits",
        "cancelMode"
      ],
      "properties": {
        "kind": { "const": "hello-result" },
        "protocol": { "const": "eidos-adapter" },
        "version": { "const": "1.0" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "limits": { "$ref": "#/$defs/limits" },
        "cancelMode": { "enum": ["interrupt", "terminate"] }
      },
      "additionalProperties": false
    },
    "request": {
      "type": "object",
      "required": [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "requestID",
        "sequence",
        "operation",
        "payload"
      ],
      "properties": {
        "kind": { "const": "request" },
        "protocol": { "const": "eidos-adapter" },
        "version": { "const": "1.0" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "requestID": { "$ref": "#/$defs/requestID" },
        "sequence": { "$ref": "#/$defs/safeInteger" },
        "timeoutMs": { "$ref": "#/$defs/safeInteger" },
        "operation": { "$ref": "#/$defs/slot" },
        "payload": true,
        "attachments": { "$ref": "#/$defs/attachments" }
      },
      "additionalProperties": false
    },
    "success": {
      "type": "object",
      "required": [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "requestID",
        "sequence",
        "ok",
        "result"
      ],
      "properties": {
        "kind": { "const": "response" },
        "protocol": { "const": "eidos-adapter" },
        "version": { "const": "1.0" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "requestID": { "$ref": "#/$defs/requestID" },
        "sequence": { "$ref": "#/$defs/safeInteger" },
        "ok": { "const": true },
        "result": true,
        "attachments": { "$ref": "#/$defs/attachments" }
      },
      "additionalProperties": false
    },
    "failure": {
      "type": "object",
      "required": [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "requestID",
        "sequence",
        "ok",
        "error"
      ],
      "properties": {
        "kind": { "const": "response" },
        "protocol": { "const": "eidos-adapter" },
        "version": { "const": "1.0" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "requestID": { "$ref": "#/$defs/requestID" },
        "sequence": { "$ref": "#/$defs/safeInteger" },
        "ok": { "const": false },
        "error": { "$ref": "#/$defs/wireError" }
      },
      "additionalProperties": false
    },
    "commitPrepared": {
      "type": "object",
      "required": [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "requestID",
        "sequence",
        "receipt"
      ],
      "properties": {
        "kind": { "const": "commit-prepared" },
        "protocol": { "const": "eidos-adapter" },
        "version": { "const": "1.0" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "requestID": { "$ref": "#/$defs/requestID" },
        "sequence": { "$ref": "#/$defs/safeInteger" },
        "receipt": { "$ref": "#/$defs/commitReceipt" }
      },
      "additionalProperties": false
    },
    "commitAck": {
      "type": "object",
      "required": [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "requestID",
        "sequence",
        "receiptID",
        "requestDigest"
      ],
      "properties": {
        "kind": { "const": "commit-ack" },
        "protocol": { "const": "eidos-adapter" },
        "version": { "const": "1.0" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "requestID": { "$ref": "#/$defs/requestID" },
        "sequence": { "$ref": "#/$defs/safeInteger" },
        "receiptID": { "$ref": "#/$defs/opaque" },
        "requestDigest": { "$ref": "#/$defs/sha256" }
      },
      "additionalProperties": false
    },
    "cancel": {
      "type": "object",
      "required": [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "requestID"
      ],
      "properties": {
        "kind": { "const": "cancel" },
        "protocol": { "const": "eidos-adapter" },
        "version": { "const": "1.0" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "requestID": { "$ref": "#/$defs/requestID" }
      },
      "additionalProperties": false
    },
    "close": {
      "type": "object",
      "required": [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "requestID"
      ],
      "properties": {
        "kind": { "const": "close" },
        "protocol": { "const": "eidos-adapter" },
        "version": { "const": "1.0" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "requestID": { "$ref": "#/$defs/requestID" },
        "timeoutMs": { "$ref": "#/$defs/safeInteger" }
      },
      "additionalProperties": false
    },
    "closeResult": {
      "type": "object",
      "required": [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "requestID"
      ],
      "properties": {
        "kind": { "const": "close-result" },
        "protocol": { "const": "eidos-adapter" },
        "version": { "const": "1.0" },
        "epoch": { "$ref": "#/$defs/opaque" },
        "sessionID": { "$ref": "#/$defs/opaque" },
        "requestID": { "$ref": "#/$defs/requestID" }
      },
      "additionalProperties": false
    }
  }
}
```

`hello-error.error` 是 unwrapped `AdapterError`。普通 failure 使用 tagged
`wireError`：`source:"runtime"` 携带 Runtime 精确 public `RuntimeError`，但不包括
`unknown-commit`；`source:"adapter"` 携带 Adapter/Transport boundary 产生的
`AdapterError`。可执行 Runtime code set 有意排除 `unknown-commit`：不可判定的
acknowledged COMMIT 以 Adapter `commit-outcome-unknown` 和 receipt 传输，不能伪造为
Runtime 自己报告的事实。Client facade 原样 unwrap Runtime error，并映射 Adapter
error：`busy`、`cancelled`、`deadline-exceeded`、`resource-limit` 保持同名，
`backpressure` 变为 Runtime `resource-limit`；`corrupt`/`not-a-database` 变为
`corrupt-file`；intentional close 变为 `closed`；其余可复用 failure 变为
`adapter-error`，fatal channel/session failure 变为 Runtime `fatal`。

Adapter `commit-outcome-unknown`，或 client 尝试 ack 后丢失 prepared mutation 的
final response，变为 Runtime `unknown-commit`，精确为 `retryable:false` 与
`details:{reconciliationRequired:true}`。Trusted Host facade 保留第 9.5.1 节 receipt；
RuntimeClient/UI error、Host state/event 与 log 都不得暴露 receipt 或 receipt token。
其他 mapped Adapter error 的 details 只能是 `{adapterCode,fatal}`。因此
RuntimeClient 总是以 Runtime error ABI reject，绝不把 Adapter error 塞进 success。

Transported Adapter/Runtime error `message` 含 1..4,096 个 Unicode scalar 且无
U+0000。Runtime error `path` 若存在，是最多 4,096 scalar、无 U+0000 的 RFC 6901
JSON Pointer；空字符串是合法 root pointer。JSON Schema `maxLength` 统计 code
point，Transport Unicode validation 还必须拒绝 unpaired surrogate。Binding 只可在
scalar boundary 缩短 diagnostic message，不得截断 code、path、ID、revision、
receipt 或 machine-readable detail；完整 envelope 仍须符合 `maxResponseBytes`。

### 9.4 Handshake 与默认值

Client 发送 `hello`；server 精确选择 `1.0`，或以 `hello-error` 与
`unsupported-capability` 失败。成功 result 创建 fresh epoch/session。默认值为 32 个
outstanding request、16 MiB queued payload、每 request 8 MiB、每 response 16 MiB、
30,000 ms request timeout、300,000 ms maximum timeout 与 5,000 ms commit-ack
timeout。Server 可在 executable schema 范围内声明不同值，
但至少支持 1 request、1 MiB queue、64 KiB request/response、30,000 ms timeout；
`maxTimeoutMs` 不得小于 `defaultTimeoutMs`；client 必须遵守。cancelMode 为
`interrupt` 或 `terminate`。
Large workflow 必须 split、内部 stream，或明确使用更大的 advertised timeout。

### 9.5 Request 顺序与关联

control 为 schema 中的 `cancel`、`close`、`close-result`。第一个 sequence 为 1，
随后每个 accepted ordinary request 严格 +1，最大 `9007199254740991`，wrap 前
新建 epoch。ordinary requestID 在 epoch 内唯一但无序。每个 Transport request ID
是 1..128 UTF-8 octet、无 U+0000 的 Unicode scalar string；JSON Schema
`maxLength` 统计 character 而不是 encoded octet，因此 decode 后还必须执行 UTF-8
octet bound。`cancel.requestID` 精确
重复 target ID 且不创建新 call；`close.requestID` 是新唯一 ID，由 close-result
echo。其他重复 ID、skip/reorder sequence、current epoch 内错误 session/version 为
`protocol-error`，不得执行 Runtime。非 current epoch message 直接 drop，不影响
当前 session。

Direct Runtime `RequestContext.requestId` 只需在 unresolved call 之间唯一。
Transported RuntimeClient facade 因而分配 epoch-unique Transport request ID，并
私有保存 result/cancel mapping；绝不把 reused application ID 直接用作 wire ID。
每个 ordinary call 先验证 Runtime context，再发送 `timeoutMs`，其值是 supplied
`deadlineMilliseconds`（若有）、negotiated Runtime `foregroundTimeMsMax` 与
Transport `maxTimeoutMs` 的最小值；Runtime deadline 缺省时使用
`foregroundTimeMsMax`。因此 composition 声明
`foregroundTimeMsMax <= maxTimeoutMs`。signal 在发送前已 aborted 则直接 reject；
之后 abort 遵守下文 cancel rule。

每 accepted client-facing call 必须 exactly-once settle。channel 健康时 server
发恰好一个 final wire response 并原样回显关联字段。`commit-prepared` 是 provisional
barrier message，不是 settlement 或第二 response。crash/terminate 无法 final wire
reply 时，client facade 把已 acknowledged prepared mutation settle 为 Runtime
`unknown-commit`，同时 Host 私有保留 receipt；其他 pending call settle 为 mapped
`transport-fatal`，并忽略随后旧 epoch reply。session 内 ordinary request 按 FIFO
start；后请求观察所有成功的前 mutation，前请求不能观察后
请求。mutation/publication transition 线性化。仅 Runtime 声明 snapshot-safe 且
同 revision 时可并行 read，response 仍按 sequence。cancel/close/fatal 可越过
queue，但不撤销 commit。不同 session 无序，但同 source 仍只能一个 logical writer。

### 9.5.1 Prepared-commit barrier 与 reconciliation

Transported canonical mutation 使用以下 trusted Runtime/Transport integration point；
它不是 public Runtime operation，UI 绝不直接取得：

```text
TransportCommitPreparation = {
  fileID: UUIDv7,
  baseRevision: NonNegativeInt64Decimal,
  commitRevision: NonNegativeInt64Decimal,
  reconciliation: CommitReconciliation
}

TransportCommitBarrier.prepare(preparation, context) -> Promise<void>
```

会改变 canonical state 的 operation 在 outer write transaction 内完成全部 SQL 与
invariant check，tentatively increment revision，构造 bounded reconciliation record，
并在 outer COMMIT 前、没有 active statement 时调用 `prepare`。`baseRevision` 是该
transaction 内比较的 revision；`commitRevision` 精确为 `baseRevision + 1`。
Reconciliation 是与 Eidos Runtime 同步的 `$defs.commitReconciliation` union，包含
canonical postcondition 与 epoch 丢失后 correlate/refetch 所需的全部 server-allocated
persistent ID；不得依赖 undo、cursor、plan 或其他 epoch-private token。Failure 与
canonical no-op 不调用 barrier。

Adapter 对以下精确 record 的 UTF-8 RFC 8785 JCS serialization 计算 lowercase
SHA-256 `requestDigest`：

```text
{
  protocol: "eidos-adapter",
  version: "1.0",
  epoch, sessionID, workingID, requestID, sequence,
  timeoutMs: <request timeoutMs or null>,
  operation, payload,
  attachments: [
    { id, slot, byteLength, sha256: <SHA-256 of the exact attachment bytes> },
    ... in request descriptor order
  ]
}
```

缺省 attachment array normalize 为 `[]`。在 Runtime execution 前完成 hash，并核对
carrier ownership/length。Adapter 绑定 Host-private working ID，分配 epoch-unique、
不可预测 `receiptID`，按 executable schema 创建 `commitReceipt`，发送一个
`commit-prepared`；其 outer correlation 精确等于 request 与 embedded receipt。
完整 provisional envelope 计入 `maxResponseBytes`；若超限，Adapter 必须 rollback，
以 final `resource-limit` 失败，不发送 partial receipt、不允许 COMMIT。发送前还必须
为携带同 receipt 的 final `commit-outcome-unknown` wrapper 预留 response budget；
provisional envelope、ordinary success 或 unknown wrapper 任一不能容纳，preparation
都在 ack 前失败。

Client 验证 envelope、correlation、receipt、private session `workingID`、request
digest、embedded reconciliation union、operation/result 对应与 revision transition；
必须先在 trusted facade state 中持久保留完整 receipt，才发送精确
`commit-ack`。无法保留到 final settlement/reconciliation 就不得 ack。Server 只
接受当前 prepared request 的一个 matching ack。已接受 ack 的 exact duplicate 是
幂等 no-op；最近已 timeout/cancel 且 known rollback 的 preparation 收到 exact late
ack 也丢弃。错误 receipt ID、digest、correlation，或与 current/just-accepted
preparation 无关的 ack，是 fatal `protocol-error`：commit authorization 前 rollback，
authorization 后 fatalize epoch，但不得虚称 rollback。

cross-record check 精确为：
`receipt.operation == request.operation == reconciliation.operation`；
`receipt.fileID == reconciliation.result.fileId`；
`receipt.commitRevision == reconciliation.result.revision`；且 int64
`commitRevision` 精确比 `baseRevision` 大一。失败是 pre-ack `protocol-error`，不得
授权 COMMIT。

Runtime 在 matching ack 被接受、`prepare` resolve 前不得执行 COMMIT。等待时间由
request remaining effective deadline 与 `commitAckTimeoutMs` 的较小值界定。Ack 前
expiry/cancel 必须 rollback；channel 存活时返回 `deadline-exceeded`/`cancelled`，且
不可能 commit。Ack 后 Runtime 只尝试一次 COMMIT：可知 COMMIT failure 时 rollback
并返回 owning structured failure；成功返回 ordinary success。若 Adapter 无法证明
commit 或 rollback，返回 wire Adapter `commit-outcome-unknown` 与该 receipt，把
Connection/session 标记 fatal，不再执行其他操作。Client 只有收到能证明 commit/
rollback 的 final result 后才丢弃 receipt。

每 session 最多一个 prepared mutation。Client 在收到该 mutation final response 前
不得发送 sequence 更后的 ordinary request；Server 在 barrier prepared 时不得启动
已排队的 later request。若 client 尝试 ack 后丢失 final response，它 invalidates
epoch、私有保留 receipt，并以 Runtime `unknown-commit` reject；绝不自动 replay。
Trusted composition 用新 Connection/Runtime epoch 重开并验证同一个 working
database，证明 receipt `workingID` 连续，并在一个 snapshot 读取 File ID/revision：

1. working ID/File ID 相同且 `revision == commitRevision`：在第 7.5 节 exclusive
   writer invariant 下证明 mutation committed；`reconciliation` 给出 persistent ID，
   caller refetch live projection；
2. working ID/File ID 相同且 `revision == baseRevision`：证明没有 commit；reopen 后
   可由 caller 明确发新 request；
3. working ID 不同/无法证明、File ID 不同、其他 revision 或 File 无法验证：不能把
   outcome 归因于 receipt；报告 conflict/fatal 并要求 explicit recovery，不得 replay。

一旦发现 unknown outcome，旧 session 即 fatal；除幂等 `close` 外，后续 public
call 都在本地以 Runtime `fatal` 失败，不发送 old-epoch message。Reconciliation
总使用新 epoch。Receipt 只证明 preparation 并允许 reconciliation，不证明 COMMIT；
不复活 epoch-private result member。Request digest 或 embedded reconciliation
validation 失败的 receipt 是 `protocol-error`，不是 retry token。

### 9.6 Structured clone 与 ownership

envelope/payload 只有 JSON 值：null、boolean、Unicode string、有限 binary64、
array、string-key record；无 cycle。function、DOM/native、prototype Error、handle、
statement、grant 禁止进 Runtime payload。搬运 platform grant 的 Host internal
channel 不属于此 Transport Profile，不经 RuntimeClient/HostServices 暴露，也不得复用
本协议名或声称其 message 符合 Adapter wire envelope。

transfer 后 ArrayBuffer 归 receiver，sender 视为 detached；无 transfer 时 copy。
SharedArrayBuffer optional。bytes 不得 alias SQLite/WASM/reused buffer。

### 9.7 Backpressure

为保证 portable accounting，一个 carrier 的 byte size 是其 envelope 按 RFC 8785
JCS serialization 后的 UTF-8 长度，加上所有 attachment `byteLength` 之和。Client
把 accepted 但尚无 final response 的 request 数与其 request-carrier size 计入
`maxQueuedBytes`；每个 request 还必须满足 `maxRequestBytes`，每个 response 必须满足
`maxResponseBytes`。Server 在执行前以 `backpressure` 拒绝 queue/request 超限，
禁止丢弃或无限 queue。Oversized result 在 partial response 前以 `resource-limit`
失败。Runtime paging 控制正常 result size；publication streaming 留在 Host
composition 内，绝不经过 RuntimeClient。

此 carrier accounting 与 Runtime semantic accounting 不同。CSV operation 在
Runtime `requestBytesMax`/`responseBytesMax` JCS accounting 中省略 logical `csv`
member 及其 key，并把 exact octet 只计入一次 `csvBytesMax`；Adapter 对实际 envelope
（含 attachment descriptor）与这些 octet 各按 carrier rule 计一次。Envelope/
descriptor byte 属 Adapter accounting，不得计入 Runtime payload-only JCS limit。

### 9.8 Cancel、deadline 与 terminate

cancel 以 epoch/session/request 定位。已 settle 或从未 accepted 的 current-session
request 被取消时幂等 no-op，不发第二 response。Queued target 移除并返回
`cancelled`。对 interrupt mode 中的 running target，Adapter 请求 Connection
interruption，并等待 Runtime settlement。只有已知 rollback 或没有 commit 时才返回
`cancelled`（或 `deadline-exceeded`）。若 commit 先线性化，ordinary successful
result 胜出。Prepared mutation valid ack 前 cancellation/expiry 强制 rollback，
不可能 commit；client 尝试 ack 后若丢失 final outcome，必须返回 Runtime
`unknown-commit` 并由 Host 保留 receipt，绝不能返回 `cancelled`、
`deadline-exceeded` 或裸 `transport-fatal`。Timeout 从 server accept
起算，含 queue/busy，用 monotonic clock，省略用 default，更短的 request/shutdown
deadline 控制。

Client facade 对 receipt retention/ack-attempt 与 cancel/deadline 做一个 atomic state
transition。Cancellation 先胜出时发送 cancel、永不 ack；ack-attempt 先胜出时不再为
该 request 发送 cancel，只等待 success、known failure 或 reconciliation。两种
control 不得在 channel 上竞争。

Terminate mode 取消 active SQL 时终止专用 Worker/process。Commit ack 前，
transaction recovery 保证 COMMIT 尚未开始；settlement channel 可用时 target 收到
cancellation/deadline，否则收到 mapped `transport-fatal`，且 reopen 前不得重试。
Ack 已尝试后，无论 termination、deadline 或 IPC loss 移除 final response，target
都收到 `unknown-commit` 且 Host 保留 receipt。其他 accepted request 全部以
`transport-fatal` 失败，epoch/session 失效。Host 在安全时保存 recovery，并在任何
retry 前以新 Connection/epoch reopen、reconcile。

### 9.9 Lifecycle

```text
new -> handshaking -> ready -> closing -> closed
                         |
                         `-> fatal
```

Transported `RuntimeClient.close(context)` 分配 epoch-unique close request ID；present
effective context duration 映射到 `timeoutMs`，并受 `maxTimeoutMs` 上限约束。Signal
在发送前已 cancelled 时以 `cancelled` reject 且 session 保持 open。Server 一旦接受
close，cancellation 不能撤销 cleanup，也不为 close ID 发送 cancel envelope。Timeout
只限制 graceful settlement，不限制资源释放：到期时 client invalidates epoch 并以
mapped `transport-fatal` settle 一次，server 仍继续 close/terminate isolated owner。
这就是 RuntimeClient close 有 context，而 wire close 没有 cancellable close
transaction 的原因。

Accepted close 停接收、取消 queue、保留已 commit mutation、settle/terminate
active、close Runtime/Connection、release snapshot/asset/lease；channel 存活则发
close-result，否则 client facade 以 `transport-fatal` exactly-once settle close。
API-level repeated close 安全。Malformed envelope、sequence 不可能、correlation
loss、crash、IPC loss 或 unknown commit outcome 均 fatal；旧 epoch message 不影响
新 session。

## 10. Error ABI

```text
AdapterError = {
  code: AdapterErrorCode,
  message: UnicodeString,
  retryable: Boolean,
  fatal: Boolean,
  sqlitePrimaryCode?: Integer,
  sqliteExtendedCode?: Integer,
  details?: JSONValue
}
```

每个 binding 中 message 都只用于诊断，包含 1..4,096 个 Unicode scalar 且无
U+0000，不得 parse。details 默认不含 SQL params/canonical cells/path/credential/
handle。SQLite 数字 code 必须为真实官方 primary/extended code。

| code                     | 含义                                                     |        默认 retryable |     默认 fatal |
| ------------------------ | -------------------------------------------------------- | --------------------: | -------------: |
| `adapter-closed`         | close 后调用                                             |                    no |            yes |
| `invalid-argument`       | port/binding 非法                                        |                    no |             no |
| `invalid-sql-value`      | tagged ABI 非法                                          |                    no |             no |
| `unsupported-capability` | 必需能力/probe 缺失                                      |                    no |    open 时 yes |
| `sql-error`              | 其他 SQLite prepare/step error                           |                    no |             no |
| `sql-function-error`     | scalar 失败                                              |                    no |             no |
| `constraint`             | SQLite constraint                                        |                    no |             no |
| `busy`                   | busy timeout/snapshot contention                         |                   yes |             no |
| `locked`                 | SQLite locked                                            |                   yes |             no |
| `cancelled`              | commit 前显式取消                                        |         caller choice |             no |
| `deadline-exceeded`      | deadline 到期                                            |         caller choice |             no |
| `resource-limit`         | 超声明 limit                                             | smaller request maybe |             no |
| `out-of-memory`          | allocation 失败                                          |                    no |          maybe |
| `io-error`               | storage/VFS I/O                                          |                 maybe |          maybe |
| `corrupt`                | corruption                                               |                    no |            yes |
| `not-a-database`         | 非 SQLite DB                                             |                    no |    open 时 yes |
| `read-only`              | 对只读 target 写                                         |                    no |             no |
| `permission-denied`      | 无 Host permission                                       |        user action 后 |             no |
| `source-changed`         | identity/content mismatch                                |            resolve 后 |             no |
| `writer-unavailable`     | lease 无法取得                                           |                   yes |             no |
| `publication-failed`     | candidate/publish verify 失败                            |                按原因 |          maybe |
| `recovery-required`      | destination 不安全、已留 recovery                        |           recovery 后 | 写 session yes |
| `asset-unavailable`      | asset 不可用                                             |                按原因 |             no |
| `backpressure`           | queue limit                                              |                   yes |             no |
| `commit-outcome-unknown` | acknowledged mutation 的 COMMIT 无法证明；receipt 已保留 |                    no |            yes |
| `protocol-error`         | Transport 状态非法                                       |                    no |            yes |
| `transport-closed`       | Transport 已关闭                                         |                    no |            yes |
| `transport-fatal`        | Worker/process/IPC 不可复用                              |             reopen 后 |            yes |

Browser/Desktop 保留 code、flags、SQLite codes、安全 details，不压成 exception
string。到 Runtime public error 的映射属于 Runtime。

表中“按原因/maybe”必须按统一规则落成 bool：仅当 Connection/session integrity、
rollback 或 publication outcome 不明时 `fatal=true`；仅当没有 effect 线性化，且
报告的外部条件消失后原请求可能成功时 `retryable=true`。cancel/deadline 默认
`retryable=false`；caller 可用新 request ID 发新请求。

## 11. Browser Profile

### 11.1 基线

`EA-Browser-1.0` 必须把 SQLite/WASM 与 Runtime 放在 Dedicated Worker，不在
Window event loop。Window 只有 Transport client 与 user-activation/permission
composition。prepare/step/transaction/validation/backup/export/大 hash 都在 Worker。

`memory-import-export` 基线接受 owned bytes，打开 private read-write working DB，
仅经 Transport 暴露 Runtime，产生 valid self-contained candidate，以 download 或
授权 destination Save Copy，recovery 在 WASM heap 外。source 可只读。

### 11.2 WASM 与 OPFS

WASM 跑全部 probe、int64 不进 unsafe Number、BLOB 脱离 linear memory、有
interrupt/terminate，报告 embedded SQLite version。heap trap 为 fatal crash。

optional `browser-opfs-working`：OPFS 是 Host-private working/recovery，不是
published source；handle/VFS/lock/origin metadata 不进 File。DB 留在 Dedicated
Worker，tested VFS、一个 lease；quota failure 为 limit/I/O，export 仍独立；按
source/session + File ID key，不仅 filename，按披露策略清理 orphan。

### 11.3 File System Access

optional `browser-file-system-access`：遵循 WICG 规范。Window 在 secure context/
user activation 下取得 handle 并变成 opaque Host grant；Runtime/UI 不得见 handle，
Worker 不自行 picker/prompt。覆盖前取 fresh bytes/token。无更强 UA 文档保证时
`FileSystemWritableFileStream` close 不可推定为 strong atomic CAS；
最高只能声明：

```text
casGuarantee = "cooperative"
atomicReplace = false
durability = "best-effort"
```

因此 write 前 recovery、close 后 digest 必需。无 writable handle 的 File 为
writeCurrent=false，仍可 saveCopy=true。SharedArrayBuffer 只是 optional optimization；
scope recovery、验证 port/epoch、revoke URLs/streams，permission/quota 失败不得
destructive fallback。

## 12. Desktop Profile

`EA-Desktop-1.0` 使用 native SQLite 3.45.0+，所有 blocking DB 在 Dedicated
Worker thread/helper process；renderer/main UI thread 禁止 prepare/step/checkpoint/
大 hash/等 lock。driver（包括 better-sqlite3）只是实现选择，必须经 port/probe。

authority 来自 trusted picker/scoped CLI/app grant；view 仅 opaque token。Host
校验 path/root/URI。Worker/process 拥有 Connection/statement/lease/temp；native
pointer/driver object 不跨 IPC。不能 interrupt 的 driver 用不会杀 UI/其他 session
的 terminate isolation。

filesystem 支持时 SHOULD：

```text
writerLease = "exclusive"
casGuarantee = "strong"
atomicReplace = true
durability = "durable"
```

要求 identity lock、lock 内 token check、同 filesystem temp、file flush、atomic
replace、可用时 directory flush。advisory lock 单独不足。OS/filesystem/network/
sandbox 不支持时降级并走 recovery；write/rename success 不等于 durable。

recovery/staging 用 restrictive private/scoped temp。启动先检查 incomplete marker。
只有证明 source 是 verified old/new 且无更新 recovery 才清理。watcher 只是 hint；
inode/file-ID/symlink/permission/delete change 均走 external-change。

## 13. Composition facade 映射

`EA-Host-1.0` 暴露以下规范性的高层 UI-facing composition binding。它由
PublicationPort、ConnectionPort、Runtime、Transport 与 trusted platform grant UI
实现，不是第二个 low-level port。Eidos UI 导入这个 binding，绝不能重新定义。

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
    request: { sourceToken: string; access: "read" | "readwrite" },
    context: RequestContext
  ): Promise<{
    sessionId: string
    runtime: RuntimeClient
    state: HostSessionState
  }>
  createSource(
    request: { destinationToken: string; title: string },
    context: RequestContext
  ): Promise<{
    sessionId: string
    runtime: RuntimeClient
    state: HostSessionState
  }>
  requestWritePermission(
    request: { sessionId: string },
    context: RequestContext
  ): Promise<HostSessionState>
  save(
    request: { sessionId: string },
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
    request: { sessionId: string },
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
    request: { sessionId: string },
    context: RequestContext
  ): Promise<HostRecoveryReport>
  restoreRecovery(
    request: { sessionId: string; recoveryToken: string },
    context: RequestContext
  ): Promise<HostRecoveryResult>
  discardRecovery(
    request: { sessionId: string; recoveryToken: string },
    context: RequestContext
  ): Promise<HostRecoveryResult>
  acquireAsset(
    request: { sessionId: string; sourceToken: string },
    context: RequestContext
  ): Promise<{ entry: FileEntry }>
  acquireRemoteAsset?(
    request: { sessionId: string; uri: string; name?: string },
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
  revision?: string
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
    revision: string
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

`RequestContext`、`RuntimeClient`、`CommitReconciliation`、`FileEntry` 与
`JsonObject` 从 Eidos Runtime 导入。`HostError.message` 采用第 9.3 节 1..4,096
scalar、无 U+0000 的 bound。每个 async method 都遵守 cancellation/deadline。
Facade 把 Adapter error 映射到有限 Host code
set，同时保留 cancellation、deadline、resource、I/O、conflict、recovery 与 fatal
区别。一个 method 精确返回一个 result/error。Publication replacement 开始后的
cancellation 遵守第 7.1 节 verified-outcome rule。

`HostServices.close` 在 context 已 cancelled 时不接受，session 保持 open。一旦接受，
第 9.9 节 cleanup 不可取消：即使 caller wait deadline 到期，Host 仍关闭 Transport/
Runtime/Connection 与 Publication session。收不到 clean ack 时返回 `fatal`，不能
声称 cleanup 被跳过。

`createSource` 解析 create-only destination expectation，打开空的 private writable
database，调用 `Runtime.create`，产生并验证 self-contained candidate，以 create-only
发布，并返回 `ready-clean`。File/object ID 由 Runtime 分配；Host 绝不分配。若在
verified publication 前失败，不得声称 source 已创建；destination outcome 不确定时
保留 recovery。

Open 前 negotiation 只报告 service-level operation availability。所有依赖具体
source/filesystem 的 permission、CAS、atomicity、durability、scheme 与 write value，
只出现在 `openSource`、`createSource` 或之后 state 返回的
`HostSessionState.capabilities` 中。Negotiated `HostLimits` 是 service maxima。每个
session state 都携带 effective limits；permission、storage 或 quota 改变时，state
event 原子替换它们。UI 根据 current state 安排工作大小；Host 在开始前报告
`resource-limit`。

`openSource` 返回的 `RuntimeClient` 报告 effective Runtime limits：composition 取
Runtime semantic limit 与 Transport `maxRequestBytes`、`maxResponseBytes`、
`maxTimeoutMs` 的最小值，并按需降低 page、projection、cell 与 foreground-time
limit。它使用第 9.7 节的 JCS 加 attachment accounting，绝不声明 active Transport
必然拒绝的 operation。

`saveCopy(adopt:"keep-current")` 返回 `adopted=false`、不返回 Runtime，并保持当前
source 的 dirty/clean state 不变。`adopt-copy` 返回 `adopted=true`、新的 Runtime
epoch，以及关闭旧 epoch 后 copy 的 `ready-clean` state。`resolveConflict` 仅对
`save-copy` 精确要求 `destinationToken` 与 `adopt`，其他 strategy 禁止两者。
`runtime` 恰好只在创建了新 epoch 时存在。

`canReconcileCommit` 对 Browser/Desktop 及所有返回 read-write Runtime 的 Host
service 都为 true。Direct binding 保留 Runtime 精确 direct reconciliation record，
而不是 Adapter receipt，但使用同一 working-ID/revision algorithm。为 false 时，
method 返回 `unsupported`，且该 read-only service 不会产生 `commit-unknown`。
Transported acknowledged mutation 丢失 final result（或 direct Runtime 等价 unknown
outcome）时，composition 原子地在 Host session 下保留 receipt/direct record，把
phase 改为 `commit-unknown`，永久 invalidates 旧 RuntimeClient；只发 stable Host
error `unknown-commit`、`retryable=false`。Receipt bytes/ID 绝不出现在 Host state 或
event。该 state 可保留已知 `fileId`，但必须省略 `revision`，因为此时不能声称 base
或 commit revision。

`reconcileCommit` 只在 `commit-unknown` 接受。Host 用 private receipt/direct record
重开同一 exclusive working store 并证明相同 `workingID`，安全创建新 Connection/
Runtime epoch，验证 File，再执行第 9.5.1 节 File ID/revision algorithm；Host
`sessionId` 保持，Runtime epoch 改变。Result presence 精确为：

- `committed`：`runtime` 与 `reconciliation` 都存在；后者是已验证 Runtime
  `CommitReconciliation`，包含全部 persistent ID mapping；
- `rolled-back`：`runtime` 存在，`reconciliation` 不存在；
- `conflict`：两者都不存在；state phase 为 `conflict`，Host 保留 working store/
  recovery，在 state 返回 opaque `conflictToken`，要求现有 conflict/recovery flow
  显式处理。

对 committed/rolled-back，只有 reconciled working revision 等于 published baseline
时 state 才是 `ready-clean`，否则是 `ready-dirty`。UI 原子替换旧 RuntimeClient，并
refetch snapshot/schema/visible rows。Rolled-back 允许 refresh 后明确发新 mutation，
任何 layer 都不得自动重试。Missing receipt、错误 phase、把 working-ID discontinuity
冒充 success，或 receipt/schema mismatch，是 `invalid-request`/`fatal`，绝不猜测。
Decision 前 cancellation/deadline 会关闭 provisional new epoch、保留 private receipt
与 `commit-unknown` phase，可安全重试 reconciliation；decided result 已构造后由该
result 胜出。

Asset entry ID 由 Runtime 使用注入的 UUIDv7 input 分配；Host 负责 stage/resolve
bytes，但不创造 canonical ID。返回 entry 是 logical candidate value，只有通过
Runtime row mutation 才成为 canonical。

必需 action 按下表 delegation：

| Composition action       | Adapter/Runtime delegation                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `negotiate`              | source-independent EA-Host service capabilities 与 maxima；尚无 source/Transport session                                                                                  |
| `openSource`             | resolve opaque grant；PublicationPort open/read；通过 SourceSnapshot import，并在 `finally` 中 `release`；创建 Connection/Runtime/Transport session                       |
| `createSource`           | resolve create-only grant；Runtime 创建/验证 File；PublicationPort 发布；返回新 session                                                                                   |
| `requestWritePermission` | trusted user-activation layer 刷新 opaque grant；PublicationPort 观察结果                                                                                                 |
| `save`                   | Runtime `createPublicationSnapshot({maxBytes:candidateBytesMax},context)`；对该 frozen source validate/hash；PublicationPort `publish`；最后在 `finally` release snapshot |
| `saveCopy`               | 同一 frozen-candidate/`finally release` boundary；PublicationPort `saveCopy`；显式 keep/adopt 决定是否打开新 Runtime epoch                                                |
| `reconcileCommit`        | Host-private receipt/direct record + same-working-ID reopen；File ID/revision 判定 committed/rolled-back/conflict；只在 outcome decided 时返回 replacement Runtime        |
| `resolveConflict`        | reload/discard 与 Save Copy 是 Host flow；`merge` 完全 delegate 给 Runtime/product                                                                                        |
| `listRecovery`           | PublicationPort `listRecovery`                                                                                                                                            |
| `restoreRecovery`        | PublicationPort read、File validate，再创建新 Connection/Runtime epoch                                                                                                    |
| `discardRecovery`        | 显式 intent 后调用 PublicationPort `discardRecovery`                                                                                                                      |
| `acquireAsset`           | composition 解析 UI `sourceToken`；PublicationPort 取得 `import` lease；Runtime 分配 File-entry ID，product 返回 candidate value                                          |
| `acquireRemoteAsset`     | optional composition 在 asset limit 内授权并检查显式 HTTPS source；Runtime 分配 File-entry ID；返回 original URI 与 verified metadata                                     |
| `resolveAsset`           | composition 把 Runtime File-entry ID 解析为 canonical URI；PublicationPort 取得 `read` lease 并解析 bytes/descriptor                                                      |
| `releaseAsset`           | PublicationPort `releaseAsset`                                                                                                                                            |
| `close`                  | 关闭 Transport（它是 Runtime 再 Connection 的唯一 closer），然后关闭 Publication session；绝不重复 close 任一 component                                                   |
| `subscribe`              | composition 发出 derived Host state/capability event；不含 native object 或 bytes                                                                                         |

Facade 返回 opaque session、conflict、recovery、source、asset token 与 Runtime
client；绝不返回 path、handle、SQLite connection、SQL、PublicationPort 或 raw write
primitive。UI-specific action availability 与 presentation 仍属于 Eidos UI。

## 14. Limits 与资源

不存在隐藏的 mandatory limit name。`ConnectionCapabilities` 声明 SQL/value/
variable/result/busy limit 与必需 snapshot support；每个 snapshot 收到由
`candidateBytesMax` 派生的 int64 `maxBytes`。Transport hello 声明 outstanding、
queue、request、response、ordinary-time 与 commit-ack limit；`PublicationLimits` 声明 source/candidate/recovery/asset
quota 与 retention；`HostLimits` 从这些值再派生 `concurrentSessionsMax`。声明绝不
超过 effective SQLite/VFS/platform limit。Limit failure 必须在 partial publication
前发生，并返回 `resource-limit`。

Mutation sequencing 禁止 later request，因此每 session 最多一个 unresolved commit
receipt。其 JCS bytes 已符合 `maxResponseBytes`；decided reconciliation 或 session
close 后 Host 释放它。这不是未声明的 unbounded ledger。

Runtime 拥有 page size 与 semantic complexity；Adapter 拥有 memory、SQL、message、
byte、file、time enforcement。Adapter 不得为了适应限制而静默修改 Runtime query；
它必须拒绝，让 Runtime chunk/report。Close 释放 statement、buffer、object URL、
port、handle、lock、安全 temp file 与 asset lease；recovery 遵循独立 retention。

## 15. 一致性测试

### 15.1 Connection transcripts

Connection transcripts 覆盖 probes；五 storage classes 与边界；bad int64/NaN/
invalid UTF-8/alias BLOB；duplicate/empty/non-ASCII columns；binding `typeof`；run/
runMany；read-DEFERRED snapshot/只读 enforcement、write-IMMEDIATE、savepoint、
拒绝 read→write escalation、rollback；scalar；own/other/reopen data-version；busy；
cancel/deadline；close；secure public surface；还必须覆盖已建立 outer-read snapshot
后的 streaming ConnectionSnapshot、concurrent writer 不进入 image、WAL 变成独立
main、offset/EOF read、在 unbounded backing growth 前拒绝 int64 `maxBytes`、release
与 close cleanup。
还必须覆盖 deterministic wall/monotonic/entropy 注入，以及 in-process cancel 与
Transport cancel 等价。

### 15.2 Host fault transcripts

Host fault injection 覆盖 lease 前后 source change、permission/lease、active mutation、
checkpoint/backup、validator、short/disk/quota/flush/close/replace/digest、crash 每个
边界、Save Copy、rename/replacement/symlink/delete/restore、clean reload/dirty
conflict、recovery、asset security，包括 missing relative root、unauthorized network、
canonical/invalid Data URL、media-type/decoded-size mismatch、limit/staging/release。每次
断言 source bytes、candidate/recovery、state、
descriptor/token、logical revision、sidecar，而非只看 exception。

还必须断言每 PublicationSession 最多一个 live SourceSnapshot、immutable token-
consistent read、import/validation failure 也在 `finally` release、release 后 reject、
repeated release 与 session-close cleanup；并覆盖 publication active 时 frozen
snapshot 后新 mutation 返回 `busy`。

### 15.3 Transport transcripts

Transport Browser/Desktop 用同一 transcript：handshake/schema、epoch/session、ID/
sequence、FIFO/linearization、replay/reorder、attachments/ownership/no alias、error
fidelity、limits、cancel/interrupt/terminate/deadline/busy；所有五个
CommitReconciliation operation tag 的 prepared receipt size/schema/digest 与
server-assigned ID；prepared 前、ack 前、ack 后、COMMIT 中、COMMIT 后 final response
前的 loss；base/commit/other revision reconciliation；receipt-gated retry；fatal
subsequent call；crash/stale epoch/reopen/context-bearing close。Host composition 还
覆盖 private receipt 不泄露、`commit-unknown` action gating、same-working-ID proof、
三种 `reconcileCommit` outcome、replacement Runtime handoff、server-assigned ID
recovery 与 explicit post-rollback retry。

### 15.4 Cross-platform golden vectors

cross-platform golden vectors 要求相同 ordered tagged Connection value、Runtime
typed result/public error、revision postcondition、相同 canonical state、等价 Adapter
error/state、recovery File ID/revision/state。SQLite page bytes 不必相同，除非 vector
明确要求。报告记录 Adapter/profile/capability、SQLite version/source ID、platform/
VFS、corpus 与 optional skips；required 不可 skip。

## 16. 安全与隐私

File/Transport 全按 untrusted 处理：UI/extension 外隔离 SQL/native；参数化 value；
关闭 extension/trusted schema；限制 engine/memory/byte/statement/time/queue；interrupt/
isolate DoS；覆盖前验 identity/content；non-atomic destructive write 前 recovery；
默认不日志化 content/binding/path/grant/credential；最小授权并释放 asset；发布后验
bytes；fatal connection 必须替换；Host-private state 永不进入 canonical `.eidos`。
Working ID 与 commit receipt 必须留在 trusted Host/Transport composition 内，绝不
进入 UI、extension、telemetry 或 canonical state。

## 17. 设计理由（资料性）

tag 防 int64 截断、保留 REAL `1.0` 与 INTEGER 区别、可验 BLOB ownership；有序
row array 保留重复列。IMMEDIATE 在 partial mutation 前暴露 contention；savepoint
提供嵌套 rollback 而非虚假独立 commit。

logical revision、data-version、content token 分别回答 canonical meaning、cache
invalidation、source CAS；混用会 lost update/false conflict。浏览器与桌面的存储
保证确实不同，因此要求语义一致与诚实 capabilities，而不是假装 browser stream
等于 atomic rename。

## 18. 规范性参考

- [Eidos File Format 1.0](./eidos-file-1.0.md)
- [Eidos Runtime 1.0](./eidos-runtime-1.0.md)
- [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)
- [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)
- [RFC 6901: JavaScript Object Notation Pointer](https://www.rfc-editor.org/rfc/rfc6901)
- [RFC 8785: JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785)
- [JSON Schema 2020-12 Core](https://json-schema.org/draft/2020-12/json-schema-core)
- [JSON Schema 2020-12 Validation](https://json-schema.org/draft/2020-12/json-schema-validation)
- [NIST FIPS 180-4](https://doi.org/10.6028/NIST.FIPS.180-4)
- [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562)
- [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986)
- [RFC 2397：`data` URL scheme](https://www.rfc-editor.org/rfc/rfc2397)
- [RFC 4648：Base-N encodings](https://www.rfc-editor.org/rfc/rfc4648)
- [SQLite 3.45.0 release history](https://www.sqlite.org/changes.html#version_3_45_0)
- [SQLite transactions](https://www.sqlite.org/lang_transaction.html)
- [SQLite savepoints](https://www.sqlite.org/lang_savepoint.html)
- [SQLite value binding](https://www.sqlite.org/c3ref/bind_blob.html)
- [SQLite result values](https://www.sqlite.org/c3ref/column_blob.html)
- [SQLite result column names](https://www.sqlite.org/c3ref/column_name.html)
- [SQLite statement read-only detection](https://www.sqlite.org/c3ref/stmt_readonly.html)
- [SQLite application-defined functions](https://www.sqlite.org/c3ref/create_function.html)
- [SQLite data_version](https://www.sqlite.org/pragma.html#pragma_data_version)
- [SQLite interrupt](https://www.sqlite.org/c3ref/interrupt.html)
- [SQLite defensive mode](https://www.sqlite.org/c3ref/c_dbconfig_defensive.html)
- [SQLite result codes](https://www.sqlite.org/rescode.html)
- [SQLite WAL](https://www.sqlite.org/wal.html)
- [SQLite Online Backup API](https://www.sqlite.org/backup.html)
- [SQLite serialization](https://www.sqlite.org/c3ref/serialize.html)
- [WHATWG Web Workers](https://html.spec.whatwg.org/multipage/workers.html)
- [WHATWG structured clone](https://html.spec.whatwg.org/multipage/structured-data.html#safe-passing-of-structured-data)
- [WHATWG File System Standard](https://fs.spec.whatwg.org/)
- [WICG File System Access](https://wicg.github.io/file-system-access/)
- [W3C Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/)
