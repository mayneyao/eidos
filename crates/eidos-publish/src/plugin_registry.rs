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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resources: Option<HashMap<String, String>>,
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

    if !matches!(envelope.format, 1..=3) {
        return Err(AppError::invalid_request(format!(
            "unsupported plugin package format: {}",
            envelope.format
        )));
    }

    if (envelope.format != 1) != envelope.manifest.extra.contains_key("requires") {
        return Err(AppError::invalid_request(
            "Packages declaring requires must use format 2 or 3; both require a minimum plugin API; localization requires format 3",
        ));
    }
    validate_localization(&envelope)?;
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

pub fn validate_localization(envelope: &PluginPackageEnvelope) -> Result<()> {
    let invalid = || AppError::invalid_request("invalid plugin localization resources");
    let declaration = envelope.manifest.extra.get("i18n");
    if (envelope.format == 3) != declaration.is_some()
        || (envelope.format == 3) != envelope.resources.is_some()
    {
        return Err(invalid());
    }
    let Some(declaration) = declaration else {
        return Ok(());
    };
    let resources = envelope.resources.as_ref().ok_or_else(invalid)?;
    let default = declaration["defaultLocale"].as_str().ok_or_else(invalid)?;
    let messages = declaration["messages"].as_object().ok_or_else(invalid)?;
    let version = envelope
        .manifest
        .extra
        .get("requires")
        .and_then(|v| v["pluginApi"].as_str())
        .unwrap_or("");
    let version: Vec<u64> = version.split('.').map(|v| v.parse().unwrap_or(0)).collect();
    if version.len() != 3
        || !(version[0] > 3 || (version[0] == 3 && version[1] >= 7))
        || !messages.contains_key(default)
        || messages.is_empty()
        || messages.len() > 32
    {
        return Err(invalid());
    }
    let mut paths = std::collections::HashSet::new();
    for kind in ["messages", "readme"] {
        let Some(locales) = declaration.get(kind) else {
            continue;
        };
        let locales = locales.as_object().ok_or_else(invalid)?;
        if locales.is_empty() || locales.len() > 32 || !locales.contains_key(default) {
            return Err(invalid());
        }
        for (locale, path) in locales {
            if locale.is_empty()
                || locale.len() > 64
                || !locale
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-')
            {
                return Err(invalid());
            }
            let path = path.as_str().ok_or_else(invalid)?;
            module_path(path)?;
            if !path.starts_with("./")
                || !path.ends_with(if kind == "messages" { ".json" } else { ".md" })
            {
                return Err(invalid());
            }
            paths.insert(path);
            let value = resources.get(path).ok_or_else(invalid)?;
            if value.len() > 1024 * 1024 {
                return Err(invalid());
            }
            if kind == "messages" {
                let messages: serde_json::Value =
                    serde_json::from_str(value).map_err(|_| invalid())?;
                let messages = messages.as_object().ok_or_else(invalid)?;
                if messages.len() > 4096
                    || messages.iter().any(|(key, value)| {
                        key.is_empty()
                            || key.len() > 128
                            || !key.bytes().all(|b| {
                                b.is_ascii_alphanumeric() || matches!(b, b'_' | b'.' | b'-')
                            })
                            || value.as_str().is_none_or(|v| {
                                v.encode_utf16().count() > 4096 || v.chars().any(char::is_control)
                            })
                    })
                {
                    return Err(invalid());
                }
            }
        }
    }
    if resources.len() != paths.len() {
        return Err(invalid());
    }
    let default_messages: serde_json::Value =
        serde_json::from_str(&resources[messages[default].as_str().ok_or_else(invalid)?])
            .map_err(|_| invalid())?;
    let manifest = serde_json::to_value(&envelope.manifest).map_err(|_| invalid())?;
    let mut labels = vec![&manifest["name"], &manifest["description"]];
    for kind in ["views", "actions", "formatters", "hooks", "fileTemplates"] {
        for item in manifest[kind].as_array().into_iter().flatten() {
            labels.push(&item["title"]);
            if kind == "views" {
                for property in item["configuration"]["properties"]
                    .as_object()
                    .into_iter()
                    .flat_map(|v| v.values())
                {
                    labels.extend([&property["title"], &property["description"]]);
                }
            }
        }
    }
    for kind in ["settings", "connections"] {
        for item in manifest[kind]
            .as_object()
            .into_iter()
            .flat_map(|v| v.values())
        {
            labels.push(&item["title"]);
            if kind == "settings" {
                labels.push(&item["description"]);
            }
        }
    }
    for label in labels.into_iter().filter_map(serde_json::Value::as_str) {
        if let Some(key) = label.strip_prefix('%').and_then(|v| v.strip_suffix('%'))
            && !key.is_empty()
            && !key.contains('%')
            && default_messages.get(key).is_none()
        {
            return Err(invalid());
        }
    }
    Ok(())
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

#[cfg(test)]
mod localization_tests {
    use super::*;
    use flate2::{Compression, write::GzEncoder};
    use std::io::Write;

    fn package() -> serde_json::Value {
        serde_json::json!({ "format": 3, "manifest": { "apiVersion": 1, "id": "test.i18n", "version": "1.0.0", "name": "%name%", "requires": {"pluginApi": "3.7.0"}, "i18n": {"defaultLocale": "en", "messages": {"en": "./en.json"}, "readme": {"en": "./README.md"}} }, "modules": {}, "resources": {"./en.json": "{\"name\":\"History\"}", "./README.md": "# History"} })
    }
    fn decode(value: serde_json::Value) -> Result<PluginPackageEnvelope> {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder
            .write_all(&serde_json::to_vec(&value).unwrap())
            .unwrap();
        decode_package(&encoder.finish().unwrap())
    }
    #[test]
    fn format_three_preserves_resources_and_rejects_invalid_localization() {
        assert_eq!(
            decode(package()).unwrap().resources.unwrap()["./README.md"],
            "# History"
        );
        let mut extra = package();
        extra["resources"]["./extra.md"] = serde_json::json!("extra");
        assert!(decode(extra).is_err());
        let mut missing = package();
        missing["resources"]["./en.json"] = serde_json::json!("{}");
        assert!(decode(missing).is_err());
        let mut traversal = package();
        traversal["manifest"]["i18n"]["messages"]["en"] = serde_json::json!("./../en.json");
        assert!(decode(traversal).is_err());
        let mut old = package();
        old["manifest"]["requires"]["pluginApi"] = serde_json::json!("3.6.0");
        assert!(decode(old).is_err());
    }
}
