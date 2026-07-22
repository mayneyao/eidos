import type {
  ByteSource,
  CancellationPort,
  JsonObject,
  OwnedBytes,
  RequestContext,
} from "./protocol-types"
import type {
  CommitReconciliation,
  FileEntry,
  RuntimeClient,
} from "./runtime-contract"

export type SqlValue =
  | { tag: "null" }
  | { tag: "integer"; value: string }
  | { tag: "real"; value: number }
  | { tag: "text"; value: string }
  | { tag: "blob"; value: OwnedBytes }

export interface Column {
  name: string
}

export interface QueryResult {
  columns: Column[]
  rows: SqlValue[][]
}

export interface RunResult {
  changes: string
  lastInsertRowid: string
}

export interface ConnectionCapabilities {
  adapterVersion: "1.0"
  sqliteVersion: string
  json1: boolean
  returning: boolean
  strict: boolean
  int64: boolean
  scalarFunctions: boolean
  directOnlyFunctions: boolean
  interrupt: boolean
  snapshot: true
  defensiveMode: boolean
  busyTimeoutMs: number
  maxVariables: number
  maxSqlBytes: number
  maxValueBytes: number
  maxResultRows: number
  maxResultBytes: number
}

export interface ScalarDefinition {
  name: string
  arity: number
  deterministic: true
  directOnly: true
}

export interface SnapshotContext {
  cancellation: CancellationPort
  deadlineMilliseconds?: number
  maxBytes: string
}

export interface ConnectionSnapshot {
  bytes: ByteSource
  release(): Promise<void>
}

export interface ConnectionPort {
  capabilities(): ConnectionCapabilities
  execSchema(sql: string): void
  query(sql: string, bindings?: readonly SqlValue[]): QueryResult
  get(
    sql: string,
    bindings?: readonly SqlValue[]
  ): { columns: Column[]; row: SqlValue[] | null }
  run(sql: string, bindings?: readonly SqlValue[]): RunResult
  runMany(
    sql: string,
    bindingSets: readonly (readonly SqlValue[])[]
  ): RunResult[]
  registerScalar(
    definition: ScalarDefinition,
    operation: (...values: SqlValue[]) => SqlValue
  ): void
  transaction<T>(mode: "read" | "write", operation: () => T): T
  transaction<T>(
    mode: "read" | "write",
    operation: () => Promise<T>
  ): Promise<T>
  dataVersion(): string
  interrupt(): void
  snapshot(context: SnapshotContext): Promise<ConnectionSnapshot>
  close(): void
}

export type AdapterErrorCode =
  | "adapter-closed"
  | "invalid-argument"
  | "invalid-sql-value"
  | "unsupported-capability"
  | "sql-error"
  | "sql-function-error"
  | "constraint"
  | "busy"
  | "locked"
  | "cancelled"
  | "deadline-exceeded"
  | "resource-limit"
  | "out-of-memory"
  | "io-error"
  | "corrupt"
  | "not-a-database"
  | "read-only"
  | "permission-denied"
  | "source-changed"
  | "writer-unavailable"
  | "publication-failed"
  | "recovery-required"
  | "asset-unavailable"
  | "protocol-error"
  | "backpressure"
  | "commit-outcome-unknown"
  | "transport-closed"
  | "transport-fatal"

export interface AdapterError {
  code: AdapterErrorCode
  message: string
  retryable: boolean
  fatal: boolean
  sqlitePrimaryCode?: number
  sqliteExtendedCode?: number
  details?: JsonObject
}

export interface HostServices {
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

export interface HostServiceCapabilities {
  canOpenSource: true
  canCreateSource: boolean
  canRequestPermission: boolean
  canSaveCopy: boolean
  canReconcileCommit: boolean
  canResolveConflict: boolean
  canRecover: boolean
  canUseAssets: boolean
}

export interface HostCapabilities {
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

export interface HostLimits {
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

export type HostPhase =
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

export interface HostError {
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

export interface HostSessionState {
  sessionId: string
  phase: HostPhase
  capabilities: HostCapabilities
  limits: HostLimits
  fileId?: string
  revision?: string
  conflictToken?: string
  error?: HostError
}

export interface HostSaveResult {
  state: HostSessionState
}

export interface HostSaveCopyResult {
  state: HostSessionState
  adopted: boolean
  runtime?: RuntimeClient
}

export interface HostCommitReconciliationResult {
  state: HostSessionState
  outcome: "committed" | "rolled-back" | "conflict"
  runtime?: RuntimeClient
  reconciliation?: CommitReconciliation
}

export interface HostConflictResult {
  state: HostSessionState
  runtime?: RuntimeClient
}

export interface HostRecoveryResult {
  state: HostSessionState
  runtime?: RuntimeClient
}

export interface HostRecoveryReport {
  items: Array<{
    recoveryToken: string
    fileId: string
    revision: string
    createdAt: string
    size: string
  }>
}

export interface AssetLease {
  leaseId: string
  entryId: string
  purpose: "thumbnail" | "preview" | "download"
  mediaType: string
  name: string
  size: string
  expiresAt: string
  resourceToken: string
}

export type { ByteSource }
