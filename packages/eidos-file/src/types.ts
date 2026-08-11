import type { EidosFileSqlPrimitive } from "./connection"
import type { JsonValue } from "./protocol-types"

export interface EidosFileMetadata {
  format: "eidos-file"
  /** Stable UUIDv7 file identity. */
  fileId: string
  formatVersion: "1.0"
  schemaVersion: number
  revision: number | bigint
  createdAt: string
  updatedAt: string
  title?: string
  description?: string
  defaultTableId?: string
}

export interface EidosFileTableInfo {
  id: string
  name: string
  /** Exact SQLite table identifier (without quote characters). */
  physicalName?: string
  /** @deprecated Use physicalName. */
  rawTableName: string
  position: number | null
  icon: string | null
  description: string | null
  createdAt: string
  updatedAt: string
}

export type EidosFileFieldType =
  | "integer"
  | "relation"
  | "text"
  | "number"
  | "checkbox"
  | "date"
  | "datetime"
  | "file"
  | "multi-select"
  | "rating"
  | "select"
  | "url"
  | "formula"
  | "lookup"
  | "created-time"
  | "last-edited-time"
  | "row-id"

export type EidosFileSourceFieldType = Exclude<
  EidosFileFieldType,
  | "row-id"
  | "formula"
  | "relation"
  | "lookup"
  | "created-time"
  | "last-edited-time"
>

export type EidosFileStorageCodec =
  | "scalar"
  | "json_array"
  | "relation"
  | "materialized_text"

export type EidosFileValueKind =
  | "source"
  | "relation"
  | "derived"
  | "materialized"
  | "system"

export interface EidosFileFieldInfo {
  /** Stable UUIDv7 Field identity. */
  id: string
  tableId: string
  name: string
  type: EidosFileFieldType
  tableName: string
  tableColumnName: string
  /** Exact SQLite column name, or null for a virtual Field. */
  physicalName?: string | null
  /** Canonical system role, independent of the persisted Field type. */
  systemRole?: "row-id" | "created-time" | "updated-time" | null
  nullable?: boolean
  isRecordLabel?: boolean
  position?: number
  settings?: Record<string, unknown>
  property: Record<string, unknown> | null
  storageCodec: EidosFileStorageCodec
  valueKind: EidosFileValueKind
  isHidden: boolean
  isDerived: boolean
  sourceTableColumnName: string | null
  dependsOn: unknown
}

export interface EidosFileViewInfo {
  id: string
  name: string
  type: string
  tableId: string
  query: string
  properties: Record<string, unknown> | null
  filter: EidosFileFilterGroup | null
  sorts: EidosFileSort[]
  orderMap: Record<string, number> | null
  hiddenFields: string[]
  position: number | null
  createdAt: string
  updatedAt: string
}

export interface UpdateEidosFileViewInput {
  name?: string
  type?: string
  position?: number | null
  properties?: Record<string, unknown> | null
  filter?: EidosFileFilterGroup | null
  sorts?: EidosFileSort[]
  orderMap?: Record<string, number> | null
  hiddenFields?: string[]
}

export interface CreateEidosFileOptions {
  fileId?: string
  title?: string
  description?: string
  createdAt?: string
  defaultTable?: CreateEidosFileTableInput
}

export interface CreateEidosFileTableInput {
  id?: string
  name: string
  icon?: string
  description?: string
  fields?: CreateEidosFileFieldInput[]
  createDefaultView?: boolean
}

export type EidosFileCsvFieldType =
  | "text"
  | "number"
  | "checkbox"
  | "date"
  | "datetime"
  | "url"

export interface EidosFileCsvImportColumn {
  sourceIndex: number
  sourceName: string
  name: string
  columnName: string
  type: "record-label" | EidosFileCsvFieldType
  settings?: Record<string, unknown>
}

export interface EidosFileCsvImportIssue {
  code: "malformed-row" | "inconsistent-column-count"
  count: number
  message: string
}

export interface EidosFileCsvImportPlan {
  fileName: string
  tableName: string
  rowCount: number
  skippedRowCount: number
  columns: EidosFileCsvImportColumn[]
  sampleRows: string[][]
  issues: EidosFileCsvImportIssue[]
}

export interface EidosFileCsvColumnOverride {
  sourceIndex: number
  name?: string
  type?: EidosFileCsvFieldType
}

export interface EidosFileCsvImportOptions {
  tableName?: string
  columns?: EidosFileCsvColumnOverride[]
}

export interface EidosFileCsvImportResult {
  table: EidosFileTableInfo
  importedRowCount: number
  skippedRowCount: number
}

export interface EidosFileCsvExportColumn {
  columnName: string
  name: string
}

export interface EidosFileCsvExportOptions {
  query?: EidosFileRowQuery
  columns: EidosFileCsvExportColumn[]
}

export interface EidosFileCsvExportResult {
  exportedRowCount: number
}

export interface UpdateEidosFileTableInput {
  name?: string
  icon?: string | null
  description?: string | null
}

export interface CreateEidosFileSourceFieldInput {
  id?: string
  name: string
  /** @deprecated The Runtime derives the SQLite physical name from name. */
  columnName?: string
  type: EidosFileSourceFieldType
  property?: Record<string, unknown>
  storageCodec?: EidosFileStorageCodec
  /** SQL NULL policy for scalar and JSON storage. */
  nullable?: boolean
  isRecordLabel?: boolean
}

export interface EidosFileRelationProperty extends Record<string, unknown> {
  targetTableId: string
  targetField?: string
  multiple?: boolean
  direction?: "forward" | "inverse"
  sourceFieldId?: string
  cardinality?: "one" | "many"
  onDelete?: "restrict" | "detach" | "preserve"
}

export interface CreateEidosFileRelationFieldInput {
  id?: string
  name: string
  /** @deprecated The Runtime derives the SQLite physical name from name. */
  columnName?: string
  type: "relation"
  property: EidosFileRelationProperty
  storageCodec?: "relation"
}

export type EidosFileFormulaDisplayType =
  | "text"
  | "number"
  | "integer"
  | "checkbox"
  | "date"
  | "datetime"
  | "url"
  | "json"

export type EidosFileFormulaResultType = Exclude<
  EidosFileFormulaDisplayType,
  "json"
>

export interface EidosFileFormulaProperty extends Record<string, unknown> {
  formula: string
  displayType: EidosFileFormulaDisplayType
  expression?: string
}

export interface CreateEidosFileFormulaFieldInput {
  id?: string
  name: string
  /** @deprecated Formula Fields are virtual and have no physical column. */
  columnName?: string
  type: "formula"
  property: EidosFileFormulaProperty
  storageCodec?: "scalar"
  isRecordLabel?: boolean
}

export interface EidosFileFormulaPreviewInput {
  name: string
  columnName: string
  formula: string
  displayType: EidosFileFormulaResultType
}

export interface EidosFileFormulaPreviewDependency {
  name: string
  columnName: string
}

export interface EidosFileFormulaPreviewSample {
  rowId: string
  title: string | null
  value: EidosFileRowValue
}

export interface EidosFileFormulaPreview {
  expression: string
  dependencies: EidosFileFormulaPreviewDependency[]
  samples: EidosFileFormulaPreviewSample[]
}

export type EidosFileLookupAggregate =
  | "first"
  | "values"
  | "count"
  | "sum"
  | "average"
  | "min"
  | "max"

export interface EidosFileLookupProperty extends Record<string, unknown> {
  relationField: string
  targetField: string
  aggregate: EidosFileLookupAggregate
  displayType: EidosFileFormulaDisplayType
}

export interface EidosFileSelectOption {
  /** Canonical option identity and raw cell value. */
  name: string
  color: string
}

export interface EidosFileOptionValueChange {
  from: string
  to: string
}

export interface CreateEidosFileLookupFieldInput {
  id?: string
  name: string
  /** @deprecated Lookup Fields are virtual and have no physical column. */
  columnName?: string
  type: "lookup"
  property: EidosFileLookupProperty
  storageCodec?: "scalar" | "json_array"
  isRecordLabel?: boolean
}

export type CreateEidosFileFieldInput =
  | CreateEidosFileSourceFieldInput
  | CreateEidosFileRelationFieldInput
  | CreateEidosFileFormulaFieldInput
  | CreateEidosFileLookupFieldInput

export interface EidosFileFieldPlacement {
  viewId: string
  index: number
}

export interface EidosFileRelationValue {
  id: string
  title: string
}

export interface ImportEidosFileFieldInput {
  name: string
  columnName: string
  type: EidosFileFieldType
  property?: Record<string, unknown> | null
  storageCodec?: EidosFileStorageCodec
  valueKind?: EidosFileValueKind
  isHidden?: boolean
  isDerived?: boolean
  sourceTableColumnName?: string | null
  dependsOn?: unknown
}

export interface CreateEidosFileViewInput {
  id?: string
  name: string
  type: string
  query?: string
  properties?: Record<string, unknown> | null
  filter?: EidosFileFilterGroup | null
  sorts?: EidosFileSort[]
  orderMap?: Record<string, number> | null
  hiddenFields?: string[]
  position?: number | null
}

export interface UpdateEidosFileFieldInput {
  name?: string
  type?: EidosFileFieldType
  property?: Record<string, unknown> | null
  optionValueChanges?: EidosFileOptionValueChange[]
  isRecordLabel?: boolean
  /** Explicit user approval for a preflighted conversion that may change values. */
  confirmLossy?: boolean
}

export type EidosFileLogicalValue =
  | EidosFileSqlPrimitive
  | boolean
  | EidosFileLogicalValue[]
  | { readonly [key: string]: EidosFileLogicalValue }

export interface EidosFileFileValue {
  id: string
  uri: string
  name: string
  mediaType: string
  /** Canonical non-negative signed-int64 decimal string. */
  size: string
  /** Extension members are preserved through parse and serialization. */
  [key: string]: JsonValue
}
export type EidosFileRowValue = EidosFileSqlPrimitive | boolean
export type EidosFileRow = Record<string, EidosFileRowValue>

/** Language-neutral Runtime row shape from Eidos File 1.0 §16. */
export interface EidosFileLogicalRow {
  id: string
  fields: Record<string, EidosFileLogicalValue>
  /** Generated Relation targets, requested separately from canonical values. */
  resolved?: Record<string, EidosFileResolvedRelationValue[]>
}

export interface EidosFileResolvedRelationValue {
  id: string
  label: EidosFileLogicalValue
}

export interface EidosFileLogicalRowDraft {
  id?: string
  fields: Record<string, EidosFileLogicalValue>
}

export interface EidosFileLogicalRowUpdate {
  id: string
  fields: Record<string, EidosFileLogicalValue>
}

export interface EidosFileRowsMutation {
  tableId: string
  insert?: EidosFileLogicalRowDraft[]
  update?: EidosFileLogicalRowUpdate[]
  delete?: string[]
  expectedRevision?: number | bigint
}

export type EidosFileSchemaMutation =
  | { type: "create-table"; table: CreateEidosFileTableInput }
  | {
      type: "update-table"
      tableId: string
      changes: UpdateEidosFileTableInput
    }
  | { type: "delete-table"; tableId: string }
  | { type: "add-field"; tableId: string; field: CreateEidosFileFieldInput }
  | {
      type: "update-field"
      tableId: string
      fieldId: string
      changes: UpdateEidosFileFieldInput
    }
  | { type: "delete-field"; tableId: string; fieldId: string }
  | { type: "create-view"; tableId: string; view: CreateEidosFileViewInput }
  | { type: "update-view"; viewId: string; changes: UpdateEidosFileViewInput }
  | { type: "delete-view"; viewId: string }

export type EidosFileSortDirection = "asc" | "desc"

export interface EidosFileSort {
  field: string
  direction: EidosFileSortDirection
  nulls?: "first" | "last"
}

export type EidosFileFilterOperator =
  | "equals"
  | "not-equals"
  | "contains"
  | "not-contains"
  | "starts-with"
  | "ends-with"
  | "greater-than"
  | "greater-than-or-equal"
  | "less-than"
  | "less-than-or-equal"
  | "is-empty"
  | "is-not-empty"
  | "is-any-of"
  | "is-all-of"
  | "is-none-of"

export type EidosFileFilterValue = string | number | boolean | null

export interface EidosFileFilterRule {
  type: "rule"
  field: string
  operator: EidosFileFilterOperator
  value?: EidosFileFilterValue | EidosFileFilterValue[]
}

export interface EidosFileFilterGroup {
  type: "group"
  conjunction: "and" | "or"
  /** Internal compatibility representation of Runtime's Boolean NOT. */
  negated?: boolean
  children: Array<EidosFileFilterRule | EidosFileFilterGroup>
}

export interface EidosFileRowQuery {
  search?: string
  /** Exact Runtime search Field restriction, expressed as canonical Field IDs. */
  searchFields?: string[]
  filter?: EidosFileFilterGroup | null
  sorts?: EidosFileSort[]
}

export interface EidosFileRowPageProjection {
  /** Ordered field candidates available to each projected row. */
  columns: string[]
  /** Fields returned for every row without consuming the per-row field limit. */
  preservedColumns?: string[]
  /** Maximum candidate fields returned for each row. */
  fieldLimit?: number
  /** Skip null, undefined, and empty-string candidates before applying the limit. */
  omitEmptyFields?: boolean
  /** @internal Include the Table's current Record Label Field in compatibility projections. */
  includeRecordLabel?: boolean
  /** @internal Include resolved Relation label arrays for compatibility editors. */
  includeRelationDisplays?: boolean
}

export interface EidosFileRowPageOptions {
  offset: number
  limit: number
  query?: EidosFileRowQuery
  /**
   * Optional per-row response projection. Record identity is always
   * included. Query-only fields may be read internally for filtering, sorting,
   * and cursor generation but are not exposed in the returned rows.
   */
  projection?: EidosFileRowPageProjection
  /**
   * Previously observed row count for the same query. When present, paging can
   * reuse it instead of repeating an expensive COUNT query.
   */
  totalHint?: number
  /**
   * Opaque cursor returned by the previous contiguous page. The runtime uses
   * it as a paging fast path for natural and indexed explicit sort orders.
   */
  cursor?: string
}

export interface EidosFileValidationIssue {
  code: string
  message: string
  table?: string
  severity?: "fatal" | "error" | "warning" | "info"
}

export interface EidosFileValidationResult {
  valid: boolean
  metadata: EidosFileMetadata | null
  tables: EidosFileTableInfo[]
  errors: EidosFileValidationIssue[]
  warnings: EidosFileValidationIssue[]
}

export interface EidosFileTableSnapshot {
  table: EidosFileTableInfo
  fields: EidosFileFieldInfo[]
  views: EidosFileViewInfo[]
  rowCount: number
}

export interface EidosFileRowPage {
  tableId: string
  offset: number
  limit: number
  total: number
  rows: EidosFileRow[]
  /** Opaque cursor for the next contiguous page, when cursor paging is safe. */
  nextCursor?: string
}

export interface EidosFileRowGroupCount {
  value: EidosFileSqlPrimitive
  total: number
}

export type EidosFileColumnStatType =
  | "count-all"
  | "count-non-null"
  | "count-distinct"
  | "count-empty"
  | "percent-checked"
  | "percent-unchecked"
  | "sum"
  | "average"
  | "min"
  | "max"
  | "relation-value-count"
  | "relation-row-count"
  | "relation-distinct-target-count"

export interface EidosFileColumnStatConfig {
  fieldId: string
  type: EidosFileColumnStatType
}

export interface EidosFileColumnStatResult extends EidosFileColumnStatConfig {
  value: string | number | null
}

export interface EidosFileRowMutationResult {
  tableId: string
  row: EidosFileRow
  rowCount: number
  /** Eidos File metadata revision after the committed mutation. */
  revision?: number | bigint
}

export interface EidosFileRowUpdate {
  rowId: string
  changes: EidosFileRow
}

export interface EidosFileRowsMutationResult {
  tableId: string
  rows: EidosFileRow[]
  rowCount: number
  /** Eidos File metadata revision after the committed mutation. */
  revision?: number | bigint
}

export interface EidosFileRowRange {
  startIndex: number
  endIndex: number
}

export interface EidosFileRowsDeleteResult {
  tableId: string
  deletedCount: number
  rowCount: number
  /** Eidos File metadata revision after the committed mutation. */
  revision?: number | bigint
}

export interface EidosFileSnapshot {
  path: string
  metadata: EidosFileMetadata
  tables: EidosFileTableSnapshot[]
}
