//! iOS C transport. The canonical TypeScript Runtime owns all File semantics.
use anyhow::{anyhow, ensure, Result};
use qjs_host::{clear_active_context, open_host_state, QjsHost};
use serde_json::{json, Value};
use std::{
    ffi::{c_char, CStr, CString},
    path::PathBuf,
    rc::Rc,
    sync::{mpsc, OnceLock},
};
#[cfg(test)]
mod history;
#[cfg(test)]
mod sync_tests;

struct Session(QjsHost);
impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.0.invoke("close", &[]);
        clear_active_context();
    }
}
fn unwrap(raw: String) -> Result<Value> {
    let result: Value = serde_json::from_str(&raw)?;
    ensure!(result["ok"] == true, "{}", result["error"]);
    Ok(result["value"].clone())
}
fn call(session: &Session, method: &str, request: Value) -> Result<Value> {
    unwrap(session.0.invoke(
        "call",
        &[
            method.into(),
            request.to_string(),
            json!({"requestId":"ios", "deadlineMilliseconds":30000}).to_string(),
        ],
    )?)
}
struct Host {
    session: Option<(PathBuf, Session)>,
    graft: mobile_host::graft::GraftHost,
}
impl Default for Host {
    fn default() -> Self {
        Self {
            session: None,
            graft: mobile_host::graft::GraftHost::with_identity("Eidos iOS", "ios@eidos.local"),
        }
    }
}
impl Host {
    fn execute(&mut self, path: PathBuf, method: &str, request: Value) -> Result<Value> {
        if let Some(operation) = method.strip_prefix("publish:") {
            if operation == "progress" {
                return Ok(mobile_host::publish::progress());
            }
            self.session = None;
            let mut request = request;
            request["clientPlatform"] = json!("ios");
            return mobile_host::publish::execute(&path, operation, request);
        }
        if let Some(operation) = method.strip_prefix("graft:") {
            self.session = None;
            if operation == "history" && !path.join(".graft").exists() {
                ensure!(path.is_dir(), "Space directory does not exist");
                return Ok(json!({"commits": []}));
            }
            let mut request = request;
            let cancellation = request
                .as_object_mut()
                .and_then(|value| value.remove("_iosCancellation"));
            return mobile_host::cancellation::run(
                cancellation.as_ref().and_then(Value::as_str),
                || self.graft.execute(&path, operation, request),
            );
        }
        if method == "close" {
            self.session = None;
            return Ok(Value::Null);
        }
        if matches!(
            method,
            "searchSchema" | "searchRows" | "validate" | "checkIntegrity"
        ) {
            self.session = None;
            return mobile_host::execute(&path, method, request);
        }
        let creating = method == "create";
        ensure!(
            creating
                || matches!(
                    method,
                    "negotiate"
                        | "getSnapshot"
                        | "getSchemaPage"
                        | "getRecordNeighbors"
                        | "queryRows"
                        | "getRowsById"
                        | "aggregate"
                        | "groupRows"
                        | "queryGroupRows"
                        | "previewFormula"
                        | "mutateRows"
                        | "mutateView"
                        | "preflightSchema"
                        | "getSchemaPlanDependencies"
                        | "mutateSchema"
                        | "validate"
                        | "allocateFileEntry"
                ),
            "Unsupported Runtime operation"
        );
        if creating {
            ensure!(!path.exists(), "File already exists");
        } else {
            ensure!(path.is_file(), "File does not exist");
        }
        if creating || self.session.as_ref().is_none_or(|(p, _)| p != &path) {
            self.session = None;
            let state = Rc::new(open_host_state(&path)?);
            let session = Session(QjsHost::new(&state)?);
            unwrap(
                session.0.invoke(
                    "open",
                    &[if creating {
                        json!({"mode":"create", "title":request["title"]})
                    } else {
                        json!({"mode":"open", "access":"readwrite"})
                    }
                    .to_string()],
                )?,
            )?;
            self.session = Some((path, session));
        }
        let session = &self.session.as_ref().unwrap().1;
        if method == "allocateFileEntry" {
            return unwrap(
                session
                    .0
                    .invoke("allocateFileEntry", &[request.to_string()])?,
            );
        }
        if !creating {
            return call(session, method, request);
        }
        let snapshot = call(session, "getSnapshot", json!({}))?;
        let plan = call(
            session,
            "preflightSchema",
            json!({"expectedRevision":snapshot["revision"],
            "change":{"kind":"create-table","clientKey":"records","name":"记录","position":"0",
            "labelFieldClientKey":"title","fields":[
                {"clientKey":"title","name":"标题","kind":"text","position":"0"},
                {"clientKey":"notes","name":"笔记","kind":"text","position":"1"}]}}),
        )?;
        call(
            session,
            "mutateSchema",
            json!({"expectedRevision":snapshot["revision"],
            "planToken":plan["planToken"],"actionsHash":plan["actionsHash"]}),
        )
    }
}

/// Control is independent of the worker queue so an expired iOS task can stop a transfer.
/// # Safety
/// `identity` must be a valid NUL-terminated UTF-8 string.
#[no_mangle]
pub unsafe extern "C" fn eidos_ios_cancellation(identity: *const c_char, action: i32) -> bool {
    if identity.is_null() {
        return false;
    }
    let Ok(id) = CStr::from_ptr(identity).to_str() else {
        return false;
    };
    match action {
        0 => mobile_host::cancellation::begin(id).is_ok(),
        1 => {
            mobile_host::cancellation::cancel(id);
            true
        }
        2 => {
            mobile_host::cancellation::end(id);
            true
        }
        _ => false,
    }
}

/// Read transfer counters without waiting for the busy native worker.
/// # Safety
/// `identity` must be a valid NUL-terminated UTF-8 string. Free the result with
/// `eidos_ios_free`.
#[no_mangle]
pub unsafe extern "C" fn eidos_ios_transfer_progress(identity: *const c_char) -> *mut c_char {
    let value = if identity.is_null() {
        Value::Null
    } else {
        CStr::from_ptr(identity)
            .to_str()
            .ok()
            .and_then(mobile_host::cancellation::progress)
            .unwrap_or(Value::Null)
    };
    CString::new(value.to_string()).unwrap().into_raw()
}
fn dispatch(path: PathBuf, method: String, request: Value) -> Result<Value> {
    type Message = (PathBuf, String, Value, mpsc::SyncSender<Result<Value>>);
    static WORKER: OnceLock<mpsc::Sender<Message>> = OnceLock::new();
    let worker = WORKER.get_or_init(|| {
        let (sender, receiver) = mpsc::channel::<Message>();
        std::thread::spawn(move || {
            let mut host = Host::default();
            for (path, method, request, reply) in receiver {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    host.execute(path, &method, request)
                }))
                .unwrap_or_else(|_| {
                    host.session = None;
                    Err(anyhow!("Native Runtime failed"))
                });
                let _ = reply.send(result);
            }
        });
        sender
    });
    let (reply, receiver) = mpsc::sync_channel(1);
    worker.send((path, method, request, reply))?;
    receiver.recv()?
}
/// # Safety
/// Arguments must be valid, NUL-terminated UTF-8 strings for the duration of this call.
/// Release the returned owned string exactly once with `eidos_ios_free`.
#[no_mangle]
pub unsafe extern "C" fn eidos_ios_execute(
    path: *const c_char,
    method: *const c_char,
    request: *const c_char,
) -> *mut c_char {
    let result = std::panic::catch_unwind(|| -> Result<Value> {
        ensure!(
            !path.is_null() && !method.is_null() && !request.is_null(),
            "Missing argument"
        );
        dispatch(
            CStr::from_ptr(path).to_str()?.into(),
            CStr::from_ptr(method).to_str()?.into(),
            serde_json::from_str(CStr::from_ptr(request).to_str()?)?,
        )
    });
    let envelope = match result {
        Ok(Ok(value)) => json!({"ok":true,"value":value}),
        Ok(Err(error)) => json!({"ok":false,"error":error.to_string()}),
        Err(_) => json!({"ok":false,"error":"Native bridge failed"}),
    };
    CString::new(envelope.to_string()).unwrap().into_raw()
}
/// # Safety
/// `value` must be null or an unfreed pointer returned by `eidos_ios_execute`.
#[no_mangle]
pub unsafe extern "C" fn eidos_ios_free(value: *mut c_char) {
    if !value.is_null() {
        drop(CString::from_raw(value));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn attachment_entries_use_canonical_allocator() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let path = dir.path().join("attachments.eidos");
        let mut host = Host::default();
        host.execute(path.clone(), "create", json!({"title":"Attachments"}))?;
        let entry = host.execute(
            path.clone(),
            "allocateFileEntry",
            json!({"name":"photo.png","size":"3","mediaType":"image/png","uri":"assets/photo.png"}),
        )?;
        assert!(entry["id"].is_string());
        assert_eq!(entry["uri"], "assets/photo.png");
        assert!(host
            .execute(
                path,
                "allocateFileEntry",
                json!({"name":"bad","size":"-1","mediaType":"image/png","uri":"assets/bad.png"})
            )
            .is_err());
        Ok(())
    }
    #[test]
    fn persistent_plans_rows_and_stale_revisions() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let path = dir.path().join("local.eidos");
        let mut host = Host::default();
        host.execute(path.clone(), "create", json!({"title":"Offline"}))?;
        let snapshot = host.execute(path.clone(), "getSnapshot", json!({}))?;
        let page = host.execute(
            path.clone(),
            "getSchemaPage",
            json!({"revision":snapshot["revision"],"limit":200}),
        )?;
        let table = page["objects"]
            .as_array()
            .unwrap()
            .iter()
            .find(|o| o["object"] == "table")
            .unwrap();
        let label = table["labelFieldId"].as_str().unwrap();
        let request = json!({"tableId":table["id"],"expectedRevision":snapshot["revision"],
            "changes":[{"kind":"create","clientKey":"one","values":{label:"iOS 离线"}}]});
        host.execute(path.clone(), "mutateRows", request.clone())?;
        assert!(host.execute(path.clone(), "mutateRows", request).is_err());
        host.execute(path.clone(), "close", Value::Null)?;
        let rows = host.execute(
            path.clone(),
            "queryRows",
            json!({"tableId":table["id"],"query":{},
            "projection":{"fields":[label],"resolveRelations":[]},"limit":50}),
        )?;
        assert_eq!(rows["rows"][0]["values"][0], "iOS 离线");
        assert!(host.execute(path.clone(), "create", json!({})).is_err());
        assert!(host.execute(path, "executeSql", json!({})).is_err());
        Ok(())
    }
}
