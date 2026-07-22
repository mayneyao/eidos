/** Eidos File 1.0 application-file identity. */
export const EIDOS_FILE_FORMAT = "eidos-file" as const
export const EIDOS_FILE_FORMAT_VERSION = "1.0" as const
export const EIDOS_FILE_SCHEMA_VERSION = 1 as const
export const EIDOS_FILE_APPLICATION_ID = 0x45494453 as const
export const EIDOS_FILE_EXTENSION = ".eidos" as const
export const EIDOS_FILE_MIME_TYPE = "application/vnd.eidos+sqlite3" as const
export const SQLITE_HEADER = "SQLite format 3\u0000" as const

export function hasEidosFileSqliteHeader(
  bytes: ArrayBuffer | Uint8Array
): boolean {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (source.byteLength < SQLITE_HEADER.length) return false
  for (let index = 0; index < SQLITE_HEADER.length; index += 1) {
    if (source[index] !== SQLITE_HEADER.charCodeAt(index)) return false
  }
  return true
}

export const EIDOS_FILE_META_TABLE = "eidos__meta" as const
export const EIDOS_FILE_FEATURES_TABLE = "eidos__features" as const
export const EIDOS_FILE_TABLES_TABLE = "eidos__tables" as const
export const EIDOS_FILE_FIELDS_TABLE = "eidos__fields" as const
export const EIDOS_FILE_RELATION_FIELDS_TABLE =
  "eidos__relation_fields" as const
export const EIDOS_FILE_FORMULA_FIELDS_TABLE = "eidos__formula_fields" as const
export const EIDOS_FILE_LOOKUP_FIELDS_TABLE = "eidos__lookup_fields" as const
export const EIDOS_FILE_VIEWS_TABLE = "eidos__views" as const

export const EIDOS_FILE_REQUIRED_TABLES = [
  EIDOS_FILE_META_TABLE,
  EIDOS_FILE_FEATURES_TABLE,
  EIDOS_FILE_TABLES_TABLE,
  EIDOS_FILE_FIELDS_TABLE,
  EIDOS_FILE_RELATION_FIELDS_TABLE,
  EIDOS_FILE_FORMULA_FIELDS_TABLE,
  EIDOS_FILE_LOOKUP_FIELDS_TABLE,
  EIDOS_FILE_VIEWS_TABLE,
] as const

export const EIDOS_FILE_SYSTEM_COLUMNS = [
  "_id",
  "_created_at",
  "_updated_at",
] as const
