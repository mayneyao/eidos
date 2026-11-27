//! Single-writer dedicated background worker thread handle for native hosts (NSH / CLI / Mobile).
//!
//! Keeps `rusqlite::Connection` pinned to one dedicated OS thread so UI threads
//! (such as NSH AppKit / Win32 / GTK4 / UIKit / Android) never block on SQLite
//! I/O and exchange strongly-typed Rust structs directly without JSON serialization.

use std::path::PathBuf;
use std::sync::mpsc::{self, Sender};
use std::thread::{self, JoinHandle};

use crate::contract::{
    AggregateRequest, AggregateResponse, FormulaPreviewRequest, FormulaPreviewResult,
    GetSchemaPageRequest, GetSnapshotRequest, GroupPage, GroupRequest, GroupRowPage,
    GroupRowsRequest, MutationResult, QueryRowsRequest, RowBatch, RowMutationRequest, RowPage,
    RuntimeErrorPayload, RuntimeResult, RuntimeSnapshot, SchemaMutationRequest,
    SchemaMutationResult, SchemaPage, SchemaPreflightRequest, SchemaPreflightResult,
    ValidationReportWire, ValidationRequest,
};
use crate::service::{OpenMode, RustRuntimeService};

enum WorkerCommand {
    GetSnapshot(GetSnapshotRequest, Sender<RuntimeResult<RuntimeSnapshot>>),
    GetSchemaPage(GetSchemaPageRequest, Sender<RuntimeResult<SchemaPage>>),
    QueryRows(QueryRowsRequest, Sender<RuntimeResult<RowPage>>),
    QueryColumnarPage {
        table_id: String,
        query: eidos_file_core::query::RowQuery,
        field_ids: Vec<String>,
        offset: usize,
        limit: usize,
        calendar: Option<crate::contract::CalendarContext>,
        reply: Sender<RuntimeResult<crate::grid::ColumnarRowPage>>,
    },
    GetRowsById(
        crate::contract::GetRowsByIdRequest,
        Sender<RuntimeResult<RowBatch>>,
    ),
    Aggregate(AggregateRequest, Sender<RuntimeResult<AggregateResponse>>),
    GroupRows(GroupRequest, Sender<RuntimeResult<GroupPage>>),
    QueryGroupRows(GroupRowsRequest, Sender<RuntimeResult<GroupRowPage>>),
    MutateRows(
        RowMutationRequest,
        bool,
        Sender<RuntimeResult<MutationResult>>,
    ),
    PreviewFormula(
        FormulaPreviewRequest,
        Sender<RuntimeResult<FormulaPreviewResult>>,
    ),
    PreflightSchema(
        SchemaPreflightRequest,
        Sender<RuntimeResult<SchemaPreflightResult>>,
    ),
    MutateSchema(
        SchemaMutationRequest,
        Sender<RuntimeResult<SchemaMutationResult>>,
    ),
    Validate(
        ValidationRequest,
        Sender<RuntimeResult<ValidationReportWire>>,
    ),
    DataVersion(Sender<RuntimeResult<i64>>),
    Close(Sender<RuntimeResult<()>>),
}

/// Thread-safe, zero-JSON handle to an opened `.eidos` database running on a
/// dedicated single-writer worker thread. Designed for direct consumption by NSH.
pub struct RuntimeWorkerHandle {
    tx: Sender<WorkerCommand>,
    join: Option<JoinHandle<()>>,
}

impl RuntimeWorkerHandle {
    pub fn open(path: PathBuf, read_only: bool) -> RuntimeResult<Self> {
        let mode = if read_only {
            OpenMode::ReadOnly
        } else {
            OpenMode::ReadWrite
        };
        Self::spawn(path, mode, None)
    }

    pub fn create(path: PathBuf, title: String) -> RuntimeResult<Self> {
        Self::spawn(path, OpenMode::Create, Some(title))
    }

    fn spawn(path: PathBuf, mode: OpenMode, title: Option<String>) -> RuntimeResult<Self> {
        let (tx, rx) = mpsc::channel::<WorkerCommand>();
        let (ready_tx, ready_rx) = mpsc::channel::<RuntimeResult<()>>();

        let join = thread::Builder::new()
            .name("eidos-runtime-worker".into())
            .spawn(move || {
                let mut service = match mode {
                    OpenMode::Create => {
                        RustRuntimeService::create(&path, title.as_deref().unwrap_or("Untitled"))
                    }
                    OpenMode::ReadOnly => RustRuntimeService::open(&path, true),
                    OpenMode::ReadWrite => RustRuntimeService::open(&path, false),
                };
                match &service {
                    Ok(_) => {
                        let _ = ready_tx.send(Ok(()));
                    }
                    Err(err) => {
                        let _ = ready_tx.send(Err(err.clone()));
                        return;
                    }
                }
                let svc = service.as_mut().unwrap();
                while let Ok(cmd) = rx.recv() {
                    match cmd {
                        WorkerCommand::GetSnapshot(req, reply) => {
                            let _ = reply.send(svc.get_snapshot(&req));
                        }
                        WorkerCommand::GetSchemaPage(req, reply) => {
                            let _ = reply.send(svc.get_schema_page(&req));
                        }
                        WorkerCommand::QueryRows(req, reply) => {
                            let _ = reply.send(svc.query_rows(&req));
                        }
                        WorkerCommand::QueryColumnarPage {
                            table_id,
                            query,
                            field_ids,
                            offset,
                            limit,
                            calendar,
                            reply,
                        } => {
                            let _ = reply.send(svc.query_columnar_page(
                                &table_id,
                                &query,
                                &field_ids,
                                offset,
                                limit,
                                calendar.as_ref(),
                            ));
                        }
                        WorkerCommand::GetRowsById(req, reply) => {
                            let _ = reply.send(svc.get_rows_by_id(&req));
                        }
                        WorkerCommand::Aggregate(req, reply) => {
                            let _ = reply.send(svc.aggregate(&req));
                        }
                        WorkerCommand::GroupRows(req, reply) => {
                            let _ = reply.send(svc.group_rows(&req));
                        }
                        WorkerCommand::QueryGroupRows(req, reply) => {
                            let _ = reply.send(svc.query_group_rows(&req));
                        }
                        WorkerCommand::MutateRows(req, with_undo, reply) => {
                            let res = if with_undo {
                                svc.mutate_rows_with_undo(&req)
                            } else {
                                svc.mutate_rows(&req)
                            };
                            let _ = reply.send(res);
                        }
                        WorkerCommand::PreviewFormula(req, reply) => {
                            let _ = reply.send(svc.preview_formula(&req));
                        }
                        WorkerCommand::PreflightSchema(req, reply) => {
                            let _ = reply.send(svc.preflight_schema(&req));
                        }
                        WorkerCommand::MutateSchema(req, reply) => {
                            let _ = reply.send(svc.mutate_schema(&req));
                        }
                        WorkerCommand::Validate(req, reply) => {
                            let _ = reply.send(svc.validate(&req));
                        }
                        WorkerCommand::DataVersion(reply) => {
                            let _ = reply.send(svc.data_version());
                        }
                        WorkerCommand::Close(reply) => {
                            let _ = reply.send(Ok(()));
                            break;
                        }
                    }
                }
            })
            .map_err(|e| RuntimeErrorPayload::new("fatal", format!("spawn worker failed: {e}")))?;

        ready_rx
            .recv()
            .map_err(|_| RuntimeErrorPayload::new("fatal", "worker exited before ready"))??;

        Ok(Self {
            tx,
            join: Some(join),
        })
    }

    fn call<T>(
        &self,
        build: impl FnOnce(Sender<RuntimeResult<T>>) -> WorkerCommand,
    ) -> RuntimeResult<T> {
        let (reply_tx, reply_rx) = mpsc::channel();
        self.tx
            .send(build(reply_tx))
            .map_err(|_| RuntimeErrorPayload::new("closed", "Runtime worker is closed"))?;
        reply_rx
            .recv()
            .map_err(|_| RuntimeErrorPayload::new("closed", "Runtime worker disconnected"))?
    }

    pub fn get_snapshot(&self, req: GetSnapshotRequest) -> RuntimeResult<RuntimeSnapshot> {
        self.call(|r| WorkerCommand::GetSnapshot(req, r))
    }

    pub fn get_schema_page(&self, req: GetSchemaPageRequest) -> RuntimeResult<SchemaPage> {
        self.call(|r| WorkerCommand::GetSchemaPage(req, r))
    }

    pub fn query_rows(&self, req: QueryRowsRequest) -> RuntimeResult<RowPage> {
        self.call(|r| WorkerCommand::QueryRows(req, r))
    }

    pub fn query_columnar_page(
        &self,
        table_id: String,
        query: eidos_file_core::query::RowQuery,
        field_ids: Vec<String>,
        offset: usize,
        limit: usize,
        calendar: Option<crate::contract::CalendarContext>,
    ) -> RuntimeResult<crate::grid::ColumnarRowPage> {
        self.call(|reply| WorkerCommand::QueryColumnarPage {
            table_id,
            query,
            field_ids,
            offset,
            limit,
            calendar,
            reply,
        })
    }

    pub fn get_rows_by_id(
        &self,
        req: crate::contract::GetRowsByIdRequest,
    ) -> RuntimeResult<RowBatch> {
        self.call(|r| WorkerCommand::GetRowsById(req, r))
    }

    pub fn aggregate(&self, req: AggregateRequest) -> RuntimeResult<AggregateResponse> {
        self.call(|r| WorkerCommand::Aggregate(req, r))
    }

    pub fn group_rows(&self, req: GroupRequest) -> RuntimeResult<GroupPage> {
        self.call(|r| WorkerCommand::GroupRows(req, r))
    }

    pub fn query_group_rows(&self, req: GroupRowsRequest) -> RuntimeResult<GroupRowPage> {
        self.call(|r| WorkerCommand::QueryGroupRows(req, r))
    }

    pub fn mutate_rows(&self, req: RowMutationRequest) -> RuntimeResult<MutationResult> {
        self.call(|r| WorkerCommand::MutateRows(req, false, r))
    }

    pub fn mutate_rows_with_undo(&self, req: RowMutationRequest) -> RuntimeResult<MutationResult> {
        self.call(|r| WorkerCommand::MutateRows(req, true, r))
    }

    pub fn preview_formula(
        &self,
        req: FormulaPreviewRequest,
    ) -> RuntimeResult<FormulaPreviewResult> {
        self.call(|r| WorkerCommand::PreviewFormula(req, r))
    }

    pub fn preflight_schema(
        &self,
        req: SchemaPreflightRequest,
    ) -> RuntimeResult<SchemaPreflightResult> {
        self.call(|r| WorkerCommand::PreflightSchema(req, r))
    }

    pub fn mutate_schema(&self, req: SchemaMutationRequest) -> RuntimeResult<SchemaMutationResult> {
        self.call(|r| WorkerCommand::MutateSchema(req, r))
    }

    pub fn validate(&self, req: ValidationRequest) -> RuntimeResult<ValidationReportWire> {
        self.call(|r| WorkerCommand::Validate(req, r))
    }

    pub fn data_version(&self) -> RuntimeResult<i64> {
        self.call(WorkerCommand::DataVersion)
    }

    pub fn close(mut self) -> RuntimeResult<()> {
        let res = self.call(WorkerCommand::Close);
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
        res
    }
}

impl Drop for RuntimeWorkerHandle {
    fn drop(&mut self) {
        let (reply_tx, _rx) = mpsc::channel();
        let _ = self.tx.send(WorkerCommand::Close(reply_tx));
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}
