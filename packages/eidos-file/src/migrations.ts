import type { EidosFileConnection } from "./connection"
import {
  EIDOS_FILE_COLUMNS_TABLE,
  EIDOS_FILE_META_TABLE,
  EIDOS_FILE_SCHEMA_VERSION,
} from "./constants"
import { EidosFileError } from "./errors"
import { setEidosFileMetadata } from "./schema"

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

export function getEidosFileSchemaVersion(
  connection: EidosFileConnection
): number {
  const row = connection.get<{ value: string }>(
    `SELECT value FROM ${EIDOS_FILE_META_TABLE} WHERE key = 'schema_version'`
  )
  return Number(row?.value ?? 0)
}

export function migrateEidosFileSchema(
  connection: EidosFileConnection
): number {
  const currentVersion = getEidosFileSchemaVersion(connection)
  if (currentVersion > EIDOS_FILE_SCHEMA_VERSION) {
    throw new EidosFileError(
      "unsupported-format",
      `Cannot migrate Eidos File schema ${currentVersion} with runtime ${EIDOS_FILE_SCHEMA_VERSION}`
    )
  }
  if (currentVersion === EIDOS_FILE_SCHEMA_VERSION) return currentVersion

  connection.transaction(() => {
    const existingColumns = new Set(
      connection
        .query<TableInfoRow>(`PRAGMA table_info(${EIDOS_FILE_COLUMNS_TABLE})`)
        .map((column) => column.name)
    )
    for (const [name, definition] of COLUMN_SCHEMA_V1) {
      if (!existingColumns.has(name)) {
        connection.exec(
          `ALTER TABLE ${EIDOS_FILE_COLUMNS_TABLE} ADD COLUMN ${name} ${definition}`
        )
      }
    }
    setEidosFileMetadata(connection, {
      schema_version: String(EIDOS_FILE_SCHEMA_VERSION),
    })
  })
  return EIDOS_FILE_SCHEMA_VERSION
}
