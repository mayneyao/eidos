//! Native Rust `RustRuntimeService` implementing the full Eidos Runtime 1.0
//! 22-method `RuntimeClient` contract directly over `rusqlite` + `eidos-file-core`.

use std::collections::{HashMap, HashSet};
use std::path::Path;

use eidos_file_core::ddl;
use eidos_file_core::id::{generate_uuidv7, is_valid_uuidv7};
use eidos_file_core::jcs;
use eidos_file_core::model::{
    FieldMeta, FieldType, FileMeta, FormulaFieldMeta, LookupFieldMeta, RelationDirection,
    RelationFieldMeta, SystemRole, TableMeta, ViewMeta, load_fields, load_file_meta,
    load_formula_fields, load_lookup_fields, load_relation_fields, load_tables, load_views,
};
use eidos_file_core::naming::quote_identifier;
use eidos_file_core::query::{RowQuery, SortDirection};
use eidos_file_core::rows::{
    AffectedRow, CreatedRow, RowChange, RowMutation, ensure_revision, mutate_rows_at,
};
use eidos_file_core::schema_ops::{
    CreatedObjectKind, SchemaLeafChange, apply_runtime_schema_leaf, ensure_foreign_keys,
    view_query_uses_field,
};
use eidos_file_core::time::now_instant;
use eidos_file_core::validate::{Severity, validate as core_validate};
use eidos_file_core::view_ops::{ViewMutationRequest, ViewMutationResult, mutate_views};
use rusqlite::types::Value as SqlValue;
use rusqlite::{
    Connection, OpenFlags, OptionalExtension, TransactionBehavior, params, params_from_iter,
};
use serde_json::{Map, Value as JsonValue, json};
use sha2::{Digest, Sha256};

use crate::aggregate::{compile_predicates, execute_aggregate, field_sql_expr};
use crate::calendar::{resolve_today_date, rewrite_calendar_query};
use crate::contract::{
    AggregateRequest, AggregateResponse, ColumnDescriptor, CreatedCsvRow, CsvExportRequest,
    CsvImportRequest, CsvImportResult, FormatVersion, FormulaPreviewRequest, FormulaPreviewResult,
    FormulaPreviewRow, GetRecordNeighborsRequest, GetRowsByIdRequest, GetSchemaPageRequest,
    GetSnapshotRequest, GroupBucket, GroupPage, GroupRequest, GroupRowPage, GroupRowsRequest,
    MutationResult, NegotiateRequest, NegotiateResponse, ProjectedRow, ProjectionSpec,
    QueryRowPagesRequest, QueryRowsRequest, RecordNeighbors, ResolvedRelationColumn,
    RevertMutationRequest, RowBatch, RowMutationRequest, RowPage, RuntimeDiagnostic,
    RuntimeErrorPayload, RuntimeLimits, RuntimeResult, RuntimeSnapshot, SchemaCounts,
    SchemaDependency, SchemaDependencyPage, SchemaDependencyPageRequest, SchemaMutationRequest,
    SchemaMutationResult, SchemaPage, SchemaPreflightRequest, SchemaPreflightResult,
    ValidationReportWire, ValidationRequest,
};
use crate::conversion::{ConversionPreflight, apply_field_conversion, preflight_field_conversion};
use crate::csv_io::{escape_csv_cell, logical_value_to_csv, parse_csv};
use crate::cursor::{BoundaryValue, CursorKey, PageCursor, SortKey, seek};
use crate::formula::{FORMULA_CALENDAR_CTE, coerce_formula_sql_value, compile_formula_expression};
use crate::lookup::{lookup_value_type_json, populate_virtual_columns_inner};
use crate::undo::{DeletedRowSnapshot, RowDeletionUndoState, UndoEntry, UndoStore};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpenMode {
    Create,
    ReadOnly,
    ReadWrite,
}

struct CachedSchemaPlan {
    change: JsonValue,
    actions_hash: String,
    base_revision: String,
    classification: String,
    dependencies: Vec<SchemaDependency>,
    expires: std::time::Instant,
    conversions: HashMap<String, ConversionPreflight>,
}

pub(crate) struct CachedSchema {
    unsupported_fields: HashSet<String>,
    revision: i64,
    data_version: i64,
    meta: FileMeta,
    tables: Vec<TableMeta>,
    fields: Vec<FieldMeta>,
    relations: HashMap<String, RelationFieldMeta>,
    formulas: HashMap<String, FormulaFieldMeta>,
    lookups: HashMap<String, LookupFieldMeta>,
    views: Vec<ViewMeta>,
    feature_count: i64,
}

pub struct RustRuntimeService {
    conn: Connection,
    cursor_key: CursorKey,
    space_file_columns: HashSet<String>,
    read_only: bool,
    closed: bool,
    limits: RuntimeLimits,
    undo: UndoStore,

    plans: HashMap<String, CachedSchemaPlan>,
    schema_cache: Option<CachedSchema>,
}

fn planned_field(
    table: &str,
    id: String,
    name: &str,
    field_type: FieldType,
    system_role: Option<SystemRole>,
) -> FieldMeta {
    FieldMeta {
        id,
        table_id: table.into(),
        name: name.into(),
        physical_name: (!matches!(field_type, FieldType::Formula | FieldType::Lookup))
            .then(|| name.into()),
        field_type,
        system_role,
        nullable: true,
        position: 0,
        settings_json: "{}".into(),
        created_at: String::new(),
        updated_at: String::new(),
    }
}

fn row_sort_keys(
    query: &RowQuery,
    table_fields: &[FieldMeta],
    schema: &CachedSchema,
    table: &TableMeta,
    uses_today: &mut bool,
) -> RuntimeResult<Vec<SortKey>> {
    let field_by_id: HashMap<&str, &FieldMeta> =
        table_fields.iter().map(|f| (f.id.as_str(), f)).collect();
    let mut keys = Vec::new();
    if let Some(sorts) = &query.sort {
        for s in sorts {
            let field = *field_by_id.get(s.field_id.as_str()).ok_or_else(|| {
                RuntimeErrorPayload::new(
                    "invalid-query",
                    format!("Unknown sort field {}", s.field_id),
                )
            })?;
            schema.check_scalar(field)?;
            let expr = schema.value_expression(table, field, table_fields, uses_today)?;
            keys.push(SortKey {
                expr,
                descending: s.direction == SortDirection::Desc,
                nulls_first: s.nulls == Some(eidos_file_core::query::NullsOrder::First),
            });
        }
    }
    keys.push(SortKey {
        expr: "\"_id\"".into(),
        descending: false,
        nulls_first: false,
    });

    Ok(keys)
}

impl CachedSchema {
    pub(crate) fn list_element(&self, field: &FieldMeta) -> Option<String> {
        let lookup = self.lookups.get(&field.id)?;
        lookup_value_type_json(lookup, &self.fields, &self.formulas, &self.lookups)["element"]
            .as_str()
            .map(str::to_owned)
    }

    fn check_scalar(&self, field: &FieldMeta) -> RuntimeResult<()> {
        if self.list_element(field).is_some()
            || matches!(
                field.field_type,
                FieldType::Relation | FieldType::File | FieldType::MultiSelect
            )
        {
            return Err(RuntimeErrorPayload::new(
                "invalid-query",
                "Expected a sortable or groupable scalar field",
            ));
        }
        Ok(())
    }

    pub(crate) fn value_expression(
        &self,
        table: &TableMeta,
        field: &FieldMeta,
        fields: &[FieldMeta],
        uses_today: &mut bool,
    ) -> RuntimeResult<String> {
        if let Some(lookup) = self.lookups.get(&field.id) {
            let outer =
                quote_identifier(&table.physical_name).map_err(RuntimeErrorPayload::from_core)?;
            lookup_expression(&outer, lookup, self, uses_today, 0)
        } else if let Some(def) = self.formulas.get(&field.id) {
            let compiled = self
                .formula(&def.source_text, fields, Some(&field.id), None, 0)
                .map_err(|d| RuntimeErrorPayload::new(d.code, d.message.unwrap_or_default()))?;
            *uses_today |= compiled.uses_today;
            Ok(format!("({})", compiled.sql))
        } else {
            field_sql_expr(field, fields, &self.formulas, uses_today)
        }
    }

    #[allow(clippy::result_large_err)]
    pub(crate) fn formula(
        &self,
        source: &str,
        fields: &[FieldMeta],
        id: Option<&str>,
        alias: Option<&str>,
        depth: usize,
    ) -> Result<crate::formula::CompiledFormula, RuntimeDiagnostic> {
        crate::formula::compile_with_lookups(
            source,
            fields,
            &self.formulas,
            id,
            alias,
            &mut |field| {
                let error = |e: RuntimeErrorPayload| crate::formula::type_error(&e.message);
                let lookup = self
                    .lookups
                    .get(&field.id)
                    .ok_or_else(|| crate::formula::type_error("Missing Lookup definition"))?;
                let outer = if let Some(alias) = alias {
                    alias.to_owned()
                } else {
                    let table = self
                        .tables
                        .iter()
                        .find(|t| t.id == field.table_id)
                        .ok_or_else(|| crate::formula::type_error("Missing Lookup table"))?;
                    quote_identifier(&table.physical_name)
                        .map_err(|e| crate::formula::type_error(&e.to_string()))?
                };
                let kind = self.logical_type(field).map_err(error)?;
                let kind = if kind == FieldType::Select {
                    eidos_file_core::model::FormulaResultType::Text
                } else {
                    eidos_file_core::model::FormulaResultType::from_spec_str(kind.as_str())
                        .map_err(|_| crate::formula::type_error("Expected scalar Lookup"))?
                };
                let mut clock = false;
                let sql = lookup_expression(&outer, lookup, self, &mut clock, depth + 1)
                    .map_err(error)?;
                Ok((sql, kind, clock))
            },
        )
    }

    pub(crate) fn logical_type(&self, field: &FieldMeta) -> RuntimeResult<FieldType> {
        let lookup_type;
        let kind = if let Some(def) = self.formulas.get(&field.id) {
            Some(def.result_type.as_str())
        } else if let Some(lookup) = self.lookups.get(&field.id) {
            lookup_type =
                lookup_value_type_json(lookup, &self.fields, &self.formulas, &self.lookups);
            if let Some(element) = lookup_type["element"].as_str() {
                return Ok(if element == "file-entry" {
                    FieldType::File
                } else {
                    FieldType::MultiSelect
                });
            }
            lookup_type.as_str()
        } else {
            None
        };
        match kind {
            Some("row-id") => Ok(FieldType::Text),
            Some("file-entry") | None => Ok(field.field_type),
            Some(kind) => FieldType::from_spec_str(kind).map_err(RuntimeErrorPayload::from_core),
        }
    }
}

fn lookup_expression(
    outer: &str,
    lookup: &LookupFieldMeta,
    schema: &CachedSchema,
    uses_today: &mut bool,
    depth: usize,
) -> RuntimeResult<String> {
    if depth > 64 {
        return Err(RuntimeErrorPayload::new(
            "semantic-cycle",
            "Lookup dependency depth exceeded",
        ));
    }
    let invalid = || RuntimeErrorPayload::new("corrupt-file", "Invalid Lookup definition");
    let quote = |s: &str| quote_identifier(s).map_err(RuntimeErrorPayload::from_core);
    let relation = schema
        .relations
        .get(&lookup.relation_field_id)
        .ok_or_else(invalid)?;
    let find = |id: &str| {
        schema
            .fields
            .iter()
            .find(|f| f.id == id)
            .ok_or_else(invalid)
    };
    let target = find(&lookup.target_field_id)?;
    let dest = schema
        .tables
        .iter()
        .find(|t| t.id == target.table_id)
        .ok_or_else(invalid)?;
    let dest_name = quote(&dest.physical_name)?;
    let mut name = format!("__eidos_lookup_target_{depth}");
    while quote(&name)?.eq_ignore_ascii_case(outer) {
        name.push('_');
    }
    let alias = quote(&name)?;
    let cell = if let Some(name) = &target.physical_name {
        format!("{alias}.{}", quote(name)?)
    } else {
        let scope = schema
            .fields
            .iter()
            .filter(|f| f.table_id == dest.id)
            .cloned()
            .collect::<Vec<_>>();
        if let Some(def) = schema.formulas.get(&target.id) {
            let compiled = schema
                .formula(
                    &def.source_text,
                    &scope,
                    Some(&target.id),
                    Some(&alias),
                    depth + 1,
                )
                .map_err(|d| RuntimeErrorPayload::new(d.code, d.message.unwrap_or_default()))?;
            *uses_today |= compiled.uses_today;
            format!("({})", compiled.sql)
        } else if let Some(nested) = schema.lookups.get(&target.id) {
            lookup_expression(&alias, nested, schema, uses_today, depth + 1)?
        } else {
            return Err(invalid());
        }
    };
    let (from, condition, order) = match relation.direction {
        RelationDirection::Forward => {
            let field = find(&lookup.relation_field_id)?;
            let column = quote(field.physical_name.as_deref().ok_or_else(invalid)?)?;
            (
                format!(
                    "json_each({outer}.{column}) links JOIN {dest_name} AS {alias} ON {alias}._id=links.value"
                ),
                "1".to_owned(),
                "links.key".to_owned(),
            )
        }
        RelationDirection::Inverse => {
            let field = find(
                relation
                    .inverse_of_field_id
                    .as_deref()
                    .ok_or_else(invalid)?,
            )?;
            let column = quote(field.physical_name.as_deref().ok_or_else(invalid)?)?;
            (
                format!("{dest_name} AS {alias}"),
                format!(
                    "EXISTS(SELECT 1 FROM json_each({alias}.{column}) WHERE value={outer}._id)"
                ),
                format!("{alias}._id"),
            )
        }
    };
    let mut values = format!("SELECT {cell} AS v FROM {from} WHERE {condition} ORDER BY {order}");
    if schema.list_element(target).is_some()
        || matches!(
            target.field_type,
            FieldType::MultiSelect | FieldType::Relation | FieldType::File
        )
    {
        values = format!("SELECT item.value AS v FROM ({values}) cells, json_each(cells.v) item");
    }
    let distinct = if lookup.distinct_values {
        "DISTINCT "
    } else {
        ""
    };
    let values = format!("SELECT {distinct}v FROM ({values})");
    let kind =
        crate::lookup::lookup_element(lookup, &schema.fields, &schema.formulas, &schema.lookups);
    let atom = match kind {
        "integer" => "CAST(v AS TEXT)",
        "checkbox" => "json(CASE WHEN v IS NULL THEN 'null' WHEN v THEN 'true' ELSE 'false' END)",
        "file-entry" => "json(v)",
        _ => "v",
    };
    let aggregate = lookup.aggregate.as_str();
    Ok(format!(
        "(SELECT eidos_runtime_lookup(json_group_array({atom}), '{aggregate}', '{kind}') FROM ({values}))"
    ))
}

fn view_layout_uses_field(layout: &JsonValue, id: &str) -> bool {
    ["cardFields", "fieldOrder", "hiddenFields"]
        .iter()
        .any(|k| {
            layout[*k]
                .as_array()
                .is_some_and(|values| values.iter().any(|v| v.as_str() == Some(id)))
        })
        || ["coverField", "groupField", "dateField"]
            .iter()
            .any(|k| layout[*k].as_str() == Some(id))
        || layout["fieldWidths"].get(id).is_some()
}

fn field_depends_on_today(
    field: &FieldMeta,
    all_fields: &[FieldMeta],
    lookups: &HashMap<String, LookupFieldMeta>,
    formulas: &HashMap<String, FormulaFieldMeta>,
) -> bool {
    use eidos_file_core::formula_source::{Token, tokenize};
    let mut pending = vec![field];
    let mut seen = HashSet::new();
    while let Some(current) = pending.pop() {
        if !seen.insert(&current.id) {
            continue;
        }
        if let Some(lookup) = lookups.get(&current.id)
            && let Some(target) = all_fields.iter().find(|f| f.id == lookup.target_field_id)
        {
            pending.push(target);
        }
        if let Some(formula) = formulas.get(&current.id)
            && let Ok(tokens) = tokenize(&formula.source_text)
        {
            for (i, token) in tokens.iter().enumerate() {
                match token {
                    Token::Ident(name)
                        if name.eq_ignore_ascii_case("TODAY")
                            && matches!(tokens.get(i+1), Some(Token::Symbol(p)) if p == "(") =>
                    {
                        return true;
                    }
                    Token::QuotedIdent(name) => pending.extend(
                        all_fields
                            .iter()
                            .find(|f| f.table_id == current.table_id && f.name == *name),
                    ),
                    _ => {}
                }
            }
        }
    }
    false
}

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let digest = hasher.finalize();
    let mut out = String::with_capacity(64);
    for b in digest {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

fn value_type_json(
    field: &FieldMeta,
    all_fields: &[FieldMeta],
    formulas: &HashMap<String, FormulaFieldMeta>,
    lookups: &HashMap<String, LookupFieldMeta>,
) -> JsonValue {
    if let Some(role) = field.system_role {
        return match role {
            SystemRole::RowId => json!("row-id"),
            SystemRole::CreatedTime | SystemRole::UpdatedTime => json!("datetime"),
        };
    }
    match field.field_type {
        FieldType::Text => json!("text"),
        FieldType::Number => json!("number"),
        FieldType::Integer => json!("integer"),
        FieldType::Checkbox => json!("checkbox"),
        FieldType::Date => json!("date"),
        FieldType::Datetime => json!("datetime"),
        FieldType::Url => json!("url"),
        FieldType::Select => json!("select"),
        FieldType::MultiSelect => json!("multi-select"),
        FieldType::File => json!("file"),
        FieldType::Relation => json!("relation"),
        FieldType::Formula => {
            if let Some(def) = formulas.get(&field.id) {
                json!(def.result_type.as_str())
            } else {
                json!("text")
            }
        }
        FieldType::Lookup => {
            if let Some(lk) = lookups.get(&field.id) {
                lookup_value_type_json(lk, all_fields, formulas, lookups)
            } else {
                json!({ "kind": "list", "element": "text" })
            }
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct GroupRowCursorPayload {
    table_id: String,
    group_key: Vec<JsonValue>,
    bucket_query: RowQuery,
    projection: ProjectionSpec,
    row_cursor: String,
}

fn normalized_query(query: &RowQuery) -> RowQuery {
    let mut query = query.clone();
    for term in query.sort.get_or_insert_default() {
        term.nulls
            .get_or_insert(eidos_file_core::query::NullsOrder::Last);
    }
    query
}

fn decode_stored_cell(val: SqlValue, field: &FieldMeta) -> JsonValue {
    match val {
        SqlValue::Null => JsonValue::Null,
        SqlValue::Integer(i) => match field.field_type {
            FieldType::Checkbox => JsonValue::Bool(i != 0),
            FieldType::Integer => JsonValue::String(i.to_string()),
            FieldType::Number => json!(i as f64),
            _ => JsonValue::String(i.to_string()),
        },
        SqlValue::Real(f) => {
            if !f.is_finite() {
                JsonValue::Null
            } else {
                json!(if f == 0.0 { 0.0 } else { f })
            }
        }
        SqlValue::Text(s) => match field.field_type {
            FieldType::MultiSelect | FieldType::Relation | FieldType::File => {
                serde_json::from_str(&s).unwrap_or(JsonValue::Array(Vec::new()))
            }
            FieldType::Integer => JsonValue::String(s),
            _ => JsonValue::String(s),
        },
        SqlValue::Blob(_) => JsonValue::Null,
    }
}

impl RustRuntimeService {
    pub fn create(path: &Path, title: &str) -> RuntimeResult<Self> {
        ddl::create_eidos_file(path, Some(title)).map_err(RuntimeErrorPayload::from_core)?;
        Self::open(path, false)
    }

    pub fn open(path: &Path, read_only: bool) -> RuntimeResult<Self> {
        let flags = if read_only {
            OpenFlags::SQLITE_OPEN_READ_ONLY
        } else {
            OpenFlags::SQLITE_OPEN_READ_WRITE
        } | OpenFlags::SQLITE_OPEN_NO_MUTEX;

        let conn = Connection::open_with_flags(path, flags)
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
        ddl::configure_connection(&conn).map_err(RuntimeErrorPayload::from_core)?;
        crate::calendar::register_external_instants(&conn)?;
        crate::formula::register_arithmetic(&conn)?;
        crate::lookup::register_lookup_aggregate(&conn)?;
        if read_only {
            conn.execute_batch("PRAGMA query_only = ON; PRAGMA temp_store = MEMORY;")
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
        }
        // Verify identity on open
        let _ = load_file_meta(&conn).map_err(RuntimeErrorPayload::from_core)?;

        let limits = RuntimeLimits::default();
        let undo_max = limits.undo_entries_max;
        Ok(Self {
            conn,
            read_only,
            closed: false,
            limits,
            space_file_columns: HashSet::new(),
            cursor_key: CursorKey::new()?,
            undo: UndoStore::new(undo_max),

            plans: HashMap::new(),
            schema_cache: None,
        })
    }

    /// Opens an isolated writable in-memory snapshot copied from `path` via
    /// SQLite backup, leaving the source file untouched (for CLI dry-run previews).
    pub fn open_snapshot(path: &Path) -> RuntimeResult<Self> {
        let src = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
        let mut dst = Connection::open_in_memory()
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
        {
            let backup = rusqlite::backup::Backup::new(&src, &mut dst)
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
            backup
                .run_to_completion(100, std::time::Duration::ZERO, None)
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
        }
        drop(src);
        ddl::configure_connection(&dst).map_err(RuntimeErrorPayload::from_core)?;
        crate::calendar::register_external_instants(&dst)?;
        crate::formula::register_arithmetic(&dst)?;
        crate::lookup::register_lookup_aggregate(&dst)?;
        let _ = load_file_meta(&dst).map_err(RuntimeErrorPayload::from_core)?;

        let limits = RuntimeLimits::default();
        let undo_max = limits.undo_entries_max;
        Ok(Self {
            conn: dst,
            read_only: false,
            closed: false,
            limits,
            space_file_columns: HashSet::new(),
            cursor_key: CursorKey::new()?,
            undo: UndoStore::new(undo_max),
            plans: HashMap::new(),
            schema_cache: None,
        })
    }

    /// Keep Runtime reads and response construction on the same connection as
    /// the write. Roll back on any error (including commit failure or unwind).
    fn transaction<T>(
        &mut self,
        begin: &str,
        action: impl FnOnce(&mut Self) -> RuntimeResult<T>,
    ) -> RuntimeResult<T> {
        struct PendingTransaction<'a>(&'a mut RustRuntimeService);
        impl Drop for PendingTransaction<'_> {
            fn drop(&mut self) {
                if !self.0.conn.is_autocommit() {
                    let _ = self.0.conn.execute_batch("ROLLBACK");
                    self.0.invalidate_cache();
                }
            }
        }
        let sql_error =
            |e: rusqlite::Error| RuntimeErrorPayload::new("adapter-error", e.to_string());
        self.conn.execute_batch(begin).map_err(sql_error)?;
        let guard = PendingTransaction(self);
        let result = action(guard.0)?;
        guard.0.conn.execute_batch("COMMIT").map_err(sql_error)?;
        Ok(result)
    }

    pub fn connection(&self) -> &Connection {
        &self.conn
    }

    pub fn connection_mut(&mut self) -> &mut Connection {
        &mut self.conn
    }

    pub fn set_space_file_columns(&mut self, fields: Vec<String>) {
        self.space_file_columns = fields.into_iter().collect();
    }

    fn read_cell(&self, value: SqlValue, field: &FieldMeta) -> RuntimeResult<JsonValue> {
        if !self.space_file_columns.contains(&field.id) {
            if field.field_type == FieldType::File && field.physical_name.is_some() {
                let invalid =
                    || RuntimeErrorPayload::new("corrupt-file", "Invalid stored File value");
                let SqlValue::Text(ref encoded) = value else {
                    return Err(invalid());
                };
                let parsed = serde_json::from_str(encoded).map_err(|_| invalid())?;
                if eidos_file_core::values::coerce_value(field, &parsed).map_err(|_| invalid())?
                    != value
                {
                    return Err(invalid());
                }
                return Ok(parsed);
            }
            return Ok(decode_stored_cell(value, field));
        }
        if value == SqlValue::Null {
            return Ok(json!([]));
        }
        let SqlValue::Text(encoded) = value else {
            return Err(RuntimeErrorPayload::new(
                "invalid-value",
                "Invalid catalog File value",
            ));
        };
        let mut entries: Vec<JsonValue> = serde_json::from_str(&encoded)
            .map_err(|e| RuntimeErrorPayload::new("invalid-value", e.to_string()))?;
        for entry in &mut entries {
            let uri = entry["uri"]
                .as_str()
                .and_then(|s| s.strip_prefix("../"))
                .ok_or_else(|| {
                    RuntimeErrorPayload::new("invalid-value", "Invalid catalog attachment path")
                })?
                .to_owned();
            entry["uri"] = json!(uri);
        }
        let result = JsonValue::Array(entries);
        eidos_file_core::values::coerce_value(field, &result)
            .map_err(RuntimeErrorPayload::from_core)?;
        Ok(result)
    }

    pub fn data_version(&self) -> RuntimeResult<i64> {
        self.ensure_open()?;
        self.conn
            .query_row("PRAGMA data_version", [], |r| r.get::<_, i64>(0))
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))
    }

    pub fn load_extension(&self, ext_path: &Path) -> RuntimeResult<()> {
        self.ensure_open()?;
        unsafe {
            self.conn
                .load_extension_enable()
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
            let res = self.conn.load_extension(ext_path, None::<&str>);
            let _ = self.conn.load_extension_disable();
            res.map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
        }
        Ok(())
    }

    pub fn close(&mut self) -> RuntimeResult<()> {
        self.closed = true;
        self.schema_cache = None;
        self.plans.clear();
        self.undo.clear();
        Ok(())
    }

    fn ensure_open(&self) -> RuntimeResult<()> {
        if self.closed {
            return Err(RuntimeErrorPayload::new("closed", "Runtime is closed"));
        }
        Ok(())
    }

    fn ensure_writable(&mut self) -> RuntimeResult<()> {
        self.ensure_open()?;
        if self.read_only {
            return Err(RuntimeErrorPayload::new(
                "unsupported",
                "Runtime is opened read-only",
            ));
        }
        if !self.ensure_schema()?.unsupported_fields.is_empty() {
            return Err(RuntimeErrorPayload::new(
                "unsupported",
                "This file requires a newer Eidos version and is available read-only",
            ));
        }
        Ok(())
    }

    fn invalidate_cache(&mut self) {
        self.schema_cache = None;
    }

    fn ensure_schema(&mut self) -> RuntimeResult<&CachedSchema> {
        self.ensure_open()?;
        let data_version = self.data_version()?;
        let current_rev: i64 = self
            .conn
            .query_row("SELECT revision FROM eidos__meta LIMIT 1", [], |r| r.get(0))
            .map_err(|e| RuntimeErrorPayload::new("corrupt-file", e.to_string()))?;

        let valid_cache = self
            .schema_cache
            .as_ref()
            .is_some_and(|c| c.revision == current_rev && c.data_version == data_version);

        if !valid_cache {
            let meta = load_file_meta(&self.conn).map_err(RuntimeErrorPayload::from_core)?;
            let tables = load_tables(&self.conn).map_err(RuntimeErrorPayload::from_core)?;
            let fields = load_fields(&self.conn).map_err(RuntimeErrorPayload::from_core)?;
            let relations = load_relation_fields(&self.conn)
                .map_err(RuntimeErrorPayload::from_core)?
                .into_iter()
                .map(|r| (r.field_id.clone(), r))
                .collect();
            let formulas: HashMap<_, _> = load_formula_fields(&self.conn)
                .map_err(RuntimeErrorPayload::from_core)?
                .into_iter()
                .map(|f| (f.field_id.clone(), f))
                .collect();
            let lookups = load_lookup_fields(&self.conn)
                .map_err(RuntimeErrorPayload::from_core)?
                .into_iter()
                .map(|l| (l.field_id.clone(), l))
                .collect();
            let views = load_views(&self.conn).map_err(RuntimeErrorPayload::from_core)?;
            let feature_count: i64 = self
                .conn
                .query_row("SELECT COUNT(*) FROM eidos__features", [], |r| r.get(0))
                .unwrap_or(0);
            self.schema_cache = Some(CachedSchema {
                unsupported_fields: crate::formula::unsupported_fields(
                    &fields, &formulas, &lookups,
                ),
                revision: current_rev,
                data_version,
                meta,
                tables,
                fields,
                relations,
                formulas,
                lookups,
                views,
                feature_count,
            });
        }
        Ok(self.schema_cache.as_ref().unwrap())
    }

    pub fn negotiate(&self, req: &NegotiateRequest) -> RuntimeResult<NegotiateResponse> {
        self.ensure_open()?;
        if req.protocol != "eidos-runtime" || !req.versions.iter().any(|v| v == "1.0") {
            return Err(RuntimeErrorPayload::new(
                "unsupported",
                "Unsupported runtime protocol or version",
            ));
        }
        Ok(NegotiateResponse {
            version: "1.0".into(),
            capabilities: json!({
                "temporalDefaultsVersion": 1,
                "viewCreationDefaultsVersion": 1,
                "readRows": true,
                "schemaPaging": true,
                "cursorPaging": true,
                "groupRows": true,
                "formulaPreview": true,
                "mutateRows": !self.read_only,
                "mutateSchema": !self.read_only,
                "schemaPreflight": !self.read_only,
                "mutateView": !self.read_only,
                "validate": true,
                "calendarPeriodTimeZoneData": [jiff_tzdb::VERSION],
                "read": true,
                "write": !self.read_only,
                "schemaMutation": !self.read_only,
                "viewMutation": !self.read_only,
                "formula": true,
                "formulaToday": true,
                "lookup": true,
                "aggregate": true,
                "batchRowPages": true,
                "rowIndex": true,
                "group": true,
                "csvExport": true,
                "csvImport": !self.read_only,
                "undo": !self.read_only,
                "calendarQueryVersion": 2,
                "calendarWindowVersion": 1,
                "backend": "rust"
            }),
            limits: self.limits.clone(),
        })
    }

    pub fn get_snapshot(&mut self, req: &GetSnapshotRequest) -> RuntimeResult<RuntimeSnapshot> {
        let schema = self.ensure_schema()?;
        if let Some(min_rev) = &req.minimum_revision
            && let Ok(min_num) = min_rev.parse::<i64>()
            && schema.meta.revision < min_num
        {
            return Err(RuntimeErrorPayload::new(
                "stale-revision",
                format!(
                    "Current revision {} is older than minimumRevision {min_rev}",
                    schema.meta.revision
                ),
            ));
        }
        Ok(RuntimeSnapshot {
            file_id: schema.meta.file_id.clone(),
            format: FormatVersion {
                major: schema.meta.format_major,
                minor: schema.meta.format_minor,
            },
            revision: schema.meta.revision.to_string(),
            title: schema.meta.title.clone(),
            default_table_id: schema.meta.default_table_id.clone(),
            schema_counts: SchemaCounts {
                tables: schema.tables.len().to_string(),
                fields: schema.fields.len().to_string(),
                views: schema.views.len().to_string(),
                features: schema.feature_count.to_string(),
            },
        })
    }

    pub fn get_schema_page(&mut self, req: &GetSchemaPageRequest) -> RuntimeResult<SchemaPage> {
        if !self.conn.is_autocommit() {
            return self.get_schema_page_in_snapshot(req);
        }
        self.transaction("BEGIN", |service| service.get_schema_page_in_snapshot(req))
    }

    fn get_schema_page_in_snapshot(
        &mut self,
        req: &GetSchemaPageRequest,
    ) -> RuntimeResult<SchemaPage> {
        let read_only = self.read_only;
        let schema = self.ensure_schema()?;
        let rev_str = schema.meta.revision.to_string();
        if req.revision != rev_str {
            return Err(RuntimeErrorPayload::new(
                "stale-revision",
                format!("Expected revision {}, found {rev_str}", req.revision),
            )
            .with_current_revision(rev_str));
        }

        let mut all_objects: Vec<JsonValue> =
            Vec::with_capacity(schema.tables.len() + schema.fields.len() + schema.views.len() + 8);

        for t in &schema.tables {
            let settings: JsonValue =
                serde_json::from_str(&t.settings_json).unwrap_or_else(|_| json!({}));
            all_objects.push(json!({
                "object": "table",
                "id": t.id,
                "name": t.name,
                "labelFieldId": t.label_field_id,
                "position": t.position.to_string(),
                "settings": settings,
            }));
        }

        for f in &schema.fields {
            let settings: JsonValue =
                serde_json::from_str(&f.settings_json).unwrap_or_else(|_| json!({}));
            let writable = f.system_role.is_none()
                && settings["isSystem"] != true
                && settings["readOnly"] != true
                && settings["writable"] != false
                && !read_only
                && schema.unsupported_fields.is_empty()
                && !matches!(f.field_type, FieldType::Formula | FieldType::Lookup)
                && schema
                    .relations
                    .get(&f.id)
                    .map(|r| r.direction == RelationDirection::Forward)
                    .unwrap_or(true);
            let mut obj = Map::new();
            obj.insert("object".into(), json!("field"));
            obj.insert("id".into(), json!(f.id));
            obj.insert("tableId".into(), json!(f.table_id));
            obj.insert("name".into(), json!(f.name));
            obj.insert("kind".into(), json!(f.field_type.as_str()));
            obj.insert(
                "valueType".into(),
                value_type_json(f, &schema.fields, &schema.formulas, &schema.lookups),
            );
            obj.insert(
                "systemRole".into(),
                match f.system_role {
                    Some(SystemRole::RowId) => json!("row-id"),
                    Some(SystemRole::CreatedTime) => json!("created-time"),
                    Some(SystemRole::UpdatedTime) => json!("updated-time"),
                    None => JsonValue::Null,
                },
            );
            obj.insert("nullable".into(), json!(f.nullable));
            obj.insert("position".into(), json!(f.position.to_string()));
            obj.insert("settings".into(), settings);
            obj.insert("writable".into(), json!(writable));
            if schema.unsupported_fields.contains(&f.id) {
                obj.insert("valueStatus".into(), json!("unsupported-formula"));
            }

            if let Some(rel) = schema.relations.get(&f.id) {
                let def = match rel.direction {
                    RelationDirection::Forward => json!({
                        "direction": "forward",
                        "targetTableId": rel.target_table_id,
                        "cardinality": rel.cardinality.as_str(),
                        "onDelete": rel.on_delete.map(|p| p.as_str()).unwrap_or("restrict"),
                    }),
                    RelationDirection::Inverse => json!({
                        "direction": "inverse",
                        "targetTableId": rel.target_table_id,
                        "cardinality": "many",
                        "inverseOfFieldId": rel.inverse_of_field_id,
                    }),
                };
                obj.insert("definition".into(), def);
            } else if let Some(form) = schema.formulas.get(&f.id) {
                obj.insert(
                    "definition".into(),
                    json!({
                        "sourceText": form.source_text,
                        "resultType": form.result_type.as_str(),
                    }),
                );
            } else if let Some(lk) = schema.lookups.get(&f.id) {
                obj.insert(
                    "definition".into(),
                    json!({
                        "relationFieldId": lk.relation_field_id,
                        "targetFieldId": lk.target_field_id,
                        "aggregate": lk.aggregate.as_str(),
                        "distinctValues": lk.distinct_values,
                    }),
                );
            }
            all_objects.push(JsonValue::Object(obj));
        }

        for v in &schema.views {
            let query: JsonValue =
                serde_json::from_str(&v.query_json).unwrap_or_else(|_| json!({}));
            let layout: JsonValue =
                serde_json::from_str(&v.layout_json).unwrap_or_else(|_| json!({}));
            let unsupported_formula = schema
                .unsupported_fields
                .iter()
                .any(|id| view_query_uses_field(&query, id));
            let mut view = json!({
                "object": "view",
                "id": v.id,
                "tableId": v.table_id,
                "name": v.name,
                "type": v.view_type,
                "queryStatus": if unsupported_formula || (req.calendar_query_version != Some(2) && eidos_file_core::validate::has_calendar_filter(&query, "calendar-period"))
                    || (req.calendar_window_version != Some(1) && eidos_file_core::validate::has_calendar_filter(&query, "calendar-window"))
                    || eidos_file_core::validate::has_calendar_filter(&query, "calendar-day")
                    || eidos_file_core::validate::has_calendar_filter(&query, "relative-date") { "unsupported" } else { "supported" },
                "query": query,
                "layout": layout,
                "position": v.position.to_string(),
            });
            if unsupported_formula {
                view["queryUnavailableReason"] = json!("unsupported-formula");
            }
            if view["queryStatus"] == "supported" {
                crate::saved_query::normalize(&mut view["query"], |field_id| {
                    schema
                        .fields
                        .iter()
                        .find(|field| field.id == field_id && field.table_id == v.table_id)
                        .is_some_and(|field| match field.field_type {
                            FieldType::MultiSelect | FieldType::File | FieldType::Relation => true,
                            FieldType::Lookup => schema
                                .lookups
                                .get(field_id)
                                .is_some_and(|lookup| lookup.aggregate.as_str() == "values"),
                            _ => false,
                        })
                })?;
            }
            all_objects.push(view);
        }

        // Load features
        {
            let mut stmt = self
                .conn
                .prepare("SELECT name, version, required, config_json FROM eidos__features ORDER BY name")
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
            let mut rows = stmt
                .query([])
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
            while let Some(r) = rows
                .next()
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?
            {
                let name: String = r.get(0).unwrap_or_default();
                let version: String = r.get(1).unwrap_or_default();
                let required: i64 = r.get(2).unwrap_or(0);
                let config_raw: String = r.get(3).unwrap_or_else(|_| "{}".into());
                let config: JsonValue =
                    serde_json::from_str(&config_raw).unwrap_or_else(|_| json!({}));
                all_objects.push(json!({
                    "object": "feature",
                    "name": name,
                    "version": version,
                    "required": required != 0,
                    "config": config,
                }));
            }
        }

        let file_id = self.schema_cache.as_ref().unwrap().meta.file_id.clone();
        let binding = sha256_hex(
            &json!([
                "schema",
                file_id,
                req.revision,
                req.calendar_query_version,
                req.calendar_window_version
            ])
            .to_string(),
        );
        let offset = if let Some(token) = &req.cursor {
            let cursor: PageCursor<usize> = self.cursor_key.open(token)?;
            cursor.check(&binding, &rev_str, None)?;
            cursor.boundary
        } else {
            0
        };
        let limit = req.limit.clamp(1, self.limits.schema_page_size_max);
        let end = (offset + limit).min(all_objects.len());
        let page_objs = if offset < all_objects.len() {
            all_objects[offset..end].to_vec()
        } else {
            Vec::new()
        };
        let next_cursor = if end < all_objects.len() {
            Some(self.cursor_key.seal(&PageCursor {
                binding,
                revision: rev_str.clone(),
                instant: None,
                boundary: end,
            })?)
        } else {
            None
        };

        Ok(SchemaPage {
            file_id,
            revision: rev_str,
            objects: page_objs,
            next_cursor,
        })
    }

    fn build_projection(
        &self,
        table_fields: &[FieldMeta],
        all_fields: &[FieldMeta],
        formulas: &HashMap<String, FormulaFieldMeta>,
        relations: &HashMap<String, RelationFieldMeta>,
        lookups: &HashMap<String, LookupFieldMeta>,
        projection: &ProjectionSpec,
    ) -> RuntimeResult<(Vec<ColumnDescriptor>, Vec<FieldMeta>, String)> {
        let fields: HashSet<_> = projection.fields.iter().collect();
        let resolved: HashSet<_> = projection.resolve_relations.iter().collect();
        if fields.len() > RuntimeLimits::default().projection_fields_max
            || fields.len() != projection.fields.len()
            || resolved.len() != projection.resolve_relations.len()
            || !resolved.is_subset(&fields)
        {
            return Err(RuntimeErrorPayload::new(
                "invalid-request",
                "Invalid ProjectionSpec",
            ));
        }
        let by_id: HashMap<&str, &FieldMeta> =
            table_fields.iter().map(|f| (f.id.as_str(), f)).collect();
        let mut cols = Vec::with_capacity(projection.fields.len());
        let mut selected = Vec::with_capacity(projection.fields.len());
        let mut hash_input = String::new();

        for fid in &projection.fields {
            let field = *by_id.get(fid.as_str()).ok_or_else(|| {
                RuntimeErrorPayload::new("not-found", format!("Projected field not found: {fid}"))
            })?;
            let source = match field.field_type {
                FieldType::Formula => "formula",
                FieldType::Lookup => "lookup",
                FieldType::Relation
                    if relations
                        .get(&field.id)
                        .is_some_and(|r| r.direction == RelationDirection::Inverse) =>
                {
                    "inverse-relation"
                }
                _ => "stored",
            };
            let settings: JsonValue = serde_json::from_str(&field.settings_json)
                .map_err(|e| RuntimeErrorPayload::new("corrupt-file", e.to_string()))?;
            let blocked = self.schema_cache.as_ref().map(|s| &s.unsupported_fields);
            let writable = !self.read_only
                && blocked.is_none_or(HashSet::is_empty)
                && source == "stored"
                && field.system_role.is_none()
                && settings["readOnly"] != true
                && settings["isSystem"] != true
                && settings["writable"] != false;
            cols.push(ColumnDescriptor {
                field_id: field.id.clone(),
                name: field.name.clone(),
                value_type: value_type_json(field, all_fields, formulas, lookups),
                source: source.into(),
                writable,
                value_status: blocked
                    .is_some_and(|ids| ids.contains(fid))
                    .then(|| "unsupported-formula".into()),
            });
            selected.push(field.clone());
            hash_input.push_str(&field.id);
            hash_input.push(';');
        }
        let hash = sha256_hex(&hash_input);
        Ok((cols, selected, hash))
    }

    pub fn query_columnar_page(
        &mut self,
        table_id: &str,
        query: &RowQuery,
        field_ids: &[String],
        offset: usize,
        limit: usize,
        calendar: Option<&crate::contract::CalendarContext>,
    ) -> RuntimeResult<crate::grid::ColumnarRowPage> {
        let (today_str, ref_instant) = resolve_today_date(calendar, None)?;
        let (
            file_id,
            revision_str,
            table,
            table_fields,
            all_tables,
            all_fields,
            formulas,
            relations,
            lookups,
        ) = {
            let schema = self.ensure_schema()?;
            let table = schema
                .tables
                .iter()
                .find(|t| t.id == table_id)
                .cloned()
                .ok_or_else(|| {
                    RuntimeErrorPayload::new("not-found", format!("Table {table_id}"))
                })?;
            let table_fields: Vec<FieldMeta> = schema
                .fields
                .iter()
                .filter(|f| f.table_id == table_id)
                .cloned()
                .collect();
            (
                schema.meta.file_id.clone(),
                schema.meta.revision.to_string(),
                table,
                table_fields,
                schema.tables.clone(),
                schema.fields.clone(),
                schema.formulas.clone(),
                schema.relations.clone(),
                schema.lookups.clone(),
            )
        };
        let effective_query = rewrite_calendar_query(query, &table_fields, calendar, &ref_instant)?;
        crate::grid::query_columnar_page(
            &self.conn,
            &file_id,
            &revision_str,
            &table,
            &table_fields,
            &all_tables,
            &all_fields,
            &formulas,
            &relations,
            &lookups,
            &effective_query,
            field_ids,
            offset,
            limit,
            Some(&today_str),
        )
    }

    pub fn query_rows(&mut self, req: &QueryRowsRequest) -> RuntimeResult<RowPage> {
        if !self.conn.is_autocommit() {
            return self.query_rows_in_snapshot(req);
        }
        self.transaction("BEGIN", |service| service.query_rows_in_snapshot(req))
    }

    fn query_rows_in_snapshot(&mut self, req: &QueryRowsRequest) -> RuntimeResult<RowPage> {
        let cursor = req
            .cursor
            .as_deref()
            .map(|token| {
                self.cursor_key
                    .open::<PageCursor<Vec<BoundaryValue>>>(token)
            })
            .transpose()?;
        let instant = req
            .reference_instant
            .as_deref()
            .or_else(|| cursor.as_ref()?.instant.as_deref());
        let (today_str, ref_instant) = resolve_today_date(req.calendar.as_ref(), instant)?;

        // Snapshot schema metadata needed for query compilation without holding borrow across conn
        let (
            file_id,
            revision_str,
            table,
            table_fields,
            formulas,
            relations,
            lookups,
            all_tables,
            all_fields,
        ) = {
            let schema = self.ensure_schema()?;
            let table = schema
                .tables
                .iter()
                .find(|t| t.id == req.table_id)
                .cloned()
                .ok_or_else(|| {
                    RuntimeErrorPayload::new("not-found", format!("Table {}", req.table_id))
                })?;
            let table_fields: Vec<FieldMeta> = schema
                .fields
                .iter()
                .filter(|f| f.table_id == req.table_id)
                .cloned()
                .collect();
            (
                schema.meta.file_id.clone(),
                schema.meta.revision.to_string(),
                table,
                table_fields,
                schema.formulas.clone(),
                schema.relations.clone(),
                schema.lookups.clone(),
                schema.tables.clone(),
                schema.fields.clone(),
            )
        };

        let (columns, selected_fields, projection_hash) = self.build_projection(
            &table_fields,
            &all_fields,
            &formulas,
            &relations,
            &lookups,
            &req.projection,
        )?;

        let binding = sha256_hex(
            &json!([
                "rows",
                file_id,
                table.id,
                normalized_query(&req.query),
                req.projection,
                req.calendar
            ])
            .to_string(),
        );
        if let Some(cursor) = &cursor {
            cursor.check(&binding, &revision_str, req.reference_instant.as_deref())?;
        }
        let backward = req.direction.as_deref() == Some("backward");
        let effective_query = rewrite_calendar_query(
            &req.query,
            &table_fields,
            req.calendar.as_ref(),
            &ref_instant,
        )?;

        let mut uses_today = false;
        let mut select_exprs = Vec::with_capacity(selected_fields.len() + 1);
        select_exprs.push("\"_id\"".to_string());

        for (f, column) in selected_fields.iter().zip(&columns) {
            if column.value_status.is_some() {
                select_exprs.push("NULL".into());
            } else if f.field_type == FieldType::Formula {
                let def = formulas.get(&f.id).ok_or_else(|| {
                    RuntimeErrorPayload::new("corrupt-file", format!("Missing formula {}", f.id))
                })?;
                let compiled = self
                    .schema_cache
                    .as_ref()
                    .unwrap()
                    .formula(&def.source_text, &table_fields, Some(&f.id), None, 0)
                    .map_err(|d| RuntimeErrorPayload::new(d.code, d.message.unwrap_or_default()))?;
                if compiled.uses_today {
                    uses_today = true;
                }
                select_exprs.push(format!("({})", compiled.sql));
            } else if let Some(phys) = &f.physical_name {
                select_exprs.push(quote_identifier(phys).map_err(RuntimeErrorPayload::from_core)?);
            } else {
                select_exprs.push("NULL".into());
            }
        }

        let compiled_where = compile_predicates(
            &self.conn,
            &table,
            &table_fields,
            self.schema_cache.as_ref().unwrap(),
            &effective_query,
            &mut uses_today,
        )?;

        let keys = row_sort_keys(
            &effective_query,
            &table_fields,
            self.ensure_schema()?,
            &table,
            &mut uses_today,
        )?;
        let order_terms: Vec<_> = keys.iter().map(|key| key.order(backward)).collect();
        select_exprs.extend(keys.iter().map(|key| key.expr.clone()));
        let limit = req.limit.clamp(1, self.limits.page_size_max);
        let offset = req.offset.unwrap_or(0);
        if offset > 0 && cursor.is_some() {
            return Err(RuntimeErrorPayload::new(
                "invalid-query",
                "Cannot combine cursor and offset",
            ));
        }

        let table_sql =
            quote_identifier(&table.physical_name).map_err(RuntimeErrorPayload::from_core)?;
        let mut where_sql = if compiled_where.where_sql.is_empty() {
            String::new()
        } else {
            format!(" {}", compiled_where.where_sql)
        };

        let mut params = Vec::new();
        let cte = if uses_today {
            params.push(SqlValue::Text(today_str.clone()));
            format!("WITH {FORMULA_CALENDAR_CTE} ")
        } else {
            String::new()
        };
        // The cursor always pins its root instant. Only a clock-dependent
        // read exposes that instant and the count for the entire query.
        let calendar_read = req
            .query
            .filter
            .as_ref()
            .is_some_and(|f| f.requires_runtime())
            || (req.calendar.is_some()
                && (uses_today
                    || if req.query.search.is_some() {
                        table_fields.iter().any(|field| {
                            field_depends_on_today(field, &all_fields, &lookups, &formulas)
                        })
                    } else {
                        selected_fields.iter().any(|field| {
                            field.field_type == FieldType::Lookup
                                && field_depends_on_today(field, &all_fields, &lookups, &formulas)
                        })
                    }));
        let total = if calendar_read {
            let count = self
                .conn
                .query_row(
                    &format!("{cte}SELECT count(*) FROM {table_sql}{where_sql}"),
                    params_from_iter(params.iter().chain(&compiled_where.params)),
                    |row| row.get::<_, i64>(0),
                )
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
            Some(count.to_string())
        } else {
            None
        };

        params.extend(compiled_where.params);
        if let Some(cursor) = &cursor {
            let predicate = seek(&keys, &cursor.boundary, backward, &mut params)?;
            where_sql.push_str(if where_sql.is_empty() {
                " WHERE "
            } else {
                " AND "
            });
            where_sql.push_str(&predicate);
        }

        let fetch_limit = limit + 1;
        let sql = format!(
            "{cte}SELECT {} FROM {table_sql}{where_sql} ORDER BY {} LIMIT {fetch_limit} OFFSET {offset}",
            select_exprs.join(", "),
            order_terms.join(", ")
        );

        let mut stmt = self
            .conn
            .prepare(&sql)
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
        let mut raw_rows = stmt
            .query(params_from_iter(params.iter()))
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;

        let mut rows: Vec<ProjectedRow> = Vec::with_capacity(limit);
        let mut boundaries = Vec::new();
        let mut has_more = false;
        while let Some(r) = raw_rows
            .next()
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?
        {
            if rows.len() == limit {
                has_more = true;
                break;
            }
            let row_id: String = r
                .get(0)
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
            let mut vals = Vec::with_capacity(selected_fields.len());
            for (i, field) in selected_fields.iter().enumerate() {
                let raw = r
                    .get::<_, SqlValue>(i + 1)
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                if field.field_type == FieldType::Formula {
                    let res_type = formulas
                        .get(&field.id)
                        .map(|d| d.result_type.as_str())
                        .unwrap_or("text");
                    vals.push(coerce_formula_sql_value(raw, res_type)?);
                } else {
                    vals.push(self.read_cell(raw, field)?);
                }
            }
            let boundary = (0..keys.len())
                .map(|i| {
                    r.get::<_, SqlValue>(1 + selected_fields.len() + i)
                        .map(BoundaryValue::from)
                })
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
            boundaries.push(boundary);
            rows.push(ProjectedRow {
                id: row_id,
                values: vals,
                resolved_relations: None,
            });
        }
        drop(raw_rows);
        drop(stmt);

        // Populate virtual inverse-relation and lookup columns in batch before relation label resolution
        if !rows.is_empty() {
            let mut lookups = lookups.clone();
            for column in columns.iter().filter(|c| c.value_status.is_some()) {
                lookups.remove(&column.field_id);
            }
            populate_virtual_columns_inner(
                self.schema_cache.as_ref(),
                &self.conn,
                &mut rows,
                &table,
                &selected_fields,
                &all_tables,
                &all_fields,
                &relations,
                &lookups,
                &formulas,
                Some(&today_str),
                0,
            )?;
        }

        // Resolve requested relation labels in batch
        if !req.projection.resolve_relations.is_empty() && !rows.is_empty() {
            self.populate_resolved_relations(
                &mut rows,
                &selected_fields,
                &req.projection.resolve_relations,
                &relations,
                &lookups,
                &all_tables,
                &all_fields,
                &formulas,
            )?;
        }

        if backward {
            rows.reverse();
            boundaries.reverse();
        }
        let continued = cursor.is_some() || offset > 0;
        let (next_cursor, previous_cursor) = self.cursor_key.page_boundaries(
            PageCursor {
                binding,
                revision: revision_str.clone(),
                instant: Some(ref_instant.clone()),
                boundary: (),
            },
            &boundaries,
            backward,
            has_more,
            continued,
        )?;
        Ok(RowPage {
            reference_instant: calendar_read.then_some(ref_instant),
            total,
            file_id,
            table_id: table.id,
            revision: revision_str,
            projection_hash,
            columns,
            rows,
            next_cursor,
            previous_cursor,
        })
    }

    #[allow(clippy::too_many_arguments)]
    fn populate_resolved_relations(
        &self,
        rows: &mut [ProjectedRow],
        selected_fields: &[FieldMeta],
        resolve_ids: &[String],
        relations: &HashMap<String, RelationFieldMeta>,
        lookups: &HashMap<String, LookupFieldMeta>,
        all_tables: &[TableMeta],
        all_fields: &[FieldMeta],
        formulas: &HashMap<String, FormulaFieldMeta>,
    ) -> RuntimeResult<()> {
        let resolve_set: HashSet<&str> = resolve_ids.iter().map(String::as_str).collect();
        let mut target_cols = Vec::new();
        for (col_idx, field) in selected_fields.iter().enumerate() {
            if field.field_type == FieldType::Relation
                && resolve_set.contains(field.id.as_str())
                && let Some(rel) = relations.get(&field.id)
            {
                target_cols.push((col_idx, rel));
            }
        }
        if target_cols.is_empty() {
            return Ok(());
        }

        for (col_idx, rel) in target_cols {
            let mut ids_needed: HashSet<String> = HashSet::new();
            for row in rows.iter() {
                if let Some(arr) = row.values.get(col_idx).and_then(JsonValue::as_array) {
                    for item in arr {
                        if let Some(s) = item.as_str() {
                            ids_needed.insert(s.to_string());
                        }
                    }
                }
            }
            if ids_needed.is_empty() {
                continue;
            }
            let Some(target_table) = all_tables.iter().find(|t| t.id == rel.target_table_id) else {
                continue;
            };
            let Some(label_field) = all_fields
                .iter()
                .find(|f| f.id == target_table.label_field_id)
            else {
                continue;
            };
            let Some(label_phys) = label_field.physical_name.as_deref() else {
                continue;
            };
            let target_sql = quote_identifier(&target_table.physical_name)
                .map_err(RuntimeErrorPayload::from_core)?;
            let label_sql = quote_identifier(label_phys).map_err(RuntimeErrorPayload::from_core)?;
            let id_list: Vec<String> = ids_needed.into_iter().collect();
            let placeholders = vec!["?"; id_list.len()].join(", ");
            let sql = format!(
                "SELECT \"_id\", {label_sql} FROM {target_sql} WHERE \"_id\" IN ({placeholders})"
            );
            let mut stmt = self
                .conn
                .prepare(&sql)
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
            let mut found: HashMap<String, JsonValue> = HashMap::new();
            let mut qrows = stmt
                .query(params_from_iter(id_list.iter()))
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
            while let Some(r) = qrows
                .next()
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?
            {
                let id: String = r.get(0).unwrap_or_default();
                let v: SqlValue = r.get(1).unwrap_or(SqlValue::Null);
                found.insert(id, self.read_cell(v, label_field)?);
            }
            let label_type = value_type_json(label_field, all_fields, formulas, lookups);
            for row in rows.iter_mut() {
                let items: Vec<JsonValue> = row
                    .values
                    .get(col_idx)
                    .and_then(JsonValue::as_array)
                    .map(|arr| {
                        arr.iter()
                            .filter_map(JsonValue::as_str)
                            .map(|id| {
                                if let Some(lbl) = found.get(id) {
                                    json!({
                                        "id": id,
                                        "state": "resolved",
                                        "labelFieldId": label_field.id,
                                        "labelType": label_type,
                                        "label": lbl,
                                    })
                                } else {
                                    json!({ "id": id, "state": "unresolved" })
                                }
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                row.resolved_relations
                    .get_or_insert_with(Vec::new)
                    .push(ResolvedRelationColumn {
                        column: col_idx,
                        items,
                    });
            }
        }
        Ok(())
    }

    pub fn query_row_pages(&mut self, req: &QueryRowPagesRequest) -> RuntimeResult<Vec<RowPage>> {
        self.transaction("BEGIN", |svc| {
            let table = svc
                .ensure_schema()?
                .tables
                .iter()
                .find(|t| t.id == req.table_id)
                .ok_or_else(|| RuntimeErrorPayload::new("not-found", "Missing Table"))?;
            let settings: JsonValue = serde_json::from_str(&table.settings_json)
                .map_err(|e| RuntimeErrorPayload::new("corrupt-file", e.to_string()))?;
            if settings["vtabModule"].is_null() || req.queries.len() < 2 {
                return svc.read_row_pages(req);
            }
            let name =
                quote_identifier(&table.physical_name).map_err(RuntimeErrorPayload::from_core)?;
            // Materialize the live source once per request. All page and count
            // queries share this snapshot, including their ordinary cursor bindings.
            let create = format!("CREATE TEMP TABLE {name} AS SELECT * FROM main.{name}");
            svc.temp_schema_statement(&create)?;
            let pages = svc.read_row_pages(req)?;
            svc.temp_schema_statement(&format!("DROP TABLE temp.{name}"))?;
            Ok(pages)
        })
    }

    fn temp_schema_statement(&self, sql: &str) -> RuntimeResult<()> {
        let sql_error =
            |e: rusqlite::Error| RuntimeErrorPayload::new("adapter-error", e.to_string());
        // The underlying main file is opened SQLITE_OPEN_READ_ONLY. Only
        // the temporary database must accept these two host-owned statements.
        if self.read_only {
            self.conn
                .execute_batch("PRAGMA query_only=OFF")
                .map_err(sql_error)?;
        }
        let result = self.conn.execute(sql, []).map_err(sql_error);
        if self.read_only {
            self.conn
                .execute_batch("PRAGMA query_only=ON")
                .map_err(sql_error)?;
        }
        result.map(|_| ())
    }

    fn read_row_pages(&mut self, req: &QueryRowPagesRequest) -> RuntimeResult<Vec<RowPage>> {
        let mut out = Vec::with_capacity(req.queries.len());
        let mut shared_instant = req.reference_instant.clone();
        for q in &req.queries {
            let mut page = self.query_rows(&QueryRowsRequest {
                calendar: req.calendar.clone(),
                reference_instant: shared_instant.clone(),
                table_id: req.table_id.clone(),
                query: q.clone(),
                projection: req.projection.clone(),
                limit: req.limit,
                offset: None,
                cursor: None,
                direction: None,
            })?;
            if shared_instant.is_none() {
                shared_instant = page.reference_instant.clone();
            }
            if page.total.is_some() {
                out.push(page);
                continue;
            }
            let agg = self.aggregate(&AggregateRequest {
                calendar: req.calendar.clone(),
                reference_instant: shared_instant.clone(),
                table_id: req.table_id.clone(),
                query: Some(q.clone()),
                items: vec![crate::contract::AggregateItem::CountAll {
                    key: "total".into(),
                }],
            })?;
            if let Some(crate::contract::AggregateResult::Value { value, .. }) = agg.results.first()
            {
                page.total = value.as_str().map(String::from);
            }
            out.push(page);
        }
        Ok(out)
    }

    pub fn get_rows_by_id(&mut self, req: &GetRowsByIdRequest) -> RuntimeResult<RowBatch> {
        if self.conn.is_autocommit() {
            return self.transaction("BEGIN", |service| service.get_rows_by_id(req));
        }
        let (today_str, ref_instant) =
            resolve_today_date(req.calendar.as_ref(), req.reference_instant.as_deref())?;
        let (
            file_id,
            revision_str,
            table,
            table_fields,
            formulas,
            relations,
            lookups,
            all_tables,
            all_fields,
        ) = {
            let schema = self.ensure_schema()?;
            let table = schema
                .tables
                .iter()
                .find(|t| t.id == req.table_id)
                .cloned()
                .ok_or_else(|| {
                    RuntimeErrorPayload::new("not-found", format!("Table {}", req.table_id))
                })?;
            let table_fields: Vec<FieldMeta> = schema
                .fields
                .iter()
                .filter(|f| f.table_id == req.table_id)
                .cloned()
                .collect();
            (
                schema.meta.file_id.clone(),
                schema.meta.revision.to_string(),
                table,
                table_fields,
                schema.formulas.clone(),
                schema.relations.clone(),
                schema.lookups.clone(),
                schema.tables.clone(),
                schema.fields.clone(),
            )
        };
        let (columns, selected_fields, projection_hash) = self.build_projection(
            &table_fields,
            &all_fields,
            &formulas,
            &relations,
            &lookups,
            &req.projection,
        )?;

        if req.row_ids.is_empty() {
            return Ok(RowBatch {
                reference_instant: req.calendar.is_some().then_some(ref_instant),
                file_id,
                table_id: table.id,
                revision: revision_str,
                projection_hash,
                columns,
                rows: Vec::new(),
                missing_row_ids: Vec::new(),
            });
        }

        let mut uses_today = false;
        let mut select_exprs = Vec::with_capacity(selected_fields.len() + 1);
        select_exprs.push("\"_id\"".to_string());
        for (f, column) in selected_fields.iter().zip(&columns) {
            if column.value_status.is_some() {
                select_exprs.push("NULL".into());
            } else if f.field_type == FieldType::Formula {
                let def = formulas.get(&f.id).ok_or_else(|| {
                    RuntimeErrorPayload::new("corrupt-file", format!("Missing formula {}", f.id))
                })?;
                let compiled = self
                    .schema_cache
                    .as_ref()
                    .unwrap()
                    .formula(&def.source_text, &table_fields, Some(&f.id), None, 0)
                    .map_err(|d| RuntimeErrorPayload::new(d.code, d.message.unwrap_or_default()))?;
                if compiled.uses_today {
                    uses_today = true;
                }
                select_exprs.push(format!("({})", compiled.sql));
            } else if let Some(phys) = &f.physical_name {
                select_exprs.push(quote_identifier(phys).map_err(RuntimeErrorPayload::from_core)?);
            } else {
                select_exprs.push("NULL".into());
            }
        }

        let table_sql =
            quote_identifier(&table.physical_name).map_err(RuntimeErrorPayload::from_core)?;
        let placeholders = vec!["?"; req.row_ids.len()].join(", ");
        let mut params: Vec<SqlValue> = Vec::new();
        let cte = if uses_today {
            params.push(SqlValue::Text(today_str.clone()));
            format!("WITH {FORMULA_CALENDAR_CTE} ")
        } else {
            String::new()
        };
        for id in &req.row_ids {
            params.push(SqlValue::Text(id.clone()));
        }

        let sql = format!(
            "{cte}SELECT {} FROM {table_sql} WHERE \"_id\" IN ({placeholders})",
            select_exprs.join(", ")
        );
        let mut by_id: HashMap<String, ProjectedRow> = HashMap::new();
        {
            let mut stmt = self
                .conn
                .prepare(&sql)
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
            let mut qrows = stmt
                .query(params_from_iter(params.iter()))
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
            while let Some(r) = qrows
                .next()
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?
            {
                let id: String = r.get(0).unwrap_or_default();
                let mut vals = Vec::with_capacity(selected_fields.len());
                for (i, field) in selected_fields.iter().enumerate() {
                    let raw = r.get::<_, SqlValue>(i + 1).unwrap_or(SqlValue::Null);
                    if field.field_type == FieldType::Formula {
                        let res_type = formulas
                            .get(&field.id)
                            .map(|d| d.result_type.as_str())
                            .unwrap_or("text");
                        vals.push(coerce_formula_sql_value(raw, res_type)?);
                    } else {
                        vals.push(self.read_cell(raw, field)?);
                    }
                }
                by_id.insert(
                    id.clone(),
                    ProjectedRow {
                        id,
                        values: vals,
                        resolved_relations: None,
                    },
                );
            }
        }

        let mut rows = Vec::new();
        let mut missing_row_ids = Vec::new();
        for id in &req.row_ids {
            if let Some(row) = by_id.remove(id) {
                rows.push(row);
            } else {
                missing_row_ids.push(id.clone());
            }
        }
        if !rows.is_empty() {
            let mut lookups = lookups.clone();
            for column in columns.iter().filter(|c| c.value_status.is_some()) {
                lookups.remove(&column.field_id);
            }
            populate_virtual_columns_inner(
                self.schema_cache.as_ref(),
                &self.conn,
                &mut rows,
                &table,
                &selected_fields,
                &all_tables,
                &all_fields,
                &relations,
                &lookups,
                &formulas,
                Some(&today_str),
                0,
            )?;
        }
        if !req.projection.resolve_relations.is_empty() && !rows.is_empty() {
            self.populate_resolved_relations(
                &mut rows,
                &selected_fields,
                &req.projection.resolve_relations,
                &relations,
                &lookups,
                &all_tables,
                &all_fields,
                &formulas,
            )?;
        }

        Ok(RowBatch {
            reference_instant: req.calendar.is_some().then_some(ref_instant),
            file_id,
            table_id: table.id,
            revision: revision_str,
            projection_hash,
            columns,
            rows,
            missing_row_ids,
        })
    }

    fn navigate<T>(
        &mut self,
        req: &GetRecordNeighborsRequest,
        lookup: impl FnOnce(
            &Connection,
            &[SortKey],
            &[BoundaryValue],
            &str,
            &str,
            &[SqlValue],
        ) -> RuntimeResult<T>,
    ) -> RuntimeResult<Option<T>> {
        if self.conn.is_autocommit() {
            return self.transaction("BEGIN", |service| service.navigate(req, lookup));
        }
        let (today, instant) =
            resolve_today_date(req.calendar.as_ref(), req.reference_instant.as_deref())?;
        self.ensure_schema()?;
        let schema = self.schema_cache.as_ref().unwrap();
        let table = schema
            .tables
            .iter()
            .find(|table| table.id == req.table_id)
            .ok_or_else(|| {
                RuntimeErrorPayload::new("not-found", format!("Table {}", req.table_id))
            })?;
        let fields: Vec<_> = schema
            .fields
            .iter()
            .filter(|field| field.table_id == table.id)
            .cloned()
            .collect();
        let mut query =
            rewrite_calendar_query(&req.query, &fields, req.calendar.as_ref(), &instant)?;
        let mut uses_today = false;
        let keys = row_sort_keys(&query, &fields, schema, table, &mut uses_today)?;
        query.sort = None;
        let compiled =
            compile_predicates(&self.conn, table, &fields, schema, &query, &mut uses_today)?;
        let physical =
            quote_identifier(&table.physical_name).map_err(RuntimeErrorPayload::from_core)?;
        let mut params = Vec::new();
        let cte = if uses_today {
            params.push(SqlValue::Text(today));
            format!("WITH {FORMULA_CALENDAR_CTE} ")
        } else {
            String::new()
        };
        params.extend(compiled.params);
        let condition = if compiled.where_sql.is_empty() {
            "WHERE".to_string()
        } else {
            format!("{} AND", compiled.where_sql)
        };
        let from = format!("FROM {physical} {condition}");
        let columns = keys
            .iter()
            .map(|key| key.expr.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        params.push(SqlValue::Text(req.row_id.clone()));
        let boundary = self
            .conn
            .query_row(
                &format!("{cte}SELECT {columns} {from} _id = ?"),
                params_from_iter(&params),
                |row| {
                    (0..keys.len())
                        .map(|i| row.get::<_, SqlValue>(i).map(BoundaryValue::from))
                        .collect::<rusqlite::Result<Vec<_>>>()
                },
            )
            .optional()
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
        params.pop();
        boundary
            .map(|values| lookup(&self.conn, &keys, &values, &cte, &from, &params))
            .transpose()
    }

    pub fn get_record_neighbors(
        &mut self,
        req: &GetRecordNeighborsRequest,
    ) -> RuntimeResult<RecordNeighbors> {
        Ok(self
            .navigate(req, |conn, keys, boundary, cte, from, params| {
                let neighbor = |backward| {
                    let mut params = params.to_vec();
                    let predicate = seek(keys, boundary, backward, &mut params)?;
                    let order = keys
                        .iter()
                        .map(|key| key.order(backward))
                        .collect::<Vec<_>>()
                        .join(", ");
                    conn.query_row(
                        &format!("{cte}SELECT _id {from} {predicate} ORDER BY {order} LIMIT 1"),
                        params_from_iter(params),
                        |row| row.get(0),
                    )
                    .optional()
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))
                };
                Ok(RecordNeighbors::Found {
                    found: true,
                    previous_id: neighbor(true)?,
                    next_id: neighbor(false)?,
                })
            })?
            .unwrap_or(RecordNeighbors::NotFound { found: false }))
    }

    pub fn get_row_index(
        &mut self,
        req: &GetRecordNeighborsRequest,
    ) -> RuntimeResult<Option<String>> {
        self.navigate(req, |conn, keys, boundary, cte, from, params| {
            let mut params = params.to_vec();
            let predicate = seek(keys, boundary, true, &mut params)?;
            conn.query_row(
                &format!("{cte}SELECT count(*) {from} {predicate}"),
                params_from_iter(params),
                |row| row.get::<_, i64>(0),
            )
            .map(|count| count.to_string())
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))
        })
    }

    fn clock_dependent_read(
        &mut self,
        table_id: &str,
        calendar: bool,
        query: Option<&RowQuery>,
        projection: &[String],
        group_by: &[String],
        items: &[crate::contract::AggregateItem],
    ) -> RuntimeResult<bool> {
        let query_json = serde_json::to_value(query)
            .map_err(|e| RuntimeErrorPayload::new("invalid-query", e.to_string()))?;
        if ["calendar-period", "calendar-window"]
            .iter()
            .any(|op| eidos_file_core::validate::has_calendar_filter(&query_json, op))
        {
            return Ok(true);
        }
        if !calendar {
            return Ok(false);
        }
        use crate::contract::AggregateItem::*;
        let ids: HashSet<_> = projection
            .iter()
            .chain(group_by)
            .chain(items.iter().filter_map(|item| match item {
                CountAll { .. } => None,
                DistinctValues { field_id, .. }
                | Count { field_id, .. }
                | DistinctCount { field_id, .. }
                | Sum { field_id, .. }
                | Average { field_id, .. }
                | Min { field_id, .. }
                | Max { field_id, .. }
                | Statistics { field_id, .. } => Some(field_id),
            }))
            .collect();
        let schema = self.ensure_schema()?;
        Ok(schema
            .fields
            .iter()
            .filter(|f| f.table_id == table_id)
            .any(|field| {
                (ids.contains(&field.id)
                    || query.is_some_and(|q| q.search.is_some())
                    || view_query_uses_field(&query_json, &field.id))
                    && field_depends_on_today(
                        field,
                        &schema.fields,
                        &schema.lookups,
                        &schema.formulas,
                    )
            }))
    }

    pub fn aggregate(&mut self, req: &AggregateRequest) -> RuntimeResult<AggregateResponse> {
        if self.conn.is_autocommit() {
            return self.transaction("BEGIN", |service| service.aggregate(req));
        }
        let (today_str, ref_instant) =
            resolve_today_date(req.calendar.as_ref(), req.reference_instant.as_deref())?;
        let (file_id, revision_str, table, table_fields) = {
            let schema = self.ensure_schema()?;
            let table = schema
                .tables
                .iter()
                .find(|t| t.id == req.table_id)
                .cloned()
                .ok_or_else(|| {
                    RuntimeErrorPayload::new("not-found", format!("Table {}", req.table_id))
                })?;
            let table_fields: Vec<FieldMeta> = schema
                .fields
                .iter()
                .filter(|f| f.table_id == req.table_id)
                .cloned()
                .collect();
            (
                schema.meta.file_id.clone(),
                schema.meta.revision.to_string(),
                table,
                table_fields,
            )
        };
        let rewritten_query = match &req.query {
            Some(q) => Some(rewrite_calendar_query(
                q,
                &table_fields,
                req.calendar.as_ref(),
                &ref_instant,
            )?),
            None => None,
        };
        let mut resp = execute_aggregate(
            &self.conn,
            &file_id,
            &revision_str,
            &table,
            &table_fields,
            self.schema_cache.as_ref().unwrap(),
            rewritten_query.as_ref(),
            &req.items,
            Some(&today_str),
        )?;
        resp.reference_instant = self
            .clock_dependent_read(
                &req.table_id,
                req.calendar.is_some(),
                req.query.as_ref(),
                &[],
                &[],
                &req.items,
            )?
            .then_some(ref_instant);
        Ok(resp)
    }

    pub fn group_rows(&mut self, req: &GroupRequest) -> RuntimeResult<GroupPage> {
        if !self.conn.is_autocommit() {
            return self.group_rows_in_snapshot(req);
        }
        self.transaction("BEGIN", |service| service.group_rows_in_snapshot(req))
    }

    fn group_rows_in_snapshot(&mut self, req: &GroupRequest) -> RuntimeResult<GroupPage> {
        let cursor = req
            .cursor
            .as_deref()
            .map(|token| {
                self.cursor_key
                    .open::<PageCursor<Vec<BoundaryValue>>>(token)
            })
            .transpose()?;
        let instant = req
            .reference_instant
            .as_deref()
            .or_else(|| cursor.as_ref()?.instant.as_deref());
        let (today_str, ref_instant) = resolve_today_date(req.calendar.as_ref(), instant)?;
        if req.group_by.is_empty() {
            return Err(RuntimeErrorPayload::new(
                "invalid-request",
                "groupBy must contain at least one field",
            ));
        }
        let (file_id, revision_str, table, table_fields, all_fields, formulas, relations, lookups) = {
            let schema = self.ensure_schema()?;
            let table = schema
                .tables
                .iter()
                .find(|t| t.id == req.table_id)
                .cloned()
                .ok_or_else(|| {
                    RuntimeErrorPayload::new("not-found", format!("Table {}", req.table_id))
                })?;
            let table_fields: Vec<FieldMeta> = schema
                .fields
                .iter()
                .filter(|f| f.table_id == req.table_id)
                .cloned()
                .collect();
            (
                schema.meta.file_id.clone(),
                schema.meta.revision.to_string(),
                table,
                table_fields,
                schema.fields.clone(),
                schema.formulas.clone(),
                schema.relations.clone(),
                schema.lookups.clone(),
            )
        };

        let (columns, _selected_fields, projection_hash) = self.build_projection(
            &table_fields,
            &all_fields,
            &formulas,
            &relations,
            &lookups,
            &req.projection,
        )?;
        let field_by_id: HashMap<&str, &FieldMeta> =
            table_fields.iter().map(|f| (f.id.as_str(), f)).collect();

        let mut group_fields = Vec::with_capacity(req.group_by.len());
        let mut group_exprs = Vec::with_capacity(req.group_by.len());
        let mut uses_today = false;
        for gid in &req.group_by {
            let field = *field_by_id
                .get(gid.as_str())
                .ok_or_else(|| RuntimeErrorPayload::new("not-found", format!("Field {gid}")))?;
            self.ensure_schema()?.check_scalar(field)?;
            group_exprs.push(self.ensure_schema()?.value_expression(
                &table,
                field,
                &table_fields,
                &mut uses_today,
            )?);
            let mut logical = field.clone();
            logical.field_type = self.ensure_schema()?.logical_type(field)?;
            group_fields.push(logical);
        }

        let binding = sha256_hex(
            &json!([
                "groups",
                file_id,
                table.id,
                normalized_query(&req.query),
                req.projection,
                req.group_by,
                req.aggregates,
                req.calendar
            ])
            .to_string(),
        );
        if let Some(cursor) = &cursor {
            cursor.check(&binding, &revision_str, req.reference_instant.as_deref())?;
        }
        let backward = req.direction.as_deref() == Some("backward");
        let effective_query = rewrite_calendar_query(
            &req.query,
            &table_fields,
            req.calendar.as_ref(),
            &ref_instant,
        )?;

        let compiled_where = compile_predicates(
            &self.conn,
            &table,
            &table_fields,
            self.schema_cache.as_ref().unwrap(),
            &effective_query,
            &mut uses_today,
        )?;
        let table_sql =
            quote_identifier(&table.physical_name).map_err(RuntimeErrorPayload::from_core)?;
        let mut where_sql = if compiled_where.where_sql.is_empty() {
            String::new()
        } else {
            format!(" {}", compiled_where.where_sql)
        };

        let group_limit = req.group_limit.clamp(1, self.limits.group_page_size_max);
        let mut params = Vec::new();
        let cte = if uses_today {
            params.push(SqlValue::Text(today_str.clone()));
            format!("WITH {FORMULA_CALENDAR_CTE} ")
        } else {
            String::new()
        };
        params.extend(compiled_where.params);

        let keys: Vec<_> = group_exprs
            .iter()
            .map(|expr| SortKey {
                expr: expr.clone(),
                descending: false,
                nulls_first: true,
            })
            .collect();
        if let Some(cursor) = &cursor {
            let predicate = seek(&keys, &cursor.boundary, backward, &mut params)?;
            where_sql.push_str(if where_sql.is_empty() {
                " WHERE "
            } else {
                " AND "
            });
            where_sql.push_str(&predicate);
        }
        let order = keys
            .iter()
            .map(|k| k.order(backward))
            .collect::<Vec<_>>()
            .join(", ");
        let mut boundaries = Vec::new();
        let group_cols_sql = group_exprs.join(", ");
        let sql = format!(
            "{cte}SELECT {group_cols_sql}, COUNT(*) FROM {table_sql}{where_sql} GROUP BY {group_cols_sql} ORDER BY {order} LIMIT {}",
            group_limit + 1
        );

        let mut raw_groups: Vec<(Vec<JsonValue>, i64)> = Vec::new();
        let mut has_more_groups = false;
        {
            let mut stmt = self
                .conn
                .prepare(&sql)
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
            let mut qrows = stmt
                .query(params_from_iter(params.iter()))
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
            while let Some(r) = qrows
                .next()
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?
            {
                if raw_groups.len() == group_limit {
                    has_more_groups = true;
                    break;
                }
                let mut boundary = Vec::new();
                let mut key = Vec::with_capacity(group_fields.len());
                for (i, gf) in group_fields.iter().enumerate() {
                    let v = r.get::<_, SqlValue>(i).unwrap_or(SqlValue::Null);
                    boundary.push(BoundaryValue::from(v.clone()));
                    key.push(self.read_cell(v, gf)?);
                }
                let count: i64 = r.get(group_fields.len()).unwrap_or(0);
                raw_groups.push((key, count));
                boundaries.push(boundary);
            }
        }

        let mut groups = Vec::with_capacity(raw_groups.len());
        for (key, count) in raw_groups {
            // Build group filter node to fetch aggregates & top rows per group
            let mut group_filters = Vec::new();
            if let Some(existing) = &req.query.filter {
                group_filters.push(existing.clone());
            }
            for (gf, kv) in group_fields.iter().zip(key.iter()) {
                if kv.is_null() {
                    group_filters.push(eidos_file_core::query::FilterNode::IsNull {
                        field_id: gf.id.clone(),
                    });
                } else {
                    group_filters.push(eidos_file_core::query::FilterNode::Eq {
                        field_id: gf.id.clone(),
                        value: kv.clone(),
                    });
                }
            }
            let bucket_query = RowQuery {
                filter: Some(if group_filters.len() == 1 {
                    group_filters.pop().unwrap()
                } else {
                    eidos_file_core::query::FilterNode::And {
                        args: group_filters,
                    }
                }),
                search: effective_query.search.clone(),
                sort: effective_query.sort.clone(),
            };

            let bucket_aggs = if !req.aggregates.is_empty() {
                let rewritten = rewrite_calendar_query(
                    &bucket_query,
                    &table_fields,
                    req.calendar.as_ref(),
                    &ref_instant,
                )?;
                execute_aggregate(
                    &self.conn,
                    &file_id,
                    &revision_str,
                    &table,
                    &table_fields,
                    self.schema_cache.as_ref().unwrap(),
                    Some(&rewritten),
                    &req.aggregates,
                    Some(&today_str),
                )?
                .results
            } else {
                Vec::new()
            };

            let (bucket_rows, next_row_cursor) = if req.rows_per_group > 0 {
                let page = self.query_rows(&QueryRowsRequest {
                    calendar: req.calendar.clone(),
                    reference_instant: Some(ref_instant.clone()),
                    table_id: req.table_id.clone(),
                    query: bucket_query.clone(),
                    projection: req.projection.clone(),
                    limit: req.rows_per_group,
                    offset: None,
                    cursor: None,
                    direction: None,
                })?;
                let cursor = if let Some(row_cursor) = page.next_cursor {
                    Some(self.cursor_key.seal(&GroupRowCursorPayload {
                        table_id: req.table_id.clone(),
                        group_key: key.clone(),
                        bucket_query,
                        projection: req.projection.clone(),
                        row_cursor,
                    })?)
                } else {
                    None
                };
                (page.rows, cursor)
            } else {
                (Vec::new(), None)
            };

            groups.push(GroupBucket {
                key,
                count: count.to_string(),
                aggregates: bucket_aggs,
                rows: bucket_rows,
                next_row_cursor,
            });
        }

        if backward {
            groups.reverse();
            boundaries.reverse();
        }
        let (next_cursor, previous_cursor) = self.cursor_key.page_boundaries(
            PageCursor {
                binding,
                revision: revision_str.clone(),
                instant: Some(ref_instant.clone()),
                boundary: (),
            },
            &boundaries,
            backward,
            has_more_groups,
            cursor.is_some(),
        )?;
        Ok(GroupPage {
            reference_instant: self
                .clock_dependent_read(
                    &req.table_id,
                    req.calendar.is_some(),
                    Some(&req.query),
                    &req.projection.fields,
                    &req.group_by,
                    &req.aggregates,
                )?
                .then_some(ref_instant),
            file_id,
            table_id: table.id,
            revision: revision_str,
            projection_hash,
            columns,
            groups,
            next_cursor,
            previous_cursor,
        })
    }

    pub fn query_group_rows(&mut self, req: &GroupRowsRequest) -> RuntimeResult<GroupRowPage> {
        let payload: GroupRowCursorPayload = self.cursor_key.open(&req.cursor)?;
        let limit = req.limit.clamp(1, self.limits.page_size_max);
        let page = self.query_rows(&QueryRowsRequest {
            calendar: req.calendar.clone(),
            reference_instant: req.reference_instant.clone(),
            table_id: payload.table_id.clone(),
            query: payload.bucket_query.clone(),
            projection: payload.projection.clone(),
            limit,
            offset: None,
            cursor: Some(payload.row_cursor.clone()),
            direction: req.direction.clone(),
        })?;

        let wrap = |token: Option<String>| {
            token
                .map(|row_cursor| {
                    self.cursor_key.seal(&GroupRowCursorPayload {
                        row_cursor,
                        ..payload.clone()
                    })
                })
                .transpose()
        };
        let next_cursor = wrap(page.next_cursor)?;
        let previous_cursor = wrap(page.previous_cursor)?;
        Ok(GroupRowPage {
            reference_instant: page.reference_instant,
            file_id: page.file_id,
            table_id: page.table_id,
            revision: page.revision,
            projection_hash: page.projection_hash,
            columns: page.columns,
            group_key: payload.group_key,
            rows: page.rows,
            next_cursor,
            previous_cursor,
        })
    }

    #[allow(clippy::result_large_err)]
    pub fn preview_formula(
        &mut self,
        req: &FormulaPreviewRequest,
    ) -> RuntimeResult<FormulaPreviewResult> {
        let (today_str, _ref_instant) =
            resolve_today_date(req.calendar.as_ref(), req.reference_instant.as_deref())?;
        if req.field_id.is_none()
            && req
                .candidate_name
                .as_deref()
                .map(|s| s.trim().is_empty())
                .unwrap_or(true)
        {
            return Err(RuntimeErrorPayload::new(
                "invalid-request",
                "Formula candidate name is required",
            ));
        }

        let (file_id, revision_str, table, table_fields) = {
            let schema = self.ensure_schema()?;
            let table = schema
                .tables
                .iter()
                .find(|t| t.id == req.table_id)
                .cloned()
                .ok_or_else(|| {
                    RuntimeErrorPayload::new("not-found", format!("Table {}", req.table_id))
                })?;
            let table_fields: Vec<FieldMeta> = schema
                .fields
                .iter()
                .filter(|f| f.table_id == req.table_id)
                .cloned()
                .collect();
            (
                schema.meta.file_id.clone(),
                schema.meta.revision.to_string(),
                table,
                table_fields,
            )
        };

        let compiled = match self
            .schema_cache
            .as_ref()
            .unwrap()
            .formula(
                &req.source_text,
                &table_fields,
                req.field_id.as_deref(),
                None,
                0,
            )
            .and_then(|compiled| crate::formula::check_result(compiled, &req.declared_result_type))
        {
            Ok(c) => c,
            Err(diag) => {
                return Ok(FormulaPreviewResult {
                    file_id,
                    revision: revision_str,
                    valid: false,
                    inferred_type: None,
                    dependencies: None,
                    rows: None,
                    diagnostics: vec![diag],
                    diagnostics_truncated: false,
                });
            }
        };

        let table_sql =
            quote_identifier(&table.physical_name).map_err(RuntimeErrorPayload::from_core)?;
        let mut params = Vec::new();
        let cte = if compiled.uses_today {
            params.push(SqlValue::Text(today_str));
            format!("WITH {FORMULA_CALENDAR_CTE} ")
        } else {
            String::new()
        };

        let limit = 5usize.min(self.limits.formula_preview_rows_max);
        let sql = if let Some(ids) = &req.row_ids {
            if ids.is_empty() {
                format!(
                    "{cte}SELECT \"_id\", ({}) FROM {table_sql} WHERE 0",
                    compiled.sql
                )
            } else {
                let ph = vec!["?"; ids.len()].join(", ");
                for id in ids {
                    params.push(SqlValue::Text(id.clone()));
                }
                format!(
                    "{cte}SELECT \"_id\", ({}) FROM {table_sql} WHERE \"_id\" IN ({ph}) ORDER BY \"_id\" ASC",
                    compiled.sql
                )
            }
        } else {
            format!(
                "{cte}SELECT \"_id\", ({}) FROM {table_sql} ORDER BY \"_id\" ASC LIMIT {limit}",
                compiled.sql
            )
        };

        let mut stmt = match self.conn.prepare(&sql) {
            Ok(s) => s,
            Err(e) => {
                return Ok(FormulaPreviewResult {
                    file_id,
                    revision: revision_str,
                    valid: false,
                    inferred_type: None,
                    dependencies: Some(compiled.dependency_field_ids),
                    rows: None,
                    diagnostics: vec![RuntimeDiagnostic {
                        code: "formula-parse-invalid".into(),
                        severity: "error".into(),
                        message: Some(e.to_string()),
                        path: None,
                        table_id: Some(table.id),
                        field_id: req.field_id.clone(),
                        row_id: None,
                        view_id: None,
                    }],
                    diagnostics_truncated: false,
                });
            }
        };

        let mut qrows = stmt
            .query(params_from_iter(params.iter()))
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
        let mut out_rows = Vec::new();
        while let Some(r) = qrows
            .next()
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?
        {
            let row_id: String = r.get(0).unwrap_or_default();
            let raw: SqlValue = r.get(1).unwrap_or(SqlValue::Null);
            match coerce_formula_sql_value(raw, &req.declared_result_type) {
                Ok(val) => out_rows.push(FormulaPreviewRow {
                    row_id,
                    value: Some(val),
                    error: None,
                }),
                Err(err) => out_rows.push(FormulaPreviewRow {
                    row_id,
                    value: None,
                    error: Some(err),
                }),
            }
        }

        Ok(FormulaPreviewResult {
            file_id,
            revision: revision_str,
            valid: true,
            inferred_type: Some(req.declared_result_type.clone()),
            dependencies: Some(compiled.dependency_field_ids),
            rows: Some(out_rows),
            diagnostics: Vec::new(),
            diagnostics_truncated: false,
        })
    }

    pub fn mutate_rows(&mut self, req: &RowMutationRequest) -> RuntimeResult<MutationResult> {
        self.mutate_rows_internal(req, false)
    }

    pub fn mutate_rows_with_undo(
        &mut self,
        req: &RowMutationRequest,
    ) -> RuntimeResult<MutationResult> {
        self.mutate_rows_internal(req, true)
    }

    fn mutate_rows_internal(
        &mut self,
        req: &RowMutationRequest,
        capture_undo: bool,
    ) -> RuntimeResult<MutationResult> {
        self.ensure_writable()?;

        let (mut result, snapshot) = self.transaction("BEGIN IMMEDIATE", |service| {
            service.apply_rows(req, capture_undo, true)
        })?;
        if let Some(snapshot) = snapshot.filter(|s| result.changed && !s.rows.is_empty()) {
            let (token, evicted) = self.undo.push(UndoEntry::RestoreDelete(snapshot));
            result.undo_token = Some(token);
            if !evicted.is_empty() {
                result.evicted_undo_tokens = Some(evicted);
            }
        }
        Ok(result)
    }

    fn apply_rows(
        &mut self,
        req: &RowMutationRequest,
        capture_undo: bool,
        ordinary_create: bool,
    ) -> RuntimeResult<(MutationResult, Option<RowDeletionUndoState>)> {
        // Check if target table is a virtual table (e.g. fs_meta), which uses file-path row IDs
        let is_vtab = {
            let schema = self.ensure_schema()?;
            schema
                .tables
                .iter()
                .find(|t| t.id == req.table_id)
                .map(|t| {
                    let s: JsonValue =
                        serde_json::from_str(&t.settings_json).unwrap_or_else(|_| json!({}));
                    s.get("tableType").and_then(JsonValue::as_str) == Some("virtual")
                        || s.get("vtabModule").and_then(JsonValue::as_str).is_some()
                })
                .unwrap_or(false)
        };
        if is_vtab {
            return Ok((self.mutate_virtual_table_rows(req)?, None));
        }

        // If capturing undo for deletes, snapshot target rows before deletion
        let mut undo_snapshot = if capture_undo
            && req
                .changes
                .iter()
                .all(|c| matches!(c, RowChange::Delete { .. }))
            && !req.changes.is_empty()
        {
            Some(self.snapshot_rows_for_undo(&req.table_id, &req.changes)?)
        } else {
            None
        };

        let instant = now_instant();
        let mut changes = req.changes.clone();
        if req
            .creation_query
            .as_ref()
            .is_some_and(|q| q.sort.is_some() || q.search.is_some())
        {
            return Err(RuntimeErrorPayload::new(
                "invalid-query",
                "Creation query accepts only a filter",
            ));
        }
        if ordinary_create
            && (req.creation_context.is_some()
                || changes
                    .iter()
                    .any(|c| matches!(c, RowChange::Create { .. })))
        {
            let calendar = req
                .creation_context
                .as_ref()
                .map(|ctx| {
                    if ctx.as_object().is_none_or(|o| o.len() != 2)
                        || !ctx["timeZone"].is_string()
                        || ctx["timeZoneData"].as_str() != Some(jiff_tzdb::VERSION)
                    {
                        return Err(RuntimeErrorPayload::new(
                            "invalid-value",
                            "Invalid creation calendar context",
                        ));
                    }
                    serde_json::from_value::<crate::contract::CalendarContext>(ctx.clone())
                        .map_err(|e| RuntimeErrorPayload::new("invalid-value", e.to_string()))
                })
                .transpose()?;
            let (day, _) = resolve_today_date(calendar.as_ref(), Some(&instant))?;
            let schema = self.ensure_schema()?;
            let fields: Vec<_> = schema
                .fields
                .iter()
                .filter(|f| f.table_id == req.table_id)
                .cloned()
                .collect();
            let table = schema
                .tables
                .iter()
                .find(|t| t.id == req.table_id)
                .cloned()
                .ok_or_else(|| RuntimeErrorPayload::new("not-found", "Missing owning Table"))?;
            let mut defaults = Map::new();
            for field in &fields {
                let settings: JsonValue = serde_json::from_str(&field.settings_json)
                    .map_err(|e| RuntimeErrorPayload::new("corrupt-file", e.to_string()))?;
                if settings["defaultValue"] != "now" {
                    if field.field_type == FieldType::Select
                        && settings["defaultOption"].is_string()
                    {
                        defaults.insert(field.id.clone(), settings["defaultOption"].clone());
                    }
                    continue;
                }
                let value = match field.field_type {
                    FieldType::Date => &day,
                    FieldType::Datetime => &instant,
                    _ => {
                        return Err(RuntimeErrorPayload::new(
                            "corrupt-file",
                            "Invalid temporal default",
                        ));
                    }
                };
                defaults.insert(field.id.clone(), json!(value));
            }
            let query = req
                .creation_query
                .as_ref()
                .filter(|q| q.filter.is_some())
                .map(|q| rewrite_calendar_query(q, &fields, req.calendar.as_ref(), &instant))
                .transpose()?;
            for change in &mut changes {
                if let RowChange::Create { values, .. } = change {
                    if let Some(query) = &query {
                        values.extend(crate::creation::infer(
                            &self.conn, &table, &fields, query, values, &defaults,
                        )?);
                    }
                    for (key, value) in &defaults {
                        values.entry(key.clone()).or_insert_with(|| value.clone());
                    }
                }
            }
        }
        let core_req = RowMutation {
            table_id: req.table_id.clone(),
            expected_revision: Some(req.expected_revision.clone()),
            changes,
        };
        let core_res = mutate_rows_at(
            &self.conn,
            &core_req,
            undo_snapshot.as_mut().map(|s| &mut s.detached),
            instant,
        )
        .map_err(RuntimeErrorPayload::from_core)?;
        self.invalidate_cache();

        let returned_rows = self.returning_rows(req, &core_res.created)?;
        Ok((
            MutationResult {
                file_id: core_res.file_id,
                revision: core_res.revision,
                changed: core_res.changed,
                created: core_res.created,
                affected_rows: core_res.affected_rows,
                returned_rows,
                undo_token: None,
                evicted_undo_tokens: None,
                row_count: None,
            },
            undo_snapshot,
        ))
    }

    fn returning_rows(
        &mut self,
        req: &RowMutationRequest,
        created: &[CreatedRow],
    ) -> RuntimeResult<Option<RowBatch>> {
        let Some(projection) = &req.returning else {
            return Ok(None);
        };
        let allocated: HashMap<_, _> = created
            .iter()
            .map(|row| (&row.client_key, &row.row_id))
            .collect();
        let row_ids = req
            .changes
            .iter()
            .filter_map(|change| match change {
                RowChange::Create { client_key, .. } => {
                    allocated.get(client_key).map(|id| (*id).clone())
                }
                RowChange::Update { row_id, .. } => Some(row_id.clone()),
                RowChange::Delete { .. } => None,
            })
            .collect();
        self.get_rows_by_id(&GetRowsByIdRequest {
            calendar: req.calendar.clone(),
            reference_instant: None,
            table_id: req.table_id.clone(),
            row_ids,
            projection: projection.clone(),
        })
        .map(Some)
    }

    fn mutate_virtual_table_rows(
        &mut self,
        req: &RowMutationRequest,
    ) -> RuntimeResult<MutationResult> {
        let (file_id, table, table_fields) = {
            let schema = self.ensure_schema()?;
            let table = schema
                .tables
                .iter()
                .find(|t| t.id == req.table_id)
                .cloned()
                .ok_or_else(|| {
                    RuntimeErrorPayload::new("not-found", format!("Table {}", req.table_id))
                })?;
            let fields: Vec<FieldMeta> = schema
                .fields
                .iter()
                .filter(|f| f.table_id == req.table_id)
                .cloned()
                .collect();
            (schema.meta.file_id.clone(), table, fields)
        };
        let field_by_id: HashMap<&str, &FieldMeta> =
            table_fields.iter().map(|f| (f.id.as_str(), f)).collect();
        let table_sql =
            quote_identifier(&table.physical_name).map_err(RuntimeErrorPayload::from_core)?;
        let instant = now_instant();

        let tx = &self.conn;
        ensure_revision(tx, &req.expected_revision).map_err(RuntimeErrorPayload::from_core)?;

        let mut affected = Vec::new();
        for change in &req.changes {
            match change {
                RowChange::Update { row_id, values } => {
                    if row_id.is_empty() || row_id.contains('\0') {
                        return Err(RuntimeErrorPayload::new(
                            "invalid-value",
                            "Invalid virtual rowId",
                        ));
                    }
                    if values.is_empty() {
                        continue;
                    }
                    let mut sets = Vec::new();
                    let mut bind: Vec<SqlValue> = Vec::new();
                    for (fid, v) in values {
                        let field = *field_by_id.get(fid.as_str()).ok_or_else(|| {
                            RuntimeErrorPayload::new("not-found", format!("Field {fid}"))
                        })?;
                        let settings: JsonValue = serde_json::from_str(&field.settings_json)
                            .map_err(|e| RuntimeErrorPayload::new("corrupt-file", e.to_string()))?;
                        if field.system_role.is_some()
                            || settings["isSystem"] == true
                            || settings["readOnly"] == true
                            || settings["writable"] == false
                        {
                            return Err(RuntimeErrorPayload::new(
                                "forbidden",
                                "Field is read-only",
                            ));
                        }
                        let phys = field.physical_name.as_deref().ok_or_else(|| {
                            RuntimeErrorPayload::new(
                                "invalid-request",
                                "Virtual field is read-only",
                            )
                        })?;
                        let col_sql =
                            quote_identifier(phys).map_err(RuntimeErrorPayload::from_core)?;
                        let sql_val = match v {
                            JsonValue::Null => SqlValue::Null,
                            JsonValue::Bool(b) => SqlValue::Integer(if *b { 1 } else { 0 }),
                            JsonValue::Number(n) => {
                                if let Some(i) = n.as_i64() {
                                    SqlValue::Integer(i)
                                } else {
                                    SqlValue::Real(n.as_f64().unwrap_or(0.0))
                                }
                            }
                            JsonValue::String(s) => {
                                if field.field_type == FieldType::Integer {
                                    s.parse::<i64>()
                                        .map(SqlValue::Integer)
                                        .unwrap_or_else(|_| SqlValue::Text(s.clone()))
                                } else {
                                    SqlValue::Text(s.clone())
                                }
                            }
                            JsonValue::Array(_) | JsonValue::Object(_) => SqlValue::Text(
                                jcs::to_jcs(v).map_err(RuntimeErrorPayload::from_core)?,
                            ),
                        };
                        sets.push(format!("{col_sql} = ?"));
                        bind.push(sql_val);
                    }
                    bind.push(SqlValue::Text(row_id.clone()));
                    let sql = format!(
                        "UPDATE {table_sql} SET {} WHERE \"_id\" = ?",
                        sets.join(", ")
                    );
                    tx.execute(&sql, params_from_iter(bind.iter()))
                        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                    affected.push(AffectedRow {
                        table_id: table.id.clone(),
                        row_id: row_id.clone(),
                    });
                }
                _ => {
                    return Err(RuntimeErrorPayload::new(
                        "table-mutation-not-supported",
                        "Virtual tables only support row updates",
                    ));
                }
            }
        }
        let changed = !affected.is_empty();
        let new_rev = if changed {
            ddl::increment_revision(tx, &instant).map_err(RuntimeErrorPayload::from_core)?
        } else {
            load_file_meta(tx)
                .map_err(RuntimeErrorPayload::from_core)?
                .revision
        };
        self.invalidate_cache();

        let returned_rows = self.returning_rows(req, &[])?;

        Ok(MutationResult {
            file_id,
            revision: new_rev.to_string(),
            changed,
            created: Vec::new(),
            affected_rows: affected,
            returned_rows,
            undo_token: None,
            evicted_undo_tokens: None,
            row_count: None,
        })
    }

    fn snapshot_rows_for_undo(
        &mut self,
        table_id: &str,
        changes: &[RowChange],
    ) -> RuntimeResult<RowDeletionUndoState> {
        let (table, stored_cols, forward_columns) = {
            let schema = self.ensure_schema()?;
            let table = schema
                .tables
                .iter()
                .find(|t| t.id == table_id)
                .cloned()
                .ok_or_else(|| {
                    RuntimeErrorPayload::new("not-found", format!("Table {table_id}"))
                })?;
            let cols: Vec<String> = schema
                .fields
                .iter()
                .filter(|f| f.table_id == table_id)
                .filter_map(|f| f.physical_name.clone())
                .collect();
            let forward_columns = schema
                .fields
                .iter()
                .filter(|f| {
                    f.table_id == table_id
                        && schema
                            .relations
                            .get(&f.id)
                            .is_some_and(|r| r.direction == RelationDirection::Forward)
                })
                .filter_map(|f| f.physical_name.clone())
                .collect();
            (table, cols, forward_columns)
        };
        let row_ids: Vec<String> = changes
            .iter()
            .filter_map(|c| match c {
                RowChange::Delete { row_id } => Some(row_id.clone()),
                _ => None,
            })
            .collect();
        let table_sql =
            quote_identifier(&table.physical_name).map_err(RuntimeErrorPayload::from_core)?;
        let col_sqls: Vec<String> = stored_cols
            .iter()
            .map(|c| quote_identifier(c).map_err(RuntimeErrorPayload::from_core))
            .collect::<RuntimeResult<_>>()?;
        let ph = vec!["?"; row_ids.len()].join(", ");
        let sql = format!(
            "SELECT {} FROM {table_sql} WHERE \"_id\" IN ({ph}) ORDER BY \"_id\"",
            col_sqls.join(", ")
        );
        let mut stmt = self
            .conn
            .prepare(&sql)
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
        let mut qrows = stmt
            .query(params_from_iter(row_ids.iter()))
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
        let mut snapshots = Vec::new();
        while let Some(r) = qrows
            .next()
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?
        {
            let mut vals = Vec::with_capacity(stored_cols.len());
            let mut row_id = String::new();
            for (i, col_name) in stored_cols.iter().enumerate() {
                let v = r.get::<_, SqlValue>(i).unwrap_or(SqlValue::Null);
                if col_name == "_id"
                    && let SqlValue::Text(ref s) = v
                {
                    row_id = s.clone();
                }
                vals.push(v);
            }
            snapshots.push(DeletedRowSnapshot {
                row_id,
                columns: stored_cols.clone(),
                values: vals,
            });
        }
        Ok(RowDeletionUndoState {
            table_id: table.id,
            physical_table: table.physical_name,
            rows: snapshots,
            forward_columns,
            detached: Vec::new(),
        })
    }

    pub fn revert_mutation(
        &mut self,
        req: &RevertMutationRequest,
    ) -> RuntimeResult<MutationResult> {
        self.ensure_writable()?;
        let entry = self.undo.get(&req.undo_token).cloned().ok_or_else(|| {
            RuntimeErrorPayload::new(
                "not-found",
                format!("Unknown undo token: {}", req.undo_token),
            )
        })?;

        let file_id = self.ensure_schema()?.meta.file_id.clone();

        match entry {
            UndoEntry::RestoreDelete(mut state) => {
                let instant = now_instant();
                let table_sql = quote_identifier(&state.physical_table)
                    .map_err(RuntimeErrorPayload::from_core)?;
                let tx = self
                    .conn
                    .transaction_with_behavior(TransactionBehavior::Immediate)
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                ensure_revision(&tx, &req.expected_revision)
                    .map_err(RuntimeErrorPayload::from_core)?;

                let mut affected = Vec::with_capacity(state.rows.len());
                for snap in &mut state.rows {
                    let cols: Vec<String> = snap
                        .columns
                        .iter()
                        .map(|c| quote_identifier(c).map_err(RuntimeErrorPayload::from_core))
                        .collect::<RuntimeResult<_>>()?;
                    let ph = vec!["?"; cols.len()].join(", ");
                    let sql = format!(
                        "INSERT INTO {table_sql} ({}) VALUES ({ph})",
                        cols.join(", ")
                    );
                    // Restore all identities before reconnecting forward references
                    // (including cycles and references to another restored row).
                    if let Some(i) = snap.columns.iter().position(|c| c == "_updated_at") {
                        snap.values[i] = SqlValue::Text(instant.clone());
                    }
                    let empty_relation = SqlValue::Text("[]".into());
                    let values = snap.columns.iter().zip(&snap.values).map(|(col, value)| {
                        if state.forward_columns.contains(col) {
                            &empty_relation
                        } else {
                            value
                        }
                    });
                    tx.execute(&sql, params_from_iter(values))
                        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                    affected.push(AffectedRow {
                        table_id: state.table_id.clone(),
                        row_id: snap.row_id.clone(),
                    });
                }
                for col in &state.forward_columns {
                    let column = quote_identifier(col).map_err(RuntimeErrorPayload::from_core)?;
                    for row in &state.rows {
                        let i = row
                            .columns
                            .iter()
                            .position(|c| c == col)
                            .expect("captured relation column");
                        tx.execute(
                            &format!("UPDATE {table_sql} SET {column} = ? WHERE _id = ?"),
                            params![row.values[i], row.row_id],
                        )
                        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                    }
                }
                for cell in &state.detached {
                    let table =
                        quote_identifier(&cell.table).map_err(RuntimeErrorPayload::from_core)?;
                    let column =
                        quote_identifier(&cell.column).map_err(RuntimeErrorPayload::from_core)?;
                    let changed = tx.execute(&format!(
                        "UPDATE {table} SET {column} = ?1, _updated_at = ?2 WHERE _id = ?3 AND {column} = ?4"
                    ), params![cell.before, instant, cell.row_id, cell.after])
                        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                    if changed != 1 {
                        return Err(RuntimeErrorPayload::new(
                            "conflict",
                            "Detached relation changed since deletion",
                        ));
                    }
                    let row = AffectedRow {
                        table_id: cell.table_id.clone(),
                        row_id: cell.row_id.clone(),
                    };
                    if !affected.contains(&row) {
                        affected.push(row);
                    }
                }
                let new_rev = ddl::increment_revision(&tx, &instant)
                    .map_err(RuntimeErrorPayload::from_core)?;
                let count: i64 = tx
                    .query_row(&format!("SELECT count(*) FROM {table_sql}"), [], |r| {
                        r.get(0)
                    })
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                tx.commit()
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                self.invalidate_cache();

                self.undo
                    .put_with_token(req.undo_token.clone(), UndoEntry::RepeatDelete(state));

                Ok(MutationResult {
                    file_id,
                    revision: new_rev.to_string(),
                    changed: true,
                    created: Vec::new(),
                    affected_rows: affected,
                    returned_rows: None,
                    undo_token: Some(req.undo_token.clone()),
                    evicted_undo_tokens: None,
                    row_count: Some(count.to_string()),
                })
            }
            UndoEntry::RepeatDelete(state) => {
                let changes: Vec<RowChange> = state
                    .rows
                    .iter()
                    .map(|r| RowChange::Delete {
                        row_id: r.row_id.clone(),
                    })
                    .collect();
                let request = &RowMutationRequest {
                    creation_query: None,
                    calendar: None,
                    creation_context: None,
                    table_id: state.table_id.clone(),
                    expected_revision: req.expected_revision.clone(),
                    returning: None,
                    changes,
                };
                let mut res = self.transaction("BEGIN IMMEDIATE", |service| {
                    let (mut result, captured) = service.apply_rows(request, true, false)?;
                    let captured = captured.ok_or_else(|| {
                        RuntimeErrorPayload::new(
                            "stale-revision",
                            "Deletion is no longer reversible",
                        )
                    })?;
                    if captured.physical_table != state.physical_table
                        || captured.rows != state.rows
                        || captured.detached != state.detached
                    {
                        return Err(RuntimeErrorPayload::new(
                            "conflict",
                            "Restored rows or relations changed",
                        ));
                    }
                    let table = quote_identifier(&state.physical_table)
                        .map_err(RuntimeErrorPayload::from_core)?;
                    let count: i64 = service
                        .conn
                        .query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))
                        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                    result.row_count = Some(count.to_string());
                    Ok(result)
                })?;
                res.undo_token = Some(req.undo_token.clone());
                self.undo
                    .put_with_token(req.undo_token.clone(), UndoEntry::RestoreDelete(state));
                Ok(res)
            }
        }
    }

    pub fn mutate_view(&mut self, req: &ViewMutationRequest) -> RuntimeResult<ViewMutationResult> {
        self.ensure_writable()?;
        let res = mutate_views(&mut self.conn, req).map_err(RuntimeErrorPayload::from_core)?;
        self.invalidate_cache();
        Ok(res)
    }

    #[allow(clippy::result_large_err)]
    pub fn preflight_schema(
        &mut self,
        req: &SchemaPreflightRequest,
    ) -> RuntimeResult<SchemaPreflightResult> {
        self.ensure_writable()?;
        let (file_id, rev_str) = {
            let schema = self.ensure_schema()?;
            (
                schema.meta.file_id.clone(),
                schema.meta.revision.to_string(),
            )
        };
        if req.expected_revision != rev_str {
            return Err(RuntimeErrorPayload::new(
                "stale-revision",
                format!(
                    "Expected revision {}, found {rev_str}",
                    req.expected_revision
                ),
            )
            .with_current_revision(rev_str));
        }

        let canonical = jcs::to_jcs(&req.change).map_err(RuntimeErrorPayload::from_core)?;
        let actions_hash = sha256_hex(&canonical);
        let plan_token = generate_uuidv7();

        let leaves: Vec<JsonValue> =
            if req.change.get("kind").and_then(JsonValue::as_str) == Some("batch") {
                req.change
                    .get("changes")
                    .and_then(JsonValue::as_array)
                    .cloned()
                    .unwrap_or_default()
            } else {
                vec![req.change.clone()]
            };

        fn cls_rank(c: &str) -> u8 {
            match c {
                "metadata-only" => 0,
                "lossless-rewrite" => 1,
                "explicit-lossy" => 2,
                "forbidden" => 3,
                _ => 0,
            }
        }

        let mut classification = "metadata-only".to_string();
        let mut dependencies = std::collections::BTreeSet::new();
        let mut total_affected: i64 = 0;
        let mut warnings: Vec<RuntimeDiagnostic> = Vec::new();
        let mut value_changes: Vec<crate::contract::SchemaValueChange> = Vec::new();
        let mut conversions: HashMap<String, ConversionPreflight> = HashMap::new();

        if leaves.iter().any(|leaf| {
            matches!(
                leaf["kind"].as_str(),
                Some(
                    "delete-field"
                        | "set-formula"
                        | "create-table"
                        | "create-field"
                        | "convert-field"
                        | "rename-field"
                )
            )
        }) {
            let schema = self.ensure_schema()?;
            let mut fields = schema.fields.clone();
            for field in &mut fields {
                if field.field_type == FieldType::Lookup {
                    let kind = schema.logical_type(field)?;
                    if eidos_file_core::model::FormulaResultType::from_spec_str(kind.as_str())
                        .is_ok()
                        || kind == FieldType::Select
                    {
                        field.field_type = kind;
                        field.physical_name = Some(field.name.clone());
                    }
                }
            }
            let mut formulas = schema.formulas.clone();
            let mut table_ids: Vec<String> = schema.tables.iter().map(|t| t.id.clone()).collect();
            for (index, leaf) in leaves.iter().enumerate() {
                // The preview needs only names, types and dependencies. IDs for new fields
                // are local to this plan and are never written to the file.
                if matches!(leaf["kind"].as_str(), Some("create-table" | "create-field")) {
                    let new_table = leaf["kind"] == "create-table";
                    let table = if new_table {
                        format!("planned-table-{index}")
                    } else {
                        leaf["tableId"].as_str().unwrap_or("").to_owned()
                    };
                    let incoming = if new_table {
                        table_ids.push(table.clone());
                        leaf["fields"].as_array().map(Vec::as_slice).unwrap_or(&[])
                    } else {
                        std::slice::from_ref(&leaf["field"])
                    };
                    if new_table {
                        for (offset, (name, kind, role)) in [
                            ("_id", FieldType::Text, SystemRole::RowId),
                            ("_created_at", FieldType::Datetime, SystemRole::CreatedTime),
                            ("_updated_at", FieldType::Datetime, SystemRole::UpdatedTime),
                        ]
                        .into_iter()
                        .enumerate()
                        {
                            fields.push(planned_field(
                                &table,
                                format!("{table}-sys-{offset}"),
                                name,
                                kind,
                                Some(role),
                            ));
                        }
                    }
                    for (offset, f) in incoming.iter().enumerate() {
                        let Some(name) = f["name"].as_str() else {
                            continue;
                        };
                        let Ok(kind) = FieldType::from_spec_str(f["kind"].as_str().unwrap_or(""))
                        else {
                            continue;
                        };
                        let id = format!("planned-field-{index}-{offset}");
                        fields.push(planned_field(&table, id.clone(), name, kind, None));
                        if kind == FieldType::Formula
                            && let Some(source) = f["definition"]["sourceText"].as_str()
                        {
                            let result = eidos_file_core::model::FormulaResultType::from_spec_str(
                                f["definition"]["resultType"].as_str().unwrap_or(""),
                            )
                            .map_err(RuntimeErrorPayload::from_core)?;
                            formulas.insert(
                                id.clone(),
                                FormulaFieldMeta {
                                    field_id: id,
                                    source_text: source.to_owned(),
                                    result_type: result,
                                },
                            );
                        }
                    }
                }
                match leaf["kind"].as_str() {
                    Some("delete-field") => {
                        fields.retain(|f| Some(f.id.as_str()) != leaf["fieldId"].as_str())
                    }
                    Some("delete-table") => {
                        fields.retain(|f| Some(f.table_id.as_str()) != leaf["tableId"].as_str())
                    }
                    Some("set-formula") => {
                        if let Some(def) =
                            leaf["fieldId"].as_str().and_then(|id| formulas.get_mut(id))
                            && let Some(source) = leaf["definition"]["sourceText"].as_str()
                        {
                            def.source_text = source.to_owned();
                            if let Some(result) = leaf["definition"]["resultType"].as_str() {
                                def.result_type =
                                    eidos_file_core::model::FormulaResultType::from_spec_str(
                                        result,
                                    )
                                    .map_err(RuntimeErrorPayload::from_core)?;
                            }
                        }
                    }
                    Some("rename-field") => {
                        if let Some(field) = fields
                            .iter_mut()
                            .find(|f| Some(f.id.as_str()) == leaf["fieldId"].as_str())
                            && let Some(name) = leaf["name"].as_str()
                        {
                            let table = field.table_id.clone();
                            let old = std::mem::replace(&mut field.name, name.to_owned());
                            for owner in fields.iter().filter(|f| f.table_id == table) {
                                if let Some(def) = formulas.get_mut(&owner.id)
                                    && let Some(next) =
                                        eidos_file_core::formula_source::rename_reference(
                                            &def.source_text,
                                            &old,
                                            name,
                                        )
                                        .map_err(RuntimeErrorPayload::from_core)?
                                {
                                    def.source_text = next;
                                }
                            }
                        }
                    }
                    Some("convert-field") => {
                        if let Some(field) = fields
                            .iter_mut()
                            .find(|f| Some(f.id.as_str()) == leaf["fieldId"].as_str())
                            && let Ok(kind) =
                                FieldType::from_spec_str(leaf["to"].as_str().unwrap_or(""))
                        {
                            field.field_type = kind;
                        }
                    }
                    _ => {}
                }
            }
            for table in &table_ids {
                let scope: Vec<_> = fields
                    .iter()
                    .filter(|f| f.table_id == *table)
                    .cloned()
                    .collect();
                for field in &scope {
                    if let Some(def) = formulas.get(&field.id)
                        && let Err(reason) = compile_formula_expression(
                            &def.source_text,
                            &scope,
                            &formulas,
                            Some(&field.id),
                            None,
                        )
                        .and_then(|c| crate::formula::check_result(c, def.result_type.as_str()))
                    {
                        classification = "forbidden".into();
                        warnings.push(RuntimeDiagnostic {
                            code: "formula-type-invalid".into(),
                            severity: "error".into(),
                            message: reason.message,
                            table_id: schema
                                .tables
                                .iter()
                                .find(|t| t.id == *table)
                                .map(|t| t.id.clone()),
                            field_id: None,
                            view_id: None,
                            row_id: None,
                            path: None,
                        });
                        break;
                    }
                }
            }
        }

        for leaf in &leaves {
            let lkind = leaf.get("kind").and_then(JsonValue::as_str).unwrap_or("");
            if lkind == "rename-field" && classification == "metadata-only" {
                let schema = self.ensure_schema()?;
                if let Some(field) = schema
                    .fields
                    .iter()
                    .find(|f| Some(f.id.as_str()) == leaf["fieldId"].as_str())
                    && let Some(name) = leaf["name"].as_str()
                {
                    for owner in schema
                        .fields
                        .iter()
                        .filter(|f| f.table_id == field.table_id)
                    {
                        if let Some(formula) = schema.formulas.get(&owner.id)
                            && eidos_file_core::schema_ops::renamed_formula_source(
                                &formula.source_text,
                                &field.name,
                                name,
                            )
                            .map_err(RuntimeErrorPayload::from_core)?
                            .is_some()
                        {
                            classification = "lossless-rewrite".into();
                            break;
                        }
                    }
                }
            }
            if matches!(lkind, "delete-field" | "delete-table") {
                let schema = self.ensure_schema()?;
                let mut diagnostic = |lossy: bool,
                                      message: &str,
                                      table: Option<&str>,
                                      field: Option<&str>,
                                      view: Option<&str>| {
                    if !lossy {
                        classification = "forbidden".into();
                    } else if classification != "forbidden" {
                        classification = "explicit-lossy".into();
                    }
                    warnings.push(RuntimeDiagnostic {
                        code: if lossy {
                            "object-delete-loss"
                        } else {
                            "dependency-blocked"
                        }
                        .into(),
                        severity: if lossy { "warning" } else { "error" }.into(),
                        message: Some(message.into()),
                        table_id: table.map(str::to_owned),
                        field_id: field.map(str::to_owned),
                        view_id: view.map(str::to_owned),
                        row_id: None,
                        path: None,
                    });
                };
                let table = if lkind == "delete-table" {
                    let id = leaf["tableId"].as_str().ok_or_else(|| {
                        RuntimeErrorPayload::new("invalid-request", "delete-table requires tableId")
                    })?;
                    let Some(table) = schema.tables.iter().find(|table| table.id == id) else {
                        diagnostic(false, "Table does not exist", Some(id), None, None);
                        continue;
                    };
                    if schema.meta.default_table_id.as_deref() == Some(id) {
                        diagnostic(
                            false,
                            "Clear or retarget the default Table before deletion",
                            Some(id),
                            None,
                            None,
                        );
                    }
                    diagnostic(
                        true,
                        "Deleting a Table removes its rows and Fields",
                        Some(id),
                        None,
                        None,
                    );
                    dependencies.insert((0, table.id.clone()));
                    dependencies.extend(
                        schema
                            .fields
                            .iter()
                            .filter(|f| f.table_id == id)
                            .map(|f| (1, f.id.clone())),
                    );
                    dependencies.extend(
                        schema
                            .views
                            .iter()
                            .filter(|v| v.table_id == id)
                            .map(|v| (2, v.id.clone())),
                    );
                    table
                } else {
                    let id = leaf["fieldId"].as_str().ok_or_else(|| {
                        RuntimeErrorPayload::new("invalid-request", "delete-field requires fieldId")
                    })?;
                    let Some(field) = schema.fields.iter().find(|f| f.id == id) else {
                        diagnostic(false, "Field does not exist", None, Some(id), None);
                        continue;
                    };
                    dependencies.insert((1, field.id.clone()));
                    let table_id = field.table_id.as_str();
                    let system = field.system_role.is_some()
                        || serde_json::from_str::<JsonValue>(&field.settings_json)
                            .map_err(|e| RuntimeErrorPayload::new("corrupt-file", e.to_string()))?
                            ["isSystem"]
                            == true;
                    if system {
                        diagnostic(
                            false,
                            "System Fields cannot be deleted",
                            None,
                            Some(id),
                            None,
                        );
                    } else {
                        diagnostic(
                            true,
                            "Deleting a Field removes its values",
                            Some(table_id),
                            Some(id),
                            None,
                        );
                    }
                    for view in schema.views.iter().filter(|v| v.table_id == table_id) {
                        let query = serde_json::from_str(&view.query_json).map_err(|e| {
                            RuntimeErrorPayload::new("corrupt-file", format!("{e}"))
                        })?;
                        let layout = serde_json::from_str(&view.layout_json).map_err(|e| {
                            RuntimeErrorPayload::new("corrupt-file", format!("{e}"))
                        })?;
                        let blocks = view_query_uses_field(&query, id);
                        if blocks || view_layout_uses_field(&layout, id) {
                            dependencies.insert((2, view.id.clone()));
                        }
                        if blocks {
                            diagnostic(
                                false,
                                "Saved View query still references the Field",
                                Some(table_id),
                                Some(id),
                                Some(&view.id),
                            );
                        }
                    }
                    if system {
                        continue;
                    }
                    schema
                        .tables
                        .iter()
                        .find(|t| t.id == table_id)
                        .ok_or_else(|| {
                            RuntimeErrorPayload::new("corrupt-file", "Missing owning Table")
                        })?
                };
                let sql = quote_identifier(&table.physical_name)
                    .map_err(RuntimeErrorPayload::from_core)?;
                total_affected += self
                    .conn
                    .query_row(&format!("SELECT count(*) FROM {sql}"), [], |row| {
                        row.get::<_, i64>(0)
                    })
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
            } else if lkind == "convert-field" {
                let field_id =
                    leaf.get("fieldId")
                        .and_then(JsonValue::as_str)
                        .ok_or_else(|| {
                            RuntimeErrorPayload::new(
                                "invalid-request",
                                "convert-field requires fieldId",
                            )
                        })?;
                let (table, field) = {
                    let schema = self.ensure_schema()?;
                    let field = schema
                        .fields
                        .iter()
                        .find(|f| f.id == field_id)
                        .cloned()
                        .ok_or_else(|| {
                            RuntimeErrorPayload::new("not-found", format!("Field {field_id}"))
                        })?;
                    let table = schema
                        .tables
                        .iter()
                        .find(|t| t.id == field.table_id)
                        .cloned()
                        .ok_or_else(|| {
                            RuntimeErrorPayload::new(
                                "not-found",
                                format!("Table {}", field.table_id),
                            )
                        })?;
                    (table, field)
                };
                let pre = preflight_field_conversion(&self.conn, &table, &field, leaf)?;
                if cls_rank(&pre.classification) > cls_rank(&classification) {
                    classification = pre.classification.clone();
                }
                total_affected += pre.affected_rows;
                warnings.extend(pre.warnings.clone());
                value_changes.extend(pre.value_changes.clone());
                conversions.insert(field_id.to_string(), pre);
            } else if lkind == "rename-option" {
                let field_id =
                    leaf.get("fieldId")
                        .and_then(JsonValue::as_str)
                        .ok_or_else(|| {
                            RuntimeErrorPayload::new(
                                "invalid-request",
                                "rename-option requires fieldId",
                            )
                        })?;
                let from = leaf.get("from").and_then(JsonValue::as_str).unwrap_or("");
                let to = leaf.get("to").and_then(JsonValue::as_str).unwrap_or("");
                let collision = leaf
                    .get("collision")
                    .and_then(JsonValue::as_str)
                    .unwrap_or("reject");
                let (table, field) = {
                    let schema = self.ensure_schema()?;
                    let field = schema
                        .fields
                        .iter()
                        .find(|f| f.id == field_id)
                        .cloned()
                        .ok_or_else(|| {
                            RuntimeErrorPayload::new("not-found", format!("Field {field_id}"))
                        })?;
                    let table = schema
                        .tables
                        .iter()
                        .find(|t| t.id == field.table_id)
                        .cloned()
                        .ok_or_else(|| {
                            RuntimeErrorPayload::new(
                                "not-found",
                                format!("Table {}", field.table_id),
                            )
                        })?;
                    (table, field)
                };
                let settings: JsonValue =
                    serde_json::from_str(&field.settings_json).unwrap_or_else(|_| json!({}));
                let options = settings
                    .get("options")
                    .and_then(JsonValue::as_array)
                    .cloned()
                    .unwrap_or_default();
                let to_exists = to != from
                    && options
                        .iter()
                        .any(|o| o.get("name").and_then(JsonValue::as_str) == Some(to));
                let leaf_cls = if to_exists && collision == "reject" {
                    "forbidden"
                } else if field.field_type == FieldType::MultiSelect
                    && to_exists
                    && collision == "merge"
                {
                    let phys = field.physical_name.as_deref().unwrap_or("");
                    let tbl_sql = quote_identifier(&table.physical_name)
                        .map_err(RuntimeErrorPayload::from_core)?;
                    let col_sql = quote_identifier(phys).map_err(RuntimeErrorPayload::from_core)?;
                    let collapsed: i64 = self
                        .conn
                        .query_row(
                            &format!(
                                "SELECT COUNT(*) FROM {tbl_sql} WHERE {col_sql} IS NOT NULL \
                                 AND EXISTS (SELECT 1 FROM json_each({col_sql}) WHERE value = ?1) \
                                 AND EXISTS (SELECT 1 FROM json_each({col_sql}) WHERE value = ?2)"
                            ),
                            params![from, to],
                            |r| r.get(0),
                        )
                        .unwrap_or(0);
                    if collapsed > 0 {
                        "explicit-lossy"
                    } else {
                        "lossless-rewrite"
                    }
                } else {
                    "lossless-rewrite"
                };
                if cls_rank(leaf_cls) > cls_rank(&classification) {
                    classification = leaf_cls.to_string();
                }
            }
        }
        let affected_rows = total_affected.to_string();
        let dependencies: Vec<_> = dependencies
            .into_iter()
            .map(|(kind, id)| SchemaDependency {
                object: ["table", "field", "view"][kind].into(),
                id,
            })
            .collect();

        let ttl = std::time::Duration::from_secs(600);
        let now = std::time::Instant::now();
        self.plans.retain(|_, plan| plan.expires > now);
        let end = dependencies.len().min(self.limits.schema_page_size_max);
        let dependency_cursor = (end < dependencies.len())
            .then(|| self.cursor_key.seal(&(&plan_token, end)))
            .transpose()?;
        self.plans.insert(
            plan_token.clone(),
            CachedSchemaPlan {
                change: req.change.clone(),
                actions_hash: actions_hash.clone(),
                base_revision: rev_str.clone(),
                classification: classification.clone(),
                expires: now + ttl,
                dependencies: dependencies.clone(),
                conversions,
            },
        );

        let expires_at =
            (chrono::Utc::now() + ttl).to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        Ok(SchemaPreflightResult {
            file_id,
            plan_token,
            base_revision: rev_str,
            actions_hash,
            classification,
            affected_rows,
            dependency_count: dependencies.len().to_string(),
            dependencies: dependencies[..end].to_vec(),
            dependency_cursor,
            warnings,
            warnings_truncated: false,
            value_changes,
            value_changes_truncated: false,
            expires_in_milliseconds: ttl.as_millis() as u64,
            expires_at,
        })
    }

    pub fn get_schema_plan_dependencies(
        &mut self,
        req: &SchemaDependencyPageRequest,
    ) -> RuntimeResult<SchemaDependencyPage> {
        let file_id = self.ensure_schema()?.meta.file_id.clone();
        if req.limit == 0 || req.limit > self.limits.schema_page_size_max {
            return Err(RuntimeErrorPayload::new(
                "invalid-request",
                "Invalid dependency page limit",
            ));
        }
        let plan = self.retained_plan(&req.plan_token)?;
        let offset = if let Some(cursor) = &req.cursor {
            let (token, offset): (String, usize) = self.cursor_key.open(cursor)?;
            if token != req.plan_token || offset > plan.dependencies.len() {
                return Err(RuntimeErrorPayload::new(
                    "invalid-plan",
                    "Invalid dependency cursor",
                ));
            }
            offset
        } else {
            0
        };
        let end = (offset + req.limit).min(plan.dependencies.len());
        Ok(SchemaDependencyPage {
            file_id,
            revision: plan.base_revision.clone(),
            dependency_count: plan.dependencies.len().to_string(),
            dependencies: plan.dependencies[offset..end].to_vec(),
            next_cursor: (end < plan.dependencies.len())
                .then(|| self.cursor_key.seal(&(&req.plan_token, end)))
                .transpose()?,
        })
    }

    fn retained_plan(&self, token: &str) -> RuntimeResult<&CachedSchemaPlan> {
        self.plans
            .get(token)
            .filter(|plan| plan.expires > std::time::Instant::now())
            .ok_or_else(|| {
                RuntimeErrorPayload::new("invalid-plan", "Unknown or expired schema plan")
            })
    }

    pub fn mutate_schema(
        &mut self,
        req: &SchemaMutationRequest,
    ) -> RuntimeResult<SchemaMutationResult> {
        self.ensure_writable()?;
        let plan = self.retained_plan(&req.plan_token)?;
        if plan.actions_hash != req.actions_hash {
            return Err(RuntimeErrorPayload::new(
                "invalid-plan",
                "actionsHash does not match preflight plan",
            ));
        }
        if plan.base_revision != req.expected_revision {
            return Err(RuntimeErrorPayload::new(
                "stale-revision",
                "expectedRevision does not match preflight baseRevision",
            ));
        }
        if plan.classification == "forbidden" {
            return Err(RuntimeErrorPayload::new(
                "forbidden",
                "Schema plan is forbidden and cannot be applied",
            ));
        }
        if plan.classification == "explicit-lossy" && !req.confirm_lossy.unwrap_or(false) {
            return Err(RuntimeErrorPayload::new(
                "lossy-confirmation-required",
                "Explicit lossy schema change requires confirmLossy: true",
            ));
        }

        let plan = self
            .plans
            .remove(&req.plan_token)
            .expect("verified retained plan");
        self.transaction("BEGIN IMMEDIATE", |service| {
            service.apply_schema_plan(req, plan)
        })
    }

    fn apply_schema_plan(
        &mut self,
        req: &SchemaMutationRequest,
        plan: CachedSchemaPlan,
    ) -> RuntimeResult<SchemaMutationResult> {
        ensure_revision(&self.conn, &req.expected_revision)
            .map_err(RuntimeErrorPayload::from_core)?;
        let instant = now_instant();
        let file_id = self.ensure_schema()?.meta.file_id.clone();
        let conversions = plan.conversions;

        // Delegate leaf/batch changes to eidos-file-core schema_ops (plus conversion/formula/settings extensions)
        let leaves: Vec<JsonValue> =
            if plan.change.get("kind").and_then(JsonValue::as_str) == Some("batch") {
                plan.change
                    .get("changes")
                    .and_then(JsonValue::as_array)
                    .cloned()
                    .unwrap_or_default()
            } else {
                vec![plan.change]
            };

        let mut any_changed = false;
        let mut created_objects: Vec<JsonValue> = Vec::new();
        let mut affected_tables: Vec<String> = Vec::new();
        let mut affected_fields: Vec<String> = Vec::new();

        for leaf in leaves {
            self.invalidate_cache();
            let kind = leaf.get("kind").and_then(JsonValue::as_str).unwrap_or("");
            match kind {
                "create-table" | "create-field" | "rename-table" | "rename-field"
                | "delete-table" | "delete-field" | "set-file-title" | "set-default-table" => {
                    // Handle create-field for formula/lookup/inverse-relation separately since core alpha skips virtual fields
                    let field_kind = leaf
                        .get("field")
                        .and_then(|f| f.get("kind"))
                        .and_then(JsonValue::as_str);
                    let rel_dir = leaf
                        .get("field")
                        .and_then(|f| f.get("definition"))
                        .and_then(|d| d.get("direction"))
                        .and_then(JsonValue::as_str);
                    let is_virtual_create = kind == "create-field"
                        && (matches!(field_kind, Some("formula" | "lookup"))
                            || (field_kind == Some("relation") && rel_dir == Some("inverse")));
                    if is_virtual_create {
                        let (fid, tid, ck) = self.apply_create_virtual_field(&leaf, &instant)?;
                        any_changed = true;
                        created_objects.push(json!({
                            "id": fid,
                            "object": "field",
                            "clientKey": ck,
                        }));
                        affected_tables.push(tid);
                        affected_fields.push(fid);
                    } else {
                        let parsed: SchemaLeafChange =
                            serde_json::from_value(leaf).map_err(|e| {
                                RuntimeErrorPayload::new("invalid-request", e.to_string())
                            })?;
                        let (changed, objects) =
                            apply_runtime_schema_leaf(&self.conn, &parsed, &instant)
                                .map_err(RuntimeErrorPayload::from_core)?;
                        if changed {
                            any_changed = true;
                        }
                        for obj in objects {
                            match obj.object {
                                CreatedObjectKind::Table => {
                                    affected_tables.push(obj.id.clone());
                                    created_objects.push(json!({
                                        "id": obj.id,
                                        "object": "table",
                                        "clientKey": obj.client_key,
                                    }));
                                }
                                CreatedObjectKind::Field => {
                                    affected_fields.push(obj.id.clone());
                                    created_objects.push(json!({
                                        "id": obj.id,
                                        "object": "field",
                                        "clientKey": obj.client_key,
                                    }));
                                }
                            }
                        }
                    }
                }
                "set-field-settings" => {
                    let field_id =
                        leaf.get("fieldId")
                            .and_then(JsonValue::as_str)
                            .ok_or_else(|| {
                                RuntimeErrorPayload::new("invalid-request", "missing fieldId")
                            })?;
                    let settings = leaf.get("settings").cloned().unwrap_or_else(|| json!({}));
                    let canonical =
                        jcs::to_jcs(&settings).map_err(RuntimeErrorPayload::from_core)?;
                    let tx = &self.conn;
                    tx.execute(
                        "UPDATE eidos__fields SET settings_json = ?1, updated_at = ?2 WHERE id = ?3",
                        params![canonical, instant, field_id],
                    )
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                    any_changed = true;
                    affected_fields.push(field_id.to_string());
                }
                "set-table-settings" => {
                    let table_id =
                        leaf.get("tableId")
                            .and_then(JsonValue::as_str)
                            .ok_or_else(|| {
                                RuntimeErrorPayload::new("invalid-request", "missing tableId")
                            })?;
                    let settings = leaf.get("settings").cloned().unwrap_or_else(|| json!({}));
                    let canonical =
                        jcs::to_jcs(&settings).map_err(RuntimeErrorPayload::from_core)?;
                    let tx = &self.conn;
                    tx.execute(
                        "UPDATE eidos__tables SET settings_json = ?1, updated_at = ?2 WHERE id = ?3",
                        params![canonical, instant, table_id],
                    )
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                    any_changed = true;
                    affected_tables.push(table_id.to_string());
                }
                "set-formula" => {
                    let field_id =
                        leaf.get("fieldId")
                            .and_then(JsonValue::as_str)
                            .ok_or_else(|| {
                                RuntimeErrorPayload::new("invalid-request", "missing fieldId")
                            })?;
                    let def = leaf.get("definition").ok_or_else(|| {
                        RuntimeErrorPayload::new("invalid-request", "missing definition")
                    })?;
                    let src = def
                        .get("sourceText")
                        .and_then(JsonValue::as_str)
                        .ok_or_else(|| {
                            RuntimeErrorPayload::new("invalid-request", "missing sourceText")
                        })?;
                    let rt = def
                        .get("resultType")
                        .and_then(JsonValue::as_str)
                        .unwrap_or("text");
                    let tx = &self.conn;
                    tx.execute(
                        "UPDATE eidos__formula_fields SET source_text = ?1, result_type = ?2 WHERE field_id = ?3",
                        params![src, rt, field_id],
                    )
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                    any_changed = true;
                    affected_fields.push(field_id.to_string());
                }
                "set-field-nullable" => {
                    let field_id =
                        leaf.get("fieldId")
                            .and_then(JsonValue::as_str)
                            .ok_or_else(|| {
                                RuntimeErrorPayload::new("invalid-request", "missing fieldId")
                            })?;
                    let nullable = leaf
                        .get("nullable")
                        .and_then(JsonValue::as_bool)
                        .ok_or_else(|| {
                            RuntimeErrorPayload::new("invalid-request", "missing nullable")
                        })?;
                    let (table, field) = {
                        let schema = self.ensure_schema()?;
                        let field = schema
                            .fields
                            .iter()
                            .find(|f| f.id == field_id)
                            .cloned()
                            .ok_or_else(|| {
                                RuntimeErrorPayload::new("not-found", format!("Field {field_id}"))
                            })?;
                        let table = schema
                            .tables
                            .iter()
                            .find(|t| t.id == field.table_id)
                            .cloned()
                            .ok_or_else(|| {
                                RuntimeErrorPayload::new(
                                    "not-found",
                                    format!("Table {}", field.table_id),
                                )
                            })?;
                        (table, field)
                    };
                    if field.system_role.is_some() {
                        return Err(RuntimeErrorPayload::new(
                            "forbidden",
                            "Cannot change nullability of a system field",
                        ));
                    }
                    let tx = &self.conn;
                    if !nullable && let Some(phys) = field.physical_name.as_deref() {
                        let tbl_sql = quote_identifier(&table.physical_name)
                            .map_err(RuntimeErrorPayload::from_core)?;
                        let col_sql =
                            quote_identifier(phys).map_err(RuntimeErrorPayload::from_core)?;
                        let null_count: i64 = tx
                            .query_row(
                                &format!("SELECT COUNT(*) FROM {tbl_sql} WHERE {col_sql} IS NULL"),
                                [],
                                |r| r.get(0),
                            )
                            .map_err(|e| {
                                RuntimeErrorPayload::new("adapter-error", e.to_string())
                            })?;
                        if null_count > 0 {
                            return Err(RuntimeErrorPayload::new(
                                "invalid-value",
                                format!(
                                    "Cannot set field {} to non-nullable: {null_count} row(s) contain NULL",
                                    field.name
                                ),
                            ));
                        }
                    }
                    tx.execute(
                        "UPDATE eidos__fields SET nullable = ?1, updated_at = ?2 WHERE id = ?3",
                        params![if nullable { 1 } else { 0 }, instant, field_id],
                    )
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                    any_changed = true;
                    affected_fields.push(field_id.to_string());
                }
                "set-field-position" => {
                    let field_id =
                        leaf.get("fieldId")
                            .and_then(JsonValue::as_str)
                            .ok_or_else(|| {
                                RuntimeErrorPayload::new("invalid-request", "missing fieldId")
                            })?;
                    let pos: i64 = leaf
                        .get("position")
                        .and_then(JsonValue::as_str)
                        .and_then(|s| s.parse().ok())
                        .ok_or_else(|| {
                            RuntimeErrorPayload::new("invalid-request", "invalid position")
                        })?;
                    let tx = &self.conn;
                    let updated = tx
                        .execute(
                            "UPDATE eidos__fields SET position = ?1, updated_at = ?2 WHERE id = ?3",
                            params![pos, instant, field_id],
                        )
                        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                    if updated == 0 {
                        return Err(RuntimeErrorPayload::new(
                            "not-found",
                            format!("Field {field_id}"),
                        ));
                    }
                    any_changed = true;
                    affected_fields.push(field_id.to_string());
                }
                "set-table-position" => {
                    let table_id =
                        leaf.get("tableId")
                            .and_then(JsonValue::as_str)
                            .ok_or_else(|| {
                                RuntimeErrorPayload::new("invalid-request", "missing tableId")
                            })?;
                    let pos: i64 = leaf
                        .get("position")
                        .and_then(JsonValue::as_str)
                        .and_then(|s| s.parse().ok())
                        .ok_or_else(|| {
                            RuntimeErrorPayload::new("invalid-request", "invalid position")
                        })?;
                    let tx = &self.conn;
                    let updated = tx
                        .execute(
                            "UPDATE eidos__tables SET position = ?1, updated_at = ?2 WHERE id = ?3",
                            params![pos, instant, table_id],
                        )
                        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                    if updated == 0 {
                        return Err(RuntimeErrorPayload::new(
                            "not-found",
                            format!("Table {table_id}"),
                        ));
                    }
                    any_changed = true;
                    affected_tables.push(table_id.to_string());
                }
                "set-record-label" => {
                    let table_id =
                        leaf.get("tableId")
                            .and_then(JsonValue::as_str)
                            .ok_or_else(|| {
                                RuntimeErrorPayload::new("invalid-request", "missing tableId")
                            })?;
                    let field_id =
                        leaf.get("fieldId")
                            .and_then(JsonValue::as_str)
                            .ok_or_else(|| {
                                RuntimeErrorPayload::new("invalid-request", "missing fieldId")
                            })?;
                    {
                        let schema = self.ensure_schema()?;
                        let ok = schema
                            .fields
                            .iter()
                            .any(|f| f.id == field_id && f.table_id == table_id);
                        if !ok {
                            return Err(RuntimeErrorPayload::new(
                                "not-found",
                                format!("Field {field_id} not found in table {table_id}"),
                            ));
                        }
                    }
                    let tx = &self.conn;
                    tx.execute(
                        "UPDATE eidos__tables SET label_field_id = ?1, updated_at = ?2 WHERE id = ?3",
                        params![field_id, instant, table_id],
                    )
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                    any_changed = true;
                    affected_tables.push(table_id.to_string());
                    affected_fields.push(field_id.to_string());
                }
                "set-lookup" => {
                    let field_id =
                        leaf.get("fieldId")
                            .and_then(JsonValue::as_str)
                            .ok_or_else(|| {
                                RuntimeErrorPayload::new("invalid-request", "missing fieldId")
                            })?;
                    let def = leaf.get("definition").ok_or_else(|| {
                        RuntimeErrorPayload::new("invalid-request", "missing definition")
                    })?;
                    let rel_id = def
                        .get("relationFieldId")
                        .and_then(JsonValue::as_str)
                        .ok_or_else(|| {
                            RuntimeErrorPayload::new("invalid-request", "missing relationFieldId")
                        })?;
                    let target_id = def
                        .get("targetFieldId")
                        .and_then(JsonValue::as_str)
                        .ok_or_else(|| {
                            RuntimeErrorPayload::new("invalid-request", "missing targetFieldId")
                        })?;
                    let agg = def
                        .get("aggregate")
                        .and_then(JsonValue::as_str)
                        .unwrap_or("values");
                    let distinct = if def
                        .get("distinctValues")
                        .and_then(JsonValue::as_bool)
                        .unwrap_or(false)
                    {
                        1
                    } else {
                        0
                    };
                    let tx = &self.conn;
                    tx.execute(
                        "UPDATE eidos__lookup_fields SET relation_field_id = ?1, target_field_id = ?2, aggregate = ?3, distinct_values = ?4 WHERE field_id = ?5",
                        params![rel_id, target_id, agg, distinct, field_id],
                    )
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                    any_changed = true;
                    affected_fields.push(field_id.to_string());
                }
                "set-relation" => {
                    let field_id =
                        leaf.get("fieldId")
                            .and_then(JsonValue::as_str)
                            .ok_or_else(|| {
                                RuntimeErrorPayload::new("invalid-request", "missing fieldId")
                            })?;
                    let def = leaf.get("definition").ok_or_else(|| {
                        RuntimeErrorPayload::new("invalid-request", "missing definition")
                    })?;
                    let direction = def
                        .get("direction")
                        .and_then(JsonValue::as_str)
                        .unwrap_or("forward");
                    let cardinality = def
                        .get("cardinality")
                        .and_then(JsonValue::as_str)
                        .unwrap_or("many");
                    let on_delete = if direction == "forward" {
                        Some(
                            def.get("onDelete")
                                .and_then(JsonValue::as_str)
                                .unwrap_or("restrict"),
                        )
                    } else {
                        None
                    };
                    let tx = &self.conn;
                    tx.execute(
                        "UPDATE eidos__relation_fields SET cardinality = ?1, on_delete = ?2 WHERE field_id = ?3",
                        params![cardinality, on_delete, field_id],
                    )
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                    any_changed = true;
                    affected_fields.push(field_id.to_string());
                }
                "rename-option" => {
                    let (table_id, field_id) = self.apply_rename_option(&leaf, &instant)?;
                    any_changed = true;
                    affected_tables.push(table_id);
                    affected_fields.push(field_id);
                }
                "convert-field" => {
                    let field_id = leaf
                        .get("fieldId")
                        .and_then(JsonValue::as_str)
                        .ok_or_else(|| {
                            RuntimeErrorPayload::new(
                                "invalid-request",
                                "convert-field requires fieldId",
                            )
                        })?
                        .to_string();
                    let (table, table_fields, field) = {
                        let schema = self.ensure_schema()?;
                        let field = schema
                            .fields
                            .iter()
                            .find(|f| f.id == field_id)
                            .cloned()
                            .ok_or_else(|| {
                                RuntimeErrorPayload::new("not-found", format!("Field {field_id}"))
                            })?;
                        let table = schema
                            .tables
                            .iter()
                            .find(|t| t.id == field.table_id)
                            .cloned()
                            .ok_or_else(|| {
                                RuntimeErrorPayload::new(
                                    "not-found",
                                    format!("Table {}", field.table_id),
                                )
                            })?;
                        let table_fields: Vec<FieldMeta> = schema
                            .fields
                            .iter()
                            .filter(|f| f.table_id == table.id)
                            .cloned()
                            .collect();
                        (table, table_fields, field)
                    };
                    let conv = match conversions.get(&field_id) {
                        Some(c) => c.clone(),
                        None => preflight_field_conversion(&self.conn, &table, &field, &leaf)?,
                    };
                    apply_field_conversion(
                        &self.conn,
                        &table,
                        &table_fields,
                        &field,
                        &conv,
                        req.confirm_lossy.unwrap_or(false),
                        &instant,
                    )?;
                    self.invalidate_cache();
                    any_changed = true;
                    affected_tables.push(table.id);
                    affected_fields.push(field.id);
                }
                _ => {
                    return Err(RuntimeErrorPayload::new(
                        "unsupported",
                        format!("Schema leaf change not yet supported in Rust runtime: {kind}"),
                    ));
                }
            }
        }

        self.invalidate_cache();
        let revision = if any_changed {
            let fields = load_fields(&self.conn).map_err(RuntimeErrorPayload::from_core)?;
            let mut has_defaults = false;
            for field in fields {
                let settings: JsonValue = serde_json::from_str(&field.settings_json)
                    .map_err(|e| RuntimeErrorPayload::new("corrupt-file", e.to_string()))?;
                if settings["defaultValue"].is_null() {
                    continue;
                }
                if settings["defaultValue"] != "now"
                    || !matches!(field.field_type, FieldType::Date | FieldType::Datetime)
                    || field.system_role.is_some()
                    || field.physical_name.is_none()
                    || settings["isSystem"] == true
                    || settings["readOnly"] == true
                    || settings["writable"] == false
                {
                    return Err(RuntimeErrorPayload::new(
                        "invalid-request",
                        "Invalid temporal default",
                    ));
                }
                has_defaults = true;
            }
            if has_defaults {
                self.conn.execute("INSERT INTO eidos__features(name,version,required,config_json) VALUES('eidos:temporal-defaults','1',1,'{}') ON CONFLICT(name) DO NOTHING",[]).map_err(|e|RuntimeErrorPayload::new("adapter-error",e.to_string()))?;
            }
            ensure_foreign_keys(&self.conn).map_err(RuntimeErrorPayload::from_core)?;
            ddl::increment_revision(&self.conn, &instant)
                .map_err(RuntimeErrorPayload::from_core)?
                .to_string()
        } else {
            req.expected_revision.clone()
        };
        Ok(SchemaMutationResult {
            file_id,
            revision,
            changed: any_changed,
            created_objects,
            affected_table_ids: affected_tables,
            affected_field_ids: affected_fields,
        })
    }

    fn apply_create_virtual_field(
        &mut self,
        leaf: &JsonValue,
        instant: &str,
    ) -> RuntimeResult<(String, String, String)> {
        let table_id = leaf
            .get("tableId")
            .and_then(JsonValue::as_str)
            .ok_or_else(|| RuntimeErrorPayload::new("invalid-request", "missing tableId"))?
            .to_string();
        let field_obj = leaf
            .get("field")
            .ok_or_else(|| RuntimeErrorPayload::new("invalid-request", "missing field"))?;
        let client_key = field_obj
            .get("clientKey")
            .and_then(JsonValue::as_str)
            .unwrap_or("")
            .to_string();
        let name = field_obj
            .get("name")
            .and_then(JsonValue::as_str)
            .ok_or_else(|| RuntimeErrorPayload::new("invalid-request", "missing field name"))?;
        let kind = field_obj
            .get("kind")
            .and_then(JsonValue::as_str)
            .unwrap_or("formula");
        let position: i64 = field_obj
            .get("position")
            .and_then(JsonValue::as_str)
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let settings = field_obj
            .get("settings")
            .cloned()
            .unwrap_or_else(|| json!({}));
        let settings_json = jcs::to_jcs(&settings).map_err(RuntimeErrorPayload::from_core)?;
        let def = field_obj
            .get("definition")
            .ok_or_else(|| RuntimeErrorPayload::new("invalid-request", "missing definition"))?;

        let field_id = generate_uuidv7();
        let tx = &self.conn;
        tx.execute(
            "INSERT INTO eidos__fields (id, table_id, name, physical_name, type, system_role, nullable, position, settings_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, NULL, ?4, NULL, 1, ?5, ?6, ?7, ?7)",
            params![field_id, table_id, name, kind, position, settings_json, instant],
        )
        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;

        if kind == "formula" {
            let src = def
                .get("sourceText")
                .and_then(JsonValue::as_str)
                .ok_or_else(|| RuntimeErrorPayload::new("invalid-request", "missing sourceText"))?;
            let rt = def
                .get("resultType")
                .and_then(JsonValue::as_str)
                .unwrap_or("text");
            tx.execute(
                "INSERT INTO eidos__formula_fields (field_id, source_text, result_type) VALUES (?1, ?2, ?3)",
                params![field_id, src, rt],
            )
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
        } else if kind == "lookup" {
            let rel_id = def
                .get("relationFieldId")
                .and_then(JsonValue::as_str)
                .ok_or_else(|| {
                    RuntimeErrorPayload::new("invalid-request", "missing relationFieldId")
                })?;
            let target_id = def
                .get("targetFieldId")
                .and_then(JsonValue::as_str)
                .ok_or_else(|| {
                    RuntimeErrorPayload::new("invalid-request", "missing targetFieldId")
                })?;
            let agg = def
                .get("aggregate")
                .and_then(JsonValue::as_str)
                .unwrap_or("values");
            let distinct = if def
                .get("distinctValues")
                .and_then(JsonValue::as_bool)
                .unwrap_or(false)
            {
                1
            } else {
                0
            };
            tx.execute(
                "INSERT INTO eidos__lookup_fields (field_id, relation_field_id, target_field_id, aggregate, distinct_values) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![field_id, rel_id, target_id, agg, distinct],
            )
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
        } else if kind == "relation" {
            let target_table_id = def
                .get("targetTableId")
                .and_then(JsonValue::as_str)
                .ok_or_else(|| {
                    RuntimeErrorPayload::new("invalid-request", "missing targetTableId")
                })?;
            let inverse_of_field_id = def
                .get("inverseOfFieldId")
                .and_then(JsonValue::as_str)
                .ok_or_else(|| {
                    RuntimeErrorPayload::new("invalid-request", "missing inverseOfFieldId")
                })?;
            tx.execute(
                "INSERT INTO eidos__relation_fields (field_id, direction, target_table_id, cardinality, inverse_of_field_id, on_delete)
                 VALUES (?1, 'inverse', ?2, 'many', ?3, NULL)",
                params![field_id, target_table_id, inverse_of_field_id],
            )
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
        }

        Ok((field_id, table_id, client_key))
    }

    fn apply_rename_option(
        &mut self,
        leaf: &JsonValue,
        instant: &str,
    ) -> RuntimeResult<(String, String)> {
        let field_id = leaf
            .get("fieldId")
            .and_then(JsonValue::as_str)
            .ok_or_else(|| RuntimeErrorPayload::new("invalid-request", "missing fieldId"))?
            .to_string();
        let from = leaf
            .get("from")
            .and_then(JsonValue::as_str)
            .ok_or_else(|| RuntimeErrorPayload::new("invalid-request", "missing from"))?;
        let to = leaf
            .get("to")
            .and_then(JsonValue::as_str)
            .ok_or_else(|| RuntimeErrorPayload::new("invalid-request", "missing to"))?;
        let collision = leaf
            .get("collision")
            .and_then(JsonValue::as_str)
            .unwrap_or("reject");
        if to.is_empty() {
            return Err(RuntimeErrorPayload::new(
                "invalid-request",
                "Target option name cannot be empty",
            ));
        }

        let (table, field) = {
            let schema = self.ensure_schema()?;
            let field = schema
                .fields
                .iter()
                .find(|f| f.id == field_id)
                .cloned()
                .ok_or_else(|| {
                    RuntimeErrorPayload::new("not-found", format!("Field {field_id}"))
                })?;
            let table = schema
                .tables
                .iter()
                .find(|t| t.id == field.table_id)
                .cloned()
                .ok_or_else(|| {
                    RuntimeErrorPayload::new("not-found", format!("Table {}", field.table_id))
                })?;
            (table, field)
        };

        if !matches!(field.field_type, FieldType::Select | FieldType::MultiSelect) {
            return Err(RuntimeErrorPayload::new(
                "invalid-request",
                "rename-option is only valid for select and multi-select fields",
            ));
        }
        let phys = field.physical_name.as_deref().ok_or_else(|| {
            RuntimeErrorPayload::new("corrupt-file", "Select field missing physical column")
        })?;

        let mut settings: JsonValue =
            serde_json::from_str(&field.settings_json).unwrap_or_else(|_| json!({}));
        let options = settings
            .get_mut("options")
            .and_then(JsonValue::as_array_mut)
            .ok_or_else(|| RuntimeErrorPayload::new("not-found", "Field has no options"))?;

        let from_idx = options
            .iter()
            .position(|o| o.get("name").and_then(JsonValue::as_str) == Some(from))
            .ok_or_else(|| {
                RuntimeErrorPayload::new("not-found", format!("Option not found: {from}"))
            })?;
        let to_exists = to != from
            && options
                .iter()
                .any(|o| o.get("name").and_then(JsonValue::as_str) == Some(to));

        if to_exists {
            match collision {
                "merge" => {
                    options.remove(from_idx);
                }
                "reject" => {
                    return Err(RuntimeErrorPayload::new(
                        "conflict",
                        format!("Option already exists: {to}"),
                    ));
                }
                other => {
                    return Err(RuntimeErrorPayload::new(
                        "invalid-request",
                        format!("Invalid collision mode: {other}"),
                    ));
                }
            }
        } else if let Some(obj) = options[from_idx].as_object_mut() {
            obj.insert("name".into(), JsonValue::String(to.to_string()));
        }

        let settings_json = jcs::to_jcs(&settings).map_err(RuntimeErrorPayload::from_core)?;
        let tbl_sql =
            quote_identifier(&table.physical_name).map_err(RuntimeErrorPayload::from_core)?;
        let col_sql = quote_identifier(phys).map_err(RuntimeErrorPayload::from_core)?;

        let tx = &self.conn;

        if field.field_type == FieldType::Select {
            tx.execute(
                &format!(
                    "UPDATE {tbl_sql} SET {col_sql} = ?1, \"_updated_at\" = ?2 WHERE {col_sql} = ?3"
                ),
                params![to, instant, from],
            )
            .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
        } else {
            // multi-select: rewrite JSON arrays and deduplicate preserving order
            let mut updates: Vec<(String, String)> = Vec::new();
            {
                let mut stmt = tx
                    .prepare(&format!(
                        "SELECT \"_id\", {col_sql} FROM {tbl_sql} WHERE {col_sql} IS NOT NULL"
                    ))
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                let mut qrows = stmt
                    .query([])
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
                while let Some(r) = qrows
                    .next()
                    .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?
                {
                    let id: String = r.get(0).unwrap_or_default();
                    let raw: String = r.get(1).unwrap_or_default();
                    if let Ok(arr) = serde_json::from_str::<Vec<String>>(&raw)
                        && arr.iter().any(|s| s == from)
                    {
                        let mut deduped: Vec<JsonValue> = Vec::with_capacity(arr.len());
                        let mut seen: HashSet<String> = HashSet::new();
                        for item in arr {
                            let mapped = if item == from { to.to_string() } else { item };
                            if seen.insert(mapped.clone()) {
                                deduped.push(JsonValue::String(mapped));
                            }
                        }
                        let encoded = jcs::to_jcs(&JsonValue::Array(deduped))
                            .map_err(RuntimeErrorPayload::from_core)?;
                        updates.push((id, encoded));
                    }
                }
            }
            for (id, encoded) in updates {
                tx.execute(
                    &format!("UPDATE {tbl_sql} SET {col_sql} = ?1, \"_updated_at\" = ?2 WHERE \"_id\" = ?3"),
                    params![encoded, instant, id],
                )
                .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;
            }
        }

        tx.execute(
            "UPDATE eidos__fields SET settings_json = ?1, updated_at = ?2 WHERE id = ?3",
            params![settings_json, instant, field_id],
        )
        .map_err(|e| RuntimeErrorPayload::new("adapter-error", e.to_string()))?;

        Ok((table.id, field_id))
    }

    pub fn validate(&mut self, req: &ValidationRequest) -> RuntimeResult<ValidationReportWire> {
        self.ensure_open()?;
        let meta = load_file_meta(&self.conn).ok();
        let report = core_validate(&self.conn, req.level, req.diagnostics_limit)
            .map_err(RuntimeErrorPayload::from_core)?;
        let diagnostics = report
            .diagnostics
            .into_iter()
            .map(|d| RuntimeDiagnostic {
                code: d.code,
                severity: match d.severity {
                    Severity::Fatal => "fatal",
                    Severity::Error => "error",
                    Severity::Warning => "warning",
                    Severity::Info => "info",
                }
                .into(),
                message: Some(d.message),
                path: Some(d.path),
                table_id: None,
                field_id: None,
                row_id: None,
                view_id: None,
            })
            .collect();
        Ok(ValidationReportWire {
            file_id: meta.as_ref().map(|m| m.file_id.clone()),
            revision: meta.as_ref().map(|m| m.revision.to_string()),
            level: req.level,
            valid: report.valid,
            diagnostics,
            truncated: report.truncated,
        })
    }

    pub fn export_csv(
        &mut self,
        req: &CsvExportRequest,
    ) -> RuntimeResult<(String, String, String, Vec<u8>)> {
        let mut csv = String::new();
        let mut cursor = None;
        let mut wrote_header = false;
        let mut file_id;
        let mut revision;

        loop {
            let page = self.query_rows(&QueryRowsRequest {
                calendar: req.calendar.clone(),
                reference_instant: req.reference_instant.clone(),
                table_id: req.table_id.clone(),
                query: req.query.clone(),
                projection: ProjectionSpec {
                    fields: req.fields.clone(),
                    resolve_relations: Vec::new(),
                },
                limit: 1_000,
                offset: None,
                cursor: cursor.clone(),
                direction: None,
            })?;
            file_id = page.file_id;
            revision = page.revision;
            if req.include_header && !wrote_header {
                let header: Vec<String> = page
                    .columns
                    .iter()
                    .map(|c| escape_csv_cell(&c.name))
                    .collect();
                csv.push_str(&header.join(","));
                csv.push_str("\r\n");
                wrote_header = true;
            }
            for row in &page.rows {
                let cells: Vec<String> = row
                    .values
                    .iter()
                    .map(|v| escape_csv_cell(&logical_value_to_csv(v)))
                    .collect();
                csv.push_str(&cells.join(","));
                csv.push_str("\r\n");
            }
            match page.next_cursor {
                Some(next) => cursor = Some(next),
                None => break,
            }
        }
        Ok((file_id, req.table_id.clone(), revision, csv.into_bytes()))
    }

    pub fn import_csv(&mut self, req: &CsvImportRequest) -> RuntimeResult<CsvImportResult> {
        self.ensure_writable()?;
        if req.csv_utf8.len() > self.limits.csv_bytes_max
            || req.columns.len() > self.limits.projection_fields_max
        {
            return Err(RuntimeErrorPayload::new(
                "resource-limit",
                "CSV exceeds Runtime limits",
            ));
        }
        if req.columns.is_empty() {
            return Err(RuntimeErrorPayload::new(
                "invalid-request",
                "CSV columns are required",
            ));
        }
        let revision = self.ensure_schema()?.meta.revision.to_string();
        if revision != req.expected_revision {
            return Err(
                RuntimeErrorPayload::new("stale-revision", "File revision has changed")
                    .with_current_revision(revision),
            );
        }
        let parsed = parse_csv(&req.csv_utf8);
        if parsed.is_empty() || req.csv_utf8.trim().is_empty() {
            return Err(RuntimeErrorPayload::new(
                "invalid-value",
                "CSV file is empty",
            ));
        }
        let width = parsed[0].len();
        let data_rows = if req.has_header && !parsed.is_empty() {
            &parsed[1..]
        } else {
            &parsed[..]
        };

        let table_fields: HashMap<String, FieldMeta> = self
            .ensure_schema()?
            .fields
            .iter()
            .filter(|f| f.table_id == req.table_id)
            .map(|f| (f.id.clone(), f.clone()))
            .collect();

        let mut changes = Vec::with_capacity(data_rows.len());
        let mut indexes = HashSet::new();
        let mut ids = HashSet::new();
        for column in &req.columns {
            if !indexes.insert(column.csv_index) || !ids.insert(&column.field_id) {
                return Err(RuntimeErrorPayload::new(
                    "invalid-request",
                    "CSV column mappings must be unique",
                ));
            }
            let field = table_fields.get(&column.field_id).ok_or_else(|| {
                RuntimeErrorPayload::new("not-found", "CSV destination Field not found")
            })?;
            let settings: JsonValue = serde_json::from_str(&field.settings_json)
                .map_err(|e| RuntimeErrorPayload::new("corrupt-file", e.to_string()))?;
            if field.system_role.is_some()
                || field.physical_name.is_none()
                || settings["readOnly"] == true
                || settings["writable"] == false
                || settings["isSystem"] == true
            {
                return Err(RuntimeErrorPayload::new(
                    "forbidden",
                    "CSV destination Field is read-only",
                ));
            }
            if !matches!(
                field.field_type,
                FieldType::Text
                    | FieldType::Number
                    | FieldType::Integer
                    | FieldType::Checkbox
                    | FieldType::Date
                    | FieldType::Datetime
                    | FieldType::Url
            ) {
                return Err(RuntimeErrorPayload::new(
                    "unsupported",
                    "Unsupported CSV destination Field type",
                ));
            }
        }
        for (idx, row) in data_rows
            .iter()
            .filter(|row| row.len() == width)
            .enumerate()
        {
            let mut map = Map::new();
            for col in &req.columns {
                let raw = row.get(col.csv_index).map(String::as_str).unwrap_or("");
                let field = table_fields.get(&col.field_id);
                let trimmed = raw.trim();
                let val = if trimmed.is_empty() {
                    JsonValue::Null
                } else {
                    match field.map(|f| f.field_type) {
                        Some(FieldType::Number) => trimmed
                            .parse::<f64>()
                            .ok()
                            .filter(|v| v.is_finite())
                            .map(|v| json!(v))
                            .ok_or_else(|| {
                                RuntimeErrorPayload::new(
                                    "invalid-value",
                                    "CSV cell is not a finite number",
                                )
                            })?,
                        Some(FieldType::Integer | FieldType::Date) => json!(trimmed),
                        Some(FieldType::Datetime) => json!(format!(
                            "{:.3}",
                            trimmed.parse::<jiff::Timestamp>().map_err(|_| {
                                RuntimeErrorPayload::new("invalid-value", "Invalid CSV timestamp")
                            })?
                        )),
                        Some(FieldType::Checkbox) => {
                            json!(trimmed.to_ascii_lowercase().parse::<bool>().map_err(|_| {
                                RuntimeErrorPayload::new(
                                    "invalid-value",
                                    "CSV checkbox must be true or false",
                                )
                            })?)
                        }
                        _ => JsonValue::String(raw.to_string()),
                    }
                };
                map.insert(col.field_id.clone(), val);
            }
            changes.push(RowChange::Create {
                client_key: (idx + usize::from(req.has_header)).to_string(),
                values: map,
            });
        }

        if changes.is_empty() {
            let meta = &self.ensure_schema()?.meta;
            return Ok(CsvImportResult {
                file_id: meta.file_id.clone(),
                table_id: req.table_id.clone(),
                revision: meta.revision.to_string(),
                changed: false,
                created_rows: vec![],
            });
        }
        let rows = RowMutationRequest {
            creation_query: None,
            calendar: None,
            creation_context: None,
            table_id: req.table_id.clone(),
            expected_revision: req.expected_revision.clone(),
            returning: None,
            changes,
        };
        let (res, _) =
            self.transaction("BEGIN IMMEDIATE", |svc| svc.apply_rows(&rows, false, false))?;

        let created_rows = res
            .created
            .into_iter()
            .map(|CreatedRow { client_key, row_id }| CreatedCsvRow {
                record_index: client_key.parse().unwrap_or(0),
                row_id,
            })
            .collect();

        Ok(CsvImportResult {
            file_id: res.file_id,
            table_id: req.table_id.clone(),
            revision: res.revision,
            changed: res.changed,
            created_rows,
        })
    }

    /// JSON wire dispatch matching `RuntimeClient` method names 1-to-1.
    pub fn invoke_wire_json(&mut self, method: &str, request_json: &str) -> RuntimeResult<String> {
        fn ser<T: serde::Serialize>(method: &str, val: &T) -> RuntimeResult<String> {
            serde_json::to_string(val)
                .map_err(|e| RuntimeErrorPayload::new("fatal", format!("Serialize {method}: {e}")))
        }
        let parse_err = |e: serde_json::Error| {
            RuntimeErrorPayload::new("invalid-request", format!("Invalid {method} request: {e}"))
        };

        match method {
            "importCsv" => ser(
                method,
                &self.import_csv(&serde_json::from_str(request_json).map_err(parse_err)?)?,
            ),
            "exportCsv" => {
                let (file_id, table_id, revision, bytes) =
                    self.export_csv(&serde_json::from_str(request_json).map_err(parse_err)?)?;
                let csv = String::from_utf8(bytes)
                    .map_err(|e| RuntimeErrorPayload::new("invalid-value", e.to_string()))?;
                ser(
                    method,
                    &json!({"fileId":file_id,"tableId":table_id,"revision":revision,"csv":csv}),
                )
            }
            "negotiate" => ser(
                method,
                &self.negotiate(&serde_json::from_str(request_json).map_err(parse_err)?)?,
            ),
            "getSnapshot" => ser(
                method,
                &self.get_snapshot(&serde_json::from_str(request_json).map_err(parse_err)?)?,
            ),
            "getSchemaPage" => ser(
                method,
                &self.get_schema_page(&serde_json::from_str(request_json).map_err(parse_err)?)?,
            ),
            "queryRows" => ser(
                method,
                &self.query_rows(&serde_json::from_str(request_json).map_err(parse_err)?)?,
            ),
            "queryRowPages" => ser(
                method,
                &self.query_row_pages(&serde_json::from_str(request_json).map_err(parse_err)?)?,
            ),
            "getRowsById" => ser(
                method,
                &self.get_rows_by_id(&serde_json::from_str(request_json).map_err(parse_err)?)?,
            ),
            "getRecordNeighbors" => ser(
                method,
                &self.get_record_neighbors(
                    &serde_json::from_str(request_json).map_err(parse_err)?,
                )?,
            ),
            "getRowIndex" => ser(
                method,
                &self.get_row_index(&serde_json::from_str(request_json).map_err(parse_err)?)?,
            ),
            "aggregate" => ser(
                method,
                &self.aggregate(&serde_json::from_str(request_json).map_err(parse_err)?)?,
            ),
            "groupRows" => ser(
                method,
                &self.group_rows(&serde_json::from_str(request_json).map_err(parse_err)?)?,
            ),
            "queryGroupRows" => ser(
                method,
                &self.query_group_rows(&serde_json::from_str(request_json).map_err(parse_err)?)?,
            ),
            "previewFormula" => ser(
                method,
                &self.preview_formula(&serde_json::from_str(request_json).map_err(parse_err)?)?,
            ),
            "mutateRows" => ser(
                method,
                &self.mutate_rows(&serde_json::from_str(request_json).map_err(parse_err)?)?,
            ),
            "mutateRowsWithUndo" => ser(
                method,
                &self.mutate_rows_with_undo(
                    &serde_json::from_str(request_json).map_err(parse_err)?,
                )?,
            ),
            "revertMutation" | "revertRowDeletion" => ser(
                method,
                &self.revert_mutation(&serde_json::from_str(request_json).map_err(parse_err)?)?,
            ),
            "mutateView" => ser(
                method,
                &self.mutate_view(&serde_json::from_str(request_json).map_err(parse_err)?)?,
            ),
            "preflightSchema" => ser(
                method,
                &self.preflight_schema(&serde_json::from_str(request_json).map_err(parse_err)?)?,
            ),
            "getSchemaPlanDependencies" => ser(
                method,
                &self.get_schema_plan_dependencies(
                    &serde_json::from_str(request_json).map_err(parse_err)?,
                )?,
            ),
            "mutateSchema" => ser(
                method,
                &self.mutate_schema(&serde_json::from_str(request_json).map_err(parse_err)?)?,
            ),
            "validate" => ser(
                method,
                &self.validate(&serde_json::from_str(request_json).map_err(parse_err)?)?,
            ),
            "cancel" => Ok("null".into()),
            "close" => {
                self.close()?;
                Ok("null".into())
            }
            other => Err(RuntimeErrorPayload::new(
                "unsupported",
                format!("Unknown RuntimeClient method: {other}"),
            )),
        }
    }
}

#[allow(dead_code)]
fn _check_uuid(id: &str) -> bool {
    is_valid_uuidv7(id)
}
