//! `eidos-file-runtime` — Native Rust Runtime 1.0 implementation for Eidos File.
//!
//! Coexists alongside the TypeScript reference runtime (`packages/eidos-file`)
//! under one shared `RuntimeClient` 1.0 specification and conformance suite.
//!
//! - **Eidos Lite (Electron)** consumes this crate via `eidos-file-runtime-napi`
//!   behind `EIDOS_LITE_RUNTIME_BACKEND=rust|shadow`.
//! - **NSH Native / CLI / Mobile** consume `RustRuntimeService` or
//!   `RuntimeWorkerHandle` directly in Rust with zero JS/JSON overhead.

pub mod aggregate;
pub mod calendar;
pub mod contract;
pub mod conversion;
mod creation;
pub mod csv_io;
mod cursor;
pub mod formula;
pub mod grid;
pub mod lookup;
mod saved_query;
pub mod service;
pub mod undo;
pub mod worker;

pub use contract::*;
pub use grid::{ColumnarColumn, ColumnarColumnMeta, ColumnarRowPage, GridCellKind};
pub use service::{OpenMode, RustRuntimeService};
pub use worker::RuntimeWorkerHandle;
