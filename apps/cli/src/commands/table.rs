//! Table command implementations
//!
//! Commands for listing and inspecting database tables

use anyhow::{Context, Result};
use colored::Colorize;
use serde_json::Value;
use unicode_width::UnicodeWidthStr;

use crate::client::EidosClient;
use crate::utils::{pad_to_width, OutputFormat};

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
}

impl TableCommands {
    pub async fn execute(self, client: EidosClient, format: OutputFormat) -> Result<()> {
        match self {
            TableCommands::List { long } => list_tables(client, long, format).await,
            TableCommands::Schema { table } => show_schema(client, &table, format).await,
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
