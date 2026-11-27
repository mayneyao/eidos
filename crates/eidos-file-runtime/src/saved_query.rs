//! Decode the field-name and operator keys written by earlier View editors.
//! Public Runtime query documents pass through without modification.
use crate::contract::{RuntimeErrorPayload, RuntimeResult};
use serde_json::{Value, json};

pub(crate) fn normalize(query: &mut Value, is_list: impl Fn(&str) -> bool) -> RuntimeResult<()> {
    if let Some(filter) = query.get_mut("filter") {
        normalize_filter(filter, &is_list)?;
    }
    if let Some(sorts) = query.get_mut("sort").and_then(Value::as_array_mut) {
        for sort in sorts.iter_mut().filter_map(Value::as_object_mut) {
            if let Some(field) = sort.remove("field") {
                sort.insert("fieldId".into(), field);
                sort.entry("direction").or_insert(json!("asc"));
                sort.entry("nulls").or_insert(json!("last"));
            }
        }
    }
    Ok(())
}

fn invalid() -> RuntimeErrorPayload {
    RuntimeErrorPayload::new("corrupt-file", "Invalid stored View filter")
}

fn normalize_filter(node: &mut Value, is_list: &impl Fn(&str) -> bool) -> RuntimeResult<()> {
    if let Some(args) = node.get_mut("args").and_then(Value::as_array_mut) {
        for child in args {
            normalize_filter(child, is_list)?;
        }
        return Ok(());
    }
    if let Some(arg) = node.get_mut("arg") {
        return normalize_filter(arg, is_list);
    }
    let Some(field) = node["field"].as_str() else {
        return Ok(());
    };
    let op = node["op"].as_str().ok_or_else(invalid)?;
    let list = is_list(field);
    let value = &node["value"];
    let values = value
        .as_array()
        .cloned()
        .unwrap_or_else(|| vec![value.clone()]);
    let scalar = values.first().unwrap_or(&Value::Null);
    match op {
        "less-than"
        | "less-than-or-equal"
        | "greater-than"
        | "greater-than-or-equal"
        | "contains"
        | "not-contains"
        | "starts-with"
        | "ends-with"
            if scalar.is_null() =>
        {
            return Err(invalid());
        }
        "is-any-of" | "is-all-of" | "is-none-of" | "is-between"
            if values.iter().any(Value::is_null) =>
        {
            return Err(invalid());
        }
        _ => {}
    }
    let leaf = |operator: &str| json!({"fieldId": field, "op": operator});
    let operand =
        |operator: &str, val: &Value| json!({"fieldId": field, "op": operator, "value": val});
    let membership =
        || json!({"fieldId": field, "op": if list {"has-any"} else {"in"}, "values": values});
    let result = match op {
        "equals" | "not-equals" => {
            let v = if list && value.is_array() {
                value
            } else {
                scalar
            };
            if v.is_null() {
                leaf(if op == "equals" {
                    "is-null"
                } else {
                    "is-not-null"
                })
            } else {
                operand(if op == "equals" { "eq" } else { "ne" }, v)
            }
        }
        "is-empty" | "is-not-empty" if list => {
            operand(if op == "is-empty" { "eq" } else { "ne" }, &json!([]))
        }
        "is-empty" => leaf("is-null"),
        "is-not-empty" => leaf("is-not-null"),
        "less-than" => operand("lt", scalar),
        "less-than-or-equal" => operand("lte", scalar),
        "greater-than" => operand("gt", scalar),
        "greater-than-or-equal" => operand("gte", scalar),
        "is-between" if values.len() == 2 => {
            json!({"fieldId":field,"op":"between","lower":values[0],"upper":values[1]})
        }
        "contains" | "not-contains" => {
            let condition = if list {
                membership()
            } else {
                operand("contains", scalar)
            };
            if op == "not-contains" {
                json!({"op":"not","arg":condition})
            } else {
                condition
            }
        }
        "starts-with" | "ends-with" => operand(op, scalar),
        "is-any-of" => membership(),
        "is-all-of" => json!({"fieldId":field,"op":"has-all","values":values}),
        "is-none-of" => json!({"op":"not","arg":membership()}),
        "is-on-calendar-day"
        | "is-in-calendar-period"
        | "is-in-calendar-window"
        | "is-relative-to-today" => {
            let mut result = value.as_object().cloned().ok_or_else(invalid)?;
            let operator = match op {
                "is-on-calendar-day" => "calendar-day",
                "is-in-calendar-period" => "calendar-period",
                "is-in-calendar-window" => "calendar-window",
                _ => "relative-date",
            };
            result.insert("op".into(), json!(operator));
            result.insert("fieldId".into(), json!(field));
            Value::Object(result)
        }
        _ => return Err(invalid()),
    };
    *node = result;
    Ok(())
}
