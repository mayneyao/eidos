//! Typed metadata rows and loaders for the §7 canonical tables.
//!
//! These structs mirror the `eidos__*` DDL columns one-for-one; JSON columns
//! (`settings_json`, `query_json`, `layout_json`) are kept as canonical JSON
//! text. The enums serialize to the exact spec strings (kebab-case).

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::error::{EidosError, Result};

/// Field type strings from `eidos__fields.type` (spec §8).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FieldType {
    Text,
    Number,
    Integer,
    Checkbox,
    Date,
    Datetime,
    Url,
    Select,
    MultiSelect,
    File,
    Relation,
    Formula,
    Lookup,
}

impl FieldType {
    /// The exact spec string stored in `eidos__fields.type`.
    pub fn as_str(self) -> &'static str {
        match self {
            FieldType::Text => "text",
            FieldType::Number => "number",
            FieldType::Integer => "integer",
            FieldType::Checkbox => "checkbox",
            FieldType::Date => "date",
            FieldType::Datetime => "datetime",
            FieldType::Url => "url",
            FieldType::Select => "select",
            FieldType::MultiSelect => "multi-select",
            FieldType::File => "file",
            FieldType::Relation => "relation",
            FieldType::Formula => "formula",
            FieldType::Lookup => "lookup",
        }
    }

    /// Parses a stored type string, or returns `invalid-schema`.
    pub fn from_spec_str(value: &str) -> Result<Self> {
        Ok(match value {
            "text" => FieldType::Text,
            "number" => FieldType::Number,
            "integer" => FieldType::Integer,
            "checkbox" => FieldType::Checkbox,
            "date" => FieldType::Date,
            "datetime" => FieldType::Datetime,
            "url" => FieldType::Url,
            "select" => FieldType::Select,
            "multi-select" => FieldType::MultiSelect,
            "file" => FieldType::File,
            "relation" => FieldType::Relation,
            "formula" => FieldType::Formula,
            "lookup" => FieldType::Lookup,
            other => {
                return Err(EidosError::InvalidSchema(format!(
                    "unknown eidos__fields.type {other:?}"
                )));
            }
        })
    }
}

/// System role strings from `eidos__fields.system_role` (spec §7/§8).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SystemRole {
    RowId,
    CreatedTime,
    UpdatedTime,
}

impl SystemRole {
    pub fn as_str(self) -> &'static str {
        match self {
            SystemRole::RowId => "row-id",
            SystemRole::CreatedTime => "created-time",
            SystemRole::UpdatedTime => "updated-time",
        }
    }

    pub fn from_spec_str(value: &str) -> Result<Self> {
        Ok(match value {
            "row-id" => SystemRole::RowId,
            "created-time" => SystemRole::CreatedTime,
            "updated-time" => SystemRole::UpdatedTime,
            other => {
                return Err(EidosError::InvalidSchema(format!(
                    "unknown eidos__fields.system_role {other:?}"
                )));
            }
        })
    }
}

/// `eidos__relation_fields.direction`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RelationDirection {
    Forward,
    Inverse,
}

impl RelationDirection {
    pub fn as_str(self) -> &'static str {
        match self {
            RelationDirection::Forward => "forward",
            RelationDirection::Inverse => "inverse",
        }
    }

    pub fn from_spec_str(value: &str) -> Result<Self> {
        Ok(match value {
            "forward" => RelationDirection::Forward,
            "inverse" => RelationDirection::Inverse,
            other => {
                return Err(EidosError::InvalidSchema(format!(
                    "unknown relation direction {other:?}"
                )));
            }
        })
    }
}

/// `eidos__relation_fields.cardinality`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RelationCardinality {
    One,
    Many,
}

impl RelationCardinality {
    pub fn as_str(self) -> &'static str {
        match self {
            RelationCardinality::One => "one",
            RelationCardinality::Many => "many",
        }
    }

    pub fn from_spec_str(value: &str) -> Result<Self> {
        Ok(match value {
            "one" => RelationCardinality::One,
            "many" => RelationCardinality::Many,
            other => {
                return Err(EidosError::InvalidSchema(format!(
                    "unknown relation cardinality {other:?}"
                )));
            }
        })
    }
}

/// `eidos__relation_fields.on_delete` (spec §10.4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OnDeletePolicy {
    Restrict,
    Detach,
    Preserve,
}

impl OnDeletePolicy {
    pub fn as_str(self) -> &'static str {
        match self {
            OnDeletePolicy::Restrict => "restrict",
            OnDeletePolicy::Detach => "detach",
            OnDeletePolicy::Preserve => "preserve",
        }
    }

    pub fn from_spec_str(value: &str) -> Result<Self> {
        Ok(match value {
            "restrict" => OnDeletePolicy::Restrict,
            "detach" => OnDeletePolicy::Detach,
            "preserve" => OnDeletePolicy::Preserve,
            other => {
                return Err(EidosError::InvalidSchema(format!(
                    "unknown relation on_delete policy {other:?}"
                )));
            }
        })
    }
}

/// `eidos__formula_fields.result_type` (spec §11).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FormulaResultType {
    Text,
    Number,
    Integer,
    Checkbox,
    Date,
    Datetime,
    Url,
}

impl FormulaResultType {
    pub fn as_str(self) -> &'static str {
        match self {
            FormulaResultType::Text => "text",
            FormulaResultType::Number => "number",
            FormulaResultType::Integer => "integer",
            FormulaResultType::Checkbox => "checkbox",
            FormulaResultType::Date => "date",
            FormulaResultType::Datetime => "datetime",
            FormulaResultType::Url => "url",
        }
    }

    pub fn from_spec_str(value: &str) -> Result<Self> {
        Ok(match value {
            "text" => FormulaResultType::Text,
            "number" => FormulaResultType::Number,
            "integer" => FormulaResultType::Integer,
            "checkbox" => FormulaResultType::Checkbox,
            "date" => FormulaResultType::Date,
            "datetime" => FormulaResultType::Datetime,
            "url" => FormulaResultType::Url,
            other => {
                return Err(EidosError::InvalidSchema(format!(
                    "unknown formula result_type {other:?}"
                )));
            }
        })
    }
}

/// `eidos__lookup_fields.aggregate` (spec §12).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LookupAggregate {
    Values,
    First,
    Count,
    Sum,
    Average,
    Min,
    Max,
}

impl LookupAggregate {
    pub fn as_str(self) -> &'static str {
        match self {
            LookupAggregate::Values => "values",
            LookupAggregate::First => "first",
            LookupAggregate::Count => "count",
            LookupAggregate::Sum => "sum",
            LookupAggregate::Average => "average",
            LookupAggregate::Min => "min",
            LookupAggregate::Max => "max",
        }
    }

    pub fn from_spec_str(value: &str) -> Result<Self> {
        Ok(match value {
            "values" => LookupAggregate::Values,
            "first" => LookupAggregate::First,
            "count" => LookupAggregate::Count,
            "sum" => LookupAggregate::Sum,
            "average" => LookupAggregate::Average,
            "min" => LookupAggregate::Min,
            "max" => LookupAggregate::Max,
            other => {
                return Err(EidosError::InvalidSchema(format!(
                    "unknown lookup aggregate {other:?}"
                )));
            }
        })
    }
}

/// One row of `eidos__tables`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TableMeta {
    pub id: String,
    pub name: String,
    pub physical_name: String,
    pub label_field_id: String,
    pub position: i64,
    pub settings_json: String,
    pub created_at: String,
    pub updated_at: String,
}

/// One row of `eidos__fields`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FieldMeta {
    pub id: String,
    pub table_id: String,
    pub name: String,
    /// `NULL` for Formula, Lookup, and inverse Relation Fields (spec §8).
    pub physical_name: Option<String>,
    #[serde(rename = "type")]
    pub field_type: FieldType,
    pub system_role: Option<SystemRole>,
    pub nullable: bool,
    pub position: i64,
    pub settings_json: String,
    pub created_at: String,
    pub updated_at: String,
}

/// One row of `eidos__views`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ViewMeta {
    pub id: String,
    pub table_id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub view_type: String,
    pub query_json: String,
    pub layout_json: String,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// One row of `eidos__relation_fields`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RelationFieldMeta {
    pub field_id: String,
    pub direction: RelationDirection,
    pub target_table_id: String,
    pub cardinality: RelationCardinality,
    pub inverse_of_field_id: Option<String>,
    /// `NULL` exactly for inverse Relations (spec §10.3); forward Relations
    /// default to `restrict`.
    pub on_delete: Option<OnDeletePolicy>,
}

/// One row of `eidos__formula_fields`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FormulaFieldMeta {
    pub field_id: String,
    pub source_text: String,
    pub result_type: FormulaResultType,
}

/// One row of `eidos__lookup_fields`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LookupFieldMeta {
    pub field_id: String,
    pub relation_field_id: String,
    pub target_field_id: String,
    pub aggregate: LookupAggregate,
    pub distinct_values: bool,
}

/// The singleton `eidos__meta` row.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FileMeta {
    pub format_major: i64,
    pub format_minor: i64,
    pub file_id: String,
    pub title: String,
    pub default_table_id: Option<String>,
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
}

fn map_meta_query_error(err: rusqlite::Error, what: &str) -> EidosError {
    match err {
        rusqlite::Error::QueryReturnedNoRows => EidosError::NotEidosFile(format!("missing {what}")),
        rusqlite::Error::SqliteFailure(..) => {
            EidosError::NotEidosFile(format!("cannot read {what}: {err}"))
        }
        other => EidosError::from(other),
    }
}

/// Loads the singleton `eidos__meta` row; `not-eidos-file` when the table or
/// row is absent.
pub fn load_file_meta(conn: &Connection) -> Result<FileMeta> {
    conn.query_row(
        "SELECT format_major,format_minor,file_id,title,default_table_id,revision,created_at,updated_at
         FROM eidos__meta WHERE singleton=1",
        [],
        |row| {
            Ok(FileMeta {
                format_major: row.get(0)?,
                format_minor: row.get(1)?,
                file_id: row.get(2)?,
                title: row.get(3)?,
                default_table_id: row.get(4)?,
                revision: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    )
    .map_err(|err| map_meta_query_error(err, "eidos__meta singleton row"))
}

fn collect<T>(
    conn: &Connection,
    sql: &str,
    map: impl Fn(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
    what: &str,
) -> Result<Vec<T>> {
    let mut stmt = conn
        .prepare(sql)
        .map_err(|err| map_meta_query_error(err, what))?;
    let rows = stmt
        .query_map([], map)
        .map_err(|err| map_meta_query_error(err, what))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(EidosError::from)?);
    }
    Ok(out)
}

/// Loads all `eidos__tables` rows ordered by `position, id`.
pub fn load_tables(conn: &Connection) -> Result<Vec<TableMeta>> {
    collect(
        conn,
        "SELECT id,name,physical_name,label_field_id,position,settings_json,created_at,updated_at
         FROM eidos__tables ORDER BY position,id",
        |row| {
            Ok(TableMeta {
                id: row.get(0)?,
                name: row.get(1)?,
                physical_name: row.get(2)?,
                label_field_id: row.get(3)?,
                position: row.get(4)?,
                settings_json: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
        "eidos__tables",
    )
}

fn parse_enum<T>(raw: String, parse: impl Fn(&str) -> Result<T>) -> rusqlite::Result<T> {
    parse(&raw).map_err(|err| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(err))
    })
}

fn parse_opt_enum<T>(
    raw: Option<String>,
    parse: impl Fn(&str) -> Result<T>,
) -> rusqlite::Result<Option<T>> {
    raw.map(|value| parse_enum(value, parse)).transpose()
}

/// Loads all `eidos__fields` rows ordered by `table_id, position, id`.
pub fn load_fields(conn: &Connection) -> Result<Vec<FieldMeta>> {
    collect(
        conn,
        "SELECT id,table_id,name,physical_name,type,system_role,nullable,position,settings_json,created_at,updated_at
         FROM eidos__fields ORDER BY table_id,position,id",
        |row| {
            let field_type: String = row.get(4)?;
            let system_role: Option<String> = row.get(5)?;
            Ok(FieldMeta {
                id: row.get(0)?,
                table_id: row.get(1)?,
                name: row.get(2)?,
                physical_name: row.get(3)?,
                field_type: parse_enum(field_type, FieldType::from_spec_str)?,
                system_role: parse_opt_enum(system_role, SystemRole::from_spec_str)?,
                nullable: row.get(6)?,
                position: row.get(7)?,
                settings_json: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        },
        "eidos__fields",
    )
}

/// Loads all `eidos__relation_fields` rows.
pub fn load_relation_fields(conn: &Connection) -> Result<Vec<RelationFieldMeta>> {
    collect(
        conn,
        "SELECT field_id,direction,target_table_id,cardinality,inverse_of_field_id,on_delete
         FROM eidos__relation_fields ORDER BY field_id",
        |row| {
            let direction: String = row.get(1)?;
            let cardinality: String = row.get(3)?;
            let on_delete: Option<String> = row.get(5)?;
            Ok(RelationFieldMeta {
                field_id: row.get(0)?,
                direction: parse_enum(direction, RelationDirection::from_spec_str)?,
                target_table_id: row.get(2)?,
                cardinality: parse_enum(cardinality, RelationCardinality::from_spec_str)?,
                inverse_of_field_id: row.get(4)?,
                on_delete: parse_opt_enum(on_delete, OnDeletePolicy::from_spec_str)?,
            })
        },
        "eidos__relation_fields",
    )
}

/// Loads all `eidos__formula_fields` rows.
pub fn load_formula_fields(conn: &Connection) -> Result<Vec<FormulaFieldMeta>> {
    collect(
        conn,
        "SELECT field_id,source_text,result_type FROM eidos__formula_fields ORDER BY field_id",
        |row| {
            let result_type: String = row.get(2)?;
            Ok(FormulaFieldMeta {
                field_id: row.get(0)?,
                source_text: row.get(1)?,
                result_type: parse_enum(result_type, FormulaResultType::from_spec_str)?,
            })
        },
        "eidos__formula_fields",
    )
}

/// Loads all `eidos__lookup_fields` rows.
pub fn load_lookup_fields(conn: &Connection) -> Result<Vec<LookupFieldMeta>> {
    collect(
        conn,
        "SELECT field_id,relation_field_id,target_field_id,aggregate,distinct_values
         FROM eidos__lookup_fields ORDER BY field_id",
        |row| {
            let aggregate: String = row.get(3)?;
            Ok(LookupFieldMeta {
                field_id: row.get(0)?,
                relation_field_id: row.get(1)?,
                target_field_id: row.get(2)?,
                aggregate: parse_enum(aggregate, LookupAggregate::from_spec_str)?,
                distinct_values: row.get(4)?,
            })
        },
        "eidos__lookup_fields",
    )
}

/// Loads all `eidos__views` rows ordered by `table_id, position, id`.
pub fn load_views(conn: &Connection) -> Result<Vec<ViewMeta>> {
    collect(
        conn,
        "SELECT id,table_id,name,type,query_json,layout_json,position,created_at,updated_at
         FROM eidos__views ORDER BY table_id,position,id",
        |row| {
            Ok(ViewMeta {
                id: row.get(0)?,
                table_id: row.get(1)?,
                name: row.get(2)?,
                view_type: row.get(3)?,
                query_json: row.get(4)?,
                layout_json: row.get(5)?,
                position: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        },
        "eidos__views",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enums_round_trip_spec_strings() {
        for (variant, spec) in [
            (FieldType::MultiSelect, "multi-select"),
            (FieldType::Text, "text"),
            (FieldType::Relation, "relation"),
        ] {
            assert_eq!(variant.as_str(), spec);
            assert_eq!(FieldType::from_spec_str(spec).unwrap(), variant);
            assert_eq!(
                serde_json::to_string(&variant).unwrap(),
                format!("\"{spec}\"")
            );
        }
        assert_eq!(SystemRole::RowId.as_str(), "row-id");
        assert_eq!(
            serde_json::to_string(&SystemRole::CreatedTime).unwrap(),
            "\"created-time\""
        );
        assert!(FieldType::from_spec_str("rating").is_err());
        assert!(FieldType::from_spec_str("json").is_err());
        assert!(FormulaResultType::from_spec_str("json").is_err());
        assert!(SystemRole::from_spec_str("owner").is_err());
    }

    #[test]
    fn loads_meta_from_created_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("model.eidos");
        crate::ddl::create_eidos_file(&path, Some("Model")).unwrap();
        let conn = Connection::open(&path).unwrap();
        let meta = load_file_meta(&conn).unwrap();
        assert_eq!((meta.format_major, meta.format_minor), (1, 0));
        assert_eq!(meta.title, "Model");
        assert_eq!(meta.revision, 0);
        assert!(load_tables(&conn).unwrap().is_empty());
        assert!(load_fields(&conn).unwrap().is_empty());
        assert!(load_relation_fields(&conn).unwrap().is_empty());
        assert!(load_formula_fields(&conn).unwrap().is_empty());
        assert!(load_lookup_fields(&conn).unwrap().is_empty());
        assert!(load_views(&conn).unwrap().is_empty());
    }

    #[test]
    fn load_file_meta_rejects_non_eidos_sqlite() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("plain.db");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch("CREATE TABLE t(x)").unwrap();
        let err = load_file_meta(&conn).unwrap_err();
        assert_eq!(err.code(), "not-eidos-file");
    }
}
