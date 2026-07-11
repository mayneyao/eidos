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
  | "csv_ids"
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
  filter: unknown
  orderMap: Record<string, number> | null
  hiddenFields: string[]
  position: number | null
  createdAt: string
  updatedAt: string
}

export interface UpdateBaseViewInput {
  properties?: Record<string, unknown> | null
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

export interface UpdateBaseTableInput {
  name?: string
  icon?: string | null
  description?: string | null
}

export interface CreateBaseFieldInput {
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
  query: string
  properties?: Record<string, unknown> | null
  filter?: unknown
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
  property?: Record<string, unknown> | null
}

export type BaseRowValue = BaseSqlPrimitive | boolean
export type BaseRow = Record<string, BaseRowValue>

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
}

export interface BaseRowMutationResult {
  tableId: string
  row: BaseRow
  rowCount: number
}

export interface BaseRowRange {
  startIndex: number
  endIndex: number
}

export interface BaseRowsDeleteResult {
  tableId: string
  deletedCount: number
  rowCount: number
}

export interface BaseSnapshot {
  path: string
  metadata: BaseMetadata
  tables: BaseTableSnapshot[]
}
