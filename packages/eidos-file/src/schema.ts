import type { EidosFileConnection } from "./connection"
import {
  EIDOS_FILE_APPLICATION_ID,
  EIDOS_FILE_FORMAT_VERSION,
  EIDOS_FILE_SCHEMA_VERSION,
} from "./constants"
import { EidosFileError } from "./errors"
import {
  assertEidosFileDisplayName,
  assertEidosFileUuid,
  createEidosFileUuid,
} from "./identifiers"
import { currentEidosFileInstant, normalizeEidosFileInstant } from "./temporal"
import type { CreateEidosFileOptions } from "./types"

/**
 * Canonical metadata DDL from Eidos File Format 1.0 section 7.
 *
 * Keep this definition format-owned. Runtime, Adapter, and UI code must not
 * introduce alternate metadata columns or duplicate semantic state.
 */
export const EIDOS_FILE_SCHEMA_SQL = `
CREATE TABLE eidos__tables(
  id TEXT PRIMARY KEY COLLATE BINARY
    CHECK(length(CAST(id AS BLOB))=36 AND instr(id,char(0))=0
      AND substr(id,9,1)='-' AND substr(id,14,1)='-'
      AND substr(id,15,1)='7' AND substr(id,19,1)='-'
      AND substr(id,20,1) IN ('8','9','a','b') AND substr(id,24,1)='-'
      AND lower(id)=id AND length(CAST(replace(id,'-','') AS BLOB))=32
      AND replace(id,'-','') NOT GLOB '*[^0-9a-f]*'),
  name TEXT NOT NULL
    CHECK(length(CAST(name AS BLOB)) BETWEEN 1 AND 1024 AND instr(name,char(0))=0),
  physical_name TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK(length(CAST(physical_name AS BLOB)) BETWEEN 1 AND 1024
      AND instr(physical_name,char(0))=0),
  label_field_id TEXT NOT NULL COLLATE BINARY,
  position INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(settings_json) AND json_type(settings_json)='object'),
  created_at TEXT NOT NULL
    CHECK(length(CAST(created_at AS BLOB))=24
      AND created_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(created_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+0 seconds')=created_at,0)),
  updated_at TEXT NOT NULL
    CHECK(length(CAST(updated_at AS BLOB))=24
      AND updated_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(updated_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0 seconds')=updated_at,0)),
  FOREIGN KEY(label_field_id) REFERENCES eidos__fields(id)
    DEFERRABLE INITIALLY DEFERRED
) STRICT, WITHOUT ROWID;

CREATE TABLE eidos__fields(
  id TEXT PRIMARY KEY COLLATE BINARY
    CHECK(length(CAST(id AS BLOB))=36 AND instr(id,char(0))=0
      AND substr(id,9,1)='-' AND substr(id,14,1)='-'
      AND substr(id,15,1)='7' AND substr(id,19,1)='-'
      AND substr(id,20,1) IN ('8','9','a','b') AND substr(id,24,1)='-'
      AND lower(id)=id AND length(CAST(replace(id,'-','') AS BLOB))=32
      AND replace(id,'-','') NOT GLOB '*[^0-9a-f]*'),
  table_id TEXT NOT NULL COLLATE BINARY
    REFERENCES eidos__tables(id) ON DELETE CASCADE,
  name TEXT NOT NULL
    CHECK(length(CAST(name AS BLOB)) BETWEEN 1 AND 1024 AND instr(name,char(0))=0),
  physical_name TEXT COLLATE NOCASE
    CHECK(physical_name IS NULL OR
      (length(CAST(physical_name AS BLOB)) BETWEEN 1 AND 1024
       AND instr(physical_name,char(0))=0)),
  type TEXT NOT NULL CHECK(type IN (
    'text','number','integer','checkbox','date','datetime','url','json',
    'select','multi-select','file','relation','formula','lookup'
  )),
  system_role TEXT CHECK(system_role IN ('row-id','created-time','updated-time')),
  nullable INTEGER NOT NULL DEFAULT 1 CHECK(nullable IN (0,1)),
  position INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(settings_json) AND json_type(settings_json)='object'),
  created_at TEXT NOT NULL
    CHECK(length(CAST(created_at AS BLOB))=24
      AND created_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(created_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+0 seconds')=created_at,0)),
  updated_at TEXT NOT NULL
    CHECK(length(CAST(updated_at AS BLOB))=24
      AND updated_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(updated_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0 seconds')=updated_at,0)),
  UNIQUE(table_id,name COLLATE NOCASE),
  UNIQUE(table_id,physical_name COLLATE NOCASE),
  CHECK(physical_name IS NOT NULL OR type IN ('relation','formula','lookup')),
  CHECK(system_role IS NULL OR
    (system_role='row-id' AND type='text' AND physical_name='_id' AND nullable=0) OR
    (system_role='created-time' AND type='datetime'
      AND physical_name='_created_at' AND nullable=0) OR
    (system_role='updated-time' AND type='datetime'
      AND physical_name='_updated_at' AND nullable=0))
) STRICT, WITHOUT ROWID;

CREATE UNIQUE INDEX eidos__fields_one_system_role
  ON eidos__fields(table_id,system_role) WHERE system_role IS NOT NULL;

CREATE TABLE eidos__meta(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  format_major INTEGER NOT NULL CHECK(format_major=1),
  format_minor INTEGER NOT NULL CHECK(format_minor=0),
  file_id TEXT NOT NULL UNIQUE COLLATE BINARY
    CHECK(length(CAST(file_id AS BLOB))=36 AND instr(file_id,char(0))=0
      AND substr(file_id,9,1)='-' AND substr(file_id,14,1)='-'
      AND substr(file_id,15,1)='7' AND substr(file_id,19,1)='-'
      AND substr(file_id,20,1) IN ('8','9','a','b') AND substr(file_id,24,1)='-'
      AND lower(file_id)=file_id
      AND length(CAST(replace(file_id,'-','') AS BLOB))=32
      AND replace(file_id,'-','') NOT GLOB '*[^0-9a-f]*'),
  title TEXT NOT NULL
    CHECK(length(CAST(title AS BLOB)) BETWEEN 1 AND 1024 AND instr(title,char(0))=0),
  default_table_id TEXT COLLATE BINARY
    REFERENCES eidos__tables(id) DEFERRABLE INITIALLY DEFERRED,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
  created_at TEXT NOT NULL
    CHECK(length(CAST(created_at AS BLOB))=24
      AND created_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(created_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+0 seconds')=created_at,0)),
  updated_at TEXT NOT NULL
    CHECK(length(CAST(updated_at AS BLOB))=24
      AND updated_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(updated_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0 seconds')=updated_at,0))
) STRICT, WITHOUT ROWID;

CREATE TRIGGER eidos__meta_no_delete BEFORE DELETE ON eidos__meta
BEGIN SELECT RAISE(ABORT,'eidos_meta_required'); END;

CREATE TRIGGER eidos__meta_no_key_update BEFORE UPDATE OF singleton ON eidos__meta
BEGIN SELECT RAISE(ABORT,'eidos_meta_singleton'); END;

CREATE TABLE eidos__features(
  name TEXT PRIMARY KEY COLLATE BINARY
    CHECK(length(CAST(name AS BLOB)) BETWEEN 1 AND 255 AND instr(name,char(0))=0),
  version TEXT NOT NULL
    CHECK(length(CAST(version AS BLOB)) BETWEEN 1 AND 64 AND instr(version,char(0))=0),
  required INTEGER NOT NULL DEFAULT 0 CHECK(required IN (0,1)),
  config_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(config_json) AND json_type(config_json)='object')
) STRICT, WITHOUT ROWID;

CREATE TABLE eidos__relation_fields(
  field_id TEXT PRIMARY KEY COLLATE BINARY
    REFERENCES eidos__fields(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK(direction IN ('forward','inverse')),
  target_table_id TEXT NOT NULL COLLATE BINARY REFERENCES eidos__tables(id),
  cardinality TEXT NOT NULL CHECK(cardinality IN ('one','many')),
  inverse_of_field_id TEXT COLLATE BINARY
    REFERENCES eidos__fields(id) ON DELETE RESTRICT,
  on_delete TEXT DEFAULT 'restrict'
    CHECK(on_delete IN ('restrict','detach','preserve')),
  CHECK((direction='forward' AND inverse_of_field_id IS NULL AND on_delete IS NOT NULL)
     OR (direction='inverse' AND inverse_of_field_id IS NOT NULL
         AND cardinality='many' AND on_delete IS NULL))
) STRICT, WITHOUT ROWID;

CREATE UNIQUE INDEX eidos__relation_one_inverse
  ON eidos__relation_fields(inverse_of_field_id)
  WHERE inverse_of_field_id IS NOT NULL;

CREATE TABLE eidos__formula_fields(
  field_id TEXT PRIMARY KEY COLLATE BINARY
    REFERENCES eidos__fields(id) ON DELETE CASCADE,
  source_text TEXT NOT NULL
    CHECK(length(CAST(source_text AS BLOB)) BETWEEN 1 AND 4096),
  result_type TEXT NOT NULL
    CHECK(result_type IN ('text','number','integer','checkbox','date','datetime','url','json'))
) STRICT, WITHOUT ROWID;

CREATE TABLE eidos__lookup_fields(
  field_id TEXT PRIMARY KEY COLLATE BINARY
    REFERENCES eidos__fields(id) ON DELETE CASCADE,
  relation_field_id TEXT NOT NULL COLLATE BINARY REFERENCES eidos__fields(id),
  target_field_id TEXT NOT NULL COLLATE BINARY REFERENCES eidos__fields(id),
  aggregate TEXT NOT NULL
    CHECK(aggregate IN ('values','first','count','sum','average','min','max')),
  distinct_values INTEGER NOT NULL DEFAULT 0 CHECK(distinct_values IN (0,1))
) STRICT, WITHOUT ROWID;

CREATE TABLE eidos__views(
  id TEXT PRIMARY KEY COLLATE BINARY
    CHECK(length(CAST(id AS BLOB))=36 AND instr(id,char(0))=0
      AND substr(id,9,1)='-' AND substr(id,14,1)='-'
      AND substr(id,15,1)='7' AND substr(id,19,1)='-'
      AND substr(id,20,1) IN ('8','9','a','b') AND substr(id,24,1)='-'
      AND lower(id)=id AND length(CAST(replace(id,'-','') AS BLOB))=32
      AND replace(id,'-','') NOT GLOB '*[^0-9a-f]*'),
  table_id TEXT NOT NULL COLLATE BINARY
    REFERENCES eidos__tables(id) ON DELETE CASCADE,
  name TEXT NOT NULL
    CHECK(length(CAST(name AS BLOB)) BETWEEN 1 AND 1024 AND instr(name,char(0))=0),
  type TEXT NOT NULL
    CHECK(length(CAST(type AS BLOB)) BETWEEN 1 AND 64 AND instr(type,char(0))=0),
  query_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(query_json) AND json_type(query_json)='object'),
  layout_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(layout_json) AND json_type(layout_json)='object'),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
    CHECK(length(CAST(created_at AS BLOB))=24
      AND created_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(created_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+0 seconds')=created_at,0)),
  updated_at TEXT NOT NULL
    CHECK(length(CAST(updated_at AS BLOB))=24
      AND updated_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(updated_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0 seconds')=updated_at,0)),
  UNIQUE(table_id,name COLLATE NOCASE)
) STRICT, WITHOUT ROWID;
`

function creationInstant(value: CreateEidosFileOptions["createdAt"]): string {
  return value === undefined
    ? currentEidosFileInstant()
    : normalizeEidosFileInstant(value, "createdAt")
}

export function configureEidosFileConnection(
  connection: EidosFileConnection
): void {
  connection.exec(
    "PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF; PRAGMA legacy_alter_table = OFF;"
  )
}

export function initializeEidosFileSchema(
  connection: EidosFileConnection,
  options: CreateEidosFileOptions = {},
  transaction = true
): void {
  const timestamp = creationInstant(options.createdAt)
  const fileId = assertEidosFileUuid(
    options.fileId ?? createEidosFileUuid(Date.parse(timestamp)),
    "File ID"
  )
  const title = assertEidosFileDisplayName(
    options.title ?? "Untitled",
    "File title"
  )
  configureEidosFileConnection(connection)
  const install = () => {
    connection.exec(
      `PRAGMA encoding = 'UTF-8'; PRAGMA application_id = ${EIDOS_FILE_APPLICATION_ID}; PRAGMA user_version = ${EIDOS_FILE_SCHEMA_VERSION};`
    )
    connection.exec(EIDOS_FILE_SCHEMA_SQL)
    connection.run(
      `INSERT INTO eidos__meta(
        singleton,format_major,format_minor,file_id,title,revision,created_at,updated_at
      ) VALUES(1,1,0,?,?,0,?,?)`,
      [fileId, title, timestamp, timestamp]
    )
  }
  if (transaction) connection.transaction(install)
  else install()
}

export function incrementEidosFileRevision(
  connection: EidosFileConnection,
  updatedAt = currentEidosFileInstant()
): number {
  const current = connection.get<{ revision: number | bigint }>(
    "SELECT revision FROM eidos__meta WHERE singleton=1"
  )?.revision
  if (current === undefined || BigInt(current) >= 9_223_372_036_854_775_807n) {
    throw new EidosFileError(
      "resource-limit",
      "Eidos File revision has reached the signed int64 maximum"
    )
  }
  connection.run(
    "UPDATE eidos__meta SET revision=revision+1, updated_at=? WHERE singleton=1",
    [normalizeEidosFileInstant(updatedAt, "updatedAt")]
  )
  const next = connection.get<{ revision: number | bigint }>(
    "SELECT revision FROM eidos__meta WHERE singleton=1"
  )?.revision
  return Number(next ?? 0)
}

/** Updates only metadata owned by Eidos File Format 1.0. */
export function setEidosFileMetadata(
  connection: EidosFileConnection,
  entries: Record<string, string | undefined>
): void {
  const assignments: string[] = []
  const params: Array<string | null> = []
  if (entries.title !== undefined) {
    assignments.push("title=?")
    params.push(assertEidosFileDisplayName(entries.title, "File title"))
  }
  if (entries.default_table_id !== undefined) {
    assignments.push("default_table_id=?")
    params.push(
      entries.default_table_id === ""
        ? null
        : assertEidosFileUuid(entries.default_table_id, "Default Table ID")
    )
  }
  if (assignments.length === 0) return
  connection.transaction(() => {
    const before = connection.get<Record<string, string | null>>(
      "SELECT title,default_table_id FROM eidos__meta WHERE singleton=1"
    )
    const changed = assignments.some((assignment, index) => {
      const column = assignment.slice(0, assignment.indexOf("="))
      return before?.[column] !== params[index]
    })
    if (!changed) return
    connection.run(
      `UPDATE eidos__meta SET ${assignments.join(",")} WHERE singleton=1`,
      params
    )
    incrementEidosFileRevision(connection)
  })
}

/** Compatibility constant retained for existing callers. */
export const EIDOS_FILE_FORMAT_VERSION_TEXT = EIDOS_FILE_FORMAT_VERSION
