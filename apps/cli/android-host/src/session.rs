//! QuickJS and SQLite stay on one worker thread. Cursor authentication belongs
//! to the Runtime instance that issued the cursor, not to a JNI invocation.
use anyhow::{ensure, Result};
use qjs_host::{clear_active_context, open_host_state, QjsHost};
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    rc::Rc,
};

struct QuerySession(QjsHost);
impl QuerySession {
    fn open(path: &Path) -> Result<Self> {
        ensure!(path.is_file(), "File does not exist");
        let state = Rc::new(open_host_state(path)?);
        let session = Self(QjsHost::new(&state)?);
        super::unwrap(&session.0.invoke(
            "open",
            &[json!({"mode":"open", "access":"readwrite"}).to_string()],
        )?)?;
        Ok(session)
    }
}
impl Drop for QuerySession {
    fn drop(&mut self) {
        let _ = self.0.invoke("close", &[]);
        clear_active_context();
    }
}

#[derive(Default)]
pub struct SessionHost {
    query: Option<(PathBuf, QuerySession)>,
}
impl SessionHost {
    pub fn close(&mut self) {
        self.query = None;
    }

    pub fn execute(&mut self, path: &Path, method: &str, request: Value) -> Result<Value> {
        let path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        if let Some(method) = method.strip_prefix("web:") {
            ensure!(
                matches!(
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
                "Unsupported embedded Runtime operation"
            );
            if self
                .query
                .as_ref()
                .is_none_or(|(source, _)| source != &path)
            {
                self.close();
                self.query = Some((path.clone(), QuerySession::open(&path)?));
            }
            return super::call(&self.query.as_ref().unwrap().1 .0, method, request);
        }
        if method != "queryRows" {
            // Schema discovery between pages must not invalidate their cursor.
            if !matches!(
                method,
                "schema" | "searchSchema" | "searchRows" | "allocateFileEntry"
            ) {
                self.close();
            }
            return super::execute(&path, method, request);
        }
        if request.get("cursor").is_none_or(Value::is_null) {
            self.close();
            self.query = Some((path.clone(), QuerySession::open(&path)?));
        }
        let Some((source, session)) = &self.query else {
            anyhow::bail!("查询会话已结束，请重新加载记录");
        };
        ensure!(source == &path, "查询会话已切换，请重新加载记录");
        super::call(&session.0, method, request)
    }
}

#[cfg(target_os = "android")]
pub fn dispatch(path: PathBuf, method: String, request: Value) -> Result<Value> {
    use std::sync::{mpsc, OnceLock};
    type Message = (PathBuf, String, Value, mpsc::SyncSender<Result<Value>>);
    static WORKER: OnceLock<mpsc::Sender<Message>> = OnceLock::new();
    let worker = WORKER.get_or_init(|| {
        let (sender, receiver) = mpsc::channel::<Message>();
        std::thread::spawn(move || {
            let mut host = SessionHost::default();
            for (path, method, request, reply) in receiver {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    if method == "close" {
                        host.close();
                        Ok(Value::Null)
                    } else {
                        host.execute(&path, &method, request)
                    }
                }))
                .unwrap_or_else(|_| {
                    host.close();
                    Err(anyhow::anyhow!("Native Runtime failed"))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_session_keeps_schema_plans_and_rejects_host_operations() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let path = directory.path().join("web.eidos");
        super::super::execute(&path, "create", json!({"title":"Web"}))?;
        let mut host = SessionHost::default();
        let snapshot = host.execute(&path, "web:getSnapshot", json!({}))?;
        let page = host.execute(
            &path,
            "web:getSchemaPage",
            json!({"revision":snapshot["revision"], "limit":200}),
        )?;
        let table = page["objects"]
            .as_array()
            .unwrap()
            .iter()
            .find(|v| v["object"] == "table")
            .unwrap();
        let plan = host.execute(&path, "web:preflightSchema", json!({"expectedRevision":snapshot["revision"], "change":{"kind":"rename-table", "tableId":table["id"], "name":"Shared"}}))?;
        host.execute(&path, "web:getSnapshot", json!({}))?;
        host.execute(&path, "web:mutateSchema", json!({"expectedRevision":snapshot["revision"], "planToken":plan["planToken"], "actionsHash":plan["actionsHash"]}))?;
        assert!(host.execute(&path, "web:create", json!({})).is_err());
        assert!(host.execute(&path, "web:executeSql", json!({})).is_err());
        host.close();
        Ok(())
    }

    #[test]
    fn cursor_survives_schema_reads_but_not_session_close() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let path = directory.path().join("paging.eidos");
        super::super::execute(&path, "create", json!({"title":"Paging"}))?;
        let mut host = SessionHost::default();
        let schema = host.execute(&path, "schema", json!({}))?;
        let table = schema["objects"]
            .as_array()
            .unwrap()
            .iter()
            .find(|object| object["object"] == "table")
            .unwrap();
        let table_id = table["id"].clone();
        let label = table["labelFieldId"].as_str().unwrap();
        host.execute(&path, "mutateRows", json!({"tableId":table_id, "expectedRevision":schema["snapshot"]["revision"], "changes":[
            {"kind":"create", "clientKey":"a", "values":{label:"Alpha"}},
            {"kind":"create", "clientKey":"b", "values":{label:"Beta"}}
        ]}))?;
        let mut request = json!({"tableId":table_id, "limit":1, "query":{"sort":[{"fieldId":label,"direction":"asc"}]},
            "projection":{"fields":[label],"resolveRelations":[]}});
        let first = host.execute(&path, "queryRows", request.clone())?;
        assert_eq!(first["rows"][0]["values"][0], "Alpha");
        let before = std::fs::read(&path)?;
        host.execute(&path, "searchSchema", json!({}))?;
        let searched = host.execute(
            &path,
            "searchRows",
            json!({"tableId":table_id, "limit":1,
            "query":{"search":{"text":"Beta","fields":[label]}},
            "projection":{"fields":[label],"resolveRelations":[]}}),
        )?;
        assert_eq!(searched["rows"][0]["values"][0], "Beta");
        assert_eq!(before, std::fs::read(&path)?);
        host.execute(&path, "schema", json!({}))?;
        host.execute(&path, "allocateFileEntry", json!({"name":"image.png", "mediaType":"image/png", "size":"0", "uri":"assets/image.png"}))?;
        request["cursor"] = first["nextCursor"].clone();
        let second = host.execute(&path, "queryRows", request.clone())?;
        assert_eq!(second["rows"][0]["values"][0], "Beta");
        host.close();
        assert!(host.execute(&path, "queryRows", request).is_err());
        Ok(())
    }
}
