import type { LegacyExtensionPortabilityAssessment } from "./extension-portability"

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
  isGenerated: boolean
  isReadable: boolean
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

/**
 * A database-backed extension from the legacy Space model.
 *
 * JSON fields remain as their original strings so an export never changes or
 * discards malformed-but-recoverable metadata. The archived source is data,
 * not an executable file-based extension package.
 */
export interface LegacyExtension {
  id: string
  slug: string | null
  name: string | null
  description: string | null
  type: string | null
  version: string | null
  code: string | null
  tsCode: string | null
  metaJson: string | null
  icon: string | null
  marketplaceId: string | null
  enabled: boolean
  bindingsJson: string | null
  createdAt: string | null
  updatedAt: string | null
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
  extensions: LegacyExtension[]
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
  sourceMissing: boolean
  createdAt: string | null
  updatedAt: string | null
}

export interface PlannedField {
  sourceColumnName: string
  targetColumnName: string
  sourceReadable: boolean
}

export interface PlannedTable {
  id: string
  sourceName: string
  targetBasePath: string
  rowCount: number
  fieldCount: number
  viewCount: number
  referenceCount: number
  fields: PlannedField[]
  references: LegacyReference[]
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

export interface PlannedExtension {
  id: string
  sourceSlug: string | null
  sourceType: string | null
  targetDirectory: string
  sourcePath: string | null
  compiledPath: string | null
  metadataPath: string
  readmePath: string
}

export interface MigrationMapping {
  kind: "document" | "table" | "field" | "asset" | "extension"
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
  skippedReferenceCount: number
  assetCount: number
  missingAssetCount: number
  extensionCount: number
  warningCount: number
  errorCount: number
}

export interface LegacySpaceMigrationPlan {
  format: "eidos-legacy-space-migration-plan"
  formatVersion: 2
  sourceRoot: string
  sourceDatabasePath: string
  sourceFingerprint: LegacySourceFingerprint
  targetRoot: string
  basePath: string
  documents: PlannedDocument[]
  tables: PlannedTable[]
  skippedReferences: LegacyReference[]
  assets: PlannedAsset[]
  extensions: PlannedExtension[]
  mappings: MigrationMapping[]
  issues: MigrationIssue[]
  summary: MigrationPlanSummary
}

export interface PlanLegacySpaceMigrationOptions {
  targetRoot: string
  basePath?: string
  documentsDirectory?: string
  assetsDirectory?: string
  legacyExtensionsDirectory?: string
}

export type MigrationExportPhase =
  | "preparing"
  | "documents"
  | "tables"
  | "assets"
  | "extensions"
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
  extensionCountMatches: boolean
  archivedExtensionsExist: boolean
}

export type LegacyExtensionMigrationNextAction =
  | "port-manually"
  | "review-source"
  | "wait-for-compatible-contribution"
  | "recover-source"

export interface LegacyExtensionMigrationReportItem {
  legacyExtensionId: string
  legacySlug: string | null
  displayName: string
  previouslyEnabled: boolean
  archiveRelativePath: string
  archiveDigest: string
  executable: false
  portability: LegacyExtensionPortabilityAssessment
  nextAction: {
    kind: LegacyExtensionMigrationNextAction
    command: string | null
  }
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
  skippedReferenceCount: number
  copiedAssetCount: number
  archivedExtensionCount: number
  extensionMigrations: LegacyExtensionMigrationReportItem[]
  recoveredLexicalDocumentCount: number
  validation: MigrationExportValidation
  issues: MigrationIssue[]
}
