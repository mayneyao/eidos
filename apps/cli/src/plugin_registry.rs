use std::collections::HashMap;
use std::env;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use flate2::read::GzDecoder;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};

use crate::error::{AppError, Result};

pub const DEFAULT_REGISTRY_URL: &str =
    "https://raw.githubusercontent.com/eidos-space/registry/main/plugins.registry.json";

const ALLOWED_HOSTS: &[&str] = &[
    "raw.githubusercontent.com",
    "github.com",
    "release-assets.githubusercontent.com",
    "objects.githubusercontent.com",
];

const MAX_REGISTRY_BYTES: usize = 1024 * 1024; // 1 MiB
const MAX_PACKAGE_BYTES: usize = 16 * 1024 * 1024; // 16 MiB

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct MarketplacePlugin {
    pub id: String,
    pub name: String,
    pub description: String,
    pub repo: String,
    pub version: String,
    pub tag: String,
    pub asset: String,
    pub sha256: String,
    #[serde(default)]
    pub preview: Option<bool>,
    #[serde(default)]
    pub compatibility: Option<String>,
    #[serde(default)]
    pub icon: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistryRoot {
    schema_version: u32,
    plugins: Vec<MarketplacePlugin>,
}

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

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct DesktopConfig {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub installed: HashMap<String, InstalledBinding>,
    #[serde(default)]
    pub spaces: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub associations: HashMap<String, String>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

impl Default for DesktopConfig {
    fn default() -> Self {
        Self {
            version: 1,
            installed: HashMap::new(),
            spaces: HashMap::new(),
            associations: HashMap::new(),
            extra: HashMap::new(),
        }
    }
}

fn default_version() -> u32 {
    1
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct InstalledBinding {
    pub hash: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct InstalledPluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub hash: String,
    pub path: PathBuf,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

pub struct PluginRegistryClient {
    client: Client,
    registry_url: String,
}

impl PluginRegistryClient {
    pub fn new() -> Result<Self> {
        let registry_url = env::var("EIDOS_PLUGIN_REGISTRY_URL")
            .unwrap_or_else(|_| DEFAULT_REGISTRY_URL.to_string());
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|error| AppError::internal(format!("cannot create HTTP client: {error}")))?;
        Ok(Self {
            client,
            registry_url,
        })
    }

    pub fn fetch_catalog(&self) -> Result<Vec<MarketplacePlugin>> {
        let cache_path = marketplace_cache_path();
        let response = match self.client.get(&self.registry_url).send() {
            Ok(res) if res.status().is_success() => {
                let bytes = read_bounded(res, MAX_REGISTRY_BYTES, "registry payload")?;
                // Save to cache
                if let Some(parent) = cache_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = fs::write(&cache_path, &bytes);
                bytes.to_vec()
            }
            Err(error) => {
                // Fallback to offline cache
                if cache_path.is_file() {
                    fs::read(&cache_path).map_err(|_| {
                        AppError::invalid_request(format!("cannot reach plugin registry: {error}"))
                    })?
                } else {
                    return Err(AppError::invalid_request(format!(
                        "cannot reach plugin registry: {error}"
                    )));
                }
            }
            Ok(res) => {
                if cache_path.is_file() {
                    fs::read(&cache_path).map_err(|_| {
                        AppError::invalid_request(format!("registry returned {}", res.status()))
                    })?
                } else {
                    return Err(AppError::invalid_request(format!(
                        "registry returned {}",
                        res.status()
                    )));
                }
            }
        };

        let root: RegistryRoot = serde_json::from_slice(&response).map_err(|error| {
            AppError::invalid_request(format!("invalid plugin registry JSON: {error}"))
        })?;

        if root.schema_version != 1 {
            return Err(AppError::invalid_request(format!(
                "unsupported registry schemaVersion: {}",
                root.schema_version
            )));
        }

        Ok(root.plugins)
    }

    pub fn find(&self, id: &str) -> Result<MarketplacePlugin> {
        let catalog = self.fetch_catalog()?;
        catalog.into_iter().find(|p| p.id == id).ok_or_else(|| {
            AppError::invalid_request(format!("plugin '{id}' not found in registry"))
        })
    }

    pub fn search(&self, query: &str) -> Result<Vec<MarketplacePlugin>> {
        let catalog = self.fetch_catalog()?;
        let query_lower = query.to_lowercase();
        let matched: Vec<_> = catalog
            .into_iter()
            .filter(|p| {
                p.id.to_lowercase().contains(&query_lower)
                    || p.name.to_lowercase().contains(&query_lower)
                    || p.description.to_lowercase().contains(&query_lower)
            })
            .collect();
        Ok(matched)
    }

    pub fn download(&self, entry: &MarketplacePlugin) -> Result<Vec<u8>> {
        let url = format!(
            "https://github.com/{}/releases/download/{}/{}",
            entry.repo, entry.tag, entry.asset
        );
        validate_download_url(&url)?;

        let response = self.client.get(&url).send().map_err(|error| {
            AppError::invalid_request(format!("cannot download plugin {}: {error}", entry.id))
        })?;

        if !response.status().is_success() {
            return Err(AppError::invalid_request(format!(
                "failed downloading {}: HTTP {}",
                entry.id,
                response.status()
            )));
        }

        let bytes = read_bounded(response, MAX_PACKAGE_BYTES, "plugin package")?;

        // SHA-256 verification
        let hash = format!("{:x}", Sha256::digest(&bytes));
        if hash != entry.sha256 {
            return Err(AppError::invalid_request(format!(
                "plugin package integrity check failed: expected sha256 {}, got {}",
                entry.sha256, hash
            )));
        }

        Ok(bytes.to_vec())
    }
}

fn validate_download_url(url: &str) -> Result<()> {
    if !url.starts_with("https://") {
        return Err(AppError::invalid_request("download URL must use HTTPS"));
    }
    let host = url
        .trim_start_matches("https://")
        .split(['/', ':', '?'])
        .next()
        .unwrap_or_default();
    if !ALLOWED_HOSTS.contains(&host) {
        return Err(AppError::invalid_request(format!(
            "download from untrusted host '{host}' is forbidden"
        )));
    }
    Ok(())
}

pub fn device_plugins_dir() -> PathBuf {
    if let Some(explicit) = env::var_os("EIDOS_HOME") {
        let path = PathBuf::from(explicit);
        if path.is_absolute() {
            return path.join("plugins");
        }
    }
    #[cfg(windows)]
    {
        if let Some(profile) = env::var_os("USERPROFILE") {
            return PathBuf::from(profile).join(".eidos").join("plugins");
        }
    }
    let home = env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    home.join(".eidos").join("plugins")
}

fn marketplace_cache_path() -> PathBuf {
    device_plugins_dir()
        .parent()
        .unwrap()
        .join("marketplace-cache.json")
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

    if envelope.format != 1 {
        return Err(AppError::invalid_request(format!(
            "unsupported plugin package format: {}",
            envelope.format
        )));
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

fn module_path(entry: &str) -> Result<&str> {
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

fn is_valid_plugin_id(id: &str) -> bool {
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

pub fn unpack_package_modules(
    envelope: &PluginPackageEnvelope,
    target_dir: &Path,
) -> Result<PathBuf> {
    let plugin_dir = target_dir.join(&envelope.manifest.id);
    // Never write through an existing directory or symlink supplied by another
    // process. An unpack is an export into a new directory.
    fs::create_dir(&plugin_dir).map_err(|e| {
        AppError::internal(format!(
            "cannot create directory {}: {e}",
            plugin_dir.display()
        ))
    })?;

    // Write manifest
    let manifest_path = plugin_dir.join("plugin.json");
    let manifest_json = serde_json::to_string_pretty(&envelope.manifest)
        .map_err(|e| AppError::internal(format!("cannot serialize manifest: {e}")))?;
    fs::write(&manifest_path, format!("{manifest_json}\n")).map_err(|e| {
        AppError::internal(format!(
            "cannot write manifest {}: {e}",
            manifest_path.display()
        ))
    })?;

    // Write modules
    for (entry, code) in &envelope.modules {
        let clean_path = module_path(entry)?;
        let out_path = plugin_dir.join(clean_path);
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|e| AppError::internal(e.to_string()))?;
        }
        fs::write(&out_path, code).map_err(|e| {
            AppError::internal(format!("cannot write module {}: {e}", out_path.display()))
        })?;
    }

    Ok(plugin_dir)
}

pub fn install_package_bytes(
    bytes: &[u8],
    explicit_dir: Option<&Path>,
    unpack: bool,
    force: bool,
) -> Result<InstalledPluginInfo> {
    let envelope = decode_package(bytes)?;
    let hash = format!("{:x}", Sha256::digest(bytes));
    let store_dir = explicit_dir
        .map(PathBuf::from)
        .unwrap_or_else(device_plugins_dir);

    fs::create_dir_all(&store_dir).map_err(|e| {
        AppError::internal(format!(
            "cannot create plugins directory {}: {e}",
            store_dir.display()
        ))
    })?;

    let packages_dir = store_dir.join("packages");
    fs::create_dir_all(&packages_dir).map_err(|e| {
        AppError::internal(format!(
            "cannot create packages directory {}: {e}",
            packages_dir.display()
        ))
    })?;

    // Check existing installation
    let config_file = store_dir.join("config.json");
    let mut config = read_desktop_config(&config_file)?;
    if let Some(existing) = config.installed.get(&envelope.manifest.id)
        && existing.hash == hash
        && !force
        && !unpack
        && store_dir
            .join(format!("{}.eidos-plugin", envelope.manifest.id))
            .is_file()
    {
        let installed_path = store_dir.join(format!("{}.eidos-plugin", envelope.manifest.id));
        return Ok(InstalledPluginInfo {
            id: envelope.manifest.id,
            name: envelope.manifest.name,
            version: envelope.manifest.version,
            hash,
            path: installed_path,
            description: envelope.manifest.description,
        });
    }

    // Validate/export before changing the installed binding; never report a
    // successful unpack when writing the export failed.
    if unpack {
        unpack_package_modules(&envelope, &store_dir)?;
    }

    // 1. Write packages/<hash>.eidos-plugin
    let package_target = packages_dir.join(format!("{hash}.eidos-plugin"));
    atomic_write(&package_target, bytes)?;

    // 2. Write <id>.eidos-plugin for direct serve detection
    let plugin_direct_target = store_dir.join(format!("{}.eidos-plugin", envelope.manifest.id));
    atomic_write(&plugin_direct_target, bytes)?;

    // 3. Update config.json
    config.installed.insert(
        envelope.manifest.id.clone(),
        InstalledBinding { hash: hash.clone() },
    );
    let config_json = serde_json::to_string_pretty(&config)
        .map_err(|e| AppError::internal(format!("cannot serialize config: {e}")))?;
    atomic_write(&config_file, config_json.as_bytes())?;

    Ok(InstalledPluginInfo {
        id: envelope.manifest.id,
        name: envelope.manifest.name,
        version: envelope.manifest.version,
        hash,
        path: plugin_direct_target,
        description: envelope.manifest.description,
    })
}

fn atomic_write(target: &Path, bytes: &[u8]) -> Result<()> {
    let tmp_path = target.with_extension(format!("tmp.{}", rand::random::<u32>()));
    let mut file = File::create(&tmp_path).map_err(|e| {
        AppError::internal(format!(
            "cannot create temp file {}: {e}",
            tmp_path.display()
        ))
    })?;
    file.write_all(bytes).map_err(|e| {
        AppError::internal(format!(
            "cannot write temp file {}: {e}",
            tmp_path.display()
        ))
    })?;
    file.sync_all().map_err(|e| {
        AppError::internal(format!("cannot sync temp file {}: {e}", tmp_path.display()))
    })?;
    drop(file);
    fs::rename(&tmp_path, target).map_err(|e| {
        AppError::internal(format!(
            "cannot rename {} to {}: {e}",
            tmp_path.display(),
            target.display()
        ))
    })?;
    Ok(())
}

fn read_desktop_config(path: &Path) -> Result<DesktopConfig> {
    if !path.is_file() {
        return Ok(DesktopConfig::default());
    }
    let content = fs::read_to_string(path)
        .map_err(|e| AppError::internal(format!("cannot read config {}: {e}", path.display())))?;
    let config: DesktopConfig = serde_json::from_str(&content).map_err(|e| {
        AppError::internal(format!("invalid config.json in {}: {e}", path.display()))
    })?;
    if config.version != 1 {
        return Err(AppError::invalid_request(
            "unsupported plugin configuration version",
        ));
    }
    for (id, binding) in &config.installed {
        if !is_valid_plugin_id(id)
            || binding.hash.len() != 64
            || !binding
                .hash
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err(AppError::invalid_request(
                "invalid installed plugin binding",
            ));
        }
    }
    Ok(config)
}

pub fn list_installed_plugins(explicit_dir: Option<&Path>) -> Result<Vec<InstalledPluginInfo>> {
    let store_dir = explicit_dir
        .map(PathBuf::from)
        .unwrap_or_else(device_plugins_dir);
    if !store_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut map: HashMap<String, InstalledPluginInfo> = HashMap::new();
    let config_path = store_dir.join("config.json");
    let config = config_path
        .exists()
        .then(|| read_desktop_config(&config_path))
        .transpose()?;

    // 1. Scan store_dir/*.eidos-plugin
    if let Ok(entries) = fs::read_dir(&store_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file()
                && path
                    .extension()
                    .is_some_and(|e| e.eq_ignore_ascii_case("eidos-plugin"))
                && let Ok(bytes) = fs::read(&path)
                && let Ok(pkg) = decode_package(&bytes)
            {
                let hash = format!("{:x}", Sha256::digest(&bytes));
                if config.as_ref().is_some_and(|c| {
                    c.installed
                        .get(&pkg.manifest.id)
                        .is_none_or(|b| b.hash != hash)
                }) {
                    continue;
                }
                map.insert(
                    pkg.manifest.id.clone(),
                    InstalledPluginInfo {
                        id: pkg.manifest.id,
                        name: pkg.manifest.name,
                        version: pkg.manifest.version,
                        hash,
                        path,
                        description: pkg.manifest.description,
                    },
                );
            }
        }
    }

    // 2. Scan packages/*.eidos-plugin
    let packages_dir = store_dir.join("packages");
    if packages_dir.is_dir()
        && let Ok(entries) = fs::read_dir(&packages_dir)
    {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file()
                && path
                    .extension()
                    .is_some_and(|e| e.eq_ignore_ascii_case("eidos-plugin"))
                && let Ok(bytes) = fs::read(&path)
                && let Ok(pkg) = decode_package(&bytes)
                && !map.contains_key(&pkg.manifest.id)
            {
                let hash = format!("{:x}", Sha256::digest(&bytes));
                if !config.as_ref().is_some_and(|c| {
                    c.installed
                        .get(&pkg.manifest.id)
                        .is_some_and(|b| b.hash == hash)
                }) {
                    continue;
                }
                map.insert(
                    pkg.manifest.id.clone(),
                    InstalledPluginInfo {
                        id: pkg.manifest.id,
                        name: pkg.manifest.name,
                        version: pkg.manifest.version,
                        hash,
                        path,
                        description: pkg.manifest.description,
                    },
                );
            }
        }
    }

    let mut list: Vec<_> = map.into_values().collect();
    list.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(list)
}

pub fn uninstall_plugin(id: &str, explicit_dir: Option<&Path>) -> Result<bool> {
    if !is_valid_plugin_id(id) {
        return Err(AppError::invalid_request("invalid plugin id"));
    }
    let store_dir = explicit_dir
        .map(PathBuf::from)
        .unwrap_or_else(device_plugins_dir);
    if !store_dir.is_dir() {
        return Ok(false);
    }

    let mut removed = false;
    // Validate all configuration before deleting anything. Preserve unrelated
    // host fields and revoke Space enablement/defaults before a reinstall.
    let config_file = store_dir.join("config.json");
    let mut config = read_desktop_config(&config_file)?;
    let prefix = format!("{id}/");
    for space in config.spaces.values_mut() {
        if let Some(plugins) = space.get_mut("plugins").and_then(|v| v.as_object_mut()) {
            plugins.remove(id);
        }
        for field in ["associations", "formatters"] {
            if let Some(entries) = space.get_mut(field).and_then(|v| v.as_object_mut()) {
                entries.retain(|_, value| !value.as_str().is_some_and(|v| v.starts_with(&prefix)));
            }
        }
    }
    config
        .associations
        .retain(|_, value| !value.starts_with(&prefix));
    let binding = config.installed.remove(id);
    let grants_path = store_dir.join("resource-grants.json");
    if grants_path.exists() {
        let raw = fs::read(&grants_path).map_err(|e| AppError::internal(e.to_string()))?;
        let mut grants: serde_json::Value = serde_json::from_slice(&raw)
            .map_err(|e| AppError::invalid_request(format!("invalid resource grants: {e}")))?;
        if grants["version"] != 1 {
            return Err(AppError::invalid_request(
                "unsupported resource grant version",
            ));
        }
        let authorities = grants["authorities"]
            .as_array_mut()
            .ok_or_else(|| AppError::invalid_request("invalid resource grants"))?;
        authorities.retain(|record| record["pluginId"].as_str() != Some(id));
        let bytes = serde_json::to_vec(&grants).map_err(|e| AppError::internal(e.to_string()))?;
        atomic_write(&grants_path, &bytes)?;
    }
    let config_json = serde_json::to_vec_pretty(&config)
        .map_err(|e| AppError::internal(format!("cannot serialize config: {e}")))?;
    atomic_write(&config_file, &config_json)?;

    // 1. Remove direct package file <id>.eidos-plugin
    let direct_file = store_dir.join(format!("{id}.eidos-plugin"));
    if direct_file.is_file() {
        fs::remove_file(&direct_file).map_err(|e| AppError::internal(e.to_string()))?;
        removed = true;
    }

    // 2. Update config.json and remove package from packages/
    if let Some(binding) = binding {
        let hash_file = store_dir
            .join("packages")
            .join(format!("{}.eidos-plugin", binding.hash));
        if hash_file.is_file() {
            fs::remove_file(&hash_file).map_err(|e| AppError::internal(e.to_string()))?;
        }
        removed = true;
    }

    // 3. Remove unpacked directory if present
    let unpacked_dir = store_dir.join(id);
    if unpacked_dir.is_dir() {
        fs::remove_dir_all(&unpacked_dir).map_err(|e| AppError::internal(e.to_string()))?;
        removed = true;
    }

    Ok(removed)
}

pub fn plugin_info(target: &str, explicit_dir: Option<&Path>) -> Result<serde_json::Value> {
    let target_path = Path::new(target);
    // If target is an existing file
    if target_path.is_file() {
        let bytes = fs::read(target_path).map_err(|e| {
            AppError::invalid_request(format!("cannot read file {}: {e}", target_path.display()))
        })?;
        let pkg = decode_package(&bytes)?;
        let hash = format!("{:x}", Sha256::digest(&bytes));
        return Ok(json!({
            "source": "local_file",
            "path": target_path,
            "hash": hash,
            "manifest": pkg.manifest,
            "modules": pkg.modules.keys().collect::<Vec<_>>()
        }));
    }

    // If installed in device store
    let installed = list_installed_plugins(explicit_dir)?;
    if let Some(found) = installed.iter().find(|p| p.id == target)
        && let Ok(bytes) = fs::read(&found.path)
        && let Ok(pkg) = decode_package(&bytes)
    {
        return Ok(json!({
            "source": "installed",
            "path": found.path,
            "hash": found.hash,
            "manifest": pkg.manifest,
            "modules": pkg.modules.keys().collect::<Vec<_>>()
        }));
    }

    // Check registry
    let client = PluginRegistryClient::new()?;
    let entry = client.find(target)?;
    Ok(json!({
        "source": "marketplace",
        "plugin": entry
    }))
}
