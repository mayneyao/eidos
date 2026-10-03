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
mod history;

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
#[derive(Default)]
struct Host {
    session: Option<(PathBuf, Session)>,
}
impl Host {
    fn execute(&mut self, path: PathBuf, method: &str, request: Value) -> Result<Value> {
        if let Some(operation) = method.strip_prefix("graft:") {
            self.session = None;
            return history::execute(&path, operation, request);
        }
        if method == "close" {
            self.session = None;
            return Ok(Value::Null);
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
