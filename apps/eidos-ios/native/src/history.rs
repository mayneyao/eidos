//! Local versions use the same pinned Graft SDK as Android; no network here.
use anyhow::{bail, ensure, Result};
use graft_sdk::{MergeStatus, RepositorySession, RepositorySessionIdentity};
use serde_json::{json, Value};
use std::path::Path;

pub fn execute(root: &Path, method: &str, request: Value) -> Result<Value> {
    ensure!(root.is_dir(), "Space directory does not exist");
    ensure!(
        matches!(method, "status" | "checkpoint" | "history"),
        "Unsupported history operation"
    );
    if !root.join(".graft").exists() && method != "checkpoint" {
        return Ok(if method == "status" {
            json!({"initialized":false})
        } else {
            json!({"commits":[]})
        });
    }
    let session = RepositorySession::new_with_identity(
        root,
        Some(RepositorySessionIdentity {
            name: "Eidos iOS".into(),
            email: "ios@eidos.local".into(),
        }),
    );
    session.open()?;
    let result = (|| match method {
        "status" => Ok(json!({"initialized":true,"status":session.status()?})),
        "history" => Ok(session.history(50, request["after"].as_str())?),
        "checkpoint" => {
            if !root.join(".graft").exists() {
                session.init()?;
            }
            ensure!(
                matches!(session.get_merge_status()?, MergeStatus::None),
                "Complete the pending merge before saving a version"
            );
            ensure!(
                session.status()?["has_conflicts"] != true,
                "Resolve existing conflicts before saving a version"
            );
            session.add_all()?;
            if session.status()?["staged_changes"]
                .as_array()
                .is_some_and(|v| !v.is_empty())
            {
                session.commit("Save iOS changes")?;
            }
            Ok(json!({"initialized":true,"status":session.status()?}))
        }
        _ => bail!("Unsupported history operation"),
    })();
    let closed = session.close();
    match (result, closed) {
        (Err(error), _) => Err(error),
        (Ok(_), Err(error)) => Err(error.into()),
        (Ok(value), Ok(_)) => Ok(value),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn captures_files_and_reopens_without_network() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let root = dir.path();
        assert_eq!(execute(root, "status", json!({}))?["initialized"], false);
        std::fs::write(root.join("note.md"), "offline")?;
        std::fs::write(root.join("photo.bin"), [0, 255, 12])?;
        let mut host = crate::Host::default();
        host.execute(root.join("data.eidos"), "create", json!({"title":"iOS"}))?;
        host.execute(root.into(), "graft:checkpoint", json!({}))?;
        host.execute(root.into(), "graft:close", json!({}))?;
        let history = execute(root, "history", json!({}))?;
        assert_eq!(history["commits"].as_array().unwrap().len(), 1);
        assert!(history["commits"][0]["files"]["data.eidos"].is_object());
        assert!(history["commits"][0]["artifacts"]["photo.bin"].is_object());
        assert_eq!(
            execute(root, "status", json!({}))?["status"]["dirty"],
            false
        );
        std::fs::write(root.join("note.md"), "changed")?;
        assert_eq!(execute(root, "status", json!({}))?["status"]["dirty"], true);
        execute(root, "checkpoint", json!({}))?;
        assert_eq!(
            execute(root, "history", json!({}))?["commits"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        Ok(())
    }
}
