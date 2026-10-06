//! Android transport for the canonical Runtime. No SQL or field semantics live here.
use std::{path::Path, rc::Rc};

use anyhow::{anyhow, ensure, Result};
use qjs_host::{clear_active_context, open_host_state, open_host_state_read_only, QjsHost};
use serde_json::{json, Value};

pub mod cancellation;
pub mod graft;
pub mod merge;
pub mod publish;
pub mod session;
pub mod system_merge;

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_space_eidos_android_NativeGraft_execute(
    mut env: jni::JNIEnv,
    _class: jni::objects::JClass,
    root: jni::objects::JString,
    method: jni::objects::JString,
    request: jni::objects::JString,
) -> jni::sys::jstring {
    static HOST: std::sync::LazyLock<std::sync::Mutex<graft::GraftHost>> =
        std::sync::LazyLock::new(|| std::sync::Mutex::new(graft::GraftHost::default()));
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Result<Value> {
        let root: String = env.get_string(&root)?.into();
        let method: String = env.get_string(&method)?.into();
        let request: String = env.get_string(&request)?.into();
        // Release all Runtime SQLite handles before Graft checkpoints or materializes files.
        session::dispatch(std::path::PathBuf::new(), "close".into(), Value::Null)?;
        let mut request: Value = serde_json::from_str(&request)?;
        let cancellation = request
            .as_object_mut()
            .and_then(|object| object.remove("_androidCancellation"));
        let cancellation = cancellation
            .as_ref()
            .map(|value| {
                value
                    .as_str()
                    .ok_or_else(|| anyhow!("Invalid cancellation identity"))
            })
            .transpose()?;
        cancellation::run(cancellation, || {
            HOST.lock()
                .map_err(|_| anyhow!("Graft session failed; restart the app"))?
                .execute(Path::new(&root), &method, request)
        })
    }));
    let envelope = match result {
        Ok(Ok(value)) => json!({"ok": true, "value": value}),
        Ok(Err(error)) => json!({"ok": false, "error": error.to_string(),
            "code": error.downcast_ref::<graft_sdk::SdkError>().map(|e| e.code().as_str()).unwrap_or("ANDROID_GRAFT_ERROR")}),
        Err(_) => {
            json!({"ok": false, "error": "Native Graft failed", "code": "ANDROID_GRAFT_PANIC"})
        }
    };
    match env.new_string(envelope.to_string()) {
        Ok(value) => value.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_space_eidos_android_NativeGraft_beginCancellation(
    mut env: jni::JNIEnv,
    _class: jni::objects::JClass,
    id: jni::objects::JString,
) -> jni::sys::jboolean {
    let Ok(id) = env.get_string(&id) else {
        return 0;
    };
    u8::from(cancellation::begin(&String::from(id)).is_ok())
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_space_eidos_android_NativeGraft_cancel(
    mut env: jni::JNIEnv,
    _class: jni::objects::JClass,
    id: jni::objects::JString,
) {
    if let Ok(id) = env.get_string(&id) {
        cancellation::cancel(&String::from(id));
    }
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_space_eidos_android_NativeGraft_endCancellation(
    mut env: jni::JNIEnv,
    _class: jni::objects::JClass,
    id: jni::objects::JString,
) {
    if let Ok(id) = env.get_string(&id) {
        cancellation::end(&String::from(id));
    }
}

// Progress polling does not acquire the busy Graft host lock.
#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_space_eidos_android_NativeGraft_downloadedBytes(
    mut env: jni::JNIEnv,
    _class: jni::objects::JClass,
    id: jni::objects::JString,
) -> jni::sys::jlong {
    let Ok(id) = env.get_string(&id) else {
        return -1;
    };
    cancellation::downloaded(&String::from(id))
        .map(|bytes| bytes.min(i64::MAX as u64) as i64)
        .unwrap_or(-1)
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_space_eidos_android_NativeGraft_transferProgress(
    mut env: jni::JNIEnv,
    _class: jni::objects::JClass,
    id: jni::objects::JString,
) -> jni::sys::jstring {
    let value = env
        .get_string(&id)
        .ok()
        .and_then(|id| cancellation::progress(&String::from(id)))
        .unwrap_or(Value::Null);
    env.new_string(value.to_string())
        .map(|value| value.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

// SQLite scalar callbacks retain a QuickJS context in thread-local storage.
// Always release it before dropping the host, including on errors.
struct ActiveContextGuard;
impl Drop for ActiveContextGuard {
    fn drop(&mut self) {
        clear_active_context();
    }
}

fn unwrap(raw: &str) -> Result<Value> {
    let envelope: Value = serde_json::from_str(raw)?;
    ensure!(envelope["ok"] == true, "{}", envelope["error"]);
    Ok(envelope["value"].clone())
}

fn call(host: &QjsHost, method: &str, request: Value) -> Result<Value> {
    unwrap(&host.invoke(
        "call",
        &[
            method.into(),
            request.to_string(),
            json!({"requestId": "android", "deadlineMilliseconds": 30_000}).to_string(),
        ],
    )?)
}

/// Each invocation owns its connection and VM on the calling worker thread.
/// Android serializes calls with file writes and future Graft materialization.
pub fn execute(path: &Path, method: &str, request: Value) -> Result<Value> {
    if method == "checkIntegrity" {
        let connection = rusqlite::Connection::open_with_flags(
            path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )?;
        let mut statement = connection.prepare("PRAGMA quick_check")?;
        let checks = statement
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        return Ok(json!({"valid": checks == ["ok"]}));
    }
    let creating = method == "create";
    if creating {
        ensure!(!path.exists(), "File already exists");
    } else {
        ensure!(path.is_file(), "File does not exist");
    }
    let searching = matches!(method, "searchSchema" | "searchRows" | "validate");
    let state = Rc::new(if searching {
        open_host_state_read_only(path)?
    } else {
        open_host_state(path)?
    });
    let host = QjsHost::new(&state)?;
    let _active = ActiveContextGuard;
    let opened: Value = serde_json::from_str(
        &host.invoke(
            "open",
            &[if creating {
                json!({"mode": "create", "title": request["title"]})
            } else {
                json!({"mode": "open", "access": if searching { "readonly" } else { "readwrite" }})
            }
            .to_string()],
        )?,
    )?;
    ensure!(opened["ok"] == true, "{}", opened["error"]);

    let result = (|| match method {
        "schema" | "searchSchema" => {
            let snapshot = call(&host, "getSnapshot", json!({}))?;
            let mut objects = Vec::new();
            let mut cursor = Value::Null;
            loop {
                let mut request = json!({"revision": snapshot["revision"], "limit": 200});
                if !cursor.is_null() {
                    request["cursor"] = cursor;
                }
                let page = call(&host, "getSchemaPage", request)?;
                objects.extend(
                    page["objects"]
                        .as_array()
                        .ok_or_else(|| anyhow!("Invalid schema page"))?
                        .clone(),
                );
                cursor = page["nextCursor"].clone();
                if cursor.is_null() {
                    break;
                }
            }
            Ok(json!({"snapshot": snapshot, "objects": objects}))
        }
        "create" => {
            let snapshot = call(&host, "getSnapshot", json!({}))?;
            let plan = call(
                &host,
                "preflightSchema",
                json!({
                    "expectedRevision": snapshot["revision"],
                    "change": {
                        "kind": "create-table", "clientKey": "records", "name": "记录", "position": "0",
                        "labelFieldClientKey": "title",
                        "fields": request.get("fields").cloned().unwrap_or_else(|| json!([
                            {"clientKey": "title", "name": "标题", "kind": "text", "position": "0"},
                            {"clientKey": "notes", "name": "笔记", "kind": "text", "position": "1"}
                        ]))
                    }
                }),
            )?;
            call(
                &host,
                "mutateSchema",
                json!({
                    "expectedRevision": snapshot["revision"], "planToken": plan["planToken"], "actionsHash": plan["actionsHash"]
                }),
            )
        }
        "allocateFileEntry" => unwrap(&host.invoke("allocateFileEntry", &[request.to_string()])?),
        "searchRows" => call(&host, "queryRows", request),
        "queryRows" | "mutateRows" | "mutateView" | "getSnapshot" | "validate" => {
            call(&host, method, request)
        }
        _ => Err(anyhow!("Unsupported Android Runtime operation: {method}")),
    })();
    let closed = host.invoke("close", &[]).and_then(|raw| unwrap(&raw));
    match (result, closed) {
        (Err(error), _) | (Ok(_), Err(error)) => Err(error),
        (Ok(value), Ok(_)) => Ok(value),
    }
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_space_eidos_android_NativeRuntime_execute(
    mut env: jni::JNIEnv,
    _class: jni::objects::JClass,
    path: jni::objects::JString,
    method: jni::objects::JString,
    request: jni::objects::JString,
) -> jni::sys::jstring {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Result<Value> {
        let path: String = env.get_string(&path)?.into();
        let method: String = env.get_string(&method)?.into();
        let request: String = env.get_string(&request)?.into();
        session::dispatch(path.into(), method, serde_json::from_str(&request)?)
    }));
    let envelope = match result {
        Ok(Ok(value)) => json!({"ok": true, "value": value}),
        Ok(Err(error)) => json!({"ok": false, "error": error.to_string()}),
        Err(_) => json!({"ok": false, "error": "Native Runtime failed"}),
    };
    match env.new_string(envelope.to_string()) {
        Ok(value) => value.into_raw(),
        Err(_) => std::ptr::null_mut(), // JNI retains the allocation exception.
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capability_failure_is_distinct_from_sqlite_integrity() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let path = directory.path().join("files.eidos");
        execute(&path, "create", json!({"title": "Files"}))?;
        let connection = rusqlite::Connection::open(&path)?;
        connection.execute(
            "INSERT INTO eidos__features VALUES ('vtab:fs_meta','1',1,'{}')",
            [],
        )?;
        drop(connection);
        let before = std::fs::read(&path)?;
        let report = execute(
            &path,
            "validate",
            json!({"level": "full", "diagnosticsLimit": 100}),
        )?;
        assert_eq!(report["valid"], false);
        assert_eq!(report["diagnostics"][0]["code"], "file-feature-unsupported");
        assert_eq!(
            execute(
                &path,
                "validate",
                json!({"level": "identity", "diagnosticsLimit": 100})
            )?["valid"],
            true
        );
        assert_eq!(execute(&path, "checkIntegrity", json!({}))?["valid"], true);
        assert_eq!(std::fs::read(&path)?, before);
        std::fs::write(&path, b"incomplete download")?;
        assert!(execute(&path, "checkIntegrity", json!({})).is_err());
        Ok(())
    }

    #[test]
    fn create_reopen_mutate_and_reject_stale_revision() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let path = directory.path().join("records.eidos");
        execute(&path, "create", json!({"title": "手机资料"}))?;
        let schema = execute(&path, "schema", json!({}))?;
        let objects = schema["objects"].as_array().unwrap();
        let table = objects
            .iter()
            .find(|object| object["object"] == "table")
            .unwrap();
        let field = &table["labelFieldId"];
        let mut values = serde_json::Map::new();
        values.insert(field.as_str().unwrap().into(), json!("离线记录"));
        let request = json!({"tableId": table["id"], "expectedRevision": schema["snapshot"]["revision"],
            "changes": [{"kind": "create", "clientKey": "one", "values": values}]});
        execute(&path, "mutateRows", request.clone())?;
        assert!(execute(&path, "mutateRows", request).is_err());
        let rows = execute(
            &path,
            "queryRows",
            json!({"tableId": table["id"], "query": {},
            "projection": {"fields": [field], "resolveRelations": []}, "limit": 50}),
        )?;
        assert_eq!(rows["rows"][0]["values"][0], "离线记录");
        assert!(execute(&path, "create", json!({"title": "overwrite"})).is_err());
        Ok(())
    }

    #[test]
    fn attachment_metadata_uses_runtime_validation_without_mutating_revision() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let path = directory.path().join("attachments.eidos");
        execute(&path, "create", json!({"title": "Attachments"}))?;
        let before = execute(&path, "getSnapshot", json!({}))?["revision"].clone();
        let request = json!({"name": "图.png", "mediaType": "image/png", "size": "4", "uri": "assets/%E5%9B%BE.png"});
        let entry = execute(&path, "allocateFileEntry", request.clone())?;
        assert_eq!(entry["size"], "4");
        assert_eq!(entry["uri"], request["uri"]);
        assert_eq!(entry["id"].as_str().unwrap().as_bytes()[14], b'7');
        let mut invalid = request.clone();
        invalid["uri"] = json!("../outside.png");
        assert!(execute(&path, "allocateFileEntry", invalid).is_err());
        let mut invalid = request;
        invalid["size"] = json!(4);
        assert!(execute(&path, "allocateFileEntry", invalid).is_err());
        assert_eq!(
            execute(&path, "getSnapshot", json!({}))?["revision"],
            before
        );
        Ok(())
    }

    #[test]
    fn failed_open_does_not_poison_next_call() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let bad = directory.path().join("invalid.eidos");
        std::fs::write(&bad, "not sqlite")?;
        assert!(execute(&bad, "schema", json!({})).is_err());
        let good = directory.path().join("good.eidos");
        execute(&good, "create", json!({"title": "Good"}))?;
        assert!(execute(&good, "schema", json!({}))?["objects"].is_array());
        Ok(())
    }
}
