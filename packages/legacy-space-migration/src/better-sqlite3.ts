import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"

import type {
  LegacyAsset,
  LegacyDocument,
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
  issues: MigrationIssue[]
): LegacyDocument[] {
  return database
    .prepare("SELECT * FROM eidos__docs ORDER BY rowid")
    .all()
    .map((row) => {
      const value = row as DatabaseRow
      const id = String(value.id)
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
    tables.push({
      id: node.id,
      name: node.name,
      rawTableName,
      rowCount,
      fields: fieldsByTable.get(rawTableName) ?? [],
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
      assets.set(relativePath.toLocaleLowerCase("en-US"), {
        id,
        name,
        databasePath,
        sourceRelativePath: relativePath,
        size: numberValue(value.size),
        mime: stringValue(value.mime),
        registered: true,
        exists: existsSync(physicalPath) && statSync(physicalPath).isFile(),
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

export interface InspectLegacySpaceOptions {
  databasePath?: string
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
        nodes: [],
        documents: [],
        tables: [],
        assets: [],
        issues,
      }
    }
    const nodes = readNodes(database)
    const documents = readDocuments(database, issues)
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
    return {
      sourceRoot: resolvedRoot,
      databasePath,
      nodes,
      documents,
      tables,
      assets,
      issues,
    }
  } finally {
    database.close()
  }
}
