import type { BaseConnection } from "./connection"
import {
  BASE_COLUMNS_TABLE,
  BASE_FORMAT,
  BASE_FORMAT_VERSION,
  BASE_META_TABLE,
  BASE_REQUIRED_META_KEYS,
  BASE_REQUIRED_TABLES,
  BASE_SCHEMA_VERSION,
  BASE_TABLES_TABLE,
  BASE_VIEWS_TABLE,
  BASE_REFERENCES_TABLE,
} from "./constants"
import { quoteIdentifier } from "./identifiers"
import type {
  BaseMetadata,
  BaseTableInfo,
  BaseValidationIssue,
  BaseValidationResult,
} from "./types"

interface MetaRow {
  key: string
  value: string
}

interface RegistryRow {
  id: string
  name: string
  raw_table_name: string
  position: number | null
  icon: string | null
  description: string | null
  created_at: string
  updated_at: string
}

const REQUIRED_COLUMNS: Record<string, string[]> = {
  [BASE_META_TABLE]: ["key", "value"],
  [BASE_TABLES_TABLE]: [
    "id",
    "name",
    "raw_table_name",
    "position",
    "icon",
    "description",
    "created_at",
    "updated_at",
  ],
  [BASE_COLUMNS_TABLE]: [
    "name",
    "type",
    "table_name",
    "table_column_name",
    "property",
    "storage_codec",
    "value_kind",
    "is_hidden",
    "is_derived",
    "source_table_column_name",
    "depends_on",
    "created_at",
    "updated_at",
  ],
  [BASE_VIEWS_TABLE]: [
    "id",
    "name",
    "type",
    "table_id",
    "query",
    "properties",
    "filter",
    "order_map",
    "hidden_fields",
    "position",
    "created_at",
    "updated_at",
  ],
  [BASE_REFERENCES_TABLE]: [
    "self_table_name",
    "self_table_column_name",
    "ref_table_name",
    "ref_table_column_name",
    "link_table_name",
    "link_table_column_name",
    "self",
    "ref",
    "link",
    "created_at",
  ],
}

const REQUIRED_USER_COLUMNS = [
  "_id",
  "title",
  "_created_time",
  "_last_edited_time",
  "_created_by",
  "_last_edited_by",
]

const MIGRATABLE_V1_COLUMNS = new Set([
  "storage_codec",
  "value_kind",
  "is_hidden",
  "is_derived",
  "source_table_column_name",
  "depends_on",
])

function metadataFromRows(rows: MetaRow[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.key, row.value]))
}

function mapMetadata(values: Record<string, string>): BaseMetadata | null {
  if (values.format !== BASE_FORMAT) return null
  return {
    format: BASE_FORMAT,
    formatVersion: Number(values.format_version),
    schemaVersion: Number(values.schema_version ?? 0),
    app: values.app,
    createdAt: values.created_at,
    updatedAt: values.updated_at,
    title: values.title,
    description: values.description,
    defaultTableId: values.default_table_id,
  }
}

function mapTable(row: RegistryRow): BaseTableInfo {
  return {
    id: row.id,
    name: row.name,
    rawTableName: row.raw_table_name,
    position: row.position,
    icon: row.icon,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function validateBase(connection: BaseConnection): BaseValidationResult {
  const errors: BaseValidationIssue[] = []
  const warnings: BaseValidationIssue[] = []
  const quickCheck = connection.get<{ quick_check: string }>(
    "PRAGMA quick_check"
  )
  if (quickCheck?.quick_check !== "ok") {
    errors.push({
      code: "sqlite-integrity",
      message: `SQLite integrity check failed: ${quickCheck?.quick_check ?? "unknown"}`,
    })
  }

  const sqliteTables = new Set(
    connection
      .query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
      )
      .map((row) => row.name)
  )
  for (const tableName of BASE_REQUIRED_TABLES) {
    if (!sqliteTables.has(tableName)) {
      errors.push({
        code: "missing-required-table",
        message: `Missing required Base table: ${tableName}`,
        table: tableName,
      })
    }
  }

  if (!sqliteTables.has(BASE_META_TABLE)) {
    return { valid: false, metadata: null, tables: [], errors, warnings }
  }

  const metadataValues = metadataFromRows(
    connection.query<MetaRow>(`SELECT key, value FROM ${BASE_META_TABLE}`)
  )
  for (const key of BASE_REQUIRED_META_KEYS) {
    if (!metadataValues[key]) {
      errors.push({
        code: "missing-metadata",
        message: `Missing required Base metadata: ${key}`,
      })
    }
  }
  if (metadataValues.format !== BASE_FORMAT) {
    errors.push({
      code: "invalid-format",
      message: `Expected Base format ${BASE_FORMAT}`,
    })
  }
  const formatVersion = Number(metadataValues.format_version)
  if (formatVersion !== BASE_FORMAT_VERSION) {
    errors.push({
      code: "unsupported-format-version",
      message: `Unsupported Base format version: ${metadataValues.format_version ?? "missing"}`,
    })
  }
  const schemaVersion = Number(metadataValues.schema_version ?? 0)
  if (schemaVersion > BASE_SCHEMA_VERSION) {
    errors.push({
      code: "unsupported-schema-version",
      message: `Base schema version ${schemaVersion} is newer than ${BASE_SCHEMA_VERSION}`,
    })
  } else if (schemaVersion < BASE_SCHEMA_VERSION) {
    warnings.push({
      code: "schema-migration-available",
      message: `Base schema can be migrated from ${schemaVersion} to ${BASE_SCHEMA_VERSION}`,
    })
  }

  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    if (!sqliteTables.has(tableName)) continue
    const actualColumns = new Set(
      connection
        .query<{ name: string }>(
          `PRAGMA table_xinfo(${quoteIdentifier(tableName)})`
        )
        .map((column) => column.name)
    )
    for (const columnName of requiredColumns) {
      if (actualColumns.has(columnName)) continue
      const isMigratable =
        tableName === BASE_COLUMNS_TABLE &&
        schemaVersion < BASE_SCHEMA_VERSION &&
        MIGRATABLE_V1_COLUMNS.has(columnName)
      const issues = isMigratable ? warnings : errors
      issues.push({
        code: isMigratable
          ? "schema-column-migration-available"
          : "missing-required-column",
        message: `Missing required column ${tableName}.${columnName}`,
        table: tableName,
      })
    }
  }

  for (const [key, value] of [
    ["created_at", metadataValues.created_at],
    ["updated_at", metadataValues.updated_at],
  ] as const) {
    if (value && Number.isNaN(Date.parse(value))) {
      errors.push({
        code: "invalid-metadata-timestamp",
        message: `Invalid Base metadata timestamp: ${key}`,
      })
    }
  }

  const tables = sqliteTables.has(BASE_TABLES_TABLE)
    ? connection
        .query<RegistryRow>(
          `SELECT id, name, raw_table_name, position, icon, description,
                  created_at, updated_at
             FROM ${BASE_TABLES_TABLE}
            ORDER BY position, created_at, id`
        )
        .map(mapTable)
    : []

  for (const table of tables) {
    if (table.rawTableName !== `tb_${table.id}`) {
      errors.push({
        code: "invalid-raw-table-name",
        message: `Table ${table.id} must use raw table name tb_${table.id}`,
        table: table.rawTableName,
      })
    }
    if (!sqliteTables.has(table.rawTableName)) {
      errors.push({
        code: "missing-user-table",
        message: `Registered table is missing: ${table.rawTableName}`,
        table: table.rawTableName,
      })
      continue
    }
    const actualColumns = new Set(
      connection
        .query<{ name: string }>(
          `PRAGMA table_xinfo(${quoteIdentifier(table.rawTableName)})`
        )
        .map((column) => column.name)
    )
    for (const columnName of REQUIRED_USER_COLUMNS) {
      if (!actualColumns.has(columnName)) {
        errors.push({
          code: "missing-user-table-column",
          message: `Missing required column ${table.rawTableName}.${columnName}`,
          table: table.rawTableName,
        })
      }
    }
  }

  if (
    sqliteTables.has(BASE_COLUMNS_TABLE) &&
    sqliteTables.has(BASE_TABLES_TABLE)
  ) {
    const registeredNames = new Set(tables.map((table) => table.rawTableName))
    const orphanFields = connection.query<{ table_name: string }>(
      `SELECT DISTINCT table_name FROM ${BASE_COLUMNS_TABLE}
        WHERE table_name NOT IN (SELECT raw_table_name FROM ${BASE_TABLES_TABLE})`
    )
    for (const field of orphanFields) {
      if (!registeredNames.has(field.table_name)) {
        errors.push({
          code: "orphan-field-metadata",
          message: `Field metadata references an unregistered table: ${field.table_name}`,
          table: field.table_name,
        })
      }
    }
  }

  if (
    metadataValues.default_table_id &&
    !tables.some((table) => table.id === metadataValues.default_table_id)
  ) {
    errors.push({
      code: "invalid-default-table",
      message: `Default table is not registered: ${metadataValues.default_table_id}`,
    })
  }

  return {
    valid: errors.length === 0,
    metadata: mapMetadata(metadataValues),
    tables,
    errors,
    warnings,
  }
}
