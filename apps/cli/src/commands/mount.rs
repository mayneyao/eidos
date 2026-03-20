//! Mount command implementations
//!
//! Commands for managing external directory mounts in Eidos.
//! Mounted directories can be accessed via /@/<mount-name>/ path.
//!
//! Similar to Unix mount command:
//!   eidos mount              # List all mounts
//!   eidos mount <name> <dir> # Mount directory  
//!   eidos mount -u <name>    # Unmount
//!   eidos mount -l           # List mounts (explicit)

use std::path::Path;

use anyhow::{Context, Result};
use clap::Args;
use colored::Colorize;
use serde_json::Value;
use unicode_width::UnicodeWidthStr;

use crate::client::EidosClient;
use crate::utils::pad_to_width;

/// Expand ~ to home directory and resolve to absolute path
fn resolve_path(path: &str) -> Result<std::path::PathBuf> {
    let expanded = if path.starts_with("~/") || path == "~" {
        // Expand ~ to home directory
        let home = dirs::home_dir()
            .ok_or_else(|| anyhow::anyhow!("Could not determine home directory"))?;
        if path == "~" {
            home
        } else {
            home.join(&path[2..])
        }
    } else {
        Path::new(path).to_path_buf()
    };

    // Resolve to absolute path
    Ok(expanded.canonicalize()
        .with_context(|| format!("Path not found or not accessible: {}", path))?)
}

/// Mount command arguments
/// 
/// Behaves like Unix mount:
/// - Without args: lists all mounts
/// - With name and path: creates a new mount
/// - With -u: unmounts the specified mount
#[derive(Args, Clone)]
pub struct MountArgs {
    /// Mount name (used in /@/<name>/ path)
    name: Option<String>,
    /// Local directory path to mount
    path: Option<String>,
    /// Unmount (remove) the specified mount
    #[arg(short = 'u', long)]
    unmount: bool,
    /// List all mounts
    #[arg(short, long)]
    list: bool,
}

impl MountArgs {
    pub async fn execute(self, client: EidosClient) -> Result<()> {
        // If -l/--list flag, show list
        if self.list {
            return list_mounts(client).await;
        }

        // If -u/--unmount flag, remove mount
        if self.unmount {
            let name = self
                .name
                .ok_or_else(|| anyhow::anyhow!("Mount name required for unmount"))?;
            return remove_mount(client, &name, false).await;
        }

        // If both name and path provided, add mount
        match (self.name, self.path) {
            (Some(name), Some(path)) => add_mount(client, &name, &path).await,
            (Some(name), None) => {
                // Only name provided - show info for this mount
                show_mount_info(client, &name).await
            }
            (None, None) => {
                // No args - list all mounts
                list_mounts(client).await
            }
            (None, Some(_)) => {
                anyhow::bail!("Mount name required when path is specified")
            }
        }
    }
}

/// Get all mounts from the database
async fn get_mounts(client: &EidosClient) -> Result<Vec<MountInfo>> {
    let result: Value = client
        .call(
            "exec2",
            vec![serde_json::json!(
                "SELECT key, value, created_at, updated_at FROM eidos__kv WHERE key LIKE 'eidos:space:files:mount:%'"
            )],
        )
        .await
        .context("Failed to query mounts")?;

    let rows = result.as_array().cloned().unwrap_or_default();
    let mut mounts = Vec::new();

    for row in rows {
        let key = row["key"].as_str().unwrap_or("");
        let name = key.strip_prefix("eidos:space:files:mount:").unwrap_or(key);
        let path = row["value"].as_str().unwrap_or("");
        let created_at = row["created_at"].as_str().unwrap_or("-");
        let updated_at = row["updated_at"].as_str().unwrap_or("-");

        mounts.push(MountInfo {
            name: name.to_string(),
            path: path.to_string(),
            created_at: created_at.to_string(),
            updated_at: updated_at.to_string(),
        });
    }

    Ok(mounts)
}

#[derive(Debug)]
struct MountInfo {
    name: String,
    path: String,
    created_at: String,
    updated_at: String,
}

async fn show_mount_info(client: EidosClient, name: &str) -> Result<()> {
    let mounts = get_mounts(&client).await?;
    
    let mount = mounts
        .iter()
        .find(|m| m.name == name)
        .ok_or_else(|| anyhow::anyhow!("Mount '{}' not found", name))?;
    
    println!("{} {}", "Mount:".bold(), mount.name.cyan());
    println!("  {}: {}", "Path".dimmed(), mount.path);
    println!("  {}: /@/{}/", "Access".dimmed(), mount.name);
    println!("  {}: {}", "Created".dimmed(), mount.created_at.dimmed());
    
    Ok(())
}

async fn list_mounts(client: EidosClient) -> Result<()> {
    let mounts = get_mounts(&client).await?;

    if mounts.is_empty() {
        println!("{}", "No mounts found.".yellow());
        println!("\n{} Use 'eidos mount add <name> <path>' to add a mount.",
            "Tip:".dimmed());
        return Ok(());
    }

    // Calculate column widths
    let mut max_name_width = 4; // "Name".len()
    let mut max_path_width = 4; // "Path".len()

    for mount in &mounts {
        max_name_width = max_name_width.max(mount.name.width());
        max_path_width = max_path_width.max(mount.path.width());
    }

    max_name_width += 2;
    max_path_width += 2;

    // Print header
    println!(
        "{} {} {}",
        pad_to_width(&"Name".dimmed().to_string(), max_name_width),
        pad_to_width(&"Path".dimmed().to_string(), max_path_width),
        "Access Path".dimmed()
    );

    // Print rows
    for mount in mounts {
        let access_path = format!("/@/{}/", mount.name);
        println!(
            "{} {} {}",
            pad_to_width(&mount.name.cyan().to_string(), max_name_width),
            pad_to_width(&mount.path, max_path_width),
            access_path.dimmed()
        );
    }

    Ok(())
}

async fn add_mount(client: EidosClient, name: &str, path: &str) -> Result<()> {
    // Validate mount name (no spaces, no special chars except - and _)
    if !is_valid_mount_name(name) {
        anyhow::bail!(
            "Invalid mount name '{}'. Use only letters, numbers, hyphens, and underscores.",
            name
        );
    }

    // Resolve path (~ expansion + absolute path)
    let absolute_path = resolve_path(path)?;

    if !absolute_path.is_dir() {
        anyhow::bail!("Path is not a directory: {}", absolute_path.display());
    }

    let path_str = absolute_path.to_string_lossy().to_string();

    // Check if mount already exists
    let mounts = get_mounts(&client).await?;
    if mounts.iter().any(|m| m.name == name) {
        anyhow::bail!(
            "Mount '{}' already exists. Use 'eidos mount update {} <path>' to update.",
            name,
            name
        );
    }

    // Create mount metadata
    let now = chrono::Utc::now().to_rfc3339();
    let meta = serde_json::json!({
        "type": "directory",
        "createdAt": now,
        "updatedAt": now,
    });

    // Insert into KV table using exec2
    let key = format!("eidos:space:files:mount:{}", name);
    let sql = format!(
        "INSERT INTO eidos__kv (key, value, meta) VALUES ('{}', '{}', '{}')",
        key,
        path_str.replace("'", "''"),
        meta.to_string().replace("'", "''")
    );

    client
        .call("exec2", vec![serde_json::json!(sql)])
        .await
        .context("Failed to add mount")?;

    println!(
        "{} Mounted '{}' -> {} (access via /@/{}/)",
        "✓".green(),
        name.cyan(),
        path_str,
        name
    );

    Ok(())
}

async fn remove_mount(client: EidosClient, name: &str, yes: bool) -> Result<()> {
    // Check if mount exists
    let mounts = get_mounts(&client).await?;
    if !mounts.iter().any(|m| m.name == name) {
        anyhow::bail!("Mount '{}' not found", name);
    }

    if !yes {
        print!("Remove mount '{}'? [y/N] ", name);
        std::io::Write::flush(&mut std::io::stdout())?;

        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;

        if !input.trim().eq_ignore_ascii_case("y") {
            println!("Cancelled");
            return Ok(());
        }
    }

    let key = format!("eidos:space:files:mount:{}", name);
    let sql = format!("DELETE FROM eidos__kv WHERE key = '{}'", key);

    client
        .call("exec2", vec![serde_json::json!(sql)])
        .await
        .context("Failed to remove mount")?;

    println!("{} Unmounted '{}'", "✓".green(), name.cyan());

    Ok(())
}

fn is_valid_mount_name(name: &str) -> bool {
    if name.is_empty() {
        return false;
    }
    name.chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_mount_names() {
        assert!(is_valid_mount_name("audio"));
        assert!(is_valid_mount_name("my-books"));
        assert!(is_valid_mount_name("my_books"));
        assert!(is_valid_mount_name("books123"));
    }

    #[test]
    fn test_invalid_mount_names() {
        assert!(!is_valid_mount_name(""));
        assert!(!is_valid_mount_name("my books"));
        assert!(!is_valid_mount_name("books/123"));
        assert!(!is_valid_mount_name("books@123"));
    }

    #[test]
    fn test_resolve_path_home_expansion() {
        // Test that ~ gets expanded to home directory (if home exists)
        let home = dirs::home_dir().unwrap();
        
        // Test ~ alone - should resolve to existing home dir
        let result = resolve_path("~").unwrap();
        assert_eq!(result, home);
    }

    #[test]
    fn test_resolve_path_absolute() {
        // Test that existing absolute paths work
        let result = resolve_path("/").unwrap();
        assert!(result.is_absolute());
        assert_eq!(result, Path::new("/"));
    }
}
