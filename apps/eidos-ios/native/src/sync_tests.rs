use anyhow::Result;
use serde_json::json;

#[test]
fn merge_survives_reopen_and_resolves_through_ios_transport() -> Result<()> {
    let dir = tempfile::tempdir()?;
    let source = dir.path().join("source");
    let phone = dir.path().join("phone");
    let remote = dir.path().join("remote");
    for path in [&source, &phone, &remote] {
        std::fs::create_dir(path)?;
    }
    let mut desktop = crate::Host::default();
    let mut ios = crate::Host::default();
    let config = json!({"url":format!("fs://{}", remote.display())});
    std::fs::write(source.join("note.md"), "base")?;
    desktop.execute(source.clone(), "graft:checkpoint", json!({}))?;
    desktop.execute(source.clone(), "graft:configureRemote", config.clone())?;
    desktop.execute(source.clone(), "graft:push", json!({}))?;
    ios.execute(phone.clone(), "graft:clone", config)?;
    std::fs::write(source.join("note.md"), "desktop")?;
    std::fs::write(phone.join("note.md"), "phone")?;
    desktop.execute(source.clone(), "graft:checkpoint", json!({}))?;
    desktop.execute(source.clone(), "graft:push", json!({}))?;
    ios.execute(phone.clone(), "graft:checkpoint", json!({}))?;
    ios.execute(phone.clone(), "graft:fetch", json!({}))?;
    ios.execute(phone.clone(), "graft:beginMerge", json!({}))?;
    let state = ios.execute(phone.clone(), "graft:mergeStatus", json!({}))?;
    assert_eq!(state["unmerged_count"], 1);
    ios.execute(phone.clone(), "graft:close", json!({}))?;
    assert_eq!(
        ios.execute(phone.clone(), "graft:mergeStatus", json!({}))?,
        state
    );
    assert!(ios
        .execute(phone.clone(), "graft:checkpoint", json!({}))
        .is_err());
    assert!(ios
        .execute(
            phone.clone(),
            "graft:chooseMergePath",
            json!({"path":"note.md","side":"ours","stateToken":"stale"})
        )
        .is_err());
    ios.execute(
        phone.clone(),
        "graft:chooseMergePath",
        json!({"path":"note.md","side":"theirs","stateToken":state["state_token"]}),
    )?;
    let state = ios.execute(phone.clone(), "graft:mergeStatus", json!({}))?;
    ios.execute(
        phone.clone(),
        "graft:continueMerge",
        json!({"stateToken":state["state_token"]}),
    )?;
    assert_eq!(std::fs::read_to_string(phone.join("note.md"))?, "desktop");
    ios.execute(phone.clone(), "graft:push", json!({}))?;
    ios.execute(phone, "graft:close", json!({}))?;
    desktop.execute(source, "graft:close", json!({}))?;
    Ok(())
}
