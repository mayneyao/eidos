export const EIDOS_FILE_FORMAT = "eidos-file" as const
export const EIDOS_FILE_FORMAT_VERSION = 1 as const
export const EIDOS_FILE_SCHEMA_VERSION = 1 as const
export const EIDOS_FILE_EXTENSION = ".eidos" as const
export const EIDOS_FILE_MIME_TYPE = "application/vnd.eidos+sqlite3" as const
export const SQLITE_HEADER = "SQLite format 3\u0000" as const

export const EIDOS_FILE_META_TABLE = "eidos__meta" as const
export const EIDOS_FILE_TABLES_TABLE = "eidos__tables" as const
export const EIDOS_FILE_COLUMNS_TABLE = "eidos__columns" as const
export const EIDOS_FILE_VIEWS_TABLE = "eidos__views" as const
export const EIDOS_FILE_REFERENCES_TABLE = "eidos__references" as const

export const EIDOS_FILE_REQUIRED_META_KEYS = [
  "format",
  "format_version",
  "app",
  "created_at",
  "updated_at",
] as const

export const EIDOS_FILE_REQUIRED_TABLES = [
  EIDOS_FILE_META_TABLE,
  EIDOS_FILE_TABLES_TABLE,
  EIDOS_FILE_COLUMNS_TABLE,
  EIDOS_FILE_VIEWS_TABLE,
  EIDOS_FILE_REFERENCES_TABLE,
] as const
