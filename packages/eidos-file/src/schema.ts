import type { EidosFileConnection } from "./connection"
import {
  EIDOS_FILE_COLUMNS_TABLE,
  EIDOS_FILE_FORMAT,
  EIDOS_FILE_FORMAT_VERSION,
  EIDOS_FILE_META_TABLE,
  EIDOS_FILE_REFERENCES_TABLE,
  EIDOS_FILE_SCHEMA_VERSION,
  EIDOS_FILE_TABLES_TABLE,
  EIDOS_FILE_VIEWS_TABLE,
} from "./constants"
import type { CreateEidosFileOptions } from "./types"

export const EIDOS_FILE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ${EIDOS_FILE_META_TABLE} (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS ${EIDOS_FILE_TABLES_TABLE} (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  raw_table_name TEXT NOT NULL UNIQUE,
  position REAL,
  icon TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ${EIDOS_FILE_COLUMNS_TABLE} (
  name TEXT,
  type TEXT,
  table_name TEXT,
  table_column_name TEXT,
  property TEXT,
  storage_codec TEXT DEFAULT 'scalar',
  value_kind TEXT DEFAULT 'source',
  is_hidden INTEGER DEFAULT 0,
  is_derived INTEGER DEFAULT 0,
  source_table_column_name TEXT,
  depends_on TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(table_name, table_column_name)
);

CREATE TABLE IF NOT EXISTS ${EIDOS_FILE_VIEWS_TABLE} (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  table_id TEXT NOT NULL,
  query TEXT NOT NULL,
  properties TEXT,
  filter TEXT,
  order_map TEXT,
  hidden_fields TEXT,
  position REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (table_id) REFERENCES ${EIDOS_FILE_TABLES_TABLE}(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ${EIDOS_FILE_REFERENCES_TABLE} (
  self_table_name TEXT,
  self_table_column_name TEXT,
  ref_table_name TEXT,
  ref_table_column_name TEXT,
  link_table_name TEXT,
  link_table_column_name TEXT,
  self GENERATED ALWAYS AS (self_table_name || '.' || self_table_column_name) STORED,
  ref GENERATED ALWAYS AS (ref_table_name || '.' || ref_table_column_name) STORED,
  link GENERATED ALWAYS AS (link_table_name || '.' || link_table_column_name) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (
    self_table_name,
    self_table_column_name,
    ref_table_name,
    ref_table_column_name,
    link_table_name,
    link_table_column_name
  ),
  FOREIGN KEY (self_table_name, self_table_column_name)
    REFERENCES ${EIDOS_FILE_COLUMNS_TABLE}(table_name, table_column_name)
    ON DELETE CASCADE
);
`

function upsertMetadata(
  connection: EidosFileConnection,
  entries: Record<string, string | undefined>
) {
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined) continue
    connection.run(
      `INSERT INTO ${EIDOS_FILE_META_TABLE} (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value]
    )
  }
}

export function initializeEidosFileSchema(
  connection: EidosFileConnection,
  options: CreateEidosFileOptions = {}
): void {
  const timestamp = options.createdAt ?? new Date().toISOString()
  connection.transaction(() => {
    connection.exec(EIDOS_FILE_SCHEMA_SQL)
    upsertMetadata(connection, {
      format: EIDOS_FILE_FORMAT,
      format_version: String(EIDOS_FILE_FORMAT_VERSION),
      schema_version: String(EIDOS_FILE_SCHEMA_VERSION),
      app: "eidos",
      created_at: timestamp,
      updated_at: timestamp,
      title: options.title,
      description: options.description,
    })
  })
}

export function setEidosFileMetadata(
  connection: EidosFileConnection,
  entries: Record<string, string | undefined>
): void {
  connection.transaction(() => {
    upsertMetadata(connection, {
      ...entries,
      updated_at: new Date().toISOString(),
    })
  })
}
