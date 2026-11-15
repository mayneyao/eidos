//! Shared native bridge acceptance; all date evaluation remains in QuickJS.
use anyhow::{ensure, Result};
use serde_json::{json, Value};
use std::path::Path;

pub(crate) fn check(mut execute: impl FnMut(&Path, &str, Value) -> Result<Value>) -> Result<()> {
    let directory = tempfile::tempdir()?;
    let path = directory.path().join("calendar.eidos");
    std::fs::write(
        &path,
        include_bytes!("../../../packages/eidos-file/test-fixtures/date-queries-v1.eidos"),
    )?;
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../packages/eidos-file/test-fixtures/date-queries-v1.json"
    ))?;
    let table = fixture["tableId"].as_str().unwrap();
    let label = fixture["label"].as_str().unwrap();
    let date = fixture["date"].as_str().unwrap();
    let instant = fixture["instant"].as_str().unwrap();
    let capability = execute(
        &path,
        "web:negotiate",
        json!({"protocol":"eidos-runtime","versions":["1.0"]}),
    )?;
    ensure!(capability["capabilities"]["calendarQueryVersion"] == 2);
    ensure!(capability["capabilities"]
        .get("calendarDayTimeZoneData")
        .is_none());
    let snapshot = execute(&path, "web:getSnapshot", json!({}))?;
    let schema = execute(
        &path,
        "web:getSchemaPage",
        json!({"calendarQueryVersion":2,"revision":snapshot["revision"],"limit":100}),
    )?;
    let legacy = schema["objects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["object"] == "view" && item["name"] == "Old relative")
        .unwrap();
    ensure!(
        legacy["queryStatus"] == "unsupported"
            && legacy["query"]["filter"]["args"][0]["op"] == "relative-date"
    );
    ensure!(execute(&path, "web:queryRows", json!({"tableId":table,"query":legacy["query"],"projection":{"fields":[label],"resolveRelations":[]},"limit":20})).is_err());
    execute(
        &path,
        "web:mutateRows",
        json!({"tableId":table,"expectedRevision":snapshot["revision"],"changes":[{"kind":"create","clientKey":"later","values":{label:"later",date:"2026-11-12",instant:"2026-11-12T20:00:00.123Z"}}]}),
    )?;
    let reference = "2026-11-13T00:30:00.000Z";
    let calendar = json!({"timeZone":"America/New_York","timeZoneData":"2026f","weekStartsOn":1});
    let mut request = json!({"tableId":table,"calendar":calendar,"referenceInstant":reference,"query":{"filter":{"op":"calendar-period","fieldId":instant,"unit":"day","offset":0},"sort":[{"fieldId":label,"direction":"asc"}]},"projection":{"fields":[label,date,instant],"resolveRelations":[]},"limit":1});
    let mut missing = request.clone();
    missing.as_object_mut().unwrap().remove("calendar");
    ensure!(execute(&path, "web:queryRows", missing).is_err());
    let first = execute(&path, "web:queryRows", request.clone())?;
    ensure!(
        first["rows"][0]["values"][0] == "later"
            && first["total"] == "2"
            && first["referenceInstant"] == reference
    );
    let snapshot = execute(&path, "web:getSnapshot", json!({}))?;
    execute(
        &path,
        "web:getSchemaPage",
        json!({"calendarQueryVersion":2,"revision":snapshot["revision"],"limit":100}),
    )?;
    request["cursor"] = first["nextCursor"].clone();
    let second = execute(&path, "web:queryRows", request.clone())?;
    ensure!(
        second["rows"][0]["values"][0] == "today"
            && second["total"] == "2"
            && second["referenceInstant"] == reference
    );
    let batch = execute(
        &path,
        "web:queryRowPages",
        json!({"tableId":table,"calendar":calendar,"referenceInstant":reference,"queries":[request["query"], {"filter":{"op":"calendar-period","fieldId":date,"unit":"day","offset":0}}],"projection":request["projection"],"limit":20}),
    )?;
    ensure!(batch
        .as_array()
        .unwrap()
        .iter()
        .all(|page| page["total"] == "2" && page["referenceInstant"] == reference));
    for changed in [
        json!({"timeZone":"Asia/Shanghai","timeZoneData":"2026f","weekStartsOn":1}),
        json!({"timeZone":"America/New_York","timeZoneData":"2026f","weekStartsOn":0}),
    ] {
        let mut invalid = request.clone();
        invalid["calendar"] = changed;
        ensure!(execute(&path, "web:queryRows", invalid).is_err());
    }
    let mut invalid = request.clone();
    invalid["referenceInstant"] = json!("2026-11-14T00:30:00.000Z");
    ensure!(execute(&path, "web:queryRows", invalid).is_err());
    request.as_object_mut().unwrap().remove("cursor");
    request["limit"] = json!(20);
    request["calendar"]["timeZone"] = json!("Asia/Shanghai");
    let changed = execute(&path, "web:queryRows", request.clone())?;
    ensure!(
        changed["rows"]
            .as_array()
            .unwrap()
            .iter()
            .map(|row| row["values"][0].as_str().unwrap())
            .collect::<Vec<_>>()
            == ["boundary", "later"]
    );
    request["calendar"] = calendar;
    request["query"]["filter"]["fieldId"] = json!(date);
    let literal = execute(&path, "web:queryRows", request)?;
    ensure!(
        literal["rows"]
            .as_array()
            .unwrap()
            .iter()
            .map(|row| row["values"][0].as_str().unwrap())
            .collect::<Vec<_>>()
            == ["later", "today"]
    );
    let view_id = fixture["views"][1]["viewId"].clone();
    let upgraded = execute(
        &path,
        "web:mutateView",
        json!({"expectedRevision":snapshot["revision"],"changes":[{"kind":"upgrade-date-query","viewId":view_id}]}),
    )?;
    let schema = execute(
        &path,
        "web:getSchemaPage",
        json!({"calendarQueryVersion":2,"revision":upgraded["revision"],"limit":100}),
    )?;
    let view = schema["objects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|view| view["id"] == view_id)
        .unwrap();
    ensure!(view["queryStatus"] == "supported" && !view["query"].to_string().contains("timeZone"));
    ensure!(
        view["layout"]["space.eidos/date-query-upgrade"]["originalQuery"]["filter"]["args"][0]
            ["op"]
            == "calendar-day"
    );
    ensure!(execute(&path, "web:getSnapshot", json!({}))?["schemaCounts"]["features"] == "1");
    let legacy_schema = execute(
        &path,
        "web:getSchemaPage",
        json!({"revision":upgraded["revision"],"limit":100}),
    )?;
    ensure!(
        legacy_schema["objects"]
            .as_array()
            .unwrap()
            .iter()
            .find(|view| view["id"] == view_id)
            .unwrap()["queryStatus"]
            == "unsupported"
    );
    ensure!(execute(&path,"web:mutateView",json!({"expectedRevision":upgraded["revision"],"changes":[{"kind":"update-view","viewId":view_id,"patch":{"query":{}}}]})).is_err());
    execute(&path, "close", Value::Null)?;
    // Reopen a real marked file through the shared session / owned C FFI path.
    ensure!(execute(&path, "web:getSnapshot", json!({}))?["schemaCounts"]["features"] == "1");
    ensure!(execute(&path,"web:queryRows",json!({"tableId":table,"query":{},"projection":{"fields":[label],"resolveRelations":[]},"limit":20}))?["rows"].as_array().unwrap().len() == 5);
    execute(&path, "close", Value::Null)?;
    for (name, required) in [("unknown-required", 1), ("unknown-optional", 0)] {
        let feature_path = directory.path().join(format!("{name}.eidos"));
        std::fs::copy(&path, &feature_path)?;
        // Construct a compatibility fixture while no Runtime owns the file.
        let connection = rusqlite::Connection::open(&feature_path)?;
        connection.execute(
            "INSERT INTO eidos__features VALUES ('x__probe__future','9',?1,'{}')",
            [required],
        )?;
        drop(connection);
        let result = execute(&feature_path, "web:getSnapshot", json!({}));
        if required == 1 {
            ensure!(result.is_err());
        } else {
            ensure!(result?["schemaCounts"]["features"] == "2");
            execute(&feature_path, "close", Value::Null)?;
        }
    }
    for sql in [
        "DELETE FROM eidos__features WHERE name='eidos:calendar-query'",
        "UPDATE eidos__features SET version='3' WHERE name='eidos:calendar-query'",
    ] {
        let feature_path = directory.path().join("invalid-calendar.eidos");
        std::fs::copy(&path, &feature_path)?;
        let connection = rusqlite::Connection::open(&feature_path)?;
        connection.execute(sql, [])?;
        drop(connection);
        ensure!(execute(&feature_path, "web:getSnapshot", json!({})).is_err());
    }
    Ok(())
}
