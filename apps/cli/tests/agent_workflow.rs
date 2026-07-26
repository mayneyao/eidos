use std::path::Path;
use std::process::{Command, Output};

use serde_json::Value;

fn run(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_eidos"))
        .args(args)
        .output()
        .expect("run eidos CLI")
}

fn success(args: &[&str]) -> Value {
    let output = run(args);
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

    let stale = run(&[
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
