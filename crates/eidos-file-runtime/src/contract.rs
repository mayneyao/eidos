//! Canonical Eidos Runtime 1.0 wire & typed contract structs.
//! Mirrors `packages/eidos-file/src/runtime-contract.ts` 1-to-1 so both the
//! N-API bridge (Eidos Lite) and native Rust callers (NSH / CLI / Mobile)
//! share one strongly-typed schema.

use std::collections::BTreeMap;

use eidos_file_core::error::EidosError;
use eidos_file_core::query::{FilterNode, RowQuery};
use eidos_file_core::view_ops::{SavedViewQuery, ViewChange, ViewMutationResult};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value as JsonValue};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeErrorExtra {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub row_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_revision: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Map<String, JsonValue>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeErrorPayload {
    pub code: String,
    pub message: String,
    pub retryable: bool,
    #[serde(flatten, default, skip_serializing_if = "Option::is_none")]
    pub extra: Option<Box<RuntimeErrorExtra>>,
}

impl RuntimeErrorPayload {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            retryable: false,
            extra: None,
        }
    }

    pub fn with_current_revision(mut self, revision: impl Into<String>) -> Self {
        self.retryable = true;
        self.extra
            .get_or_insert_with(|| Box::new(RuntimeErrorExtra::default()))
            .current_revision = Some(revision.into());
        self
    }

    pub fn from_core(error: EidosError) -> Self {
        let code = match error.code() {
            "table-not-found" | "field-not-found" | "view-not-found" | "row-not-found" => {
                "not-found"
            }
            "invalid-schema" => "corrupt-file",
            "constraint-conflict" => "constraint",
            "unsupported-feature" => "unsupported",
            "sqlite-error" => "adapter-error",
            other => other,
        };
        let payload = Self::new(code, error.to_string());
        if let EidosError::StaleRevision { current_revision } = error {
            payload.with_current_revision(current_revision)
        } else {
            payload
        }
    }
}

impl std::fmt::Display for RuntimeErrorPayload {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for RuntimeErrorPayload {}

pub type RuntimeResult<T> = std::result::Result<T, RuntimeErrorPayload>;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestContext {
    #[serde(default)]
    pub request_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deadline_milliseconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NegotiateRequest {
    pub protocol: String,
    pub versions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NegotiateResponse {
    pub version: String,
    pub capabilities: JsonValue,
    pub limits: RuntimeLimits,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeLimits {
    pub request_bytes_max: usize,
    pub response_bytes_max: usize,
    pub schema_page_size_max: usize,
    pub page_size_max: usize,
    pub projection_fields_max: usize,
    pub rows_by_id_max: usize,
    pub mutation_rows_max: usize,
    pub mutation_cells_max: usize,
    pub mutation_bytes_max: usize,
    pub aggregate_items_max: usize,
    pub group_page_size_max: usize,
    pub formula_preview_rows_max: usize,
    pub filter_depth_max: usize,
    pub filter_nodes_max: usize,
    pub sort_fields_max: usize,
    pub group_fields_max: usize,
    pub search_bytes_max: usize,
    pub list_elements_max: usize,
    pub logical_value_bytes_max: usize,
    pub formula_bytes_max: usize,
    pub formula_nodes_max: usize,
    pub formula_depth_max: usize,
    pub diagnostics_max: usize,
    pub foreground_time_ms_max: usize,
    pub csv_bytes_max: usize,
    pub schema_plan_entries_max: usize,
    pub schema_plan_bytes_max: usize,
    pub undo_entries_max: usize,
    pub undo_bytes_max: usize,
}

impl Default for RuntimeLimits {
    fn default() -> Self {
        Self {
            request_bytes_max: 16 * 1024 * 1024,
            response_bytes_max: 16 * 1024 * 1024,
            schema_page_size_max: 500,
            page_size_max: 1_000,
            projection_fields_max: 256,
            rows_by_id_max: 1_000,
            mutation_rows_max: 5_000,
            mutation_cells_max: 50_000,
            mutation_bytes_max: 16 * 1024 * 1024,
            aggregate_items_max: 64,
            group_page_size_max: 500,
            formula_preview_rows_max: 50,
            filter_depth_max: 16,
            filter_nodes_max: 256,
            sort_fields_max: 16,
            group_fields_max: 4,
            search_bytes_max: 1024,
            list_elements_max: 500,
            logical_value_bytes_max: 1024 * 1024,
            formula_bytes_max: 16 * 1024,
            formula_nodes_max: 512,
            formula_depth_max: 32,
            diagnostics_max: 1_000,
            foreground_time_ms_max: 30_000,
            csv_bytes_max: 16 * 1024 * 1024,
            schema_plan_entries_max: 64,
            schema_plan_bytes_max: 4 * 1024 * 1024,
            undo_entries_max: 64,
            undo_bytes_max: 16 * 1024 * 1024,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSnapshotRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub minimum_revision: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatVersion {
    pub major: i64,
    pub minor: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaCounts {
    pub tables: String,
    pub fields: String,
    pub views: String,
    pub features: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSnapshot {
    pub file_id: String,
    pub format: FormatVersion,
    pub revision: String,
    pub title: String,
    pub default_table_id: Option<String>,
    pub schema_counts: SchemaCounts,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSchemaPageRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar_window_version: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar_query_version: Option<u8>,
    pub revision: String,
    pub limit: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaPage {
    pub file_id: String,
    pub revision: String,
    pub objects: Vec<JsonValue>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarContext {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time_zone: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time_zone_data: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub week_starts_on: Option<u8>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectionSpec {
    #[serde(default)]
    pub fields: Vec<String>,
    #[serde(default)]
    pub resolve_relations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnDescriptor {
    pub field_id: String,
    pub name: String,
    pub value_type: JsonValue,
    pub source: String,
    pub writable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedRelationColumn {
    pub column: usize,
    pub items: Vec<JsonValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectedRow {
    pub id: String,
    pub values: Vec<JsonValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_relations: Option<Vec<ResolvedRelationColumn>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowPage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference_instant: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<String>,
    pub file_id: String,
    pub table_id: String,
    pub revision: String,
    pub projection_hash: String,
    pub columns: Vec<ColumnDescriptor>,
    pub rows: Vec<ProjectedRow>,
    pub next_cursor: Option<String>,
    pub previous_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowBatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference_instant: Option<String>,
    pub file_id: String,
    pub table_id: String,
    pub revision: String,
    pub projection_hash: String,
    pub columns: Vec<ColumnDescriptor>,
    pub rows: Vec<ProjectedRow>,
    pub missing_row_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryRowsRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar: Option<CalendarContext>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reference_instant: Option<String>,
    pub table_id: String,
    #[serde(default)]
    pub query: RowQuery,
    pub projection: ProjectionSpec,
    pub limit: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub direction: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryRowPagesRequest {
    pub table_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar: Option<CalendarContext>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reference_instant: Option<String>,
    pub queries: Vec<RowQuery>,
    pub projection: ProjectionSpec,
    pub limit: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetRowsByIdRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar: Option<CalendarContext>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reference_instant: Option<String>,
    pub table_id: String,
    pub row_ids: Vec<String>,
    pub projection: ProjectionSpec,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetRecordNeighborsRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar: Option<CalendarContext>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reference_instant: Option<String>,
    pub table_id: String,
    pub row_id: String,
    #[serde(default)]
    pub query: RowQuery,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RecordNeighbors {
    Found {
        found: bool,
        #[serde(rename = "previousId")]
        previous_id: Option<String>,
        #[serde(rename = "nextId")]
        next_id: Option<String>,
    },
    NotFound {
        found: bool,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AggregateRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar: Option<CalendarContext>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reference_instant: Option<String>,
    pub table_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub query: Option<RowQuery>,
    pub items: Vec<AggregateItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all_fields = "camelCase")]
pub enum AggregateItem {
    #[serde(rename = "count-all")]
    CountAll { key: String },
    #[serde(rename = "distinct-values")]
    DistinctValues {
        key: String,
        field_id: String,
        limit: usize,
    },
    #[serde(rename = "count")]
    Count { key: String, field_id: String },
    #[serde(rename = "distinct-count")]
    DistinctCount { key: String, field_id: String },
    #[serde(rename = "sum")]
    Sum { key: String, field_id: String },
    #[serde(rename = "average")]
    Average { key: String, field_id: String },
    #[serde(rename = "min")]
    Min { key: String, field_id: String },
    #[serde(rename = "max")]
    Max { key: String, field_id: String },
    #[serde(rename = "statistics")]
    Statistics { key: String, field_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnStatistics {
    pub rows: String,
    pub nulls: String,
    pub distinct: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<JsonValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<JsonValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sum: Option<JsonValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub average: Option<Option<f64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AggregateResult {
    Value {
        key: String,
        value: JsonValue,
    },
    DistinctValues {
        key: String,
        values: Vec<JsonValue>,
        truncated: bool,
    },
    Statistics {
        key: String,
        statistics: ColumnStatistics,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AggregateResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference_instant: Option<String>,
    pub file_id: String,
    pub table_id: String,
    pub revision: String,
    pub results: Vec<AggregateResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar: Option<CalendarContext>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reference_instant: Option<String>,
    pub table_id: String,
    #[serde(default)]
    pub query: RowQuery,
    pub group_by: Vec<String>,
    #[serde(default)]
    pub aggregates: Vec<AggregateItem>,
    pub projection: ProjectionSpec,
    pub group_limit: usize,
    pub rows_per_group: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub direction: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupBucket {
    pub key: Vec<JsonValue>,
    pub count: String,
    pub aggregates: Vec<AggregateResult>,
    pub rows: Vec<ProjectedRow>,
    pub next_row_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupPage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference_instant: Option<String>,
    pub file_id: String,
    pub table_id: String,
    pub revision: String,
    pub projection_hash: String,
    pub columns: Vec<ColumnDescriptor>,
    pub groups: Vec<GroupBucket>,
    pub next_cursor: Option<String>,
    pub previous_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupRowsRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar: Option<CalendarContext>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reference_instant: Option<String>,
    pub cursor: String,
    pub limit: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub direction: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupRowPage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference_instant: Option<String>,
    pub file_id: String,
    pub table_id: String,
    pub revision: String,
    pub projection_hash: String,
    pub columns: Vec<ColumnDescriptor>,
    pub group_key: Vec<JsonValue>,
    pub rows: Vec<ProjectedRow>,
    pub next_cursor: Option<String>,
    pub previous_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormulaPreviewRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar: Option<CalendarContext>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reference_instant: Option<String>,
    pub table_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub field_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub candidate_name: Option<String>,
    pub source_text: String,
    pub declared_result_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub row_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormulaPreviewRow {
    pub row_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<JsonValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<RuntimeErrorPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDiagnostic {
    pub code: String,
    pub severity: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub row_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormulaPreviewResult {
    pub file_id: String,
    pub revision: String,
    pub valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inferred_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dependencies: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rows: Option<Vec<FormulaPreviewRow>>,
    pub diagnostics: Vec<RuntimeDiagnostic>,
    pub diagnostics_truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowMutationRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub creation_query: Option<RowQuery>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar: Option<CalendarContext>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub creation_context: Option<JsonValue>,
    pub table_id: String,
    pub expected_revision: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub returning: Option<ProjectionSpec>,
    pub changes: Vec<eidos_file_core::rows::RowChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationResult {
    pub file_id: String,
    pub revision: String,
    pub changed: bool,
    pub created: Vec<eidos_file_core::rows::CreatedRow>,
    pub affected_rows: Vec<eidos_file_core::rows::AffectedRow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub returned_rows: Option<RowBatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub undo_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub evicted_undo_tokens: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub row_count: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevertMutationRequest {
    pub undo_token: String,
    pub expected_revision: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationRequest {
    pub level: eidos_file_core::validate::ValidationLevel,
    pub diagnostics_limit: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReportWire {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revision: Option<String>,
    pub level: eidos_file_core::validate::ValidationLevel,
    pub valid: bool,
    pub diagnostics: Vec<RuntimeDiagnostic>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaPreflightRequest {
    pub change: JsonValue,
    pub expected_revision: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaValueChange {
    pub code: String,
    pub rows: String,
    pub table_id: String,
    pub field_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaDependency {
    pub object: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaPreflightResult {
    pub file_id: String,
    pub plan_token: String,
    pub base_revision: String,
    pub actions_hash: String,
    pub classification: String,
    pub affected_rows: String,
    pub dependency_count: String,
    pub dependencies: Vec<SchemaDependency>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dependency_cursor: Option<String>,
    pub warnings: Vec<RuntimeDiagnostic>,
    pub warnings_truncated: bool,
    pub value_changes: Vec<SchemaValueChange>,
    pub value_changes_truncated: bool,
    pub expires_in_milliseconds: u64,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaMutationRequest {
    pub plan_token: String,
    pub expected_revision: String,
    pub actions_hash: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirm_lossy: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaMutationResult {
    pub file_id: String,
    pub revision: String,
    pub changed: bool,
    pub created_objects: Vec<JsonValue>,
    pub affected_table_ids: Vec<String>,
    pub affected_field_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaDependencyPageRequest {
    pub plan_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    pub limit: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaDependencyPage {
    pub file_id: String,
    pub revision: String,
    pub dependency_count: String,
    pub dependencies: Vec<SchemaDependency>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvExportRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar: Option<CalendarContext>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reference_instant: Option<String>,
    pub table_id: String,
    #[serde(default)]
    pub query: RowQuery,
    pub fields: Vec<String>,
    pub include_header: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvImportColumn {
    pub csv_index: usize,
    pub field_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvImportRequest {
    pub table_id: String,
    pub expected_revision: String,
    pub has_header: bool,
    pub columns: Vec<CsvImportColumn>,
    pub csv_utf8: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedCsvRow {
    pub record_index: usize,
    pub row_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvImportResult {
    pub file_id: String,
    pub table_id: String,
    pub revision: String,
    pub changed: bool,
    pub created_rows: Vec<CreatedCsvRow>,
}

/// Re-exports for view mutations & queries so native callers only depend on `eidos-file-runtime`.
pub type RuntimeViewChange = ViewChange;
pub type RuntimeSavedViewQuery = SavedViewQuery;
pub type RuntimeViewMutationResult = ViewMutationResult;
pub type RuntimeFilterNode = FilterNode;
pub type RuntimeRowQuery = RowQuery;
pub type RuntimeFieldMap = BTreeMap<String, JsonValue>;
