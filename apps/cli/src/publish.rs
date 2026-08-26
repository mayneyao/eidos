use std::collections::{BTreeMap, HashMap};
use std::fs::{self, File};
use std::io::{self, Cursor, Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use eidos_file_core::model::{
    FieldMeta, FieldType, load_fields, load_file_meta, load_tables, load_views,
};
use eidos_file_core::query::{FilterNode, ReadRowsOptions, RowQuery, read_rows};
use eidos_file_core::values::normalize_relative_file_uri;
use pulldown_cmark::{Event, Options, Parser, Tag};
use rand::RngCore;
use reqwest::Url;
use reqwest::blocking::{Body, Client, RequestBuilder, Response};
use reqwest::header::{AUTHORIZATION, CONTENT_LENGTH, CONTENT_TYPE, HeaderValue};
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::cli::{PublishArgs, PublishVisibilityArg};
use crate::error::{AppError, Result};

const EIDOS_DRIVER_ID: &str = "org.eidos.driver.eidos";
const MARKDOWN_DRIVER_ID: &str = "org.eidos.driver.markdown";
const FORM_DRIVER_ID: &str = "org.eidos.driver.form";
const DRIVER_VERSION: &str = "1.0";
const EIDOS_MEDIA_TYPE: &str = "application/vnd.eidos+sqlite3";
const MARKDOWN_MEDIA_TYPE: &str = "text/markdown";
const FORM_MEDIA_TYPE: &str = "application/vnd.eidos.form+json";
const EIDOS_ENTRYPOINT: &str = "source.eidos";
const MARKDOWN_ENTRYPOINT: &str = "document.md";
const FORM_ENTRYPOINT: &str = "form.json";
const MAX_OBJECT_BYTES: u64 = 1024 * 1024 * 1024;
pub(crate) const MAX_MARKDOWN_BYTES: u64 = 16 * 1024 * 1024;
const MAX_FORM_BYTES: u64 = 256 * 1024;
const MAX_ASSET_REFERENCES: usize = 50_000;
const SINGLE_UPLOAD_MAX_BYTES: u64 = 95 * 1024 * 1024;
const MULTIPART_PART_BYTES: u64 = 64 * 1024 * 1024;
const MAX_SQLITE_DELTA_BYTES: u64 = 32 * 1024 * 1024;
const SQLITE_DELTA_HEADER_BYTES: usize = 104;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct LocalAttachment {
    reference: LocalAttachmentReference,
    uri: String,
    path: String,
    local_path: PathBuf,
    name: String,
    media_type: String,
    bytes: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum LocalAttachmentReference {
    EidosFileEntry(String),
    MarkdownLink,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PublishSourceKind {
    Eidos,
    Markdown,
    Form,
}

impl PublishSourceKind {
    fn driver_id(self) -> &'static str {
        match self {
            Self::Eidos => EIDOS_DRIVER_ID,
            Self::Markdown => MARKDOWN_DRIVER_ID,
            Self::Form => FORM_DRIVER_ID,
        }
    }

    fn media_type(self) -> &'static str {
        match self {
            Self::Eidos => EIDOS_MEDIA_TYPE,
            Self::Markdown => MARKDOWN_MEDIA_TYPE,
            Self::Form => FORM_MEDIA_TYPE,
        }
    }

    fn entrypoint(self) -> &'static str {
        match self {
            Self::Eidos => EIDOS_ENTRYPOINT,
            Self::Markdown => MARKDOWN_ENTRYPOINT,
            Self::Form => FORM_ENTRYPOINT,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileEntry {
    id: String,
    name: String,
    media_type: String,
    size: String,
    uri: String,
}

#[derive(Clone, Debug)]
struct SourceObject {
    path: String,
    role: &'static str,
    media_type: String,
    bytes: u64,
    sha256: String,
    source: SourceObjectSource,
}

#[derive(Clone, Debug)]
struct SqlitePageDelta {
    path: PathBuf,
    bytes: u64,
    sha256: String,
    base_sha256: String,
}

#[derive(Clone, Debug)]
enum SourceObjectSource {
    File(PathBuf),
    Memory(Vec<u8>),
}

enum SourceObjectReader {
    File(File),
    Memory(Cursor<Vec<u8>>),
}

impl Read for SourceObjectReader {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        match self {
            Self::File(source) => source.read(buffer),
            Self::Memory(source) => source.read(buffer),
        }
    }
}

impl SourceObjectSource {
    fn open(&self) -> Result<SourceObjectReader> {
        match self {
            Self::File(path) => File::open(path)
                .map(SourceObjectReader::File)
                .map_err(|error| {
                    AppError::publish_failed(format!(
                        "cannot reopen source object {}: {error}",
                        path.display()
                    ))
                }),
            Self::Memory(bytes) => Ok(SourceObjectReader::Memory(Cursor::new(bytes.clone()))),
        }
    }

    fn file(&self) -> Result<File> {
        match self {
            Self::File(path) => File::open(path).map_err(|error| {
                AppError::publish_failed(format!(
                    "cannot reopen source object {}: {error}",
                    path.display()
                ))
            }),
            Self::Memory(_) => Err(AppError::publish_failed(
                "generated source exceeds the direct-upload limit",
            )),
        }
    }

    fn current_bytes(&self) -> Result<u64> {
        match self {
            Self::File(path) => path
                .metadata()
                .map(|metadata| metadata.len())
                .map_err(|error| AppError::publish_failed(error.to_string())),
            Self::Memory(bytes) => u64::try_from(bytes.len())
                .map_err(|error| AppError::publish_failed(error.to_string())),
        }
    }
}

enum PublicationAccessChange {
    Unchanged,
    Password(String),
    Public,
    Private,
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum PublishProgressFormat {
    Disabled,
    Human,
    JsonLines,
}

#[derive(Clone, Copy)]
pub(crate) struct PublishProgress {
    format: PublishProgressFormat,
}

impl PublishProgress {
    pub(crate) fn new(show_human: bool, json_lines: bool) -> Self {
        let format = if json_lines {
            PublishProgressFormat::JsonLines
        } else if show_human {
            PublishProgressFormat::Human
        } else {
            PublishProgressFormat::Disabled
        };
        Self { format }
    }

    pub(crate) fn stage(self, message: impl AsRef<str>) {
        match self.format {
            PublishProgressFormat::Disabled => {}
            PublishProgressFormat::Human => eprintln!("publish: {}", message.as_ref()),
            PublishProgressFormat::JsonLines => write_progress_json(json!({
                "type": "publish-progress",
                "kind": "stage",
                "message": message.as_ref(),
            })),
        }
    }

    fn update_bytes(
        self,
        label: &str,
        current: u64,
        total: u64,
        last_percent: &mut Option<u64>,
    ) -> bool {
        if self.format == PublishProgressFormat::Disabled {
            return current >= total;
        }
        let percent = progress_percent(current, total);
        if *last_percent == Some(percent) && current < total {
            return false;
        }
        *last_percent = Some(percent);
        match self.format {
            PublishProgressFormat::Disabled => unreachable!(),
            PublishProgressFormat::Human => {
                eprint!("\r{}", progress_bytes_line(label, current, total));
                let _ = io::stderr().flush();
                if current >= total {
                    eprintln!();
                    return true;
                }
            }
            PublishProgressFormat::JsonLines => write_progress_json(json!({
                "type": "publish-progress",
                "kind": "bytes",
                "label": label,
                "currentBytes": current.to_string(),
                "totalBytes": total.to_string(),
                "percent": percent,
            })),
        }
        current >= total
    }
}

struct ProgressReader<R> {
    inner: R,
    progress: PublishProgress,
    label: String,
    current: u64,
    total: u64,
    last_percent: Option<u64>,
    finished: bool,
}

impl<R> ProgressReader<R> {
    fn with_offset(
        inner: R,
        progress: PublishProgress,
        label: impl Into<String>,
        current: u64,
        total: u64,
    ) -> Self {
        Self {
            inner,
            progress,
            label: label.into(),
            current,
            total,
            last_percent: None,
            finished: false,
        }
    }
}

impl<R: Read> Read for ProgressReader<R> {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        let read = self.inner.read(buffer)?;
        self.current = self.current.saturating_add(read as u64).min(self.total);
        if read > 0 || self.total == 0 {
            self.finished = self.progress.update_bytes(
                &self.label,
                self.current,
                self.total,
                &mut self.last_percent,
            );
        }
        Ok(read)
    }
}

impl<R> Drop for ProgressReader<R> {
    fn drop(&mut self) {
        if self.progress.format == PublishProgressFormat::Human
            && !self.finished
            && self.last_percent.is_some()
        {
            eprintln!();
        }
    }
}

fn write_progress_json(value: Value) {
    if serde_json::to_writer(io::stderr().lock(), &value).is_ok() {
        eprintln!();
    }
}

pub(crate) fn discover_eidos_attachments(
    conn: &Connection,
    attachment_root: &Path,
    progress: PublishProgress,
) -> Result<Vec<LocalAttachment>> {
    progress.stage("scanning File fields for local attachments");
    let tables = load_tables(conn)?;
    let all_fields = load_fields(conn)?;
    let mut by_entry_id = BTreeMap::<String, LocalAttachment>::new();
    let mut by_path = HashMap::<String, (u64, String)>::new();
    let mut canonical_root: Option<PathBuf> = None;

    for table in tables {
        let file_fields = all_fields
            .iter()
            .filter(|field| {
                field.table_id == table.id
                    && field.field_type == FieldType::File
                    && field.physical_name.is_some()
            })
            .collect::<Vec<_>>();
        if file_fields.is_empty() {
            continue;
        }
        let query = RowQuery {
            filter: Some(FilterNode::Or {
                args: file_fields
                    .iter()
                    .map(|field| FilterNode::IsNotNull {
                        field_id: field.id.clone(),
                    })
                    .collect(),
            }),
            ..RowQuery::default()
        };
        let projection = file_fields
            .iter()
            .map(|field| field.id.clone())
            .collect::<Vec<_>>();
        let mut offset = 0_u32;
        loop {
            let page = read_rows(
                conn,
                &table,
                &all_fields
                    .iter()
                    .filter(|field| field.table_id == table.id)
                    .cloned()
                    .collect::<Vec<_>>(),
                &query,
                &ReadRowsOptions {
                    projection: Some(projection.clone()),
                    include_virtual: false,
                    limit: Some(500),
                    offset: Some(offset),
                },
            )?;
            if page.rows.is_empty() {
                break;
            }
            let page_len = u32::try_from(page.rows.len()).map_err(|_| {
                AppError::publish_failed("attachment scan page exceeds supported size")
            })?;
            for row in page.rows {
                for field in &file_fields {
                    let Some(value) = row.get(&field.name) else {
                        continue;
                    };
                    let Some(entries) = value.as_array() else {
                        if value.is_null() {
                            continue;
                        }
                        return Err(AppError::publish_failed(format!(
                            "File field {:?} contains an invalid value",
                            field.name
                        )));
                    };
                    for value in entries {
                        let entry: FileEntry =
                            serde_json::from_value(value.clone()).map_err(|_| {
                                AppError::publish_failed(format!(
                                    "File field {:?} contains an invalid attachment entry",
                                    field.name
                                ))
                            })?;
                        if entry.uri.starts_with("data:")
                            || entry
                                .uri
                                .get(..8)
                                .is_some_and(|prefix| prefix.eq_ignore_ascii_case("https://"))
                        {
                            continue;
                        }
                        let (uri, path) = normalize_relative_file_uri(&entry.uri).ok_or_else(|| {
                            AppError::publish_failed(format!(
                                "attachment URI {:?} cannot be published from the local filesystem",
                                entry.uri
                            ))
                        })?;
                        if path == EIDOS_ENTRYPOINT {
                            return Err(AppError::publish_failed(format!(
                                "attachment URI {:?} conflicts with the published Eidos entrypoint",
                                entry.uri
                            )));
                        }
                        let declared_bytes = entry.size.parse::<u64>().map_err(|_| {
                            AppError::publish_failed(format!(
                                "attachment {:?} has an invalid byte count",
                                entry.name
                            ))
                        })?;
                        if declared_bytes > MAX_OBJECT_BYTES {
                            return Err(AppError::publish_failed(format!(
                                "attachment {:?} exceeds the 1 GiB per-file limit",
                                entry.name
                            )));
                        }
                        let root = match &canonical_root {
                            Some(root) => root,
                            None => {
                                canonical_root.insert(canonical_attachment_root(attachment_root)?)
                            }
                        };
                        let local_path = resolve_attachment_path(root, &path)?;
                        let actual_bytes = local_path
                            .metadata()
                            .map_err(|error| attachment_io_error(&path, error))?
                            .len();
                        if actual_bytes != declared_bytes {
                            return Err(AppError::publish_failed(format!(
                                "attachment {path:?} is {actual_bytes} bytes but its File entry declares {declared_bytes} bytes"
                            )));
                        }
                        if let Some((bytes, media_type)) = by_path.get(&path)
                            && (*bytes != actual_bytes || *media_type != entry.media_type)
                        {
                            return Err(AppError::publish_failed(format!(
                                "attachment {path:?} is referenced with conflicting metadata"
                            )));
                        }
                        by_path.insert(path.clone(), (actual_bytes, entry.media_type.clone()));
                        let attachment = LocalAttachment {
                            reference: LocalAttachmentReference::EidosFileEntry(entry.id.clone()),
                            uri,
                            path,
                            local_path,
                            name: entry.name,
                            media_type: entry.media_type,
                            bytes: actual_bytes,
                        };
                        if let Some(previous) = by_entry_id.get(&entry.id)
                            && previous != &attachment
                        {
                            return Err(AppError::publish_failed(format!(
                                "File entry {} is reused with conflicting attachment metadata",
                                entry.id
                            )));
                        }
                        by_entry_id.insert(entry.id, attachment);
                        if by_entry_id.len() > MAX_ASSET_REFERENCES {
                            return Err(AppError::publish_failed(
                                "published File contains more than 50,000 local attachment references",
                            ));
                        }
                    }
                }
            }
            offset = offset.checked_add(page_len).ok_or_else(|| {
                AppError::publish_failed("attachment scan exceeds supported row count")
            })?;
            if page_len < 500 {
                break;
            }
        }
    }

    let attachments = by_entry_id.into_values().collect::<Vec<_>>();
    let unique_paths = attachments
        .iter()
        .map(|attachment| attachment.path.as_str())
        .collect::<std::collections::HashSet<_>>()
        .len();
    progress.stage(format!(
        "found {} local attachment reference{} ({} unique file{})",
        attachments.len(),
        if attachments.len() == 1 { "" } else { "s" },
        unique_paths,
        if unique_paths == 1 { "" } else { "s" }
    ));
    Ok(attachments)
}

pub(crate) fn discover_markdown_attachments(
    source_path: &Path,
    attachment_root: &Path,
    progress: PublishProgress,
) -> Result<Vec<LocalAttachment>> {
    progress.stage("scanning Markdown links for local attachments");
    let source_bytes = fs::metadata(source_path)
        .map_err(|error| AppError::publish_failed(error.to_string()))?
        .len();
    if source_bytes > MAX_MARKDOWN_BYTES {
        return Err(AppError::publish_failed(
            "Markdown document exceeds the 16 MiB rendering limit",
        ));
    }
    let markdown = fs::read_to_string(source_path).map_err(|error| {
        AppError::publish_failed(format!("cannot read Markdown document as UTF-8: {error}"))
    })?;
    let root = canonical_attachment_root(attachment_root)?;
    let mut attachments = BTreeMap::<String, LocalAttachment>::new();
    let options =
        Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS;
    for event in Parser::new_ext(&markdown, options) {
        let destination = match event {
            Event::Start(Tag::Link { dest_url, .. })
            | Event::Start(Tag::Image { dest_url, .. }) => dest_url,
            _ => continue,
        };
        let Some((uri, path)) = markdown_local_uri(destination.as_ref())? else {
            continue;
        };
        if path == MARKDOWN_ENTRYPOINT {
            return Err(AppError::publish_failed(format!(
                "Markdown attachment URI {uri:?} conflicts with the published entrypoint"
            )));
        }
        let local_path = resolve_attachment_path(&root, &path)?;
        let bytes = local_path
            .metadata()
            .map_err(|error| attachment_io_error(&path, error))?
            .len();
        if bytes > MAX_OBJECT_BYTES {
            return Err(AppError::publish_failed(format!(
                "attachment {path:?} exceeds the 1 GiB per-file limit"
            )));
        }
        let media_type = mime_guess::from_path(&local_path)
            .first_or_octet_stream()
            .essence_str()
            .to_string();
        let name = local_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("attachment")
            .to_string();
        attachments.insert(
            uri.clone(),
            LocalAttachment {
                reference: LocalAttachmentReference::MarkdownLink,
                uri,
                path,
                local_path,
                name,
                media_type,
                bytes,
            },
        );
        if attachments.len() > MAX_ASSET_REFERENCES {
            return Err(AppError::publish_failed(
                "Markdown document contains more than 50,000 local attachment links",
            ));
        }
    }
    let attachments = attachments.into_values().collect::<Vec<_>>();
    progress.stage(format!(
        "found {} local Markdown attachment{}",
        attachments.len(),
        if attachments.len() == 1 { "" } else { "s" }
    ));
    Ok(attachments)
}

fn markdown_local_uri(value: &str) -> Result<Option<(String, String)>> {
    if value.starts_with('#')
        || value
            .get(..8)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case("https://"))
        || value
            .get(..7)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case("mailto:"))
        || value
            .get(..5)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case("data:"))
    {
        return Ok(None);
    }
    if value.starts_with('/')
        || value.starts_with("//")
        || value.contains('?')
        || value.contains('#')
    {
        return Err(AppError::publish_failed(format!(
            "Markdown local URL {value:?} must be a relative path without query or fragment"
        )));
    }
    if Url::parse(value).is_ok() {
        return Err(AppError::publish_failed(format!(
            "Markdown URL {value:?} uses an unsupported scheme"
        )));
    }
    normalize_relative_file_uri(value)
        .map(Some)
        .ok_or_else(|| AppError::publish_failed(format!("invalid Markdown local URL {value:?}")))
}

fn canonical_attachment_root(root: &Path) -> Result<PathBuf> {
    let canonical = fs::canonicalize(root).map_err(|error| {
        AppError::publish_failed(format!(
            "cannot open attachment root {}: {error}",
            root.display()
        ))
    })?;
    if !canonical.is_dir() {
        return Err(AppError::publish_failed(format!(
            "attachment root {} is not a directory",
            root.display()
        )));
    }
    Ok(canonical)
}

fn resolve_attachment_path(root: &Path, relative: &str) -> Result<PathBuf> {
    let mut resolved = root.to_path_buf();
    for component in Path::new(relative).components() {
        let Component::Normal(component) = component else {
            return Err(AppError::publish_failed(format!(
                "attachment path {relative:?} is not contained"
            )));
        };
        resolved.push(component);
        let metadata = fs::symlink_metadata(&resolved)
            .map_err(|error| attachment_io_error(relative, error))?;
        if metadata.file_type().is_symlink() {
            return Err(AppError::publish_failed(format!(
                "attachment path {relative:?} contains a symbolic link"
            )));
        }
    }
    if !resolved.is_file() {
        return Err(AppError::publish_failed(format!(
            "attachment path {relative:?} is not a regular file"
        )));
    }
    Ok(resolved)
}

fn attachment_io_error(path: &str, error: io::Error) -> AppError {
    AppError::publish_failed(format!("cannot read attachment {path:?}: {error}"))
}

pub(crate) fn build_form_definition(conn: &Connection, selector: &str) -> Result<Vec<u8>> {
    let file = load_file_meta(conn)?;
    let views = load_views(conn)?;
    let candidates = views
        .iter()
        .filter(|view| view.id == selector || view.name == selector)
        .collect::<Vec<_>>();
    let view = match candidates.as_slice() {
        [view] => *view,
        [] => {
            return Err(AppError::invalid_request(format!(
                "Form View not found: {selector:?}"
            )));
        }
        _ => {
            return Err(AppError::invalid_request(format!(
                "Form View name {selector:?} is ambiguous; use its stable View ID"
            )));
        }
    };
    if view.view_type != "form" {
        return Err(AppError::invalid_request(format!(
            "View {selector:?} has type {:?}, expected form",
            view.view_type
        )));
    }
    let table = load_tables(conn)?
        .into_iter()
        .find(|table| table.id == view.table_id)
        .ok_or_else(|| AppError::publish_failed("Form View table is unavailable"))?;
    let layout = json_object(&view.layout_json, "Form View layout")?;
    let hidden = layout
        .get("hiddenFields")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect::<std::collections::HashSet<_>>();
    let order = layout
        .get("fieldOrder")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .enumerate()
        .map(|(index, field_id)| (field_id, index))
        .collect::<HashMap<_, _>>();
    let configured_fields = layout
        .get("fields")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_object)
        .filter_map(|item| {
            item.get("fieldId")
                .and_then(Value::as_str)
                .map(|field_id| (field_id, item))
        })
        .collect::<HashMap<_, _>>();
    let mut fields = load_fields(conn)?
        .into_iter()
        .filter(|field| {
            field.table_id == table.id
                && field.system_role.is_none()
                && field.physical_name.is_some()
                && !hidden.contains(field.id.as_str())
                && form_field_type(field).is_some()
        })
        .collect::<Vec<_>>();
    fields.sort_by(|left, right| {
        order
            .get(left.id.as_str())
            .copied()
            .unwrap_or(usize::MAX)
            .cmp(&order.get(right.id.as_str()).copied().unwrap_or(usize::MAX))
            .then(left.position.cmp(&right.position))
            .then(left.id.cmp(&right.id))
    });
    if fields.is_empty() || fields.len() > 100 {
        return Err(AppError::invalid_request(
            "Form View must contain 1 to 100 writable fields",
        ));
    }

    let schema_fields = fields
        .iter()
        .map(|field| {
            Ok(json!({
                "fieldId": field.id,
                "type": form_field_type(field).expect("eligible Form field"),
                "nullable": field.nullable,
                "constraints": form_field_constraints(field)?,
            }))
        })
        .collect::<Result<Vec<_>>>()?;
    let schema_fingerprint = sha256_json(&json!({
        "fileId": file.file_id,
        "tableId": table.id,
        "viewId": view.id,
        "fields": schema_fields,
    }))?;
    let published_fields = fields
        .iter()
        .map(|field| {
            let configured = configured_fields.get(field.id.as_str()).copied();
            let field_type = form_field_type(field).expect("eligible Form field");
            let label = configured
                .and_then(|item| trimmed_member(item, "label"))
                .unwrap_or_else(|| field.name.trim().to_string());
            let description = configured.and_then(|item| trimmed_member(item, "description"));
            let placeholder = configured.and_then(|item| trimmed_member(item, "placeholder"));
            let multiline = field_type == "text"
                && configured
                    .and_then(|item| item.get("multiline"))
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
            let required = form_field_required_by_schema(field)
                || configured
                    .and_then(|item| item.get("required"))
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
            Ok(json!({
                "fieldId": field.id,
                "inputKey": form_input_key(&file.file_id, &view.id, &field.id),
                "type": field_type,
                "label": label,
                "description": description,
                "placeholder": placeholder,
                "multiline": multiline,
                "required": required,
                "nullable": field.nullable,
                "constraints": form_field_constraints(field)?,
            }))
        })
        .collect::<Result<Vec<_>>>()?;
    let title = trimmed_member(&layout, "title").unwrap_or_else(|| view.name.trim().to_string());
    let definition = json!({
        "spec": "eidos.publish/form-definition@1",
        "source": {
            "fileId": file.file_id,
            "tableId": table.id,
            "viewId": view.id,
            "schemaRevision": file.revision.to_string(),
            "schemaFingerprint": schema_fingerprint,
        },
        "presentation": {
            "title": title,
            "description": trimmed_member(&layout, "description"),
            "submitLabel": trimmed_member(&layout, "submitLabel").unwrap_or_else(|| "Submit".into()),
            "successMessage": trimmed_member(&layout, "successMessage").unwrap_or_else(|| "Response recorded.".into()),
        },
        "fields": published_fields,
    });
    let bytes = serde_json::to_vec(&definition)
        .map_err(|error| AppError::publish_failed(error.to_string()))?;
    if bytes.len() > MAX_FORM_BYTES as usize {
        return Err(AppError::invalid_request(
            "generated Form definition exceeds the 256 KiB limit",
        ));
    }
    Ok(bytes)
}

fn json_object(value: &str, name: &str) -> Result<serde_json::Map<String, Value>> {
    serde_json::from_str::<Value>(value)
        .map_err(|error| AppError::publish_failed(format!("invalid {name}: {error}")))?
        .as_object()
        .cloned()
        .ok_or_else(|| AppError::publish_failed(format!("{name} must be a JSON object")))
}

fn trimmed_member(value: &serde_json::Map<String, Value>, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn form_field_type(field: &FieldMeta) -> Option<&'static str> {
    let settings = serde_json::from_str::<Value>(&field.settings_json).ok();
    let rating = field.field_type == FieldType::Integer
        && (settings.as_ref().and_then(|value| value.get("control"))
            == Some(&Value::String("rating".into()))
            || settings
                .as_ref()
                .and_then(|value| value.pointer("/display/kind"))
                == Some(&Value::String("rating".into())));
    if rating {
        return Some("rating");
    }
    match field.field_type {
        FieldType::Integer => Some("integer"),
        FieldType::Text => Some("text"),
        FieldType::Number => Some("number"),
        FieldType::Checkbox => Some("checkbox"),
        FieldType::Date => Some("date"),
        FieldType::Datetime => Some("datetime"),
        FieldType::File => Some("file"),
        FieldType::MultiSelect => Some("multi-select"),
        FieldType::Select => Some("select"),
        FieldType::Url => Some("url"),
        FieldType::Json | FieldType::Relation | FieldType::Formula | FieldType::Lookup => None,
    }
}

fn form_field_required_by_schema(field: &FieldMeta) -> bool {
    !field.nullable && !matches!(form_field_type(field), Some("file" | "multi-select"))
}

fn form_field_constraints(field: &FieldMeta) -> Result<Value> {
    let settings = json_object(&field.settings_json, "Field settings")?;
    let field_type = form_field_type(field).expect("eligible Form field");
    if field_type == "select" || field_type == "multi-select" {
        let options = settings
            .get("options")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(|option| {
                let name = option
                    .get("name")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .ok_or_else(|| AppError::publish_failed("Select option is missing its name"))?;
                let color = option
                    .get("color")
                    .and_then(Value::as_str)
                    .unwrap_or("default");
                Ok(json!({ "name": name, "color": color }))
            })
            .collect::<Result<Vec<_>>>()?;
        return Ok(json!({ "options": options }));
    }
    Ok(match field_type {
        "text" => json!({ "maxBytes": 65_536 }),
        "rating" => json!({ "min": 1, "max": 5 }),
        "file" => json!({ "multiple": true }),
        _ => json!({}),
    })
}

fn form_input_key(file_id: &str, view_id: &str, field_id: &str) -> String {
    let mut digest = Sha256::new();
    for value in ["eidos-form-input-v1", file_id, view_id, field_id] {
        digest.update(value.as_bytes());
        digest.update([0]);
    }
    URL_SAFE_NO_PAD.encode(&digest.finalize()[..18])
}

fn sha256_json(value: &Value) -> Result<String> {
    let bytes =
        serde_json::to_vec(value).map_err(|error| AppError::publish_failed(error.to_string()))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn source_manifest_sha256(manifest: &Value) -> Result<String> {
    let canonical = eidos_file_core::jcs::to_jcs(manifest)
        .map_err(|error| AppError::publish_failed(error.to_string()))?;
    Ok(format!("{:x}", Sha256::digest(canonical.as_bytes())))
}

fn version_matches_source(
    version: &Value,
    source_kind: PublishSourceKind,
    manifest_sha256: &str,
) -> bool {
    version.get("state").and_then(Value::as_str) == Some("ready")
        && version.get("targetHealth").and_then(Value::as_str) == Some("healthy")
        && version.get("sourceManifestSha256").and_then(Value::as_str) == Some(manifest_sha256)
        && version.get("driverId").and_then(Value::as_str) == Some(source_kind.driver_id())
        && version.get("driverVersion").and_then(Value::as_str) == Some(DRIVER_VERSION)
}

fn reusable_current_version(
    client: &Client,
    origin: &Url,
    authorization: &HeaderValue,
    publication: &Value,
    slug: &str,
    source_kind: PublishSourceKind,
    manifest_sha256: &str,
) -> Result<Option<(String, Value)>> {
    let Some(version_id) = publication.get("currentVersionId").and_then(Value::as_str) else {
        return Ok(None);
    };
    let version = send_json(
        client
            .get(endpoint(
                origin,
                &format!("/api/publications/{slug}/versions/{version_id}"),
            )?)
            .header(AUTHORIZATION, authorization.clone()),
    )?;
    Ok(
        version_matches_source(&version, source_kind, manifest_sha256)
            .then(|| (version_id.to_string(), version)),
    )
}

pub fn run(
    args: PublishArgs,
    source_kind: PublishSourceKind,
    attachments: Vec<LocalAttachment>,
    generated_source: Option<Vec<u8>>,
    progress: PublishProgress,
) -> Result<Value> {
    validate_slug(&args.slug)?;
    if source_kind != PublishSourceKind::Form
        && (args.form_respondents.is_some() || args.one_response_per_user)
    {
        return Err(AppError::invalid_request(
            "Form response options can be used only for a published Form",
        ));
    }
    if source_kind == PublishSourceKind::Form
        && args.one_response_per_user
        && args.form_respondents.map(|value| value.as_str()) != Some("signed_in")
    {
        return Err(AppError::invalid_request(
            "--one-response-per-user requires --form-respondents signed-in",
        ));
    }
    let access_change = requested_access_change(&args)?;
    if args.wait_seconds == 0 || args.wait_seconds > 3_600 {
        return Err(AppError::invalid_request(
            "--wait-seconds must be between 1 and 3600",
        ));
    }
    let origin = publish_origin(&args.publish_origin)?;
    let client = Client::builder()
        .timeout(Duration::from_secs(args.wait_seconds.max(60)))
        .build()
        .map_err(|error| AppError::publish_failed(error.to_string()))?;
    let authorization = HeaderValue::from_str(&format!("Bearer {}", args.token))
        .map_err(|_| AppError::invalid_request("Publish token is invalid"))?;

    progress.stage("checking Publish account");
    let tenant = send_json(
        client
            .get(endpoint(&origin, "/api/tenant")?)
            .header(AUTHORIZATION, authorization.clone()),
    )?;
    let canonical_host = string_member(&tenant, "canonicalHost")?;
    let source_limit = source_limit(&tenant, source_kind)?;
    let declared_source_bytes = match generated_source.as_ref() {
        Some(bytes) => u64::try_from(bytes.len())
            .map_err(|error| AppError::publish_failed(error.to_string()))?,
        None => fs::metadata(&args.file)
            .map_err(|error| AppError::publish_failed(error.to_string()))?
            .len(),
    };
    if declared_source_bytes > source_limit {
        return Err(source_limit_error(
            source_kind,
            declared_source_bytes,
            source_limit,
        ));
    }

    let (source_bytes, source_sha256, source_object) = match generated_source {
        Some(bytes) => {
            let source_bytes = u64::try_from(bytes.len())
                .map_err(|error| AppError::publish_failed(error.to_string()))?;
            progress.stage(format!(
                "hashing Form definition ({})",
                human_bytes(source_bytes)
            ));
            let source_sha256 = format!("{:x}", Sha256::digest(&bytes));
            let mut last_percent = None;
            progress.update_bytes(
                "hashing Form definition",
                source_bytes,
                source_bytes,
                &mut last_percent,
            );
            (
                source_bytes,
                source_sha256,
                SourceObjectSource::Memory(bytes),
            )
        }
        None => {
            let mut source = File::open(&args.file)?;
            let source_bytes = source
                .metadata()
                .map_err(|error| AppError::publish_failed(error.to_string()))?
                .len();
            progress.stage(format!("hashing source ({})", human_bytes(source_bytes)));
            let source_sha256 = file_sha256(&mut source, source_bytes, progress, "hashing source")?;
            (
                source_bytes,
                source_sha256,
                SourceObjectSource::File(args.file.clone()),
            )
        }
    };
    let sqlite_delta =
        prepare_sqlite_page_delta(&args, source_kind, source_bytes, &source_sha256, progress)?;
    let mut objects = vec![SourceObject {
        path: source_kind.entrypoint().to_string(),
        role: "entrypoint",
        media_type: source_kind.media_type().to_string(),
        bytes: source_bytes,
        sha256: source_sha256.clone(),
        source: source_object,
    }];
    let unique_attachments = attachments
        .iter()
        .map(|attachment| (attachment.path.clone(), attachment))
        .collect::<BTreeMap<_, _>>();
    for (index, (path, attachment)) in unique_attachments.iter().enumerate() {
        progress.stage(format!(
            "hashing attachment {}/{}: {} ({})",
            index + 1,
            unique_attachments.len(),
            path,
            human_bytes(attachment.bytes)
        ));
        let mut file =
            File::open(&attachment.local_path).map_err(|error| attachment_io_error(path, error))?;
        let sha256 = file_sha256(
            &mut file,
            attachment.bytes,
            progress,
            &format!(
                "hashing attachment {}/{}",
                index + 1,
                unique_attachments.len()
            ),
        )?;
        objects.push(SourceObject {
            path: path.clone(),
            role: "attachment",
            media_type: attachment.media_type.clone(),
            bytes: attachment.bytes,
            sha256,
            source: SourceObjectSource::File(attachment.local_path.clone()),
        });
    }
    objects.sort_by(|left, right| left.path.as_bytes().cmp(right.path.as_bytes()));
    let logical_bytes = objects.iter().map(|object| object.bytes).sum::<u64>();
    let mut upload_sources = BTreeMap::<String, SourceObject>::new();
    for object in &objects {
        upload_sources
            .entry(object.sha256.clone())
            .or_insert_with(|| object.clone());
    }
    let upload_bytes = upload_sources
        .values()
        .map(|object| object.bytes)
        .sum::<u64>();
    if logical_bytes > upload_bytes {
        progress.stage(format!(
            "content deduplication saves {} in this bundle",
            human_bytes(logical_bytes - upload_bytes)
        ));
    }

    progress.stage(format!("ensuring publication /{}", args.slug));
    let initial_visibility = match &access_change {
        PublicationAccessChange::Private => "private",
        PublicationAccessChange::Password(_) | PublicationAccessChange::Public => "public",
        PublicationAccessChange::Unchanged => args.visibility.as_str(),
    };
    let mut publication = send_json(
        client
            .put(endpoint(
                &origin,
                &format!("/api/publications/{}", args.slug),
            )?)
            .header(AUTHORIZATION, authorization.clone())
            .header(
                "Idempotency-Key",
                idempotency_key(&["publication", &args.slug, initial_visibility]),
            )
            .json(&json!({ "visibility": initial_visibility })),
    )?;

    match &access_change {
        PublicationAccessChange::Unchanged => {}
        PublicationAccessChange::Password(password) => {
            progress.stage("configuring password access");
            publication = send_json(
                client
                    .put(endpoint(
                        &origin,
                        &format!("/api/publications/{}/access", args.slug),
                    )?)
                    .header(AUTHORIZATION, authorization.clone())
                    .header("Idempotency-Key", random_idempotency_key("password-access"))
                    .json(&json!({ "mode": "password", "password": password })),
            )?;
        }
        PublicationAccessChange::Public => {
            progress.stage("removing password access");
            publication = send_json(
                client
                    .put(endpoint(
                        &origin,
                        &format!("/api/publications/{}/access", args.slug),
                    )?)
                    .header(AUTHORIZATION, authorization.clone())
                    .header("Idempotency-Key", random_idempotency_key("public-access"))
                    .json(&json!({ "mode": "public" })),
            )?;
        }
        PublicationAccessChange::Private => {
            progress.stage("configuring private access");
            publication = send_json(
                client
                    .put(endpoint(
                        &origin,
                        &format!("/api/publications/{}/access", args.slug),
                    )?)
                    .header(AUTHORIZATION, authorization.clone())
                    .header("Idempotency-Key", random_idempotency_key("private-access"))
                    .json(&json!({ "mode": "private" })),
            )?;
        }
    }
    if args.hide_branding || args.show_branding {
        let show_branding = args.show_branding;
        progress.stage(if show_branding {
            "showing Eidos branding"
        } else {
            "hiding Eidos branding"
        });
        publication = send_json(
            client
                .put(endpoint(
                    &origin,
                    &format!("/api/publications/{}/branding", args.slug),
                )?)
                .header(AUTHORIZATION, authorization.clone())
                .header("Idempotency-Key", random_idempotency_key("branding"))
                .json(&json!({ "showBranding": show_branding })),
        )?;
    }
    let access_mode = publication
        .get("accessMode")
        .and_then(Value::as_str)
        .unwrap_or(initial_visibility)
        .to_string();
    let visibility = publication
        .get("visibility")
        .and_then(Value::as_str)
        .unwrap_or(initial_visibility)
        .to_string();
    let show_branding = publication
        .get("showBranding")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let publication_id = string_member(&publication, "publicationId")?.to_string();
    drop(access_change);
    let form_policy = if source_kind == PublishSourceKind::Form {
        let respondent_access = args
            .form_respondents
            .map(|value| value.as_str())
            .unwrap_or("anyone");
        let allow_multiple_responses = !args.one_response_per_user;
        progress.stage("configuring Form response access");
        Some(send_json(
            client
                .put(endpoint(
                    &origin,
                    &format!("/api/publications/{}/form-policy", args.slug),
                )?)
                .header(AUTHORIZATION, authorization.clone())
                .header("Idempotency-Key", random_idempotency_key("form-policy"))
                .json(&json!({
                    "respondentAccess": respondent_access,
                    "allowMultipleResponses": allow_multiple_responses,
                })),
        )?)
    } else {
        None
    };

    let manifest_files = objects
        .iter()
        .map(|object| {
            json!({
                "path": object.path,
                "role": object.role,
                "mediaType": object.media_type,
                "bytes": object.bytes.to_string(),
                "sha256": object.sha256,
            })
        })
        .collect::<Vec<_>>();
    let asset_references = attachments
        .iter()
        .map(|attachment| {
            let object = objects
                .iter()
                .find(|object| object.path == attachment.path)
                .expect("attachment object was prepared");
            match &attachment.reference {
                LocalAttachmentReference::EidosFileEntry(entry_id) => json!({
                    "kind": "eidos-file-entry",
                    "entryId": entry_id,
                    "uri": attachment.uri,
                    "fileSha256": object.sha256,
                }),
                LocalAttachmentReference::MarkdownLink => json!({
                    "kind": "markdown-link",
                    "uri": attachment.uri,
                    "fileSha256": object.sha256,
                }),
            }
        })
        .collect::<Vec<_>>();
    let manifest = json!({
        "spec": "eidos.publish/source-bundle@1",
        "mediaType": source_kind.media_type(),
        "entrypoint": source_kind.entrypoint(),
        "files": manifest_files,
        "assetReferences": asset_references,
    });
    let manifest_sha256 = source_manifest_sha256(&manifest)?;
    let attachment_paths = unique_attachments.keys().cloned().collect::<Vec<_>>();
    let publish_result = |version_id: &str, ready: &Value, version_created: bool| {
        json!({
            "published": !args.no_activate,
            "ready": true,
            "versionCreated": version_created,
            "fingerprintSpec": "eidos.publish/source-bundle@1",
            "publishFingerprint": manifest_sha256,
            "publicationSlug": args.slug,
            "publicationId": publication_id,
            "visibility": visibility,
            "accessMode": access_mode,
            "showBranding": show_branding,
            "formPolicy": form_policy.clone(),
            "versionId": version_id,
            "sourceBytes": source_bytes.to_string(),
            "sourceSha256": source_sha256,
            "mediaType": source_kind.media_type(),
            "driverId": source_kind.driver_id(),
            "attachmentFiles": unique_attachments.len(),
            "attachmentReferences": attachments.len(),
            "attachmentPaths": attachment_paths,
            "attachmentBytes": (logical_bytes - source_bytes).to_string(),
            "bundleBytes": logical_bytes.to_string(),
            "deduplicatedBytes": (logical_bytes - upload_bytes).to_string(),
            "servingTargetSha256": ready.get("servingTargetSha256"),
            "url": format!("https://{canonical_host}/{}", args.slug),
        })
    };
    if !args.no_activate
        && let Some((version_id, ready)) = reusable_current_version(
            &client,
            &origin,
            &authorization,
            &publication,
            &args.slug,
            source_kind,
            &manifest_sha256,
        )?
    {
        progress.stage("content unchanged; current Version reused");
        progress.stage("publish complete; current Version remains active");
        return Ok(publish_result(&version_id, &ready, false));
    }
    progress.stage("creating immutable Version");
    let version = send_json(
        client
            .post(endpoint(
                &origin,
                &format!("/api/publications/{}/versions", args.slug),
            )?)
            .header(AUTHORIZATION, authorization.clone())
            .header("Idempotency-Key", random_idempotency_key("version"))
            .json(&json!({
                "driver": { "id": source_kind.driver_id(), "version": DRIVER_VERSION },
                "manifest": manifest,
                "activate": !args.no_activate,
            })),
    )?;
    let version_id = string_member(&version, "versionId")?;
    progress.stage(format!("Version {version_id} created"));
    let upload_plan = version
        .get("uploadPlan")
        .and_then(Value::as_array)
        .ok_or_else(|| AppError::publish_failed("service response is missing uploadPlan"))?;
    let pending_count = upload_plan
        .iter()
        .filter(|item| item.get("state").and_then(Value::as_str) == Some("pending"))
        .count();
    let pending_bytes = upload_plan.iter().try_fold(0_u64, |total, item| {
        if item.get("state").and_then(Value::as_str) == Some("pending") {
            total
                .checked_add(decimal_member(item, "bytes")?)
                .ok_or_else(|| {
                    AppError::publish_failed("upload plan byte count exceeds supported size")
                })
        } else {
            Ok(total)
        }
    })?;
    let mut pending_index = 0_usize;
    let mut uploaded_bytes = 0_u64;
    for item in upload_plan {
        let sha256 = string_member(item, "sha256")?;
        let bytes = decimal_member(item, "bytes")?;
        let state = string_member(item, "state")?;
        let object = upload_sources.get(sha256).ok_or_else(|| {
            AppError::publish_failed("upload plan contains an unknown content object")
        })?;
        if bytes != object.bytes {
            return Err(AppError::publish_failed(
                "upload plan byte count differs from the local object",
            ));
        }
        if state == "ready" {
            progress.stage(format!("reusing uploaded content {}", short_digest(sha256)));
            continue;
        }
        if state != "pending" {
            return Err(AppError::publish_failed(format!(
                "upload plan contains unsupported object state {state:?}"
            )));
        }
        pending_index += 1;
        progress.stage(format!(
            "uploading object {pending_index}/{pending_count}: {} ({})",
            object.path,
            human_bytes(object.bytes)
        ));
        let uploaded = if object.role == "entrypoint" {
            if let Some(delta) = sqlite_delta.as_ref() {
                progress.stage(format!(
                    "uploading {} Graft delta instead of {} source",
                    human_bytes(delta.bytes),
                    human_bytes(object.bytes)
                ));
                match upload_sqlite_delta(
                    &client,
                    &origin,
                    &authorization,
                    &args.slug,
                    version_id,
                    object,
                    delta,
                    progress,
                ) {
                    Ok(value) => value,
                    Err(_) => {
                        progress.stage("Graft delta unavailable; uploading the complete source");
                        upload_object(
                            &client,
                            &origin,
                            &authorization,
                            &args.slug,
                            version_id,
                            object,
                            pending_index,
                            pending_count,
                            uploaded_bytes,
                            pending_bytes,
                            progress,
                        )?
                    }
                }
            } else {
                upload_object(
                    &client,
                    &origin,
                    &authorization,
                    &args.slug,
                    version_id,
                    object,
                    pending_index,
                    pending_count,
                    uploaded_bytes,
                    pending_bytes,
                    progress,
                )?
            }
        } else {
            upload_object(
                &client,
                &origin,
                &authorization,
                &args.slug,
                version_id,
                object,
                pending_index,
                pending_count,
                uploaded_bytes,
                pending_bytes,
                progress,
            )?
        };
        if uploaded.get("state").and_then(Value::as_str) != Some("ready") {
            return Err(AppError::publish_failed(
                "Publish service did not accept a content object",
            ));
        }
        uploaded_bytes += object.bytes;
    }
    progress.stage("finalizing immutable Version");
    let uploaded = send_json(
        client
            .post(endpoint(
                &origin,
                &format!(
                    "/api/publications/{}/versions/{version_id}/complete",
                    args.slug
                ),
            )?)
            .header(AUTHORIZATION, authorization.clone())
            .header(
                "Idempotency-Key",
                idempotency_key(&["version-complete", &args.slug, version_id]),
            ),
    )?;
    if uploaded.get("state").and_then(Value::as_str) != Some("uploaded") {
        return Err(AppError::publish_failed(
            "Publish service did not finalize the immutable Version",
        ));
    }
    progress.stage("all source objects accepted");

    let deadline = Instant::now() + Duration::from_secs(args.wait_seconds);
    let wait_started = Instant::now();
    let mut last_state: Option<String> = None;
    let mut activation_announced = false;
    let ready = loop {
        let status = send_json(
            client
                .get(endpoint(
                    &origin,
                    &format!("/api/publications/{}/versions/{version_id}", args.slug),
                )?)
                .header(AUTHORIZATION, authorization.clone()),
        )?;
        let state = status.get("state").and_then(Value::as_str);
        if state.is_some_and(|value| last_state.as_deref() != Some(value)) {
            let value = state.expect("state is present");
            progress.stage(format!(
                "Version {value} ({}s elapsed)",
                wait_started.elapsed().as_secs()
            ));
            last_state = Some(value.to_string());
        }
        match state {
            Some("ready") => {
                if args.no_activate
                    || publication_is_active(
                        &client,
                        &origin,
                        &authorization,
                        &args.slug,
                        version_id,
                    )?
                {
                    break status;
                }
                if !activation_announced {
                    progress.stage("waiting for Version activation");
                    activation_announced = true;
                }
            }
            Some("failed") => {
                let code = status
                    .get("failureCode")
                    .and_then(Value::as_str)
                    .unwrap_or("publish_workflow_failed");
                return Err(AppError::publish_failed(format!(
                    "Version preparation failed: {code}"
                )));
            }
            Some("deleting" | "deleted") => {
                return Err(AppError::publish_failed(
                    "Version was deleted while Publish was waiting",
                ));
            }
            _ => {}
        }
        if Instant::now() >= deadline {
            return Err(AppError::publish_failed(format!(
                "timed out waiting for Version {version_id}; retry status without re-uploading"
            )));
        }
        thread::sleep(Duration::from_millis(1_000));
    };

    progress.stage(if args.no_activate {
        "publish complete; Version is ready but not activated"
    } else {
        "publish complete; Version is active"
    });

    Ok(publish_result(version_id, &ready, true))
}

fn prepare_sqlite_page_delta(
    args: &PublishArgs,
    source_kind: PublishSourceKind,
    source_bytes: u64,
    source_sha256: &str,
    progress: PublishProgress,
) -> Result<Option<SqlitePageDelta>> {
    let (Some(path), Some(base_sha256)) =
        (args.graft_delta.as_ref(), args.graft_base_sha256.as_deref())
    else {
        return Ok(None);
    };
    if source_kind != PublishSourceKind::Eidos {
        return Err(AppError::invalid_request(
            "Graft page deltas can be used only with an Eidos File",
        ));
    }
    if !lowercase_sha256(base_sha256) {
        return Err(AppError::invalid_request(
            "Graft delta base SHA-256 is invalid",
        ));
    }
    if base_sha256 == source_sha256 {
        progress.stage("Graft delta target matches its base; skipping it");
        return Ok(None);
    }
    let bytes = fs::metadata(path)
        .map_err(|error| AppError::publish_failed(error.to_string()))?
        .len();
    if bytes > MAX_SQLITE_DELTA_BYTES || bytes >= source_bytes {
        progress.stage("Graft delta is not smaller than the complete source; skipping it");
        return Ok(None);
    }
    let mut header = [0_u8; SQLITE_DELTA_HEADER_BYTES];
    let mut file = File::open(path)?;
    file.read_exact(&mut header)
        .map_err(|_| AppError::publish_failed("Graft SQLite page delta has an invalid header"))?;
    if &header[..8] != b"GRAFTD01" {
        return Err(AppError::publish_failed(
            "Graft SQLite page delta has an invalid format",
        ));
    }
    let header_bytes = u32::from_le_bytes(header[8..12].try_into().expect("four bytes"));
    let flags = u32::from_le_bytes(header[12..16].try_into().expect("four bytes"));
    let page_size = u32::from_le_bytes(header[16..20].try_into().expect("four bytes"));
    let changed_pages = u32::from_le_bytes(header[20..24].try_into().expect("four bytes"));
    let base_bytes = u64::from_le_bytes(header[24..32].try_into().expect("eight bytes"));
    let target_bytes = u64::from_le_bytes(header[32..40].try_into().expect("eight bytes"));
    let embedded_base_sha256 = header[40..72]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let embedded_target_sha256 = header[72..104]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let target_pages = target_bytes
        .checked_div(u64::from(page_size))
        .ok_or_else(|| AppError::publish_failed("Graft delta page size is invalid"))?;
    let expected_bytes = u64::from(header_bytes)
        .checked_add(
            u64::from(changed_pages)
                .checked_mul(u64::from(page_size) + 4)
                .ok_or_else(|| AppError::publish_failed("Graft delta size is invalid"))?,
        )
        .ok_or_else(|| AppError::publish_failed("Graft delta size is invalid"))?;
    if header_bytes != SQLITE_DELTA_HEADER_BYTES as u32
        || flags != 0
        || page_size != 4096
        || base_bytes == 0
        || target_bytes == 0
        || base_bytes % u64::from(page_size) != 0
        || target_bytes % u64::from(page_size) != 0
        || u64::from(changed_pages) > target_pages
        || target_bytes != source_bytes
        || embedded_base_sha256 != base_sha256
        || embedded_target_sha256 != source_sha256
        || expected_bytes != bytes
    {
        return Err(AppError::publish_failed(
            "Graft SQLite page delta does not match the source snapshot",
        ));
    }
    file.seek(SeekFrom::Start(0))?;
    progress.stage(format!("hashing Graft delta ({})", human_bytes(bytes)));
    let sha256 = file_sha256(&mut file, bytes, progress, "hashing Graft delta")?;
    Ok(Some(SqlitePageDelta {
        path: path.clone(),
        bytes,
        sha256,
        base_sha256: base_sha256.to_string(),
    }))
}

fn lowercase_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

#[allow(clippy::too_many_arguments)]
fn upload_sqlite_delta(
    client: &Client,
    origin: &Url,
    authorization: &HeaderValue,
    slug: &str,
    version_id: &str,
    object: &SourceObject,
    delta: &SqlitePageDelta,
    progress: PublishProgress,
) -> Result<Value> {
    let source = File::open(&delta.path)?;
    let body = ProgressReader::with_offset(
        source,
        progress,
        "uploading Graft delta".to_string(),
        0,
        delta.bytes,
    );
    send_json(
        client
            .put(endpoint(
                origin,
                &format!(
                    "/api/publications/{slug}/versions/{version_id}/objects/{}",
                    object.sha256
                ),
            )?)
            .header(AUTHORIZATION, authorization.clone())
            .header(
                "Idempotency-Key",
                idempotency_key(&[
                    "graft-delta",
                    slug,
                    version_id,
                    &object.sha256,
                    &delta.base_sha256,
                    &delta.sha256,
                ]),
            )
            .header(CONTENT_TYPE, "application/vnd.eidos.sqlite-page-delta")
            .header(CONTENT_LENGTH, delta.bytes)
            .header("X-Eidos-Content-SHA256", &object.sha256)
            .header("X-Eidos-Target-Content-Bytes", object.bytes)
            .header("X-Eidos-Base-Content-SHA256", &delta.base_sha256)
            .header("X-Eidos-Delta-SHA256", &delta.sha256)
            .body(Body::new(body)),
    )
}

#[allow(clippy::too_many_arguments)]
fn upload_object(
    client: &Client,
    origin: &Url,
    authorization: &HeaderValue,
    slug: &str,
    version_id: &str,
    object: &SourceObject,
    object_index: usize,
    object_count: usize,
    uploaded_before: u64,
    upload_total: u64,
    progress: PublishProgress,
) -> Result<Value> {
    let current_bytes = object.source.current_bytes()?;
    if current_bytes != object.bytes {
        return Err(AppError::publish_failed(format!(
            "source object {:?} changed size after hashing",
            object.path
        )));
    }
    if object.bytes <= SINGLE_UPLOAD_MAX_BYTES {
        let source = object.source.open()?;
        upload_direct(
            client,
            origin,
            authorization,
            slug,
            version_id,
            source,
            object,
            object_index,
            object_count,
            uploaded_before,
            upload_total,
            progress,
        )
    } else {
        let mut file = object.source.file()?;
        upload_multipart(
            client,
            origin,
            authorization,
            slug,
            version_id,
            &mut file,
            object,
            object_index,
            object_count,
            uploaded_before,
            upload_total,
            progress,
        )
    }
}

#[allow(clippy::too_many_arguments)]
fn upload_direct(
    client: &Client,
    origin: &Url,
    authorization: &HeaderValue,
    slug: &str,
    version_id: &str,
    source: SourceObjectReader,
    object: &SourceObject,
    object_index: usize,
    object_count: usize,
    uploaded_before: u64,
    upload_total: u64,
    progress: PublishProgress,
) -> Result<Value> {
    let body = ProgressReader::with_offset(
        source,
        progress,
        format!("uploading bundle (object {object_index}/{object_count})"),
        uploaded_before,
        upload_total,
    );
    send_json(
        client
            .put(endpoint(
                origin,
                &format!(
                    "/api/publications/{slug}/versions/{version_id}/objects/{}",
                    object.sha256
                ),
            )?)
            .header(AUTHORIZATION, authorization.clone())
            .header(
                "Idempotency-Key",
                idempotency_key(&["upload", slug, version_id, &object.sha256]),
            )
            .header(CONTENT_TYPE, &object.media_type)
            .header(CONTENT_LENGTH, object.bytes)
            .header("X-Eidos-Content-SHA256", &object.sha256)
            .body(Body::new(body)),
    )
}

#[allow(clippy::too_many_arguments)]
fn upload_multipart(
    client: &Client,
    origin: &Url,
    authorization: &HeaderValue,
    slug: &str,
    version_id: &str,
    source: &mut File,
    object: &SourceObject,
    object_index: usize,
    object_count: usize,
    uploaded_before: u64,
    upload_total: u64,
    progress: PublishProgress,
) -> Result<Value> {
    let initiated = send_json(
        client
            .post(endpoint(
                origin,
                &format!(
                    "/api/publications/{slug}/versions/{version_id}/objects/{}/multipart",
                    object.sha256
                ),
            )?)
            .header(AUTHORIZATION, authorization.clone())
            .header(
                "Idempotency-Key",
                idempotency_key(&["multipart-init", slug, version_id, &object.sha256]),
            ),
    )?;
    if initiated.get("state").and_then(Value::as_str) == Some("ready") {
        return Ok(initiated);
    }
    let session_id = string_member(&initiated, "sessionId")?;
    let total_parts = object.bytes.div_ceil(MULTIPART_PART_BYTES);
    let mut offset = 0_u64;
    let mut part_number = 1_u64;
    while offset < object.bytes {
        let part_bytes = (object.bytes - offset).min(MULTIPART_PART_BYTES);
        progress.stage(format!(
            "hashing object {object_index}/{object_count} part {part_number}/{total_parts} ({})",
            human_bytes(part_bytes)
        ));
        let part_sha256 = file_range_sha256(source, offset, part_bytes)?;
        let mut body_file = source
            .try_clone()
            .map_err(|error| AppError::publish_failed(error.to_string()))?;
        body_file
            .seek(SeekFrom::Start(offset))
            .map_err(|error| AppError::publish_failed(error.to_string()))?;
        let body = ProgressReader::with_offset(
            body_file.take(part_bytes),
            progress,
            format!(
                "uploading bundle (object {object_index}/{object_count}, part {part_number}/{total_parts})"
            ),
            uploaded_before + offset,
            upload_total,
        );
        let uploaded = send_json(
            client
                .put(endpoint(
                    origin,
                    &format!(
                        "/api/publications/{slug}/versions/{version_id}/multipart/{session_id}/parts/{part_number}"
                    ),
                )?)
                .header(AUTHORIZATION, authorization.clone())
                .header(
                    "Idempotency-Key",
                    idempotency_key(&[
                        "multipart-part",
                        slug,
                        version_id,
                        &object.sha256,
                        &part_number.to_string(),
                        &part_sha256,
                    ]),
                )
                .header(CONTENT_TYPE, "application/octet-stream")
                .header(CONTENT_LENGTH, part_bytes)
                .header("X-Eidos-Content-SHA256", part_sha256)
                .body(Body::new(body)),
        )?;
        if uploaded.get("etag").and_then(Value::as_str).is_none() {
            return Err(AppError::publish_failed(format!(
                "Publish service did not accept multipart part {part_number}"
            )));
        }
        offset += part_bytes;
        part_number += 1;
    }
    send_json(
        client
            .post(endpoint(
                origin,
                &format!(
                    "/api/publications/{slug}/versions/{version_id}/multipart/{session_id}/complete"
                ),
            )?)
            .header(AUTHORIZATION, authorization.clone())
            .header(
                "Idempotency-Key",
                idempotency_key(&["multipart-complete", slug, version_id, &object.sha256]),
            ),
    )
}

fn publication_is_active(
    client: &Client,
    origin: &Url,
    authorization: &HeaderValue,
    slug: &str,
    version_id: &str,
) -> Result<bool> {
    let tenant = send_json(
        client
            .get(endpoint(origin, "/api/tenant")?)
            .header(AUTHORIZATION, authorization.clone()),
    )?;
    Ok(tenant
        .get("publications")
        .and_then(Value::as_array)
        .and_then(|items| {
            items
                .iter()
                .find(|item| item.get("slug").and_then(Value::as_str) == Some(slug))
        })
        .and_then(|item| item.get("currentVersionId"))
        .and_then(Value::as_str)
        == Some(version_id))
}

fn send_json(request: RequestBuilder) -> Result<Value> {
    let response = request
        .send()
        .map_err(|error| AppError::publish_failed(network_error(&error)))?;
    response_json(response)
}

fn response_json(response: Response) -> Result<Value> {
    let status = response.status();
    let value = response
        .json::<Value>()
        .map_err(|error| AppError::publish_failed(format!("invalid service response: {error}")))?;
    if status.is_success() {
        return Ok(value);
    }
    let code = value
        .pointer("/error/code")
        .and_then(Value::as_str)
        .unwrap_or("publish_request_failed");
    let message = value
        .pointer("/error/message")
        .and_then(Value::as_str)
        .unwrap_or("Publish request failed");
    Err(AppError::publish_failed(format!(
        "{message} ({code}, HTTP {})",
        status.as_u16()
    )))
}

fn requested_access_change(args: &PublishArgs) -> Result<PublicationAccessChange> {
    let password_from_environment = match std::env::var("EIDOS_PUBLISH_PASSWORD") {
        Ok(value) => Some(value),
        Err(std::env::VarError::NotPresent) => None,
        Err(std::env::VarError::NotUnicode(_)) => {
            return Err(AppError::invalid_request(
                "EIDOS_PUBLISH_PASSWORD must contain valid UTF-8",
            ));
        }
    };
    if !args.password && password_from_environment.is_some() {
        return Err(AppError::invalid_request(
            "EIDOS_PUBLISH_PASSWORD is used only together with --password",
        ));
    }
    if args.visibility == PublishVisibilityArg::Private && (args.password || args.remove_password) {
        return Err(AppError::invalid_request(
            "--visibility private cannot be combined with --password or --remove-password",
        ));
    }
    if args.password {
        let password = match password_from_environment {
            Some(value) => value,
            None => {
                let first = rpassword::prompt_password("Publish password: ")
                    .map_err(|error| AppError::invalid_request(error.to_string()))?;
                let second = rpassword::prompt_password("Confirm password: ")
                    .map_err(|error| AppError::invalid_request(error.to_string()))?;
                if first != second {
                    return Err(AppError::invalid_request("Publish passwords do not match"));
                }
                first
            }
        };
        validate_password(&password)?;
        return Ok(PublicationAccessChange::Password(password));
    }
    if args.remove_password {
        return Ok(PublicationAccessChange::Public);
    }
    if args.visibility == PublishVisibilityArg::Private {
        return Ok(PublicationAccessChange::Private);
    }
    Ok(PublicationAccessChange::Unchanged)
}

fn validate_password(value: &str) -> Result<()> {
    let characters = value.chars().count();
    if !(8..=128).contains(&characters)
        || value.len() > 256
        || value.chars().any(|character| character.is_control())
    {
        return Err(AppError::invalid_request(
            "Publish password must contain 8 to 128 characters, at most 256 UTF-8 bytes, and no control characters",
        ));
    }
    Ok(())
}

fn publish_origin(value: &str) -> Result<Url> {
    let mut url = Url::parse(value)
        .map_err(|_| AppError::invalid_request("--publish-origin must be an absolute URL"))?;
    let local_http =
        url.scheme() == "http" && matches!(url.host_str(), Some("127.0.0.1" | "localhost"));
    if (url.scheme() != "https" && !local_http) || url.username() != "" || url.password().is_some()
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

fn file_sha256(
    file: &mut File,
    total: u64,
    progress: PublishProgress,
    label: &str,
) -> Result<String> {
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    let mut current = 0_u64;
    let mut last_percent = None;
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| AppError::publish_failed(error.to_string()))?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
        current = current.saturating_add(read as u64).min(total);
        progress.update_bytes(label, current, total, &mut last_percent);
    }
    if total == 0 {
        progress.update_bytes(label, 0, 0, &mut last_percent);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn progress_percent(current: u64, total: u64) -> u64 {
    current
        .min(total)
        .saturating_mul(100)
        .checked_div(total)
        .unwrap_or(100)
}

fn progress_bytes_line(label: &str, current: u64, total: u64) -> String {
    format!(
        "publish: {label} {:>3}% ({}/{})",
        progress_percent(current, total),
        human_bytes(current.min(total)),
        human_bytes(total)
    )
}

fn human_bytes(bytes: u64) -> String {
    const KIB: u64 = 1024;
    const MIB: u64 = 1024 * KIB;
    const GIB: u64 = 1024 * MIB;
    if bytes >= GIB {
        format!("{:.1} GiB", bytes as f64 / GIB as f64)
    } else if bytes >= MIB {
        format!("{:.1} MiB", bytes as f64 / MIB as f64)
    } else if bytes >= KIB {
        format!("{:.1} KiB", bytes as f64 / KIB as f64)
    } else {
        format!("{bytes} B")
    }
}

fn file_range_sha256(file: &mut File, offset: u64, bytes: u64) -> Result<String> {
    file.seek(SeekFrom::Start(offset))
        .map_err(|error| AppError::publish_failed(error.to_string()))?;
    let mut digest = Sha256::new();
    let mut remaining = bytes;
    let mut buffer = [0_u8; 1024 * 1024];
    while remaining > 0 {
        let requested = usize::try_from(remaining.min(buffer.len() as u64))
            .map_err(|error| AppError::publish_failed(error.to_string()))?;
        let read = file
            .read(&mut buffer[..requested])
            .map_err(|error| AppError::publish_failed(error.to_string()))?;
        if read == 0 {
            return Err(AppError::publish_failed(
                "source file changed while multipart upload was in progress",
            ));
        }
        digest.update(&buffer[..read]);
        remaining -= read as u64;
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn validate_slug(value: &str) -> Result<()> {
    let valid = !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        && value
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphanumeric)
        && value
            .as_bytes()
            .last()
            .is_some_and(u8::is_ascii_alphanumeric);
    if valid {
        Ok(())
    } else {
        Err(AppError::invalid_request(
            "--slug must contain 1 to 64 lowercase letters, digits, or hyphens",
        ))
    }
}

fn string_member<'a>(value: &'a Value, key: &str) -> Result<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::publish_failed(format!("service response is missing {key}")))
}

fn decimal_member(value: &Value, key: &str) -> Result<u64> {
    string_member(value, key)?
        .parse::<u64>()
        .map_err(|_| AppError::publish_failed(format!("service response has an invalid {key}")))
}

fn source_limit(tenant: &Value, source_kind: PublishSourceKind) -> Result<u64> {
    match source_kind {
        PublishSourceKind::Eidos => {
            let access = tenant.get("access").ok_or_else(|| {
                AppError::publish_failed("service response is missing Publish access")
            })?;
            let limit = decimal_member(access, "maxEidosFileBytes")?;
            if limit == 0 || limit > MAX_OBJECT_BYTES {
                return Err(AppError::publish_failed(
                    "service response has an invalid maxEidosFileBytes",
                ));
            }
            Ok(limit)
        }
        PublishSourceKind::Markdown => Ok(MAX_MARKDOWN_BYTES),
        PublishSourceKind::Form => Ok(MAX_FORM_BYTES),
    }
}

fn source_limit_error(
    source_kind: PublishSourceKind,
    source_bytes: u64,
    source_limit: u64,
) -> AppError {
    let source_name = match source_kind {
        PublishSourceKind::Eidos => "Eidos File",
        PublishSourceKind::Markdown => "Markdown document",
        PublishSourceKind::Form => "Form definition",
    };
    AppError::publish_failed(format!(
        "{source_name} is {} and exceeds this account's {} limit",
        human_bytes(source_bytes),
        human_bytes(source_limit)
    ))
}

fn short_digest(value: &str) -> &str {
    value.get(..12).unwrap_or(value)
}

fn idempotency_key(parts: &[&str]) -> String {
    let mut digest = Sha256::new();
    for part in parts {
        digest.update(part.as_bytes());
        digest.update([0]);
    }
    format!("eidos-cli-{:x}", digest.finalize())
}

fn random_idempotency_key(operation: &str) -> String {
    let mut random = [0_u8; 16];
    rand::thread_rng().fill_bytes(&mut random);
    let suffix = random
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("eidos-cli-{operation}-{suffix}")
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

#[cfg(test)]
mod tests {
    use std::io::Write;

    use clap::Parser;
    use eidos_file_core::ddl::{configure_connection, create_eidos_file};
    use eidos_file_core::model::FieldType;
    use eidos_file_core::rows::{RowChange, RowMutation, mutate_rows};
    use eidos_file_core::schema_ops::{NewField, SchemaLeafChange, apply_initial_table};
    use eidos_file_core::view_ops::{
        SavedViewQuery, ViewChange, ViewMutationRequest, mutate_views,
    };
    use rusqlite::Connection;
    use serde_json::{Map, json};

    use crate::cli::{Cli, Command};

    use super::*;

    const FILE_ENTRY_ID: &str = "0198c72d-82b5-7000-8000-000000000010";

    #[test]
    fn accepts_only_safe_publication_slugs() {
        assert!(validate_slug("team-wiki").is_ok());
        assert!(validate_slug("a").is_ok());
        for value in ["Team", "-team", "team-", "a/b", "", "é"] {
            assert!(validate_slug(value).is_err(), "accepted {value:?}");
        }
    }

    #[test]
    fn publish_origin_requires_https_except_loopback() {
        assert!(publish_origin("https://publish.eidos.space").is_ok());
        assert!(publish_origin("http://127.0.0.1:8787").is_ok());
        assert!(publish_origin("http://publish.eidos.space").is_err());
        assert!(publish_origin("https://user@example.com").is_err());
    }

    #[test]
    fn reads_the_account_specific_eidos_file_limit() {
        let tenant = json!({
            "access": {
                "maxEidosFileBytes": "536870912"
            }
        });
        assert_eq!(
            source_limit(&tenant, PublishSourceKind::Eidos).expect("Custom limit"),
            512 * 1024 * 1024
        );
        assert_eq!(
            source_limit(&tenant, PublishSourceKind::Markdown).expect("Markdown limit"),
            MAX_MARKDOWN_BYTES
        );
    }

    #[test]
    fn rejects_invalid_or_oversized_eidos_file_limits() {
        for limit in ["0", "1073741825", "not-a-number"] {
            let tenant = json!({ "access": { "maxEidosFileBytes": limit } });
            assert!(source_limit(&tenant, PublishSourceKind::Eidos).is_err());
        }
    }

    #[test]
    fn hashes_only_the_requested_multipart_range() {
        let mut file = tempfile::tempfile().expect("temporary source");
        file.write_all(b"prefix-payload-suffix")
            .expect("write source");
        let actual = file_range_sha256(&mut file, 7, 7).expect("hash range");
        let expected = format!("{:x}", Sha256::digest(b"payload"));
        assert_eq!(actual, expected);
    }

    #[test]
    fn validates_a_bounded_graft_sqlite_page_delta() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let delta_path = directory.path().join("source.graft-delta");
        let mut delta = Vec::with_capacity(SQLITE_DELTA_HEADER_BYTES + 4 + 4096);
        delta.extend_from_slice(b"GRAFTD01");
        delta.extend_from_slice(&(SQLITE_DELTA_HEADER_BYTES as u32).to_le_bytes());
        delta.extend_from_slice(&0_u32.to_le_bytes());
        delta.extend_from_slice(&4096_u32.to_le_bytes());
        delta.extend_from_slice(&1_u32.to_le_bytes());
        delta.extend_from_slice(&8192_u64.to_le_bytes());
        delta.extend_from_slice(&8192_u64.to_le_bytes());
        delta.extend_from_slice(&[0xbb; 32]);
        delta.extend_from_slice(&[0xcc; 32]);
        delta.extend_from_slice(&2_u32.to_le_bytes());
        delta.extend_from_slice(&[7_u8; 4096]);
        fs::write(&delta_path, &delta).expect("write delta");
        let base_sha256 = "b".repeat(64);
        let cli = Cli::try_parse_from([
            "eidos",
            "publish",
            "source.eidos",
            "--slug",
            "demo",
            "--token",
            "test-token",
            "--graft-delta",
            delta_path.to_str().expect("UTF-8 path"),
            "--graft-base-sha256",
            &base_sha256,
        ])
        .expect("parse Publish arguments");
        let Command::Publish(args) = cli.command else {
            panic!("expected Publish command")
        };
        let prepared = prepare_sqlite_page_delta(
            &args,
            PublishSourceKind::Eidos,
            8192,
            &"c".repeat(64),
            PublishProgress::new(false, false),
        )
        .expect("validate delta")
        .expect("usable delta");

        assert_eq!(prepared.path, delta_path);
        assert_eq!(prepared.bytes, delta.len() as u64);
        assert_eq!(prepared.base_sha256, base_sha256);
        assert_eq!(prepared.sha256, format!("{:x}", Sha256::digest(delta)));
        assert!(
            prepare_sqlite_page_delta(
                &args,
                PublishSourceKind::Eidos,
                8192,
                &base_sha256,
                PublishProgress::new(false, false),
            )
            .expect("skip unchanged source")
            .is_none()
        );
    }

    #[test]
    fn idempotency_keys_are_stable_and_operation_bound() {
        assert_eq!(
            idempotency_key(&["upload", "tasks", "v1", "digest"]),
            idempotency_key(&["upload", "tasks", "v1", "digest"]),
        );
        assert_ne!(
            idempotency_key(&["upload", "tasks", "v1", "digest"]),
            idempotency_key(&["version", "tasks", "v1", "digest"]),
        );
    }

    #[test]
    fn source_manifest_fingerprint_uses_canonical_json() {
        let first = json!({
            "spec": "eidos.publish/source-bundle@1",
            "files": [{ "path": "source.eidos", "bytes": "4" }],
        });
        let second: Value = serde_json::from_str(
            r#"{"files":[{"bytes":"4","path":"source.eidos"}],"spec":"eidos.publish/source-bundle@1"}"#,
        )
        .expect("manifest JSON");

        assert_eq!(
            source_manifest_sha256(&first).expect("first fingerprint"),
            source_manifest_sha256(&second).expect("second fingerprint")
        );
        assert_ne!(
            source_manifest_sha256(&first).expect("original fingerprint"),
            source_manifest_sha256(&json!({
                "spec": "eidos.publish/source-bundle@1",
                "files": [{ "path": "source.eidos", "bytes": "5" }],
            }))
            .expect("changed fingerprint")
        );
    }

    #[test]
    fn only_reuses_a_matching_healthy_ready_version() {
        let fingerprint = "a".repeat(64);
        let ready = json!({
            "state": "ready",
            "targetHealth": "healthy",
            "sourceManifestSha256": fingerprint,
            "driverId": EIDOS_DRIVER_ID,
            "driverVersion": DRIVER_VERSION,
        });
        assert!(version_matches_source(
            &ready,
            PublishSourceKind::Eidos,
            &fingerprint
        ));
        for changed in [
            json!({
                "state": "failed",
                "targetHealth": "healthy",
                "sourceManifestSha256": fingerprint,
                "driverId": EIDOS_DRIVER_ID,
                "driverVersion": DRIVER_VERSION,
            }),
            json!({
                "state": "ready",
                "targetHealth": "unhealthy",
                "sourceManifestSha256": fingerprint,
                "driverId": EIDOS_DRIVER_ID,
                "driverVersion": DRIVER_VERSION,
            }),
            json!({
                "state": "ready",
                "targetHealth": "healthy",
                "sourceManifestSha256": "b".repeat(64),
                "driverId": EIDOS_DRIVER_ID,
                "driverVersion": DRIVER_VERSION,
            }),
        ] {
            assert!(!version_matches_source(
                &changed,
                PublishSourceKind::Eidos,
                &fingerprint
            ));
        }
    }

    #[test]
    fn version_idempotency_keys_are_scoped_to_one_publish_invocation() {
        let first = random_idempotency_key("version");
        let second = random_idempotency_key("version");

        assert!(first.starts_with("eidos-cli-version-"));
        assert!(second.starts_with("eidos-cli-version-"));
        assert_ne!(first, second);
    }

    #[test]
    fn validates_publish_password_boundaries() {
        assert!(validate_password("correct horse battery staple").is_ok());
        assert!(validate_password("密码访问能力测试").is_ok());
        assert!(validate_password("short").is_err());
        assert!(validate_password("contains\nnewline").is_err());
        assert!(validate_password(&"x".repeat(129)).is_err());
    }

    #[test]
    fn password_access_idempotency_keys_are_random_and_do_not_contain_secrets() {
        let first = random_idempotency_key("password-access");
        let second = random_idempotency_key("password-access");
        assert_ne!(first, second);
        assert!(first.starts_with("eidos-cli-password-access-"));
        assert!(!first.contains("correct horse"));
    }

    #[test]
    fn mutable_publish_settings_use_operation_scoped_idempotency_keys() {
        for operation in ["branding", "form-policy"] {
            let first = random_idempotency_key(operation);
            let second = random_idempotency_key(operation);
            assert_ne!(first, second);
            assert!(first.starts_with(&format!("eidos-cli-{operation}-")));
        }
    }

    #[test]
    fn renders_stable_human_publish_progress() {
        assert_eq!(progress_percent(1, 4), 25);
        assert_eq!(progress_percent(5, 4), 100);
        assert_eq!(progress_percent(0, 0), 100);
        assert_eq!(human_bytes(86_016), "84.0 KiB");
        assert_eq!(
            progress_bytes_line("uploading source", 32, 128),
            "publish: uploading source  25% (32 B/128 B)"
        );
    }

    #[test]
    fn discovers_and_deduplicates_local_file_field_attachments() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let eidos_path = directory.path().join("demo.eidos");
        create_eidos_file(&eidos_path, Some("Demo")).expect("create file");
        let mut conn = Connection::open(&eidos_path).expect("open file");
        configure_connection(&conn).expect("configure file");
        let initialized = apply_initial_table(
            &mut conn,
            &SchemaLeafChange::CreateTable {
                client_key: "items".into(),
                name: "Items".into(),
                position: None,
                settings: None,
                fields: vec![
                    NewField {
                        client_key: "name".into(),
                        name: "Name".into(),
                        kind: FieldType::Text,
                        position: None,
                        nullable: Some(false),
                        settings: None,
                        definition: None,
                    },
                    NewField {
                        client_key: "files".into(),
                        name: "Files".into(),
                        kind: FieldType::File,
                        position: None,
                        nullable: None,
                        settings: None,
                        definition: None,
                    },
                ],
                label_field_client_key: Some("name".into()),
            },
        )
        .expect("create table");
        fs::create_dir(directory.path().join("assets")).expect("create assets");
        fs::write(directory.path().join("assets/report.txt"), b"report").expect("write attachment");
        let entry = json!({
            "id": FILE_ENTRY_ID,
            "name": "report.txt",
            "mediaType": "text/plain",
            "size": "6",
            "uri": "assets/a/../report.txt",
        });
        let changes = ["First", "Second"]
            .into_iter()
            .enumerate()
            .map(|(index, name)| {
                let mut values = Map::new();
                values.insert("Name".into(), json!(name));
                values.insert("Files".into(), json!([entry.clone()]));
                RowChange::Create {
                    client_key: format!("row-{index}"),
                    values,
                }
            })
            .collect();
        mutate_rows(
            &mut conn,
            &RowMutation {
                table_id: initialized.table_id,
                expected_revision: Some("1".into()),
                changes,
            },
        )
        .expect("insert rows");

        let attachments =
            discover_eidos_attachments(&conn, directory.path(), PublishProgress::new(false, false))
                .expect("discover attachments");
        assert_eq!(attachments.len(), 1);
        assert_eq!(
            attachments[0].reference,
            LocalAttachmentReference::EidosFileEntry(FILE_ENTRY_ID.to_string())
        );
        assert_eq!(attachments[0].uri, "assets/report.txt");
        assert_eq!(attachments[0].path, "assets/report.txt");
        assert_eq!(attachments[0].bytes, 6);
    }

    #[test]
    fn discovers_and_deduplicates_markdown_attachments() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let markdown_path = directory.path().join("notes.md");
        fs::create_dir(directory.path().join("assets")).expect("create assets");
        fs::create_dir(directory.path().join("downloads")).expect("create downloads");
        fs::write(directory.path().join("assets/chart.png"), b"image").expect("write image");
        fs::write(directory.path().join("downloads/report.pdf"), b"report").expect("write report");
        fs::write(
            &markdown_path,
            "# Report\n\n![Chart](assets/chart.png)\n![Again](assets/chart.png)\n[Download][report]\n[External](https://eidos.space)\n\n[report]: downloads/report.pdf\n",
        )
        .expect("write markdown");

        let attachments = discover_markdown_attachments(
            &markdown_path,
            directory.path(),
            PublishProgress::new(false, false),
        )
        .expect("discover Markdown attachments");

        assert_eq!(attachments.len(), 2);
        assert_eq!(attachments[0].uri, "assets/chart.png");
        assert_eq!(attachments[0].media_type, "image/png");
        assert_eq!(attachments[1].uri, "downloads/report.pdf");
        assert_eq!(attachments[1].media_type, "application/pdf");
        assert!(
            attachments
                .iter()
                .all(|attachment| attachment.reference == LocalAttachmentReference::MarkdownLink)
        );
    }

    #[test]
    fn builds_a_stable_publish_definition_from_a_form_view() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let eidos_path = directory.path().join("form.eidos");
        create_eidos_file(&eidos_path, Some("Forms")).expect("create file");
        let mut conn = Connection::open(&eidos_path).expect("open file");
        configure_connection(&conn).expect("configure file");
        let initialized = apply_initial_table(
            &mut conn,
            &SchemaLeafChange::CreateTable {
                client_key: "responses".into(),
                name: "Responses".into(),
                position: None,
                settings: None,
                fields: vec![
                    NewField {
                        client_key: "name".into(),
                        name: "Name".into(),
                        kind: FieldType::Text,
                        position: None,
                        nullable: Some(false),
                        settings: None,
                        definition: None,
                    },
                    NewField {
                        client_key: "notes".into(),
                        name: "Notes".into(),
                        kind: FieldType::Text,
                        position: None,
                        nullable: Some(true),
                        settings: None,
                        definition: None,
                    },
                    NewField {
                        client_key: "screenshot".into(),
                        name: "Screenshot".into(),
                        kind: FieldType::File,
                        position: None,
                        nullable: Some(false),
                        settings: None,
                        definition: None,
                    },
                    NewField {
                        client_key: "importance".into(),
                        name: "Importance".into(),
                        kind: FieldType::Select,
                        position: None,
                        nullable: Some(true),
                        settings: Some(json!({
                            "options": [
                                { "name": "Helpful", "color": "blue" },
                                { "name": "Other" },
                            ],
                        })),
                        definition: None,
                    },
                ],
                label_field_client_key: Some("name".into()),
            },
        )
        .expect("create table");
        let fields = load_fields(&conn).expect("load fields");
        let name_id = fields
            .iter()
            .find(|field| field.name == "Name")
            .expect("name field")
            .id
            .clone();
        let notes_id = fields
            .iter()
            .find(|field| field.name == "Notes")
            .expect("notes field")
            .id
            .clone();
        let screenshot_id = fields
            .iter()
            .find(|field| field.name == "Screenshot")
            .expect("screenshot field")
            .id
            .clone();
        mutate_views(
            &mut conn,
            &ViewMutationRequest {
                expected_revision: "1".into(),
                changes: vec![ViewChange::CreateView {
                    client_key: "feedback".into(),
                    table_id: initialized.table_id,
                    name: "Feedback".into(),
                    view_type: "form".into(),
                    query: SavedViewQuery::default(),
                    layout: json!({
                        "title": "Send feedback",
                        "description": "Tell us what changed.",
                        "submitLabel": "Send",
                        "successMessage": "Received.",
                        "fieldOrder": [notes_id, name_id],
                        "fields": [
                            {
                                "fieldId": notes_id,
                                "label": "Details",
                                "multiline": true,
                                "required": true,
                            },
                            {
                                "fieldId": screenshot_id,
                                "required": false,
                            },
                        ],
                    }),
                    position: "0".into(),
                }],
            },
        )
        .expect("create Form View");

        let first = build_form_definition(&conn, "Feedback").expect("build form");
        let second = build_form_definition(&conn, "Feedback").expect("rebuild form");
        assert_eq!(first, second);
        let definition: Value = serde_json::from_slice(&first).expect("definition JSON");
        assert_eq!(
            definition.pointer("/presentation/title"),
            Some(&json!("Send feedback"))
        );
        assert_eq!(
            definition.pointer("/fields/0/fieldId"),
            Some(&json!(notes_id))
        );
        assert_eq!(definition.pointer("/fields/0/required"), Some(&json!(true)));
        assert_eq!(
            definition.pointer("/fields/0/multiline"),
            Some(&json!(true))
        );
        assert_eq!(
            definition.pointer("/fields/1/fieldId"),
            Some(&json!(name_id))
        );
        assert_eq!(definition.pointer("/fields/1/required"), Some(&json!(true)));
        assert_eq!(
            definition.pointer("/fields/1/multiline"),
            Some(&json!(false))
        );
        assert_eq!(
            definition.pointer("/fields/2/fieldId"),
            Some(&json!(screenshot_id))
        );
        assert_eq!(
            definition.pointer("/fields/2/required"),
            Some(&json!(false))
        );
        assert_eq!(
            definition.pointer("/fields/3/constraints/options"),
            Some(&json!([
                { "name": "Helpful", "color": "blue" },
                { "name": "Other", "color": "default" },
            ]))
        );
        for field in definition
            .get("fields")
            .and_then(Value::as_array)
            .expect("published fields")
        {
            assert_eq!(
                field
                    .get("inputKey")
                    .and_then(Value::as_str)
                    .expect("input key")
                    .len(),
                24
            );
        }
    }
}
