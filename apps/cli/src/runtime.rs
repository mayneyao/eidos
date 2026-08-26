//! Thin one-shot bridge from the Agent CLI to the canonical TypeScript Runtime.
//!
//! Formula and Lookup semantics belong to `packages/eidos-file`. The CLI
//! opens the same file through qjs-host and forwards Runtime requests instead
//! of implementing a second evaluator in Rust.

use std::path::Path;
use std::rc::Rc;

use qjs_host::{QjsHost, clear_active_context, open_host_state, open_host_state_read_only};
use serde_json::{Value, json};

use crate::error::{AppError, Result};

pub struct RuntimeSession {
    host: QjsHost,
}

impl RuntimeSession {
    pub fn call(&self, method: &str, request: &Value) -> Result<Value> {
        let request_json = serde_json::to_string(request)
            .map_err(|error| AppError::internal(format!("serialize Runtime request: {error}")))?;
        let context = json!({
            "requestId": format!("cli-{method}"),
            "deadlineMilliseconds": 30_000,
        });
        let context_json = serde_json::to_string(&context)
            .map_err(|error| AppError::internal(format!("serialize Runtime context: {error}")))?;
        let raw = self
            .host
            .invoke("call", &[method.to_string(), request_json, context_json])
            .map_err(|error| AppError::internal(format!("Runtime {method} failed: {error}")))?;
        parse_envelope(&raw, method, true)
    }

    fn close(&self) -> Result<()> {
        let raw = self
            .host
            .invoke("close", &[])
            .map_err(|error| AppError::internal(format!("close Runtime session: {error}")))?;
        let _ = parse_envelope(&raw, "close", false)?;
        Ok(())
    }
}

pub fn with_session<T>(
    file: &Path,
    writable: bool,
    action: impl FnOnce(&RuntimeSession) -> Result<T>,
) -> Result<T> {
    let state = if writable {
        open_host_state(file)
    } else {
        open_host_state_read_only(file)
    }
    .map_err(|error| AppError::internal(format!("open Runtime host: {error}")))?;
    let state = Rc::new(state);
    let host = QjsHost::new(&state)
        .map_err(|error| AppError::internal(format!("create Runtime host: {error}")))?;
    let session = RuntimeSession { host };
    let open_request = json!({
        "mode": "open",
        "access": if writable { "readwrite" } else { "read" },
    });
    let open_raw = session
        .host
        .invoke(
            "open",
            &[serde_json::to_string(&open_request).map_err(|error| {
                AppError::internal(format!("serialize Runtime open request: {error}"))
            })?],
        )
        .map_err(|error| AppError::internal(format!("open Runtime session: {error}")))?;
    if let Err(error) = parse_envelope(&open_raw, "open", false) {
        clear_active_context();
        return Err(error);
    }

    let result = action(&session);
    let close_result = session.close();
    clear_active_context();
    match (result, close_result) {
        (Err(error), _) => Err(error),
        (Ok(_value), Err(error)) => Err(error),
        (Ok(value), Ok(())) => Ok(value),
    }
}

fn parse_envelope(raw: &str, method: &str, unwrap_value: bool) -> Result<Value> {
    let envelope: Value = serde_json::from_str(raw).map_err(|error| {
        AppError::internal(format!("Runtime {method} returned invalid JSON: {error}"))
    })?;
    if envelope.get("ok") != Some(&Value::Bool(true)) {
        let error = envelope
            .get("error")
            .and_then(Value::as_object)
            .ok_or_else(|| {
                AppError::internal(format!(
                    "Runtime {method} returned an invalid error envelope"
                ))
            })?;
        let code = error
            .get("code")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        let message = error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Runtime request failed");
        let current_revision = error
            .get("currentRevision")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        return Err(AppError::runtime(code, message, current_revision));
    }
    if unwrap_value {
        Ok(envelope.get("value").cloned().unwrap_or(Value::Null))
    } else {
        Ok(envelope)
    }
}
