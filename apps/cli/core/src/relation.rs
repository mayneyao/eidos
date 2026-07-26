//! Relation trigger and index naming (spec §10.4, §15), trigger SQL
//! generation, and the set-based delete-policy preflight.
//!
//! All generated object names use the canonical UUID with hyphens removed
//! (`<field-id-hex>` / `<table-id-hex>`); that hex is only an identifier
//! suffix, never an alternative ID representation (spec §5.1).
//!
//! The trigger bodies in [`relation_triggers_sql`] and
//! [`row_id_immutable_trigger_sql`] are ported VERBATIM from the §10.4
//! templates (parameterized by quoted physical names and the canonical
//! trigger names). They are a single-target safety net: the conforming
//! set-based delete path is [`preflight_delete_policy`], which runs before
//! any physical row delete and binds the operation's one canonical instant.

use std::collections::{BTreeMap, HashMap, HashSet};

use rusqlite::Connection;
use serde_json::Value as JsonValue;

use crate::error::{EidosError, Result};
use crate::id::uuid_hex;
use crate::jcs;
use crate::model::{
    FieldMeta, OnDeletePolicy, RelationDirection, RelationFieldMeta, TableMeta, load_fields,
    load_relation_fields, load_tables,
};
use crate::naming::quote_identifier;

/// `eidos__relation_validate_insert__<field-id-hex>` (spec §10.4).
pub fn relation_validate_insert_trigger_name(field_id: &str) -> Result<String> {
    Ok(format!(
        "eidos__relation_validate_insert__{}",
        uuid_hex(field_id)?
    ))
}

/// `eidos__relation_validate_update__<field-id-hex>` (spec §10.4).
pub fn relation_validate_update_trigger_name(field_id: &str) -> Result<String> {
    Ok(format!(
        "eidos__relation_validate_update__{}",
        uuid_hex(field_id)?
    ))
}

/// `eidos__relation_restrict__<field-id-hex>` (spec §10.4).
pub fn relation_restrict_trigger_name(field_id: &str) -> Result<String> {
    Ok(format!("eidos__relation_restrict__{}", uuid_hex(field_id)?))
}

/// `eidos__relation_detach__<field-id-hex>` (spec §10.4).
pub fn relation_detach_trigger_name(field_id: &str) -> Result<String> {
    Ok(format!("eidos__relation_detach__{}", uuid_hex(field_id)?))
}

/// `eidos__row_id_immutable__<table-id-hex>` (spec §10.4).
pub fn row_id_immutable_trigger_name(table_id: &str) -> Result<String> {
    Ok(format!("eidos__row_id_immutable__{}", uuid_hex(table_id)?))
}

/// `eidos__index__<field-id-hex>`, the reserved optional scalar access
/// index name (spec §15).
pub fn index_name(field_id: &str) -> Result<String> {
    Ok(format!("eidos__index__{}", uuid_hex(field_id)?))
}

/// The §8/§10.4 `_id` immutability trigger for one user table, ported
/// verbatim from the spec template.
pub fn row_id_immutable_trigger_sql(table_id: &str, physical_table: &str) -> Result<String> {
    let trigger = quote_identifier(&row_id_immutable_trigger_name(table_id)?)?;
    let table = quote_identifier(physical_table)?;
    Ok(format!(
        "CREATE TRIGGER {trigger}\n\
         BEFORE UPDATE OF \"_id\" ON {table}\n\
         WHEN NEW.\"_id\" IS NOT OLD.\"_id\"\n\
         BEGIN\n  \
         SELECT RAISE(ABORT, 'EIDOS_ROW_ID_IMMUTABLE');\n\
         END;"
    ))
}

/// Generates the exact §10.4 trigger SQL for one forward Relation:
/// insert/update raw-shape validation triggers, plus the target-delete
/// policy trigger (`restrict` or `detach`; `preserve` installs none).
///
/// `source_physical_table` / `target_physical_table` are the physical names
/// of the Relation's owner and target tables; a self Relation is detected
/// by their equality and switches the `<source-survives-in-scan>` /
/// `<source-survives-in-update>` arms to the `<>OLD."_id"` predicates.
pub fn relation_triggers_sql(
    relation: &RelationFieldMeta,
    source_physical_table: &str,
    relation_physical_column: &str,
    target_physical_table: &str,
) -> Result<Vec<String>> {
    if relation.direction != RelationDirection::Forward {
        return Err(EidosError::InvalidRequest(format!(
            "relation triggers exist only for forward Relations (field {})",
            relation.field_id
        )));
    }
    let field_id = relation.field_id.as_str();
    let source = quote_identifier(source_physical_table)?;
    let target = quote_identifier(target_physical_table)?;
    let column = quote_identifier(relation_physical_column)?;
    let self_relation = source_physical_table == target_physical_table;
    let survives_in_scan = if self_relation {
        "source.\"_id\"<>OLD.\"_id\""
    } else {
        "1"
    };
    let survives_in_update = if self_relation {
        format!("{source}.\"_id\"<>OLD.\"_id\"")
    } else {
        "1".to_string()
    };

    // The §10.4 INSERT/UPDATE raw-shape validation pair. For cardinality
    // `many` the final `json_array_length` clause is omitted.
    let safe_new = format!("CASE WHEN json_valid(NEW.{column}) THEN NEW.{column} ELSE '[]' END");
    let cardinality_clause = if relation.cardinality == crate::model::RelationCardinality::One {
        format!("  OR json_array_length({safe_new})>1\n")
    } else {
        String::new()
    };
    let validate_body = format!(
        "WHEN NOT json_valid(NEW.{column})\n  \
         OR json_type({safe_new})<>'array'\n  \
         OR EXISTS (\n    \
         SELECT 1\n    \
         FROM json_each({safe_new}) AS item\n    \
         WHERE item.type<>'text' OR length(CAST(item.value AS BLOB))<>36\n      \
         OR instr(item.value,char(0))<>0\n      \
         OR substr(item.value,9,1)<>'-' OR substr(item.value,14,1)<>'-'\n      \
         OR substr(item.value,15,1)<>'7' OR substr(item.value,19,1)<>'-'\n      \
         OR substr(item.value,20,1) NOT IN ('8','9','a','b')\n      \
         OR substr(item.value,24,1)<>'-' OR lower(item.value)<>item.value\n      \
         OR length(CAST(replace(item.value,'-','') AS BLOB))<>32\n      \
         OR replace(item.value,'-','') GLOB '*[^0-9a-f]*'\n  \
         )\n  \
         OR (SELECT count(*) FROM json_each({safe_new}))\n     \
         <> (SELECT count(DISTINCT value COLLATE BINARY) FROM json_each({safe_new}))\n\
         {cardinality_clause}\
         BEGIN\n  \
         SELECT RAISE(ABORT,'EIDOS_RELATION_INVALID');\n\
         END;"
    );
    let mut statements = vec![
        format!(
            "CREATE TRIGGER {}\nBEFORE INSERT ON {source}\n{validate_body}",
            quote_identifier(&relation_validate_insert_trigger_name(field_id)?)?
        ),
        format!(
            "CREATE TRIGGER {}\nBEFORE UPDATE OF {column} ON {source}\n{validate_body}",
            quote_identifier(&relation_validate_update_trigger_name(field_id)?)?
        ),
    ];

    let policy = relation.on_delete.unwrap_or(OnDeletePolicy::Restrict);
    let guard = format!(
        "WHEN EXISTS (\n  \
         SELECT 1\n  \
         FROM {source} AS source,\n       \
         json_each(CASE WHEN json_valid(source.{column})\n                      \
         THEN source.{column} ELSE '[]' END) AS item\n  \
         WHERE item.value = OLD.\"_id\"\n    \
         AND {survives_in_scan}\n\
         )"
    );
    match policy {
        OnDeletePolicy::Preserve => {}
        OnDeletePolicy::Restrict => statements.push(format!(
            "CREATE TRIGGER {}\nBEFORE DELETE ON {target}\n{guard}\n\
             BEGIN\n  \
             SELECT RAISE(ABORT, 'EIDOS_RELATION_RESTRICT');\n\
             END;",
            quote_identifier(&relation_restrict_trigger_name(field_id)?)?
        )),
        OnDeletePolicy::Detach => statements.push(format!(
            "CREATE TRIGGER {}\nBEFORE DELETE ON {target}\n{guard}\n\
             BEGIN\n  \
             UPDATE {source}\n  \
             SET {column} = (\n        \
             SELECT coalesce(\n          \
             json_group_array(item.value ORDER BY CAST(item.key AS INTEGER)), '[]')\n        \
             FROM json_each(CASE\n          \
             WHEN json_valid({source}.{column})\n          \
             THEN {source}.{column} ELSE '[]' END) AS item\n        \
             WHERE item.value <> OLD.\"_id\"\n      \
             ),\n      \
             \"_updated_at\" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')\n  \
             WHERE {survives_in_update}\n  \
             AND EXISTS (\n    \
             SELECT 1\n    \
             FROM json_each(CASE\n      \
             WHEN json_valid({source}.{column})\n      \
             THEN {source}.{column} ELSE '[]' END) AS item\n    \
             WHERE item.value = OLD.\"_id\"\n  \
             );\n\
             END;",
            quote_identifier(&relation_detach_trigger_name(field_id)?)?
        )),
    }
    Ok(statements)
}

/// DROP statements for every trigger [`relation_triggers_sql`] may have
/// installed for one Relation Field (used by field/table deletion and
/// structural renames). `IF EXISTS` keeps this idempotent across policies.
pub fn relation_drop_triggers_sql(field_id: &str) -> Result<Vec<String>> {
    [
        relation_validate_insert_trigger_name(field_id)?,
        relation_validate_update_trigger_name(field_id)?,
        relation_restrict_trigger_name(field_id)?,
        relation_detach_trigger_name(field_id)?,
    ]
    .into_iter()
    .map(|name| quote_identifier(&name).map(|quoted| format!("DROP TRIGGER IF EXISTS {quoted}")))
    .collect::<Result<Vec<_>>>()
}

/// Preflights a logical delete operation's complete per-table Row-ID delete
/// set against surviving forward Relation arrays (spec §10.4), then performs
/// the `detach` rewrites. Must run after the operation's creates/updates are
/// applied (so an explicitly updated array is the evaluated one) and before
/// any physical row delete.
///
/// For every forward Relation whose target table appears in `delete_set`:
///
/// - `restrict`: any surviving source row whose array contains a deleted ID
///   aborts the whole operation with `invalid-request` (the installed
///   triggers remain a safety net);
/// - `detach`: every deleted ID is removed from every surviving source
///   array, preserving order, and each affected row gets exactly one
///   `_updated_at` stamp with `operation_instant`;
/// - `preserve`: surviving arrays are left unchanged.
///
/// Rows of a source table that are themselves in the delete set are not
/// surviving references, which makes self Relations, cycles, and multi-row
/// deletes independent of row visitation order.
///
/// Returns the `(table_id, row_id)` pairs changed by detach rewrites.
pub fn preflight_delete_policy(
    conn: &Connection,
    delete_set: &BTreeMap<String, Vec<String>>,
    operation_instant: &str,
) -> Result<Vec<(String, String)>> {
    let tables = load_tables(conn)?;
    let fields = load_fields(conn)?;
    let relations = load_relation_fields(conn)?;
    let table_by_id: HashMap<&str, &TableMeta> =
        tables.iter().map(|t| (t.id.as_str(), t)).collect();
    let field_by_id: HashMap<&str, &FieldMeta> =
        fields.iter().map(|f| (f.id.as_str(), f)).collect();

    let mut detached = Vec::new();
    for relation in relations
        .iter()
        .filter(|r| r.direction == RelationDirection::Forward)
    {
        let Some(deleted_ids) = delete_set.get(&relation.target_table_id) else {
            continue;
        };
        if deleted_ids.is_empty() {
            continue;
        }
        let policy = relation.on_delete.unwrap_or(OnDeletePolicy::Restrict);
        if policy == OnDeletePolicy::Preserve {
            continue;
        }
        let field = field_by_id.get(relation.field_id.as_str()).ok_or_else(|| {
            EidosError::InvalidSchema(format!(
                "eidos__relation_fields row {} has no matching eidos__fields row",
                relation.field_id
            ))
        })?;
        let source_table = table_by_id.get(field.table_id.as_str()).ok_or_else(|| {
            EidosError::InvalidSchema(format!(
                "field {} belongs to unknown table {}",
                field.id, field.table_id
            ))
        })?;
        let column = field.physical_name.as_deref().ok_or_else(|| {
            EidosError::InvalidSchema(format!(
                "forward Relation field {:?} ({}) has no physical column",
                field.name, field.id
            ))
        })?;
        let deleted: HashSet<&str> = deleted_ids.iter().map(String::as_str).collect();
        let source_deleted: HashSet<&str> = delete_set
            .get(&field.table_id)
            .map(|ids| ids.iter().map(String::as_str).collect())
            .unwrap_or_default();

        let sql = format!(
            "SELECT \"_id\", {} FROM {}",
            quote_identifier(column)?,
            quote_identifier(&source_table.physical_name)?
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        drop(stmt);

        for (row_id, array_text) in rows {
            // A source row in the operation's own delete set is not a
            // surviving incoming reference (spec §10.4).
            if source_deleted.contains(row_id.as_str()) {
                continue;
            }
            let array: Vec<String> = serde_json::from_str(&array_text).map_err(|err| {
                EidosError::InvalidSchema(format!(
                    "Relation cell of row {row_id} in table {} is not a JSON array: {err}",
                    field.table_id
                ))
            })?;
            if !array.iter().any(|id| deleted.contains(id.as_str())) {
                continue;
            }
            match policy {
                OnDeletePolicy::Restrict => {
                    let hit = array
                        .iter()
                        .find(|id| deleted.contains(id.as_str()))
                        .expect("checked above");
                    return Err(EidosError::InvalidRequest(format!(
                        "delete is restricted by Relation field {:?} ({}): \
                         surviving row {row_id} of table {} still references \
                         deleted row {hit} of table {}",
                        field.name, field.id, field.table_id, relation.target_table_id
                    )));
                }
                OnDeletePolicy::Detach => {
                    let kept: Vec<JsonValue> = array
                        .iter()
                        .filter(|id| !deleted.contains(id.as_str()))
                        .map(|id| JsonValue::String(id.clone()))
                        .collect();
                    let canonical = jcs::to_jcs(&JsonValue::Array(kept)).map_err(|_| {
                        EidosError::Internal("detach re-serialization failed".into())
                    })?;
                    conn.execute(
                        &format!(
                            "UPDATE {} SET {} = ?, \"_updated_at\" = ? WHERE \"_id\" = ?",
                            quote_identifier(&source_table.physical_name)?,
                            quote_identifier(column)?
                        ),
                        rusqlite::params![canonical, operation_instant, row_id],
                    )?;
                    detached.push((field.table_id.clone(), row_id));
                }
                OnDeletePolicy::Preserve => unreachable!("filtered above"),
            }
        }
    }
    Ok(detached)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{RelationCardinality, RelationDirection};

    const FIELD_ID: &str = "0198c72d-82b5-7968-b163-98be4b7477df";
    const TABLE_ID: &str = "0198c72d-82b5-7968-a163-98be4b7477df";
    const FIELD_HEX: &str = "0198c72d82b57968b16398be4b7477df";
    const TABLE_HEX: &str = "0198c72d82b57968a16398be4b7477df";

    #[test]
    fn generated_names_match_spec_templates() {
        assert_eq!(
            relation_validate_insert_trigger_name(FIELD_ID).unwrap(),
            format!("eidos__relation_validate_insert__{FIELD_HEX}")
        );
        assert_eq!(
            relation_validate_update_trigger_name(FIELD_ID).unwrap(),
            format!("eidos__relation_validate_update__{FIELD_HEX}")
        );
        assert_eq!(
            relation_restrict_trigger_name(FIELD_ID).unwrap(),
            format!("eidos__relation_restrict__{FIELD_HEX}")
        );
        assert_eq!(
            relation_detach_trigger_name(FIELD_ID).unwrap(),
            format!("eidos__relation_detach__{FIELD_HEX}")
        );
        assert_eq!(
            row_id_immutable_trigger_name(TABLE_ID).unwrap(),
            format!("eidos__row_id_immutable__{TABLE_HEX}")
        );
        assert_eq!(
            index_name(FIELD_ID).unwrap(),
            format!("eidos__index__{FIELD_HEX}")
        );
    }

    #[test]
    fn rejects_non_uuid_ids() {
        assert!(relation_restrict_trigger_name("not-a-uuid").is_err());
        assert!(row_id_immutable_trigger_name("").is_err());
    }

    fn relation(cardinality: RelationCardinality, on_delete: OnDeletePolicy) -> RelationFieldMeta {
        RelationFieldMeta {
            field_id: FIELD_ID.to_string(),
            direction: RelationDirection::Forward,
            target_table_id: TABLE_ID.to_string(),
            cardinality,
            inverse_of_field_id: None,
            on_delete: Some(on_delete),
        }
    }

    #[test]
    fn row_id_trigger_matches_spec_template() {
        let sql = row_id_immutable_trigger_sql(TABLE_ID, "项目 表").unwrap();
        assert_eq!(
            sql,
            format!(
                "CREATE TRIGGER \"eidos__row_id_immutable__{TABLE_HEX}\"\n\
                 BEFORE UPDATE OF \"_id\" ON \"项目 表\"\n\
                 WHEN NEW.\"_id\" IS NOT OLD.\"_id\"\n\
                 BEGIN\n  \
                 SELECT RAISE(ABORT, 'EIDOS_ROW_ID_IMMUTABLE');\n\
                 END;"
            )
        );
    }

    #[test]
    fn validate_triggers_match_spec_shape() {
        let sql = relation_triggers_sql(
            &relation(RelationCardinality::One, OnDeletePolicy::Preserve),
            "Tasks",
            "Assignee",
            "People",
        )
        .unwrap();
        assert_eq!(sql.len(), 2, "preserve installs no policy trigger");
        let insert = &sql[0];
        assert!(insert.contains("BEFORE INSERT ON \"Tasks\""));
        assert!(
            insert.contains("json_array_length("),
            "cardinality one clause"
        );
        assert!(insert.contains("EIDOS_RELATION_INVALID"));
        let update = &sql[1];
        assert!(update.contains("BEFORE UPDATE OF \"Assignee\" ON \"Tasks\""));

        let many = relation_triggers_sql(
            &relation(RelationCardinality::Many, OnDeletePolicy::Preserve),
            "Tasks",
            "Assignee",
            "People",
        )
        .unwrap();
        assert!(!many[0].contains("json_array_length"));
    }

    #[test]
    fn restrict_and_detach_triggers_match_spec_shape() {
        let restrict = relation_triggers_sql(
            &relation(RelationCardinality::Many, OnDeletePolicy::Restrict),
            "Tasks",
            "Assignee",
            "People",
        )
        .unwrap();
        let policy = &restrict[2];
        assert!(policy.contains("BEFORE DELETE ON \"People\""));
        assert!(policy.contains("FROM \"Tasks\" AS source,"));
        assert!(policy.contains("AND 1\n"), "cross-table survival arm");
        assert!(policy.contains("EIDOS_RELATION_RESTRICT"));

        let detach = relation_triggers_sql(
            &relation(RelationCardinality::Many, OnDeletePolicy::Detach),
            "Tasks",
            "Assignee",
            "People",
        )
        .unwrap();
        let policy = &detach[2];
        assert!(policy.contains("eidos__relation_detach__"));
        assert!(policy.contains("json_group_array(item.value ORDER BY CAST(item.key AS INTEGER))"));
        assert!(policy.contains("WHERE item.value <> OLD.\"_id\""));
        assert!(policy.contains("strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"));
    }

    #[test]
    fn self_relation_uses_survival_predicates() {
        let sql = relation_triggers_sql(
            &relation(RelationCardinality::Many, OnDeletePolicy::Detach),
            "Nodes",
            "Parent",
            "Nodes",
        )
        .unwrap();
        let policy = &sql[2];
        assert!(policy.contains("AND source.\"_id\"<>OLD.\"_id\""));
        assert!(policy.contains("WHERE \"Nodes\".\"_id\"<>OLD.\"_id\""));
    }

    #[test]
    fn drop_statements_cover_all_policy_names() {
        let drops = relation_drop_triggers_sql(FIELD_ID).unwrap();
        assert_eq!(drops.len(), 4);
        assert!(
            drops
                .iter()
                .all(|d| d.starts_with("DROP TRIGGER IF EXISTS"))
        );
    }
}
