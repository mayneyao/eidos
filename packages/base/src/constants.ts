export const BASE_FORMAT = "eidos-base" as const
export const BASE_FORMAT_VERSION = 1 as const
export const BASE_SCHEMA_VERSION = 1 as const
export const BASE_FILE_EXTENSION = ".base" as const
export const BASE_MIME_TYPE = "application/vnd.eidos.base+sqlite3" as const
export const SQLITE_HEADER = "SQLite format 3\u0000" as const

export const BASE_META_TABLE = "eidos__meta" as const
export const BASE_TABLES_TABLE = "eidos__tables" as const
export const BASE_COLUMNS_TABLE = "eidos__columns" as const
export const BASE_VIEWS_TABLE = "eidos__views" as const
export const BASE_REFERENCES_TABLE = "eidos__references" as const

export const BASE_REQUIRED_META_KEYS = [
  "format",
  "format_version",
  "app",
  "created_at",
  "updated_at",
] as const

export const BASE_REQUIRED_TABLES = [
  BASE_META_TABLE,
  BASE_TABLES_TABLE,
  BASE_COLUMNS_TABLE,
  BASE_VIEWS_TABLE,
  BASE_REFERENCES_TABLE,
] as const
