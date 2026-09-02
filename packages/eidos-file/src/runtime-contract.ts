import type {
  ByteSource,
  CancellationPort,
  CancellationSignal,
  ClockPort,
  EntropyPort,
  JsonObject,
  JsonValue,
  OwnedBytes,
  RequestContext,
} from "./protocol-types"

export type { JsonObject, JsonValue, OwnedBytes, RequestContext }

export interface FileEntry extends JsonObject {
  id: string
  name: string
  mediaType: string
  size: string
  uri: string
}

export type Revision = string

export type ScalarType =
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

export type AtomicType =
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

export type TypeRef =
  | ScalarType
  | "row-id"
  | "file-entry"
  | { kind: "list"; element: AtomicType }

export type LogicalValue =
  | null
  | boolean
  | number
  | string
  | FileEntry
  | LogicalValue[]

export interface RuntimeEnvironment {
  clock: ClockPort
  entropy: EntropyPort
  transportCommitBarrier?: TransportCommitBarrier
}

export interface RuntimeFactoryContext {
  cancellation: CancellationPort
  deadlineMilliseconds?: number
}

export interface RuntimeCreateInput {
  title: string
  fileId?: string
  createdAt?: string
}

export interface RuntimeBinding {
  service: RuntimeService
  hostBridge: RuntimeHostBridge
}

export interface RuntimeHostBridge {
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

export interface RuntimePublicationSnapshot {
  fileId: string
  revision: string
  bytes: ByteSource
  release(): Promise<void>
}

export interface RuntimeCapabilities {
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

export interface RuntimeLimits {
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

export type RuntimeErrorCode =
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

export interface RuntimeError {
  code: RuntimeErrorCode
  message: string
  retryable: boolean
  path?: string
  fileId?: string
  tableId?: string
  fieldId?: string
  rowId?: string
  currentRevision?: string
  details?: JsonObject
}

export interface RuntimeSnapshot {
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

export interface TableDescriptor {
  object: "table"
  id: string
  name: string
  labelFieldId: string
  position: string
  settings: JsonObject
}

export interface FieldDescriptor {
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

export interface ViewDescriptor {
  object: "view"
  id: string
  tableId: string
  name: string
  type: string
  /** Absent means supported for compatibility with older Runtime transports. */
  queryStatus?: "supported" | "unsupported"
  query: SavedViewQuery
  layout: JsonObject
  position: string
}

export interface FeatureDescriptor {
  object: "feature"
  name: string
  version: string
  required: boolean
  config: JsonObject
}

export type SchemaDescriptor =
  | TableDescriptor
  | FieldDescriptor
  | ViewDescriptor
  | FeatureDescriptor

export interface GetSchemaPageRequest {
  revision: string
  limit: number
  cursor?: string
}

export interface SchemaPage {
  fileId: string
  revision: string
  objects: SchemaDescriptor[]
  nextCursor: string | null
}

export interface ProjectionSpec {
  fields: string[]
  resolveRelations: string[]
}

export interface ColumnDescriptor {
  fieldId: string
  name: string
  valueType: TypeRef
  source: "stored" | "formula" | "lookup" | "inverse-relation"
  writable: boolean
}

export interface ProjectedRow {
  id: string
  values: LogicalValue[]
  resolvedRelations?: Array<{
    column: number
    items: ResolvedRelationItem[]
  }>
}

export type ResolvedRelationItem =
  | { id: string; state: "unresolved" }
  | {
      id: string
      state: "resolved"
      labelFieldId: string
      labelType: TypeRef
      label: LogicalValue
    }

export interface RowPage {
  fileId: string
  tableId: string
  revision: string
  projectionHash: string
  columns: ColumnDescriptor[]
  rows: ProjectedRow[]
  nextCursor: string | null
  previousCursor: string | null
}

export interface RowBatch {
  fileId: string
  tableId: string
  revision: string
  projectionHash: string
  columns: ColumnDescriptor[]
  rows: ProjectedRow[]
  missingRowIds: string[]
}

export interface RowQuery {
  filter?: FilterNode
  search?: { text: string; fields: string[] }
  sort?: Array<{
    fieldId: string
    direction: "asc" | "desc"
    nulls?: "first" | "last"
  }>
}

export type FilterOperand = Exclude<LogicalValue, null>

export type FilterNode =
  // Every valid leaf is a total Boolean predicate. Runtime never exposes SQL
  // NULL/UNKNOWN through logical composition; non-null operands are enforced
  // by request validation.
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

export interface QueryRowsRequest {
  tableId: string
  query: RowQuery
  projection: ProjectionSpec
  limit: number
  offset?: number
  cursor?: string
  direction?: "forward" | "backward"
}

export interface AggregateRequest {
  tableId: string
  query?: RowQuery
  items: AggregateItem[]
}

export type AggregateItem =
  | { key: string; op: "count-all" }
  | {
      key: string
      op: "distinct-values"
      fieldId: string
      limit: number
    }
  | {
      key: string
      op: "count" | "distinct-count" | "sum" | "average" | "min" | "max"
      fieldId: string
    }
  | { key: string; op: "statistics"; fieldId: string }

export type AggregateResult =
  | { key: string; value: LogicalValue }
  | { key: string; values: LogicalValue[]; truncated: boolean }
  | { key: string; statistics: ColumnStatistics }

export interface AggregateResponse {
  fileId: string
  tableId: string
  revision: string
  results: AggregateResult[]
}

export interface ColumnStatistics {
  rows: string
  nulls: string
  distinct: string
  min?: LogicalValue
  max?: LogicalValue
  sum?: LogicalValue
  average?: number | null
}

export interface GroupRequest {
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

export interface GroupPage {
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

export interface GroupRowsRequest {
  cursor: string
  limit: number
  direction?: "forward" | "backward"
}

export interface GroupRowPage {
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

export interface ForwardRelationDefinition {
  direction: "forward"
  targetTableId: string
  cardinality: "one" | "many"
  onDelete: "restrict" | "detach" | "preserve"
}

export interface InverseRelationDefinition {
  direction: "inverse"
  targetTableId: string
  cardinality: "many"
  inverseOfFieldId: string
}

export type RelationDefinition =
  | ForwardRelationDefinition
  | InverseRelationDefinition

export type FormulaResultType =
  | "text"
  | "number"
  | "integer"
  | "checkbox"
  | "date"
  | "datetime"
  | "url"

export interface FormulaDefinition {
  sourceText: string
  resultType: FormulaResultType
}

export interface FormulaPreviewRequest {
  tableId: string
  fieldId?: string
  candidateName?: string
  sourceText: string
  declaredResultType: FormulaResultType
  rowIds?: string[]
}

export interface FormulaPreviewResult {
  fileId: string
  revision: string
  valid: boolean
  inferredType?: FormulaResultType
  dependencies?: string[]
  rows?: Array<{
    rowId: string
    value?: LogicalValue
    error?: RuntimeError
  }>
  diagnostics: RuntimeDiagnostic[]
  diagnosticsTruncated: boolean
}

export interface LookupDefinition {
  relationFieldId: string
  targetFieldId: string
  aggregate: "values" | "first" | "count" | "sum" | "average" | "min" | "max"
  distinctValues: boolean
}

export interface RowMutation {
  tableId: string
  expectedRevision: string
  returning?: ProjectionSpec
  changes: RowChange[]
}

export type RowChange =
  | { kind: "create"; clientKey: string; values: Record<string, LogicalValue> }
  | { kind: "update"; rowId: string; values: Record<string, LogicalValue> }
  | { kind: "delete"; rowId: string }

export interface MutationResult {
  fileId: string
  revision: string
  changed: boolean
  created: Array<{ clientKey: string; rowId: string }>
  affectedRows: Array<{ tableId: string; rowId: string }>
  returnedRows?: RowBatch
  undoToken?: string
  evictedUndoTokens?: string[]
}

export type CreatedSchemaObject =
  | { id: string; object: "table"; clientKey: string }
  | { id: string; object: "field"; clientKey: string }
  | {
      id: string
      object: "field"
      systemRole: "row-id" | "created-time" | "updated-time"
    }

export type CommitReconciliation =
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

export interface TransportCommitBarrier {
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

export type ViewChange =
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

export interface ViewMutationRequest {
  expectedRevision: string
  changes: ViewChange[]
}

export interface ViewMutationResult {
  fileId: string
  revision: string
  changed: boolean
  createdViews: Array<{ clientKey: string; viewId: string }>
  affectedViewIds: string[]
}

export type SchemaChange =
  | SchemaLeafChange
  | { kind: "batch"; changes: SchemaLeafChange[] }

export type SchemaLeafChange =
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

export type StoredFieldType =
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

export interface NewField {
  clientKey: string
  name: string
  kind: StoredFieldType | "formula" | "lookup"
  position: string
  nullable?: boolean
  settings?: JsonObject
  definition?: RelationDefinition | FormulaDefinition | LookupDefinition
}

export type ConversionPolicy =
  | "round-binary64"
  | "truncate-toward-zero"
  | "round-ties-even"
  | "zero-false-nonzero-true"
  | "utc-date"
  | "first"
  | "null-to-empty-list"

export type ScalarStoredFieldType =
  | "text"
  | "number"
  | "integer"
  | "checkbox"
  | "date"
  | "datetime"
  | "url"
  | "select"

export type ConvertFieldChange =
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

export interface SchemaPreflightRequest {
  change: SchemaChange
  expectedRevision: string
}

export interface SchemaPreflightResult {
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

export interface SchemaValueChange {
  code: SchemaValueChangeCode
  rows: string
  tableId: string
  fieldId: string
}

export type SchemaValueChangeCode =
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

export interface SchemaDependency {
  object: "table" | "field" | "view"
  id: string
}

export interface SchemaDependencyPage {
  fileId: string
  revision: string
  dependencyCount: string
  dependencies: SchemaDependency[]
  nextCursor: string | null
}

export interface SchemaMutationRequest {
  planToken: string
  expectedRevision: string
  actionsHash: string
  confirmLossy?: true
}

export interface SchemaMutationResult {
  fileId: string
  revision: string
  changed: boolean
  createdObjects: CreatedSchemaObject[]
  affectedTableIds: string[]
  affectedFieldIds: string[]
}

export interface SavedViewQuery {
  filter?: FilterNode
  sort?: Array<{
    fieldId: string
    direction: "asc" | "desc"
    nulls?: "first" | "last"
  }>
}

export interface CsvExportRequest {
  tableId: string
  query: RowQuery
  fields: string[]
  includeHeader: boolean
}

export interface CsvExportResult {
  fileId: string
  tableId: string
  revision: string
  csv: OwnedBytes
}

export interface CsvImportRequest {
  tableId: string
  expectedRevision: string
  hasHeader: boolean
  columns: Array<{ csvIndex: number; fieldId: string }>
  csv: OwnedBytes
}

export interface CsvImportResult {
  fileId: string
  tableId: string
  revision: string
  changed: boolean
  createdRows: Array<{ recordIndex: number; rowId: string }>
  undoToken?: string
  evictedUndoTokens?: string[]
}

export interface RuntimeEvent {
  kind: "revision-changed" | "schema-changed" | "fatal"
  fileId: string
  revision: string
  tableIds?: string[]
  fieldIds?: string[]
}

export interface ValidationRequest {
  level: "identity" | "structural" | "content" | "semantic" | "full"
  diagnosticsLimit: number
}

export interface RuntimeDiagnostic {
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

export type RuntimeDiagnosticCode =
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

export interface ValidationReport {
  fileId?: string
  revision?: string
  level: ValidationRequest["level"]
  valid: boolean
  diagnostics: RuntimeDiagnostic[]
  truncated: boolean
}

export interface RuntimeClient {
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

export type RuntimeService = RuntimeClient
