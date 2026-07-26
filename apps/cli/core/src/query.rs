//! ER `RowQuery` wire model (Eidos Runtime 1.0 §7.1), SQL compilation, and
//! row reading. The serde types match the runtime contract byte-for-byte.
//!
//! Field references in filters, sorts, and search may be stable Field IDs
//! or display names, resolved against the table's metadata. Operands use
//! the Runtime logical value encoding (integers as canonical decimal
//! strings, JSON as JCS text); `values.rs` owns coercion into SQL bindings.
//!
//! v1 limitations (documented, all reported as `invalid-query`):
//!
//! - Only STORED fields are filterable/sortable/searchable; Formula,
//!   Lookup, and inverse Relation fields have no physical column and are
//!   rejected (and never evaluated — `read_rows` emits them as null only
//!   when `include_virtual` is set).
//! - `search` over a forward Relation field needs target-table metadata,
//!   so it compiles only through [`read_rows`]; plain [`compile_query`]
//!   rejects it.
//! - `search` matches the stored text representation of named scalar
//!   fields rather than the full §7.1 Search Fragment table (numeric/date
//!   fields are searchable by their canonical stored spelling; checkbox is
//!   searched as `0`/`1`; inverse-Relation fragments are unsupported).
//! - Paging is LIMIT/OFFSET; keyset cursors are a v1 non-goal.

use std::collections::{HashMap, HashSet};

use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::error::{EidosError, Result};
use crate::id::is_valid_uuidv7;
use crate::jcs;
use crate::model::{FieldMeta, FieldType, SystemRole, TableMeta};
use crate::naming::quote_identifier;
use crate::values::coerce_value;

/// Public row query document: optional filter tree, optional ASCII-folded
/// search, optional stable sort.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RowQuery {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter: Option<FilterNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search: Option<SearchSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<Vec<SortTerm>>,
}

/// `search: { text: string; fields: string[] }` — the fields are stable
/// Field IDs; the fold is ASCII `A..Z` to `a..z` only.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SearchSpec {
    pub text: String,
    pub fields: Vec<String>,
}

/// One sort term: `nulls` defaults to the Field's natural position per the
/// Runtime contract (compiled by the query phase, not stored here).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SortTerm {
    pub field_id: String,
    pub direction: SortDirection,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nulls: Option<NullsOrder>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SortDirection {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NullsOrder {
    First,
    Last,
}

/// Filter tree, tagged by `op`. Logical nodes use the Runtime three-valued
/// truth table (empty `and` is TRUE, empty `or` is FALSE); a null Field
/// value produces UNKNOWN outside `is-null`/`is-not-null`, and a row is
/// selected only by TRUE.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all_fields = "camelCase")]
pub enum FilterNode {
    #[serde(rename = "and")]
    And { args: Vec<FilterNode> },
    #[serde(rename = "or")]
    Or { args: Vec<FilterNode> },
    #[serde(rename = "not")]
    Not { arg: Box<FilterNode> },
    #[serde(rename = "is-null")]
    IsNull { field_id: String },
    #[serde(rename = "is-not-null")]
    IsNotNull { field_id: String },
    #[serde(rename = "eq")]
    Eq { field_id: String, value: JsonValue },
    #[serde(rename = "ne")]
    Ne { field_id: String, value: JsonValue },
    #[serde(rename = "lt")]
    Lt { field_id: String, value: JsonValue },
    #[serde(rename = "lte")]
    Lte { field_id: String, value: JsonValue },
    #[serde(rename = "gt")]
    Gt { field_id: String, value: JsonValue },
    #[serde(rename = "gte")]
    Gte { field_id: String, value: JsonValue },
    #[serde(rename = "between")]
    Between {
        field_id: String,
        lower: JsonValue,
        upper: JsonValue,
    },
    #[serde(rename = "in")]
    In {
        field_id: String,
        values: Vec<JsonValue>,
    },
    #[serde(rename = "contains")]
    Contains { field_id: String, value: String },
    #[serde(rename = "starts-with")]
    StartsWith { field_id: String, value: String },
    #[serde(rename = "ends-with")]
    EndsWith { field_id: String, value: String },
    #[serde(rename = "has-any")]
    HasAny {
        field_id: String,
        values: Vec<JsonValue>,
    },
    #[serde(rename = "has-all")]
    HasAll {
        field_id: String,
        values: Vec<JsonValue>,
    },
    #[serde(rename = "relation-has")]
    RelationHas { field_id: String, row_id: String },
}

/// Defense-in-depth budgets for untrusted filter trees (§16).
const MAX_FILTER_DEPTH: usize = 64;
const MAX_FILTER_NODES: usize = 1024;

/// A compiled `RowQuery`: parameterized SQL fragments.
#[derive(Debug, Clone, PartialEq)]
pub struct CompiledQuery {
    /// `WHERE …` fragment, or empty when the query has neither filter nor
    /// search. Placeholders bind to `params` in order.
    pub where_sql: String,
    /// `ORDER BY …` fragment; always present and always ends with the
    /// `"_id" COLLATE BINARY ASC` tiebreaker unless Row ID is already the
    /// final sort term, so paging is deterministic. (The TS compiler
    /// appends `__base_rowid`; WITHOUT ROWID user tables have no hidden
    /// rowid, so the UUIDv7 `_id` primary key plays that role.)
    pub order_sql: String,
    /// Positional parameters for `where_sql`, in placeholder order.
    pub params: Vec<SqlValue>,
}

/// Options for [`read_rows`].
#[derive(Debug, Clone, Default)]
pub struct ReadRowsOptions {
    /// Field IDs or display names to project; `None` selects every stored
    /// field (stored scalars plus forward Relations, which are stored).
    /// The Row-ID system field is always included.
    pub projection: Option<Vec<String>>,
    /// When set, virtual fields (Formula, Lookup, inverse Relation) appear
    /// in each row as JSON null; otherwise they are omitted (v1 does not
    /// evaluate them).
    pub include_virtual: bool,
    /// Maximum rows to return; `None` means no limit. Offset paging only —
    /// keyset cursors are a documented v1 non-goal.
    pub limit: Option<u32>,
    /// Rows to skip before `limit` applies.
    pub offset: Option<u32>,
}

/// One page of logical rows.
#[derive(Debug, Clone, PartialEq)]
pub struct RowPage {
    /// Rows keyed by Field display name; the Row-ID field (`_id`) is always
    /// present. Integers are canonical decimal strings, numbers JSON
    /// numbers, checkboxes booleans, list fields parsed arrays, JSON fields
    /// their JSON text string, SQL NULL JSON null.
    pub rows: Vec<serde_json::Map<String, JsonValue>>,
    /// Exact count of rows matching the filter/search, ignoring
    /// limit/offset (named `estimate` for forward compatibility).
    pub total_estimate: Option<u64>,
}

fn invalid_query(message: impl Into<String>) -> EidosError {
    EidosError::InvalidQuery(message.into())
}

/// Resolves a Field ID or display name against the table's fields. Unknown
/// references and references matching more than one field (e.g. a name that
/// equals another field's ID) are `invalid-query`.
fn resolve_field<'a>(fields: &'a [FieldMeta], reference: &str) -> Result<&'a FieldMeta> {
    let mut matches = fields
        .iter()
        .filter(|field| field.id == reference || field.name == reference);
    let Some(first) = matches.next() else {
        return Err(invalid_query(format!(
            "unknown field reference {reference:?}"
        )));
    };
    if let Some(other) = matches.find(|field| field.id != first.id) {
        return Err(invalid_query(format!(
            "field reference {reference:?} is ambiguous between fields {:?} and {:?}",
            first.name, other.name
        )));
    }
    Ok(first)
}

/// Returns the physical column of a stored field, or `invalid-query` for
/// virtual fields (Formula/Lookup/inverse Relation), a documented v1
/// limitation.
fn stored_column(field: &FieldMeta) -> Result<&str> {
    field.physical_name.as_deref().ok_or_else(|| {
        invalid_query(format!(
            "field {:?} ({}): virtual fields (formula, lookup, inverse relation) \
             have no stored column and cannot be filtered, sorted, or searched in v1",
            field.name,
            field.field_type.as_str()
        ))
    })
}

/// Ordered comparison and sort apply to the §5.1 sortable TypeRefs only.
fn require_ordered(field: &FieldMeta) -> Result<()> {
    match field.field_type {
        FieldType::Text
        | FieldType::Url
        | FieldType::Select
        | FieldType::Integer
        | FieldType::Number
        | FieldType::Checkbox
        | FieldType::Date
        | FieldType::Datetime => Ok(()),
        other => Err(invalid_query(format!(
            "field {:?} ({}): ordered comparison applies to text, url, select, row-id, \
             integer, number, checkbox, date, and datetime only",
            field.name,
            other.as_str()
        ))),
    }
}

/// Coerces one query operand through `values::coerce_value` (the no-coercion
/// rule: the operand must already have the field's logical type). A null
/// operand is invalid — clients use `is-null`/`is-not-null` explicitly.
fn coerce_operand(field: &FieldMeta, value: &JsonValue) -> Result<SqlValue> {
    if value.is_null() {
        return Err(invalid_query(format!(
            "field {:?}: null query operands are invalid; use is-null/is-not-null",
            field.name
        )));
    }
    coerce_value(field, value)
        .map_err(|err| invalid_query(format!("operand for field {:?}: {err}", field.name)))
}

/// Escapes the LIKE wildcards `%`/`_` and the escape char itself (query.ts
/// `escapeLike`).
fn like_escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        if matches!(ch, '\\' | '%' | '_') {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

/// Target metadata for the one-hop forward-Relation search join.
#[derive(Debug, Clone, PartialEq)]
struct RelationSearchTarget {
    table: String,
    row_id: String,
    label: String,
}

struct Compiler<'a> {
    fields: &'a [FieldMeta],
    params: Vec<SqlValue>,
    relations: Option<&'a HashMap<String, RelationSearchTarget>>,
    nodes: usize,
}

#[derive(Debug, Clone, Copy)]
enum LikeKind {
    Contains,
    StartsWith,
    EndsWith,
}

impl Compiler<'_> {
    fn compile_filter(&mut self, node: &FilterNode, depth: usize) -> Result<String> {
        self.nodes += 1;
        if depth > MAX_FILTER_DEPTH || self.nodes > MAX_FILTER_NODES {
            return Err(invalid_query(
                "filter exceeds the depth/node budget for a single query",
            ));
        }
        match node {
            // Three-valued logic is inherited from SQLite: AND/OR/NOT over
            // possibly-NULL operands implement the §7.1 truth table, and a
            // row is selected only when the WHERE expression is TRUE.
            FilterNode::And { args } => {
                if args.is_empty() {
                    return Ok("1".into()); // empty `and` is TRUE
                }
                let mut parts = Vec::with_capacity(args.len());
                for arg in args {
                    parts.push(self.compile_filter(arg, depth + 1)?);
                }
                Ok(format!("({})", parts.join(" AND ")))
            }
            FilterNode::Or { args } => {
                if args.is_empty() {
                    return Ok("0".into()); // empty `or` is FALSE
                }
                let mut parts = Vec::with_capacity(args.len());
                for arg in args {
                    parts.push(self.compile_filter(arg, depth + 1)?);
                }
                Ok(format!("({})", parts.join(" OR ")))
            }
            FilterNode::Not { arg } => {
                Ok(format!("NOT ({})", self.compile_filter(arg, depth + 1)?))
            }
            FilterNode::IsNull { field_id } => {
                let field = resolve_field(self.fields, field_id)?;
                Ok(format!(
                    "{} IS NULL",
                    quote_identifier(stored_column(field)?)?
                ))
            }
            FilterNode::IsNotNull { field_id } => {
                let field = resolve_field(self.fields, field_id)?;
                Ok(format!(
                    "{} IS NOT NULL",
                    quote_identifier(stored_column(field)?)?
                ))
            }
            // `col = ?` / `col <> ?` evaluate to NULL (UNKNOWN) on a NULL
            // field, so `ne` does NOT select null-field rows — exactly the
            // §7.1 three-valued semantics.
            FilterNode::Eq { field_id, value } => self.compile_compare(field_id, "=", value, false),
            FilterNode::Ne { field_id, value } => {
                self.compile_compare(field_id, "<>", value, false)
            }
            FilterNode::Lt { field_id, value } => self.compile_compare(field_id, "<", value, true),
            FilterNode::Lte { field_id, value } => {
                self.compile_compare(field_id, "<=", value, true)
            }
            FilterNode::Gt { field_id, value } => self.compile_compare(field_id, ">", value, true),
            FilterNode::Gte { field_id, value } => {
                self.compile_compare(field_id, ">=", value, true)
            }
            FilterNode::Between {
                field_id,
                lower,
                upper,
            } => {
                let field = resolve_field(self.fields, field_id)?;
                let column = quote_identifier(stored_column(field)?)?;
                require_ordered(field)?;
                let lower = coerce_operand(field, lower)?;
                let upper = coerce_operand(field, upper)?;
                self.params.push(lower);
                self.params.push(upper);
                Ok(format!("{column} BETWEEN ? AND ?"))
            }
            // `in` is the three-valued OR of typed eq comparisons; empty is
            // FALSE. A NULL field makes the IN expression NULL (UNKNOWN).
            FilterNode::In { field_id, values } => {
                let field = resolve_field(self.fields, field_id)?;
                let column = quote_identifier(stored_column(field)?)?;
                if values.is_empty() {
                    return Ok("0".into());
                }
                for value in values {
                    self.params.push(coerce_operand(field, value)?);
                }
                Ok(format!(
                    "{column} IN ({})",
                    values.iter().map(|_| "?").collect::<Vec<_>>().join(", ")
                ))
            }
            FilterNode::Contains { field_id, value } => {
                self.compile_like(field_id, value, LikeKind::Contains)
            }
            FilterNode::StartsWith { field_id, value } => {
                self.compile_like(field_id, value, LikeKind::StartsWith)
            }
            FilterNode::EndsWith { field_id, value } => {
                self.compile_like(field_id, value, LikeKind::EndsWith)
            }
            FilterNode::HasAny { field_id, values } => {
                self.compile_set_membership(field_id, values, false)
            }
            FilterNode::HasAll { field_id, values } => {
                self.compile_set_membership(field_id, values, true)
            }
            FilterNode::RelationHas { field_id, row_id } => {
                let field = resolve_field(self.fields, field_id)?;
                let column = quote_identifier(stored_column(field)?)?;
                if field.field_type != FieldType::Relation {
                    return Err(invalid_query(format!(
                        "field {:?} ({}): relation-has applies to forward relation fields only",
                        field.name,
                        field.field_type.as_str()
                    )));
                }
                if !is_valid_uuidv7(row_id) {
                    return Err(invalid_query(format!(
                        "relation-has rowId {row_id:?} is not a lowercase UUIDv7"
                    )));
                }
                self.params.push(SqlValue::Text(row_id.clone()));
                Ok(format!(
                    "EXISTS (SELECT 1 FROM json_each({column}) je WHERE je.value = ?)"
                ))
            }
        }
    }

    fn compile_compare(
        &mut self,
        field_id: &str,
        sql_op: &str,
        value: &JsonValue,
        ordered: bool,
    ) -> Result<String> {
        let field = resolve_field(self.fields, field_id)?;
        let column = quote_identifier(stored_column(field)?)?;
        if ordered {
            require_ordered(field)?;
        }
        // eq/ne/in apply to every stored TypeRef: list fields and JSON
        // compare whole-cell canonical JCS text, so SQL byte equality is
        // the §7.1 typed equality.
        self.params.push(coerce_operand(field, value)?);
        Ok(format!("{column} {sql_op} ?"))
    }

    fn compile_like(&mut self, field_id: &str, value: &str, kind: LikeKind) -> Result<String> {
        let field = resolve_field(self.fields, field_id)?;
        let column = quote_identifier(stored_column(field)?)?;
        if !matches!(
            field.field_type,
            FieldType::Text | FieldType::Url | FieldType::Select
        ) {
            return Err(invalid_query(format!(
                "field {:?} ({}): contains/starts-with/ends-with apply to text, url, \
                 select, and row-id fields only",
                field.name,
                field.field_type.as_str()
            )));
        }
        let escaped = like_escape(value);
        let pattern = match kind {
            LikeKind::Contains => format!("%{escaped}%"),
            LikeKind::StartsWith => format!("{escaped}%"),
            LikeKind::EndsWith => format!("%{escaped}"),
        };
        self.params.push(SqlValue::Text(pattern));
        // The §7.1 fold is ASCII A..Z -> a..z only; SQLite's built-in
        // LOWER() folds exactly ASCII and leaves non-ASCII unchanged.
        Ok(format!("LOWER({column}) LIKE LOWER(?) ESCAPE '\\'"))
    }

    fn compile_set_membership(
        &mut self,
        field_id: &str,
        values: &[JsonValue],
        all: bool,
    ) -> Result<String> {
        let field = resolve_field(self.fields, field_id)?;
        let column = quote_identifier(stored_column(field)?)?;
        if !matches!(
            field.field_type,
            FieldType::MultiSelect | FieldType::Relation | FieldType::File
        ) {
            return Err(invalid_query(format!(
                "field {:?} ({}): has-any/has-all apply to multi-select, relation, and \
                 file fields only",
                field.name,
                field.field_type.as_str()
            )));
        }
        if values.is_empty() {
            // Empty has-any is FALSE, empty has-all is TRUE (§7.1).
            return Ok(if all { "1".into() } else { "0".into() });
        }
        let mut clauses = Vec::with_capacity(values.len());
        for value in values {
            self.params.push(coerce_set_element(field, value)?);
            clauses.push(format!(
                "EXISTS (SELECT 1 FROM json_each({column}) je WHERE je.value = ?)"
            ));
        }
        Ok(format!(
            "({})",
            clauses.join(if all { " AND " } else { " OR " })
        ))
    }

    fn compile_search(&mut self, search: &SearchSpec) -> Result<String> {
        if search.text.is_empty() {
            return Err(invalid_query("search text must be non-empty"));
        }
        if search.fields.is_empty() {
            return Err(invalid_query("search fields must be non-empty"));
        }
        let pattern = format!("%{}%", like_escape(&search.text));
        let mut clauses = Vec::with_capacity(search.fields.len());
        for reference in &search.fields {
            let field = resolve_field(self.fields, reference)?;
            let column = quote_identifier(stored_column(field)?)?;
            let clause = match field.field_type {
                // One edge hop: match the target table's current Record
                // Label via the cold-join shape (§7.1).
                FieldType::Relation => {
                    let target = self
                        .relations
                        .and_then(|map| map.get(&field.id))
                        .ok_or_else(|| {
                            invalid_query(format!(
                                "field {:?}: relation search needs target-table metadata — compile \
                             through read_rows (and the target's label field must be stored in v1)",
                                field.name
                            ))
                        })?;
                    self.params.push(SqlValue::Text(pattern.clone()));
                    format!(
                        "EXISTS (SELECT 1 FROM json_each({column}) je \
                         JOIN {table} t ON t.{row_id} = je.value \
                         WHERE LOWER(CAST(t.{label} AS TEXT)) LIKE LOWER(?) ESCAPE '\\')",
                        table = quote_identifier(&target.table)?,
                        row_id = quote_identifier(&target.row_id)?,
                        label = quote_identifier(&target.label)?,
                    )
                }
                // Multi-select fragments are the option names.
                FieldType::MultiSelect => {
                    self.params.push(SqlValue::Text(pattern.clone()));
                    format!(
                        "EXISTS (SELECT 1 FROM json_each({column}) je \
                         WHERE je.type = 'text' AND LOWER(je.value) LIKE LOWER(?) ESCAPE '\\')"
                    )
                }
                // File fragments are entry name, mediaType, and non-data:
                // URIs (a data: payload is never searched).
                FieldType::File => {
                    self.params.push(SqlValue::Text(pattern.clone()));
                    self.params.push(SqlValue::Text(pattern.clone()));
                    self.params.push(SqlValue::Text(pattern.clone()));
                    format!(
                        "EXISTS (SELECT 1 FROM json_each({column}) je \
                         WHERE LOWER(json_extract(je.value, '$.name')) LIKE LOWER(?) ESCAPE '\\' \
                         OR LOWER(json_extract(je.value, '$.mediaType')) LIKE LOWER(?) ESCAPE '\\' \
                         OR (json_extract(je.value, '$.uri') NOT LIKE 'data:%' \
                         AND LOWER(json_extract(je.value, '$.uri')) LIKE LOWER(?) ESCAPE '\\'))"
                    )
                }
                // v1: ASCII-folded substring over the named field's stored
                // text representation (see module docs for the deviation
                // from the full §7.1 Search Fragment table).
                _ => {
                    self.params.push(SqlValue::Text(pattern.clone()));
                    format!("LOWER(CAST({column} AS TEXT)) LIKE LOWER(?) ESCAPE '\\'")
                }
            };
            clauses.push(clause);
        }
        Ok(format!("({})", clauses.join(" OR ")))
    }
}

/// Element coercion for has-any/has-all: multi-select elements are strings,
/// relation elements are Row IDs, file elements compare as complete JCS
/// entry objects (§7.1 typed exact element equality).
fn coerce_set_element(field: &FieldMeta, value: &JsonValue) -> Result<SqlValue> {
    let mismatch = || {
        invalid_query(format!(
            "field {:?} ({}): set operand has the wrong element type",
            field.name,
            field.field_type.as_str()
        ))
    };
    match field.field_type {
        FieldType::MultiSelect => value
            .as_str()
            .map(|text| SqlValue::Text(text.to_string()))
            .ok_or_else(mismatch),
        FieldType::Relation => value
            .as_str()
            .filter(|text| is_valid_uuidv7(text))
            .map(|text| SqlValue::Text(text.to_string()))
            .ok_or_else(mismatch),
        FieldType::File => {
            if !value.is_object() {
                return Err(mismatch());
            }
            jcs::to_jcs(value)
                .map(SqlValue::Text)
                .map_err(|_| mismatch())
        }
        _ => Err(mismatch()),
    }
}

/// Compiles the ORDER BY fragment. Sort fields must be unique, stored, and
/// of a §5.1 sortable TypeRef; a client-supplied Row-ID system field is
/// valid only as the final term. Null placement defaults to LAST for both
/// directions (§7.2).
fn compile_sort(fields: &[FieldMeta], terms: &[SortTerm]) -> Result<String> {
    let row_id_field = fields
        .iter()
        .find(|field| field.system_role == Some(SystemRole::RowId))
        .ok_or_else(|| {
            EidosError::InvalidSchema("table metadata has no row-id system field".into())
        })?;
    let mut seen = HashSet::with_capacity(terms.len());
    let mut clauses = Vec::with_capacity(terms.len() + 1);
    let mut last_is_row_id = false;
    for (index, term) in terms.iter().enumerate() {
        let field = resolve_field(fields, &term.field_id)?;
        if !seen.insert(field.id.clone()) {
            return Err(invalid_query(format!(
                "sort field {:?} is listed more than once",
                field.name
            )));
        }
        let column = quote_identifier(stored_column(field)?)?;
        require_ordered(field)?;
        if field.system_role == Some(SystemRole::RowId) {
            if index + 1 != terms.len() {
                return Err(invalid_query(
                    "the row-id system field is only valid as the final sort term",
                ));
            }
            last_is_row_id = true;
        }
        let direction = match term.direction {
            SortDirection::Asc => "ASC",
            SortDirection::Desc => "DESC",
        };
        let nulls = match term.nulls.unwrap_or(NullsOrder::Last) {
            NullsOrder::First => "NULLS FIRST",
            NullsOrder::Last => "NULLS LAST",
        };
        clauses.push(format!("{column} {direction} {nulls}"));
    }
    if !last_is_row_id {
        let row_id_column =
            quote_identifier(row_id_field.physical_name.as_deref().unwrap_or("_id"))?;
        clauses.push(format!("{row_id_column} COLLATE BINARY ASC"));
    }
    Ok(format!("ORDER BY {}", clauses.join(", ")))
}

fn compile(
    fields: &[FieldMeta],
    query: &RowQuery,
    relations: Option<&HashMap<String, RelationSearchTarget>>,
) -> Result<CompiledQuery> {
    let mut compiler = Compiler {
        fields,
        params: Vec::new(),
        relations,
        nodes: 0,
    };
    let mut where_parts = Vec::new();
    if let Some(filter) = &query.filter {
        where_parts.push(compiler.compile_filter(filter, 1)?);
    }
    if let Some(search) = &query.search {
        // Search is AND-ed with the filter (§7.1).
        where_parts.push(compiler.compile_search(search)?);
    }
    let where_sql = if where_parts.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_parts.join(" AND "))
    };
    let order_sql = compile_sort(fields, query.sort.as_deref().unwrap_or(&[]))?;
    Ok(CompiledQuery {
        where_sql,
        order_sql,
        params: compiler.params,
    })
}

/// Compiles `query` against `table`'s fields into a parameterized
/// WHERE/ORDER BY fragment, resolving Field IDs or display names to quoted
/// physical names and applying the Runtime three-valued truth table, the
/// ASCII-only case fold, the §5.1 operator/type compatibility matrix, and
/// the no-coercion operand rule.
///
/// `table` anchors the metadata context; the fragments themselves are
/// table-agnostic. A `search` over a forward Relation field cannot compile
/// here (it needs the target table's metadata) and is `invalid-query`;
/// [`read_rows`] resolves relation search targets from the file.
pub fn compile_query(
    table: &TableMeta,
    fields: &[FieldMeta],
    query: &RowQuery,
) -> Result<CompiledQuery> {
    let _ = table;
    compile(fields, query, None)
}

/// Loads the target table's physical name, row-id column, and label column
/// for every forward-Relation field named by `query.search`. Fields whose
/// target label is virtual (a formula label) are left out so compilation
/// reports the v1 limitation as `invalid-query`.
fn load_relation_search_targets(
    conn: &Connection,
    fields: &[FieldMeta],
    query: &RowQuery,
) -> Result<HashMap<String, RelationSearchTarget>> {
    let mut targets = HashMap::new();
    let Some(search) = &query.search else {
        return Ok(targets);
    };
    for reference in &search.fields {
        let field = resolve_field(fields, reference)?;
        if field.field_type != FieldType::Relation || field.physical_name.is_none() {
            continue;
        }
        if targets.contains_key(&field.id) {
            continue;
        }
        let target_table_id: Option<String> = conn
            .query_row(
                "SELECT target_table_id FROM eidos__relation_fields \
                 WHERE field_id = ? AND direction = 'forward'",
                rusqlite::params![field.id],
                |row| row.get(0),
            )
            .optional()?;
        let Some(target_table_id) = target_table_id else {
            return Err(EidosError::InvalidSchema(format!(
                "forward relation field {:?} has no eidos__relation_fields row",
                field.name
            )));
        };
        let target: Option<(String, String)> = conn
            .query_row(
                "SELECT physical_name, label_field_id FROM eidos__tables WHERE id = ?",
                rusqlite::params![target_table_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        let Some((target_table, label_field_id)) = target else {
            return Err(EidosError::InvalidSchema(format!(
                "relation field {:?} targets a missing table",
                field.name
            )));
        };
        let row_id: Option<String> = conn
            .query_row(
                "SELECT physical_name FROM eidos__fields \
                 WHERE table_id = ? AND system_role = 'row-id'",
                rusqlite::params![target_table_id],
                |row| row.get(0),
            )
            .optional()?;
        let Some(row_id) = row_id else {
            return Err(EidosError::InvalidSchema(format!(
                "relation target table {target_table_id} has no row-id field"
            )));
        };
        let label: Option<Option<String>> = conn
            .query_row(
                "SELECT physical_name FROM eidos__fields WHERE id = ?",
                rusqlite::params![label_field_id],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(Some(label)) = label {
            targets.insert(
                field.id.clone(),
                RelationSearchTarget {
                    table: target_table,
                    row_id,
                    label,
                },
            );
        }
    }
    Ok(targets)
}

/// Decodes one stored cell into its logical JSON binding (§5.1).
fn logical_json(field: &FieldMeta, raw: SqlValue) -> Result<JsonValue> {
    if raw == SqlValue::Null {
        return Ok(JsonValue::Null);
    }
    let storage_error = || {
        EidosError::Internal(format!(
            "field {:?} ({}): unexpected SQLite storage class",
            field.name,
            field.field_type.as_str()
        ))
    };
    match field.field_type {
        FieldType::Text
        | FieldType::Url
        | FieldType::Select
        | FieldType::Date
        | FieldType::Datetime
        // A JSON field crosses the wire as its JSON text string, never as
        // a parsed untyped value.
        | FieldType::Json => match raw {
            SqlValue::Text(text) => Ok(JsonValue::String(text)),
            _ => Err(storage_error()),
        },
        FieldType::Number => match raw {
            SqlValue::Real(float) => serde_json::Number::from_f64(float)
                .map(JsonValue::Number)
                .ok_or_else(storage_error),
            SqlValue::Integer(int) => Ok(JsonValue::from(int as f64)),
            _ => Err(storage_error()),
        },
        // Integers bind as canonical decimal strings, never JSON numbers.
        FieldType::Integer => match raw {
            SqlValue::Integer(int) => Ok(JsonValue::String(int.to_string())),
            _ => Err(storage_error()),
        },
        FieldType::Checkbox => match raw {
            SqlValue::Integer(int) => Ok(JsonValue::Bool(int != 0)),
            _ => Err(storage_error()),
        },
        FieldType::MultiSelect | FieldType::Relation | FieldType::File => match raw {
            SqlValue::Text(text) => serde_json::from_str(&text).map_err(|err| {
                EidosError::Internal(format!(
                    "field {:?}: stored JSON array does not parse: {err}",
                    field.name
                ))
            }),
            _ => Err(storage_error()),
        },
        FieldType::Formula | FieldType::Lookup => Err(storage_error()),
    }
}

/// Reads one page of logical rows from `table`, applying `query` and
/// `options`. Rows are keyed by Field display name with `_id` always
/// present; values use the Runtime logical JSON binding (integers as
/// decimal strings, list fields as parsed arrays, SQL NULL as JSON null).
/// Ordering follows `query.sort` and always ends with the `_id` BINARY
/// tiebreaker, so LIMIT/OFFSET paging is deterministic.
pub fn read_rows(
    conn: &Connection,
    table: &TableMeta,
    fields: &[FieldMeta],
    query: &RowQuery,
    options: &ReadRowsOptions,
) -> Result<RowPage> {
    let relations = load_relation_search_targets(conn, fields, query)?;
    let compiled = compile(fields, query, Some(&relations))?;

    let row_id_field = fields
        .iter()
        .find(|field| field.system_role == Some(SystemRole::RowId))
        .ok_or_else(|| {
            EidosError::InvalidSchema("table metadata has no row-id system field".into())
        })?;
    let mut selected: Vec<&FieldMeta> = Vec::new();
    let mut virtuals: Vec<&FieldMeta> = Vec::new();
    match &options.projection {
        None => {
            selected.extend(fields.iter().filter(|field| field.physical_name.is_some()));
            if options.include_virtual {
                virtuals.extend(fields.iter().filter(|field| field.physical_name.is_none()));
            }
        }
        Some(references) => {
            for reference in references {
                let field = resolve_field(fields, reference)?;
                if field.physical_name.is_some() {
                    if !selected.iter().any(|chosen| chosen.id == field.id) {
                        selected.push(field);
                    }
                } else if options.include_virtual
                    && !virtuals.iter().any(|chosen| chosen.id == field.id)
                {
                    virtuals.push(field);
                }
            }
        }
    }
    if !selected.iter().any(|field| field.id == row_id_field.id) {
        selected.insert(0, row_id_field);
    }

    let mut columns = Vec::with_capacity(selected.len());
    for field in &selected {
        columns.push(quote_identifier(
            field.physical_name.as_deref().expect("stored field"),
        )?);
    }
    let from = quote_identifier(&table.physical_name)?;
    let sql = format!(
        "SELECT {} FROM {from} {} {} LIMIT ? OFFSET ?",
        columns.join(", "),
        compiled.where_sql,
        compiled.order_sql
    );
    let mut params = compiled.params.clone();
    params.push(SqlValue::Integer(options.limit.map_or(-1, i64::from)));
    params.push(SqlValue::Integer(options.offset.map_or(0, i64::from)));

    let mut stmt = conn.prepare(&sql)?;
    let raw_rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        (0..selected.len())
            .map(|index| row.get::<_, SqlValue>(index))
            .collect::<rusqlite::Result<Vec<_>>>()
    })?;
    let mut rows = Vec::new();
    for raw_row in raw_rows {
        let raw_row = raw_row?;
        let mut object = serde_json::Map::with_capacity(raw_row.len() + virtuals.len());
        for (field, raw) in selected.iter().zip(raw_row) {
            object.insert(field.name.clone(), logical_json(field, raw)?);
        }
        for field in &virtuals {
            object.insert(field.name.clone(), JsonValue::Null);
        }
        rows.push(object);
    }

    let count_sql = format!("SELECT COUNT(*) FROM {from} {}", compiled.where_sql);
    let total: i64 = conn.query_row(
        &count_sql,
        rusqlite::params_from_iter(compiled.params.iter()),
        |row| row.get(0),
    )?;
    Ok(RowPage {
        rows,
        total_estimate: Some(total.max(0) as u64),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "0198c72d-82b5-7968-b163-98be4b7477df";
    const OTHER_ID: &str = "0198c72d-82b5-7968-a163-98be4b7477df";

    #[test]
    fn row_query_wire_round_trip() {
        let text = format!(
            r#"{{"filter":{{"op":"and","args":[{{"op":"eq","fieldId":"{ID}","value":"x"}},{{"op":"not","arg":{{"op":"is-null","fieldId":"{ID}"}}}}]}},"search":{{"text":"abc","fields":["{ID}"]}},"sort":[{{"fieldId":"{ID}","direction":"desc","nulls":"last"}}]}}"#
        );
        let query: RowQuery = serde_json::from_str(&text).unwrap();
        assert_eq!(
            query.sort,
            Some(vec![SortTerm {
                field_id: ID.into(),
                direction: SortDirection::Desc,
                nulls: Some(NullsOrder::Last),
            }])
        );
        assert_eq!(serde_json::to_string(&query).unwrap(), text);
    }

    #[test]
    fn every_filter_op_deserializes() {
        let cases = [
            r#"{"op":"or","args":[]}"#.to_string(),
            format!(r#"{{"op":"is-not-null","fieldId":"{ID}"}}"#),
            format!(r#"{{"op":"ne","fieldId":"{ID}","value":1}}"#),
            format!(r#"{{"op":"lt","fieldId":"{ID}","value":1}}"#),
            format!(r#"{{"op":"lte","fieldId":"{ID}","value":1}}"#),
            format!(r#"{{"op":"gt","fieldId":"{ID}","value":1}}"#),
            format!(r#"{{"op":"gte","fieldId":"{ID}","value":1}}"#),
            format!(r#"{{"op":"between","fieldId":"{ID}","lower":1,"upper":2}}"#),
            format!(r#"{{"op":"in","fieldId":"{ID}","values":[1,2]}}"#),
            format!(r#"{{"op":"contains","fieldId":"{ID}","value":"x"}}"#),
            format!(r#"{{"op":"starts-with","fieldId":"{ID}","value":"x"}}"#),
            format!(r#"{{"op":"ends-with","fieldId":"{ID}","value":"x"}}"#),
            format!(r#"{{"op":"has-any","fieldId":"{ID}","values":["a"]}}"#),
            format!(r#"{{"op":"has-all","fieldId":"{ID}","values":["a"]}}"#),
            format!(r#"{{"op":"relation-has","fieldId":"{ID}","rowId":"{OTHER_ID}"}}"#),
        ];
        for case in &cases {
            let node: FilterNode = serde_json::from_str(case).unwrap();
            assert_eq!(&serde_json::to_string(&node).unwrap(), case);
        }
        // Unknown ops and missing members are rejected.
        assert!(serde_json::from_str::<FilterNode>(r#"{"op":"regex","fieldId":"x"}"#).is_err());
        assert!(
            serde_json::from_str::<FilterNode>(&format!(r#"{{"op":"eq","fieldId":"{ID}"}}"#))
                .is_err()
        );
    }
}
