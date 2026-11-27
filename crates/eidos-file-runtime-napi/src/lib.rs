//! Node-API (N-API) binding exposing `eidos-file-runtime::RustRuntimeService`
//! to Electron / Node.js (`apps/eidos-lite-desktop`).

use std::path::Path;

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

#[napi]
pub struct NativeEidosRuntime {
    service: Option<RustRuntimeService>,
}

#[napi]
impl NativeEidosRuntime {
    #[napi(factory)]
    pub fn create(file_path: String, title: String) -> Result<Self> {
        let svc = RustRuntimeService::create(Path::new(&file_path), &title).map_err(to_napi_err)?;
        Ok(Self { service: Some(svc) })
    }

    #[napi(factory)]
    pub fn open(file_path: String, read_only: bool) -> Result<Self> {
        let svc =
            RustRuntimeService::open(Path::new(&file_path), read_only).map_err(to_napi_err)?;
        Ok(Self { service: Some(svc) })
    }

    #[napi]
    pub fn call(&mut self, method: String, request_json: String) -> Result<String> {
        let svc = self
            .service
            .as_mut()
            .ok_or_else(|| to_napi_err(RuntimeErrorPayload::new("closed", "Runtime is closed")))?;
        svc.invoke_wire_json(&method, &request_json)
            .map_err(to_napi_err)
    }

    #[napi]
    pub fn data_version(&self) -> Result<String> {
        let svc = self
            .service
            .as_ref()
            .ok_or_else(|| to_napi_err(RuntimeErrorPayload::new("closed", "Runtime is closed")))?;
        let v = svc.data_version().map_err(to_napi_err)?;
        Ok(v.to_string())
    }

    #[napi]
    pub fn load_extension(&self, ext_path: String) -> Result<()> {
        let svc = self
            .service
            .as_ref()
            .ok_or_else(|| to_napi_err(RuntimeErrorPayload::new("closed", "Runtime is closed")))?;
        svc.load_extension(Path::new(&ext_path))
            .map_err(to_napi_err)
    }

    #[napi]
    pub fn close(&mut self) -> Result<()> {
        if let Some(mut svc) = self.service.take() {
            svc.close().map_err(to_napi_err)?;
        }
        Ok(())
    }
}
