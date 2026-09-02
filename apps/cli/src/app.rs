use std::collections::HashSet;
use std::fs;
use std::io::{self, Read};
use std::net::{Ipv4Addr, TcpListener};
use std::path::{Path, PathBuf};

use eidos_file_core::ddl::{configure_connection, create_eidos_file};
use eidos_file_core::model::{
    FieldMeta, FieldType, FileMeta, OnDeletePolicy, RelationCardinality, RelationDirection,
    TableMeta, ViewMeta, load_fields, load_file_meta, load_formula_fields, load_lookup_fields,
    load_relation_fields, load_tables, load_views,
};
use eidos_file_core::query::{
    FilterNode, ReadRowsOptions, RowQuery, SearchSpec, SortTerm, read_rows,
};
use eidos_file_core::rows::{
    RowChange, RowMutation, ensure_revision, mutate_rows, mutate_rows_in_transaction,
};
use eidos_file_core::schema_ops::{
    SchemaLeafChange, apply_initial_table, apply_schema_change, preview_schema_change,
};
use eidos_file_core::validate::{ValidationLevel, validate};
use eidos_file_core::view_ops::{
    SavedViewQuery, ViewChange, ViewMutationRequest, ViewPatch, mutate_views, preview_views,
};
use eidos_file_core::{EidosError, Result as CoreResult};
use rusqlite::{Connection, OpenFlags, TransactionBehavior};
use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::cli::{
    AccountArgs, ApplyArgs, CardSizeArg, CollectArgs, Command, ContextArgs, CreateArgs,
    FieldAddArgs, FieldArgs, FieldCommand, FieldDeleteArgs, FieldRenameArgs, FieldUpdateArgs,
    FileArgs, FormulaAddArgs, FormulaArgs, FormulaCommand, FormulaDeleteArgs, FormulaPreviewArgs,
    FormulaUpdateArgs, LookupAddArgs, LookupArgs, LookupCommand, LookupDeleteArgs,
    LookupUpdateArgs, PublishArgs, QueryArgs, RelationAddArgs, RelationArgs, RelationCommand,
    RelationUpdateArgs, RowAddArgs, RowCommand, RowDeleteArgs, RowMutateArgs, RowUpdateArgs,
    RowUpsertArgs, RowsArgs, SchemaApplyArgs, SchemaArgs, ServeArgs, SkillsArgs, SkillsCommand,
    StandardViewTypeArg, TableArgs, TableCommand, TableCreateArgs, TableDeleteArgs,
    TableRenameArgs, TableUpdateArgs, UpgradeArgs, ValidateArgs, ValidationLevelArg, ViewApplyArgs,
    ViewArgs, ViewCommand, ViewCreateArgs, ViewDeleteArgs, ViewInspectArgs, ViewListArgs,
    ViewUpdateArgs,
};
use crate::error::{AppError, Result};
use crate::relay_auth::{login_account, logout_account, sign_in_and_claim, whoami_account};
use crate::runtime::with_session as with_runtime_session;

pub struct CommandOutput {
    pub value: Value,
    pub success: bool,
}

impl CommandOutput {
    pub(crate) fn success(value: Value) -> Self {
        Self {
            value,
            success: true,
        }
    }
}

pub fn run(command: Command, show_progress: bool) -> Result<CommandOutput> {
    match command {
        Command::Login(args) => login(args),
        Command::Whoami(args) => whoami(args),
        Command::Logout(args) => logout(args),
        Command::Upgrade(args) => upgrade(args),
        Command::Skills(args) => skills(args),
        Command::Create(args) => create(args),
        Command::Inspect(args) => inspect(args),
        Command::Tables(args) => tables(args),
        Command::Schema(args) => schema(args),
        Command::Context(args) => context(args),
        Command::Query(args) => query(args),
        Command::Apply(args) => apply(args),
        Command::Rows(args) => rows(args),
        Command::Attachment(args) => crate::attachment::run(args),
        Command::Validate(args) => validate_file(args),
        Command::SchemaApply(args) => schema_apply(args),
        Command::ViewApply(args) => view_apply(args),
        Command::View(args) => view(*args),
        Command::Table(args) => table(*args),
        Command::Field(args) => field(*args),
        Command::Relation(args) => relation(*args),
        Command::Formula(args) => formula(*args),
        Command::Lookup(args) => lookup(*args),
        Command::Serve(args) => serve_file(args),
        Command::Publish(args) => publish_file(args, show_progress),
        Command::Collect(args) => collect_form(args, show_progress),
    }
}

fn skills(args: SkillsArgs) -> Result<CommandOutput> {
    match args.command {
        SkillsCommand::Init(args) => crate::skills::init(args),
    }
}

fn collect_form(args: CollectArgs, show_progress: bool) -> Result<CommandOutput> {
    ensure_eidos_path(&args.file)?;
    if !args.file.is_file() {
        return Err(AppError::invalid_request(format!(
            "Eidos File does not exist: {}",
            args.file.display()
        )));
    }
    Ok(CommandOutput::success(crate::collect::run(
        args,
        show_progress,
    )?))
}

fn publish_file(args: PublishArgs, show_progress: bool) -> Result<CommandOutput> {
    let progress = crate::publish::PublishProgress::new(show_progress, args.progress_json);
    let attachment_root = publish_attachment_root(&args.file, args.attachment_root.as_deref());
    let extension = args
        .file
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| {
            AppError::invalid_request("Publish supports .eidos, .md, and .markdown files")
        })?;
    let (source_kind, attachments, generated_source) = match extension.as_str() {
        "eidos" => {
            progress.stage("validating local Eidos File");
            let conn = open_file(&args.file, false)?;
            let report = validate(&conn, ValidationLevel::Semantic, 100)?;
            if !report.valid {
                return Err(AppError::invalid_request(format!(
                    "cannot publish an invalid Eidos File ({} diagnostics)",
                    report.diagnostics.len()
                )));
            }
            progress.stage("local Eidos File is valid");
            if let Some(selector) = args.form_view.as_deref() {
                progress.stage(format!("building Form definition from View {selector:?}"));
                let definition = crate::publish::build_form_definition(&conn, selector)?;
                progress.stage("local Form View is valid");
                (
                    crate::publish::PublishSourceKind::Form,
                    Vec::new(),
                    Some(definition),
                )
            } else {
                let attachments =
                    crate::publish::discover_eidos_attachments(&conn, &attachment_root, progress)?;
                (crate::publish::PublishSourceKind::Eidos, attachments, None)
            }
        }
        "md" | "markdown" => {
            if args.form_view.is_some() {
                return Err(AppError::invalid_request(
                    "--form-view can be used only with a .eidos file",
                ));
            }
            if !args.file.is_file() {
                return Err(AppError::invalid_request(format!(
                    "Markdown file does not exist: {}",
                    args.file.display()
                )));
            }
            progress.stage("validating local Markdown document");
            let attachments = crate::publish::discover_markdown_attachments(
                &args.file,
                &attachment_root,
                progress,
            )?;
            progress.stage("local Markdown document is valid");
            (
                crate::publish::PublishSourceKind::Markdown,
                attachments,
                None,
            )
        }
        _ => {
            return Err(AppError::invalid_request(
                "Publish supports .eidos, .md, and .markdown files",
            ));
        }
    };
    Ok(CommandOutput::success(crate::publish::run(
        args,
        source_kind,
        attachments,
        generated_source,
        progress,
    )?))
}

fn publish_attachment_root(file: &Path, configured: Option<&Path>) -> PathBuf {
    configured.map(Path::to_path_buf).unwrap_or_else(|| {
        file.parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."))
            .to_path_buf()
    })
}

fn upgrade(args: UpgradeArgs) -> Result<CommandOutput> {
    Ok(CommandOutput::success(crate::upgrade::run(args)?))
}

fn login(args: AccountArgs) -> Result<CommandOutput> {
    let account = login_account(&args.account_origin)
        .map_err(|error| AppError::internal(error.to_string()))?;
    Ok(CommandOutput::success(json!({
        "loggedIn": true,
        "issuer": account.issuer,
        "accountId": account.subject,
        "storage": "user-config-file",
    })))
}

fn whoami(args: AccountArgs) -> Result<CommandOutput> {
    let account = whoami_account(&args.account_origin)
        .map_err(|error| AppError::internal(error.to_string()))?;
    Ok(CommandOutput::success(json!({
        "loggedIn": true,
        "issuer": account.issuer,
        "accountId": account.subject,
    })))
}

fn logout(args: AccountArgs) -> Result<CommandOutput> {
    let removed = logout_account(&args.account_origin)
        .map_err(|error| AppError::internal(error.to_string()))?;
    Ok(CommandOutput::success(json!({
        "loggedOut": true,
        "removedLocalCredential": removed,
        "issuer": args.account_origin,
    })))
}

fn serve_file(args: ServeArgs) -> Result<CommandOutput> {
    // Preflight: require an existing, well-formed .eidos file before binding
    // the port; run_serve opens its own connection afterwards.
    drop(open_file(&args.file, !args.publish)?);
    let relay = if args.relay {
        drop(
            TcpListener::bind((Ipv4Addr::LOCALHOST, args.port)).map_err(|error| {
                AppError::invalid_request(format!(
                    "cannot start Eidos Serve on 127.0.0.1:{}: {error}",
                    args.port
                ))
            })?,
        );
        Some(
            sign_in_and_claim(&args.account_origin, &args.relay_origin, args.share)
                .map_err(|error| AppError::internal(error.to_string()))?,
        )
    } else {
        None
    };
    qjs_host::serve::run_serve(
        &args.file,
        qjs_host::serve::ServeOptions {
            port: args.port,
            ui_dir: args.ui_dir,
            assets_dir: args.assets_dir,
            open_browser: args.open,
            lan: args.lan,
            requested_host: args.host,
            relay,
            publish: args.publish,
        },
    )
    .map_err(|error| AppError::internal(error.to_string()))?;
    Ok(CommandOutput::success(json!({ "served": true })))
}

fn ensure_eidos_path(path: &Path) -> Result<()> {
    let is_eidos = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("eidos"));
    if !is_eidos {
        return Err(AppError::invalid_request(format!(
            "expected a .eidos file path, got {}",
            path.display()
        )));
    }
    Ok(())
}

pub(crate) fn open_file(path: &Path, writable: bool) -> Result<Connection> {
    ensure_eidos_path(path)?;
    if !path.is_file() {
        return Err(EidosError::NotFound(format!("file {}", path.display())).into());
    }
    let flags = if writable {
        OpenFlags::SQLITE_OPEN_READ_WRITE
    } else {
        OpenFlags::SQLITE_OPEN_READ_ONLY
    } | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let conn = Connection::open_with_flags(path, flags).map_err(EidosError::from)?;
    configure_connection(&conn)?;
    load_file_meta(&conn)?;
    Ok(conn)
}

fn read_json_source(source: &str) -> Result<Value> {
    let text = if source == "-" {
        let mut text = String::new();
        io::stdin().read_to_string(&mut text)?;
        text
    } else if let Some(path) = source.strip_prefix('@') {
        fs::read_to_string(path)?
    } else {
        source.to_string()
    };
    Ok(serde_json::from_str(&text)?)
}

fn parse_object(source: &str, label: &str) -> Result<Map<String, Value>> {
    read_json_source(source)?
        .as_object()
        .cloned()
        .ok_or_else(|| AppError::invalid_request(format!("{label} must be a JSON object")))
}

fn parse_stored_object(source: &str, label: &str) -> Result<Map<String, Value>> {
    serde_json::from_str::<Value>(source)?
        .as_object()
        .cloned()
        .ok_or_else(|| AppError::invalid_request(format!("{label} must be a JSON object")))
}

fn schema_batch(mut leaves: Vec<Value>) -> Value {
    if leaves.len() == 1 {
        leaves.pop().expect("one schema change")
    } else {
        json!({ "kind": "batch", "changes": leaves })
    }
}

fn public_schema_operation(mut value: Value) -> Value {
    if let Some(object) = value.as_object_mut() {
        match object.get("kind").and_then(Value::as_str) {
            Some("batch") => {
                if let Some(changes) = object.get_mut("changes").and_then(Value::as_array_mut) {
                    for change in changes {
                        *change = public_schema_operation(change.take());
                    }
                }
            }
            Some("create-table") => {
                if let Some(fields) = object.get_mut("fields").and_then(Value::as_array_mut) {
                    for field in fields {
                        if let Some(field) = field.as_object_mut() {
                            field.remove("nullable");
                        }
                    }
                }
            }
            Some("create-field") => {
                if let Some(field) = object.get_mut("field").and_then(Value::as_object_mut) {
                    field.remove("nullable");
                }
            }
            Some("convert-field") => {
                object.remove("toNullable");
            }
            _ => {}
        }
    }
    value
}

fn file_meta_json(path: &Path, meta: &FileMeta) -> Value {
    json!({
        "path": path,
        "fileId": meta.file_id,
        "formatVersion": format!("{}.{}", meta.format_major, meta.format_minor),
        "title": meta.title,
        "defaultTableId": meta.default_table_id,
        "revision": meta.revision.to_string(),
        "createdAt": meta.created_at,
        "updatedAt": meta.updated_at,
    })
}

fn create(args: CreateArgs) -> Result<CommandOutput> {
    ensure_eidos_path(&args.file)?;
    create_eidos_file(&args.file, args.title.as_deref())?;
    let result = (|| -> Result<Value> {
        let mut conn = open_file(&args.file, true)?;
        let mut schema_result = None;
        let mut default_view_id = None;
        if let Some(table) = args.table {
            let fields = read_json_source(args.fields.as_deref().expect("clap requires fields"))?;
            let fields = fields.as_array().ok_or_else(|| {
                AppError::invalid_request("--fields must be a JSON array of field definitions")
            })?;
            let mut operation = json!({
                "kind": "create-table",
                "clientKey": "initial-table",
                "name": table,
                "fields": fields,
            });
            if let Some(label_field) = args.label_field {
                operation["labelField"] = json!(label_field);
            }
            let change = normalize_schema_change(&conn, operation)?;
            let initialized = apply_initial_table(&mut conn, &change)?;
            default_view_id = Some(initialized.view_id);
            schema_result = Some(initialized.schema);
        }
        let meta = load_file_meta(&conn)?;
        Ok(json!({
            "created": true,
            "file": file_meta_json(&args.file, &meta),
            "schemaMutation": schema_result,
            "defaultViewId": default_view_id,
        }))
    })();
    match result {
        Ok(value) => Ok(CommandOutput::success(value)),
        Err(error) => {
            let _ = fs::remove_file(&args.file);
            Err(error)
        }
    }
}

fn inspect(FileArgs { file }: FileArgs) -> Result<CommandOutput> {
    let conn = open_file(&file, false)?;
    let meta = load_file_meta(&conn)?;
    let tables = load_tables(&conn)?;
    let views = load_views(&conn)?;
    Ok(CommandOutput::success(json!({
        "file": file_meta_json(&file, &meta),
        "fileId": meta.file_id,
        "revision": meta.revision.to_string(),
        "counts": { "tables": tables.len(), "views": views.len() },
        "capabilities": {
            "query": true,
            "mutateRows": true,
            "attachments": true,
            "mutateView": true,
            "mutateSchema": true,
            "validate": true,
            "formulaPreview": true,
            "formulaEvaluation": true,
            "lookupEvaluation": true,
        },
    })))
}

fn table_json(table: &TableMeta) -> Value {
    json!({
        "id": table.id,
        "name": table.name,
        "labelFieldId": table.label_field_id,
        "position": table.position.to_string(),
        "settings": parse_stored_json(&table.settings_json),
        "createdAt": table.created_at,
        "updatedAt": table.updated_at,
    })
}

fn field_json(field: &FieldMeta) -> Value {
    json!({
        "id": field.id,
        "tableId": field.table_id,
        "name": field.name,
        "type": field.field_type,
        "systemRole": field.system_role,
        "position": field.position.to_string(),
        "settings": parse_stored_json(&field.settings_json),
        "stored": field.physical_name.is_some(),
    })
}

fn parse_stored_json(text: &str) -> Value {
    serde_json::from_str(text).unwrap_or_else(|_| json!({ "invalidJson": text }))
}

fn tables(FileArgs { file }: FileArgs) -> Result<CommandOutput> {
    let conn = open_file(&file, false)?;
    let meta = load_file_meta(&conn)?;
    let tables: Vec<Value> = load_tables(&conn)?.iter().map(table_json).collect();
    Ok(CommandOutput::success(json!({
        "fileId": meta.file_id,
        "revision": meta.revision.to_string(),
        "tables": tables,
    })))
}

fn schema(SchemaArgs { file, table }: SchemaArgs) -> Result<CommandOutput> {
    let conn = open_file(&file, false)?;
    let meta = load_file_meta(&conn)?;
    let all_tables = load_tables(&conn)?;
    let all_fields = load_fields(&conn)?;
    let selected: Vec<TableMeta> = match table {
        Some(reference) => vec![resolve_table(&all_tables, &reference)?.clone()],
        None => all_tables,
    };
    let selected_ids: Vec<&str> = selected.iter().map(|table| table.id.as_str()).collect();
    let fields: Vec<FieldMeta> = all_fields
        .into_iter()
        .filter(|field| selected_ids.contains(&field.table_id.as_str()))
        .collect();
    let relations: Vec<Value> = load_relation_fields(&conn)?
        .into_iter()
        .filter(|relation| fields.iter().any(|field| field.id == relation.field_id))
        .map(|relation| {
            json!({
                "fieldId": relation.field_id,
                "direction": relation.direction,
                "targetTableId": relation.target_table_id,
                "cardinality": relation.cardinality,
                "inverseOfFieldId": relation.inverse_of_field_id,
                "onDelete": relation.on_delete,
            })
        })
        .collect();
    let formulas: Vec<Value> = load_formula_fields(&conn)?
        .into_iter()
        .filter(|definition| fields.iter().any(|field| field.id == definition.field_id))
        .map(|definition| {
            json!({
                "fieldId": definition.field_id,
                "sourceText": definition.source_text,
                "resultType": definition.result_type,
            })
        })
        .collect();
    let lookups: Vec<Value> = load_lookup_fields(&conn)?
        .into_iter()
        .filter(|definition| fields.iter().any(|field| field.id == definition.field_id))
        .map(|definition| {
            json!({
                "fieldId": definition.field_id,
                "relationFieldId": definition.relation_field_id,
                "targetFieldId": definition.target_field_id,
                "aggregate": definition.aggregate,
                "distinctValues": definition.distinct_values,
            })
        })
        .collect();
    let views: Vec<Value> = load_views(&conn)?
        .into_iter()
        .filter(|view| selected_ids.contains(&view.table_id.as_str()))
        .map(|view| {
            json!({
                "id": view.id,
                "tableId": view.table_id,
                "name": view.name,
                "type": view.view_type,
                "query": parse_stored_json(&view.query_json),
                "layout": parse_stored_json(&view.layout_json),
                "position": view.position.to_string(),
            })
        })
        .collect();
    let tables: Vec<Value> = selected
        .iter()
        .map(|table| {
            let mut value = table_json(table);
            value["fields"] = Value::Array(
                fields
                    .iter()
                    .filter(|field| field.table_id == table.id)
                    .map(field_json)
                    .collect(),
            );
            value
        })
        .collect();
    Ok(CommandOutput::success(json!({
        "fileId": meta.file_id,
        "revision": meta.revision.to_string(),
        "title": meta.title,
        "defaultTableId": meta.default_table_id,
        "tables": tables,
        "relations": relations,
        "formulas": formulas,
        "lookups": lookups,
        "views": views,
    })))
}

fn context(args: ContextArgs) -> Result<CommandOutput> {
    let conn = open_file(&args.file, false)?;
    let meta = load_file_meta(&conn)?;
    let tables = load_tables(&conn)?;
    let all_fields = load_fields(&conn)?;

    let selected = match args.table.as_deref() {
        Some(reference) => Some(resolve_table(&tables, reference)?),
        None => match meta.default_table_id.as_deref() {
            Some(default_id) => Some(resolve_table(&tables, default_id)?),
            None => match tables.as_slice() {
                [only] => Some(only),
                _ => None,
            },
        },
    };

    let Some(table) = selected else {
        let summaries: Vec<Value> = tables
            .iter()
            .map(|table| {
                let label = all_fields
                    .iter()
                    .find(|field| field.id == table.label_field_id)
                    .map(|field| field.name.as_str());
                json!({
                    "id": table.id,
                    "name": table.name,
                    "labelField": label,
                })
            })
            .collect();
        return Ok(CommandOutput::success(json!({
            "revision": meta.revision.to_string(),
            "title": meta.title,
            "requiresTable": tables.len() > 1,
            "tables": summaries,
        })));
    };

    let fields: Vec<FieldMeta> = all_fields
        .into_iter()
        .filter(|field| field.table_id == table.id)
        .collect();
    let relations = load_relation_fields(&conn)?;
    let query = parse_row_query(
        args.where_json.as_deref(),
        args.sort.as_deref(),
        args.search,
        args.search_fields,
        &fields,
        &table.id,
    )?;
    let projection = if args.fields.is_empty() {
        (!args.full).then(|| {
            fields
                .iter()
                .filter(|field| field.system_role.is_none())
                .map(|field| field.name.clone())
                .collect()
        })
    } else {
        Some(args.fields)
    };
    let page = if fields.iter().any(|field| field.physical_name.is_none()) {
        runtime_query_rows(
            &args.file,
            &table.id,
            &fields,
            &query,
            projection,
            args.limit,
            args.offset,
        )?
    } else {
        read_rows(
            &conn,
            table,
            &fields,
            &query,
            &ReadRowsOptions {
                projection,
                include_virtual: false,
                limit: Some(args.limit),
                offset: Some(args.offset),
            },
        )?
    };
    let label = fields
        .iter()
        .find(|field| field.id == table.label_field_id)
        .map(|field| field.name.as_str());

    let value = if args.full {
        let relation_values: Vec<Value> = relations
            .iter()
            .filter(|relation| fields.iter().any(|field| field.id == relation.field_id))
            .map(|relation| {
                json!({
                    "fieldId": relation.field_id,
                    "direction": relation.direction,
                    "targetTableId": relation.target_table_id,
                    "cardinality": relation.cardinality,
                    "inverseOfFieldId": relation.inverse_of_field_id,
                    "onDelete": relation.on_delete,
                })
            })
            .collect();
        let views: Vec<Value> = load_views(&conn)?
            .into_iter()
            .filter(|view| view.table_id == table.id)
            .map(|view| {
                json!({
                    "id": view.id,
                    "name": view.name,
                    "type": view.view_type,
                    "query": parse_stored_json(&view.query_json),
                    "layout": parse_stored_json(&view.layout_json),
                    "position": view.position.to_string(),
                })
            })
            .collect();
        json!({
            "compact": false,
            "revision": meta.revision.to_string(),
            "file": file_meta_json(&args.file, &meta),
            "table": table_json(table),
            "labelField": label,
            "fields": fields.iter().map(field_json).collect::<Vec<_>>(),
            "relations": relation_values,
            "views": views,
            "rows": page.rows,
            "totalEstimate": page.total_estimate,
            "limit": args.limit,
            "offset": args.offset,
        })
    } else {
        let compact_fields: Vec<Value> = fields
            .iter()
            .filter(|field| field.system_role.is_none())
            .map(|field| {
                let settings = parse_stored_json(&field.settings_json);
                let options = settings
                    .get("options")
                    .and_then(Value::as_array)
                    .map(|options| {
                        options
                            .iter()
                            .filter_map(|option| option.get("name").and_then(Value::as_str))
                            .collect::<Vec<_>>()
                    });
                let relation = relations
                    .iter()
                    .find(|relation| relation.field_id == field.id)
                    .map(|relation| {
                        let target = tables
                            .iter()
                            .find(|target| target.id == relation.target_table_id)
                            .map(|target| target.name.as_str());
                        json!({
                            "direction": relation.direction,
                            "targetTable": target,
                            "cardinality": relation.cardinality,
                            "onDelete": relation.on_delete,
                        })
                    });
                let mut value = json!({
                    "name": field.name,
                    "type": field.field_type,
                });
                if let Some(options) = options {
                    value["options"] = json!(options);
                }
                if let Some(relation) = relation {
                    value["relation"] = relation;
                }
                value
            })
            .collect();
        json!({
            "compact": true,
            "revision": meta.revision.to_string(),
            "title": meta.title,
            "table": { "name": table.name, "labelField": label },
            "fields": compact_fields,
            "rows": page.rows,
            "totalEstimate": page.total_estimate,
            "limit": args.limit,
            "offset": args.offset,
            "capabilities": {
                "apply": true,
                "formulaPreview": true,
                "formulaEvaluation": true,
                "lookupEvaluation": true,
            },
        })
    };
    Ok(CommandOutput::success(value))
}

fn parse_row_query(
    where_json: Option<&str>,
    sort_json: Option<&str>,
    search: Option<String>,
    search_fields: Vec<String>,
    fields: &[FieldMeta],
    table_id: &str,
) -> Result<RowQuery> {
    if search.is_some() && search_fields.is_empty() {
        return Err(AppError::invalid_request(
            "--search requires at least one --search-fields value",
        ));
    }
    let filter = where_json
        .map(read_json_source)
        .transpose()?
        .map(normalize_field_members)
        .map(|mut value| {
            resolve_query_field_ids(&mut value, fields, table_id)?;
            serde_json::from_value::<FilterNode>(value).map_err(AppError::from)
        })
        .transpose()?;
    let sort = sort_json
        .map(read_json_source)
        .transpose()?
        .map(normalize_field_members)
        .map(|mut value| {
            resolve_query_field_ids(&mut value, fields, table_id)?;
            serde_json::from_value::<Vec<SortTerm>>(value).map_err(AppError::from)
        })
        .transpose()?;
    let search_fields = search_fields
        .into_iter()
        .map(|reference| resolve_field_in_table(fields, table_id, &reference))
        .collect::<Result<Vec<_>>>()?;
    Ok(RowQuery {
        filter,
        search: search.map(|text| SearchSpec {
            text,
            fields: search_fields,
        }),
        sort,
    })
}

fn query(args: QueryArgs) -> Result<CommandOutput> {
    let conn = open_file(&args.file, false)?;
    let meta = load_file_meta(&conn)?;
    let tables = load_tables(&conn)?;
    let table = resolve_table(&tables, &args.table)?;
    let fields: Vec<FieldMeta> = load_fields(&conn)?
        .into_iter()
        .filter(|field| field.table_id == table.id)
        .collect();
    let query = parse_row_query(
        args.where_json.as_deref(),
        args.sort.as_deref(),
        args.search,
        args.search_fields,
        &fields,
        &table.id,
    )?;
    let projection = (!args.fields.is_empty()).then_some(args.fields);
    let page = if fields.iter().any(|field| field.physical_name.is_none()) {
        runtime_query_rows(
            &args.file,
            &table.id,
            &fields,
            &query,
            projection,
            args.limit,
            args.offset,
        )?
    } else {
        read_rows(
            &conn,
            table,
            &fields,
            &query,
            &ReadRowsOptions {
                projection,
                include_virtual: false,
                limit: Some(args.limit),
                offset: Some(args.offset),
            },
        )?
    };
    Ok(CommandOutput::success(json!({
        "fileId": meta.file_id,
        "revision": meta.revision.to_string(),
        "table": { "id": table.id, "name": table.name },
        "rows": page.rows,
        "totalEstimate": page.total_estimate,
        "limit": args.limit,
        "offset": args.offset,
    })))
}

fn runtime_query_rows(
    file: &Path,
    table_id: &str,
    fields: &[FieldMeta],
    query: &RowQuery,
    projection: Option<Vec<String>>,
    limit: u32,
    offset: u32,
) -> Result<eidos_file_core::query::RowPage> {
    let projection = projection
        .map(|references| {
            references
                .iter()
                .map(|reference| resolve_field_in_table(fields, table_id, reference))
                .collect::<Result<Vec<_>>>()
        })
        .transpose()?
        .unwrap_or_else(|| fields.iter().map(|field| field.id.clone()).collect());
    let query = serde_json::to_value(query)
        .map_err(|error| AppError::internal(format!("serialize Runtime query: {error}")))?;
    with_runtime_session(file, false, |session| {
        let page = session.call(
            "queryRows",
            &json!({
                "tableId": table_id,
                "query": query,
                "projection": {
                    "fields": projection,
                    "resolveRelations": [],
                },
                "limit": limit,
                "offset": offset,
            }),
        )?;
        let aggregate = session.call(
            "aggregate",
            &json!({
                "tableId": table_id,
                "query": query,
                "items": [{"key": "count", "op": "count-all"}],
            }),
        )?;
        let total_estimate = aggregate
            .get("results")
            .and_then(Value::as_array)
            .and_then(|results| results.first())
            .and_then(|result| result.get("value"))
            .and_then(|value| match value {
                Value::String(value) => value.parse::<u64>().ok(),
                Value::Number(value) => value.as_u64(),
                _ => None,
            });
        let columns = page
            .get("columns")
            .and_then(Value::as_array)
            .ok_or_else(|| AppError::internal("Runtime query response has no columns"))?;
        let raw_rows = page
            .get("rows")
            .and_then(Value::as_array)
            .ok_or_else(|| AppError::internal("Runtime query response has no rows"))?;
        let mut rows = Vec::with_capacity(raw_rows.len());
        for raw_row in raw_rows {
            let row_id = raw_row
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::internal("Runtime query row has no id"))?;
            let values = raw_row
                .get("values")
                .and_then(Value::as_array)
                .ok_or_else(|| AppError::internal("Runtime query row has no values"))?;
            if values.len() != columns.len() {
                return Err(AppError::internal(
                    "Runtime query row values do not match columns",
                ));
            }
            let mut row = Map::new();
            row.insert("_id".into(), json!(row_id));
            for (column, value) in columns.iter().zip(values.iter()) {
                let name = column
                    .get("name")
                    .and_then(Value::as_str)
                    .ok_or_else(|| AppError::internal("Runtime query column has no name"))?;
                row.insert(name.to_string(), value.clone());
            }
            rows.push(row);
        }
        Ok(eidos_file_core::query::RowPage {
            rows,
            total_estimate,
        })
    })
}

fn normalize_field_members(value: Value) -> Value {
    match value {
        Value::Array(items) => {
            Value::Array(items.into_iter().map(normalize_field_members).collect())
        }
        Value::Object(mut object) => {
            if !object.contains_key("fieldId")
                && let Some(field) = object.remove("field")
            {
                object.insert("fieldId".into(), field);
            }
            for value in object.values_mut() {
                *value = normalize_field_members(value.take());
            }
            Value::Object(object)
        }
        other => other,
    }
}

fn default_apply_expect() -> usize {
    1
}

fn default_apply_validation() -> ValidationLevel {
    ValidationLevel::Full
}

fn default_diagnostics_limit() -> usize {
    100
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApplyRequest {
    revision: String,
    table: String,
    #[serde(rename = "match")]
    match_values: Map<String, Value>,
    #[serde(default = "default_apply_expect")]
    expect: usize,
    set: Map<String, Value>,
    #[serde(default = "default_apply_validation")]
    validate: ValidationLevel,
    #[serde(default = "default_diagnostics_limit")]
    diagnostics_limit: usize,
    #[serde(default)]
    returning: Vec<String>,
}

fn apply(args: ApplyArgs) -> Result<CommandOutput> {
    let request: ApplyRequest = serde_json::from_value(read_json_source(&args.request)?)?;
    if request.match_values.is_empty() {
        return Err(AppError::invalid_request("apply match must not be empty"));
    }
    if request.set.is_empty() {
        return Err(AppError::invalid_request("apply set must not be empty"));
    }
    if !(1..=10_000).contains(&request.expect) {
        return Err(AppError::invalid_request(
            "apply expect must be between 1 and 10000",
        ));
    }
    if request.diagnostics_limit == 0 {
        return Err(AppError::invalid_request(
            "apply diagnosticsLimit must be positive",
        ));
    }

    let mut conn = open_file(&args.file, true)?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(EidosError::from)?;
    ensure_revision(&tx, &request.revision)?;
    let tables = load_tables(&tx)?;
    let table = resolve_table(&tables, &request.table)?.clone();
    let fields: Vec<FieldMeta> = load_fields(&tx)?
        .into_iter()
        .filter(|field| field.table_id == table.id)
        .collect();
    let match_filter = if request.match_values.len() == 1 {
        let (field_id, value) = request
            .match_values
            .iter()
            .next()
            .expect("non-empty match checked above");
        FilterNode::Eq {
            field_id: field_id.clone(),
            value: value.clone(),
        }
    } else {
        FilterNode::And {
            args: request
                .match_values
                .iter()
                .map(|(field_id, value)| FilterNode::Eq {
                    field_id: field_id.clone(),
                    value: value.clone(),
                })
                .collect(),
        }
    };
    let match_page = read_rows(
        &tx,
        &table,
        &fields,
        &RowQuery {
            filter: Some(match_filter),
            search: None,
            sort: None,
        },
        &ReadRowsOptions {
            projection: Some(Vec::new()),
            include_virtual: false,
            limit: Some(u32::try_from(request.expect + 1).expect("expect is bounded")),
            offset: Some(0),
        },
    )?;
    let matched = match_page
        .total_estimate
        .unwrap_or(match_page.rows.len() as u64);
    if matched != request.expect as u64 {
        return Err(AppError::invalid_request(format!(
            "apply expected {} matching row(s), found {matched}",
            request.expect
        )));
    }
    let row_ids: Vec<String> = match_page
        .rows
        .iter()
        .map(|row| {
            row.get("_id")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .ok_or_else(|| AppError::internal("matched row has no _id"))
        })
        .collect::<Result<_>>()?;
    let returning = if request.returning.is_empty() {
        request.set.keys().cloned().collect()
    } else {
        request.returning.clone()
    };
    let mutation = RowMutation {
        table_id: table.id.clone(),
        expected_revision: Some(request.revision.clone()),
        changes: row_ids
            .iter()
            .map(|row_id| RowChange::Update {
                row_id: row_id.clone(),
                values: request.set.clone(),
            })
            .collect(),
    };
    let result = mutate_rows_in_transaction(&tx, &mutation)?;
    let report = validate(&tx, request.validate, request.diagnostics_limit)?;
    let validation = json!({
        "level": request.validate,
        "valid": report.valid,
        "diagnostics": report.diagnostics,
        "truncated": report.truncated,
    });
    if !report.valid {
        tx.rollback().map_err(EidosError::from)?;
        return Ok(CommandOutput {
            value: json!({
                "applied": false,
                "rolledBack": true,
                "baseRevision": request.revision,
                "matched": matched,
                "validation": validation,
            }),
            success: false,
        });
    }
    let returned = read_rows(
        &tx,
        &table,
        &fields,
        &RowQuery {
            filter: Some(FilterNode::In {
                field_id: "_id".into(),
                values: row_ids.iter().cloned().map(Value::String).collect(),
            }),
            search: None,
            sort: None,
        },
        &ReadRowsOptions {
            projection: Some(returning),
            include_virtual: false,
            limit: Some(u32::try_from(request.expect).expect("expect is bounded")),
            offset: Some(0),
        },
    )?
    .rows;
    if result.changed {
        tx.commit().map_err(EidosError::from)?;
    } else {
        tx.rollback().map_err(EidosError::from)?;
    }
    Ok(CommandOutput::success(json!({
        "applied": true,
        "fileId": result.file_id,
        "baseRevision": request.revision,
        "revision": result.revision,
        "changed": result.changed,
        "matched": matched,
        "affectedRows": result.affected_rows,
        "rows": returned,
        "validation": validation,
    })))
}

fn rows(RowsArgs { file, command }: RowsArgs) -> Result<CommandOutput> {
    match command {
        RowCommand::Add(args) => rows_add(file, args),
        RowCommand::Update(args) => rows_update(file, args),
        RowCommand::Delete(args) => rows_delete(file, args),
        RowCommand::Mutate(args) => rows_mutate(file, args),
        RowCommand::Upsert(args) => rows_upsert(file, args),
    }
}

fn rows_add(file: PathBuf, args: RowAddArgs) -> Result<CommandOutput> {
    let mut conn = open_file(&file, true)?;
    let table_id = resolve_table_id(&conn, &args.table)?;
    let payload = read_json_source(&args.values)?;
    let objects = match payload {
        Value::Object(object) => vec![object],
        Value::Array(values) => values
            .into_iter()
            .enumerate()
            .map(|(index, value)| {
                value.as_object().cloned().ok_or_else(|| {
                    AppError::invalid_request(format!(
                        "row {} in --values is not a JSON object",
                        index + 1
                    ))
                })
            })
            .collect::<Result<Vec<_>>>()?,
        _ => {
            return Err(AppError::invalid_request(
                "--values must be a JSON object or array of objects",
            ));
        }
    };
    if objects.is_empty() {
        return Err(AppError::invalid_request(
            "--values array must not be empty",
        ));
    }
    let changes = objects
        .into_iter()
        .enumerate()
        .map(|(index, mut values)| {
            let client_key = values
                .remove("_clientKey")
                .and_then(|value| value.as_str().map(ToOwned::to_owned))
                .unwrap_or_else(|| format!("row-{}", index + 1));
            RowChange::Create { client_key, values }
        })
        .collect();
    let result = mutate_rows(
        &mut conn,
        &RowMutation {
            table_id,
            expected_revision: Some(args.expected_revision),
            changes,
        },
    )?;
    Ok(CommandOutput::success(json!(result)))
}

fn rows_update(file: PathBuf, args: RowUpdateArgs) -> Result<CommandOutput> {
    let mut conn = open_file(&file, true)?;
    let table_id = resolve_table_id(&conn, &args.table)?;
    let values = parse_object(&args.values, "--values")?;
    let result = mutate_rows(
        &mut conn,
        &RowMutation {
            table_id,
            expected_revision: Some(args.expected_revision),
            changes: vec![RowChange::Update {
                row_id: args.row_id,
                values,
            }],
        },
    )?;
    Ok(CommandOutput::success(json!(result)))
}

fn rows_delete(file: PathBuf, args: RowDeleteArgs) -> Result<CommandOutput> {
    let mut conn = open_file(&file, true)?;
    let table_id = resolve_table_id(&conn, &args.table)?;
    let result = mutate_rows(
        &mut conn,
        &RowMutation {
            table_id,
            expected_revision: Some(args.expected_revision),
            changes: args
                .row_ids
                .into_iter()
                .map(|row_id| RowChange::Delete { row_id })
                .collect(),
        },
    )?;
    Ok(CommandOutput::success(json!(result)))
}

fn rows_mutate(file: PathBuf, args: RowMutateArgs) -> Result<CommandOutput> {
    let changes: Vec<RowChange> = serde_json::from_value(read_json_source(&args.changes)?)?;
    execute_row_intent(
        file,
        args.table,
        args.expected_revision,
        changes,
        args.dry_run,
    )
}

fn execute_row_intent(
    file: PathBuf,
    table_reference: String,
    expected_revision: String,
    changes: Vec<RowChange>,
    dry_run: bool,
) -> Result<CommandOutput> {
    let mut conn = open_file(&file, true)?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(EidosError::from)?;
    ensure_revision(&tx, &expected_revision)?;
    let table = resolve_table(&load_tables(&tx)?, &table_reference)?.clone();
    let result = mutate_rows_in_transaction(
        &tx,
        &RowMutation {
            table_id: table.id.clone(),
            expected_revision: Some(expected_revision.clone()),
            changes,
        },
    )?;
    if dry_run || !result.changed {
        tx.rollback().map_err(EidosError::from)?;
    } else {
        tx.commit().map_err(EidosError::from)?;
    }
    Ok(CommandOutput::success(json!({
        "dryRun": dry_run,
        "createdIdsAreEphemeral": dry_run,
        "table": {"id": table.id, "name": table.name},
        "expectedRevision": expected_revision,
        "result": result,
    })))
}

fn rows_upsert(file: PathBuf, args: RowUpsertArgs) -> Result<CommandOutput> {
    let payload = read_json_source(&args.values)?;
    let objects = match payload {
        Value::Object(object) => vec![object],
        Value::Array(values) => values
            .into_iter()
            .enumerate()
            .map(|(index, value)| {
                value.as_object().cloned().ok_or_else(|| {
                    AppError::invalid_request(format!(
                        "row {} in --values is not a JSON object",
                        index + 1
                    ))
                })
            })
            .collect::<Result<Vec<_>>>()?,
        _ => {
            return Err(AppError::invalid_request(
                "--values must be a JSON object or array of objects",
            ));
        }
    };
    if objects.is_empty() {
        return Err(AppError::invalid_request(
            "--values array must not be empty",
        ));
    }

    let mut conn = open_file(&file, true)?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(EidosError::from)?;
    ensure_revision(&tx, &args.expected_revision)?;
    let table = resolve_table(&load_tables(&tx)?, &args.table)?.clone();
    let fields: Vec<FieldMeta> = load_fields(&tx)?
        .into_iter()
        .filter(|field| field.table_id == table.id)
        .collect();
    let key_fields = resolve_upsert_key_fields(&fields, &table.id, &args.key)?;
    let key_ids: Vec<String> = key_fields.iter().map(|field| field.id.clone()).collect();
    let mut seen_keys = HashSet::new();
    let mut seen_row_ids = HashSet::new();
    let mut changes = Vec::with_capacity(objects.len());
    let mut plan = Vec::with_capacity(objects.len());

    for (index, values) in objects.into_iter().enumerate() {
        let key_values: Vec<Value> = key_fields
            .iter()
            .map(|field| {
                values
                    .get(&field.name)
                    .or_else(|| values.get(&field.id))
                    .cloned()
                    .ok_or_else(|| {
                        AppError::invalid_request(format!(
                            "upsert row {} is missing key field {:?}",
                            index + 1,
                            field.name
                        ))
                    })
            })
            .collect::<Result<_>>()?;
        if key_values.iter().any(Value::is_null) {
            return Err(AppError::invalid_request(format!(
                "upsert row {} has a null key; key fields must be non-null",
                index + 1
            )));
        }
        let signature = serde_json::to_string(&key_values)
            .map_err(|error| AppError::internal(format!("serialize upsert key: {error}")))?;
        if !seen_keys.insert(signature) {
            return Err(AppError::invalid_request(format!(
                "upsert values contain a duplicate key in row {}",
                index + 1
            )));
        }
        let filter = if key_ids.len() == 1 {
            FilterNode::Eq {
                field_id: key_ids[0].clone(),
                value: key_values[0].clone(),
            }
        } else {
            FilterNode::And {
                args: key_ids
                    .iter()
                    .zip(key_values.iter())
                    .map(|(field_id, value)| FilterNode::Eq {
                        field_id: field_id.clone(),
                        value: value.clone(),
                    })
                    .collect(),
            }
        };
        let page = read_rows(
            &tx,
            &table,
            &fields,
            &RowQuery {
                filter: Some(filter),
                search: None,
                sort: None,
            },
            &ReadRowsOptions {
                projection: Some(Vec::new()),
                include_virtual: false,
                limit: Some(2),
                offset: Some(0),
            },
        )?;
        let matched = page.total_estimate.unwrap_or(page.rows.len() as u64);
        if matched > 1 {
            return Err(AppError::invalid_request(format!(
                "upsert key for row {} matches {matched} existing rows; key fields must identify at most one row",
                index + 1
            )));
        }
        if let Some(row) = page.rows.first() {
            let row_id = row
                .get("_id")
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::internal("matched upsert row has no _id"))?
                .to_string();
            if !seen_row_ids.insert(row_id.clone()) {
                return Err(AppError::invalid_request(format!(
                    "upsert values resolve to the same row more than once (row {})",
                    index + 1
                )));
            }
            plan.push(json!({"index": index + 1, "action": "update", "rowId": row_id}));
            changes.push(RowChange::Update { row_id, values });
        } else {
            let client_key = format!("upsert-{}", index + 1);
            plan.push(json!({"index": index + 1, "action": "create", "clientKey": client_key}));
            changes.push(RowChange::Create { client_key, values });
        }
    }

    let result = mutate_rows_in_transaction(
        &tx,
        &RowMutation {
            table_id: table.id.clone(),
            expected_revision: Some(args.expected_revision.clone()),
            changes,
        },
    )?;
    if args.dry_run || !result.changed {
        tx.rollback().map_err(EidosError::from)?;
    } else {
        tx.commit().map_err(EidosError::from)?;
    }
    Ok(CommandOutput::success(json!({
        "dryRun": args.dry_run,
        "createdIdsAreEphemeral": args.dry_run,
        "table": {"id": table.id, "name": table.name},
        "keyFields": key_fields.iter().map(|field| json!({"id": field.id, "name": field.name})).collect::<Vec<_>>(),
        "expectedRevision": args.expected_revision,
        "plan": plan,
        "result": result,
    })))
}

fn resolve_upsert_key_fields(
    fields: &[FieldMeta],
    table_id: &str,
    references: &[String],
) -> Result<Vec<FieldMeta>> {
    let mut ids = HashSet::new();
    let mut resolved = Vec::with_capacity(references.len());
    for reference in references {
        let field_id = resolve_field_in_table(fields, table_id, reference)?;
        if !ids.insert(field_id.clone()) {
            return Err(AppError::invalid_request(format!(
                "--key contains duplicate Field {reference:?}"
            )));
        }
        let field = fields
            .iter()
            .find(|field| field.id == field_id)
            .ok_or_else(|| AppError::internal("resolved upsert key Field disappeared"))?;
        if field.system_role.is_some() || field.physical_name.is_none() {
            return Err(AppError::invalid_request(format!(
                "upsert key Field {:?} must be a stored user Field",
                field.name
            )));
        }
        resolved.push(field.clone());
    }
    Ok(resolved)
}

fn view_apply(args: ViewApplyArgs) -> Result<CommandOutput> {
    let request: ViewMutationRequest = serde_json::from_value(read_json_source(&args.request)?)?;
    let mut conn = open_file(&args.file, true)?;
    Ok(CommandOutput::success(json!(mutate_views(
        &mut conn, &request
    )?)))
}

fn view(args: ViewArgs) -> Result<CommandOutput> {
    let ViewArgs { file, command } = args;
    match command {
        ViewCommand::List(args) => view_list(file, args),
        ViewCommand::Inspect(args) => view_inspect(file, args),
        ViewCommand::Create(args) => view_create(file, args),
        ViewCommand::Update(args) => view_update(file, args),
        ViewCommand::Delete(args) => view_delete(file, args),
    }
}

fn saved_view_json(view: &ViewMeta, tables: &[TableMeta]) -> Value {
    let table = tables.iter().find(|table| table.id == view.table_id);
    json!({
        "id": view.id,
        "name": view.name,
        "type": view.view_type,
        "tableId": view.table_id,
        "table": table.map(|table| table.name.clone()),
        "query": parse_stored_json(&view.query_json),
        "layout": parse_stored_json(&view.layout_json),
        "position": view.position.to_string(),
    })
}

fn view_list(file: PathBuf, _args: ViewListArgs) -> Result<CommandOutput> {
    let conn = open_file(&file, false)?;
    let meta = load_file_meta(&conn)?;
    let tables = load_tables(&conn)?;
    let views = load_views(&conn)?;
    Ok(CommandOutput::success(json!({
        "fileId": meta.file_id,
        "revision": meta.revision.to_string(),
        "views": views.iter().map(|view| saved_view_json(view, &tables)).collect::<Vec<_>>(),
    })))
}

fn view_inspect(file: PathBuf, args: ViewInspectArgs) -> Result<CommandOutput> {
    let conn = open_file(&file, false)?;
    let meta = load_file_meta(&conn)?;
    let tables = load_tables(&conn)?;
    let views = load_views(&conn)?;
    let view = resolve_view(&views, &args.reference)?;
    Ok(CommandOutput::success(json!({
        "fileId": meta.file_id,
        "revision": meta.revision.to_string(),
        "view": saved_view_json(view, &tables),
    })))
}

fn view_create(file: PathBuf, args: ViewCreateArgs) -> Result<CommandOutput> {
    let mut conn = open_file(&file, true)?;
    let meta = load_file_meta(&conn)?;
    let tables = load_tables(&conn)?;
    let fields = load_fields(&conn)?;
    let views = load_views(&conn)?;
    let table = resolve_selected_table(&tables, &meta, args.table.as_deref())?;
    let view_type = args.view_type.as_str();
    validate_view_options(
        view_type,
        ViewOptionPresence {
            has_filter: args.where_json.is_some(),
            has_sort: args.sort.is_some(),
            has_group: args.group_by.is_some(),
            has_date: args.date_by.is_some(),
            has_card: !args.card_fields.is_empty()
                || args.cover_by.is_some()
                || args.card_size.is_some(),
            has_empty_group_setting: args.hide_empty_groups,
            has_form_setting: args.title.is_some()
                || args.description.is_some()
                || args.submit_label.is_some()
                || args.success_message.is_some(),
        },
    )?;
    let query =
        parse_saved_view_query(&args.where_json, &args.sort, &fields, &table.id, view_type)?;
    let layout = build_view_layout(ViewLayoutInput {
        fields: &fields,
        table_id: &table.id,
        ordered_fields: &args.fields,
        hide_fields: &args.hide_fields,
        show_fields: &[],
        group_by: args.group_by.as_deref(),
        date_by: args.date_by.as_deref(),
        card_fields: &args.card_fields,
        cover_by: args.cover_by.as_deref(),
        card_size: args.card_size,
        hide_empty_groups: args.hide_empty_groups,
        show_empty_groups: false,
        title: args.title.as_deref(),
        description: args.description.as_deref(),
        submit_label: args.submit_label.as_deref(),
        success_message: args.success_message.as_deref(),
    })?;
    let position = args.position.unwrap_or_else(|| {
        views
            .iter()
            .filter(|view| view.table_id == table.id)
            .map(|view| view.position)
            .max()
            .map_or(0, |position| position.saturating_add(1))
            .to_string()
    });
    let expected_revision = args
        .expected_revision
        .unwrap_or_else(|| meta.revision.to_string());
    let request = ViewMutationRequest {
        expected_revision,
        changes: vec![ViewChange::CreateView {
            client_key: "agent-view".into(),
            table_id: table.id.clone(),
            name: args.name,
            view_type: view_type.into(),
            query,
            layout,
            position,
        }],
    };
    let resolved = json!({
        "table": {"id": table.id, "name": table.name},
        "viewType": view_type,
    });
    execute_view_request(&mut conn, request, args.dry_run, resolved)
}

fn view_update(file: PathBuf, args: ViewUpdateArgs) -> Result<CommandOutput> {
    let mut conn = open_file(&file, true)?;
    let meta = load_file_meta(&conn)?;
    let tables = load_tables(&conn)?;
    let fields = load_fields(&conn)?;
    let views = load_views(&conn)?;
    let current = resolve_view(&views, &args.reference)?.clone();
    let current_type = standard_view_type(&current.view_type)?;
    let view_type = args.view_type.unwrap_or(current_type);
    validate_view_options(
        view_type.as_str(),
        ViewOptionPresence {
            has_filter: args.where_json.is_some(),
            has_sort: args.sort.is_some(),
            has_group: args.group_by.is_some(),
            has_date: args.date_by.is_some(),
            has_card: !args.card_fields.is_empty()
                || args.cover_by.is_some()
                || args.card_size.is_some(),
            has_empty_group_setting: args.hide_empty_groups || args.show_empty_groups,
            has_form_setting: args.title.is_some()
                || args.description.is_some()
                || args.submit_label.is_some()
                || args.success_message.is_some(),
        },
    )?;
    if args.hide_empty_groups && args.show_empty_groups {
        return Err(AppError::invalid_request(
            "--hide-empty-groups and --show-empty-groups cannot be used together",
        ));
    }
    let table = tables
        .iter()
        .find(|table| table.id == current.table_id)
        .ok_or_else(|| EidosError::InvalidSchema("View Table does not exist".into()))?;
    let query = if args.where_json.is_some() || args.sort.is_some() {
        let current_query: SavedViewQuery = serde_json::from_str(&current.query_json)?;
        Some(SavedViewQuery {
            filter: args
                .where_json
                .as_deref()
                .map(|source| parse_filter(source, &fields, &table.id))
                .transpose()?
                .or(current_query.filter),
            sort: args
                .sort
                .as_deref()
                .map(|source| parse_sort(source, &fields, &table.id))
                .transpose()?
                .or(current_query.sort),
        })
    } else {
        None
    };
    let layout_changed = args.view_type.is_some()
        || !args.fields.is_empty()
        || !args.hide_fields.is_empty()
        || !args.show_fields.is_empty()
        || args.group_by.is_some()
        || args.date_by.is_some()
        || !args.card_fields.is_empty()
        || args.cover_by.is_some()
        || args.card_size.is_some()
        || args.hide_empty_groups
        || args.show_empty_groups
        || args.title.is_some()
        || args.description.is_some()
        || args.submit_label.is_some()
        || args.success_message.is_some();
    let layout = layout_changed
        .then(|| {
            update_view_layout(
                &current.layout_json,
                ViewLayoutInput {
                    fields: &fields,
                    table_id: &table.id,
                    ordered_fields: &args.fields,
                    hide_fields: &args.hide_fields,
                    show_fields: &args.show_fields,
                    group_by: args.group_by.as_deref(),
                    date_by: args.date_by.as_deref(),
                    card_fields: &args.card_fields,
                    cover_by: args.cover_by.as_deref(),
                    card_size: args.card_size,
                    hide_empty_groups: args.hide_empty_groups,
                    show_empty_groups: args.show_empty_groups,
                    title: args.title.as_deref(),
                    description: args.description.as_deref(),
                    submit_label: args.submit_label.as_deref(),
                    success_message: args.success_message.as_deref(),
                },
            )
        })
        .transpose()?;
    if args.name.is_none()
        && args.view_type.is_none()
        && query.is_none()
        && layout.is_none()
        && args.position.is_none()
    {
        return Err(AppError::invalid_request(
            "View update requires at least one change",
        ));
    }
    let expected_revision = args
        .expected_revision
        .unwrap_or_else(|| meta.revision.to_string());
    let request = ViewMutationRequest {
        expected_revision,
        changes: vec![ViewChange::UpdateView {
            view_id: current.id.clone(),
            patch: ViewPatch {
                name: args.name,
                view_type: args.view_type.map(|view_type| view_type.as_str().into()),
                query,
                layout,
                position: args.position,
            },
        }],
    };
    let resolved = json!({
        "view": {"id": current.id, "name": current.name, "table": table.name},
        "viewType": view_type.as_str(),
    });
    execute_view_request(&mut conn, request, args.dry_run, resolved)
}

fn view_delete(file: PathBuf, args: ViewDeleteArgs) -> Result<CommandOutput> {
    let mut conn = open_file(&file, true)?;
    let meta = load_file_meta(&conn)?;
    let tables = load_tables(&conn)?;
    let views = load_views(&conn)?;
    let current = resolve_view(&views, &args.reference)?.clone();
    let expected_revision = args
        .expected_revision
        .unwrap_or_else(|| meta.revision.to_string());
    let request = ViewMutationRequest {
        expected_revision,
        changes: vec![ViewChange::DeleteView {
            view_id: current.id.clone(),
        }],
    };
    let resolved = json!({"view": saved_view_json(&current, &tables)});
    execute_view_request(&mut conn, request, args.dry_run, resolved)
}

fn execute_view_request(
    conn: &mut Connection,
    request: ViewMutationRequest,
    dry_run: bool,
    resolved: Value,
) -> Result<CommandOutput> {
    let request_value = serde_json::to_value(&request)
        .map_err(|error| AppError::internal(format!("serialize View request: {error}")))?;
    let result = if dry_run {
        preview_views(conn, &request)?
    } else {
        mutate_views(conn, &request)?
    };
    Ok(CommandOutput::success(json!({
        "dryRun": dry_run,
        "createdIdsAreEphemeral": dry_run,
        "resolved": resolved,
        "request": request_value,
        "result": result,
    })))
}

fn resolve_view<'a>(views: &'a [ViewMeta], reference: &str) -> Result<&'a ViewMeta> {
    let matches: Vec<&ViewMeta> = views
        .iter()
        .filter(|view| view.id == reference || view.name == reference)
        .collect();
    match matches.as_slice() {
        [view] => Ok(view),
        [] => Err(EidosError::NotFound(format!("View {reference:?}")).into()),
        _ => Err(AppError::invalid_request(format!(
            "View reference {reference:?} is ambiguous; use a stable View ID"
        ))),
    }
}

fn resolve_selected_table<'a>(
    tables: &'a [TableMeta],
    meta: &FileMeta,
    reference: Option<&str>,
) -> Result<&'a TableMeta> {
    if let Some(reference) = reference {
        return resolve_table(tables, reference).map_err(Into::into);
    }
    if let Some(default_id) = meta.default_table_id.as_deref() {
        return resolve_table(tables, default_id).map_err(Into::into);
    }
    match tables {
        [only] => Ok(only),
        [] => Err(EidosError::NotFound("file has no tables".into()).into()),
        _ => Err(AppError::invalid_request(
            "--table is required when the File has multiple Tables and no default",
        )),
    }
}

fn standard_view_type(value: &str) -> Result<StandardViewTypeArg> {
    match value {
        "grid" => Ok(StandardViewTypeArg::Grid),
        "gallery" => Ok(StandardViewTypeArg::Gallery),
        "kanban" => Ok(StandardViewTypeArg::Kanban),
        "calendar" => Ok(StandardViewTypeArg::Calendar),
        "form" => Ok(StandardViewTypeArg::Form),
        _ => Err(AppError::invalid_request(format!(
            "View type {value:?} is not a standard View type; use view-apply for opaque types"
        ))),
    }
}

fn resolve_field_in_table(fields: &[FieldMeta], table_id: &str, reference: &str) -> Result<String> {
    let matches: Vec<&FieldMeta> = fields
        .iter()
        .filter(|field| {
            field.table_id == table_id && (field.id == reference || field.name == reference)
        })
        .collect();
    match matches.as_slice() {
        [field] => Ok(field.id.clone()),
        [] => Err(EidosError::NotFound(format!("Field {reference:?} in Table {table_id}")).into()),
        _ => Err(AppError::invalid_request(format!(
            "Field reference {reference:?} is ambiguous"
        ))),
    }
}

fn resolve_field_list(
    fields: &[FieldMeta],
    table_id: &str,
    references: &[String],
    label: &str,
) -> Result<Vec<String>> {
    let mut resolved = Vec::with_capacity(references.len());
    for reference in references {
        let id = resolve_field_in_table(fields, table_id, reference)?;
        if resolved.contains(&id) {
            return Err(AppError::invalid_request(format!(
                "{label} contains duplicate Field {reference:?}"
            )));
        }
        resolved.push(id);
    }
    Ok(resolved)
}

fn resolve_query_field_ids(value: &mut Value, fields: &[FieldMeta], table_id: &str) -> Result<()> {
    match value {
        Value::Array(items) => {
            for item in items {
                resolve_query_field_ids(item, fields, table_id)?;
            }
        }
        Value::Object(object) => {
            if let Some(field) = object.get_mut("fieldId") {
                let reference = field.as_str().ok_or_else(|| {
                    AppError::invalid_request("View query fieldId must be a string")
                })?;
                *field = json!(resolve_field_in_table(fields, table_id, reference)?);
            }
            for (key, child) in object.iter_mut() {
                if key != "fieldId" {
                    resolve_query_field_ids(child, fields, table_id)?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}

fn parse_filter(source: &str, fields: &[FieldMeta], table_id: &str) -> Result<FilterNode> {
    let mut value = normalize_field_members(read_json_source(source)?);
    resolve_query_field_ids(&mut value, fields, table_id)?;
    Ok(serde_json::from_value(value)?)
}

fn parse_sort(source: &str, fields: &[FieldMeta], table_id: &str) -> Result<Vec<SortTerm>> {
    let mut value = normalize_field_members(read_json_source(source)?);
    resolve_query_field_ids(&mut value, fields, table_id)?;
    Ok(serde_json::from_value(value)?)
}

fn parse_saved_view_query(
    where_json: &Option<String>,
    sort_json: &Option<String>,
    fields: &[FieldMeta],
    table_id: &str,
    _view_type: &str,
) -> Result<SavedViewQuery> {
    Ok(SavedViewQuery {
        filter: where_json
            .as_deref()
            .map(|source| parse_filter(source, fields, table_id))
            .transpose()?,
        sort: sort_json
            .as_deref()
            .map(|source| parse_sort(source, fields, table_id))
            .transpose()?,
    })
}

struct ViewOptionPresence {
    has_filter: bool,
    has_sort: bool,
    has_group: bool,
    has_date: bool,
    has_card: bool,
    has_empty_group_setting: bool,
    has_form_setting: bool,
}

fn validate_view_options(view_type: &str, options: ViewOptionPresence) -> Result<()> {
    if options.has_group && view_type != "kanban" {
        return Err(AppError::invalid_request(
            "--group-by is only valid for a kanban View",
        ));
    }
    if options.has_date && view_type != "calendar" {
        return Err(AppError::invalid_request(
            "--date-by is only valid for a calendar View",
        ));
    }
    if options.has_card && !matches!(view_type, "gallery" | "kanban") {
        return Err(AppError::invalid_request(
            "card options are only valid for gallery or kanban Views",
        ));
    }
    if options.has_empty_group_setting && view_type != "kanban" {
        return Err(AppError::invalid_request(
            "Kanban group options are only valid for a kanban View",
        ));
    }
    if options.has_form_setting && view_type != "form" {
        return Err(AppError::invalid_request(
            "Form options are only valid for a form View",
        ));
    }
    if view_type == "form" && (options.has_filter || options.has_sort) {
        return Err(AppError::invalid_request(
            "Form Views cannot have a saved filter or sort",
        ));
    }
    Ok(())
}

struct ViewLayoutInput<'a> {
    fields: &'a [FieldMeta],
    table_id: &'a str,
    ordered_fields: &'a [String],
    hide_fields: &'a [String],
    show_fields: &'a [String],
    group_by: Option<&'a str>,
    date_by: Option<&'a str>,
    card_fields: &'a [String],
    cover_by: Option<&'a str>,
    card_size: Option<CardSizeArg>,
    hide_empty_groups: bool,
    show_empty_groups: bool,
    title: Option<&'a str>,
    description: Option<&'a str>,
    submit_label: Option<&'a str>,
    success_message: Option<&'a str>,
}

fn build_view_layout(options: ViewLayoutInput<'_>) -> Result<Value> {
    let ViewLayoutInput {
        fields,
        table_id,
        ordered_fields,
        hide_fields,
        show_fields: _,
        group_by,
        date_by,
        card_fields,
        cover_by,
        card_size,
        hide_empty_groups,
        show_empty_groups: _,
        title,
        description,
        submit_label,
        success_message,
    } = options;
    let mut layout = Map::new();
    let set_field_array =
        |layout: &mut Map<String, Value>, key: &str, values: &[String], label: &str| {
            if !values.is_empty() {
                layout.insert(
                    key.into(),
                    json!(resolve_field_list(fields, table_id, values, label)?),
                );
            }
            Ok::<(), AppError>(())
        };
    set_field_array(&mut layout, "fieldOrder", ordered_fields, "--fields")?;
    set_field_array(&mut layout, "hiddenFields", hide_fields, "--hide-fields")?;
    set_field_array(&mut layout, "cardFields", card_fields, "--card-fields")?;
    if let Some(reference) = group_by {
        layout.insert(
            "groupField".into(),
            json!(resolve_field_in_table(fields, table_id, reference)?),
        );
    }
    if let Some(reference) = date_by {
        let field_id = resolve_field_in_table(fields, table_id, reference)?;
        let field = fields
            .iter()
            .find(|field| field.id == field_id)
            .expect("resolved field exists");
        if !matches!(
            field.field_type,
            eidos_file_core::model::FieldType::Date | eidos_file_core::model::FieldType::Datetime
        ) {
            return Err(AppError::invalid_request(format!(
                "calendar --date-by field {:?} must be date or datetime",
                field.name
            )));
        }
        layout.insert("dateField".into(), json!(field_id));
    }
    if let Some(reference) = cover_by {
        layout.insert(
            "coverField".into(),
            json!(resolve_field_in_table(fields, table_id, reference)?),
        );
    }
    if let Some(card_size) = card_size {
        layout.insert("cardSize".into(), json!(card_size.as_str()));
    }
    if hide_empty_groups {
        layout.insert("showEmptyGroups".into(), json!(false));
    }
    if let Some(value) = title {
        layout.insert("title".into(), json!(value));
    }
    if let Some(value) = description {
        layout.insert("description".into(), json!(value));
    }
    if let Some(value) = submit_label {
        layout.insert("submitLabel".into(), json!(value));
    }
    if let Some(value) = success_message {
        layout.insert("successMessage".into(), json!(value));
    }
    Ok(Value::Object(layout))
}

fn layout_field_array(layout: &Map<String, Value>, key: &str) -> Result<Vec<String>> {
    let Some(value) = layout.get(key) else {
        return Ok(Vec::new());
    };
    value
        .as_array()
        .ok_or_else(|| AppError::invalid_request(format!("View layout {key} must be an array")))?
        .iter()
        .map(|value| {
            value.as_str().map(ToOwned::to_owned).ok_or_else(|| {
                AppError::invalid_request(format!("View layout {key} must contain strings"))
            })
        })
        .collect()
}

fn update_view_layout(current_layout: &str, options: ViewLayoutInput<'_>) -> Result<Value> {
    let ViewLayoutInput {
        fields,
        table_id,
        ordered_fields,
        hide_fields,
        show_fields,
        group_by,
        date_by,
        card_fields,
        cover_by,
        card_size,
        hide_empty_groups,
        show_empty_groups,
        title,
        description,
        submit_label,
        success_message,
        ..
    } = options;
    let value: Value = serde_json::from_str(current_layout)?;
    let mut layout = value
        .as_object()
        .cloned()
        .ok_or_else(|| AppError::invalid_request("stored View layout must be an object"))?;
    if !ordered_fields.is_empty() {
        layout.insert(
            "fieldOrder".into(),
            json!(resolve_field_list(
                fields,
                table_id,
                ordered_fields,
                "--fields"
            )?),
        );
    }
    if !hide_fields.is_empty() || !show_fields.is_empty() {
        let mut hidden = layout_field_array(&layout, "hiddenFields")?;
        let to_hide = resolve_field_list(fields, table_id, hide_fields, "--hide-fields")?;
        let to_show = resolve_field_list(fields, table_id, show_fields, "--show-fields")?;
        for field_id in to_hide {
            if !hidden.contains(&field_id) {
                hidden.push(field_id);
            }
        }
        hidden.retain(|field_id| !to_show.contains(field_id));
        layout.insert("hiddenFields".into(), json!(hidden));
    }
    if let Some(reference) = group_by {
        layout.insert(
            "groupField".into(),
            json!(resolve_field_in_table(fields, table_id, reference)?),
        );
    }
    if let Some(reference) = date_by {
        let field_id = resolve_field_in_table(fields, table_id, reference)?;
        let field = fields
            .iter()
            .find(|field| field.id == field_id)
            .expect("resolved field exists");
        if !matches!(
            field.field_type,
            eidos_file_core::model::FieldType::Date | eidos_file_core::model::FieldType::Datetime
        ) {
            return Err(AppError::invalid_request(format!(
                "calendar --date-by field {:?} must be date or datetime",
                field.name
            )));
        }
        layout.insert("dateField".into(), json!(field_id));
    }
    if !card_fields.is_empty() {
        layout.insert(
            "cardFields".into(),
            json!(resolve_field_list(
                fields,
                table_id,
                card_fields,
                "--card-fields"
            )?),
        );
    }
    if let Some(reference) = cover_by {
        layout.insert(
            "coverField".into(),
            json!(resolve_field_in_table(fields, table_id, reference)?),
        );
    }
    if let Some(card_size) = card_size {
        layout.insert("cardSize".into(), json!(card_size.as_str()));
    }
    if hide_empty_groups {
        layout.insert("showEmptyGroups".into(), json!(false));
    } else if show_empty_groups {
        layout.insert("showEmptyGroups".into(), json!(true));
    }
    if let Some(value) = title {
        layout.insert("title".into(), json!(value));
    }
    if let Some(value) = description {
        layout.insert("description".into(), json!(value));
    }
    if let Some(value) = submit_label {
        layout.insert("submitLabel".into(), json!(value));
    }
    if let Some(value) = success_message {
        layout.insert("successMessage".into(), json!(value));
    }
    Ok(Value::Object(layout))
}

fn validate_file(args: ValidateArgs) -> Result<CommandOutput> {
    let conn = open_file(&args.file, false)?;
    let meta = load_file_meta(&conn)?;
    let level = match args.level {
        ValidationLevelArg::Identity => ValidationLevel::Identity,
        ValidationLevelArg::Structural => ValidationLevel::Structural,
        ValidationLevelArg::Content => ValidationLevel::Content,
        ValidationLevelArg::Semantic => ValidationLevel::Semantic,
        ValidationLevelArg::Full => ValidationLevel::Full,
    };
    if load_fields(&conn)?
        .iter()
        .any(|field| field.physical_name.is_none())
    {
        let level = serde_json::to_value(level)
            .map_err(|error| AppError::internal(format!("serialize validation level: {error}")))?;
        let value = with_runtime_session(&args.file, false, |session| {
            session.call(
                "validate",
                &json!({
                    "level": level,
                    "diagnosticsLimit": args.diagnostics_limit,
                }),
            )
        })?;
        let valid = value.get("valid").and_then(Value::as_bool).unwrap_or(false);
        return Ok(CommandOutput {
            value,
            success: valid,
        });
    }
    let report = validate(&conn, level, args.diagnostics_limit)?;
    let value = json!({
        "fileId": meta.file_id,
        "revision": meta.revision.to_string(),
        "level": level,
        "valid": report.valid,
        "diagnostics": report.diagnostics,
        "truncated": report.truncated,
    });
    Ok(CommandOutput {
        value,
        success: report.valid,
    })
}

fn schema_apply(args: SchemaApplyArgs) -> Result<CommandOutput> {
    let operation = read_json_source(&args.op)?;
    if let Some(runtime_operation) = runtime_virtual_schema_operation(&args.file, &operation)? {
        return runtime_schema_intent_with_options(
            args.file,
            runtime_operation,
            Some(args.expected_revision),
            args.dry_run,
            args.confirm_lossy,
        );
    }
    let mut conn = open_file(&args.file, true)?;
    let change = normalize_schema_change(&conn, operation)?;
    let public_change = public_schema_operation(serde_json::to_value(&change)?);
    let result = if args.dry_run {
        preview_schema_change(&mut conn, &change, Some(&args.expected_revision))?
    } else {
        apply_schema_change(&mut conn, &change, Some(&args.expected_revision))?
    };
    Ok(CommandOutput::success(json!({
        "dryRun": args.dry_run,
        "createdIdsAreEphemeral": args.dry_run,
        "operation": public_change,
        "result": result,
    })))
}

fn table(args: TableArgs) -> Result<CommandOutput> {
    let TableArgs { file, command } = args;
    match command {
        TableCommand::Create(args) => table_create(args, file),
        TableCommand::Update(args) => table_update(args, file),
        TableCommand::Rename(args) => table_rename(args, file),
        TableCommand::Delete(args) => table_delete(args, file),
    }
}

fn table_create(args: TableCreateArgs, file: PathBuf) -> Result<CommandOutput> {
    let fields = read_json_source(&args.fields)?;
    if !fields.is_array() {
        return Err(AppError::invalid_request(
            "--fields must be a JSON array of field definitions",
        ));
    }
    let mut operation = json!({
        "kind": "create-table",
        "name": args.name,
        "fields": fields,
    });
    if let Some(label_field) = args.label_field {
        operation["labelField"] = json!(label_field);
    }
    if let Some(settings) = args.settings {
        operation["settings"] = read_json_source(&settings)?;
    }
    if let Some(runtime_operation) = runtime_virtual_schema_operation(&file, &operation)? {
        return runtime_schema_intent(
            file,
            runtime_operation,
            args.expected_revision,
            args.dry_run,
        );
    }
    execute_schema_intent(file, operation, args.expected_revision, args.dry_run)
}

fn table_update(args: TableUpdateArgs, file: PathBuf) -> Result<CommandOutput> {
    let TableUpdateArgs {
        reference,
        name,
        settings,
        record_label,
        content_field,
        clear_content_field,
        position,
        make_default,
        expected_revision,
        dry_run,
    } = args;
    let conn = open_file(&file, false)?;
    let tables = load_tables(&conn)?;
    let table = resolve_table(&tables, &reference)?.clone();
    let fields = load_fields(&conn)?;
    let mut leaves = Vec::new();

    if let Some(name) = name
        && name != table.name
    {
        leaves.push(json!({
            "kind": "rename-table",
            "tableId": table.id,
            "name": name,
        }));
    }

    let mut replacement_settings = settings
        .as_deref()
        .map(|source| parse_object(source, "--settings"))
        .transpose()?;
    if content_field.is_some() || clear_content_field {
        if replacement_settings.is_none() {
            replacement_settings = Some(parse_stored_object(
                &table.settings_json,
                "stored Table settings",
            )?);
        }
        let settings = replacement_settings
            .as_mut()
            .ok_or_else(|| AppError::internal("Table settings were not initialized"))?;
        if let Some(reference) = content_field {
            let field_id = resolve_field_in_table(&fields, &table.id, &reference)?;
            let field = fields
                .iter()
                .find(|candidate| candidate.id == field_id)
                .ok_or_else(|| AppError::internal("resolved content Field disappeared"))?;
            if field.field_type != FieldType::Text || field.physical_name.is_none() {
                return Err(AppError::invalid_request(
                    "--content-field must reference an ordinary Text Field in this Table",
                ));
            }
            settings.insert("contentFieldId".into(), json!(field.id));
        } else {
            settings.remove("contentFieldId");
        }
    }
    if let Some(settings) = replacement_settings {
        leaves.push(json!({
            "kind": "set-table-settings",
            "tableId": table.id,
            "settings": settings,
        }));
    }

    if let Some(reference) = record_label {
        let field_id = resolve_field_in_table(&fields, &table.id, &reference)?;
        leaves.push(json!({
            "kind": "set-record-label",
            "tableId": table.id,
            "fieldId": field_id,
        }));
    }
    if let Some(position) = position {
        leaves.push(json!({
            "kind": "set-table-position",
            "tableId": table.id,
            "position": position,
        }));
    }
    if make_default && load_file_meta(&conn)?.default_table_id.as_deref() != Some(&table.id) {
        leaves.push(json!({
            "kind": "set-default-table",
            "tableId": table.id,
        }));
    }
    if leaves.is_empty() {
        return Err(AppError::invalid_request(
            "table update requires at least one changed option",
        ));
    }
    runtime_schema_intent(file, schema_batch(leaves), expected_revision, dry_run)
}

fn table_rename(args: TableRenameArgs, file: PathBuf) -> Result<CommandOutput> {
    let operation = json!({
        "kind": "rename-table",
        "table": args.reference,
        "name": args.name,
    });
    execute_schema_intent(file, operation, args.expected_revision, args.dry_run)
}

fn table_delete(args: TableDeleteArgs, file: PathBuf) -> Result<CommandOutput> {
    let operation = json!({
        "kind": "delete-table",
        "table": args.reference,
    });
    execute_schema_intent(file, operation, args.expected_revision, args.dry_run)
}

fn field(args: FieldArgs) -> Result<CommandOutput> {
    let FieldArgs { file, command } = args;
    match command {
        FieldCommand::Add(args) => field_add(args, file),
        FieldCommand::Update(args) => field_update(args, file),
        FieldCommand::Rename(args) => field_rename(args, file),
        FieldCommand::Delete(args) => field_delete(args, file),
    }
}

fn field_add(args: FieldAddArgs, file: PathBuf) -> Result<CommandOutput> {
    let FieldAddArgs {
        table,
        name,
        field_type,
        settings,
        definition,
        expected_revision,
        dry_run,
    } = args;
    if matches!(field_type.as_str(), "formula" | "lookup") {
        let definition = definition.ok_or_else(|| {
            AppError::invalid_request(format!("--definition is required for {field_type} Fields"))
        })?;
        let definition = read_json_source(&definition)?;
        let conn = open_file(&file, false)?;
        let table_id = resolve_table_id(&conn, &table)?;
        let position = next_field_position(&file, &table_id)?;
        let mut field = json!({
            "clientKey": format!("{field_type}-field"),
            "name": name,
            "kind": field_type,
            "position": position,
            "nullable": true,
            "definition": definition,
        });
        if let Some(settings) = settings {
            field["settings"] = read_json_source(&settings)?;
        }
        let operation = json!({
            "kind": "create-field",
            "tableId": table_id,
            "field": field,
        });
        return runtime_schema_intent(file, operation, expected_revision, dry_run);
    }
    let mut operation = json!({
        "kind": "create-field",
        "table": table,
        "name": name,
        "type": field_type,
    });
    if let Some(settings) = settings {
        operation["settings"] = read_json_source(&settings)?;
    }
    if let Some(definition) = definition {
        operation["definition"] = read_json_source(&definition)?;
    }
    execute_schema_intent(file, operation, expected_revision, dry_run)
}

fn field_update(args: FieldUpdateArgs, file: PathBuf) -> Result<CommandOutput> {
    let FieldUpdateArgs {
        reference,
        table,
        name,
        field_type,
        settings,
        position,
        record_label,
        target_table,
        cardinality,
        on_delete,
        policies,
        rename_options,
        confirm_lossy,
        expected_revision,
        dry_run,
    } = args;
    let (field, tables, _) = field_reference_info(&file, &reference, table.as_deref())?;
    let mut leaves = Vec::new();

    if let Some(name) = name
        && name != field.name
    {
        leaves.push(json!({
            "kind": "rename-field",
            "fieldId": field.id,
            "name": name,
        }));
    }

    if let Some(target_type) = field_type.as_deref() {
        let target_type = parse_conversion_field_type(target_type)?;
        if matches!(field.field_type, FieldType::Formula | FieldType::Lookup) {
            return Err(AppError::invalid_request(
                "Formula and Lookup Fields cannot be converted; create a stored Field first",
            ));
        }
        if field.field_type == FieldType::File || target_type == FieldType::File {
            return Err(AppError::invalid_request(
                "File Fields cannot be converted; create a new File Field and use attachment commands",
            ));
        }
        if target_type == field.field_type {
            if target_table.is_some() || cardinality.is_some() || on_delete.is_some() {
                return Err(AppError::invalid_request(
                    "use relation update to change an existing Relation definition",
                ));
            }
            if !policies.is_empty() {
                return Err(AppError::invalid_request(
                    "--policy requires a conversion to a different Field type",
                ));
            }
        } else {
            if target_type != FieldType::Relation
                && (target_table.is_some() || cardinality.is_some() || on_delete.is_some())
            {
                return Err(AppError::invalid_request(
                    "--target-table, --cardinality, and --on-delete only apply when converting to relation",
                ));
            }
            let conversion_policies = conversion_policies(
                field.field_type,
                target_type,
                if policies.is_empty() {
                    None
                } else {
                    Some(&policies)
                },
            )?;
            let mut conversion = json!({
                "kind": "convert-field",
                "fieldId": field.id,
                "to": target_type.as_str(),
            });
            if !conversion_policies.is_empty() {
                conversion["policies"] = json!(conversion_policies);
            }
            if target_type == FieldType::Relation {
                let target_reference = target_table.as_deref().ok_or_else(|| {
                    AppError::invalid_request(
                        "--target-table is required when converting to relation",
                    )
                })?;
                let target_table_id = resolve_table(&tables, target_reference)?.id.clone();
                conversion["definition"] = json!({
                    "direction": "forward",
                    "targetTableId": target_table_id,
                    "cardinality": relation_cardinality(cardinality.as_deref().unwrap_or("many"))?,
                    "onDelete": relation_on_delete(on_delete.as_deref().unwrap_or("restrict"))?,
                });
            } else if !matches!(target_type, FieldType::MultiSelect) {
                conversion["toNullable"] = json!(
                    field.nullable
                        || (field.field_type == FieldType::MultiSelect
                            && target_type == FieldType::Select)
                );
            }

            let table = tables
                .iter()
                .find(|candidate| candidate.id == field.table_id)
                .ok_or_else(|| AppError::internal("Field Table disappeared"))?;
            let mut table_settings =
                parse_stored_object(&table.settings_json, "stored Table settings")?;
            if table_settings.get("contentFieldId").and_then(Value::as_str)
                == Some(field.id.as_str())
                && target_type != FieldType::Text
            {
                table_settings.remove("contentFieldId");
                leaves.push(json!({
                    "kind": "set-table-settings",
                    "tableId": table.id,
                    "settings": table_settings,
                }));
            }
            leaves.push(conversion);
        }
    } else if target_table.is_some()
        || cardinality.is_some()
        || on_delete.is_some()
        || !policies.is_empty()
    {
        return Err(AppError::invalid_request(
            "Relation conversion options and --policy require --type",
        ));
    }

    if let Some(settings) = settings {
        leaves.push(json!({
            "kind": "set-field-settings",
            "fieldId": field.id,
            "settings": parse_object(&settings, "--settings")?,
        }));
    }
    if let Some(position) = position {
        leaves.push(json!({
            "kind": "set-field-position",
            "fieldId": field.id,
            "position": position,
        }));
    }
    if let Some(source) = rename_options {
        leaves.extend(option_rename_changes(&source, &field.id)?);
    }
    if record_label {
        leaves.push(json!({
            "kind": "set-record-label",
            "tableId": field.table_id,
            "fieldId": field.id,
        }));
    }
    if leaves.is_empty() {
        return Err(AppError::invalid_request(
            "field update requires at least one changed option",
        ));
    }
    runtime_schema_intent_with_options(
        file,
        schema_batch(leaves),
        expected_revision,
        dry_run,
        confirm_lossy,
    )
}

fn field_rename(args: FieldRenameArgs, file: PathBuf) -> Result<CommandOutput> {
    let (field, _, fields) = field_reference_info(&file, &args.reference, args.table.as_deref())?;
    if matches!(
        field.field_type,
        eidos_file_core::model::FieldType::Formula | eidos_file_core::model::FieldType::Lookup
    ) || fields.iter().any(|candidate| {
        candidate.table_id == field.table_id
            && candidate.field_type == eidos_file_core::model::FieldType::Formula
    }) {
        let operation = json!({
            "kind": "rename-field",
            "fieldId": field.id,
            "name": args.name,
        });
        return runtime_schema_intent(file, operation, args.expected_revision, args.dry_run);
    }
    let operation = json!({
        "kind": "rename-field",
        "field": args.reference,
        "table": args.table,
        "name": args.name,
    });
    execute_schema_intent(file, operation, args.expected_revision, args.dry_run)
}

fn field_delete(args: FieldDeleteArgs, file: PathBuf) -> Result<CommandOutput> {
    let (field, _, fields) = field_reference_info(&file, &args.reference, args.table.as_deref())?;
    if matches!(
        field.field_type,
        eidos_file_core::model::FieldType::Formula | eidos_file_core::model::FieldType::Lookup
    ) {
        let replacement = args
            .replacement_label_field
            .as_deref()
            .map(|reference| resolve_field_in_table(&fields, &field.table_id, reference))
            .transpose()?;
        let mut operation = json!({
            "kind": "delete-field",
            "fieldId": field.id,
        });
        if let Some(replacement) = replacement {
            operation["replacementLabelFieldId"] = json!(replacement);
        }
        return runtime_schema_intent_with_options(
            file,
            operation,
            args.expected_revision,
            args.dry_run,
            args.confirm_lossy,
        );
    }
    let operation = json!({
        "kind": "delete-field",
        "field": args.reference,
        "table": args.table,
        "replacementLabelField": args.replacement_label_field,
    });
    execute_schema_intent(file, operation, args.expected_revision, args.dry_run)
}

fn relation(args: RelationArgs) -> Result<CommandOutput> {
    let RelationArgs { file, command } = args;
    match command {
        RelationCommand::Add(args) => relation_add(args, file),
        RelationCommand::Update(args) => relation_update(args, file),
    }
}

fn relation_add(args: RelationAddArgs, file: PathBuf) -> Result<CommandOutput> {
    let operation = json!({
        "kind": "create-field",
        "table": args.table,
        "name": args.name,
        "type": "relation",
        "definition": {
            "direction": "forward",
            "targetTable": args.target_table,
            "cardinality": args.cardinality,
            "onDelete": args.on_delete,
        },
    });
    execute_schema_intent(file, operation, args.expected_revision, args.dry_run)
}

fn relation_update(args: RelationUpdateArgs, file: PathBuf) -> Result<CommandOutput> {
    let RelationUpdateArgs {
        reference,
        table,
        target_table,
        cardinality,
        on_delete,
        confirm_lossy,
        expected_revision,
        dry_run,
    } = args;
    if target_table.is_none() && cardinality.is_none() && on_delete.is_none() {
        return Err(AppError::invalid_request(
            "relation update requires --target-table, --cardinality, or --on-delete",
        ));
    }
    let (field, tables, _) = field_reference_info(&file, &reference, table.as_deref())?;
    if field.field_type != FieldType::Relation {
        return Err(AppError::invalid_request(format!(
            "Field {:?} is not a Relation Field",
            field.name
        )));
    }
    let conn = open_file(&file, false)?;
    let relation = load_relation_fields(&conn)?
        .into_iter()
        .find(|relation| relation.field_id == field.id)
        .ok_or_else(|| AppError::invalid_request("Relation Field has no Relation definition"))?;
    if relation.direction != RelationDirection::Forward {
        return Err(AppError::invalid_request(
            "inverse Relation definitions are managed by their forward Relation",
        ));
    }
    let target_table_id = target_table
        .as_deref()
        .map(|reference| resolve_table(&tables, reference).map(|table| table.id.clone()))
        .transpose()?
        .unwrap_or_else(|| relation.target_table_id.clone());
    let cardinality = cardinality
        .as_deref()
        .map(relation_cardinality)
        .transpose()?
        .unwrap_or_else(|| relation.cardinality.as_str());
    let current_on_delete = relation
        .on_delete
        .map(OnDeletePolicy::as_str)
        .unwrap_or("restrict");
    let on_delete = on_delete
        .as_deref()
        .map(relation_on_delete)
        .transpose()?
        .unwrap_or(current_on_delete);
    if target_table_id == relation.target_table_id
        && cardinality == relation.cardinality.as_str()
        && on_delete == current_on_delete
    {
        return Err(AppError::invalid_request(
            "relation update does not change the Relation definition",
        ));
    }
    runtime_schema_intent_with_options(
        file,
        json!({
            "kind": "set-relation",
            "fieldId": field.id,
            "definition": {
                "direction": "forward",
                "targetTableId": target_table_id,
                "cardinality": cardinality,
                "onDelete": on_delete,
            },
        }),
        expected_revision,
        dry_run,
        confirm_lossy,
    )
}

fn formula(args: FormulaArgs) -> Result<CommandOutput> {
    let FormulaArgs { file, command } = args;
    match command {
        FormulaCommand::Preview(args) => formula_preview(file, args),
        FormulaCommand::Add(args) => formula_add(file, args),
        FormulaCommand::Update(args) => formula_update(file, args),
        FormulaCommand::Delete(args) => formula_delete(file, args),
    }
}

fn lookup(args: LookupArgs) -> Result<CommandOutput> {
    let LookupArgs { file, command } = args;
    match command {
        LookupCommand::Add(args) => lookup_add(file, args),
        LookupCommand::Update(args) => lookup_update(file, args),
        LookupCommand::Delete(args) => lookup_delete(file, args),
    }
}

fn formula_result_type(value: &str) -> Result<String> {
    match value {
        "text" | "number" | "integer" | "checkbox" | "date" | "datetime" | "url" => {
            Ok(value.to_string())
        }
        _ => Err(AppError::invalid_request(format!(
            "Formula result type {value:?} must be text, number, integer, checkbox, date, datetime, or url"
        ))),
    }
}

fn lookup_aggregate(value: &str) -> Result<String> {
    match value {
        "values" | "first" | "count" | "sum" | "average" | "min" | "max" => Ok(value.to_string()),
        _ => Err(AppError::invalid_request(format!(
            "Lookup aggregate {value:?} must be values, first, count, sum, average, min, or max"
        ))),
    }
}

fn parse_conversion_field_type(value: &str) -> Result<FieldType> {
    let field_type = FieldType::from_spec_str(value)?;
    if matches!(field_type, FieldType::Formula | FieldType::Lookup) {
        return Err(AppError::invalid_request(format!(
            "Field conversion target {value:?} must be a stored Field type"
        )));
    }
    Ok(field_type)
}

fn relation_cardinality(value: &str) -> Result<&str> {
    RelationCardinality::from_spec_str(value)?;
    Ok(value)
}

fn relation_on_delete(value: &str) -> Result<&str> {
    OnDeletePolicy::from_spec_str(value)?;
    Ok(value)
}

fn conversion_policies(
    from: FieldType,
    to: FieldType,
    explicit: Option<&[String]>,
) -> Result<Vec<String>> {
    const ALLOWED: &[&str] = &[
        "round-binary64",
        "truncate-toward-zero",
        "round-ties-even",
        "zero-false-nonzero-true",
        "utc-date",
        "first",
        "null-to-empty-list",
    ];
    if let Some(explicit) = explicit {
        for policy in explicit {
            if !ALLOWED.contains(&policy.as_str()) {
                return Err(AppError::invalid_request(format!(
                    "unknown conversion policy {policy:?}"
                )));
            }
        }
        return Ok(explicit.to_vec());
    }
    let mut policies = Vec::new();
    if from == FieldType::Integer && to == FieldType::Number {
        policies.push("round-binary64".to_string());
    }
    if from == FieldType::Number && to == FieldType::Integer {
        policies.push("round-ties-even".to_string());
    }
    if matches!(from, FieldType::Integer | FieldType::Number) && to == FieldType::Checkbox {
        policies.push("zero-false-nonzero-true".to_string());
    }
    if from == FieldType::Datetime && to == FieldType::Date {
        policies.push("utc-date".to_string());
    }
    if from == FieldType::MultiSelect && to == FieldType::Select {
        policies.push("first".to_string());
    }
    if !matches!(
        from,
        FieldType::MultiSelect | FieldType::File | FieldType::Relation
    ) && matches!(
        to,
        FieldType::MultiSelect | FieldType::File | FieldType::Relation
    ) {
        policies.push("null-to-empty-list".to_string());
    }
    Ok(policies)
}

fn option_rename_changes(source: &str, field_id: &str) -> Result<Vec<Value>> {
    let value = read_json_source(source)?;
    let renames = value.as_array().ok_or_else(|| {
        AppError::invalid_request("--rename-options must be a JSON array of option renames")
    })?;
    renames
        .iter()
        .map(|value| {
            let object = value.as_object().ok_or_else(|| {
                AppError::invalid_request("each option rename must be a JSON object")
            })?;
            let from = object.get("from").and_then(Value::as_str).ok_or_else(|| {
                AppError::invalid_request("each option rename requires string member from")
            })?;
            let to = object.get("to").and_then(Value::as_str).ok_or_else(|| {
                AppError::invalid_request("each option rename requires string member to")
            })?;
            let collision = object
                .get("collision")
                .and_then(Value::as_str)
                .unwrap_or("reject");
            if !matches!(collision, "reject" | "merge") {
                return Err(AppError::invalid_request(
                    "option rename collision must be reject or merge",
                ));
            }
            Ok(json!({
                "kind": "rename-option",
                "fieldId": field_id,
                "from": from,
                "to": to,
                "collision": collision,
            }))
        })
        .collect()
}

fn field_reference_info(
    file: &Path,
    reference: &str,
    table_reference: Option<&str>,
) -> Result<(FieldMeta, Vec<TableMeta>, Vec<FieldMeta>)> {
    let conn = open_file(file, false)?;
    let tables = load_tables(&conn)?;
    let fields = load_fields(&conn)?;
    let field_id = resolve_field_id(&conn, table_reference, reference)?;
    let field = fields
        .iter()
        .find(|field| field.id == field_id)
        .cloned()
        .ok_or_else(|| AppError::internal("resolved Field disappeared"))?;
    Ok((field, tables, fields))
}

fn next_field_position(file: &Path, table_id: &str) -> Result<String> {
    let conn = open_file(file, false)?;
    let position = load_fields(&conn)?
        .into_iter()
        .filter(|field| field.table_id == table_id && field.system_role.is_none())
        .map(|field| field.position)
        .max()
        .unwrap_or(-1)
        + 1;
    Ok(position.to_string())
}

fn next_table_position(conn: &Connection) -> Result<String> {
    let position = load_tables(conn)?
        .into_iter()
        .map(|table| table.position)
        .max()
        .unwrap_or(-1)
        + 1;
    Ok(position.to_string())
}

fn runtime_schema_intent(
    file: PathBuf,
    operation: Value,
    expected_revision: Option<String>,
    dry_run: bool,
) -> Result<CommandOutput> {
    runtime_schema_intent_with_options(file, operation, expected_revision, dry_run, false)
}

fn runtime_schema_intent_with_options(
    file: PathBuf,
    operation: Value,
    expected_revision: Option<String>,
    dry_run: bool,
    confirm_lossy: bool,
) -> Result<CommandOutput> {
    let public_operation = public_schema_operation(operation.clone());
    with_runtime_session(&file, true, |session| {
        let snapshot = session.call("getSnapshot", &json!({}))?;
        let expected_revision = expected_revision
            .or_else(|| {
                snapshot
                    .get("revision")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
            })
            .ok_or_else(|| AppError::internal("Runtime snapshot has no revision"))?;
        let preflight = session.call(
            "preflightSchema",
            &json!({
                "expectedRevision": expected_revision,
                "change": operation,
            }),
        )?;
        if dry_run {
            return Ok(CommandOutput::success(json!({
                "dryRun": true,
                "createdIdsAreEphemeral": true,
                "expectedRevision": expected_revision,
                "operation": public_operation,
                "result": preflight,
            })));
        }
        let plan_token = preflight
            .get("planToken")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::internal("Runtime schema preflight has no planToken"))?;
        let actions_hash = preflight
            .get("actionsHash")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::internal("Runtime schema preflight has no actionsHash"))?;
        let mut mutation = json!({
            "expectedRevision": expected_revision,
            "planToken": plan_token,
            "actionsHash": actions_hash,
        });
        if confirm_lossy {
            mutation["confirmLossy"] = json!(true);
        }
        let result = session.call("mutateSchema", &mutation)?;
        Ok(CommandOutput::success(json!({
            "dryRun": false,
            "createdIdsAreEphemeral": false,
            "expectedRevision": expected_revision,
            "operation": public_operation,
            "preflight": preflight,
            "result": result,
        })))
    })
}

fn runtime_virtual_schema_operation(file: &Path, operation: &Value) -> Result<Option<Value>> {
    let Some(object) = operation.as_object() else {
        return Ok(None);
    };
    let Some(kind) = object.get("kind").and_then(Value::as_str) else {
        return Ok(None);
    };
    match kind {
        "batch" => {
            let changes = object
                .get("changes")
                .and_then(Value::as_array)
                .ok_or_else(|| AppError::invalid_request("batch requires changes array"))?;
            if changes.is_empty() {
                return Err(AppError::invalid_request(
                    "batch requires at least one schema change",
                ));
            }
            let conn = open_file(file, false)?;
            let mut normalized = Vec::with_capacity(changes.len());
            for change in changes {
                if let Some(runtime_change) = runtime_virtual_schema_operation(file, change)? {
                    normalized.push(runtime_change);
                } else {
                    normalized.push(serde_json::to_value(normalize_schema_change(
                        &conn,
                        change.clone(),
                    )?)?);
                }
            }
            Ok(Some(json!({ "kind": "batch", "changes": normalized })))
        }
        "create-table" => {
            let source_fields = object
                .get("fields")
                .and_then(Value::as_array)
                .ok_or_else(|| AppError::invalid_request("create-table requires fields array"))?;
            let has_formula = source_fields.iter().any(|value| {
                value
                    .as_object()
                    .and_then(|field| string_member(field, &["kind", "type", "fieldType"]))
                    == Some(String::from("formula"))
            });
            if !has_formula {
                return Ok(None);
            }
            let mut fields = Vec::with_capacity(source_fields.len());
            for (index, value) in source_fields.iter().cloned().enumerate() {
                let mut field = value;
                normalize_new_field(&mut field, index)?;
                let field_object = field.as_object_mut().ok_or_else(|| {
                    AppError::invalid_request("field definition must be a JSON object")
                })?;
                if field_object.get("kind").and_then(Value::as_str) == Some("formula") {
                    let definition = field_object
                        .get("definition")
                        .and_then(Value::as_object)
                        .ok_or_else(|| {
                            AppError::invalid_request("formula Field requires definition object")
                        })?;
                    let definition = json!({
                        "sourceText": string_member(definition, &["sourceText", "formula"])
                            .ok_or_else(|| AppError::invalid_request("Formula definition requires sourceText"))?,
                        "resultType": string_member(definition, &["resultType", "displayType", "type"])
                            .ok_or_else(|| AppError::invalid_request("Formula definition requires resultType"))?,
                    });
                    field_object.insert("definition".into(), definition);
                }
                fields.push(field);
            }
            let conn = open_file(file, false)?;
            let position = object
                .get("position")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or(next_table_position(&conn)?);
            let mut normalized = json!({
                "kind": "create-table",
                "clientKey": object
                    .get("clientKey")
                    .and_then(Value::as_str)
                    .unwrap_or("table"),
                "name": object
                    .get("name")
                    .and_then(Value::as_str)
                    .ok_or_else(|| AppError::invalid_request("create-table requires name"))?,
                "position": position,
                "fields": fields,
            });
            if let Some(settings) = object.get("settings") {
                normalized["settings"] = settings.clone();
            }
            let label_key = object
                .get("labelFieldClientKey")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| {
                    let label_name = object.get("labelField").and_then(Value::as_str)?;
                    normalized["fields"].as_array()?.iter().find_map(|field| {
                        let field = field.as_object()?;
                        (field.get("name")?.as_str()? == label_name)
                            .then(|| field.get("clientKey")?.as_str().map(ToOwned::to_owned))
                            .flatten()
                    })
                });
            if let Some(label_key) = label_key {
                normalized["labelFieldClientKey"] = json!(label_key);
            }
            Ok(Some(normalized))
        }
        "create-field" => {
            let table_reference = string_member(object, &["tableId", "table"])
                .ok_or_else(|| AppError::invalid_request("create-field requires table/tableId"))?;
            let conn = open_file(file, false)?;
            let table_id = resolve_table_id(&conn, &table_reference)?;
            let mut field = object.get("field").cloned().unwrap_or_else(|| {
                let mut flat = Map::new();
                for key in [
                    "clientKey",
                    "name",
                    "type",
                    "fieldType",
                    "position",
                    "settings",
                    "definition",
                ] {
                    if let Some(value) = object.get(key) {
                        let key = if key == "fieldType" { "type" } else { key };
                        flat.insert(key.into(), value.clone());
                    }
                }
                Value::Object(flat)
            });
            let field_object = field.as_object_mut().ok_or_else(|| {
                AppError::invalid_request("create-field field must be a JSON object")
            })?;
            let field_kind = string_member(field_object, &["kind", "type"])
                .ok_or_else(|| AppError::invalid_request("create-field requires field type"))?;
            if !matches!(field_kind.as_str(), "formula" | "lookup") {
                return Ok(None);
            }
            let name = field_object
                .get("name")
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::invalid_request("virtual Field requires name"))?;
            let client_key = field_object
                .get("clientKey")
                .and_then(Value::as_str)
                .unwrap_or("virtual-field");
            let position = field_object
                .get("position")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or(next_field_position(file, &table_id)?);
            let settings = field_object.get("settings").cloned();
            let definition = field_object
                .get("definition")
                .and_then(Value::as_object)
                .ok_or_else(|| {
                    AppError::invalid_request(format!(
                        "{field_kind} Field requires definition object"
                    ))
                })?;
            let definition = if field_kind == "formula" {
                json!({
                    "sourceText": string_member(definition, &["sourceText", "formula"])
                        .ok_or_else(|| AppError::invalid_request("Formula definition requires sourceText"))?,
                    "resultType": string_member(definition, &["resultType", "displayType", "type"])
                        .ok_or_else(|| AppError::invalid_request("Formula definition requires resultType"))?,
                })
            } else {
                let fields = load_fields(&conn)?;
                let relation_reference =
                    string_member(definition, &["relationFieldId", "relationField"]).ok_or_else(
                        || AppError::invalid_request("Lookup definition requires relationFieldId"),
                    )?;
                let relation_field_id =
                    resolve_field_in_table(&fields, &table_id, &relation_reference)?;
                let relation = load_relation_fields(&conn)?
                    .into_iter()
                    .find(|relation| relation.field_id == relation_field_id)
                    .ok_or_else(|| {
                        AppError::invalid_request("Lookup relationField must be a Relation Field")
                    })?;
                let target_reference = string_member(definition, &["targetFieldId", "targetField"])
                    .ok_or_else(|| {
                        AppError::invalid_request("Lookup definition requires targetFieldId")
                    })?;
                let target_field_id =
                    resolve_field_in_table(&fields, &relation.target_table_id, &target_reference)?;
                json!({
                    "relationFieldId": relation_field_id,
                    "targetFieldId": target_field_id,
                    "aggregate": string_member(definition, &["aggregate"])
                        .ok_or_else(|| AppError::invalid_request("Lookup definition requires aggregate"))?,
                    "distinctValues": definition
                        .get("distinctValues")
                        .or_else(|| definition.get("distinct"))
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                })
            };
            let mut new_field = json!({
                "clientKey": client_key,
                "name": name,
                "kind": field_kind,
                "position": position,
                "nullable": true,
                "definition": definition,
            });
            if let Some(settings) = settings {
                new_field["settings"] = settings;
            }
            Ok(Some(json!({
                "kind": "create-field",
                "tableId": table_id,
                "field": new_field,
            })))
        }
        "rename-field" => {
            let field_reference = string_member(object, &["fieldId", "field"])
                .ok_or_else(|| AppError::invalid_request("rename-field requires field/fieldId"))?;
            let table_reference = string_member(object, &["tableId", "table"]);
            let (field, _, fields) =
                field_reference_info(file, &field_reference, table_reference.as_deref())?;
            let needs_runtime = field.physical_name.is_none()
                || fields.iter().any(|candidate| {
                    candidate.table_id == field.table_id
                        && candidate.field_type == eidos_file_core::model::FieldType::Formula
                });
            if !needs_runtime {
                return Ok(None);
            }
            let name = object
                .get("name")
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::invalid_request("rename-field requires name"))?;
            Ok(Some(json!({
                "kind": "rename-field",
                "fieldId": field.id,
                "name": name,
            })))
        }
        "delete-field" => {
            let field_reference = string_member(object, &["fieldId", "field"])
                .ok_or_else(|| AppError::invalid_request("delete-field requires field/fieldId"))?;
            let table_reference = string_member(object, &["tableId", "table"]);
            let (field, _, fields) =
                field_reference_info(file, &field_reference, table_reference.as_deref())?;
            let needs_runtime = field.physical_name.is_none()
                || fields.iter().any(|candidate| {
                    candidate.table_id == field.table_id
                        && candidate.field_type == eidos_file_core::model::FieldType::Formula
                });
            if !needs_runtime {
                return Ok(None);
            }
            let replacement = string_member(
                object,
                &["replacementLabelFieldId", "replacementLabelField"],
            )
            .map(|reference| resolve_field_in_table(&fields, &field.table_id, &reference))
            .transpose()?;
            let mut normalized = json!({
                "kind": "delete-field",
                "fieldId": field.id,
            });
            if let Some(replacement) = replacement {
                normalized["replacementLabelFieldId"] = json!(replacement);
            }
            Ok(Some(normalized))
        }
        "set-table-settings" | "set-table-position" => {
            let table_reference =
                string_member(object, &["tableId", "table"]).ok_or_else(|| {
                    AppError::invalid_request(format!("{kind} requires table/tableId"))
                })?;
            let conn = open_file(file, false)?;
            let table_id = resolve_table_id(&conn, &table_reference)?;
            let mut normalized = json!({
                "kind": kind,
                "tableId": table_id,
            });
            if kind == "set-table-settings" {
                normalized["settings"] = Value::Object(
                    object
                        .get("settings")
                        .and_then(Value::as_object)
                        .cloned()
                        .ok_or_else(|| {
                            AppError::invalid_request("set-table-settings requires settings object")
                        })?,
                );
            } else {
                normalized["position"] = object.get("position").cloned().ok_or_else(|| {
                    AppError::invalid_request("set-table-position requires position")
                })?;
            }
            Ok(Some(normalized))
        }
        "set-field-settings" | "set-field-position" | "rename-option" => {
            let field_reference =
                string_member(object, &["fieldId", "field"]).ok_or_else(|| {
                    AppError::invalid_request(format!("{kind} requires field/fieldId"))
                })?;
            let table_reference = string_member(object, &["tableId", "table"]);
            let (field, _, _) =
                field_reference_info(file, &field_reference, table_reference.as_deref())?;
            let mut normalized = json!({
                "kind": kind,
                "fieldId": field.id,
            });
            match kind {
                "set-field-settings" => {
                    normalized["settings"] = Value::Object(
                        object
                            .get("settings")
                            .and_then(Value::as_object)
                            .cloned()
                            .ok_or_else(|| {
                                AppError::invalid_request(
                                    "set-field-settings requires settings object",
                                )
                            })?,
                    );
                }
                "set-field-position" => {
                    normalized["position"] = object.get("position").cloned().ok_or_else(|| {
                        AppError::invalid_request("set-field-position requires position")
                    })?;
                }
                "rename-option" => {
                    let from = object.get("from").and_then(Value::as_str).ok_or_else(|| {
                        AppError::invalid_request("rename-option requires string from")
                    })?;
                    let to = object.get("to").and_then(Value::as_str).ok_or_else(|| {
                        AppError::invalid_request("rename-option requires string to")
                    })?;
                    let collision = object
                        .get("collision")
                        .and_then(Value::as_str)
                        .unwrap_or("reject");
                    if !matches!(collision, "reject" | "merge") {
                        return Err(AppError::invalid_request(
                            "rename-option collision must be reject or merge",
                        ));
                    }
                    normalized["from"] = json!(from);
                    normalized["to"] = json!(to);
                    normalized["collision"] = json!(collision);
                }
                _ => unreachable!(),
            }
            Ok(Some(normalized))
        }
        "set-record-label" => {
            let table_reference =
                string_member(object, &["tableId", "table"]).ok_or_else(|| {
                    AppError::invalid_request("set-record-label requires table/tableId")
                })?;
            let conn = open_file(file, false)?;
            let table_id = resolve_table_id(&conn, &table_reference)?;
            let fields = load_fields(&conn)?;
            let field_reference =
                string_member(object, &["fieldId", "field"]).ok_or_else(|| {
                    AppError::invalid_request("set-record-label requires field/fieldId")
                })?;
            let field_id = resolve_field_in_table(&fields, &table_id, &field_reference)?;
            Ok(Some(json!({
                "kind": "set-record-label",
                "tableId": table_id,
                "fieldId": field_id,
            })))
        }
        "set-relation" => {
            let field_reference = string_member(object, &["fieldId", "field"])
                .ok_or_else(|| AppError::invalid_request("set-relation requires field/fieldId"))?;
            let table_reference = string_member(object, &["tableId", "table"]);
            let (field, tables, _) =
                field_reference_info(file, &field_reference, table_reference.as_deref())?;
            if field.field_type != FieldType::Relation {
                return Err(AppError::invalid_request(
                    "set-relation requires a Relation Field",
                ));
            }
            let definition = object
                .get("definition")
                .and_then(Value::as_object)
                .ok_or_else(|| AppError::invalid_request("set-relation requires definition"))?;
            let target_reference = string_member(definition, &["targetTableId", "targetTable"])
                .ok_or_else(|| {
                    AppError::invalid_request("Relation definition requires targetTableId")
                })?;
            let target_table_id = resolve_table(&tables, &target_reference)?.id.clone();
            let direction = definition
                .get("direction")
                .and_then(Value::as_str)
                .unwrap_or("forward");
            if direction != "forward" {
                return Err(AppError::invalid_request(
                    "only forward Relation definitions can be updated",
                ));
            }
            Ok(Some(json!({
                "kind": "set-relation",
                "fieldId": field.id,
                "definition": {
                    "direction": "forward",
                    "targetTableId": target_table_id,
                    "cardinality": relation_cardinality(
                        definition.get("cardinality").and_then(Value::as_str).unwrap_or("many")
                    )?,
                    "onDelete": relation_on_delete(
                        definition.get("onDelete").and_then(Value::as_str).unwrap_or("restrict")
                    )?,
                },
            })))
        }
        "convert-field" => {
            if object.contains_key("toNullable") {
                return Err(AppError::invalid_request(
                    "Field nullability is not exposed by the CLI; omit toNullable",
                ));
            }
            let field_reference = string_member(object, &["fieldId", "field"])
                .ok_or_else(|| AppError::invalid_request("convert-field requires field/fieldId"))?;
            let table_reference = string_member(object, &["tableId", "table"]);
            let (field, tables, _) =
                field_reference_info(file, &field_reference, table_reference.as_deref())?;
            let target_type = object
                .get("to")
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::invalid_request("convert-field requires string to"))?;
            let target_type = parse_conversion_field_type(target_type)?;
            if matches!(field.field_type, FieldType::Formula | FieldType::Lookup) {
                return Err(AppError::invalid_request(
                    "Formula and Lookup Fields cannot be converted",
                ));
            }
            if field.field_type == FieldType::File || target_type == FieldType::File {
                return Err(AppError::invalid_request(
                    "File Fields cannot be converted; use attachment commands",
                ));
            }
            let explicit_policies = object
                .get("policies")
                .map(|value| {
                    value
                        .as_array()
                        .ok_or_else(|| {
                            AppError::invalid_request("convert-field policies must be an array")
                        })?
                        .iter()
                        .map(|value| {
                            value.as_str().map(ToOwned::to_owned).ok_or_else(|| {
                                AppError::invalid_request(
                                    "convert-field policies must contain strings",
                                )
                            })
                        })
                        .collect::<Result<Vec<_>>>()
                })
                .transpose()?;
            let policies =
                conversion_policies(field.field_type, target_type, explicit_policies.as_deref())?;
            let mut normalized = json!({
                "kind": "convert-field",
                "fieldId": field.id,
                "to": target_type.as_str(),
            });
            if !policies.is_empty() {
                normalized["policies"] = json!(policies);
            }
            if target_type == FieldType::Relation {
                let definition = object
                    .get("definition")
                    .and_then(Value::as_object)
                    .ok_or_else(|| {
                        AppError::invalid_request(
                            "conversion to Relation requires definition object",
                        )
                    })?;
                let target_reference = string_member(definition, &["targetTableId", "targetTable"])
                    .ok_or_else(|| {
                        AppError::invalid_request("Relation definition requires targetTableId")
                    })?;
                normalized["definition"] = json!({
                    "direction": "forward",
                    "targetTableId": resolve_table(&tables, &target_reference)?.id,
                    "cardinality": relation_cardinality(
                        definition.get("cardinality").and_then(Value::as_str).unwrap_or("many")
                    )?,
                    "onDelete": relation_on_delete(
                        definition.get("onDelete").and_then(Value::as_str).unwrap_or("restrict")
                    )?,
                });
            } else if target_type != FieldType::MultiSelect {
                normalized["toNullable"] = json!(
                    field.nullable
                        || (field.field_type == FieldType::MultiSelect
                            && target_type == FieldType::Select)
                );
            }
            Ok(Some(normalized))
        }
        "set-formula" | "set-lookup" => {
            let field_reference = string_member(object, &["fieldId", "field"])
                .ok_or_else(|| AppError::invalid_request(format!("{kind} requires fieldId")))?;
            let table_reference = string_member(object, &["tableId", "table"]);
            let (field, _, _) =
                field_reference_info(file, &field_reference, table_reference.as_deref())?;
            let expected_kind = if kind == "set-formula" {
                eidos_file_core::model::FieldType::Formula
            } else {
                eidos_file_core::model::FieldType::Lookup
            };
            if field.field_type != expected_kind {
                return Err(AppError::invalid_request(format!(
                    "Field {:?} is not a {} Field",
                    field.name,
                    if kind == "set-formula" {
                        "Formula"
                    } else {
                        "Lookup"
                    }
                )));
            }
            let definition = object
                .get("definition")
                .cloned()
                .ok_or_else(|| AppError::invalid_request(format!("{kind} requires definition")))?;
            let definition = if kind == "set-lookup" {
                let definition = definition.as_object().ok_or_else(|| {
                    AppError::invalid_request("set-lookup requires definition object")
                })?;
                let conn = open_file(file, false)?;
                let fields = load_fields(&conn)?;
                let relation_reference =
                    string_member(definition, &["relationFieldId", "relationField"]).ok_or_else(
                        || AppError::invalid_request("Lookup definition requires relationFieldId"),
                    )?;
                let relation_field_id =
                    resolve_field_in_table(&fields, &field.table_id, &relation_reference)?;
                let relation = load_relation_fields(&conn)?
                    .into_iter()
                    .find(|relation| relation.field_id == relation_field_id)
                    .ok_or_else(|| {
                        AppError::invalid_request("Lookup relationField must be a Relation Field")
                    })?;
                let target_reference = string_member(definition, &["targetFieldId", "targetField"])
                    .ok_or_else(|| {
                        AppError::invalid_request("Lookup definition requires targetFieldId")
                    })?;
                json!({
                    "relationFieldId": relation_field_id,
                    "targetFieldId": resolve_field_in_table(
                        &fields,
                        &relation.target_table_id,
                        &target_reference,
                    )?,
                    "aggregate": lookup_aggregate(
                        definition.get("aggregate").and_then(Value::as_str).ok_or_else(|| {
                            AppError::invalid_request("Lookup definition requires aggregate")
                        })?
                    )?,
                    "distinctValues": definition
                        .get("distinctValues")
                        .or_else(|| definition.get("distinct"))
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                })
            } else {
                definition
            };
            Ok(Some(json!({
                "kind": kind,
                "fieldId": field.id,
                "definition": definition,
            })))
        }
        _ => Ok(None),
    }
}

fn formula_preview(file: PathBuf, args: FormulaPreviewArgs) -> Result<CommandOutput> {
    let table_id = resolve_table_id(&open_file(&file, false)?, &args.table)?;
    let result_type = formula_result_type(&args.result_type)?;
    let mut request = json!({
        "tableId": table_id,
        "candidateName": args.name,
        "sourceText": args.formula,
        "declaredResultType": result_type,
    });
    if !args.row_ids.is_empty() {
        request["rowIds"] = json!(args.row_ids);
    }
    with_runtime_session(&file, false, |session| {
        Ok(CommandOutput::success(
            session.call("previewFormula", &request)?,
        ))
    })
}

fn formula_add(file: PathBuf, args: FormulaAddArgs) -> Result<CommandOutput> {
    let conn = open_file(&file, false)?;
    let table_id = resolve_table_id(&conn, &args.table)?;
    let result_type = formula_result_type(&args.result_type)?;
    let position = args
        .position
        .unwrap_or(next_field_position(&file, &table_id)?);
    let mut field = json!({
        "clientKey": "formula-field",
        "name": args.name,
        "kind": "formula",
        "position": position,
        "nullable": true,
        "definition": {
            "sourceText": args.formula,
            "resultType": result_type,
        },
    });
    if let Some(settings) = args.settings {
        field["settings"] = read_json_source(&settings)?;
    }
    let operation = json!({
        "kind": "create-field",
        "tableId": table_id,
        "field": field,
    });
    runtime_schema_intent(file, operation, args.expected_revision, args.dry_run)
}

fn formula_update(file: PathBuf, args: FormulaUpdateArgs) -> Result<CommandOutput> {
    let (field, _, _) = field_reference_info(&file, &args.reference, args.table.as_deref())?;
    if field.field_type != eidos_file_core::model::FieldType::Formula {
        return Err(AppError::invalid_request(format!(
            "Field {:?} is not a Formula Field",
            field.name
        )));
    }
    let operation = json!({
        "kind": "set-formula",
        "fieldId": field.id,
        "definition": {
            "sourceText": args.formula,
            "resultType": formula_result_type(&args.result_type)?,
        },
    });
    runtime_schema_intent(file, operation, args.expected_revision, args.dry_run)
}

fn formula_delete(file: PathBuf, args: FormulaDeleteArgs) -> Result<CommandOutput> {
    let (field, _, fields) = field_reference_info(&file, &args.reference, args.table.as_deref())?;
    if field.field_type != eidos_file_core::model::FieldType::Formula {
        return Err(AppError::invalid_request(format!(
            "Field {:?} is not a Formula Field",
            field.name
        )));
    }
    let replacement = args
        .replacement_label_field
        .as_deref()
        .map(|reference| {
            let table = field.table_id.as_str();
            resolve_field_in_table(&fields, table, reference)
        })
        .transpose()?;
    let mut operation = json!({
        "kind": "delete-field",
        "fieldId": field.id,
    });
    if let Some(replacement) = replacement {
        operation["replacementLabelFieldId"] = json!(replacement);
    }
    runtime_schema_intent_with_options(
        file,
        operation,
        args.expected_revision,
        args.dry_run,
        args.confirm_lossy,
    )
}

fn lookup_add(file: PathBuf, args: LookupAddArgs) -> Result<CommandOutput> {
    let conn = open_file(&file, false)?;
    let fields = load_fields(&conn)?;
    let table_id = resolve_table_id(&conn, &args.table)?;
    let relation_field_id = resolve_field_in_table(&fields, &table_id, &args.relation_field)?;
    let relation = load_relation_fields(&conn)?
        .into_iter()
        .find(|relation| relation.field_id == relation_field_id)
        .ok_or_else(|| {
            AppError::invalid_request("Lookup relationField must be a Relation Field")
        })?;
    let target_field_id =
        resolve_field_in_table(&fields, &relation.target_table_id, &args.target_field)?;
    let position = args
        .position
        .unwrap_or(next_field_position(&file, &table_id)?);
    let mut field = json!({
        "clientKey": "lookup-field",
        "name": args.name,
        "kind": "lookup",
        "position": position,
        "nullable": true,
        "definition": {
            "relationFieldId": relation_field_id,
            "targetFieldId": target_field_id,
            "aggregate": lookup_aggregate(&args.aggregate)?,
            "distinctValues": args.distinct,
        },
    });
    if let Some(settings) = args.settings {
        field["settings"] = read_json_source(&settings)?;
    }
    let operation = json!({
        "kind": "create-field",
        "tableId": table_id,
        "field": field,
    });
    runtime_schema_intent(file, operation, args.expected_revision, args.dry_run)
}

fn lookup_update(file: PathBuf, args: LookupUpdateArgs) -> Result<CommandOutput> {
    let (field, _, fields) = field_reference_info(&file, &args.reference, args.table.as_deref())?;
    if field.field_type != eidos_file_core::model::FieldType::Lookup {
        return Err(AppError::invalid_request(format!(
            "Field {:?} is not a Lookup Field",
            field.name
        )));
    }
    let relation_field_id = resolve_field_in_table(&fields, &field.table_id, &args.relation_field)?;
    let conn = open_file(&file, false)?;
    let relation = load_relation_fields(&conn)?
        .into_iter()
        .find(|relation| relation.field_id == relation_field_id)
        .ok_or_else(|| {
            AppError::invalid_request("Lookup relationField must be a Relation Field")
        })?;
    let target_field_id =
        resolve_field_in_table(&fields, &relation.target_table_id, &args.target_field)?;
    let operation = json!({
        "kind": "set-lookup",
        "fieldId": field.id,
        "definition": {
            "relationFieldId": relation_field_id,
            "targetFieldId": target_field_id,
            "aggregate": lookup_aggregate(&args.aggregate)?,
            "distinctValues": args.distinct,
        },
    });
    runtime_schema_intent(file, operation, args.expected_revision, args.dry_run)
}

fn lookup_delete(file: PathBuf, args: LookupDeleteArgs) -> Result<CommandOutput> {
    let (field, _, fields) = field_reference_info(&file, &args.reference, args.table.as_deref())?;
    if field.field_type != eidos_file_core::model::FieldType::Lookup {
        return Err(AppError::invalid_request(format!(
            "Field {:?} is not a Lookup Field",
            field.name
        )));
    }
    let replacement = args
        .replacement_label_field
        .as_deref()
        .map(|reference| resolve_field_in_table(&fields, &field.table_id, reference))
        .transpose()?;
    let mut operation = json!({
        "kind": "delete-field",
        "fieldId": field.id,
    });
    if let Some(replacement) = replacement {
        operation["replacementLabelFieldId"] = json!(replacement);
    }
    runtime_schema_intent_with_options(
        file,
        operation,
        args.expected_revision,
        args.dry_run,
        args.confirm_lossy,
    )
}

fn execute_schema_intent(
    file: PathBuf,
    operation: Value,
    expected_revision: Option<String>,
    dry_run: bool,
) -> Result<CommandOutput> {
    let mut conn = open_file(&file, true)?;
    let meta = load_file_meta(&conn)?;
    let expected_revision = expected_revision.unwrap_or_else(|| meta.revision.to_string());
    let change = normalize_schema_change(&conn, operation)?;
    let public_change = public_schema_operation(serde_json::to_value(&change)?);
    let result = if dry_run {
        preview_schema_change(&mut conn, &change, Some(&expected_revision))?
    } else {
        apply_schema_change(&mut conn, &change, Some(&expected_revision))?
    };
    Ok(CommandOutput::success(json!({
        "dryRun": dry_run,
        "createdIdsAreEphemeral": dry_run,
        "expectedRevision": expected_revision,
        "operation": public_change,
        "result": result,
    })))
}

fn resolve_table<'a>(tables: &'a [TableMeta], reference: &str) -> CoreResult<&'a TableMeta> {
    let matches: Vec<&TableMeta> = tables
        .iter()
        .filter(|table| table.id == reference || table.name == reference)
        .collect();
    match matches.as_slice() {
        [table] => Ok(table),
        [] => Err(EidosError::NotFound(format!("table {reference:?}"))),
        _ => Err(EidosError::InvalidRequest(format!(
            "table reference {reference:?} is ambiguous"
        ))),
    }
}

fn resolve_table_id(conn: &Connection, reference: &str) -> Result<String> {
    Ok(resolve_table(&load_tables(conn)?, reference)?.id.clone())
}

fn resolve_field_id(
    conn: &Connection,
    table_reference: Option<&str>,
    field_reference: &str,
) -> Result<String> {
    let table_id = table_reference
        .map(|table| resolve_table_id(conn, table))
        .transpose()?;
    let matches: Vec<FieldMeta> = load_fields(conn)?
        .into_iter()
        .filter(|field| {
            table_id
                .as_ref()
                .is_none_or(|table_id| field.table_id == *table_id)
                && (field.id == field_reference || field.name == field_reference)
        })
        .collect();
    match matches.as_slice() {
        [field] => Ok(field.id.clone()),
        [] => Err(EidosError::NotFound(format!("field {field_reference:?}")).into()),
        _ => Err(AppError::invalid_request(format!(
            "field reference {field_reference:?} is ambiguous; include its table"
        ))),
    }
}

fn string_member(object: &Map<String, Value>, names: &[&str]) -> Option<String> {
    names.iter().find_map(|name| {
        object
            .get(*name)
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
    })
}

fn normalize_new_field(value: &mut Value, index: usize) -> Result<()> {
    let object = value
        .as_object_mut()
        .ok_or_else(|| AppError::invalid_request("field definition must be a JSON object"))?;
    if object.contains_key("nullable") {
        return Err(AppError::invalid_request(
            "Field nullability is not exposed by the CLI; omit nullable",
        ));
    }
    if !object.contains_key("clientKey") {
        object.insert("clientKey".into(), json!(format!("field-{}", index + 1)));
    }
    if !object.contains_key("kind")
        && let Some(field_type) = object.remove("type")
    {
        object.insert("kind".into(), field_type);
    }
    if !object.contains_key("position") {
        object.insert("position".into(), json!(index.to_string()));
    }
    Ok(())
}

fn normalize_relation_target(conn: &Connection, field: &mut Value) -> Result<()> {
    let Some(field) = field.as_object_mut() else {
        return Ok(());
    };
    if field.get("kind").and_then(Value::as_str) != Some("relation") {
        return Ok(());
    }
    let definition = field
        .get_mut("definition")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| AppError::invalid_request("Relation field requires definition object"))?;
    let target = definition
        .remove("targetTable")
        .or_else(|| definition.get("targetTableId").cloned());
    if let Some(Value::String(reference)) = target {
        definition.insert(
            "targetTableId".into(),
            json!(resolve_table_id(conn, &reference)?),
        );
    }
    Ok(())
}

fn normalize_schema_change(conn: &Connection, mut value: Value) -> Result<SchemaLeafChange> {
    let object = value
        .as_object_mut()
        .ok_or_else(|| AppError::invalid_request("schema operation must be a JSON object"))?;
    let kind = object
        .get("kind")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::invalid_request("schema operation requires string kind"))?
        .to_string();
    match kind.as_str() {
        "create-table" => {
            if !object.contains_key("clientKey") {
                object.insert("clientKey".into(), json!("table"));
            }
            let label_name = (!object.contains_key("labelFieldClientKey"))
                .then(|| object.remove("labelField"))
                .flatten()
                .and_then(|value| value.as_str().map(ToOwned::to_owned));
            let label_key = {
                let fields = object
                    .get_mut("fields")
                    .and_then(Value::as_array_mut)
                    .ok_or_else(|| {
                        AppError::invalid_request("create-table requires fields array")
                    })?;
                for (index, field) in fields.iter_mut().enumerate() {
                    normalize_new_field(field, index)?;
                }
                label_name.as_ref().map(|label_name| {
                    fields
                        .iter()
                        .find_map(|field| {
                            let field = field.as_object()?;
                            (field.get("name")?.as_str()? == label_name)
                                .then(|| field.get("clientKey")?.as_str().map(ToOwned::to_owned))
                                .flatten()
                        })
                        .ok_or_else(|| {
                            AppError::invalid_request(format!(
                                "label field {label_name:?} is not in fields"
                            ))
                        })
                })
            }
            .transpose()?;
            if let Some(key) = label_key {
                object.insert("labelFieldClientKey".into(), json!(key));
            }
        }
        "create-field" => {
            let table = string_member(object, &["tableId", "table"])
                .ok_or_else(|| AppError::invalid_request("create-field requires table/tableId"))?;
            object.insert("tableId".into(), json!(resolve_table_id(conn, &table)?));
            object.remove("table");
            if !object.contains_key("field") {
                let mut field = Map::new();
                for key in [
                    "clientKey",
                    "name",
                    "type",
                    "fieldType",
                    "position",
                    "nullable",
                    "settings",
                    "definition",
                ] {
                    if let Some(value) = object.remove(key) {
                        let key = if key == "fieldType" { "type" } else { key };
                        field.insert(key.into(), value);
                    }
                }
                if field.is_empty() {
                    return Err(AppError::invalid_request(
                        "create-field requires field or flat field properties",
                    ));
                }
                object.insert("field".into(), Value::Object(field));
            }
            let field = object
                .get_mut("field")
                .expect("field inserted or already present");
            normalize_new_field(field, 0)?;
            normalize_relation_target(conn, field)?;
        }
        "rename-table" | "delete-table" => {
            let table = string_member(object, &["tableId", "table"]).ok_or_else(|| {
                AppError::invalid_request(format!("{kind} requires table/tableId"))
            })?;
            object.insert("tableId".into(), json!(resolve_table_id(conn, &table)?));
            object.remove("table");
            if kind == "rename-table"
                && !object.contains_key("name")
                && let Some(name) = object.remove("newName")
            {
                object.insert("name".into(), name);
            }
        }
        "rename-field" | "delete-field" => {
            let field = string_member(object, &["fieldId", "field"]).ok_or_else(|| {
                AppError::invalid_request(format!("{kind} requires field/fieldId"))
            })?;
            let table = string_member(object, &["tableId", "table"]);
            object.insert(
                "fieldId".into(),
                json!(resolve_field_id(conn, table.as_deref(), &field)?),
            );
            object.remove("field");
            object.remove("table");
            object.remove("tableId");
            if kind == "rename-field"
                && !object.contains_key("name")
                && let Some(name) = object.remove("newName")
            {
                object.insert("name".into(), name);
            }
            if let Some(replacement) = object
                .remove("replacementLabelField")
                .and_then(|value| value.as_str().map(ToOwned::to_owned))
            {
                object.insert(
                    "replacementLabelFieldId".into(),
                    json!(resolve_field_id(conn, table.as_deref(), &replacement)?),
                );
            }
        }
        "set-default-table" => {
            let table = object
                .remove("table")
                .or_else(|| object.get("tableId").cloned());
            let table_id = match table {
                None | Some(Value::Null) => Value::Null,
                Some(Value::String(reference)) => json!(resolve_table_id(conn, &reference)?),
                _ => {
                    return Err(AppError::invalid_request(
                        "set-default-table table must be a string or null",
                    ));
                }
            };
            object.insert("tableId".into(), table_id);
        }
        "set-file-title" => {}
        _ => {
            return Err(AppError::invalid_request(format!(
                "unsupported schema operation kind {kind:?}"
            )));
        }
    }
    Ok(serde_json::from_value(value)?)
}

#[cfg(test)]
mod tests {
    use super::{normalize_new_field, public_schema_operation, publish_attachment_root};
    use serde_json::json;
    use std::path::{Path, PathBuf};

    #[test]
    fn publish_attachment_root_handles_bare_and_relative_source_paths() {
        assert_eq!(
            publish_attachment_root(Path::new("report.md"), None),
            PathBuf::from(".")
        );
        assert_eq!(
            publish_attachment_root(Path::new("./report.md"), None),
            PathBuf::from(".")
        );
        assert_eq!(
            publish_attachment_root(Path::new("docs/report.md"), None),
            PathBuf::from("docs")
        );
    }

    #[test]
    fn configured_publish_attachment_root_takes_precedence() {
        assert_eq!(
            publish_attachment_root(
                Path::new("docs/report.md"),
                Some(Path::new("/workspace/assets"))
            ),
            PathBuf::from("/workspace/assets")
        );
    }

    #[test]
    fn field_normalization_rejects_public_nullability_input() {
        let mut field = json!({
            "name": "Title",
            "type": "text",
            "nullable": false,
        });
        let error = normalize_new_field(&mut field, 0).unwrap_err();
        assert!(error.message.contains("nullability is not exposed"));
    }

    #[test]
    fn public_schema_output_hides_only_internal_nullability() {
        let operation = public_schema_operation(json!({
            "kind": "create-field",
            "tableId": "table",
            "field": {
                "kind": "text",
                "nullable": true,
                "settings": { "nullable": "custom-display-value" }
            }
        }));
        assert!(operation["field"].get("nullable").is_none());
        assert_eq!(
            operation["field"]["settings"]["nullable"],
            "custom-display-value"
        );
    }
}
