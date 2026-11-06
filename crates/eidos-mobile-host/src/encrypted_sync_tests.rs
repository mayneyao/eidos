use crate::graft::GraftHost;
use anyhow::Result;
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader},
    path::Path,
    process::{Child, Command, Stdio},
};

struct Service(Child);
impl Drop for Service {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[test]
fn encrypted_custom_sync_roundtrip_reopens_and_rejects_changed_credentials() -> Result<()> {
    let workspace = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut service = Service(
        Command::new("node")
            .arg(workspace.join("scripts/fixtures/mobile-custom-sync-server.mjs"))
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()?,
    );
    let mut line = String::new();
    BufReader::new(service.0.stdout.take().unwrap()).read_line(&mut line)?;
    let info: Value = serde_json::from_str(&line)?;
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
    )?;
    let input = |name: &str| {
        json!({"url": format!("{}/personal/test", info["origin"].as_str().unwrap()),
        "uuid": info["uuid"], "token":"mobile-custom-sync-synthetic-token-00000000", "password":"mobile synthetic password",
        "stateDirectory": directory.path().join(format!("private-{name}"))})
    };
    let mut source = GraftHost::default();
    let mut target = GraftHost::default();
    source.execute(&desktop, "checkpoint", json!({}))?;
    source.execute(&desktop, "encryptedInitialize", input("desktop"))?;
    target.execute(&phone, "encryptedClone", input("phone"))?;
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
