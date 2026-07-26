# Eidos UI 1.0

Status: Final Eidos Standard  
Version: 1.0  
Published: 2026-07-21  
Editor and change controller: Eidos Project  
Canonical language: English

## Abstract

Eidos UI 1.0 defines the portable presentation and interaction contract above
an Eidos Runtime. It enables an independent implementer to build a viewer,
row editor, or schema editor without importing Eidos application code and
without knowing how SQLite, a browser Worker, or a native driver is arranged.

An Eidos UI reads and mutates logical data only through `RuntimeClient`. It
uses `HostServices` separately for opening, permissions, publication,
conflicts, recovery, and assets. It never receives SQLite statements,
physical identifiers, generated SQL, host filesystem paths, native handles,
or canonical-file write primitives.

This document owns the standard Grid, Gallery, and Kanban layout meaning,
async consumption behavior, interaction state, editing affordances,
accessibility, and renderer isolation requirements. Logical value, query,
mutation, revision, and error meaning belongs to
[Eidos Runtime 1.0](./eidos-runtime-1.0.md); file bytes and persisted encodings
belong to [Eidos File Format 1.0](./eidos-file-1.0.md); platform and persistence
mechanisms belong to [Eidos Adapter 1.0](./eidos-adapter-1.0.md).

## 1. Status and normative language

This English document is normative. The
[Chinese reference](./eidos-ui-1.0.zh.md) is informative. Publication defines
a conformance target; it does not assert that any existing product conforms.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and
**OPTIONAL** are interpreted as BCP 14 terms only when written in capitals.

Examples and rationale marked informative are not requirements. JSON schemas,
state transitions, interface shapes, default values, and conformance vectors
in this document are normative.

## 2. Scope and dependency boundary

The UI layer has exactly two downward-facing dependencies:

```text
Eidos UI
  ├── RuntimeClient ── logical schema, rows, queries, derived values, mutations
  └── HostServices  ── open, permission, save, conflict, recovery, assets
```

`RuntimeClient` is an asynchronous binding of the public operations owned by
Eidos Runtime 1.0. `HostServices` is an asynchronous, capability-scoped
binding of the host operations owned by Eidos Adapter 1.0. They MAY use
in-process calls, structured-clone messages, IPC, or another transport, but
the UI-observable result MUST be the same.

The optional framework-native `AssetPresenter` in Section 5.2 is the
presentation callback for an already authorized Host lease, not a third data
or authority service. It cannot resolve a canonical URI or acquire bytes.

An Eidos UI:

- MUST address File, Table, Field, View, and Row objects by stable ID;
- MUST address row values by Field ID, never by display or physical name;
- MUST treat Runtime validation and mutation results as authoritative;
- MUST keep drafts, focus, selection, scroll, optimistic overlays, and local
  formatting outside canonical values;
- MUST NOT open or parse the SQLite database;
- MUST NOT issue SQL, quote SQLite identifiers, infer physical names, or
  receive a connection or prepared statement;
- MUST NOT receive a filesystem path, `FileSystemFileHandle`, file descriptor,
  native database handle, Worker-global object, or raw save callback;
- MUST NOT reproduce Formula, Lookup, Relation, filter, sort, aggregate,
  conversion, deletion-policy, or revision semantics in the presentation
  layer; and
- MUST NOT bypass `RuntimeClient` to edit metadata or source bytes.

A UI MAY perform advisory parsing for immediate feedback. Advisory results
MUST be visibly provisional and MUST NOT authorize a write, reject a value
that the Runtime accepts, or replace an authoritative Runtime diagnostic.

## 3. Conformance profiles

A conforming implementation declares one or more of these labels:

| Label           | Required capability                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EU-Viewer-1.0` | open a session, negotiate capabilities, render standard Views and logical values, page and cancel reads, expose accessible read-only interaction |
| `EU-Editor-1.0` | all Viewer requirements, atomic row editing, paste, delete, saved View editing, conflict handling, session undo, and publication                 |
| `EU-Schema-1.0` | all Editor requirements, two-phase Table/Field schema preflight/application, dependency disclosure, conversions, and destructive confirmation    |

The profiles are cumulative: Schema includes Editor, and Editor includes
Viewer. A UI conformance label does not imply that the same component
implements Runtime, Adapter, or File Format.

The test environment for `EU-Viewer-1.0` MUST provide `ER-Reader-1.0` and an
`EA-Host-1.0` host. `EU-Editor-1.0` additionally requires `ER-Writer-1.0`, row
mutation, Runtime `mutationUndo`, view mutation, publication under negotiated
durability, the undo behavior in Section 11.3, and Host commit reconciliation
for any Runtime served through Adapter Transport.
`EU-Schema-1.0`
additionally requires schema preflight and schema mutation. A UI MUST disable
or omit an operation when negotiation does not provide its prerequisite; it
MUST NOT expose a control that predictably fails because a capability is
absent.

A product MUST publish:

1. its UI conformance labels;
2. the Runtime and Host protocol versions it accepts;
3. whether trusted or isolated third-party renderers are supported; and
4. any lower resource limit it imposes below negotiated Runtime or Host
   limits.

## 4. Terms and imported types

- **logical row**: a Row ID and an ordered logical-value array aligned one to
  one with the page's ordered `{fieldId,valueType}` column descriptors.
- **projected absence**: a missing Field-ID member because that Field was not
  requested. It is distinct from a present member whose value is `null`.
- **resolved presentation**: generated label or preview data returned
  separately from the canonical logical value, such as Relation labels.
- **draft**: uncommitted user input owned by UI state.
- **optimistic overlay**: a reversible UI-only projection shown while one
  Runtime mutation is unresolved.
- **revision**: the lossless Runtime revision value. The UI treats it as an
  opaque monotonic concurrency token and never performs binary64 arithmetic
  on it.
- **standard View**: a View whose type is `grid`, `gallery`, or `kanban`.
- **renderer**: code that turns a View and Runtime results into an interactive
  surface. A renderer can be trusted application code or isolated third-party
  code.
- **asset lease**: a time- and purpose-scoped Host result used to present one
  File entry without exposing its storage path or authority.

The following types are incorporated from Eidos Runtime 1.0 and retain their
Runtime meaning: `RuntimeSnapshot`, `RuntimeCapabilities`, `RuntimeLimits`,
`GetSchemaPageRequest`, `SchemaPage`, `SchemaDescriptor`, `LogicalValue`,
`RowQuery`, `SavedViewQuery`, `ProjectionSpec`, `ProjectedRow`, `RowPage`,
`RowBatch`, `FileEntry`, `AggregateRequest`, `AggregateResponse`,
`AggregateResult`, `GroupRequest`, `GroupPage`, `GroupRowsRequest`,
`GroupRowPage`, `FormulaPreviewRequest`, `FormulaPreviewResult`, `RowMutation`,
`MutationResult`, `ViewChange`, `ViewMutationRequest`, `ViewMutationResult`,
`SchemaPreflightRequest`, `SchemaPreflightResult`, `SchemaMutationRequest`,
`SchemaMutationResult`, `SchemaDependencyPage`, `CsvExportRequest`,
`CsvExportResult`, `CsvImportRequest`, `CsvImportResult`, `ValidationRequest`, `ValidationReport`,
`RuntimeError`, `RuntimeDiagnostic`, `CommitReconciliation`, `TypeRef`,
`FormulaResultType`, `JsonObject`, `Revision`,
`CancellationSignal`, and `RuntimeEvent`.

The UI MUST NOT widen, coerce, or reinterpret an imported type. In particular,
an int64 decimal string is not ordinary Text merely because both use a JSON
string; its Field descriptor supplies the logical type.

## 5. Bootstrap, capability negotiation, and exact clients

### 5.1 RuntimeClient

The following generated mirror of Eidos Runtime's language-neutral binding is
normative only for how UI consumes it; Eidos Runtime remains the sole type/API
owner. A language binding MAY change naming convention, but it MUST provide a
one-to-one operation with the same inputs, outputs, cancellation, and errors.
If this mirror ever differs, Runtime controls and the suite build MUST fail.

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

The exact View and Formula-preview request shapes used above are:

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

One View ID MUST NOT occur more than once in one `changes` array. Each Formula
preview with `valid=true` has all three of `inferredType`, `dependencies`, and
`rows`; each row has exactly one of `value` or `error`, in requested `rowIds`
or Runtime sample order. With `valid=false`, all three members are absent and
the result has at least one error diagnostic. `diagnosticsTruncated` is true
exactly when further ordered diagnostics were omitted. Editing an existing
Formula sends its `fieldId` and omits `candidateName`; creating one omits
`fieldId` and sends its proposed unique `candidateName`, so Runtime can detect
a candidate self-cycle. Preview output is generated state and never
authorizes saving the Formula.

The UI consumes these exact `RuntimeCapabilities` members:

| Member            | Meaning to UI                                                                      |
| ----------------- | ---------------------------------------------------------------------------------- |
| `readRows`        | `queryRows` and `getRowsById` are available                                        |
| `schemaPaging`    | revision-bound `getSchemaPage` is available; required by Viewer                    |
| `cursorPaging`    | opaque forward/backward cursors are available; required by Viewer                  |
| `aggregate`       | revision-bearing `aggregate` is available; required by Viewer                      |
| `groupRows`       | `groupRows` and `queryGroupRows` are available; required to render standard Kanban |
| `formulaPreview`  | `previewFormula` is available                                                      |
| `mutateRows`      | canonical row mutation is available                                                |
| `mutationUndo`    | optional Runtime undo extension is available                                       |
| `mutateView`      | saved View query/layout mutation is available                                      |
| `schemaPreflight` | `preflightSchema` and `getSchemaPlanDependencies` are available                    |
| `mutateSchema`    | plan-token schema application is available                                         |
| `validate`        | Runtime validation reports are available                                           |
| `events`          | revision hints can be subscribed                                                   |
| `csvExport`       | optional `exportCsv` is present                                                    |
| `csvImport`       | optional `importCsv` is present and canonical row creation is available            |

The exact consumed `RuntimeLimits` members are:

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

Every member is present and is a JSON safe integer in
`1..2147483647`. Every capability member is present and boolean. A missing
member is a protocol error; unknown future members are ignored. Viewer
requires `readRows`, `schemaPaging`, `cursorPaging`, `aggregate`, `groupRows`,
and `validate`; Editor
also requires `mutateRows`, `mutationUndo`, and `mutateView`; Schema also
requires `schemaPreflight` and `mutateSchema`.

For a transported client these Runtime limits are already the effective
minimum of Runtime and Adapter Transport limits. UI does not discover or apply
a second hidden transport ceiling; a conforming composition never advertises
a request/page it necessarily rejects.

Every non-optional Runtime method remains present when its capability is false
and rejects `unsupported`; UI avoids that predictable call. `revertMutation`,
`subscribe`, `exportCsv`, and `importCsv` are present exactly when their
corresponding capability is true. In particular, a transported RuntimeClient
reports `events=false` and omits `subscribe`; Runtime events are not part of
the Adapter request/response Transport profile.

Capability dependencies are imported exactly: `cursorPaging`, `aggregate`,
`groupRows`, and `csvExport` require `readRows`; `groupRows` also requires
`cursorPaging`; `mutationUndo` and `csvImport` require `mutateRows`; and
`mutateSchema` requires `schemaPreflight`. A contradictory descriptor is a
protocol error, not a set of controls for UI to guess around. UI-created
request IDs obey the exact fixed bound above and are otherwise opaque; a
Transport facade may privately assign a different epoch-unique wire ID.

`revertMutation` and `mutationUndo` are optional for Runtime/Viewer, but
required by `EU-Editor-1.0` so paste/delete and Relation side effects can be
undone completely. A UI without them may still offer non-conforming basic
editing, but cannot claim the Editor label.

`cancel` is idempotent. Canceling is a request, not proof that a mutation did
not commit. A transported mutation that returns `unknown-commit` follows the
trusted Host replacement-epoch workflow in Section 5.2; the old RuntimeClient
cannot be queried to reconcile it.

When `events=true`, `RuntimeEvent` is a hint carrying exactly the Runtime
event shape. It never carries canonical values that supersede an operation
result. On an event with a different revision, the UI invalidates affected
caches and obtains a new snapshot or page. When events are unavailable, UI
uses its own operation results, Host state changes, explicit refresh, or a
bounded `getSnapshot` poll; it does not invent an event channel.

When `RuntimeClient` came from `HostServices.openSource` or `createSource`, the UI calls
`HostServices.close`; Transport invokes Runtime `close` exactly once and then
closes its Connection. A directly embedded Runtime-only surface calls Runtime `close` itself.
It MUST NOT call both for the same client.

### 5.2 HostServices

The UI-facing Host binding is owned by Eidos Adapter Section 13. The following
generated mirror is included for UI implementers and MUST remain mechanically
equivalent; it does not create a second definition:

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

  resolveAsset(
    request: {
      sessionId: string
      entryId: string
      purpose: "thumbnail" | "preview" | "download"
    },
    context: RequestContext
  ): Promise<AssetLease>

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

The facade result records are exactly:

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
```

`HostConflictResult.runtime`, `HostRecoveryResult.runtime`, or an applicable
`HostCommitReconciliationResult.runtime` is present only when the action
creates a new Runtime epoch. UI immediately revokes all references to the
prior client while Host owns its closure, negotiates the new client, and
obtains snapshot/schema before display. It MUST NOT call `HostServices.close`
merely to replace an epoch because that would close the stable Host session.
All prior cursors, schema-plan tokens, previews, subscriptions, and Runtime
undo/redo tokens are invalid; UI clears them rather than probing the new
epoch. A retained UI draft remains non-canonical until explicitly resubmitted
after refresh.
Recovery items reveal no source name or path. `resourceToken` is consumed only
by a Host-approved presenter and is not interpreted as a canonical URI.

`sourceToken`, `destinationToken`, `sessionId`, `conflictToken`,
`recoveryToken`, and `leaseId` are opaque capabilities. The UI MUST compare or
return them only as directed;
it MUST NOT decode, persist beyond their declared lifetime, derive paths from
them, or expose them to an untrusted renderer.

`saveCopy(adopt:"keep-current")` keeps the current session/source state and
returns no Runtime. `adopt-copy` returns a new Runtime epoch and clean state for
the copy. `resolveConflict` requires both `destinationToken` and `adopt`
exactly for `save-copy` and forbids them for the other strategies.

Pre-open `HostServiceCapabilities` declares operation availability only; it
cannot claim source-specific permission, CAS, atomicity, or durability.
`HostCapabilities` in the opened session declares `canWriteCurrent`, `canSaveCopy`,
`canRequestPermission`, `hasRecovery`, `assetReadSchemes`,
`assetWriteSchemes`, `casGuarantee`, `atomicReplace`, and `durability`.
`assetReadSchemes` and `assetWriteSchemes` are arrays of Host-recognized
scheme names, including the special `relative` token or lowercase schemes such
as `data` and `https`; the UI never implements a scheme itself. `casGuarantee` is
`strong`, `cooperative`, or `none`; `atomicReplace` is boolean; `durability`
is `durable` or `best-effort`. `HostLimits` declares exactly
`sourceBytesMax`, `candidateBytesMax`, `assetBytesMax`,
`recoveryBytesMax`, `recoveryEntriesMax`, `recoveryRetentionSecondsMax`, `assetPreviewBytesMax`,
`concurrentAssetLeasesMax`, and `concurrentSessionsMax`. The five byte limits
are non-negative int64 decimal strings; the four count/seconds limits are JSON
integer in `0..2147483647`. Every 1.0 member is present; a missing member is a
protocol error and an unknown future member is ignored. Zero disables the
corresponding size-bearing Host operation or flow and never means unlimited.
In particular, `recoveryRetentionSecondsMax=0` disables recovery; it means
neither immediate expiry nor absence of time-based expiry. Recovery is usable
only when its byte, entry, and retention limits are all positive, and Host
MUST NOT expose a read-write Runtime otherwise. A positive retention value is
a service maximum, not a guarantee that an individual item survives to that
age. The smaller of Host and UI limits controls. UI compares byte limits
losslessly, never through binary64.

Negotiated limits are service maxima. After open and on every state event, UI
uses the effective `HostSessionState.limits`; it does not keep issuing work at
a stale larger maximum.

This is a UI-facing derived capability record, not the Adapter publication
capability record. The composition layer derives `canWriteCurrent` from the
Adapter's `writeCurrent` plus the usable permission/writer-lease state,
`canSaveCopy` from `saveCopy`, `canRequestPermission` from the platform
permission operation, `canReconcileCommit` from the Transport prepared-commit
and Host reopen/reconciliation profile, `hasRecovery` from `recovery`, and the
asset scheme arrays from scoped asset ports. `casGuarantee`, `atomicReplace`, and
`durability` retain the Adapter values. `sourceBytesMax` and
`candidateBytesMax` are lossless decimal byte limits alongside the asset
limits. UI never receives `writerLease` or a
publication port.

The `merge` conflict strategy is displayed only when a separate
Runtime/product merge capability has been negotiated. Adapter or Host support
alone does not define logical merge semantics.

`canReconcileCommit` is true for a Host service that can return a read-write
Runtime over Adapter Transport. It does not grant UI access to a commit
receipt. On Runtime `unknown-commit`, UI treats the old RuntimeClient as
permanently fatal, waits for Host phase `commit-unknown`, and calls only
`HostServices.reconcileCommit({sessionId})` from the trusted application
surface. It MUST NOT call `getSnapshot`, `getRowsById`, retry the mutation, or
send any other operation through the old client.

For outcome `committed`, both replacement `runtime` and validated
`reconciliation` are present. UI uses the operation tag and persistent ID
mappings in that record to settle its pending action, but refetches live
projections from the replacement Runtime. For `rolled-back`, replacement
`runtime` is present and `reconciliation` is absent; UI refreshes first and a
new mutation requires explicit user action. For `conflict`, both are absent
and UI enters the ordinary Host conflict/recovery flow. In the two decided
cases UI atomically replaces the client, negotiates it, fetches a new
snapshot/schema sequence and visible rows, and only then leaves its unknown
edit state. The reconciliation does not resurrect an undo token, returned row
projection, or any other old-epoch generated state, so UI MUST NOT advertise
the reconciled commit as Runtime-undoable. It never receives, displays,
persists, logs, or asks a renderer to handle the Host-private receipt.

`HostServices` is the exact UI-facing `EA-Host-1.0` binding owned by Eidos
Adapter and supplied by the product composition layer. It is not an Adapter
`PublicationPort` and does not expose lower-level operations. Source and destination pickers
belong to that composition layer and produce opaque tokens; they never pass a
path or native handle through UI code.

A reusable Eidos UI library MUST expose `HostServices` as an injected
constructor/provider dependency; it MUST NOT hide relative-path, network, or
Data-URL handling in a package-global resolver. The embedding application
implements `HostServices.resolveAsset`, so it decides how an entry ID is
resolved inside the active session and may deny or omit any scheme.

If the UI framework cannot consume `AssetLease.resourceToken` directly, the UI
library MUST additionally expose an injected presentation binding equivalent
to:

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

`Surface` is a framework-native, non-canonical presentation object and never
crosses Runtime or Adapter Transport. The presenter consumes only the scoped
lease/token; it does not receive a native path, database handle, or permission
to reinterpret the canonical URI. `loadImage` is the optional Canvas-native
equivalent used by Grid renderers: the trusted presenter decodes the lease
token and returns only a drawable image source. Grid MUST NOT construct that
source from `FileEntry.uri` or inspect `resourceToken` itself. The same trusted
composition layer MAY provide both bindings. An absent presenter disables
inline image/open/download actions; an absent `loadImage` disables Canvas
thumbnails only. Both cases still permit the metadata/icon/URI fallback in
Section 10.

### 5.3 Negotiation order

For every session the UI MUST:

1. negotiate `HostServices` before presenting open/create operations;
2. call `openSource` only with a composition-layer token produced from a user
   or embedding-host intent, or `createSource` only with an explicit
   create-only destination token and title;
3. negotiate the returned `RuntimeClient` before requesting a snapshot;
4. derive enabled features and request sizes from both descriptors;
5. fetch the bounded `RuntimeSnapshot` header;
6. page schema from that exact revision with `getSchemaPage`; and
7. render canonical content only after File ID, revision, and the descriptors
   needed for that surface are known.

`RuntimeSnapshot` contains File identity/title/default Table and decimal-string
schema counts; it does not embed Tables, Fields, Views, or features. The first
schema request is exactly `{revision:snapshot.revision,limit}` with cursor
absent and `limit` in `1..schemaPageSizeMax`. UI returns each `nextCursor`
unchanged until null, and verifies every page's File ID/revision, descriptor
shape, stable-ID uniqueness, and the final counts against `schemaCounts`.
Objects retain Runtime's feature/Table/Field/View block order. A different
page revision or `stale-revision` discards the entire partial schema sequence
and restarts from a new snapshot; UI never combines descriptors across
revisions.

UI MAY render a shell and progressively index validated pages, but it MUST NOT
render a Table/View/cell control before all descriptors needed to interpret
that surface are present. A published lower UI schema-object limit is enforced
as an accessible resource-limit state; it does not justify silently omitting
objects or pretending the Runtime header was a complete schema.

Protocol-major mismatch is fatal for that session. Unsupported optional
capabilities produce a disabled or absent control with an accessible reason;
they do not cause speculative calls.

## 6. Logical value binding at the UI boundary

This section defines UI handling of the Runtime binding; Runtime 1.0 remains
the owner of value meaning.

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
      "name": "Payload",
      "valueType": "json",
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
        "null",
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

Rules:

1. Each `ColumnDescriptor` is exactly
   `{fieldId,name,valueType,source,writable}`. `source` is `stored`, `formula`,
   `lookup`, or `inverse-relation`; no physical name exists in the UI
   projection. Columns are unique and follow requested Field order. Each Row
   `values` array has exactly the same length and index meaning. `name` is for
   presentation and never identifies a value.
2. A Field absent from `columns` was not projected. A present array member
   `null` is a projected logical null. Empty string, false, numeric zero, and empty
   list remain distinct.
3. Text, URL, Select, Date, and Datetime arrive as strings. The UI MUST NOT
   normalize or rewrite them merely for display.
4. Integer arrives as a canonical base-10 int64 string. Input, comparison for
   draft equality, clipboard round-trip, and mutation submission MUST remain
   lossless; converting through a binary64 `number` is forbidden.
5. Number arrives as a finite JSON number, with negative zero normalized to
   zero. NaN and infinities are never valid values.
6. Checkbox arrives as boolean; NULL is not false.
7. JSON arrives as canonical JCS text. A logical null is JSON `null` in the values
   array; a JSON literal null is the JSON string `"null"`. A UI MAY parse that
   text for editing, but MUST submit canonical JCS text and preserve JSON type,
   object keys, array order, and exact string values.
8. Multi-select arrives as an ordered unique string array. Select option names
   are the values; there is no Option ID.
9. A forward or inverse Relation arrives as an ordered Row-ID array. When
   `ProjectionSpec.resolveRelations` is empty, `resolvedRelations` is absent.
   Otherwise it is present on every row, has exactly one entry for each
   requested Relation column, is ordered by ascending `column`, and refers
   only to a projected Relation column. Its `items` length, IDs, and order
   exactly match `values[column]`. An item is
   either `{id,state:"unresolved"}` or
   `{id,state:"resolved",labelFieldId,labelType,label}`. A resolved label MAY
   be null; an unresolved item has no `label*` members. Labels MUST never
   replace the ID array in a mutation.
10. File arrives as an ordered array of File-entry objects. Each entry's
    `size` is a non-negative int64 decimal string and MUST remain lossless.
    The UI passes an entry's `id` to `HostServices.resolveAsset`; it MUST NOT
    fetch, resolve, or join the entry URI itself. The canonical `uri` remains
    available only as inert display/copy text and the Section 10 fallback;
    relative, `https:`, and `data:` use the same Host call.
11. Formula and Lookup results use their declared Runtime result type. A list
    result remains a list; the UI MUST NOT flatten it into comma-delimited
    Text for editing.
12. System Row ID and timestamps are ordinary projected logical values with
    read-only roles supplied by Field metadata.

Columnar pages are the only Runtime read-row representation. A UI MAY build a
temporary Field-ID index for convenience, but MUST NOT expose or persist a
second canonical row shape. Sparse insert/update mutations remain
Field-ID-keyed maps so omitted Fields are unambiguous and no positional write
can target the wrong Field.

This is a material wire-size choice, not opacity for its own sake. A page of
100 rows by 20 Fields would repeat 72,000 UTF-8 bytes of 36-character Field
IDs in keyed row objects, versus 720 bytes in one column header: 71,280 bytes
saved before JSON quotes and separators. The descriptors still expose stable
Field IDs and logical types; no physical name or private code is required.

`ProjectionSpec` is exactly `{fields:FieldId[],resolveRelations:FieldId[]}`.
`RowPage` is exactly
`{fileId,tableId,revision,projectionHash,columns,rows,nextCursor,previousCursor}`;
each cursor is explicitly a string or null. `projectionHash` is lowercase
hex SHA-256 over the JCS object `{"fields":[...],"resolveRelations":[...]}`.
`fields` has no duplicates; `resolveRelations` is deduplicated and ordered by
its occurrence in `fields`, is a subset of `fields`, and contains only
Relation Fields. The UI verifies page shape before rendering and
never treats a display name as a lookup key. Columns follow `fields`; rows
follow Runtime query order.

Runtime schema pages consumed by UI expose stable IDs, display names, logical
types, roles, settings, definitions, positions, and write flags; they never
expose `physical_name`, quoted identifiers, generated SQL, or native metadata.
A transport that adds any of those members is not this binding, and UI MUST
NOT forward them to renderers.

`getRowsById` accepts unique Row IDs; duplicates are `invalid-request`. It
returns `RowBatch`, which shares
`{fileId,tableId,revision,projectionHash,columns,rows}` with `RowPage`, has no
cursor, and adds `missingRowIds`. Existing rows and missing IDs each retain
their respective request order. The UI MUST use `missingRowIds`, not infer
absence from a positional hole.

Formatting is presentation state. A UI MAY localize Number, Integer, Date,
Datetime, and Checkbox output, but copy-as-raw, edit initialization, and
mutation submission MUST use the Runtime binding. A display formatter MUST
not be used as a parser unless it round-trips the entire logical domain.

## 7. State ownership and invalidation

| State                                                                                                  | Authority                               | UI rule                                                         |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------- |
| source rows, metadata, saved View query/layout, field settings                                         | File canonical state exposed by Runtime | display only from a Runtime result; mutate only through Runtime |
| Formula/Lookup/inverse results, resolved labels, query pages, aggregates, dependency reports           | Runtime-generated state                 | cache only under File ID, revision, and request hash            |
| file handle, locks, recovery journal, publication version, permission grant, asset capability          | Host-private state                      | refer to opaque tokens only                                     |
| focus, selection, scroll, open panels, draft text, optimistic overlay, local undo cursor, placeholders | UI state                                | never submit unless an explicit canonical mutation requires it  |

The cache key for a page MUST include File ID, revision, Table ID, canonical
query hash, projection hash, cursor, and direction. A revision change
invalidates every page, aggregate, resolved label, preview, and schema
preflight token that is not explicitly returned as valid for the new
revision. It also invalidates a partial ordinary schema-page sequence; a
schema-plan dependency sequence remains readable only under its retained
plan token and immutable base revision as Runtime specifies. An optimistic
overlay is stored separately from the page cache.

A missing or NULL Record Label MAY be shown as a localized placeholder. The
placeholder is never a logical value, is never copied as raw data, and MUST
NOT be sent in a Relation or row mutation.

## 8. Standard View layout JSON

### 8.1 Ownership and preservation

`ViewDescriptor` exposes `type` and canonical `layout`; this section
owns the meaning of core layout keys. The Runtime treats unknown layout
members as opaque canonical metadata. A UI updating one known key MUST
preserve every unknown member and every known member it did not update. It
MAY send a Runtime-supported member patch or merge the change into the latest
object under `expectedRevision`; it MUST NOT parse and rewrite a stale copy.

The same root schema is used by `grid`, `gallery`, and `kanban`. A key not
applicable to the current type is preserved and ignored. This allows an
explicit type change and reversal without losing layout intent.

View configuration has two independent classifications. `query.filter` and
`query.sort` are common functional configuration whose row-set semantics are
owned by Runtime. Layout keys are either common or renderer-specific. Some
renderer-specific keys, such as `groupField` and `columnStats`, select a
Runtime operation, but they remain layout recipes: returned groups and
aggregate values are generated state and MUST NOT be copied into layout. A UI
MUST NOT treat "functional versus presentation" as equivalent to "common
versus View-specific".

Core layout never stores Row IDs, cell/group values, resolved labels,
selection, scroll, hover, open editor, or collapsed transient groups. Those
are query results or UI state.

### 8.2 Configuration registry and defaults

The applicability column is normative. An Editor MUST expose the common Field
layout on every standard View and MUST expose type-specific controls only when
the key applies. A non-applicable key is preserved but has no rendering or
request effect.

| Key                   | Type                             | Default                                | Applies to     | Class                        | Meaning                                                                         |
| --------------------- | -------------------------------- | -------------------------------------- | -------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| `fieldOrder`          | unique Field-ID array            | metadata Field position, then Field ID | all standard   | common presentation          | leading-to-trailing Field order                                                 |
| `hiddenFields`        | unique Field-ID array            | `[]`                                   | all standard   | common presentation          | ordinary Fields omitted from the View, never deleted                            |
| `visibleSystemFields` | unique Field-ID array            | `[]`                                   | all standard   | common presentation          | optional hidden system Fields explicitly shown in this View                     |
| `fieldWidths`         | Field-ID to number map           | `{}`; missing entry is `1`             | Grid           | Grid presentation            | preferred dimensionless relative width, range `0.25..8`                         |
| `rowDensity`          | `compact\|standard\|comfortable` | `standard`                             | Grid           | Grid presentation            | semantic row-density hint                                                       |
| `freezeColumns`       | non-negative integer             | `1`                                    | Grid           | Grid presentation            | count of leading visible Fields kept frozen, clamped to the visible count       |
| `columnStats`         | Field-ID to `{type}` map         | `{}`                                   | Grid           | Grid functional recipe       | requested per-column aggregate footer; values are generated by Runtime          |
| `cardFields`          | unique Field-ID array            | `[]`                                   | Gallery/Kanban | Card presentation            | ordered secondary card Fields; Record Label is always the title                 |
| `coverField`          | Field ID or `null`               | `null`                                 | Gallery/Kanban | Card presentation            | File Field used as card cover                                                   |
| `coverFit`            | `cover\|contain`                 | `cover`                                | Gallery/Kanban | Card presentation            | semantic cover fitting hint                                                     |
| `cardSize`            | `small\|medium\|large`           | `medium`                               | Gallery/Kanban | Card presentation            | semantic card-size hint                                                         |
| `hideEmptyFields`     | boolean                          | `true`                                 | Gallery/Kanban | Card presentation            | omit a configured secondary Field when its logical value is empty               |
| `groupField`          | Field ID or `null`               | `null`                                 | Kanban         | Kanban functional recipe     | grouping Field; `null` is an incomplete configuration                           |
| `showEmptyGroups`     | boolean                          | `true`                                 | Kanban         | Kanban presentation/function | show zero-row groups derived from the grouping Field's canonical option catalog |

`columnStats[*].type` is exactly one of `count-all`, `count-non-null`,
`count-distinct`, `count-empty`, `percent-checked`, `percent-unchecked`, `sum`,
`average`, `min`, `max`,
`relation-value-count`, `relation-row-count`, or
`relation-distinct-target-count`. UI enables only Runtime-compatible choices
for the Field, sends the corresponding `AggregateRequest`, and displays only a
matching revision-bearing result. The aggregate result is never persisted.

`percent-checked` and `percent-unchecked` apply only to Checkbox Fields. Their
denominator is every row in the active Runtime query. `percent-checked` counts
canonical true values; `percent-unchecked` counts false and SQL NULL values,
matching the standard unchecked Checkbox interaction while `count-empty`
remains available to distinguish NULL. An empty result is `0`; other results
are numbers in `0..100`, rounded to at most two decimal places for display.

An ordinary Field's visibility is controlled by `hiddenFields`. An optional
system Field's visibility is controlled only by `visibleSystemFields`; placing
the same system Field in `hiddenFields` has no additional effect. IDs whose
current Field role does not match the key are preserved and ignored. A
conforming Editor provides one discoverable Field control for every standard
View that can show/hide every current configurable Field and update
`fieldOrder`. It MUST preserve unknown/deleted IDs while editing current
Fields and MUST expose a recovery path even when the View currently has zero
visible Fields.

Widths and size tokens do not mandate pixels, a grid library, a breakpoint,
or a rendering engine. Implementations choose physical presentation while
preserving relative order and semantic size distinctions.

Unknown or deleted Field IDs are preserved in layout JSON but ignored during
rendering. If an ID becomes valid again, its prior layout applies. Duplicate
IDs in a core array are invalid UI output; when reading such input, the UI
uses the first occurrence for rendering, preserves the original value until
an explicit layout edit, and reports an advisory diagnostic.

Grid renders visible Fields in `fieldOrder`, followed by remaining visible
Fields in metadata order. Gallery and Kanban use the Table Record Label as the
card title and `cardFields` as secondary content. A `cardFields` member also
present in `hiddenFields` is omitted. A `coverField` that is
missing, hidden, non-File, NULL, empty, denied, or unresolved yields a
non-persisted placeholder. Kanban with `groupField:null` MUST show an
accessible configuration-required state, not invent a Field. A non-groupable
Field produces the same state with the Runtime diagnostic.

The common Fields control and Card configuration form a two-stage pipeline,
not competing visibility controls. Fields owns common View availability
(`hiddenFields`/`visibleSystemFields`), common `fieldOrder`, and the entry to
the Field's schema properties. Card configuration owns only card-specific
content and presentation: `cardFields`, cover, fit, size, and empty-value
handling. Its Card content chooser offers only Fields currently visible in the
View, and dragging there changes only `cardFields`. Hiding a Field in Fields
always wins and Card configuration MUST NOT make it visible again. Unknown or
temporarily unavailable `cardFields` members remain preserved while editing
the currently available members.

With `showEmptyGroups:false`, a Kanban omits a catalog group after Runtime has
authoritatively reported zero rows for the active revision and saved query.
That option remains a valid move target; a successful move makes the group
visible. Before counts resolve, omission is provisional UI state and MUST NOT
be persisted. `freezeColumns` is evaluated after visibility and ordering.

A Kanban move is available only when `groupField` is a writable stored scalar
and Runtime supplies the destination's exact logical group value. The move is
one sparse `mutateRows` update under `expectedRevision`; the UI never writes a
display label as the group value. Formula, Lookup, inverse Relation, list, and
read-only groups cannot accept a move. Card order is Runtime query order;
dragging within a group is ephemeral because this core layout has no manual
row-order key.

### 8.3 Executable JSON Schema

Conformance tools validate an envelope assembled from the stored View type and
parsed layout object. The envelope itself is not stored.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://spec.eidos.space/ui/1.0/view-layout.schema.json",
  "title": "Eidos UI 1.0 standard View layout envelope",
  "type": "object",
  "required": ["type", "layout"],
  "properties": {
    "type": { "enum": ["grid", "gallery", "kanban"] },
    "layout": {
      "type": "object",
      "properties": {
        "fieldOrder": { "$ref": "#/$defs/fieldIdArray" },
        "hiddenFields": {
          "$ref": "#/$defs/fieldIdArray",
          "default": []
        },
        "visibleSystemFields": {
          "$ref": "#/$defs/fieldIdArray",
          "default": []
        },
        "fieldWidths": {
          "type": "object",
          "propertyNames": { "$ref": "#/$defs/fieldId" },
          "additionalProperties": {
            "type": "number",
            "minimum": 0.25,
            "maximum": 8
          },
          "default": {}
        },
        "rowDensity": {
          "enum": ["compact", "standard", "comfortable"],
          "default": "standard"
        },
        "freezeColumns": {
          "type": "integer",
          "minimum": 0,
          "maximum": 2147483647,
          "default": 1
        },
        "columnStats": {
          "type": "object",
          "propertyNames": { "$ref": "#/$defs/fieldId" },
          "additionalProperties": { "$ref": "#/$defs/columnStat" },
          "default": {}
        },
        "cardFields": {
          "$ref": "#/$defs/fieldIdArray",
          "default": []
        },
        "coverField": {
          "oneOf": [{ "$ref": "#/$defs/fieldId" }, { "type": "null" }],
          "default": null
        },
        "coverFit": { "enum": ["cover", "contain"], "default": "cover" },
        "cardSize": {
          "enum": ["small", "medium", "large"],
          "default": "medium"
        },
        "hideEmptyFields": { "type": "boolean", "default": true },
        "groupField": {
          "oneOf": [{ "$ref": "#/$defs/fieldId" }, { "type": "null" }],
          "default": null
        },
        "showEmptyGroups": { "type": "boolean", "default": true }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": false,
  "$defs": {
    "fieldId": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "fieldIdArray": {
      "type": "array",
      "items": { "$ref": "#/$defs/fieldId" },
      "uniqueItems": true
    },
    "columnStat": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": {
          "enum": [
            "count-all",
            "count-non-null",
            "count-distinct",
            "count-empty",
            "percent-checked",
            "percent-unchecked",
            "sum",
            "average",
            "min",
            "max",
            "relation-value-count",
            "relation-row-count",
            "relation-distinct-target-count"
          ]
        }
      },
      "additionalProperties": false
    }
  }
}
```

JSON Schema annotations such as `default` do not mutate an instance. The
reading defaults in Section 8.2 apply when keys are absent. The schema uses
JSON Schema Draft 2020-12 Core and Validation.

### 8.4 Unknown View types

An unknown `view.type` remains valid forward-compatible metadata. A UI without
a registered renderer MUST show the View name, unknown type, and an accessible
unsupported-renderer state. It MAY offer an ephemeral read-only Grid fallback
without changing the saved type or layout. Conversion to a standard View is
an explicit, revision-checked mutation. Unrelated View edits MUST preserve the
unknown type and layout exactly in logical content.

## 9. Bounded reads, projection, and rendering

### 9.1 Request construction

A UI MUST request only the Fields needed for the current surface: visible
Fields, Record Label, card/group fields, and Runtime-required query outputs.
It MUST request Relation labels in the page projection rather than issue one
read per Relation cell. It MUST use `getRowsById` for a bounded batch that is
not naturally pageable; `getRowsById` in a row or cell render loop is
forbidden.

The default page limit is `min(100, limits.pageSizeMax)`. A UI MAY choose a
smaller value for constrained devices. It MUST NOT exceed the negotiated
limit. `ProjectionSpec.fields` stays within `projectionFieldsMax`,
`getRowsById.rowIds` within `rowsByIdMax`, and the default group-page limit is
`min(50, groupPageSizeMax)`. It MAY prefetch at most one adjacent page in each
direction and SHOULD
keep no more than three page reads unresolved for one View. A conforming UI's
default cache is bounded by the first of eight pages or 10,000 projected
row-field values; implementations MAY expose a user-configurable higher
limit.

Cursor paging is the baseline. A cursor is opaque and scoped by Runtime; the
UI only returns it. A UI MUST NOT decode a cursor, synthesize an offset from
it, or reuse it after query, projection, File ID, or revision changes.

`aggregate` returns one `AggregateResponse`, not a bare result array. Before
display, UI verifies its File ID, Table ID, revision, result count, and
request-key order. A different active revision triggers the same snapshot
reconciliation as a row page; UI does not combine an aggregate from one
revision with rows from another and present them as one result.

`groupRows` returns the first bounded rows for every returned group. When a
group's `nextRowCursor` is non-null, UI passes it unchanged to
`queryGroupRows({cursor,limit,direction?})`; it MUST NOT repeat `groupRows`,
construct an ordinary row query, or locally guess membership to continue that
group. A `GroupRowPage` is accepted only when File/Table/revision,
projection hash, columns, and exact group key still match the mounted group.
Its forward/backward cursors and display-order rule are consumed exactly like
ordinary row cursors. Group-page cursors continue `groupRows`; row cursors
inside one group continue only through `queryGroupRows`; the namespaces are
never interchanged.

### 9.2 Virtualization

Grid, Gallery, and Kanban MUST remain interactive without materializing all
rows. Virtualization is an implementation technique, not canonical state. A
virtual item is keyed by Row ID, not visual index. Reordering, filtering, or a
new revision therefore cannot transfer a draft or selection to a different
row.

The UI MAY use Runtime totals as estimates. It MUST tolerate an unknown or
changing total, preserve the user's focused Row ID when still present, and
announce material result-count changes. Scroll offset, measured sizes, and
prefetch position MUST NOT be persisted into `ViewDescriptor.layout`.

### 9.3 Latest-wins rule

Each mounted result surface maintains a monotonically increasing local
generation. Changing Table, View, query, search, projection, or revision:

1. increments the generation;
2. requests cancellation of older reads;
3. starts reads tagged with the new generation; and
4. applies a response only when its generation and request hash still match.

Late success, late error, and late cancellation from an older generation are
discarded. This rule is required even when the transport claims cancellation,
because cancellation can race completion.

Before applying a current-generation `RowPage`/`RowBatch`, UI verifies File
ID, Table ID, projection hash, column/value lengths, resolved Relation
invariants, and revision. A page revision different from the active snapshot
causes snapshot reconciliation before display; UI does not splice rows from
two revisions into one surface.

### 9.4 No local semantic execution

The UI MAY show a debounced preview but the committed row set, order, groups,
aggregates, Formula, Lookup, Relation resolution, NULL behavior, and search
results MUST come from Runtime. A UI MUST NOT apply a second locale sort or
filter to a Runtime page and present it as the saved View result. Client-side
sorting of an explicitly labeled, fully loaded, ephemeral selection is not a
saved View operation.

## 10. Field presentation and editability

The Runtime `ColumnDescriptor.writable`, Field role, and negotiated write
capability determine editability. The UI MUST NOT infer write permission from
`valueType` or `source`. `writable:false` means the UI MUST NOT offer a cell
commit; it does not mean the value is unavailable for filter, sort, copy, or
display.

| Field or role                        | Presentation                                           | Cell editability                                                                         |
| ------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Text, URL                            | scalar text; URL is inert until explicit activation    | editable stored value                                                                    |
| Number                               | localized finite number with raw-copy path             | editable stored value                                                                    |
| Integer                              | lossless decimal input; optional localized display     | editable stored value                                                                    |
| Integer with `display.kind="rating"` | rating affordance plus accessible numeric value        | editable Integer; display min/max guide input but MUST NOT clamp existing values         |
| Checkbox                             | tri-state when nullable                                | editable stored value                                                                    |
| Date                                 | calendar date with no timezone                         | editable stored value                                                                    |
| Datetime                             | localized instant with explicit display timezone       | editable stored value                                                                    |
| JSON                                 | structured or textual JSON editor                      | editable stored value after Runtime validation                                           |
| Select                               | raw option name with catalog color/label decoration    | editable; unconfigured raw names remain selectable/displayable                           |
| Multi-select                         | ordered raw option-name chips                          | editable; order is preserved                                                             |
| File                                 | image preview, then type icon, then inert URI fallback | editable only through `acquireAsset` and a Runtime mutation                              |
| forward Relation                     | ordered target Row IDs with separately resolved labels | editable through a paged target selector                                                 |
| inverse Relation                     | generated source Row IDs                               | read-only                                                                                |
| Formula                              | generated declared result                              | read-only; definition belongs to Schema UI                                               |
| Lookup                               | generated scalar or list                               | read-only; definition belongs to Schema UI                                               |
| Row ID, created time, updated time   | system value                                           | read-only                                                                                |
| unknown optional Field kind          | typed/raw fallback with diagnostic                     | read-only unless a registered isolated renderer has an explicit scoped writer capability |

The Table's current Record Label Field supplies row titles everywhere,
including Relation selectors. There is no assumed `Title` or `Name` Field.
Changing the Record Label role is a schema operation. Relation presentation
MUST update dynamically after the label value or role changes; a resolved
label MUST never be written back into a Relation cell.

Every user-facing Field-type selector, including create, conversion, CSV
mapping, and Formula result/display controls, MUST pair the localized type label
with the same canonical Field-type icon in both its closed trigger and every
menu row. The icon is supplemental: the visible label and accessible name remain
required.

Whenever a configured Select or Multi-select option is shown in a Grid editor,
record surface, filter control, card, group, or other standard UI surface, the
UI MUST preserve its catalog color decoration and visible option name. A known
catalog color MUST NOT degrade to text-only presentation. Color is never the
only carrier of the option value or selection state.

An unresolved Relation item displays its Row ID plus a localized unresolved
status in its original position. It is not an empty Relation and is never
silently removed. Detach is an explicit ordered-ID mutation; resolving later
replaces only generated presentation.

An option catalog is decoration and input assistance. A value missing from the
catalog is shown as an unconfigured raw value, not replaced or dropped.
Renaming an option invokes Runtime's option-rename schema/data migration; a UI
MUST NOT implement it as a label-only edit.

An explicit Create option action in a Select or Multi-select editor first
commits the complete updated Field option catalog. Only after that metadata
mutation succeeds may UI submit the cell value against the returned revision.
If the catalog mutation is rejected or stale, UI does not issue the cell
mutation. If the later cell mutation fails, the catalog entry remains a valid
zero-use option. This user action is distinct from forbidden implicit option
inference during CSV import.

Date input sends the calendar value unchanged. Datetime display uses a
user- or Host-selected IANA time-zone identifier and clearly exposes it near
the editor. Input in a DST overlap or gap MUST require an unambiguous instant
or offset before submission. The submitted value follows Runtime's canonical
UTC binding. Locale and timezone choices are UI state unless an extension
explicitly defines canonical settings.

An ordinary URL Field remains inert and MUST NOT be fetched merely because a
cell becomes visible. File presentation follows this deterministic ladder:

1. For an entry whose declared `mediaType` is `image/*`, UI SHOULD request a
   `thumbnail` lease while the item is on a rendered surface and use the
   injected `AssetPresenter` to render the returned resource as an image. The
   request is allowed only when `canUseAssets`, the entry's URI class, current
   Host policy, byte/decode limits, and concurrent-lease limits permit it.
   `https:` therefore never causes an unapproved network request; a canonical
   inline Data URL uses the same Host boundary despite requiring no network.
   A Canvas-backed Grid uses `AssetPresenter.loadImage`, redraws the affected
   cell when decoding completes, and releases the lease when the row leaves
   its bounded render window. It MUST fall back rather than using the
   canonical URI when this optional presenter method is absent.
2. While a thumbnail is pending, denied, unsupported, unsafe, over limit, or
   failed, and for every non-image entry, UI SHOULD show a non-executing icon
   selected from a trusted mapping of the declared media-type family. It MAY
   use a filename suffix only as a display hint, never as authority. Unknown
   types use a generic file icon. Icons do not require asset resolution.
3. If graphical icon presentation is unavailable, UI MUST show the inert raw
   `uri` as selectable/copyable text. Every File surface MUST make that URI
   fallback available through an accessible detail or copy action even when a
   preview or icon succeeds. Long values MAY be visually elided, but lossless
   copy exposes the complete string.

The entry `name` remains the primary accessible label throughout the ladder;
media type and lossless size SHOULD remain discoverable. Open/download is an
explicit user action: UI requests the corresponding Host lease and passes it
to `AssetPresenter.activate`. It never navigates to the canonical URI. Preview
or activation failure leaves the File entry, name, metadata, and URI fallback
visible with a diagnostic and never mutates the value.

## 11. Row editing and optimistic state

### 11.1 Atomic commits

Keystrokes change a draft, not canonical state. A commit sends one
`mutateRows` request containing Field-ID-keyed logical values and the latest
known `expectedRevision`, plus a `returning` projection for every value needed
after commit. A success is applied from `returnedRows` and revision; if the UI
omitted `returning`, it refetches before displaying committed derived values.
It MUST NOT construct an authoritative success row from its draft.

Multi-cell paste is parsed and validated locally only as a preview, then sent
as one atomic Runtime mutation. If the rectangle exceeds negotiated row,
cell, or byte limits, the UI MUST refuse the single paste or offer an
explicitly labeled chunked import whose partial-commit behavior is disclosed
before execution. It MUST NOT silently split an ordinary paste.

Delete operates on stable Row IDs captured from the selected revision. A
visual range is converted to Row IDs before the delete request. The UI shows
the count and Relation/dependency consequences returned by Runtime preflight
when available. It MUST NOT translate a changed visual index range into a
different set of rows.

A successful result with `changed:false` is a no-op: the UI removes its draft
or overlay but does not invent a new revision, timestamp, dirty state, or undo
entry. `not-found` changes nothing. A batch containing duplicate or
overlapping Row IDs is an `invalid-request`; the UI fixes its selection and
submits a new request rather than treating part of the batch as committed.

### 11.2 Optimistic state machine

Each edit batch follows this state machine:

| State        | Allowed next states                         | Required behavior                                                                                                                                                  |
| ------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `clean`      | `drafting`                                  | canonical Runtime result is visible                                                                                                                                |
| `drafting`   | `submitting`, `clean`                       | draft is visibly distinguishable; Escape/cancel discards it                                                                                                        |
| `submitting` | `committed`, `rejected`, `stale`, `unknown` | optional optimistic overlay is UI-only; duplicate submit disabled                                                                                                  |
| `committed`  | `clean`                                     | replace with returned row/revision, invalidate old caches, announce success when needed                                                                            |
| `rejected`   | `drafting`, `clean`                         | remove overlay, retain correctable input, associate Runtime diagnostics with fields                                                                                |
| `stale`      | `drafting`, `clean`                         | remove overlay, refresh, show conflict; no automatic retry                                                                                                         |
| `unknown`    | `clean`, `drafting`                         | revoke the old Runtime client; reconcile only through Host, install the returned epoch, then refetch before deciding whether a new user-submitted mutation is safe |

Only one unresolved mutation may own an optimistic overlay for the same Row
and Field. Separate non-overlapping mutations MAY be in flight if Runtime
negotiation permits it, but their expected revisions and completion order
remain authoritative. The simplest conforming Editor serializes mutations.

On `stale-revision`, a UI MAY offer a three-way merge for a row update only
after fetching the current row. Disjoint Field edits MAY be proposed for
reapplication with the new revision. Overlapping Fields, deletes, option
renames, Relation policy effects, schema changes, and lossy conversions
require explicit user choice. No stale mutation is auto-replayed.

### 11.3 Undo and redo

Undo is a new Runtime mutation, never a byte rollback. The UI records, per
committed action, the returned revision, affected stable IDs, and
Runtime-provided undo token. The undo request uses the current revision and
calls `revertMutation`; success consumes that token and redo uses the inverse
token returned by the result. The UI removes every token named by
`evictedUndoTokens`. It may continue with the next earlier token after undoing
a later action because Runtime tests complete affected-state applicability,
not the token's original revision. A successful schema mutation clears the
UI's row undo/redo history because Runtime invalidates those tokens.

An Editor MUST support undo and redo for successful single-row edits and one
atomic paste/delete while the session remains open. It therefore requires
negotiated `mutationUndo`/`revertMutation`; without them the product cannot
claim `EU-Editor-1.0`. It MUST NOT claim undoability and then
reconstruct incomplete Relation or delete effects. Any intervening conflicting
revision turns undo into a conflict flow rather than an unconditional write.

Cancel before submission discards UI state. Cancel after submission requests
Runtime cancellation but waits for the authoritative settlement: known
rollback becomes `rejected`, committed success wins, and only
`unknown-commit` enters `unknown` and the Host reconciliation flow. It is not
Undo.

### 11.4 CSV operations

CSV export and import are independently negotiated. UI offers export only
when `csvExport=true`/`exportCsv` is present, and import only when
`csvImport=true`/`importCsv` is present; a read-only binding can therefore
export without importing. It does not infer one capability from the other.

An export submits stable Field IDs and consumes the returned owned CSV octets
at the result's File/Table/revision. UI never treats those bytes as JSON,
base64-encodes them into a Runtime payload, or presents rows at another
revision as the same export. An import submits explicit CSV-index-to-Field-ID
mapping, owned UTF-8 bytes no larger than `csvBytesMax`, and the current
`expectedRevision`. Header names are advisory and never resolve Fields.
Returned `createdRows` and revision are authoritative; a changed import follows
the same dirty state, unknown-commit reconciliation, and optional undo-token
rules as row mutation. UI may preview parsing, spreadsheet-formula risks, and
batching, but Runtime remains authoritative and UI MUST NOT silently split one
atomic import or auto-create option values.

## 12. Schema and View editing

### 12.1 Two-phase contract

Every Table/Field structural change, Field conversion, Record Label change,
option rename, and destructive delete uses two phases:

1. `preflightSchema({change, expectedRevision})` returns a plan token,
   classification (`metadata-only`, `lossless-rewrite`, `explicit-lossy`, or
   `forbidden`), affected row count, total dependency count and first
   dependency page, warnings, value-change summary, truncation flags, and
   expiry/binding information.
2. The UI presents that structured result and, if allowed, calls
   `mutateSchema({planToken, expectedRevision, actionsHash,
confirmLossy:true?})`.

The token is opaque and bound by Runtime to File, revision, and exact change.
The UI MUST NOT edit, reuse after revision change, or manufacture it. A
returned `fileId` MUST match the active File and `actionsHash` MUST be sent
unchanged with that token. A
`forbidden` plan cannot be applied. `explicit-lossy` requires a separate
confirmation identifying what will be lost; the boolean is sent only after
that action. A stale or expired plan returns to preflight.

Local name, Formula, type, or layout checks are advisory. The commit control
MUST still use Runtime preflight/application, and Runtime diagnostics replace
or augment local diagnostics.

`dependencyCount` is the total decimal-string count. The initial
`dependencies` array is the first ordered page; when `dependencyCursor` is
present, UI obtains every continuation with
`getSchemaPlanDependencies({planToken,cursor,limit})`, returning each
`nextCursor` unchanged until null. Before accepting a page, it requires
`page.fileId === preflight.fileId === activeSnapshot.fileId`, and verifies the
base `revision`, unchanged `dependencyCount`, stable-ID uniqueness, and
table/field/view then ID order. A plan expiry/eviction restarts preflight; a File revision change
prevents application even though Runtime may still serve the immutable
dependency pages. UI MUST provide a bounded paged disclosure of the complete
dependency set and MUST NOT apply a destructive/lossy plan before the user has
had an opportunity to traverse it. A File-ID mismatch is a protocol or stale-
session failure; UI rejects the page and never displays it as dependency data.

`warningsTruncated` and `valueChangesTruncated` are independent. When either
is true, UI visibly says that additional ordered details were omitted by the
negotiated diagnostic limit; it still shows classification, `affectedRows`,
and `dependencyCount`, which are never truncated. It MUST NOT relabel the
visible prefix as a complete impact report.

### 12.2 Rename and conversion

A rename request from UI contains the stable object ID and the new display
name only. It MUST NOT contain `physical_name`, quoted SQL, fallback prefixes,
or generated Formula SQL. Runtime owns reference rewriting and physical-name
derivation.

Changing only rating presentation settings is an Integer display-settings
edit, not a Field conversion. A type conversion uses the Runtime conversion
matrix and plan classification. The UI MUST show whether the operation is
metadata-only, a lossless rewrite, explicitly lossy, or forbidden; it MUST NOT
infer safety from SQLite coercion or a sample alone.

UI constructs the exact tagged `convert-field` leaf. A scalar/JSON
destination always includes `toNullable`; Multi-select/File omits it; Relation
instead includes the complete forward Relation definition. Selected
conversion controls become the unique `policies` array in Runtime's canonical
policy order. UI MUST NOT send a singular `policy`, an irrelevant policy, an
implicit nullability choice, or an incomplete Relation target.

Deleting the current Record Label Field requires a valid replacement in the
same proposed schema change. Deleting a referenced Field/Table shows the full
Runtime dependency report. A UI MUST NOT hide dependencies merely because
their View or Field is currently hidden.

### 12.3 View changes

View name, type, saved query, and layout are canonical mutations with
`expectedRevision`. Search text, current tab, selection, collapsed UI panels,
scroll, and hover are UI state and MUST NOT be written into View metadata.

A `create-view` always supplies an explicit canonical int64-decimal
`position`; an update changes order only through `patch.position`. UI derives
that value from the latest View descriptors and, when no in-range insertion
position remains, submits an intentional atomic set of position patches. It
MUST NOT omit create position, expect Runtime to append, or use visual array
index as persistent identity.

When editing layout, the UI updates only keys defined in Section 8 and
preserves unknown keys. When editing the saved query, it sends Field IDs and
Runtime logical filter values; it never sends display or physical names.
Runtime is authoritative for operator/type compatibility and query results.

The common Fields control and the applicable Grid/Card/Kanban controls from
Section 8 are required Editor surfaces, not optional authoring conveniences.
Each control commits one revision-checked View mutation, remains usable when
the current renderer has no rows or no visible Fields, and reflects the latest
returned View descriptor after success or conflict.

Within the standard workbar query/layout action cluster, controls appear in
the stable order **Search, Filter, Sort, Fields**. Search is the leftmost
non-contextual action and Fields immediately follows Sort. Schema creation
(`+ Property`) and host actions follow that cluster and remain distinct from
Fields because they create or operate on resources rather than configure the
active View.

Fields is the single primary Field-browsing surface. Each row has separate,
unambiguous targets: its visibility checkbox updates View visibility, its drag
handle updates the applicable Field order, and its name/type target opens
Field schema properties. Activating one target MUST NOT trigger either of the
others. Grid column-header property commands MAY remain as contextual
shortcuts, but an Editor MUST NOT require users to discover a separate
structure menu to inspect a Field.

### 12.4 Structural ordering interaction

Table, View, and Field ordering use one direct-manipulation interaction model.
Whenever a product exposes canonical Table `position`, View `position`,
`fieldOrder`, or `cardFields` ordering, it MUST provide a visibly identifiable
drag affordance, use the same drag-handle pattern across those surfaces, and
MUST NOT provide separate **Move up**, **Move down**, up-arrow, or down-arrow
buttons or menu commands for that structural reorder.

The reorder affordance MUST be keyboard operable. `Space` or `Enter` starts
and completes a keyboard drag, directional arrow keys choose the insertion
position while the drag is active, and `Escape` cancels it. The UI announces
pickup, current position, drop, and cancellation without moving focus. This
keyboard drag contract is the non-pointer path; an implementation MUST NOT add
up/down controls as an accessibility fallback.

A one-dimensional reorder list constrains drag feedback to its primary axis.
In particular, a vertical Field or card-Field reorder MUST NOT introduce a
horizontal scrollbar, horizontal layout shift, or cross-axis drop position
while dragging.

The drag result is expressed only with stable IDs. The UI MAY project the
result optimistically, but it submits one revision-checked atomic mutation (or
the Runtime-prescribed atomic position-patch set), replaces the projection
with the returned descriptors after success, and restores the last
authoritative order on failure or conflict. Filtering a reorder list MUST
disable dragging unless the UI can preserve every non-visible member exactly.

This rule concerns structural ordering. Ascending/descending saved row-sort
direction, previous/next search-result navigation, and Kanban Row movement are
semantic operations and do not become structural reorder controls.

### 12.5 Formula, Lookup, and Relation definitions

A Formula editor shows and submits Runtime `sourceText`, whose references are
quoted human Field names. Autocomplete inserts the Runtime grammar's escaped
quoted form; it never shows generated SQL, a compiled AST, or Field IDs as the
human source. For an existing Formula it previews with `fieldId`; for a new
Formula it previews with `candidateName`. A resolved preview with
`valid:false` is a candidate-analysis result, not a failed request; UI renders
its diagnostics and does not read absent inferred-type, dependency, or row
members. A thrown Runtime error instead follows ordinary request handling.
`diagnosticsTruncated` is always disclosed. Preview diagnostics and sample
values remain provisional for commit; schema preflight/application is
authoritative. After a Field rename, UI refreshes and displays Runtime's
rewritten source rather than attempting a text substitution.

A Lookup editor chooses Relation and target Fields by stable ID, displays
their current names, and submits exactly Runtime's `aggregate` and
`distinctValues` settings. Lookup 1.0 has no independent order setting: the
Relation and nested-value occurrence order is authoritative. UI does not
flatten, aggregate, type-check, detect cycles, or reject a nested Lookup
locally as authority. A Relation editor submits target Table ID, inverse
source Field ID, cardinality, and deletion policy through schema preflight;
it never creates a mirror value column.

## 13. Host lifecycle, conflicts, recovery, and assets

`HostSessionState.phase` is one of:

```text
opening ready-readonly ready-clean ready-dirty publishing
commit-unknown conflict recovery-required fatal closed
```

The state also carries `sessionId`, and when applicable File ID, Runtime
revision, capability changes, conflict token, recovery
summary, and a redacted Host error. Host state is authoritative for whether a
file is published; Runtime revision is authoritative for logical content.
Runtime revision, Host base/content token, Adapter `dataVersion`, and request
ID are distinct namespaces. UI MUST NOT receive Host base/content tokens or
`dataVersion`, display a token, or substitute any one for another; it only
returns a conflict/recovery token to the operation that defined it.

Required UI behavior:

- `opening`: expose progress and a working cancel action; do not render stale
  canonical content from another session.
- `ready-readonly`: present content as read-only. If the user requests an edit,
  explain the required access and call `requestWritePermission` only from that
  user action and only when `canRequestPermission` is true. After a grant, the
  UI renegotiates Runtime/Host capabilities and refreshes the snapshot before
  enabling writes.
- `ready-clean`: present the Runtime revision as matching the opened or
  published Host baseline and remove dirty indicators. Do not claim this
  session published an initially opened file. A `best-effort` durability value
  MUST NOT be described as crash-durable. A read-only original source may
  still be ready-clean/editable in a writable private Runtime with
  `canWriteCurrent=false` and `canSaveCopy=true`.
- `ready-dirty`: distinguish committed-in-session data from data successfully
  published under negotiated durability. Autosave is permitted only when
  negotiated and disclosed.
- `publishing`: prevent duplicate save and disable new canonical mutations;
  Host rejects any mutation race with Runtime `busy` before execution. Row
  reads MAY continue. Close waits or requests the mandatory Host cancellation
  contract; after replacement starts the UI waits for the verified
  publish/recovery outcome.
- `commit-unknown`: freeze all canonical Runtime operations and revoke the old
  RuntimeClient. Expose bounded reconciliation progress/cancel semantics and
  call `reconcileCommit` when `canReconcileCommit=true`; do not expose a raw
  receipt, permit a retry, or attempt a read on the old epoch. State omits
  `revision` because no outcome is proved, though it may retain the known File
  ID. Install and bootstrap only the replacement Runtime returned for a
  decided outcome.
- `conflict`: stop save and automatic write replay. Offer only negotiated
  actions. `reload` warns about unpublished changes; `save-copy` preserves a
  separate copy; `merge` displays Host/Runtime merge diagnostics.
- `recovery-required`: present the Host recovery summary and only the actions
  in the recovery report. Do not silently choose a candidate.
- `fatal`: preserve exportable drafts where safe, provide a redacted
  explanation, and
  offer only safe retries.

Offline storage, a missing writer lease, or temporarily unavailable
publication leaves the session visibly `ready-dirty`; UI does not relabel it
saved. It offers retry or Save Copy only when the corresponding capability is
available and preserves recovery guidance from Host.

Before calling `close` on a dirty session, UI presents `save`, `discard`, and
`cancel`. `save` completes publication first; `cancel` does not call `close`;
only explicit `discard` proceeds directly to `close`. Dismissal of a window is
not implicit discard. Recovery discard also requires an explicit user action.

An `AssetLease` contains only `leaseId`, `entryId`, purpose, media type, name,
lossless int64 decimal-string `size`, expiry, and a presentation-safe opaque
URL/token.
The UI MUST enforce the negotiated size and lease limits, release a lease when
its surface is removed,
and stop using it after expiry/session close. It MUST NOT turn a File-entry
URI into a network request, allow active content to inherit application
origin, or make an asset lease available to another File/session.
It passes the lease only to the injected `AssetPresenter` (or an exactly
equivalent platform-native presenter); a reusable UI package MUST NOT use a
default identity resolver that returns the canonical relative/`https:`/`data:`
URI as the presentation URL.

`acquireAsset` returns a Host-staged File-entry logical object whose ID was
allocated by Runtime. UI submits
that object unchanged in a sparse Runtime mutation, except that it may order
or remove whole entries. It MUST NOT manufacture or rewrite `uri`, `size`,
`mediaType`, or asset ID. A failed row mutation does not authorize UI to
delete the acquired asset; cleanup is a Host policy.

An asset preview is untrusted content. HTML, SVG with active features, PDF,
office documents, and media metadata MUST be rendered with the Host's
declared isolation/download policy. Failure to preview never changes or
deletes the File logical value.

## 14. Renderers, plugins, and isolation

A statically linked renderer explicitly trusted by the embedding application
MAY run in the application's realm. Passing only `RuntimeClient` does not make
such code sandboxed: it can exercise every capability of that client and any
ambient authority of its realm. Products MUST label it trusted application
code, not a security boundary.

Third-party or file-supplied renderer code MUST run in a separate restricted
realm or process. It receives a proxy containing only the selected File,
Table, View, query, projection, asset-purpose, and mutation capabilities. The
host validates every proxied request; hiding a method in the renderer UI is
not authorization.

For Web hosts, untrusted code MUST use a cross-origin sandboxed frame or a
dedicated Worker with a structured-clone message boundary. A sandboxed frame
MUST NOT combine script execution with same-origin authority in a way that
lets the renderer escape its sandbox. For Desktop hosts, context isolation
and a separate renderer/worker process or equivalent restricted realm are
required. Raw native IPC, Node/process globals, filesystem APIs, HostServices,
and unscoped RuntimeClient objects are forbidden.

Messages MUST be schema-validated, bounded, correlated by request ID, and
reject unexpected members that would grant authority. Cancellation and close
revoke outstanding capabilities. Renderer output is treated as untrusted:
text is not HTML, URL activation is policy-checked, and accessibility
requirements still apply.

Unknown View metadata is preserved even when no renderer is installed.
Installing or removing a renderer never rewrites the View by itself.

## 15. Accessibility, keyboard, localization, and motion

### 15.1 Baseline

A conforming standard View and every complete edit/save/conflict/recovery
process MUST meet WCAG 2.2 Level AA. An implementation using an interactive
tabular Grid SHOULD follow the WAI-ARIA Authoring Practices Grid pattern while
still satisfying WCAG directly; APG examples are guidance, not a substitute
for testing.

Every value and control has an accessible name derived from user-visible
Table/Field/View names and purpose. Color, icon, position, or motion is never
the only carrier of type, selection, option, error, dirty, or conflict state.
Status, validation, save, and result-count changes use non-disruptive status
messages unless immediate action is required.

Virtualized content MUST expose correct logical row/column count when known,
logical indices for rendered items, and a persistent accessible focus target.
A canvas-only representation without an equivalent semantic interaction
surface is non-conforming.

### 15.2 Keyboard contract

For Grid:

| Key                                  | Required result outside an editor                                          |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `Tab` / `Shift+Tab`                  | enter or leave the Grid as one tab stop; do not tab through every cell     |
| Arrow keys                           | move one logical cell; request the next bounded page if necessary          |
| `Home` / `End`                       | first or last cell in the current row                                      |
| platform `Ctrl/Command+Home` / `End` | first or last logical cell; bounded loading and progress are permitted     |
| `Enter` or `F2`                      | enter the focused editable cell; otherwise activate its primary action     |
| `Escape`                             | cancel the current draft/editor, then close transient UI on a second press |
| `Space`                              | toggle an applicable checkbox/selection without scrolling                  |
| platform copy/paste shortcuts        | copy raw logical values or open the atomic paste preview                   |
| `Delete` / `Backspace`               | request clear/delete only after selection and editability checks           |

An active cell editor owns ordinary text-navigation keys and advertises how to
commit or cancel. Focus MUST remain visible and not be obscured. Gallery and
Kanban provide equivalent linear keyboard navigation and named groups/cards.
Structural Table/View/Field reorders follow the keyboard drag contract in
Section 12.4 and MUST NOT add up/down controls. Row or card moves that are not
structural ordering provide a non-drag alternative.

### 15.3 Localization and time

UI text, accessible names, formatting, and input affordances are localizable.
Canonical option names and user-authored Table/Field/View names are data and
MUST NOT be translated. Unicode input is preserved exactly.

Locale formatting never changes raw copy or mutation values. A Date has no
timezone. A Datetime is an instant displayed in an explicitly selected IANA
timezone; tooltips or detail views MUST make the zone/offset available.
Ambiguous local input is resolved before submission, not guessed silently.

The UI MUST honor the platform's reduced-motion preference. Essential state
changes remain perceivable without animation. Animations MUST NOT block input,
encode canonical state, or delay commit/cancel semantics.

## 16. Error handling, security, and resource limits

Runtime errors have the stable envelope
`{code,message,retryable,path?,fileId?,tableId?,fieldId?,rowId?,currentRevision?,details?}`. `path` is a
logical request path, never a filesystem path. Runtime and Host structured
error codes drive behavior. The Host baseline codes are `invalid-request`,
`unsupported`, `invalid-source`, `conflict`, `permission-denied`,
`source-changed`, `writer-unavailable`, `publication-failed`,
`recovery-required`, `asset-unavailable`, `cancelled`, `deadline-exceeded`,
`resource-limit`, `io-error`, `unknown-commit`, `closed`, and `fatal`. Human messages are
localized UI text; raw SQLite messages, generated SQL, native stack traces,
paths, tokens, and handles MUST NOT be shown in the ordinary UI or sent to a
renderer. A separately enabled diagnostic export MAY include redacted details.

`RuntimeDiagnostic` is consumed without narrowing. In particular,
`semantic-cycle.relatedFieldIds` is Runtime's exact ordered closed cycle; UI
preserves that stable-ID sequence and MAY decorate it with names from the same
schema revision. It MUST NOT reorder, deduplicate, replace it with names, or
drop it merely because some participating Field is hidden.

Only idempotent reads MAY be retried automatically, with a bound and
cancellation. Mutations, save, conflict actions, and recovery actions are
never retried until their completion status is known. Authentication or
permission denial does not trigger a loop.

User-authored strings are untrusted. They are rendered as text by default.
Markdown, HTML, formulas, URLs, SVG, and asset metadata do not grant script,
navigation, network, or filesystem authority. Clipboard export escapes for
the chosen format; paste is data, never executable markup.

The UI MUST obey every negotiated Runtime and Host limit. It also MUST bound:

- unresolved reads, mutation batches, rendered rows/cards, cached pages,
  Relation selector results, diagnostics, and undo history;
- Formula preview rows and frequency;
- asset bytes, decode dimensions, concurrent leases, and object-URL lifetime;
- filter depth and UI-generated query nodes before calling Runtime; and
- renderer message size, rate, lifetime, and outstanding request count.

When a limit is reached, the UI presents a recoverable, accessible state and a
bounded alternative. It MUST NOT silently truncate a logical value, Relation
list, paste, delete selection, or schema impact report.

## 17. Conformance tests and executable transcripts

### 17.1 Harness protocol

A UI conformance harness supplies mock `RuntimeClient` and `HostServices`
objects and drives semantic actions through the accessibility tree. A
transcript is a JSON array. Each step has exactly one of:

- `mock`: register a pending or immediate method result/error;
- `user`: perform the named semantic action on an accessible target;
- `resolve`: settle a registered pending call;
- `expectCall`: assert method and partial arguments;
- `expectNoCall`: assert zero matching calls so far; or
- `expectUI`: assert accessible state, logical target, or visible raw value.

Unknown step members are forbidden. IDs declared by `mock.id` correlate
`resolve.id` and are the matching call's harness-assigned `requestId`.
`expectCall` and `expectNoCall` may carry `args` and `after`
constraints. A step with `expectUI:"state"` uses the state names in this
specification.
An implementation adapter maps semantic targets such as `cell:<row-id>:<field-id>`
to its controls; tests do not depend on DOM framework or pixels.

The step grammar is exact: `mock` carries `id` and either `pending:true`,
`result`, or `error`; an immediate result/error settles the next matching call.
`resolve` carries the prior ID and exactly one of `result` or `error` unless the
result was registered by the mock. `user` may carry `target`, `value`, `to`,
`policy`, and/or `fixture`; `fixture`, when present, is an object containing
named harness input for that semantic action. `expectCall` carries optional
partial-JSON `args`; `expectNoCall` carries optional correlation `after`;
`expectUI` carries `target` and/or `value`. Partial JSON matching is recursive
object-member matching and exact scalar/array matching.

### 17.2 Required vectors

The following JSON is an executable minimum transcript set. Its UUIDs are
syntactically valid fixture identifiers.

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

In addition, every profile MUST test NULL versus empty, unknown View and layout
preservation, advisory-versus-authoritative validation, cancellation races,
limit errors, accessible keyboard completion, reduced motion, localized
format/raw round-trip, permission denial, conflict, recovery, asset expiry,
injected HostServices/AssetPresenter use, image-thumbnail to media-icon to
lossless-URI fallback for relative/`https:`/`data:` entries, zero direct URI
fetch/navigation, and isolated-renderer capability revocation. Editor tests MUST cover atomic
paste, delete/undo, stale conflict, and all three Host commit-reconciliation
outcomes; they assert zero reads/retries on the fatal old RuntimeClient and a
complete negotiation/snapshot/schema bootstrap of each returned replacement
client. Editor tests also cover pointer and keyboard drag completion for
Table, View, `fieldOrder`, and `cardFields` ordering, with no structural
up/down controls present; common Field visibility/order in Grid,
Gallery, and Kanban; every type-specific key in Section 8.2; preservation of
non-applicable and unknown keys across type changes; and generated aggregate
or group results never entering layout. Schema tests MUST cover all four conversion classifications,
dependency paging/display, display-name-only rename, and plan expiry.

## 18. References

The references below directly support requirements used here:

- [Eidos File Format 1.0](./eidos-file-1.0.md)
- [Eidos Runtime 1.0](./eidos-runtime-1.0.md)
- [Eidos Adapter 1.0](./eidos-adapter-1.0.md)
- [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
  [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) — normative terminology
- [RFC 2397](https://www.rfc-editor.org/rfc/rfc2397) — inline Data URLs and
  their media-type security boundary
- [RFC 6454](https://www.rfc-editor.org/rfc/rfc6454) — origin isolation for
  non-server-based URIs
- [JSON Schema Draft 2020-12 Core](https://json-schema.org/draft/2020-12/json-schema-core)
  and [Validation](https://json-schema.org/draft/2020-12/json-schema-validation)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — accessibility conformance
- [WAI-ARIA APG Grid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)
  — interactive grid roles and keyboard guidance
- [WHATWG HTML Workers](https://html.spec.whatwg.org/multipage/workers.html),
  [structured clone](https://html.spec.whatwg.org/multipage/structured-data.html#safe-passing-of-structured-data),
  and [iframe sandboxing](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox)
  — isolated Web execution and message boundaries
- [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) — timestamp input basis
- [IANA Time Zone Database](https://www.iana.org/time-zones) — display timezone identifiers

No framework, component library, grid library, rendering engine, pixel system,
or application source code is required to implement this specification.
