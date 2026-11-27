//! Revision-checked Saved View mutations matching Eidos Runtime 1.0 §11.5.
//!
//! View query semantics are validated here. Layout semantics intentionally are
//! not: Eidos UI owns standard layout keys such as Calendar `dateField`, while
//! Runtime preserves every canonical JSON member.

use std::collections::{BTreeSet, HashSet};

use rusqlite::{Connection, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::ddl;
use crate::error::{EidosError, Result};
use crate::id::{generate_uuidv7, is_valid_uuidv7};
use crate::jcs;
use crate::model::{
    FieldMeta, TableMeta, ViewMeta, load_fields, load_file_meta, load_tables, load_views,
};
use crate::naming::{assert_display_name, sqlite_nocase};
use crate::query::{FilterNode, RowQuery, SortTerm, compile_query};
use crate::rows::ensure_revision;
use crate::time::now_instant;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct SavedViewQuery {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter: Option<FilterNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<Vec<SortTerm>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct ViewPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub view_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<SavedViewQuery>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout: Option<JsonValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum ViewChange {
    #[serde(rename = "create-view")]
    CreateView {
        client_key: String,
        table_id: String,
        name: String,
        #[serde(rename = "type")]
        view_type: String,
        query: SavedViewQuery,
        layout: JsonValue,
        position: String,
    },
    #[serde(rename = "update-view")]
    UpdateView { view_id: String, patch: ViewPatch },
    #[serde(rename = "delete-view")]
    DeleteView { view_id: String },
    #[serde(rename = "upgrade-date-query")]
    UpgradeDateQuery { view_id: String },
    #[serde(rename = "restore-date-query")]
    RestoreDateQuery { view_id: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ViewMutationRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar_query_version: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar_window_version: Option<u8>,
    pub expected_revision: String,
    pub changes: Vec<ViewChange>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedView {
    pub client_key: String,
    pub view_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewMutationResult {
    pub file_id: String,
    pub revision: String,
    pub changed: bool,
    pub created_views: Vec<CreatedView>,
    pub affected_view_ids: Vec<String>,
}

fn parse_i64(value: &str, label: &str) -> Result<i64> {
    let unsigned = value.strip_prefix('-').unwrap_or(value);
    let canonical = !unsigned.is_empty()
        && unsigned.bytes().all(|byte| byte.is_ascii_digit())
        && (unsigned.len() == 1 || !unsigned.starts_with('0'))
        && value != "-0";
    if !canonical {
        return Err(EidosError::InvalidValue(format!(
            "{label} {value:?} is not a canonical int64 decimal string"
        )));
    }
    value
        .parse()
        .map_err(|_| EidosError::InvalidValue(format!("{label} exceeds int64")))
}

fn validate_view_type(view_type: &str) -> Result<()> {
    if !(1..=64).contains(&view_type.len()) || view_type.contains('\0') {
        return Err(EidosError::InvalidValue(
            "View type must be 1 to 64 UTF-8 bytes and contain no NUL".into(),
        ));
    }
    Ok(())
}

fn canonical_object(value: &JsonValue, label: &str) -> Result<String> {
    if !value.is_object() {
        return Err(EidosError::InvalidValue(format!(
            "{label} must be a JSON object"
        )));
    }
    jcs::to_jcs(value)
}

fn table_by_id<'a>(tables: &'a [TableMeta], table_id: &str) -> Result<&'a TableMeta> {
    if !is_valid_uuidv7(table_id) {
        return Err(EidosError::InvalidRequest(format!(
            "Table ID {table_id:?} is not a lowercase UUIDv7"
        )));
    }
    tables
        .iter()
        .find(|table| table.id == table_id)
        .ok_or_else(|| EidosError::NotFound(format!("table {table_id}")))
}

fn view_by_id<'a>(views: &'a [ViewMeta], view_id: &str) -> Result<&'a ViewMeta> {
    views
        .iter()
        .find(|view| view.id == view_id)
        .ok_or_else(|| EidosError::NotFound(format!("view {view_id}")))
}

fn ensure_unique_name(
    views: &[ViewMeta],
    table_id: &str,
    name: &str,
    exclude_view_id: Option<&str>,
) -> Result<()> {
    let folded = sqlite_nocase(name);
    if views.iter().any(|view| {
        view.table_id == table_id
            && Some(view.id.as_str()) != exclude_view_id
            && sqlite_nocase(&view.name) == folded
    }) {
        return Err(EidosError::AlreadyExists(format!(
            "duplicate View name {name:?}"
        )));
    }
    Ok(())
}

fn validate_stable_field_ids(value: &JsonValue, fields: &[FieldMeta]) -> Result<()> {
    match value {
        JsonValue::Array(values) => {
            for value in values {
                validate_stable_field_ids(value, fields)?;
            }
        }
        JsonValue::Object(object) => {
            if let Some(field_id) = object.get("fieldId") {
                let field_id = field_id
                    .as_str()
                    .ok_or_else(|| EidosError::InvalidQuery("fieldId must be a string".into()))?;
                if !is_valid_uuidv7(field_id) {
                    return Err(EidosError::InvalidQuery(format!(
                        "saved View fieldId {field_id:?} is not a lowercase UUIDv7"
                    )));
                }
                if !fields.iter().any(|field| field.id == field_id) {
                    return Err(EidosError::InvalidQuery(format!(
                        "saved View fieldId {field_id:?} does not belong to the View Table"
                    )));
                }
            }
            for value in object.values() {
                validate_stable_field_ids(value, fields)?;
            }
        }
        _ => {}
    }
    Ok(())
}

// Validate declarative calendar operands without binding a saved View to today's date.
fn validate_calendar_leaves(node: &mut FilterNode, fields: &[FieldMeta]) -> Result<()> {
    let (field_id, unit, valid) = match node {
        FilterNode::And { args } | FilterNode::Or { args } => {
            return args
                .iter_mut()
                .try_for_each(|arg| validate_calendar_leaves(arg, fields));
        }
        FilterNode::Not { arg } => return validate_calendar_leaves(arg, fields),
        FilterNode::CalendarPeriod(f) => (&f.field_id, &f.unit, (-1..=1).contains(&f.offset)),
        FilterNode::CalendarWindow(f) => (
            &f.field_id,
            &f.unit,
            matches!(f.direction.as_str(), "past" | "next") && (1..=1_000_000).contains(&f.count),
        ),
        _ => return Ok(()),
    };
    if !valid
        || !matches!(unit.as_str(), "day" | "week" | "month" | "year")
        || !fields.iter().any(|f| {
            &f.id == field_id
                && matches!(
                    f.field_type,
                    crate::model::FieldType::Date | crate::model::FieldType::Datetime
                )
        })
    {
        return Err(EidosError::InvalidQuery(
            "Invalid saved calendar filter".into(),
        ));
    }
    *node = FilterNode::IsNull {
        field_id: field_id.clone(),
    };
    Ok(())
}

fn canonical_query(
    tx: &Connection,
    table: &TableMeta,
    all_fields: &[FieldMeta],
    query: &SavedViewQuery,
) -> Result<String> {
    let fields: Vec<FieldMeta> = all_fields
        .iter()
        .filter(|field| field.table_id == table.id)
        .cloned()
        .collect();
    let value =
        serde_json::to_value(query).map_err(|error| EidosError::Internal(error.to_string()))?;
    validate_stable_field_ids(&value, &fields)?;
    let mut filter = query.filter.clone();
    if let Some(node) = &mut filter {
        validate_calendar_leaves(node, &fields)?;
    }
    compile_query(
        table,
        &fields,
        &RowQuery {
            filter,
            search: None,
            sort: query.sort.clone(),
        },
    )?;
    let window = crate::validate::has_calendar_filter(&value, "calendar-window");
    for (required, name, version) in [
        (
            window || crate::validate::has_calendar_filter(&value, "calendar-period"),
            "eidos:calendar-query",
            "2",
        ),
        (window, "eidos:calendar-window", "1"),
    ] {
        if required {
            tx.execute("INSERT INTO eidos__features(name,version,required,config_json) VALUES(?,?,1,'{}') ON CONFLICT(name) DO NOTHING", [name,version])?;
            let supported:bool = tx.query_row("SELECT version=? AND required=1 AND config_json='{}' FROM eidos__features WHERE name=?", [version,name], |r| r.get(0))?;
            if !supported {
                return Err(EidosError::UnsupportedFeature(name.into()));
            }
        }
    }
    jcs::to_jcs(&value)
}

fn ensure_foreign_keys(conn: &Connection) -> Result<()> {
    let mut statement = conn.prepare("PRAGMA foreign_key_check")?;
    if statement.query([])?.next()?.is_some() {
        return Err(EidosError::InvalidSchema(
            "View mutation would leave a foreign-key violation".into(),
        ));
    }
    Ok(())
}

const UPGRADE_RECEIPT: &str = "space.eidos/date-query-upgrade";

fn upgrade_filter(
    node: &mut FilterNode,
    changes: &mut Vec<JsonValue>,
    depth: usize,
    count: &mut usize,
) -> Result<()> {
    *count += 1;
    if depth > 8 || *count > 100 {
        return Err(EidosError::InvalidQuery(
            "Date query upgrade exceeds query limits".into(),
        ));
    }
    let (id, unit, offset, from) = match node {
        FilterNode::And { args } | FilterNode::Or { args } => {
            return args
                .iter_mut()
                .try_for_each(|child| upgrade_filter(child, changes, depth + 1, count));
        }
        FilterNode::Not { arg } => return upgrade_filter(arg, changes, depth + 1, count),
        FilterNode::CalendarDay(day) => {
            let offset = match day.day.as_str() {
                "yesterday" => -1,
                "today" => 0,
                "tomorrow" => 1,
                _ => {
                    return Err(EidosError::InvalidQuery(
                        "Invalid retired calendar day".into(),
                    ));
                }
            };
            if day.time_zone_data != jiff_tzdb::VERSION || jiff_tzdb::get(&day.time_zone).is_none()
            {
                return Err(EidosError::UnsupportedFeature(
                    "Unsupported calendar timezone or profile".into(),
                ));
            }
            (
                day.field_id.clone(),
                "day".to_owned(),
                offset,
                format!("calendar-day:{}", day.day),
            )
        }
        FilterNode::RelativeDate(date) => {
            let offset = match date.direction.as_str() {
                "past" => -1,
                "this" => 0,
                "next" => 1,
                _ => {
                    return Err(EidosError::InvalidQuery(
                        "Invalid relative date direction".into(),
                    ));
                }
            };
            (
                date.field_id.clone(),
                date.unit.clone(),
                offset,
                format!("relative-date:{}:{}", date.direction, date.unit),
            )
        }
        _ => return Ok(()),
    };
    changes.push(serde_json::json!({"fieldId":id,"from":from,"unit":unit,"offset":offset}));
    *node = FilterNode::CalendarPeriod(crate::query::CalendarPeriodFilter {
        field_id: id,
        unit,
        offset,
    });
    Ok(())
}

fn preview_upgrade(source: &JsonValue) -> Result<(SavedViewQuery, Vec<JsonValue>)> {
    let mut query: SavedViewQuery = serde_json::from_value(source.clone())
        .map_err(|e| EidosError::InvalidQuery(e.to_string()))?;
    // Reject unrecognized members before serializing a replacement for a saved document.
    if serde_json::to_value(&query).map_err(|e| EidosError::Internal(e.to_string()))? != *source {
        return Err(EidosError::InvalidQuery(
            "Cannot upgrade unknown query members".into(),
        ));
    }
    let mut changes = Vec::new();
    if let Some(filter) = &mut query.filter {
        upgrade_filter(filter, &mut changes, 0, &mut 0)?;
    }
    Ok((query, changes))
}

fn change_date_query(
    tx: &Connection,
    view: &ViewMeta,
    table: &TableMeta,
    fields: &[FieldMeta],
    restore: bool,
    instant: &str,
) -> Result<bool> {
    let parse = |value: &str| {
        serde_json::from_str::<JsonValue>(value)
            .map_err(|e| EidosError::InvalidQuery(e.to_string()))
    };
    let source = parse(&view.query_json)?;
    let mut layout = parse(&view.layout_json)?;
    let retained = layout.get(UPGRADE_RECEIPT);
    if let Some(receipt) = retained {
        let invalid = || EidosError::InvalidValue("Invalid date query recovery receipt".into());
        if receipt.as_object().is_none_or(|o| {
            o.keys()
                .any(|k| !matches!(k.as_str(), "version" | "originalQuery" | "changes"))
        }) || receipt["version"] != 2
        {
            return Err(invalid());
        }
        if jcs::to_jcs(receipt)?.len() > 65536 {
            return Err(EidosError::ResourceLimit(
                "Date query recovery receipt exceeds 65536 bytes".into(),
            ));
        }
        let (_, changes) = preview_upgrade(&receipt["originalQuery"])?;
        if changes.is_empty() {
            return Err(invalid());
        }
    }
    let target = if restore {
        let receipt = retained
            .ok_or_else(|| EidosError::InvalidValue("No date query recovery receipt".into()))?;
        let (preview, _) = preview_upgrade(&receipt["originalQuery"])?;
        canonical_query(tx, table, fields, &preview)?;
        jcs::to_jcs(&receipt["originalQuery"])?
    } else {
        let (preview, changes) = preview_upgrade(&source)?;
        if changes.is_empty() {
            return Ok(false);
        }
        let target = canonical_query(tx, table, fields, &preview)?;
        if retained.is_none() {
            let receipt = serde_json::json!({"version":2,"originalQuery":source,"changes":changes});
            if jcs::to_jcs(&receipt)?.len() > 65536 {
                return Err(EidosError::ResourceLimit(
                    "Date query recovery receipt exceeds 65536 bytes".into(),
                ));
            }
            layout[UPGRADE_RECEIPT] = receipt;
        }
        target
    };
    if target == view.query_json {
        return Ok(false);
    }
    tx.execute(
        "UPDATE eidos__views SET query_json=?, layout_json=?, updated_at=? WHERE id=?",
        rusqlite::params![target, jcs::to_jcs(&layout)?, instant, view.id],
    )?;
    Ok(true)
}

fn validate_request(request: &ViewMutationRequest) -> Result<()> {
    if request
        .calendar_query_version
        .is_some_and(|version| version != 2)
    {
        return Err(EidosError::InvalidRequest(
            "Unsupported calendar query consumer version".into(),
        ));
    }
    if request
        .calendar_window_version
        .is_some_and(|version| version != 1 || request.calendar_query_version != Some(2))
    {
        return Err(EidosError::InvalidRequest(
            "Unsupported calendar window consumer version".into(),
        ));
    }
    let mut client_keys = HashSet::new();
    let mut view_ids = HashSet::new();
    for change in &request.changes {
        match change {
            ViewChange::CreateView { client_key, .. } => {
                if client_key.is_empty() || !client_keys.insert(client_key) {
                    return Err(EidosError::InvalidRequest(
                        "View clientKey values must be non-empty and unique".into(),
                    ));
                }
            }
            ViewChange::UpdateView { view_id, .. }
            | ViewChange::DeleteView { view_id }
            | ViewChange::UpgradeDateQuery { view_id }
            | ViewChange::RestoreDateQuery { view_id } => {
                if !is_valid_uuidv7(view_id) {
                    return Err(EidosError::InvalidRequest(format!(
                        "View ID {view_id:?} is not a lowercase UUIDv7"
                    )));
                }
                if !view_ids.insert(view_id) {
                    return Err(EidosError::InvalidRequest(
                        "A View ID may occur only once per request".into(),
                    ));
                }
            }
        }
    }
    Ok(())
}

fn run_views(
    conn: &mut Connection,
    request: &ViewMutationRequest,
    commit: bool,
) -> Result<ViewMutationResult> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let result = mutate_views_in_transaction(&tx, request)?;
    if commit && result.changed {
        tx.commit()?;
    } else {
        tx.rollback()?;
    }
    Ok(result)
}

/// Apply view changes inside the caller's write transaction.
pub fn mutate_views_in_transaction(
    tx: &rusqlite::Transaction<'_>,
    request: &ViewMutationRequest,
) -> Result<ViewMutationResult> {
    if request.changes.is_empty() {
        return Err(EidosError::InvalidRequest(
            "View mutation changes are required".into(),
        ));
    }
    ensure_revision(tx, &request.expected_revision)?;
    validate_request(request)?;

    let before = load_file_meta(tx)?;
    let tables = load_tables(tx)?;
    let fields = load_fields(tx)?;
    let instant = now_instant();
    let mut changed = false;
    let mut created_views = Vec::new();
    let mut affected_view_ids = BTreeSet::new();

    for change in &request.changes {
        match change {
            ViewChange::CreateView {
                client_key,
                table_id,
                name,
                view_type,
                query,
                layout,
                position,
            } => {
                let table = table_by_id(&tables, table_id)?;
                assert_display_name(name, "View name")?;
                validate_view_type(view_type)?;
                let current_views = load_views(tx)?;
                ensure_unique_name(&current_views, table_id, name, None)?;
                let query_json = canonical_query(tx, table, &fields, query)?;
                let layout_json = canonical_object(layout, "View layout")?;
                let position = parse_i64(position, "View position")?;
                let view_id = generate_uuidv7();
                tx.execute(
                    "INSERT INTO eidos__views(\
                       id,table_id,name,type,query_json,layout_json,position,created_at,updated_at\
                     ) VALUES(?,?,?,?,?,?,?,?,?)",
                    rusqlite::params![
                        view_id,
                        table_id,
                        name,
                        view_type,
                        query_json,
                        layout_json,
                        position,
                        instant,
                        instant
                    ],
                )?;
                created_views.push(CreatedView {
                    client_key: client_key.clone(),
                    view_id: view_id.clone(),
                });
                affected_view_ids.insert(view_id);
                changed = true;
            }
            ViewChange::UpdateView { view_id, patch } => {
                let current_views = load_views(tx)?;
                let current = view_by_id(&current_views, view_id)?.clone();
                if patch.query.is_some() {
                    let original: JsonValue = serde_json::from_str(&current.query_json)
                        .map_err(|e| EidosError::InvalidSchema(e.to_string()))?;
                    if (crate::validate::has_calendar_filter(&original, "calendar-period")
                        && request.calendar_query_version != Some(2))
                        || (crate::validate::has_calendar_filter(&original, "calendar-window")
                            && request.calendar_window_version != Some(1))
                        || serde_json::from_value::<SavedViewQuery>(original.clone()).is_err()
                        || crate::validate::has_calendar_filter(&original, "calendar-day")
                        || crate::validate::has_calendar_filter(&original, "relative-date")
                    {
                        return Err(EidosError::UnsupportedFeature(
                            "This client cannot edit the saved View query".into(),
                        ));
                    }
                }
                let table = table_by_id(&tables, &current.table_id)?;
                let name = patch.name.as_deref().unwrap_or(&current.name);
                let view_type = patch.view_type.as_deref().unwrap_or(&current.view_type);
                assert_display_name(name, "View name")?;
                validate_view_type(view_type)?;
                ensure_unique_name(&current_views, &current.table_id, name, Some(view_id))?;
                let query_json = patch
                    .query
                    .as_ref()
                    .map(|query| canonical_query(tx, table, &fields, query))
                    .transpose()?
                    .unwrap_or_else(|| current.query_json.clone());
                let layout_json = patch
                    .layout
                    .as_ref()
                    .map(|layout| canonical_object(layout, "View layout"))
                    .transpose()?
                    .unwrap_or_else(|| current.layout_json.clone());
                let position = patch
                    .position
                    .as_deref()
                    .map(|position| parse_i64(position, "View position"))
                    .transpose()?
                    .unwrap_or(current.position);
                let item_changed = name != current.name
                    || view_type != current.view_type
                    || query_json != current.query_json
                    || layout_json != current.layout_json
                    || position != current.position;
                if item_changed {
                    tx.execute(
                        "UPDATE eidos__views SET \
                         name=?,type=?,query_json=?,layout_json=?,position=?,updated_at=? \
                         WHERE id=?",
                        rusqlite::params![
                            name,
                            view_type,
                            query_json,
                            layout_json,
                            position,
                            instant,
                            view_id
                        ],
                    )?;
                    changed = true;
                }
                affected_view_ids.insert(view_id.clone());
            }
            ViewChange::UpgradeDateQuery { view_id } | ViewChange::RestoreDateQuery { view_id } => {
                let current = load_views(tx)?;
                let view = view_by_id(&current, view_id)?;
                changed |= change_date_query(
                    tx,
                    view,
                    table_by_id(&tables, &view.table_id)?,
                    &fields,
                    matches!(change, ViewChange::RestoreDateQuery { .. }),
                    &instant,
                )?;
                affected_view_ids.insert(view_id.clone());
            }
            ViewChange::DeleteView { view_id } => {
                let current_views = load_views(tx)?;
                view_by_id(&current_views, view_id)?;
                tx.execute("DELETE FROM eidos__views WHERE id=?", [view_id])?;
                affected_view_ids.insert(view_id.clone());
                changed = true;
            }
        }
    }

    let revision = if changed {
        // Calendar indexes are disposable and are installed only on writes.
        let mut statement = tx.prepare(
            "SELECT DISTINCT t.physical_name, f.id, f.physical_name FROM eidos__views v
             JOIN eidos__tables t ON t.id = v.table_id
             JOIN eidos__fields f ON f.table_id = t.id AND (f.id = json_extract(v.layout_json,'$.dateField') OR f.physical_name = json_extract(v.layout_json,'$.dateField'))
             JOIN pragma_table_list p ON p.schema='main' AND p.name=t.physical_name AND p.type='table'
             WHERE v.type='calendar' AND f.type IN ('date','datetime') AND f.physical_name IS NOT NULL"
        )?;
        let indexes = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        drop(statement);
        for (table, field, column) in indexes {
            let index = format!("idx_eidos_calendar_{}", field.replace('-', ""));
            use crate::naming::quote_identifier;
            tx.execute_batch(&format!(
                "CREATE INDEX IF NOT EXISTS {} ON {} ({} COLLATE BINARY)",
                quote_identifier(&index)?,
                quote_identifier(&table)?,
                quote_identifier(&column)?
            ))?;
        }
        ensure_foreign_keys(tx)?;
        ddl::increment_revision(tx, &instant)?
    } else {
        before.revision
    };
    Ok(ViewMutationResult {
        file_id: before.file_id,
        revision: revision.to_string(),
        changed,
        created_views,
        affected_view_ids: affected_view_ids.into_iter().collect(),
    })
}

pub fn mutate_views(
    conn: &mut Connection,
    request: &ViewMutationRequest,
) -> Result<ViewMutationResult> {
    run_views(conn, request, true)
}

/// Execute the exact View mutation inside an IMMEDIATE transaction and roll
/// it back. Created View IDs in the result are planning IDs and must not be
/// reused for a later command.
pub fn preview_views(
    conn: &mut Connection,
    request: &ViewMutationRequest,
) -> Result<ViewMutationResult> {
    run_views(conn, request, false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ddl::create_eidos_file;
    use crate::model::{FieldType, SystemRole};
    use crate::schema_ops::{NewField, SchemaLeafChange, apply_initial_table};
    use serde_json::json;

    fn fixture() -> (
        tempfile::TempDir,
        Connection,
        TableMeta,
        Vec<FieldMeta>,
        ViewMeta,
    ) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("views.eidos");
        create_eidos_file(&path, Some("Views")).unwrap();
        let mut conn = Connection::open(&path).unwrap();
        ddl::configure_connection(&conn).unwrap();
        apply_initial_table(
            &mut conn,
            &SchemaLeafChange::CreateTable {
                client_key: "tasks".into(),
                name: "Tasks".into(),
                position: Some("0".into()),
                settings: None,
                fields: vec![NewField {
                    client_key: "due".into(),
                    name: "Due".into(),
                    kind: FieldType::Date,
                    position: Some("0".into()),
                    nullable: None,
                    settings: None,
                    definition: None,
                }],
                label_field_client_key: Some("due".into()),
            },
        )
        .unwrap();
        let table = load_tables(&conn).unwrap().remove(0);
        let fields = load_fields(&conn)
            .unwrap()
            .into_iter()
            .filter(|field| field.table_id == table.id)
            .collect::<Vec<_>>();
        let grid = load_views(&conn).unwrap().remove(0);
        (dir, conn, table, fields, grid)
    }

    #[test]
    fn creates_updates_and_deletes_calendar_view_atomically() {
        let (_dir, mut conn, table, fields, grid) = fixture();
        let due = fields
            .iter()
            .find(|field| field.system_role.is_none() && field.name == "Due")
            .unwrap();
        let created = mutate_views(
            &mut conn,
            &ViewMutationRequest {
                calendar_query_version: None,
                calendar_window_version: None,
                expected_revision: "1".into(),
                changes: vec![ViewChange::CreateView {
                    client_key: "calendar".into(),
                    table_id: table.id.clone(),
                    name: "Calendar".into(),
                    view_type: "calendar".into(),
                    query: SavedViewQuery::default(),
                    layout: json!({"dateField": due.id}),
                    position: "1".into(),
                }],
            },
        )
        .unwrap();
        assert_eq!(created.revision, "2");
        assert_eq!(created.created_views.len(), 1);
        let calendar_id = created.created_views[0].view_id.clone();
        let calendar = load_views(&conn)
            .unwrap()
            .into_iter()
            .find(|view| view.id == calendar_id)
            .unwrap();
        assert_eq!(calendar.view_type, "calendar");
        assert_eq!(
            calendar.layout_json,
            format!(r#"{{"dateField":"{}"}}"#, due.id)
        );

        let updated = mutate_views(
            &mut conn,
            &ViewMutationRequest {
                calendar_query_version: None,
                calendar_window_version: None,
                expected_revision: "2".into(),
                changes: vec![
                    ViewChange::UpdateView {
                        view_id: calendar_id.clone(),
                        patch: ViewPatch {
                            position: Some("0".into()),
                            ..ViewPatch::default()
                        },
                    },
                    ViewChange::UpdateView {
                        view_id: grid.id.clone(),
                        patch: ViewPatch {
                            position: Some("1".into()),
                            ..ViewPatch::default()
                        },
                    },
                ],
            },
        )
        .unwrap();
        assert_eq!(updated.revision, "3");
        let mut expected_affected = vec![calendar_id.clone(), grid.id.clone()];
        expected_affected.sort();
        assert_eq!(updated.affected_view_ids, expected_affected);

        let deleted = mutate_views(
            &mut conn,
            &ViewMutationRequest {
                calendar_query_version: None,
                calendar_window_version: None,
                expected_revision: "3".into(),
                changes: vec![ViewChange::DeleteView {
                    view_id: calendar_id.clone(),
                }],
            },
        )
        .unwrap();
        assert_eq!(deleted.revision, "4");
        assert!(
            !load_views(&conn)
                .unwrap()
                .iter()
                .any(|view| view.id == calendar_id)
        );
    }

    #[test]
    fn no_op_preserves_revision_and_invalid_batch_rolls_back() {
        let (_dir, mut conn, table, fields, grid) = fixture();
        let no_op = mutate_views(
            &mut conn,
            &ViewMutationRequest {
                calendar_query_version: None,
                calendar_window_version: None,
                expected_revision: "1".into(),
                changes: vec![ViewChange::UpdateView {
                    view_id: grid.id.clone(),
                    patch: ViewPatch::default(),
                }],
            },
        )
        .unwrap();
        assert!(!no_op.changed);
        assert_eq!(no_op.revision, "1");

        let foreign_field = fields
            .iter()
            .find(|field| field.system_role == Some(SystemRole::CreatedTime))
            .unwrap();
        let error = mutate_views(
            &mut conn,
            &ViewMutationRequest {
                calendar_query_version: None,
                calendar_window_version: None,
                expected_revision: "1".into(),
                changes: vec![
                    ViewChange::CreateView {
                        client_key: "first".into(),
                        table_id: table.id.clone(),
                        name: "First".into(),
                        view_type: "grid".into(),
                        query: SavedViewQuery::default(),
                        layout: json!({}),
                        position: "1".into(),
                    },
                    ViewChange::CreateView {
                        client_key: "bad".into(),
                        table_id: table.id.clone(),
                        name: "Bad".into(),
                        view_type: "grid".into(),
                        query: serde_json::from_value(json!({
                            "sort": [{"fieldId": "01900000-0000-7000-8000-000000000000", "direction": "asc"}]
                        }))
                        .unwrap(),
                        layout: json!({"field": foreign_field.id}),
                        position: "2".into(),
                    },
                ],
            },
        )
        .unwrap_err();
        assert_eq!(error.code(), "invalid-query");
        assert_eq!(load_file_meta(&conn).unwrap().revision, 1);
        assert_eq!(load_views(&conn).unwrap(), vec![grid]);
    }
}
