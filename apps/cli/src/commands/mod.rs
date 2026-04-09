pub mod completions;
pub mod explore;
pub mod ext;
pub mod mount;
pub mod status;
pub mod table;
pub mod theme;

use anyhow::Result;
use clap::Subcommand;

use crate::client::EidosClient;
use crate::config::Config;
use crate::utils::OutputFormat;
use crate::commands::mount::MountArgs;

/// Node operations - filesystem-style commands for Eidos
/// 
/// With name uniqueness enabled, nodes can be addressed by paths like /folder/doc
#[derive(Subcommand)]
pub enum Commands {
    /// List nodes
    #[command(name = "ls")]
    List {
        path: Option<String>,
        #[arg(short, long)]
        long: bool,
    },

    /// View document content (markdown)
    #[command(name = "cat")]
    View {
        path: String,
    },

    /// Create a folder
    #[command(name = "mkdir")]
    Mkdir {
        path: String,
    },

    /// Create a document
    #[command(name = "touch")]
    Touch {
        path: String,
        /// Initial content (can also be piped via stdin)
        #[arg(short, long)]
        content: Option<String>,
    },


    /// Move or rename a node
    #[command(name = "mv")]
    Move {
        src: String,
        dst: String,
    },

    /// Append content to a document
    #[command(name = "append")]
    Append {
        path: String,
        /// Content to append (can also be piped via stdin)
        #[arg(short, long)]
        content: Option<String>,
    },

    /// Remove a node
    #[command(name = "rm")]
    Remove {
        path: String,
        #[arg(short, long)]
        force: bool,
        #[arg(short, long)]
        recursive: bool,
    },

    /// Execute SQL query
    #[command(name = "sql")]
    Sql {
        query: String,
    },

    /// Extension management commands
    #[command(subcommand)]
    Ext(ext::ExtCommands),

    /// Table management commands
    #[command(name = "table", arg_required_else_help = true)]
    Table {
        /// Table ID (if no subcommand is provided, used for import)
        table: Option<String>,

        #[command(subcommand)]
        cmd: Option<table::TableCommands>,
    },

    /// Theme management commands
    #[command(subcommand)]
    Theme(theme::ThemeCommands),

    /// Mount management commands
    /// 
    /// Behaves like Unix mount command:
    ///   eidos mount              # List all mounts
    ///   eidos mount <name> <dir> # Mount directory
    ///   eidos mount -u <name>    # Unmount
    ///   eidos mount -l           # List mounts (explicit)
    #[command(name = "mount")]
    Mount(MountArgs),

    /// Check Eidos Desktop status
    Status,

    /// Explore a URL and capture network requests
    /// 
    /// Uses Eidos Desktop's browser to visit a URL and capture all API calls.
    /// Useful for discovering APIs to create OpenData adapters.
    #[command(name = "explore")]
    Explore(explore::ExploreArgs),

    /// Generate shell completions
    #[command(hide = true)]
    Completions {
        shell: clap_complete::Shell,
    },
}

// Re-export command functions
mod node_impl;

impl Commands {
    pub async fn execute(self, client: EidosClient, config: &mut Config, format: OutputFormat) -> Result<()> {
        // Ensure space is selected for node operations
        let needs_space = matches!(self, 
            Commands::List { .. } | Commands::View { .. } | Commands::Mkdir { .. } |
            Commands::Touch { .. } | Commands::Move { .. } |
            Commands::Remove { .. } | Commands::Sql { .. } |
            Commands::Table { .. } | Commands::Mount(..)
        );
        
        if needs_space && config.space_id.is_none() {
            return Err(anyhow::anyhow!("No space selected. Change to a space directory or use -s <space-id>"));
        }

        match self {
            Commands::List { path, long } => {
                node_impl::cmd_list(client, path, long).await
            }
            Commands::View { path } => {
                node_impl::cmd_view(client, path).await
            }
            Commands::Mkdir { path } => {
                node_impl::cmd_mkdir(client, path).await
            }
            Commands::Touch { path, content } => {
                node_impl::cmd_touch(client, path, content).await
            }
            Commands::Move { src, dst } => {
                node_impl::cmd_move(client, src, dst).await
            }
            Commands::Append { path, content } => {
                node_impl::cmd_append(client, path, content).await
            }
            Commands::Remove { path, force, recursive } => {
                node_impl::cmd_remove(client, path, force, recursive).await
            }
            Commands::Sql { query } => {
                node_impl::cmd_sql(client, query).await
            }
            Commands::Ext(cmd) => cmd.execute(client, config).await,
            Commands::Table { table, cmd } => {
                if let Some(cmd) = cmd {
                    cmd.execute(client, format).await
                } else if let Some(table) = table {
                    // Quick import mode
                    table::TableCommands::Import { 
                        table: table.clone(), 
                        data: None, 
                        file: None 
                    }.execute(client, format).await
                } else {
                    Ok(())
                }
            }
            Commands::Theme(cmd) => cmd.execute(client, config).await,
            Commands::Mount(args) => args.execute(client).await,
            Commands::Status => status::execute(client).await,
            Commands::Explore(args) => explore::execute(args, client, format).await,
            Commands::Completions { shell } => completions::execute(shell),
        }
    }
}
