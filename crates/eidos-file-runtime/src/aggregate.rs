//! Native SQL aggregation (`aggregate`) and SQL `GROUP BY` (`groupRows` / `queryGroupRows`).
//!
//! Unlike the JS runtime (which scans logical rows into JS memory and hits
//! `maxResultBytes` on 100k-row `groupRows`), this module compiles directly to
//! single-pass SQLite `SELECT COUNT(*), SUM(...), AVG(...), MIN(...), MAX(...)`
//! and `GROUP BY` queries.

use std::collections::HashMap;

use eidos_file_core::model::{FieldMeta, FieldType, FormulaFieldMeta, TableMeta};
use eidos_file_core::naming::quote_identifier;
use eidos_file_core::query::{RowQuery, compile_query};
use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, params_from_iter};
use serde_json::Value as JsonValue;

use crate::contract::{
    AggregateItem, AggregateResponse, AggregateResult, ColumnStatistics, RuntimeErrorPayload,
    RuntimeResult,
};
use crate::formula::{FORMULA_CALENDAR_CTE, compile_formula_expression};

fn sql_value_to_logical(value: SqlValue, field: &FieldMeta) -> JsonValue {
    match value {
        SqlValue::Null => JsonValue::Null,
        SqlValue::Integer(i) => match field.field_type {
            FieldType::Integer => JsonValue::String(i.to_string()),
            FieldType::Checkbox => JsonValue::Bool(i != 0),
            FieldType::Number => serde_json::json!(i as f64),
            _ => JsonValue::String(i.to_string()),
        },
        SqlValue::Real(f) => {
            if !f.is_finite() {
                JsonValue::Null
            } else {
                let norm = if f == 0.0 { 0.0 } else { f };
                serde_json::json!(norm)
            }
        }
        SqlValue::Text(s) => match field.field_type {
            FieldType::MultiSelect | FieldType::Relation | FieldType::File => {
                serde_json::from_str(&s).unwrap_or(JsonValue::String(s))
            }
            _ => JsonValue::String(s),
        },
        SqlValue::Blob(_) => JsonValue::Null,
    }
}

pub fn field_sql_expr(
    field: &FieldMeta,
    all_fields: &[FieldMeta],
    formula_defs: &HashMap<String, FormulaFieldMeta>,
    uses_today: &mut bool,
) -> RuntimeResult<String> {
    if formula_defs.contains_key(&field.id) || field.field_type == FieldType::Formula {
        let def = formula_defs.get(&field.id).ok_or_else(|| {
            RuntimeErrorPayload::new("corrupt-file", format!("Missing formula for {}", field.id))
        })?;
        let compiled = compile_formula_expression(
            &def.source_text,
            all_fields,
            formula_defs,
            Some(&field.id),
            None,
        )
        .map_err(|d| RuntimeErrorPayload::new(d.code, d.message.unwrap_or_default()))?;
        if compiled.uses_today {
            *uses_today = true;
        }
        return Ok(format!("({})", compiled.sql));
    }
    let phys = field.physical_name.as_deref().ok_or_else(|| {
        RuntimeErrorPayload::new(
            "invalid-query",
            format!(
                "Field {} is virtual and cannot be aggregated directly",
                field.name
            ),
        )
    })?;
    quote_identifier(phys).map_err(RuntimeErrorPayload::from_core)
}

pub(crate) fn compile_predicates(
    conn: &Connection,
    table: &TableMeta,
    fields: &[FieldMeta],
    schema: &crate::service::CachedSchema,
    query: &RowQuery,
    uses_today: &mut bool,
) -> RuntimeResult<eidos_file_core::query::CompiledQuery> {
    let predicate = RowQuery {
        filter: query.filter.clone(),
        search: query.search.clone(),
        sort: None,
    };
    if predicate.filter.is_none() && predicate.search.is_none() {
        return compile_query(table, fields, &predicate).map_err(RuntimeErrorPayload::from_core);
    }
    let filter = serde_json::to_value(&predicate.filter)
        .map_err(|e| RuntimeErrorPayload::new("invalid-query", e.to_string()))?;
    let mut typed = fields.to_vec();
    let mut expressions = HashMap::new();
    for field in &mut typed {
        if !matches!(field.field_type, FieldType::Lookup | FieldType::Formula) {
            continue;
        };
        let referenced = eidos_file_core::schema_ops::view_query_uses_field(&filter, &field.id)
            || predicate
                .search
                .as_ref()
                .is_some_and(|s| s.fields.contains(&field.id));
        if referenced {
            expressions.insert(
                field.id.clone(),
                schema.value_expression(table, field, fields, uses_today)?,
            );
            field.field_type = schema.logical_type(field)?;
        }
    }
    eidos_file_core::query::compile_derived_predicates(conn, &typed, &predicate, &expressions)
        .map_err(RuntimeErrorPayload::from_core)
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn execute_aggregate(
    conn: &Connection,
    file_id: &str,
    revision: &str,
    table: &TableMeta,
    fields: &[FieldMeta],
    schema: &crate::service::CachedSchema,
    query: Option<&RowQuery>,
    items: &[AggregateItem],
    today_date: Option<&str>,
) -> RuntimeResult<AggregateResponse> {
    let mut typed = fields.to_vec();
    for field in &mut typed {
        field.field_type = schema.logical_type(field)?;
    }
    let field_by_id: HashMap<&str, &FieldMeta> = typed.iter().map(|f| (f.id.as_str(), f)).collect();
    let table_sql =
        quote_identifier(&table.physical_name).map_err(RuntimeErrorPayload::from_core)?;

    let mut uses_today = false;
    let (where_clause, base_params) = if let Some(q) = query {
        let compiled = compile_predicates(conn, table, fields, schema, q, &mut uses_today)?;
        (compiled.where_sql, compiled.params)
    } else {
        (String::new(), Vec::new())
    };
    let where_sql = if where_clause.is_empty() {
        String::new()
    } else {
        format!(" {where_clause}")
    };

    // Fast path: combine all scalar aggregates into a SINGLE SQL pass!
    let mut scalar_exprs: Vec<String> = Vec::new();
    enum ScalarSlot<'a> {
        CountAll {
            key: String,
            col_idx: usize,
        },
        Count {
            key: String,
            col_idx: usize,
        },
        DistinctCount {
            key: String,
            col_idx: usize,
        },
        Sum {
            key: String,
            field: &'a FieldMeta,
            col_idx: usize,
        },
        Average {
            key: String,
            col_idx: usize,
        },
        Min {
            key: String,
            field: &'a FieldMeta,
            col_idx: usize,
        },
        Max {
            key: String,
            field: &'a FieldMeta,
            col_idx: usize,
        },
        Stats {
            key: String,
            field: &'a FieldMeta,
            start_col: usize,
        },
        DistinctValues {
            key: String,
            field: &'a FieldMeta,
            expr: String,
            limit: usize,
        },
    }

    let mut slots: Vec<ScalarSlot<'_>> = Vec::with_capacity(items.len());

    for item in items {
        match item {
            AggregateItem::CountAll { key } => {
                let col_idx = scalar_exprs.len();
                scalar_exprs.push("COUNT(*)".into());
                slots.push(ScalarSlot::CountAll {
                    key: key.clone(),
                    col_idx,
                });
            }
            AggregateItem::Count { key, field_id } => {
                let field = *field_by_id.get(field_id.as_str()).ok_or_else(|| {
                    RuntimeErrorPayload::new("not-found", format!("Field {field_id}"))
                })?;
                let expr = schema.value_expression(table, field, fields, &mut uses_today)?;
                let col_idx = scalar_exprs.len();
                scalar_exprs.push(format!("COUNT({expr})"));
                slots.push(ScalarSlot::Count {
                    key: key.clone(),
                    col_idx,
                });
            }
            AggregateItem::DistinctCount { key, field_id } => {
                let field = *field_by_id.get(field_id.as_str()).ok_or_else(|| {
                    RuntimeErrorPayload::new("not-found", format!("Field {field_id}"))
                })?;
                let expr = schema.value_expression(table, field, fields, &mut uses_today)?;
                let col_idx = scalar_exprs.len();
                scalar_exprs.push(format!("COUNT(DISTINCT {expr})"));
                slots.push(ScalarSlot::DistinctCount {
                    key: key.clone(),
                    col_idx,
                });
            }
            AggregateItem::Sum { key, field_id } => {
                let field = *field_by_id.get(field_id.as_str()).ok_or_else(|| {
                    RuntimeErrorPayload::new("not-found", format!("Field {field_id}"))
                })?;
                let expr = schema.value_expression(table, field, fields, &mut uses_today)?;
                let col_idx = scalar_exprs.len();
                scalar_exprs.push(format!("SUM({expr})"));
                slots.push(ScalarSlot::Sum {
                    key: key.clone(),
                    field,
                    col_idx,
                });
            }
            AggregateItem::Average { key, field_id } => {
                let field = *field_by_id.get(field_id.as_str()).ok_or_else(|| {
                    RuntimeErrorPayload::new("not-found", format!("Field {field_id}"))
                })?;
                let expr = schema.value_expression(table, field, fields, &mut uses_today)?;
                let col_idx = scalar_exprs.len();
                scalar_exprs.push(format!("AVG({expr})"));
                slots.push(ScalarSlot::Average {
                    key: key.clone(),
                    col_idx,
                });
            }
            AggregateItem::Min { key, field_id } => {
                let field = *field_by_id.get(field_id.as_str()).ok_or_else(|| {
                    RuntimeErrorPayload::new("not-found", format!("Field {field_id}"))
                })?;
                let expr = schema.value_expression(table, field, fields, &mut uses_today)?;
                let col_idx = scalar_exprs.len();
                scalar_exprs.push(format!("MIN({expr})"));
                slots.push(ScalarSlot::Min {
                    key: key.clone(),
                    field,
                    col_idx,
                });
            }
            AggregateItem::Max { key, field_id } => {
                let field = *field_by_id.get(field_id.as_str()).ok_or_else(|| {
                    RuntimeErrorPayload::new("not-found", format!("Field {field_id}"))
                })?;
                let expr = schema.value_expression(table, field, fields, &mut uses_today)?;
                let col_idx = scalar_exprs.len();
                scalar_exprs.push(format!("MAX({expr})"));
                slots.push(ScalarSlot::Max {
                    key: key.clone(),
                    field,
                    col_idx,
                });
            }
            AggregateItem::Statistics { key, field_id } => {
                let field = *field_by_id.get(field_id.as_str()).ok_or_else(|| {
                    RuntimeErrorPayload::new("not-found", format!("Field {field_id}"))
                })?;
                let expr = schema.value_expression(table, field, fields, &mut uses_today)?;
                let start_col = scalar_exprs.len();
                scalar_exprs.push("COUNT(*)".into());
                scalar_exprs.push(format!("COUNT({expr})"));
                scalar_exprs.push(format!("COUNT(DISTINCT {expr})"));
                scalar_exprs.push(format!("MIN({expr})"));
                scalar_exprs.push(format!("MAX({expr})"));
                if matches!(field.field_type, FieldType::Integer | FieldType::Number) {
                    scalar_exprs.push(format!("SUM({expr})"));
                    scalar_exprs.push(format!("AVG({expr})"));
                } else {
                    scalar_exprs.push("NULL".into());
                    scalar_exprs.push("NULL".into());
                }
                slots.push(ScalarSlot::Stats {
                    key: key.clone(),
                    field,
                    start_col,
                });
            }
            AggregateItem::DistinctValues {
                key,
                field_id,
                limit,
            } => {
                let field = *field_by_id.get(field_id.as_str()).ok_or_else(|| {
                    RuntimeErrorPayload::new("not-found", format!("Field {field_id}"))
                })?;
                let expr = schema.value_expression(table, field, fields, &mut uses_today)?;
                slots.push(ScalarSlot::DistinctValues {
                    key: key.clone(),
                    field,
                    expr,
                    limit: *limit,
                });
            }
        }
    }

    let mut params = Vec::new();
    let cte = if uses_today {
        let day = today_date.unwrap_or("1970-01-01");
        params.push(SqlValue::Text(day.to_string()));
        format!("WITH {FORMULA_CALENDAR_CTE} ")
    } else {
        String::new()
    };
    params.extend(base_params.clone());

    let scalar_values: Vec<SqlValue> = if !scalar_exprs.is_empty() {
        let sql = format!(
            "{cte}SELECT {} FROM {table_sql}{where_sql}",
            scalar_exprs.join(", ")
        );
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
        let count = scalar_exprs.len();
        stmt.query_row(params_from_iter(params.iter()), |row| {
            let mut vals = Vec::with_capacity(count);
            for i in 0..count {
                vals.push(row.get::<_, SqlValue>(i)?);
            }
            Ok(vals)
        })
        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?
    } else {
        Vec::new()
    };

    let mut results = Vec::with_capacity(slots.len());
    for slot in slots {
        match slot {
            ScalarSlot::CountAll { key, col_idx }
            | ScalarSlot::Count { key, col_idx }
            | ScalarSlot::DistinctCount { key, col_idx } => {
                let n = match &scalar_values[col_idx] {
                    SqlValue::Integer(i) => *i,
                    _ => 0,
                };
                results.push(AggregateResult::Value {
                    key,
                    value: JsonValue::String(n.to_string()),
                });
            }
            ScalarSlot::Sum {
                key,
                field,
                col_idx,
            } => {
                let v = match &scalar_values[col_idx] {
                    SqlValue::Null => JsonValue::Null,
                    SqlValue::Integer(i) => {
                        if field.field_type == FieldType::Integer {
                            JsonValue::String(i.to_string())
                        } else {
                            serde_json::json!(*i as f64)
                        }
                    }
                    SqlValue::Real(f) => serde_json::json!(if *f == 0.0 { 0.0 } else { *f }),
                    other => sql_value_to_logical(other.clone(), field),
                };
                results.push(AggregateResult::Value { key, value: v });
            }
            ScalarSlot::Average { key, col_idx } => {
                let v = match &scalar_values[col_idx] {
                    SqlValue::Null => JsonValue::Null,
                    SqlValue::Real(f) => serde_json::json!(if *f == 0.0 { 0.0 } else { *f }),
                    SqlValue::Integer(i) => serde_json::json!(*i as f64),
                    _ => JsonValue::Null,
                };
                results.push(AggregateResult::Value { key, value: v });
            }
            ScalarSlot::Min {
                key,
                field,
                col_idx,
            }
            | ScalarSlot::Max {
                key,
                field,
                col_idx,
            } => {
                results.push(AggregateResult::Value {
                    key,
                    value: sql_value_to_logical(scalar_values[col_idx].clone(), field),
                });
            }
            ScalarSlot::Stats {
                key,
                field,
                start_col,
            } => {
                let total = match &scalar_values[start_col] {
                    SqlValue::Integer(i) => *i,
                    _ => 0,
                };
                let non_null = match &scalar_values[start_col + 1] {
                    SqlValue::Integer(i) => *i,
                    _ => 0,
                };
                let distinct = match &scalar_values[start_col + 2] {
                    SqlValue::Integer(i) => *i,
                    _ => 0,
                };
                let min = Some(sql_value_to_logical(
                    scalar_values[start_col + 3].clone(),
                    field,
                ));
                let max = Some(sql_value_to_logical(
                    scalar_values[start_col + 4].clone(),
                    field,
                ));
                let is_num = matches!(field.field_type, FieldType::Integer | FieldType::Number);
                let sum = if is_num {
                    Some(sql_value_to_logical(
                        scalar_values[start_col + 5].clone(),
                        field,
                    ))
                } else {
                    None
                };
                let average = if is_num {
                    let avg = match &scalar_values[start_col + 6] {
                        SqlValue::Real(f) => Some(*f),
                        SqlValue::Integer(i) => Some(*i as f64),
                        _ => None,
                    };
                    Some(avg)
                } else {
                    None
                };
                results.push(AggregateResult::Statistics {
                    key,
                    statistics: ColumnStatistics {
                        rows: total.to_string(),
                        nulls: (total - non_null).to_string(),
                        distinct: distinct.to_string(),
                        min,
                        max,
                        sum,
                        average,
                    },
                });
            }
            ScalarSlot::DistinctValues {
                key,
                field,
                expr,
                limit,
            } => {
                let sql = format!(
                    "{cte}SELECT DISTINCT {expr} FROM {table_sql}{where_sql} ORDER BY {expr} ASC LIMIT {}",
                    limit.saturating_add(1)
                );
                let mut stmt = conn
                    .prepare(&sql)
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                let mut rows = stmt
                    .query(params_from_iter(params.iter()))
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                let mut vals = Vec::new();
                while let Some(r) = rows
                    .next()
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?
                {
                    let v = r
                        .get::<_, SqlValue>(0)
                        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                    if !matches!(v, SqlValue::Null) {
                        vals.push(sql_value_to_logical(v, field));
                    }
                }
                let truncated = vals.len() > limit;
                vals.truncate(limit);
                results.push(AggregateResult::DistinctValues {
                    key,
                    values: vals,
                    truncated,
                });
            }
        }
    }

    Ok(AggregateResponse {
        reference_instant: None,
        file_id: file_id.to_string(),
        table_id: table.id.clone(),
        revision: revision.to_string(),
        results,
    })
}
