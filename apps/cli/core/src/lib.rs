//! `eidos-file-core` — the shared foundation of the Rust implementation of
//! Eidos File Format 1.0 (the SQLite-based `*.eidos` open file format).
//!
//! Module map (agent CLI alpha):
//!
//! - [`error`] (real): `EidosError` with stable wire codes and `rusqlite`
//!   conversion.
//! - [`id`] (real): UUIDv7 generation/validation and id-hex helpers.
//! - [`time`] (real): canonical date/instant validation and `now_instant`.
//! - [`naming`] (real): §6 display-first physical-name mapping.
//! - [`jcs`] (real): RFC 8785 canonical JSON for the Eidos subset.
//! - [`ddl`] (real): canonical §7 DDL, connection pragmas, file creation,
//!   revision increment.
//! - [`model`] (real): typed metadata rows and loaders.
//! - [`values`] (real): §8 logical-value validation/coercion to SQL bindings.
//! - [`validate`]: cumulative File identity/structure/content validation.
//! - [`query`]: ER `RowQuery` model, safe SQL compilation, and logical reads.
//! - [`rows`]: revision-checked atomic row reads and mutations.
//! - [`relation`]: §10.4 triggers and delete-policy preflight.
//! - [`schema_ops`]: stored-field schema mutations used by the agent CLI.
//! - [`view_ops`]: canonical saved-View mutations used by the agent CLI.
//!
//! Formula, Lookup, inverse-Relation creation/evaluation, and the full Runtime
//! conformance surface are intentionally outside this alpha.

pub mod ddl;
pub mod error;
pub mod id;
pub mod jcs;
pub mod model;
pub mod naming;
pub mod query;
pub mod relation;
pub mod rows;
pub mod schema_ops;
pub mod time;
pub mod validate;
pub mod values;
pub mod view_ops;

pub use error::{EidosError, Result};
