//! Graft orchestration; Eidos merge decisions belong to the canonical Runtime.
use anyhow::{anyhow, ensure, Result};
use graft_sdk::{
    AcceptSemanticMergeResultOptions, ApplyMergeOptions, ListMergePathsOptions, MergePathFilter,
    MergeSqliteVersion, MergeStatus, PlanMergeOptions, PrepareSemanticMergeOptions,
    RecordSemanticMergeConflictsOptions, RepositorySession,
};
use serde_json::{json, Value};
use std::path::Path;

pub fn begin(session: &RepositorySession) -> Result<Value> {
    ensure!(
        matches!(session.get_merge_status()?, MergeStatus::None),
        "A merge is already active"
    );
    let status = session.status()?;
    ensure!(
        status["current_branch"] == "main"
            && status["dirty"] != true
            && status["has_conflicts"] != true
            && status["staged_changes"]
                .as_array()
                .is_none_or(Vec::is_empty),
        "Save local changes before merging"
    );
    let head = status["current_head"].as_str().map(str::to_owned);
    let plan = session.plan_merge(&PlanMergeOptions {
        revision: "origin/main".into(),
        expected_head: head.clone(),
    })?;
    Ok(serde_json::to_value(session.apply_merge(
        &ApplyMergeOptions {
            revision: "origin/main".into(),
            expected_head: head,
            plan_token: plan.plan_token,
        },
    )?)?)
}

pub fn metadata(session: &RepositorySession, expected: &str) -> Result<Value> {
    let mut state = session.get_merge_status()?;
    ensure!(
        token(&state)? == expected,
        "Merge state changed; refresh before continuing"
    );
    let mut after = None;
    let mut paths = Vec::new();
    loop {
        let page = session.list_merge_paths(&ListMergePathsOptions {
            filter: MergePathFilter::Unmerged,
            limit: 100,
            after,
            expected_state_token: expected.into(),
        })?;
        paths.extend(
            page.items
                .into_iter()
                .filter(|item| item.path.to_lowercase().ends_with(".eidos")),
        );
        after = page.next_cursor;
        if after.is_none() {
            break;
        }
    }
    let managed_tables = crate::system_merge::managed_tables()?;
    let mut reports = Vec::new();
    for path in paths {
        let current = token(&state)?.to_owned();
        let workspace = session.prepare_semantic_merge(&PrepareSemanticMergeOptions {
            path: path.path.clone().into(),
            provider: "eidos.system-merge-1.0".into(),
            managed_tables: managed_tables.clone(),
            expected_state_token: current.clone(),
        })?;
        let input = |side| -> Result<&Path> {
            workspace
                .inputs
                .iter()
                .find(|input| input.version == side)
                .and_then(|input| input.file_path.as_deref())
                .map(Path::new)
                .ok_or_else(|| anyhow!("Semantic merge requires three existing SQLite snapshots"))
        };
        let outcome = crate::system_merge::merge(
            input(MergeSqliteVersion::Base)?,
            input(MergeSqliteVersion::Ours)?,
            input(MergeSqliteVersion::Theirs)?,
            Path::new(&workspace.result_path),
            &workspace.orig_head,
            &workspace.merge_head,
            workspace.prepared_at_unix_ms,
        )?;
        let resolutions = outcome["automaticResolutions"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        match outcome["outcome"].as_str() {
            Some("merged") => {
                state = session
                    .accept_semantic_merge_result(&AcceptSemanticMergeResultOptions {
                        provider_token: workspace.provider_token,
                        validation: outcome["validation"].clone(),
                        automatic_resolutions: resolutions,
                        expected_state_token: current,
                    })?
                    .merge;
            }
            Some("conflict") => {
                session.record_semantic_merge_conflicts(&RecordSemanticMergeConflictsOptions {
                    provider_token: workspace.provider_token,
                    conflicts: outcome["conflicts"]
                        .as_array()
                        .cloned()
                        .ok_or_else(|| anyhow!("Missing canonical conflicts"))?,
                    automatic_resolutions: resolutions,
                    expected_state_token: current,
                })?;
                state = session.get_merge_status()?;
            }
            _ => {}
        }
        reports.push(json!({"path": path.path, "result": outcome}));
    }
    Ok(json!({"merge": state, "files": reports}))
}

fn token(state: &MergeStatus) -> Result<&str> {
    match state {
        MergeStatus::Merging { state_token, .. } => Ok(state_token),
        MergeStatus::None => Err(anyhow!("No active merge")),
    }
}

pub fn finish(session: &RepositorySession, root: &Path, expected: &str) -> Result<Value> {
    let state = session.get_merge_status()?;
    ensure!(
        token(&state)? == expected,
        "Merge state changed; refresh before continuing"
    );
    ensure!(
        matches!(
            state,
            MergeStatus::Merging {
                unmerged_count: 0,
                ..
            }
        ),
        "Resolve all conflicts before continuing"
    );
    let root = root.canonicalize()?;
    let mut after = None;
    loop {
        let page = session.list_merge_paths(&ListMergePathsOptions {
            filter: MergePathFilter::All,
            limit: 100,
            after,
            expected_state_token: expected.into(),
        })?;
        for entry in page.items {
            if !entry.path.to_lowercase().ends_with(".eidos") {
                continue;
            }
            let path = root.join(&entry.path);
            if !path.try_exists()? {
                continue;
            }
            let path = path.canonicalize()?;
            ensure!(path.starts_with(&root), "Merge candidate escapes the Space");
            let validation = crate::execute(
                &path,
                "validate",
                json!({"level": "full", "diagnosticsLimit": 100}),
            )?;
            ensure!(
                validation["valid"] == true,
                "Merged Eidos file failed Runtime validation: {}",
                entry.path
            );
        }
        after = page.next_cursor;
        if after.is_none() {
            break;
        }
    }
    Ok(serde_json::to_value(session.continue_merge(
        &graft_sdk::ContinueMergeOptions {
            message: "Merge local and remote changes".into(),
            expected_state_token: expected.into(),
        },
    )?)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{execute, graft::GraftHost};

    #[test]
    fn graft_semantic_merge_retains_conflicts_and_abort_restores_ours() -> Result<()> {
        exercise(true)
    }

    #[test]
    fn graft_semantic_merge_accepts_disjoint_metadata_changes() -> Result<()> {
        exercise(false)
    }

    fn exercise(conflict: bool) -> Result<()> {
        let temp = tempfile::tempdir()?;
        let desktop = temp.path().join("desktop");
        let phone = temp.path().join("phone");
        let remote = temp.path().join("remote");
        for path in [&desktop, &phone, &remote] {
            std::fs::create_dir(path)?;
        }
        let database = desktop.join("data.eidos");
        execute(&database, "create", json!({"title": "Semantic merge"}))?;
        if conflict {
            rusqlite::Connection::open(&database)?.execute_batch("INSERT INTO eidos__features(name,version,required,config_json) VALUES('example','1',0,'{}')")?;
        }
        let mut source = GraftHost::default();
        let mut mobile = GraftHost::default();
        source.execute(&desktop, "checkpoint", json!({}))?;
        let url = format!("fs://{}", remote.display());
        source.execute(&desktop, "configureRemote", json!({"url": url}))?;
        source.execute(&desktop, "push", json!({}))?;
        mobile.execute(&phone, "clone", json!({"url": url}))?;
        for (path, ours) in [(&phone, true), (&desktop, false)] {
            let db = rusqlite::Connection::open(path.join("data.eidos"))?;
            if conflict {
                db.execute(
                    "UPDATE eidos__features SET version=? WHERE name='example'",
                    [if ours { "2" } else { "3" }],
                )?;
            } else if ours {
                db.execute_batch("UPDATE eidos__tables SET settings_json='{\"accent\":\"blue\"}', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')")?;
            } else {
                db.execute_batch("UPDATE eidos__tables SET position=7, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')")?;
            }
            db.execute_batch("UPDATE eidos__meta SET revision=revision+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')")?;
        }
        mobile.execute(&phone, "checkpoint", json!({}))?;
        source.execute(&desktop, "checkpoint", json!({}))?;
        source.execute(&desktop, "push", json!({}))?;
        mobile.execute(&phone, "fetch", json!({}))?;
        let initial = mobile.execute(&phone, "beginMerge", json!({}))?;
        assert_eq!(initial["merge"]["state"], "merging", "{initial}");
        let before = mobile.execute(&phone, "mergeStatus", json!({}))?;
        assert!(mobile
            .execute(&phone, "mergeMetadata", json!({"stateToken": "stale"}))
            .is_err());
        let processed = mobile.execute(
            &phone,
            "mergeMetadata",
            json!({"stateToken": before["state_token"]}),
        )?;
        assert_eq!(
            processed["files"][0]["result"]["outcome"],
            if conflict { "conflict" } else { "merged" },
            "{processed}"
        );
        assert_eq!(
            processed["merge"]["unmerged_count"],
            if conflict { 1 } else { 0 }
        );
        mobile.execute(&phone, "close", json!({}))?;
        let restored = mobile.execute(&phone, "mergeStatus", json!({}))?;
        assert_eq!(restored, processed["merge"]);
        assert!(mobile.execute(&phone, "checkpoint", json!({})).is_err());
        if conflict {
            assert!(mobile
                .execute(
                    &phone,
                    "continueMerge",
                    json!({"stateToken": restored["state_token"]})
                )
                .is_err());
            mobile.execute(
                &phone,
                "abortMerge",
                json!({"stateToken": restored["state_token"]}),
            )?;
        } else {
            mobile.execute(
                &phone,
                "continueMerge",
                json!({"stateToken": restored["state_token"]}),
            )?;
            mobile.execute(&phone, "push", json!({}))?;
            source.execute(&desktop, "fetch", json!({}))?;
            source.execute(&desktop, "fastForward", json!({}))?;
        }
        assert_eq!(
            mobile.execute(&phone, "mergeStatus", json!({}))?["state"],
            "none"
        );
        let db = rusqlite::Connection::open(phone.join("data.eidos"))?;
        if conflict {
            assert_eq!(
                db.query_row(
                    "SELECT version FROM eidos__features WHERE name='example'",
                    [],
                    |row| row.get::<_, String>(0)
                )?,
                "2"
            );
        } else {
            assert_eq!(
                db.query_row("SELECT position FROM eidos__tables", [], |row| row
                    .get::<_, i64>(0))?,
                7
            );
            let remote_db = rusqlite::Connection::open(desktop.join("data.eidos"))?;
            assert_eq!(
                remote_db.query_row("SELECT settings_json FROM eidos__tables", [], |row| row
                    .get::<_, String>(
                    0
                ))?,
                "{\"accent\":\"blue\"}"
            );
        }
        Ok(())
    }
}
