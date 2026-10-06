use super::*;
use crate::execute;

fn rows(path: &Path) -> Result<Value> {
    let schema = execute(path, "schema", json!({}))?;
    let table = schema["objects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|o| o["object"] == "table")
        .unwrap();
    execute(
        path,
        "queryRows",
        json!({"tableId": table["id"], "query": {}, "limit": 50,
        "projection": {"fields": [table["labelFieldId"]], "resolveRelations": []}}),
    )
}

fn write_record(path: &Path, title: &str) -> Result<()> {
    let schema = execute(path, "schema", json!({}))?;
    let table = schema["objects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|o| o["object"] == "table")
        .unwrap();
    let values = json!({table["labelFieldId"].as_str().unwrap(): title});
    let existing = rows(path)?;
    let change = if let Some(row) = existing["rows"].as_array().unwrap().first() {
        json!({"kind": "update", "rowId": row["id"], "values": values})
    } else {
        json!({"kind": "create", "clientKey": "record", "values": values})
    };
    execute(
        path,
        "mutateRows",
        json!({"tableId": table["id"], "expectedRevision": schema["snapshot"]["revision"], "changes": [change]}),
    )?;
    Ok(())
}

#[test]
fn remote_roundtrip_preserves_sqlite_markdown_and_attachments_and_detects_divergence() -> Result<()>
{
    exercise_remote(None)
}

#[test]
#[ignore = "requires the loopback Android Graft protocol fixture"]
fn http_remote_roundtrip() -> Result<()> {
    let base = std::env::var("EIDOS_ANDROID_TEST_REMOTE")?;
    ensure!(
        base.strip_prefix("http://127.0.0.1:")
            .and_then(|port| port.parse::<u16>().ok())
            .is_some_and(|port| port > 0),
        "Use the loopback test fixture only"
    );
    exercise_remote(Some(base))
}

fn exercise_remote(http_base: Option<String>) -> Result<()> {
    let temp = tempfile::tempdir()?;
    let desktop = temp.path().join("desktop");
    let mobile = temp.path().join("mobile");
    let remote = temp.path().join("remote");
    for path in [&desktop, &mobile, &remote] {
        std::fs::create_dir(path)?;
    }
    let mut source = GraftHost::default();
    let mut phone = GraftHost::default();
    execute(
        &desktop.join("data.eidos"),
        "create",
        json!({"title": "Shared data"}),
    )?;
    write_record(&desktop.join("data.eidos"), "Desktop record")?;
    std::fs::write(desktop.join("note.md"), "# Desktop\n")?;
    std::fs::write(desktop.join("image.bin"), [0, 128, 255, 1])?;
    source.execute(&desktop, "checkpoint", json!({}))?;
    let http = http_base.is_some();
    let url = http_base.map_or_else(
        || format!("fs://{}", remote.display()),
        |base| {
            format!(
                "graft+{base}/android/test-{}",
                temp.path()
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .trim_start_matches('.')
            )
        },
    );
    source.execute(
        &desktop,
        "configureRemote",
        json!({"url": url, "token": "ephemeral-test-token"}),
    )?;
    source.execute(&desktop, "push", json!({}))?;
    phone.execute(
        &mobile,
        "clone",
        json!({"url": url, "token": "ephemeral-test-token"}),
    )?;
    assert_eq!(
        rows(&mobile.join("data.eidos"))?["rows"][0]["values"][0],
        "Desktop record"
    );
    assert_eq!(
        std::fs::read(mobile.join("image.bin"))?,
        vec![0, 128, 255, 1]
    );
    assert!(phone
        .execute(&mobile, "clone", json!({"url": url}))
        .is_err());
    write_record(&mobile.join("data.eidos"), "Mobile edit")?;
    std::fs::write(mobile.join("note.md"), "# Mobile\n")?;
    std::fs::write(mobile.join("image.bin"), [4, 3, 2, 1])?;
    phone.execute(&mobile, "checkpoint", json!({}))?;
    phone.execute(&mobile, "push", json!({}))?;
    source.execute(&desktop, "fetch", json!({}))?;
    assert_eq!(
        std::fs::read_to_string(desktop.join("note.md"))?,
        "# Desktop\n"
    );
    assert_eq!(
        source.execute(&desktop, "fastForward", json!({}))?["outcome"],
        "updated"
    );
    assert_eq!(
        rows(&desktop.join("data.eidos"))?["rows"][0]["values"][0],
        "Mobile edit"
    );
    assert_eq!(
        std::fs::read_to_string(desktop.join("note.md"))?,
        "# Mobile\n"
    );
    assert_eq!(std::fs::read(desktop.join("image.bin"))?, vec![4, 3, 2, 1]);
    std::fs::write(desktop.join("note.md"), "# Desktop offline\n")?;
    source.execute(&desktop, "checkpoint", json!({}))?;
    source.execute(&desktop, "push", json!({}))?;
    std::fs::write(mobile.join("note.md"), "# Mobile offline\n")?;
    phone.execute(&mobile, "fetch", json!({}))?;
    assert!(phone.execute(&mobile, "fastForward", json!({})).is_err());
    phone.execute(&mobile, "checkpoint", json!({}))?;
    let outcome = phone.execute(&mobile, "fastForward", json!({}))?;
    assert_eq!(outcome["outcome"], "needs_merge");
    assert_eq!(
        std::fs::read_to_string(mobile.join("note.md"))?,
        "# Mobile offline\n"
    );
    assert!(phone.execute(&mobile, "push", json!({})).is_err());
    source.execute(&desktop, "clearCredentials", json!({}))?;
    if http {
        assert!(source.execute(&desktop, "fetch", json!({})).is_err());
    }
    Ok(())
}
