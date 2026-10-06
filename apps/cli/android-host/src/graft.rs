//! Serialized, retained Graft session for the Android filesystem host.
//! The caller must also serialize worktree mutations with Runtime/file writes.
use std::path::{Path, PathBuf};

use anyhow::{anyhow, ensure, Result};
use graft_sdk::{
    ApplyMergeOptions, MergePlanKind, PlanMergeOptions, RemoteConfigureOptions, RepositorySession,
    RepositorySessionIdentity, RestoreOptions,
};
use serde_json::{json, Value};

pub struct GraftHost {
    session: Option<(PathBuf, RepositorySession)>,
    identity: RepositorySessionIdentity,
}

impl Default for GraftHost {
    fn default() -> Self {
        Self::with_identity("Eidos Android", "android@eidos.local")
    }
}

impl GraftHost {
    pub fn with_identity(name: &str, email: &str) -> Self {
        Self {
            session: None,
            identity: RepositorySessionIdentity {
                name: name.into(),
                email: email.into(),
            },
        }
    }

    pub fn execute(&mut self, root: &Path, method: &str, request: Value) -> Result<Value> {
        ensure!(root.is_dir(), "Space directory does not exist");
        let root = root.canonicalize()?;
        if method == "close" {
            if self.session.as_ref().is_some_and(|(path, _)| path == &root) {
                if let Some((_, session)) = self.session.take() {
                    session.close()?;
                }
            }
            return Ok(json!({}));
        }
        if method == "status" && !root.join(".graft").exists() {
            return Ok(json!({"initialized": false}));
        }
        if self.session.as_ref().is_none_or(|(path, _)| path != &root) {
            if let Some((_, previous)) = self.session.take() {
                previous.close()?;
            }
            let session = RepositorySession::new_with_identity(
                &root,
                Some(RepositorySessionIdentity {
                    name: self.identity.name.clone(),
                    email: self.identity.email.clone(),
                }),
            );
            session.open()?;
            self.session = Some((root.clone(), session));
        }
        let session = &self
            .session
            .as_ref()
            .ok_or_else(|| anyhow!("Session unavailable"))?
            .1;
        match method {
            "chooseMergePath" => {
                let result = match required(&request, "side")? {
                    "ours" => graft_sdk::MergePathResult::Ours,
                    "theirs" => graft_sdk::MergePathResult::Theirs,
                    _ => return Err(anyhow!("Invalid merge side")),
                };
                Ok(serde_json::to_value(session.set_merge_path_result(
                    &graft_sdk::SetMergePathResultOptions {
                        path: required(&request, "path")?.into(),
                        result,
                        expected_state_token: required(&request, "stateToken")?.into(),
                    },
                )?)?)
            }
            "mergeText" => {
                let version = match required(&request, "side")? {
                    "ours" => graft_sdk::MergeVersion::Ours,
                    "theirs" => graft_sdk::MergeVersion::Theirs,
                    _ => return Err(anyhow!("Invalid merge side")),
                };
                Ok(serde_json::to_value(session.read_merge_version(
                    &graft_sdk::ReadMergeVersionOptions {
                        path: required(&request, "path")?.into(),
                        version,
                        max_bytes: 32768,
                        expected_state_token: required(&request, "stateToken")?.into(),
                    },
                )?)?)
            }
            "beginMerge" => crate::merge::begin(session),
            "mergeMetadata" => crate::merge::metadata(session, required(&request, "stateToken")?),
            "mergeStatus" => Ok(serde_json::to_value(session.get_merge_status()?)?),
            "continueMerge" => {
                crate::merge::finish(session, &root, required(&request, "stateToken")?)
            }
            "mergePaths" => Ok(serde_json::to_value(session.list_merge_paths(
                &graft_sdk::ListMergePathsOptions {
                    filter: graft_sdk::MergePathFilter::All,
                    limit: 100,
                    after: request["after"].as_str().map(str::to_owned),
                    expected_state_token: required(&request, "stateToken")?.into(),
                },
            )?)?),
            "abortMerge" => Ok(serde_json::to_value(session.abort_merge(
                &graft_sdk::AbortMergeOptions {
                    expected_state_token: required(&request, "stateToken")?.into(),
                },
            )?)?),
            "status" => Ok(json!({"initialized": true, "status": session.status()?})),
            "remotes" => Ok(serde_json::to_value(session.list_remotes()?)?),
            "configureRemote" | "peerConfigure" => {
                let peer = method == "peerConfigure";
                let url = required(&request, "url")?;
                if !root.join(".graft").exists() {
                    session.init()?;
                }
                Ok(session.configure_remote(&RemoteConfigureOptions {
                    name: if peer { "eidos-peer" } else { "origin" }.into(),
                    url: url.into(),
                    bearer_token: request["token"].as_str().map(str::to_owned),
                    overwrite: peer,
                    upstream_branch: if peer { None } else { Some("main".into()) },
                })?)
            }
            "clearCredentials" => {
                session.clear_http_bearer_token("origin")?;
                Ok(json!({}))
            }
            "clone" => {
                // A clone must never replace the user's existing Space. The
                // Android repository creates a separate empty destination.
                ensure!(
                    root.read_dir()?.next().is_none(),
                    "Clone destination must be empty"
                );
                Ok(session.clone_repository(
                    required(&request, "url")?,
                    Some("main"),
                    request["token"].as_str().map(str::to_owned),
                )?)
            }
            "fetch" => Ok(session.fetch(Some("origin"), Some("main"))?),
            "peerFetch" => {
                #[cfg(feature = "planned-transfer-progress")]
                {
                    Ok(session.fetch_for_checkout("eidos-peer", "main")?)
                }
                #[cfg(not(feature = "planned-transfer-progress"))]
                {
                    Ok(session.fetch(Some("eidos-peer"), Some("main"))?)
                }
            }
            "peerPublish" => {
                ensure!(
                    session.status()?["current_branch"] == "main",
                    "Sync requires the main branch"
                );
                ensure!(
                    matches!(session.get_merge_status()?, graft_sdk::MergeStatus::None),
                    "Complete or abort the active merge before device sync"
                );
                session.configure_remote(&RemoteConfigureOptions {
                    name: "eidos-incoming".into(),
                    url: required(&request, "url")?.into(),
                    bearer_token: request["token"].as_str().map(str::to_owned),
                    overwrite: true,
                    upstream_branch: None,
                })?;
                Ok(session.push(Some("eidos-incoming"), Some("main"))?)
            }
            "push" | "peerPush" => {
                ensure!(
                    session.status()?["current_branch"] == "main",
                    "Sync requires the main branch"
                );
                Ok(session.push(
                    Some(if method == "peerPush" {
                        "eidos-peer"
                    } else {
                        "origin"
                    }),
                    Some("main"),
                )?)
            }
            "fastForward" | "peerFastForward" => {
                let started = std::time::Instant::now();
                let revision = if method == "peerFastForward" {
                    "eidos-peer/main"
                } else {
                    "origin/main"
                };
                let status = session.status()?;
                ensure!(
                    status["current_branch"] == "main",
                    "Sync requires the main branch"
                );
                ensure!(
                    status["dirty"] != true
                        && status["has_conflicts"] != true
                        && status["staged_changes"]
                            .as_array()
                            .is_none_or(Vec::is_empty),
                    "Save local changes and resolve conflicts before updating files"
                );
                let head = status["current_head"].as_str().map(str::to_owned);
                let checked_ms = started.elapsed().as_millis();
                let plan = session.plan_merge(&PlanMergeOptions {
                    revision: revision.into(),
                    expected_head: head.clone(),
                })?;
                let planned_ms = started.elapsed().as_millis();
                if plan.kind == MergePlanKind::ThreeWay {
                    // Divergence needs Eidos's semantic merge provider and a
                    // conflict workflow; never silently pick a whole file.
                    return Ok(json!({"outcome": "needs_merge", "plan": plan}));
                }
                let result = session.apply_merge(&ApplyMergeOptions {
                    revision: revision.into(),
                    expected_head: head,
                    plan_token: plan.plan_token,
                })?;
                Ok(json!({"outcome": "updated", "merge": result, "timing_ms": {
                    "check": checked_ms,
                    "plan": planned_ms - checked_ms,
                    "apply": started.elapsed().as_millis() - planned_ms
                }}))
            }
            "checkpoint" => {
                let started = std::time::Instant::now();
                if !root.join(".graft").exists() {
                    session.init()?;
                }
                ensure!(
                    matches!(session.get_merge_status()?, graft_sdk::MergeStatus::None),
                    "Complete or abort the active merge before saving a version"
                );
                ensure!(
                    session.status()?["has_conflicts"] != true,
                    "Resolve existing Graft conflicts before saving a version"
                );
                let checked_ms = started.elapsed().as_millis();
                session.add_all()?;
                let staged_ms = started.elapsed().as_millis();
                let status = session.status()?;
                let inspected_ms = started.elapsed().as_millis();
                if status["staged_changes"]
                    .as_array()
                    .is_some_and(|changes| !changes.is_empty())
                {
                    session.commit(&format!("Save {} changes", self.identity.name))?;
                }
                let committed_ms = started.elapsed().as_millis();
                let status = session.status()?;
                Ok(json!({"initialized": true, "status": status, "timing_ms": {
                    "check": checked_ms,
                    "stage": staged_ms - checked_ms,
                    "inspect": inspected_ms - staged_ms,
                    "commit": committed_ms - inspected_ms,
                    "refresh": started.elapsed().as_millis() - committed_ms
                }}))
            }
            "history" => Ok(session.history(50, request["after"].as_str())?),
            "restore" => {
                let path = request["path"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing path"))?;
                let source = request["source"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing source"))?;
                let head = request["expectedHead"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing expected HEAD"))?;
                Ok(session.restore(&RestoreOptions {
                    source: Some(source.into()),
                    expected_head: Some(head.into()),
                    require_clean: true,
                    path: path.into(),
                })?)
            }
            _ => Err(anyhow!("Unsupported Android Graft operation: {method}")),
        }
    }
}

fn required<'a>(request: &'a Value, key: &str) -> Result<&'a str> {
    request[key]
        .as_str()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| anyhow!("Missing {key}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Run explicitly when profiling a small edit in a Space with large databases.
    #[test]
    #[ignore]
    fn checkpoint_large_unchanged_database() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let root = dir.path();
        let db = rusqlite::Connection::open(root.join("large.eidos"))?;
        db.execute_batch(
            "CREATE TABLE payload (id INTEGER PRIMARY KEY, body BLOB);
            WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<64)
            INSERT INTO payload SELECT x, randomblob(1048576) FROM n;",
        )?;
        drop(db);
        std::fs::write(root.join("note.md"), "initial\n")?;
        let mut host = GraftHost::default();
        host.execute(root, "checkpoint", json!({}))?;
        for iteration in 0..3 {
            std::fs::write(root.join("note.md"), format!("initial\nline {iteration}\n"))?;
            let started = std::time::Instant::now();
            let saved = host.execute(root, "checkpoint", json!({}))?;
            eprintln!(
                "64 MiB unchanged SQLite, one-line edit: {:?}",
                started.elapsed()
            );
            assert_eq!(saved["status"]["dirty"], false);
        }
        assert_eq!(
            host.execute(root, "history", json!({}))?["commits"]
                .as_array()
                .unwrap()
                .len(),
            4
        );
        Ok(())
    }

    #[test]
    fn checkpoints_capture_markdown_attachments_and_eidos_without_changing_files() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let root = dir.path();
        let mut host = GraftHost::default();
        assert_eq!(
            host.execute(root, "status", json!({}))?["initialized"],
            false
        );
        assert!(!root.join(".graft").exists());
        std::fs::write(root.join("note.md"), "# Offline\n")?;
        std::fs::write(root.join("photo.bin"), [0, 255, 12, 8])?;
        super::super::execute(
            &root.join("data.eidos"),
            "create",
            json!({"title": "Local"}),
        )?;
        let saved = host.execute(root, "checkpoint", json!({}))?;
        assert_eq!(saved["status"]["dirty"], false);
        assert_eq!(
            std::fs::read_to_string(root.join("note.md"))?,
            "# Offline\n"
        );
        let history = host.execute(root, "history", json!({}))?;
        assert_eq!(history["commits"].as_array().unwrap().len(), 1, "{history}");
        let original = history["commits"][0]["id"].as_str().unwrap();
        assert!(history["commits"][0]["files"]["data.eidos"].is_object());
        assert!(history["commits"][0]["artifacts"]["photo.bin"].is_object());
        std::fs::write(root.join("note.md"), "# Changed\n")?;
        assert!(host
            .execute(
                root,
                "restore",
                json!({"path": "note.md", "source": original, "expectedHead": original})
            )
            .is_err());
        assert_eq!(
            std::fs::read_to_string(root.join("note.md"))?,
            "# Changed\n"
        );
        assert_eq!(
            host.execute(root, "status", json!({}))?["status"]["dirty"],
            true
        );
        assert_eq!(
            host.execute(root, "checkpoint", json!({}))?["status"]["dirty"],
            false
        );
        assert_eq!(
            host.execute(root, "history", json!({}))?["commits"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        let latest = host.execute(root, "history", json!({}))?;
        let head = latest["current_head"].as_str().unwrap();
        assert!(host
            .execute(
                root,
                "restore",
                json!({"path": "note.md", "source": original, "expectedHead": original})
            )
            .is_err());
        host.execute(
            root,
            "restore",
            json!({"path": "note.md", "source": original, "expectedHead": head}),
        )?;
        assert_eq!(
            std::fs::read_to_string(root.join("note.md"))?,
            "# Offline\n"
        );
        host.execute(root, "checkpoint", json!({}))?;
        host.execute(root, "checkpoint", json!({}))?;
        assert_eq!(
            host.execute(root, "history", json!({}))?["commits"]
                .as_array()
                .unwrap()
                .len(),
            3
        );
        drop(host);
        assert_eq!(
            GraftHost::default().execute(root, "status", json!({}))?["status"]["dirty"],
            false
        );
        Ok(())
    }
}

#[cfg(test)]
#[path = "graft_remote_tests.rs"]
mod remote_tests;
