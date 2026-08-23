use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use eidos_file_core::ddl::configure_connection;
use eidos_file_core::model::{load_file_meta, load_tables};
use eidos_file_core::rows::{RowChange, RowMutation, mutate_rows_in_transaction};
use rand::RngCore;
use reqwest::Url;
use reqwest::blocking::{Client, RequestBuilder, Response};
use reqwest::header::{AUTHORIZATION, HeaderValue};
use rusqlite::{Connection, OpenFlags, OptionalExtension, TransactionBehavior};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};

use crate::cli::CollectArgs;
use crate::error::{AppError, Result};

const COLLECT_FEATURE: &str = "x__eidos__publish_collect";
const COLLECT_FEATURE_VERSION: &str = "1";
const RECEIPT_TABLE: &str = "x__eidos__publish_collect_receipts";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FormMetadata {
    definition: FormDefinition,
}

#[derive(Debug, Deserialize)]
struct FormDefinition {
    source: FormSource,
    fields: Vec<FormField>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FormSource {
    file_id: String,
    table_id: String,
    view_id: String,
    schema_fingerprint: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FormField {
    field_id: String,
    #[serde(rename = "type")]
    field_type: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CollectorState {
    collector_generation: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LeasePage {
    submissions: Vec<Submission>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Submission {
    submission_id: String,
    publication_version_id: String,
    sequence: Option<String>,
    payload_json: String,
    payload_sha256: String,
    schema_fingerprint: String,
    attachments: Vec<SubmissionAttachment>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubmissionAttachment {
    attachment_id: String,
    field_id: String,
    name: String,
    media_type: String,
    bytes: String,
    sha256: String,
}

pub fn run(args: CollectArgs, show_progress: bool) -> Result<Value> {
    validate_publication_id(&args.publication)?;
    let origin = publish_origin(&args.publish_origin)?;
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|error| AppError::publish_failed(error.to_string()))?;
    let authorization = HeaderValue::from_str(&format!("Bearer {}", args.token))
        .map_err(|_| AppError::invalid_request("Publish token is invalid"))?;
    progress(show_progress, "checking published Form and local schema");
    let metadata: FormMetadata = send_json(
        client
            .get(endpoint(
                &origin,
                &format!("/api/forms/{}", args.publication),
            )?)
            .header(AUTHORIZATION, authorization.clone()),
    )?;

    let mut conn = Connection::open_with_flags(
        &args.file,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(eidos_file_core::EidosError::from)?;
    configure_connection(&conn)?;
    verify_local_schema(&conn, &metadata.definition)?;
    let attachment_root = canonical_attachment_root(
        args.attachment_root
            .as_deref()
            .unwrap_or_else(|| args.file.parent().unwrap_or_else(|| Path::new("."))),
    )?;
    let supplied_collector_id = args.collector_id;
    if args.collector_generation.is_some() && supplied_collector_id.is_none() {
        return Err(AppError::invalid_request(
            "--collector-generation requires --collector-id",
        ));
    }
    let collector_id = supplied_collector_id.unwrap_or_else(|| random_collector_id("eidos-cli"));
    validate_collector_id(&collector_id)?;
    let collector = match args.collector_generation {
        Some(collector_generation) => {
            progress(show_progress, "resuming the active Form Collector");
            CollectorState {
                collector_generation,
            }
        }
        None => {
            progress(show_progress, "taking ownership of the Form Inbox");
            send_json(
                client
                    .post(endpoint(
                        &origin,
                        &format!("/api/forms/{}/collector/takeover", args.publication),
                    )?)
                    .header(AUTHORIZATION, authorization.clone())
                    .header(
                        "Idempotency-Key",
                        idempotency_key(&["collector-takeover", &args.publication, &collector_id]),
                    )
                    .json(&json!({ "collectorId": collector_id })),
            )?
        }
    };

    let mut imported = 0_u64;
    let mut replayed = 0_u64;
    loop {
        let page: LeasePage = send_json(
            client
                .post(endpoint(
                    &origin,
                    &format!("/api/forms/{}/inbox", args.publication),
                )?)
                .header(AUTHORIZATION, authorization.clone())
                .json(&json!({
                    "collectorId": collector_id,
                    "generation": collector.collector_generation,
                    "after": 0,
                    "limit": args.batch_size,
                })),
        )?;
        if page.submissions.is_empty() {
            break;
        }
        for submission in page.submissions {
            progress(
                show_progress,
                &format!("importing submission {}", submission.submission_id),
            );
            let values = materialize_values(
                &client,
                &origin,
                &authorization,
                &args.publication,
                &metadata.definition,
                &submission,
                &attachment_root,
            )?;
            let created = import_submission(
                &mut conn,
                &args.publication,
                &metadata.definition.source.table_id,
                &submission,
                values,
            )?;
            let _: Value = send_json(
                client
                    .post(endpoint(
                        &origin,
                        &format!(
                            "/api/forms/{}/inbox/{}/ack",
                            args.publication, submission.submission_id
                        ),
                    )?)
                    .header(AUTHORIZATION, authorization.clone())
                    .header(
                        "Idempotency-Key",
                        idempotency_key(&[
                            "collector-ack",
                            &args.publication,
                            &submission.submission_id,
                            &submission.payload_sha256,
                        ]),
                    )
                    .json(&json!({
                        "collectorId": collector_id,
                        "generation": collector.collector_generation,
                        "payloadSha256": submission.payload_sha256,
                    })),
            )?;
            if created {
                imported += 1;
            } else {
                replayed += 1;
            }
        }
    }
    progress(
        show_progress,
        &format!("complete: {imported} imported, {replayed} already present"),
    );
    Ok(json!({
        "collected": true,
        "publicationId": args.publication,
        "collectorId": collector_id,
        "collectorGeneration": collector.collector_generation,
        "importedSubmissions": imported,
        "replayedSubmissions": replayed,
    }))
}

fn verify_local_schema(conn: &Connection, definition: &FormDefinition) -> Result<()> {
    let meta = load_file_meta(conn)?;
    if meta.file_id != definition.source.file_id {
        return Err(AppError::invalid_request(
            "published Form belongs to a different Eidos File",
        ));
    }
    if !load_tables(conn)?
        .iter()
        .any(|table| table.id == definition.source.table_id)
    {
        return Err(AppError::invalid_request(
            "published Form target Table no longer exists",
        ));
    }
    let local = crate::publish::build_form_definition(conn, &definition.source.view_id)?;
    let local: Value = serde_json::from_slice(&local)?;
    if local
        .pointer("/source/schemaFingerprint")
        .and_then(Value::as_str)
        != Some(definition.source.schema_fingerprint.as_str())
    {
        return Err(AppError::invalid_request(
            "local Form schema changed; republish the Form before collecting responses",
        ));
    }
    Ok(())
}

fn materialize_values(
    client: &Client,
    origin: &Url,
    authorization: &HeaderValue,
    publication_id: &str,
    definition: &FormDefinition,
    submission: &Submission,
    attachment_root: &Path,
) -> Result<Map<String, Value>> {
    if submission.schema_fingerprint != definition.source.schema_fingerprint {
        return Err(AppError::publish_failed(format!(
            "submission {} targets an incompatible Form schema",
            submission.submission_id
        )));
    }
    let mut values = serde_json::from_str::<Value>(&submission.payload_json)?
        .as_object()
        .cloned()
        .ok_or_else(|| AppError::publish_failed("submission payload must be a JSON object"))?;
    let fields = definition
        .fields
        .iter()
        .map(|field| (field.field_id.as_str(), field.field_type.as_str()))
        .collect::<HashMap<_, _>>();
    let attachments = submission
        .attachments
        .iter()
        .map(|attachment| (attachment.attachment_id.as_str(), attachment))
        .collect::<HashMap<_, _>>();
    for (field_id, field_type) in fields {
        if field_type != "file" {
            continue;
        }
        let Some(reference_ids) = values
            .get(field_id)
            .and_then(Value::as_object)
            .and_then(|value| value.get("attachments"))
            .and_then(Value::as_array)
            .cloned()
        else {
            continue;
        };
        let entries = reference_ids
            .into_iter()
            .map(|value| {
                let attachment_id = value.as_str().ok_or_else(|| {
                    AppError::publish_failed("submission attachment reference is invalid")
                })?;
                let attachment = attachments.get(attachment_id).ok_or_else(|| {
                    AppError::publish_failed("submission attachment metadata is missing")
                })?;
                if attachment.field_id != field_id {
                    return Err(AppError::publish_failed(
                        "submission attachment belongs to another Field",
                    ));
                }
                let uri = download_attachment(
                    client,
                    origin,
                    authorization,
                    publication_id,
                    &submission.submission_id,
                    attachment,
                    attachment_root,
                )?;
                Ok(json!({
                    "id": eidos_file_core::id::generate_uuidv7(),
                    "name": attachment.name,
                    "mediaType": attachment.media_type,
                    "size": attachment.bytes,
                    "uri": uri,
                }))
            })
            .collect::<Result<Vec<_>>>()?;
        values.insert(field_id.to_string(), Value::Array(entries));
    }
    Ok(values)
}

fn download_attachment(
    client: &Client,
    origin: &Url,
    authorization: &HeaderValue,
    publication_id: &str,
    submission_id: &str,
    attachment: &SubmissionAttachment,
    root: &Path,
) -> Result<String> {
    let expected_bytes = attachment
        .bytes
        .parse::<u64>()
        .map_err(|_| AppError::publish_failed("attachment byte count is invalid"))?;
    let response = client
        .get(endpoint(
            origin,
            &format!(
                "/api/forms/{publication_id}/inbox/{submission_id}/attachments/{}",
                attachment.attachment_id
            ),
        )?)
        .header(AUTHORIZATION, authorization.clone())
        .send()
        .map_err(|error| AppError::publish_failed(network_error(&error)))?;
    let status = response.status();
    if !status.is_success() {
        return Err(response_error(response));
    }
    let body = response
        .bytes()
        .map_err(|error| AppError::publish_failed(network_error(&error)))?;
    if body.len() as u64 != expected_bytes
        || format!("{:x}", Sha256::digest(&body)) != attachment.sha256
    {
        return Err(AppError::publish_failed(
            "downloaded attachment differs from its Inbox descriptor",
        ));
    }
    let relative = format!(
        ".eidos-assets/publish/sha256/{}/{}",
        &attachment.sha256[..2],
        attachment.sha256
    );
    persist_content_addressed(root, &relative, &body, &attachment.sha256)?;
    Ok(relative)
}

fn persist_content_addressed(
    root: &Path,
    relative: &str,
    bytes: &[u8],
    sha256: &str,
) -> Result<()> {
    let destination = root.join(relative);
    let parent = destination
        .parent()
        .ok_or_else(|| AppError::publish_failed("attachment destination is invalid"))?;
    create_contained_directories(root, parent)?;
    if destination.exists() {
        let existing = fs::read(&destination)?;
        if existing.len() == bytes.len() && format!("{:x}", Sha256::digest(existing)) == sha256 {
            return Ok(());
        }
        return Err(AppError::publish_failed(format!(
            "content-addressed attachment already differs: {}",
            destination.display()
        )));
    }
    let temporary = parent.join(format!(".{}.{}.tmp", sha256, random_suffix()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    match fs::hard_link(&temporary, &destination) {
        Ok(()) => {}
        Err(error) if destination.exists() => {
            let existing = fs::read(&destination)?;
            if existing.len() != bytes.len() || format!("{:x}", Sha256::digest(existing)) != sha256
            {
                let _ = fs::remove_file(&temporary);
                return Err(AppError::publish_failed(format!(
                    "content-addressed attachment race produced different bytes: {error}"
                )));
            }
        }
        Err(error) => {
            let _ = fs::remove_file(&temporary);
            return Err(AppError::internal(error.to_string()));
        }
    }
    fs::remove_file(&temporary)?;
    Ok(())
}

fn create_contained_directories(root: &Path, target: &Path) -> Result<()> {
    let relative = target
        .strip_prefix(root)
        .map_err(|_| AppError::publish_failed("attachment path escapes its root"))?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(AppError::publish_failed(format!(
                    "attachment directory contains a symbolic link: {}",
                    current.display()
                )));
            }
            Ok(metadata) if !metadata.is_dir() => {
                return Err(AppError::publish_failed(format!(
                    "attachment directory path is not a directory: {}",
                    current.display()
                )));
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir(&current)?;
            }
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

fn import_submission(
    conn: &mut Connection,
    publication_id: &str,
    table_id: &str,
    submission: &Submission,
    values: Map<String, Value>,
) -> Result<bool> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(eidos_file_core::EidosError::from)?;
    install_receipt_extension(&tx)?;
    let existing = tx
        .query_row(
            &format!("SELECT payload_sha256 FROM {RECEIPT_TABLE} WHERE submission_id = ?"),
            [&submission.submission_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(eidos_file_core::EidosError::from)?;
    if let Some(existing) = existing {
        if existing != submission.payload_sha256 {
            return Err(AppError::publish_failed(
                "local receipt conflicts with the leased submission",
            ));
        }
        tx.rollback().map_err(eidos_file_core::EidosError::from)?;
        return Ok(false);
    }
    let revision = load_file_meta(&tx)?.revision.to_string();
    let result = mutate_rows_in_transaction(
        &tx,
        &RowMutation {
            table_id: table_id.to_string(),
            expected_revision: Some(revision),
            changes: vec![RowChange::Create {
                client_key: submission.submission_id.clone(),
                values,
            }],
        },
    )?;
    let row_id = result
        .created
        .first()
        .map(|created| created.row_id.as_str())
        .ok_or_else(|| AppError::publish_failed("Collector did not create a target Row"))?;
    tx.execute(
        &format!(
            "INSERT INTO {RECEIPT_TABLE} (
               submission_id, publication_id, publication_version_id,
               target_table_id, inserted_row_id, payload_sha256,
               cloud_sequence, imported_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
        ),
        (
            &submission.submission_id,
            publication_id,
            &submission.publication_version_id,
            table_id,
            row_id,
            &submission.payload_sha256,
            submission.sequence.as_deref().unwrap_or("0"),
        ),
    )
    .map_err(eidos_file_core::EidosError::from)?;
    tx.commit().map_err(eidos_file_core::EidosError::from)?;
    Ok(true)
}

fn install_receipt_extension(tx: &rusqlite::Transaction<'_>) -> Result<()> {
    tx.execute_batch(&format!(
        "CREATE TABLE IF NOT EXISTS {RECEIPT_TABLE} (
           submission_id TEXT PRIMARY KEY COLLATE BINARY,
           publication_id TEXT NOT NULL COLLATE BINARY,
           publication_version_id TEXT NOT NULL COLLATE BINARY,
           target_table_id TEXT NOT NULL COLLATE BINARY,
           inserted_row_id TEXT NOT NULL COLLATE BINARY,
           payload_sha256 TEXT NOT NULL COLLATE BINARY,
           cloud_sequence TEXT NOT NULL COLLATE BINARY,
           imported_at TEXT NOT NULL
         ) STRICT, WITHOUT ROWID;
         INSERT OR IGNORE INTO eidos__features (name, version, required, config_json)
         VALUES ('{COLLECT_FEATURE}', '{COLLECT_FEATURE_VERSION}', 0, '{{}}');"
    ))
    .map_err(eidos_file_core::EidosError::from)?;
    let feature = tx
        .query_row(
            "SELECT version, required, config_json FROM eidos__features WHERE name = ?",
            [COLLECT_FEATURE],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .map_err(eidos_file_core::EidosError::from)?;
    if feature != (COLLECT_FEATURE_VERSION.into(), 0, "{}".into()) {
        return Err(AppError::publish_failed(
            "local Publish Collector extension has an incompatible definition",
        ));
    }
    Ok(())
}

fn canonical_attachment_root(root: &Path) -> Result<PathBuf> {
    let canonical = fs::canonicalize(root).map_err(|error| {
        AppError::invalid_request(format!(
            "cannot open attachment root {}: {error}",
            root.display()
        ))
    })?;
    if !canonical.is_dir() {
        return Err(AppError::invalid_request(format!(
            "attachment root is not a directory: {}",
            root.display()
        )));
    }
    Ok(canonical)
}

fn send_json<T: for<'de> Deserialize<'de>>(request: RequestBuilder) -> Result<T> {
    let response = request
        .send()
        .map_err(|error| AppError::publish_failed(network_error(&error)))?;
    let status = response.status();
    if !status.is_success() {
        return Err(response_error(response));
    }
    response
        .json::<T>()
        .map_err(|error| AppError::publish_failed(format!("invalid service response: {error}")))
}

fn response_error(response: Response) -> AppError {
    let status = response.status();
    let value = response.json::<Value>().unwrap_or(Value::Null);
    let code = value
        .pointer("/error/code")
        .and_then(Value::as_str)
        .unwrap_or("publish_request_failed");
    let message = value
        .pointer("/error/message")
        .and_then(Value::as_str)
        .unwrap_or("Publish request failed");
    AppError::publish_failed(format!("{message} ({code}, HTTP {})", status.as_u16()))
}

fn publish_origin(value: &str) -> Result<Url> {
    let mut url = Url::parse(value)
        .map_err(|_| AppError::invalid_request("--publish-origin must be an absolute URL"))?;
    let local_http =
        url.scheme() == "http" && matches!(url.host_str(), Some("127.0.0.1" | "localhost"));
    if (url.scheme() != "https" && !local_http)
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(AppError::invalid_request(
            "--publish-origin must use HTTPS (HTTP is allowed only on loopback)",
        ));
    }
    url.set_path("");
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

fn endpoint(origin: &Url, path: &str) -> Result<Url> {
    origin
        .join(path)
        .map_err(|error| AppError::publish_failed(error.to_string()))
}

fn validate_publication_id(value: &str) -> Result<()> {
    let bytes = value.as_bytes();
    let valid = bytes.len() == 36
        && bytes.iter().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => *byte == b'-',
            _ => byte.is_ascii_digit() || (b'a'..=b'f').contains(byte),
        });
    if valid {
        Ok(())
    } else {
        Err(AppError::invalid_request(
            "--publication must be a lowercase UUID",
        ))
    }
}

fn validate_collector_id(value: &str) -> Result<()> {
    if (16..=128).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    {
        Ok(())
    } else {
        Err(AppError::invalid_request("Collector ID is invalid"))
    }
}

fn random_collector_id(prefix: &str) -> String {
    format!("{prefix}-{}", random_suffix())
}

fn random_suffix() -> String {
    let mut bytes = [0_u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn idempotency_key(parts: &[&str]) -> String {
    let mut digest = Sha256::new();
    for part in parts {
        digest.update(part.as_bytes());
        digest.update([0]);
    }
    format!("eidos-cli-{:x}", digest.finalize())
}

fn network_error(error: &reqwest::Error) -> String {
    if error.is_timeout() {
        "Publish request timed out".to_string()
    } else if error.is_connect() {
        "Could not connect to Eidos Publish".to_string()
    } else {
        error.to_string()
    }
}

fn progress(enabled: bool, message: &str) {
    if enabled {
        eprintln!("collect: {message}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use eidos_file_core::ddl::create_eidos_file;
    use eidos_file_core::model::FieldType;
    use eidos_file_core::schema_ops::{NewField, SchemaLeafChange, apply_initial_table};
    use eidos_file_core::validate::{ValidationLevel, validate};

    #[test]
    fn decodes_submission_version_using_publish_api_contract() {
        let page = serde_json::from_value::<LeasePage>(json!({
            "submissions": [{
                "submissionId": "7300a083-df92-49d8-945d-1e0bae0eac18",
                "publicationId": "6300a083-df92-49d8-945d-1e0bae0eac18",
                "publicationVersionId": "5300a083-df92-49d8-945d-1e0bae0eac18",
                "state": "leased",
                "sequence": "1",
                "payloadJson": "{}",
                "payloadSha256": "a".repeat(64),
                "schemaFingerprint": "b".repeat(64),
                "attachments": [],
                "createdAt": "2026-08-23T00:00:00.000Z",
                "committedAt": "2026-08-23T00:00:01.000Z"
            }]
        }))
        .expect("decode the Publish Form Inbox response");

        assert_eq!(page.submissions.len(), 1);
    }

    #[test]
    fn validates_collector_and_publication_identifiers() {
        assert!(validate_collector_id("collector-lite-01").is_ok());
        assert!(validate_collector_id("short").is_err());
        assert!(validate_publication_id("7300a083-df92-49d8-945d-1e0bae0eac18").is_ok());
        assert!(validate_publication_id("not-a-publication").is_err());
    }

    #[test]
    fn writes_content_addressed_assets_without_overwriting_different_bytes() {
        let directory = tempfile::tempdir().expect("temporary root");
        let bytes = b"attachment";
        let digest = format!("{:x}", Sha256::digest(bytes));
        let relative = format!(".eidos-assets/publish/sha256/{}/{}", &digest[..2], digest);
        persist_content_addressed(directory.path(), &relative, bytes, &digest)
            .expect("write asset");
        persist_content_addressed(directory.path(), &relative, bytes, &digest)
            .expect("reuse asset");
        assert_eq!(fs::read(directory.path().join(relative)).unwrap(), bytes);
    }

    #[test]
    fn imports_a_submission_and_receipt_in_one_retry_safe_transaction() {
        let directory = tempfile::tempdir().expect("temporary root");
        let path = directory.path().join("responses.eidos");
        create_eidos_file(&path, Some("Responses")).expect("create file");
        let mut conn = Connection::open(&path).expect("open file");
        configure_connection(&conn).expect("configure file");
        let initialized = apply_initial_table(
            &mut conn,
            &SchemaLeafChange::CreateTable {
                client_key: "responses".into(),
                name: "Responses".into(),
                position: None,
                settings: None,
                fields: vec![NewField {
                    client_key: "name".into(),
                    name: "Name".into(),
                    kind: FieldType::Text,
                    position: None,
                    nullable: Some(false),
                    settings: None,
                    definition: None,
                }],
                label_field_client_key: Some("name".into()),
            },
        )
        .expect("create table");
        let field_id = eidos_file_core::model::load_fields(&conn)
            .expect("fields")
            .into_iter()
            .find(|field| field.name == "Name")
            .expect("name field")
            .id;
        let submission = Submission {
            submission_id: "7300a083-df92-49d8-945d-1e0bae0eac18".into(),
            publication_version_id: "5300a083-df92-49d8-945d-1e0bae0eac18".into(),
            sequence: Some("1".into()),
            payload_json: json!({ &field_id: "Mayne" }).to_string(),
            payload_sha256: "a".repeat(64),
            schema_fingerprint: "b".repeat(64),
            attachments: vec![],
        };
        let values = serde_json::from_str::<Value>(&submission.payload_json)
            .unwrap()
            .as_object()
            .unwrap()
            .clone();
        assert!(
            import_submission(
                &mut conn,
                "6300a083-df92-49d8-945d-1e0bae0eac18",
                &initialized.table_id,
                &submission,
                values.clone(),
            )
            .expect("first import")
        );
        assert!(
            !import_submission(
                &mut conn,
                "6300a083-df92-49d8-945d-1e0bae0eac18",
                &initialized.table_id,
                &submission,
                values,
            )
            .expect("replay import")
        );
        let physical_name = load_tables(&conn)
            .unwrap()
            .into_iter()
            .find(|table| table.id == initialized.table_id)
            .unwrap()
            .physical_name;
        let row_count: i64 = conn
            .query_row(
                &format!("SELECT COUNT(*) FROM \"{physical_name}\""),
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(row_count, 1);
        let report = validate(&conn, ValidationLevel::Semantic, 100).expect("validate file");
        assert!(report.valid, "{:?}", report.diagnostics);
    }
}
