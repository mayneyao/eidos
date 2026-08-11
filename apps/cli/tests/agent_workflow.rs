use std::path::Path;
use std::process::{Command, Output};

use rusqlite::Connection;
use serde_json::{Value, json};

fn run(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_eidos"))
        .args(args)
        .output()
        .expect("run eidos CLI")
}

fn run_json(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_eidos"))
        .args(args)
        .arg("--json")
        .output()
        .expect("run eidos CLI with JSON output")
}

fn success(args: &[&str]) -> Value {
    let output = run_json(args);
    assert!(
        output.status.success(),
        "command failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).expect("stdout is JSON")
}

fn path_string(path: &Path) -> String {
    path.to_str().expect("UTF-8 test path").to_string()
}

#[test]
fn agent_can_create_query_mutate_and_validate_a_file() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("tracker.eidos");
    let file = path_string(&file);

    let created = success(&[
        "create",
        &file,
        "--title",
        "Project Tracker",
        "--table",
        "Tasks",
        "--fields",
        r#"[{"name":"Title","type":"text","nullable":false},{"name":"Status","type":"select"},{"name":"Estimate","type":"integer"}]"#,
    ]);
    assert_eq!(created["file"]["revision"], "1");
    let default_table_id = created["file"]["defaultTableId"]
        .as_str()
        .expect("initial table is the file default");
    let schema = success(&[&file, "schema", "Tasks"]);
    assert_eq!(schema["defaultTableId"], default_table_id);
    assert_eq!(schema["tables"][0]["id"], default_table_id);
    assert_eq!(schema["views"].as_array().unwrap().len(), 1);
    assert_eq!(schema["views"][0]["name"], "Grid");
    assert_eq!(schema["views"][0]["type"], "grid");

    let added = success(&[
        &file,
        "rows",
        "add",
        "Tasks",
        "--expected-revision",
        "1",
        "--values",
        r#"[{"Title":"Ship CLI","Status":"doing","Estimate":3},{"Title":"Dogfood skill","Status":"todo","Estimate":2}]"#,
    ]);
    assert_eq!(added["revision"], "2");
    let row_id = added["created"][0]["rowId"].as_str().unwrap();

    let queried = success(&[
        &file,
        "query",
        "Tasks",
        "--where",
        r#"{"kind":"comparison","field":"Status","op":"eq","value":"doing"}"#,
    ]);
    assert_eq!(queried["rows"].as_array().unwrap().len(), 1);
    assert_eq!(queried["rows"][0]["Title"], "Ship CLI");

    let updated = success(&[
        &file,
        "rows",
        "update",
        "Tasks",
        row_id,
        "--expected-revision",
        "2",
        "--values",
        r#"{"Status":"done"}"#,
    ]);
    assert_eq!(updated["revision"], "3");

    let preview = success(&[
        &file,
        "schema-apply",
        "--expected-revision",
        "3",
        "--dry-run",
        "--op",
        r#"{"kind":"create-field","table":"Tasks","name":"Owner","type":"text"}"#,
    ]);
    assert_eq!(preview["dryRun"], true);
    assert_eq!(preview["createdIdsAreEphemeral"], true);
    assert_eq!(success(&[&file, "inspect"])["revision"], "3");

    let applied = success(&[
        &file,
        "schema-apply",
        "--expected-revision",
        "3",
        "--op",
        r#"{"kind":"create-field","table":"Tasks","name":"Owner","type":"text"}"#,
    ]);
    assert_eq!(applied["result"]["revision"], "4");

    let report = success(&[&file, "validate", "--level", "full"]);
    assert_eq!(report["valid"], true);

    let stale = run_json(&[
        &file,
        "rows",
        "update",
        "Tasks",
        row_id,
        "--expected-revision",
        "1",
        "--values",
        r#"{"Status":"todo"}"#,
    ]);
    assert_eq!(stale.status.code(), Some(1));
    let error: Value = serde_json::from_slice(&stale.stderr).expect("stderr is JSON");
    assert_eq!(error["error"]["code"], "stale-revision");
}

#[test]
fn compact_context_and_atomic_apply_cover_the_common_agent_loop() {
    let dir = tempfile::tempdir().unwrap();
    let file = path_string(&dir.path().join("agent-loop.eidos"));
    success(&[
        "create",
        &file,
        "--title",
        "Agent Loop",
        "--table",
        "Tasks",
        "--fields",
        r#"[{"name":"Title","type":"text","nullable":false},{"name":"Status","type":"select","settings":{"options":[{"name":"todo"},{"name":"doing"},{"name":"done"}]}}]"#,
    ]);
    let added = success(&[
        &file,
        "rows",
        "add",
        "Tasks",
        "--expected-revision",
        "1",
        "--values",
        r#"[{"Title":"Ship context","Status":"doing"},{"Title":"Keep compatibility","Status":"todo"}]"#,
    ]);
    let row_id = added["created"][0]["rowId"].as_str().unwrap();

    let context = success(&[
        &file,
        "context",
        "--fields",
        "Title,Status",
        "--limit",
        "10",
    ]);
    assert_eq!(context["compact"], true);
    assert_eq!(context["revision"], "2");
    assert_eq!(context["table"]["name"], "Tasks");
    assert_eq!(context["fields"].as_array().unwrap().len(), 2);
    assert_eq!(
        context["fields"][1]["options"],
        json!(["todo", "doing", "done"])
    );
    assert_eq!(context["rows"].as_array().unwrap().len(), 2);
    assert!(context["rows"][0].get("_created_at").is_none());

    let request = json!({
        "revision": "2",
        "table": "Tasks",
        "match": { "_id": row_id },
        "expect": 1,
        "set": { "Status": "done" },
        "validate": "full",
        "returning": ["Title", "Status"]
    })
    .to_string();
    let applied = success(&[&file, "apply", &request]);
    assert_eq!(applied["applied"], true);
    assert_eq!(applied["baseRevision"], "2");
    assert_eq!(applied["revision"], "3");
    assert_eq!(applied["matched"], 1);
    assert_eq!(applied["validation"]["valid"], true);
    assert_eq!(applied["rows"][0]["Title"], "Ship context");
    assert_eq!(applied["rows"][0]["Status"], "done");

    let no_match = json!({
        "revision": "3",
        "table": "Tasks",
        "match": { "Title": "Missing" },
        "expect": 1,
        "set": { "Status": "done" }
    })
    .to_string();
    let failed = run_json(&[&file, "apply", &no_match]);
    assert_eq!(failed.status.code(), Some(1));
    let error: Value = serde_json::from_slice(&failed.stderr).expect("stderr is JSON");
    assert_eq!(error["error"]["code"], "invalid-request");
    assert_eq!(success(&[&file, "inspect"])["revision"], "3");

    let stale = json!({
        "revision": "2",
        "table": "Tasks",
        "match": { "_id": row_id },
        "set": { "Status": "todo" }
    })
    .to_string();
    let failed = run_json(&[&file, "apply", &stale]);
    assert_eq!(failed.status.code(), Some(1));
    let error: Value = serde_json::from_slice(&failed.stderr).expect("stderr is JSON");
    assert_eq!(error["error"]["code"], "stale-revision");
}

#[test]
fn apply_rolls_back_when_the_proposed_file_fails_validation() {
    let dir = tempfile::tempdir().unwrap();
    let file = path_string(&dir.path().join("validation-rollback.eidos"));
    success(&[
        "create",
        &file,
        "--table",
        "Tasks",
        "--fields",
        r#"[{"name":"Title","type":"text","nullable":false},{"name":"Status","type":"select"}]"#,
    ]);
    let added = success(&[
        &file,
        "rows",
        "add",
        "Tasks",
        "--expected-revision",
        "1",
        "--values",
        r#"{"Title":"Do not commit","Status":"doing"}"#,
    ]);
    let row_id = added["created"][0]["rowId"].as_str().unwrap();

    // Deliberately corrupt a temporary fixture to prove apply validates the
    // uncommitted state and rolls its otherwise-valid row update back.
    let conn = Connection::open(&file).unwrap();
    let trigger: String = conn
        .query_row(
            "SELECT name FROM sqlite_schema \
             WHERE type='trigger' AND name GLOB 'eidos__row_id_immutable__*'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    conn.execute_batch(&format!("DROP TRIGGER \"{trigger}\""))
        .unwrap();
    drop(conn);

    let request = json!({
        "revision": "2",
        "table": "Tasks",
        "match": { "_id": row_id },
        "set": { "Status": "done" }
    })
    .to_string();
    let failed = run_json(&[&file, "apply", &request]);
    assert_eq!(failed.status.code(), Some(1));
    let result: Value = serde_json::from_slice(&failed.stdout).expect("stdout is JSON");
    assert_eq!(result["applied"], false);
    assert_eq!(result["rolledBack"], true);
    assert_eq!(result["validation"]["valid"], false);
    assert_eq!(success(&[&file, "inspect"])["revision"], "2");
    let rows = success(&[
        &file,
        "query",
        "Tasks",
        "--where",
        &json!({ "op": "eq", "field": "_id", "value": row_id }).to_string(),
        "--fields",
        "Status",
    ]);
    assert_eq!(rows["rows"][0]["Status"], "doing");
}

#[test]
fn relation_schema_uses_agent_friendly_camel_case() {
    let dir = tempfile::tempdir().unwrap();
    let file = path_string(&dir.path().join("relations.eidos"));
    success(&[
        "create",
        &file,
        "--table",
        "Tasks",
        "--fields",
        r#"[{"name":"Title","type":"text"}]"#,
    ]);
    success(&[
        &file,
        "schema-apply",
        "--expected-revision",
        "1",
        "--op",
        r#"{"kind":"create-table","name":"People","fields":[{"name":"Name","type":"text"}]}"#,
    ]);
    success(&[
        &file,
        "schema-apply",
        "--expected-revision",
        "2",
        "--op",
        r#"{"kind":"create-field","table":"Tasks","name":"Owner","type":"relation","definition":{"targetTable":"People","cardinality":"one","onDelete":"detach"}}"#,
    ]);

    let schema = success(&[&file, "schema", "Tasks"]);
    let relation = schema["relations"][0].as_object().unwrap();
    assert!(relation.contains_key("fieldId"));
    assert!(relation.contains_key("targetTableId"));
    assert!(relation.contains_key("inverseOfFieldId"));
    assert!(relation.contains_key("onDelete"));
    assert!(!relation.contains_key("target_table_id"));
}

#[test]
fn human_output_is_default_and_json_is_explicit() {
    let dir = tempfile::tempdir().unwrap();
    let file = path_string(&dir.path().join("readable.eidos"));
    success(&[
        "create",
        &file,
        "--title",
        "Readable CLI",
        "--table",
        "Tasks",
        "--fields",
        r#"[{"name":"Title","type":"text"},{"name":"Status","type":"select"}]"#,
    ]);

    let human = run(&["inspect", &file]);
    assert!(human.status.success());
    let stdout = String::from_utf8(human.stdout).unwrap();
    assert!(stdout.contains("revision: 1"));
    assert!(stdout.contains("file:"));
    assert!(stdout.contains("title: Readable CLI"));
    assert!(!stdout.trim_start().starts_with('{'));

    let json_output = run_json(&["inspect", &file]);
    assert!(json_output.status.success());
    let value: Value = serde_json::from_slice(&json_output.stdout).expect("stdout is JSON");
    assert_eq!(value["revision"], "1");

    let missing = run(&["inspect", "missing.eidos"]);
    assert_eq!(missing.status.code(), Some(1));
    assert!(
        String::from_utf8(missing.stderr)
            .unwrap()
            .starts_with("error [not-found]:")
    );

    let missing_json = run_json(&["inspect", "missing.eidos"]);
    assert_eq!(missing_json.status.code(), Some(1));
    let error: Value = serde_json::from_slice(&missing_json.stderr).expect("stderr is JSON");
    assert_eq!(error["error"]["code"], "not-found");

    let usage = run(&["inspect"]);
    assert_eq!(usage.status.code(), Some(2));
    assert!(
        String::from_utf8(usage.stderr)
            .unwrap()
            .starts_with("error:")
    );

    let usage_json = run_json(&["inspect"]);
    assert_eq!(usage_json.status.code(), Some(2));
    let error: Value = serde_json::from_slice(&usage_json.stderr).expect("stderr is JSON");
    assert_eq!(error["error"]["code"], "invalid-request");
}
