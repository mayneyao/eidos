import type { EidosFileSqlPrimitive } from "./connection"

export interface EidosFileMetadata {
  format: "eidos-file"
  formatVersion: number
  schemaVersion: number
  app: string
  createdAt: string
  updatedAt: string
  title?: string
  description?: string
  defaultTableId?: string
}

export interface EidosFileTableInfo {
  id: string
  name: string
  rawTableName: string
  position: number | null
  icon: string | null
  description: string | null
  createdAt: string
  updatedAt: string
}

export type EidosFileFieldType =
  | "title"
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
  | "link"
  | "lookup"
  | "created-time"
  | "created-by"
  | "last-edited-time"
  | "last-edited-by"
  | "row-id"

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
  name: string
  type: EidosFileFieldType
  tableName: string
  tableColumnName: string
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
  type: "title" | EidosFileCsvFieldType
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
  name: string
  columnName: string
  type: Exclude<
    EidosFileFieldType,
    | "title"
    | "row-id"
    | "formula"
    | "link"
    | "lookup"
    | "created-time"
    | "created-by"
    | "last-edited-time"
    | "last-edited-by"
  >
  property?: Record<string, unknown>
  storageCodec?: EidosFileStorageCodec
}

export interface EidosFileRelationProperty extends Record<string, unknown> {
  targetTableId: string
  targetField: string
  multiple: boolean
}

export interface CreateEidosFileRelationFieldInput {
  name: string
  columnName: string
  type: "link"
  property: EidosFileRelationProperty
  storageCodec?: "relation"
}

export type EidosFileFormulaDisplayType =
  | "text"
  | "number"
  | "checkbox"
  | "date"
  | "datetime"
  | "url"

export interface EidosFileFormulaProperty extends Record<string, unknown> {
  formula: string
  displayType: EidosFileFormulaDisplayType
  expression?: string
}

export interface CreateEidosFileFormulaFieldInput {
  name: string
  columnName: string
  type: "formula"
  property: EidosFileFormulaProperty
  storageCodec?: "scalar"
}

export interface EidosFileFormulaPreviewInput {
  name: string
  columnName: string
  formula: string
  displayType: EidosFileFormulaDisplayType
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
  value: string
  color: string
}

export interface EidosFileOptionValueChange {
  from: string
  to: string
}

export interface CreateEidosFileLookupFieldInput {
  name: string
  columnName: string
  type: "lookup"
  property: EidosFileLookupProperty
  storageCodec?: "scalar" | "json_array"
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

export interface CreateEidosFileReferenceInput {
  selfTableId: string
  selfColumnName: string
  refTableId: string
  refColumnName: string
  linkTableId: string
  linkColumnName: string
}

export interface UpdateEidosFileFieldInput {
  name?: string
  type?: EidosFileFieldType
  property?: Record<string, unknown> | null
  optionValueChanges?: EidosFileOptionValueChange[]
}

export type EidosFileRowValue = EidosFileSqlPrimitive | boolean
export type EidosFileRow = Record<string, EidosFileRowValue>

export type EidosFileSortDirection = "asc" | "desc"

export interface EidosFileSort {
  field: string
  direction: EidosFileSortDirection
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
  children: Array<EidosFileFilterRule | EidosFileFilterGroup>
}

export interface EidosFileRowQuery {
  search?: string
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
}

export interface EidosFileRowPageOptions {
  offset: number
  limit: number
  query?: EidosFileRowQuery
  /**
   * Optional per-row response projection. Record identity and title are always
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
  | "count-values"
  | "count-unique"
  | "count-empty"
  | "count-not-empty"
  | "checked"
  | "unchecked"
  | "percent-empty"
  | "percent-not-empty"
  | "percent-checked"
  | "percent-unchecked"
  | "sum"
  | "average"
  | "min"
  | "max"
  | "range"

export interface EidosFileColumnStatConfig {
  columnName: string
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
  revision?: string
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
  revision?: string
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
  revision?: string
}

export interface EidosFileSnapshot {
  path: string
  metadata: EidosFileMetadata
  tables: EidosFileTableSnapshot[]
}
