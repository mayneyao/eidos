use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;

use anyhow::{Context, Result};
use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginViewDescriptor {
    pub id: String,
    pub title: String,
    pub context: String,
    pub entry: String,
    #[serde(default)]
    pub access: Option<String>,
    #[serde(default)]
    pub configuration: Option<serde_json::Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginPlacement {
    pub location: String,
    pub view: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginBrowserConfig {
    #[serde(default)]
    pub workers: Option<bool>,
    #[serde(rename = "networkOrigins", default)]
    pub network_origins: Option<Vec<String>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginManifest {
    #[serde(rename = "apiVersion")]
    pub api_version: u32,
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub icon: Option<serde_json::Value>,
    #[serde(default)]
    pub views: Option<Vec<PluginViewDescriptor>>,
    #[serde(default)]
    pub placements: Option<Vec<PluginPlacement>>,
    #[serde(default)]
    pub browser: Option<PluginBrowserConfig>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginPackage {
    pub format: u32,
    pub manifest: PluginManifest,
    pub modules: HashMap<String, String>,
}

#[derive(Default)]
pub struct CliPluginStore {
    plugins: HashMap<String, PluginPackage>,
}

const DEFAULT_SANDBOX_CSP: &str = "default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: http: https:; style-src 'unsafe-inline'; img-src data: blob: https:; font-src data: https:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';";

const BOOTSTRAP_JS: &str = r#"
function bootstrap(mount, binding) {
  const parent = window.parent;
  const controller = new AbortController();
  const subscriptions = new Set();
  const pending = new Map();
  const observers = new Map();
  const error = (code, message) => Object.assign(new Error(message), { code });
  let closed = false;

  const receive = (event) => {
    const r = event.data;
    if (event.source !== parent || !r || r.protocol !== "eidos-plugin" || r.apiVersion !== 1) return;
    if (typeof r.observation === "string") {
      if (r.observation === "host.theme" && r.value && typeof r.value === "object") {
        for (const name of [
          "background", "foreground", "muted", "border", "accent", "font-family", "color-scheme"
        ]) {
          const key = `--eidos-${name}`;
          const value = r.value[key];
          if (typeof value !== "string" || value.length > 256) continue;
          const property = name === "font-family" ? "font-family" : (name === "color-scheme" ? "color-scheme" : "color");
          if (CSS.supports(property, value) && !/url\s*\(|var\s*\(/i.test(value)) {
            window.document.documentElement.style.setProperty(key, value);
          }
        }
        return;
      }
      observers.get(r.observation)?.(r.value);
      return;
    }
    const request = pending.get(r.id);
    if (!request) return;
    pending.delete(r.id);
    clearTimeout(request.timer);
    if (r.error) request.reject(error(r.error.code, r.error.message));
    else request.resolve(r.result);
  };
  window.addEventListener("message", receive);

  function call(method, params = null) {
    if (closed) return Promise.reject(error("INSTANCE_CLOSED", "View closed"));
    if (pending.size >= 64) return Promise.reject(error("INVALID_REQUEST", "Too many pending requests"));
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(error("TIMEOUT", "Host request timed out"));
      }, 30000);
      pending.set(id, { resolve, reject, timer });
      parent.postMessage({ protocol: "eidos-plugin", apiVersion: 1, id, method, params }, "*");
    });
  }

  const own = (value) => {
    if (closed) value.dispose?.();
    else subscriptions.add(value);
    return value;
  };

  const unavailable = async () => {
    throw error("UNSUPPORTED_API", "This host has not enabled this capability");
  };

  const context = {
    binding: binding.kind === "table" ? {
      kind: "table",
      table: {
        tableId: binding.tableId,
        viewId: binding.viewId,
        read: () => call("table.read"),
        getPage: (options) => call("table.page", options),
        aggregate: (options) => call("table.aggregate", options),
        updateProperties: (properties) => call("table.properties", properties),
        openRecord: (rowId) => call("table.openRecord", { rowId }),
        observe(listener) {
          const id = "host.table";
          observers.set(id, listener);
          return own({
            dispose() { observers.delete(id); }
          });
        }
      }
    } : binding,
    signal: controller.signal,
    subscriptions: { add: own },
    resources: { text: unavailable, directory: unavailable, eidos: unavailable, output: unavailable },
    settings: { get: unavailable, update: unavailable, reset: unavailable, observe: unavailable },
    ui: {
      notify: (message) => call("ui.notify", { message }),
      select: unavailable,
      confirm: unavailable,
      navigate: (viewId, route) => call("ui.navigate", { viewId, ...(route === undefined ? {} : { route }) }),
      resolveAsset: unavailable,
      openLink: unavailable
    }
  };

  window.addEventListener("pagehide", () => {
    closed = true;
    controller.abort();
    for (const item of subscriptions) {
      try { item.dispose?.(); } catch {}
    }
    subscriptions.clear();
    observers.clear();
    window.removeEventListener("message", receive);
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error("INSTANCE_CLOSED", "View closed"));
    }
    pending.clear();
  }, { once: true });

  const mountFn = mount?.default || mount;
  if (typeof mountFn !== "function") {
    const node = window.document.createElement("p");
    node.setAttribute("role", "alert");
    node.textContent = "Plugin entry module does not export a mount function.";
    window.document.getElementById("app")?.replaceChildren(node);
    return;
  }

  void Promise.resolve()
    .then(() => mountFn(context, window.document.getElementById("app")))
    .then((cleanup) => {
      if (cleanup) own(cleanup);
      return call("view.ready");
    })
    .catch((cause) => {
      const node = window.document.createElement("p");
      node.setAttribute("role", "alert");
      node.textContent = cause instanceof Error ? cause.message : String(cause);
      window.document.getElementById("app")?.replaceChildren(node);
    });
}
"#;

impl CliPluginStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn load_file(&mut self, path: &Path) -> Result<()> {
        let file = File::open(path)
            .with_context(|| format!("cannot open plugin file {}", path.display()))?;
        let mut decoder = GzDecoder::new(file);
        let mut json_bytes = Vec::new();
        decoder
            .read_to_end(&mut json_bytes)
            .with_context(|| format!("cannot decompress plugin file {}", path.display()))?;
        let raw: serde_json::Value = serde_json::from_slice(&json_bytes)?;
        if raw["format"] != 1 && raw["format"] != 2 {
            anyhow::bail!("Unsupported plugin package format");
        }
        if (raw["format"] == 2) != raw["manifest"].get("requires").is_some() {
            anyhow::bail!("Packages declaring requires must use format 2; format 2 requires a minimum plugin API");
        }
        crate::plugin_compatibility::ensure(&raw["manifest"]).map_err(anyhow::Error::msg)?;
        let package: PluginPackage = serde_json::from_value(raw)
            .with_context(|| format!("invalid plugin package JSON in {}", path.display()))?;
        println!(
            "  plugin: {} v{} ({})",
            package.manifest.name, package.manifest.version, package.manifest.id
        );
        self.plugins.insert(package.manifest.id.clone(), package);
        Ok(())
    }

    pub fn load_from_dir(&mut self, dir: &Path) -> Result<usize> {
        if !dir.is_dir() {
            return Ok(0);
        }
        let mut count = 0;
        let entries = fs::read_dir(dir)
            .with_context(|| format!("cannot read plugins directory {}", dir.display()))?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let is_plugin = path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("eidos-plugin"));
                if is_plugin {
                    match self.load_file(&path) {
                        Ok(()) => count += 1,
                        Err(error) => {
                            eprintln!("failed to load plugin {}: {error}", path.display())
                        }
                    }
                }
            }
        }
        Ok(count)
    }

    pub fn list_plugins_json(&self) -> serde_json::Value {
        let mut list: Vec<serde_json::Value> = self
            .plugins
            .values()
            .map(|pkg| {
                json!({
                    "id": pkg.manifest.id,
                    "enabled": true,
                    "manifest": pkg.manifest
                })
            })
            .collect();
        list.sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
        json!({ "plugins": list })
    }

    pub fn get_view(
        &self,
        plugin_id: &str,
        view_id: &str,
    ) -> Option<(&PluginPackage, &PluginViewDescriptor)> {
        let pkg = self.plugins.get(plugin_id)?;
        let view = pkg
            .manifest
            .views
            .as_ref()?
            .iter()
            .find(|v| v.id == view_id)?;
        Some((pkg, view))
    }

    pub fn get_entry_module(&self, plugin_id: &str, view_id: &str) -> Option<&str> {
        let (pkg, view) = self.get_view(plugin_id, view_id)?;
        pkg.modules.get(&view.entry).map(|s| s.as_str())
    }

    pub fn csp_header(&self, plugin_id: &str) -> String {
        let pkg = match self.plugins.get(plugin_id) {
            Some(pkg) => pkg,
            None => return DEFAULT_SANDBOX_CSP.to_string(),
        };
        let mut csp = DEFAULT_SANDBOX_CSP.to_string();
        if let Some(browser) = &pkg.manifest.browser {
            if browser.workers == Some(true) {
                csp = csp.replace("worker-src 'none'", "worker-src blob:");
            }
            if let Some(origins) = &browser.network_origins {
                if !origins.is_empty() {
                    let joined = origins.join(" ");
                    csp = csp
                        .replace("connect-src 'none'", &format!("connect-src {joined}"))
                        .replace(
                            "img-src data: blob: https:",
                            &format!("img-src data: blob: https: {joined}"),
                        );
                }
            }
        }
        csp
    }

    pub fn render_sandbox_html(
        &self,
        plugin_id: &str,
        view_id: &str,
        table_id: &str,
        table_view_id: &str,
    ) -> Option<String> {
        let (pkg, _view) = self.get_view(plugin_id, view_id)?;
        let binding_json = json!({
            "kind": "table",
            "tableId": table_id,
            "viewId": table_view_id
        });
        let entry_url = format!("/api/plugins/{plugin_id}/entry/{view_id}");

        let html = format!(
            r#"<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{}</title>
  <style>html,body,#app{{width:100%;height:100%;margin:0;padding:0;overflow:hidden;}}</style>
</head>
<body>
  <div id="app"></div>
  <script type="module">
const binding = {};
{}
import mount from "{}";
bootstrap(mount, binding);
  </script>
</body>
</html>"#,
            pkg.manifest.name, binding_json, BOOTSTRAP_JS, entry_url
        );
        Some(html)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_load_plugin_and_render() {
        let manifest = PluginManifest {
            api_version: 1,
            id: "test.plugin".to_string(),
            name: "Test Plugin".to_string(),
            version: "1.0.0".to_string(),
            icon: None,
            views: Some(vec![PluginViewDescriptor {
                id: "test-view".to_string(),
                title: "Test View".to_string(),
                context: "table".to_string(),
                entry: "./src/view.js".to_string(),
                access: Some("read".to_string()),
                configuration: None,
            }]),
            placements: Some(vec![PluginPlacement {
                location: "table/view".to_string(),
                view: "test-view".to_string(),
            }]),
            browser: Some(PluginBrowserConfig {
                workers: Some(true),
                network_origins: Some(vec!["https://api.example.com".to_string()]),
            }),
        };

        let mut modules = HashMap::new();
        modules.insert(
            "./src/view.js".to_string(),
            "export default function mount() {}".to_string(),
        );

        let package = PluginPackage {
            format: 1,
            manifest,
            modules,
        };

        let json = serde_json::to_vec(&package).unwrap();
        let file = NamedTempFile::new().unwrap();
        let mut encoder = GzEncoder::new(file.as_file(), Compression::default());
        encoder.write_all(&json).unwrap();
        encoder.finish().unwrap();

        let mut store = CliPluginStore::new();
        store.load_file(file.path()).unwrap();

        let listing = store.list_plugins_json();
        let plugins = listing["plugins"].as_array().unwrap();
        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0]["id"], "test.plugin");

        let entry = store.get_entry_module("test.plugin", "test-view").unwrap();
        assert_eq!(entry, "export default function mount() {}");

        let csp = store.csp_header("test.plugin");
        assert!(csp.contains("worker-src blob:"));
        assert!(csp.contains("connect-src https://api.example.com"));

        let html = store
            .render_sandbox_html("test.plugin", "test-view", "tbl_1", "vw_1")
            .unwrap();
        assert!(html.contains("Test Plugin"));
        assert!(html.contains("/api/plugins/test.plugin/entry/test-view"));
        assert!(html.contains("\"tableId\":\"tbl_1\""));
    }

    #[test]
    fn rejects_incompatible_direct_load_before_registering() {
        let file = NamedTempFile::new().unwrap();
        let raw = serde_json::json!({
            "format": 2,
            "manifest": { "apiVersion": 1, "id": "test.future", "name": "Future",
                "version": "1.0.0", "requires": {"pluginApi":"1.1.0"},
                "views": [{"id":"main","title":"Main","context":"table","entry":"./main.js"}] },
            "modules": {"./main.js":"export default function mount() {}"}
        });
        let mut encoder = GzEncoder::new(file.as_file(), Compression::default());
        encoder
            .write_all(&serde_json::to_vec(&raw).unwrap())
            .unwrap();
        encoder.finish().unwrap();
        let mut store = CliPluginStore::new();
        assert!(store
            .load_file(file.path())
            .unwrap_err()
            .to_string()
            .contains("requires plugin API 1.1.0"));
        assert_eq!(
            store.list_plugins_json()["plugins"]
                .as_array()
                .unwrap()
                .len(),
            0
        );
    }

    #[test]
    fn test_multiple_plugins_and_dir_loading() {
        let temp_dir = tempfile::tempdir().unwrap();

        for id in ["plugin.beta", "plugin.alpha"] {
            let manifest = PluginManifest {
                api_version: 1,
                id: id.to_string(),
                name: format!("Name for {id}"),
                version: "1.0.0".to_string(),
                icon: None,
                views: Some(vec![PluginViewDescriptor {
                    id: "view-1".to_string(),
                    title: format!("View for {id}"),
                    context: "table".to_string(),
                    entry: "./view.js".to_string(),
                    access: None,
                    configuration: None,
                }]),
                placements: Some(vec![PluginPlacement {
                    location: "table/view".to_string(),
                    view: "view-1".to_string(),
                }]),
                browser: None,
            };

            let mut modules = HashMap::new();
            modules.insert("./view.js".to_string(), format!("// {id} code"));
            let package = PluginPackage {
                format: 1,
                manifest,
                modules,
            };

            let json = serde_json::to_vec(&package).unwrap();
            let file_path = temp_dir.path().join(format!("{id}.eidos-plugin"));
            let file = File::create(&file_path).unwrap();
            let mut encoder = GzEncoder::new(file, Compression::default());
            encoder.write_all(&json).unwrap();
            encoder.finish().unwrap();
        }

        let mut store = CliPluginStore::new();
        let loaded_count = store.load_from_dir(temp_dir.path()).unwrap();
        assert_eq!(loaded_count, 2);

        let listing = store.list_plugins_json();
        let plugins = listing["plugins"].as_array().unwrap();
        assert_eq!(plugins.len(), 2);
        // Deterministically sorted by ID
        assert_eq!(plugins[0]["id"], "plugin.alpha");
        assert_eq!(plugins[1]["id"], "plugin.beta");

        let entry_alpha = store.get_entry_module("plugin.alpha", "view-1").unwrap();
        assert_eq!(entry_alpha, "// plugin.alpha code");

        let entry_beta = store.get_entry_module("plugin.beta", "view-1").unwrap();
        assert_eq!(entry_beta, "// plugin.beta code");
    }
}
