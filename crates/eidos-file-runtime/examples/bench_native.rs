//! Target C2 benchmark: Pure Native Rust Runtime (`crates/eidos-file-runtime`)
//! executing directly over `rusqlite` with zero JS and zero JSON wire overhead.
//!
//! Usage:
//!   cargo run --release -p eidos-file-runtime --example bench_native -- <manifest.json>

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Instant;

use eidos_file_core::query::{
    CalendarPeriodFilter, FilterNode, NullsOrder, RowQuery, SearchSpec, SortDirection, SortTerm,
};
use eidos_file_core::rows::RowChange;
use eidos_file_core::validate::ValidationLevel;
use eidos_file_runtime::{
    AggregateItem, AggregateRequest, CalendarContext, GetSnapshotRequest, GroupRequest,
    ProjectionSpec, QueryRowsRequest, RowMutationRequest, RustRuntimeService,
    SchemaMutationRequest, SchemaPreflightRequest, ValidationRequest,
};
use serde::Deserialize;
use serde_json::{Map, Value, json};

#[derive(Deserialize)]
struct Manifest {
    table100k: Fixture100k,
    rich10k: Fixture10k,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture100k {
    path: String,
    table_id: String,
    fields: HashMap<String, String>,
    sample_row_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture10k {
    path: String,
    table_id: String,
    fields: HashMap<String, String>,
}

fn round3(ms: f64) -> f64 {
    (ms * 1000.0).round() / 1000.0
}

fn stats(samples: &[f64]) -> Value {
    let mut sorted = samples.to_vec();
    sorted.sort_by(|a, b| a.total_cmp(b));
    let p = |q: f64| -> f64 {
        let idx = ((sorted.len() as f64 * q).ceil() as usize)
            .saturating_sub(1)
            .min(sorted.len().saturating_sub(1));
        round3(sorted[idx])
    };
    let mean = sorted.iter().sum::<f64>() / sorted.len() as f64;
    json!({
        "runs": samples.len(),
        "p50Ms": p(0.5),
        "p95Ms": p(0.95),
        "meanMs": round3(mean),
    })
}

fn measure_many<F>(runs: usize, warmup: usize, mut f: F) -> Result<Value, String>
where
    F: FnMut() -> Result<(), String>,
{
    for _ in 0..warmup {
        f()?;
    }
    let mut samples = Vec::with_capacity(runs);
    for _ in 0..runs {
        let t0 = Instant::now();
        f()?;
        samples.push(t0.elapsed().as_secs_f64() * 1000.0);
    }
    Ok(stats(&samples))
}

fn peak_rss_mb() -> f64 {
    let pid = std::process::id().to_string();
    if let Ok(output) = std::process::Command::new("ps")
        .args(["-o", "rss=", "-p", &pid])
        .output()
        && let Ok(text) = String::from_utf8(output.stdout)
        && let Ok(kb) = text.trim().parse::<f64>()
    {
        return ((kb / 1024.0) * 10.0).round() / 10.0;
    }
    0.0
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let manifest_path = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/tmp/eidos-runtime-bench-fixtures-v1/manifest.json"));
    let manifest: Manifest = serde_json::from_str(&std::fs::read_to_string(&manifest_path)?)?;

    let work_dir = tempfile::tempdir()?;
    let copy100k = work_dir.path().join("bench-100k.eidos");
    let copy10k = work_dir.path().join("bench-10k-rich.eidos");
    std::fs::copy(&manifest.table100k.path, &copy100k)?;
    std::fs::copy(&manifest.rich10k.path, &copy10k)?;

    let f100 = &manifest.table100k.fields;
    let t100 = &manifest.table100k.table_id;
    let f10 = &manifest.rich10k.fields;
    let t10 = &manifest.rich10k.table_id;

    let mut metrics = Map::new();

    // 1. Cold open + getSnapshot (100k)
    let t0 = Instant::now();
    let mut svc100 = RustRuntimeService::open(&copy100k, false)?;
    let snap100 = svc100.get_snapshot(&GetSnapshotRequest::default())?;
    metrics.insert(
        "cold_open_snapshot_100k".into(),
        json!({ "p50Ms": round3(t0.elapsed().as_secs_f64() * 1000.0) }),
    );

    // 2. Validate structural (100k)
    metrics.insert(
        "validate_structural_100k".into(),
        measure_many(3, 0, || {
            svc100
                .validate(&ValidationRequest {
                    level: ValidationLevel::Structural,
                    diagnostics_limit: 100,
                })
                .map_err(|e| e.to_string())?;
            Ok(())
        })?,
    );

    let all_cols_100 = vec![
        f100["Name"].clone(),
        f100["Category"].clone(),
        f100["Score"].clone(),
        f100["Priority"].clone(),
        f100["Done"].clone(),
        f100["Status"].clone(),
        f100["Tags"].clone(),
        f100["DueDate"].clone(),
    ];

    // 3. First page (100 rows)
    metrics.insert(
        "query_first_page_100k".into(),
        measure_many(15, 1, || {
            svc100
                .query_rows(&QueryRowsRequest {
                    calendar: None,
                    reference_instant: None,
                    table_id: t100.clone(),
                    query: RowQuery::default(),
                    projection: ProjectionSpec {
                        fields: all_cols_100.clone(),
                        resolve_relations: Vec::new(),
                    },
                    limit: 100,
                    offset: None,
                    cursor: None,
                    direction: None,
                })
                .map_err(|e| e.to_string())?;
            Ok(())
        })?,
    );

    // 4. Deep page (offset 50,000, limit 100)
    metrics.insert(
        "query_deep_page_100k".into(),
        measure_many(10, 1, || {
            svc100
                .query_rows(&QueryRowsRequest {
                    calendar: None,
                    reference_instant: None,
                    table_id: t100.clone(),
                    query: RowQuery::default(),
                    projection: ProjectionSpec {
                        fields: all_cols_100.clone(),
                        resolve_relations: Vec::new(),
                    },
                    limit: 100,
                    offset: Some(50_000),
                    cursor: None,
                    direction: None,
                })
                .map_err(|e| e.to_string())?;
            Ok(())
        })?,
    );

    // 5. Filter + Sort (100k)
    metrics.insert(
        "query_filter_sort_100k".into(),
        measure_many(10, 1, || {
            svc100
                .query_rows(&QueryRowsRequest {
                    calendar: None,
                    reference_instant: None,
                    table_id: t100.clone(),
                    query: RowQuery {
                        filter: Some(FilterNode::And {
                            args: vec![
                                FilterNode::Eq {
                                    field_id: f100["Category"].clone(),
                                    value: json!("alpha"),
                                },
                                FilterNode::Gte {
                                    field_id: f100["Score"].clone(),
                                    value: json!(500),
                                },
                            ],
                        }),
                        search: None,
                        sort: Some(vec![SortTerm {
                            field_id: f100["Score"].clone(),
                            direction: SortDirection::Desc,
                            nulls: Some(NullsOrder::Last),
                        }]),
                    },
                    projection: ProjectionSpec {
                        fields: all_cols_100.clone(),
                        resolve_relations: Vec::new(),
                    },
                    limit: 100,
                    offset: None,
                    cursor: None,
                    direction: None,
                })
                .map_err(|e| e.to_string())?;
            Ok(())
        })?,
    );

    // 6. Search across 100k rows
    metrics.insert(
        "query_search_100k".into(),
        measure_many(10, 1, || {
            svc100
                .query_rows(&QueryRowsRequest {
                    calendar: None,
                    reference_instant: None,
                    table_id: t100.clone(),
                    query: RowQuery {
                        filter: None,
                        search: Some(SearchSpec {
                            text: "Alpha-42".into(),
                            fields: vec![f100["Name"].clone()],
                        }),
                        sort: None,
                    },
                    projection: ProjectionSpec {
                        fields: vec![f100["Name"].clone(), f100["Score"].clone()],
                        resolve_relations: Vec::new(),
                    },
                    limit: 100,
                    offset: None,
                    cursor: None,
                    direction: None,
                })
                .map_err(|e| e.to_string())?;
            Ok(())
        })?,
    );

    // 6b. Calendar period query across 100k rows (timezone-aware month filter)
    metrics.insert(
        "calendar_period_100k".into(),
        measure_many(10, 1, || {
            svc100
                .query_rows(&QueryRowsRequest {
                    calendar: Some(CalendarContext {
                        time_zone: Some("Asia/Shanghai".into()),
                        time_zone_data: Some("2026f".into()),
                        week_starts_on: Some(1),
                    }),
                    reference_instant: Some("2026-11-26T16:30:00.000Z".into()),
                    table_id: t100.clone(),
                    query: RowQuery {
                        filter: Some(FilterNode::CalendarPeriod(CalendarPeriodFilter {
                            field_id: f100["DueDate"].clone(),
                            unit: "month".into(),
                            offset: 0,
                        })),
                        search: None,
                        sort: Some(vec![SortTerm {
                            field_id: f100["Score"].clone(),
                            direction: SortDirection::Desc,
                            nulls: Some(NullsOrder::Last),
                        }]),
                    },
                    projection: ProjectionSpec {
                        fields: all_cols_100.clone(),
                        resolve_relations: Vec::new(),
                    },
                    limit: 100,
                    offset: None,
                    cursor: None,
                    direction: None,
                })
                .map_err(|e| e.to_string())?;
            Ok(())
        })?,
    );

    // 7. Aggregate (100k)
    metrics.insert(
        "aggregate_100k".into(),
        measure_many(10, 1, || {
            svc100
                .aggregate(&AggregateRequest {
                    calendar: None,
                    reference_instant: None,
                    table_id: t100.clone(),
                    query: None,
                    items: vec![
                        AggregateItem::CountAll {
                            key: "total".into(),
                        },
                        AggregateItem::Sum {
                            key: "sum".into(),
                            field_id: f100["Score"].clone(),
                        },
                        AggregateItem::Average {
                            key: "avg".into(),
                            field_id: f100["Score"].clone(),
                        },
                        AggregateItem::Min {
                            key: "min".into(),
                            field_id: f100["Score"].clone(),
                        },
                        AggregateItem::Max {
                            key: "max".into(),
                            field_id: f100["Score"].clone(),
                        },
                    ],
                })
                .map_err(|e| e.to_string())?;
            Ok(())
        })?,
    );

    // Bonus: Group rows on 100k (JS hits resource-limit here!)
    metrics.insert(
        "group_rows_100k_bonus".into(),
        measure_many(10, 1, || {
            svc100
                .group_rows(&GroupRequest {
                    calendar: None,
                    reference_instant: None,
                    table_id: t100.clone(),
                    query: RowQuery::default(),
                    group_by: vec![f100["Category"].clone()],
                    aggregates: vec![AggregateItem::Sum {
                        key: "sum".into(),
                        field_id: f100["Score"].clone(),
                    }],
                    projection: ProjectionSpec {
                        fields: vec![f100["Name"].clone(), f100["Score"].clone()],
                        resolve_relations: Vec::new(),
                    },
                    group_limit: 20,
                    rows_per_group: 10,
                    cursor: None,
                    direction: None,
                })
                .map_err(|e| e.to_string())?;
            Ok(())
        })?,
    );

    // 8. 50 sequential cell commits on 100k
    let mut rev100 = snap100.revision;
    let mut commit_samples = Vec::with_capacity(50);
    for i in 0..50 {
        let tc = Instant::now();
        let mut vals = Map::new();
        vals.insert(f100["Score"].clone(), json!(100 + i));
        let res = svc100.mutate_rows(&RowMutationRequest {
            creation_query: None,
            calendar: None,
            creation_context: None,
            table_id: t100.clone(),
            expected_revision: rev100.clone(),
            returning: None,
            changes: vec![RowChange::Update {
                row_id: manifest.table100k.sample_row_id.clone(),
                values: vals,
            }],
        })?;
        commit_samples.push(tc.elapsed().as_secs_f64() * 1000.0);
        rev100 = res.revision;
    }
    metrics.insert("cell_commit_100k".into(), stats(&commit_samples));

    // 9. Bulk insert 1,000 rows in batches of 500
    let t_bulk = Instant::now();
    for b in 0..2 {
        let mut changes = Vec::with_capacity(500);
        for j in 0..500 {
            let idx = b * 500 + j;
            let mut vals = Map::new();
            vals.insert(f100["Name"].clone(), json!(format!("Bulk-{idx}")));
            vals.insert(f100["Category"].clone(), json!("alpha"));
            vals.insert(f100["Score"].clone(), json!((idx as f64) * 0.5));
            vals.insert(f100["Priority"].clone(), json!((idx % 5).to_string()));
            vals.insert(f100["Done"].clone(), json!(false));
            vals.insert(f100["Status"].clone(), json!("todo"));
            vals.insert(f100["Tags"].clone(), json!(["perf"]));
            vals.insert(f100["DueDate"].clone(), json!("2026-11-26"));
            changes.push(RowChange::Create {
                client_key: format!("bulk-{idx}"),
                values: vals,
            });
        }
        let res = svc100.mutate_rows(&RowMutationRequest {
            creation_query: None,
            calendar: None,
            creation_context: None,
            table_id: t100.clone(),
            expected_revision: rev100.clone(),
            returning: None,
            changes,
        })?;
        rev100 = res.revision;
    }
    metrics.insert(
        "bulk_insert_1k".into(),
        json!({ "p50Ms": round3(t_bulk.elapsed().as_secs_f64() * 1000.0) }),
    );
    svc100.close()?;

    // --- 10k Rich table benchmarks ---
    let mut svc10 = RustRuntimeService::open(&copy10k, false)?;
    let snap10 = svc10.get_snapshot(&GetSnapshotRequest::default())?;
    let mut rev10 = snap10.revision;

    // 10. Group rows by Active on 10k rich rows
    metrics.insert(
        "group_rows_10k".into(),
        measure_many(10, 1, || {
            svc10
                .group_rows(&GroupRequest {
                    calendar: None,
                    reference_instant: None,
                    table_id: t10.clone(),
                    query: RowQuery::default(),
                    group_by: vec![f10["Active"].clone()],
                    aggregates: vec![AggregateItem::Sum {
                        key: "sum".into(),
                        field_id: f10["Score"].clone(),
                    }],
                    projection: ProjectionSpec {
                        fields: vec![f10["Title"].clone(), f10["Score"].clone()],
                        resolve_relations: Vec::new(),
                    },
                    group_limit: 20,
                    rows_per_group: 10,
                    cursor: None,
                    direction: None,
                })
                .map_err(|e| e.to_string())?;
            Ok(())
        })?,
    );

    // 11. Full validation on 10k rich rows
    metrics.insert(
        "validate_full_10k".into(),
        measure_many(3, 0, || {
            svc10
                .validate(&ValidationRequest {
                    level: ValidationLevel::Full,
                    diagnostics_limit: 100,
                })
                .map_err(|e| e.to_string())?;
            Ok(())
        })?,
    );

    // 12. Formula query (500 rows with formula sort)
    metrics.insert(
        "formula_query_10k".into(),
        measure_many(10, 1, || {
            svc10
                .query_rows(&QueryRowsRequest {
                    calendar: None,
                    reference_instant: None,
                    table_id: t10.clone(),
                    query: RowQuery {
                        filter: None,
                        search: None,
                        sort: Some(vec![SortTerm {
                            field_id: f10["Weighted"].clone(),
                            direction: SortDirection::Desc,
                            nulls: Some(NullsOrder::Last),
                        }]),
                    },
                    projection: ProjectionSpec {
                        fields: vec![
                            f10["Title"].clone(),
                            f10["Score"].clone(),
                            f10["Count"].clone(),
                            f10["Weighted"].clone(),
                        ],
                        resolve_relations: Vec::new(),
                    },
                    limit: 500,
                    offset: None,
                    cursor: None,
                    direction: None,
                })
                .map_err(|e| e.to_string())?;
            Ok(())
        })?,
    );

    // 13. Full 10k table scan via paged queryRows (500 rows/page)
    let t_scan = Instant::now();
    let mut scan_cursor: Option<String> = None;
    let mut scanned_rows = 0usize;
    loop {
        let page = svc10.query_rows(&QueryRowsRequest {
            calendar: None,
            reference_instant: None,
            table_id: t10.clone(),
            query: RowQuery::default(),
            projection: ProjectionSpec {
                fields: vec![
                    f10["Title"].clone(),
                    f10["ScoreText"].clone(),
                    f10["Score"].clone(),
                    f10["Count"].clone(),
                    f10["Active"].clone(),
                    f10["DueDate"].clone(),
                ],
                resolve_relations: Vec::new(),
            },
            limit: 500,
            offset: None,
            cursor: scan_cursor.clone(),
            direction: None,
        })?;
        scanned_rows += page.rows.len();
        if page.next_cursor.is_none() || page.rows.is_empty() {
            break;
        }
        scan_cursor = page.next_cursor;
    }
    metrics.insert(
        "paged_scan_10k".into(),
        json!({
            "p50Ms": round3(t_scan.elapsed().as_secs_f64() * 1000.0),
            "rows": scanned_rows
        }),
    );

    // 14. Field conversion 10k rows (ScoreText text -> number)
    let t_conv = Instant::now();
    let plan = svc10.preflight_schema(&SchemaPreflightRequest {
        change: json!({
            "kind": "convert-field",
            "fieldId": f10["ScoreText"],
            "to": "number",
            "toNullable": true
        }),
        expected_revision: rev10.clone(),
    })?;
    let applied = svc10.mutate_schema(&SchemaMutationRequest {
        plan_token: plan.plan_token,
        expected_revision: rev10.clone(),
        actions_hash: plan.actions_hash,
        confirm_lossy: None,
    })?;
    rev10 = applied.revision;
    let _ = rev10;
    metrics.insert(
        "field_conversion_10k".into(),
        json!({ "p50Ms": round3(t_conv.elapsed().as_secs_f64() * 1000.0) }),
    );

    svc10.close()?;

    let out = json!({
        "backend": "rust-native",
        "runtime": "Rust Native (eidos-file-runtime over rusqlite, release, zero-JSON)",
        "peakRssMb": peak_rss_mb(),
        "metrics": metrics,
    });
    println!("{}", serde_json::to_string_pretty(&out)?);
    Ok(())
}
