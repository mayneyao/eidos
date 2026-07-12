export type LegacyNodeType =
  | "doc"
  | "day"
  | "folder"
  | "table"
  | "dataview"
  | "link"
  | "extension"
  | `ext__${string}`
  | string

export interface LegacyTreeNode {
  id: string
  name: string
  type: LegacyNodeType
  parentId: string | null
  position: number | null
  icon: string | null
  isDeleted: boolean
  createdAt: string | null
  updatedAt: string | null
}

export interface LegacyDocument {
  id: string
  markdown: string | null
  lexicalState: string | null
  isDayPage: boolean
  metadata: Record<string, unknown> | null
  properties: Record<string, unknown>
  createdAt: string | null
  updatedAt: string | null
}

export interface LegacyField {
  name: string
  type: string
  tableName: string
  columnName: string
  property: Record<string, unknown> | null
  createdAt: string | null
  updatedAt: string | null
}

export interface LegacyView {
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
}

export interface LegacyReference {
  selfTableName: string
  selfColumnName: string
  refTableName: string
  refColumnName: string
  linkTableName: string
  linkColumnName: string
}

export interface LegacyTable {
  id: string
  name: string
  rawTableName: string
  rowCount: number
  fields: LegacyField[]
  views: LegacyView[]
  references: LegacyReference[]
  icon: string | null
  position: number | null
}

export interface LegacyAsset {
  id: string
  name: string
  databasePath: string | null
  sourceRelativePath: string
  size: number | null
  mime: string | null
  registered: boolean
  exists: boolean
}

export type MigrationIssueSeverity = "warning" | "error"

export interface MigrationIssue {
  severity: MigrationIssueSeverity
  code: string
  message: string
  sourceId?: string
  sourcePath?: string
}

export interface LegacySpaceSnapshot {
  sourceRoot: string
  databasePath: string
  sourceFingerprint: LegacySourceFingerprint
  nodes: LegacyTreeNode[]
  documents: LegacyDocument[]
  tables: LegacyTable[]
  assets: LegacyAsset[]
  issues: MigrationIssue[]
}

export interface LegacySourceFingerprint {
  databaseSize: number
  databaseMtimeMs: number
  walSize: number | null
  walMtimeMs: number | null
  assetsDigest: string
}

export interface PlannedDocument {
  id: string
  sourceName: string
  targetPath: string
  hasMarkdown: boolean
  hasLexicalState: boolean
  createdAt: string | null
  updatedAt: string | null
}

export interface PlannedTable {
  id: string
  sourceName: string
  targetBasePath: string
  rowCount: number
  fieldCount: number
  viewCount: number
  referenceCount: number
}

export interface PlannedAsset {
  id: string
  sourceRelativePath: string
  targetPath: string
  size: number | null
  mime: string | null
  registered: boolean
  exists: boolean
}

export interface MigrationMapping {
  kind: "document" | "table" | "asset"
  sourceId: string
  sourcePath?: string
  targetPath: string
}

export interface MigrationPlanSummary {
  documentCount: number
  tableCount: number
  rowCount: number
  fieldCount: number
  viewCount: number
  referenceCount: number
  assetCount: number
  missingAssetCount: number
  warningCount: number
  errorCount: number
}

export interface LegacySpaceMigrationPlan {
  format: "eidos-legacy-space-migration-plan"
  formatVersion: 1
  sourceRoot: string
  sourceDatabasePath: string
  sourceFingerprint: LegacySourceFingerprint
  targetRoot: string
  basePath: string
  documents: PlannedDocument[]
  tables: PlannedTable[]
  assets: PlannedAsset[]
  mappings: MigrationMapping[]
  issues: MigrationIssue[]
  summary: MigrationPlanSummary
}

export interface PlanLegacySpaceMigrationOptions {
  targetRoot: string
  basePath?: string
  documentsDirectory?: string
  assetsDirectory?: string
}

export type MigrationExportPhase =
  | "preparing"
  | "documents"
  | "tables"
  | "assets"
  | "validating"
  | "reporting"
  | "finalizing"

export interface MigrationExportProgress {
  phase: MigrationExportPhase
  completed: number
  total: number
  currentPath?: string
}

export interface ExportLegacySpaceOptions {
  migrationId?: string
  rowBatchSize?: number
  onProgress?: (progress: MigrationExportProgress) => void
}

export interface MigrationExportValidation {
  baseValid: boolean
  documentCountMatches: boolean
  tableCountMatches: boolean
  rowCountMatches: boolean
  fieldCountMatches: boolean
  viewCountMatches: boolean
  referenceCountMatches: boolean
  assetCountMatches: boolean
  copiedAssetsExist: boolean
}

export interface LegacySpaceMigrationResult {
  status: "completed"
  migrationId: string
  sourceRoot: string
  sourceDatabasePath: string
  targetRoot: string
  reportPath: string
  mappingPath: string
  exportedDocumentCount: number
  exportedTableCount: number
  exportedRowCount: number
  exportedFieldCount: number
  exportedViewCount: number
  exportedReferenceCount: number
  copiedAssetCount: number
  recoveredLexicalDocumentCount: number
  validation: MigrationExportValidation
  issues: MigrationIssue[]
}
