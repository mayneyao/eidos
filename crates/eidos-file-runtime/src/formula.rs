//! Eidos File 1.0 Formula SQL compiler (`sqlite-3.45` profile).
//!
//! Parses Eidos formula source text, resolves double-quoted field references
//! against table fields (including recursive formula dependencies with cycle
//! detection), validates allowed SQLite scalar functions + `TODAY()`, and
//! emits a safe SQLite SQL expression.

use std::collections::{HashMap, HashSet};

use eidos_file_core::model::{FieldMeta, FieldType, FormulaFieldMeta};
use eidos_file_core::naming::{quote_identifier, sqlite_nocase};

use crate::contract::{RuntimeDiagnostic, RuntimeErrorPayload, RuntimeResult};

pub const FORMULA_CALENDAR_CTE: &str = r#""__eidos_formula_calendar"("today") AS (VALUES (?))"#;

const ALLOWED_FUNCTIONS: &[&str] = &[
    "abs",
    "ceil",
    "ceiling",
    "char",
    "coalesce",
    "concat",
    "concat_ws",
    "date",
    "datetime",
    "floor",
    "format",
    "glob",
    "hex",
    "ifnull",
    "iif",
    "instr",
    "julianday",
    "length",
    "like",
    "lower",
    "ltrim",
    "max",
    "min",
    "nullif",
    "octet_length",
    "printf",
    "quote",
    "replace",
    "round",
    "rtrim",
    "sign",
    "strftime",
    "substr",
    "substring",
    "time",
    "timediff",
    "today",
    "trim",
    "typeof",
    "unicode",
    "unixepoch",
    "upper",
];

const ALLOWED_KEYWORDS: &[&str] = &[
    "and", "as", "between", "case", "cast", "else", "end", "escape", "false", "glob", "in", "is",
    "like", "not", "null", "or", "then", "true", "when", "integer", "real", "text", "numeric",
];

#[derive(Debug, Clone)]
pub struct CompiledFormula {
    pub sql: String,
    pub dependency_field_ids: Vec<String>,
    pub uses_today: bool,
}

#[derive(Debug, Clone, PartialEq)]
enum Token {
    QuotedIdent(String),
    Ident(String),
    Number(String),
    StringLit(String),
    Symbol(String),
}

fn tokenize(source: &str) -> Result<Vec<Token>, String> {
    let bytes = source.as_bytes();
    let mut i = 0;
    let mut out = Vec::new();
    while i < bytes.len() {
        let b = bytes[i];
        if b.is_ascii_whitespace() {
            i += 1;
            continue;
        }
        // Reject SQL comments in formulas
        if (b == b'-' && i + 1 < bytes.len() && bytes[i + 1] == b'-')
            || (b == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'*')
        {
            return Err("SQL comments are not allowed in formulas".into());
        }
        if b == b';' {
            return Err("Semicolons are not allowed in formulas".into());
        }
        if b == b'"' {
            i += 1;
            let mut ident = String::new();
            let mut closed = false;
            while i < bytes.len() {
                if bytes[i] == b'"' {
                    if i + 1 < bytes.len() && bytes[i + 1] == b'"' {
                        ident.push('"');
                        i += 2;
                    } else {
                        i += 1;
                        closed = true;
                        break;
                    }
                } else {
                    let ch = source[i..].chars().next().unwrap();
                    ident.push(ch);
                    i += ch.len_utf8();
                }
            }
            if !closed {
                return Err("Unterminated quoted field reference".into());
            }
            out.push(Token::QuotedIdent(ident));
            continue;
        }
        if b == b'\'' {
            let start = i;
            i += 1;
            let mut closed = false;
            while i < bytes.len() {
                if bytes[i] == b'\'' {
                    if i + 1 < bytes.len() && bytes[i + 1] == b'\'' {
                        i += 2;
                    } else {
                        i += 1;
                        closed = true;
                        break;
                    }
                } else {
                    let ch = source[i..].chars().next().unwrap();
                    i += ch.len_utf8();
                }
            }
            if !closed {
                return Err("Unterminated string literal".into());
            }
            out.push(Token::StringLit(source[start..i].to_string()));
            continue;
        }
        if b.is_ascii_digit() || (b == b'.' && i + 1 < bytes.len() && bytes[i + 1].is_ascii_digit())
        {
            let start = i;
            while i < bytes.len()
                && (bytes[i].is_ascii_digit() || matches!(bytes[i], b'.' | b'e' | b'E'))
            {
                if matches!(bytes[i], b'e' | b'E')
                    && i + 1 < bytes.len()
                    && matches!(bytes[i + 1], b'+' | b'-')
                {
                    i += 2;
                } else {
                    i += 1;
                }
            }
            out.push(Token::Number(source[start..i].to_string()));
            continue;
        }
        if b.is_ascii_alphabetic() || b == b'_' {
            let start = i;
            while i < bytes.len() && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_') {
                i += 1;
            }
            out.push(Token::Ident(source[start..i].to_string()));
            continue;
        }
        // Multi-char operators
        if i + 1 < bytes.len() {
            let pair = &source[i..i + 2];
            if matches!(pair, "<=" | ">=" | "!=" | "<>" | "||") {
                out.push(Token::Symbol(pair.to_string()));
                i += 2;
                continue;
            }
        }
        if matches!(
            b,
            b'+' | b'-' | b'*' | b'/' | b'%' | b'(' | b')' | b',' | b'=' | b'<' | b'>'
        ) {
            out.push(Token::Symbol((b as char).to_string()));
            i += 1;
            continue;
        }
        return Err(format!("Unexpected character in formula at byte {i}"));
    }
    Ok(out)
}

#[allow(clippy::result_large_err)]
pub fn compile_formula_expression(
    source_text: &str,
    fields: &[FieldMeta],
    formula_defs: &HashMap<String, FormulaFieldMeta>,
    self_field_id: Option<&str>,
    table_alias: Option<&str>,
) -> std::result::Result<CompiledFormula, RuntimeDiagnostic> {
    let mut visiting = HashSet::new();
    if let Some(id) = self_field_id {
        visiting.insert(id.to_string());
    }
    compile_recursive(
        source_text,
        fields,
        formula_defs,
        &mut visiting,
        table_alias,
    )
}

#[allow(clippy::result_large_err)]
fn compile_recursive(
    source_text: &str,
    fields: &[FieldMeta],
    formula_defs: &HashMap<String, FormulaFieldMeta>,
    visiting: &mut HashSet<String>,
    table_alias: Option<&str>,
) -> std::result::Result<CompiledFormula, RuntimeDiagnostic> {
    if source_text.trim().is_empty() {
        return Err(RuntimeDiagnostic {
            code: "formula-parse-invalid".into(),
            severity: "error".into(),
            message: Some("Formula sourceText cannot be empty".into()),
            path: None,
            table_id: None,
            field_id: None,
            row_id: None,
        });
    }
    let tokens = tokenize(source_text).map_err(|msg| RuntimeDiagnostic {
        code: "formula-parse-invalid".into(),
        severity: "error".into(),
        message: Some(msg),
        path: None,
        table_id: None,
        field_id: None,
        row_id: None,
    })?;

    // Check balanced parentheses
    let mut depth: i32 = 0;
    for tok in &tokens {
        if let Token::Symbol(s) = tok {
            if s == "(" {
                depth += 1;
            } else if s == ")" {
                depth -= 1;
                if depth < 0 {
                    return Err(RuntimeDiagnostic {
                        code: "formula-parse-invalid".into(),
                        severity: "error".into(),
                        message: Some("Unmatched ')' in formula".into()),
                        path: None,
                        table_id: None,
                        field_id: None,
                        row_id: None,
                    });
                }
            }
        }
    }
    if depth != 0 {
        return Err(RuntimeDiagnostic {
            code: "formula-parse-invalid".into(),
            severity: "error".into(),
            message: Some("Unmatched '(' in formula".into()),
            path: None,
            table_id: None,
            field_id: None,
            row_id: None,
        });
    }

    let mut sql_parts = Vec::with_capacity(tokens.len());
    let mut deps = Vec::new();
    let mut dep_seen = HashSet::new();
    let mut uses_today = false;

    let mut idx = 0;
    while idx < tokens.len() {
        match &tokens[idx] {
            Token::QuotedIdent(name) => {
                let folded = sqlite_nocase(name);
                let field = fields
                    .iter()
                    .find(|f| sqlite_nocase(&f.name) == folded)
                    .ok_or_else(|| RuntimeDiagnostic {
                        code: "formula-name-invalid".into(),
                        severity: "error".into(),
                        message: Some(format!("Unknown field reference: \"{name}\"")),
                        path: None,
                        table_id: None,
                        field_id: None,
                        row_id: None,
                    })?;

                if dep_seen.insert(field.id.clone()) {
                    deps.push(field.id.clone());
                }

                if field.field_type == FieldType::Formula {
                    if !visiting.insert(field.id.clone()) {
                        return Err(RuntimeDiagnostic {
                            code: "semantic-cycle".into(),
                            severity: "error".into(),
                            message: Some(format!(
                                "Cyclic formula dependency on \"{}\"",
                                field.name
                            )),
                            path: None,
                            table_id: None,
                            field_id: Some(field.id.clone()),
                            row_id: None,
                        });
                    }
                    let def = formula_defs
                        .get(&field.id)
                        .ok_or_else(|| RuntimeDiagnostic {
                            code: "formula-parse-invalid".into(),
                            severity: "error".into(),
                            message: Some(format!("Missing formula definition for {}", field.name)),
                            path: None,
                            table_id: None,
                            field_id: Some(field.id.clone()),
                            row_id: None,
                        })?;
                    let sub = compile_recursive(
                        &def.source_text,
                        fields,
                        formula_defs,
                        visiting,
                        table_alias,
                    )?;
                    visiting.remove(&field.id);
                    if sub.uses_today {
                        uses_today = true;
                    }
                    sql_parts.push(format!("({})", sub.sql));
                } else if let Some(phys) = &field.physical_name {
                    let quoted = quote_identifier(phys).map_err(|e| RuntimeDiagnostic {
                        code: "formula-parse-invalid".into(),
                        severity: "error".into(),
                        message: Some(e.to_string()),
                        path: None,
                        table_id: None,
                        field_id: Some(field.id.clone()),
                        row_id: None,
                    })?;
                    if let Some(alias) = table_alias {
                        sql_parts.push(format!("{alias}.{quoted}"));
                    } else {
                        sql_parts.push(quoted);
                    }
                } else {
                    return Err(RuntimeDiagnostic {
                        code: "formula-type-invalid".into(),
                        severity: "error".into(),
                        message: Some(format!(
                            "Virtual field \"{}\" cannot be referenced in formula",
                            field.name
                        )),
                        path: None,
                        table_id: None,
                        field_id: Some(field.id.clone()),
                        row_id: None,
                    });
                }
            }
            Token::Ident(ident) => {
                let lower = ident.to_ascii_lowercase();
                let next_is_lparen =
                    matches!(tokens.get(idx + 1), Some(Token::Symbol(s)) if s == "(");
                if next_is_lparen {
                    if !ALLOWED_FUNCTIONS.contains(&lower.as_str()) {
                        return Err(RuntimeDiagnostic {
                            code: "formula-parse-invalid".into(),
                            severity: "error".into(),
                            message: Some(format!("Unsupported formula function: {ident}")),
                            path: None,
                            table_id: None,
                            field_id: None,
                            row_id: None,
                        });
                    }
                    if lower == "today" {
                        // TODAY() takes 0 arguments
                        if !matches!(tokens.get(idx + 2), Some(Token::Symbol(s)) if s == ")") {
                            return Err(RuntimeDiagnostic {
                                code: "formula-parse-invalid".into(),
                                severity: "error".into(),
                                message: Some("TODAY() accepts no arguments".into()),
                                path: None,
                                table_id: None,
                                field_id: None,
                                row_id: None,
                            });
                        }
                        uses_today = true;
                        sql_parts
                            .push(r#"(SELECT "today" FROM "__eidos_formula_calendar")"#.into());
                        idx += 3;
                        continue;
                    }
                    sql_parts.push(ident.clone());
                } else if ALLOWED_KEYWORDS.contains(&lower.as_str()) {
                    sql_parts.push(ident.to_ascii_uppercase());
                } else {
                    return Err(RuntimeDiagnostic {
                        code: "formula-name-invalid".into(),
                        severity: "error".into(),
                        message: Some(format!(
                            "Unquoted identifier {ident:?} is not allowed; quote field names with double quotes"
                        )),
                        path: None,
                        table_id: None,
                        field_id: None,
                        row_id: None,
                    });
                }
            }
            Token::Number(n) => sql_parts.push(n.clone()),
            Token::StringLit(s) => sql_parts.push(s.clone()),
            Token::Symbol(sym) => sql_parts.push(sym.clone()),
        }
        idx += 1;
    }

    Ok(CompiledFormula {
        sql: sql_parts.join(" "),
        dependency_field_ids: deps,
        uses_today,
    })
}

pub fn coerce_formula_sql_value(
    value: rusqlite::types::Value,
    result_type: &str,
) -> RuntimeResult<serde_json::Value> {
    use rusqlite::types::Value as SqlValue;
    match value {
        SqlValue::Null => Ok(serde_json::Value::Null),
        SqlValue::Integer(i) => match result_type {
            "integer" => Ok(serde_json::Value::String(i.to_string())),
            "checkbox" => Ok(serde_json::Value::Bool(i != 0)),
            "text" | "url" | "date" | "datetime" => Ok(serde_json::Value::String(i.to_string())),
            _ => Ok(serde_json::json!(i as f64)),
        },
        SqlValue::Real(f) => {
            if !f.is_finite() {
                return Err(RuntimeErrorPayload::new(
                    "invalid-formula",
                    "Formula produced non-finite number",
                ));
            }
            let normalized = if f == 0.0 { 0.0 } else { f };
            match result_type {
                "integer" => Ok(serde_json::Value::String((normalized as i64).to_string())),
                "checkbox" => Ok(serde_json::Value::Bool(normalized != 0.0)),
                "text" => Ok(serde_json::Value::String(normalized.to_string())),
                _ => Ok(serde_json::json!(normalized)),
            }
        }
        SqlValue::Text(s) => match result_type {
            "checkbox" => Ok(serde_json::Value::Bool(!s.is_empty() && s != "0")),
            "number" => s
                .parse::<f64>()
                .ok()
                .filter(|v| v.is_finite())
                .map(|v| serde_json::json!(v))
                .ok_or_else(|| {
                    RuntimeErrorPayload::new("invalid-formula", "Formula did not return a number")
                }),
            "integer" => s
                .parse::<i64>()
                .map(|v| serde_json::Value::String(v.to_string()))
                .map_err(|_| {
                    RuntimeErrorPayload::new("invalid-formula", "Formula did not return an integer")
                }),
            _ => Ok(serde_json::Value::String(s)),
        },
        SqlValue::Blob(_) => Err(RuntimeErrorPayload::new(
            "invalid-formula",
            "Formula cannot return BLOB",
        )),
    }
}
