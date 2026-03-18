use anyhow::{Context, Result};
use clap::Subcommand;
use colored::Colorize;
use std::path::Path;

use crate::client::EidosClient;
use crate::config::Config;

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
    List {
        /// Filter by type (block, script)
        #[arg(short, long)]
        type_filter: Option<String>,
    },

    /// Get extension details
    Get {
        /// Extension ID
        id: String,
    },

    /// Delete an extension
    Delete {
        /// Extension ID
        id: String,
        
        /// Skip confirmation
        #[arg(short, long)]
        yes: bool,
    },

    /// Enable an extension
    Enable {
        /// Extension ID
        id: String,
    },

    /// Disable an extension
    Disable {
        /// Extension ID
        id: String,
    },
}

impl ExtCommands {
    pub async fn execute(self, client: EidosClient, config: &Config) -> Result<()> {
        let space_id = config
            .space_id
            .as_ref()
            .context("No space selected. Use 'eidos space use <space-id>'")?;

        match self {
            ExtCommands::Deploy { path, slug } => {
                deploy_extension(client, space_id, &path, slug).await
            }
            ExtCommands::List { type_filter } => list_extensions(client, space_id, type_filter).await,
            ExtCommands::Get { id } => get_extension(client, space_id, &id).await,
            ExtCommands::Delete { id, yes } => delete_extension(client, space_id, &id, yes).await,
            ExtCommands::Enable { id } => toggle_extension(client, space_id, &id, true).await,
            ExtCommands::Disable { id } => toggle_extension(client, space_id, &id, false).await,
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

    // Print header
    println!("{:<36} {:<24} {:<30} {:<8} {}", 
        "ID".dimmed(), 
        "Slug".dimmed(), 
        "Name".dimmed(),
        "Type".dimmed(),
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
        println!("{:<36} {:<24} {:<30} {:<8} {}", 
            id.cyan(),
            slug,
            name,
            ext_type,
            status
        );
    }

    Ok(())
}

async fn get_extension(
    client: EidosClient,
    space_id: &str,
    id: &str,
) -> Result<()> {
    let result = client
        .call_for_space(space_id, "extension.get", vec![serde_json::json!(id)])
        .await?;

    if result.is_null() {
        anyhow::bail!("Extension '{}' not found", id);
    }

    let ext: serde_json::Value = serde_json::from_value(result)?;
    
    println!("{}", "Extension Details".bold().underline());
    println!("  {}: {}", "ID".dimmed(), id.cyan());
    println!("  {}: {}", "Name".dimmed(), ext.get("name").and_then(|v| v.as_str()).unwrap_or("-"));
    println!("  {}: {}", "Type".dimmed(), ext.get("type").and_then(|v| v.as_str()).unwrap_or("block"));
    println!("  {}: {}", "Version".dimmed(), ext.get("version").and_then(|v| v.as_str()).unwrap_or("1.0.0"));
    println!("  {}: {}", "Status".dimmed(), 
        if ext.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false) { "enabled".green() } else { "disabled".dimmed() }
    );
    
    if let Some(meta) = ext.get("meta") {
        println!("  {}: {}", "Meta".dimmed(), serde_json::to_string_pretty(meta)?.dimmed());
    }

    let code_len = ext.get("code").and_then(|v| v.as_str()).map(|s| s.len()).unwrap_or(0);
    println!("  {}: {} bytes", "Code Size".dimmed(), code_len.to_string().cyan());

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

async fn toggle_extension(
    client: EidosClient,
    space_id: &str,
    id: &str,
    enabled: bool,
) -> Result<()> {
    let method = if enabled { "extension.enable" } else { "extension.disable" };
    client
        .call_for_space(space_id, method, vec![serde_json::json!(id)])
        .await?;

    let status = if enabled { "enabled".green() } else { "disabled".dimmed() };
    println!("{} Extension '{}' {}", "✓".green(), id.cyan(), status);
    Ok(())
}


