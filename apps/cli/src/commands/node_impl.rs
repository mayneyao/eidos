//! Node command implementations
//! 
//! Filesystem-style commands for Eidos nodes.
//! With name uniqueness enabled, nodes can be addressed by paths like folder/doc

use anyhow::{Context, Result, bail};
use colored::Colorize;
use serde_json::Value;
use std::io::Read;

use crate::client::EidosClient;

/// Normalize path for Node API
/// Node API expects paths without leading "/"
fn normalize_path(path: &str) -> String {
    let path = path.trim_start_matches('/');
    if path.is_empty() { "".to_string() } else { path.to_string() }
}

// ========== Command Implementations ==========

pub async fn cmd_list(client: EidosClient, path: Option<String>, long: bool) -> Result<()> {
    let path = path.unwrap_or_else(|| "/".to_string());
    let node_path = normalize_path(&path);
    
    // Use node.list RPC method
    let nodes: Value = client
        .call("node.list", vec![serde_json::json!(node_path)])
        .await?;
    
    let nodes = nodes.as_array().cloned().unwrap_or_default();
    
    if nodes.is_empty() {
        let display_path = if path.is_empty() { "/".to_string() } else { path.clone() };
        println!("{} (empty)", display_path.dimmed());
        return Ok(());
    }
    
    if long {
        println!("{:<22} {:<10} {:<30} {}", "ID", "TYPE", "NAME", "CREATED".dimmed());
    }
    
    for node in nodes {
        let name = node["name"].as_str().unwrap_or("(unnamed)");
        let node_type = node["type"].as_str().unwrap_or("unknown");
        let id = node["id"].as_str().unwrap_or("");
        
        if long {
            let created = node["created_at"].as_str().unwrap_or("-");
            let (icon, type_label) = match node_type {
                "folder" => ("📁", "folder    "),
                "doc" => ("📄", "doc       "),
                "table" => ("📊", "table     "),
                "dataview" => ("👁 ", "dataview  "),
                _ if node_type.starts_with("ext__") => ("🔌", "extension "),
                _ => ("📦", "other     "),
            };
            println!("{} {:<20} {:<10} {:<30} {}", 
                icon, 
                id.bright_black(), 
                type_label,
                name, 
                created.dimmed()
            );
        } else {
            let colored_name = match node_type {
                "folder" => name.blue().bold(),
                "doc" => name.white(),
                "table" => name.green(),
                "dataview" => name.magenta(),
                _ if node_type.starts_with("ext__") => name.yellow(),
                _ => name.normal(),
            };
            print!("{}  ", colored_name);
        }
    }
    
    if !long {
        println!();
    }
    
    Ok(())
}

pub async fn cmd_view(client: EidosClient, path: String) -> Result<()> {
    let node_path = normalize_path(&path);
    // Use node.get RPC method
    let node: Value = client
        .call("node.get", vec![serde_json::json!(node_path)])
        .await
        .map_err(|e| anyhow::anyhow!("Node not found: {} ({e})", path))?;
    
    let node_id = node["id"].as_str().context("Node has no ID")?;
    let node_type = node["type"].as_str().unwrap_or("unknown");
    
    match node_type {
        "doc" => {
            let content: Value = client
                .call("doc.get", vec![serde_json::json!(node_id)])
                .await?;
            let markdown = content["markdown"].as_str().unwrap_or("");
            println!("{}", markdown);
        }
        "table" => {
            // Get first 100 rows as CSV
            let rows: Value = client
                .call("table.rows.query", vec![
                    serde_json::json!(node_id),
                    serde_json::json!({"limit": 100}),
                ])
                .await?;
            
            // Simple CSV output
            if let Some(rows_array) = rows.as_array() {
                for row in rows_array {
                    println!("{}", serde_json::to_string(row)?);
                }
            }
        }
        "dataview" => {
            println!("{} (dataview execution not yet implemented)", "Note:".yellow());
        }
        _ => {
            println!("{}", serde_json::to_string_pretty(&node)?);
        }
    }
    
    Ok(())
}

pub async fn cmd_mkdir(client: EidosClient, path: String) -> Result<()> {
    let node_path = normalize_path(&path);
    // Use node.create RPC method
    match client
        .call("node.create", vec![
            serde_json::json!(node_path),
            serde_json::json!("folder"),
            serde_json::json!({}),
        ])
        .await
    {
        Ok(result) => {
            let id = result["id"]
                .as_str()
                .context("Failed to create folder: no ID returned")?;
            println!("{} {} ({})", "Created folder".green(), path, id.bright_black());
            Ok(())
        }
        Err(e) => {
            // Check if already exists
            if e.to_string().contains("already exists") {
                if let Ok(existing) = client.call("node.get", vec![serde_json::json!(node_path)]).await {
                    let id = existing["id"].as_str().unwrap_or("?");
                    println!("{} {} already exists ({})", "Folder".yellow(), path, id.bright_black());
                    return Ok(());
                }
            }
            Err(e.into())
        }
    }
}

pub async fn cmd_touch(client: EidosClient, path: String, content: Option<String>) -> Result<()> {
    let node_path = normalize_path(&path);
    
    // Read from stdin if no content provided and stdin is not a tty
    let content = if content.is_none() && !atty::is(atty::Stream::Stdin) {
        let mut stdin_content = String::new();
        std::io::stdin().read_to_string(&mut stdin_content)?;
        Some(stdin_content)
    } else {
        content
    };
    
    // Use node.create RPC method
    let options = if let Some(content) = content {
        serde_json::json!({
            "hideProperties": true,
            "content": content
        })
    } else {
        serde_json::json!({
            "hideProperties": true
        })
    };
    
    match client
        .call("node.create", vec![
            serde_json::json!(node_path),
            serde_json::json!("doc"),
            options,
        ])
        .await
    {
        Ok(result) => {
            let id = result["id"]
                .as_str()
                .context("Failed to create doc: no ID returned")?;
            println!("{} {} ({})", "Created doc".green(), path, id.bright_black());
            Ok(())
        }
        Err(e) => {
            // Check if already exists
            if e.to_string().contains("already exists") {
                if let Ok(existing) = client.call("node.get", vec![serde_json::json!(node_path)]).await {
                    let id = existing["id"].as_str().unwrap_or("?");
                    println!("{} {} already exists ({})", "Doc".yellow(), path, id.bright_black());
                    return Ok(());
                }
            }
            Err(e.into())
        }
    }
}


pub async fn cmd_move(client: EidosClient, src: String, dst: String) -> Result<()> {
    let src_path = normalize_path(&src);
    let dst_path = normalize_path(&dst);
    // Use node.move RPC method
    let _ = client
        .call("node.move", vec![
            serde_json::json!(src_path),
            serde_json::json!(dst_path),
        ])
        .await?;
    
    println!("{} {} -> {}", "Moved".green(), src, dst);
    Ok(())
}

pub async fn cmd_append(client: EidosClient, path: String, content: Option<String>) -> Result<()> {
    let node_path = normalize_path(&path);
    
    // Read from stdin if no content provided and stdin is not a tty
    let content = if content.is_none() && !atty::is(atty::Stream::Stdin) {
        let mut stdin_content = String::new();
        std::io::stdin().read_to_string(&mut stdin_content)?;
        stdin_content
    } else {
        content.context("Content required: use --content or pipe via stdin")?
    };
    
    // Use doc.append RPC method
    let _ = client
        .call("doc.append", vec![
            serde_json::json!(node_path),
            serde_json::json!(content),
        ])
        .await?;
    
    println!("{} {} ({} bytes)", "Appended to".green(), path, content.len());
    Ok(())
}

pub async fn cmd_remove(
    client: EidosClient, 
    path: String, 
    force: bool, 
    recursive: bool
) -> Result<()> {
    let node_path = normalize_path(&path);
    // First get node info to check type
    let node: Value = client
        .call("node.get", vec![serde_json::json!(node_path)])
        .await
        .map_err(|e| anyhow::anyhow!("Node not found: {} ({e})", path))?;
    
    let node_type = node["type"].as_str().unwrap_or("unknown");
    
    if node_type == "folder" && !recursive {
        bail!("{} is a folder. Use -r to remove recursively", path);
    }
    
    // Use node.delete RPC method
    let options = serde_json::json!({
        "permanent": force,
        "recursive": recursive
    });
    
    let _ = client
        .call("node.delete", vec![
            serde_json::json!(node_path),
            options,
        ])
        .await?;
    
    if force {
        println!("{} {} (permanent)", "Deleted".red(), path);
    } else {
        println!("{} {} (moved to trash)", "Deleted".yellow(), path);
    }
    
    Ok(())
}

pub async fn cmd_sql(client: EidosClient, query: String) -> Result<()> {
    // Try exec2 method (most common in Eidos SDK)
    let result = match client.call("exec2", vec![serde_json::json!(query.clone())]).await {
        Ok(r) => r,
        Err(_) => {
            // Fallback to sql2
            client.call("sql2", vec![serde_json::json!(query), serde_json::json!([])]).await?
        }
    };
    
    println!("{}", serde_json::to_string_pretty(&result)?);
    Ok(())
}
