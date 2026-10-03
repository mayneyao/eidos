//! Adapter for Runtime-owned ER-System-Merge-1.0. Only private Graft snapshots
//! belong here; never pass the user's worktree as the result file.
use std::{path::Path, rc::Rc};

use anyhow::{ensure, Result};
use qjs_host::{open_host_state, open_host_state_read_only, QjsHost};
use serde_json::{json, Value};

pub fn merge(
    base: &Path,
    ours: &Path,
    theirs: &Path,
    result: &Path,
    ours_key: &str,
    theirs_key: &str,
    operation_instant: impl Into<Value>,
) -> Result<Value> {
    let operation_instant = operation_instant.into();
    let paths = [base, ours, theirs, result]
        .map(std::fs::canonicalize)
        .into_iter()
        .collect::<std::io::Result<Vec<_>>>()?;
    for path in &paths {
        ensure!(path.is_file(), "Merge snapshots must be existing files");
    }
    for input in &paths[..3] {
        ensure!(*input != paths[3], "Merge result aliases an input snapshot");
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            let left = input.metadata()?;
            let right = paths[3].metadata()?;
            ensure!(
                left.dev() != right.dev() || left.ino() != right.ino(),
                "Merge result aliases an input snapshot"
            );
        }
    }
    let base = Rc::new(open_host_state_read_only(&paths[0])?);
    let ours = Rc::new(open_host_state_read_only(&paths[1])?);
    let theirs = Rc::new(open_host_state_read_only(&paths[2])?);
    let result = Rc::new(open_host_state(&paths[3])?);
    let host = QjsHost::for_system_merge(&base, &ours, &theirs, &result)?;
    let _guard = super::ActiveContextGuard;
    super::unwrap(
        &host.invoke(
            "mergeSystemMetadata",
            &[json!({
                "oursKey": ours_key,
                "theirsKey": theirs_key,
                "operationInstant": operation_instant,
            })
            .to_string()],
        )?,
    )
}

pub fn managed_tables() -> Result<Vec<String>> {
    let state = Rc::new(open_host_state(Path::new(":memory:"))?);
    let host = QjsHost::new(&state)?;
    let _guard = super::ActiveContextGuard;
    Ok(serde_json::from_value(super::unwrap(
        &host.invoke("systemMergeTables", &[])?,
    )?)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_feature_conflicts_leave_the_private_candidate_untouched() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let paths = ["base", "ours", "theirs", "result"]
            .map(|name| directory.path().join(format!("{name}.eidos")));
        super::super::execute(&paths[0], "create", json!({"title": "Conflict fixture"}))?;
        rusqlite::Connection::open(&paths[0])?.execute_batch("INSERT INTO eidos__features(name,version,required,config_json) VALUES('example','1',0,'{}');")?;
        for (index, path) in paths[1..3].iter().enumerate() {
            std::fs::copy(&paths[0], path)?;
            rusqlite::Connection::open(path)?.execute(
                "UPDATE eidos__features SET version=? WHERE name='example'",
                [(index + 2).to_string()],
            )?;
        }
        std::fs::copy(&paths[1], &paths[3])?;
        let before = std::fs::read(&paths[3])?;
        let outcome = merge(
            &paths[0],
            &paths[1],
            &paths[2],
            &paths[3],
            "ours",
            "theirs",
            "2092-01-01T00:00:00.000Z",
        )?;
        assert_eq!(outcome["outcome"], "conflict", "{outcome}");
        assert_eq!(outcome["conflicts"][0]["code"], "feature-conflict");
        assert_eq!(std::fs::read(&paths[3])?, before);
        Ok(())
    }

    #[test]
    fn canonical_merge_combines_groups_preserves_inputs_and_rejects_aliases() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let paths = ["base", "ours", "theirs", "result"]
            .map(|name| directory.path().join(format!("{name}.eidos")));
        super::super::execute(&paths[0], "create", json!({"title": "Merge fixture"}))?;
        for path in &paths[1..] {
            std::fs::copy(&paths[0], path)?;
        }
        rusqlite::Connection::open(&paths[1])?.execute_batch("UPDATE eidos__tables SET settings_json='{\"accent\":\"blue\"}',updated_at='2090-01-01T00:00:00.000Z'; UPDATE eidos__meta SET revision=revision+1,updated_at='2090-01-01T00:00:00.000Z';")?;
        rusqlite::Connection::open(&paths[2])?.execute_batch("UPDATE eidos__tables SET position=7,updated_at='2091-01-01T00:00:00.000Z'; UPDATE eidos__meta SET revision=revision+1,updated_at='2091-01-01T00:00:00.000Z';")?;
        std::fs::copy(&paths[1], &paths[3])?;
        let before = paths[..3]
            .iter()
            .map(std::fs::read)
            .collect::<std::io::Result<Vec<_>>>()?;
        let outcome = merge(
            &paths[0],
            &paths[1],
            &paths[2],
            &paths[3],
            "ours",
            "theirs",
            "2092-01-01T00:00:00.000Z",
        )?;
        assert_eq!(outcome["outcome"], "merged", "{outcome}");
        let row: (String, i64) = rusqlite::Connection::open(&paths[3])?.query_row(
            "SELECT settings_json,position FROM eidos__tables",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        assert_eq!(row, ("{\"accent\":\"blue\"}".into(), 7));
        for (path, bytes) in paths[..3].iter().zip(before) {
            assert_eq!(std::fs::read(path)?, bytes);
        }
        assert!(merge(
            &paths[0],
            &paths[1],
            &paths[2],
            &paths[1],
            "ours",
            "theirs",
            "2092-01-01T00:00:00.000Z"
        )
        .is_err());
        // A malformed result seed is rejected without modifying it.
        let result_before = std::fs::read(&paths[3])?;
        let rejected = merge(
            &paths[0],
            &paths[1],
            &paths[2],
            &paths[3],
            "ours",
            "theirs",
            "2093-01-01T00:00:00.000Z",
        )?;
        assert_eq!(rejected["outcome"], "invalid-input");
        assert_eq!(std::fs::read(&paths[3])?, result_before);
        Ok(())
    }
}
