import type { BaseConnection } from "./connection"
import {
  BASE_COLUMNS_TABLE,
  BASE_FORMAT,
  BASE_FORMAT_VERSION,
  BASE_META_TABLE,
  BASE_REFERENCES_TABLE,
  BASE_SCHEMA_VERSION,
  BASE_TABLES_TABLE,
  BASE_VIEWS_TABLE,
} from "./constants"
import type { CreateBaseOptions } from "./types"

export const BASE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ${BASE_META_TABLE} (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS ${BASE_TABLES_TABLE} (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  raw_table_name TEXT NOT NULL UNIQUE,
  position REAL,
  icon TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ${BASE_COLUMNS_TABLE} (
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

CREATE TABLE IF NOT EXISTS ${BASE_VIEWS_TABLE} (
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
  FOREIGN KEY (table_id) REFERENCES ${BASE_TABLES_TABLE}(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ${BASE_REFERENCES_TABLE} (
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
    REFERENCES ${BASE_COLUMNS_TABLE}(table_name, table_column_name)
    ON DELETE CASCADE
);
`

function upsertMetadata(
  connection: BaseConnection,
  entries: Record<string, string | undefined>
) {
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined) continue
    connection.run(
      `INSERT INTO ${BASE_META_TABLE} (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value]
    )
  }
}

export function initializeBaseSchema(
  connection: BaseConnection,
  options: CreateBaseOptions = {}
): void {
  const timestamp = options.createdAt ?? new Date().toISOString()
  connection.transaction(() => {
    connection.exec(BASE_SCHEMA_SQL)
    upsertMetadata(connection, {
      format: BASE_FORMAT,
      format_version: String(BASE_FORMAT_VERSION),
      schema_version: String(BASE_SCHEMA_VERSION),
      app: "eidos",
      created_at: timestamp,
      updated_at: timestamp,
      title: options.title,
      description: options.description,
    })
  })
}

export function setBaseMetadata(
  connection: BaseConnection,
  entries: Record<string, string | undefined>
): void {
  connection.transaction(() => {
    upsertMetadata(connection, {
      ...entries,
      updated_at: new Date().toISOString(),
    })
  })
}
