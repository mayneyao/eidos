use anyhow::{anyhow, Context as _};

fn main() -> anyhow::Result<()> {
    let mut args = std::env::args().skip(1);
    let command = args.next().unwrap_or_else(|| "selftest".to_string());
    match command.as_str() {
        "selftest" => {
            let db_path = args
                .next()
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|| {
                    std::env::temp_dir()
                        .join(format!("qjs-host-selftest-{}.eidos", std::process::id()))
                });
            qjs_host::run_self_test(&db_path)
        }
        "create" => {
            let db_path = args.next().ok_or_else(|| anyhow!("create needs a path"))?;
            let title = args.next().unwrap_or_else(|| "Untitled".to_string());
            qjs_host::run_create(std::path::Path::new(&db_path), &title)
        }
        "serve" => {
            let db_path = args
                .next()
                .ok_or_else(|| anyhow!("serve needs a .eidos file path"))?;
            let mut port: u16 = 8420;
            let mut ui_dir: Option<std::path::PathBuf> = None;
            let mut open_browser = false;
            let mut lan = false;
            let mut host: Option<std::net::IpAddr> = None;
            while let Some(flag) = args.next() {
                match flag.as_str() {
                    "--port" => {
                        port = args
                            .next()
                            .ok_or_else(|| anyhow!("--port needs a value"))?
                            .parse()
                            .context("parse --port")?
                    }
                    "--ui-dir" => {
                        ui_dir = Some(std::path::PathBuf::from(
                            args.next()
                                .ok_or_else(|| anyhow!("--ui-dir needs a value"))?,
                        ))
                    }
                    "--open" => open_browser = true,
                    "--lan" => lan = true,
                    "--host" => {
                        host = Some(
                            args.next()
                                .ok_or_else(|| anyhow!("--host needs a value"))?
                                .parse()
                                .context("parse --host")?,
                        )
                    }
                    other => return Err(anyhow!("unknown serve flag: {other}")),
                }
            }
            if host.is_some() && !lan {
                return Err(anyhow!("--host requires --lan"));
            }
            qjs_host::serve::run_serve(
                std::path::Path::new(&db_path),
                port,
                ui_dir,
                open_browser,
                lan,
                host,
                None,
            )
        }
        "open" => {
            let db_path = args.next().ok_or_else(|| anyhow!("open needs a path"))?;
            qjs_host::run_open(std::path::Path::new(&db_path))
        }
        other => {
            eprintln!(
                "unknown command: {other}\nusage: qjs-host selftest [db-path] | create <db> [title] | open <db> | serve <db> [--port N] [--lan [--host IP]] [--ui-dir DIR] [--open]"
            );
            std::process::exit(2)
        }
    }
}
