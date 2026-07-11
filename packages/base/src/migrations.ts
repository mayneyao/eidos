import type { BaseConnection } from "./connection"
import {
  BASE_COLUMNS_TABLE,
  BASE_META_TABLE,
  BASE_SCHEMA_VERSION,
} from "./constants"
import { BaseError } from "./errors"
import { setBaseMetadata } from "./schema"

interface TableInfoRow {
  name: string
}

const COLUMN_SCHEMA_V1: Array<[string, string]> = [
  ["storage_codec", "TEXT DEFAULT 'scalar'"],
  ["value_kind", "TEXT DEFAULT 'source'"],
  ["is_hidden", "INTEGER DEFAULT 0"],
  ["is_derived", "INTEGER DEFAULT 0"],
  ["source_table_column_name", "TEXT"],
  ["depends_on", "TEXT"],
]

export function getBaseSchemaVersion(connection: BaseConnection): number {
  const row = connection.get<{ value: string }>(
    `SELECT value FROM ${BASE_META_TABLE} WHERE key = 'schema_version'`
  )
  return Number(row?.value ?? 0)
}

export function migrateBaseSchema(connection: BaseConnection): number {
  const currentVersion = getBaseSchemaVersion(connection)
  if (currentVersion > BASE_SCHEMA_VERSION) {
    throw new BaseError(
      "unsupported-format",
      `Cannot migrate Base schema ${currentVersion} with runtime ${BASE_SCHEMA_VERSION}`
    )
  }
  if (currentVersion === BASE_SCHEMA_VERSION) return currentVersion

  connection.transaction(() => {
    const existingColumns = new Set(
      connection
        .query<TableInfoRow>(`PRAGMA table_info(${BASE_COLUMNS_TABLE})`)
        .map((column) => column.name)
    )
    for (const [name, definition] of COLUMN_SCHEMA_V1) {
      if (!existingColumns.has(name)) {
        connection.exec(
          `ALTER TABLE ${BASE_COLUMNS_TABLE} ADD COLUMN ${name} ${definition}`
        )
      }
    }
    setBaseMetadata(connection, {
      schema_version: String(BASE_SCHEMA_VERSION),
    })
  })
  return BASE_SCHEMA_VERSION
}
