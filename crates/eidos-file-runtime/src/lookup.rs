//! Inverse Relation and Lookup field evaluation in pure Rust.
//!
//! Resolves virtual `inverse-relation` and `lookup` columns in batched SQL
//! queries (avoiding N+1 per-row queries) and supports all canonical
//! `LookupAggregate` modes (`values`, `first`, `count`, `sum`, `average`, `min`, `max`)
//! with optional `distinctValues`.

use std::collections::{HashMap, HashSet};

use eidos_file_core::jcs;
use eidos_file_core::model::{
    FieldMeta, FieldType, FormulaFieldMeta, LookupAggregate, LookupFieldMeta, RelationDirection,
    RelationFieldMeta, TableMeta,
};
use eidos_file_core::naming::quote_identifier;
use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, params_from_iter};
use serde_json::{Value as JsonValue, json};

use crate::contract::{ProjectedRow, RuntimeErrorPayload, RuntimeResult};
use crate::formula::{FORMULA_CALENDAR_CTE, coerce_formula_sql_value, compile_formula_expression};

/// Computes the canonical `TypeRef` JSON for a Lookup field, matching
/// `eidosFileLookupValueType` in `packages/eidos-file/src/lookup.ts`.
pub fn lookup_value_type_json(
    lookup: &LookupFieldMeta,
    all_fields: &[FieldMeta],
    formulas: &HashMap<String, FormulaFieldMeta>,
) -> JsonValue {
    let target = all_fields.iter().find(|f| f.id == lookup.target_field_id);
    let element: &str = match target.map(|f| f.field_type) {
        Some(FieldType::Integer) => "integer",
        Some(FieldType::Number) => "number",
        Some(FieldType::Checkbox) => "checkbox",
        Some(FieldType::Date) => "date",
        Some(FieldType::Datetime) => "datetime",
        Some(FieldType::Url) => "url",
        Some(FieldType::Select | FieldType::MultiSelect) => "select",
        Some(FieldType::File) => "file-entry",
        Some(FieldType::Relation) => "row-id",
        Some(FieldType::Formula) => formulas
            .get(&lookup.target_field_id)
            .map(|f| f.result_type.as_str())
            .unwrap_or("text"),
        _ => "text",
    };

    match lookup.aggregate {
        LookupAggregate::Values => json!({ "kind": "list", "element": element }),
        LookupAggregate::Count => json!("integer"),
        LookupAggregate::Average => json!("number"),
        LookupAggregate::Sum => {
            if element == "integer" {
                json!("integer")
            } else {
                json!("number")
            }
        }
        LookupAggregate::First | LookupAggregate::Min | LookupAggregate::Max => json!(element),
    }
}

fn decode_target_cell(val: SqlValue, field: &FieldMeta) -> JsonValue {
    match val {
        SqlValue::Null => JsonValue::Null,
        SqlValue::Integer(i) => match field.field_type {
            FieldType::Checkbox => JsonValue::Bool(i != 0),
            FieldType::Integer => JsonValue::String(i.to_string()),
            FieldType::Number => json!(i as f64),
            _ => JsonValue::String(i.to_string()),
        },
        SqlValue::Real(f) => {
            if f.is_finite() {
                json!(if f == 0.0 { 0.0 } else { f })
            } else {
                JsonValue::Null
            }
        }
        SqlValue::Text(s) => match field.field_type {
            FieldType::MultiSelect | FieldType::Relation | FieldType::File => {
                serde_json::from_str(&s).unwrap_or(JsonValue::Array(Vec::new()))
            }
            _ => JsonValue::String(s),
        },
        SqlValue::Blob(_) => JsonValue::Null,
    }
}

/// Batch-resolves inverse relation IDs for a set of source row IDs.
pub fn resolve_inverse_relation_batch(
    conn: &Connection,
    row_ids: &[String],
    inverse_rel: &RelationFieldMeta,
    all_tables: &[TableMeta],
    all_fields: &[FieldMeta],
) -> RuntimeResult<HashMap<String, Vec<String>>> {
    let mut result: HashMap<String, Vec<String>> = HashMap::new();
    if row_ids.is_empty() {
        return Ok(result);
    }
    let Some(forward_field_id) = inverse_rel.inverse_of_field_id.as_deref() else {
        return Ok(result);
    };
    let Some(forward_field) = all_fields.iter().find(|f| f.id == forward_field_id) else {
        return Ok(result);
    };
    let Some(forward_phys) = forward_field.physical_name.as_deref() else {
        return Ok(result);
    };
    let Some(source_table) = all_tables.iter().find(|t| t.id == forward_field.table_id) else {
        return Ok(result);
    };

    let tbl_sql =
        quote_identifier(&source_table.physical_name).map_err(RuntimeErrorPayload::from_core)?;
    let col_sql = quote_identifier(forward_phys).map_err(RuntimeErrorPayload::from_core)?;
    let ph = vec!["?"; row_ids.len()].join(", ");
    let sql = format!(
        "SELECT je.value, t.\"_id\" FROM {tbl_sql} t, json_each(t.{col_sql}) je \
         WHERE t.{col_sql} IS NOT NULL AND je.value IN ({ph}) ORDER BY t.\"_id\" ASC"
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
    let mut qrows = stmt
        .query(params_from_iter(row_ids.iter()))
        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
    while let Some(r) = qrows
        .next()
        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?
    {
        let target_id: String = r.get(0).unwrap_or_default();
        let back_id: String = r.get(1).unwrap_or_default();
        result.entry(target_id).or_default().push(back_id);
    }
    Ok(result)
}

/// Populates all projected `inverse-relation` and `lookup` columns in `rows`.
#[allow(clippy::too_many_arguments)]
pub fn populate_virtual_columns(
    conn: &Connection,
    rows: &mut [ProjectedRow],
    source_table: &TableMeta,
    selected_fields: &[FieldMeta],
    all_tables: &[TableMeta],
    all_fields: &[FieldMeta],
    relations: &HashMap<String, RelationFieldMeta>,
    lookups: &HashMap<String, LookupFieldMeta>,
    formulas: &HashMap<String, FormulaFieldMeta>,
    today_date: Option<&str>,
) -> RuntimeResult<()> {
    if rows.is_empty() {
        return Ok(());
    }

    let has_virtual = selected_fields.iter().any(|f| {
        f.field_type == FieldType::Lookup
            || (f.field_type == FieldType::Relation
                && relations
                    .get(&f.id)
                    .is_some_and(|r| r.direction == RelationDirection::Inverse))
    });
    if !has_virtual {
        return Ok(());
    }

    let row_ids: Vec<String> = rows.iter().map(|r| r.id.clone()).collect();
    let mut inverse_cache: HashMap<String, HashMap<String, Vec<String>>> = HashMap::new();
    let mut forward_cache: HashMap<String, HashMap<String, Vec<String>>> = HashMap::new();

    // 1. Fill projected inverse-relation columns
    for (col_idx, field) in selected_fields.iter().enumerate() {
        if field.field_type == FieldType::Relation
            && let Some(rel) = relations.get(&field.id)
            && rel.direction == RelationDirection::Inverse
        {
            let map = resolve_inverse_relation_batch(conn, &row_ids, rel, all_tables, all_fields)?;
            for row in rows.iter_mut() {
                let ids = map.get(&row.id).cloned().unwrap_or_default();
                row.values[col_idx] =
                    JsonValue::Array(ids.into_iter().map(JsonValue::String).collect());
            }
            inverse_cache.insert(field.id.clone(), map);
        }
    }

    // 2. Fill projected lookup columns
    for (col_idx, field) in selected_fields.iter().enumerate() {
        if field.field_type != FieldType::Lookup {
            continue;
        }
        let Some(lookup) = lookups.get(&field.id) else {
            continue;
        };
        let Some(rel_meta) = relations.get(&lookup.relation_field_id) else {
            continue;
        };

        // Determine linked target row IDs per source row
        let linked_ids_by_row: &HashMap<String, Vec<String>> = match rel_meta.direction {
            RelationDirection::Inverse => {
                if !inverse_cache.contains_key(&lookup.relation_field_id) {
                    let map = resolve_inverse_relation_batch(
                        conn, &row_ids, rel_meta, all_tables, all_fields,
                    )?;
                    inverse_cache.insert(lookup.relation_field_id.clone(), map);
                }
                &inverse_cache[&lookup.relation_field_id]
            }
            RelationDirection::Forward => {
                if !forward_cache.contains_key(&lookup.relation_field_id) {
                    let map = read_forward_relation_ids(
                        conn,
                        source_table,
                        &row_ids,
                        &lookup.relation_field_id,
                        all_fields,
                    )?;
                    forward_cache.insert(lookup.relation_field_id.clone(), map);
                }
                &forward_cache[&lookup.relation_field_id]
            }
        };

        // Gather all unique target row IDs across the page
        let mut all_target_ids: HashSet<String> = HashSet::new();
        for ids in linked_ids_by_row.values() {
            for id in ids {
                all_target_ids.insert(id.clone());
            }
        }

        let Some(target_field) = all_fields.iter().find(|f| f.id == lookup.target_field_id) else {
            continue;
        };
        let Some(target_table) = all_tables.iter().find(|t| t.id == target_field.table_id) else {
            continue;
        };

        let target_values = fetch_target_field_values(
            conn,
            target_table,
            target_field,
            all_fields,
            formulas,
            &all_target_ids.into_iter().collect::<Vec<_>>(),
            today_date,
        )?;

        for row in rows.iter_mut() {
            let linked = linked_ids_by_row.get(&row.id);
            let mut collected: Vec<JsonValue> = Vec::new();
            if let Some(ids) = linked {
                for tid in ids {
                    if let Some(val) = target_values.get(tid) {
                        if val.is_null() {
                            continue;
                        }
                        if matches!(
                            target_field.field_type,
                            FieldType::MultiSelect | FieldType::Relation | FieldType::File
                        ) && let Some(arr) = val.as_array()
                        {
                            for item in arr {
                                if !item.is_null() {
                                    collected.push(item.clone());
                                }
                            }
                        } else {
                            collected.push(val.clone());
                        }
                    }
                }
            }

            if lookup.distinct_values {
                let mut seen: HashSet<String> = HashSet::new();
                collected.retain(|v| {
                    let key = jcs::to_jcs(v).unwrap_or_else(|_| v.to_string());
                    seen.insert(key)
                });
            }

            row.values[col_idx] =
                aggregate_lookup_values(&collected, lookup.aggregate, target_field.field_type);
        }
    }

    Ok(())
}

fn read_forward_relation_ids(
    conn: &Connection,
    source_table: &TableMeta,
    row_ids: &[String],
    rel_field_id: &str,
    all_fields: &[FieldMeta],
) -> RuntimeResult<HashMap<String, Vec<String>>> {
    let mut out = HashMap::new();
    let Some(rel_field) = all_fields.iter().find(|f| f.id == rel_field_id) else {
        return Ok(out);
    };
    let Some(phys) = rel_field.physical_name.as_deref() else {
        return Ok(out);
    };
    let tbl_sql =
        quote_identifier(&source_table.physical_name).map_err(RuntimeErrorPayload::from_core)?;
    let col_sql = quote_identifier(phys).map_err(RuntimeErrorPayload::from_core)?;
    let ph = vec!["?"; row_ids.len()].join(", ");
    let sql = format!("SELECT \"_id\", {col_sql} FROM {tbl_sql} WHERE \"_id\" IN ({ph})");
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
    let mut qrows = stmt
        .query(params_from_iter(row_ids.iter()))
        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
    while let Some(r) = qrows
        .next()
        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?
    {
        let id: String = r.get(0).unwrap_or_default();
        let raw: Option<String> = r.get(1).ok();
        let ids: Vec<String> = raw
            .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
            .unwrap_or_default();
        out.insert(id, ids);
    }
    Ok(out)
}

fn fetch_target_field_values(
    conn: &Connection,
    target_table: &TableMeta,
    target_field: &FieldMeta,
    all_fields: &[FieldMeta],
    formulas: &HashMap<String, FormulaFieldMeta>,
    target_ids: &[String],
    today_date: Option<&str>,
) -> RuntimeResult<HashMap<String, JsonValue>> {
    let mut out = HashMap::new();
    if target_ids.is_empty() {
        return Ok(out);
    }
    let tbl_sql =
        quote_identifier(&target_table.physical_name).map_err(RuntimeErrorPayload::from_core)?;
    let mut uses_today = false;
    let expr = if target_field.field_type == FieldType::Formula {
        let def = formulas.get(&target_field.id).ok_or_else(|| {
            RuntimeErrorPayload::new(
                "corrupt-file",
                format!("Missing formula {}", target_field.id),
            )
        })?;
        let target_fields: Vec<FieldMeta> = all_fields
            .iter()
            .filter(|f| f.table_id == target_table.id)
            .cloned()
            .collect();
        let compiled = compile_formula_expression(
            &def.source_text,
            &target_fields,
            formulas,
            Some(&target_field.id),
            None,
        )
        .map_err(|d| RuntimeErrorPayload::new(d.code, d.message.unwrap_or_default()))?;
        uses_today = compiled.uses_today;
        format!("({})", compiled.sql)
    } else if let Some(phys) = target_field.physical_name.as_deref() {
        quote_identifier(phys).map_err(RuntimeErrorPayload::from_core)?
    } else {
        return Ok(out);
    };

    let mut params: Vec<SqlValue> = Vec::new();
    let cte = if uses_today {
        params.push(SqlValue::Text(
            today_date.unwrap_or("1970-01-01").to_string(),
        ));
        format!("WITH {FORMULA_CALENDAR_CTE} ")
    } else {
        String::new()
    };
    for id in target_ids {
        params.push(SqlValue::Text(id.clone()));
    }
    let ph = vec!["?"; target_ids.len()].join(", ");
    let sql = format!("{cte}SELECT \"_id\", {expr} FROM {tbl_sql} WHERE \"_id\" IN ({ph})");
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
    let mut qrows = stmt
        .query(params_from_iter(params.iter()))
        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
    while let Some(r) = qrows
        .next()
        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?
    {
        let id: String = r.get(0).unwrap_or_default();
        let raw: SqlValue = r.get(1).unwrap_or(SqlValue::Null);
        let val = if target_field.field_type == FieldType::Formula {
            let rt = formulas
                .get(&target_field.id)
                .map(|f| f.result_type.as_str())
                .unwrap_or("text");
            coerce_formula_sql_value(raw, rt)?
        } else {
            decode_target_cell(raw, target_field)
        };
        out.insert(id, val);
    }
    Ok(out)
}

fn value_as_f64(v: &JsonValue) -> Option<f64> {
    match v {
        JsonValue::Number(n) => n.as_f64(),
        JsonValue::String(s) => s.parse::<f64>().ok(),
        _ => None,
    }
}

fn value_as_i64(v: &JsonValue) -> Option<i64> {
    match v {
        JsonValue::String(s) => s.parse::<i64>().ok(),
        JsonValue::Number(n) => n.as_i64(),
        _ => None,
    }
}

fn aggregate_lookup_values(
    values: &[JsonValue],
    agg: LookupAggregate,
    target_type: FieldType,
) -> JsonValue {
    match agg {
        LookupAggregate::Values => JsonValue::Array(values.to_vec()),
        LookupAggregate::First => values.first().cloned().unwrap_or(JsonValue::Null),
        LookupAggregate::Count => JsonValue::String(values.len().to_string()),
        LookupAggregate::Sum => {
            if values.is_empty() {
                return JsonValue::Null;
            }
            if target_type == FieldType::Integer {
                let sum: i64 = values.iter().filter_map(value_as_i64).sum();
                JsonValue::String(sum.to_string())
            } else {
                let sum: f64 = values.iter().filter_map(value_as_f64).sum();
                json!(if sum == 0.0 { 0.0 } else { sum })
            }
        }
        LookupAggregate::Average => {
            let nums: Vec<f64> = values.iter().filter_map(value_as_f64).collect();
            if nums.is_empty() {
                JsonValue::Null
            } else {
                let avg = nums.iter().sum::<f64>() / (nums.len() as f64);
                json!(if avg == 0.0 { 0.0 } else { avg })
            }
        }
        LookupAggregate::Min => {
            if values.is_empty() {
                return JsonValue::Null;
            }
            match target_type {
                FieldType::Integer => values
                    .iter()
                    .filter_map(value_as_i64)
                    .min()
                    .map(|v| JsonValue::String(v.to_string()))
                    .unwrap_or(JsonValue::Null),
                FieldType::Number => values
                    .iter()
                    .filter_map(value_as_f64)
                    .min_by(|a, b| a.total_cmp(b))
                    .map(|v| json!(v))
                    .unwrap_or(JsonValue::Null),
                _ => values
                    .iter()
                    .filter_map(|v| v.as_str())
                    .min()
                    .map(|s| JsonValue::String(s.to_string()))
                    .unwrap_or(JsonValue::Null),
            }
        }
        LookupAggregate::Max => {
            if values.is_empty() {
                return JsonValue::Null;
            }
            match target_type {
                FieldType::Integer => values
                    .iter()
                    .filter_map(value_as_i64)
                    .max()
                    .map(|v| JsonValue::String(v.to_string()))
                    .unwrap_or(JsonValue::Null),
                FieldType::Number => values
                    .iter()
                    .filter_map(value_as_f64)
                    .max_by(|a, b| a.total_cmp(b))
                    .map(|v| json!(v))
                    .unwrap_or(JsonValue::Null),
                _ => values
                    .iter()
                    .filter_map(|v| v.as_str())
                    .max()
                    .map(|s| JsonValue::String(s.to_string()))
                    .unwrap_or(JsonValue::Null),
            }
        }
    }
}
