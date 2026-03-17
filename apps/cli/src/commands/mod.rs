pub mod completions;
pub mod ext;
pub mod space;
pub mod status;

use anyhow::Result;
use clap::Subcommand;

use crate::client::EidosClient;
use crate::config::Config;

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

    /// View node content (doc: markdown, table: CSV)
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

    /// Space management commands
    #[command(subcommand)]
    Space(space::SpaceCommands),

    /// Extension management commands
    #[command(subcommand)]
    Ext(ext::ExtCommands),

    /// Check Eidos Desktop status
    Status,

    /// Generate shell completions
    #[command(hide = true)]
    Completions {
        shell: clap_complete::Shell,
    },
}

// Re-export command functions
mod node_impl;

impl Commands {
    pub async fn execute(self, client: EidosClient, config: &mut Config) -> Result<()> {
        // Ensure space is selected for node operations
        let needs_space = matches!(self, 
            Commands::List { .. } | Commands::View { .. } | Commands::Mkdir { .. } |
            Commands::Touch { .. } | Commands::Move { .. } |
            Commands::Remove { .. } | Commands::Sql { .. }
        );
        
        if needs_space && config.space_id.is_none() {
            return Err(anyhow::anyhow!("No space selected. Use 'eidos space use <space-id>' first."));
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
            Commands::Space(cmd) => cmd.execute(client, config).await,
            Commands::Ext(cmd) => cmd.execute(client, config).await,
            Commands::Status => status::execute(client).await,
            Commands::Completions { shell } => completions::execute(shell),
        }
    }
}
