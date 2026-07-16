//! Table command implementations
//!
//! Commands for listing and inspecting database tables

use anyhow::{Context, Result};
use colored::Colorize;
use serde_json::Value;
use unicode_width::UnicodeWidthStr;

use crate::client::EidosClient;
use crate::utils::{pad_to_width, OutputFormat};
use std::io::{IsTerminal, Read};

/// Table management commands
#[derive(clap::Subcommand)]
pub enum TableCommands {
    /// List all tables
    #[command(name = "ls")]
    List {
        /// Show detailed info
        #[arg(short, long)]
        long: bool,
    },

    /// Show table schema
    Schema {
        /// Table ID or name
        table: String,
    },

    /// Import/Append data to a table
    #[command(name = "import", alias = "add", alias = "append")]
    Import {
        /// Table ID or name
        table: String,
        /// JSON data (array of objects)
        #[arg(short, long)]
        data: Option<String>,
        /// Input file (JSON array)
        #[arg(short = 'i', long)]
        file: Option<String>,
    },

    /// Create a new table
    Create {
        /// Table name
        name: String,
        /// Explicit fields definition (format: name:type,name:type)
        #[arg(short = 'F', long)]
        fields: Option<String>,
        /// Template table ID to copy schema from
        #[arg(short = 'T', long)]
        template: Option<String>,
        /// JSON sample data to infer schema (auto-detected from stdin if not provided and piped)
        #[arg(short, long)]
        data: Option<String>,
        /// Input file for inferring schema or template
        #[arg(short = 'i', long)]
        file: Option<String>,
    },
}

impl TableCommands {
    pub async fn execute(self, client: EidosClient, format: OutputFormat) -> Result<()> {
        match self {
            TableCommands::List { long } => list_tables(client, long, format).await,
            TableCommands::Schema { table } => show_schema(client, &table, format).await,
            TableCommands::Import { table, data, file } => import_data(client, &table, data, file).await,
            TableCommands::Create { name, fields, template, data, file } => {
                cmd_create_table(client, name, fields, template, data, file).await
            }
        }
    }
}

async fn list_tables(client: EidosClient, long: bool, format: OutputFormat) -> Result<()> {
    let tables: Value = client
        .call("schema.listTables", vec![])
        .await
        .context("Failed to list tables")?;

    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&tables)?);
            return Ok(());
        }
        OutputFormat::Table => {
            // Continue with table format
        }
    }

    let tables = tables.as_array().cloned().unwrap_or_default();

    if tables.is_empty() {
        println!("{}", "No tables found.".yellow());
        return Ok(());
    }

    if long {
        // Calculate column widths
        let mut max_id_width = 2; // "ID".len()
        let mut max_name_width = 4; // "Name".len()

        for table in &tables {
            let id = table["id"].as_str().unwrap_or("-");
            let name = table["name"].as_str().unwrap_or("-");
            max_id_width = max_id_width.max(id.width());
            max_name_width = max_name_width.max(name.width());
        }

        max_id_width += 2;
        max_name_width += 2;

        // Print header
        println!(
            "{} {}",
            pad_to_width(&"ID".dimmed().to_string(), max_id_width),
            pad_to_width(&"Name".dimmed().to_string(), max_name_width)
        );

        // Print rows
        for table in tables {
            let id = table["id"].as_str().unwrap_or("-");
            let name = table["name"].as_str().unwrap_or("-");
            println!(
                "{} {}",
                pad_to_width(&id.cyan().to_string(), max_id_width),
                pad_to_width(name, max_name_width)
            );
        }
    } else {
        // Simple list
        for table in tables {
            let name = table["name"].as_str().unwrap_or("-");
            print!("{}  ", name.green());
        }
        println!();
    }

    Ok(())
}

async fn show_schema(client: EidosClient, table_id: &str, format: OutputFormat) -> Result<()> {
    let result: Value = client
        .call("schema.getTable", vec![serde_json::json!(table_id)])
        .await
        .context(format!("Failed to get schema for table: {}", table_id))?;

    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&result)?);
            return Ok(());
        }
        OutputFormat::Table => {
            // Continue with table format
        }
    }

    if result.is_null() {
        anyhow::bail!("Table '{}' not found", table_id);
    }

    let table_name = result["name"].as_str().unwrap_or("-");
    let fields = result["fields"].as_array();

    println!("{} {}", "Table:".bold(), table_name.cyan());
    println!();

    if let Some(field_list) = fields {
        if field_list.is_empty() {
            println!("{}", "No fields defined.".dimmed());
        } else {
            // Calculate column widths
            let mut max_display_width = 4; // "Name".len()
            let mut max_column_width = 10; // "ColumnName".len()
            let mut max_type_width = 4; // "Type".len()
            let mut max_property_width = 0; // Only for formula fields

            for field in field_list {
                let display_name = field["name"].as_str().unwrap_or("-");
                let column_name = field["columnName"].as_str().unwrap_or("-");
                let field_type = field["type"].as_str().unwrap_or("-");
                max_display_width = max_display_width.max(display_name.width());
                max_column_width = max_column_width.max(column_name.width());
                max_type_width = max_type_width.max(field_type.width());
                
                // Only calculate property width for formula fields
                if field_type == "formula" {
                    if let Some(property) = field["property"].as_object() {
                        if let Some(formula) = property["formula"].as_str() {
                            max_property_width = max_property_width.max(formula.width().min(50));
                        }
                    }
                }
            }

            max_display_width += 2;
            max_column_width += 2;
            max_type_width += 2;
            
            // Only add property column if there are formula fields
            let has_formula = field_list.iter().any(|f| {
                f["type"].as_str() == Some("formula")
            });
            
            if has_formula {
                max_property_width = max_property_width.max(10) + 2; // "Property".len()
            }

            // Print header
            if has_formula {
                println!(
                    "{} {} {} {}",
                    pad_to_width(&"Name".dimmed().to_string(), max_display_width),
                    pad_to_width(&"ColumnName".dimmed().to_string(), max_column_width),
                    pad_to_width(&"Type".dimmed().to_string(), max_type_width),
                    pad_to_width(&"Property".dimmed().to_string(), max_property_width)
                );
            } else {
                println!(
                    "{} {} {}",
                    pad_to_width(&"Name".dimmed().to_string(), max_display_width),
                    pad_to_width(&"ColumnName".dimmed().to_string(), max_column_width),
                    pad_to_width(&"Type".dimmed().to_string(), max_type_width)
                );
            }

            // Print fields
            for field in field_list {
                let display_name = field["name"].as_str().unwrap_or("-");
                let column_name = field["columnName"].as_str().unwrap_or("-");
                let field_type = field["type"].as_str().unwrap_or("-");
                
                // Get formula for formula fields
                let property_str = if field_type == "formula" {
                    field["property"]["formula"].as_str()
                        .map(|s| if s.len() > 50 { format!("{}...", &s[..47]) } else { s.to_string() })
                        .unwrap_or_default()
                } else {
                    String::new()
                };
                
                if has_formula {
                    println!(
                        "{} {} {} {}",
                        pad_to_width(display_name, max_display_width),
                        pad_to_width(&column_name.dimmed().to_string(), max_column_width),
                        pad_to_width(&field_type.yellow().to_string(), max_type_width),
                        pad_to_width(&property_str.dimmed().to_string(), max_property_width)
                    );
                } else {
                    println!(
                        "{} {} {}",
                        pad_to_width(display_name, max_display_width),
                        pad_to_width(&column_name.dimmed().to_string(), max_column_width),
                        pad_to_width(&field_type.yellow().to_string(), max_type_width)
                    );
                }
            }
        }

        println!();
        println!("{} field(s)", field_list.len());
    } else {
        println!("{}", "No schema information available.".dimmed());
    }

    Ok(())
}

async fn import_data(
    client: EidosClient,
    table_id: &str,
    data: Option<String>,
    file: Option<String>,
) -> Result<()> {
    let raw_data = if let Some(d) = data {
        d
    } else if let Some(f) = file {
        std::fs::read_to_string(f).context("Failed to read input file")?
    } else if !std::io::stdin().is_terminal() {
        let mut buffer = String::new();
        std::io::stdin()
            .read_to_string(&mut buffer)
            .context("Failed to read from stdin")?;
        buffer
    } else {
        anyhow::bail!("No data provided. Use --data, --file or pipe JSON via stdin");
    };

    let records: Value = serde_json::from_str(&raw_data)
        .context("Failed to parse JSON data. Expected a JSON array of objects.")?;

    if !records.is_array() {
        anyhow::bail!("Input data must be a JSON array of objects");
    }

    let records_array = records.as_array().unwrap();
    if records_array.is_empty() {
        println!("{}", "No records to import.".yellow());
        return Ok(());
    }

    // Call createMany RPC via the table client
    // Strip "tb_" prefix if present to get the actual table ID
    let target_id = table_id.strip_prefix("tb_").unwrap_or(table_id);
    let result: Value = client
        .call(
            &format!("table({}).createMany", target_id),
            vec![serde_json::json!({ "data": records })],
        )
        .await
        .context(format!("Failed to import data to table: {}", table_id))?;

    let count = result["count"].as_u64().unwrap_or(0);
    println!(
        "{} Successfully imported {} record(s) to table '{}'",
        "✓".green().bold(),
        count,
        table_id.cyan()
    );

    Ok(())
}

async fn cmd_create_table(
    client: EidosClient,
    name: String,
    fields_str: Option<String>,
    template: Option<String>,
    data: Option<String>,
    file: Option<String>,
) -> Result<()> {
    let mut fields = Vec::new();
    let mut data_to_import: Option<String> = None;

    if let Some(f_str) = fields_str {
        // Option 1: Explicit fields: "age:number,status:select"
        for part in f_str.split(',') {
            if let Some((f_name, f_type)) = part.split_once(':') {
                let name_trimmed = f_name.trim();
                let type_trimmed = f_type.trim();
                if name_trimmed.to_lowercase() != "title" {
                    fields.push(serde_json::json!({
                        "name": name_trimmed,
                        "columnName": name_trimmed.to_lowercase().replace(" ", "_"),
                        "type": type_trimmed
                    }));
                }
            }
        }
    } else if let Some(template_id) = template {
        // Option 2: Template mode (copy from existing table)
        let schema: Value = client
            .call("schema.export", vec![serde_json::json!(template_id)])
            .await
            .context(format!("Failed to export schema from template: {}", template_id))?;
        
        if let Some(f_list) = schema["fields"].as_array() {
            fields = f_list.clone();
        }
    } else {
        // Option 3: Infer mode or simple empty table
        let raw_data = if let Some(d) = data {
            Some(d)
        } else if let Some(f) = file {
            Some(std::fs::read_to_string(f).context("Failed to read input file")?)
        } else if !std::io::stdin().is_terminal() {
            let mut buf = String::new();
            std::io::stdin()
                .read_to_string(&mut buf)
                .context("Failed to read from stdin")?;
            Some(buf)
        } else {
            None
        };

        if let Some(raw) = raw_data {
            let records: Value = serde_json::from_str(&raw)
                .context("Failed to parse JSON data for schema inference")?;
            
            if let Some(arr) = records.as_array() {
                if !arr.is_empty() {
                    data_to_import = Some(raw);
                    // Infer from the first record
                    if let Some(first) = arr[0].as_object() {
                        for (k, v) in first {
                            let k_lower = k.to_lowercase();
                            if k_lower == "title" || k_lower == "_id" || k_lower.starts_with("_") {
                                continue;
                            }
                            
                            let f_type = match v {
                                Value::Number(_) => "number",
                                Value::Bool(_) => "checkbox",
                                _ => "text",
                            };
                            
                            fields.push(serde_json::json!({
                                "name": k,
                                "columnName": k_lower.replace(" ", "_"),
                                "type": f_type
                            }));
                        }
                    }
                }
            }
        }
    }

    // Call schema.createTable
    let result: Value = client
        .call("schema.createTable", vec![serde_json::json!({
            "name": name,
            "fields": fields
        })])
        .await
        .context(format!("Failed to create table: {}", name))?;

    let new_id = result["id"].as_str().context("Table ID missing in response")?;
    println!(
        "{} Table '{}' created successfully! ({})",
        "✓".green().bold(),
        result["name"].as_str().unwrap_or(&name),
        new_id.cyan()
    );

    // If we have data from inference, import it now
    if let Some(records_str) = data_to_import {
        println!("{} Automatically importing data to the new table...", "→".blue());
        import_data(client, new_id, Some(records_str), None).await?;
    }

    Ok(())
}
