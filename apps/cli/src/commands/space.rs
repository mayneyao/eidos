use anyhow::{Context, Result};
use clap::Subcommand;
use colored::Colorize;
use comfy_table::{Table, modifiers::UTF8_ROUND_CORNERS, presets::UTF8_FULL};

use crate::client::EidosClient;
use crate::config::{Config, SpaceRegistry};

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

    let mut table = Table::new();
    table
        .set_header(vec!["ID", "Name", "Path"])
        .set_content_arrangement(comfy_table::ContentArrangement::Dynamic)
        .load_preset(UTF8_FULL)
        .apply_modifier(UTF8_ROUND_CORNERS);

    for space in spaces {
        table.add_row(vec![
            space.id.cyan().to_string(),
            space.name.clone(),
            space.path.clone(),
        ]);
    }

    println!("{}", table);
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
