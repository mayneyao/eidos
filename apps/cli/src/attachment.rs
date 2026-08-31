use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

use eidos_file_core::EidosError;
use eidos_file_core::id::{assert_uuidv7, generate_uuidv7};
use eidos_file_core::model::{
    FieldMeta, FieldType, TableMeta, load_fields, load_file_meta, load_tables,
};
use eidos_file_core::query::{FilterNode, ReadRowsOptions, RowQuery, read_rows};
use eidos_file_core::rows::{RowChange, RowMutation, ensure_revision, mutate_rows_in_transaction};
use eidos_file_core::values::{coerce_value, normalize_relative_file_uri};
use rusqlite::{Connection, TransactionBehavior};
use serde_json::{Map, Value, json};

use crate::app::{CommandOutput, open_file};
use crate::cli::{
    AttachmentArgs, AttachmentAttachArgs, AttachmentCommand, AttachmentDetachArgs,
    AttachmentImportArgs, AttachmentVerifyArgs,
};
use crate::error::{AppError, Result};

const ASSET_BYTES_MAX: u64 = 256 * 1024 * 1024;
const ASSET_IMPORT_COUNT_MAX: usize = 64;
const VERIFY_PAGE_SIZE: u32 = 500;
const VERIFY_ASSET_LIMIT: usize = 50_000;

#[derive(Clone, Debug)]
struct AttachmentFileContext {
    root: PathBuf,
    asset_root: PathBuf,
}

#[derive(Clone, Debug)]
struct TargetCell {
    table: TableMeta,
    field: FieldMeta,
    entries: Vec<Value>,
}

#[derive(Clone, Debug)]
struct Inspection {
    size: u64,
    header: Vec<u8>,
}

#[derive(Debug)]
struct PreparedAsset {
    entry: Value,
    uri: String,
    path: PathBuf,
    stage_path: Option<PathBuf>,
    copied: bool,
}

struct AttachmentMutation<'a> {
    table: &'a str,
    row_id: &'a str,
    field: &'a str,
    expected_revision: &'a str,
    replace: bool,
    operation: &'a str,
}

pub(crate) fn run(args: AttachmentArgs) -> Result<CommandOutput> {
    match args.command {
        AttachmentCommand::Import(command) => import(args.file, command),
        AttachmentCommand::Attach(command) => attach(args.file, command),
        AttachmentCommand::Detach(command) => detach(args.file, command),
        AttachmentCommand::Verify(command) => verify(args.file, command),
    }
}

fn import(file: PathBuf, args: AttachmentImportArgs) -> Result<CommandOutput> {
    require_count(args.sources.len())?;
    let mut conn = open_file(&file, true)?;
    load_target_cell(
        &conn,
        &args.table,
        &args.row,
        &args.field,
        Some(&args.expected_revision),
    )?;
    let context = attachment_file_context(&file, true)?;

    let mut existing_names = managed_asset_names(&context.asset_root)?;
    let mut prepared = Vec::with_capacity(args.sources.len());
    let preparation = (|| -> Result<()> {
        for source in &args.sources {
            prepared.push(prepare_import(&context, source, &mut existing_names)?);
        }
        Ok(())
    })();
    if let Err(error) = preparation {
        cleanup_stages(&prepared);
        return Err(error);
    }

    let result = apply_prepared(
        &mut conn,
        AttachmentMutation {
            table: &args.table,
            row_id: &args.row,
            field: &args.field,
            expected_revision: &args.expected_revision,
            replace: args.replace,
            operation: "import",
        },
        &prepared,
    );
    if result.is_err() {
        cleanup_stages(&prepared);
    }
    result
}

fn attach(file: PathBuf, args: AttachmentAttachArgs) -> Result<CommandOutput> {
    require_count(args.uris.len())?;
    let context = attachment_file_context(&file, false)?;
    let mut conn = open_file(&file, true)?;
    load_target_cell(
        &conn,
        &args.table,
        &args.row,
        &args.field,
        Some(&args.expected_revision),
    )?;
    let prepared = args
        .uris
        .iter()
        .map(|uri| prepare_existing_uri(&context, uri))
        .collect::<Result<Vec<_>>>()?;
    apply_prepared(
        &mut conn,
        AttachmentMutation {
            table: &args.table,
            row_id: &args.row,
            field: &args.field,
            expected_revision: &args.expected_revision,
            replace: args.replace,
            operation: "attach",
        },
        &prepared,
    )
}

fn detach(file: PathBuf, args: AttachmentDetachArgs) -> Result<CommandOutput> {
    if !args.all && args.entry_ids.is_empty() {
        return Err(AppError::invalid_request(
            "choose either --all or one or more --entry values",
        ));
    }
    let mut requested = BTreeSet::new();
    for entry_id in &args.entry_ids {
        assert_uuidv7(entry_id, "File entry ID")?;
        if !requested.insert(entry_id.clone()) {
            return Err(AppError::invalid_request(format!(
                "duplicate --entry value {entry_id}"
            )));
        }
    }

    let mut conn = open_file(&file, true)?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(EidosError::from)?;
    let target = load_target_cell(
        &tx,
        &args.table,
        &args.row,
        &args.field,
        Some(&args.expected_revision),
    )?;
    let mut detached = Vec::new();
    let retained = target
        .entries
        .iter()
        .filter_map(|entry| {
            let id = entry.get("id").and_then(Value::as_str);
            if args.all || id.is_some_and(|id| requested.contains(id)) {
                detached.push(entry.clone());
                None
            } else {
                Some(entry.clone())
            }
        })
        .collect::<Vec<_>>();
    if !args.all {
        let found = detached
            .iter()
            .filter_map(|entry| entry.get("id").and_then(Value::as_str))
            .collect::<BTreeSet<_>>();
        let missing = requested
            .iter()
            .filter(|id| !found.contains(id.as_str()))
            .cloned()
            .collect::<Vec<_>>();
        if !missing.is_empty() {
            return Err(AppError::runtime(
                "not-found",
                format!(
                    "File entries not found in the selected cell: {}",
                    missing.join(", ")
                ),
                None,
            ));
        }
    }

    let meta = load_file_meta(&tx)?;
    if detached.is_empty() {
        tx.rollback().map_err(EidosError::from)?;
        return Ok(CommandOutput::success(json!({
            "operation": "detach",
            "fileId": meta.file_id,
            "baseRevision": args.expected_revision,
            "revision": meta.revision.to_string(),
            "changed": false,
            "table": {"id": target.table.id, "name": target.table.name},
            "rowId": args.row,
            "field": {"id": target.field.id, "name": target.field.name},
            "detached": [],
            "physicalFilesRetained": true,
        })));
    }

    let mut values = Map::new();
    values.insert(target.field.id.clone(), Value::Array(retained));
    let result = mutate_rows_in_transaction(
        &tx,
        &RowMutation {
            table_id: target.table.id.clone(),
            expected_revision: Some(args.expected_revision.clone()),
            changes: vec![RowChange::Update {
                row_id: args.row.clone(),
                values,
            }],
        },
    )?;
    if result.changed {
        tx.commit().map_err(EidosError::from)?;
    } else {
        tx.rollback().map_err(EidosError::from)?;
    }
    Ok(CommandOutput::success(json!({
        "operation": "detach",
        "fileId": result.file_id,
        "baseRevision": args.expected_revision,
        "revision": result.revision,
        "changed": result.changed,
        "table": {"id": target.table.id, "name": target.table.name},
        "rowId": args.row,
        "field": {"id": target.field.id, "name": target.field.name},
        "detached": detached,
        "physicalFilesRetained": true,
    })))
}

fn require_count(count: usize) -> Result<()> {
    if (1..=ASSET_IMPORT_COUNT_MAX).contains(&count) {
        Ok(())
    } else {
        Err(AppError::invalid_request(format!(
            "choose between 1 and {ASSET_IMPORT_COUNT_MAX} attachments"
        )))
    }
}

fn attachment_file_context(file: &Path, create_assets: bool) -> Result<AttachmentFileContext> {
    let metadata = fs::symlink_metadata(file).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            AppError::runtime("not-found", format!("file {}", file.display()), None)
        } else {
            attachment_io("inspect Eidos File", file, error)
        }
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(AppError::attachment(
            "the Eidos File attachment root must be an ordinary file, not a symlink",
        ));
    }
    let canonical_file =
        fs::canonicalize(file).map_err(|error| attachment_io("resolve Eidos File", file, error))?;
    let root = canonical_file
        .parent()
        .ok_or_else(|| AppError::attachment("the Eidos File has no parent directory"))?
        .to_path_buf();
    let asset_root = root.join("assets");
    if create_assets && !asset_root.exists() {
        let mut builder = fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        match builder.create(&asset_root) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => {
                return Err(attachment_io(
                    "create managed assets folder",
                    &asset_root,
                    error,
                ));
            }
        }
    }
    if asset_root.exists() {
        let asset_metadata = fs::symlink_metadata(&asset_root)
            .map_err(|error| attachment_io("inspect managed assets folder", &asset_root, error))?;
        if asset_metadata.file_type().is_symlink() || !asset_metadata.is_dir() {
            return Err(AppError::attachment(
                "the managed assets path must be an ordinary directory, not a symlink",
            ));
        }
        let canonical_assets = fs::canonicalize(&asset_root)
            .map_err(|error| attachment_io("resolve managed assets folder", &asset_root, error))?;
        if canonical_assets != asset_root {
            return Err(AppError::attachment(
                "the managed assets folder cannot contain a symlink boundary",
            ));
        }
    }
    Ok(AttachmentFileContext { root, asset_root })
}

fn load_target_cell(
    conn: &Connection,
    table_reference: &str,
    row_id: &str,
    field_reference: &str,
    expected_revision: Option<&str>,
) -> Result<TargetCell> {
    if let Some(revision) = expected_revision {
        ensure_revision(conn, revision)?;
    }
    assert_uuidv7(row_id, "Row ID")?;
    let tables = load_tables(conn)?;
    let table_matches = tables
        .iter()
        .filter(|table| table.id == table_reference || table.name == table_reference)
        .collect::<Vec<_>>();
    let table = match table_matches.as_slice() {
        [table] => (*table).clone(),
        [] => {
            return Err(AppError::runtime(
                "not-found",
                format!("table {table_reference:?}"),
                None,
            ));
        }
        _ => {
            return Err(AppError::invalid_request(format!(
                "table reference {table_reference:?} is ambiguous"
            )));
        }
    };
    let table_fields = load_fields(conn)?
        .into_iter()
        .filter(|field| field.table_id == table.id)
        .collect::<Vec<_>>();
    let field_matches = table_fields
        .iter()
        .filter(|field| field.id == field_reference || field.name == field_reference)
        .collect::<Vec<_>>();
    let field = match field_matches.as_slice() {
        [field] => (*field).clone(),
        [] => {
            return Err(AppError::runtime(
                "not-found",
                format!("Field {field_reference:?} in Table {:?}", table.name),
                None,
            ));
        }
        _ => {
            return Err(AppError::invalid_request(format!(
                "Field reference {field_reference:?} is ambiguous"
            )));
        }
    };
    if field.field_type != FieldType::File || field.physical_name.is_none() {
        return Err(AppError::invalid_request(format!(
            "Field {:?} is not a stored File field",
            field.name
        )));
    }
    let page = read_rows(
        conn,
        &table,
        &table_fields,
        &RowQuery {
            filter: Some(FilterNode::Eq {
                field_id: "_id".into(),
                value: Value::String(row_id.to_string()),
            }),
            ..RowQuery::default()
        },
        &ReadRowsOptions {
            projection: Some(vec![field.id.clone()]),
            include_virtual: false,
            limit: Some(2),
            offset: Some(0),
        },
    )?;
    let row = match page.rows.as_slice() {
        [row] => row,
        [] => {
            return Err(AppError::runtime(
                "not-found",
                format!("row {row_id} in Table {:?}", table.name),
                None,
            ));
        }
        _ => return Err(AppError::internal("Row ID matched more than one row")),
    };
    let value = row.get(&field.name).unwrap_or(&Value::Null);
    let entries = match value {
        Value::Null => Vec::new(),
        Value::Array(entries) => entries.clone(),
        _ => {
            return Err(AppError::runtime(
                "corrupt-file",
                format!("File Field {:?} contains a non-array value", field.name),
                None,
            ));
        }
    };
    Ok(TargetCell {
        table,
        field,
        entries,
    })
}

fn managed_asset_names(asset_root: &Path) -> Result<HashSet<String>> {
    let mut names = HashSet::new();
    for entry in fs::read_dir(asset_root)
        .map_err(|error| attachment_io("read managed assets folder", asset_root, error))?
    {
        let entry = entry
            .map_err(|error| attachment_io("read managed assets folder", asset_root, error))?;
        names.insert(collision_key(&entry.file_name().to_string_lossy()));
    }
    Ok(names)
}

fn prepare_import(
    context: &AttachmentFileContext,
    source: &Path,
    existing_names: &mut HashSet<String>,
) -> Result<PreparedAsset> {
    let source_metadata = fs::symlink_metadata(source)
        .map_err(|error| attachment_io("inspect attachment source", source, error))?;
    if source_metadata.file_type().is_symlink() || !source_metadata.is_file() {
        return Err(AppError::attachment(format!(
            "attachment source must be an ordinary file: {}",
            source.display()
        )));
    }
    if source_metadata.len() > ASSET_BYTES_MAX {
        return Err(AppError::runtime(
            "resource-limit",
            format!("attachment exceeds the 256 MiB limit: {}", source.display()),
            None,
        ));
    }
    let canonical_source = fs::canonicalize(source)
        .map_err(|error| attachment_io("resolve attachment source", source, error))?;
    if let Ok(relative) = canonical_source.strip_prefix(&context.asset_root)
        && !relative.as_os_str().is_empty()
    {
        let decoded = slash_path(relative)?;
        let requested_uri = encode_relative_path_uri(&format!("assets/{decoded}"));
        let (uri, path) = normalize_relative_file_uri(&requested_uri)
            .ok_or_else(|| AppError::attachment("managed attachment path is not portable"))?;
        let resolved = resolve_local_path(&context.root, &path)?;
        let inspected = inspect_ordinary_file(&resolved)?;
        let name = resolved
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| AppError::attachment("attachment name must be valid UTF-8"))?
            .to_string();
        return Ok(prepared_existing(uri, resolved, &name, inspected));
    }

    let requested = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::attachment("attachment name must be valid UTF-8"))?;
    let name = unique_asset_name(existing_names, requested)?;
    let stage_path = context
        .asset_root
        .join(format!(".eidos-asset-{}.tmp", generate_uuidv7()));
    let target_path = context.asset_root.join(&name);
    let inspected = copy_source_to_stage(source, &stage_path)?;
    let requested_uri = encode_relative_path_uri(&format!("assets/{name}"));
    let uri = normalize_relative_file_uri(&requested_uri)
        .map(|(uri, _)| uri)
        .ok_or_else(|| AppError::attachment("attachment name cannot form a portable URI"))?;
    let entry = file_entry(&uri, &name, &inspected);
    Ok(PreparedAsset {
        entry,
        uri,
        path: target_path,
        stage_path: Some(stage_path),
        copied: true,
    })
}

fn prepare_existing_uri(
    context: &AttachmentFileContext,
    requested_uri: &str,
) -> Result<PreparedAsset> {
    let (uri, decoded_path) = normalize_relative_file_uri(requested_uri).ok_or_else(|| {
        AppError::invalid_request(format!(
            "attachment URI must be a contained relative file path without a query or fragment: {requested_uri:?}"
        ))
    })?;
    let path = resolve_local_path(&context.root, &decoded_path)?;
    let inspected = inspect_ordinary_file(&path)?;
    let name = Path::new(&decoded_path)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::attachment("attachment name must be valid UTF-8"))?;
    Ok(prepared_existing(uri, path, name, inspected))
}

fn prepared_existing(
    uri: String,
    path: PathBuf,
    name: &str,
    inspected: Inspection,
) -> PreparedAsset {
    PreparedAsset {
        entry: file_entry(&uri, name, &inspected),
        uri,
        path,
        stage_path: None,
        copied: false,
    }
}

fn file_entry(uri: &str, name: &str, inspected: &Inspection) -> Value {
    json!({
        "id": generate_uuidv7(),
        "mediaType": detect_media_type(&inspected.header, name),
        "name": name,
        "size": inspected.size.to_string(),
        "uri": uri,
    })
}

fn apply_prepared(
    conn: &mut Connection,
    request: AttachmentMutation<'_>,
    prepared: &[PreparedAsset],
) -> Result<CommandOutput> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(EidosError::from)?;
    let target = load_target_cell(
        &tx,
        request.table,
        request.row_id,
        request.field,
        Some(request.expected_revision),
    )?;
    let detached = if request.replace {
        target.entries.clone()
    } else {
        Vec::new()
    };
    let mut entries = if request.replace {
        Vec::new()
    } else {
        target.entries.clone()
    };
    entries.extend(prepared.iter().map(|asset| asset.entry.clone()));
    let mut values = Map::new();
    values.insert(target.field.id.clone(), Value::Array(entries));
    let result = mutate_rows_in_transaction(
        &tx,
        &RowMutation {
            table_id: target.table.id.clone(),
            expected_revision: Some(request.expected_revision.to_string()),
            changes: vec![RowChange::Update {
                row_id: request.row_id.to_string(),
                values,
            }],
        },
    )?;

    let mut published = Vec::new();
    for asset in prepared {
        let Some(stage_path) = &asset.stage_path else {
            continue;
        };
        if let Err(error) = fs::hard_link(stage_path, &asset.path) {
            cleanup_paths(&published);
            return Err(attachment_io(
                "publish staged attachment",
                &asset.path,
                error,
            ));
        }
        published.push(asset.path.clone());
    }
    if let Err(error) = tx.commit().map_err(EidosError::from) {
        cleanup_paths(&published);
        return Err(error.into());
    }

    let mut cleanup_warnings = Vec::new();
    for asset in prepared {
        let Some(stage_path) = &asset.stage_path else {
            continue;
        };
        if let Err(error) = fs::remove_file(stage_path) {
            cleanup_warnings.push(format!(
                "committed successfully but could not remove stage {}: {error}",
                stage_path.display()
            ));
        }
    }
    Ok(CommandOutput::success(json!({
        "operation": request.operation,
        "fileId": result.file_id,
        "baseRevision": request.expected_revision,
        "revision": result.revision,
        "changed": result.changed,
        "mode": if request.replace { "replace" } else { "append" },
        "table": {"id": target.table.id, "name": target.table.name},
        "rowId": request.row_id,
        "field": {"id": target.field.id, "name": target.field.name},
        "entries": prepared.iter().map(|asset| asset.entry.clone()).collect::<Vec<_>>(),
        "assets": prepared.iter().map(|asset| json!({
            "uri": asset.uri,
            "path": asset.path,
            "copied": asset.copied,
        })).collect::<Vec<_>>(),
        "detached": detached,
        "detachedPhysicalFilesRetained": request.replace,
        "cleanupWarnings": cleanup_warnings,
    })))
}

fn copy_source_to_stage(source_path: &Path, stage_path: &Path) -> Result<Inspection> {
    let before = fs::symlink_metadata(source_path)
        .map_err(|error| attachment_io("inspect attachment source", source_path, error))?;
    if before.file_type().is_symlink() || !before.is_file() {
        return Err(AppError::attachment(format!(
            "attachment source must be an ordinary file: {}",
            source_path.display()
        )));
    }
    if before.len() > ASSET_BYTES_MAX {
        return Err(AppError::runtime(
            "resource-limit",
            format!(
                "attachment exceeds the 256 MiB limit: {}",
                source_path.display()
            ),
            None,
        ));
    }
    let mut source = File::open(source_path)
        .map_err(|error| attachment_io("open attachment source", source_path, error))?;
    let opened = source
        .metadata()
        .map_err(|error| attachment_io("inspect opened attachment source", source_path, error))?;
    if !opened.is_file() || opened.len() != before.len() {
        return Err(AppError::attachment(
            "attachment source changed while it was opened",
        ));
    }
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut destination = options
        .open(stage_path)
        .map_err(|error| attachment_io("create attachment stage", stage_path, error))?;
    let copied = (|| -> Result<Inspection> {
        let mut buffer = vec![0_u8; 1024 * 1024];
        let mut header = Vec::with_capacity(32);
        let mut size = 0_u64;
        loop {
            let read = source
                .read(&mut buffer)
                .map_err(|error| attachment_io("read attachment source", source_path, error))?;
            if read == 0 {
                break;
            }
            size = size.checked_add(read as u64).ok_or_else(|| {
                AppError::runtime("resource-limit", "attachment is too large", None)
            })?;
            if size > ASSET_BYTES_MAX {
                return Err(AppError::runtime(
                    "resource-limit",
                    "attachment exceeds the 256 MiB limit",
                    None,
                ));
            }
            if header.len() < 32 {
                let take = (32 - header.len()).min(read);
                header.extend_from_slice(&buffer[..take]);
            }
            destination
                .write_all(&buffer[..read])
                .map_err(|error| attachment_io("write attachment stage", stage_path, error))?;
        }
        destination
            .sync_all()
            .map_err(|error| attachment_io("sync attachment stage", stage_path, error))?;
        let after = source
            .metadata()
            .map_err(|error| attachment_io("recheck attachment source", source_path, error))?;
        if after.len() != before.len() || after.modified().ok() != before.modified().ok() {
            return Err(AppError::attachment(
                "attachment source changed while it was being copied",
            ));
        }
        Ok(Inspection { size, header })
    })();
    if copied.is_err() {
        let _ = fs::remove_file(stage_path);
    }
    copied
}

fn inspect_ordinary_file(path: &Path) -> Result<Inspection> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| attachment_io("inspect attachment", path, error))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(AppError::attachment(format!(
            "attachment must be an ordinary file: {}",
            path.display()
        )));
    }
    if metadata.len() > ASSET_BYTES_MAX {
        return Err(AppError::runtime(
            "resource-limit",
            format!("attachment exceeds the 256 MiB limit: {}", path.display()),
            None,
        ));
    }
    let mut file =
        File::open(path).map_err(|error| attachment_io("open attachment", path, error))?;
    let mut header = vec![0_u8; 32];
    let read = file
        .read(&mut header)
        .map_err(|error| attachment_io("read attachment", path, error))?;
    header.truncate(read);
    let after = file
        .metadata()
        .map_err(|error| attachment_io("recheck attachment", path, error))?;
    if after.len() != metadata.len() || after.modified().ok() != metadata.modified().ok() {
        return Err(AppError::attachment(
            "attachment changed while it was being inspected",
        ));
    }
    Ok(Inspection {
        size: after.len(),
        header,
    })
}

fn resolve_local_path(root: &Path, decoded_path: &str) -> Result<PathBuf> {
    let mut resolved = root.to_path_buf();
    for component in Path::new(decoded_path).components() {
        let Component::Normal(component) = component else {
            return Err(AppError::attachment(format!(
                "attachment path is not contained: {decoded_path:?}"
            )));
        };
        resolved.push(component);
        let metadata = fs::symlink_metadata(&resolved)
            .map_err(|error| attachment_io("resolve attachment", &resolved, error))?;
        if metadata.file_type().is_symlink() {
            return Err(AppError::attachment(format!(
                "attachment path contains a symbolic link: {decoded_path:?}"
            )));
        }
    }
    if !resolved.is_file() {
        return Err(AppError::attachment(format!(
            "attachment is not an ordinary file: {decoded_path:?}"
        )));
    }
    Ok(resolved)
}

fn sniff_media_type(header: &[u8]) -> Option<&'static str> {
    let ascii = |start: usize, end: usize| header.get(start..end);
    if header.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Some("image/png");
    }
    if header.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg");
    }
    if matches!(ascii(0, 6), Some(b"GIF87a" | b"GIF89a")) {
        return Some("image/gif");
    }
    if ascii(0, 4) == Some(b"RIFF") && ascii(8, 12) == Some(b"WEBP") {
        return Some("image/webp");
    }
    if header.starts_with(b"BM") {
        return Some("image/bmp");
    }
    if ascii(4, 8) == Some(b"ftyp") && matches!(ascii(8, 12), Some(b"avif" | b"avis")) {
        return Some("image/avif");
    }
    if header.len() >= 4
        && header[0] == 0
        && header[1] == 0
        && matches!(header[2], 1 | 2)
        && header[3] == 0
    {
        return Some("image/x-icon");
    }
    if header.starts_with(b"%PDF-") {
        return Some("application/pdf");
    }
    None
}

fn detect_media_type(header: &[u8], filename: &str) -> &'static str {
    if let Some(media_type) = sniff_media_type(header) {
        return media_type;
    }
    mime_guess::from_path(filename)
        .first_raw()
        .unwrap_or("application/octet-stream")
}

fn portable_asset_name(value: &str) -> String {
    let mut name = value
        .chars()
        .map(|character| {
            if character.is_control() || "<>:\"/\\|?*".contains(character) {
                '_'
            } else {
                character
            }
        })
        .collect::<String>()
        .trim()
        .trim_end_matches(['.', ' '])
        .to_string();
    if name.is_empty() || name == "." || name == ".." {
        name = "attachment".into();
    }
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if matches!(stem.as_str(), "con" | "prn" | "aux" | "nul")
        || stem
            .strip_prefix("com")
            .or_else(|| stem.strip_prefix("lpt"))
            .is_some_and(|suffix| {
                matches!(suffix, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
            })
    {
        name.insert(0, '_');
    }
    if name.len() <= 240 {
        return name;
    }
    let original_extension = Path::new(&name)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| format!(".{extension}"))
        .unwrap_or_default();
    let extension = truncate_utf8(&original_extension, 32);
    let stem = name.strip_suffix(&original_extension).unwrap_or(&name);
    format!(
        "{}{}",
        truncate_utf8(stem, 240 - extension.len()),
        extension
    )
}

fn unique_asset_name(existing: &mut HashSet<String>, requested: &str) -> Result<String> {
    let name = portable_asset_name(requested);
    if existing.insert(collision_key(&name)) {
        return Ok(name);
    }
    let extension = Path::new(&name)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| format!(".{extension}"))
        .unwrap_or_default();
    let stem = name.strip_suffix(&extension).unwrap_or(&name).to_string();
    for index in 2..=10_000 {
        let suffix = format!(" ({index})");
        let budget = 240_usize.saturating_sub(extension.len() + suffix.len());
        let candidate = format!("{}{}{}", truncate_utf8(&stem, budget), suffix, extension);
        if existing.insert(collision_key(&candidate)) {
            return Ok(candidate);
        }
    }
    Err(AppError::runtime(
        "resource-limit",
        "could not allocate a unique attachment name",
        None,
    ))
}

fn collision_key(value: &str) -> String {
    value.chars().flat_map(char::to_lowercase).collect()
}

fn truncate_utf8(value: &str, maximum: usize) -> String {
    let mut result = String::new();
    for character in value.chars() {
        if result.len() + character.len_utf8() > maximum {
            break;
        }
        result.push(character);
    }
    result
}

fn slash_path(path: &Path) -> Result<String> {
    let mut parts = Vec::new();
    for component in path.components() {
        let Component::Normal(component) = component else {
            return Err(AppError::attachment("attachment path is not contained"));
        };
        parts.push(
            component
                .to_str()
                .ok_or_else(|| AppError::attachment("attachment path must be valid UTF-8"))?,
        );
    }
    Ok(parts.join("/"))
}

fn encode_relative_path_uri(path: &str) -> String {
    path.split('/')
        .map(|component| {
            let mut encoded = String::with_capacity(component.len());
            const HEX: &[u8; 16] = b"0123456789ABCDEF";
            for byte in component.as_bytes() {
                if byte.is_ascii_alphanumeric()
                    || matches!(
                        byte,
                        b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')'
                    )
                {
                    encoded.push(char::from(*byte));
                } else {
                    encoded.push('%');
                    encoded.push(char::from(HEX[(byte >> 4) as usize]));
                    encoded.push(char::from(HEX[(byte & 0x0f) as usize]));
                }
            }
            encoded
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn cleanup_stages(prepared: &[PreparedAsset]) {
    for asset in prepared {
        if let Some(path) = &asset.stage_path {
            let _ = fs::remove_file(path);
        }
    }
}

fn cleanup_paths(paths: &[PathBuf]) {
    for path in paths {
        let _ = fs::remove_file(path);
    }
}

fn attachment_io(action: &str, path: &Path, error: std::io::Error) -> AppError {
    AppError::attachment(format!("cannot {action} {}: {error}", path.display()))
}

#[derive(Default)]
struct VerifyCounts {
    entries: usize,
    local: usize,
    remote: usize,
    inline: usize,
    orphaned: usize,
}

struct DiagnosticSink {
    limit: usize,
    values: Vec<Value>,
    total: usize,
    errors: usize,
    warnings: usize,
}

struct DiagnosticLocation<'a> {
    table: &'a TableMeta,
    field: &'a FieldMeta,
    row_id: &'a str,
    entry_id: Option<&'a str>,
    uri: Option<&'a str>,
}

impl DiagnosticSink {
    fn new(limit: usize) -> Self {
        Self {
            limit,
            values: Vec::new(),
            total: 0,
            errors: 0,
            warnings: 0,
        }
    }

    fn push(
        &mut self,
        severity: &str,
        code: &str,
        location: Option<DiagnosticLocation<'_>>,
        message: String,
    ) {
        self.total += 1;
        if severity == "error" {
            self.errors += 1;
        } else {
            self.warnings += 1;
        }
        if self.values.len() >= self.limit {
            return;
        }
        let mut value = json!({
            "severity": severity,
            "code": code,
            "message": message,
        });
        if let Some(location) = location {
            value["table"] = json!({"id": location.table.id, "name": location.table.name});
            value["field"] = json!({"id": location.field.id, "name": location.field.name});
            value["rowId"] = json!(location.row_id);
            if let Some(entry_id) = location.entry_id {
                value["entryId"] = json!(entry_id);
            }
            if let Some(uri) = location.uri {
                value["uri"] = json!(uri);
            }
        }
        self.values.push(value);
    }
}

fn verify(file: PathBuf, args: AttachmentVerifyArgs) -> Result<CommandOutput> {
    let context = attachment_file_context(&file, false)?;
    let conn = open_file(&file, false)?;
    let meta = load_file_meta(&conn)?;
    let tables = load_tables(&conn)?;
    let all_fields = load_fields(&conn)?;
    let mut diagnostics = DiagnosticSink::new(args.diagnostics_limit);
    let mut counts = VerifyCounts::default();
    let mut referenced_paths = HashSet::new();
    let mut entry_ids = HashMap::<String, String>::new();
    let mut path_metadata = HashMap::<String, (u64, String)>::new();
    let mut inspected = HashMap::<String, std::result::Result<Inspection, String>>::new();

    for table in &tables {
        let table_fields = all_fields
            .iter()
            .filter(|field| field.table_id == table.id)
            .cloned()
            .collect::<Vec<_>>();
        let file_fields = table_fields
            .iter()
            .filter(|field| field.field_type == FieldType::File && field.physical_name.is_some())
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
                &conn,
                table,
                &table_fields,
                &query,
                &ReadRowsOptions {
                    projection: Some(projection.clone()),
                    include_virtual: false,
                    limit: Some(VERIFY_PAGE_SIZE),
                    offset: Some(offset),
                },
            )?;
            if page.rows.is_empty() {
                break;
            }
            let page_len = u32::try_from(page.rows.len())
                .map_err(|_| AppError::internal("attachment verification page is too large"))?;
            for row in page.rows {
                let row_id = row.get("_id").and_then(Value::as_str).unwrap_or("unknown");
                for field in &file_fields {
                    let Some(value) = row.get(&field.name) else {
                        continue;
                    };
                    if let Err(error) = coerce_value(field, value) {
                        diagnostics.push(
                            "error",
                            "invalid-file-value",
                            Some(DiagnosticLocation {
                                table,
                                field,
                                row_id,
                                entry_id: None,
                                uri: None,
                            }),
                            error.to_string(),
                        );
                        continue;
                    }
                    let Some(entries) = value.as_array() else {
                        if !value.is_null() {
                            diagnostics.push(
                                "error",
                                "invalid-file-value",
                                Some(DiagnosticLocation {
                                    table,
                                    field,
                                    row_id,
                                    entry_id: None,
                                    uri: None,
                                }),
                                "File field is not an array".into(),
                            );
                        }
                        continue;
                    };
                    for entry in entries {
                        counts.entries += 1;
                        verify_entry(
                            &context,
                            table,
                            field,
                            row_id,
                            entry,
                            &mut counts,
                            &mut diagnostics,
                            &mut referenced_paths,
                            &mut entry_ids,
                            &mut path_metadata,
                            &mut inspected,
                        );
                    }
                }
            }
            offset = offset
                .checked_add(page_len)
                .ok_or_else(|| AppError::internal("attachment verification row count overflow"))?;
            if page_len < VERIFY_PAGE_SIZE {
                break;
            }
        }
    }
    scan_orphans(&context, &referenced_paths, &mut counts, &mut diagnostics)?;
    let valid = diagnostics.errors == 0;
    Ok(CommandOutput {
        value: json!({
            "fileId": meta.file_id,
            "revision": meta.revision.to_string(),
            "valid": valid,
            "summary": {
                "entries": counts.entries,
                "local": counts.local,
                "remote": counts.remote,
                "inline": counts.inline,
                "orphaned": counts.orphaned,
                "errors": diagnostics.errors,
                "warnings": diagnostics.warnings,
            },
            "diagnostics": diagnostics.values,
            "truncated": diagnostics.total > args.diagnostics_limit,
        }),
        success: valid,
    })
}

#[allow(clippy::too_many_arguments)]
fn verify_entry(
    context: &AttachmentFileContext,
    table: &TableMeta,
    field: &FieldMeta,
    row_id: &str,
    value: &Value,
    counts: &mut VerifyCounts,
    diagnostics: &mut DiagnosticSink,
    referenced_paths: &mut HashSet<String>,
    entry_ids: &mut HashMap<String, String>,
    path_metadata: &mut HashMap<String, (u64, String)>,
    inspected: &mut HashMap<String, std::result::Result<Inspection, String>>,
) {
    let invalid = || DiagnosticLocation {
        table,
        field,
        row_id,
        entry_id: value.get("id").and_then(Value::as_str),
        uri: value.get("uri").and_then(Value::as_str),
    };
    let Some(object) = value.as_object() else {
        diagnostics.push(
            "error",
            "invalid-file-entry",
            Some(invalid()),
            "File entry is not an object".into(),
        );
        return;
    };
    let members = (
        object.get("id").and_then(Value::as_str),
        object.get("name").and_then(Value::as_str),
        object.get("mediaType").and_then(Value::as_str),
        object.get("size").and_then(Value::as_str),
        object.get("uri").and_then(Value::as_str),
    );
    let (Some(id), Some(_name), Some(media_type), Some(size), Some(uri)) = members else {
        diagnostics.push(
            "error",
            "invalid-file-entry",
            Some(invalid()),
            "File entry is missing a required string member".into(),
        );
        return;
    };
    let signature = serde_json::to_string(value).unwrap_or_default();
    if let Some(previous) = entry_ids.insert(id.to_string(), signature.clone())
        && previous != signature
    {
        diagnostics.push(
            "error",
            "conflicting-entry-id",
            Some(DiagnosticLocation {
                table,
                field,
                row_id,
                entry_id: Some(id),
                uri: Some(uri),
            }),
            "The same File entry ID is reused with conflicting metadata".into(),
        );
    }
    if uri.starts_with("data:") {
        counts.inline += 1;
        return;
    }
    if uri
        .get(..8)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("https://"))
    {
        counts.remote += 1;
        return;
    }
    counts.local += 1;
    let Some((_, decoded_path)) = normalize_relative_file_uri(uri) else {
        diagnostics.push(
            "error",
            "unsafe-local-uri",
            Some(DiagnosticLocation {
                table,
                field,
                row_id,
                entry_id: Some(id),
                uri: Some(uri),
            }),
            "Local attachment URI is not a safe contained file path".into(),
        );
        return;
    };
    referenced_paths.insert(decoded_path.clone());
    let inspection = inspected
        .entry(decoded_path.clone())
        .or_insert_with(|| {
            resolve_local_path(&context.root, &decoded_path)
                .and_then(|path| inspect_ordinary_file(&path))
                .map_err(|error| error.message)
        })
        .clone();
    let inspection = match inspection {
        Ok(inspection) => inspection,
        Err(message) => {
            diagnostics.push(
                "error",
                "unavailable-local-asset",
                Some(DiagnosticLocation {
                    table,
                    field,
                    row_id,
                    entry_id: Some(id),
                    uri: Some(uri),
                }),
                message,
            );
            return;
        }
    };
    let declared_size = size.parse::<u64>();
    if declared_size != Ok(inspection.size) {
        diagnostics.push(
            "error",
            "size-mismatch",
            Some(DiagnosticLocation {
                table,
                field,
                row_id,
                entry_id: Some(id),
                uri: Some(uri),
            }),
            format!(
                "Attachment is {} bytes but metadata declares {size}",
                inspection.size
            ),
        );
    }
    if let Some(detected) = sniff_media_type(&inspection.header)
        && media_type != "application/octet-stream"
        && detected != media_type
    {
        diagnostics.push(
            "error",
            "media-type-mismatch",
            Some(DiagnosticLocation {
                table,
                field,
                row_id,
                entry_id: Some(id),
                uri: Some(uri),
            }),
            format!("Attachment media type is {detected:?} but metadata declares {media_type:?}"),
        );
    }
    if let Some(previous) = path_metadata.insert(
        decoded_path.clone(),
        (inspection.size, media_type.to_string()),
    ) && previous != (inspection.size, media_type.to_string())
    {
        diagnostics.push(
            "error",
            "conflicting-path-metadata",
            Some(DiagnosticLocation {
                table,
                field,
                row_id,
                entry_id: Some(id),
                uri: Some(uri),
            }),
            "The same local path is referenced with conflicting metadata".into(),
        );
    }
}

fn scan_orphans(
    context: &AttachmentFileContext,
    referenced_paths: &HashSet<String>,
    counts: &mut VerifyCounts,
    diagnostics: &mut DiagnosticSink,
) -> Result<()> {
    if !context.asset_root.exists() {
        return Ok(());
    }
    let mut pending = vec![context.asset_root.clone()];
    let mut scanned = 0_usize;
    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(&directory)
            .map_err(|error| attachment_io("scan managed assets folder", &directory, error))?
        {
            let entry = entry
                .map_err(|error| attachment_io("scan managed assets folder", &directory, error))?;
            scanned += 1;
            if scanned > VERIFY_ASSET_LIMIT {
                diagnostics.push(
                    "error",
                    "asset-scan-limit",
                    None,
                    format!("Managed assets folder exceeds {VERIFY_ASSET_LIMIT} entries"),
                );
                return Ok(());
            }
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path)
                .map_err(|error| attachment_io("inspect managed asset", &path, error))?;
            if metadata.file_type().is_symlink() {
                diagnostics.push(
                    "error",
                    "managed-asset-symlink",
                    None,
                    format!(
                        "Managed assets folder contains a symlink: {}",
                        path.display()
                    ),
                );
                continue;
            }
            if metadata.is_dir() {
                pending.push(path);
                continue;
            }
            if !metadata.is_file() {
                diagnostics.push(
                    "warning",
                    "unsupported-managed-entry",
                    None,
                    format!(
                        "Managed assets folder contains a non-file entry: {}",
                        path.display()
                    ),
                );
                continue;
            }
            let relative = path
                .strip_prefix(&context.root)
                .map_err(|_| AppError::internal("managed asset escaped its root"))?;
            let decoded = slash_path(relative)?;
            if !referenced_paths.contains(&decoded) {
                counts.orphaned += 1;
                let staged = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| {
                        name.starts_with(".eidos-asset-") && name.ends_with(".tmp")
                    });
                diagnostics.push(
                    "warning",
                    if staged {
                        "orphaned-stage"
                    } else {
                        "orphaned-asset"
                    },
                    None,
                    format!("Managed asset is not referenced by any File field: {decoded}"),
                );
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn portable_names_avoid_reserved_and_invalid_components() {
        assert_eq!(portable_asset_name(" CON.txt "), "_CON.txt");
        assert_eq!(
            portable_asset_name("report:final?.pdf"),
            "report_final_.pdf"
        );
    }

    #[test]
    fn media_detection_prefers_file_signatures() {
        assert_eq!(
            detect_media_type(
                &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a],
                "wrong.txt"
            ),
            "image/png"
        );
        assert_eq!(detect_media_type(b"plain", "notes.md"), "text/markdown");
        assert_eq!(
            detect_media_type(&[0x50, 0x4b, 0x03, 0x04], "report.docx"),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
    }
}
