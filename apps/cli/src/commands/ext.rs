use anyhow::{Context, Result};
use clap::Subcommand;
use colored::Colorize;
use std::path::Path;
use unicode_width::UnicodeWidthStr;

use crate::client::EidosClient;
use crate::config::Config;
use crate::utils::pad_to_width;

/// Extension management commands
#[derive(Subcommand)]
pub enum ExtCommands {
    /// Deploy an extension from file
    Deploy {
        /// Path to extension file (.tsx or .ts)
        path: String,
        
        /// Optional slug to update existing extension
        #[arg(long)]
        slug: Option<String>,
    },

    /// List all extensions
    #[command(name = "ls")]
    List {
        /// Filter by type (block, script)
        #[arg(short, long)]
        type_filter: Option<String>,
    },

    /// Delete an extension
    #[command(name = "rm")]
    Delete {
        /// Extension ID
        id: String,
        
        /// Skip confirmation
        #[arg(short, long)]
        yes: bool,
    },
}

impl ExtCommands {
    pub async fn execute(self, client: EidosClient, config: &Config) -> Result<()> {
        let space_id = config
            .space_id
            .as_ref()
            .context("No space selected. Change to a space directory or use -s <space-id>")?;

        match self {
            ExtCommands::Deploy { path, slug } => {
                deploy_extension(client, space_id, &path, slug).await
            }
            ExtCommands::List { type_filter } => list_extensions(client, space_id, type_filter).await,
            ExtCommands::Delete { id, yes } => delete_extension(client, space_id, &id, yes).await,
        }
    }
}

async fn deploy_extension(
    client: EidosClient,
    space_id: &str,
    path: &str,
    slug: Option<String>,
) -> Result<()> {
    let path = Path::new(path);
    
    if !path.exists() {
        anyhow::bail!("File not found: {}", path.display());
    }

    // Read the source code
    let code = std::fs::read_to_string(path)
        .with_context(|| format!("Failed to read {}", path.display()))?;

    // Get original filename for TSX/TS detection (required)
    let filename = path
        .file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
        .ok_or_else(|| anyhow::anyhow!("Invalid filename"))?;

    // Deploy using backend's installFromCode method
    // Pass optional slug for updating existing extension
    let result = client
        .call_for_space(
            space_id,
            "extension.installFromCode",
            vec![
                serde_json::json!(code),
                serde_json::json!(filename),
                serde_json::json!(slug),
            ],
        )
        .await?;

    let result_id = result.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
    let result_slug = result.get("slug").and_then(|v| v.as_str());
    let is_enabled = result.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
    
    let action = if slug.is_some() { "Updated" } else { "Deployed" };
    println!(
        "{} Extension '{}' {}",
        "✓".green(),
        result_id.cyan(),
        action.to_lowercase(),
    );
    
    if let Some(s) = result_slug {
        println!("  Slug: {}", s.cyan());
    }
    
    if is_enabled {
        println!("  Status: {}", "enabled".green());
    }

    // Show extracted info from backend
    if let Some(name) = result.get("name").and_then(|v| v.as_str()) {
        println!("  Name: {}", name);
    }
    if let Some(ext_type) = result.get("type").and_then(|v| v.as_str()) {
        println!("  Type: {}", ext_type);
    }

    Ok(())
}

async fn list_extensions(
    client: EidosClient,
    space_id: &str,
    type_filter: Option<String>,
) -> Result<()> {
    let result = client
        .call_for_space(space_id, "extension.list", vec![serde_json::json!({})])
        .await?;

    let extensions: Vec<serde_json::Value> = serde_json::from_value(result)
        .unwrap_or_default();

    if extensions.is_empty() {
        println!("{}", "No extensions found.".yellow());
        return Ok(());
    }

    // Calculate column widths based on content
    let mut max_id_width = 2; // "ID".len()
    let mut max_slug_width = 4; // "Slug".len()
    let mut max_name_width = 4; // "Name".len()
    let mut max_type_width = 4; // "Type".len()
    
    for ext in &extensions {
        let id = ext.get("id").and_then(|v| v.as_str()).unwrap_or("-");
        let slug = ext.get("slug").and_then(|v| v.as_str()).unwrap_or("-");
        let name = ext.get("name").and_then(|v| v.as_str()).unwrap_or("-");
        let ext_type = ext.get("type").and_then(|v| v.as_str()).unwrap_or("block");
        
        if let Some(ref filter) = type_filter {
            if ext_type != filter {
                continue;
            }
        }
        
        max_id_width = max_id_width.max(id.width());
        max_slug_width = max_slug_width.max(slug.width());
        max_name_width = max_name_width.max(name.width());
        max_type_width = max_type_width.max(ext_type.width());
    }
    
    // Add some padding
    max_id_width += 2;
    max_slug_width += 2;
    max_name_width += 2;
    max_type_width += 2;

    // Print header
    println!("{} {} {} {} {}", 
        pad_to_width(&"ID".dimmed().to_string(), max_id_width),
        pad_to_width(&"Slug".dimmed().to_string(), max_slug_width),
        pad_to_width(&"Name".dimmed().to_string(), max_name_width),
        pad_to_width(&"Type".dimmed().to_string(), max_type_width),
        "Status".dimmed()
    );
    
    for ext in extensions {
        let id = ext.get("id").and_then(|v| v.as_str()).unwrap_or("-");
        let slug = ext.get("slug").and_then(|v| v.as_str()).unwrap_or("-");
        let name = ext.get("name").and_then(|v| v.as_str()).unwrap_or("-");
        // Handle both boolean and integer (SQLite stores booleans as 0/1)
        let enabled = ext.get("enabled").map(|v| {
            v.as_bool().unwrap_or_else(|| v.as_i64().map(|i| i != 0).unwrap_or(false))
        }).unwrap_or(false);
        let ext_type = ext.get("type").and_then(|v| v.as_str()).unwrap_or("block");
        
        if let Some(ref filter) = type_filter {
            if ext_type != filter {
                continue;
            }
        }

        let status = if enabled { "enabled".green() } else { "disabled".dimmed() };
        println!("{} {} {} {} {}", 
            pad_to_width(&id.cyan().to_string(), max_id_width),
            pad_to_width(slug, max_slug_width),
            pad_to_width(name, max_name_width),
            pad_to_width(ext_type, max_type_width),
            status
        );
    }

    Ok(())
}

async fn delete_extension(
    client: EidosClient,
    space_id: &str,
    id: &str,
    yes: bool,
) -> Result<()> {
    if !yes {
        print!("Delete extension '{}'? [y/N] ", id);
        std::io::Write::flush(&mut std::io::stdout())?;
        
        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;
        
        if !input.trim().eq_ignore_ascii_case("y") {
            println!("Cancelled");
            return Ok(());
        }
    }

    client
        .call_for_space(space_id, "extension.del", vec![serde_json::json!(id)])
        .await?;

    println!("{} Extension '{}' deleted", "✓".green(), id.cyan());
    Ok(())
}
