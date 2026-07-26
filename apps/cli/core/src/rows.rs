//! Row reads and mutations against user tables.
//!
//! `mutate_rows` implements the Eidos Runtime 1.0 §11 contract:
//!
//! - `expectedRevision` is a canonical non-negative int64 decimal string
//!   compared with `eidos__meta.revision` INSIDE the write transaction; a
//!   mismatch fails with `stale-revision` carrying the current revision.
//! - No-op detection: rewriting an equal canonical value is not an actual
//!   change. A mutation whose canonical effects are all no-ops commits no
//!   revision increment and no timestamp changes (`changed = false`).
//! - A real change uses ONE bound canonical instant for every affected
//!   `_updated_at` and `eidos__meta.updated_at`, and increments the revision
//!   exactly once via `ddl::increment_revision` immediately before commit.
//! - Deletes apply the §10.4 Relation policies: the complete per-table
//!   Row-ID delete set is preflighted before any physical delete
//!   (`relation::preflight_delete_policy`); `restrict` aborts on surviving
//!   incoming references, `detach` rewrites surviving source arrays in the
//!   same transaction (same bound instant), `preserve` leaves them.
//! - Values pass through `values::coerce_value`; Row IDs are fresh UUIDv7
//!   (`id::generate_uuidv7`); `_id` changes are rejected as system-field
//!   writes (`invalid-request`).

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::ddl;
use crate::error::{EidosError, Result};
use crate::id::{generate_uuidv7, is_valid_uuidv7};
use crate::model::{
    FieldMeta, FieldType, RelationCardinality, RelationDirection, RelationFieldMeta, TableMeta,
    load_fields, load_file_meta, load_relation_fields, load_tables,
};
use crate::naming::quote_identifier;
use crate::query::{ReadRowsOptions, RowQuery};
use crate::relation;
use crate::time::now_instant;
use crate::values;

/// One logical row as transported: system columns plus per-field values
/// keyed by stable Field ID, using the Runtime logical-value encoding.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Row {
    pub id: String,
    pub created_at: String,
    pub updated_at: String,
    pub values: serde_json::Map<String, JsonValue>,
}

/// `RowChange` from Eidos Runtime 1.0 §11.2.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all_fields = "camelCase")]
pub enum RowChange {
    #[serde(rename = "create")]
    Create {
        client_key: String,
        values: serde_json::Map<String, JsonValue>,
    },
    #[serde(rename = "update")]
    Update {
        row_id: String,
        values: serde_json::Map<String, JsonValue>,
    },
    #[serde(rename = "delete")]
    Delete { row_id: String },
}

/// `RowMutation` from Eidos Runtime 1.0 §11.2 (the `returning` projection
/// and undo extension are Runtime-layer concerns, not implemented here).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowMutation {
    pub table_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expected_revision: Option<String>,
    pub changes: Vec<RowChange>,
}

/// One actually changed row, identified by Table ID and Row ID.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AffectedRow {
    pub table_id: String,
    pub row_id: String,
}

/// Public mutation result (subset of Runtime `MutationResult`; revision is
/// the canonical decimal string).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowMutationResult {
    pub file_id: String,
    pub revision: String,
    pub changed: bool,
    pub created: Vec<CreatedRow>,
    pub affected_rows: Vec<AffectedRow>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedRow {
    pub client_key: String,
    pub row_id: String,
}

/// Reads rows of `table_id` matching `query`, returning values keyed by
/// stable Field ID. The CLI's friendlier query command exposes display names;
/// this lower-level API preserves the Runtime identity contract.
pub fn read_rows(conn: &Connection, table_id: &str, query: Option<&RowQuery>) -> Result<Vec<Row>> {
    let tables = load_tables(conn)?;
    let table = tables
        .iter()
        .find(|table| table.id == table_id)
        .ok_or_else(|| EidosError::NotFound(format!("table {table_id}")))?;
    let fields: Vec<FieldMeta> = load_fields(conn)?
        .into_iter()
        .filter(|field| field.table_id == table_id)
        .collect();
    let page = crate::query::read_rows(
        conn,
        table,
        &fields,
        query.unwrap_or(&RowQuery::default()),
        &ReadRowsOptions::default(),
    )?;
    let by_name: HashMap<&str, &FieldMeta> = fields
        .iter()
        .map(|field| (field.name.as_str(), field))
        .collect();
    page.rows
        .into_iter()
        .map(|mut object| {
            let id = object
                .remove("_id")
                .and_then(|value| value.as_str().map(ToOwned::to_owned))
                .ok_or_else(|| EidosError::InvalidSchema("row has no _id value".into()))?;
            let created_at = object
                .remove("_created_at")
                .and_then(|value| value.as_str().map(ToOwned::to_owned))
                .ok_or_else(|| EidosError::InvalidSchema("row has no _created_at value".into()))?;
            let updated_at = object
                .remove("_updated_at")
                .and_then(|value| value.as_str().map(ToOwned::to_owned))
                .ok_or_else(|| EidosError::InvalidSchema("row has no _updated_at value".into()))?;
            let mut values = serde_json::Map::new();
            for (name, value) in object {
                let field = by_name.get(name.as_str()).ok_or_else(|| {
                    EidosError::InvalidSchema(format!("query returned unknown field name {name:?}"))
                })?;
                values.insert(field.id.clone(), value);
            }
            Ok(Row {
                id,
                created_at,
                updated_at,
                values,
            })
        })
        .collect()
}

/// Parses a canonical non-negative int64 decimal string (the wire form of
/// `expectedRevision` / `revision`).
fn parse_revision(value: &str) -> Result<i64> {
    let canonical = !value.is_empty()
        && value.bytes().all(|b| b.is_ascii_digit())
        && (value.len() == 1 || !value.starts_with('0'));
    if !canonical {
        return Err(EidosError::InvalidValue(format!(
            "revision {value:?} is not a canonical non-negative int64 decimal string"
        )));
    }
    value.parse::<i64>().map_err(|_| {
        EidosError::InvalidValue(format!("revision {value:?} exceeds the signed int64 range"))
    })
}

/// Reads the file meta inside the write transaction and enforces
/// `expected_revision` (§11.3 step 3). Returns `(file_id, revision)`.
fn check_revision(conn: &Connection, expected_revision: Option<&str>) -> Result<(String, i64)> {
    let meta = load_file_meta(conn)?;
    if let Some(expected) = expected_revision
        && parse_revision(expected)? != meta.revision
    {
        return Err(EidosError::StaleRevision {
            current_revision: meta.revision.to_string(),
        });
    }
    Ok((meta.file_id, meta.revision))
}

/// Enforces one expected revision without starting a transaction. Call this
/// inside an existing write transaction before evaluating mutation
/// preconditions so stale requests fail before any request-dependent lookup.
pub fn ensure_revision(conn: &Connection, expected_revision: &str) -> Result<()> {
    check_revision(conn, Some(expected_revision)).map(|_| ())
}

/// Per-mutation view of one table's schema.
struct TableContext {
    table: TableMeta,
    /// Non-system, user-writable and virtual fields of the table.
    fields: Vec<FieldMeta>,
    relations: HashMap<String, RelationFieldMeta>,
}

impl TableContext {
    fn load(
        table_id: &str,
        tables: &[TableMeta],
        fields: &[FieldMeta],
        relations: &[RelationFieldMeta],
    ) -> Result<Self> {
        let table = tables
            .iter()
            .find(|t| t.id == table_id)
            .ok_or_else(|| EidosError::NotFound(format!("table {table_id}")))?
            .clone();
        Ok(TableContext {
            table,
            fields: fields
                .iter()
                .filter(|f| f.table_id == table_id)
                .cloned()
                .collect(),
            relations: relations
                .iter()
                .filter(|r| {
                    fields
                        .iter()
                        .any(|f| f.table_id == table_id && f.id == r.field_id)
                })
                .map(|r| (r.field_id.clone(), r.clone()))
                .collect(),
        })
    }

    /// Resolves a sparse `values` key (Field ID or display name) to a
    /// writable stored user field, rejecting unknown, system, and virtual
    /// (Formula/Lookup/inverse Relation) keys (§11.2).
    fn resolve_writable(&self, key: &str) -> Result<&FieldMeta> {
        let field = self
            .fields
            .iter()
            .find(|f| f.id == key || f.name == key)
            .ok_or_else(|| {
                EidosError::InvalidRequest(format!(
                    "unknown field {key:?} in table {:?} ({})",
                    self.table.name, self.table.id
                ))
            })?;
        if field.system_role.is_some() {
            return Err(EidosError::InvalidRequest(format!(
                "field {key:?} is a system field and cannot be written"
            )));
        }
        match field.field_type {
            FieldType::Formula | FieldType::Lookup => {
                return Err(EidosError::InvalidRequest(format!(
                    "field {:?} ({}) is virtual and cannot be written",
                    field.name,
                    field.field_type.as_str()
                )));
            }
            FieldType::Relation => {
                let relation = self.relations.get(&field.id).ok_or_else(|| {
                    EidosError::InvalidSchema(format!(
                        "Relation field {:?} ({}) has no eidos__relation_fields row",
                        field.name, field.id
                    ))
                })?;
                if relation.direction == RelationDirection::Inverse {
                    return Err(EidosError::InvalidRequest(format!(
                        "field {:?} ({}) is an inverse Relation and cannot be written",
                        field.name, field.id
                    )));
                }
            }
            _ => {}
        }
        Ok(field)
    }

    /// Coerces one transport value, additionally enforcing Relation
    /// cardinality `one` (array shape itself is checked by `coerce_value`).
    fn coerce(&self, field: &FieldMeta, value: &JsonValue) -> Result<SqlValue> {
        if field.field_type == FieldType::Relation
            && let Some(relation) = self.relations.get(&field.id)
            && relation.cardinality == RelationCardinality::One
            && value.as_array().is_some_and(|items| items.len() > 1)
        {
            return Err(EidosError::InvalidValue(format!(
                "field {:?} (relation): cardinality one permits at most one target",
                field.name
            )));
        }
        values::coerce_value(field, value)
    }

    /// Stored user fields with a physical column (excludes system fields,
    /// which are written only by the runtime).
    fn stored_user_fields(&self) -> impl Iterator<Item = &FieldMeta> {
        self.fields.iter().filter(|f| {
            f.system_role.is_none()
                && f.physical_name.is_some()
                && !matches!(f.field_type, FieldType::Formula | FieldType::Lookup)
                && !matches!(f.field_type, FieldType::Relation)
        })
    }

    fn forward_relation_fields(&self) -> impl Iterator<Item = &FieldMeta> {
        self.fields.iter().filter(|f| {
            f.field_type == FieldType::Relation
                && self
                    .relations
                    .get(&f.id)
                    .is_some_and(|r| r.direction == RelationDirection::Forward)
        })
    }
}

/// One validated create, ready to insert.
struct PreparedCreate {
    client_key: String,
    row_id: String,
    /// `(physical column, value)` pairs for explicitly provided fields.
    columns: Vec<(String, SqlValue)>,
}

/// One validated update, ready to apply (or skip as a no-op).
struct PreparedUpdate {
    row_id: String,
    /// `(physical column, new value)` pairs in request order.
    columns: Vec<(String, SqlValue)>,
}

/// Applies `mutation` in one IMMEDIATE transaction (see module docs).
pub fn mutate_rows(conn: &mut Connection, mutation: &RowMutation) -> Result<RowMutationResult> {
    if mutation.changes.is_empty() {
        return Err(EidosError::InvalidRequest(
            "RowMutation.changes must be non-empty".into(),
        ));
    }
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let result = mutate_rows_in_transaction(&tx, mutation)?;
    if result.changed {
        tx.commit()?;
    } else {
        tx.rollback()?;
    }
    Ok(result)
}

/// Applies `mutation` through an existing write transaction without deciding
/// whether to commit it. Agent-facing orchestration can use this to evaluate
/// query preconditions and run validation against the proposed final state
/// before committing. The caller must commit changed results or roll back
/// no-op results.
pub fn mutate_rows_in_transaction(
    conn: &Transaction<'_>,
    mutation: &RowMutation,
) -> Result<RowMutationResult> {
    if mutation.changes.is_empty() {
        return Err(EidosError::InvalidRequest(
            "RowMutation.changes must be non-empty".into(),
        ));
    }
    let (file_id, current_revision) = check_revision(conn, mutation.expected_revision.as_deref())?;
    let instant = now_instant();

    let tables = load_tables(conn)?;
    let fields = load_fields(conn)?;
    let relations = load_relation_fields(conn)?;
    let ctx = TableContext::load(&mutation.table_id, &tables, &fields, &relations)?;
    let table_q = quote_identifier(&ctx.table.physical_name)?;

    // --- Request shape validation (§11.2): client keys are unique and
    // non-empty; no Row ID occurs in more than one change; update/delete
    // Row IDs are canonical UUIDv7; an update with an empty map is
    // invalid-request.
    let mut client_keys = HashSet::new();
    let mut seen_row_ids = HashSet::new();
    for change in &mutation.changes {
        match change {
            RowChange::Create { client_key, .. } => {
                if client_key.is_empty() {
                    return Err(EidosError::InvalidRequest(
                        "create clientKey must be non-empty".into(),
                    ));
                }
                if !client_keys.insert(client_key) {
                    return Err(EidosError::InvalidRequest(format!(
                        "duplicate create clientKey {client_key:?}"
                    )));
                }
                // A create may legitimately fill every field by default;
                // only updates require a non-empty map.
            }
            RowChange::Update { row_id, values } => {
                if !is_valid_uuidv7(row_id) {
                    return Err(EidosError::InvalidValue(format!(
                        "update rowId {row_id:?} is not a lowercase hyphenated UUIDv7"
                    )));
                }
                if values.is_empty() {
                    return Err(EidosError::InvalidRequest(format!(
                        "update of row {row_id} carries an empty values map"
                    )));
                }
                if !seen_row_ids.insert(row_id) {
                    return Err(EidosError::InvalidRequest(format!(
                        "row {row_id} occurs in more than one change"
                    )));
                }
            }
            RowChange::Delete { row_id } => {
                if !is_valid_uuidv7(row_id) {
                    return Err(EidosError::InvalidValue(format!(
                        "delete rowId {row_id:?} is not a lowercase hyphenated UUIDv7"
                    )));
                }
                if !seen_row_ids.insert(row_id) {
                    return Err(EidosError::InvalidRequest(format!(
                        "row {row_id} occurs in more than one change"
                    )));
                }
            }
        }
    }

    // --- Validate and coerce every value up front, before any write
    // (§11.3 step 1/4).
    let mut creates: Vec<PreparedCreate> = Vec::new();
    let mut updates: Vec<PreparedUpdate> = Vec::new();
    let mut deletes: Vec<String> = Vec::new();
    for change in &mutation.changes {
        match change {
            RowChange::Create { client_key, values } => {
                let mut columns = Vec::with_capacity(values.len());
                for (key, value) in values {
                    let field = ctx.resolve_writable(key)?;
                    let physical = field
                        .physical_name
                        .clone()
                        .expect("writable fields are stored");
                    columns.push((physical, ctx.coerce(field, value)?));
                }
                creates.push(PreparedCreate {
                    client_key: client_key.clone(),
                    row_id: generate_uuidv7(),
                    columns,
                });
            }
            RowChange::Update { row_id, values } => {
                let mut columns = Vec::with_capacity(values.len());
                for (key, value) in values {
                    let field = ctx.resolve_writable(key)?;
                    let physical = field
                        .physical_name
                        .clone()
                        .expect("writable fields are stored");
                    columns.push((physical, ctx.coerce(field, value)?));
                }
                updates.push(PreparedUpdate {
                    row_id: row_id.clone(),
                    columns,
                });
            }
            RowChange::Delete { row_id } => deletes.push(row_id.clone()),
        }
    }

    // --- Missing-field fill rules for creates (§11.2): missing nullable
    // fields become NULL, missing Multi-select/File/forward-Relation fields
    // use `[]`, and any other missing non-nullable field is invalid-value.
    for create in &creates {
        let provided: HashSet<&str> = create
            .columns
            .iter()
            .map(|(physical, _)| physical.as_str())
            .collect();
        for field in ctx
            .stored_user_fields()
            .chain(ctx.forward_relation_fields())
        {
            let physical = field.physical_name.as_deref().expect("stored");
            if provided.contains(physical) {
                continue;
            }
            let is_list = matches!(
                field.field_type,
                FieldType::MultiSelect | FieldType::File | FieldType::Relation
            );
            if is_list || field.nullable {
                continue; // covered by the column DEFAULT '[]' / NULL fill
            }
            return Err(EidosError::InvalidValue(format!(
                "field {:?} ({}) is non-nullable and has no default; a create must supply it",
                field.name,
                field.field_type.as_str()
            )));
        }
    }

    // --- Existence of update/delete targets (not-found rolls back the
    // whole request) and current values for no-op detection and Relation
    // old-array comparison.
    let mut current_rows: HashMap<String, HashMap<String, SqlValue>> = HashMap::new();
    for prepared in updates.iter().map(|u| &u.row_id).chain(deletes.iter()) {
        if current_rows.contains_key(prepared) {
            continue;
        }
        let row = read_physical_row(conn, &table_q, &ctx, prepared)?;
        current_rows.insert(prepared.clone(), row);
    }

    // --- Newly introduced Relation IDs must resolve in the proposed final
    // target table (§11.2: base rows minus deletes plus allocated creates).
    check_relation_targets(
        &ctx,
        conn,
        &tables,
        &creates,
        &updates,
        &deletes,
        &current_rows,
    )?;

    // --- Apply creates.
    let mut affected: BTreeSet<AffectedRow> = BTreeSet::new();
    let mut created = Vec::with_capacity(creates.len());
    for create in &creates {
        let mut names = String::from("\"_id\", \"_created_at\", \"_updated_at\"");
        for (physical, _) in &create.columns {
            names.push_str(", ");
            names.push_str(&quote_identifier(physical)?);
        }
        let placeholders = vec!["?"; create.columns.len() + 3].join(", ");
        let mut params: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(create.columns.len() + 3);
        params.push(&create.row_id);
        params.push(&instant);
        params.push(&instant);
        for (_, value) in &create.columns {
            params.push(value);
        }
        conn.execute(
            &format!("INSERT INTO {table_q} ({names}) VALUES ({placeholders})"),
            params.as_slice(),
        )?;
        created.push(CreatedRow {
            client_key: create.client_key.clone(),
            row_id: create.row_id.clone(),
        });
        affected.insert(AffectedRow {
            table_id: ctx.table.id.clone(),
            row_id: create.row_id.clone(),
        });
    }

    // --- Apply updates, skipping equal-value-only no-ops (§11.2: equal
    // canonical values never touch `_updated_at`). `SqlValue` equality is
    // exactly the canonical comparison: JCS text bytes for JSON/list/File,
    // binary64 for numbers (coercion already normalized -0 to +0), exact
    // representations elsewhere.
    for update in &updates {
        let current = &current_rows[&update.row_id];
        let changed_columns: Vec<&(String, SqlValue)> = update
            .columns
            .iter()
            .filter(|(physical, value)| current.get(physical) != Some(value))
            .collect();
        if changed_columns.is_empty() {
            continue;
        }
        let assignments = changed_columns
            .iter()
            .map(|(physical, _)| quote_identifier(physical).map(|q| format!("{q} = ?")))
            .collect::<Result<Vec<_>>>()?
            .join(", ");
        let mut params: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(changed_columns.len() + 2);
        for (_, value) in &changed_columns {
            params.push(value);
        }
        params.push(&instant);
        params.push(&update.row_id);
        conn.execute(
            &format!("UPDATE {table_q} SET {assignments}, \"_updated_at\" = ? WHERE \"_id\" = ?"),
            params.as_slice(),
        )?;
        affected.insert(AffectedRow {
            table_id: ctx.table.id.clone(),
            row_id: update.row_id.clone(),
        });
    }

    // --- §10.4 set-based delete-policy preflight BEFORE any physical
    // delete. Updates above are already applied, so the preflight evaluates
    // each surviving source row's proposed array. Detach rewrites share the
    // one bound operation instant.
    let mut delete_set: BTreeMap<String, Vec<String>> = BTreeMap::new();
    if !deletes.is_empty() {
        delete_set.insert(ctx.table.id.clone(), deletes.clone());
    }
    for (table_id, row_id) in relation::preflight_delete_policy(conn, &delete_set, &instant)? {
        affected.insert(AffectedRow { table_id, row_id });
    }

    // --- Physical deletes.
    for row_id in &deletes {
        conn.execute(
            &format!("DELETE FROM {table_q} WHERE \"_id\" = ?"),
            rusqlite::params![row_id],
        )?;
        affected.insert(AffectedRow {
            table_id: ctx.table.id.clone(),
            row_id: row_id.clone(),
        });
    }

    // --- Revision postcondition (§11.3/§14): a pure no-op rolls back and
    // reports the unchanged revision; otherwise increment exactly once.
    if affected.is_empty() {
        return Ok(RowMutationResult {
            file_id,
            revision: current_revision.to_string(),
            changed: false,
            created: Vec::new(),
            affected_rows: Vec::new(),
        });
    }
    let new_revision = ddl::increment_revision(conn, &instant)?;
    Ok(RowMutationResult {
        file_id,
        revision: new_revision.to_string(),
        changed: true,
        created,
        affected_rows: affected.into_iter().collect(),
    })
}

/// Reads one physical row's user columns; `not-found` when absent.
fn read_physical_row(
    conn: &Connection,
    table_q: &str,
    ctx: &TableContext,
    row_id: &str,
) -> Result<HashMap<String, SqlValue>> {
    let stored: Vec<&FieldMeta> = ctx
        .stored_user_fields()
        .chain(ctx.forward_relation_fields())
        .collect();
    let columns = stored
        .iter()
        .map(|f| quote_identifier(f.physical_name.as_deref().expect("stored")))
        .collect::<Result<Vec<_>>>()?
        .join(", ");
    let sql = format!("SELECT {columns} FROM {table_q} WHERE \"_id\" = ?");
    let result = conn.query_row(&sql, rusqlite::params![row_id], |row| {
        let mut values = HashMap::new();
        for (index, field) in stored.iter().enumerate() {
            values.insert(
                field.physical_name.clone().expect("stored"),
                row.get::<_, SqlValue>(index)?,
            );
        }
        Ok(values)
    });
    match result {
        Ok(values) => Ok(values),
        Err(rusqlite::Error::QueryReturnedNoRows) => Err(EidosError::NotFound(format!(
            "row {row_id} in table {} ({:?})",
            ctx.table.id, ctx.table.name
        ))),
        Err(other) => Err(EidosError::from(other)),
    }
}

/// Enforces §11.2: every newly introduced Relation target ID resolves in
/// the proposed final target table (base rows minus this operation's
/// deletes plus its allocated creates). An occurrence already present in
/// the row's current array is not newly introduced and may survive.
fn check_relation_targets(
    ctx: &TableContext,
    conn: &Connection,
    tables: &[TableMeta],
    creates: &[PreparedCreate],
    updates: &[PreparedUpdate],
    deletes: &[String],
    current_rows: &HashMap<String, HashMap<String, SqlValue>>,
) -> Result<()> {
    // (relation field, row's old array or None for creates, new array)
    type RelationTargetCheck<'a> = (&'a FieldMeta, Option<Vec<String>>, Vec<String>);
    let mut checks: Vec<RelationTargetCheck<'_>> = Vec::new();
    for field in ctx.forward_relation_fields() {
        let physical = field
            .physical_name
            .as_deref()
            .expect("forward relation column");
        for create in creates {
            if let Some((_, SqlValue::Text(text))) =
                create.columns.iter().find(|(p, _)| p == physical)
            {
                checks.push((field, None, parse_id_array(field, text)?));
            }
        }
        for update in updates {
            if let Some((_, SqlValue::Text(text))) =
                update.columns.iter().find(|(p, _)| p == physical)
            {
                let old = match current_rows[&update.row_id].get(physical) {
                    Some(SqlValue::Text(old_text)) => Some(parse_id_array(field, old_text)?),
                    _ => None,
                };
                checks.push((field, old, parse_id_array(field, text)?));
            }
        }
    }

    // The proposed final Row-ID set of every referenced target table:
    // base rows, minus this operation's deletes, plus its allocated
    // creates (both apply only when the target is the mutation's table).
    let mut final_ids: HashMap<String, HashSet<String>> = HashMap::new();
    for (field, _, _) in &checks {
        let target_table_id = &ctx
            .relations
            .get(&field.id)
            .expect("forward relation fields have relation rows")
            .target_table_id;
        if final_ids.contains_key(target_table_id) {
            continue;
        }
        let table = tables
            .iter()
            .find(|t| &t.id == target_table_id)
            .ok_or_else(|| {
                EidosError::InvalidSchema(format!(
                    "Relation targets unknown table {target_table_id}"
                ))
            })?;
        let mut ids: HashSet<String> = conn
            .prepare(&format!(
                "SELECT \"_id\" FROM {}",
                quote_identifier(&table.physical_name)?
            ))?
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<HashSet<_>>>()?;
        if *target_table_id == ctx.table.id {
            for id in deletes {
                ids.remove(id);
            }
            for create in creates {
                ids.insert(create.row_id.clone());
            }
        }
        final_ids.insert(target_table_id.clone(), ids);
    }

    for (field, old, new) in checks {
        let relation = ctx
            .relations
            .get(&field.id)
            .expect("forward relation fields have relation rows");
        let old_ids: HashSet<&str> = old
            .as_ref()
            .map(|ids| ids.iter().map(String::as_str).collect())
            .unwrap_or_default();
        let target_ids = &final_ids[&relation.target_table_id];
        for id in &new {
            if old_ids.contains(id.as_str()) {
                continue; // pre-existing occurrence, not newly introduced
            }
            if !target_ids.contains(id) {
                return Err(EidosError::InvalidRequest(format!(
                    "Relation field {:?} ({}) introduces unresolved target row {id} \
                     in table {}",
                    field.name, field.id, relation.target_table_id
                )));
            }
        }
    }
    Ok(())
}

/// Parses a canonical Relation cell into its ID list.
fn parse_id_array(field: &FieldMeta, text: &str) -> Result<Vec<String>> {
    serde_json::from_str(text).map_err(|err| {
        EidosError::InvalidSchema(format!(
            "Relation cell of field {:?} ({}) is not a JSON array: {err}",
            field.name, field.id
        ))
    })
}
