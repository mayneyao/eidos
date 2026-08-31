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

    pub fn attachment(message: impl Into<String>) -> Self {
        Self {
            code: "attachment-error",
            message: message.into(),
            current_revision: None,
        }
    }

    pub fn runtime(
        code: &str,
        message: impl Into<String>,
        current_revision: Option<String>,
    ) -> Self {
        let code = match code {
            "invalid-request" => "invalid-request",
            "unsupported" => "unsupported",
            "not-found" => "not-found",
            "already-exists" => "already-exists",
            "invalid-value" => "invalid-value",
            "invalid-query" => "invalid-query",
            "invalid-formula" => "invalid-formula",
            "cycle" => "cycle",
            "constraint" => "constraint",
            "stale-revision" => "stale-revision",
            "conflict" => "conflict",
            "forbidden" => "forbidden",
            "lossy-confirmation-required" => "lossy-confirmation-required",
            "invalid-plan" => "invalid-plan",
            "plan-expired" => "plan-expired",
            "resource-limit" => "resource-limit",
            "busy" => "busy",
            "corrupt-file" => "corrupt-file",
            "unsupported-version" => "unsupported-version",
            "adapter-error" => "adapter-error",
            "closed" => "closed",
            "cancelled" => "cancelled",
            "deadline-exceeded" => "deadline-exceeded",
            "fatal" => "fatal",
            _ => "internal",
        };
        Self {
            code,
            message: message.into(),
            current_revision,
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
