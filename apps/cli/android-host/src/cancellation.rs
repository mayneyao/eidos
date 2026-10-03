//! Per-operation cancellation, independently reachable while the Graft host is busy.
use anyhow::{anyhow, ensure, Result};
use graft_sdk::{CancellationToken, TransferDirection, TransferProgressReporter};
use std::{
    collections::HashMap,
    sync::{Arc, LazyLock, Mutex},
};

#[derive(Clone)]
struct Operation {
    token: CancellationToken,
    downloaded: Arc<Mutex<u64>>,
}

static TOKENS: LazyLock<Mutex<HashMap<String, Operation>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn begin(id: &str) -> Result<()> {
    ensure!(
        !id.is_empty() && id.len() <= 128,
        "Invalid cancellation identity"
    );
    let mut tokens = TOKENS
        .lock()
        .map_err(|_| anyhow!("Cancellation registry unavailable"))?;
    ensure!(
        tokens.len() < 1024 && !tokens.contains_key(id),
        "Cancellation identity already active or registry full"
    );
    tokens.insert(
        id.into(),
        Operation {
            token: CancellationToken::new(),
            downloaded: Arc::new(Mutex::new(0)),
        },
    );
    Ok(())
}

pub fn cancel(id: &str) {
    if let Ok(tokens) = TOKENS.lock() {
        if let Some(token) = tokens.get(id) {
            token.token.cancel();
        }
    }
}

pub fn end(id: &str) {
    if let Ok(mut tokens) = TOKENS.lock() {
        tokens.remove(id);
    }
}

pub fn downloaded(id: &str) -> Option<u64> {
    let operation = TOKENS.lock().ok()?.get(id)?.clone();
    let bytes = *operation.downloaded.lock().ok()?;
    Some(bytes)
}

pub fn run<T>(id: Option<&str>, operation: impl FnOnce() -> Result<T>) -> Result<T> {
    let Some(id) = id else {
        return operation();
    };
    let token = TOKENS
        .lock()
        .map_err(|_| anyhow!("Cancellation registry unavailable"))?
        .get(id)
        .cloned()
        .ok_or_else(|| anyhow!("Cancellation identity is not active"))?;
    ensure!(!token.token.is_cancelled(), "Graft operation cancelled");
    let bytes = token.downloaded.clone();
    let reporter = TransferProgressReporter::new(move |progress| {
        if progress.direction == TransferDirection::Download {
            if let Ok(mut bytes) = bytes.lock() {
                *bytes = progress.transferred_bytes;
            }
        }
    });
    graft_sdk::with_cancellation(&token.token, || {
        graft_sdk::with_transfer_progress(&reporter, operation)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancellation_is_scoped_and_can_arrive_before_dispatch() -> Result<()> {
        let first = "cancel-test-first";
        let second = "cancel-test-second";
        begin(first)?;
        begin(second)?;
        assert_eq!(downloaded(first), Some(0));
        assert_eq!(downloaded(second), Some(0));
        assert!(begin(first).is_err());
        cancel(first);
        assert!(run(Some(first), || Ok(())).is_err());
        assert_eq!(run(Some(second), || Ok(42))?, 42);
        end(first);
        assert_eq!(downloaded(first), None);
        assert!(run(Some(first), || Ok(())).is_err());
        cancel(first);
        assert_eq!(run(Some(second), || Ok(43))?, 43);
        end(second);
        Ok(())
    }
}
