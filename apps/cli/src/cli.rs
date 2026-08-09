use std::ffi::OsString;
use std::net::IpAddr;
use std::path::PathBuf;

use clap::{Args, Parser, Subcommand, ValueEnum};

#[derive(Debug, Parser)]
#[command(
    name = "eidos",
    version = concat!(env!("CARGO_PKG_VERSION"), " (", env!("GIT_HASH"), ")"),
    about = "Read and modify Eidos File (*.eidos) for agents and automation",
    long_about = "A JSON-only, agent-first interface to the open Eidos File format. It works directly on .eidos files and does not require a running Eidos application."
)]
pub struct Cli {
    /// Explicitly request JSON. JSON is always the default and only output format.
    #[arg(long, global = true)]
    pub json: bool,

    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Create a new Eidos File, optionally with an initial table.
    Create(CreateArgs),
    /// Inspect file identity, revision, and capabilities.
    Inspect(FileArgs),
    /// List tables in a file.
    Tables(FileArgs),
    /// Read the complete logical schema or one table.
    Schema(SchemaArgs),
    /// Read compact schema and rows for one agent working context.
    Context(ContextArgs),
    /// Query logical rows from one table.
    Query(QueryArgs),
    /// Match and update rows with revision checking and pre-commit validation.
    Apply(ApplyArgs),
    /// Add, update, or delete rows atomically.
    Rows(RowsArgs),
    /// Validate file identity, structure, and content.
    Validate(ValidateArgs),
    /// Apply one revision-checked schema operation.
    #[command(name = "schema-apply")]
    SchemaApply(SchemaApplyArgs),
    /// Serve a local web editor for one file over HTTP.
    Serve(ServeArgs),
}

#[derive(Debug, Args)]
pub struct ServeArgs {
    pub file: PathBuf,
    #[arg(long, default_value_t = 8420)]
    pub port: u16,
    /// Make the editor available on one private LAN interface.
    #[arg(long)]
    pub lan: bool,
    /// Private LAN or overlay-network address to bind. Requires --lan.
    #[arg(long, requires = "lan", value_name = "IP")]
    pub host: Option<IpAddr>,
    /// Serve the web editor from this directory instead of the embedded UI.
    #[arg(long)]
    pub ui_dir: Option<PathBuf>,
    /// Open the served URL in the default browser.
    #[arg(long)]
    pub open: bool,
}

#[derive(Debug, Args)]
pub struct FileArgs {
    pub file: PathBuf,
}

#[derive(Debug, Args)]
pub struct CreateArgs {
    pub file: PathBuf,
    #[arg(long)]
    pub title: Option<String>,
    #[arg(long, requires = "fields")]
    pub table: Option<String>,
    /// JSON array of initial fields. Accepts inline JSON, @path, or - for stdin.
    #[arg(long, requires = "table")]
    pub fields: Option<String>,
    /// Initial record-label field name. Defaults to the first compatible field.
    #[arg(long)]
    pub label_field: Option<String>,
}

#[derive(Debug, Args)]
pub struct SchemaArgs {
    pub file: PathBuf,
    pub table: Option<String>,
}

#[derive(Debug, Args)]
pub struct ContextArgs {
    pub file: PathBuf,
    /// Table name or stable ID. Defaults to the File default or its only table.
    pub table: Option<String>,
    /// FilterNode JSON. Field references may be names or stable IDs.
    #[arg(long = "where")]
    pub where_json: Option<String>,
    /// SortTerm JSON array. Each item accepts field or fieldId.
    #[arg(long)]
    pub sort: Option<String>,
    /// ASCII-folded search text.
    #[arg(long)]
    pub search: Option<String>,
    /// Comma-separated fields searched by --search.
    #[arg(long, value_delimiter = ',')]
    pub search_fields: Vec<String>,
    /// Comma-separated projected fields. _id is always returned.
    #[arg(long, value_delimiter = ',')]
    pub fields: Vec<String>,
    #[arg(long, default_value_t = 20)]
    pub limit: u32,
    #[arg(long, default_value_t = 0)]
    pub offset: u32,
    /// Include stable IDs, system fields, settings, relations, and views.
    #[arg(long)]
    pub full: bool,
}

#[derive(Debug, Args)]
pub struct QueryArgs {
    pub file: PathBuf,
    pub table: String,
    /// FilterNode JSON. Field references may be names or stable IDs.
    #[arg(long = "where")]
    pub where_json: Option<String>,
    /// SortTerm JSON array. Each item accepts field or fieldId.
    #[arg(long)]
    pub sort: Option<String>,
    /// ASCII-folded search text.
    #[arg(long)]
    pub search: Option<String>,
    /// Comma-separated fields searched by --search.
    #[arg(long, value_delimiter = ',')]
    pub search_fields: Vec<String>,
    /// Comma-separated projected fields. _id is always returned.
    #[arg(long, value_delimiter = ',')]
    pub fields: Vec<String>,
    #[arg(long, default_value_t = 100)]
    pub limit: u32,
    #[arg(long, default_value_t = 0)]
    pub offset: u32,
}

#[derive(Debug, Args)]
pub struct ApplyArgs {
    pub file: PathBuf,
    /// Apply request JSON. Accepts inline JSON, @path, or - for stdin.
    pub request: String,
}

#[derive(Debug, Args)]
pub struct RowsArgs {
    pub file: PathBuf,
    #[command(subcommand)]
    pub command: RowCommand,
}

#[derive(Debug, Subcommand)]
pub enum RowCommand {
    /// Add one object or an array of objects.
    Add(RowAddArgs),
    /// Update one row with a sparse values object.
    Update(RowUpdateArgs),
    /// Delete one or more row IDs atomically.
    Delete(RowDeleteArgs),
}

#[derive(Debug, Args)]
pub struct RowAddArgs {
    pub table: String,
    #[arg(long)]
    pub expected_revision: String,
    /// JSON object/array of values. Accepts inline JSON, @path, or - for stdin.
    #[arg(long)]
    pub values: String,
}

#[derive(Debug, Args)]
pub struct RowUpdateArgs {
    pub table: String,
    pub row_id: String,
    #[arg(long)]
    pub expected_revision: String,
    /// Sparse values object. Accepts inline JSON, @path, or - for stdin.
    #[arg(long)]
    pub values: String,
}

#[derive(Debug, Args)]
pub struct RowDeleteArgs {
    pub table: String,
    #[arg(required = true)]
    pub row_ids: Vec<String>,
    #[arg(long)]
    pub expected_revision: String,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
pub enum ValidationLevelArg {
    Identity,
    Structural,
    Content,
    Semantic,
    Full,
}

#[derive(Debug, Args)]
pub struct ValidateArgs {
    pub file: PathBuf,
    #[arg(long, value_enum, default_value = "full")]
    pub level: ValidationLevelArg,
    #[arg(long, default_value_t = 100)]
    pub diagnostics_limit: usize,
}

#[derive(Debug, Args)]
pub struct SchemaApplyArgs {
    pub file: PathBuf,
    /// Schema operation JSON. Accepts logical names, inline JSON, @path, or stdin (-).
    #[arg(long)]
    pub op: String,
    #[arg(long)]
    pub expected_revision: String,
    /// Validate and plan inside a transaction, then roll it back.
    #[arg(long)]
    pub dry_run: bool,
}

const COMMANDS: &[&str] = &[
    "create",
    "inspect",
    "tables",
    "schema",
    "context",
    "query",
    "apply",
    "rows",
    "validate",
    "schema-apply",
    "serve",
];

/// Accept the ergonomic `eidos file.eidos query ...` form while keeping the
/// clap model conventional (`eidos query file.eidos ...`).
pub fn normalize_args(mut args: Vec<OsString>) -> Vec<OsString> {
    if args.len() < 3 {
        return args;
    }
    let candidate = args[1].to_string_lossy();
    if candidate.starts_with('-')
        || COMMANDS.contains(&candidate.as_ref())
        || !candidate.to_ascii_lowercase().ends_with(".eidos")
    {
        return args;
    }
    let Some(command_index) = args.iter().enumerate().skip(2).find_map(|(index, value)| {
        let value = value.to_string_lossy();
        COMMANDS.contains(&value.as_ref()).then_some(index)
    }) else {
        return args;
    };
    let file = args.remove(1);
    let adjusted_command_index = command_index - 1;
    args.insert(adjusted_command_index + 1, file);
    args
}
