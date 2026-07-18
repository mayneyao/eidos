export type RelationKind = "table" | "view"

export interface DatabaseOverview {
  applicationId: number
  encoding: string
  fileBytes: number
  freePages: number
  pageCount: number
  pageSize: number
  schemaVersion: number
  tableCount: number
  userVersion: number
  viewCount: number
}

export interface RelationSummary {
  kind: RelationKind
  name: string
  rootPage: number
  sql: string | null
  withoutRowid: boolean
}

export interface DatabaseSnapshot {
  fileName: string
  overview: DatabaseOverview
  readOnly: true
  relations: RelationSummary[]
}

export interface ColumnSchema {
  cid: number
  declaredType: string
  defaultValue: string | null
  hidden: 0 | 1 | 2 | 3
  name: string
  notNull: boolean
  primaryKeyOrder: number
}

export interface IndexColumn {
  name: string | null
  order: number
  descending: boolean
  key: boolean
}

export interface IndexSchema {
  columns: IndexColumn[]
  name: string
  origin: "c" | "u" | "pk" | string
  partial: boolean
  unique: boolean
}

export interface ForeignKeySchema {
  from: string
  id: number
  match: string
  onDelete: string
  onUpdate: string
  sequence: number
  table: string
  to: string | null
}

export interface RelationDetails {
  columns: ColumnSchema[]
  foreignKeys: ForeignKeySchema[]
  indexes: IndexSchema[]
  relation: RelationSummary
  rowCount: number
  rowidAlias: "rowid" | "_rowid_" | "oid" | null
  stableOrder: string
}

export type ViewerCellValue =
  | { kind: "null" }
  | { kind: "integer"; value: string }
  | { kind: "real"; value: number | string }
  | {
      kind: "text"
      truncated: boolean
      totalLength: number
      value: string
    }
  | { byteLength: number; hexPreview: string; kind: "blob" }
  | { kind: "other"; value: string }

export interface RelationPage {
  offset: number
  rows: ViewerCellValue[][]
}
