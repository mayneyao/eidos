//! Integration tests for `query.rs`: FilterNode -> SQL compilation against
//! real `.eidos` files and logical row reading.
//!
//! User tables are built by executing DDL directly, mirroring file-format
//! spec §8 (STRICT, WITHOUT ROWID, `_id`/`_created_at`/`_updated_at` system
//! columns, data columns, the row-id-immutable trigger) plus the matching
//! `eidos__tables`/`eidos__fields`/`eidos__relation_fields` meta rows.

use eidos_file_core::ddl;
use eidos_file_core::id;
use eidos_file_core::model::{self, FieldMeta, FieldType, TableMeta};
use eidos_file_core::query::{
    FilterNode, NullsOrder, ReadRowsOptions, RowQuery, SearchSpec, SortDirection, SortTerm,
    compile_query, read_rows,
};
use eidos_file_core::time;
use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, params_from_iter};
use serde_json::{Value as JsonValue, json};

// Fixed, increasing UUIDv7s so the `_id` tiebreaker is assertable.
const RID: [&str; 6] = [
    "0198c72d-82b5-7000-8000-000000000001",
    "0198c72d-82b5-7000-8000-000000000002",
    "0198c72d-82b5-7000-8000-000000000003",
    "0198c72d-82b5-7000-8000-000000000004",
    "0198c72d-82b5-7000-8000-000000000005",
    "0198c72d-82b5-7000-8000-000000000006",
];

fn open_file() -> (tempfile::TempDir, Connection) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("query.eidos");
    ddl::create_eidos_file(&path, Some("Query Tests")).unwrap();
    let conn = Connection::open(&path).unwrap();
    ddl::configure_connection(&conn).unwrap();
    (dir, conn)
}

struct FieldSpec {
    name: &'static str,
    field_type: FieldType,
    nullable: bool,
}

fn stored(name: &'static str, field_type: FieldType) -> FieldSpec {
    FieldSpec {
        name,
        field_type,
        nullable: true,
    }
}

fn stored_required(name: &'static str, field_type: FieldType) -> FieldSpec {
    FieldSpec {
        name,
        field_type,
        nullable: false,
    }
}

fn column_sql(spec: &FieldSpec) -> String {
    let list_like = matches!(
        spec.field_type,
        FieldType::MultiSelect | FieldType::File | FieldType::Relation
    );
    if list_like {
        return format!("\"{}\" TEXT NOT NULL DEFAULT '[]'", spec.name);
    }
    let base = match spec.field_type {
        FieldType::Number => "REAL",
        FieldType::Integer | FieldType::Checkbox => "INTEGER",
        _ => "TEXT",
    };
    let not_null = if spec.nullable { "" } else { " NOT NULL" };
    format!("\"{}\" {base}{not_null}", spec.name)
}

/// Creates a §8-shaped user table plus its meta rows. `label` indexes
/// `user_fields`; `relations` maps forward-relation field names to target
/// table physical names (targets must already exist). Returns the loaded
/// metadata.
fn create_table(
    conn: &Connection,
    name: &str,
    user_fields: &[FieldSpec],
    label: usize,
    relations: &[(&str, &str)],
) -> (TableMeta, Vec<FieldMeta>) {
    let table_id = id::generate_uuidv7();
    let mut definitions = vec![
        "\"_id\" TEXT PRIMARY KEY COLLATE BINARY".to_string(),
        "\"_created_at\" TEXT NOT NULL".to_string(),
        "\"_updated_at\" TEXT NOT NULL".to_string(),
    ];
    definitions.extend(user_fields.iter().map(column_sql));
    conn.execute_batch(&format!(
        "CREATE TABLE \"{name}\" ({}) STRICT, WITHOUT ROWID",
        definitions.join(", ")
    ))
    .unwrap();
    conn.execute_batch(&format!(
        "CREATE TRIGGER \"eidos__row_id_immutable__{}\" \
         BEFORE UPDATE OF \"_id\" ON \"{name}\" \
         WHEN NEW.\"_id\" IS NOT OLD.\"_id\" \
         BEGIN SELECT RAISE(ABORT,'EIDOS_ROW_ID_IMMUTABLE'); END;",
        table_id.replace('-', "")
    ))
    .unwrap();

    let now = time::now_instant();
    let user_field_ids: Vec<String> = user_fields.iter().map(|_| id::generate_uuidv7()).collect();
    let tx = conn.unchecked_transaction().unwrap();
    tx.execute(
        "INSERT INTO eidos__tables \
         (id, name, physical_name, label_field_id, position, settings_json, created_at, updated_at) \
         VALUES (?, ?, ?, ?, 0, '{}', ?, ?)",
        rusqlite::params![table_id, name, name, user_field_ids[label], now, now],
    )
    .unwrap();
    let system_fields = [
        ("_id", "text", "row-id"),
        ("_created_at", "datetime", "created-time"),
        ("_updated_at", "datetime", "updated-time"),
    ];
    for (position, (field_name, field_type, role)) in system_fields.iter().enumerate() {
        tx.execute(
            "INSERT INTO eidos__fields \
             (id, table_id, name, physical_name, type, system_role, nullable, position, \
              settings_json, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, 0, ?, '{}', ?, ?)",
            rusqlite::params![
                id::generate_uuidv7(),
                table_id,
                field_name,
                field_name,
                field_type,
                role,
                position as i64,
                now,
                now
            ],
        )
        .unwrap();
    }
    for (index, spec) in user_fields.iter().enumerate() {
        tx.execute(
            "INSERT INTO eidos__fields \
             (id, table_id, name, physical_name, type, system_role, nullable, position, \
              settings_json, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, NULL, ?, ?, '{}', ?, ?)",
            rusqlite::params![
                user_field_ids[index],
                table_id,
                spec.name,
                spec.name,
                spec.field_type.as_str(),
                i64::from(spec.nullable),
                (index + 3) as i64,
                now,
                now
            ],
        )
        .unwrap();
    }
    for (field_name, target_table) in relations {
        let field_id = user_field_ids[user_fields
            .iter()
            .position(|spec| spec.name == *field_name)
            .unwrap()]
        .clone();
        let target_id: String = tx
            .query_row(
                "SELECT id FROM eidos__tables WHERE physical_name = ?",
                [target_table],
                |row| row.get(0),
            )
            .unwrap();
        tx.execute(
            "INSERT INTO eidos__relation_fields \
             (field_id, direction, target_table_id, cardinality, inverse_of_field_id, on_delete) \
             VALUES (?, 'forward', ?, 'many', NULL, 'restrict')",
            rusqlite::params![field_id, target_id],
        )
        .unwrap();
    }
    tx.commit().unwrap();

    let table = model::load_tables(conn)
        .unwrap()
        .into_iter()
        .find(|table| table.name == name)
        .unwrap();
    let fields = model::load_fields(conn)
        .unwrap()
        .into_iter()
        .filter(|field| field.table_id == table.id)
        .collect();
    (table, fields)
}

/// Adds a virtual field (formula/lookup/inverse relation) meta row.
fn add_virtual_field(conn: &Connection, table: &TableMeta, name: &str, field_type: FieldType) {
    let now = time::now_instant();
    conn.execute(
        "INSERT INTO eidos__fields \
         (id, table_id, name, physical_name, type, system_role, nullable, position, \
          settings_json, created_at, updated_at) \
         VALUES (?, ?, ?, NULL, ?, NULL, 1, 99, '{}', ?, ?)",
        rusqlite::params![
            id::generate_uuidv7(),
            table.id,
            name,
            field_type.as_str(),
            now,
            now
        ],
    )
    .unwrap();
}

fn reload_fields(conn: &Connection, table: &TableMeta) -> Vec<FieldMeta> {
    model::load_fields(conn)
        .unwrap()
        .into_iter()
        .filter(|field| field.table_id == table.id)
        .collect()
}

fn insert_row(conn: &Connection, table: &str, id: &str, cells: &[(&str, SqlValue)]) {
    let now = time::now_instant();
    let mut names = String::new();
    let mut marks = String::new();
    let mut values = vec![
        SqlValue::Text(id.to_string()),
        SqlValue::Text(now.clone()),
        SqlValue::Text(now),
    ];
    for (column, value) in cells {
        names.push_str(&format!(", \"{column}\""));
        marks.push_str(", ?");
        values.push(value.clone());
    }
    conn.execute(
        &format!(
            "INSERT INTO \"{table}\" (\"_id\", \"_created_at\", \"_updated_at\"{names}) \
             VALUES (?, ?, ?{marks})"
        ),
        params_from_iter(values),
    )
    .unwrap();
}

fn field<'a>(fields: &'a [FieldMeta], name: &str) -> &'a FieldMeta {
    fields.iter().find(|field| field.name == name).unwrap()
}

fn filter_query(node: FilterNode) -> RowQuery {
    RowQuery {
        filter: Some(node),
        ..RowQuery::default()
    }
}

/// Runs a query and returns the matching `_id`s in display order.
fn matching_ids(
    conn: &Connection,
    table: &TableMeta,
    fields: &[FieldMeta],
    query: &RowQuery,
) -> Vec<String> {
    read_rows(conn, table, fields, query, &ReadRowsOptions::default())
        .unwrap()
        .rows
        .iter()
        .map(|row| row["_id"].as_str().unwrap().to_string())
        .collect()
}

fn assert_invalid_query(result: eidos_file_core::Result<impl std::fmt::Debug>, what: &str) {
    let err = result.unwrap_err();
    assert_eq!(err.code(), "invalid-query", "{what}: {err}");
}

// ---------------------------------------------------------------------------
// Three-valued logic
// ---------------------------------------------------------------------------

fn tasks_fixture() -> (tempfile::TempDir, Connection, TableMeta, Vec<FieldMeta>) {
    let (dir, conn) = open_file();
    let (table, fields) = create_table(
        &conn,
        "tasks",
        &[
            stored("title", FieldType::Text),
            stored("priority", FieldType::Integer),
            stored("done", FieldType::Checkbox),
            stored("due", FieldType::Date),
        ],
        0,
        &[],
    );
    let text = |s: &str| SqlValue::Text(s.to_string());
    let int = |i: i64| SqlValue::Integer(i);
    insert_row(
        &conn,
        "tasks",
        RID[0],
        &[
            ("title", text("Alpha")),
            ("priority", int(1)),
            ("done", int(1)),
            ("due", text("2025-01-01")),
        ],
    );
    insert_row(
        &conn,
        "tasks",
        RID[1],
        &[
            ("title", text("Beta")),
            ("priority", int(2)),
            ("done", int(0)),
            ("due", text("2025-01-02")),
        ],
    );
    // All-scalar-NULL row: every comparison against it is UNKNOWN.
    insert_row(&conn, "tasks", RID[2], &[]);
    (dir, conn, table, fields)
}

#[test]
fn eq_ne_and_null_are_three_valued() {
    let (_dir, conn, table, fields) = tasks_fixture();
    let title = field(&fields, "title");
    let priority = field(&fields, "priority");

    let eq = filter_query(FilterNode::Eq {
        field_id: title.id.clone(),
        value: json!("Alpha"),
    });
    assert_eq!(matching_ids(&conn, &table, &fields, &eq), [RID[0]]);

    // KEY SEMANTIC: `ne` against a NULL field is UNKNOWN, not TRUE — the
    // null-titled row RID[2] is NOT selected.
    let ne = filter_query(FilterNode::Ne {
        field_id: title.id.clone(),
        value: json!("Alpha"),
    });
    assert_eq!(matching_ids(&conn, &table, &fields, &ne), [RID[1]]);

    let ne_int = filter_query(FilterNode::Ne {
        field_id: priority.id.clone(),
        value: json!("1"),
    });
    assert_eq!(matching_ids(&conn, &table, &fields, &ne_int), [RID[1]]);

    // NOT UNKNOWN is UNKNOWN: the null row stays excluded under `not`.
    let not_eq = filter_query(FilterNode::Not {
        arg: Box::new(FilterNode::Eq {
            field_id: title.id.clone(),
            value: json!("Alpha"),
        }),
    });
    assert_eq!(matching_ids(&conn, &table, &fields, &not_eq), [RID[1]]);

    // is-null / is-not-null are the only null-aware operators.
    let is_null = filter_query(FilterNode::IsNull {
        field_id: title.id.clone(),
    });
    assert_eq!(matching_ids(&conn, &table, &fields, &is_null), [RID[2]]);
    let is_not_null = filter_query(FilterNode::IsNotNull {
        field_id: title.id.clone(),
    });
    assert_eq!(
        matching_ids(&conn, &table, &fields, &is_not_null),
        [RID[0], RID[1]]
    );
}

#[test]
fn logical_nodes_and_empty_truth_values() {
    let (_dir, conn, table, fields) = tasks_fixture();
    let title = field(&fields, "title");
    let priority = field(&fields, "priority");

    let empty_and = filter_query(FilterNode::And { args: vec![] });
    assert_eq!(
        matching_ids(&conn, &table, &fields, &empty_and).len(),
        3,
        "empty `and` is TRUE"
    );
    let empty_or = filter_query(FilterNode::Or { args: vec![] });
    assert!(
        matching_ids(&conn, &table, &fields, &empty_or).is_empty(),
        "empty `or` is FALSE"
    );

    // Nested: priority > 0 AND (title = 'Alpha' OR title = 'Beta')
    let nested = filter_query(FilterNode::And {
        args: vec![
            FilterNode::Gt {
                field_id: priority.id.clone(),
                value: json!("0"),
            },
            FilterNode::Or {
                args: vec![
                    FilterNode::Eq {
                        field_id: title.id.clone(),
                        value: json!("Alpha"),
                    },
                    FilterNode::Eq {
                        field_id: title.id.clone(),
                        value: json!("Beta"),
                    },
                ],
            },
        ],
    });
    assert_eq!(
        matching_ids(&conn, &table, &fields, &nested),
        [RID[0], RID[1]]
    );

    // Field references also resolve by display name.
    let by_name = filter_query(FilterNode::Eq {
        field_id: "title".to_string(),
        value: json!("Beta"),
    });
    assert_eq!(matching_ids(&conn, &table, &fields, &by_name), [RID[1]]);
    // System fields resolve too.
    let by_id = filter_query(FilterNode::Eq {
        field_id: "_id".to_string(),
        value: json!(RID[0]),
    });
    assert_eq!(matching_ids(&conn, &table, &fields, &by_id), [RID[0]]);
}

#[test]
fn ordered_ops_between_and_in() {
    let (_dir, conn, table, fields) = tasks_fixture();
    let priority = field(&fields, "priority");
    let due = field(&fields, "due");
    let title = field(&fields, "title");
    let done = field(&fields, "done");
    let pid = || priority.id.clone();

    let cases: Vec<FilterNode> = vec![
        FilterNode::Lt {
            field_id: pid(),
            value: json!("2"),
        },
        FilterNode::Lte {
            field_id: pid(),
            value: json!("2"),
        },
        FilterNode::Gt {
            field_id: pid(),
            value: json!("1"),
        },
        FilterNode::Gte {
            field_id: pid(),
            value: json!("1"),
        },
        FilterNode::Between {
            field_id: pid(),
            lower: json!("1"),
            upper: json!("2"),
        },
    ];
    let expected: Vec<Vec<&str>> = vec![
        vec![RID[0]],
        vec![RID[0], RID[1]],
        vec![RID[1]],
        vec![RID[0], RID[1]],
        vec![RID[0], RID[1]],
    ];
    for (node, want) in cases.into_iter().zip(expected) {
        assert_eq!(
            matching_ids(&conn, &table, &fields, &filter_query(node)),
            want
        );
    }
    // NULL priority row never appears in ordered comparisons.

    // Dates order chronologically as canonical text.
    let due_gte = filter_query(FilterNode::Gte {
        field_id: due.id.clone(),
        value: json!("2025-01-02"),
    });
    assert_eq!(matching_ids(&conn, &table, &fields, &due_gte), [RID[1]]);

    // `in` is a typed OR; NULL fields are excluded; empty `in` is FALSE.
    let in_titles = filter_query(FilterNode::In {
        field_id: title.id.clone(),
        values: vec![json!("Alpha"), json!("Beta")],
    });
    assert_eq!(
        matching_ids(&conn, &table, &fields, &in_titles),
        [RID[0], RID[1]]
    );
    let in_int = filter_query(FilterNode::In {
        field_id: priority.id.clone(),
        values: vec![json!("1")],
    });
    assert_eq!(matching_ids(&conn, &table, &fields, &in_int), [RID[0]]);
    let in_empty = filter_query(FilterNode::In {
        field_id: title.id.clone(),
        values: vec![],
    });
    assert!(matching_ids(&conn, &table, &fields, &in_empty).is_empty());

    // Checkbox equality with a JSON boolean operand.
    let is_done = filter_query(FilterNode::Eq {
        field_id: done.id.clone(),
        value: json!(true),
    });
    assert_eq!(matching_ids(&conn, &table, &fields, &is_done), [RID[0]]);
}

// ---------------------------------------------------------------------------
// Contains family: ASCII fold + LIKE escaping
// ---------------------------------------------------------------------------

fn docs_fixture() -> (tempfile::TempDir, Connection, TableMeta, Vec<FieldMeta>) {
    let (dir, conn) = open_file();
    let (table, fields) = create_table(&conn, "docs", &[stored("title", FieldType::Text)], 0, &[]);
    for (row_id, title) in [
        (RID[0], "Alpha"),
        (RID[1], "alphabet"),
        (RID[2], "100%_ready"),
        (RID[3], "Äpfel"),
    ] {
        insert_row(
            &conn,
            "docs",
            row_id,
            &[("title", SqlValue::Text(title.to_string()))],
        );
    }
    (dir, conn, table, fields)
}

#[test]
fn contains_family_ascii_fold_and_like_escaping() {
    let (_dir, conn, table, fields) = docs_fixture();
    let title = field(&fields, "title");
    let tid = || title.id.clone();

    // ASCII A..Z fold on both sides.
    let folded = filter_query(FilterNode::Contains {
        field_id: tid(),
        value: "ALPHA".into(),
    });
    assert_eq!(
        matching_ids(&conn, &table, &fields, &folded),
        [RID[0], RID[1]]
    );

    // The fold is ASCII-only: non-ASCII case is NOT folded (ä ≠ Ä).
    let non_ascii = filter_query(FilterNode::Contains {
        field_id: tid(),
        value: "äpfel".into(),
    });
    assert!(matching_ids(&conn, &table, &fields, &non_ascii).is_empty());
    let exact = filter_query(FilterNode::Contains {
        field_id: tid(),
        value: "Äpfel".into(),
    });
    assert_eq!(matching_ids(&conn, &table, &fields, &exact), [RID[3]]);

    let starts = filter_query(FilterNode::StartsWith {
        field_id: tid(),
        value: "alph".into(),
    });
    assert_eq!(
        matching_ids(&conn, &table, &fields, &starts),
        [RID[0], RID[1]]
    );
    let ends = filter_query(FilterNode::EndsWith {
        field_id: tid(),
        value: "PHA".into(),
    });
    assert_eq!(matching_ids(&conn, &table, &fields, &ends), [RID[0]]);

    // LIKE wildcards and the escape char are literal in the operand.
    let literal = filter_query(FilterNode::Contains {
        field_id: tid(),
        value: "100%_ready".into(),
    });
    assert_eq!(matching_ids(&conn, &table, &fields, &literal), [RID[2]]);
    let pct = filter_query(FilterNode::Contains {
        field_id: tid(),
        value: "%".into(),
    });
    assert_eq!(matching_ids(&conn, &table, &fields, &pct), [RID[2]]);
    let underscore = filter_query(FilterNode::Contains {
        field_id: tid(),
        value: "_".into(),
    });
    assert_eq!(matching_ids(&conn, &table, &fields, &underscore), [RID[2]]);
}

// ---------------------------------------------------------------------------
// Set membership and relation-has
// ---------------------------------------------------------------------------

struct SetFixture {
    _dir: tempfile::TempDir,
    conn: Connection,
    table: TableMeta,
    fields: Vec<FieldMeta>,
    _people: (TableMeta, Vec<FieldMeta>),
}

fn set_fixture() -> SetFixture {
    let (dir, conn) = open_file();
    let people = create_table(&conn, "people", &[stored("name", FieldType::Text)], 0, &[]);
    insert_row(
        &conn,
        "people",
        RID[4],
        &[("name", SqlValue::Text("Zed".into()))],
    );
    insert_row(
        &conn,
        "people",
        RID[5],
        &[("name", SqlValue::Text("Ann".into()))],
    );
    let (table, fields) = create_table(
        &conn,
        "tasks",
        &[
            stored("title", FieldType::Text),
            stored_required("labels", FieldType::MultiSelect),
            stored_required("owners", FieldType::Relation),
            stored_required("attachments", FieldType::File),
        ],
        0,
        &[("owners", "people")],
    );
    let rel = |ids: &[&str]| {
        SqlValue::Text(format!(
            "[{}]",
            ids.iter()
                .map(|i| format!("\"{i}\""))
                .collect::<Vec<_>>()
                .join(",")
        ))
    };
    let file_entry = |name: &str| {
        SqlValue::Text(format!(
            "[{{\"id\":\"{}\",\"mediaType\":\"text/plain\",\"name\":\"{name}\",\"size\":\"1\",\"uri\":\"assets/{name}\"}}]",
            RID[0]
        ))
    };
    insert_row(
        &conn,
        "tasks",
        RID[0],
        &[
            ("title", SqlValue::Text("t0".into())),
            ("labels", SqlValue::Text("[\"a\",\"b\"]".into())),
            ("owners", rel(&[RID[4]])),
            ("attachments", file_entry("spec.txt")),
        ],
    );
    insert_row(
        &conn,
        "tasks",
        RID[1],
        &[
            ("title", SqlValue::Text("t1".into())),
            ("labels", SqlValue::Text("[\"b\"]".into())),
            ("owners", rel(&[])),
            ("attachments", SqlValue::Text("[]".into())),
        ],
    );
    insert_row(
        &conn,
        "tasks",
        RID[2],
        &[
            ("title", SqlValue::Text("t2".into())),
            ("labels", SqlValue::Text("[]".into())),
            ("owners", rel(&[RID[5]])),
            ("attachments", SqlValue::Text("[]".into())),
        ],
    );
    SetFixture {
        _dir: dir,
        conn,
        table,
        fields,
        _people: people,
    }
}

#[test]
fn has_any_has_all_on_multi_select() {
    let fx = set_fixture();
    let labels = field(&fx.fields, "labels");
    let lid = || labels.id.clone();

    let any_a = filter_query(FilterNode::HasAny {
        field_id: lid(),
        values: vec![json!("a")],
    });
    assert_eq!(
        matching_ids(&fx.conn, &fx.table, &fx.fields, &any_a),
        [RID[0]]
    );
    let any_ab = filter_query(FilterNode::HasAny {
        field_id: lid(),
        values: vec![json!("a"), json!("b")],
    });
    assert_eq!(
        matching_ids(&fx.conn, &fx.table, &fx.fields, &any_ab),
        [RID[0], RID[1]]
    );
    let all_ab = filter_query(FilterNode::HasAll {
        field_id: lid(),
        values: vec![json!("a"), json!("b")],
    });
    assert_eq!(
        matching_ids(&fx.conn, &fx.table, &fx.fields, &all_ab),
        [RID[0]]
    );
    let all_b = filter_query(FilterNode::HasAll {
        field_id: lid(),
        values: vec![json!("b")],
    });
    assert_eq!(
        matching_ids(&fx.conn, &fx.table, &fx.fields, &all_b),
        [RID[0], RID[1]]
    );

    // Empty has-any is FALSE, empty has-all is TRUE.
    let any_empty = filter_query(FilterNode::HasAny {
        field_id: lid(),
        values: vec![],
    });
    assert!(matching_ids(&fx.conn, &fx.table, &fx.fields, &any_empty).is_empty());
    let all_empty = filter_query(FilterNode::HasAll {
        field_id: lid(),
        values: vec![],
    });
    assert_eq!(
        matching_ids(&fx.conn, &fx.table, &fx.fields, &all_empty).len(),
        3
    );

    // Whole-array typed equality compares canonical JCS text.
    let whole = filter_query(FilterNode::Eq {
        field_id: lid(),
        value: json!(["a", "b"]),
    });
    assert_eq!(
        matching_ids(&fx.conn, &fx.table, &fx.fields, &whole),
        [RID[0]]
    );
}

#[test]
fn relation_has_and_relation_set_ops() {
    let fx = set_fixture();
    let owners = field(&fx.fields, "owners");
    let oid = || owners.id.clone();

    let has_zed = filter_query(FilterNode::RelationHas {
        field_id: oid(),
        row_id: RID[4].to_string(),
    });
    assert_eq!(
        matching_ids(&fx.conn, &fx.table, &fx.fields, &has_zed),
        [RID[0]]
    );

    let any_rel = filter_query(FilterNode::HasAny {
        field_id: oid(),
        values: vec![json!(RID[4]), json!(RID[5])],
    });
    assert_eq!(
        matching_ids(&fx.conn, &fx.table, &fx.fields, &any_rel),
        [RID[0], RID[2]]
    );

    // Empty relation array is the empty value, never NULL.
    let empty = filter_query(FilterNode::Eq {
        field_id: oid(),
        value: json!([]),
    });
    assert_eq!(
        matching_ids(&fx.conn, &fx.table, &fx.fields, &empty),
        [RID[1]]
    );
}

#[test]
fn has_any_on_file_entries_compares_jcs_objects() {
    let fx = set_fixture();
    let attachments = field(&fx.fields, "attachments");
    let entry = json!({
        "id": RID[0],
        "name": "spec.txt",
        "mediaType": "text/plain",
        "size": "1",
        "uri": "assets/spec.txt",
    });
    let any = filter_query(FilterNode::HasAny {
        field_id: attachments.id.clone(),
        values: vec![entry],
    });
    assert_eq!(
        matching_ids(&fx.conn, &fx.table, &fx.fields, &any),
        [RID[0]]
    );
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

#[test]
fn sort_nulls_direction_and_tiebreaker() {
    let (dir, conn) = open_file();
    let (table, fields) = create_table(
        &conn,
        "tasks",
        &[
            stored("title", FieldType::Text),
            stored("priority", FieldType::Integer),
            stored_required("labels", FieldType::MultiSelect),
        ],
        0,
        &[],
    );
    let _ = dir;
    // Insertion order deliberately disagrees with `_id` order.
    let rows = [
        (RID[2], "c", None),
        (RID[0], "a", Some(1)),
        (RID[1], "b", Some(1)),
        (RID[3], "d", Some(2)),
    ];
    for (row_id, title, priority) in rows {
        let mut cells = vec![("title", SqlValue::Text(title.to_string()))];
        if let Some(p) = priority {
            cells.push(("priority", SqlValue::Integer(p)));
        }
        insert_row(&conn, "tasks", row_id, &cells);
    }
    let priority = field(&fields, "priority");
    let title = field(&fields, "title");
    let row_id = field(&fields, "_id");
    let sort = |terms: Vec<SortTerm>| RowQuery {
        sort: Some(terms),
        ..RowQuery::default()
    };
    let term = |field: &FieldMeta, direction: SortDirection, nulls: Option<NullsOrder>| SortTerm {
        field_id: field.id.clone(),
        direction,
        nulls,
    };

    // Default null placement is LAST for both directions.
    let asc = sort(vec![term(priority, SortDirection::Asc, None)]);
    assert_eq!(
        matching_ids(&conn, &table, &fields, &asc),
        [RID[0], RID[1], RID[3], RID[2]]
    );
    let desc = sort(vec![term(priority, SortDirection::Desc, None)]);
    assert_eq!(
        matching_ids(&conn, &table, &fields, &desc),
        [RID[3], RID[0], RID[1], RID[2]]
    );
    // Equal priorities (1, 1) fall back to the `_id` BINARY ASC tiebreaker
    // (RID[0] < RID[1]) even though insertion order was the reverse.
    let first = sort(vec![term(
        priority,
        SortDirection::Asc,
        Some(NullsOrder::First),
    )]);
    assert_eq!(
        matching_ids(&conn, &table, &fields, &first),
        [RID[2], RID[0], RID[1], RID[3]]
    );

    // Multi-term sort.
    let multi = sort(vec![
        term(priority, SortDirection::Asc, None),
        term(title, SortDirection::Desc, None),
    ]);
    assert_eq!(
        matching_ids(&conn, &table, &fields, &multi),
        [RID[1], RID[0], RID[3], RID[2]]
    );

    // A client-supplied row-id sort is valid only as the final term, and
    // then suppresses the appended tiebreaker.
    let by_row_id = sort(vec![term(row_id, SortDirection::Desc, None)]);
    let compiled = compile_query(&table, &fields, &by_row_id).unwrap();
    assert_eq!(compiled.order_sql, "ORDER BY \"_id\" DESC NULLS LAST");
    assert_eq!(
        matching_ids(&conn, &table, &fields, &by_row_id),
        [RID[3], RID[2], RID[1], RID[0]]
    );
    let row_id_not_final = sort(vec![
        term(row_id, SortDirection::Asc, None),
        term(title, SortDirection::Asc, None),
    ]);
    assert_invalid_query(
        compile_query(&table, &fields, &row_id_not_final),
        "row-id must be the final sort term",
    );

    // Duplicate sort fields are invalid.
    let dup = sort(vec![
        term(priority, SortDirection::Asc, None),
        SortTerm {
            field_id: "priority".to_string(),
            direction: SortDirection::Desc,
            nulls: None,
        },
    ]);
    assert_invalid_query(compile_query(&table, &fields, &dup), "duplicate sort field");

    // List/file/json/relation sorts are invalid.
    let list_sort = sort(vec![term(
        field(&fields, "labels"),
        SortDirection::Asc,
        None,
    )]);
    assert_invalid_query(compile_query(&table, &fields, &list_sort), "list sort");
}

#[test]
fn order_by_shape_and_default_tiebreaker() {
    let (_dir, conn, table, fields) = tasks_fixture();
    let priority = field(&fields, "priority");
    let title = field(&fields, "title");
    let query = RowQuery {
        sort: Some(vec![
            SortTerm {
                field_id: priority.id.clone(),
                direction: SortDirection::Desc,
                nulls: None,
            },
            SortTerm {
                field_id: title.id.clone(),
                direction: SortDirection::Asc,
                nulls: Some(NullsOrder::Last),
            },
        ]),
        ..RowQuery::default()
    };
    // Ported from query.test.ts ("compiles ... stable multi-column sort"):
    // TS appends "__base_rowid" ASC; WITHOUT ROWID tables use _id BINARY.
    let compiled = compile_query(&table, &fields, &query).unwrap();
    assert_eq!(
        compiled.order_sql,
        "ORDER BY \"priority\" DESC NULLS LAST, \"title\" ASC NULLS LAST, \"_id\" COLLATE BINARY ASC"
    );

    // No sort terms: the tiebreaker still guarantees deterministic paging.
    let bare = compile_query(&table, &fields, &RowQuery::default()).unwrap();
    assert_eq!(bare.order_sql, "ORDER BY \"_id\" COLLATE BINARY ASC");
    assert_eq!(bare.where_sql, "");
    let _ = conn;
}

// ---------------------------------------------------------------------------
// LIKE escape parameter vector (ported from query.test.ts)
// ---------------------------------------------------------------------------

#[test]
fn search_params_escape_like_wildcards() {
    let (_dir, _conn, table, fields) = docs_fixture();
    let title = field(&fields, "title");
    let query = RowQuery {
        search: Some(SearchSpec {
            text: "100%_ready".into(),
            fields: vec![title.id.clone()],
        }),
        ..RowQuery::default()
    };
    let compiled = compile_query(&table, &fields, &query).unwrap();
    assert!(compiled.where_sql.contains("ESCAPE '\\'"));
    // Ported vector: TS params ["%100\\%\\_ready%", ...] per search field.
    assert_eq!(
        compiled.params,
        vec![SqlValue::Text("%100\\%\\_ready%".to_string())]
    );
}

// ---------------------------------------------------------------------------
// invalid-query cases
// ---------------------------------------------------------------------------

#[test]
fn invalid_query_type_and_operand_mismatches() {
    let fx = set_fixture();
    let title = field(&fx.fields, "title");
    let labels = field(&fx.fields, "labels");
    let owners = field(&fx.fields, "owners");
    let priority_like = FieldSpec {
        name: "priority",
        field_type: FieldType::Integer,
        nullable: true,
    };
    let _ = priority_like;

    let compile = |node: FilterNode| compile_query(&fx.table, &fx.fields, &filter_query(node));

    // Ordered comparison on a list field.
    assert_invalid_query(
        compile(FilterNode::Lt {
            field_id: labels.id.clone(),
            value: json!("a"),
        }),
        "lt on multi-select",
    );
    // Contains-family on a relation field.
    assert_invalid_query(
        compile(FilterNode::Contains {
            field_id: owners.id.clone(),
            value: "x".into(),
        }),
        "contains on relation",
    );
    // has-any on a scalar field.
    assert_invalid_query(
        compile(FilterNode::HasAny {
            field_id: title.id.clone(),
            values: vec![json!("a")],
        }),
        "has-any on text",
    );
    // relation-has on a non-relation field / with a non-UUID rowId.
    assert_invalid_query(
        compile(FilterNode::RelationHas {
            field_id: title.id.clone(),
            row_id: RID[0].into(),
        }),
        "relation-has on text",
    );
    assert_invalid_query(
        compile(FilterNode::RelationHas {
            field_id: owners.id.clone(),
            row_id: "nope".into(),
        }),
        "relation-has bad rowId",
    );
    // Null operands are invalid everywhere (use is-null instead).
    assert_invalid_query(
        compile(FilterNode::Eq {
            field_id: title.id.clone(),
            value: JsonValue::Null,
        }),
        "null eq operand",
    );
    // No coercion: a string operand for an integer comparison, an
    // out-of-domain date, a non-boolean checkbox operand.
    let (_d, _c, t2, f2) = tasks_fixture();
    let priority = field(&f2, "priority");
    let due = field(&f2, "due");
    let done = field(&f2, "done");
    let compile2 = |node: FilterNode| compile_query(&t2, &f2, &filter_query(node));
    assert_invalid_query(
        compile2(FilterNode::Eq {
            field_id: priority.id.clone(),
            value: json!("abc"),
        }),
        "string operand for integer",
    );
    assert_invalid_query(
        compile2(FilterNode::Lt {
            field_id: priority.id.clone(),
            value: json!(1.5),
        }),
        "fractional operand for integer",
    );
    assert_invalid_query(
        compile2(FilterNode::Eq {
            field_id: due.id.clone(),
            value: json!("2025-13-01"),
        }),
        "invalid date operand",
    );
    assert_invalid_query(
        compile2(FilterNode::Eq {
            field_id: done.id.clone(),
            value: json!(1),
        }),
        "non-boolean checkbox operand",
    );
}

#[test]
fn invalid_query_field_resolution_and_virtual_fields() {
    let (_dir, conn, table, _fields) = tasks_fixture();
    add_virtual_field(&conn, &table, "computed", FieldType::Formula);
    add_virtual_field(&conn, &table, "rollup", FieldType::Lookup);
    add_virtual_field(&conn, &table, "backrefs", FieldType::Relation);
    let fields = reload_fields(&conn, &table);
    let _ = conn;

    // Unknown reference.
    assert_invalid_query(
        compile_query(
            &table,
            &fields,
            &filter_query(FilterNode::IsNull {
                field_id: "0198c72d-82b5-7000-8000-ffffffffffff".into(),
            }),
        ),
        "unknown field id",
    );

    // Ambiguous reference: a field named exactly another field's ID.
    let title = field(&fields, "title");
    let mut renamed = fields.clone();
    let mut impostor = field(&fields, "priority").clone();
    impostor.id = id::generate_uuidv7();
    impostor.name = title.id.clone();
    renamed.push(impostor);
    assert_invalid_query(
        compile_query(
            &table,
            &renamed,
            &filter_query(FilterNode::IsNull {
                field_id: title.id.clone(),
            }),
        ),
        "ambiguous id/name reference",
    );

    // Virtual fields (formula/lookup/inverse relation) cannot be filtered,
    // sorted, or searched in v1.
    for virtual_name in ["computed", "rollup", "backrefs"] {
        let v = field(&fields, virtual_name);
        assert_invalid_query(
            compile_query(
                &table,
                &fields,
                &filter_query(FilterNode::IsNull {
                    field_id: v.id.clone(),
                }),
            ),
            "filter on virtual field",
        );
        assert_invalid_query(
            compile_query(
                &table,
                &fields,
                &RowQuery {
                    sort: Some(vec![SortTerm {
                        field_id: v.id.clone(),
                        direction: SortDirection::Asc,
                        nulls: None,
                    }]),
                    ..RowQuery::default()
                },
            ),
            "sort on virtual field",
        );
        assert_invalid_query(
            compile_query(
                &table,
                &fields,
                &RowQuery {
                    search: Some(SearchSpec {
                        text: "x".into(),
                        fields: vec![v.id.clone()],
                    }),
                    ..RowQuery::default()
                },
            ),
            "search on virtual field",
        );
    }

    // compile_query cannot compile forward-relation search (needs the
    // target table); read_rows can.
    let fx = set_fixture();
    let owners = field(&fx.fields, "owners");
    let relation_search = RowQuery {
        search: Some(SearchSpec {
            text: "zed".into(),
            fields: vec![owners.id.clone()],
        }),
        ..RowQuery::default()
    };
    assert_invalid_query(
        compile_query(&fx.table, &fx.fields, &relation_search),
        "relation search via compile_query",
    );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

#[test]
fn search_scalars_multiselect_relation_and_filter_combination() {
    let fx = set_fixture();
    let title = field(&fx.fields, "title");
    let labels = field(&fx.fields, "labels");
    let owners = field(&fx.fields, "owners");
    let search = |text: &str, fields: Vec<String>| RowQuery {
        search: Some(SearchSpec {
            text: text.into(),
            fields,
        }),
        ..RowQuery::default()
    };

    // Scalar fields: ASCII-folded substring over the stored text.
    let t = search("T0", vec![title.id.clone()]);
    assert_eq!(matching_ids(&fx.conn, &fx.table, &fx.fields, &t), [RID[0]]);

    // Multi-select fragments are the option names.
    let by_label = search("a", vec![labels.id.clone()]);
    assert_eq!(
        matching_ids(&fx.conn, &fx.table, &fx.fields, &by_label),
        [RID[0]]
    );
    let label_b_only = search("b", vec![labels.id.clone()]);
    assert_eq!(
        matching_ids(&fx.conn, &fx.table, &fx.fields, &label_b_only),
        [RID[0], RID[1]]
    );

    // OR across fields.
    let or_fields = search("t1", vec![title.id.clone(), labels.id.clone()]);
    assert_eq!(
        matching_ids(&fx.conn, &fx.table, &fx.fields, &or_fields),
        [RID[1]]
    );

    // Forward relation search matches the target's label (one hop).
    let by_owner = search("zed", vec![owners.id.clone()]);
    assert_eq!(
        matching_ids(&fx.conn, &fx.table, &fx.fields, &by_owner),
        [RID[0]]
    );
    let by_ann = search("ann", vec![owners.id.clone()]);
    assert_eq!(
        matching_ids(&fx.conn, &fx.table, &fx.fields, &by_ann),
        [RID[2]]
    );

    // Search is AND-ed with the filter.
    let mut combined = search("b", vec![labels.id.clone()]);
    combined.filter = Some(FilterNode::Eq {
        field_id: title.id.clone(),
        value: json!("t1"),
    });
    assert_eq!(
        matching_ids(&fx.conn, &fx.table, &fx.fields, &combined),
        [RID[1]]
    );

    // Empty text / empty field list are invalid.
    assert_invalid_query(
        read_rows(
            &fx.conn,
            &fx.table,
            &fx.fields,
            &search("", vec![title.id.clone()]),
            &ReadRowsOptions::default(),
        ),
        "empty search text",
    );
    assert_invalid_query(
        read_rows(
            &fx.conn,
            &fx.table,
            &fx.fields,
            &search("x", vec![]),
            &ReadRowsOptions::default(),
        ),
        "empty search fields",
    );
}

#[test]
fn search_on_file_entries_uses_entry_fragments() {
    let fx = set_fixture();
    let attachments = field(&fx.fields, "attachments");
    let search = RowQuery {
        search: Some(SearchSpec {
            text: "spec.txt".into(),
            fields: vec![attachments.id.clone()],
        }),
        ..RowQuery::default()
    };
    assert_eq!(
        matching_ids(&fx.conn, &fx.table, &fx.fields, &search),
        [RID[0]]
    );
    let by_media = RowQuery {
        search: Some(SearchSpec {
            text: "text/plain".into(),
            fields: vec![attachments.id.clone()],
        }),
        ..RowQuery::default()
    };
    assert_eq!(
        matching_ids(&fx.conn, &fx.table, &fx.fields, &by_media),
        [RID[0]]
    );
}

// ---------------------------------------------------------------------------
// read_rows: projection, logical binding, paging
// ---------------------------------------------------------------------------

#[test]
fn read_rows_logical_binding_and_projection() {
    let fx = set_fixture();
    add_virtual_field(&fx.conn, &fx.table, "computed", FieldType::Formula);
    {
        // Add a json + number + integer column row to exercise bindings.
        let now = time::now_instant();
        for (name, ty) in [("data", "json"), ("ratio", "number"), ("count", "integer")] {
            fx.conn
                .execute(
                    "INSERT INTO eidos__fields \
                     (id, table_id, name, physical_name, type, system_role, nullable, position, \
                      settings_json, created_at, updated_at) \
                     VALUES (?, ?, ?, ?, ?, NULL, 1, 50, '{}', ?, ?)",
                    rusqlite::params![id::generate_uuidv7(), fx.table.id, name, name, ty, now, now],
                )
                .unwrap();
            let sql_type = if ty == "number" {
                "REAL"
            } else if ty == "integer" {
                "INTEGER"
            } else {
                "TEXT"
            };
            fx.conn
                .execute_batch(&format!(
                    "ALTER TABLE \"tasks\" ADD COLUMN \"{name}\" {sql_type}"
                ))
                .unwrap();
        }
    }
    fx.conn
        .execute(
            "UPDATE \"tasks\" SET \"data\" = '{\"a\":1}', \"ratio\" = 2.5, \"count\" = 10 \
             WHERE \"_id\" = ?",
            [RID[0]],
        )
        .unwrap();
    let fields = reload_fields(&fx.conn, &fx.table);

    let page = read_rows(
        &fx.conn,
        &fx.table,
        &fields,
        &RowQuery::default(),
        &ReadRowsOptions::default(),
    )
    .unwrap();
    assert_eq!(page.rows.len(), 3);
    assert_eq!(page.total_estimate, Some(3));
    let row0 = page
        .rows
        .iter()
        .find(|row| row["_id"] == json!(RID[0]))
        .unwrap();
    // Logical JSON binding per §5.1.
    assert_eq!(
        row0["count"],
        json!("10"),
        "integers bind as decimal strings"
    );
    assert_eq!(row0["ratio"], json!(2.5), "numbers bind as JSON numbers");
    assert_eq!(
        row0["labels"],
        json!(["a", "b"]),
        "multi-select parses to an array"
    );
    assert_eq!(
        row0["owners"],
        json!([RID[4]]),
        "relation parses to an array"
    );
    assert_eq!(
        row0["data"],
        json!("{\"a\":1}"),
        "json fields bind as JSON text strings"
    );
    assert_eq!(row0["attachments"][0]["name"], json!("spec.txt"));
    // NULL binds as JSON null.
    let row2 = page
        .rows
        .iter()
        .find(|row| row["_id"] == json!(RID[2]))
        .unwrap();
    assert_eq!(row2["data"], JsonValue::Null);
    assert_eq!(row2["count"], JsonValue::Null);
    // System fields are present in the default projection.
    assert!(row0["_created_at"].is_string());
    assert!(row0["_updated_at"].is_string());
    // Virtual fields are omitted by default...
    assert!(!row0.contains_key("computed"));
    // ...and present as null with include_virtual.
    let with_virtual = read_rows(
        &fx.conn,
        &fx.table,
        &fields,
        &RowQuery::default(),
        &ReadRowsOptions {
            include_virtual: true,
            ..ReadRowsOptions::default()
        },
    )
    .unwrap();
    assert_eq!(with_virtual.rows[0]["computed"], JsonValue::Null);

    // Projection by display name: only the requested columns plus `_id`.
    let projected = read_rows(
        &fx.conn,
        &fx.table,
        &fields,
        &RowQuery::default(),
        &ReadRowsOptions {
            projection: Some(vec!["title".to_string()]),
            ..ReadRowsOptions::default()
        },
    )
    .unwrap();
    assert_eq!(projected.rows[0].len(), 2);
    assert!(projected.rows[0].contains_key("_id"));
    assert!(projected.rows[0].contains_key("title"));

    // Projection by field ID resolves identically.
    let title = field(&fields, "title");
    let by_id = read_rows(
        &fx.conn,
        &fx.table,
        &fields,
        &RowQuery::default(),
        &ReadRowsOptions {
            projection: Some(vec![title.id.clone()]),
            ..ReadRowsOptions::default()
        },
    )
    .unwrap();
    assert_eq!(by_id.rows[0].len(), 2);

    // Unknown projection references are invalid-query.
    assert_invalid_query(
        read_rows(
            &fx.conn,
            &fx.table,
            &fields,
            &RowQuery::default(),
            &ReadRowsOptions {
                projection: Some(vec!["nonexistent".to_string()]),
                ..ReadRowsOptions::default()
            },
        ),
        "unknown projection field",
    );
}

#[test]
fn read_rows_limit_offset_and_total() {
    let (_dir, conn, table, fields) = docs_fixture();
    let page = |limit: Option<u32>, offset: Option<u32>| {
        read_rows(
            &conn,
            &table,
            &fields,
            &RowQuery::default(),
            &ReadRowsOptions {
                limit,
                offset,
                ..ReadRowsOptions::default()
            },
        )
        .unwrap()
    };

    // Default order is the `_id` BINARY ASC tiebreaker.
    let all = page(None, None);
    let all_ids: Vec<&str> = all
        .rows
        .iter()
        .map(|row| row["_id"].as_str().unwrap())
        .collect();
    assert_eq!(all_ids, [RID[0], RID[1], RID[2], RID[3]]);

    let first_two = page(Some(2), None);
    assert_eq!(first_two.rows.len(), 2);
    assert_eq!(first_two.rows[0]["_id"], json!(RID[0]));
    assert_eq!(
        first_two.total_estimate,
        Some(4),
        "total ignores limit/offset"
    );

    let rest = page(Some(2), Some(2));
    assert_eq!(rest.rows.len(), 2);
    assert_eq!(rest.rows[0]["_id"], json!(RID[2]));
    assert_eq!(rest.total_estimate, Some(4));

    let past_end = page(None, Some(10));
    assert!(past_end.rows.is_empty());
    assert_eq!(past_end.total_estimate, Some(4));
}
