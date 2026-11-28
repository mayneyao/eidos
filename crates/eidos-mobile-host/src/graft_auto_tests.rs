use super::*;

struct Fixture {
    _temp: tempfile::TempDir,
    desktop: PathBuf,
    phone: PathBuf,
    author: GraftHost,
    mobile: GraftHost,
}
impl Fixture {
    fn new() -> Result<Self> {
        let temp = tempfile::tempdir()?;
        let desktop = temp.path().join("desktop");
        let phone = temp.path().join("phone");
        let remote = temp.path().join("remote");
        for path in [&desktop, &phone, &remote] {
            std::fs::create_dir(path)?;
        }
        let url = format!("fs://{}", remote.display());
        let mut author = GraftHost::default();
        std::fs::write(desktop.join("note.md"), "first")?;
        crate::execute(
            &desktop.join("data.eidos"),
            "create",
            json!({"title": "Data"}),
        )?;
        std::fs::write(desktop.join("image.bin"), [1, 2, 3])?;
        author.execute(&desktop, "checkpoint", json!({}))?;
        author.execute(&desktop, "configureRemote", json!({"url":url}))?;
        author.execute(&desktop, "push", json!({}))?;
        let mut mobile = GraftHost::default();
        mobile.execute(&phone, "clone", json!({"url":url}))?;
        mobile.execute(&phone, "peerConfigure", json!({"url":url}))?;
        Ok(Self {
            _temp: temp,
            desktop,
            phone,
            author,
            mobile,
        })
    }
    fn head(host: &mut GraftHost, root: &Path) -> Result<Value> {
        Ok(host.execute(root, "status", json!({}))?["status"]["current_head"].clone())
    }
    fn ahead(&mut self) -> Result<Value> {
        std::fs::write(self.desktop.join("note.md"), "second")?;
        std::fs::write(self.desktop.join("image.bin"), [4, 5, 6])?;
        self.author
            .execute(&self.desktop, "checkpoint", json!({}))?;
        self.author.execute(&self.desktop, "push", json!({}))?;
        self.mobile.execute(&self.phone, "peerFetch", json!({}))?;
        Self::head(&mut self.author, &self.desktop)
    }
    fn apply(&mut self, head: Value, target: Value) -> Result<Value> {
        self.mobile.execute(
            &self.phone,
            "peerAutoApply",
            json!({"expectedHead":head, "expectedTarget":target}),
        )
    }
}

#[test]
fn peer_auto_clean_ahead_updates_files_and_repeated_or_old_heads_are_noops() -> Result<()> {
    let mut f = Fixture::new()?;
    let checked = f.mobile.execute(&f.phone, "peerAutoCheck", json!({}))?;
    assert_eq!(checked["outcome"], "ready", "{checked}");
    let old = checked["expectedHead"].clone();
    let target = f.ahead()?;
    assert_eq!(f.apply(old.clone(), target.clone())?["outcome"], "updated");
    assert_eq!(std::fs::read_to_string(f.phone.join("note.md"))?, "second");
    assert_eq!(std::fs::read(f.phone.join("image.bin"))?, [4, 5, 6]);
    assert_eq!(
        f.apply(target.clone(), target.clone())?["outcome"],
        "unchanged"
    );
    // An older peer cannot roll back the local head.
    f.mobile.execute(&f.phone, "close", json!({}))?;
    let session = RepositorySession::new(&f.phone);
    session.open()?;
    session.add_all()?;
    std::fs::write(f.phone.join("local.md"), "local")?;
    session.add_all()?;
    session.commit("local only")?;
    session.close()?;
    let local = Fixture::head(&mut f.mobile, &f.phone)?;
    assert_eq!(f.apply(local.clone(), target)?["outcome"], "unchanged");
    assert_eq!(Fixture::head(&mut f.mobile, &f.phone)?, local);
    assert_ne!(local, old);
    Ok(())
}

#[test]
fn peer_auto_rechecks_edits_after_fetch_including_attachments_and_untracked_files() -> Result<()> {
    for (path, content) in [
        ("note.md", b"draft".as_slice()),
        ("image.bin", &[9, 8, 7]),
        ("new.md", b"untracked"),
    ] {
        let mut f = Fixture::new()?;
        let head = Fixture::head(&mut f.mobile, &f.phone)?;
        let target = f.ahead()?;
        std::fs::write(f.phone.join(path), content)?;
        assert_eq!(
            f.mobile.execute(&f.phone, "peerAutoCheck", json!({}))?["outcome"],
            "skipped"
        );
        assert_eq!(f.apply(head.clone(), target)?["outcome"], "skipped");
        assert_eq!(Fixture::head(&mut f.mobile, &f.phone)?, head);
        assert_eq!(std::fs::read(f.phone.join(path))?, content);
    }
    Ok(())
}

#[test]
fn peer_auto_cannot_replace_committed_divergence_or_a_changed_local_head() -> Result<()> {
    let mut f = Fixture::new()?;
    let initial = Fixture::head(&mut f.mobile, &f.phone)?;
    let target = f.ahead()?;
    std::fs::write(f.phone.join("local.md"), "phone history")?;
    f.mobile.execute(&f.phone, "checkpoint", json!({}))?;
    let local = Fixture::head(&mut f.mobile, &f.phone)?;
    assert_eq!(f.apply(initial, target.clone())?["reason"], "local_changes");
    assert_eq!(f.apply(local.clone(), target)?["reason"], "diverged");
    assert_eq!(Fixture::head(&mut f.mobile, &f.phone)?, local);
    assert_eq!(std::fs::read_to_string(f.phone.join("note.md"))?, "first");
    Ok(())
}

#[test]
fn peer_auto_rejects_runtime_sqlite_edits_and_staged_changes() -> Result<()> {
    let mut f = Fixture::new()?;
    let head = Fixture::head(&mut f.mobile, &f.phone)?;
    let target = f.ahead()?;
    let path = f.phone.join("data.eidos");
    let schema = crate::execute(&path, "schema", json!({}))?;
    let table = schema["objects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|o| o["object"] == "table")
        .unwrap();
    crate::execute(
        &path,
        "mutateRows",
        json!({
            "tableId": table["id"], "expectedRevision": schema["snapshot"]["revision"],
            "changes": [{"kind":"create", "clientKey":"local", "values": {table["labelFieldId"].as_str().unwrap(): "local draft"}}]
        }),
    )?;
    assert_eq!(f.apply(head.clone(), target.clone())?["outcome"], "skipped");
    f.mobile.execute(&f.phone, "close", json!({}))?;
    let session = RepositorySession::new(&f.phone);
    session.open()?;
    session.add_all()?;
    session.close()?;
    assert_eq!(
        f.mobile.execute(&f.phone, "peerAutoCheck", json!({}))?["outcome"],
        "skipped"
    );
    assert_eq!(f.apply(head.clone(), target)?["outcome"], "skipped");
    assert_eq!(Fixture::head(&mut f.mobile, &f.phone)?, head);
    Ok(())
}

#[test]
fn peer_auto_pins_advertised_target_and_cancelled_or_failed_transfers_do_not_apply() -> Result<()> {
    let mut f = Fixture::new()?;
    let head = Fixture::head(&mut f.mobile, &f.phone)?;
    let target = f.ahead()?;
    assert_eq!(
        f.apply(head.clone(), head.clone())?["reason"],
        "peer_changed"
    );
    let id = "auto-pull-cancelled";
    crate::cancellation::begin(id)?;
    crate::cancellation::cancel(id);
    assert!(crate::cancellation::run(Some(id), || f.apply(head.clone(), target.clone())).is_err());
    crate::cancellation::end(id);
    f.mobile.execute(
        &f.phone,
        "peerConfigure",
        json!({"url":"graft+http://127.0.0.1:1/peer/space"}),
    )?;
    assert!(f.mobile.execute(&f.phone, "peerFetch", json!({})).is_err());
    assert_eq!(Fixture::head(&mut f.mobile, &f.phone)?, head);
    assert_eq!(std::fs::read_to_string(f.phone.join("note.md"))?, "first");
    Ok(())
}

#[test]
fn peer_auto_never_initializes_an_unversioned_space() -> Result<()> {
    let root = tempfile::tempdir()?;
    let mut host = GraftHost::default();
    assert_eq!(
        host.execute(root.path(), "peerAutoCheck", json!({}))?["reason"],
        "uninitialized"
    );
    assert_eq!(
        host.execute(root.path(), "peerAutoApply", json!({}))?["reason"],
        "uninitialized"
    );
    assert!(!root.path().join(".graft").exists());
    Ok(())
}

#[test]
fn peer_sync_check_skips_publish_only_when_clean_and_matching_peer_main() -> Result<()> {
    let uninitialized = tempfile::tempdir()?;
    let mut bare = GraftHost::default();
    assert_eq!(
        bare.execute(uninitialized.path(), "peerSyncCheck", json!({}))?["needsPublish"],
        false
    );

    let mut f = Fixture::new()?;
    // Before eidos-peer/main has been fetched, peerSyncCheck conservatively requires publish.
    assert_eq!(
        f.mobile.execute(&f.phone, "peerSyncCheck", json!({}))?["needsPublish"],
        true
    );
    f.mobile.execute(&f.phone, "peerFetch", json!({}))?;
    let check = f.mobile.execute(&f.phone, "peerSyncCheck", json!({}))?;
    assert_eq!(check["initialized"], true);
    assert_eq!(check["hasHead"], true);
    assert!(check["peerHead"].as_str().is_some_and(|h| h.len() == 64));
    assert_eq!(check["clean"], true);
    assert_eq!(check["needsPublish"], false);

    // Uncommitted local edit requires checkpoint + publish.
    std::fs::write(f.phone.join("note.md"), "dirty edit")?;
    let dirty = f.mobile.execute(&f.phone, "peerSyncCheck", json!({}))?;
    assert_eq!(dirty["clean"], false);
    assert_eq!(dirty["needsPublish"], true);

    // Committing locally ahead of eidos-peer/main still requires publish.
    let saved = f.mobile.execute(&f.phone, "checkpoint", json!({}))?;
    assert_eq!(saved["status"]["dirty"], false);
    let ahead = f.mobile.execute(&f.phone, "peerSyncCheck", json!({}))?;
    assert_eq!(ahead["clean"], true);
    assert_eq!(ahead["needsPublish"], true);

    // Fast-path clean checkpoint succeeds without error or extra commits.
    let before_count = f.mobile.execute(&f.phone, "history", json!({}))?["commits"]
        .as_array()
        .unwrap()
        .len();
    let noop_cp = f.mobile.execute(&f.phone, "checkpoint", json!({}))?;
    assert_eq!(noop_cp["timing_ms"]["commit"], 0);
    let after_count = f.mobile.execute(&f.phone, "history", json!({}))?["commits"]
        .as_array()
        .unwrap()
        .len();
    assert_eq!(before_count, after_count);
    Ok(())
}

#[test]
fn checkpoint_commits_edit_written_between_incremental_and_full_status() -> Result<()> {
    let mut f = Fixture::new()?;
    let before = Fixture::head(&mut f.mobile, &f.phone)?;
    let note_path = f.phone.join("note.md");
    set_before_checkpoint_full_status_hook(move || {
        std::fs::write(&note_path, "edit between checks").unwrap();
    });
    let outcome = f.mobile.execute(&f.phone, "checkpoint", json!({}))?;
    let after = outcome["status"]["current_head"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_ne!(after, before.as_str().unwrap());
    assert_eq!(outcome["status"]["dirty"], false);
    assert_eq!(
        std::fs::read_to_string(f.phone.join("note.md"))?,
        "edit between checks"
    );
    Ok(())
}
