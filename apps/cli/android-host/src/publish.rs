//! Native Publish transport. Kotlin owns navigation and account credentials;
//! source validation, attachment discovery and uploads use the shared publisher.
use anyhow::{anyhow, ensure, Result};
use eidos_publish::{
    cli::{PublishArgs, PublishVisibilityArg},
    publish::*,
};
use serde_json::{json, Value};
use std::{
    path::{Component, Path},
    sync::{LazyLock, Mutex},
};

static OPERATION: Mutex<()> = Mutex::new(());
static PROGRESS: LazyLock<Mutex<Value>> = LazyLock::new(|| Mutex::new(json!({})));

fn report(event: Value) {
    let mut value = PROGRESS.lock().unwrap_or_else(|e| e.into_inner());
    if event["kind"] == "publication" {
        value["publication"] = event["publication"].clone();
    } else {
        value["event"] = event;
    }
}

pub fn progress() -> Value {
    PROGRESS.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

fn transport<T>(result: eidos_publish::error::Result<T>) -> Result<T> {
    result.map_err(|error| anyhow!("{}", error.message))
}

fn string<'a>(request: &'a Value, key: &str) -> Result<&'a str> {
    request[key]
        .as_str()
        .ok_or_else(|| anyhow!("Missing Publish {key}"))
}

fn source(root: &Path, relative: &str) -> Result<std::path::PathBuf> {
    ensure!(
        !relative.is_empty()
            && Path::new(relative)
                .components()
                .all(|part| matches!(part, Component::Normal(_))),
        "Invalid source path"
    );
    let root = root.canonicalize()?;
    let path = root.join(relative);
    ensure!(
        !path.symlink_metadata()?.file_type().is_symlink(),
        "Cannot publish symbolic links"
    );
    let path = path.canonicalize()?;
    ensure!(
        path.starts_with(&root) && path.is_file(),
        "Source is outside the Space"
    );
    Ok(path)
}

pub fn execute(root: &Path, method: &str, request: Value) -> Result<Value> {
    let _operation = OPERATION
        .lock()
        .map_err(|_| anyhow!("Publish session failed"))?;
    *PROGRESS.lock().unwrap_or_else(|e| e.into_inner()) =
        json!({"operationId": request["operationId"]});
    let origin = string(&request, "origin")?;
    let token = string(&request, "token")?;
    let slug = string(&request, "slug")?;
    let expected = request["publicationId"].as_str();
    let current = transport(inspect_publication(origin, token, slug))?;
    if method == "inspect" {
        return Ok(current.unwrap_or(Value::Null));
    }
    ensure!(
        matches!(method, "publish" | "unpublish"),
        "Unknown Publish operation"
    );
    match (&current, expected) {
        (Some(value), Some(id)) => ensure!(
            value["publicationId"].as_str() == Some(id),
            "Publication identity changed; reopen Publish"
        ),
        (None, None) => {}
        (Some(_), None) => return Err(anyhow!("这个链接已被占用，请更换发布路径")),
        (None, Some(_)) => return Err(anyhow!("云端发布记录已不存在，请重新打开发布页面")),
    }
    if method == "unpublish" {
        return transport(unpublish(
            origin,
            token,
            slug,
            expected.ok_or_else(|| anyhow!("No publication binding"))?,
        ));
    }
    let relative = string(&request, "path")?;
    let path = source(root, relative)?;
    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    ensure!(
        matches!(extension.as_str(), "md" | "markdown" | "eidos"),
        "Only Markdown and Eidos files can be published"
    );
    let attachment_root = path
        .parent()
        .ok_or_else(|| anyhow!("Invalid source directory"))?;
    let progress = PublishProgress::observed(report);
    progress.stage("preparing local snapshot");
    // A private snapshot avoids uploading a SQLite main file without its WAL.
    // The repository holds its IO mutex throughout this operation, including assets.
    let temporary = tempfile::Builder::new()
        .prefix(".publish-")
        .tempdir_in(root.parent().ok_or_else(|| anyhow!("Invalid Space root"))?)?;
    let snapshot = temporary.path().join(format!("source.{extension}"));
    let (kind, attachments) = if extension == "eidos" {
        let conn = rusqlite::Connection::open_with_flags(
            &path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )?;
        eidos_file_core::ddl::configure_connection(&conn)?;
        let validation = eidos_file_core::validate::validate(
            &conn,
            eidos_file_core::validate::ValidationLevel::Semantic,
            100,
        )?;
        ensure!(validation.valid, "Eidos File validation failed");
        let attachments = transport(discover_eidos_attachments(&conn, attachment_root, progress))?;
        conn.backup("main", &snapshot, None)?;
        (PublishSourceKind::Eidos, attachments)
    } else {
        let attachments = transport(discover_markdown_attachments(
            &path,
            attachment_root,
            progress,
        ))?;
        std::fs::copy(&path, &snapshot)?;
        (PublishSourceKind::Markdown, attachments)
    };
    let access = string(&request, "access")?;
    ensure!(
        matches!(access, "public" | "private" | "password" | "unchanged"),
        "Invalid access mode"
    );
    let password = if access == "password" {
        Some(string(&request, "password")?.to_owned())
    } else {
        None
    };
    let args = PublishArgs {
        file: snapshot,
        source_path: Some(relative.to_owned()),
        plugin: None,
        plugin_view: None,
        form_view: None,
        form_respondents: None,
        one_response_per_user: false,
        attachment_root: Some(attachment_root.to_path_buf()),
        graft_delta: None,
        graft_base_sha256: None,
        slug: slug.to_owned(),
        visibility: if access == "private" {
            PublishVisibilityArg::Private
        } else {
            PublishVisibilityArg::Public
        },
        password: password.is_some(),
        password_value: password,
        remove_password: access == "public",
        hide_branding: false,
        show_branding: false,
        no_activate: false,
        publish_origin: origin.to_owned(),
        token: token.to_owned(),
        wait_seconds: 1800,
        progress_json: false,
        client_metadata_json: Some(
            json!({"name":"Eidos Android", "platform":"android"}).to_string(),
        ),
    };
    transport(run(args, kind, attachments, None, progress))
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_space_eidos_android_NativePublish_execute(
    mut env: jni::JNIEnv,
    _class: jni::objects::JClass,
    root: jni::objects::JString,
    method: jni::objects::JString,
    request: jni::objects::JString,
) -> jni::sys::jstring {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Result<Value> {
        let root: String = env.get_string(&root)?.into();
        let method: String = env.get_string(&method)?.into();
        let request: String = env.get_string(&request)?.into();
        crate::session::dispatch(std::path::PathBuf::new(), "close".into(), Value::Null)?;
        execute(Path::new(&root), &method, serde_json::from_str(&request)?)
    }));
    let envelope = match result {
        Ok(Ok(value)) => json!({"ok":true, "value":value}),
        Ok(Err(error)) => {
            json!({"ok":false, "error":error.to_string(), "publication":progress()["publication"]})
        }
        Err(_) => json!({"ok":false, "error":"Native Publish failed"}),
    };
    env.new_string(envelope.to_string())
        .map(|v| v.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_space_eidos_android_NativePublish_progress(
    env: jni::JNIEnv,
    _class: jni::objects::JClass,
) -> jni::sys::jstring {
    env.new_string(progress().to_string())
        .map(|v| v.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn publishes_wal_snapshot_and_native_access_settings() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().join("space");
        std::fs::create_dir(&root).unwrap();
        let file = root.join("data.eidos");
        eidos_file_core::ddl::create_eidos_file(&file, Some("Initial")).unwrap();
        let conn = rusqlite::Connection::open(&file).unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; UPDATE eidos__meta SET title='Committed in WAL'").unwrap();
        assert!(root.join("data.eidos-wal").metadata().unwrap().len() > 0);
        for mode in ["password", "private"] {
            let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
            let origin = format!("http://{}", server.server_addr());
            let worker = std::thread::spawn(move || {
                let mut tenant_reads = 0;
                let mut uploaded = Vec::new();
                loop {
                    let mut request = server
                        .recv_timeout(std::time::Duration::from_secs(5))
                        .unwrap()
                        .unwrap();
                    let path = request.url().to_owned();
                    let mut bytes = Vec::new();
                    request.as_reader().read_to_end(&mut bytes).unwrap();
                    let value = if path == "/api/tenant" {
                        tenant_reads += 1;
                        json!({"canonicalHost":"fixture.eidos.ink", "access":{"maxEidosFileBytes":"268435456"}, "publications": if tenant_reads < 3 { json!([]) } else { json!([{"slug":"native/data", "publicationId":"owned", "currentVersionId":"v1"}]) }})
                    } else if path == "/api/publications/native%2Fdata" {
                        json!({"publicationId":"owned", "currentVersionId":null})
                    } else if path.ends_with("/access") {
                        let body: Value = serde_json::from_slice(&bytes).unwrap();
                        assert_eq!(body["mode"], mode);
                        if mode == "password" {
                            assert_eq!(body["password"], "native-password");
                        }
                        json!({"publicationId":"owned", "accessMode":mode, "currentVersionId":null})
                    } else if path.ends_with("/versions") {
                        let body: Value = serde_json::from_slice(&bytes).unwrap();
                        assert_eq!(body["driver"]["id"], "org.eidos.driver.eidos");
                        let plan: Vec<_> = body["manifest"]["files"].as_array().unwrap().iter()
                            .map(|file| json!({"sha256":file["sha256"], "bytes":file["bytes"], "state":"pending"})).collect();
                        json!({"versionId":"v1", "uploadPlan":plan})
                    } else if path.contains("/objects/") {
                        uploaded = bytes;
                        json!({"state":"ready"})
                    } else if path.ends_with("/complete") {
                        json!({"state":"uploaded"})
                    } else if path.ends_with("/versions/v1") {
                        json!({"state":"ready"})
                    } else {
                        panic!("Unexpected Publish fixture route: {path}");
                    };
                    request
                        .respond(tiny_http::Response::from_string(value.to_string()))
                        .unwrap();
                    if tenant_reads == 3 {
                        break;
                    }
                }
                uploaded
            });
            let result = execute(&root, "publish", json!({"origin":origin, "token":"fixture", "slug":"native/data", "path":"data.eidos", "access":mode, "password":"native-password"})).unwrap();
            assert_eq!(result["accessMode"], mode);
            assert_eq!(result["published"], true);
            let uploaded = temporary.path().join(format!("uploaded-{mode}.eidos"));
            std::fs::write(&uploaded, worker.join().unwrap()).unwrap();
            let snapshot = rusqlite::Connection::open(uploaded).unwrap();
            let title: String = snapshot
                .query_row("SELECT title FROM eidos__meta", [], |row| row.get(0))
                .unwrap();
            assert_eq!(title, "Committed in WAL");
        }
    }

    #[test]
    fn publish_sources_stay_inside_the_space() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("space");
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join("note.md"), "# Local").unwrap();
        std::fs::write(temp.path().join("outside.md"), "private").unwrap();
        assert!(source(&root, "note.md").is_ok());
        for path in ["../outside.md", "", "/outside.md", "missing.md"] {
            assert!(source(&root, path).is_err());
        }
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(temp.path().join("outside.md"), root.join("link.md"))
                .unwrap();
            assert!(source(&root, "link.md").is_err());
        }
    }
}
