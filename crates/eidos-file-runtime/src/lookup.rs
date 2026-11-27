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
    lookups: &HashMap<String, LookupFieldMeta>,
) -> JsonValue {
    let element = lookup_element(lookup, all_fields, formulas, lookups);

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

pub(crate) fn lookup_element<'a>(
    lookup: &LookupFieldMeta,
    all_fields: &[FieldMeta],
    formulas: &'a HashMap<String, FormulaFieldMeta>,
    lookups: &HashMap<String, LookupFieldMeta>,
) -> &'a str {
    let mut lookup = lookup;
    for _ in 0..=64 {
        let Some(nested) = lookups.get(&lookup.target_field_id) else {
            break;
        };
        match nested.aggregate {
            LookupAggregate::Count => return "integer",
            LookupAggregate::Average => return "number",
            _ => lookup = nested,
        }
    }
    let target = all_fields.iter().find(|f| f.id == lookup.target_field_id);
    match target.map(|f| f.field_type) {
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
    populate_virtual_columns_inner(
        conn,
        rows,
        source_table,
        selected_fields,
        all_tables,
        all_fields,
        relations,
        lookups,
        formulas,
        today_date,
        0,
    )
}

#[allow(clippy::too_many_arguments)]
fn populate_virtual_columns_inner(
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
    depth: usize,
) -> RuntimeResult<()> {
    if depth > 64 {
        return Err(RuntimeErrorPayload::new(
            "semantic-cycle",
            "Lookup dependency depth exceeded",
        ));
    }
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

        let target_ids = all_target_ids.into_iter().collect::<Vec<_>>();
        let target_values = if target_field.physical_name.is_none()
            && target_field.field_type != FieldType::Formula
            && !target_ids.is_empty()
        {
            let table_name = quote_identifier(&target_table.physical_name)
                .map_err(RuntimeErrorPayload::from_core)?;
            let placeholders = vec!["?"; target_ids.len()].join(",");
            let sql = format!("SELECT _id FROM {table_name} WHERE _id IN ({placeholders})");
            let err = |e: rusqlite::Error| RuntimeErrorPayload::new("adapter-error", e.to_string());
            let mut stmt = conn.prepare(&sql).map_err(err)?;
            let mut nested = stmt
                .query_map(params_from_iter(&target_ids), |r| {
                    Ok(ProjectedRow {
                        id: r.get(0)?,
                        values: vec![JsonValue::Null],
                        resolved_relations: None,
                    })
                })
                .map_err(err)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(err)?;
            populate_virtual_columns_inner(
                conn,
                &mut nested,
                target_table,
                std::slice::from_ref(target_field),
                all_tables,
                all_fields,
                relations,
                lookups,
                formulas,
                today_date,
                depth + 1,
            )?;
            nested
                .into_iter()
                .map(|mut row| (row.id, row.values.remove(0)))
                .collect()
        } else {
            fetch_target_field_values(
                conn,
                target_table,
                target_field,
                all_fields,
                formulas,
                &target_ids,
                today_date,
            )?
        };

        for row in rows.iter_mut() {
            let linked = linked_ids_by_row.get(&row.id);
            let mut collected: Vec<JsonValue> = Vec::new();
            if let Some(ids) = linked {
                for tid in ids {
                    if let Some(val) = target_values.get(tid) {
                        if (target_field.field_type == FieldType::Lookup
                            || matches!(
                                target_field.field_type,
                                FieldType::MultiSelect | FieldType::Relation | FieldType::File
                            ))
                            && let Some(arr) = val.as_array()
                        {
                            for item in arr {
                                collected.push(item.clone());
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

            row.values[col_idx] = aggregate_lookup_values(
                &collected,
                lookup.aggregate,
                lookup_element(lookup, all_fields, formulas, lookups),
            );
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

/// Rounds the exact integer ratio once to binary64 using ties-to-even.
fn integer_average(sum: i128, count: usize) -> f64 {
    if sum == 0 {
        return 0.0;
    }
    let n = sum.unsigned_abs();
    let d = count as u128;
    let mut exp = d.leading_zeros() as i32 - n.leading_zeros() as i32;
    let below = if exp >= 0 {
        n < (d << exp)
    } else {
        (n << -exp) < d
    };
    exp -= i32::from(below);
    let shift = 52 - exp;
    let (a, b) = if shift >= 0 {
        (n << shift, d)
    } else {
        (n, d << -shift)
    };
    let q = a / b;
    let r = a % b;
    let rounded = q + u128::from(r > b - r || (r == b - r && q % 2 == 1));
    let magnitude = (rounded as f64) * 2.0_f64.powi(exp - 52);
    if sum < 0 { -magnitude } else { magnitude }
}

fn aggregate_lookup_values(values: &[JsonValue], agg: LookupAggregate, kind: &str) -> JsonValue {
    use LookupAggregate::*;
    match agg {
        Values => return JsonValue::Array(values.to_vec()),
        First => return values.first().cloned().unwrap_or(JsonValue::Null),
        _ => {}
    }
    let non_null: Vec<_> = values.iter().filter(|v| !v.is_null()).collect();
    if agg == Count {
        return json!(non_null.len().to_string());
    }
    if non_null.is_empty() {
        return JsonValue::Null;
    }
    if matches!(agg, Sum | Average) {
        if kind == "integer" {
            let sum: i128 = non_null
                .iter()
                .filter_map(|v| value_as_i64(v))
                .map(i128::from)
                .sum();
            return if agg == Sum {
                i64::try_from(sum)
                    .map(|n| json!(n.to_string()))
                    .unwrap_or(JsonValue::Null)
            } else {
                json!(integer_average(sum, non_null.len()))
            };
        }
        let mut level: Vec<_> = non_null.iter().filter_map(|v| value_as_f64(v)).collect();
        let count = level.len();
        if count == 0 {
            return JsonValue::Null;
        }
        while level.len() > 1 {
            level = level
                .chunks(2)
                .map(|pair| match pair {
                    [a, b] => a + b,
                    [a] => *a,
                    _ => unreachable!(),
                })
                .collect();
        }
        let value = if agg == Average {
            level[0] / count as f64
        } else {
            level[0]
        };
        return json!(if value == 0.0 { 0.0 } else { value });
    }
    let compare = |a: &&JsonValue, b: &&JsonValue| match kind {
        "integer" => value_as_i64(a).cmp(&value_as_i64(b)),
        "number" => value_as_f64(a)
            .partial_cmp(&value_as_f64(b))
            .unwrap_or(std::cmp::Ordering::Equal),
        "checkbox" => a.as_bool().cmp(&b.as_bool()),
        _ => a.as_str().cmp(&b.as_str()),
    };
    let selected = if agg == Min {
        non_null.into_iter().min_by(compare)
    } else {
        non_null.into_iter().max_by(compare)
    };
    selected.cloned().unwrap_or(JsonValue::Null)
}

pub(crate) fn register_lookup_aggregate(conn: &Connection) -> RuntimeResult<()> {
    use rusqlite::functions::FunctionFlags;
    conn.create_scalar_function(
        "eidos_runtime_lookup",
        3,
        FunctionFlags::SQLITE_UTF8
            | FunctionFlags::SQLITE_DETERMINISTIC
            | FunctionFlags::SQLITE_INNOCUOUS,
        |ctx| {
            let raw = ctx.get::<String>(0)?;
            let agg = LookupAggregate::from_spec_str(&ctx.get::<String>(1)?)
                .map_err(|e| rusqlite::Error::UserFunctionError(Box::new(e)))?;
            let kind = ctx.get::<String>(2)?;
            let values = serde_json::from_str::<Vec<JsonValue>>(&raw)
                .map_err(|e| rusqlite::Error::UserFunctionError(Box::new(e)))?;
            let value = aggregate_lookup_values(&values, agg, &kind);
            Ok(match value {
                JsonValue::Null => SqlValue::Null,
                JsonValue::String(s) if agg == LookupAggregate::Count || kind == "integer" => {
                    s.parse().map(SqlValue::Integer).unwrap_or(SqlValue::Null)
                }
                JsonValue::String(s) => SqlValue::Text(s),
                JsonValue::Bool(b) => SqlValue::Integer(i64::from(b)),
                JsonValue::Number(n) => n.as_f64().map(SqlValue::Real).unwrap_or(SqlValue::Null),
                other => SqlValue::Text(
                    jcs::to_jcs(&other)
                        .map_err(|e| rusqlite::Error::UserFunctionError(Box::new(e)))?,
                ),
            })
        },
    )
    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))
}
