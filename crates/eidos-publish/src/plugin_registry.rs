use crate::error::{AppError, Result};
use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, io::Read};
const MAX_PACKAGE_BYTES: usize = 16 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginManifest {
    #[serde(rename = "apiVersion", default = "default_api_version")]
    pub api_version: u32,
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub icon: Option<serde_json::Value>,
    #[serde(default)]
    pub views: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    pub actions: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    pub browser: Option<serde_json::Value>,
    #[serde(default)]
    pub storage: Option<serde_json::Value>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

fn default_api_version() -> u32 {
    1
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginPackageEnvelope {
    pub format: u32,
    pub manifest: PluginManifest,
    pub modules: HashMap<String, String>,
}

pub fn decode_package(bytes: &[u8]) -> Result<PluginPackageEnvelope> {
    if bytes.len() > MAX_PACKAGE_BYTES {
        return Err(AppError::invalid_request(
            "compressed package exceeds 16 MiB",
        ));
    }
    let json_bytes = read_bounded(
        GzDecoder::new(bytes),
        MAX_PACKAGE_BYTES,
        "uncompressed package JSON",
    )?;

    let envelope: PluginPackageEnvelope = serde_json::from_slice(&json_bytes).map_err(|error| {
        AppError::invalid_request(format!("invalid plugin package envelope: {error}"))
    })?;

    if !matches!(envelope.format, 1 | 2) {
        return Err(AppError::invalid_request(format!(
            "unsupported plugin package format: {}",
            envelope.format
        )));
    }

    if (envelope.format == 2) != envelope.manifest.extra.contains_key("requires") {
        return Err(AppError::invalid_request(
            "Packages declaring requires must use format 2; format 2 requires a minimum plugin API",
        ));
    }
    if !is_valid_plugin_id(&envelope.manifest.id) {
        return Err(AppError::invalid_request(format!(
            "invalid plugin id in manifest: '{}'",
            envelope.manifest.id
        )));
    }
    for entry in envelope.modules.keys() {
        module_path(entry)?;
    }

    Ok(envelope)
}

pub fn module_path(entry: &str) -> Result<&str> {
    let clean = entry.strip_prefix("./").unwrap_or(entry);
    if clean.contains(['\\', ':'])
        || clean == "plugin.json"
        || clean
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        return Err(AppError::invalid_request("invalid plugin module path"));
    }
    Ok(clean)
}

fn read_bounded(reader: impl Read, limit: usize, label: &str) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    reader
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| AppError::invalid_request(format!("cannot read {label}: {error}")))?;
    if bytes.len() > limit {
        return Err(AppError::invalid_request(format!(
            "{label} exceeds {limit} byte limit"
        )));
    }
    Ok(bytes)
}

pub fn is_valid_plugin_id(id: &str) -> bool {
    if id.is_empty() || id.len() > 128 {
        return false;
    }
    let segments: Vec<&str> = id.split('.').collect();
    if segments.len() < 2 {
        return false;
    }
    segments.iter().all(|s| {
        !s.is_empty()
            && s.starts_with(|c: char| c.is_ascii_lowercase())
            && s.chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    })
}
