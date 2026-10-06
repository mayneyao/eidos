//! Error type and stable wire codes for Eidos File operations.
//!
//! The `code()` strings are part of the cross-implementation contract and
//! must stay stable; later phases (validation, query, mutations) return
//! these same codes.

/// Error type for all Eidos File operations.
#[derive(Debug, thiserror::Error)]
pub enum EidosError {
    /// Input is a SQLite database but not an Eidos File (identity checks of
    /// spec §4 failed).
    #[error("not an Eidos File: {0}")]
    NotEidosFile(String),
    /// `eidos__meta.format_major` / `user_version` is not supported.
    #[error("unsupported format version: {0}")]
    UnsupportedVersion(String),
    /// A required `eidos__features` entry is not supported.
    #[error("unsupported feature: {0}")]
    UnsupportedFeature(String),
    /// Canonical metadata or physical schema violates spec §7/§8.
    #[error("invalid schema: {0}")]
    InvalidSchema(String),
    /// A logical value fails the spec §5/§8 canonical encoding rules.
    #[error("invalid value: {0}")]
    InvalidValue(String),
    /// A request document is malformed or references the wrong object kind.
    #[error("invalid request: {0}")]
    InvalidRequest(String),
    /// A query document is malformed (spec-conformant shape violations).
    #[error("invalid query: {0}")]
    InvalidQuery(String),
    /// A referenced File/Table/Field/Row/View does not exist.
    #[error("not found: {0}")]
    NotFound(String),
    /// The target already exists (file path, name allocation, ID reuse).
    #[error("already exists: {0}")]
    AlreadyExists(String),
    /// `expectedRevision` did not match `eidos__meta.revision`.
    #[error("stale revision: current revision is {current_revision}")]
    StaleRevision {
        /// The current committed revision, as a decimal string (int64-safe).
        current_revision: String,
    },
    /// A spec §19 hard limit or an int64 ceiling was hit.
    #[error("resource limit: {0}")]
    ResourceLimit(String),
    /// SQLite reported corruption (`SQLITE_CORRUPT` and friends).
    #[error("corrupt file: {0}")]
    CorruptFile(String),
    /// A format-level operation is forbidden (e.g. immutable ID rewrite).
    #[error("forbidden: {0}")]
    Forbidden(String),
    /// The database is locked (`SQLITE_BUSY`).
    #[error("busy: {0}")]
    Busy(String),
    /// Anything that indicates a bug in this library rather than bad input.
    #[error("internal error: {0}")]
    Internal(String),
}

impl EidosError {
    /// Stable machine-readable wire code for this error.
    pub fn code(&self) -> &'static str {
        match self {
            EidosError::NotEidosFile(_) => "not-eidos-file",
            EidosError::UnsupportedVersion(_) => "unsupported-version",
            EidosError::UnsupportedFeature(_) => "unsupported-feature",
            EidosError::InvalidSchema(_) => "invalid-schema",
            EidosError::InvalidValue(_) => "invalid-value",
            EidosError::InvalidRequest(_) => "invalid-request",
            EidosError::InvalidQuery(_) => "invalid-query",
            EidosError::NotFound(_) => "not-found",
            EidosError::AlreadyExists(_) => "already-exists",
            EidosError::StaleRevision { .. } => "stale-revision",
            EidosError::ResourceLimit(_) => "resource-limit",
            EidosError::CorruptFile(_) => "corrupt-file",
            EidosError::Forbidden(_) => "forbidden",
            EidosError::Busy(_) => "busy",
            EidosError::Internal(_) => "internal",
        }
    }
}

/// Result alias used across the crate.
pub type Result<T> = std::result::Result<T, EidosError>;

impl From<rusqlite::Error> for EidosError {
    fn from(err: rusqlite::Error) -> Self {
        use rusqlite::ErrorCode;
        match &err {
            rusqlite::Error::SqliteFailure(code, _) => match code.code {
                ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked => {
                    EidosError::Busy(err.to_string())
                }
                ErrorCode::DatabaseCorrupt | ErrorCode::NotADatabase => {
                    EidosError::CorruptFile(err.to_string())
                }
                _ => EidosError::Internal(err.to_string()),
            },
            _ => EidosError::Internal(err.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_are_stable_wire_strings() {
        assert_eq!(
            EidosError::NotEidosFile("x".into()).code(),
            "not-eidos-file"
        );
        assert_eq!(
            EidosError::UnsupportedVersion("x".into()).code(),
            "unsupported-version"
        );
        assert_eq!(
            EidosError::UnsupportedFeature("x".into()).code(),
            "unsupported-feature"
        );
        assert_eq!(
            EidosError::InvalidSchema("x".into()).code(),
            "invalid-schema"
        );
        assert_eq!(EidosError::InvalidValue("x".into()).code(), "invalid-value");
        assert_eq!(
            EidosError::InvalidRequest("x".into()).code(),
            "invalid-request"
        );
        assert_eq!(EidosError::InvalidQuery("x".into()).code(), "invalid-query");
        assert_eq!(EidosError::NotFound("x".into()).code(), "not-found");
        assert_eq!(
            EidosError::AlreadyExists("x".into()).code(),
            "already-exists"
        );
        assert_eq!(
            EidosError::StaleRevision {
                current_revision: "42".into()
            }
            .code(),
            "stale-revision"
        );
        assert_eq!(
            EidosError::ResourceLimit("x".into()).code(),
            "resource-limit"
        );
        assert_eq!(EidosError::CorruptFile("x".into()).code(), "corrupt-file");
        assert_eq!(EidosError::Forbidden("x".into()).code(), "forbidden");
        assert_eq!(EidosError::Busy("x".into()).code(), "busy");
        assert_eq!(EidosError::Internal("x".into()).code(), "internal");
    }
}
