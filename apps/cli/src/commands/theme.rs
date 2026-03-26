use anyhow::{Context, Result};
use clap::Subcommand;
use colored::Colorize;
use serde_json::json;
use std::fs;

use crate::client::EidosClient;
use crate::config::Config;

/// Theme management commands
#[derive(Subcommand)]
pub enum ThemeCommands {
    /// List all themes
    List,

    /// Show current theme
    Current,

    /// Switch to a theme (or reset to default if no name provided)
    Use {
        /// Theme name
        name: Option<String>,
    },

    /// Get theme CSS content
    Get {
        /// Theme name
        name: String,
    },

    /// Install a theme from a CSS file
    Install {
        /// Theme name
        name: String,
        /// Path to the CSS file
        file: String,
    },

    /// Uninstall a theme
    Uninstall {
        /// Theme name
        name: String,
    },
}

impl ThemeCommands {
    pub async fn execute(self, client: EidosClient, config: &Config) -> Result<()> {
        let space_id = config
            .space_id
            .clone()
            .context("No space selected. Change to a space directory or use -s <space-id>")?;

        match self {
            ThemeCommands::List => list_themes(client, space_id).await,
            ThemeCommands::Current => current_theme(client, space_id).await,
            ThemeCommands::Use { name } => set_current_theme(client, space_id, name).await,
            ThemeCommands::Get { name } => get_theme(client, space_id, name).await,
            ThemeCommands::Install { name, file } => install_theme(client, space_id, name, file).await,
            ThemeCommands::Uninstall { name } => uninstall_theme(client, space_id, name).await,
        }
    }
}

async fn list_themes(client: EidosClient, space_id: String) -> Result<()> {
    let result = client
        .call_for_space(&space_id, "theme.list", vec![])
        .await?;

    let themes: Vec<String> = serde_json::from_value(result)
        .context("Failed to parse theme list")?;

    if themes.is_empty() {
        println!("{}", "No custom themes found.".yellow());
        return Ok(());
    }

    println!("{}", "Available themes:".bold().underline());
    for theme in themes {
        println!("  - {}", theme.cyan());
    }

    Ok(())
}

async fn current_theme(client: EidosClient, space_id: String) -> Result<()> {
    let result = client
        .call_for_space(&space_id, "theme.getCurrent", vec![])
        .await?;

    if result.is_null() {
        println!("Current theme: {}", "default".green());
    } else if let Some(name) = result.as_str() {
        println!("Current theme: {}", name.cyan());
    } else {
        println!("Current theme: {}", "unknown".yellow());
    }
    
    Ok(())
}

async fn set_current_theme(client: EidosClient, space_id: String, name: Option<String>) -> Result<()> {
    let param = match &name {
        Some(n) => json!(n),
        None => serde_json::Value::Null,
    };

    client
        .call_for_space(&space_id, "theme.setCurrent", vec![param])
        .await?;

    if let Some(n) = name {
        println!("{} {}", "✓".green(), format!("Theme set to {}", n.cyan()));
    } else {
        println!("{} {}", "✓".green(), "Theme reset to default");
    }

    Ok(())
}

async fn get_theme(client: EidosClient, space_id: String, name: String) -> Result<()> {
    let result = client
        .call_for_space(&space_id, "theme.get", vec![json!(name)])
        .await?;

    if result.is_null() {
        return Err(anyhow::anyhow!("Theme '{}' not found", name));
    }

    if let Some(css) = result.as_str() {
        println!("{}", css);
    }

    Ok(())
}

async fn install_theme(client: EidosClient, space_id: String, name: String, file: String) -> Result<()> {
    let css_content = fs::read_to_string(&file)
        .with_context(|| format!("Failed to read theme file '{}'", file))?;

    client
        .call_for_space(&space_id, "theme.install", vec![json!(name), json!(css_content)])
        .await?;

    println!("{} {}", "✓".green(), format!("Theme '{}' installed successfully", name.cyan()));
    Ok(())
}

async fn uninstall_theme(client: EidosClient, space_id: String, name: String) -> Result<()> {
    client
        .call_for_space(&space_id, "theme.uninstall", vec![json!(name)])
        .await?;

    println!("{} {}", "✓".green(), format!("Theme '{}' uninstalled successfully", name.cyan()));
    Ok(())
}
