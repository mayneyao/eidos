mod client;
mod commands;
mod config;
mod utils;

use anyhow::Result;
use clap::Parser;
use colored::Colorize;
use tracing::debug;

use crate::client::EidosClient;
use crate::commands::Commands;
use crate::config::{Config, SpaceRegistry};

/// Eidos CLI - Command-line interface for Eidos Desktop
#[derive(Parser)]
#[command(name = "eidos")]
#[command(about = "Command-line interface for Eidos")]
#[command(version = env!("CARGO_PKG_VERSION"))]
struct Cli {
    /// Available commands
    #[command(subcommand)]
    command: Commands,

    /// Eidos Desktop endpoint
    #[arg(short, long, global = true, env = "EIDOS_ENDPOINT")]
    endpoint: Option<String>,

    /// Space ID (overrides current space)
    #[arg(short, long, global = true, env = "EIDOS_SPACE")]
    space: Option<String>,

    /// API key for authentication
    #[arg(long, global = true, env = "EIDOS_API_KEY")]
    api_key: Option<String>,

    /// Output format
    #[arg(short = 'f', long, global = true, value_enum, default_value = "table")]
    format: crate::utils::OutputFormat,

    /// Quiet mode (no interactive output)
    #[arg(short, long, global = true)]
    quiet: bool,

    /// Verbose output
    #[arg(short, long, global = true, action = clap::ArgAction::Count)]
    verbose: u8,
}

#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("{} {}", "Error:".red().bold(), e);
        std::process::exit(1);
    }
}

async fn run() -> Result<()> {
    let cli = Cli::parse();

    // Initialize logging
    init_logging(cli.verbose);

    // Load configuration
    let mut config = Config::load()?;
    debug!("Loaded config: {:?}", config);

    // Apply CLI overrides (highest priority)
    if let Some(endpoint) = cli.endpoint {
        config.endpoint = endpoint;
    }
    // Space resolution priority:
    // 1. CLI override (`-s/--space`)
    // 2. Auto-detection from current directory
    // 3. Saved space from config file (fallback)
    if let Some(space) = cli.space {
        config.space_id = Some(space);
    } else if let Some(detected_space) = SpaceRegistry::current_dir_space() {
        debug!("Auto-detected space '{}' from current directory", detected_space);
        config.space_id = Some(detected_space);
    }

    if let Some(api_key) = cli.api_key {
        config.api_key = Some(api_key);
    }

    // Create HTTP client
    let client = EidosClient::new(config.clone())?;

    // Execute command
    cli.command.execute(client, &mut config, cli.format).await?;

    Ok(())
}

fn init_logging(verbose: u8) {
    let level = match verbose {
        0 => "warn",
        1 => "info",
        2 => "debug",
        _ => "trace",
    };

    tracing_subscriber::fmt()
        .with_env_filter(format!("eidos={}", level))
        .with_target(false)
        .without_time()
        .init();
}

// Re-export for tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cli_parse() {
        let cli = Cli::try_parse_from(["eidos", "status"]).unwrap();
        assert!(matches!(cli.command, Commands::Status));
    }

    #[test]
    fn test_cli_list() {
        let cli = Cli::try_parse_from(["eidos", "ls", "/folder"]).unwrap();
        assert!(matches!(cli.command, Commands::List { .. }));
    }

    #[test]
    fn test_cli_mount() {
        let cli = Cli::try_parse_from(["eidos", "mount", "ls"]).unwrap();
        assert!(matches!(cli.command, Commands::Mount(_)));
    }

    #[test]
    fn test_cli_table() {
        let cli = Cli::try_parse_from(["eidos", "table", "tb_xxxx"]).unwrap();
        assert!(matches!(cli.command, Commands::Table { table: Some(_), cmd: None }));
    }
}
