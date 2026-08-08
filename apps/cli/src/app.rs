use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};

use eidos_file_core::ddl::{configure_connection, create_eidos_file};
use eidos_file_core::model::{
    FieldMeta, FileMeta, TableMeta, load_fields, load_file_meta, load_formula_fields,
    load_lookup_fields, load_relation_fields, load_tables, load_views,
};
use eidos_file_core::query::{
    FilterNode, ReadRowsOptions, RowQuery, SearchSpec, SortTerm, read_rows,
};
use eidos_file_core::rows::{
    RowChange, RowMutation, ensure_revision, mutate_rows, mutate_rows_in_transaction,
};
use eidos_file_core::schema_ops::{SchemaLeafChange, apply_schema_change, preview_schema_change};
use eidos_file_core::validate::{ValidationLevel, validate};
use eidos_file_core::{EidosError, Result as CoreResult};
use rusqlite::{Connection, OpenFlags, TransactionBehavior};
use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::cli::{
    ApplyArgs, Command, ContextArgs, CreateArgs, FileArgs, QueryArgs, RowAddArgs, RowCommand,
    RowDeleteArgs, RowUpdateArgs, RowsArgs, SchemaApplyArgs, SchemaArgs, ServeArgs, ValidateArgs,
    ValidationLevelArg,
};
use crate::error::{AppError, Result};

pub struct CommandOutput {
    pub value: Value,
    pub success: bool,
}

impl CommandOutput {
    fn success(value: Value) -> Self {
        Self {
            value,
            success: true,
        }
    }
}

pub fn run(command: Command) -> Result<CommandOutput> {
    match command {
        Command::Create(args) => create(args),
        Command::Inspect(args) => inspect(args),
        Command::Tables(args) => tables(args),
        Command::Schema(args) => schema(args),
        Command::Context(args) => context(args),
        Command::Query(args) => query(args),
        Command::Apply(args) => apply(args),
        Command::Rows(args) => rows(args),
        Command::Validate(args) => validate_file(args),
        Command::SchemaApply(args) => schema_apply(args),
        Command::Serve(args) => serve_file(args),
    }
}

#[cfg(not(windows))]
fn serve_file(args: ServeArgs) -> Result<CommandOutput> {
    // Preflight: require an existing, well-formed .eidos file before binding
    // the port; run_serve opens its own connection afterwards.
    drop(open_file(&args.file, true)?);
    qjs_host::serve::run_serve(&args.file, args.port, args.ui_dir, args.open)
        .map_err(|error| AppError::internal(error.to_string()))?;
    Ok(CommandOutput::success(json!({ "served": true })))
}

#[cfg(windows)]
fn serve_file(args: ServeArgs) -> Result<CommandOutput> {
    Err(AppError::invalid_request(format!(
        "serve is not supported on Windows yet: {}",
        args.file.display()
    )))
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

fn open_file(path: &Path, writable: bool) -> Result<Connection> {
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
            schema_result = Some(apply_schema_change(&mut conn, &change, Some("0"))?);
        }
        let meta = load_file_meta(&conn)?;
        Ok(json!({
            "created": true,
            "file": file_meta_json(&args.file, &meta),
            "schemaMutation": schema_result,
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
            "mutateSchema": true,
            "validate": true,
            "formulaEvaluation": false,
            "lookupEvaluation": false,
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
        "nullable": field.nullable,
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
    let page = read_rows(
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
    )?;
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
                    "nullable": field.nullable,
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
                "formulaEvaluation": false,
                "lookupEvaluation": false,
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
        .map(serde_json::from_value::<FilterNode>)
        .transpose()?;
    let sort = sort_json
        .map(read_json_source)
        .transpose()?
        .map(normalize_field_members)
        .map(serde_json::from_value::<Vec<SortTerm>>)
        .transpose()?;
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
    )?;
    let page = read_rows(
        &conn,
        table,
        &fields,
        &query,
        &ReadRowsOptions {
            projection: (!args.fields.is_empty()).then_some(args.fields),
            include_virtual: false,
            limit: Some(args.limit),
            offset: Some(args.offset),
        },
    )?;
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
    let mut conn = open_file(&args.file, true)?;
    let operation = read_json_source(&args.op)?;
    let change = normalize_schema_change(&conn, operation)?;
    let result = if args.dry_run {
        preview_schema_change(&mut conn, &change, Some(&args.expected_revision))?
    } else {
        apply_schema_change(&mut conn, &change, Some(&args.expected_revision))?
    };
    Ok(CommandOutput::success(json!({
        "dryRun": args.dry_run,
        "createdIdsAreEphemeral": args.dry_run,
        "operation": change,
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
