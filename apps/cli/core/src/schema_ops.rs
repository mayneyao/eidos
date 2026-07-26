//! Revision-checked Eidos File schema mutations used by the agent CLI.
//!
//! This alpha deliberately implements the high-value stored-field surface:
//! table lifecycle, stored scalar/list fields, forward Relations, display
//! renames, File title/default Table, and safe deletion. Formula, Lookup, and
//! inverse-Relation creation remains unsupported; existing definitions are
//! preserved and exposed by schema inspection.

use std::collections::HashSet;

use rusqlite::{Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::ddl;
use crate::error::{EidosError, Result};
use crate::id::generate_uuidv7;
use crate::jcs;
use crate::model::{
    FieldMeta, FieldType, OnDeletePolicy, RelationCardinality, RelationDirection,
    RelationFieldMeta, SystemRole, TableMeta, load_fields, load_file_meta, load_relation_fields,
    load_tables, load_views,
};
use crate::naming::{
    PhysicalNameKind, assert_display_name, eidos_file_physical_name, quote_identifier,
};
use crate::relation;
use crate::time::now_instant;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all_fields = "camelCase")]
pub enum SchemaLeafChange {
    #[serde(rename = "create-table")]
    CreateTable {
        client_key: String,
        name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        position: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        settings: Option<JsonValue>,
        fields: Vec<NewField>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        label_field_client_key: Option<String>,
    },
    #[serde(rename = "create-field")]
    CreateField { table_id: String, field: NewField },
    #[serde(rename = "rename-table")]
    RenameTable { table_id: String, name: String },
    #[serde(rename = "rename-field")]
    RenameField { field_id: String, name: String },
    #[serde(rename = "delete-table")]
    DeleteTable { table_id: String },
    #[serde(rename = "delete-field")]
    DeleteField {
        field_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        replacement_label_field_id: Option<String>,
    },
    #[serde(rename = "set-file-title")]
    SetFileTitle { title: String },
    #[serde(rename = "set-default-table")]
    SetDefaultTable { table_id: Option<String> },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewField {
    pub client_key: String,
    pub name: String,
    pub kind: FieldType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nullable: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub settings: Option<JsonValue>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub definition: Option<JsonValue>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedSchemaObject {
    pub id: String,
    pub object: CreatedObjectKind,
    pub client_key: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CreatedObjectKind {
    Table,
    Field,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaChangeResult {
    pub revision: String,
    pub changed: bool,
    pub created_objects: Vec<CreatedSchemaObject>,
}

#[derive(Debug, Clone)]
struct PreparedField {
    id: String,
    client_key: String,
    name: String,
    physical_name: String,
    kind: FieldType,
    nullable: bool,
    position: i64,
    settings_json: String,
    relation: Option<RelationFieldMeta>,
}

fn parse_i64(value: Option<&str>, fallback: i64, label: &str) -> Result<i64> {
    let Some(value) = value else {
        return Ok(fallback);
    };
    let unsigned = value.strip_prefix('-').unwrap_or(value);
    let canonical = !unsigned.is_empty()
        && unsigned.bytes().all(|byte| byte.is_ascii_digit())
        && (unsigned.len() == 1 || !unsigned.starts_with('0'))
        && value != "-0";
    if !canonical {
        return Err(EidosError::InvalidValue(format!(
            "{label} {value:?} is not a canonical int64 decimal string"
        )));
    }
    value
        .parse()
        .map_err(|_| EidosError::InvalidValue(format!("{label} exceeds int64")))
}

fn settings_json(value: Option<&JsonValue>) -> Result<String> {
    let value = value.cloned().unwrap_or_else(|| serde_json::json!({}));
    if !value.is_object() {
        return Err(EidosError::InvalidValue(
            "field/table settings must be a JSON object".into(),
        ));
    }
    jcs::to_jcs(&value)
}

fn nullable(kind: FieldType, requested: Option<bool>) -> Result<bool> {
    let fixed = match kind {
        FieldType::MultiSelect | FieldType::File | FieldType::Relation => Some(false),
        FieldType::Formula | FieldType::Lookup => Some(true),
        _ => None,
    };
    if let Some(fixed) = fixed {
        if requested.is_some_and(|requested| requested != fixed) {
            return Err(EidosError::InvalidRequest(format!(
                "{} fields have nullable fixed to {fixed}",
                kind.as_str()
            )));
        }
        Ok(fixed)
    } else {
        Ok(requested.unwrap_or(true))
    }
}

fn unsupported_virtual(kind: FieldType) -> Result<()> {
    if matches!(kind, FieldType::Formula | FieldType::Lookup) {
        return Err(EidosError::InvalidRequest(format!(
            "creating {} fields is not supported by the Rust CLI alpha; existing definitions are preserved",
            kind.as_str()
        )));
    }
    Ok(())
}

fn date_check(column: &str) -> String {
    format!(
        "{column} IS NULL OR (length(CAST({column} AS BLOB))=10 AND {column} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr({column},1,4)<>'0000' AND coalesce(strftime('%Y-%m-%d',{column},'+0 days')={column},0))"
    )
}

fn instant_check(column: &str) -> String {
    format!(
        "{column} IS NULL OR (length(CAST({column} AS BLOB))=24 AND {column} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND substr({column},1,4)<>'0000' AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ',{column},'+0 seconds')={column},0))"
    )
}

fn uuid_check(column: &str) -> String {
    format!(
        "length(CAST({column} AS BLOB))=36 AND instr({column},char(0))=0 AND substr({column},9,1)='-' AND substr({column},14,1)='-' AND substr({column},15,1)='7' AND substr({column},19,1)='-' AND substr({column},20,1) IN ('8','9','a','b') AND substr({column},24,1)='-' AND lower({column})={column} AND length(CAST(replace({column},'-','') AS BLOB))=32 AND replace({column},'-','') NOT GLOB '*[^0-9a-f]*'"
    )
}

fn column_sql(name: &str, kind: FieldType, nullable: bool) -> Result<String> {
    let column = quote_identifier(name)?;
    let nullability = if nullable { "" } else { " NOT NULL" };
    Ok(match kind {
        FieldType::Text | FieldType::Url | FieldType::Select => {
            format!("{column} TEXT{nullability}")
        }
        FieldType::Number => format!("{column} REAL{nullability}"),
        FieldType::Integer => format!("{column} INTEGER{nullability}"),
        FieldType::Checkbox => {
            format!("{column} INTEGER{nullability} CHECK({column} IS NULL OR {column} IN (0,1))")
        }
        FieldType::Date => {
            format!("{column} TEXT{nullability} CHECK({})", date_check(&column))
        }
        FieldType::Datetime => format!(
            "{column} TEXT{nullability} CHECK({})",
            instant_check(&column)
        ),
        FieldType::Json => {
            format!("{column} TEXT{nullability} CHECK({column} IS NULL OR json_valid({column}))")
        }
        FieldType::MultiSelect | FieldType::File | FieldType::Relation => format!(
            "{column} TEXT NOT NULL DEFAULT '[]' CHECK(json_valid({column}) AND json_type({column})='array')"
        ),
        FieldType::Formula | FieldType::Lookup => {
            return Err(EidosError::InvalidRequest(format!(
                "{} is a virtual field and has no stored column",
                kind.as_str()
            )));
        }
    })
}

fn system_column_sql() -> Vec<String> {
    vec![
        format!(
            "\"_id\" TEXT PRIMARY KEY COLLATE BINARY CHECK({})",
            uuid_check("\"_id\"")
        ),
        format!(
            "\"_created_at\" TEXT NOT NULL CHECK({})",
            instant_check("\"_created_at\"")
        ),
        format!(
            "\"_updated_at\" TEXT NOT NULL CHECK({})",
            instant_check("\"_updated_at\"")
        ),
    ]
}

fn parse_relation(field_id: &str, definition: Option<&JsonValue>) -> Result<RelationFieldMeta> {
    let definition = definition.and_then(JsonValue::as_object).ok_or_else(|| {
        EidosError::InvalidRequest("Relation field requires definition object".into())
    })?;
    let direction = definition
        .get("direction")
        .and_then(JsonValue::as_str)
        .unwrap_or("forward");
    if direction != "forward" {
        return Err(EidosError::InvalidRequest(
            "inverse Relation creation is not supported by the Rust CLI alpha".into(),
        ));
    }
    let target_table_id = definition
        .get("targetTableId")
        .and_then(JsonValue::as_str)
        .ok_or_else(|| {
            EidosError::InvalidRequest("Relation definition requires targetTableId".into())
        })?
        .to_string();
    let cardinality = RelationCardinality::from_spec_str(
        definition
            .get("cardinality")
            .and_then(JsonValue::as_str)
            .unwrap_or("many"),
    )?;
    let on_delete = OnDeletePolicy::from_spec_str(
        definition
            .get("onDelete")
            .and_then(JsonValue::as_str)
            .unwrap_or("restrict"),
    )?;
    Ok(RelationFieldMeta {
        field_id: field_id.to_string(),
        direction: RelationDirection::Forward,
        target_table_id,
        cardinality,
        inverse_of_field_id: None,
        on_delete: Some(on_delete),
    })
}

fn prepare_field(
    field: &NewField,
    index: usize,
    existing_names: &mut Vec<String>,
) -> Result<PreparedField> {
    if field.client_key.is_empty() {
        return Err(EidosError::InvalidRequest(
            "field clientKey must be non-empty".into(),
        ));
    }
    assert_display_name(&field.name, "Field name")?;
    unsupported_virtual(field.kind)?;
    let id = generate_uuidv7();
    let physical_name =
        eidos_file_physical_name(PhysicalNameKind::Field, &field.name, &id, existing_names)?;
    existing_names.push(physical_name.clone());
    let relation = if field.kind == FieldType::Relation {
        Some(parse_relation(&id, field.definition.as_ref())?)
    } else {
        if field.definition.is_some() {
            return Err(EidosError::InvalidRequest(format!(
                "{} field must not carry definition",
                field.kind.as_str()
            )));
        }
        None
    };
    Ok(PreparedField {
        id,
        client_key: field.client_key.clone(),
        name: field.name.clone(),
        physical_name,
        kind: field.kind,
        nullable: nullable(field.kind, field.nullable)?,
        position: parse_i64(field.position.as_deref(), index as i64, "field position")?,
        settings_json: settings_json(field.settings.as_ref())?,
        relation,
    })
}

fn check_revision(conn: &Connection, expected: Option<&str>) -> Result<(i64, String)> {
    let meta = load_file_meta(conn)?;
    if let Some(expected) = expected {
        let parsed = parse_i64(Some(expected), 0, "expectedRevision")?;
        if parsed < 0 {
            return Err(EidosError::InvalidValue(
                "expectedRevision must be non-negative".into(),
            ));
        }
        if parsed != meta.revision {
            return Err(EidosError::StaleRevision {
                current_revision: meta.revision.to_string(),
            });
        }
    }
    Ok((meta.revision, meta.file_id))
}

fn insert_field_meta(
    conn: &Connection,
    table_id: &str,
    field: &PreparedField,
    instant: &str,
) -> Result<()> {
    conn.execute(
        "INSERT INTO eidos__fields(id,table_id,name,physical_name,type,system_role,nullable,position,settings_json,created_at,updated_at) VALUES(?,?,?,?,?,NULL,?,?,?,?,?)",
        rusqlite::params![
            field.id,
            table_id,
            field.name,
            field.physical_name,
            field.kind.as_str(),
            i64::from(field.nullable),
            field.position,
            field.settings_json,
            instant,
            instant,
        ],
    )?;
    if let Some(relation) = &field.relation {
        conn.execute(
            "INSERT INTO eidos__relation_fields(field_id,direction,target_table_id,cardinality,inverse_of_field_id,on_delete) VALUES(?,'forward',?,?,NULL,?)",
            rusqlite::params![
                relation.field_id,
                relation.target_table_id,
                relation.cardinality.as_str(),
                relation.on_delete.map(OnDeletePolicy::as_str),
            ],
        )?;
    }
    Ok(())
}

fn install_relation_triggers(
    conn: &Connection,
    field: &PreparedField,
    source_table: &TableMeta,
    tables: &[TableMeta],
) -> Result<()> {
    let Some(definition) = &field.relation else {
        return Ok(());
    };
    let target = tables
        .iter()
        .find(|table| table.id == definition.target_table_id)
        .ok_or_else(|| {
            EidosError::NotFound(format!(
                "Relation target table {}",
                definition.target_table_id
            ))
        })?;
    for statement in relation::relation_triggers_sql(
        definition,
        &source_table.physical_name,
        &field.physical_name,
        &target.physical_name,
    )? {
        conn.execute_batch(&statement)?;
    }
    Ok(())
}

fn label_compatible(field: &PreparedField) -> bool {
    matches!(
        field.kind,
        FieldType::Text
            | FieldType::Number
            | FieldType::Integer
            | FieldType::Checkbox
            | FieldType::Date
            | FieldType::Datetime
            | FieldType::Url
            | FieldType::Select
    )
}

struct CreateTableInput<'a> {
    client_key: &'a str,
    name: &'a str,
    position: Option<&'a str>,
    settings: Option<&'a JsonValue>,
    fields: &'a [NewField],
    label_field_client_key: Option<&'a str>,
}

fn create_table(
    conn: &Connection,
    input: CreateTableInput<'_>,
    instant: &str,
) -> Result<Vec<CreatedSchemaObject>> {
    let CreateTableInput {
        client_key,
        name,
        position,
        settings,
        fields,
        label_field_client_key,
    } = input;
    if client_key.is_empty() {
        return Err(EidosError::InvalidRequest(
            "table clientKey must be non-empty".into(),
        ));
    }
    assert_display_name(name, "Table name")?;
    let mut client_keys = HashSet::new();
    for field in fields {
        if !client_keys.insert(field.client_key.as_str()) {
            return Err(EidosError::InvalidRequest(format!(
                "duplicate field clientKey {:?}",
                field.client_key
            )));
        }
        if field.kind == FieldType::Relation {
            return Err(EidosError::InvalidRequest(
                "Relation fields cannot be created inside create-table; create the table first, then use create-field"
                    .into(),
            ));
        }
    }
    let tables = load_tables(conn)?;
    let table_id = generate_uuidv7();
    let table_physical = eidos_file_physical_name(
        PhysicalNameKind::Table,
        name,
        &table_id,
        &tables
            .iter()
            .map(|table| table.physical_name.clone())
            .collect::<Vec<_>>(),
    )?;
    let mut existing_fields = vec![
        "_id".to_string(),
        "_created_at".to_string(),
        "_updated_at".to_string(),
    ];
    let prepared = fields
        .iter()
        .enumerate()
        .map(|(index, field)| prepare_field(field, index, &mut existing_fields))
        .collect::<Result<Vec<_>>>()?;
    let label_field_id = if let Some(client_key) = label_field_client_key {
        let field = prepared
            .iter()
            .find(|field| field.client_key == client_key)
            .ok_or_else(|| {
                EidosError::InvalidRequest(format!(
                    "labelFieldClientKey {client_key:?} does not identify a supplied field"
                ))
            })?;
        if !label_compatible(field) {
            return Err(EidosError::InvalidRequest(format!(
                "field {:?} cannot be a record label",
                field.name
            )));
        }
        field.id.clone()
    } else {
        prepared
            .iter()
            .find(|field| label_compatible(field))
            .map(|field| field.id.clone())
            .unwrap_or_else(generate_uuidv7)
    };
    let row_id = if prepared.iter().any(|field| field.id == label_field_id) {
        generate_uuidv7()
    } else {
        label_field_id.clone()
    };
    let created_id = generate_uuidv7();
    let updated_id = generate_uuidv7();
    let mut definitions = system_column_sql();
    for field in &prepared {
        definitions.push(column_sql(
            &field.physical_name,
            field.kind,
            field.nullable,
        )?);
    }
    conn.execute_batch(&format!(
        "CREATE TABLE {} ({}) STRICT, WITHOUT ROWID",
        quote_identifier(&table_physical)?,
        definitions.join(", ")
    ))?;
    let table_position = parse_i64(position, tables.len() as i64, "table position")?;
    conn.execute(
        "INSERT INTO eidos__tables(id,name,physical_name,label_field_id,position,settings_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
        rusqlite::params![
            table_id,
            name,
            table_physical,
            label_field_id,
            table_position,
            settings_json(settings)?,
            instant,
            instant,
        ],
    )?;
    for (id, name, field_type, role, position) in [
        (&row_id, "_id", "text", SystemRole::RowId, -3_i64),
        (
            &created_id,
            "_created_at",
            "datetime",
            SystemRole::CreatedTime,
            -2_i64,
        ),
        (
            &updated_id,
            "_updated_at",
            "datetime",
            SystemRole::UpdatedTime,
            -1_i64,
        ),
    ] {
        conn.execute(
            "INSERT INTO eidos__fields(id,table_id,name,physical_name,type,system_role,nullable,position,settings_json,created_at,updated_at) VALUES(?,?,?,?,?,?,0,?,'{}',?,?)",
            rusqlite::params![id, table_id, name, name, field_type, role.as_str(), position, instant, instant],
        )?;
    }
    for field in &prepared {
        insert_field_meta(conn, &table_id, field, instant)?;
    }
    conn.execute_batch(&relation::row_id_immutable_trigger_sql(
        &table_id,
        &table_physical,
    )?)?;
    let mut created = vec![CreatedSchemaObject {
        id: table_id,
        object: CreatedObjectKind::Table,
        client_key: client_key.to_string(),
    }];
    created.extend(prepared.into_iter().map(|field| CreatedSchemaObject {
        id: field.id,
        object: CreatedObjectKind::Field,
        client_key: field.client_key,
    }));
    Ok(created)
}

fn create_field(
    conn: &Connection,
    table_id: &str,
    field: &NewField,
    instant: &str,
) -> Result<Vec<CreatedSchemaObject>> {
    let tables = load_tables(conn)?;
    let table = tables
        .iter()
        .find(|table| table.id == table_id)
        .ok_or_else(|| EidosError::NotFound(format!("table {table_id}")))?;
    let all_fields = load_fields(conn)?;
    let table_fields: Vec<FieldMeta> = all_fields
        .into_iter()
        .filter(|field| field.table_id == table_id)
        .collect();
    let mut existing = table_fields
        .iter()
        .filter_map(|field| field.physical_name.clone())
        .collect();
    let mut prepared = prepare_field(field, table_fields.len(), &mut existing)?;
    if prepared.relation.is_some()
        && !tables
            .iter()
            .any(|table| Some(&table.id) == prepared.relation.as_ref().map(|r| &r.target_table_id))
    {
        return Err(EidosError::NotFound("Relation target table".into()));
    }
    let rows: i64 = conn.query_row(
        &format!(
            "SELECT COUNT(*) FROM {}",
            quote_identifier(&table.physical_name)?
        ),
        [],
        |row| row.get(0),
    )?;
    if rows > 0
        && !prepared.nullable
        && !matches!(
            prepared.kind,
            FieldType::MultiSelect | FieldType::File | FieldType::Relation
        )
    {
        return Err(EidosError::Forbidden(format!(
            "cannot add non-nullable field {:?} to a non-empty table without an explicit conversion",
            prepared.name
        )));
    }
    if field.position.is_none() {
        prepared.position = table_fields
            .iter()
            .filter(|field| field.system_role.is_none())
            .map(|field| field.position)
            .max()
            .unwrap_or(-1)
            + 1;
    }
    conn.execute_batch(&format!(
        "ALTER TABLE {} ADD COLUMN {}",
        quote_identifier(&table.physical_name)?,
        column_sql(&prepared.physical_name, prepared.kind, prepared.nullable)?
    ))?;
    insert_field_meta(conn, table_id, &prepared, instant)?;
    install_relation_triggers(conn, &prepared, table, &tables)?;
    conn.execute(
        "UPDATE eidos__tables SET updated_at=? WHERE id=?",
        rusqlite::params![instant, table_id],
    )?;
    Ok(vec![CreatedSchemaObject {
        id: prepared.id,
        object: CreatedObjectKind::Field,
        client_key: prepared.client_key,
    }])
}

fn field_by_id(conn: &Connection, field_id: &str) -> Result<FieldMeta> {
    load_fields(conn)?
        .into_iter()
        .find(|field| field.id == field_id)
        .ok_or_else(|| EidosError::NotFound(format!("field {field_id}")))
}

fn table_by_id(conn: &Connection, table_id: &str) -> Result<TableMeta> {
    load_tables(conn)?
        .into_iter()
        .find(|table| table.id == table_id)
        .ok_or_else(|| EidosError::NotFound(format!("table {table_id}")))
}

fn rename_table(conn: &Connection, table_id: &str, name: &str, instant: &str) -> Result<bool> {
    assert_display_name(name, "Table name")?;
    let table = table_by_id(conn, table_id)?;
    if table.name == name {
        return Ok(false);
    }
    let tables = load_tables(conn)?;
    let physical = eidos_file_physical_name(
        PhysicalNameKind::Table,
        name,
        table_id,
        &tables
            .iter()
            .filter(|other| other.id != table_id)
            .map(|other| other.physical_name.clone())
            .collect::<Vec<_>>(),
    )?;
    if physical != table.physical_name {
        conn.execute_batch(&format!(
            "ALTER TABLE {} RENAME TO {}",
            quote_identifier(&table.physical_name)?,
            quote_identifier(&physical)?
        ))?;
    }
    conn.execute(
        "UPDATE eidos__tables SET name=?,physical_name=?,updated_at=? WHERE id=?",
        rusqlite::params![name, physical, instant, table_id],
    )?;
    Ok(true)
}

fn rename_field(conn: &Connection, field_id: &str, name: &str, instant: &str) -> Result<bool> {
    assert_display_name(name, "Field name")?;
    let field = field_by_id(conn, field_id)?;
    if field.system_role.is_some() {
        return Err(EidosError::Forbidden(
            "system fields cannot be renamed".into(),
        ));
    }
    if field.name == name {
        return Ok(false);
    }
    let formula_count: i64 = conn.query_row(
        "SELECT count(*) FROM eidos__formula_fields ff JOIN eidos__fields f ON f.id=ff.field_id WHERE f.table_id=?",
        [field.table_id.as_str()],
        |row| row.get(0),
    )?;
    if formula_count > 0 {
        return Err(EidosError::Forbidden(
            "renaming fields in a table with Formula definitions requires Formula AST rewrite, which the Rust CLI alpha does not implement".into(),
        ));
    }
    let table = table_by_id(conn, &field.table_id)?;
    let fields = load_fields(conn)?;
    let physical = field
        .physical_name
        .as_ref()
        .map(|old| {
            eidos_file_physical_name(
                PhysicalNameKind::Field,
                name,
                field_id,
                &fields
                    .iter()
                    .filter(|other| other.table_id == field.table_id && other.id != field_id)
                    .filter_map(|other| other.physical_name.clone())
                    .collect::<Vec<_>>(),
            )
            .map(|new| (old.clone(), new))
        })
        .transpose()?;
    if let Some((old, new)) = &physical
        && old != new
    {
        conn.execute_batch(&format!(
            "ALTER TABLE {} RENAME COLUMN {} TO {}",
            quote_identifier(&table.physical_name)?,
            quote_identifier(old)?,
            quote_identifier(new)?
        ))?;
    }
    conn.execute(
        "UPDATE eidos__fields SET name=?,physical_name=coalesce(?,physical_name),updated_at=? WHERE id=?",
        rusqlite::params![name, physical.as_ref().map(|(_, new)| new), instant, field_id],
    )?;
    conn.execute(
        "UPDATE eidos__tables SET updated_at=? WHERE id=?",
        rusqlite::params![instant, field.table_id],
    )?;
    Ok(true)
}

fn delete_table(conn: &Connection, table_id: &str) -> Result<()> {
    let table = table_by_id(conn, table_id)?;
    let meta = load_file_meta(conn)?;
    if meta.default_table_id.as_deref() == Some(table_id) {
        return Err(EidosError::Forbidden(
            "clear or change defaultTableId before deleting its table".into(),
        ));
    }
    if load_relation_fields(conn)?
        .iter()
        .any(|relation| relation.target_table_id == table_id)
    {
        return Err(EidosError::Forbidden(
            "cannot delete a table targeted by a Relation field".into(),
        ));
    }
    conn.execute_batch(&format!(
        "DROP TABLE {}",
        quote_identifier(&table.physical_name)?
    ))?;
    conn.execute("DELETE FROM eidos__tables WHERE id=?", [table_id])?;
    Ok(())
}

fn label_field_allowed(field: &FieldMeta) -> bool {
    field.system_role == Some(SystemRole::RowId)
        || matches!(
            field.field_type,
            FieldType::Text
                | FieldType::Number
                | FieldType::Integer
                | FieldType::Checkbox
                | FieldType::Date
                | FieldType::Datetime
                | FieldType::Url
                | FieldType::Select
                | FieldType::Formula
        )
}

fn delete_field(
    conn: &Connection,
    field_id: &str,
    replacement_label_field_id: Option<&str>,
    instant: &str,
) -> Result<()> {
    let field = field_by_id(conn, field_id)?;
    if field.system_role.is_some() {
        return Err(EidosError::Forbidden(
            "system fields cannot be deleted".into(),
        ));
    }
    let table = table_by_id(conn, &field.table_id)?;
    if table.label_field_id == field_id {
        let replacement_id = replacement_label_field_id.ok_or_else(|| {
            EidosError::Forbidden(
                "deleting the record-label field requires replacementLabelFieldId".into(),
            )
        })?;
        let replacement = field_by_id(conn, replacement_id)?;
        if replacement.table_id != field.table_id || !label_field_allowed(&replacement) {
            return Err(EidosError::InvalidRequest(
                "replacement label field must be a compatible field in the same table".into(),
            ));
        }
        conn.execute(
            "UPDATE eidos__tables SET label_field_id=?,updated_at=? WHERE id=?",
            rusqlite::params![replacement_id, instant, field.table_id],
        )?;
    }
    let dependency: Option<String> = conn
        .query_row(
            "SELECT 'inverse relation' FROM eidos__relation_fields WHERE inverse_of_field_id=? UNION ALL SELECT 'lookup' FROM eidos__lookup_fields WHERE relation_field_id=? OR target_field_id=? LIMIT 1",
            rusqlite::params![field_id, field_id, field_id],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(dependency) = dependency {
        return Err(EidosError::Forbidden(format!(
            "field is referenced by a {dependency} definition"
        )));
    }
    if load_views(conn)?.iter().any(|view| {
        view.table_id == field.table_id
            && (view.query_json.contains(field_id) || view.layout_json.contains(field_id))
    }) {
        return Err(EidosError::Forbidden(
            "field is referenced by a saved View; update or delete the View first".into(),
        ));
    }
    if field.field_type == FieldType::Relation {
        for statement in relation::relation_drop_triggers_sql(field_id)? {
            conn.execute_batch(&statement)?;
        }
    }
    if let Some(physical) = &field.physical_name {
        conn.execute_batch(&format!(
            "ALTER TABLE {} DROP COLUMN {}",
            quote_identifier(&table.physical_name)?,
            quote_identifier(physical)?
        ))?;
    }
    conn.execute("DELETE FROM eidos__fields WHERE id=?", [field_id])?;
    conn.execute(
        "UPDATE eidos__tables SET updated_at=? WHERE id=?",
        rusqlite::params![instant, field.table_id],
    )?;
    Ok(())
}

fn apply_inner(
    conn: &Connection,
    change: &SchemaLeafChange,
    instant: &str,
) -> Result<(bool, Vec<CreatedSchemaObject>)> {
    match change {
        SchemaLeafChange::CreateTable {
            client_key,
            name,
            position,
            settings,
            fields,
            label_field_client_key,
        } => Ok((
            true,
            create_table(
                conn,
                CreateTableInput {
                    client_key,
                    name,
                    position: position.as_deref(),
                    settings: settings.as_ref(),
                    fields,
                    label_field_client_key: label_field_client_key.as_deref(),
                },
                instant,
            )?,
        )),
        SchemaLeafChange::CreateField { table_id, field } => {
            Ok((true, create_field(conn, table_id, field, instant)?))
        }
        SchemaLeafChange::RenameTable { table_id, name } => {
            Ok((rename_table(conn, table_id, name, instant)?, Vec::new()))
        }
        SchemaLeafChange::RenameField { field_id, name } => {
            Ok((rename_field(conn, field_id, name, instant)?, Vec::new()))
        }
        SchemaLeafChange::DeleteTable { table_id } => {
            delete_table(conn, table_id)?;
            Ok((true, Vec::new()))
        }
        SchemaLeafChange::DeleteField {
            field_id,
            replacement_label_field_id,
        } => {
            delete_field(
                conn,
                field_id,
                replacement_label_field_id.as_deref(),
                instant,
            )?;
            Ok((true, Vec::new()))
        }
        SchemaLeafChange::SetFileTitle { title } => {
            assert_display_name(title, "File title")?;
            let meta = load_file_meta(conn)?;
            if meta.title == *title {
                Ok((false, Vec::new()))
            } else {
                conn.execute(
                    "UPDATE eidos__meta SET title=? WHERE singleton=1",
                    [title.as_str()],
                )?;
                Ok((true, Vec::new()))
            }
        }
        SchemaLeafChange::SetDefaultTable { table_id } => {
            if let Some(table_id) = table_id {
                table_by_id(conn, table_id)?;
            }
            let meta = load_file_meta(conn)?;
            if meta.default_table_id == *table_id {
                Ok((false, Vec::new()))
            } else {
                conn.execute(
                    "UPDATE eidos__meta SET default_table_id=? WHERE singleton=1",
                    [table_id],
                )?;
                Ok((true, Vec::new()))
            }
        }
    }
}

fn ensure_foreign_keys(conn: &Connection) -> Result<()> {
    let mut statement = conn.prepare("PRAGMA foreign_key_check")?;
    if statement.query([])?.next()?.is_some() {
        return Err(EidosError::InvalidSchema(
            "schema change would leave a foreign-key violation".into(),
        ));
    }
    Ok(())
}

fn run_change(
    conn: &mut Connection,
    change: &SchemaLeafChange,
    expected_revision: Option<&str>,
    commit: bool,
) -> Result<SchemaChangeResult> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let (current_revision, _) = check_revision(&tx, expected_revision)?;
    let instant = now_instant();
    let (changed, created_objects) = apply_inner(&tx, change, &instant)?;
    let revision = if changed {
        ensure_foreign_keys(&tx)?;
        ddl::increment_revision(&tx, &instant)?
    } else {
        current_revision
    };
    if commit && changed {
        tx.commit()?;
    } else {
        tx.rollback()?;
    }
    Ok(SchemaChangeResult {
        revision: revision.to_string(),
        changed,
        created_objects,
    })
}

pub fn apply_schema_change(
    conn: &mut Connection,
    change: &SchemaLeafChange,
    expected_revision: Option<&str>,
) -> Result<SchemaChangeResult> {
    run_change(conn, change, expected_revision, true)
}

/// Execute the exact schema operation inside an IMMEDIATE transaction and
/// roll it back. The returned revision is the revision that a real apply would
/// produce if the base revision remains unchanged.
pub fn preview_schema_change(
    conn: &mut Connection,
    change: &SchemaLeafChange,
    expected_revision: Option<&str>,
) -> Result<SchemaChangeResult> {
    run_change(conn, change, expected_revision, false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text_field(client_key: &str, name: &str) -> NewField {
        NewField {
            client_key: client_key.into(),
            name: name.into(),
            kind: FieldType::Text,
            position: None,
            nullable: Some(false),
            settings: None,
            definition: None,
        }
    }

    #[test]
    fn create_table_preview_rolls_back_and_apply_commits() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("schema.eidos");
        ddl::create_eidos_file(&path, Some("Schema")).unwrap();
        let mut conn = Connection::open(path).unwrap();
        ddl::configure_connection(&conn).unwrap();
        let change = SchemaLeafChange::CreateTable {
            client_key: "t".into(),
            name: "Tasks".into(),
            position: None,
            settings: None,
            fields: vec![text_field("title", "Title")],
            label_field_client_key: Some("title".into()),
        };
        let preview = preview_schema_change(&mut conn, &change, Some("0")).unwrap();
        assert!(preview.changed);
        assert_eq!(preview.revision, "1");
        assert!(load_tables(&conn).unwrap().is_empty());

        let result = apply_schema_change(&mut conn, &change, Some("0")).unwrap();
        assert_eq!(result.revision, "1");
        assert_eq!(load_tables(&conn).unwrap()[0].name, "Tasks");
    }

    #[test]
    fn schema_wire_round_trip() {
        let text = r#"{"kind":"create-table","clientKey":"t1","name":"Tasks","fields":[{"clientKey":"f1","name":"Title","kind":"text"}],"labelFieldClientKey":"f1"}"#;
        let change: SchemaLeafChange = serde_json::from_str(text).unwrap();
        assert_eq!(serde_json::to_string(&change).unwrap(), text);
    }
}
