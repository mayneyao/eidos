import { existsSync, lstatSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import Database from "better-sqlite3"

import type {
  LegacyAsset,
  LegacyDocument,
  LegacyExtension,
  LegacyField,
  LegacyReference,
  LegacySpaceSnapshot,
  LegacyTable,
  LegacyTreeNode,
  LegacyView,
  MigrationIssue,
} from "./types"

interface SqliteObjectRow {
  name: string
  type: string
}

interface SqliteColumnRow {
  name: string
  type: string
  hidden: number
}

type DatabaseRow = Record<string, unknown>

const REQUIRED_TABLES = ["eidos__tree", "eidos__docs"] as const

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 1 || value === "1"
}

function parseJson<T>(
  value: unknown,
  fallback: T,
  issues: MigrationIssue[],
  context: string
): T {
  if (value === null || value === undefined || value === "") return fallback
  if (typeof value !== "string") return value as T
  try {
    return JSON.parse(value) as T
  } catch {
    issues.push({
      severity: "warning",
      code: "invalid-json-metadata",
      message: `Invalid JSON metadata in ${context}`,
    })
    return fallback
  }
}

function normalizeAssetRelativePath(value: string): string | null {
  const normalized = value.replace(/\\/g, "/").replace(/^~\//, "")
  const withoutPrefix = normalized
    .replace(/^\.eidos\//, "")
    .replace(/^files\//, "")
  const segments = withoutPrefix
    .split("/")
    .filter((segment) => segment && segment !== ".")
  if (segments.length === 0 || segments.some((segment) => segment === "..")) {
    return null
  }
  return segments.join("/")
}

function listFilesRecursively(root: string, relative = ""): string[] {
  if (!existsSync(root)) return []
  const result: string[] = []
  for (const entry of readdirSync(path.join(root, relative), {
    withFileTypes: true,
  })) {
    const child = relative ? path.join(relative, entry.name) : entry.name
    if (entry.isDirectory()) result.push(...listFilesRecursively(root, child))
    else if (entry.isFile()) result.push(child.split(path.sep).join("/"))
  }
  return result
}

function fingerprintAssets(sourceRoot: string): string {
  const filesRoot = path.join(sourceRoot, ".eidos", "files")
  const hash = createHash("sha256")
  for (const relativePath of listFilesRecursively(filesRoot).sort()) {
    const stats = statSync(path.join(filesRoot, ...relativePath.split("/")))
    hash.update(relativePath)
    hash.update("\0")
    hash.update(String(stats.size))
    hash.update("\0")
    hash.update(String(stats.mtimeMs))
    hash.update("\0")
  }
  return hash.digest("hex")
}

function inspectAssetPath(
  filesRoot: string,
  relativePath: string
): { exists: boolean; safe: boolean } {
  let currentPath = filesRoot
  for (const segment of relativePath.split("/")) {
    currentPath = path.join(currentPath, segment)
    if (!existsSync(currentPath)) return { exists: false, safe: true }
    if (lstatSync(currentPath).isSymbolicLink()) {
      return { exists: true, safe: false }
    }
  }
  return {
    exists: existsSync(currentPath) && lstatSync(currentPath).isFile(),
    safe: true,
  }
}

function readNodes(database: Database.Database): LegacyTreeNode[] {
  return database
    .prepare("SELECT * FROM eidos__tree ORDER BY position, rowid")
    .all()
    .map((row) => {
      const value = row as DatabaseRow
      return {
        id: String(value.id),
        name: stringValue(value.name) ?? "Untitled",
        type: stringValue(value.type) ?? "unknown",
        parentId: stringValue(value.parent_id),
        position: numberValue(value.position),
        icon: stringValue(value.icon),
        isDeleted: booleanValue(value.is_deleted),
        createdAt: stringValue(value.created_at),
        updatedAt: stringValue(value.updated_at),
      }
    })
}

function readDocuments(
  database: Database.Database,
  tableNames: Set<string>,
  issues: MigrationIssue[]
): LegacyDocument[] {
  const propertyTypes = new Map<string, string>()
  if (tableNames.has("eidos__columns")) {
    for (const row of database
      .prepare(
        "SELECT table_column_name, type FROM eidos__columns WHERE table_name = 'eidos__docs'"
      )
      .all() as Array<{ table_column_name: string; type: string }>) {
      propertyTypes.set(row.table_column_name, row.type)
    }
  }
  const reserved = new Set([
    "id",
    "content",
    "markdown",
    "is_day_page",
    "meta",
    "created_at",
    "updated_at",
  ])
  return database
    .prepare("SELECT * FROM eidos__docs ORDER BY rowid")
    .all()
    .map((row) => {
      const value = row as DatabaseRow
      const id = String(value.id)
      const properties = Object.fromEntries(
        Object.entries(value)
          .filter(
            ([key, propertyValue]) =>
              !reserved.has(key) && propertyValue !== undefined
          )
          .map(([key, propertyValue]) => [
            key,
            propertyValue !== null && propertyTypes.get(key) === "checkbox"
              ? booleanValue(propertyValue)
              : propertyValue,
          ])
      )
      return {
        id,
        markdown: stringValue(value.markdown),
        lexicalState: stringValue(value.content),
        isDayPage: booleanValue(value.is_day_page),
        metadata: parseJson<Record<string, unknown> | null>(
          value.meta,
          null,
          issues,
          `eidos__docs.${id}.meta`
        ),
        properties,
        createdAt: stringValue(value.created_at),
        updatedAt: stringValue(value.updated_at),
      }
    })
}

function readFields(
  database: Database.Database,
  tableNames: Set<string>,
  issues: MigrationIssue[]
): Map<string, LegacyField[]> {
  const result = new Map<string, LegacyField[]>()
  if (!tableNames.has("eidos__columns")) return result
  for (const row of database
    .prepare("SELECT * FROM eidos__columns ORDER BY rowid")
    .all()) {
    const value = row as DatabaseRow
    const tableName = stringValue(value.table_name)
    const columnName = stringValue(value.table_column_name)
    if (!tableName || !columnName) continue
    const fields = result.get(tableName) ?? []
    fields.push({
      name: stringValue(value.name) ?? columnName,
      type: stringValue(value.type) ?? "text",
      tableName,
      columnName,
      property: parseJson<Record<string, unknown> | null>(
        value.property,
        null,
        issues,
        `${tableName}.${columnName}.property`
      ),
      createdAt: stringValue(value.created_at),
      updatedAt: stringValue(value.updated_at),
      isGenerated: false,
      isReadable: true,
    })
    result.set(tableName, fields)
  }
  return result
}

function readViews(
  database: Database.Database,
  tableNames: Set<string>,
  issues: MigrationIssue[]
): Map<string, LegacyView[]> {
  const result = new Map<string, LegacyView[]>()
  if (!tableNames.has("eidos__views")) return result
  for (const row of database
    .prepare("SELECT * FROM eidos__views ORDER BY position, rowid")
    .all()) {
    const value = row as DatabaseRow
    const tableId = stringValue(value.table_id)
    if (!tableId) continue
    const views = result.get(tableId) ?? []
    views.push({
      id: String(value.id),
      name: stringValue(value.name) ?? "View",
      type: stringValue(value.type) ?? "grid",
      tableId,
      query: stringValue(value.query) ?? `SELECT * FROM tb_${tableId}`,
      properties: parseJson<Record<string, unknown> | null>(
        value.properties,
        null,
        issues,
        `eidos__views.${String(value.id)}.properties`
      ),
      filter: parseJson(
        value.filter,
        null,
        issues,
        `eidos__views.${String(value.id)}.filter`
      ),
      orderMap: parseJson<Record<string, number> | null>(
        value.order_map,
        null,
        issues,
        `eidos__views.${String(value.id)}.order_map`
      ),
      hiddenFields: parseJson<string[]>(
        value.hidden_fields,
        [],
        issues,
        `eidos__views.${String(value.id)}.hidden_fields`
      ),
      position: numberValue(value.position),
    })
    result.set(tableId, views)
  }
  return result
}

function readReferences(
  database: Database.Database,
  tableNames: Set<string>
): LegacyReference[] {
  if (!tableNames.has("eidos__references")) return []
  return database
    .prepare("SELECT * FROM eidos__references ORDER BY rowid")
    .all()
    .map((row) => {
      const value = row as DatabaseRow
      return {
        selfTableName: stringValue(value.self_table_name) ?? "",
        selfColumnName: stringValue(value.self_table_column_name) ?? "",
        refTableName: stringValue(value.ref_table_name) ?? "",
        refColumnName: stringValue(value.ref_table_column_name) ?? "",
        linkTableName: stringValue(value.link_table_name) ?? "",
        linkColumnName: stringValue(value.link_table_column_name) ?? "",
      }
    })
}

function readTables(
  database: Database.Database,
  nodes: LegacyTreeNode[],
  sqliteObjects: Set<string>,
  fieldsByTable: Map<string, LegacyField[]>,
  viewsByTable: Map<string, LegacyView[]>,
  references: LegacyReference[],
  issues: MigrationIssue[]
): LegacyTable[] {
  const tables: LegacyTable[] = []
  for (const node of nodes.filter(
    (candidate) => candidate.type === "table" && !candidate.isDeleted
  )) {
    const rawTableName = `tb_${node.id}`
    if (!sqliteObjects.has(rawTableName)) {
      issues.push({
        severity: "error",
        code: "table-storage-missing",
        message: `Physical table is missing: ${rawTableName}`,
        sourceId: node.id,
      })
      continue
    }
    const rowCount = Number(
      (
        database
          .prepare(
            `SELECT COUNT(*) AS count FROM "${rawTableName.replace(/"/g, '""')}"`
          )
          .get() as { count: number | bigint }
      ).count
    )
    const fields = [...(fieldsByTable.get(rawTableName) ?? [])]
    const fieldNames = new Set(fields.map((field) => field.columnName))
    const systemColumns = new Set([
      "_id",
      "title",
      "_created_time",
      "_last_edited_time",
      "_created_by",
      "_last_edited_by",
    ])
    const physicalColumns = database
      .prepare(`PRAGMA table_xinfo("${rawTableName.replace(/"/g, '""')}")`)
      .all() as SqliteColumnRow[]
    for (const column of physicalColumns) {
      if (fieldNames.has(column.name) || systemColumns.has(column.name))
        continue
      const numeric = /INT|REAL|FLOA|DOUB|NUM|DEC/i.test(column.type)
      fields.push({
        name: column.name,
        type: numeric ? "number" : "text",
        tableName: rawTableName,
        columnName: column.name,
        property: null,
        createdAt: null,
        updatedAt: null,
        isGenerated: column.hidden !== 0,
        isReadable: true,
      })
      issues.push({
        severity: "warning",
        code: "field-metadata-missing",
        message: `Physical column ${rawTableName}.${column.name} has no field metadata and will be recovered as ${numeric ? "number" : "text"}`,
        sourceId: node.id,
      })
    }
    const physicalColumnsByName = new Map(
      physicalColumns.map((column) => [column.name, column])
    )
    for (const field of fields) {
      const physicalColumn = physicalColumnsByName.get(field.columnName)
      field.isGenerated = (physicalColumn?.hidden ?? 0) !== 0
      if (!field.isGenerated) continue
      try {
        database.prepare(
          `SELECT "${field.columnName.replace(/"/g, '""')}" FROM "${rawTableName.replace(/"/g, '""')}" LIMIT 0`
        )
      } catch (error) {
        field.isReadable = false
        issues.push({
          severity: "warning",
          code: "generated-column-unreadable",
          message: `Generated column ${rawTableName}.${field.columnName} cannot be evaluated by the standalone migration runtime and will be imported without a materialized value: ${error instanceof Error ? error.message : String(error)}`,
          sourceId: node.id,
        })
      }
    }
    tables.push({
      id: node.id,
      name: node.name,
      rawTableName,
      rowCount,
      fields,
      views: viewsByTable.get(node.id) ?? [],
      references: references.filter(
        (reference) => reference.selfTableName === rawTableName
      ),
      icon: node.icon,
      position: node.position,
    })
  }
  return tables
}

function readAssets(
  database: Database.Database,
  tableNames: Set<string>,
  sourceRoot: string,
  issues: MigrationIssue[]
): LegacyAsset[] {
  const filesRoot = path.join(sourceRoot, ".eidos", "files")
  const assets = new Map<string, LegacyAsset>()
  if (tableNames.has("eidos__files")) {
    for (const row of database
      .prepare("SELECT * FROM eidos__files ORDER BY rowid")
      .all()) {
      const value = row as DatabaseRow
      const id = String(value.id)
      const databasePath = stringValue(value.path)
      const name = stringValue(value.name) ?? path.basename(databasePath ?? id)
      const relativePath = normalizeAssetRelativePath(databasePath ?? name)
      if (!relativePath) {
        issues.push({
          severity: "error",
          code: "asset-path-invalid",
          message: `Asset path is not Space-relative: ${databasePath ?? name}`,
          sourceId: id,
        })
        continue
      }
      const physicalPath = path.join(filesRoot, ...relativePath.split("/"))
      const pathInspection = inspectAssetPath(filesRoot, relativePath)
      if (!pathInspection.safe) {
        issues.push({
          severity: "error",
          code: "asset-symlink-unsupported",
          message: `Asset path traverses a symbolic link and cannot be exported safely: ${relativePath}`,
          sourceId: id,
          sourcePath: relativePath,
        })
      }
      assets.set(relativePath.toLocaleLowerCase("en-US"), {
        id,
        name,
        databasePath,
        sourceRelativePath: relativePath,
        size: numberValue(value.size),
        mime: stringValue(value.mime),
        registered: true,
        exists:
          pathInspection.safe &&
          pathInspection.exists &&
          statSync(physicalPath).isFile(),
      })
    }
  }
  for (const relativePath of listFilesRecursively(filesRoot)) {
    const key = relativePath.toLocaleLowerCase("en-US")
    if (assets.has(key)) continue
    const physicalPath = path.join(filesRoot, ...relativePath.split("/"))
    assets.set(key, {
      id: `unregistered:${relativePath}`,
      name: path.basename(relativePath),
      databasePath: null,
      sourceRelativePath: relativePath,
      size: statSync(physicalPath).size,
      mime: null,
      registered: false,
      exists: true,
    })
  }
  return [...assets.values()]
}

function readExtensions(
  database: Database.Database,
  tableNames: Set<string>
): LegacyExtension[] {
  if (!tableNames.has("eidos__extensions")) return []
  return database
    .prepare("SELECT * FROM eidos__extensions ORDER BY rowid")
    .all()
    .map((row) => {
      const value = row as DatabaseRow
      return {
        id: String(value.id),
        slug: stringValue(value.slug),
        name: stringValue(value.name),
        description: stringValue(value.description),
        type: stringValue(value.type),
        version: stringValue(value.version),
        code: stringValue(value.code),
        tsCode: stringValue(value.ts_code),
        metaJson: stringValue(value.meta),
        icon: stringValue(value.icon),
        marketplaceId: stringValue(value.marketplace_id),
        enabled: booleanValue(value.enabled),
        bindingsJson: stringValue(value.bindings),
        createdAt: stringValue(value.created_at),
        updatedAt: stringValue(value.updated_at),
      }
    })
}

export interface InspectLegacySpaceOptions {
  databasePath?: string
}

export function inspectLegacyExtensions(
  sourceRoot: string,
  options: InspectLegacySpaceOptions = {}
): LegacyExtension[] {
  const resolvedRoot = path.resolve(sourceRoot)
  const databasePath = path.resolve(
    options.databasePath ?? path.join(resolvedRoot, ".eidos", "db.sqlite3")
  )
  if (!existsSync(databasePath)) {
    throw new Error(`Legacy Space database not found: ${databasePath}`)
  }
  const database = new Database(databasePath, {
    fileMustExist: true,
    readonly: true,
  })
  try {
    database.pragma("query_only = ON")
    const tableNames = new Set(
      (
        database
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as Array<{ name: string }>
      ).map((table) => table.name)
    )
    return readExtensions(database, tableNames)
  } finally {
    database.close()
  }
}

export function inspectLegacySpace(
  sourceRoot: string,
  options: InspectLegacySpaceOptions = {}
): LegacySpaceSnapshot {
  const resolvedRoot = path.resolve(sourceRoot)
  const databasePath = path.resolve(
    options.databasePath ?? path.join(resolvedRoot, ".eidos", "db.sqlite3")
  )
  if (!existsSync(databasePath)) {
    throw new Error(`Legacy Space database not found: ${databasePath}`)
  }
  const databaseStat = statSync(databasePath)
  const walPath = `${databasePath}-wal`
  const walStat = existsSync(walPath) ? statSync(walPath) : null
  const sourceFingerprint = {
    databaseSize: databaseStat.size,
    databaseMtimeMs: databaseStat.mtimeMs,
    walSize: walStat?.size ?? null,
    walMtimeMs: walStat?.mtimeMs ?? null,
    assetsDigest: fingerprintAssets(resolvedRoot),
  }
  const database = new Database(databasePath, {
    fileMustExist: true,
    readonly: true,
  })
  const issues: MigrationIssue[] = []
  try {
    database.pragma("query_only = ON")
    const objects = database
      .prepare(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view')"
      )
      .all() as SqliteObjectRow[]
    const tableNames = new Set(objects.map((object) => object.name))
    for (const requiredTable of REQUIRED_TABLES) {
      if (!tableNames.has(requiredTable)) {
        issues.push({
          severity: "error",
          code: "legacy-schema-missing",
          message: `Required legacy table is missing: ${requiredTable}`,
        })
      }
    }
    if (issues.some((issue) => issue.severity === "error")) {
      return {
        sourceRoot: resolvedRoot,
        databasePath,
        sourceFingerprint,
        nodes: [],
        documents: [],
        tables: [],
        assets: [],
        extensions: [],
        issues,
      }
    }
    const nodes = readNodes(database)
    const documents = readDocuments(database, tableNames, issues)
    const fieldsByTable = readFields(database, tableNames, issues)
    const viewsByTable = readViews(database, tableNames, issues)
    const references = readReferences(database, tableNames)
    const tables = readTables(
      database,
      nodes,
      tableNames,
      fieldsByTable,
      viewsByTable,
      references,
      issues
    )
    const assets = readAssets(database, tableNames, resolvedRoot, issues)
    const extensions = readExtensions(database, tableNames)
    return {
      sourceRoot: resolvedRoot,
      databasePath,
      sourceFingerprint,
      nodes,
      documents,
      tables,
      assets,
      extensions,
      issues,
    }
  } finally {
    database.close()
  }
}

export { exportLegacyExtensionArchive, exportLegacySpace } from "./exporter"
