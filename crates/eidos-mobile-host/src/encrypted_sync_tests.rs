use crate::graft::GraftHost;
use anyhow::{anyhow, Context, Result};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read},
    path::Path,
    process::{Child, Command, ExitStatus, Stdio},
    sync::{mpsc, Arc, Mutex},
    thread::JoinHandle,
    time::Duration,
};

const PREPARE: &str =
    "npm ci --prefix scripts/fixtures/graft-remote --ignore-scripts --no-audit --no-fund";

struct Service {
    child: Option<Child>,
    stdout_reader: Option<JoinHandle<()>>,
    stderr_reader: Option<JoinHandle<()>>,
    stderr: Arc<Mutex<Vec<u8>>>,
}

impl Service {
    fn start(mut command: Command, deadline: Duration) -> Result<(Self, Value)> {
        let mut child = command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .with_context(|| {
                format!("Could not start Node.js for the official Graft test fixture. Use the repository's .node-version and prepare it with: {PREPARE}")
            })?;
        let stdout = child.stdout.take().unwrap();
        let mut stderr = child.stderr.take().unwrap();
        let captured = Arc::new(Mutex::new(Vec::new()));
        let errors = captured.clone();
        let stderr_reader = std::thread::spawn(move || {
            let mut buffer = [0; 1024];
            while let Ok(count) = stderr.read(&mut buffer) {
                if count == 0 {
                    break;
                }
                let mut errors = errors.lock().unwrap();
                let keep = count.min((16 * 1024_usize).saturating_sub(errors.len()));
                errors.extend_from_slice(&buffer[..keep]);
            }
        });
        let (ready, output) = mpsc::channel();
        let stdout_reader = std::thread::spawn(move || {
            let mut line = String::new();
            let result = BufReader::new(stdout)
                .take(4097)
                .read_line(&mut line)
                .map(|_| line);
            let _ = ready.send(result);
        });
        let mut service = Self {
            child: Some(child),
            stdout_reader: Some(stdout_reader),
            stderr_reader: Some(stderr_reader),
            stderr: captured,
        };
        let info: Result<Value> = (|| {
            let line = output
                .recv_timeout(deadline)
                .context("Graft fixture ready deadline expired or stdout reader stopped")??;
            anyhow::ensure!(
                !line.is_empty(),
                "Graft fixture exited before its ready message (stdout EOF)"
            );
            anyhow::ensure!(
                line.len() <= 4096,
                "Graft fixture ready message exceeded its limit"
            );
            let info: Value =
                serde_json::from_str(&line).context("Graft fixture ready message is not JSON")?;
            let origin = info["origin"]
                .as_str()
                .context("Graft fixture ready JSON has no origin")?;
            let parsed = url::Url::parse(origin)?;
            anyhow::ensure!(
                parsed.scheme() == "http"
                    && parsed.host_str() == Some("127.0.0.1")
                    && parsed.port().is_some_and(|port| port > 0),
                "Graft fixture must bind an ephemeral loopback port"
            );
            anyhow::ensure!(
                info["uuid"].is_string(),
                "Graft fixture ready JSON has no repository UUID"
            );
            Ok(info)
        })();
        match info {
            Ok(info) => Ok((service, info)),
            Err(error) => {
                let status = service.stop();
                let stderr = service.stderr.lock().unwrap();
                Err(anyhow!("{error:#}; child status: {status:?}. Prepare the official fixture with: {PREPARE}\nFixture stderr (bounded):\n{}", String::from_utf8_lossy(&stderr)))
            }
        }
    }

    fn stop(&mut self) -> Option<ExitStatus> {
        let status = self.child.take().and_then(|mut child| {
            let _ = child.kill();
            child.wait().ok()
        });
        if let Some(reader) = self.stdout_reader.take() {
            let _ = reader.join();
        }
        if let Some(reader) = self.stderr_reader.take() {
            let _ = reader.join();
        }
        status
    }
}

impl Drop for Service {
    fn drop(&mut self) {
        self.stop();
    }
}

#[test]
fn encrypted_custom_sync_roundtrip_reopens_and_rejects_changed_credentials() -> Result<()> {
    let workspace = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut command = Command::new("node");
    command.arg(workspace.join("scripts/fixtures/mobile-custom-sync-server.mjs"));
    let (_service, info) = Service::start(command, Duration::from_secs(30))?;
    let directory = tempfile::tempdir()?;
    let desktop = directory.path().join("desktop");
    let phone = directory.path().join("phone");
    std::fs::create_dir(&desktop)?;
    std::fs::create_dir(&phone)?;
    std::fs::write(desktop.join("note.md"), "desktop first")?;
    std::fs::write(desktop.join("asset.bin"), [1, 2, 3, 4])?;
    crate::execute(
        &desktop.join("data.eidos"),
        "create",
        json!({"title":"Shared encrypted data"}),
    )
    .context("encrypted Sync phase: create source data file")?;
    let input = |name: &str| {
        json!({"url": format!("{}/personal/test", info["origin"].as_str().unwrap()),
        "uuid": info["uuid"], "token":"mobile-custom-sync-synthetic-token-00000000", "password":"mobile synthetic password",
        "stateDirectory": directory.path().join(format!("private-{name}"))})
    };
    for name in ["desktop", "phone"] {
        let state = directory.path().join(format!("private-{name}"));
        assert!(
            state.parent().unwrap().is_dir(),
            "fresh state parent must exist"
        );
        assert!(!state.exists(), "fresh state base must not be precreated");
    }
    let mut source = GraftHost::default();
    let mut target = GraftHost::default();
    source
        .execute(&desktop, "checkpoint", json!({}))
        .context("encrypted Sync phase: checkpoint source")?;
    source
        .execute(&desktop, "encryptedInitialize", input("desktop"))
        .context("encrypted Sync phase: initialize source")?;
    target
        .execute(&phone, "encryptedClone", input("phone"))
        .context("encrypted Sync phase: clone target")?;
    assert_eq!(
        std::fs::read_to_string(phone.join("note.md"))?,
        "desktop first"
    );
    assert_eq!(std::fs::read(phone.join("asset.bin"))?, [1, 2, 3, 4]);
    assert_eq!(
        rusqlite::Connection::open(phone.join("data.eidos"))?.query_row(
            "PRAGMA integrity_check",
            [],
            |row| row.get::<_, String>(0)
        )?,
        "ok"
    );
    std::fs::write(phone.join("note.md"), "phone change")?;
    target.execute(&phone, "checkpoint", json!({}))?;
    target.execute(&phone, "push", json!({}))?;
    source.execute(&desktop, "fetch", json!({}))?;
    source.execute(&desktop, "fastForward", json!({}))?;
    assert_eq!(
        std::fs::read_to_string(desktop.join("note.md"))?,
        "phone change"
    );
    target.execute(&phone, "close", json!({}))?;
    let before = target.execute(&phone, "status", json!({}))?["status"]["current_head"].clone();
    let remotes = target.execute(&phone, "remotes", json!({}))?;
    for (key, value) in [
        ("password", json!("wrong password")),
        ("token", json!("wrong-token")),
        ("uuid", json!("11111111-1111-4111-8111-111111111111")),
        (
            "url",
            json!(format!(
                "{}/personal/other",
                info["origin"].as_str().unwrap()
            )),
        ),
    ] {
        let mut invalid = input("phone");
        invalid[key] = value;
        assert!(
            target.execute(&phone, "encryptedUnlock", invalid).is_err(),
            "must reject {key}"
        );
        assert_eq!(
            target.execute(&phone, "remotes", json!({}))?["remotes"],
            remotes["remotes"]
        );
        assert_eq!(
            target.execute(&phone, "status", json!({}))?["status"]["current_head"],
            before
        );
        assert_eq!(
            std::fs::read_to_string(phone.join("note.md"))?,
            "phone change"
        );
    }
    target.execute(&phone, "encryptedUnlock", input("phone"))?;
    std::fs::write(desktop.join("note.md"), "desktop after restart")?;
    source.execute(&desktop, "checkpoint", json!({}))?;
    source.execute(&desktop, "push", json!({}))?;
    target.execute(&phone, "fetch", json!({}))?;
    target.execute(&phone, "fastForward", json!({}))?;
    assert_eq!(
        std::fs::read_to_string(phone.join("note.md"))?,
        "desktop after restart"
    );
    target.execute(&phone, "disconnectRemote", json!({}))?;
    assert_eq!(
        target.execute(&phone, "remotes", json!({}))?["remotes"],
        json!([])
    );
    assert_eq!(
        std::fs::read_to_string(phone.join("note.md"))?,
        "desktop after restart"
    );
    target.execute(&phone, "close", json!({}))?;
    source.execute(&desktop, "close", json!({}))?;
    Ok(())
}

#[test]
fn fixture_startup_reports_missing_node_and_child_stderr() -> Result<()> {
    let missing = tempfile::tempdir()?.path().join("missing-node");
    let error = Service::start(Command::new(missing), Duration::from_secs(2))
        .err()
        .unwrap();
    assert!(error.to_string().contains("Could not start Node.js"));
    assert!(error.to_string().contains(PREPARE));
    let mut command = Command::new("node");
    command.args([
        "-e",
        "process.stderr.write('synthetic fixture startup failure');process.exitCode=7",
    ]);
    let error = Service::start(command, Duration::from_secs(5))
        .err()
        .unwrap();
    assert!(error.to_string().contains("stdout EOF"));
    assert!(error
        .to_string()
        .contains("synthetic fixture startup failure"));
    Ok(())
}

#[test]
fn fixture_startup_rejects_non_json_and_stops_an_unready_child() {
    let mut command = Command::new("node");
    command.args(["-e", "console.log('not-json');setInterval(()=>{},1000)"]);
    let error = Service::start(command, Duration::from_secs(5))
        .err()
        .unwrap();
    assert!(error.to_string().contains("not JSON"));
    let mut command = Command::new("node");
    command.args(["-e", "setInterval(()=>{},1000)"]);
    let error = Service::start(command, Duration::from_millis(100))
        .err()
        .unwrap();
    assert!(error.to_string().contains("ready deadline expired"));
}
