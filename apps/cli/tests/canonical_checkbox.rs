use rusqlite::{Connection, OpenFlags};
use serde_json::Value;
use std::{
    fs,
    path::Path,
    process::{Command, Output},
};

fn invoke(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_eidos"))
        .arg("--json")
        .args(args)
        .output()
        .unwrap()
}
fn success(args: &[&str]) -> Value {
    let output = invoke(args);
    assert!(
        output.status.success(),
        "{} {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}
fn flag(file: &Path, table: &str, name: &str) -> (String, i64, Option<String>) {
    let connection = Connection::open_with_flags(file, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
    connection
        .prepare(&format!("PRAGMA table_info(\"{table}\")"))
        .unwrap()
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })
        .unwrap()
        .map(Result::unwrap)
        .find(|row| row.0 == name)
        .map(|row| (row.1, row.2, row.3))
        .unwrap()
}

#[test]
fn cli_checkbox_creation_rows_and_confirmed_conversion_use_canonical_runtime() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("中文路径.eidos");
    let file = path.to_str().unwrap();
    let created = success(&[
        "file",
        "new",
        file,
        "--table",
        "Checks",
        "--fields",
        r#"[{"name":"Title","type":"text"},{"name":"Flag","type":"checkbox"},{"name":"Maybe","type":"text"},{"name":"Count","type":"integer"}]"#,
        "--label-field",
        "Title",
    ]);
    assert_eq!(created["file"]["revision"], "1");
    assert_eq!(created["schemaMutation"]["revision"], "1");
    assert!(created["file"]["defaultTableId"].is_string());
    assert!(created["defaultViewId"].is_string());
    assert_eq!(
        flag(&path, "Checks", "Flag"),
        ("INTEGER".into(), 1, Some("0".into()))
    );
    let inserted = success(&[
        "data",
        "mutate",
        file,
        "--table",
        "Checks",
        "--insert",
        r#"[{"Title":"omitted","Count":9223372036854775807},{"Title":"true","Flag":true},{"Title":"false","Flag":false}]"#,
    ]);
    assert_eq!(inserted["revision"], "2");
    let queried = success(&["data", "query", file, "--table", "Checks"]);
    assert_eq!(queried["rows"][0]["Flag"], false);
    let before = fs::read(&path).unwrap();
    assert!(
        !invoke(&[
            "data",
            "mutate",
            file,
            "--table",
            "Checks",
            "--insert",
            r#"[{"Title":"rollback"},{"Title":"invalid","Flag":null}]"#
        ])
        .status
        .success()
    );
    assert_eq!(fs::read(&path).unwrap(), before);
    success(&[
        "schema", "field", file, "add", "--name", "Extra", "--table", "Checks", "--type",
        "checkbox",
    ]);
    assert_eq!(
        flag(&path, "Checks", "Extra"),
        ("INTEGER".into(), 1, Some("0".into()))
    );
    let preview = success(&[
        "schema",
        "field",
        file,
        "update",
        "Maybe",
        "--table",
        "Checks",
        "--type",
        "checkbox",
        "--dry-run",
    ]);
    assert_eq!(preview["result"]["classification"], "explicit-lossy");
    assert!(
        preview["result"]["valueChanges"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["code"] == "null-to-false" && item["rows"] == "3")
    );
    let before = fs::read(&path).unwrap();
    assert!(
        !invoke(&[
            "schema", "field", file, "update", "Maybe", "--table", "Checks", "--type", "checkbox"
        ])
        .status
        .success()
    );
    assert_eq!(fs::read(&path).unwrap(), before);
    assert!(
        !invoke(&[
            "schema",
            "field",
            file,
            "update",
            "Maybe",
            "--table",
            "Checks",
            "--type",
            "checkbox",
            "--policy",
            "unknown",
            "--confirm-lossy"
        ])
        .status
        .success()
    );
    assert_eq!(fs::read(&path).unwrap(), before);
    assert!(
        !invoke(&[
            "schema",
            "field",
            file,
            "update",
            "Maybe",
            "--table",
            "Checks",
            "--type",
            "checkbox",
            "--policy",
            "null-to-false",
            "--confirm-lossy",
            "--expected-revision",
            "2"
        ])
        .status
        .success()
    );
    assert_eq!(fs::read(&path).unwrap(), before);
    let converted = success(&[
        "schema",
        "field",
        file,
        "update",
        "Maybe",
        "--table",
        "Checks",
        "--type",
        "checkbox",
        "--policy",
        "null-to-false",
        "--confirm-lossy",
    ]);
    assert_eq!(converted["result"]["revision"], "4");
    assert_eq!(
        flag(&path, "Checks", "Maybe"),
        ("INTEGER".into(), 1, Some("0".into()))
    );
    success(&["file", "validate", file]);
}

#[test]
fn file_creation_publishes_only_complete_files_without_overwriting_a_race_winner() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("fresh.eidos");
    let file = path.to_str().unwrap();
    assert!(
        !invoke(&[
            "file",
            "new",
            file,
            "--table",
            "Broken",
            "--fields",
            r#"[{"name":"Title","type":"text"},{"name":"Title","type":"checkbox"}]"#
        ])
        .status
        .success()
    );
    assert!(!path.exists());
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 0);
    let args = [
        "file",
        "new",
        file,
        "--table",
        "Checks",
        "--fields",
        r#"[{"name":"Title","type":"text"},{"name":"Flag","type":"checkbox"}]"#,
    ];
    let mut first = Command::new(env!("CARGO_BIN_EXE_eidos"))
        .args(args)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .unwrap();
    let second = invoke(&args);
    let first = first.wait().unwrap();
    assert_ne!(first.success(), second.status.success());
    let before = fs::read(&path).unwrap();
    assert!(!invoke(&args).status.success());
    assert_eq!(fs::read(&path).unwrap(), before);
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    success(&["file", "validate", file]);
    let empty = directory.path().join("empty.eidos");
    let empty = empty.to_str().unwrap();
    let created = success(&["file", "new", empty]);
    assert_eq!(created["file"]["revision"], "0");
    assert!(created["defaultViewId"].is_null());
    let table = success(&[
        "schema",
        "table",
        empty,
        "create",
        "--name",
        "Plain",
        "--fields",
        r#"[{"name":"Title","type":"text"},{"name":"Flag","type":"checkbox"}]"#,
    ]);
    assert_eq!(table["result"]["revision"], "1");
    assert_eq!(
        flag(Path::new(empty), "Plain", "Flag"),
        ("INTEGER".into(), 1, Some("0".into()))
    );
    let inspected = success(&["file", "inspect", empty]);
    assert!(inspected["file"]["defaultTableId"].is_null());
    assert_eq!(inspected["counts"]["views"], 0);
}

#[test]
fn cli_batches_upserts_and_previews_preserve_checkbox_constraints_and_source_bytes() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("batch.eidos");
    let file = path.to_str().unwrap();
    success(&[
        "file",
        "new",
        file,
        "--table",
        "Checks",
        "--fields",
        r#"[{"name":"Title","type":"text"},{"name":"Flag","type":"checkbox"},{"name":"Maybe","type":"text"}]"#,
    ]);
    let before = fs::read(&path).unwrap();
    let preview = success(&[
        "data",
        "mutate",
        file,
        "--table",
        "Checks",
        "--insert",
        r#"{"Title":"preview"}"#,
        "--dry-run",
    ]);
    assert_eq!(preview["dryRun"], true);
    assert_eq!(preview["revision"], "2");
    assert_eq!(fs::read(&path).unwrap(), before);
    let rows = success(&[
        "data",
        "mutate",
        file,
        "--table",
        "Checks",
        r#"{"changes":[{"kind":"create","clientKey":"one","values":{"Title":"one"}},{"kind":"create","clientKey":"two","values":{"Title":"two","Flag":true}}]}"#,
    ]);
    assert_eq!(rows["result"]["revision"], "2");
    let schema = r#"{"kind":"batch","changes":[{"kind":"create-field","table":"Checks","name":"Extra","type":"checkbox"},{"kind":"rename-field","table":"Checks","field":"Maybe","name":"Review"}]}"#;
    let added = success(&[
        "schema",
        "apply",
        file,
        "--expected-revision",
        "2",
        "--op",
        schema,
    ]);
    assert_eq!(added["result"]["revision"], "3");
    assert_eq!(
        flag(&path, "Checks", "Extra"),
        ("INTEGER".into(), 1, Some("0".into()))
    );
    let operation = r#"{"kind":"convert-field","table":"Checks","field":"Review","to":"checkbox","policies":["null-to-false"]}"#;
    let before = fs::read(&path).unwrap();
    let preview = success(&[
        "schema",
        "apply",
        file,
        "--expected-revision",
        "3",
        "--op",
        operation,
        "--dry-run",
    ]);
    assert_eq!(preview["result"]["revision"], "4");
    assert_eq!(preview["result"]["classification"], "explicit-lossy");
    assert_eq!(fs::read(&path).unwrap(), before);
    let converted = success(&[
        "schema",
        "apply",
        file,
        "--expected-revision",
        "3",
        "--op",
        operation,
        "--confirm-lossy",
    ]);
    assert_eq!(converted["result"]["revision"], "4");
    assert_eq!(
        flag(&path, "Checks", "Review"),
        ("INTEGER".into(), 1, Some("0".into()))
    );
    let before = fs::read(&path).unwrap();
    assert!(!invoke(&["data", "mutate", file, "--table", "Checks", r#"{"changes":[{"kind":"create","clientKey":"valid","values":{"Title":"valid"}},{"kind":"create","clientKey":"invalid","values":{"Title":"invalid","Flag":null}}]}"#]).status.success());
    assert_eq!(fs::read(&path).unwrap(), before);
    let upserted = success(&[
        "data",
        "mutate",
        file,
        "--table",
        "Checks",
        "--key",
        "Title",
        "--insert",
        r#"{"Title":"upserted"}"#,
    ]);
    assert_eq!(upserted["result"]["revision"], "5");
    let before = fs::read(&path).unwrap();
    success(&[
        "data",
        "mutate",
        file,
        "--table",
        "Checks",
        "--key",
        "Title",
        "--insert",
        r#"{"Title":"upserted","Flag":true}"#,
        "--dry-run",
    ]);
    assert_eq!(fs::read(&path).unwrap(), before);
    let updated = success(&[
        "data",
        "mutate",
        file,
        "--table",
        "Checks",
        "--key",
        "Title",
        "--insert",
        r#"{"Title":"upserted","Flag":true}"#,
    ]);
    assert_eq!(updated["result"]["revision"], "6");
    success(&["file", "validate", file]);
}
