mod app;
mod cli;
mod error;
mod output;
mod relay_auth;
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

    match app::run(cli.command) {
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
    use crate::cli::{Command, RowCommand};
    use clap::CommandFactory;

    fn parse_ok(args: &[&str]) -> Cli {
        Cli::try_parse_from(normalize_args(args.iter().map(OsString::from).collect())).unwrap()
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
