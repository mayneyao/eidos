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
fn agent_can_create_a_calendar_view_from_stable_schema_ids() {
    let dir = tempfile::tempdir().unwrap();
    let file = path_string(&dir.path().join("calendar.eidos"));
    success(&[
        "create",
        &file,
        "--table",
        "Tasks",
        "--label-field",
        "Title",
        "--fields",
        r#"[{"name":"Title","type":"text","nullable":false},{"name":"Due","type":"date"}]"#,
    ]);
    let schema = success(&[&file, "schema", "Tasks"]);
    let table_id = schema["tables"][0]["id"].as_str().unwrap();
    let due_id = schema["tables"][0]["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["name"] == "Due")
        .unwrap()["id"]
        .as_str()
        .unwrap();
    let request = json!({
        "expectedRevision": "1",
        "changes": [{
            "kind": "create-view",
            "clientKey": "calendar",
            "tableId": table_id,
            "name": "Calendar",
            "type": "calendar",
            "query": {},
            "layout": {"dateField": due_id},
            "position": "1"
        }]
    })
    .to_string();
    let applied = success(&[&file, "view-apply", &request]);
    assert_eq!(applied["revision"], "2");
    assert_eq!(applied["changed"], true);
    assert_eq!(applied["createdViews"][0]["clientKey"], "calendar");

    let schema = success(&[&file, "schema", "Tasks"]);
    let calendar = schema["views"]
        .as_array()
        .unwrap()
        .iter()
        .find(|view| view["name"] == "Calendar")
        .unwrap();
    assert_eq!(calendar["type"], "calendar");
    assert_eq!(calendar["layout"]["dateField"], due_id);
    assert_eq!(
        success(&[&file, "inspect"])["capabilities"]["mutateView"],
        true
    );
    assert_eq!(
        success(&[&file, "validate", "--level", "full"])["valid"],
        true
    );
}

#[test]
fn agent_can_create_update_preview_and_delete_view_by_intent() {
    let dir = tempfile::tempdir().unwrap();
    let file = path_string(&dir.path().join("view-intent.eidos"));
    success(&[
        "create",
        &file,
        "--table",
        "Tasks",
        "--label-field",
        "Title",
        "--fields",
        r#"[{"name":"Title","type":"text","nullable":false},{"name":"Status","type":"select","settings":{"options":[{"name":"todo"},{"name":"doing"}]}},{"name":"Due","type":"date"}]"#,
    ]);

    let created = success(&[
        "view",
        "create",
        &file,
        "--table",
        "Tasks",
        "--name",
        "Delivery calendar",
        "--type",
        "calendar",
        "--date-by",
        "Due",
    ]);
    assert_eq!(created["result"]["revision"], "2");
    assert_eq!(created["resolved"]["table"]["name"], "Tasks");
    let due_id = success(&[&file, "schema", "Tasks"])["tables"][0]["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["name"] == "Due")
        .unwrap()["id"]
        .clone();
    assert_eq!(
        created["request"]["changes"][0]["layout"]["dateField"],
        due_id
    );

    let updated = success(&[
        &file,
        "view",
        "update",
        "Delivery calendar",
        "--name",
        "Delivery Calendar",
        "--hide-fields",
        "Status",
    ]);
    assert_eq!(updated["result"]["revision"], "3");

    let preview = success(&[
        "view",
        "create",
        &file,
        "--table",
        "Tasks",
        "--name",
        "By status",
        "--type",
        "kanban",
        "--group-by",
        "Status",
        "--dry-run",
    ]);
    assert_eq!(preview["dryRun"], true);
    assert_eq!(preview["createdIdsAreEphemeral"], true);
    assert_eq!(preview["result"]["revision"], "4");
    assert_eq!(success(&[&file, "inspect"])["revision"], "3");

    let deleted = success(&[&file, "view", "delete", "Delivery Calendar"]);
    assert_eq!(deleted["result"]["revision"], "4");
    assert_eq!(
        success(&["view", "list", &file])["views"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn agent_can_mutate_schema_by_table_field_and_relation_intent() {
    let dir = tempfile::tempdir().unwrap();
    let file = path_string(&dir.path().join("schema-intent.eidos"));
    success(&[
        "create",
        &file,
        "--table",
        "Tasks",
        "--fields",
        r#"[{"name":"Title","type":"text","nullable":false},{"name":"Due","type":"date"}]"#,
    ]);

    let preview = success(&[
        "field",
        "add",
        &file,
        "--table",
        "Tasks",
        "--name",
        "Owner",
        "--type",
        "text",
        "--expected-revision",
        "1",
        "--dry-run",
    ]);
    assert_eq!(preview["dryRun"], true);
    assert_eq!(preview["result"]["revision"], "2");
    assert_eq!(success(&[&file, "inspect"])["revision"], "1");

    let added = success(&[
        &file,
        "field",
        "add",
        "--table",
        "Tasks",
        "--name",
        "Owner",
        "--type",
        "text",
        "--expected-revision",
        "1",
    ]);
    assert_eq!(added["result"]["revision"], "2");

    let people = success(&[
        "table",
        "create",
        &file,
        "--name",
        "People",
        "--label-field",
        "Name",
        "--fields",
        r#"[{"name":"Name","type":"text","nullable":false}]"#,
    ]);
    assert_eq!(people["result"]["revision"], "3");

    let relation = success(&[
        &file,
        "relation",
        "add",
        "--table",
        "Tasks",
        "--name",
        "Assignee",
        "--target-table",
        "People",
        "--cardinality",
        "one",
    ]);
    assert_eq!(relation["result"]["revision"], "4");
    let people_id = success(&[&file, "schema", "People"])["tables"][0]["id"].clone();
    let tasks_schema = success(&[&file, "schema", "Tasks"]);
    let assignee_id = tasks_schema["tables"][0]["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["name"] == "Assignee")
        .unwrap()["id"]
        .clone();
    let relation_meta = tasks_schema["relations"]
        .as_array()
        .unwrap()
        .iter()
        .find(|relation| relation["fieldId"] == assignee_id)
        .unwrap();
    assert_eq!(relation_meta["targetTableId"], people_id);
    assert_eq!(relation_meta["cardinality"], "one");

    let renamed_table = success(&[
        "table",
        "rename",
        &file,
        "People",
        "--name",
        "Contacts",
        "--expected-revision",
        "4",
    ]);
    assert_eq!(renamed_table["result"]["revision"], "5");
    let renamed_field = success(&[
        &file, "field", "rename", "Due", "--table", "Tasks", "--name", "Deadline",
    ]);
    assert_eq!(renamed_field["result"]["revision"], "6");

    success(&[
        &file,
        "field",
        "add",
        "--table",
        "Tasks",
        "--name",
        "Temporary",
        "--type",
        "text",
    ]);
    let deleted_field = success(&["field", "delete", &file, "Temporary", "--table", "Tasks"]);
    assert_eq!(deleted_field["result"]["revision"], "8");

    success(&[
        "table",
        "create",
        &file,
        "--name",
        "Temporary Table",
        "--fields",
        r#"[{"name":"Name","type":"text"}]"#,
    ]);
    let deleted_table = success(&[&file, "table", "delete", "Temporary Table"]);
    assert_eq!(deleted_table["result"]["revision"], "10");
}

#[test]
fn agent_can_upsert_and_batch_mutate_rows_atomically() {
    let dir = tempfile::tempdir().unwrap();
    let file = path_string(&dir.path().join("row-intent.eidos"));
    success(&[
        "create",
        &file,
        "--table",
        "Tasks",
        "--label-field",
        "Title",
        "--fields",
        r#"[{"name":"External ID","type":"text","nullable":false},{"name":"Title","type":"text","nullable":false},{"name":"Status","type":"select"}]"#,
    ]);

    let preview = success(&[
        "rows",
        "upsert",
        &file,
        "--table",
        "Tasks",
        "--key",
        "External ID",
        "--values",
        r#"[{"External ID":"a-1","Title":"Ship CLI","Status":"doing"},{"External ID":"b-2","Title":"Write docs","Status":"todo"}]"#,
        "--expected-revision",
        "1",
        "--dry-run",
    ]);
    assert_eq!(preview["dryRun"], true);
    assert_eq!(preview["createdIdsAreEphemeral"], true);
    assert_eq!(preview["plan"][0]["action"], "create");
    assert_eq!(preview["result"]["revision"], "2");
    assert_eq!(success(&[&file, "inspect"])["revision"], "1");

    let first = success(&[
        &file,
        "rows",
        "upsert",
        "--table",
        "Tasks",
        "--key",
        "External ID",
        "--values",
        r#"[{"External ID":"a-1","Title":"Ship CLI","Status":"doing"},{"External ID":"b-2","Title":"Write docs","Status":"todo"}]"#,
        "--expected-revision",
        "1",
    ]);
    assert_eq!(first["result"]["revision"], "2");
    assert_eq!(first["plan"][1]["action"], "create");

    let second = success(&[
        "rows",
        "upsert",
        &file,
        "--table",
        "Tasks",
        "--key",
        "External ID",
        "--values",
        r#"[{"External ID":"a-1","Title":"Ship the CLI","Status":"done"},{"External ID":"c-3","Title":"Add examples","Status":"todo"}]"#,
        "--expected-revision",
        "2",
    ]);
    assert_eq!(second["result"]["revision"], "3");
    assert_eq!(second["plan"][0]["action"], "update");
    assert_eq!(second["plan"][1]["action"], "create");

    let rows = success(&[&file, "query", "Tasks", "--fields", "External ID,Title"])["rows"]
        .as_array()
        .unwrap()
        .clone();
    let row_id = |external_id: &str| {
        rows.iter()
            .find(|row| row["External ID"] == external_id)
            .unwrap()["_id"]
            .as_str()
            .unwrap()
            .to_string()
    };
    let a_id = row_id("a-1");
    let b_id = row_id("b-2");
    let batch = success(&[
        &file,
        "rows",
        "mutate",
        "--table",
        "Tasks",
        "--expected-revision",
        "3",
        "--changes",
        &format!(
            r#"[{{"kind":"update","rowId":"{a_id}","values":{{"Status":"doing"}}}},{{"kind":"create","clientKey":"batch-new","values":{{"External ID":"d-4","Title":"Batch row"}}}},{{"kind":"delete","rowId":"{b_id}"}}]"#
        ),
    ]);
    assert_eq!(batch["result"]["revision"], "4");
    assert_eq!(batch["result"]["created"][0]["clientKey"], "batch-new");
    assert_eq!(batch["result"]["affectedRows"].as_array().unwrap().len(), 3);

    let duplicate = run_json(&[
        &file,
        "rows",
        "upsert",
        "--table",
        "Tasks",
        "--key",
        "External ID",
        "--values",
        r#"[{"External ID":"duplicate","Title":"One"},{"External ID":"duplicate","Title":"Two"}]"#,
        "--expected-revision",
        "4",
    ]);
    assert_eq!(duplicate.status.code(), Some(1));
    let error: Value = serde_json::from_slice(&duplicate.stderr).expect("stderr is JSON");
    assert_eq!(error["error"]["code"], "invalid-request");
    assert_eq!(success(&[&file, "inspect"])["revision"], "4");
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
fn agent_can_use_runtime_formula_and_lookup_fields() {
    let dir = tempfile::tempdir().unwrap();
    let file = path_string(&dir.path().join("derived.eidos"));
    success(&[
        "create",
        &file,
        "--table",
        "Tasks",
        "--fields",
        r#"[{"name":"Title","type":"text"},{"name":"Amount","type":"integer"}]"#,
    ]);
    let added = success(&[
        &file,
        "rows",
        "add",
        "Tasks",
        "--expected-revision",
        "1",
        "--values",
        r#"[{"Title":"One","Amount":2},{"Title":"Two","Amount":5}]"#,
    ]);
    let first_row_id = added["created"][0]["rowId"].as_str().unwrap().to_string();

    let table_formula_preview = success(&[
        &file,
        "schema-apply",
        "--expected-revision",
        "2",
        "--dry-run",
        "--op",
        r#"{"kind":"create-field","table":"Tasks","name":"Projected","type":"formula","definition":{"sourceText":"\"Amount\" + 4","resultType":"integer"}}"#,
    ]);
    assert_eq!(table_formula_preview["dryRun"], true);
    assert_eq!(
        table_formula_preview["result"]["classification"],
        "metadata-only"
    );
    assert_eq!(success(&[&file, "inspect"])["revision"], "2");

    let preview = success(&[
        &file,
        "formula",
        "preview",
        "--table",
        "Tasks",
        "--name",
        "Total",
        "--formula",
        "\"Amount\" + 1",
        "--type",
        "integer",
        "--row-ids",
        &first_row_id,
    ]);
    assert_eq!(preview["valid"], true);
    assert_eq!(preview["inferredType"], "integer");
    assert_eq!(preview["rows"][0]["value"], "3");

    let formula = success(&[
        &file,
        "formula",
        "add",
        "--table",
        "Tasks",
        "--name",
        "Total",
        "--formula",
        "\"Amount\" + 1",
        "--type",
        "integer",
        "--expected-revision",
        "2",
    ]);
    assert_eq!(formula["result"]["revision"], "3");
    assert_eq!(
        success(&[&file, "inspect"])["capabilities"]["formulaEvaluation"],
        true
    );

    let formula_update = success(&[
        &file,
        "formula",
        "update",
        "Total",
        "--table",
        "Tasks",
        "--formula",
        "\"Amount\" + 2",
        "--type",
        "integer",
        "--expected-revision",
        "3",
    ]);
    assert_eq!(formula_update["result"]["revision"], "4");

    let filtered = success(&[
        &file,
        "query",
        "Tasks",
        "--where",
        r#"{"op":"gt","field":"Total","value":"5"}"#,
        "--fields",
        "Title,Total",
    ]);
    assert_eq!(filtered["rows"].as_array().unwrap().len(), 1);
    assert_eq!(filtered["rows"][0]["Total"], "7");

    let renamed = success(&[
        &file,
        "field",
        "rename",
        "Amount",
        "--table",
        "Tasks",
        "--name",
        "Quantity",
        "--expected-revision",
        "4",
    ]);
    assert_eq!(renamed["result"]["revision"], "5");
    let after_rename = success(&[&file, "query", "Tasks", "--fields", "Title,Total"]);
    assert_eq!(after_rename["rows"][0]["Total"], "4");

    let people = success(&[
        &file,
        "table",
        "create",
        "--name",
        "People",
        "--fields",
        r#"[{"name":"Name","type":"text"},{"name":"Score","type":"integer"}]"#,
        "--expected-revision",
        "5",
    ]);
    assert_eq!(people["result"]["revision"], "6");
    let person = success(&[
        &file,
        "rows",
        "add",
        "People",
        "--expected-revision",
        "6",
        "--values",
        r#"{"Name":"Ada","Score":7}"#,
    ]);
    let person_id = person["created"][0]["rowId"].as_str().unwrap().to_string();
    success(&[
        &file,
        "relation",
        "add",
        "--table",
        "Tasks",
        "--name",
        "People",
        "--target-table",
        "People",
        "--expected-revision",
        "7",
    ]);
    let lookup = success(&[
        &file,
        "lookup",
        "add",
        "--table",
        "Tasks",
        "--name",
        "Scores",
        "--relation-field",
        "People",
        "--target-field",
        "Score",
        "--aggregate",
        "values",
        "--expected-revision",
        "8",
    ]);
    assert_eq!(lookup["result"]["revision"], "9");
    let lookup_update = success(&[
        &file,
        "lookup",
        "update",
        "Scores",
        "--table",
        "Tasks",
        "--relation-field",
        "People",
        "--target-field",
        "Score",
        "--aggregate",
        "first",
        "--expected-revision",
        "9",
    ]);
    assert_eq!(lookup_update["result"]["revision"], "10");
    success(&[
        &file,
        "rows",
        "update",
        "Tasks",
        &first_row_id,
        "--expected-revision",
        "10",
        "--values",
        &format!(r#"{{"People":["{person_id}"]}}"#),
    ]);
    let derived = success(&[&file, "query", "Tasks", "--fields", "Title,Total,Scores"]);
    assert_eq!(derived["rows"][0]["Total"], "4");
    assert_eq!(derived["rows"][0]["Scores"], "7");
    assert_eq!(
        success(&[&file, "validate", "--level", "full"])["valid"],
        true
    );
    assert_eq!(
        success(&[&file, "context", "Tasks", "--fields", "Total,Scores"])["capabilities"]["lookupEvaluation"],
        true
    );

    let deleted_lookup = success(&[
        &file,
        "lookup",
        "delete",
        "Scores",
        "--table",
        "Tasks",
        "--expected-revision",
        "11",
        "--confirm-lossy",
    ]);
    assert_eq!(deleted_lookup["result"]["revision"], "12");
    let deleted_formula = success(&[
        &file,
        "formula",
        "delete",
        "Total",
        "--table",
        "Tasks",
        "--expected-revision",
        "12",
        "--confirm-lossy",
    ]);
    assert_eq!(deleted_formula["result"]["revision"], "13");

    let formula_table = success(&[
        &file,
        "table",
        "create",
        "--name",
        "Formula Table",
        "--fields",
        r#"[{"name":"Amount","type":"integer"},{"name":"Total","type":"formula","definition":{"sourceText":"\"Amount\" + 1","resultType":"integer"}}]"#,
        "--expected-revision",
        "13",
    ]);
    assert_eq!(formula_table["result"]["revision"], "14");
    let formula_table_schema = success(&[&file, "schema", "Formula Table"]);
    assert_eq!(
        formula_table_schema["tables"][0]["fields"]
            .as_array()
            .unwrap()
            .iter()
            .find(|field| field["name"] == "Total")
            .unwrap()["type"],
        "formula"
    );
    assert_eq!(
        success(&[&file, "validate", "--level", "full"])["valid"],
        true
    );
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
