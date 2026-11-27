//! Zero-JSON, zero-`serde_json::Value` columnar page representation designed
//! for direct consumption by NSH's columnar `DataGridRows` (`texts`, `numbers`,
//! `bools`, `values`).

use std::collections::HashMap;

use eidos_file_core::model::{
    FieldMeta, FieldType, FormulaFieldMeta, LookupAggregate, LookupFieldMeta, RelationDirection,
    RelationFieldMeta, TableMeta,
};
use eidos_file_core::naming::quote_identifier;
use eidos_file_core::query::{NullsOrder, RowQuery, SortDirection, compile_query};
use rusqlite::types::ValueRef;
use rusqlite::{Connection, params_from_iter};
use serde_json::Value as JsonValue;

use crate::aggregate::field_sql_expr;
use crate::contract::{ProjectedRow, RuntimeErrorPayload, RuntimeResult};
use crate::formula::{FORMULA_CALENDAR_CTE, compile_formula_expression};
use crate::lookup::populate_virtual_columns;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GridCellKind {
    Text,
    Number,
    Boolean,
    Bubble,
    Uri,
    Tags,
}

#[derive(Debug, Clone)]
pub struct ColumnarColumnMeta {
    pub field_id: String,
    pub name: String,
    pub field_type: FieldType,
    pub cell_kind: GridCellKind,
    pub writable: bool,
}

#[derive(Debug, Clone)]
pub enum ColumnarColumn {
    Texts(Vec<Option<String>>),
    Numbers(Vec<Option<f64>>),
    Bools(Vec<Option<bool>>),
    Tags(Vec<Vec<String>>),
}

#[derive(Debug, Clone)]
pub struct ColumnarRowPage {
    pub file_id: String,
    pub table_id: String,
    pub revision: String,
    pub row_ids: Vec<String>,
    pub columns: Vec<ColumnarColumnMeta>,
    pub data: Vec<ColumnarColumn>,
    pub offset: usize,
    pub has_more: bool,
}

pub fn field_cell_kind(
    field: &FieldMeta,
    all_fields: &[FieldMeta],
    formulas: &HashMap<String, FormulaFieldMeta>,
    lookups: &HashMap<String, LookupFieldMeta>,
) -> GridCellKind {
    match field.field_type {
        FieldType::Number | FieldType::Integer => GridCellKind::Number,
        FieldType::Checkbox => GridCellKind::Boolean,
        FieldType::Select => GridCellKind::Bubble,
        FieldType::MultiSelect | FieldType::Relation => GridCellKind::Tags,
        FieldType::Url => GridCellKind::Uri,
        FieldType::Formula => match formulas.get(&field.id).map(|f| f.result_type.as_str()) {
            Some("number" | "integer") => GridCellKind::Number,
            Some("checkbox") => GridCellKind::Boolean,
            Some("url") => GridCellKind::Uri,
            _ => GridCellKind::Text,
        },
        FieldType::Lookup => match lookups.get(&field.id) {
            Some(lk) => match lk.aggregate {
                LookupAggregate::Count | LookupAggregate::Sum | LookupAggregate::Average => {
                    GridCellKind::Number
                }
                LookupAggregate::Values => GridCellKind::Tags,
                LookupAggregate::First | LookupAggregate::Min | LookupAggregate::Max => {
                    match all_fields
                        .iter()
                        .find(|f| f.id == lk.target_field_id)
                        .map(|f| f.field_type)
                    {
                        Some(FieldType::Number | FieldType::Integer) => GridCellKind::Number,
                        Some(FieldType::Checkbox) => GridCellKind::Boolean,
                        Some(FieldType::Url) => GridCellKind::Uri,
                        _ => GridCellKind::Text,
                    }
                }
            },
            None => GridCellKind::Tags,
        },
        _ => GridCellKind::Text,
    }
}

#[allow(clippy::too_many_arguments)]
pub fn query_columnar_page(
    conn: &Connection,
    file_id: &str,
    revision: &str,
    table: &TableMeta,
    table_fields: &[FieldMeta],
    all_tables: &[TableMeta],
    all_fields: &[FieldMeta],
    formulas: &HashMap<String, FormulaFieldMeta>,
    relations: &HashMap<String, RelationFieldMeta>,
    lookups: &HashMap<String, LookupFieldMeta>,
    query: &RowQuery,
    field_ids: &[String],
    offset: usize,
    limit: usize,
    today_date: Option<&str>,
) -> RuntimeResult<ColumnarRowPage> {
    let by_id: HashMap<&str, &FieldMeta> =
        table_fields.iter().map(|f| (f.id.as_str(), f)).collect();

    let mut metas = Vec::with_capacity(field_ids.len());
    let mut selected = Vec::with_capacity(field_ids.len());
    let mut select_exprs = Vec::with_capacity(field_ids.len() + 1);
    select_exprs.push("\"_id\"".to_string());
    let mut uses_today = false;
    let mut has_virtual_cols = false;

    for fid in field_ids {
        let field = *by_id.get(fid.as_str()).ok_or_else(|| {
            RuntimeErrorPayload::new("not-found", format!("Field {fid} not found"))
        })?;
        let is_inverse_rel = field.field_type == FieldType::Relation
            && relations
                .get(&field.id)
                .is_some_and(|r| r.direction == RelationDirection::Inverse);
        if field.field_type == FieldType::Lookup || is_inverse_rel {
            has_virtual_cols = true;
        }
        let cell_kind = field_cell_kind(field, all_fields, formulas, lookups);
        let writable = field.system_role.is_none()
            && !matches!(field.field_type, FieldType::Formula | FieldType::Lookup)
            && !is_inverse_rel;
        metas.push(ColumnarColumnMeta {
            field_id: field.id.clone(),
            name: field.name.clone(),
            field_type: field.field_type,
            cell_kind,
            writable,
        });
        if field.field_type == FieldType::Formula {
            let def = formulas.get(&field.id).ok_or_else(|| {
                RuntimeErrorPayload::new("corrupt-file", format!("Missing formula {}", field.id))
            })?;
            let compiled = compile_formula_expression(
                &def.source_text,
                table_fields,
                formulas,
                Some(&field.id),
                None,
            )
            .map_err(|d| RuntimeErrorPayload::new(d.code, d.message.unwrap_or_default()))?;
            if compiled.uses_today {
                uses_today = true;
            }
            select_exprs.push(format!("({})", compiled.sql));
        } else if let Some(phys) = &field.physical_name {
            select_exprs.push(quote_identifier(phys).map_err(RuntimeErrorPayload::from_core)?);
        } else {
            select_exprs.push("NULL".into());
        }
        selected.push(field.clone());
    }

    let mut stored_where = query.clone();
    stored_where.sort = None;
    let compiled_where = compile_query(table, table_fields, &stored_where)
        .map_err(RuntimeErrorPayload::from_core)?;

    let mut order_terms = Vec::new();
    if let Some(sorts) = &query.sort {
        for s in sorts {
            let field = *by_id.get(s.field_id.as_str()).ok_or_else(|| {
                RuntimeErrorPayload::new(
                    "invalid-query",
                    format!("Unknown sort field {}", s.field_id),
                )
            })?;
            let expr = field_sql_expr(field, table_fields, formulas, &mut uses_today)?;
            let dir = match s.direction {
                SortDirection::Asc => "ASC",
                SortDirection::Desc => "DESC",
            };
            let nulls = match s.nulls {
                Some(NullsOrder::First) => "NULLS FIRST",
                Some(NullsOrder::Last) | None => "NULLS LAST",
            };
            order_terms.push(format!("{expr} {dir} {nulls}"));
        }
    }
    order_terms.push("\"_id\" ASC".to_string());

    let table_sql =
        quote_identifier(&table.physical_name).map_err(RuntimeErrorPayload::from_core)?;
    let where_sql = if compiled_where.where_sql.is_empty() {
        String::new()
    } else {
        format!(" {}", compiled_where.where_sql)
    };

    let mut params = Vec::new();
    let cte = if uses_today {
        params.push(rusqlite::types::Value::Text(
            today_date.unwrap_or("1970-01-01").to_string(),
        ));
        format!("WITH {FORMULA_CALENDAR_CTE} ")
    } else {
        String::new()
    };
    params.extend(compiled_where.params);

    let limit = limit.max(1);
    let sql = format!(
        "{cte}SELECT {} FROM {table_sql}{where_sql} ORDER BY {} LIMIT {} OFFSET {offset}",
        select_exprs.join(", "),
        order_terms.join(", "),
        limit + 1
    );

    let mut row_ids = Vec::with_capacity(limit);
    let mut data: Vec<ColumnarColumn> = metas
        .iter()
        .map(|m| match m.cell_kind {
            GridCellKind::Number => ColumnarColumn::Numbers(Vec::with_capacity(limit)),
            GridCellKind::Boolean => ColumnarColumn::Bools(Vec::with_capacity(limit)),
            GridCellKind::Tags => ColumnarColumn::Tags(Vec::with_capacity(limit)),
            _ => ColumnarColumn::Texts(Vec::with_capacity(limit)),
        })
        .collect();

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
    let mut rows = stmt
        .query(params_from_iter(params.iter()))
        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;

    let mut has_more = false;
    while let Some(r) = rows
        .next()
        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?
    {
        if row_ids.len() == limit {
            has_more = true;
            break;
        }
        let id = r
            .get::<_, String>(0)
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
        row_ids.push(id);

        for (i, col) in data.iter_mut().enumerate() {
            let val = r
                .get_ref(i + 1)
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
            match col {
                ColumnarColumn::Numbers(vec) => {
                    let n = match val {
                        ValueRef::Real(f) if f.is_finite() => Some(f),
                        ValueRef::Integer(k) => Some(k as f64),
                        ValueRef::Text(bytes) => std::str::from_utf8(bytes)
                            .ok()
                            .and_then(|s| s.parse::<f64>().ok())
                            .filter(|f| f.is_finite()),
                        _ => None,
                    };
                    vec.push(n);
                }
                ColumnarColumn::Bools(vec) => {
                    let b = match val {
                        ValueRef::Integer(k) => Some(k != 0),
                        ValueRef::Real(f) => Some(f != 0.0),
                        _ => None,
                    };
                    vec.push(b);
                }
                ColumnarColumn::Tags(vec) => {
                    let tags = match val {
                        ValueRef::Text(bytes) => std::str::from_utf8(bytes)
                            .ok()
                            .and_then(|s| serde_json::from_str::<Vec<String>>(s).ok())
                            .unwrap_or_default(),
                        _ => Vec::new(),
                    };
                    vec.push(tags);
                }
                ColumnarColumn::Texts(vec) => {
                    let s = match val {
                        ValueRef::Null => None,
                        ValueRef::Text(bytes) => Some(String::from_utf8_lossy(bytes).into_owned()),
                        ValueRef::Integer(k) => Some(k.to_string()),
                        ValueRef::Real(f) => Some(f.to_string()),
                        ValueRef::Blob(_) => None,
                    };
                    vec.push(s);
                }
            }
        }
    }
    drop(rows);
    drop(stmt);

    // Populate any virtual lookup / inverse-relation columns on this viewport page
    if has_virtual_cols && !row_ids.is_empty() {
        let mut virtual_rows: Vec<ProjectedRow> = row_ids
            .iter()
            .map(|id| ProjectedRow {
                id: id.clone(),
                values: vec![JsonValue::Null; selected.len()],
                resolved_relations: None,
            })
            .collect();
        populate_virtual_columns(
            conn,
            &mut virtual_rows,
            table,
            &selected,
            all_tables,
            all_fields,
            relations,
            lookups,
            formulas,
            today_date,
        )?;
        for (col_idx, field) in selected.iter().enumerate() {
            let is_virtual = field.field_type == FieldType::Lookup
                || (field.field_type == FieldType::Relation
                    && relations
                        .get(&field.id)
                        .is_some_and(|r| r.direction == RelationDirection::Inverse));
            if !is_virtual {
                continue;
            }
            match &mut data[col_idx] {
                ColumnarColumn::Numbers(vec) => {
                    for (r_idx, pr) in virtual_rows.iter().enumerate() {
                        vec[r_idx] = match &pr.values[col_idx] {
                            JsonValue::Number(n) => n.as_f64().filter(|f| f.is_finite()),
                            JsonValue::String(s) => s.parse::<f64>().ok().filter(|f| f.is_finite()),
                            _ => None,
                        };
                    }
                }
                ColumnarColumn::Bools(vec) => {
                    for (r_idx, pr) in virtual_rows.iter().enumerate() {
                        vec[r_idx] = pr.values[col_idx].as_bool();
                    }
                }
                ColumnarColumn::Tags(vec) => {
                    for (r_idx, pr) in virtual_rows.iter().enumerate() {
                        vec[r_idx] = match &pr.values[col_idx] {
                            JsonValue::Array(arr) => arr
                                .iter()
                                .map(|v| match v {
                                    JsonValue::String(s) => s.clone(),
                                    other => other.to_string(),
                                })
                                .collect(),
                            JsonValue::Null => Vec::new(),
                            JsonValue::String(s) => vec![s.clone()],
                            other => vec![other.to_string()],
                        };
                    }
                }
                ColumnarColumn::Texts(vec) => {
                    for (r_idx, pr) in virtual_rows.iter().enumerate() {
                        vec[r_idx] = match &pr.values[col_idx] {
                            JsonValue::Null => None,
                            JsonValue::String(s) => Some(s.clone()),
                            other => Some(other.to_string()),
                        };
                    }
                }
            }
        }
    }

    Ok(ColumnarRowPage {
        file_id: file_id.to_string(),
        table_id: table.id.clone(),
        revision: revision.to_string(),
        row_ids,
        columns: metas,
        data,
        offset,
        has_more,
    })
}
