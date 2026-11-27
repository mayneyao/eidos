//! End-to-end test of the dedicated single-writer worker thread (`RuntimeWorkerHandle`)
//! and zero-JSON columnar page reads (`query_columnar_page`) designed for NSH DataGrid.

use eidos_file_core::query::{RowQuery, SortDirection, SortTerm};
use eidos_file_core::rows::RowChange;
use eidos_file_runtime::{
    ColumnarColumn, GetSnapshotRequest, GridCellKind, RowMutationRequest, RuntimeWorkerHandle,
    SchemaMutationRequest, SchemaPreflightRequest,
};
use serde_json::{Map, json};

#[test]
fn worker_handle_streams_columnar_pages_and_persists_edits() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("nsh-grid-test.eidos");
    let worker = RuntimeWorkerHandle::create(path.clone(), "NSH Grid".into()).unwrap();

    let snap = worker.get_snapshot(GetSnapshotRequest::default()).unwrap();
    assert_eq!(snap.revision, "0");

    // Create a table with mixed column types
    let create_change = json!({
        "kind": "create-table",
        "clientKey": "t1",
        "name": "Items",
        "position": "0",
        "labelFieldClientKey": "name",
        "fields": [
            { "clientKey": "name", "name": "Name", "kind": "text", "position": "0" },
            { "clientKey": "score", "name": "Score", "kind": "number", "position": "1" },
            { "clientKey": "done", "name": "Done", "kind": "checkbox", "position": "2" }
        ]
    });
    let plan = worker
        .preflight_schema(SchemaPreflightRequest {
            change: create_change,
            expected_revision: snap.revision.clone(),
        })
        .unwrap();
    let created = worker
        .mutate_schema(SchemaMutationRequest {
            plan_token: plan.plan_token,
            expected_revision: snap.revision,
            actions_hash: plan.actions_hash,
            confirm_lossy: None,
        })
        .unwrap();

    let mut table_id = String::new();
    let mut name_id = String::new();
    let mut score_id = String::new();
    let mut done_id = String::new();
    for obj in &created.created_objects {
        if obj["object"] == "table" {
            table_id = obj["id"].as_str().unwrap().to_string();
        } else if obj["object"] == "field" {
            match obj["clientKey"].as_str() {
                Some("name") => name_id = obj["id"].as_str().unwrap().to_string(),
                Some("score") => score_id = obj["id"].as_str().unwrap().to_string(),
                Some("done") => done_id = obj["id"].as_str().unwrap().to_string(),
                _ => {}
            }
        }
    }

    // Insert rows through worker
    let mut changes = Vec::new();
    for (i, (n, s, d)) in [
        ("Alpha", 95.5, true),
        ("Beta", 40.0, false),
        ("Gamma", 82.0, true),
    ]
    .into_iter()
    .enumerate()
    {
        let mut vals = Map::new();
        vals.insert(name_id.clone(), json!(n));
        vals.insert(score_id.clone(), json!(s));
        vals.insert(done_id.clone(), json!(d));
        changes.push(RowChange::Create {
            client_key: format!("r{i}"),
            values: vals,
        });
    }
    let ins = worker
        .mutate_rows(RowMutationRequest {
            creation_query: None,
            calendar: None,
            creation_context: None,
            table_id: table_id.clone(),
            expected_revision: created.revision,
            returning: None,
            changes,
        })
        .unwrap();
    assert!(ins.changed);

    // Fetch zero-JSON columnar page sorted by Score DESC
    let page = worker
        .query_columnar_page(
            table_id.clone(),
            RowQuery {
                filter: None,
                search: None,
                sort: Some(vec![SortTerm {
                    field_id: score_id.clone(),
                    direction: SortDirection::Desc,
                    nulls: None,
                }]),
            },
            vec![name_id.clone(), score_id.clone(), done_id.clone()],
            0,
            100,
            None,
        )
        .unwrap();

    assert_eq!(page.row_ids.len(), 3);
    assert!(!page.has_more);
    assert_eq!(page.columns[0].cell_kind, GridCellKind::Text);
    assert_eq!(page.columns[1].cell_kind, GridCellKind::Number);
    assert_eq!(page.columns[2].cell_kind, GridCellKind::Boolean);

    match &page.data[0] {
        ColumnarColumn::Texts(v) => assert_eq!(
            v,
            &vec![
                Some("Alpha".to_string()),
                Some("Gamma".to_string()),
                Some("Beta".to_string()),
            ]
        ),
        other => panic!("expected Texts, got {other:?}"),
    }
    match &page.data[1] {
        ColumnarColumn::Numbers(v) => assert_eq!(v, &vec![Some(95.5), Some(82.0), Some(40.0)]),
        other => panic!("expected Numbers, got {other:?}"),
    }
    match &page.data[2] {
        ColumnarColumn::Bools(v) => assert_eq!(v, &vec![Some(true), Some(true), Some(false)]),
        other => panic!("expected Bools, got {other:?}"),
    }

    worker.close().unwrap();
}
