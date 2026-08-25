use std::ffi::OsString;
use std::net::IpAddr;
use std::path::PathBuf;

use clap::{Args, Parser, Subcommand, ValueEnum};

#[derive(Debug, Parser)]
#[command(
    name = "eidos",
    version = concat!(env!("CARGO_PKG_VERSION"), " (", env!("GIT_HASH"), ")"),
    about = "Read and modify Eidos File (*.eidos) for people, agents, and automation",
    long_about = "A local command-line interface to the open Eidos File format. It prints readable output by default and stable JSON with --json. It works directly on .eidos files and does not require a running Eidos application."
)]
pub struct Cli {
    /// Emit stable machine-readable JSON instead of human-readable output.
    #[arg(long, global = true)]
    pub json: bool,

    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Sign in to Eidos and store a renewable CLI session securely.
    Login(AccountArgs),
    /// Show the Eidos account currently available to the CLI.
    Whoami(AccountArgs),
    /// Remove the stored Eidos CLI session from this device.
    Logout(AccountArgs),
    /// Upgrade this Eidos CLI installation from a verified release.
    Upgrade(UpgradeArgs),
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
    /// Create, update, delete, or reorder saved Views atomically.
    #[command(name = "view-apply")]
    ViewApply(ViewApplyArgs),
    /// Serve a local web editor for one file over HTTP.
    Serve(ServeArgs),
    /// Publish an immutable Eidos File or Markdown document.
    Publish(PublishArgs),
    /// Import committed responses from a published Form into its Eidos File.
    Collect(CollectArgs),
}

#[derive(Debug, Args)]
pub struct AccountArgs {
    /// Eidos account issuer.
    #[arg(
        long,
        env = "EIDOS_ACCOUNT_ORIGIN",
        default_value = "https://eidos.space"
    )]
    pub account_origin: String,
}

#[derive(Debug, Args)]
pub struct UpgradeArgs {
    /// Exact CLI version. Defaults to the latest stable release.
    #[arg(long, value_name = "SEMVER")]
    pub version: Option<String>,
    /// Reinstall the current version or explicitly allow a downgrade.
    #[arg(long)]
    pub force: bool,
}

#[derive(Debug, Args)]
pub struct ServeArgs {
    pub file: PathBuf,
    #[arg(long, default_value_t = 8420)]
    pub port: u16,
    /// Make the editor available on one private LAN interface.
    #[arg(long)]
    pub lan: bool,
    /// Publish the editor through the Eidos Relay service. Requires an Eidos account.
    #[arg(long, conflicts_with = "lan")]
    pub relay: bool,
    /// Allow guest browsers to pair with a secret link instead of requiring the owner account.
    #[arg(long, requires = "relay")]
    pub share: bool,
    /// Private LAN or overlay-network address to bind. Requires --lan.
    #[arg(long, requires = "lan", value_name = "IP")]
    pub host: Option<IpAddr>,
    /// Serve the web editor from this directory instead of the embedded UI.
    #[arg(long)]
    pub ui_dir: Option<PathBuf>,
    /// Explicitly mount an existing folder for assets/<name> File entries.
    #[arg(long, value_name = "DIR")]
    pub assets_dir: Option<PathBuf>,
    /// Open the served URL in the default browser.
    #[arg(long)]
    pub open: bool,
    /// Run the strict read-only profile used by the hosted Publish service.
    #[arg(
        long,
        conflicts_with_all = ["lan", "relay", "share", "host", "ui_dir", "assets_dir", "open"]
    )]
    pub publish: bool,
    /// Eidos account issuer used by --relay.
    #[arg(
        long,
        env = "EIDOS_ACCOUNT_ORIGIN",
        default_value = "https://eidos.space",
        requires = "relay"
    )]
    pub account_origin: String,
    /// Eidos Relay control origin used by --relay.
    #[arg(
        long,
        env = "EIDOS_RELAY_ORIGIN",
        default_value = "https://relay.eidos.ink",
        requires = "relay"
    )]
    pub relay_origin: String,
}

#[derive(Debug, Args)]
pub struct PublishArgs {
    /// Local .eidos, .md, or .markdown source.
    pub file: PathBuf,
    /// Publish one Form View from an Eidos File instead of the whole File.
    #[arg(long, value_name = "VIEW_ID_OR_NAME")]
    pub form_view: Option<String>,
    /// Who may submit a published Form.
    #[arg(long, value_enum, requires = "form_view")]
    pub form_respondents: Option<FormRespondentAccessArg>,
    /// Allow each signed-in eidos.space user to submit only once.
    #[arg(long, requires = "form_view")]
    pub one_response_per_user: bool,
    /// Filesystem root used to resolve relative attachments.
    #[arg(long, value_name = "DIR", hide = true)]
    pub attachment_root: Option<PathBuf>,
    /// Graft SQLite page delta generated by Eidos Lite.
    #[arg(long, value_name = "FILE", hide = true, requires = "graft_base_sha256")]
    pub graft_delta: Option<PathBuf>,
    /// SHA-256 of the previously published Eidos source used as the delta base.
    #[arg(long, value_name = "SHA256", hide = true, requires = "graft_delta")]
    pub graft_base_sha256: Option<String>,
    /// Tenant-local URL path for this published resource.
    #[arg(long)]
    pub slug: String,
    /// Public or private viewer access. Hosted publishing requires Publish.
    #[arg(long, value_enum, default_value_t = PublishVisibilityArg::Public)]
    pub visibility: PublishVisibilityArg,
    /// Protect this Publication with a password. The CLI prompts without echo.
    #[arg(long, conflicts_with = "remove_password")]
    pub password: bool,
    /// Remove password protection and make this Publication public.
    #[arg(long, conflicts_with = "password")]
    pub remove_password: bool,
    /// Hide the Built with Eidos badge.
    #[arg(long, conflicts_with = "show_branding")]
    pub hide_branding: bool,
    /// Show the Built with Eidos badge on this Publication.
    #[arg(long, conflicts_with = "hide_branding")]
    pub show_branding: bool,
    /// Create a ready Version without moving the Publication pointer.
    #[arg(long)]
    pub no_activate: bool,
    /// Publish control origin.
    #[arg(
        long,
        env = "EIDOS_PUBLISH_ORIGIN",
        default_value = "https://publish.eidos.space"
    )]
    pub publish_origin: String,
    /// Publish CLI key. Prefer the EIDOS_PUBLISH_TOKEN environment variable.
    #[arg(long, env = "EIDOS_PUBLISH_TOKEN", hide_env_values = true)]
    pub token: String,
    /// Maximum time to wait for validation, Runtime preparation, and activation.
    #[arg(long, default_value_t = 1_800)]
    pub wait_seconds: u64,
    /// Emit newline-delimited Publish progress events to stderr.
    #[arg(long, hide = true)]
    pub progress_json: bool,
}

#[derive(Debug, Args)]
pub struct CollectArgs {
    /// Local .eidos file that owns the published Form View.
    pub file: PathBuf,
    /// Stable Publication ID returned by `eidos publish --form-view`.
    #[arg(long, value_name = "UUID")]
    pub publication: String,
    /// Filesystem root used for downloaded File-field attachments.
    #[arg(long, value_name = "DIR")]
    pub attachment_root: Option<PathBuf>,
    /// Stable Collector ID. Lite persists this; a one-shot CLI run generates one.
    #[arg(long, value_name = "ID", hide = true)]
    pub collector_id: Option<String>,
    /// Existing Collector generation. Lite uses this for background collection without takeover.
    #[arg(long, value_name = "NUMBER", hide = true)]
    pub collector_generation: Option<u64>,
    /// Maximum submissions imported per lease request.
    #[arg(long, default_value_t = 50, value_parser = clap::value_parser!(u16).range(1..=100))]
    pub batch_size: u16,
    /// Publish control origin.
    #[arg(
        long,
        env = "EIDOS_PUBLISH_ORIGIN",
        default_value = "https://publish.eidos.space"
    )]
    pub publish_origin: String,
    /// Publish CLI key. Prefer the EIDOS_PUBLISH_TOKEN environment variable.
    #[arg(long, env = "EIDOS_PUBLISH_TOKEN", hide_env_values = true)]
    pub token: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
#[value(rename_all = "lower")]
pub enum PublishVisibilityArg {
    Public,
    Private,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
#[value(rename_all = "kebab-case")]
pub enum FormRespondentAccessArg {
    Anyone,
    SignedIn,
}

impl FormRespondentAccessArg {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Anyone => "anyone",
            Self::SignedIn => "signed_in",
        }
    }
}

impl PublishVisibilityArg {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Public => "public",
            Self::Private => "private",
        }
    }
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

#[derive(Debug, Args)]
pub struct ViewApplyArgs {
    pub file: PathBuf,
    /// View mutation request JSON. Accepts inline JSON, @path, or stdin (-).
    pub request: String,
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
    "view-apply",
    "serve",
    "publish",
];

/// Accept the ergonomic `eidos file.eidos query ...` form while keeping the
/// clap model conventional (`eidos query file.eidos ...`).
pub fn normalize_args(mut args: Vec<OsString>) -> Vec<OsString> {
    if args.len() < 3 {
        return args;
    }
    let Some(file_index) =
        args.iter().enumerate().skip(1).find_map(|(index, value)| {
            (!value.to_string_lossy().starts_with('-')).then_some(index)
        })
    else {
        return args;
    };
    let candidate = args[file_index].to_string_lossy();
    if candidate.starts_with('-')
        || COMMANDS.contains(&candidate.as_ref())
        || !candidate.to_ascii_lowercase().ends_with(".eidos")
    {
        return args;
    }
    let Some(command_index) =
        args.iter()
            .enumerate()
            .skip(file_index + 1)
            .find_map(|(index, value)| {
                let value = value.to_string_lossy();
                COMMANDS.contains(&value.as_ref()).then_some(index)
            })
    else {
        return args;
    };
    let file = args.remove(file_index);
    let adjusted_command_index = command_index - 1;
    args.insert(adjusted_command_index + 1, file);
    args
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_publish_command() {
        let cli = Cli::try_parse_from([
            "eidos",
            "publish",
            "example.eidos",
            "--slug",
            "team-wiki",
            "--attachment-root",
            "/workspace",
            "--token",
            "secret",
            "--no-activate",
        ])
        .expect("parse Publish command");
        let Command::Publish(args) = cli.command else {
            panic!("expected Publish command")
        };
        assert_eq!(args.file, PathBuf::from("example.eidos"));
        assert_eq!(args.form_view, None);
        assert_eq!(args.form_respondents, None);
        assert!(!args.one_response_per_user);
        assert_eq!(args.slug, "team-wiki");
        assert_eq!(args.attachment_root, Some(PathBuf::from("/workspace")));
        assert!(args.no_activate);
        assert_eq!(args.visibility, PublishVisibilityArg::Public);
        assert!(!args.password);
        assert!(!args.remove_password);
        assert!(!args.hide_branding);
        assert!(!args.show_branding);
        assert_eq!(args.wait_seconds, 1_800);
        assert!(!args.progress_json);
    }

    #[test]
    fn parses_machine_readable_publish_progress() {
        let cli = Cli::try_parse_from([
            "eidos",
            "--json",
            "publish",
            "example.eidos",
            "--slug",
            "team-wiki",
            "--token",
            "secret",
            "--progress-json",
        ])
        .expect("parse Publish progress mode");
        let Command::Publish(args) = cli.command else {
            panic!("expected Publish command")
        };
        assert!(args.progress_json);
    }

    #[test]
    fn parses_publish_branding_controls() {
        let hidden = Cli::try_parse_from([
            "eidos",
            "publish",
            "example.eidos",
            "--slug",
            "team-wiki",
            "--token",
            "secret",
            "--hide-branding",
        ])
        .expect("parse hidden Publish branding");
        let Command::Publish(hidden) = hidden.command else {
            panic!("expected Publish command")
        };
        assert!(hidden.hide_branding);
        assert!(!hidden.show_branding);

        let conflict = Cli::try_parse_from([
            "eidos",
            "publish",
            "example.eidos",
            "--slug",
            "team-wiki",
            "--token",
            "secret",
            "--hide-branding",
            "--show-branding",
        ])
        .expect_err("branding flags must conflict");
        assert_eq!(conflict.kind(), clap::error::ErrorKind::ArgumentConflict);
    }

    #[test]
    fn parses_password_protected_publish_without_exposing_a_cli_value() {
        let cli = Cli::try_parse_from([
            "eidos",
            "publish",
            "example.eidos",
            "--slug",
            "team-wiki",
            "--token",
            "secret",
            "--password",
        ])
        .expect("parse password Publish command");
        let Command::Publish(args) = cli.command else {
            panic!("expected Publish command")
        };
        assert!(args.password);
        let error = Cli::try_parse_from([
            "eidos",
            "publish",
            "example.eidos",
            "--slug",
            "team-wiki",
            "--password-value",
            "must-not-be-accepted",
        ])
        .expect_err("password values must not be accepted as command arguments");
        assert_eq!(error.kind(), clap::error::ErrorKind::UnknownArgument);
    }

    #[test]
    fn parses_form_publish_and_collect_commands() {
        let publish = Cli::try_parse_from([
            "eidos",
            "publish",
            "forms.eidos",
            "--form-view",
            "Feedback",
            "--slug",
            "feedback",
            "--token",
            "secret",
        ])
        .expect("parse Form Publish command");
        let Command::Publish(args) = publish.command else {
            panic!("expected Publish command")
        };
        assert_eq!(args.form_view.as_deref(), Some("Feedback"));

        let restricted = Cli::try_parse_from([
            "eidos",
            "publish",
            "forms.eidos",
            "--form-view",
            "Feedback",
            "--form-respondents",
            "signed-in",
            "--one-response-per-user",
            "--slug",
            "feedback",
            "--token",
            "secret",
        ])
        .expect("parse restricted Form Publish command");
        let Command::Publish(restricted) = restricted.command else {
            panic!("expected Publish command")
        };
        assert_eq!(
            restricted.form_respondents,
            Some(FormRespondentAccessArg::SignedIn)
        );
        assert!(restricted.one_response_per_user);

        let collect = Cli::try_parse_from([
            "eidos",
            "collect",
            "forms.eidos",
            "--publication",
            "7300a083-df92-49d8-945d-1e0bae0eac18",
            "--token",
            "secret",
        ])
        .expect("parse Collect command");
        let Command::Collect(args) = collect.command else {
            panic!("expected Collect command")
        };
        assert_eq!(args.batch_size, 50);
        assert_eq!(args.file, PathBuf::from("forms.eidos"));
        assert_eq!(args.collector_generation, None);

        let background_collect = Cli::try_parse_from([
            "eidos",
            "collect",
            "forms.eidos",
            "--publication",
            "7300a083-df92-49d8-945d-1e0bae0eac18",
            "--collector-id",
            "eidos-lite-12345678901234567890123456789012",
            "--collector-generation",
            "7",
            "--token",
            "secret",
        ])
        .expect("parse background Collect command");
        let Command::Collect(args) = background_collect.command else {
            panic!("expected Collect command")
        };
        assert_eq!(args.collector_generation, Some(7));
    }
}
