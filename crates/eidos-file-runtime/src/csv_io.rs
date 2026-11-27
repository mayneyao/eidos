//! Zero-dependency streaming RFC 4180 CSV parser & writer for `exportCsv` / `importCsv`.

use serde_json::Value as JsonValue;

pub fn escape_csv_cell(value: &str) -> String {
    if value.contains([',', '"', '\n', '\r']) {
        let mut out = String::with_capacity(value.len() + 2);
        out.push('"');
        for ch in value.chars() {
            if ch == '"' {
                out.push('"');
            }
            out.push(ch);
        }
        out.push('"');
        out
    } else {
        value.to_string()
    }
}

pub fn logical_value_to_csv(value: &JsonValue) -> String {
    match value {
        JsonValue::Null => String::new(),
        JsonValue::Bool(b) => if *b { "true" } else { "false" }.to_string(),
        JsonValue::Number(n) => n.to_string(),
        JsonValue::String(s) => s.clone(),
        JsonValue::Array(arr) => arr
            .iter()
            .map(logical_value_to_csv)
            .collect::<Vec<_>>()
            .join(", "),
        JsonValue::Object(_) => value.to_string(),
    }
}

pub fn parse_csv(input: &str) -> Vec<Vec<String>> {
    let input = input.strip_prefix('\u{feff}').unwrap_or(input);
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut current_row: Vec<String> = Vec::new();
    let mut cell = String::new();
    let mut in_quotes = false;
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if in_quotes {
            if ch == '"' {
                if chars.peek() == Some(&'"') {
                    chars.next();
                    cell.push('"');
                } else {
                    in_quotes = false;
                }
            } else {
                cell.push(ch);
            }
        } else {
            match ch {
                '"' if cell.is_empty() => in_quotes = true,
                ',' => {
                    current_row.push(std::mem::take(&mut cell));
                }
                '\r' => {
                    if chars.peek() == Some(&'\n') {
                        chars.next();
                    }
                    current_row.push(std::mem::take(&mut cell));
                    rows.push(std::mem::take(&mut current_row));
                }
                '\n' => {
                    current_row.push(std::mem::take(&mut cell));
                    rows.push(std::mem::take(&mut current_row));
                }
                other => cell.push(other),
            }
        }
    }

    if !cell.is_empty() || !current_row.is_empty() {
        current_row.push(cell);
        rows.push(current_row);
    }
    rows
}
