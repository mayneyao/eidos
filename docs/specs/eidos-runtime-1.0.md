# Eidos Runtime 1.0

Status: Final open specification  
Version: 1.0  
Published: 2026-07-21  
Canonical language: English

## Abstract

Eidos Runtime is the platform-independent logical engine for an
[Eidos File Format 1.0](./eidos-file-1.0.md) database. It turns canonical
SQLite state into stable-ID schema descriptors, typed values, set-based
queries, derived Fields, atomic mutations, conversion plans, validation
reports, and revision events. A conforming implementation can therefore power
a CLI, server, browser Worker, Desktop process, or another editor without
depending on Eidos product source code.

Runtime never opens a pathname, owns a native file handle, requests user
permission, publishes file bytes, or defines presentation behavior. Those
responsibilities belong to [Eidos Adapter 1.0](./eidos-adapter-1.0.md) and
[Eidos UI 1.0](./eidos-ui-1.0.md). Runtime receives an already opened
`ConnectionPort` plus explicit clock, entropy, and cancellation inputs.

## Status of This Document

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and
**OPTIONAL** are to be interpreted as described by BCP 14 when, and only when,
they appear in all capitals.

English is normative. The Chinese document is informative. Examples are
informative unless introduced as an exact shape, algorithm, grammar, schema,
truth table, or conformance vector.

## 1. Position, Scope, and Conformance

The dependency boundary is:

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

Runtime owns:

- logical Field types and lossless public value bindings;
- Reference Policy enforcement above raw storage;
- Relation resolution, Formula parsing/evaluation, and Lookup evaluation;
- filtering, searching, sorting, keyset paging, grouping, and aggregation;
- row, View, and schema mutation semantics;
- conversion classification and exact conversion algorithms;
- optimistic revision concurrency, generated dependency state, and errors;
- semantic validation and Runtime conformance tests.

Runtime does not own:

- SQLite container identity, metadata DDL, physical-name rules, or canonical
  raw encodings, which belong to File Format;
- path/handle access, driver ABI, locks, publication, recovery, assets,
  Worker/process transport, or durability, which belong to Adapter;
- layout meaning, input controls, optimistic presentation, accessibility, or
  renderer isolation, which belong to UI.

Conformance profiles are:

- **ER-Reader-1.0**: open an EF-Reader-valid file; expose schema, logical
  values, query, Relation, Formula, Lookup, aggregate/group, and validation
  behavior in this specification.
- **ER-Writer-1.0**: ER-Reader plus canonical row, View, and schema mutations,
  conversion, revision postconditions, and rollback behavior. It requires an
  `EF-Writer-1.0` storage implementation.

An implementation MUST publish each supported label separately. ER-Writer
implies ER-Reader. Neither implies an Adapter or UI profile.

## 2. Terminology and Global Invariants

- **Canonical state**: state persisted by Eidos File Format.
- **Logical value**: Runtime's lossless typed interpretation of one canonical
  raw value or one evaluated virtual Field.
- **Generated state**: ASTs, dependency edges, compiled SQL, cursors, indexes,
  statistics, resolved labels, and caches derivable from canonical state.
- **Runtime instance**: one logical engine bound to one File ID and one open
  `ConnectionPort` epoch.
- **Revision**: the non-negative signed int64 in `eidos__meta.revision`, bound
  as a canonical decimal string at the public boundary.
- **Request**: one public operation plus its `RequestContext`.
- **Actual change**: a committed difference in canonical state. Rewriting an
  equal canonical value is not an actual change.
- **Plan**: a generated, opaque, revision-bound schema preflight result.

A Runtime-generated cursor, plan token, or undo token is 1..256 ASCII octets
matching `[A-Za-z0-9._~-]+`. Its spelling has no semantics and clients compare
or return it only as directed. A caller request ID is 1..128 UTF-8 octets,
contains no U+0000, and is otherwise opaque. These fixed bounds participate in
request/response accounting; an `evictedUndoTokens` array is additionally
bounded by `undoEntriesMax` and `responseBytesMax`.

The File Format Reference Policy governs unchanged. Runtime applies that
owner-defined policy as follows:

| Reference       | Runtime use                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------ |
| stable ID       | every public structural reference, row identity, dependency, cursor binding, and mutation target |
| display `name`  | descriptors, Formula human source, CSV headers, diagnostics                                      |
| `physical_name` | private SQL compilation only; never a public value                                               |

Runtime MUST NOT expose `physical_name`, quoted SQL, SQLite `rowid`, compiled
Formula SQL, AST nodes, paths, handles, or Adapter tokens through its public
service. It resolves every stable ID through canonical metadata, quotes the
current physical name privately, and binds all values.

There is one canonical raw value for a user cell. Runtime MUST NOT materialize
Formula, Lookup, inverse Relation, label, normalized shadow, or second-ID
columns in the file. A generated cache or reverse index is disposable and
MUST NOT change observable results.

## 3. Runtime Construction, Ports, and Lifecycle

### 3.1 Factory boundary

The embedding factory has exactly two logical operations:

```text
Runtime.open(connection, environment, mode, context) -> Promise<RuntimeBinding>
Runtime.create(connection, environment, createInput, context) -> Promise<RuntimeBinding>
```

`connection` is an Adapter `ConnectionPort`, never a path or native object.
`environment` has this exact trusted shape:

```ts
interface RuntimeEnvironment {
  clock: ClockPort
  entropy: EntropyPort
  transportCommitBarrier?: TransportCommitBarrier
}
```

`clock.nowInstant()` supplies wall time, `clock.nowMilliseconds()` supplies
monotonic time, and `entropy.randomBytes(length)` supplies owned secure bytes.
`transportCommitBarrier` is present exactly when this binding is served through
the Adapter Transport prepared-commit profile; it is absent from direct
bindings and is never exposed through `RuntimeClient`. Each request also
receives exactly one Adapter `CancellationPort` specified by Eidos Adapter
1.0. The public binding accepts `RequestContext.signal`; composition adapts
that signal, explicit `cancel`, effective deadline, and Transport termination
into the one CancellationPort passed to Runtime/Connection work. The two
shapes are not exposed as competing cancellation APIs. `context` on the
factory operations is `RuntimeFactoryContext`; `mode` is `read` or
`readwrite`. `createInput` is:

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

The trusted composition also receives this narrow Host bridge; it is not part
of `RuntimeClient` and is never given to UI or renderers:

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

Only `service` is wrapped as `RuntimeClient` or exposed to application code;
`hostBridge` remains inside trusted Adapter/product composition. The bridge
validates metadata/URI/size, rejects extension keys that collide
with `id`, `name`, `mediaType`, `size`, or `uri`, allocates the UUIDv7 ID, and
returns an inert logical candidate. It performs no row mutation. Host calls it
only after staging/authorizing the asset; canonical state changes only when a
client later submits that exact entry through `mutateRows`.

`createPublicationSnapshot` is the sole Host save boundary. Runtime admits it
through the same serialized request queue, waits for every earlier operation
to settle, and prevents later operations from starting until Adapter has
finished the independent frozen image and the outer read transaction ends. In
that transaction Runtime first reads File ID/revision to establish the SQLite
snapshot, finishes the statement, then invokes `ConnectionPort.snapshot` with
an Adapter `SnapshotContext` whose `maxBytes` is the request value and whose
CancellationPort/deadline are adapted from the public context. The returned
`ByteSource` therefore describes that exact committed identity/revision and
remains immutable independently of later Runtime work.

`maxBytes` is canonical non-negative int64 decimal and MUST be no greater than
the current Host `candidateBytesMax`; Adapter enforces it while producing the
streaming snapshot. Runtime returns the ConnectionSnapshot's idempotent
`release` with the source. Host streams it to hashing/File validation and
publication, then MUST call `release` in a `finally` path; Runtime releases it
itself if failure occurs before handing it to Host. This operation changes no
canonical state and grants no publication authority. Host MUST publish those
exact bytes under the returned identity/revision or fail; it cannot substitute
a later connection image. This bridge is available in read and readwrite
bindings.

`create` requires an empty writable database. In one Adapter write transaction
it executes the schema statements from the exact File Format DDL (the Adapter
transaction supplies the outer `BEGIN IMMEDIATE`/`COMMIT`), inserts the
singleton meta row, then validates identity and structure before commit. It
does not nest the DDL's displayed transaction markers. Adapter's normal
"validate before canonical write" bootstrap rule has this sole empty-create
exception; validation still occurs before publication or return. It creates no
default Table. Supplying an ID or time is a trusted embedding import/replay
operation; Runtime validates it exactly and MUST NOT silently repair it.
Ordinary product creation omits both.

`open` requires a ConnectionPort whose Adapter has already completed secure
bootstrap and mandatory probes; Runtime verifies the reported capabilities
and then performs File identity validation before returning a service. A readwrite service additionally verifies the
structural preconditions required by EF-Writer. It MUST fail rather than write
repair state during open.

Both factory operations settle exactly once. A factory
`deadlineMilliseconds`, when present, is the same positive JSON safe-integer
duration `1..9007199254740991`, measured from factory acceptance on the
monotonic clock; another value rejects with `invalid-request`. They apply the factory deadline
and CancellationPort before any work and at the same safe points as an
ordinary request, and reject only with the Section 4.3 `RuntimeError` shape.
`create` failure rolls back its outer transaction; if
Adapter cannot prove rollback, the factory returns `fatal`. No binding is
returned on failure and Runtime permanently stops using the borrowed port.
The composition owner, which supplied the port, closes it after any factory
failure; Runtime never closes it behind the owner's back.

### 3.2 Port use

Runtime uses Adapter transactions as follows:

- an outer read transaction is `BEGIN DEFERRED` and MUST issue no writes;
- an outer write transaction is `BEGIN IMMEDIATE`;
- nested work uses savepoints and inherits its outer mode;
- read-to-write escalation is forbidden;
- Runtime never sends transaction-control SQL through ordinary statement
  operations.

One operation receives one cancellation input. Runtime checks it before
planning, between bounded batches, before acquiring a write transaction, and
immediately before the commit point. Adapter interruption may abort SQL.
Cancellation before commit rolls back. Cancellation racing with or following
commit returns `unknown-commit` unless the implementation can prove the
result; a caller reconciles by the exact Section 4.3 details. Any
`unknown-commit` permanently transitions that Runtime epoch to `fatal`; only
`close` is then accepted.

`clock.nowInstant()` supplies canonical millisecond UTC instants. It is used for
canonical timestamps and UUIDv7 time. The monotonic clock is used only for
deadlines and elapsed budgets through `clock.nowMilliseconds()` and is never
persisted. Entropy supplies owned,
cryptographically secure bytes. Runtime MUST NOT call ambient platform time,
locale, timezone, or randomness APIs.

### 3.3 UUIDv7 allocation

Runtime owns canonical ID allocation; Adapter supplies only clock and entropy.
An ordinary public create operation permits Runtime to allocate IDs. Explicit
caller IDs are accepted only in a request marked for import/replay and receive
the same validation and uniqueness checks.

Within one Runtime instance, allocated UUIDv7 values MUST be strictly
increasing under `BINARY` order. The generator:

1. parses the wall-clock instant to its signed Unix millisecond value;
2. uses `max(clockMillisecond,lastEmittedMillisecond)` as the 48-bit unsigned
   UUID timestamp when a prior value exists, or `clockMillisecond` on the
   first allocation;
3. for a new later millisecond, fills the 74 non-version/non-variant payload
   bits from secure entropy;
4. for the same or a backward millisecond, increments the prior 74-bit payload
   as one unsigned big-endian integer;
5. sets version `7`, variant `10`, and serializes the lowercase hyphenated
   36-character representation.

On the first allocation, a clock value outside unsigned 48-bit Unix
milliseconds cannot be encoded and returns `resource-limit` before canonical
work; after a prior allocation, a backward pre-epoch value is handled by the
same clamp as any other backward clock. Payload overflow waits for a later
representable wall millisecond subject to the request deadline, otherwise
returns `resource-limit`. The timestamp used for ordinary
created/updated fields remains the actual wall-clock instant; only ID
monotonicity is clamped. A conformance harness injects fixed time and entropy.

### 3.4 Lifecycle

```text
opening -> open -> closing -> closed
             |
             +-------> fatal
```

`close` is idempotent. It rejects new requests, cancels or settles queued
requests, rolls back active work where outcome is known, releases all
generated state, and permanently stops using its borrowed ConnectionPort. The
Adapter/composition owner closes that port after Runtime close. Only `close`
works after `closed` or `fatal`. Corruption, failed rollback, an invalid
driver result, or an unknowable internal invariant is fatal; ordinary invalid
input, stale revision, busy, deadline, and cancellation are not.

## 4. Public Service, Negotiation, and Errors

### 4.1 Request context

Every asynchronous binding preserves this language-neutral context:

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

The Transport may add session, epoch, and sequence fields; they are Adapter
state, not Runtime semantics. A settled request ID MAY be reused by a direct
binding, but a Transport profile MAY require epoch-wide uniqueness.
`requestId` obeys the fixed `1..128` UTF-8-octet/no-NUL rule in Section 2;
`deadlineMilliseconds`, when present, is in `1..9007199254740991`. Invalid
context is `invalid-request` before queue admission. Context is excluded from
`requestBytesMax` only because these members have fixed independent bounds;
the CancellationSignal is a control handle, not payload data.
At acceptance, Runtime starts one monotonic budget equal to
`min(deadlineMilliseconds,foregroundTimeMsMax)`, or
`foregroundTimeMsMax` when the request omits a deadline. Expiry returns
`deadline-exceeded` subject to the commit-race rule in Section 3.2. The budget
includes queue, busy wait, `getSnapshot` minimum-revision wait, planning, SQL,
and result encoding; no operation has an unbounded foreground wait.

### 4.2 Capabilities and limits

`negotiate({protocol:"eidos-runtime",versions:["1.0"]})` returns version 1.0
or `unsupported`. It returns every member below; no member is omitted.

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
  jsonCellBytesMax: number
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

Every limit is a JSON safe integer in `1..2147483647` and is enforced before
partial output or mutation. An implementation MAY advertise less than the
File Format hard limit. ER-Reader requires `readRows`, `schemaPaging`, `cursorPaging`,
`aggregate`, `groupRows`, `validate`, and Formula/Lookup evaluation even when
`formulaPreview=false`. ER-Writer additionally requires `mutateRows`,
`mutateView`, `schemaPreflight`, and `mutateSchema`. `mutationUndo`, `events`,
`formulaPreview`, `csvExport`, and `csvImport` describe optional public
operations. A read-only binding reports `mutateRows=false`,
`mutationUndo=false`, `mutateView=false`, `mutateSchema=false`, and
`csvImport=false`.

Capability dependencies are exact: `cursorPaging`, `aggregate`,
`groupRows`, and `csvExport` each require `readRows`; `groupRows` additionally
requires `cursorPaging`; `mutationUndo` and `csvImport` each require
`mutateRows`; and `mutateSchema` requires `schemaPreflight`. A true capability
with a false prerequisite is a protocol error. Every non-optional
`RuntimeClient` method remains present: when its capability is false it rejects
with `unsupported` before doing work. `getSnapshot`, `cancel`, and `close`
have no capability bit and are always available while lifecycle permits them.

Unknown future capability or limit members are ignored. A missing 1.0 member,
wrong type, zero limit, or contradictory capability is a protocol error.
Every input and output `LogicalValue` fits `logicalValueBytesMax`, and every
successful result fits `responseBytesMax`; Runtime returns `resource-limit`
before emitting a partial result otherwise. `jsonCellBytesMax` additionally
bounds the UTF-8 bytes inside the JCS-text string of a JSON Field.

Limit accounting is exact:

| Limit                                 | Count                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `requestBytesMax`                     | UTF-8 bytes of RFC 8785 JCS for the Runtime operation payload after omitting every nominal `OwnedBytes` member, excluding any Adapter envelope |
| `responseBytesMax`                    | UTF-8 bytes of JCS for one successful Runtime result after omitting every nominal `OwnedBytes` member, excluding any Adapter envelope          |
| `schemaPageSizeMax`                   | `SchemaPage.objects.length`, or `SchemaDependencyPage.dependencies.length`                                                                     |
| `pageSizeMax`                         | returned `ProjectedRow` count in one ordinary page or per group                                                                                |
| `projectionFieldsMax`                 | `ProjectionSpec.fields.length`; resolving a subset adds no columns                                                                             |
| `rowsByIdMax`                         | input `rowIds.length`                                                                                                                          |
| `mutationRowsMax`                     | `RowMutation.changes.length`                                                                                                                   |
| `mutationCellsMax`                    | total Field-ID/value members across create/update maps                                                                                         |
| `mutationBytesMax`                    | JCS UTF-8 bytes of the complete `RowMutation` payload                                                                                          |
| `aggregateItemsMax`                   | `AggregateRequest.items.length`                                                                                                                |
| `groupPageSizeMax`                    | groups returned in one `GroupPage`                                                                                                             |
| `formulaPreviewRowsMax`               | requested or sampled preview rows                                                                                                              |
| `filterDepthMax` / `filterNodesMax`   | root-at-1 depth / all filter nodes                                                                                                             |
| `sortFieldsMax` / `groupFieldsMax`    | client sort / group Field count before the Row-ID tiebreaker                                                                                   |
| `searchBytesMax`                      | UTF-8 bytes of `search.text`                                                                                                                   |
| `listElementsMax`                     | elements in each input/result canonical list or flattened Lookup sequence                                                                      |
| `logicalValueBytesMax`                | UTF-8 bytes of JCS for one public `LogicalValue`, including any complete list/File value                                                       |
| `jsonCellBytesMax`                    | UTF-8 bytes of one JSON Field's JCS text                                                                                                       |
| `formulaBytesMax`                     | UTF-8 bytes of source text                                                                                                                     |
| `formulaNodesMax` / `formulaDepthMax` | all AST nodes / root-at-1 AST depth                                                                                                            |
| `diagnosticsMax`                      | diagnostics retained in one result                                                                                                             |
| `foregroundTimeMsMax`                 | monotonic elapsed milliseconds accepted for one foreground request                                                                             |
| `csvBytesMax`                         | octets in one CSV import input or export output                                                                                                |
| `schemaPlanEntriesMax`                | live unapplied schema plans retained per Runtime epoch                                                                                         |
| `schemaPlanBytesMax`                  | JCS UTF-8 bytes of exact Host-private plan data retained for live schema plans                                                                 |
| `undoEntriesMax`                      | live undo tokens retained per Runtime epoch after deterministic oldest-first eviction                                                          |
| `undoBytesMax`                        | JCS UTF-8 bytes of complete logical before/post-state retained for live tokens                                                                 |

A shape containing nominal `OwnedBytes` has one carrier-independent Runtime
accounting projection: omit that member and its key before JCS accounting, and
count the exact octet sequence once under its dedicated byte limit. In 1.0 the
only such member is CSV `csv`, bounded by `csvBytesMax`. Direct bindings and
Transport attachments use this same projection; an attachment descriptor or
envelope is Adapter accounting and does not alter Runtime admission. Omission
is solely an accounting projection—the member remains required by the logical
operation shape.

For Transport composition, Adapter computes the maximum JCS payload budget by
subtracting the JCS size of the envelope/descriptors at negotiated maximum ID
lengths from `maxRequestBytes`. It chooses Runtime page, projection, list,
logical-value, CSV, and result limits whose worst permitted response carrier
is at most Adapter `maxResponseBytes`. `responseBytesMax` is the resulting
payload-only ceiling. Named attachment bytes are counted by
Adapter and by their owning operation. Negotiation returns these effective
reduced values, not unadjusted engine maxima.

### 4.3 Error record

An operation either returns its declared result or one structured error:

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

`message` contains `1..4096` Unicode scalar values and no U+0000; it is
diagnostic and MUST NOT be parsed. `path`, when present, is an RFC 6901 JSON
Pointer of at most 4096 Unicode scalar values into the logical
request/metadata model, contains no U+0000, and is never a filesystem path.
The complete error JCS must fit the effective Adapter response carrier;
composition may shorten only `message` on a scalar boundary to make it fit,
never a code, path, ID, revision, or structured detail. `details` MUST NOT contain SQL,
bound canonical values unrelated to the error, paths, credentials, native
codes without a stable wrapper, stack traces, or generated source. Exact code
controls behavior. Invalid input never falls through to a raw SQLite error.

`retryable=true` is permitted only for `busy`, `deadline-exceeded`,
`stale-revision`, `conflict`, `cancelled`, or `adapter-error`; it never
authorizes an automatic mutation replay.

`unknown-commit` always has `retryable=false`. On a transported binding its
public `details` is exactly `{reconciliationRequired:true}`. Adapter trusted
composition retains and validates the private commit receipt; neither
`RuntimeClient` nor UI receives it. The caller invokes Adapter HostServices
`reconcileCommit`, which reopens the private working database and returns a
replacement Runtime epoch plus the safe `CommitReconciliation` only when the
outcome is proved. On a direct binding without a Transport barrier, details is exactly
`{baseRevision,commitRevision,reconciliation}` with the same matching rules.
The direct caller reopens and validates the same exclusively owned working database: matching File ID
plus `commitRevision` proves commit and the reconciliation supplies persistent
IDs; matching File ID plus `baseRevision` proves rollback; every other state
is conflict/fatal and never authorizes replay. A receipt/preparation proves
only the candidate outcome until that revision check.

## 5. Public Schema and Logical Values

### 5.1 Lossless scalar binding

Public JSON-compatible values use these exact representations:

| Logical type             | Runtime/public value                                             |
| ------------------------ | ---------------------------------------------------------------- |
| null                     | JSON `null`                                                      |
| text, select, URL        | JSON string                                                      |
| number                   | finite JSON number; `-0` normalized to `0`                       |
| integer, revision, count | canonical signed/non-negative int64 decimal string as applicable |
| checkbox                 | JSON boolean                                                     |
| date                     | canonical `YYYY-MM-DD` string                                    |
| datetime                 | canonical `YYYY-MM-DDTHH:MM:SS.sssZ` string                      |
| JSON Field               | canonical JCS text string                                        |
| multi-select             | ordered unique string array                                      |
| Relation                 | ordered unique Row-ID string array                               |
| File                     | ordered `FileEntry` array                                        |

An Integer is never a JSON number. A JSON Field is never parsed into an
untyped public object: SQL NULL is JSON `null`, while the JSON literal null is
the string `"null"`. This preserves all int64 values and the SQL-NULL/JSON-null
distinction across JavaScript, native, and JSON transports.

Ordinary Runtime values are already canonical. A UI/import helper that accepts
external datetime text MUST implement this explicit normalization algorithm,
never hide it inside `mutateRows`: parse a valid RFC 3339 date-time with a
known numeric offset or `Z`; reject `-00:00` and leap-second `:60`; convert the
represented instant to UTC; emit exactly millisecond precision and `Z`.
Fraction beyond milliseconds is rejected unless the caller explicitly chooses
`truncate` or round-to-nearest, ties-to-even; rounding carries through second,
day, month, and year, and a result outside 0001..9999 is rejected. Missing
fraction is `.000`. Date input accepts only a real proleptic-Gregorian
`YYYY-MM-DD` and never applies a timezone. The helper reports whether spelling,
offset, or precision changed before the canonical value is submitted.

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
  | "json"
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

`TypeRef` describes a logical result, not a physical Field kind. Formula has a
declared `FormulaResultType`, which is the exact File DDL subset in Section 9.
Lookup may expose `row-id`/`file-entry` atoms or a one-level list TypeRef:
Multi-select elements are `select`, Relation elements are `row-id`, and File
elements are `file-entry`. Nested lists are flattened by Section 10 and never
cross the public boundary. `LogicalValue` spelling is disambiguated by the
Field/Column `TypeRef`; JSON JCS text and Integer decimal are both strings by
design.

Every `JsonValue` is acyclic, contains only finite binary64 numbers, and is
valid for JCS. A FileEntry has each required key exactly once; an extension
cannot shadow a required key and is preserved through JCS.

The exact descriptor mapping is:

| Field/role                                                        | `valueType`                                   |
| ----------------------------------------------------------------- | --------------------------------------------- |
| Row-ID system Field                                               | `row-id`                                      |
| created/updated-time system Field                                 | `datetime`                                    |
| stored text/number/integer/checkbox/date/datetime/url/json/select | the same type token                           |
| stored Multi-select                                               | `multi-select`                                |
| stored File                                                       | `file`                                        |
| forward or inverse Relation                                       | `relation`                                    |
| Formula                                                           | its declared `FormulaResultType`              |
| Lookup `values`                                                   | `{kind:"list",element:E}`                     |
| Lookup `first`/`min`/`max`                                        | element type `E`                              |
| Lookup `count`                                                    | `integer`                                     |
| Lookup `sum`                                                      | `integer` for Integer `E`, otherwise `number` |
| Lookup `average`                                                  | `number`                                      |

Lookup element type `E` is the scalar/Formula/Lookup atom after flattening;
Multi-select contributes `select`, File contributes `file-entry`, and either
Relation direction contributes `row-id`. A `values` Lookup cannot produce a
nested list. This mapping also controls filter operands, Relation
`labelType`, Formula static references, and UI renderer selection; an
implementation MUST NOT infer a different public type from a SQLite storage
class.

Within Formula static typing only, a Row-ID system reference is a non-null
`text` operand and may produce only an ordinary declared text/derived result;
Formula never creates a `row-id` value. At every other public boundary its
descriptor and typed equality remain `row-id`.

Public operator compatibility depends on `valueType`, never on Field kind or
SQLite storage class:

| Operation family                             | Accepted `TypeRef`                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| typed `eq`/`ne`/`in`, `distinct-count`       | every `TypeRef`; objects compare RFC 8785 JCS bytes and lists compare length plus ordered typed elements |
| ordered comparison, sort, group, `min`/`max` | `text`, `url`, `select`, `row-id`, `integer`, `number`, `checkbox`, `date`, `datetime`                   |
| `contains`/`starts-with`/`ends-with`, search | `text`, `url`, `select`, `row-id`                                                                        |
| `sum`/`average`                              | `integer`, `number`                                                                                      |

Thus a Lookup `first` over a Relation is sortable/groupable because its
`valueType` is `row-id`; a Lookup `first` over File is not because its
`valueType` is `file-entry`. `json`, `multi-select`, `file`, `relation`,
`file-entry`, and every list TypeRef are equality/distinct-only. Null is never
an ordered operand, but sort places it by the explicit null-rank and grouping
forms one null group.

The total non-null order is exact. Text/URL/select/row-id compare unsigned
UTF-8 bytes (`BINARY`). Integer compares mathematical signed-int64 value.
Number compares normalized finite binary64 numerical value; `-0` is first
normalized to `+0`. Checkbox orders `false < true`. Canonical date and
datetime compare unsigned UTF-8 bytes, which is chronological for their fixed
encodings. Mixed Integer/Number comparison converts the Integer to the exact
mathematical real value and compares mathematically against the finite
binary64 value; it MUST NOT first round an out-of-safe-range Integer to
binary64. No ordering compares values of different non-numeric types.

### 5.2 Snapshot

`getSnapshot({minimumRevision?})` returns the bounded File header and schema
counts at one committed revision:

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

`getSnapshot` is deliberately bounded header state; schema is obtained with
`getSchemaPage`. Counts are non-negative int64 decimal strings. Page `limit`
is `1..schemaPageSizeMax`. The first request omits cursor and supplies the
snapshot revision. A cursor binds Runtime epoch, File ID, revision, and the
ordering below. A moved current revision is `stale-revision`; clients discard
partial schema pages and restart from a new snapshot.

Schema objects are ordered in four blocks: features by `name BINARY`; Tables
by `(position,id BINARY)`; Fields by owning Table's order then
`(position,id BINARY)`; and Views by owning Table's order then
`(position,id BINARY)`. Positions are signed int64 decimal strings. A page
contains the longest ordered prefix of at most the requested `limit` whose
complete result JCS fits `responseBytesMax`; it contains fewer only at the end
or because the next whole descriptor would exceed that bound. No object is
split across pages. A descriptor that alone exceeds `responseBytesMax`
returns `resource-limit`; aggregate object count never makes the header or an
otherwise bounded page unrepresentable. Settings/config/query/layout are
parsed JSON objects whose serialization, when persisted, is JCS. Unknown
extension members are preserved where their owning format rule permits them.
No descriptor contains a physical name.

`FieldDescriptor.definition` is present exactly for Relation, Formula, and
Lookup Fields and absent for every other Field. `writable` is structural, not
a session-permission bit: it is true exactly for a non-system stored
scalar/JSON/Multi-select/File Field or a forward Relation, and false for every
system Field, Formula, Lookup, and inverse Relation. A read-only binding still
reports this same descriptor and rejects mutation separately with
`unsupported`.

The Record Label Field is a stored eligible scalar or a Formula with an
eligible persisted result type. A Lookup is never the Record Label in core
1.0 because its inferred scalar/list TypeRef is not persisted by File Format.
Runtime treats any violation as semantic invalidity rather than guessing from
current rows.

If `minimumRevision` is greater than the current revision, Runtime waits until
that revision, cancellation, deadline, or close. If events are unavailable it
MAY poll Adapter `dataVersion` within the deadline. A smaller/equal value
returns immediately.

## 6. Projection, Columnar Rows, and Relation Labels

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

`fields` has no duplicates. `columns` and every `values` array are in exactly
that order. The columnar shape intentionally sends each Field ID once per
page; sparse mutations remain Field-ID keyed maps. A response MUST NOT add a
second name-keyed row representation.

System-role Fields use `source:"stored"`; their role and writability are in the
snapshot descriptor. There is no second `system` source category.

`resolveRelations` has no duplicates, is a subset of `fields`, and names only
forward or inverse Relation Fields. For each requested Relation column, a row
contains one entry in `resolvedRelations`, ordered by ascending column index.
The member is absent exactly when `resolveRelations=[]`; otherwise it is
present on every returned row with exactly `resolveRelations.length` entries.
Its `items` has exactly the same length and Row-ID order as that row's Relation
value. Missing targets remain `{id,state:"unresolved"}`. A resolved target uses
the target Table's current Record Label Field; `label` is its logical scalar
value and MAY be null. Resolution is a projection, never canonical state.

`projectionHash` is lowercase 64-character SHA-256 over the UTF-8 JCS
serialization of exactly:

```json
{ "fields": [], "resolveRelations": [] }
```

with the requested arrays substituted without reordering. The empty hash is:

```text
4efcb37076a87698cbe05b2dd2c08d6b185db2a5bebcf2dafccdc772f32fd76a
```

### 6.2 Page and batch invariants

`queryRows` returns `RowPage`. `getRowsById` returns `RowBatch`, never a page.
Both bind one File ID, Table ID, revision, and projection. Runtime MUST obtain
the page and any Relation labels in one consistent read transaction and MUST
use set-based joins/batches rather than one SQL statement per row or label.

`getRowsById.rowIds` contains canonical unique IDs from one requested Table.
Existing rows appear in request order; `missingRowIds` contains absent IDs in
their request order. A duplicate ID is `invalid-request`. Row identity is
Table-scoped at this boundary: an ID absent from the requested Table is always
reported in `missingRowIds`, even if the same spelling occurs in another
Table. Runtime MUST NOT perform a cross-Table existence lookup to classify it.

Virtual evaluation failure caused by a row value (for example division by
zero or numeric overflow) yields null for the projected value. Definition,
type, dependency, or cycle failure in persisted metadata makes the request
`corrupt-file`; it is never silently converted to null. `invalid-formula` is
reserved for invalid caller-supplied candidate/schema input, not persisted
state.

## 7. Query, Filter, Sort, Paging, Grouping, and Aggregation

### 7.1 RowQuery

The public query document uses stable Field IDs only:

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

type FilterNode =
  | { op: "and" | "or"; args: FilterNode[] }
  | { op: "not"; arg: FilterNode }
  | { op: "is-null" | "is-not-null"; fieldId: string }
  | {
      op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte"
      fieldId: string
      value: LogicalValue
    }
  | { op: "between"; fieldId: string; lower: LogicalValue; upper: LogicalValue }
  | { op: "in"; fieldId: string; values: LogicalValue[] }
  | {
      op: "contains" | "starts-with" | "ends-with"
      fieldId: string
      value: string
    }
  | { op: "has-any" | "has-all"; fieldId: string; values: LogicalValue[] }
  | { op: "relation-has"; fieldId: string; rowId: string }
```

The following Draft 2020-12 JSON Schema is executable structural validation
for `RowQuery`. Runtime additionally performs Field/type/limit validation.

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
            "value": true
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["op", "fieldId", "lower", "upper"],
          "properties": {
            "op": { "const": "between" },
            "fieldId": { "$ref": "#/$defs/id" },
            "lower": true,
            "upper": true
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["op", "fieldId", "values"],
          "properties": {
            "op": { "enum": ["in", "has-any", "has-all"] },
            "fieldId": { "$ref": "#/$defs/id" },
            "values": { "type": "array" }
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
        }
      ]
    }
  }
}
```

`filterDepthMax` counts the root as depth 1. `filterNodesMax` counts every
logical and leaf node. Empty `and` is TRUE; empty `or` is FALSE. `not`, `and`,
and `or` use this three-valued truth table; a row is selected only by TRUE:

| A   | B   | A AND B | A OR B |
| --- | --- | ------- | ------ |
| T   | T   | T       | T      |
| T   | F   | F       | T      |
| T   | U   | U       | T      |
| F   | F   | F       | F      |
| F   | U   | F       | U      |
| U   | U   | U       | U      |

`NOT T=F`, `NOT F=T`, and `NOT U=U`. Except for `is-null` and `is-not-null`, a
null Field value produces UNKNOWN. A null query operand is invalid; clients
use the null operators explicitly.

Operands MUST have the Field's exact logical type; Runtime performs no string,
number, Boolean, date, or ID coercion. Ordered comparison operators apply only
to the Section 5.1 sortable TypeRefs. `eq`, `ne`, and `in` apply to every
TypeRef: JSON uses exact JCS text, a `file-entry` object uses its complete JCS
object, and a list/Multi-select/File/Relation uses length plus ordered typed
element equality. `contains`, `starts-with`, and `ends-with` apply to
text/URL/select/row-id and compare Unicode scalar sequences after folding ASCII
`A..Z` to `a..z`; non-ASCII is unchanged. This same portable fold is used by
`search`.

`has-any` and `has-all` apply to Multi-select and Relation lists using typed
exact equality. Empty `has-any` is FALSE and empty `has-all` is TRUE.
`in` is the three-valued OR of typed `eq` comparisons; an empty `in` is FALSE.
`relation-has` is an optimized exact Row-ID membership test and accepts a
forward or inverse Relation. Runtime compiles list predicates to `json_each`
or an equivalent set operation; it MUST NOT fetch a list per row.

Search fields MUST have `text`, `url`, `select`, or `row-id` value type. A Record Label
Field is searchable only when its value type is one of those four; numeric,
checkbox, date, and datetime labels are not implicitly stringified.
`search.fields` is unique, non-empty, and no longer than
`projectionFieldsMax`. Search is the OR of non-empty substring matches after
the same ASCII fold. It does not
tokenize, normalize Unicode, resolve URLs, or use an
implementation-dependent full-text tokenizer. Implementations MAY accelerate
the exact result with generated indexes and MUST fall back to the defined
semantics.

### 7.2 Sort and keyset cursors

Sort Field IDs are unique and have one of the exact sortable `valueType`
tokens in Section 5.1. A client-supplied Row-ID system Field is
valid only as the final sort term. List, File, JSON, and Relation sorts are
invalid. Null placement defaults to `last` for both directions. Non-null order
uses the type order above; binary64 follows ordinary numerical order after
forbidding NaN/infinity and normalizing negative zero. Runtime appends Row ID
`BINARY ASC` as the final unique tiebreaker unless Row ID is already the final
sort term.

`queryRows` request is:

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

`limit` is `1..pageSizeMax`. Rows are always returned in display sort order;
`backward` selects the preceding slice but reverses the internal scan before
return. With no cursor, forward/default starts before the first row and
backward starts after the last row. `nextCursor` moves toward later display rows and `previousCursor`
moves toward earlier display rows, independent of request direction. A null
cursor means that boundary has been reached.

Cursors are opaque, bound at least to Runtime epoch, File ID, Table ID,
revision, normalized query, projection hash, complete effective sort, and
boundary typed values. A cursor from another binding is `invalid-query`; a
valid binding from an older revision is `stale-revision`. Runtime MUST use a
lexicographic keyset predicate over explicit null rank, each typed sort value,
and Row ID. It MUST NOT implement conforming paging with an offset proportional
to page number.

Every row, group, or schema-object cursor is stateless or fully re-derivable
from its authenticated opaque contents and the current canonical snapshot.
Runtime MUST NOT require an unbounded retained server-side cursor entry. It
may authenticate or encrypt cursor contents and retain bounded acceleration
state, but losing that state cannot change the cursor's result or error. A
schema-plan dependency cursor instead binds one of the separately bounded
retained plans in Section 12.2.

The normalized query used for cursor equality is the RFC 8785 JCS form after
validation, with absent `filter`/`search` represented as absent, absent `sort`
represented as `[]`, and every absent sort `nulls` inserted as `"last"`.
Filter argument order, search Field order, and client sort order are preserved;
Runtime does not apply commutative reordering. All operands are already exact
logical values. `limit`, paging direction, and cursor itself are not part of
the query hash, so the same boundary cursor may be traversed in either
direction with a different permitted limit.

### 7.3 Aggregate and column statistics

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
```

Item keys are unique non-empty strings. `AggregateResponse.results` retains
request order and every value comes from the one reported revision.
`count-all` counts selected rows; `count` counts non-null values;
`distinct-count` counts distinct non-null typed values. Counts are non-negative
int64 decimal strings. `sum`/`average` accept Integer or Number. Integer sum
uses an unbounded accumulator and returns an int64 decimal only when in range;
an out-of-range `sum` result is `constraint`, not wrap or REAL coercion.
Integer `average` instead divides the exact unbounded mathematical sum by the
non-null count and rounds that rational once to nearest binary64, ties to even;
it does not fail merely because the intermediate sum exceeds int64. Number sum first orders
ordinary aggregate inputs by Row ID `BINARY`, then at each
level adds adjacent pairs left-to-right with one IEEE 754 ties-to-even addition;
an odd final value is promoted unchanged. Levels repeat until one value
remains. Number average divides that final binary64 sum once by the exact
non-null count using ties-to-even binary64. A non-finite intermediate/result
is `constraint`.
Empty sum/average/min/max is null. Lookup numeric aggregates apply the same
pair-reduction algorithm to their already ordered flattened sequence from
Section 10 rather than introducing a Row-ID reorder.

`min`/`max` accept exactly the sortable TypeRefs in Section 5.1. `statistics` always returns
`rows`/`nulls`/`distinct`; it additionally returns `min`/`max` for a sortable
scalar and `sum`/`average` for a numeric Field. An applicable member is present
and is null for an empty input; an inapplicable optional member is omitted.
All members are computed in one set-based scan. A convenience `countRows` binding, if
provided, MUST be only `aggregate` with one `count-all` item and MUST NOT have
different filter or revision semantics.

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

`groupBy` has `1..groupFieldsMax` unique Field IDs whose `valueType` is in the
exact Section 5.1 sortable/groupable allowlist. JSON, `file-entry`, File,
list, and Relation grouping is invalid. Group key equality/order uses the same
typed rules as filter/sort, with null as one group ordered first. Groups are
coalesced by exact typed-key equality and ordered lexicographically by keys
ascending; because the Field TypeRefs are fixed and each component order is
total, no implementation-defined tiebreaker remains. `groupLimit` is
`1..groupPageSizeMax`; `rowsPerGroup` is `1..pageSizeMax`.
`aggregates` has at most `aggregateItemsMax` items, uses unique non-empty keys,
and follows the exact aggregate type/arithmetic rules in Section 7.3.

Rows within every group use the query's effective sort and are returned
inline. `nextRowCursor` is null at the end; otherwise it is passed unchanged
to `queryGroupRows`, whose cursor binds the original File/Table/revision,
normalized query, grouping, exact typed group key, projection, and effective
row sort. Its `limit` is `1..pageSizeMax`; direction and returned display order
follow `queryRows`. Runtime MUST obtain groups,
aggregates, and inline rows with set-based/window queries or bounded batched
queries; one query per group or per row is non-conforming. Group cursors have
the same revision/binding rules as row cursors.

## 8. Relation Semantics

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

A forward Relation's logical value is its canonical ordered unique Row-ID
array. Cardinality `one` permits length zero or one. Runtime rejects duplicate,
malformed, or over-limit IDs before SQL. An ordinary row mutation may add only
IDs that currently exist in the exact target Table. An explicit import/replay
operation MAY preserve an unresolved ID only for a `preserve` Relation and
MUST report it; it cannot manufacture a resolved label.

An inverse Relation has no raw column. For target row `t`, its value is every
source Row ID whose forward array contains `t`, ordered by source Row ID
`BINARY ASC`. The inverse target Table is the forward Relation's owner Table.
It is always cardinality many and read-only. Runtime evaluates it with one
set-based expansion, equivalent to this private template after safely resolving
and quoting names:

```sql
SELECT source."_id"
FROM <source-table> AS source
JOIN json_each(source.<forward-column>) AS edge
  ON edge.type='text'
WHERE edge.value=?1
ORDER BY source."_id" COLLATE BINARY;
```

Forward resolution uses a set-based expansion preserving `json_each.key`:

```sql
SELECT owner."_id", edge.key, edge.value, target."_id"
FROM <owner-table> AS owner
JOIN json_each(owner.<forward-column>) AS edge ON edge.type='text'
LEFT JOIN <target-table> AS target ON target."_id"=edge.value
WHERE owner."_id" IN (<bounded-bindings>)
ORDER BY owner."_id" COLLATE BINARY, edge.key;
```

The templates are algorithms, not public SQL and not permission for identifier
concatenation. Runtime may use an equivalent warm reverse index, but cold and
warm results MUST be identical. Generated reverse state is invalidated on any
affected Relation mutation or revision change.

Deleting target rows applies the File Format trigger semantics to every
affected forward Relation in the same write transaction:

- `restrict`: if any target ID is referenced, reject the entire operation with
  `constraint` and stable Relation/target diagnostics;
- `detach`: remove every deleted ID, preserve survivor order, and update each
  changed source row's `_updated_at` once using the operation timestamp;
- `preserve`: leave arrays byte-for-byte unchanged, so those entries become
  unresolved.

A multi-row delete computes all restrictions and detach effects set-wise
before mutation. It MUST NOT depend on delete order. A failed restriction or
trigger rolls back all row, timestamp, and revision effects. Table/Field rename
does not affect Relation values because definitions and cells use stable IDs.

## 9. Formula Language and Evaluation

### 9.1 Definition and same-Table references

```ts
type FormulaResultType =
  | "text"
  | "number"
  | "integer"
  | "checkbox"
  | "date"
  | "datetime"
  | "url"
  | "json"

interface FormulaDefinition {
  sourceText: string
  resultType: FormulaResultType
}
```

Formula source is human text. Every Field reference is the exact current
display name in the Formula Field's own Table, enclosed in double quotes;
an embedded `"` is doubled. The decoded spelling MUST equal the current display
name byte-for-byte. The File Format's `NOCASE` uniqueness rule prevents
ambiguous ASCII variants but does not make a variant spelling valid. Formula cannot directly name a
Field in another Table, traverse a Relation, access a View, or reference a
physical identifier. Cross-table values enter only through a same-Table
Lookup Field.

The source may reference stored, system, Formula, or Lookup Fields from that
Table. The resulting file-wide derived graph MUST be acyclic. The Formula
Field itself is a graph node even if evaluation could short-circuit the
reference. Conditional reachability never excuses a cycle.

### 9.2 Lexical grammar

This EBNF is normative. Literal text in quotes is exact; `{x}` means zero or
more and `[x]` means optional.

```ebnf
expression     = or-expression ;
or-expression  = and-expression, { "OR", and-expression } ;
and-expression = not-expression, { "AND", not-expression } ;
not-expression = [ "NOT" ], comparison ;
comparison     = concatenation,
                 [ ( "=" | "!=" | "<" | "<=" | ">" | ">=" ),
                   concatenation ] ;
concatenation  = additive, { "&", additive } ;
additive       = multiplicative, { ( "+" | "-" ), multiplicative } ;
multiplicative = unary, { ( "*" | "/" | "%" ), unary } ;
unary          = [ "+" | "-" ], primary ;
primary        = "NULL" | "TRUE" | "FALSE" | number | string
               | field-reference | function-call
               | "(", expression, ")" ;
function-call  = function-name, "(", [ expression,
                 { ",", expression } ], ")" ;
function-name  = ASCII-letter, { ASCII-letter | ASCII-digit | "_" } ;
field-reference = '"', { identifier-char | '""' }, '"' ;
string         = "'", { string-char | "''" }, "'" ;
number         = ( "0" | nonzero-digit, { ASCII-digit } ),
                 [ ".", ASCII-digit, { ASCII-digit } ],
                 [ ( "e" | "E" ), [ "+" | "-" ],
                   ASCII-digit, { ASCII-digit } ] ;
```

`identifier-char` is any Unicode scalar except `"`; doubled `""` decodes to
one quote. `string-char` is any Unicode scalar except `'`; doubled `''`
decodes to one apostrophe. Backslash has no escape meaning. Outside tokens,
only U+0020, tab, CR, and LF are whitespace. Keywords and function names are
ASCII case-insensitive; the standard serializer emits uppercase. A numeric
literal without fraction/exponent is Integer when in int64 range, otherwise it
is Number when rounding the exact decimal rational once to IEEE 754 binary64,
round-to-nearest ties-to-even, produces a finite value. Decimal underflow to
positive zero is valid. No implementation may use a locale parser or expose
an extended-precision result without that final rounding. As one special constant-folding
rule, unary `-` directly applied to token `9223372036854775808` produces
Integer `-9223372036854775808`; the unsigned token alone is Number. Because
the token is unsigned and unary accepts one optional sign, `--1` has no parse.
All other binary64-overflow literals are `invalid-formula`; any Number
negative zero produced by unary minus is normalized to positive zero.

No comments, assignment, property/index access, array/object literal,
subquery, SQL fragment, semicolon, user-defined function, or implicit Field
reference exists in this grammar.

### 9.3 Static types and operators

Null is a possible value of every Formula result but is not a separate
declared type. Formula commit requires the inferred non-null result type to
equal `resultType` exactly.

The complete non-null Formula type universe is exactly `text`, `number`,
`integer`, `checkbox`, `date`, `datetime`, `url`, and `json`. A referenced
Field enters that universe by this mapping: `select` and `row-id` become
`text`; those eight same-named types remain themselves. This applies equally
to stored/system Fields and scalar Formula/Lookup results. `multi-select`,
`file`, `relation`, `file-entry`, and list TypeRefs cannot be Formula operands,
even to `IS_NULL`; referencing one is `invalid-formula`. Formula cannot
manufacture a `select`, `row-id`, File entry, or list value.

Type checking is bidirectional from the declared result type. A `NULL` literal
is the bottom value: it adopts a required surrounding type but never chooses a
type by itself. A non-null peer determines it in an operator, `IF`,
`COALESCE`, `MIN`, or `MAX`; the declared root type may flow through a
type-preserving construct, so `NULL`, `IF(TRUE,NULL,NULL)`, and
`COALESCE(NULL,NULL)` are valid with any declared Formula result type. A
construct with no expected/peer operand type, such as `NULL = NULL`, is
`invalid-formula`. `IS_NULL(NULL)` is valid because its argument accepts any
type. After this contextual step, all ordinary exact-type rules below apply.

| Construct      | Accepted operands                          | Result           |
| -------------- | ------------------------------------------ | ---------------- |
| unary `+`, `-` | Integer or Number                          | same type        |
| `+`, `-`, `*`  | numeric; Integer+Number promotes to Number | promoted numeric |
| `/`            | numeric                                    | Number           |
| `%`            | Integer, Integer                           | Integer          |
| `&`            | text, text                                 | text             |
| `< <= > >=`    | same sortable scalar, or mixed numeric     | checkbox         |
| `= !=`         | same Formula type, or mixed numeric        | checkbox         |
| `AND OR NOT`   | checkbox                                   | checkbox         |

Except for `IS_NULL`, `COALESCE`, and `IF`, a null operand produces null.
Boolean operators use the three-valued table in Section 7. Integer arithmetic
whose result type is Integer is exact signed int64; overflow produces null.
`/` always follows the Number-promotion path below, so Integer
`INT64_MIN / -1` has a finite rounded Number result rather than Integer
overflow. Integer `%` uses quotient truncation toward zero and returns
`a - trunc(a/b) * b`; a zero divisor produces null and
`INT64_MIN % -1` is exactly zero. For mixed arithmetic, each Integer operand
is first rounded once to nearest binary64, ties-to-even, then the stated
binary64 operation is performed. Mixed comparison and equality instead use
the exact mathematical Integer value against the exact finite binary64 value,
as Section 5.1 requires; they do not round the Integer first. Mixed
`MIN`/`MAX` selects by that comparison and converts a selected Integer once to
binary64 because the result type is Number. Number arithmetic follows IEEE 754 binary64 with
round-to-nearest, ties-to-even; a NaN, infinity, or negative-zero result is
respectively null, null, or positive zero. Equality treats positive and
negative zero as equal before normalization; JSON equality compares canonical
JCS text. Formula sortable types are exactly text, number, integer, checkbox,
date, datetime, and URL using Section 5.1 order. There is no text/numeric or
date/datetime coercion.

### 9.4 Function whitelist

Only these ASCII-case-insensitive functions exist in Formula 1.0:

| Function                      | Arguments                                    | Result and exact rule                                                   |
| ----------------------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| `IF`                          | checkbox, T, T                               | first value when condition is TRUE; second when FALSE or null           |
| `COALESCE`                    | 2..16 values of one T                        | first non-null, else null                                               |
| `IS_NULL`                     | any one value                                | non-null checkbox                                                       |
| `ABS`                         | Integer or Number                            | same type; int64-min overflow/null                                      |
| `MIN` / `MAX`                 | 2..16 of same sortable T, or mixed numeric   | typed min/max; any null propagates                                      |
| `FLOOR` / `CEIL`              | Number                                       | Integer when int64-representable, else null                             |
| `CONCAT`                      | 2..16 text                                   | concatenation; any null propagates                                      |
| `LENGTH`                      | text                                         | Integer count of Unicode scalar values                                  |
| `SUBSTR`                      | text, Integer start, optional Integer length | Unicode-scalar slice defined below                                      |
| `LOWER_ASCII` / `UPPER_ASCII` | text                                         | fold only ASCII letters; other scalars unchanged                        |
| `DATE_ADD_DAYS`               | date, Integer                                | proleptic-Gregorian date or null outside year 0001..9999                |
| `DATE_DIFF_DAYS`              | date, date                                   | first minus second in whole calendar days                               |
| `DATETIME_ADD_MILLISECONDS`   | datetime, Integer                            | canonical UTC instant or null outside range                             |
| `DATETIME_DIFF_MILLISECONDS`  | datetime, datetime                           | first minus second exact Integer milliseconds or null on int64 overflow |

`SUBSTR` uses a zero-based scalar index. A negative start counts backward from
length and clamps to zero; a start beyond length returns empty text. Omitted
length consumes the remainder. A length AST consisting exactly of unary `-`
directly applied to a positive in-range Integer literal is
`invalid-formula`; Runtime performs no other definition-time constant folding
for this rule. Any other expression that evaluates to a negative length yields
null for that row. Thus `SUBSTR('a', 0, -1)` is invalid while
`SUBSTR('a', 0, 0 - 1)` is valid source whose value is null.

Date functions use the proleptic Gregorian calendar with the RFC 3339 leap-year
rules and no local timezone. The whitelist deliberately excludes `NOW`,
`TODAY`, randomness, locale formatting, network/file access, regular
expressions, collations, and Host UDFs. Formula evaluation is therefore a pure
function of the row, referenced canonical state, and definition.

### 9.5 Dependency plan, evaluation, and serializer

Runtime parses source, resolves reference nodes to Field IDs in generated
state, adds an edge from each referenced virtual Field to the dependent
Formula Field, and combines those dependency-to-dependent edges with Lookup
edges from Section 10. It runs cycle
detection over the whole File and evaluates a deterministic topological order;
Field ID `BINARY` is the tiebreaker between independent nodes. Parsed ASTs,
edges, plans, and compiled SQL are generated state.

Runtime MUST evaluate pages and aggregates set-wise. It may compile safe SQL
or use vector batches, but it cannot execute user source as SQL/JavaScript and
cannot issue one query per row. Short-circuiting `IF`, `AND`, and `OR` avoids
unselected branch row errors but does not change static type/dependency checks.

The standard serializer emits uppercase keywords/functions, canonical Integer
literals, doubled string and identifier quotes, comma followed by one space,
and one space around infix operators. A Number uses the shortest
round-trippable finite binary64 spelling produced by ECMA-262
`Number::toString` (the algorithm referenced by RFC 8785), with lowercase `e`
and its specified exponent sign, except that `.0` is appended when
that spelling would lex as an in-range Integer token; this preserves Number
type (`1.0` never serializes as Integer `1`).

All repeated infix productions are left-associative and comparison is
non-associative. The serializer preserves the exact AST: it parenthesizes a
child of lower precedence, every right child of equal binary precedence, every
nested comparison, and a unary child that could otherwise form a second sign;
it also parenthesizes a `NOT` child whose root is `NOT`, so
`NOT (NOT TRUE)` never becomes the ungrammatical `NOT NOT TRUE`. It omits all
other parentheses. A Runtime-created or edited Formula uses this
serializer. Readers also accept any grammar-equivalent whitespace/spelling so
`sourceText` remains human source, not a hidden AST.

On Field rename Runtime parses under the old namespace, replaces resolved AST
reference nodes by the new Field name, serializes every affected Formula, and
revalidates the graph and result types in the same transaction as physical and
metadata rename. It never performs textual replacement. Any ambiguity,
parse/type/cycle failure rolls back the entire rename.

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

When `valid=true`, `inferredType`, `dependencies`, and `rows` are present;
when parse, name resolution, static typing, cycle, or definition limits fail,
`valid=false`, all three are absent, and diagnostics contain at least one
error. Such an invalid candidate is a preview result, not a thrown
`invalid-formula`; malformed request shape and request/resource limits still
return their ordinary errors. `fieldId`, when present, must identify an
existing Formula Field in `tableId`; `candidateName` is then forbidden and the
candidate replaces that graph node for cycle analysis. When `fieldId` is
absent, `candidateName` is required, obeys Field name uniqueness, and defines a
fresh ephemeral node in the Table namespace; a reference to that name is a
self-cycle. Dependencies are unique Field IDs in first source occurrence order. Explicit
row IDs are unique and preserve request order; absent IDs produce per-row
`not-found` errors. Without IDs, Runtime samples the first
`formulaPreviewRowsMax` rows by Row ID `BINARY`. Each row contains exactly one
of `value` or `error`. Diagnostics are ordered by source UTF-8 byte offset,
then code, truncated at `diagnosticsMax`, with `diagnosticsTruncated=true` iff
more would follow. Preview changes no state and does not authorize a later commit;
schema preflight parses again at its bound revision.

## 10. Lookup Evaluation and the Cross-Table DAG

```ts
interface LookupDefinition {
  relationFieldId: string
  targetFieldId: string
  aggregate: "values" | "first" | "count" | "sum" | "average" | "min" | "max"
  distinctValues: boolean
}
```

The Relation Field belongs to the Lookup owner's Table. Its target Table must
own the target Field. Forward and inverse Relations are both allowed. The
target may be stored, system, Relation, Formula, or Lookup. A Lookup cannot
reference a View, physical name, formatted label, or generated cache.

For one owner row Runtime obtains Relation target rows in Relation order:
forward array order, or inverse source-Row-ID `BINARY` order. An unresolved
target contributes no element. For each resolved target in that order:

1. a scalar target contributes its one value, including null;
2. a Multi-select, File, Relation, or `values` Lookup contributes its elements
   in their existing order;
3. nested lists are recursively flattened depth-first until one flat sequence
   remains.

Runtime never sorts the flattened sequence. When `distinctValues=true`, it
keeps the first occurrence of each typed value. Null equals null; numbers use
normalized binary64 equality; Integers use mathematical int64 equality;
strings and IDs use exact Unicode/BINARY equality; structured File entries use
their JCS public-object equality. Values of different logical types are never
equal. Distinct therefore preserves deterministic first-occurrence order.

Aggregate behavior is:

| Aggregate     | Result                                                         |
| ------------- | -------------------------------------------------------------- |
| `values`      | the flat sequence, including nulls                             |
| `first`       | first element, including null; null when empty                 |
| `count`       | non-null element count as Integer decimal                      |
| `sum`         | numeric non-null sum; null when empty                          |
| `average`     | binary64 average of numeric non-null elements; null when empty |
| `min` / `max` | typed sortable min/max over non-null elements; null when empty |

Distinct is applied before the aggregate, including before `count`. Integer
and Number aggregates use Section 7 arithmetic over the already defined flat
occurrence order; they do not sort again. Arithmetic overflow/non-finite output
is a row-evaluation failure and therefore yields null for that Lookup cell
under Section 6.2, not a whole-request aggregate error. `sum`/`average`
require numeric element type; `min`/`max` require one sortable element type.
The inferred `valueType` is a one-level list for `values`, the element type for
`first`/`min`/`max`, Integer for `count`, Integer or Number for `sum`, and
Number for `average`. An empty dataset does not weaken static type checks.

Every virtual dependency contributes an edge from the referenced virtual Field
to its dependent Formula/Lookup Field. Lookup-through-Relation is still an edge even
when the current Relation arrays are empty. Runtime detects cycles over all
Tables with a depth-first color algorithm or equivalent strongly connected
components. A self-loop or component of size greater than one is `cycle`.
For diagnostics, consider every simple directed cycle, rotate its unique-ID
sequence so its smallest Field ID is first, and append that first ID once as
the closing element. Compare normalized sequences element-by-element by
Field-ID `BINARY`, with the shorter sequence first when one is a proper
prefix. The diagnostic reports the globally smallest resulting sequence.
This is the exact minimum-cycle rule; traversal/discovery order cannot change
it.

Runtime evaluates the acyclic graph in topological order with Field ID
`BINARY` as the stable ready-node tiebreaker. It expands Relation rows and
target values set-wise, preserving owner ID, relation ordinal, nested ordinal,
and typed value. A page, aggregate, or validation operation MUST NOT issue one
target query per owner row, Relation element, Formula, or Lookup. Generated
edge tables/reverse indexes MAY make warm evaluation faster, but cold and warm
values and order are identical.

## 11. Public Operations and Atomic Mutations

### 11.1 Exact public service

Eidos Runtime owns this complete asynchronous binding. `RuntimeService` and
`RuntimeClient` are two names for the same operation contract; the former is
the factory result and the latter is the direct/Transport-facing binding.

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

Every `Promise<T>` settles exactly once with `T` or the structured
`RuntimeError` from Section 4.3; a binding MUST NOT substitute a raw driver or
host exception. `previewFormula` remains present and returns `unsupported`
when its capability is false. `revertMutation`, `subscribe`, `exportCsv`, and
`importCsv` are present exactly when their corresponding `mutationUndo`,
`events`, `csvExport`, or `csvImport` capability is true. `cancel({requestId})` is idempotent and
only requests cancellation; it is not proof that a write did not commit.
Convenience methods may exist only as exact compositions of these operations.
In particular, `analyzeFormula` is Formula preview or a Formula schema
preflight, and `convertField` is schema preflight followed by plan application;
neither may define alternate semantics.

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

Runtime allocates every Row ID in the ordinary public service. Explicit IDs
exist only on a separately authorized embedding import/replay interface, never
on `RuntimeClient` and never as a negotiated UI choice. `clientKey` is a
request-scoped non-empty correlation string; it is not
persisted. Client keys are unique. No Row ID may occur in more than one change
in the request. An update/delete Row ID is resolved only in `tableId`; if it is
absent there, the result is always `not-found`, regardless of whether the same
spelling occurs in another Table. Caller-authored `RowChange` targets belong
to this one Table; explicit changes in another Table require another operation
and revision unless a schema plan owns the transaction. Deterministic incoming
Relation-policy side effects are not caller-authored changes and may affect
other Tables as specified below.

Create/update `values` is a sparse Field-ID map. Runtime rejects display names,
physical names, unknown Fields, system Fields, Formula, Lookup, and inverse
Relation keys. It validates the complete logical value before opening a write
transaction. Missing nullable Fields become null. Missing Multi-select, File,
and forward Relation Fields use `[]`. Every other missing non-null user Field
is `invalid-value`; there is no hidden type default. Runtime fills Row ID and
created/updated timestamps.

Select values absent from the display catalog remain valid. Multi-select and
Relation values must already be ordered/unique; Runtime does not silently
deduplicate. JSON Field input is JCS text, not an object. Date/datetime input
is canonical unless an explicitly selected schema/CSV conversion says
otherwise.

Multi-row composition is set-based and independent of change order. Runtime
first allocates creates, forms the request Table's complete proposed surviving
row set, and declares its delete set. For every incoming forward Relation it
then evaluates the surviving source rows using an explicit update's proposed
array when present and the current array otherwise; deleted source rows are
excluded. `restrict` fails only if that composed array still contains a target
delete-set ID, `detach` removes every such ID preserving survivor order, and
`preserve` retains an occurrence that existed in the source row before this
operation. A caller cannot introduce a target-delete-set ID under
`preserve`.

Finally, every newly introduced Relation ID must resolve in the proposed final
target Table (base rows minus deletes plus allocated creates). An existing
unresolved occurrence may survive only under its existing `preserve` policy;
resubmitting it does not convert it into a newly authorized reference. These
checks and all detach results are computed before any SQL write. Each final
source row receives at most one updated timestamp. `returnedRows` and
`affectedRows` describe this fully composed post-policy state, including
cross-Table detach rows; trigger execution order cannot change the outcome.

An update with an empty map is `invalid-request`. An update changes
`_updated_at` only when at least one resulting canonical cell differs. Equal
binary64 values compare after negative-zero normalization; JSON/list/File
values compare canonical JCS bytes; all other raw values compare their exact
canonical representation.

When `returning` is present, a successful result contains `returnedRows` at
the new (or unchanged no-op) revision for every surviving created/updated row,
in change order, with the requested projection. Deleted rows are represented
by `affectedRows`, not inserted into `missingRowIds`. This is the authoritative
post-commit value used by optimistic clients. Without `returning`, clients
refetch before treating locally derived values as committed.

### 11.3 Transaction, revision, and no-op rules

For every write Runtime:

1. validates request shape and bounded size;
2. enters one Adapter `transaction("write",...)`;
3. reads and compares `eidos__meta.revision` with `expectedRevision` inside
   that transaction;
4. checks every target, dependency, Relation policy, and final value;
5. computes all effects before applying them;
6. applies canonical changes and validates affected invariants;
7. if and only if canonical state changed, increments revision once and sets
   meta `updated_at` to the operation wall-clock instant;
8. commits, then emits a revision event.

For every changed `mutateRows`, `revertMutation`, `mutateView`,
`mutateSchema`, or `importCsv`, step 7 constructs and retains through outcome
settlement the one matching `CommitReconciliation` from the tentative public
result. When `transportCommitBarrier` is present, Runtime additionally invokes
its `prepare` immediately before step 8, while the outer write transaction is
still open and no statement is active. `fileID` is the
result File ID, `baseRevision` is the revision checked at step 3, and
`commitRevision` is exactly its int64 successor and equals
`reconciliation.result.revision`. The operation tag must equal the invoked
Runtime method. The record includes every server-allocated persistent ID and
stable postcondition, but deliberately excludes returned projections,
diagnostics, undo/plan/cursor tokens, and other epoch-private state.

The reconciliation JCS counts against `responseBytesMax` and, when
transported, the Adapter prepared-envelope limit. Failure, no-op, or a record
that cannot fit its possible direct error/Transport carrier cannot commit and
never invokes the barrier. Runtime MUST NOT issue COMMIT until the barrier
resolves after the exact Adapter receipt/ack protocol. Rejection before ack
causes known rollback. After ack Runtime attempts COMMIT once; an unprovable
outcome makes the Adapter epoch fatal and is surfaced by the transported
facade as `unknown-commit`, never automatically replayed. A direct binding has
no barrier and uses the ordinary Adapter transaction outcome rule.

A mismatch at step 3 is `stale-revision` with `currentRevision` and zero side
effects. A missing update/delete row is `not-found` and rolls back the entire
request. A duplicate create is `already-exists`. Restrict, invalid Relation,
or any change failure rolls back all rows, timestamps, detached Relations,
metadata, generated invalidation, and revision.

A request containing only equal updates returns `changed=false`, the unchanged
revision, empty `affectedRows`, and no timestamp/event/undo effect. Empty
`changes` is invalid. Create and delete are always actual changes. Position
or JCS reserialization is a no-op only when every persisted canonical value is
identical; changing any persisted position integer is an actual metadata
change even though object identity and value semantics stay the same.
Revision `9223372036854775807` refuses any actual write with `resource-limit`;
it never wraps.

One operation timestamp is used for every created/updated row and meta row.
`created` follows create-change order. `affectedRows` contains every actually
changed row, including Relation-detach side effects, ordered by Table ID then
Row ID `BINARY`, without duplicates.

### 11.4 Undo extension

When `mutationUndo=true`, every successful changed `mutateRows` and
`revertMutation` result contains an opaque `undoToken` and an
`evictedUndoTokens` array. `revertMutation({undoToken,expectedRevision})` is
available. A token has no public encoding and is bound to the File ID, Runtime
epoch, complete affected-object logical before-state, and an applicability
post-state. That post-state covers affected row existence, IDs, creation
times, user values, Relation side effects, and the complete incoming
Relation/dependency frontier of those objects, but excludes logical revision,
meta `updated_at`, and row `_updated_at` values that an undo operation must
advance.

Revert compares `expectedRevision` with the current revision and validates the
token's complete applicability post-state inside the same write transaction.
It also computes the ordinary inverse's current restrict/detach/preserve and
dependency effects before writing. The current frontier must equal the saved
frontier, and every object the inverse would affect must belong to the token's
saved affected set; otherwise the result is `conflict` rather than an expanded
or partial undo.
A revision mismatch is `stale-revision`; a missing token is `not-found`; a
present token whose affected state no longer matches is `conflict`. Every
failure has zero effects and leaves the token usable. Success consumes the
token, restores the saved Row IDs, original creation times, user values, and
Relation effects, assigns the new operation timestamp to affected updated/meta
times, increments revision once, and returns a new inverse token usable as
redo. It does not decrement revision or restore SQLite bytes. Because
applicability is affected-state based rather than original-revision based,
after undoing a later action an earlier non-conflicting token can become
applicable and multi-step undo works across monotonically increasing
revisions.

Runtime retains at most `undoEntriesMax` live tokens and `undoBytesMax` JCS
bytes of their complete logical before/post/frontier state. Before a changed commit it
computes the new inverse record. If that record alone exceeds
`undoBytesMax`, the operation fails `resource-limit` before commit. Otherwise
Runtime provisionally reserves it; for revert accounting it first removes the
successfully consumed token, then selects the oldest retained tokens by token-creation
sequence until both limits fit. `evictedUndoTokens` lists those tokens oldest
first and is empty when none were selected; the successfully consumed revert
token is not an eviction. Consumption, insertion, and eviction become effective
only after the canonical commit succeeds, so rollback restores the exact prior
retention state. A successful schema mutation invalidates all row
undo tokens, and clients clear their row history after that result. No-op and
failed operations return neither undo member and change no retention state.

When `mutationUndo=false`, no token/member/operation is present. A client may
construct an explicit inverse only from complete logical before-state and must
submit it as a new mutation at the current revision. It MUST NOT infer missing
delete, Relation, or virtual effects.

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

`mutateView` returns `ViewMutationResult`; create mappings use `clientKey`.
Runtime allocates View IDs. Names, query Field references, and JCS shape are
validated against one Table; Runtime does not interpret standard layout keys.
Unknown layout members are preserved. A View ID/client key may occur once per
request. Positions are required canonical int64 decimal strings on create and
are changed only by an explicit patch; Runtime never invents an append
position. `createdViews` follows create-change order and `affectedViewIds` is
unique in `BINARY` order. View changes follow the exact no-op, expected-revision, timestamp,
single-increment, and rollback rules above.

## 12. Schema Preflight, Reference Rewrite, and Conversion

### 12.1 Schema change vocabulary

Every schema application starts with exactly one tagged `SchemaChange`:

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
  | "json"
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
  | "json-null-to-sql-null"
  | "null-to-empty-list"

type ScalarStoredFieldType =
  | "text"
  | "number"
  | "integer"
  | "checkbox"
  | "date"
  | "datetime"
  | "url"
  | "json"
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

New client keys are request-scoped and unique. Positions are required
canonical int64 decimal strings and may tie; Runtime never invents an append
position. Settings default to `{}`. Runtime allocates a new Table ID first,
then its Row-ID, created-time, and updated-time Field IDs, then supplied Field
IDs in input order. The system Fields have exact display/physical names `_id`,
`_created_at`, and `_updated_at`, positions `-3`, `-2`, and `-1`, and settings
`{}`. A supplied Field name colliding under `NOCASE` is invalid.
`create-table` creates those Fields and supplied Fields atomically. When `labelFieldClientKey` is absent,
the Row-ID system Field is the Record Label; otherwise it names a supplied
compatible Field. Definitions are required exactly for Relation, Formula, and
Lookup and forbidden for other kinds.

Relation and Lookup Fields are forbidden inside `create-table`; a caller adds
them in a later schema operation after the Table and referenced stable IDs
exist. Formula Fields are allowed and resolve all supplied Field names after
allocation. `create-field` may create any kind using only stable-ID
definitions from the base revision. There are no implicit client-key object
references other than `labelFieldClientKey` within `create-table`.

`nullable` defaults to true for stored scalar/JSON Fields, is fixed false for
File, Multi-select, forward/inverse Relation, and is fixed true for Formula and
Lookup in core 1.0. Runtime rejects a contrary request. Physical `NOT NULL`
must match the File Format matrix exactly.

`set-field-nullable` applies only to a stored scalar/JSON Field. Equal input is
a no-op. Changing the declaration in either direction is `metadata-only`
because the rebuild mechanism does not itself change a canonical cell. Making
it non-nullable is permitted only when no SQL NULL exists and is otherwise
forbidden; no implicit default is invented. A conversion to a scalar/JSON
destination uses required `toNullable`; list/forward-Relation destinations are
fixed non-null.

Creating a stored Field on a populated Table has exact fill behavior. A
nullable scalar/JSON Field fills every existing row with SQL NULL. A
non-nullable scalar/JSON Field is permitted only when the Table has zero rows;
there is no default/initial-value member in Runtime 1.0. Multi-select, File,
and forward Relation Fields fill every existing row with canonical `[]`.
Formula, Lookup, and inverse Relation Fields add no user-table column.

`convert-field.fieldId` must currently identify a stored scalar/JSON,
Multi-select, File, or forward Relation Field. A system Field, Formula,
Lookup, or inverse Relation is rejected as `forbidden`; changing one of those
definitions uses its dedicated leaf operation instead. A conversion to
Relation always creates a forward Relation and the supplied complete
`ForwardRelationDefinition` is validated at the base revision.

`set-relation` preserves direction. For a forward Relation it may change
target Table, cardinality, or delete policy only after every current array is
valid for the new target and a new `one` cardinality; unchanged raw arrays make
the plan `metadata-only`. For an inverse Relation it may point to another
valid forward Relation only when the owning/target Tables satisfy Section 8;
this too is `metadata-only` generated-definition replacement. A forward↔inverse
direction change is forbidden: callers explicitly delete and create a Field,
so no stored column is silently discarded or synthesized. Each committed
inverse Field is the unique inverse of its forward Field as required by File
Format; a conflicting pair is forbidden.

`policies`, when present, is unique and must occur in this canonical order:
`json-null-to-sql-null`, `round-binary64`, `truncate-toward-zero`,
`round-ties-even`, `zero-false-nonzero-true`, `utc-date`, `first`,
`null-to-empty-list`. `truncate-toward-zero` and `round-ties-even` are mutually
exclusive. Runtime rejects a policy irrelevant to the selected source and
destination. Multiple policies are allowed only for disjoint stages of one
cell conversion: JSON-root handling, then scalar conversion, then destination
null-to-list handling.

`batch.changes` is non-empty, ordered, and contains no nested batch. Every
stable-ID reference names an object that exists at the base revision. Runtime preflights the complete batch as one object with one hash and one
transaction. It cannot apply individually preflighted plans under one revision.

`set-file-title` validates the File title domain. `set-default-table` accepts
null or an existing Table ID. Runtime never chooses a default implicitly.
Deleting the current default Table is forbidden unless an earlier leaf in the
same batch clears or retargets the default; deleting a target selected earlier
in that batch is also forbidden.

### 12.2 Exact two-phase contract

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
  | "json-null-to-sql-null"
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

`actionsHash` is lowercase SHA-256 over UTF-8 JCS of exactly `change`.
Dependencies are unique and ordered by object kind `table`, `field`, `view`,
then ID `BINARY`. `dependencyCount` is the total non-negative int64 decimal
count. The result contains the longest ordered prefix of at most
`schemaPageSizeMax` dependencies whose complete preflight result fits
`responseBytesMax`; if even the fixed result plus its first required
dependency cannot fit, preflight returns `resource-limit` and installs no
plan. `dependencyCursor` is present exactly when more remain. The UI follows it with
`getSchemaPlanDependencies`, whose `limit` is `1..schemaPageSizeMax`; cursors
bind the plan/epoch/order and return `plan-expired` after plan expiry,
eviction, or consumption by a `mutateSchema` application attempt.
Each page reports the plan's File ID, immutable base revision as `revision`,
and total `dependencyCount`. Paging continues over that immutable preflight
snapshot even if the current File revision moves; movement affects later
`mutateSchema` as specified below but does not change dependency output.
Each continuation page uses the same longest-whole-prefix/
`responseBytesMax` rule as `getSchemaPage`.
Warnings and value-change summaries are stable-code records, not localized
prose. Each is deterministically truncated at `diagnosticsMax` after its
defined order and reports its corresponding `*Truncated` flag; truncation never
hides classification, total affected-row count, or dependency count.

Preflight uses only these core diagnostic codes (extensions use the namespace
rule in Section 15):

| Code                          | Severity | Exact trigger                                                          |
| ----------------------------- | -------- | ---------------------------------------------------------------------- |
| `fraction-loss`               | warning  | a non-integral Number is truncated or rounded to Integer               |
| `precision-loss`              | warning  | an Integer is rounded to binary64                                      |
| `truthiness-loss`             | warning  | a numeric value outside exact 0/1 maps to Checkbox                     |
| `time-loss`                   | warning  | a non-midnight datetime maps to date                                   |
| `null-distinction-loss`       | warning  | two actual source categories coalesce through a null/list policy       |
| `list-tail-loss`              | warning  | `first` discards one or more list elements                             |
| `option-merge-loss`           | warning  | option values/list occurrences coalesce                                |
| `object-delete-loss`          | warning  | a Table or Field is deleted                                            |
| `dependent-source-rewritten`  | info     | a Formula source or saved-View operand is mechanically rewritten       |
| `dependency-blocked`          | error    | an unhandled dependent prevents the leaf                               |
| `conversion-domain-invalid`   | error    | at least one source value has no selected destination algorithm        |
| `non-nullability-blocked`     | error    | SQL NULL would reach a non-null destination without an allowed mapping |
| `relation-definition-invalid` | error    | target/direction/inverse ownership or target IDs are invalid           |
| `cardinality-blocked`         | error    | a value exceeds requested Relation cardinality                         |
| `record-label-blocked`        | error    | a delete/change would leave no valid Record Label                      |

A preflight `forbidden` plan contains at least one error from this table; an
`explicit-lossy` plan contains at least one corresponding warning. The
diagnostic includes the owning `tableId`/`fieldId`/`viewId` whenever that
object exists, and `path` points to the exact leaf member; deletion of a Table
or Field identifies that object. Warnings are ordered by the general
diagnostic order in Section 15.

`valueChanges` contains one record for every applicable code and owning
`(tableId,fieldId)` pair with a positive row count. `rows` is the number of
unique rows in that Table on which that exact transformation stage occurs; a
cell passing through two explicitly named stages may contribute to both
records, while `affectedRows` remains the union. `tableId` and `fieldId` are
therefore present on every core record. `value-reencoded` covers a changed raw
representation with no more-specific code; the other code names correspond
exactly to the algorithms/policies of Sections 8, 12.3, and 12.5. Records are
ordered by code, Table ID, then Field ID using `BINARY`.

`expiresInMilliseconds` is a positive safe integer no greater than 600000.
Runtime records `clock.nowMilliseconds()+expiresInMilliseconds` as the
authoritative monotonic deadline. `expiresAt` is a wall-clock display estimate
only and cannot extend/shorten validity when wall time moves.

The opaque token is bound to Runtime epoch, File ID, base revision, actions
hash, exact plan, and monotonic expiry. It is not canonical state and does not
survive close. Token lookup and error precedence are exact:

1. invalid request shape or token syntax is `invalid-plan`;
2. a syntactically valid token for which this epoch retains no unapplied plan
   is `plan-expired`, including a never-issued, other-epoch, consumed,
   expired, or evicted token;
3. for a retained plan, actions-hash mismatch or request
   `expectedRevision` unequal to its base revision is `invalid-plan`;
4. expiry is `plan-expired`;
5. a moved current File revision is `stale-revision` with
   `currentRevision`; then
6. a forbidden plan is `forbidden`, and an explicit-lossy plan without
   `confirmLossy:true` is `lossy-confirmation-required`.

This rule permits bounded retention: no tombstone for a consumed or evicted
plan is required, and an absent well-formed token can never authorize work.

Runtime retains at most `schemaPlanEntriesMax` unapplied plans and
`schemaPlanBytesMax` JCS bytes of their exact plan/dependency data. It removes
expired entries first, then evicts oldest by creation sequence before
installing a successful new preflight. A plan that alone exceeds the byte cap
returns `resource-limit` and is not installed. Evicted lookups return
`plan-expired`. Admission/eviction becomes effective only when preflight
returns successfully; failed/cancelled preflight or failed application does
not evict unrelated plans.

Application enters one write transaction, rechecks revision and every planned
predicate against current rows, executes the exact plan, validates all
dependencies and affected content, then follows the one-increment rule.
Failure rolls back the entire schema, data, Formula rewrite, View query,
option catalog, timestamp, and revision change. A plan is consumed after one
application attempt that reaches its write transaction. Runtime removes its
unapplied entry at that point, so both the plan token and every dependency
cursor derived from it deterministically return `plan-expired`, whether the
transaction later commits or rolls back.

`createdObjects` follows exact allocation order. A Table/supplied Field has
exactly `clientKey`; an automatically created system Field has exactly
`systemRole`. `affectedTableIds` and `affectedFieldIds` include dependency and
rebuild effects once in ID `BINARY` order.

Classification means:

- `metadata-only`: the requested leaf changes only schema/definition metadata,
  creates new canonical cells, or rebuilds a declaration; it neither rewrites
  a pre-existing raw cell/dependent human source nor discards an existing
  schema object/value distinction;
- `lossless-rewrite`: bytes/source change, but the specified transform is
  injective for every affected logical value and its inverse can recover them;
- `explicit-lossy`: at least one existing schema object or actual value
  distinction is discarded by one exact operation/policy and counts are
  reported;
- `forbidden`: no safe transform/definition exists or an invariant/dependency
  would fail.

For a composite change the highest severity controls:
`forbidden > explicit-lossy > lossless-rewrite > metadata-only`.

The leaf classification is exhaustive; “rewrite” describes canonical meaning,
not whether SQLite happens to rebuild a table:

| Leaf                                                                                                    | Classification after validation                                                                                    |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `create-table`, `set-file-title`, `set-default-table`, `rename-table`, table settings/position          | metadata-only                                                                                                      |
| `delete-table`                                                                                          | explicit-lossy; forbidden when any dependency/default/restrict rule is unresolved by the same batch                |
| `create-field`                                                                                          | metadata-only with the exact fill rules in Section 12.1                                                            |
| `delete-field`                                                                                          | explicit-lossy; forbidden when label/dependency replacement is incomplete                                          |
| `rename-field`                                                                                          | lossless-rewrite when any Formula source is AST-rewritten, otherwise metadata-only                                 |
| Field nullable/settings/position, Record Label, Formula, Lookup, and same-direction Relation definition | metadata-only after their exact validity predicates                                                                |
| `convert-field`                                                                                         | the Section 12.3 matrix                                                                                            |
| `rename-option` reject                                                                                  | metadata-only/no-op when no source occurrence exists, otherwise lossless-rewrite                                   |
| `rename-option` merge                                                                                   | metadata-only/no-op with no source occurrence; explicit-lossy iff occurrences coalesce; otherwise lossless-rewrite |
| `batch`                                                                                                 | highest severity of its fully composed effects                                                                     |

`affectedRows` is the number of unique `(tableId,rowId)` pairs whose row is
deleted or whose canonical raw cell is created, deleted, or rewritten by the
whole plan. A row touched by several leaves counts once; rows merely scanned,
whose virtual output changes, or whose metadata-only declaration is rebuilt
without a cell-shape change do not count. Creating/deleting a stored Field
counts every existing row because a canonical cell is created/deleted.

### 12.3 Complete stored-type conversion matrix

The matrix is source row to destination column. `M`, `L`, `X`, and `F` are the
four classifications above. Before classifying a cell, Runtime applies the
destination-nullability guard below; failure of that guard is `F` and
overrides the table entry. `?` means preflight conditionally scans every
relevant cell, including when required only by that guard. Slash-separated
letters are the only possible successful classes under the algorithms below,
otherwise the result is `F`. A conversion with no cell bytes to
rewrite/discard is `M` even when its general cell shows `L?`; classification
always uses the complete actual domain, never a sample.
In this matrix `relation` means a forward stored Relation; virtual/inverse
sources are excluded by Section 12.1.

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

Value-identity conversions are metadata-only only after the destination-
nullability guard succeeds. The other cells use only these algorithms:

1. **Textual subtypes.** Text/date/datetime/URL/select share physical TEXT.
   `M?` validates every string in the destination domain without rewriting.
   Select accepts any string, configured or not. Text/select to Number,
   Integer, or Checkbox is `L?` only when every value is exactly the standard
   inverse spelling: shortest round-trippable finite binary64, canonical int64
   decimal, or lowercase `true`/`false`. No trim, locale, thousands separator,
   Boolean synonym, or permissive SQLite cast exists.
2. **To text/select.** Numeric/Boolean values serialize by the exact spellings
   above (`true`/`false` for Checkbox); this is lossless. JSON/list/File/
   Relation to text keeps its canonical JCS text bytes, so JSON literal null
   becomes text `null` while SQL NULL stays SQL NULL. Date/datetime/URL/select
   to text and textual subtype to select need no rewrite.
3. **Number and Integer.** Integer to Number is lossless only for values exactly
   representable as binary64. Otherwise `round-binary64` is explicit-lossy.
   Number to Integer is lossless only for integral, in-range values. Otherwise
   an in-range result may use `truncate-toward-zero` or `round-ties-even`;
   out-of-range is forbidden. Runtime never delegates this to SQLite `CAST`.
4. **Checkbox.** Checkbox to Integer changes only type metadata because both
   use INTEGER 0/1, so it is metadata-only; Checkbox to Number rewrites 0/1 to
   REAL 0.0/1.0 losslessly. Integer to Checkbox is metadata-only when every
   non-null value is 0 or 1; Number to Checkbox is a lossless rewrite when
   every non-null value is exactly 0.0 or 1.0. Otherwise the
   `zero-false-nonzero-true` policy maps zero to false and every other finite
   value to true and is explicit-lossy. The policy is unnecessary for the
   exact 0/1 branch.
5. **Date/datetime.** Date to datetime appends `T00:00:00.000Z` and is lossless.
   Datetime to date is lossless only when every value is UTC midnight;
   otherwise `utc-date` discards the time and is explicit-lossy.
6. **To JSON.** Text/date/datetime/URL/select become a JCS JSON string; Number
   becomes a JCS number; Checkbox becomes a JSON Boolean; SQL NULL remains SQL
   NULL. Integer is lossless only if exactly binary64-representable; otherwise
   `round-binary64` is the available explicit-lossy policy. Canonical
   Multi-select/File/Relation array text can change type metadata without byte
   rewrite.
7. **From JSON.** Text receives the entire JCS text, not an unquoted JSON
   string. Other destinations require every non-null JSON root to have the
   exact destination kind and then unwrap/rebind it losslessly. JSON strings
   are additionally validated for date/datetime/URL; arrays are validated for
   Multi-select/File/Relation. A JSON literal null may become SQL NULL only
   with `json-null-to-sql-null`. That mapping is lossless when the actual
   source domain contains no SQL NULL, because the inverse maps destination
   null back to JSON literal null; it is explicit-lossy when both source SQL
   NULL and JSON literal null occur. Mixed or otherwise incompatible root kinds
   are forbidden.
8. **Select and lists.** Select to Multi-select wraps a non-null string as a
   one-item array. Every Multi-select/File/forward-Relation destination is
   physically non-null; a source SQL NULL therefore makes the conversion
   forbidden unless `null-to-empty-list` explicitly maps it to `[]`.
   Select-to-Multi-select remains injective with that policy: SQL NULL alone
   maps to `[]`, while every string maps to a singleton, so the whole valid
   conversion is lossless. For Text/JSON to a list, every non-null value must
   already be exact canonical JCS of the destination and therefore keeps its
   bytes. With no SQL NULL this is metadata-only. With SQL NULL and
   `null-to-empty-list`, it is lossless-rewrite when no non-null source value
   is the destination empty array, and explicit-lossy when such a value also
   occurs; without the policy it is forbidden.

   Multi-select to Select maps a singleton to its element losslessly. With
   policy `first`, an empty array maps to SQL NULL only when `toNullable=true`;
   that empty mapping is lossless because the source type has no SQL NULL and
   the inverse recovers `[]`. A length greater than one maps to its first
   element only under `first` and is explicit-lossy. Empty to a non-nullable
   destination, or empty/longer without the required policy, is forbidden.
   Relation creation also requires a target Table and every string to be a
   canonical ID resolving in that target. Multi-select-to-Relation and
   Relation-to-Multi-select preserve ordered JCS bytes and are metadata-only
   after validation. File has no scalar/list coercion other than the stated
   Text/JSON preservation.

9. **Relation to Relation.** Keeping the same target/direction is metadata-only.
   A new target Table is allowed only if every ID resolves in it, yielding
   `M?`; otherwise it is forbidden. `convert-field` never changes direction;
   the same-direction `set-relation` rules and the direction-flip prohibition
   are in Section 12.1.

Null remains SQL NULL in every conversion except the two explicitly selected
JSON-literal/list policies above. For a scalar/JSON destination,
`toNullable=true` preserves source SQL NULL; `toNullable=false` is forbidden
if any conversion stage produces SQL NULL. For a non-null list destination,
source SQL NULL is forbidden without `null-to-empty-list`. A named policy does
not by itself force `explicit-lossy`; the complete actual-domain injectivity
rules above decide `M`, `L`, or `X`. Conversion does not infer option catalogs,
relation targets, File assets, timezone, or defaults.

### 12.4 Rebuild and dependency algorithm

A physical declaration change uses an atomic table rebuild; permissive
affinity, `CAST`, or partial in-place update is non-conforming. Runtime:

1. scans and transforms every value with the algorithms above, recording exact
   counts before any DDL;
2. creates a trusted collision-probed temporary/rebuild table with the final
   STRICT schema and the original rowid/`WITHOUT ROWID` organization, but no
   schema-global File-named index/trigger yet;
3. copies every row using bound transformed values, preserving Row IDs and
   created timestamps and assigning the one operation timestamp only where
   canonical rows actually change;
4. drops every generated index/trigger whose schema SQL is attached to or
   names the old table (including affected cross-Table Relation triggers), so
   their schema-global canonical names are free; renames old to its staging
   name and rebuild to the final physical name; then drops the staged old table
   and every object still attached to it;
5. updates metadata/definition rows and rewrites dependencies;
6. recreates only File-permitted indexes and generated Relation/Row-ID
   triggers from the final canonical metadata, including the affected
   cross-Table set;
7. proves no old/rebuild object remains, then runs affected
   structural/content/semantic checks and
   foreign-key checks, then reaches the one outer commit.

The first transient name is
`t__rebuild__<full-table-id-hex>`; a collision appends `__1`, `__2`, and so on
using the smallest absent decimal suffix. An old-table staging name uses the
same algorithm with `t__rebuild_old__`. These prefixes are not File-reserved,
the names exist only inside the write transaction, and Runtime proves absence
in `sqlite_schema` before use. No transient object exists when File validation
runs or at commit. Any failure rolls back to the exact old table and metadata.

Rename retains stable IDs. Field rename parses and rewrites Formula reference
nodes as Section 9; View queries and Lookup/Relation definitions already use
IDs. Table rename changes no Relation/Lookup/Formula reference. A Field
delete/type change is forbidden if a dependent Formula, Lookup, Record Label,
or View cannot remain valid; deletion of the current label must include a
valid replacement. Runtime revalidates the entire affected cross-table DAG.

### 12.5 Option rename and merge

`rename-option` applies only to Select/Multi-select. `from` and `to` are exact
valid option strings and MUST differ; equality is `invalid-request`. An
occurrence means the catalog `name`, a Select cell, a Multi-select element, or
a typed saved-View operand for that Field. With `collision:"reject"`, the
destination MUST have no occurrence anywhere; otherwise preflight is
`forbidden`. Runtime replaces every exact source occurrence. Multi-select and
catalog order are preserved, and a catalog entry keeps all members except its
`name`. This is a lossless-rewrite when a source occurrence exists. If none
exists, preflight is `metadata-only` and applying the plan is a canonical
no-op.

With `collision:"merge"`, the destination may exist; both values become the
destination and the source catalog entry is removed. Duplicate Multi-select
members created by replacement collapse to the first occurrence. If both
catalog entries exist, the destination entry remains at its original position
with all its original presentation members and the source entry is removed;
if only the source entry exists, it is renamed in place and retains its
members. The plan is `metadata-only` when no source occurrence exists,
`explicit-lossy` exactly when existing source/destination occurrences or list
members coalesce, and otherwise `lossless-rewrite`; it reports
affected/collapsed rows. Formula string literals are ordinary text and
are never rewritten. Unconfigured raw values are renamed by exact match even
when no catalog entry exists; catalog-only removal is a separate metadata
settings change and never deletes cells. Runtime recognizes and preserves the
exact `settings.options` entry shape defined by File Format Section 9; it
neither invents Option IDs nor drops unknown presentation members.

## 13. Saved Views and CSV

### 13.1 Saved View query boundary

A saved View query is exactly the persistent subset of `RowQuery`:

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

Ephemeral search text is deliberately absent. A UI combines a saved
`SavedViewQuery` with current search into a `RowQuery` request without
persisting search. Runtime validates every saved Field ID/operator/value
against the View's Table. Unknown query members are invalid unless a required,
supported File feature owns their semantics; Runtime cannot preserve and then
silently ignore meaning-changing query members.

Runtime treats `layout_json` as a JCS object and preserves unknown members. It
does not interpret grid widths, hidden Fields, grouping presentation, card
layout, selection, focus, scroll, or renderer state. Standard layout meaning
belongs to UI. Runtime `groupRows` reports groups that exist in canonical row
data; display-catalog entries with zero rows are UI catalog groups, not
Runtime query groups. Thus a UI `showEmptyGroups` option MUST derive empty
catalog groups locally without an extra Runtime query and without treating
them as data.

### 13.2 CSV extension

When `csvExport=true` and/or `csvImport=true`, Runtime exposes the corresponding
exact optional operation:

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

`OwnedBytes` is the nominal language-binding value for one immutable exact
octet sequence with a JSON-safe-integer `byteLength`; it has no JSON object
encoding and never aliases caller/SQLite/WASM memory. Input and output are at
most `csvBytesMax` octets and use Section 4.2's carrier-independent accounting
projection. A direct binding carries the `csv` member directly.
Adapter Transport removes that member from JSON, carries exactly the same
bytes only in the required named attachment slot `csv`, and reconstructs it at
the Runtime boundary; it MUST NOT place binary data in JSON or confuse it with
File publication bytes. Runtime
allocates imported Row IDs. A separately authorized embedding import/replay
binding may define an explicit Row-ID CSV column, but that member is absent
from `CsvImportRequest` and ordinary `RuntimeClient`.

The dialect is RFC 4180 with these exact choices:

- encoding is valid UTF-8; a single initial UTF-8 BOM is accepted and omitted
  on write;
- writer record separator is CRLF; reader accepts CRLF or LF but rejects bare
  CR;
- delimiter is comma; quote is `"`; a quote inside a quoted field is doubled;
- comments and alternate delimiters are not part of Runtime 1.0;
- unquoted empty means SQL NULL; quoted empty `""` means empty text and is
  invalid for a non-text destination unless that type explicitly accepts it;
- headers, when written, are current display names. Import mapping uses
  explicit CSV indexes and stable Field IDs; header text never identifies a
  Field by itself.

Export has one canonical writer spelling. SQL null is an unquoted zero-octet
field. Every non-null logical value first becomes its exact text spelling
below. The writer encloses that text in quotes exactly when it is empty or
contains comma, quote, CR, or LF, and doubles every embedded quote; otherwise
it writes the text unquoted. Every emitted record, including the last, ends in
CRLF. With no selected rows, output is exactly the header plus CRLF when
`includeHeader=true`, and zero octets otherwise.

Export `fields` is non-empty, unique, bounded by `projectionFieldsMax`, and its
order is the exact column order. Records follow `queryRows` display order at
the result's reported revision. A Formula/Lookup/inverse Relation may be
exported. Export that would exceed `csvBytesMax`, Adapter response bytes, or
the effective deadline fails `resource-limit`/`deadline-exceeded` without a
partial public byte sequence.

Import `columns` is non-empty, has unique zero-based `csvIndex` values and
unique writable Field IDs, and is bounded by `projectionFieldsMax`. With
`hasHeader=true`, record 1 is required and skipped; its text is informational
only. Each data record must contain every mapped index. Extra unmapped columns
are ignored, while a missing mapped column rejects the entire import. Empty
quoted/unquoted semantics are those above. `createdRows` is in data-record
order and reports each physical one-based `recordIndex` (therefore starting at
2 with a header) and allocated Row ID.

Scalar spellings are the public values in Section 5: Row IDs are lowercase
hyphenated UUID text, Integer is canonical int64 decimal, Number is the same
ECMA-262/RFC 8785 shortest round-trippable spelling (without Formula's
type-preserving `.0` extension, because the destination Field supplies type),
Checkbox is lowercase `true`/`false`, date/datetime are canonical, and
text/URL/select are unmodified. JSON and every public object/list value
(including Multi-select, Relation, File, Lookup lists, and a Lookup
`file-entry`) use RFC 8785 JCS text. Formula, Lookup, and inverse Relation may
be exported but cannot be import destinations. CSV never contains a second
binary UUID or locale-formatted value.

Import parses and validates the entire bounded request, then executes one
ordinary create-rows transaction. Data records are bounded by
`mutationRowsMax`; mapped cells by `mutationCellsMax`; and the equivalent
logical `RowMutation` by `mutationBytesMax`. Zero data records returns
`changed=false` at the unchanged revision. Otherwise it increments revision
once and, when `mutationUndo=true`, follows the same undo-token contract. A row error
rolls back all rows and reports record/column plus Field ID. It does not infer
types, trim, use SQLite casts, fetch assets, or auto-create options. A client
imports a larger file as explicit bounded batches, each with the returned next
revision; Runtime never secretly commits a partial batch.

To preserve data, export does not prefix text that resembles a spreadsheet
formula. A UI opening CSV in a spreadsheet context MUST warn or apply an
explicit, reversible presentation policy; such a prefix is not canonical cell
data.

## 14. Isolation, Transactions, Cache Invalidation, and Events

Every public read observes one committed SQLite snapshot and reports that
snapshot's revision. Runtime never combines metadata at one revision with rows
or Relation labels at another. Writes are serialized per Runtime instance.
Creating a readwrite binding also requires the composition to hold the sole
logical Eidos writer claim for that working database for the binding's entire
epoch; if it cannot, it opens read-only or fails `busy`/`forbidden`. Other
connections in the same composition may be read-only. This claim, together
with the Adapter transaction lock, is what makes a one-step revision receipt
attributable; it is not a substitute for detecting hostile/non-conforming
external file replacement.
One Runtime instance owns exactly the one borrowed ConnectionPort supplied to
its factory and serializes all use of that port; public calls may queue but do
not open or borrow hidden read connections. A Host that wants independent
read concurrency opens separate read-only Runtime bindings, each with its own
ConnectionPort, lifecycle, epoch, snapshots, and limits. It cannot combine
their cursors or generated state.

Runtime checks Adapter `dataVersion` before reusing generated state. After an
external change indication it discards all schema, statement, dependency,
reverse-index, statistics, and page caches, then reads File ID/revision in a
fresh transaction. If File ID changed, the detecting operation settles with
non-retryable `conflict`, after which Runtime enters `fatal`, emits its final
`fatal` event using the prior File ID/last known revision, and rejects every
subsequent non-`close` call with `fatal`. `close` remains idempotent, releases
the borrowed-port claim, and transitions to `closed`; the composition owner
then closes the port. This identity-replacement case is the sole ordinary
`conflict` that also terminates the epoch. Changed canonical state without the
required revision postcondition returns `corrupt-file` and likewise enters
`fatal`. Adapter watcher events are only hints and never replace this check.

Generated state MAY be partitioned by File ID, revision, Table/Field IDs,
query hash, and projection hash. It MUST NOT be written into core/user tables,
returned as canonical truth, or survive a mismatch. Host-private side
databases/memory can hold compiled SQL, ASTs, dependency edges, reverse
Relation indexes, column statistics, cursors, and undo state. Cold recompute is
the conformance authority.

When `events=true`, the listener receives:

```ts
interface RuntimeEvent {
  kind: "revision-changed" | "schema-changed" | "fatal"
  fileId: string
  revision: string
  tableIds?: string[]
  fieldIds?: string[]
}
```

Commit events occur only after success and in increasing revision order.
Changed row/View/CSV/undo commits emit `revision-changed`; a changed schema
commit emits `schema-changed`, which also implies an ordinary revision change.
`tableIds` and `fieldIds` are unique and ordered by `BINARY`. Runtime may
coalesce adjacent events while retaining the newest revision and sorted union
of affected IDs; `schema-changed` wins over `revision-changed` when either
input is schema-changing. Listener delay or exception cannot delay, roll back,
or fail a commit. A bounded dispatcher may coalesce intermediate events but
must eventually deliver the newest non-fatal revision while subscribed. Events
are invalidation hints: they never carry values, authorize writes, prove
durability/publication, or replace a fresh snapshot.
Unsubscribe is idempotent. A fatal event is last.

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

`diagnosticsLimit` is a JSON safe integer in `1..diagnosticsMax`; every other
value is `invalid-request`. All stages for one report use one Adapter read
transaction and one SQLite snapshot. `RuntimeDiagnostic.message` and `path`, when present, obey the Section 4.3
scalar/NUL/JSON-Pointer bounds. `sourceByteOffset` is a non-negative JSON safe
integer no greater than the UTF-8 byte length of the owning Formula source.

`identity`, `structural`, and `content` execute the cumulative exact File
Format levels. `semantic` first executes identity and structural validation in
that same snapshot, then checks:

- every Field definition kind, table ownership, target, result type, and
  writable/nullability rule;
- Formula grammar, exact display-name spelling, static type, and same-Table
  references;
- Lookup/Formula file-wide DAG, target type, flattening, and aggregate type;
- Relation direction/inverse pairs and endpoint/target-definition semantics;
- Record Label scalar compatibility, including the core Lookup prohibition;
- every saved View query Field/operator/value and required query feature;
- option catalog uniqueness and typed View literals.

`full` runs identity, structural, content, then semantic in that order and
includes the File-owned foreign-key and quick checks. A stage after identity or
structural is skipped when that prerequisite emitted fatal/error; `full` also
skips semantic when content emitted fatal/error. The report retains all
already-produced diagnostics and adds one info
`validation-prerequisite-failed` for the first skipped stage, with `path`
exactly `/structural`, `/content`, or `/semantic`. It never queries an unsafe
user object merely to produce more diagnostics. It does not validate UI layout
semantics, asset availability, publication durability, or Host permissions.
`valid` is false for fatal/error and true for warning/info only.

The File-stage code/severity assignments below are owned by File Format
Section 18; this table summarizes their Runtime application and adds the
semantic/staging rows. The owner definitions control, and all codes and
severities are fixed:

| Stage      | Code                                                                                                 | Severity and exact class                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| identity   | `file-not-sqlite`                                                                                    | fatal: bytes cannot be safely opened as SQLite 3                             |
| identity   | `file-identity-invalid`                                                                              | error: application ID/user version/meta singleton or File ID identity fails  |
| identity   | `file-format-unsupported` / `file-feature-unsupported`                                               | error: version or required feature is unsupported                            |
| structural | `file-core-object-invalid` / `file-metadata-invalid`                                                 | error: required/forbidden core object or typed metadata row/JSON shape fails |
| structural | `file-foreign-key-invalid` / `file-physical-schema-invalid`                                          | error: declared reference or user-table/column/STRICT/row organization fails |
| structural | `file-definition-invalid` / `file-trigger-invalid` / `file-index-invalid` / `file-extension-invalid` | error: corresponding File-owned definition/object rule fails                 |
| content    | `file-cell-invalid` / `file-json-invalid` / `file-reference-invalid`                                 | error: corresponding canonical raw value or stable metadata reference fails  |
| content    | `file-unresolved-relation`                                                                           | warning: a canonical Relation target is unresolved                           |
| content    | `file-integrity-invalid`                                                                             | fatal for `quick_check` other than `ok`; error for a `foreign_key_check` row |
| semantic   | `semantic-field-invalid`                                                                             | error: Field kind/ownership/type/writability/nullability semantics fail      |
| semantic   | `formula-parse-invalid` / `formula-name-invalid` / `formula-type-invalid`                            | error: corresponding persisted Formula rule fails                            |
| semantic   | `semantic-cycle`                                                                                     | error: the exact minimum dependency cycle exists                             |
| semantic   | `lookup-invalid` / `relation-invalid`                                                                | error: corresponding definition/type/endpoint semantics fail                 |
| semantic   | `record-label-invalid` / `view-query-invalid` / `option-catalog-invalid`                             | error: corresponding core semantic rule fails                                |
| staging    | `validation-prerequisite-failed`                                                                     | info: later requested stage was skipped as defined above                     |

For a Table/Field/Row/View-specific finding, every stable ID that is safely
known is required; malformed identity instead uses `path` to the metadata
location. Formula diagnostics additionally require `fieldId` and
`sourceByteOffset` when parsing reached a source offset. Content cell findings
require Table, Field, and Row IDs. Unresolved Relation requires all three.
`semantic-cycle` additionally requires `relatedFieldIds` equal to the exact
normalized closed cycle from Section 10; every other core code omits that
member.
File-level findings omit inapplicable IDs. A supported required extension may
add only `x.<vendor>.<code>`, where both tokens use the File extension token
grammar; core Runtime emits no other code.

Diagnostics contain at most `diagnosticsLimit` records and are ordered by
severity (`fatal,error,warning,info`), code, File/Table/Field/Row/View IDs,
path, source offset, then `relatedFieldIds` lexicographically by Field-ID
sequence. At every optional sort position, absence orders
before presence; strings compare unsigned UTF-8/BINARY bytes and offsets
numerically. `truncated=true` means at least one later ordered diagnostic was
omitted. Validation is read-only and MUST NOT repair, normalize, execute
file-defined views/virtual tables, or trust unknown triggers. ER-Writer runs
affected structural/content/semantic checks before every commit.

## 16. Security and Resource Limits

Every File, request, Formula, View query, JSON value, CSV byte, and Adapter
result is untrusted. Runtime MUST:

- use only the securely bootstrapped ConnectionPort, bind values, resolve and
  quote physical identifiers from validated metadata, and never accept SQL;
- keep trusted schema and extension loading disabled and reject undeclared
  triggers/objects before writing;
- validate complete tagged values, UTF-8, UUID, JSON/JCS, date/time, URI, and
  list constraints before mutation;
- parse Formula with the fixed grammar/whitelist and never evaluate it as host
  code or expose Host/network/file/locale/time/randomness;
- enforce recursion/node/byte/list/page/mutation/aggregate/group/diagnostic and
  elapsed limits before partial results;
- use set-based bounded plans and interrupt/deadline checks for SQLite work;
- redact physical SQL, bound values, Formula compilation, paths, tokens,
  credentials, native handles, and stack traces from public errors/logs;
- treat URLs/File entries as inert values; Runtime grants no fetch authority.

The effective limits returned through a transported `RuntimeClient` are the
minimum of Runtime semantic limits and Adapter Transport request/result/time
limits. Composition performs this reduction during negotiation, using the
Adapter's declared byte-accounting rule. It MUST NOT advertise a page/request
that the active Transport necessarily rejects. A direct binding reports only
its own effective process/Connection limits.

A definition or request over a limit is `resource-limit`; Runtime does not
silently truncate a Formula, list, filter, mutation, CSV record, result page,
or diagnostic before setting the explicit `truncated` flag where one exists.
Deadline and cancellation checks do not weaken transaction atomicity. Hard
Adapter termination makes the Runtime epoch fatal.

## 17. Conformance Requirements

### 17.1 Harness

An ER harness supplies a conforming in-memory or `/tmp` ConnectionPort, fixed
Clock/Entropy/Cancellation ports, and File fixtures. It runs every Reader
vector against both ordinary STRICT rowid user tables and `STRICT, WITHOUT
ROWID` user tables. A Writer harness snapshots canonical tables before each
negative test and proves byte-equivalent canonical state and unchanged
revision afterward.

Browser/WASM and Desktop/native implementations run the same logical vectors.
Driver/Transport differences may change timing or private SQL, never typed
values, order, errors, or revision effects. Conformance tests MUST NOT depend
on Eidos package source or private fixtures alone; published vectors include
all inputs and expected logical outputs.

### 17.2 Required Reader families

ER-Reader covers at least:

1. int64 minimum/maximum/zero, finite binary64 edge values, negative-zero
   normalization, SQL NULL versus JSON literal null, Unicode, empty values,
   canonical date/datetime, File entries, and malformed-value rejection;
2. snapshots with Chinese/spaces/keywords/quotes in names and zero physical
   names in the public result;
3. column/value length/order, both projection SHA-256 examples, missing row
   batches, and same-length Relation label resolution with unresolved IDs;
4. all filter operators and the T/F/U table, ASCII-fold search, typed sort,
   null placement, duplicate sort rejection, forward/backward keyset cursors,
   and stale cursor errors;
5. aggregate empty/null/distinct/overflow/order and column statistics;
6. grouped inline rows without per-group queries and stable group cursors;
7. forward/inverse Relation order, cardinality, unresolved state, cold
   `json_each` versus warm-index equality, and dynamic Record Labels;
8. every Formula grammar production/function/operator/null/overflow/date rule,
   quoted-name escaping, same-Table enforcement, standard serialization, and
   row preview errors;
9. Formula-to-Lookup, Lookup-to-Formula, nested Lookup, flatten, typed distinct,
   all aggregates, deterministic DAG order, and exact cycle path;
10. all validation levels, deterministic diagnostics/truncation, hostile schema
    objects, cancellation/deadline, and resource limits.

### 17.3 Required Writer families

ER-Writer additionally covers:

1. Runtime UUID allocation with fixed clock/entropy, same/backward millisecond
   monotonicity, normal UI omission of IDs, and explicit trusted import checks;
2. create/update/delete success, Table-scoped missing and duplicate-change failures,
   equal-value no-op, one operation timestamp, one revision increment, overflow
   refusal, full rollback, and unknown-commit reconciliation;
3. Relation restrict/detach/preserve for single, multi-row, and self-Relation
   delete sets, survivor order, timestamp, and rollback;
4. View create/update/delete, saved-search exclusion, unknown layout
   preservation, and query validation;
5. Field/Table rename with quoted Unicode/case-only names, Formula AST rewrite,
   Relation/Lookup/View survival, and dependency rollback;
6. every cell of the conversion matrix with boundary/conditional/lossy/
   forbidden values, exact policies, no SQLite cast, table organization
   preservation, malformed/never-issued/consumed/evicted/expired/stale/
   hash-mismatch plan precedence, and lossy confirmation;
7. option rename/merge, unconfigured values, Multi-select dedup/order, View
   literal rewrite, and untouched Formula literals;
8. post-commit generated-cache invalidation/events and cold/warm equality;
9. optional undo and CSV families when advertised.

### 17.4 Normative small vectors

```json
{
  "projection": { "fields": [], "resolveRelations": [] },
  "sha256": "4efcb37076a87698cbe05b2dd2c08d6b185db2a5bebcf2dafccdc772f32fd76a"
}
```

```json
{
  "formula": "IF(\"Done\", \"Amount\" + 1, 0)",
  "renamedField": { "from": "Amount", "to": "总额" },
  "rewritten": "IF(\"Done\", \"总额\" + 1, 0)"
}
```

The Formula vector assumes `Done:checkbox`, `Amount:integer`, result Integer.
The Field reference spelling after rename is byte-exact. Implementations add
published exhaustive machine-readable vectors; they MUST identify Runtime
version and cannot silently extend semantics.

## 18. Rationale (Informative)

The public row shape is columnar because a 100-row by 20-Field page otherwise
repeats 2,000 UUID keys. In the representative vector used by this suite,
columnar encoding removes 71,280 bytes of repeated Field-ID text without
making sparse writes positional. Integer decimal strings and JSON JCS text
avoid JavaScript precision/null ambiguity. Stable IDs keep rename correct;
human Formula names remain readable and are safely rewritten through an AST.

SQLite remains the execution engine, not the public data model. Strict typed
bindings, generated set-based SQL, `json_each`, keyset predicates, and optional
indexes use SQLite's strengths, while the defined cold algorithms prevent a
private cache or driver from becoming a second format.

## Normative References

- [BCP 14: RFC 2119 and RFC 8174](https://www.rfc-editor.org/info/bcp14)
- [RFC 3339: Date and Time on the Internet](https://www.rfc-editor.org/rfc/rfc3339)
- [RFC 3986: URI Generic Syntax](https://www.rfc-editor.org/rfc/rfc3986)
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
