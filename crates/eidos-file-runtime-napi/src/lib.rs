//! Node-API (N-API) binding exposing `eidos-file-runtime::RustRuntimeService`
//! to Electron / Node.js (`apps/eidos-lite-desktop`).

use std::path::Path;
use std::sync::{
    Arc, Mutex, MutexGuard,
    atomic::{AtomicBool, Ordering},
};
use std::time::{Duration, Instant};

use eidos_file_runtime::{RuntimeErrorPayload, RustRuntimeService};
use napi::bindgen_prelude::*;
use napi_derive::napi;

fn to_napi_err(err: RuntimeErrorPayload) -> Error {
    let encoded = serde_json::to_string(&err).unwrap_or_else(|_| err.message.clone());
    Error::new(
        Status::GenericFailure,
        format!("__EIDOS_RT_ERR__:{encoded}"),
    )
}

type Service = Arc<Mutex<Option<RustRuntimeService>>>;

fn lock(service: &Service) -> Result<MutexGuard<'_, Option<RustRuntimeService>>> {
    service
        .lock()
        .map_err(|_| to_napi_err(RuntimeErrorPayload::new("fatal", "Runtime worker failed")))
}

pub struct NativeRead {
    service: Service,
    method: String,
    request_json: String,
    cancelled: Arc<AtomicBool>,
    deadline: Instant,
}

impl napi::Task for NativeRead {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> Result<String> {
        let mut guard = lock(&self.service)?;
        let svc = guard
            .as_mut()
            .ok_or_else(|| to_napi_err(RuntimeErrorPayload::new("closed", "Runtime is closed")))?;
        let cancelled = self.cancelled.clone();
        let deadline = self.deadline;
        let check = || {
            let code = if self.cancelled.load(Ordering::Relaxed) {
                "cancelled"
            } else if Instant::now() >= deadline {
                "deadline-exceeded"
            } else {
                return Ok(());
            };
            let mut error = RuntimeErrorPayload::new(code, "Read interrupted");
            error.retryable = true;
            Err(to_napi_err(error))
        };
        check()?;
        let hook_error = |e: rusqlite::Error| {
            to_napi_err(RuntimeErrorPayload::new("adapter-error", e.to_string()))
        };
        svc.connection()
            .progress_handler(
                1000,
                Some(move || cancelled.load(Ordering::Relaxed) || Instant::now() >= deadline),
            )
            .map_err(hook_error)?;
        let result = svc.invoke_wire_json(&self.method, &self.request_json);
        svc.connection()
            .progress_handler(0, None::<fn() -> bool>)
            .map_err(hook_error)?;
        check()?;
        result.map_err(to_napi_err)
    }

    fn resolve(&mut self, _env: napi::Env, value: String) -> Result<String> {
        Ok(value)
    }
}

#[napi]
pub struct NativeEidosRuntime {
    service: Service,
    cancelled: Arc<AtomicBool>,
}

#[napi]
impl NativeEidosRuntime {
    #[napi(factory)]
    pub fn create(file_path: String, title: String) -> Result<Self> {
        let svc = RustRuntimeService::create(Path::new(&file_path), &title).map_err(to_napi_err)?;
        Ok(Self {
            service: Arc::new(Mutex::new(Some(svc))),
            cancelled: Arc::default(),
        })
    }

    #[napi(factory)]
    pub fn open(file_path: String, read_only: bool) -> Result<Self> {
        let svc =
            RustRuntimeService::open(Path::new(&file_path), read_only).map_err(to_napi_err)?;
        Ok(Self {
            service: Arc::new(Mutex::new(Some(svc))),
            cancelled: Arc::default(),
        })
    }

    #[napi]
    pub fn read_async(
        &mut self,
        method: String,
        request_json: String,
        timeout_ms: u32,
    ) -> Result<AsyncTask<NativeRead>> {
        if !matches!(
            method.as_str(),
            "aggregate"
                | "queryRows"
                | "queryRowPages"
                | "getRowsById"
                | "getRecordNeighbors"
                | "getRowIndex"
                | "groupRows"
                | "queryGroupRows"
                | "previewFormula"
                | "exportCsv"
                | "validate"
        ) {
            return Err(to_napi_err(RuntimeErrorPayload::new(
                "invalid-request",
                "Unsupported asynchronous read",
            )));
        }
        self.cancelled = Arc::default();
        Ok(AsyncTask::new(NativeRead {
            service: self.service.clone(),
            method,
            request_json,
            cancelled: self.cancelled.clone(),
            deadline: Instant::now() + Duration::from_millis(timeout_ms.into()),
        }))
    }

    #[napi]
    pub fn cancel_read(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
    }

    #[napi]
    pub fn call(&mut self, method: String, request_json: String) -> Result<String> {
        let mut guard = lock(&self.service)?;
        let svc = guard
            .as_mut()
            .ok_or_else(|| to_napi_err(RuntimeErrorPayload::new("closed", "Runtime is closed")))?;
        svc.invoke_wire_json(&method, &request_json)
            .map_err(to_napi_err)
    }

    #[napi]
    pub fn set_space_file_columns(&mut self, fields: Vec<String>) -> Result<()> {
        lock(&self.service)?
            .as_mut()
            .ok_or_else(|| to_napi_err(RuntimeErrorPayload::new("closed", "Runtime is closed")))?
            .set_space_file_columns(fields);
        Ok(())
    }

    #[napi]
    pub fn data_version(&self) -> Result<String> {
        let guard = lock(&self.service)?;
        let svc = guard
            .as_ref()
            .ok_or_else(|| to_napi_err(RuntimeErrorPayload::new("closed", "Runtime is closed")))?;
        let v = svc.data_version().map_err(to_napi_err)?;
        Ok(v.to_string())
    }

    #[napi]
    pub fn load_extension(&self, ext_path: String) -> Result<()> {
        let guard = lock(&self.service)?;
        let svc = guard
            .as_ref()
            .ok_or_else(|| to_napi_err(RuntimeErrorPayload::new("closed", "Runtime is closed")))?;
        svc.load_extension(Path::new(&ext_path))
            .map_err(to_napi_err)
    }

    #[napi]
    pub fn close(&mut self) -> Result<()> {
        if let Some(mut svc) = lock(&self.service)?.take() {
            svc.close().map_err(to_napi_err)?;
        }
        Ok(())
    }
}
