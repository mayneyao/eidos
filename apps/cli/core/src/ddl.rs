//! Canonical metadata DDL and file-level operations (spec §4, §7, §14).
//!
//! `EIDOS_FILE_SCHEMA_SQL` is ported VERBATIM from
//! `packages/eidos-file/src/schema.ts` (`EIDOS_FILE_SCHEMA_SQL`). It is
//! format-owned: runtime, adapter, and UI code must not introduce alternate
//! metadata columns or duplicate semantic state. Any change here must land
//! in the TypeScript constant first (or simultaneously) so the two stay
//! byte-identical.

use std::path::Path;
use std::time::Duration;

use rusqlite::Connection;

use crate::error::{EidosError, Result};
use crate::id::generate_uuidv7;
use crate::naming::assert_display_name;
use crate::time::{assert_instant, now_instant};

/// SQLite application ID: ASCII `EIDS` (spec §4).
pub const EIDOS_FILE_APPLICATION_ID: i32 = 0x4549_4453;
/// `PRAGMA user_version` for Eidos File 1.0 (spec §4 "schema revision").
pub const EIDOS_FILE_SCHEMA_VERSION: i32 = 1;
/// Human-readable format version (spec §4).
pub const EIDOS_FILE_FORMAT_VERSION: &str = "1.0";
/// First 16 octets of every Eidos File (spec §4).
pub const SQLITE_HEADER: &[u8; 16] = b"SQLite format 3\0";

/// Default `busy_timeout` applied by [`configure_connection`].
pub const DEFAULT_BUSY_TIMEOUT: Duration = Duration::from_secs(5);

/// Canonical metadata DDL from Eidos File Format 1.0 section 7, ported
/// verbatim from `EIDOS_FILE_SCHEMA_SQL` in `schema.ts` (including the
/// leading and trailing newline of the template literal).
pub const EIDOS_FILE_SCHEMA_SQL: &str = r#"
CREATE TABLE eidos__tables(
  id TEXT PRIMARY KEY COLLATE BINARY
    CHECK(length(CAST(id AS BLOB))=36 AND instr(id,char(0))=0
      AND substr(id,9,1)='-' AND substr(id,14,1)='-'
      AND substr(id,15,1)='7' AND substr(id,19,1)='-'
      AND substr(id,20,1) IN ('8','9','a','b') AND substr(id,24,1)='-'
      AND lower(id)=id AND length(CAST(replace(id,'-','') AS BLOB))=32
      AND replace(id,'-','') NOT GLOB '*[^0-9a-f]*'),
  name TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK(length(CAST(name AS BLOB)) BETWEEN 1 AND 1024
      AND instr(name,char(0))=0
      AND lower(substr(name,1,7)) NOT IN ('sqlite_','eidos__')),
  physical_name TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK(length(CAST(physical_name AS BLOB)) BETWEEN 1 AND 1024
      AND instr(physical_name,char(0))=0
      AND physical_name COLLATE BINARY = name COLLATE BINARY),
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
       AND instr(physical_name,char(0))=0
       AND physical_name COLLATE BINARY = name COLLATE BINARY)),
  type TEXT NOT NULL CHECK(type IN (
    'text','number','integer','checkbox','date','datetime','url',
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
    CHECK(result_type IN ('text','number','integer','checkbox','date','datetime','url'))
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
"#;

/// Applies the mandatory per-connection pragmas (spec §4, §19):
/// `foreign_keys = ON`, `trusted_schema = OFF`, `legacy_alter_table = OFF`,
/// plus a bounded `busy_timeout` so concurrent access surfaces `busy`
/// instead of blocking forever.
pub fn configure_connection(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF; PRAGMA legacy_alter_table = OFF;",
    )?;
    conn.busy_timeout(DEFAULT_BUSY_TIMEOUT)?;
    Ok(())
}

/// Creates a new Eidos File at `path`: a fresh SQLite database with UTF-8
/// encoding, DELETE journal mode, the §4 identity pragmas, the §7 canonical
/// DDL, and the singleton `eidos__meta` row (fresh UUIDv7 `file_id`,
/// revision 0, one canonical creation instant).
///
/// The identity pragmas, DDL, and meta insert commit in a single IMMEDIATE
/// transaction. (`PRAGMA journal_mode` and `PRAGMA encoding` are applied
/// just before it: `journal_mode` is a no-op inside a transaction, and
/// `encoding` only takes effect on an empty database.)
///
/// Returns `already-exists` if `path` exists. On failure the partially
/// created file is removed.
pub fn create_eidos_file(path: &Path, title: Option<&str>) -> Result<()> {
    if path.exists() {
        return Err(EidosError::AlreadyExists(format!(
            "refusing to overwrite existing file {}",
            path.display()
        )));
    }
    let title = title.unwrap_or("Untitled");
    assert_display_name(title, "File title")?;
    let create = || -> Result<()> {
        let conn = Connection::open(path)?;
        configure_connection(&conn)?;
        conn.execute_batch("PRAGMA encoding = 'UTF-8'; PRAGMA journal_mode = DELETE;")?;
        let instant = now_instant();
        let file_id = generate_uuidv7();
        conn.execute_batch("BEGIN IMMEDIATE")?;
        let install = || -> Result<()> {
            conn.execute_batch(&format!(
                "PRAGMA application_id = {EIDOS_FILE_APPLICATION_ID}; PRAGMA user_version = {EIDOS_FILE_SCHEMA_VERSION};"
            ))?;
            conn.execute_batch(EIDOS_FILE_SCHEMA_SQL)?;
            conn.execute(
                "INSERT INTO eidos__meta(
                  singleton,format_major,format_minor,file_id,title,revision,created_at,updated_at
                ) VALUES(1,1,0,?,?,0,?,?)",
                rusqlite::params![file_id, title, instant, instant],
            )?;
            Ok(())
        };
        match install() {
            Ok(()) => {
                conn.execute_batch("COMMIT")?;
                Ok(())
            }
            Err(err) => {
                let _ = conn.execute_batch("ROLLBACK");
                Err(err)
            }
        }
    };
    if let Err(err) = create() {
        // We created the file; never remove a pre-existing one (the
        // exists() check above guarantees this path means we made it).
        let _ = std::fs::remove_file(path);
        return Err(err);
    }
    Ok(())
}

/// Increments `eidos__meta.revision` exactly once and sets `updated_at` to
/// the operation's bound canonical instant (spec §14).
///
/// Refuses with `resource-limit` when the singleton row is missing or the
/// revision has reached the signed int64 maximum — a Writer must never wrap
/// the counter. Returns the new revision.
pub fn increment_revision(conn: &Connection, instant: &str) -> Result<i64> {
    assert_instant(instant, "updatedAt")?;
    let current: Option<i64> = conn
        .query_row(
            "SELECT revision FROM eidos__meta WHERE singleton=1",
            [],
            |row| row.get(0),
        )
        .map_err(|err| match err {
            rusqlite::Error::QueryReturnedNoRows => {
                EidosError::InvalidSchema("eidos__meta singleton row is missing".into())
            }
            other => EidosError::from(other),
        })?;
    let current = current
        .ok_or_else(|| EidosError::InvalidSchema("eidos__meta singleton row is missing".into()))?;
    if current == i64::MAX {
        return Err(EidosError::ResourceLimit(
            "Eidos File revision has reached the signed int64 maximum".into(),
        ));
    }
    conn.execute(
        "UPDATE eidos__meta SET revision=revision+1, updated_at=? WHERE singleton=1",
        rusqlite::params![instant],
    )?;
    Ok(current + 1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::id::is_valid_uuidv7;
    use crate::time::is_valid_instant;

    #[test]
    fn default_title_is_untitled() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("untitled.eidos");
        create_eidos_file(&path, None).unwrap();
        let conn = Connection::open(&path).unwrap();
        let title: String = conn
            .query_row("SELECT title FROM eidos__meta", [], |row| row.get(0))
            .unwrap();
        assert_eq!(title, "Untitled");
    }

    #[test]
    fn create_then_reopen_verifies_identity_and_shape() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sample.eidos");
        create_eidos_file(&path, Some("My File")).unwrap();

        // SQLite header.
        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(&bytes[..16], SQLITE_HEADER);

        let conn = Connection::open(&path).unwrap();
        configure_connection(&conn).unwrap();

        let application_id: i64 = conn
            .pragma_query_value(None, "application_id", |row| row.get(0))
            .unwrap();
        assert_eq!(application_id, i64::from(EIDOS_FILE_APPLICATION_ID));
        let user_version: i64 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(user_version, i64::from(EIDOS_FILE_SCHEMA_VERSION));
        let encoding: String = conn
            .pragma_query_value(None, "encoding", |row| row.get(0))
            .unwrap();
        assert_eq!(encoding, "UTF-8");
        let journal_mode: String = conn
            .pragma_query_value(None, "journal_mode", |row| row.get(0))
            .unwrap();
        assert_eq!(journal_mode, "delete");
        let foreign_keys: i64 = conn
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .unwrap();
        assert_eq!(foreign_keys, 1);

        // Singleton meta row shape.
        let (
            singleton,
            format_major,
            format_minor,
            file_id,
            title,
            default_table_id,
            revision,
            created_at,
            updated_at,
        ): (
            i64,
            i64,
            i64,
            String,
            String,
            Option<String>,
            i64,
            String,
            String,
        ) = conn
            .query_row(
                "SELECT singleton,format_major,format_minor,file_id,title,default_table_id,
                        revision,created_at,updated_at FROM eidos__meta",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                        row.get(7)?,
                        row.get(8)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(singleton, 1);
        assert_eq!((format_major, format_minor), (1, 0));
        assert!(is_valid_uuidv7(&file_id));
        assert_eq!(title, "My File");
        assert_eq!(default_table_id, None);
        assert_eq!(revision, 0);
        assert!(is_valid_instant(&created_at));
        assert_eq!(created_at, updated_at);

        // All DDL objects exist: 8 tables, 2 indexes, 2 triggers.
        let mut stmt = conn
            .prepare(
                "SELECT type,name FROM sqlite_schema WHERE name LIKE 'eidos__%' ORDER BY type,name",
            )
            .unwrap();
        let objects: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        let expected: Vec<(String, String)> = [
            ("index", "eidos__fields_one_system_role"),
            ("index", "eidos__relation_one_inverse"),
            ("table", "eidos__features"),
            ("table", "eidos__fields"),
            ("table", "eidos__formula_fields"),
            ("table", "eidos__lookup_fields"),
            ("table", "eidos__meta"),
            ("table", "eidos__relation_fields"),
            ("table", "eidos__tables"),
            ("table", "eidos__views"),
            ("trigger", "eidos__meta_no_delete"),
            ("trigger", "eidos__meta_no_key_update"),
        ]
        .iter()
        .map(|(a, b)| (a.to_string(), b.to_string()))
        .collect();
        assert_eq!(objects, expected);
    }

    #[test]
    fn refuses_to_overwrite_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("dup.eidos");
        create_eidos_file(&path, None).unwrap();
        let err = create_eidos_file(&path, None).unwrap_err();
        assert_eq!(err.code(), "already-exists");
    }

    #[test]
    fn rejects_invalid_titles() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bad-title.eidos");
        assert!(create_eidos_file(&path, Some("")).is_err());
        assert!(create_eidos_file(&path, Some("a\0b")).is_err());
        assert!(create_eidos_file(&path, Some(&"x".repeat(1025))).is_err());
    }

    #[test]
    fn increment_revision_advances_and_stamps() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("rev.eidos");
        create_eidos_file(&path, None).unwrap();
        let conn = Connection::open(&path).unwrap();
        let stamp = "2025-07-01T12:00:00.000Z";
        assert_eq!(increment_revision(&conn, stamp).unwrap(), 1);
        assert_eq!(increment_revision(&conn, stamp).unwrap(), 2);
        let (revision, updated_at): (i64, String) = conn
            .query_row("SELECT revision,updated_at FROM eidos__meta", [], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .unwrap();
        assert_eq!(revision, 2);
        assert_eq!(updated_at, stamp);
        // created_at is untouched.
        let created_at: String = conn
            .query_row("SELECT created_at FROM eidos__meta", [], |row| row.get(0))
            .unwrap();
        assert!(is_valid_instant(&created_at));
        // Non-canonical instants are rejected.
        assert!(increment_revision(&conn, "2025-07-01").is_err());
    }

    #[test]
    fn increment_revision_refuses_int64_max() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("max.eidos");
        create_eidos_file(&path, None).unwrap();
        let conn = Connection::open(&path).unwrap();
        conn.execute(
            "UPDATE eidos__meta SET revision=?1 WHERE singleton=1",
            rusqlite::params![i64::MAX],
        )
        .unwrap();
        let err = increment_revision(&conn, "2025-07-01T12:00:00.000Z").unwrap_err();
        assert_eq!(err.code(), "resource-limit");
    }

    #[test]
    fn meta_delete_and_key_update_triggers_fire() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("trig.eidos");
        create_eidos_file(&path, None).unwrap();
        let conn = Connection::open(&path).unwrap();
        assert!(conn.execute("DELETE FROM eidos__meta", []).is_err());
        assert!(
            conn.execute("UPDATE eidos__meta SET singleton=1", [])
                .is_err()
        );
    }
}
