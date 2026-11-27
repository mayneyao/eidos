//! Executes the shared language-neutral conformance suite
//! (`tests/runtime-conformance/cases.json`) against `RustRuntimeService`.

use std::collections::HashMap;
use std::path::PathBuf;

use eidos_file_runtime::RustRuntimeService;
use serde_json::{Value, json};

#[test]
fn batch_pages_scan_live_source_once() {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    let dir = tempfile::tempdir().unwrap();
    let mut service = RustRuntimeService::create(&dir.path().join("scan.eidos"), "Scan").unwrap();
    let change = json!({"kind":"create-table","clientKey":"t","name":"Rows","position":"0","labelFieldClientKey":"title","fields":[{"clientKey":"title","name":"Title","kind":"text","position":"0"}]});
    let plan: Value = serde_json::from_str(
        &service
            .invoke_wire_json(
                "preflightSchema",
                &json!({"change":change,"expectedRevision":"0"}).to_string(),
            )
            .unwrap(),
    )
    .unwrap();
    let result:Value = serde_json::from_str(&service.invoke_wire_json("mutateSchema",&json!({"planToken":plan["planToken"],"actionsHash":plan["actionsHash"],"expectedRevision":"0"}).to_string()).unwrap()).unwrap();
    let created = result["createdObjects"].as_array().unwrap();
    let table = &created.iter().find(|o| o["clientKey"] == "t").unwrap()["id"];
    let field = &created.iter().find(|o| o["clientKey"] == "title").unwrap()["id"];
    let reads = Arc::new(AtomicUsize::new(0));
    let counter = reads.clone();
    let conn = service.connection();
    conn.create_scalar_function(
        "observe_live_row",
        1,
        rusqlite::functions::FunctionFlags::SQLITE_UTF8
            | rusqlite::functions::FunctionFlags::SQLITE_INNOCUOUS,
        move |ctx| {
            counter.fetch_add(1, Ordering::Relaxed);
            ctx.get::<String>(0)
        },
    )
    .unwrap();
    conn.execute_batch("ALTER TABLE Rows RENAME TO stored; CREATE VIEW Rows AS SELECT _id, _created_at, _updated_at, observe_live_row(Title) AS Title FROM stored;
        INSERT INTO stored VALUES('01900000-0000-7000-8000-000000000001','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','A'),('01900000-0000-7000-8000-000000000002','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','B');
        UPDATE eidos__tables SET settings_json='{\"vtabModule\":\"fixture\"}'").unwrap();
    let request =
        json!({"tableId":table,"queries":[{},{},{}],"projection":{"fields":[field]},"limit":1});
    for expected in [2, 4] {
        let pages: Value = serde_json::from_str(
            &service
                .invoke_wire_json("queryRowPages", &request.to_string())
                .unwrap(),
        )
        .unwrap();
        assert!(pages.as_array().unwrap().iter().all(|p| p["total"] == "2"));
        assert_eq!(reads.load(Ordering::Relaxed), expected);
    }
}

fn resolve_row_value(val: &Value, rows: &HashMap<String, String>) -> Value {
    match val {
        Value::String(s) if s.starts_with("$row:") => json!(rows[&s[5..]]),
        Value::Array(arr) => Value::Array(arr.iter().map(|v| resolve_row_value(v, rows)).collect()),
        other => other.clone(),
    }
}

fn resolve_field_def(
    def: &Value,
    table_key: &str,
    tables: &HashMap<String, String>,
    fields: &HashMap<String, HashMap<String, String>>,
) -> Value {
    let mut obj = def.as_object().unwrap().clone();
    let target_table_key = obj
        .remove("targetTableKey")
        .and_then(|v| v.as_str().map(String::from));
    if let Some(ref ttk) = target_table_key {
        obj.insert("targetTableId".into(), json!(tables[ttk]));
    }
    if let (Some(inv_t), Some(inv_f)) = (
        obj.remove("inverseOfTableKey")
            .and_then(|v| v.as_str().map(String::from)),
        obj.remove("inverseOfFieldKey")
            .and_then(|v| v.as_str().map(String::from)),
    ) {
        obj.insert("inverseOfFieldId".into(), json!(fields[&inv_t][&inv_f]));
    }
    let has_rel_key = obj.contains_key("relationFieldKey");
    if let Some(rk) = obj
        .remove("relationFieldKey")
        .and_then(|v| v.as_str().map(String::from))
    {
        obj.insert("relationFieldId".into(), json!(fields[table_key][&rk]));
    }
    if let Some(tfk) = obj
        .remove("targetFieldKey")
        .and_then(|v| v.as_str().map(String::from))
    {
        let tk = target_table_key.as_deref().unwrap_or(table_key);
        obj.insert("targetFieldId".into(), json!(fields[tk][&tfk]));
        if has_rel_key {
            obj.remove("targetTableId");
        }
    }
    Value::Object(obj)
}

fn resolve_filter(node: &Value, fields: &HashMap<String, String>) -> Value {
    let op = node["op"].as_str().unwrap_or("");
    if op == "and" || op == "or" {
        let args: Vec<Value> = node["args"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| resolve_filter(c, fields))
            .collect();
        return json!({ "op": op, "args": args });
    }
    if op == "not" {
        return json!({ "op": "not", "arg": resolve_filter(&node["arg"], fields) });
    }
    let mut obj = node.as_object().unwrap().clone();
    if let Some(fk) = obj
        .remove("field")
        .and_then(|v| v.as_str().map(String::from))
    {
        obj.insert("fieldId".into(), json!(fields[&fk]));
    }
    Value::Object(obj)
}

fn resolve_wire(value: &Value, state: &Value) -> Value {
    match value {
        Value::String(s) if s.starts_with('$') => s[1..]
            .split('.')
            .fold(state, |v, k| {
                if v.is_array() {
                    &v[k.parse::<usize>().unwrap()]
                } else {
                    v.get(k).unwrap()
                }
            })
            .clone(),
        Value::Array(a) => Value::Array(a.iter().map(|v| resolve_wire(v, state)).collect()),
        Value::Object(o) => Value::Object(
            o.iter()
                .map(|(k, v)| {
                    (
                        resolve_wire(&json!(k), state).as_str().unwrap().into(),
                        resolve_wire(v, state),
                    )
                })
                .collect(),
        ),
        v => v.clone(),
    }
}

#[test]
fn language_neutral_runtime_conformance() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let suite_path = manifest_dir.join("../../tests/runtime-conformance/cases.json");
    let suite: Value =
        serde_json::from_str(&std::fs::read_to_string(&suite_path).expect("read cases.json"))
            .expect("parse cases.json");

    let temp_dir = tempfile::tempdir().expect("tempdir");

    for case in suite["cases"].as_array().expect("cases array") {
        let case_id = case["id"].as_str().unwrap();
        let file_path = temp_dir.path().join(format!("{case_id}.eidos"));
        let mut svc = RustRuntimeService::create(&file_path, "Conformance Test")
            .unwrap_or_else(|e| panic!("[{case_id}] create failed: {e}"));

        let mut tables: HashMap<String, String> = HashMap::new();
        let mut fields: HashMap<String, HashMap<String, String>> = HashMap::new();
        let mut rows: HashMap<String, String> = HashMap::new();
        let mut revision = "0".to_string();

        let mut saved = json!({});
        for step in case["steps"].as_array().unwrap() {
            let op = step["op"].as_str().unwrap();
            match op {
                "wire" => {
                    saved["tables"] = json!(tables);
                    saved["fields"] = json!(fields);
                    saved["rows"] = json!(rows);
                    saved["revision"] = json!(revision);
                    let request = resolve_wire(&step["request"], &saved);
                    let method = step["method"].as_str().unwrap();
                    let mut call = |method: &str, req: &Value| {
                        svc.invoke_wire_json(method, &req.to_string())
                            .map(|raw| serde_json::from_str::<Value>(&raw).unwrap())
                    };
                    let result = if method == "applySchema" {
                        call("preflightSchema",&request).and_then(|plan| call("mutateSchema",&json!({
                            "expectedRevision":request["expectedRevision"], "planToken":plan["planToken"], "actionsHash":plan["actionsHash"]
                        })))
                    } else {
                        call(method, &request)
                    };
                    if let Some(errors) = step["error"].as_array() {
                        let err = result.unwrap_err();
                        assert!(errors.contains(&json!(err.code)), "[{case_id}] {err}");
                    } else {
                        let result = result.unwrap();
                        if let Some(keys) = step["absent"].as_array() {
                            for key in keys {
                                let key = key.as_str().unwrap();
                                assert!(
                                    result.get(key).is_none(),
                                    "[{case_id}] {method} returned {key}"
                                );
                            }
                        }
                        if let Some(key) = step["save"].as_str() {
                            saved[key] = result.clone();
                        }
                        if let Some(check) = step["check"].as_object() {
                            for (path, expected) in check {
                                let ptr = format!("/{}", path.replace('.', "/"));
                                assert_eq!(
                                    result.pointer(&ptr).unwrap(),
                                    &resolve_wire(expected, &saved),
                                    "[{case_id}] {path}"
                                );
                            }
                        }
                    }
                }
                "negotiate" => {
                    let out: Value = serde_json::from_str(
                        &svc.invoke_wire_json("negotiate", &step["request"].to_string())
                            .unwrap(),
                    )
                    .unwrap();
                    assert_eq!(out["version"], step["expect"]["version"]);
                    assert!(out["capabilities"].is_object());
                    assert!(out["limits"].is_object());
                }
                "getSnapshot" => {
                    let out: Value = serde_json::from_str(
                        &svc.invoke_wire_json("getSnapshot", &step["request"].to_string())
                            .unwrap(),
                    )
                    .unwrap();
                    revision = out["revision"].as_str().unwrap().to_string();
                    assert_eq!(out["format"]["major"], step["expect"]["formatMajor"]);
                    assert_eq!(out["format"]["minor"], step["expect"]["formatMinor"]);
                    assert_eq!(out["title"], step["expect"]["title"]);
                    assert_eq!(out["revision"], step["expect"]["revision"]);
                }
                "validate" => {
                    let out: Value = serde_json::from_str(
                        &svc.invoke_wire_json("validate", &step["request"].to_string())
                            .unwrap(),
                    )
                    .unwrap();
                    assert_eq!(
                        out["valid"], step["expect"]["valid"],
                        "[{case_id}] validate diagnostics: {}",
                        out["diagnostics"]
                    );
                    assert_eq!(
                        out["diagnostics"].as_array().unwrap().len(),
                        step["expect"]["diagnosticsCount"].as_u64().unwrap() as usize
                    );
                }
                "createTable" => {
                    let save_as = step["saveTableAs"].as_str().unwrap().to_string();
                    let change = json!({
                        "kind": "create-table",
                        "clientKey": save_as,
                        "name": step["name"],
                        "position": "0",
                        "fields": step["fields"],
                        "labelFieldClientKey": step["labelFieldClientKey"],
                    });
                    let plan: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "preflightSchema",
                            &json!({ "change": change, "expectedRevision": revision }).to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    assert_ne!(plan["classification"], "forbidden");
                    let res: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "mutateSchema",
                            &json!({
                                "planToken": plan["planToken"],
                                "expectedRevision": revision,
                                "actionsHash": plan["actionsHash"],
                            })
                            .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    revision = res["revision"].as_str().unwrap().to_string();
                    let mut f_map = HashMap::new();
                    for obj in res["createdObjects"].as_array().unwrap() {
                        if obj["object"] == "table" && obj["clientKey"] == save_as {
                            tables.insert(save_as.clone(), obj["id"].as_str().unwrap().to_string());
                        } else if obj["object"] == "field"
                            && let Some(ck) = obj["clientKey"].as_str()
                        {
                            f_map.insert(ck.to_string(), obj["id"].as_str().unwrap().to_string());
                        }
                    }
                    fields.insert(save_as, f_map);
                }
                "createField" => {
                    let t_key = step["table"].as_str().unwrap();
                    let table_id = &tables[t_key];
                    let mut field_obj = step["field"].as_object().unwrap().clone();
                    let ck = field_obj["clientKey"].as_str().unwrap().to_string();
                    if let Some(def) = field_obj.get("definition").cloned() {
                        field_obj.insert(
                            "definition".into(),
                            resolve_field_def(&def, t_key, &tables, &fields),
                        );
                    }
                    let change = json!({
                        "kind": "create-field",
                        "tableId": table_id,
                        "field": Value::Object(field_obj),
                    });
                    let plan: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "preflightSchema",
                            &json!({ "change": change, "expectedRevision": revision }).to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    assert_ne!(plan["classification"], "forbidden");
                    let res: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "mutateSchema",
                            &json!({
                                "planToken": plan["planToken"],
                                "expectedRevision": revision,
                                "actionsHash": plan["actionsHash"],
                            })
                            .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    revision = res["revision"].as_str().unwrap().to_string();
                    let f_id = res["createdObjects"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|o| o["object"] == "field" && o["clientKey"] == ck)
                        .unwrap()["id"]
                        .as_str()
                        .unwrap()
                        .to_string();
                    fields.get_mut(t_key).unwrap().insert(ck, f_id);
                }
                "schemaLeaf" => {
                    let mut ch = step["change"].as_object().unwrap().clone();
                    let kind = ch["kind"].as_str().unwrap().to_string();
                    let t_key = ch
                        .remove("table")
                        .and_then(|v| v.as_str().map(String::from));
                    let f_key = ch
                        .remove("field")
                        .and_then(|v| v.as_str().map(String::from));
                    if let Some(ref tk) = t_key {
                        if !matches!(
                            kind.as_str(),
                            "delete-field"
                                | "set-field-nullable"
                                | "set-field-position"
                                | "rename-option"
                        ) {
                            ch.insert("tableId".into(), json!(tables[tk]));
                        }
                        if let Some(ref fk) = f_key {
                            ch.insert("fieldId".into(), json!(fields[tk][fk]));
                        }
                    }
                    let plan: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "preflightSchema",
                            &json!({ "change": Value::Object(ch), "expectedRevision": revision })
                                .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    if let Some(impact) = step.get("expectFieldDeletionImpact") {
                        let id = &fields[t_key.as_ref().unwrap()][f_key.as_ref().unwrap()];
                        assert_eq!(plan["affectedRows"], impact["rows"]);
                        assert_eq!(plan["dependencyCount"], "1");
                        assert_eq!(plan["dependencies"], json!([{"object":"field","id":id}]));
                        let err = svc.invoke_wire_json("mutateSchema", &json!({"planToken":plan["planToken"], "actionsHash":plan["actionsHash"], "expectedRevision":revision}).to_string()).unwrap_err();
                        assert_eq!(err.code, "lossy-confirmation-required");
                    }
                    if let Some(exp_cls) = step["expectClassification"].as_str() {
                        assert_eq!(plan["classification"].as_str().unwrap(), exp_cls);
                    }
                    if plan["classification"] == "forbidden" {
                        continue;
                    }
                    let mut req_obj = serde_json::Map::new();
                    req_obj.insert("planToken".into(), plan["planToken"].clone());
                    req_obj.insert("expectedRevision".into(), json!(revision));
                    req_obj.insert("actionsHash".into(), plan["actionsHash"].clone());
                    if step["confirmLossy"].as_bool() == Some(true) {
                        req_obj.insert("confirmLossy".into(), json!(true));
                    }
                    let res: Value = serde_json::from_str(
                        &svc.invoke_wire_json("mutateSchema", &Value::Object(req_obj).to_string())
                            .unwrap(),
                    )
                    .unwrap();
                    revision = res["revision"].as_str().unwrap().to_string();
                }
                "insertRows" => {
                    let t_key = step["table"].as_str().unwrap();
                    let table_id = &tables[t_key];
                    let f_map = &fields[t_key];
                    let generated;
                    let input = if let Some(seq) = step.get("sequence") {
                        let start = seq["start"].as_u64().unwrap();
                        let field = seq["field"].as_str().unwrap();
                        generated = (start..start + seq["count"].as_u64().unwrap())
                            .map(|i| json!({"clientKey": i.to_string(), "values": { (field): i.to_string() }}))
                            .collect::<Vec<_>>();
                        &generated
                    } else {
                        step["rows"].as_array().unwrap()
                    };
                    let changes: Vec<Value> = input
                        .iter()
                        .map(|r| {
                            let mut mapped = serde_json::Map::new();
                            for (k, v) in r["values"].as_object().unwrap() {
                                mapped.insert(f_map[k].clone(), resolve_row_value(v, &rows));
                            }
                            json!({
                                "kind": "create",
                                "clientKey": r["clientKey"],
                                "values": mapped,
                            })
                        })
                        .collect();
                    let res: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "mutateRows",
                            &json!({
                                "tableId": table_id,
                                "expectedRevision": revision,
                                "changes": changes,
                            })
                            .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    revision = res["revision"].as_str().unwrap().to_string();
                    for created in res["created"].as_array().unwrap() {
                        rows.insert(
                            created["clientKey"].as_str().unwrap().to_string(),
                            created["rowId"].as_str().unwrap().to_string(),
                        );
                    }
                }
                "queryRows" => {
                    let t_key = step["table"].as_str().unwrap();
                    let table_id = &tables[t_key];
                    let f_map = &fields[t_key];
                    let mut query = serde_json::Map::new();
                    if !step["filter"].is_null() {
                        query.insert("filter".into(), resolve_filter(&step["filter"], f_map));
                    }
                    if !step["search"].is_null() {
                        let s_fields: Vec<String> = step["search"]["fields"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .map(|k| f_map[k.as_str().unwrap()].clone())
                            .collect();
                        query.insert(
                            "search".into(),
                            json!({ "text": step["search"]["text"], "fields": s_fields }),
                        );
                    }
                    if !step["sort"].is_null() {
                        let sorts: Vec<Value> = step["sort"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .map(|s| {
                                let mut obj = serde_json::Map::new();
                                obj.insert(
                                    "fieldId".into(),
                                    json!(f_map[s["field"].as_str().unwrap()]),
                                );
                                obj.insert("direction".into(), s["direction"].clone());
                                if !s["nulls"].is_null() {
                                    obj.insert("nulls".into(), s["nulls"].clone());
                                }
                                Value::Object(obj)
                            })
                            .collect();
                        query.insert("sort".into(), Value::Array(sorts));
                    }
                    let proj_fields: Vec<String> = step["projection"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|k| f_map[k.as_str().unwrap()].clone())
                        .collect();
                    let resolve_rels: Vec<String> = step["resolveRelations"]
                        .as_array()
                        .map(|arr| {
                            arr.iter()
                                .map(|k| f_map[k.as_str().unwrap()].clone())
                                .collect()
                        })
                        .unwrap_or_default();
                    let mut req_obj = serde_json::Map::new();
                    req_obj.insert("tableId".into(), json!(table_id));
                    req_obj.insert("query".into(), Value::Object(query));
                    req_obj.insert(
                        "projection".into(),
                        json!({ "fields": proj_fields, "resolveRelations": resolve_rels }),
                    );
                    req_obj.insert("limit".into(), step["limit"].clone());
                    if !step["calendar"].is_null() {
                        req_obj.insert("calendar".into(), step["calendar"].clone());
                    }
                    if !step["referenceInstant"].is_null() {
                        req_obj.insert("referenceInstant".into(), step["referenceInstant"].clone());
                    }
                    let page: Value = serde_json::from_str(
                        &svc.invoke_wire_json("queryRows", &Value::Object(req_obj).to_string())
                            .unwrap(),
                    )
                    .unwrap();
                    if let Some(expected) = step["expectTitles"].as_array() {
                        let actual: Vec<&Value> = page["rows"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .map(|r| &r["values"][0])
                            .collect();
                        let exp: Vec<&Value> = expected.iter().collect();
                        assert_eq!(actual, exp, "[{case_id}] queryRows titles mismatch");
                    }
                    if let Some(exp_rows) = step["expectRows"].as_array() {
                        let prefix_len = exp_rows
                            .first()
                            .and_then(Value::as_array)
                            .map(Vec::len)
                            .unwrap_or(0);
                        let actual: Vec<Vec<Value>> = page["rows"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .map(|r| r["values"].as_array().unwrap()[..prefix_len].to_vec())
                            .collect();
                        let expected: Vec<Vec<Value>> = exp_rows
                            .iter()
                            .map(|r| r.as_array().unwrap().clone())
                            .collect();
                        assert_eq!(
                            actual, expected,
                            "[{case_id}] queryRows expectRows mismatch"
                        );
                    }
                    if let Some(exp_labels) = step["expectResolvedLabels"].as_array() {
                        let actual: Vec<Vec<Value>> = page["rows"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .map(|r| {
                                r["resolvedRelations"][0]["items"]
                                    .as_array()
                                    .unwrap()
                                    .iter()
                                    .map(|it| it["label"].clone())
                                    .collect()
                            })
                            .collect();
                        let expected: Vec<Vec<Value>> = exp_labels
                            .iter()
                            .map(|r| r.as_array().unwrap().clone())
                            .collect();
                        assert_eq!(
                            actual, expected,
                            "[{case_id}] queryRows resolved labels mismatch"
                        );
                    }
                }
                "aggregate" => {
                    let t_key = step["table"].as_str().unwrap();
                    let table_id = &tables[t_key];
                    let f_map = &fields[t_key];
                    let items: Vec<Value> = step["items"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|item| {
                            if let Some(fk) = item["field"].as_str() {
                                json!({ "key": item["key"], "op": item["op"], "fieldId": f_map[fk] })
                            } else {
                                json!({ "key": item["key"], "op": item["op"] })
                            }
                        })
                        .collect();
                    let mut req_obj = serde_json::Map::new();
                    req_obj.insert("tableId".into(), json!(table_id));
                    req_obj.insert("items".into(), Value::Array(items));
                    if !step["calendar"].is_null() {
                        req_obj.insert("calendar".into(), step["calendar"].clone());
                    }
                    if !step["referenceInstant"].is_null() {
                        req_obj.insert("referenceInstant".into(), step["referenceInstant"].clone());
                    }
                    if !step["filter"].is_null() {
                        req_obj.insert(
                            "query".into(),
                            json!({ "filter": resolve_filter(&step["filter"], f_map) }),
                        );
                    }
                    let res: Value = serde_json::from_str(
                        &svc.invoke_wire_json("aggregate", &Value::Object(req_obj).to_string())
                            .unwrap(),
                    )
                    .unwrap();
                    for (k, exp) in step["expect"].as_object().unwrap() {
                        let actual = res["results"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .find(|r| r["key"] == *k)
                            .unwrap();
                        if exp.is_number() {
                            assert_eq!(
                                actual["value"].as_f64().unwrap(),
                                exp.as_f64().unwrap(),
                                "[{case_id}] aggregate {k}"
                            );
                        } else {
                            assert_eq!(&actual["value"], exp, "[{case_id}] aggregate {k}");
                        }
                    }
                }
                "groupRowsAndPaginate" => {
                    let t_key = step["table"].as_str().unwrap();
                    let table_id = &tables[t_key];
                    let f_map = &fields[t_key];
                    let group_by: Vec<String> = step["groupBy"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|k| f_map[k.as_str().unwrap()].clone())
                        .collect();
                    let proj: Vec<String> = step["projection"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|k| f_map[k.as_str().unwrap()].clone())
                        .collect();
                    let sorts: Vec<Value> = step["sort"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|s| {
                            json!({
                                "fieldId": f_map[s["field"].as_str().unwrap()],
                                "direction": s["direction"],
                            })
                        })
                        .collect();
                    let gp: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "groupRows",
                            &json!({
                                "tableId": table_id,
                                "query": { "sort": sorts },
                                "groupBy": group_by,
                                "aggregates": [],
                                "projection": { "fields": proj, "resolveRelations": [] },
                                "groupLimit": 20,
                                "rowsPerGroup": step["rowsPerGroup"],
                            })
                            .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    let target = step["targetGroup"].as_str().unwrap();
                    let bucket = gp["groups"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|g| g["key"][0].as_str() == Some(target))
                        .unwrap();
                    let init_titles: Vec<&Value> = bucket["rows"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|r| &r["values"][0])
                        .collect();
                    let exp_init: Vec<&Value> = step["expectInitialTitles"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .collect();
                    assert_eq!(init_titles, exp_init);
                    let cursor = bucket["nextRowCursor"].as_str().expect("nextRowCursor");
                    let next: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "queryGroupRows",
                            &json!({ "cursor": cursor, "limit": 10 }).to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    assert_eq!(next["groupKey"], json!([target]));
                    let next_titles: Vec<&Value> = next["rows"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|r| &r["values"][0])
                        .collect();
                    let exp_next: Vec<&Value> = step["expectNextPageTitles"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .collect();
                    assert_eq!(next_titles, exp_next);
                    assert!(next["nextCursor"].is_null());
                }
                "getRowsById" => {
                    let t_key = step["table"].as_str().unwrap();
                    let table_id = &tables[t_key];
                    let f_map = &fields[t_key];
                    let row_ids: Vec<String> = step["rowKeys"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|v| {
                            let s = v.as_str().unwrap();
                            if let Some(rest) = s.strip_prefix("$missing:") {
                                rest.to_string()
                            } else {
                                rows[s].clone()
                            }
                        })
                        .collect();
                    let proj: Vec<String> = step["projection"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|k| f_map[k.as_str().unwrap()].clone())
                        .collect();
                    let batch: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "getRowsById",
                            &json!({
                                "tableId": table_id,
                                "rowIds": row_ids,
                                "projection": { "fields": proj, "resolveRelations": [] },
                            })
                            .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    let titles: Vec<&Value> = batch["rows"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|r| &r["values"][0])
                        .collect();
                    let exp: Vec<&Value> =
                        step["expectTitles"].as_array().unwrap().iter().collect();
                    assert_eq!(titles, exp);
                    assert_eq!(
                        batch["missingRowIds"].as_array().unwrap().len(),
                        step["expectMissingCount"].as_u64().unwrap() as usize
                    );
                }
                "recordNeighborsAndIndex" => {
                    let t_key = step["table"].as_str().unwrap();
                    let table_id = &tables[t_key];
                    let f_map = &fields[t_key];
                    let row_id = &rows[step["rowKey"].as_str().unwrap()];
                    let sorts: Vec<Value> = step["sort"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|s| {
                            json!({
                                "fieldId": f_map[s["field"].as_str().unwrap()],
                                "direction": s["direction"],
                            })
                        })
                        .collect();
                    let neighbors: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "getRecordNeighbors",
                            &json!({
                                "tableId": table_id,
                                "rowId": row_id,
                                "query": { "sort": sorts },
                            })
                            .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    assert_eq!(neighbors["found"], true);
                    assert_eq!(
                        neighbors["previousId"].as_str().unwrap(),
                        rows[step["expectPrevKey"].as_str().unwrap()]
                    );
                    assert_eq!(
                        neighbors["nextId"].as_str().unwrap(),
                        rows[step["expectNextKey"].as_str().unwrap()]
                    );
                    let idx: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "getRowIndex",
                            &json!({
                                "tableId": table_id,
                                "rowId": row_id,
                                "query": { "sort": sorts },
                            })
                            .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    assert_eq!(idx.as_str().unwrap(), step["expectIndex"].as_str().unwrap());
                }
                "groupRows" => {
                    let t_key = step["table"].as_str().unwrap();
                    let table_id = &tables[t_key];
                    let f_map = &fields[t_key];
                    let group_by: Vec<String> = step["groupBy"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|k| f_map[k.as_str().unwrap()].clone())
                        .collect();
                    let proj: Vec<String> = step["projection"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|k| f_map[k.as_str().unwrap()].clone())
                        .collect();
                    let res: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "groupRows",
                            &json!({
                                "tableId": table_id,
                                "query": {},
                                "groupBy": group_by,
                                "aggregates": [],
                                "projection": { "fields": proj, "resolveRelations": [] },
                                "groupLimit": 20,
                                "rowsPerGroup": 10,
                            })
                            .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    let mut actual = HashMap::new();
                    for g in res["groups"].as_array().unwrap() {
                        actual.insert(
                            g["key"][0].as_str().unwrap().to_string(),
                            g["count"].as_str().unwrap().to_string(),
                        );
                    }
                    for (k, exp) in step["expectGroupCounts"].as_object().unwrap() {
                        assert_eq!(actual.get(k).map(String::as_str), exp.as_str());
                    }
                }
                "staleRevisionUpdate" => {
                    let t_key = step["table"].as_str().unwrap();
                    let table_id = &tables[t_key];
                    let f_map = &fields[t_key];
                    let row_id = &rows[step["rowKey"].as_str().unwrap()];
                    let err = svc
                        .invoke_wire_json(
                            "mutateRows",
                            &json!({
                                "tableId": table_id,
                                "expectedRevision": "0",
                                "changes": [{
                                    "kind": "update",
                                    "rowId": row_id,
                                    "values": { &f_map["score"]: 1 }
                                }]
                            })
                            .to_string(),
                        )
                        .unwrap_err();
                    assert_eq!(err.code, step["expectErrorCode"].as_str().unwrap());
                }
                "updateRow" => {
                    let t_key = step["table"].as_str().unwrap();
                    let table_id = &tables[t_key];
                    let f_map = &fields[t_key];
                    let row_id = &rows[step["rowKey"].as_str().unwrap()];
                    let mut mapped = serde_json::Map::new();
                    for (k, v) in step["values"].as_object().unwrap() {
                        mapped.insert(f_map[k].clone(), v.clone());
                    }
                    let res: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "mutateRows",
                            &json!({
                                "tableId": table_id,
                                "expectedRevision": revision,
                                "changes": [{ "kind": "update", "rowId": row_id, "values": mapped }]
                            })
                            .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    revision = res["revision"].as_str().unwrap().to_string();
                    assert_eq!(res["changed"], true);
                }
                "deleteAndRevertRow" => {
                    let t_key = step["table"].as_str().unwrap();
                    let table_id = &tables[t_key];
                    let row_id = &rows[step["rowKey"].as_str().unwrap()];
                    let del: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "mutateRowsWithUndo",
                            &json!({
                                "tableId": table_id,
                                "expectedRevision": revision,
                                "changes": [{ "kind": "delete", "rowId": row_id }]
                            })
                            .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    revision = del["revision"].as_str().unwrap().to_string();
                    let undo_token = del["undoToken"].as_str().expect("undoToken");
                    let agg1: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "aggregate",
                            &json!({ "tableId": table_id, "items": [{ "key": "n", "op": "count-all" }] })
                                .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    assert_eq!(agg1["results"][0]["value"], step["expectCountAfterDelete"]);

                    let rev: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "revertRowDeletion",
                            &json!({ "undoToken": undo_token, "expectedRevision": revision })
                                .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    revision = rev["revision"].as_str().unwrap().to_string();
                    let agg2: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "aggregate",
                            &json!({ "tableId": table_id, "items": [{ "key": "n", "op": "count-all" }] })
                                .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    assert_eq!(agg2["results"][0]["value"], step["expectCountAfterRevert"]);
                }
                "mutateViewLifecycle" => {
                    let t_key = step["table"].as_str().unwrap();
                    let table_id = &tables[t_key];
                    let vname = step["viewName"].as_str().unwrap();
                    let vtype = step["viewType"].as_str().unwrap();
                    let created: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "mutateView",
                            &json!({
                                "expectedRevision": revision,
                                "changes": [
                                    { "kind": "create-view", "clientKey": "v1", "tableId": table_id, "name": vname, "type": vtype, "query": {}, "layout": {}, "position": "0" },
                                    { "kind": "create-view", "clientKey": "v2", "tableId": table_id, "name": format!("{vname} Secondary"), "type": vtype, "query": {}, "layout": {}, "position": "1" },
                                ]
                            })
                            .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    revision = created["revision"].as_str().unwrap().to_string();
                    let view_id = created["createdViews"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|v| v["clientKey"] == "v2")
                        .unwrap()["viewId"]
                        .as_str()
                        .unwrap()
                        .to_string();
                    let upd: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "mutateView",
                            &json!({
                                "expectedRevision": revision,
                                "changes": [{ "kind": "update-view", "viewId": view_id, "patch": { "name": format!("{vname} Updated") } }]
                            })
                            .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    revision = upd["revision"].as_str().unwrap().to_string();
                    let del: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "mutateView",
                            &json!({
                                "expectedRevision": revision,
                                "changes": [{ "kind": "delete-view", "viewId": view_id }]
                            })
                            .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    revision = del["revision"].as_str().unwrap().to_string();
                }
                "previewFormula" => {
                    let t_key = step["table"].as_str().unwrap();
                    let table_id = &tables[t_key];
                    let res: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "previewFormula",
                            &json!({
                                "tableId": table_id,
                                "candidateName": "Computed",
                                "sourceText": step["sourceText"],
                                "declaredResultType": step["declaredResultType"],
                            })
                            .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    assert_eq!(
                        res["valid"], step["expectValid"],
                        "diags: {}",
                        res["diagnostics"]
                    );
                    let actual: Vec<f64> = res["rows"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|r| r["value"].as_f64().unwrap())
                        .collect();
                    let expected: Vec<f64> = step["expectValues"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|v| v.as_f64().unwrap())
                        .collect();
                    assert_eq!(actual, expected);
                }
                "convertField" => {
                    let t_key = step["table"].as_str().unwrap();
                    let table_id = &tables[t_key];
                    let f_map = &fields[t_key];
                    let field_id = &f_map[step["field"].as_str().unwrap()];
                    let change = json!({
                        "kind": "convert-field",
                        "fieldId": field_id,
                        "to": step["to"],
                        "toNullable": step["toNullable"],
                    });
                    let plan: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "preflightSchema",
                            &json!({ "change": change, "expectedRevision": revision }).to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    assert_eq!(plan["classification"], step["expectClassification"]);
                    let res: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "mutateSchema",
                            &json!({
                                "planToken": plan["planToken"],
                                "expectedRevision": revision,
                                "actionsHash": plan["actionsHash"],
                            })
                            .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    revision = res["revision"].as_str().unwrap().to_string();
                    let page: Value = serde_json::from_str(
                        &svc.invoke_wire_json(
                            "queryRows",
                            &json!({
                                "tableId": table_id,
                                "query": {},
                                "projection": { "fields": [field_id], "resolveRelations": [] },
                                "limit": 10,
                            })
                            .to_string(),
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    let actual: Vec<&Value> = page["rows"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|r| &r["values"][0])
                        .collect();
                    let expected: Vec<&Value> = step["expectValuesAfter"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .collect();
                    assert_eq!(actual.len(), expected.len());
                    for (a, e) in actual.iter().zip(expected.iter()) {
                        if e.is_number() {
                            assert_eq!(a.as_f64().unwrap(), e.as_f64().unwrap());
                        } else {
                            assert_eq!(a, e);
                        }
                    }
                }
                other => panic!("Unknown conformance op: {other}"),
            }
        }
        svc.close().unwrap();
    }
}
