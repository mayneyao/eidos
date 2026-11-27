//! Infer ordinary-create values from a bounded disjunction of filter branches.
use crate::contract::{RuntimeErrorPayload, RuntimeResult};
use eidos_file_core::model::{FieldMeta, FieldType, TableMeta};
use eidos_file_core::naming::quote_identifier;
use eidos_file_core::query::{FilterNode, RowQuery, compile_query};
use eidos_file_core::values::coerce_value;
use rusqlite::{Connection, params_from_iter};
use serde_json::{Map, Value, json};

type Values = Map<String, Value>;

fn branches(node: &FilterNode) -> Option<Vec<Vec<FilterNode>>> {
    match node {
        FilterNode::Not { .. } => None,
        FilterNode::And { args } | FilterNode::Or { args } => {
            let conjunction = matches!(node, FilterNode::And { .. });
            let mut result = if conjunction { vec![vec![]] } else { vec![] };
            for child in args {
                let next = branches(child)?;
                if conjunction {
                    if result.len() * next.len() > 32 {
                        return None;
                    }
                    result = result
                        .iter()
                        .flat_map(|a| next.iter().map(move |b| [a.as_slice(), b].concat()))
                        .collect();
                } else {
                    if result.len() + next.len() > 32 {
                        return None;
                    }
                    result.extend(next);
                }
            }
            Some(result)
        }
        FilterNode::In { field_id, values } if values.len() <= 32 => Some(
            values
                .iter()
                .map(|value| {
                    vec![FilterNode::Eq {
                        field_id: field_id.clone(),
                        value: value.clone(),
                    }]
                })
                .collect(),
        ),
        FilterNode::In { .. } => None,
        leaf => Some(vec![vec![leaf.clone()]]),
    }
}

fn stepped(field: &FieldMeta, value: &Value, up: bool) -> Vec<Value> {
    let d: i64 = if up { 1 } else { -1 };
    match field.field_type {
        FieldType::Integer => value
            .as_str()
            .and_then(|s| s.parse::<i64>().ok())
            .and_then(|v| v.checked_add(d))
            .map(|v| json!(v.to_string()))
            .into_iter()
            .collect(),
        FieldType::Number => value
            .as_f64()
            .into_iter()
            .flat_map(|v| [v + d as f64, if up { v.next_up() } else { v.next_down() }])
            .filter(|v| v.is_finite())
            .map(|v| json!(v))
            .collect(),
        FieldType::Date => value
            .as_str()
            .and_then(|s| s.parse::<jiff::civil::Date>().ok())
            .and_then(|v| if up { v.tomorrow() } else { v.yesterday() }.ok())
            .map(|v| json!(v.to_string()))
            .into_iter()
            .collect(),
        FieldType::Datetime => value
            .as_str()
            .and_then(|s| s.parse::<jiff::Timestamp>().ok())
            .and_then(|v| v.checked_add(jiff::SignedDuration::from_millis(d)).ok())
            .map(|v| json!(format!("{v:.3}")))
            .into_iter()
            .collect(),
        _ => vec![],
    }
}

fn seeds(field: &FieldMeta, rules: &[FilterNode], settings: &Value) -> Vec<Value> {
    use FilterNode::*;
    let options: Vec<_> = settings["options"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|o| o["name"].as_str().or(o.as_str()))
        .collect();
    let mut result = vec![];
    let mut members = vec![];
    let (mut prefix, mut suffix, mut fragments) = ("", "", vec![]);
    let mut option_match = false;
    let mut checkbox_match = false;
    for rule in rules {
        match rule {
            Eq { value, .. } => {
                result.push(value.clone());
                option_match = true;
                checkbox_match = true;
            }
            Ne { .. } => checkbox_match = true,
            IsNull { .. } => result.push(Value::Null),
            Gte { value, .. } | Lte { value, .. } => result.push(value.clone()),
            Gt { value, .. } | Lt { value, .. } => {
                result.extend(stepped(field, value, matches!(rule, Gt { .. })))
            }
            Between { lower, upper, .. } => result.extend([lower.clone(), upper.clone()]),
            HasAll { values, .. } | HasAny { values, .. }
                if matches!(rule, HasAll { .. }) || values.len() == 1 =>
            {
                for value in values {
                    if !members.contains(value) {
                        members.push(value.clone());
                    }
                }
            }
            Contains { value, .. } => {
                option_match = true;
                fragments.push(value.as_str());
            }
            StartsWith { value, .. } => {
                option_match = true;
                if value.len() > prefix.len() {
                    prefix = value;
                }
            }
            EndsWith { value, .. } => {
                option_match = true;
                if value.len() > suffix.len() {
                    suffix = value;
                }
            }
            _ => {}
        }
    }
    match field.field_type {
        FieldType::Text | FieldType::Url
            if !prefix.is_empty() || !suffix.is_empty() || !fragments.is_empty() =>
        {
            let mut text = prefix.to_owned();
            for f in fragments {
                if !text.to_lowercase().contains(&f.to_lowercase()) {
                    text.push_str(f);
                }
            }
            if !text.to_lowercase().ends_with(&suffix.to_lowercase()) {
                text.push_str(suffix);
            }
            result.push(json!(text));
        }
        FieldType::Checkbox if checkbox_match => result.extend([json!(false), json!(true)]),
        FieldType::MultiSelect
            if !members.is_empty()
                && members
                    .iter()
                    .all(|v| v.as_str().is_some_and(|s| options.contains(&s))) =>
        {
            result.push(Value::Array(members))
        }
        FieldType::Select => {
            if option_match {
                result.extend(options.iter().map(|s| json!(s)));
            }
            result.retain(|v| v.is_null() || v.as_str().is_some_and(|s| options.contains(&s)));
        }
        FieldType::Relation | FieldType::File => {
            result.retain(|v| v.is_null() || v.as_array().is_some_and(Vec::is_empty))
        }
        _ => {}
    }
    result
}

pub fn infer(
    conn: &Connection,
    table: &TableMeta,
    fields: &[FieldMeta],
    query: &RowQuery,
    explicit: &Values,
    defaults: &Values,
) -> RuntimeResult<Values> {
    compile_query(table, fields, query).map_err(RuntimeErrorPayload::from_core)?;
    let Some(branches) = query.filter.as_ref().and_then(branches) else {
        return Ok(Values::new());
    };
    let mut common: Option<Values> = None;
    let mut evaluations = 0;
    for branch in branches {
        let mut plan = Values::new();
        let mut excluded = false;
        let mut grouped = std::collections::HashMap::<String, Vec<FilterNode>>::new();
        for rule in branch {
            let wire = serde_json::to_value(&rule)
                .map_err(|e| RuntimeErrorPayload::new("invalid-query", e.to_string()))?;
            if let Some(id) = wire["fieldId"].as_str() {
                grouped.entry(id.to_owned()).or_default().push(rule);
            }
        }
        for field in fields {
            let Some(rules) = grouped.remove(&field.id) else {
                continue;
            };
            let Some(physical) = field.physical_name.as_deref() else {
                continue;
            };
            let settings: Value = serde_json::from_str(&field.settings_json)
                .map_err(|e| RuntimeErrorPayload::new("corrupt-file", e.to_string()))?;
            let compiled = compile_query(
                table,
                fields,
                &RowQuery {
                    filter: Some(FilterNode::And {
                        args: rules.clone(),
                    }),
                    ..Default::default()
                },
            )
            .map_err(RuntimeErrorPayload::from_core)?;
            let affinity = match field.field_type {
                FieldType::Integer | FieldType::Checkbox => "INTEGER",
                FieldType::Number => "REAL",
                _ => "TEXT",
            };
            let col = quote_identifier(physical).map_err(RuntimeErrorPayload::from_core)?;
            let sql = format!(
                "SELECT EXISTS(SELECT 1 FROM (SELECT CAST(? AS {affinity}) AS {col}) {})",
                compiled.where_sql
            );
            let mut accepts = |v: &Value| -> RuntimeResult<bool> {
                let Ok(value) = coerce_value(field, v) else {
                    return Ok(false);
                };
                evaluations += 1;
                if evaluations > 2048 {
                    return Ok(false);
                }
                conn.query_row(
                    &sql,
                    params_from_iter(std::iter::once(&value).chain(&compiled.params)),
                    |r| r.get(0),
                )
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))
            };
            if let Some(value) = explicit.get(&field.id) {
                excluded |= !accepts(value)?;
                continue;
            }
            if field.system_role.is_some()
                || settings["readOnly"] == true
                || settings["isSystem"] == true
                || settings["writable"] == false
            {
                continue;
            }
            let base = defaults
                .get(&field.id)
                .cloned()
                .unwrap_or_else(|| match field.field_type {
                    FieldType::Checkbox => json!(false),
                    FieldType::Select => settings["defaultOption"].clone(),
                    FieldType::Relation | FieldType::File | FieldType::MultiSelect
                        if !field.nullable =>
                    {
                        json!([])
                    }
                    _ => Value::Null,
                });
            if accepts(&base)? {
                plan.insert(field.id.clone(), base);
                continue;
            }
            let mut matched = None;
            for candidate in seeds(field, &rules, &settings) {
                if accepts(&candidate)? {
                    if matched.as_ref().is_some_and(|v| v != &candidate)
                        && field.field_type == FieldType::Select
                    {
                        matched = None;
                        break;
                    }
                    matched = Some(candidate);
                    if field.field_type != FieldType::Select {
                        break;
                    }
                }
            }
            if let Some(value) = matched {
                plan.insert(field.id.clone(), value);
            }
        }
        if evaluations > 2048 {
            return Ok(Values::new());
        }
        if !excluded {
            if let Some(common) = &mut common {
                common.retain(|k, v| plan.get(k) == Some(v));
            } else {
                common = Some(plan);
            }
        }
    }
    Ok(common.unwrap_or_default())
}
