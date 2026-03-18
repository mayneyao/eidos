use anyhow::{Context, Result};
use clap::Subcommand;
use colored::Colorize;
use unicode_width::UnicodeWidthStr;

use crate::client::EidosClient;
use crate::config::{Config, SpaceRegistry};

/// Strip ANSI escape sequences from string
fn strip_ansi(s: &str) -> String {
    let mut result = String::new();
    let mut chars = s.chars().peekable();
    
    while let Some(ch) = chars.next() {
        if ch == '\x1b' {
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(c) = chars.next() {
                    if c.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
        } else {
            result.push(ch);
        }
    }
    
    result
}

/// Pad string to target display width
fn pad_to_width(s: &str, target_width: usize) -> String {
    let plain = strip_ansi(s);
    let display_width = plain.width();
    if display_width >= target_width {
        s.to_string()
    } else {
        let padding = target_width - display_width;
        format!("{}{}", s, " ".repeat(padding))
    }
}

/// Space management commands
#[derive(Subcommand)]
pub enum SpaceCommands {
    /// List all spaces
    List,

    /// Set current space
    Use {
        /// Space ID
        space_id: String,
    },

    /// Open space in Eidos Desktop
    Open {
        /// Space ID (defaults to current)
        space_id: Option<String>,
    },

    /// Show current space info
    #[command(hide = true)]
    Info {
        /// Space ID (defaults to current)
        space_id: Option<String>,
    },
}

impl SpaceCommands {
    pub async fn execute(self, client: EidosClient, config: &mut Config) -> Result<()> {
        match self {
            SpaceCommands::List => list_spaces(client).await,
            SpaceCommands::Info { space_id } => show_info(client, config, space_id).await,
            SpaceCommands::Use { space_id } => set_current_space(config, space_id).await,
            SpaceCommands::Open { space_id } => open_space(client, config, space_id).await,
        }
    }
}

async fn list_spaces(_client: EidosClient) -> Result<()> {
    let registry = SpaceRegistry::load()?;
    let spaces = registry.list();

    if spaces.is_empty() {
        println!("{}", "No spaces found in ~/.eidos/spaces.json".yellow());
        println!("\n{} Open Eidos Desktop to create or import spaces.", "Tip:".dimmed());
        return Ok(());
    }

    // Calculate column widths
    let mut max_id_width = 2; // "ID".len()
    let mut max_name_width = 4; // "Name".len()
    let mut max_path_width = 4; // "Path".len()
    
    for space in spaces.iter() {
        max_id_width = max_id_width.max(space.id.width());
        max_name_width = max_name_width.max(space.name.width());
        max_path_width = max_path_width.max(space.path.width());
    }
    
    max_id_width += 2;
    max_name_width += 2;
    max_path_width += 2;

    // Print header
    println!("{} {} {}",
        pad_to_width(&"ID".dimmed().to_string(), max_id_width),
        pad_to_width(&"Name".dimmed().to_string(), max_name_width),
        pad_to_width(&"Path".dimmed().to_string(), max_path_width)
    );

    // Print rows
    for space in spaces.iter() {
        println!("{} {} {}",
            pad_to_width(&space.id.cyan().to_string(), max_id_width),
            pad_to_width(&space.name, max_name_width),
            pad_to_width(&space.path, max_path_width)
        );
    }

    Ok(())
}

async fn show_info(
    _client: EidosClient,
    config: &Config,
    space_id: Option<String>,
) -> Result<()> {
    let space_id = space_id
        .or_else(|| config.space_id.clone())
        .context("No space specified. Use --space or set a current space.")?;

    let registry = SpaceRegistry::load()?;
    let space = registry
        .get(&space_id)
        .with_context(|| format!("Space '{}' not found in registry", space_id))?;

    println!("{}", "Space Information".bold().underline());
    println!("  {}: {}", "ID".dimmed(), space.id.cyan());
    println!("  {}: {}", "Name".dimmed(), &space.name);
    println!("  {}: {}", "Path".dimmed(), &space.path);
    
    if let Some(sync) = &space.sync {
        if sync.enabled {
            println!("  {}: {}", "Sync".dimmed(), "enabled".green());
            if let Some(remote) = &sync.remote {
                println!("  {}: {}", "Remote".dimmed(), remote);
            }
        }
    }

    // Check if this space is currently active in config
    if config.space_id.as_ref() == Some(&space_id) {
        println!("  {}: {}", "Status".dimmed(), "current".green());
    }

    Ok(())
}

async fn set_current_space(config: &mut Config, space_id: String) -> Result<()> {
    config.space_id = Some(space_id.clone());
    config.save()?;

    println!("{} {}", "✓".green(), format!("Current space set to: {}", space_id.cyan()));
    Ok(())
}

async fn open_space(
    _client: EidosClient,
    config: &Config,
    space_id: Option<String>,
) -> Result<()> {
    let space_id = space_id
        .or_else(|| config.space_id.clone())
        .context("No space specified. Use --space or set a current space.")?;

    // Check if space exists in registry
    let registry = SpaceRegistry::load()?;
    let space = registry
        .get(&space_id)
        .with_context(|| format!("Space '{}' not found in registry", space_id))?;

    // Use Eidos scheme URL to open in Desktop app
    // Format: eidos://open-space?space=<id>&path=<path>
    let url = format!(
        "eidos://open-space?space={}&path={}",
        urlencoding::encode(&space_id),
        urlencoding::encode(&space.path)
    );
    
    #[cfg(target_os = "macos")]
    let cmd = "open";
    #[cfg(target_os = "linux")]
    let cmd = "xdg-open";
    #[cfg(target_os = "windows")]
    let cmd = "start";

    std::process::Command::new(cmd)
        .arg(&url)
        .spawn()
        .context("Failed to open Eidos app")?;

    println!("{} Opening {} in Eidos ...", "✓".green(), space.name.cyan());
    Ok(())
}
