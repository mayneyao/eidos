mod app;
mod attachment;
mod cli;
mod collect;
mod error;
mod output;
mod publish;
mod relay_auth;
mod runtime;
mod skills;
mod upgrade;

use std::ffi::OsString;
use std::io::{self, Write};
use std::process::ExitCode;

use clap::Parser;

use crate::app::CommandOutput;
use crate::cli::{Cli, normalize_args};
use crate::error::AppError;
use crate::output::{write_human, write_human_error};

fn write_json(mut writer: impl Write, value: &serde_json::Value) -> io::Result<()> {
    serde_json::to_writer(&mut writer, value)?;
    writer.write_all(b"\n")
}

fn parse(args: Vec<OsString>) -> Result<Cli, ExitCode> {
    let json = args.iter().any(|arg| arg == "--json");
    match Cli::try_parse_from(normalize_args(args)) {
        Ok(cli) => Ok(cli),
        Err(error) if error.use_stderr() => {
            if json {
                let app_error = AppError::invalid_request(error.to_string());
                let _ = write_json(io::stderr().lock(), &app_error.to_json());
            } else {
                let _ = error.print();
            }
            Err(ExitCode::from(2))
        }
        Err(error) => {
            let _ = error.print();
            Err(ExitCode::SUCCESS)
        }
    }
}

fn main() -> ExitCode {
    let args = std::env::args_os().collect();
    let cli = match parse(args) {
        Ok(cli) => cli,
        Err(code) => return code,
    };
    let json = cli.json;

    match app::run(cli.command, !json) {
        Ok(CommandOutput { value, success }) => {
            let result = if json {
                write_json(io::stdout().lock(), &value)
            } else {
                write_human(io::stdout().lock(), &value)
            };
            if result.is_err() {
                return ExitCode::FAILURE;
            }
            if success {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
        Err(error) => {
            if json {
                let _ = write_json(io::stderr().lock(), &error.to_json());
            } else {
                let _ = write_human_error(io::stderr().lock(), &error);
            }
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli::{
        AttachmentCommand, Command, FieldCommand, FormulaCommand, LookupCommand, RelationCommand,
        RowCommand, SkillsCommand, TableCommand, ViewCommand,
    };
    use clap::CommandFactory;

    fn parse_ok(args: &[&str]) -> Cli {
        Cli::try_parse_from(normalize_args(args.iter().map(OsString::from).collect())).unwrap()
    }

    #[test]
    fn field_add_does_not_expose_nullability_flags() {
        for flag in ["--nullable", "--not-null"] {
            let parsed = Cli::try_parse_from(normalize_args(
                [
                    "eidos",
                    "tasks.eidos",
                    "field",
                    "add",
                    "--table",
                    "Tasks",
                    "--name",
                    "Status",
                    "--type",
                    "text",
                    flag,
                ]
                .into_iter()
                .map(OsString::from)
                .collect(),
            ));
            assert!(parsed.is_err(), "{flag} must stay outside the public CLI");
        }
        let conversion = Cli::try_parse_from(normalize_args(
            [
                "eidos",
                "tasks.eidos",
                "field",
                "update",
                "Estimate",
                "--type",
                "integer",
                "--nullable",
            ]
            .into_iter()
            .map(OsString::from)
            .collect(),
        ));
        assert!(
            conversion.is_err(),
            "field update must not expose nullability"
        );
    }

    #[test]
    fn accepts_command_first_and_file_first_forms() {
        let command_first = parse_ok(&["eidos", "inspect", "tasks.eidos"]);
        let file_first = parse_ok(&["eidos", "tasks.eidos", "--json", "inspect"]);
        let global_first = parse_ok(&["eidos", "--json", "tasks.eidos", "inspect"]);
        assert!(matches!(command_first.command, Command::Inspect(_)));
        assert!(matches!(file_first.command, Command::Inspect(_)));
        assert!(matches!(global_first.command, Command::Inspect(_)));
        assert!(!command_first.json);
        assert!(file_first.json);
        assert!(global_first.json);

        let rows = parse_ok(&[
            "eidos",
            "tasks.eidos",
            "rows",
            "add",
            "Tasks",
            "--expected-revision",
            "0",
            "--values",
            "{}",
        ]);
        assert!(matches!(
            rows.command,
            Command::Rows(ref args) if matches!(args.command, RowCommand::Add(_))
        ));

        let batch = parse_ok(&[
            "eidos",
            "tasks.eidos",
            "rows",
            "mutate",
            "--table",
            "Tasks",
            "--changes",
            r#"[{"kind":"delete","rowId":"01900000-0000-7000-8000-000000000000"}]"#,
            "--expected-revision",
            "0",
        ]);
        assert!(matches!(
            batch.command,
            Command::Rows(ref args) if matches!(args.command, RowCommand::Mutate(_))
        ));

        let upsert = parse_ok(&[
            "eidos",
            "rows",
            "upsert",
            "tasks.eidos",
            "--table",
            "Tasks",
            "--key",
            "External ID",
            "--values",
            r#"{"External ID":"task-1","Title":"Ship"}"#,
            "--expected-revision",
            "0",
        ]);
        assert!(matches!(
            upsert.command,
            Command::Rows(ref args) if matches!(args.command, RowCommand::Upsert(_))
        ));

        let attachment = parse_ok(&[
            "eidos",
            "tasks.eidos",
            "attachment",
            "import",
            "--table",
            "Tasks",
            "--row",
            "01900000-0000-7000-8000-000000000000",
            "--field",
            "Files",
            "--source",
            "/tmp/report.pdf",
            "--expected-revision",
            "1",
        ]);
        assert!(matches!(
            attachment.command,
            Command::Attachment(ref args)
                if matches!(args.command, AttachmentCommand::Import(_))
        ));

        let context = parse_ok(&[
            "eidos",
            "tasks.eidos",
            "context",
            "Tasks",
            "--fields",
            "Title,Status",
        ]);
        assert!(matches!(context.command, Command::Context(_)));

        let apply = parse_ok(&[
            "eidos",
            "tasks.eidos",
            "apply",
            r#"{"revision":"0","table":"Tasks","match":{"_id":"01900000-0000-7000-8000-000000000000"},"set":{"Status":"done"}}"#,
        ]);
        assert!(matches!(apply.command, Command::Apply(_)));

        let view_command_first = parse_ok(&[
            "eidos",
            "view",
            "create",
            "tasks.eidos",
            "--name",
            "Calendar",
            "--type",
            "calendar",
        ]);
        assert!(matches!(
            view_command_first.command,
            Command::View(ref args) if matches!(args.command, ViewCommand::Create(_))
        ));

        let view_file_first = parse_ok(&[
            "eidos",
            "tasks.eidos",
            "view",
            "create",
            "--name",
            "Calendar",
            "--type",
            "calendar",
        ]);
        assert!(matches!(
            view_file_first.command,
            Command::View(ref args) if matches!(args.command, ViewCommand::Create(_))
        ));

        let table = parse_ok(&[
            "eidos",
            "table",
            "create",
            "tasks.eidos",
            "--name",
            "People",
            "--fields",
            r#"[{"name":"Name","type":"text"}]"#,
        ]);
        assert!(matches!(
            table.command,
            Command::Table(ref args) if matches!(args.command, TableCommand::Create(_))
        ));
        let table_update = parse_ok(&[
            "eidos",
            "tasks.eidos",
            "table",
            "update",
            "Tasks",
            "--record-label",
            "Title",
            "--content-field",
            "Notes",
        ]);
        assert!(matches!(
            table_update.command,
            Command::Table(ref args) if matches!(args.command, TableCommand::Update(_))
        ));

        let field = parse_ok(&[
            "eidos",
            "tasks.eidos",
            "field",
            "add",
            "--table",
            "Tasks",
            "--name",
            "Due",
            "--type",
            "date",
        ]);
        assert!(matches!(
            field.command,
            Command::Field(ref args) if matches!(args.command, FieldCommand::Add(_))
        ));
        let field_update = parse_ok(&[
            "eidos",
            "field",
            "update",
            "tasks.eidos",
            "Estimate",
            "--table",
            "Tasks",
            "--type",
            "integer",
            "--confirm-lossy",
        ]);
        assert!(matches!(
            field_update.command,
            Command::Field(ref args) if matches!(args.command, FieldCommand::Update(_))
        ));

        let relation = parse_ok(&[
            "eidos",
            "relation",
            "add",
            "tasks.eidos",
            "--table",
            "Tasks",
            "--name",
            "Owner",
            "--target-table",
            "People",
        ]);
        assert!(matches!(
            relation.command,
            Command::Relation(ref args) if matches!(args.command, RelationCommand::Add(_))
        ));
        let relation_update = parse_ok(&[
            "eidos",
            "tasks.eidos",
            "relation",
            "update",
            "Owner",
            "--table",
            "Tasks",
            "--cardinality",
            "one",
        ]);
        assert!(matches!(
            relation_update.command,
            Command::Relation(ref args) if matches!(args.command, RelationCommand::Update(_))
        ));

        let formula = parse_ok(&[
            "eidos",
            "formula",
            "preview",
            "tasks.eidos",
            "--table",
            "Tasks",
            "--name",
            "Total",
            "--formula",
            "Amount + 1",
            "--type",
            "integer",
        ]);
        assert!(matches!(
            formula.command,
            Command::Formula(ref args) if matches!(args.command, FormulaCommand::Preview(_))
        ));

        let lookup = parse_ok(&[
            "eidos",
            "lookup",
            "add",
            "tasks.eidos",
            "--table",
            "Tasks",
            "--name",
            "Scores",
            "--relation-field",
            "People",
            "--target-field",
            "Score",
            "--aggregate",
            "sum",
        ]);
        assert!(matches!(
            lookup.command,
            Command::Lookup(ref args) if matches!(args.command, LookupCommand::Add(_))
        ));

        let view_apply = parse_ok(&[
            "eidos",
            "tasks.eidos",
            "view-apply",
            r#"{"expectedRevision":"0","changes":[]}"#,
        ]);
        assert!(matches!(view_apply.command, Command::ViewApply(_)));

        let serve = parse_ok(&[
            "eidos",
            "tasks.eidos",
            "serve",
            "--port",
            "9000",
            "--assets-dir",
            "./assets",
        ]);
        assert!(matches!(
            serve.command,
            Command::Serve(ref args)
                if args.assets_dir == Some(std::path::PathBuf::from("./assets"))
        ));

        let lan = parse_ok(&[
            "eidos",
            "serve",
            "tasks.eidos",
            "--lan",
            "--host",
            "192.168.1.20",
        ]);
        assert!(matches!(
            lan.command,
            Command::Serve(ref args)
                if args.lan && args.host == Some("192.168.1.20".parse().unwrap())
        ));

        let relay = parse_ok(&["eidos", "serve", "tasks.eidos", "--relay"]);
        assert!(matches!(
            relay.command,
            Command::Serve(ref args)
                if args.relay
                    && !args.share
                    && args.account_origin == "https://eidos.space"
                    && args.relay_origin == "https://relay.eidos.ink"
        ));

        let shared_relay = parse_ok(&["eidos", "serve", "tasks.eidos", "--relay", "--share"]);
        assert!(matches!(
            shared_relay.command,
            Command::Serve(ref args) if args.relay && args.share
        ));

        let publish = parse_ok(&["eidos", "serve", "tasks.eidos", "--publish"]);
        assert!(matches!(
            publish.command,
            Command::Serve(ref args) if args.publish && !args.lan && !args.relay
        ));

        let login = parse_ok(&[
            "eidos",
            "login",
            "--account-origin",
            "https://staging.eidos.space",
        ]);
        assert!(matches!(
            login.command,
            Command::Login(ref args)
                if args.account_origin == "https://staging.eidos.space"
        ));
        assert!(matches!(
            parse_ok(&["eidos", "whoami"]).command,
            Command::Whoami(_)
        ));
        assert!(matches!(
            parse_ok(&["eidos", "logout"]).command,
            Command::Logout(_)
        ));
        assert!(matches!(
            parse_ok(&["eidos", "upgrade", "--version", "0.36.8", "--force"]).command,
            Command::Upgrade(ref args)
                if args.version.as_deref() == Some("0.36.8") && args.force
        ));
        assert!(matches!(
            parse_ok(&["eidos", "skills", "init", "--global"]).command,
            Command::Skills(ref args)
                if matches!(args.command, SkillsCommand::Init(ref init)
                    if init.global && init.path.is_none() && !init.force)
        ));
        assert!(matches!(
            parse_ok(&["eidos", "skills", "init", "--space", "./my-space", "--force"])
                .command,
            Command::Skills(ref args)
                if matches!(args.command, SkillsCommand::Init(ref init)
                    if !init.global
                        && init.path == Some(std::path::PathBuf::from("./my-space"))
                        && init.force)
        ));
    }

    #[test]
    fn relay_is_explicit_and_mutually_exclusive_with_lan() {
        for args in [
            vec!["eidos", "serve", "tasks.eidos", "--relay", "--lan"],
            vec!["eidos", "serve", "tasks.eidos", "--share"],
            vec![
                "eidos",
                "serve",
                "tasks.eidos",
                "--account-origin",
                "https://staging.eidos.space",
            ],
            vec!["eidos", "serve", "tasks.eidos", "--publish", "--lan"],
            vec![
                "eidos",
                "serve",
                "tasks.eidos",
                "--publish",
                "--assets-dir",
                "./assets",
            ],
        ] {
            assert!(
                Cli::try_parse_from(normalize_args(
                    args.into_iter().map(OsString::from).collect()
                ))
                .is_err()
            );
        }
    }

    #[test]
    fn clap_definition_is_sound() {
        Cli::command().debug_assert();
    }
}
