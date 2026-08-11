use std::fmt::Write as _;
use std::io::{self, Write};

use serde_json::{Map, Value};

use crate::error::AppError;

const MAX_TABLE_COLUMNS: usize = 8;
const MAX_TABLE_CELL_WIDTH: usize = 60;
const MAX_TABLE_WIDTH: usize = 160;

pub fn write_human(mut writer: impl Write, value: &Value) -> io::Result<()> {
    let mut rendered = String::new();
    render_value(&mut rendered, value, 0);
    if !rendered.ends_with('\n') {
        rendered.push('\n');
    }
    writer.write_all(rendered.as_bytes())
}

pub fn write_human_error(mut writer: impl Write, error: &AppError) -> io::Result<()> {
    writeln!(writer, "error [{}]: {}", error.code, error.message)?;
    if let Some(revision) = &error.current_revision {
        writeln!(writer, "currentRevision: {revision}")?;
    }
    Ok(())
}

fn render_value(output: &mut String, value: &Value, indent: usize) {
    match value {
        Value::Object(object) => render_object(output, object, indent),
        Value::Array(items) => render_array(output, None, items, indent),
        _ => {
            let _ = writeln!(output, "{}{}", padding(indent), scalar_text(value));
        }
    }
}

fn render_object(output: &mut String, object: &Map<String, Value>, indent: usize) {
    let mut wrote_simple = false;
    for (key, value) in object {
        let Some(text) = inline_text(value) else {
            continue;
        };
        let _ = writeln!(output, "{}{}: {}", padding(indent), key, text);
        wrote_simple = true;
    }

    let mut wrote_section = false;
    for (key, value) in object {
        if inline_text(value).is_some() {
            continue;
        }
        if indent == 0 && (wrote_simple || wrote_section) {
            ensure_blank_line(output);
        }
        match value {
            Value::Object(child) => {
                let _ = writeln!(output, "{}{}:", padding(indent), key);
                render_object(output, child, indent + 2);
            }
            Value::Array(items) => render_array(output, Some(key), items, indent),
            _ => unreachable!("non-inline values are objects or arrays"),
        }
        wrote_section = true;
    }
}

fn render_array(output: &mut String, key: Option<&str>, items: &[Value], indent: usize) {
    let prefix = padding(indent);
    match key {
        Some(key) if items.is_empty() => {
            let _ = writeln!(output, "{prefix}{key}: none");
            return;
        }
        Some(key) => {
            let _ = writeln!(output, "{prefix}{key} ({}):", items.len());
        }
        None if items.is_empty() => {
            let _ = writeln!(output, "{prefix}none");
            return;
        }
        None => {}
    }

    if let Some(table) = table_data(items) {
        render_table(output, &table, indent + usize::from(key.is_some()) * 2);
        return;
    }

    let item_indent = indent + usize::from(key.is_some()) * 2;
    for item in items {
        if let Some(text) = inline_text(item) {
            let _ = writeln!(output, "{}- {text}", padding(item_indent));
        } else {
            let _ = writeln!(output, "{}-", padding(item_indent));
            render_value(output, item, item_indent + 2);
        }
    }
}

struct TableData {
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
    widths: Vec<usize>,
}

fn table_data(items: &[Value]) -> Option<TableData> {
    if items.is_empty() || items.len() > 10_000 {
        return None;
    }
    let objects = items
        .iter()
        .map(Value::as_object)
        .collect::<Option<Vec<_>>>()?;
    let mut columns = Vec::new();
    for object in &objects {
        for key in object.keys() {
            if !columns.contains(key) {
                columns.push(key.clone());
            }
        }
    }
    columns.sort_by_key(|column| match column.to_ascii_lowercase().as_str() {
        "title" | "name" | "label" => 0,
        "_id" => 2,
        _ => 1,
    });
    if columns.is_empty() || columns.len() > MAX_TABLE_COLUMNS {
        return None;
    }

    let mut widths: Vec<usize> = columns.iter().map(|column| text_width(column)).collect();
    let mut rows = Vec::with_capacity(objects.len());
    for object in objects {
        let row = columns
            .iter()
            .map(|column| object.get(column).map_or_else(String::new, compact_text))
            .collect::<Vec<_>>();
        for (index, cell) in row.iter().enumerate() {
            if cell.contains('\n') || text_width(cell) > MAX_TABLE_CELL_WIDTH {
                return None;
            }
            widths[index] = widths[index].max(text_width(cell));
        }
        rows.push(row);
    }
    let total_width = widths.iter().sum::<usize>() + 3 * widths.len().saturating_sub(1);
    if total_width > MAX_TABLE_WIDTH {
        return None;
    }
    Some(TableData {
        columns,
        rows,
        widths,
    })
}

fn render_table(output: &mut String, table: &TableData, indent: usize) {
    let prefix = padding(indent);
    let header = table
        .columns
        .iter()
        .enumerate()
        .map(|(index, value)| pad_cell(value, table.widths[index]))
        .collect::<Vec<_>>()
        .join(" | ");
    let divider = table
        .widths
        .iter()
        .map(|width| "-".repeat(*width))
        .collect::<Vec<_>>()
        .join("-+-");
    let _ = writeln!(output, "{prefix}{header}");
    let _ = writeln!(output, "{prefix}{divider}");
    for row in &table.rows {
        let rendered = row
            .iter()
            .enumerate()
            .map(|(index, value)| pad_cell(value, table.widths[index]))
            .collect::<Vec<_>>()
            .join(" | ");
        let _ = writeln!(output, "{prefix}{rendered}");
    }
}

fn inline_text(value: &Value) -> Option<String> {
    match value {
        Value::Array(items) if items.iter().all(is_scalar) => {
            let text = compact_text(value);
            (text_width(&text) <= MAX_TABLE_CELL_WIDTH).then_some(text)
        }
        value if is_scalar(value) => Some(scalar_text(value)),
        _ => None,
    }
}

fn is_scalar(value: &Value) -> bool {
    matches!(
        value,
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_)
    )
}

fn scalar_text(value: &Value) -> String {
    match value {
        Value::Null => "—".into(),
        Value::Bool(true) => "yes".into(),
        Value::Bool(false) => "no".into(),
        Value::Number(number) => number.to_string(),
        Value::String(text) if text.is_empty() => "\"\"".into(),
        Value::String(text) if text.contains(['\n', '\r']) => {
            serde_json::to_string(text).expect("serialize JSON string")
        }
        Value::String(text) => text.clone(),
        _ => compact_text(value),
    }
}

fn compact_text(value: &Value) -> String {
    match value {
        Value::String(_) => scalar_text(value),
        _ => serde_json::to_string(value).expect("serialize command output"),
    }
}

fn pad_cell(value: &str, width: usize) -> String {
    format!(
        "{value}{}",
        " ".repeat(width.saturating_sub(text_width(value)))
    )
}

fn text_width(value: &str) -> usize {
    value.chars().count()
}

fn padding(indent: usize) -> String {
    " ".repeat(indent)
}

fn ensure_blank_line(output: &mut String) {
    if !output.is_empty() && !output.ends_with("\n\n") {
        output.push('\n');
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn human(value: Value) -> String {
        let mut output = Vec::new();
        write_human(&mut output, &value).unwrap();
        String::from_utf8(output).unwrap()
    }

    #[test]
    fn renders_flat_object_arrays_as_tables() {
        let rendered = human(json!({
            "revision": "3",
            "rows": [
                { "Title": "Ship CLI", "Status": "doing" },
                { "Title": "Update docs", "Status": "todo" }
            ]
        }));

        assert!(rendered.contains("revision: 3"));
        assert!(rendered.contains("rows (2):"));
        let header = rendered
            .lines()
            .find(|line| line.contains("Title") && line.contains("Status"))
            .unwrap();
        assert!(header.find("Title") < header.find("Status"));
        assert!(rendered.contains("doing"));
        assert!(rendered.contains("Ship CLI"));
        assert!(!rendered.trim_start().starts_with('{'));
    }

    #[test]
    fn renders_nested_values_without_losing_json_content() {
        let rendered = human(json!({
            "file": { "title": "Tracker", "revision": "4" },
            "fields": [{ "name": "Status", "options": ["todo", "done"] }]
        }));

        assert!(rendered.contains("file:"));
        assert!(rendered.contains("title: Tracker"));
        assert!(rendered.contains("[\"todo\",\"done\"]"));
    }

    #[test]
    fn renders_human_errors_with_revision_context() {
        let error = AppError {
            code: "stale-revision",
            message: "expected revision 3, found 4".into(),
            current_revision: Some("4".into()),
        };
        let mut output = Vec::new();
        write_human_error(&mut output, &error).unwrap();
        let rendered = String::from_utf8(output).unwrap();

        assert_eq!(
            rendered,
            "error [stale-revision]: expected revision 3, found 4\ncurrentRevision: 4\n"
        );
    }
}
