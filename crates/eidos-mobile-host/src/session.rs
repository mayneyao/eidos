//! QuickJS and SQLite stay on one worker thread. Cursor authentication belongs
//! to the Runtime instance that issued the cursor, not to a JNI invocation.
use anyhow::{ensure, Result};
use eidos_runtime_host::{clear_active_context, open_host_state, QjsHost};
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

    /// Keep Runtime plans and cursors alive across native transport calls.
    pub fn execute_persistent(
        &mut self,
        path: &Path,
        method: &str,
        request: Value,
    ) -> Result<Value> {
        ensure!(
            matches!(
                method,
                "create"
                    | "negotiate"
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
            "Unsupported embedded Runtime operation"
        );
        let path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        if method == "create" {
            self.close();
            let result = super::execute(&path, method, request)?;
            self.query = Some((path.clone(), QuerySession::open(&path)?));
            return Ok(result);
        }
        if self
            .query
            .as_ref()
            .is_none_or(|(source, _)| source != &path)
        {
            self.close();
            let session = QuerySession::open(&path)?;
            self.query = Some((path, session));
        }
        let host = &self.query.as_ref().unwrap().1 .0;
        if method == "allocateFileEntry" {
            return super::unwrap(&host.invoke("allocateFileEntry", &[request.to_string()])?);
        }
        super::call(host, method, request)
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
            return self.execute_persistent(&path, method, request);
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
    fn repeated_schema_assignment_does_not_create_a_sync_checkpoint() -> Result<()> {
        exercise_windows_cloud_peer_sync(true)
    }

    #[test]
    fn windows_cloud_peer_sync_without_android_writes_stays_fast_forward() -> Result<()> {
        exercise_windows_cloud_peer_sync(false)
    }

    fn exercise_windows_cloud_peer_sync(repeat_assignments: bool) -> Result<()> {
        let directory = tempfile::tempdir()?;
        let path = directory.path().join("tasks.eidos");
        super::super::execute(&path, "create", json!({"title":"Tasks"}))?;
        let mut graft = crate::graft::GraftHost::default();
        graft.execute(directory.path(), "checkpoint", json!({}))?;
        let before = std::fs::read(&path)?;
        let mut host = SessionHost::default();
        let snapshot = host.execute(&path, "web:getSnapshot", json!({}))?;
        for _ in 0..if repeat_assignments { 2 } else { 0 } {
            let plan = host.execute(
                &path,
                "web:preflightSchema",
                json!({
                    "expectedRevision": snapshot["revision"],
                    "change": {"kind":"set-file-title", "title":"Tasks"}
                }),
            )?;
            let result = host.execute(
                &path,
                "web:mutateSchema",
                json!({
                    "expectedRevision": snapshot["revision"],
                    "planToken": plan["planToken"], "actionsHash": plan["actionsHash"]
                }),
            )?;
            assert_eq!(result["changed"], false, "{result}");
            assert_eq!(result["revision"], snapshot["revision"]);
        }
        host.close();
        assert_eq!(std::fs::read(&path)?, before);
        let saved = graft.execute(directory.path(), "checkpoint", json!({}))?;
        assert_eq!(saved["status"]["dirty"], false);
        let history = graft.execute(directory.path(), "history", json!({}))?;
        assert_eq!(history["commits"].as_array().unwrap().len(), 1);

        // Windows -> cloud -> macOS -> LAN -> Android. Storage is isolated;
        // exercise peer operations without depending on a physical device.
        let remotes = tempfile::tempdir()?;
        let cloud = remotes.path().join("cloud");
        let peer = remotes.path().join("peer");
        let mac = remotes.path().join("mac");
        let android = remotes.path().join("android");
        for root in [&cloud, &peer, &mac, &android] {
            std::fs::create_dir(root)?;
        }
        let cloud_url = format!("fs://{}", cloud.display());
        let peer_url = format!("fs://{}", peer.display());
        graft.execute(
            directory.path(),
            "configureRemote",
            json!({"url":cloud_url}),
        )?;
        graft.execute(directory.path(), "push", json!({}))?;
        let mut mac_host = crate::graft::GraftHost::default();
        let mut android_host = crate::graft::GraftHost::default();
        mac_host.execute(&mac, "clone", json!({"url":cloud_url}))?;
        android_host.execute(&android, "clone", json!({"url":cloud_url}))?;
        if repeat_assignments {
            let phone_path = android.join("tasks.eidos");
            let snapshot = host.execute(&phone_path, "web:getSnapshot", json!({}))?;
            let plan = host.execute(
                &phone_path,
                "web:preflightSchema",
                json!({
                    "expectedRevision":snapshot["revision"],
                    "change":{"kind":"set-file-title", "title":"Tasks"}
                }),
            )?;
            host.execute(
                &phone_path,
                "web:mutateSchema",
                json!({
                    "expectedRevision":snapshot["revision"],
                    "planToken":plan["planToken"], "actionsHash":plan["actionsHash"]
                }),
            )?;
            host.close();
        }
        let schema = super::super::execute(&path, "schema", json!({}))?;
        let table = schema["objects"]
            .as_array()
            .unwrap()
            .iter()
            .find(|object| object["object"] == "table")
            .unwrap();
        super::super::execute(
            &path,
            "mutateRows",
            json!({
                "tableId":table["id"], "expectedRevision":schema["snapshot"]["revision"],
                "changes":[{"kind":"create", "clientKey":"windows-record",
                    "values":{table["labelFieldId"].as_str().unwrap():"Windows record"}}]
            }),
        )?;
        let windows = graft.execute(directory.path(), "checkpoint", json!({}))?;
        graft.execute(directory.path(), "push", json!({}))?;
        mac_host.execute(&mac, "fetch", json!({}))?;
        assert_eq!(
            mac_host.execute(&mac, "fastForward", json!({}))?["outcome"],
            "updated"
        );
        mac_host.execute(&mac, "peerConfigure", json!({"url":peer_url}))?;
        mac_host.execute(&mac, "peerPush", json!({}))?;
        let phone_before = android_host.execute(&android, "status", json!({}))?;
        let phone_saved = android_host.execute(&android, "checkpoint", json!({}))?;
        assert_eq!(
            phone_saved["status"]["current_head"],
            phone_before["status"]["current_head"]
        );
        android_host.execute(&android, "peerConfigure", json!({"url":peer_url}))?;
        android_host.execute(&android, "peerFetch", json!({}))?;
        assert_eq!(
            android_host.execute(&android, "peerFastForward", json!({}))?["outcome"],
            "updated"
        );
        let phone_saved = android_host.execute(&android, "checkpoint", json!({}))?;
        assert_eq!(
            phone_saved["status"]["current_head"],
            windows["status"]["current_head"]
        );
        let phone_bytes = std::fs::read(android.join("tasks.eidos"))?;
        let repeated = android_host.execute(&android, "peerFastForward", json!({}))?;
        assert_eq!(repeated["outcome"], "unchanged");
        assert_eq!(repeated["timing_ms"]["apply"], 0);
        assert_eq!(std::fs::read(android.join("tasks.eidos"))?, phone_bytes);
        let rows = super::super::execute(
            &android.join("tasks.eidos"),
            "queryRows",
            json!({
                "tableId":table["id"], "query":{}, "limit":50,
                "projection":{"fields":[table["labelFieldId"]],"resolveRelations":[]}
            }),
        )?;
        assert_eq!(rows["rows"][0]["values"][0], "Windows record");
        Ok(())
    }

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
