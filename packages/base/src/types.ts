import type { BaseSqlPrimitive } from "./connection"

export interface BaseMetadata {
  format: "eidos-base"
  formatVersion: number
  schemaVersion: number
  app: string
  createdAt: string
  updatedAt: string
  title?: string
  description?: string
  defaultTableId?: string
}

export interface BaseTableInfo {
  id: string
  name: string
  rawTableName: string
  position: number | null
  icon: string | null
  description: string | null
  createdAt: string
  updatedAt: string
}

export type BaseFieldType =
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

export type BaseStorageCodec =
  | "scalar"
  | "json_array"
  | "relation"
  | "materialized_text"

export type BaseValueKind =
  | "source"
  | "relation"
  | "derived"
  | "materialized"
  | "system"

export interface BaseFieldInfo {
  name: string
  type: BaseFieldType
  tableName: string
  tableColumnName: string
  property: Record<string, unknown> | null
  storageCodec: BaseStorageCodec
  valueKind: BaseValueKind
  isHidden: boolean
  isDerived: boolean
  sourceTableColumnName: string | null
  dependsOn: unknown
}

export interface BaseViewInfo {
  id: string
  name: string
  type: string
  tableId: string
  query: string
  properties: Record<string, unknown> | null
  filter: BaseFilterGroup | null
  sorts: BaseSort[]
  orderMap: Record<string, number> | null
  hiddenFields: string[]
  position: number | null
  createdAt: string
  updatedAt: string
}

export interface UpdateBaseViewInput {
  name?: string
  type?: string
  position?: number | null
  properties?: Record<string, unknown> | null
  filter?: BaseFilterGroup | null
  sorts?: BaseSort[]
  orderMap?: Record<string, number> | null
  hiddenFields?: string[]
}

export interface CreateBaseOptions {
  title?: string
  description?: string
  createdAt?: string
  defaultTable?: CreateBaseTableInput
}

export interface CreateBaseTableInput {
  id?: string
  name: string
  icon?: string
  description?: string
  fields?: CreateBaseFieldInput[]
  createDefaultView?: boolean
}

export type BaseCsvFieldType =
  | "text"
  | "number"
  | "checkbox"
  | "date"
  | "datetime"
  | "url"

export interface BaseCsvImportColumn {
  sourceIndex: number
  sourceName: string
  name: string
  columnName: string
  type: "title" | BaseCsvFieldType
}

export interface BaseCsvImportIssue {
  code: "malformed-row" | "inconsistent-column-count"
  count: number
  message: string
}

export interface BaseCsvImportPlan {
  fileName: string
  tableName: string
  rowCount: number
  skippedRowCount: number
  columns: BaseCsvImportColumn[]
  sampleRows: string[][]
  issues: BaseCsvImportIssue[]
}

export interface BaseCsvColumnOverride {
  sourceIndex: number
  name?: string
  type?: BaseCsvFieldType
}

export interface BaseCsvImportOptions {
  tableName?: string
  columns?: BaseCsvColumnOverride[]
}

export interface BaseCsvImportResult {
  table: BaseTableInfo
  importedRowCount: number
  skippedRowCount: number
}

export interface BaseCsvExportColumn {
  columnName: string
  name: string
}

export interface BaseCsvExportOptions {
  query?: BaseRowQuery
  columns: BaseCsvExportColumn[]
}

export interface BaseCsvExportResult {
  exportedRowCount: number
}

export interface UpdateBaseTableInput {
  name?: string
  icon?: string | null
  description?: string | null
}

export interface CreateBaseSourceFieldInput {
  name: string
  columnName: string
  type: Exclude<
    BaseFieldType,
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
  storageCodec?: BaseStorageCodec
}

export interface BaseRelationProperty extends Record<string, unknown> {
  targetTableId: string
  targetField: string
  multiple: boolean
}

export interface CreateBaseRelationFieldInput {
  name: string
  columnName: string
  type: "link"
  property: BaseRelationProperty
  storageCodec?: "relation"
}

export type BaseFormulaDisplayType =
  | "text"
  | "number"
  | "checkbox"
  | "date"
  | "datetime"
  | "url"

export interface BaseFormulaProperty extends Record<string, unknown> {
  formula: string
  displayType: BaseFormulaDisplayType
  expression?: string
}

export interface CreateBaseFormulaFieldInput {
  name: string
  columnName: string
  type: "formula"
  property: BaseFormulaProperty
  storageCodec?: "scalar"
}

export interface BaseFormulaPreviewInput {
  name: string
  columnName: string
  formula: string
  displayType: BaseFormulaDisplayType
}

export interface BaseFormulaPreviewDependency {
  name: string
  columnName: string
}

export interface BaseFormulaPreviewSample {
  rowId: string
  title: string | null
  value: BaseRowValue
}

export interface BaseFormulaPreview {
  expression: string
  dependencies: BaseFormulaPreviewDependency[]
  samples: BaseFormulaPreviewSample[]
}

export type BaseLookupAggregate =
  | "first"
  | "values"
  | "count"
  | "sum"
  | "average"
  | "min"
  | "max"

export interface BaseLookupProperty extends Record<string, unknown> {
  relationField: string
  targetField: string
  aggregate: BaseLookupAggregate
  displayType: BaseFormulaDisplayType
}

export interface BaseSelectOption {
  value: string
  color: string
}

export interface BaseOptionValueChange {
  from: string
  to: string
}

export interface CreateBaseLookupFieldInput {
  name: string
  columnName: string
  type: "lookup"
  property: BaseLookupProperty
  storageCodec?: "scalar" | "json_array"
}

export type CreateBaseFieldInput =
  | CreateBaseSourceFieldInput
  | CreateBaseRelationFieldInput
  | CreateBaseFormulaFieldInput
  | CreateBaseLookupFieldInput

export interface BaseFieldPlacement {
  viewId: string
  index: number
}

export interface BaseRelationValue {
  id: string
  title: string
}

export interface ImportBaseFieldInput {
  name: string
  columnName: string
  type: BaseFieldType
  property?: Record<string, unknown> | null
  storageCodec?: BaseStorageCodec
  valueKind?: BaseValueKind
  isHidden?: boolean
  isDerived?: boolean
  sourceTableColumnName?: string | null
  dependsOn?: unknown
}

export interface CreateBaseViewInput {
  id?: string
  name: string
  type: string
  query?: string
  properties?: Record<string, unknown> | null
  filter?: BaseFilterGroup | null
  sorts?: BaseSort[]
  orderMap?: Record<string, number> | null
  hiddenFields?: string[]
  position?: number | null
}

export interface CreateBaseReferenceInput {
  selfTableId: string
  selfColumnName: string
  refTableId: string
  refColumnName: string
  linkTableId: string
  linkColumnName: string
}

export interface UpdateBaseFieldInput {
  name?: string
  type?: BaseFieldType
  property?: Record<string, unknown> | null
  optionValueChanges?: BaseOptionValueChange[]
}

export type BaseRowValue = BaseSqlPrimitive | boolean
export type BaseRow = Record<string, BaseRowValue>

export type BaseSortDirection = "asc" | "desc"

export interface BaseSort {
  field: string
  direction: BaseSortDirection
}

export type BaseFilterOperator =
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

export type BaseFilterValue = string | number | boolean | null

export interface BaseFilterRule {
  type: "rule"
  field: string
  operator: BaseFilterOperator
  value?: BaseFilterValue | BaseFilterValue[]
}

export interface BaseFilterGroup {
  type: "group"
  conjunction: "and" | "or"
  children: Array<BaseFilterRule | BaseFilterGroup>
}

export interface BaseRowQuery {
  search?: string
  filter?: BaseFilterGroup | null
  sorts?: BaseSort[]
}

export interface BaseRowPageProjection {
  /** Ordered field candidates available to each projected row. */
  columns: string[]
  /** Fields returned for every row without consuming the per-row field limit. */
  preservedColumns?: string[]
  /** Maximum candidate fields returned for each row. */
  fieldLimit?: number
  /** Skip null, undefined, and empty-string candidates before applying the limit. */
  omitEmptyFields?: boolean
}

export interface BaseRowPageOptions {
  offset: number
  limit: number
  query?: BaseRowQuery
  /**
   * Optional per-row response projection. Record identity and title are always
   * included. Query-only fields may be read internally for filtering, sorting,
   * and cursor generation but are not exposed in the returned rows.
   */
  projection?: BaseRowPageProjection
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

export interface BaseValidationIssue {
  code: string
  message: string
  table?: string
}

export interface BaseValidationResult {
  valid: boolean
  metadata: BaseMetadata | null
  tables: BaseTableInfo[]
  errors: BaseValidationIssue[]
  warnings: BaseValidationIssue[]
}

export interface BaseTableSnapshot {
  table: BaseTableInfo
  fields: BaseFieldInfo[]
  views: BaseViewInfo[]
  rowCount: number
}

export interface BaseRowPage {
  tableId: string
  offset: number
  limit: number
  total: number
  rows: BaseRow[]
  /** Opaque cursor for the next contiguous page, when cursor paging is safe. */
  nextCursor?: string
}

export interface BaseRowGroupCount {
  value: BaseSqlPrimitive
  total: number
}

export type BaseColumnStatType =
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

export interface BaseColumnStatConfig {
  columnName: string
  type: BaseColumnStatType
}

export interface BaseColumnStatResult extends BaseColumnStatConfig {
  value: string | number | null
}

export interface BaseRowMutationResult {
  tableId: string
  row: BaseRow
  rowCount: number
  /** Base metadata revision after the committed mutation. */
  revision?: string
}

export interface BaseRowUpdate {
  rowId: string
  changes: BaseRow
}

export interface BaseRowsMutationResult {
  tableId: string
  rows: BaseRow[]
  rowCount: number
  /** Base metadata revision after the committed mutation. */
  revision?: string
}

export interface BaseRowRange {
  startIndex: number
  endIndex: number
}

export interface BaseRowsDeleteResult {
  tableId: string
  deletedCount: number
  rowCount: number
  /** Base metadata revision after the committed mutation. */
  revision?: string
}

export interface BaseSnapshot {
  path: string
  metadata: BaseMetadata
  tables: BaseTableSnapshot[]
}
