use eidos_file_core::EidosError;
use serde_json::{Value, json};

#[derive(Debug)]
pub struct AppError {
    pub code: &'static str,
    pub message: String,
    pub current_revision: Option<String>,
}

impl AppError {
    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self {
            code: "invalid-request",
            message: message.into(),
            current_revision: None,
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            code: "internal",
            message: message.into(),
            current_revision: None,
        }
    }

    pub fn upgrade_failed(message: impl Into<String>) -> Self {
        Self {
            code: "upgrade-failed",
            message: message.into(),
            current_revision: None,
        }
    }

    pub fn publish_failed(message: impl Into<String>) -> Self {
        Self {
            code: "publish-failed",
            message: message.into(),
            current_revision: None,
        }
    }

    pub fn to_json(&self) -> Value {
        let mut error = serde_json::Map::new();
        error.insert("code".into(), json!(self.code));
        error.insert("message".into(), json!(self.message));
        if let Some(revision) = &self.current_revision {
            error.insert("currentRevision".into(), json!(revision));
        }
        json!({ "error": error })
    }
}

impl From<EidosError> for AppError {
    fn from(error: EidosError) -> Self {
        let current_revision = match &error {
            EidosError::StaleRevision { current_revision } => Some(current_revision.clone()),
            _ => None,
        };
        Self {
            code: error.code(),
            message: error.to_string(),
            current_revision,
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        Self::invalid_request(format!("invalid JSON: {error}"))
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        Self::internal(error.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
