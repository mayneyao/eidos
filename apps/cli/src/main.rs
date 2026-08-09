mod app;
mod cli;
mod error;

use std::ffi::OsString;
use std::io::{self, Write};
use std::process::ExitCode;

use clap::Parser;

use crate::app::CommandOutput;
use crate::cli::{Cli, normalize_args};
use crate::error::AppError;

fn write_json(mut writer: impl Write, value: &serde_json::Value) -> io::Result<()> {
    serde_json::to_writer(&mut writer, value)?;
    writer.write_all(b"\n")
}

fn parse(args: Vec<OsString>) -> Result<Cli, ExitCode> {
    match Cli::try_parse_from(normalize_args(args)) {
        Ok(cli) => Ok(cli),
        Err(error) if error.use_stderr() => {
            let app_error = AppError::invalid_request(error.to_string());
            let _ = write_json(io::stderr().lock(), &app_error.to_json());
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

    match app::run(cli.command) {
        Ok(CommandOutput { value, success }) => {
            if write_json(io::stdout().lock(), &value).is_err() {
                return ExitCode::FAILURE;
            }
            if success {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
        Err(error) => {
            let _ = write_json(io::stderr().lock(), &error.to_json());
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
        assert!(matches!(command_first.command, Command::Inspect(_)));
        assert!(matches!(file_first.command, Command::Inspect(_)));

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

        let serve = parse_ok(&["eidos", "tasks.eidos", "serve", "--port", "9000"]);
        assert!(matches!(serve.command, Command::Serve(_)));

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
    }

    #[test]
    fn clap_definition_is_sound() {
        Cli::command().debug_assert();
    }
}
