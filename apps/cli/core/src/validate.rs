//! Cumulative validation for the Rust Eidos File CLI.
//!
//! The alpha validator covers File identity, canonical core metadata,
//! physical user-table shape, required triggers, foreign keys, SQLite
//! integrity, and stored logical-value decoding. Formula/Lookup semantic
//! validation is provided by the canonical TypeScript Runtime when virtual
//! Fields exist.

use std::collections::{HashMap, HashSet};

use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::ddl::{EIDOS_FILE_APPLICATION_ID, EIDOS_FILE_SCHEMA_VERSION};
use crate::error::{EidosError, Result};
use crate::id::is_valid_uuidv7;
use crate::jcs;
use crate::model::{
    FieldMeta, FieldType, RelationDirection, SystemRole, load_fields, load_file_meta,
    load_formula_fields, load_lookup_fields, load_relation_fields, load_tables, load_views,
};
use crate::naming::{assert_display_name, is_reserved_table_name, sqlite_nocase};
use crate::query::{ReadRowsOptions, RowQuery, read_rows};
use crate::relation;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ValidationLevel {
    Identity,
    Structural,
    Content,
    Semantic,
    Full,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Fatal,
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Diagnostic {
    pub severity: Severity,
    pub code: String,
    pub message: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValidationReport {
    pub valid: bool,
    pub diagnostics: Vec<Diagnostic>,
    pub truncated: bool,
}

fn diagnostic(
    diagnostics: &mut Vec<Diagnostic>,
    severity: Severity,
    code: &str,
    message: impl Into<String>,
    path: impl Into<String>,
) {
    diagnostics.push(Diagnostic {
        severity,
        code: code.into(),
        message: message.into(),
        path: path.into(),
    });
}

fn validate_identity(conn: &Connection, diagnostics: &mut Vec<Diagnostic>) -> bool {
    let application_id: i64 = match conn.query_row("PRAGMA application_id", [], |row| row.get(0)) {
        Ok(value) => value,
        Err(error) => {
            diagnostic(
                diagnostics,
                Severity::Fatal,
                "file-not-sqlite",
                error.to_string(),
                "/",
            );
            return false;
        }
    };
    if application_id != i64::from(EIDOS_FILE_APPLICATION_ID) {
        diagnostic(
            diagnostics,
            Severity::Error,
            "file-identity-invalid",
            format!("application_id is {application_id}, expected {EIDOS_FILE_APPLICATION_ID}"),
            "/applicationId",
        );
    }
    let user_version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap_or(-1);
    if user_version != i64::from(EIDOS_FILE_SCHEMA_VERSION) {
        diagnostic(
            diagnostics,
            Severity::Error,
            "file-format-unsupported",
            format!("user_version is {user_version}, expected {EIDOS_FILE_SCHEMA_VERSION}"),
            "/userVersion",
        );
    }
    let encoding: String = conn
        .query_row("PRAGMA encoding", [], |row| row.get(0))
        .unwrap_or_default();
    if encoding != "UTF-8" {
        diagnostic(
            diagnostics,
            Severity::Error,
            "file-identity-invalid",
            format!("encoding is {encoding:?}, expected UTF-8"),
            "/encoding",
        );
    }
    match load_file_meta(conn) {
        Ok(meta) => {
            if (meta.format_major, meta.format_minor) != (1, 0) {
                diagnostic(
                    diagnostics,
                    Severity::Error,
                    "file-format-unsupported",
                    format!(
                        "format version is {}.{}, expected 1.0",
                        meta.format_major, meta.format_minor
                    ),
                    "/eidos__meta/format",
                );
            }
            if !is_valid_uuidv7(&meta.file_id) {
                diagnostic(
                    diagnostics,
                    Severity::Error,
                    "file-identity-invalid",
                    "file_id is not a canonical UUIDv7",
                    "/eidos__meta/file_id",
                );
            }
        }
        Err(error) => diagnostic(
            diagnostics,
            Severity::Error,
            "file-identity-invalid",
            error.to_string(),
            "/eidos__meta",
        ),
    }
    let required_features = conn
        .prepare("SELECT name,version FROM eidos__features WHERE required=1 ORDER BY name")
        .and_then(|mut statement| {
            let rows = statement.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
        });
    match required_features {
        Ok(features) => {
            for (name, version) in features {
                diagnostic(
                    diagnostics,
                    Severity::Error,
                    "file-feature-unsupported",
                    format!("required feature {name}@{version} is not supported by this CLI"),
                    format!("/eidos__features/{name}"),
                );
            }
        }
        Err(error) => diagnostic(
            diagnostics,
            Severity::Error,
            "file-core-object-invalid",
            error.to_string(),
            "/eidos__features",
        ),
    }
    !diagnostics
        .iter()
        .any(|item| item.severity <= Severity::Error)
}

fn expected_sql_type(field: &FieldMeta) -> Option<&'static str> {
    match field.field_type {
        FieldType::Number => Some("REAL"),
        FieldType::Integer | FieldType::Checkbox => Some("INTEGER"),
        FieldType::Formula | FieldType::Lookup => None,
        _ => field.physical_name.as_ref().map(|_| "TEXT"),
    }
}

fn validate_view_query_field_references(
    value: &JsonValue,
    field_ids: &HashSet<&str>,
) -> std::result::Result<(), String> {
    match value {
        JsonValue::Array(values) => {
            for value in values {
                validate_view_query_field_references(value, field_ids)?;
            }
        }
        JsonValue::Object(object) => {
            for key in ["fieldId", "field"] {
                if let Some(value) = object.get(key) {
                    let field_id = value
                        .as_str()
                        .ok_or_else(|| format!("View query {key} must be a string"))?;
                    if !field_ids.contains(field_id) {
                        return Err("View filter references an unknown Field ID".into());
                    }
                }
            }
            for value in object.values() {
                validate_view_query_field_references(value, field_ids)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn validate_view_layout_field_references(
    value: &JsonValue,
    field_ids: &HashSet<&str>,
) -> std::result::Result<(), String> {
    let object = value
        .as_object()
        .ok_or_else(|| "View layout_json must be an object".to_string())?;
    for key in ["cardFields", "fieldOrder", "hiddenFields"] {
        let Some(value) = object.get(key) else {
            continue;
        };
        let values = value
            .as_array()
            .ok_or_else(|| format!("View {key} must contain Field IDs from its Table"))?;
        if !values
            .iter()
            .all(|value| value.as_str().is_some_and(|id| field_ids.contains(id)))
        {
            return Err(format!("View {key} must contain Field IDs from its Table"));
        }
    }
    for key in ["coverField", "groupField", "dateField"] {
        let Some(value) = object.get(key) else {
            continue;
        };
        if !value.is_null()
            && !value
                .as_str()
                .is_some_and(|field_id| field_ids.contains(field_id))
        {
            return Err(format!(
                "View {key} must be null or a Field ID from its Table"
            ));
        }
    }
    if let Some(value) = object.get("fieldWidths") {
        let widths = value
            .as_object()
            .ok_or_else(|| "View fieldWidths must be an object".to_string())?;
        if widths
            .keys()
            .any(|field_id| !field_ids.contains(field_id.as_str()))
        {
            return Err("View fieldWidths keys must be Field IDs from its Table".into());
        }
    }
    Ok(())
}

fn validate_structural(conn: &Connection, diagnostics: &mut Vec<Diagnostic>) -> bool {
    let tables = match load_tables(conn) {
        Ok(tables) => tables,
        Err(error) => {
            diagnostic(
                diagnostics,
                Severity::Error,
                "file-metadata-invalid",
                error.to_string(),
                "/eidos__tables",
            );
            return false;
        }
    };
    let fields = match load_fields(conn) {
        Ok(fields) => fields,
        Err(error) => {
            diagnostic(
                diagnostics,
                Severity::Error,
                "file-metadata-invalid",
                error.to_string(),
                "/eidos__fields",
            );
            return false;
        }
    };
    let relations = match load_relation_fields(conn) {
        Ok(relations) => relations,
        Err(error) => {
            diagnostic(
                diagnostics,
                Severity::Error,
                "file-definition-invalid",
                error.to_string(),
                "/eidos__relation_fields",
            );
            Vec::new()
        }
    };
    if let Err(error) = load_formula_fields(conn) {
        diagnostic(
            diagnostics,
            Severity::Error,
            "file-definition-invalid",
            error.to_string(),
            "/eidos__formula_fields",
        );
    }
    if let Err(error) = load_lookup_fields(conn) {
        diagnostic(
            diagnostics,
            Severity::Error,
            "file-definition-invalid",
            error.to_string(),
            "/eidos__lookup_fields",
        );
    }
    let views = match load_views(conn) {
        Ok(views) => views,
        Err(error) => {
            diagnostic(
                diagnostics,
                Severity::Error,
                "file-metadata-invalid",
                error.to_string(),
                "/eidos__views",
            );
            Vec::new()
        }
    };

    let table_ids: HashSet<&str> = tables.iter().map(|table| table.id.as_str()).collect();
    let field_ids: HashSet<&str> = fields.iter().map(|field| field.id.as_str()).collect();
    let mut view_names = HashSet::new();
    for view in &views {
        if assert_display_name(&view.name, "View name").is_err() {
            diagnostic(
                diagnostics,
                Severity::Error,
                "file-metadata-invalid",
                "view name is invalid",
                format!("/views/{}/name", view.id),
            );
        }
        if !view_names.insert((view.table_id.clone(), sqlite_nocase(&view.name))) {
            diagnostic(
                diagnostics,
                Severity::Error,
                "file-metadata-invalid",
                "view names must be unique within a table under SQLite NOCASE",
                format!("/views/{}/name", view.id),
            );
        }
        if !table_ids.contains(view.table_id.as_str()) {
            diagnostic(
                diagnostics,
                Severity::Error,
                "file-reference-invalid",
                "View references an unknown Table",
                format!("/views/{}/tableId", view.id),
            );
            continue;
        }
        let view_field_ids: HashSet<&str> = fields
            .iter()
            .filter(|field| field.table_id == view.table_id)
            .map(|field| field.id.as_str())
            .collect();
        for (raw, member) in [(&view.query_json, "query"), (&view.layout_json, "layout")] {
            if !jcs::is_canonical_jcs(raw) {
                diagnostic(
                    diagnostics,
                    Severity::Error,
                    "file-json-invalid",
                    format!("View {member}_json is not canonical JSON"),
                    format!("/views/{}/{member}", view.id),
                );
                continue;
            }
            let value: JsonValue = match serde_json::from_str::<JsonValue>(raw) {
                Ok(value) if value.is_object() => value,
                Ok(_) => {
                    diagnostic(
                        diagnostics,
                        Severity::Error,
                        "file-json-invalid",
                        format!("View {member}_json must be an object"),
                        format!("/views/{}/{member}", view.id),
                    );
                    continue;
                }
                Err(error) => {
                    diagnostic(
                        diagnostics,
                        Severity::Error,
                        "file-json-invalid",
                        error.to_string(),
                        format!("/views/{}/{member}", view.id),
                    );
                    continue;
                }
            };
            let result = if member == "query" {
                validate_view_query_field_references(&value, &view_field_ids)
            } else {
                validate_view_layout_field_references(&value, &view_field_ids)
            };
            if let Err(message) = result {
                diagnostic(
                    diagnostics,
                    Severity::Error,
                    "file-reference-invalid",
                    message,
                    format!("/views/{}/{member}", view.id),
                );
            }
        }
    }
    let mut table_names = HashSet::new();
    for table in &tables {
        if !table_names.insert(sqlite_nocase(&table.name)) {
            diagnostic(
                diagnostics,
                Severity::Error,
                "file-metadata-invalid",
                "table names must be unique under SQLite NOCASE",
                format!("/tables/{}/name", table.id),
            );
        }
        if is_reserved_table_name(&table.name) || table.physical_name != table.name {
            diagnostic(
                diagnostics,
                Severity::Error,
                "file-physical-schema-invalid",
                "table physical name must exactly equal its non-reserved display name",
                format!("/tables/{}/physical", table.id),
            );
        }
        let table_fields: Vec<&FieldMeta> = fields
            .iter()
            .filter(|field| field.table_id == table.id)
            .collect();
        let mut field_names = HashSet::new();
        for field in &table_fields {
            if !field_names.insert(sqlite_nocase(&field.name)) {
                diagnostic(
                    diagnostics,
                    Severity::Error,
                    "file-metadata-invalid",
                    "field names must be unique within a table under SQLite NOCASE",
                    format!("/fields/{}/name", field.id),
                );
            }
            if field
                .physical_name
                .as_ref()
                .is_some_and(|physical| physical != &field.name)
            {
                diagnostic(
                    diagnostics,
                    Severity::Error,
                    "file-physical-schema-invalid",
                    "stored field physical name must exactly equal its display name",
                    format!("/fields/{}/physical", field.id),
                );
            }
        }
        for role in [
            SystemRole::RowId,
            SystemRole::CreatedTime,
            SystemRole::UpdatedTime,
        ] {
            if table_fields
                .iter()
                .filter(|field| field.system_role == Some(role))
                .count()
                != 1
            {
                diagnostic(
                    diagnostics,
                    Severity::Error,
                    "file-metadata-invalid",
                    format!(
                        "table {} must have exactly one {} field",
                        table.id,
                        role.as_str()
                    ),
                    format!("/tables/{}/systemRoles/{}", table.id, role.as_str()),
                );
            }
        }
        if !table_fields
            .iter()
            .any(|field| field.id == table.label_field_id)
        {
            diagnostic(
                diagnostics,
                Severity::Error,
                "file-reference-invalid",
                "record label does not identify a field in its table",
                format!("/tables/{}/labelFieldId", table.id),
            );
        }
        if !jcs::is_canonical_jcs(&table.settings_json) {
            diagnostic(
                diagnostics,
                Severity::Error,
                "file-json-invalid",
                "table settings_json is not canonical JSON",
                format!("/tables/{}/settings", table.id),
            );
        }
        let table_flags: Option<(i64, i64)> = conn
            .query_row(
                "SELECT wr,strict FROM pragma_table_list WHERE name=? AND schema='main'",
                [table.physical_name.as_str()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .unwrap_or(None);
        if table_flags != Some((1, 1)) {
            diagnostic(
                diagnostics,
                Severity::Error,
                "file-physical-schema-invalid",
                "user table must exist as STRICT, WITHOUT ROWID",
                format!("/tables/{}/physical", table.id),
            );
            continue;
        }
        let columns: HashMap<String, String> = conn
            .prepare("SELECT name,type FROM pragma_table_xinfo(?)")
            .and_then(|mut statement| {
                let rows = statement.query_map([table.physical_name.as_str()], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })?;
                rows.collect::<rusqlite::Result<HashMap<_, _>>>()
            })
            .unwrap_or_default();
        for field in table_fields {
            if !jcs::is_canonical_jcs(&field.settings_json) {
                diagnostic(
                    diagnostics,
                    Severity::Error,
                    "file-json-invalid",
                    "field settings_json is not canonical JSON",
                    format!("/fields/{}/settings", field.id),
                );
            }
            if let (Some(physical), Some(expected)) =
                (&field.physical_name, expected_sql_type(field))
                && columns.get(physical).map(String::as_str) != Some(expected)
            {
                diagnostic(
                    diagnostics,
                    Severity::Error,
                    "file-physical-schema-invalid",
                    format!("field column {physical:?} must have declared type {expected}"),
                    format!("/fields/{}/physical", field.id),
                );
            }
        }
        let trigger = relation::row_id_immutable_trigger_name(&table.id).unwrap_or_default();
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name=?)",
                [trigger],
                |row| row.get(0),
            )
            .unwrap_or(false);
        if !exists {
            diagnostic(
                diagnostics,
                Severity::Error,
                "file-trigger-invalid",
                "row-id immutability trigger is missing",
                format!("/tables/{}/triggers/row-id", table.id),
            );
        }
    }
    for field in &fields {
        if !table_ids.contains(field.table_id.as_str()) {
            diagnostic(
                diagnostics,
                Severity::Error,
                "file-reference-invalid",
                "field references a missing table",
                format!("/fields/{}/tableId", field.id),
            );
        }
        let subtype_count = usize::from(relations.iter().any(|item| item.field_id == field.id))
            + usize::from(
                conn.query_row(
                    "SELECT EXISTS(SELECT 1 FROM eidos__formula_fields WHERE field_id=?)",
                    [field.id.as_str()],
                    |row| row.get::<_, bool>(0),
                )
                .unwrap_or(false),
            )
            + usize::from(
                conn.query_row(
                    "SELECT EXISTS(SELECT 1 FROM eidos__lookup_fields WHERE field_id=?)",
                    [field.id.as_str()],
                    |row| row.get::<_, bool>(0),
                )
                .unwrap_or(false),
            );
        let expected = usize::from(matches!(
            field.field_type,
            FieldType::Relation | FieldType::Formula | FieldType::Lookup
        ));
        if subtype_count != expected {
            diagnostic(
                diagnostics,
                Severity::Error,
                "file-definition-invalid",
                "field subtype metadata does not match its type",
                format!("/fields/{}/definition", field.id),
            );
        }
    }
    for definition in &relations {
        if !field_ids.contains(definition.field_id.as_str())
            || !table_ids.contains(definition.target_table_id.as_str())
        {
            diagnostic(
                diagnostics,
                Severity::Error,
                "file-reference-invalid",
                "Relation definition references a missing field/table",
                format!("/relations/{}", definition.field_id),
            );
        }
        if definition.direction == RelationDirection::Forward {
            let expected_names = [
                relation::relation_validate_insert_trigger_name(&definition.field_id),
                relation::relation_validate_update_trigger_name(&definition.field_id),
            ];
            for name in expected_names.into_iter().flatten() {
                let exists: bool = conn
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name=?)",
                        [name],
                        |row| row.get(0),
                    )
                    .unwrap_or(false);
                if !exists {
                    diagnostic(
                        diagnostics,
                        Severity::Error,
                        "file-trigger-invalid",
                        "Relation validation trigger is missing",
                        format!("/relations/{}/triggers", definition.field_id),
                    );
                }
            }
        }
    }
    !diagnostics
        .iter()
        .any(|item| item.severity <= Severity::Error)
}

fn validate_content(conn: &Connection, diagnostics: &mut Vec<Diagnostic>) {
    let quick_check: String = conn
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .unwrap_or_else(|error| error.to_string());
    if quick_check != "ok" {
        diagnostic(
            diagnostics,
            Severity::Fatal,
            "file-integrity-invalid",
            quick_check,
            "/quickCheck",
        );
        return;
    }
    let mut statement = match conn.prepare("PRAGMA foreign_key_check") {
        Ok(statement) => statement,
        Err(error) => {
            diagnostic(
                diagnostics,
                Severity::Error,
                "file-integrity-invalid",
                error.to_string(),
                "/foreignKeyCheck",
            );
            return;
        }
    };
    match statement
        .query([])
        .and_then(|mut rows| rows.next().map(|row| row.is_some()))
    {
        Ok(true) => diagnostic(
            diagnostics,
            Severity::Error,
            "file-integrity-invalid",
            "PRAGMA foreign_key_check returned at least one row",
            "/foreignKeyCheck",
        ),
        Err(error) => diagnostic(
            diagnostics,
            Severity::Error,
            "file-integrity-invalid",
            error.to_string(),
            "/foreignKeyCheck",
        ),
        Ok(false) => {}
    }
    let tables = match load_tables(conn) {
        Ok(tables) => tables,
        Err(_) => return,
    };
    let fields = match load_fields(conn) {
        Ok(fields) => fields,
        Err(_) => return,
    };
    for table in &tables {
        let table_fields: Vec<FieldMeta> = fields
            .iter()
            .filter(|field| field.table_id == table.id)
            .cloned()
            .collect();
        if let Err(error) = read_rows(
            conn,
            table,
            &table_fields,
            &RowQuery::default(),
            &ReadRowsOptions::default(),
        ) {
            diagnostic(
                diagnostics,
                Severity::Error,
                "file-cell-invalid",
                error.to_string(),
                format!("/tables/{}/rows", table.id),
            );
        }
    }
}

pub fn validate(
    conn: &Connection,
    level: ValidationLevel,
    diagnostics_limit: usize,
) -> Result<ValidationReport> {
    if diagnostics_limit == 0 {
        return Err(EidosError::InvalidRequest(
            "diagnosticsLimit must be positive".into(),
        ));
    }
    let mut diagnostics = Vec::new();
    let identity_valid = validate_identity(conn, &mut diagnostics);
    let needs_structural = level >= ValidationLevel::Structural;
    let structural_valid = if identity_valid && needs_structural {
        validate_structural(conn, &mut diagnostics)
    } else {
        identity_valid
    };
    if structural_valid
        && matches!(
            level,
            ValidationLevel::Content | ValidationLevel::Semantic | ValidationLevel::Full
        )
    {
        validate_content(conn, &mut diagnostics);
    }
    diagnostics.sort_by(|left, right| {
        (left.severity, &left.code, &left.path).cmp(&(right.severity, &right.code, &right.path))
    });
    let valid = !diagnostics
        .iter()
        .any(|item| item.severity <= Severity::Error);
    let truncated = diagnostics.len() > diagnostics_limit;
    diagnostics.truncate(diagnostics_limit);
    Ok(ValidationReport {
        valid,
        diagnostics,
        truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ddl;
    use crate::id::generate_uuidv7;
    use crate::model::{FieldType, load_fields, load_tables, load_views};
    use crate::schema_ops::{NewField, SchemaLeafChange, apply_initial_table};
    use serde_json::json;

    fn file_with_view() -> (tempfile::TempDir, Connection, String, String) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("views.eidos");
        ddl::create_eidos_file(&path, Some("Views")).unwrap();
        let mut conn = Connection::open(path).unwrap();
        ddl::configure_connection(&conn).unwrap();
        apply_initial_table(
            &mut conn,
            &SchemaLeafChange::CreateTable {
                client_key: "tasks".into(),
                name: "Tasks".into(),
                position: Some("0".into()),
                settings: None,
                fields: vec![NewField {
                    client_key: "title".into(),
                    name: "Title".into(),
                    kind: FieldType::Text,
                    position: Some("0".into()),
                    nullable: None,
                    settings: None,
                    definition: None,
                }],
                label_field_client_key: Some("title".into()),
            },
        )
        .unwrap();
        let table = load_tables(&conn).unwrap().remove(0);
        let field = load_fields(&conn)
            .unwrap()
            .into_iter()
            .find(|field| field.table_id == table.id && field.name == "Title")
            .unwrap();
        (dir, conn, table.id, field.id)
    }

    #[test]
    fn fresh_file_passes_full_validation() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("valid.eidos");
        ddl::create_eidos_file(&path, Some("Valid")).unwrap();
        let conn = Connection::open(path).unwrap();
        ddl::configure_connection(&conn).unwrap();
        let report = validate(&conn, ValidationLevel::Full, 100).unwrap();
        assert!(report.valid, "{:?}", report.diagnostics);
    }

    #[test]
    fn canonical_saved_view_field_references_pass_full_validation() {
        let (_dir, conn, _table_id, field_id) = file_with_view();
        let view = load_views(&conn).unwrap().remove(0);
        let query_json = jcs::to_jcs(&json!({
            "filter": {"fieldId": field_id, "op": "eq", "value": "Roadmap"},
            "sort": [{"direction": "asc", "fieldId": field_id}],
        }))
        .unwrap();
        conn.execute(
            "UPDATE eidos__views SET query_json=? WHERE id=?",
            [&query_json, &view.id],
        )
        .unwrap();

        let report = validate(&conn, ValidationLevel::Full, 100).unwrap();
        assert!(report.valid, "{:?}", report.diagnostics);
    }

    #[test]
    fn saved_view_unknown_field_reference_fails_full_validation() {
        let (_dir, conn, _table_id, _field_id) = file_with_view();
        let view = load_views(&conn).unwrap().remove(0);
        let unknown_field_id = generate_uuidv7();
        let query_json = jcs::to_jcs(&json!({
            "filter": {
                "fieldId": unknown_field_id,
                "op": "eq",
                "value": "Roadmap"
            }
        }))
        .unwrap();
        conn.execute(
            "UPDATE eidos__views SET query_json=? WHERE id=?",
            [&query_json, &view.id],
        )
        .unwrap();

        let report = validate(&conn, ValidationLevel::Full, 100).unwrap();
        assert!(!report.valid);
        assert!(report.diagnostics.iter().any(|item| {
            item.code == "file-reference-invalid"
                && item.path == format!("/views/{}/query", view.id)
                && item.message == "View filter references an unknown Field ID"
        }));
    }
}
