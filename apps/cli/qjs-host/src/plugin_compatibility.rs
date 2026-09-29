use serde_json::{json, Value};
use std::collections::BTreeSet;

const DATA: &str = include_str!("../../../../packages/plugin-runtime/src/compatibility-data.json");

pub fn host_info() -> Value {
    let data: Value = serde_json::from_str(DATA).expect("embedded plugin compatibility data");
    json!({"host":"eidos-cli","pluginApiVersion":data["hosts"]["eidos-cli"]["pluginApi"],"features":data["hosts"]["eidos-cli"]["features"]})
}

fn version(value: &str) -> Option<[u64; 3]> {
    let parts: Vec<_> = value.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let mut result = [0; 3];
    for (i, part) in parts.iter().enumerate() {
        if part.is_empty()
            || (part.len() > 1 && part.starts_with('0'))
            || !part.bytes().all(|c| c.is_ascii_digit())
        {
            return None;
        }
        result[i] = part.parse().ok()?;
        if result[i] > 9_007_199_254_740_991 {
            return None;
        }
    }
    Some(result)
}

pub fn check(manifest: &Value) -> Value {
    let data: Value = serde_json::from_str(DATA).expect("embedded plugin compatibility data");
    let host = host_info();
    let supported = host["pluginApiVersion"].as_str().unwrap();
    let mut features = BTreeSet::new();
    for view in manifest["views"].as_array().into_iter().flatten() {
        features.insert(format!(
            "view.{}",
            view["kind"].as_str().unwrap_or("unknown")
        ));
        for capability in view["capabilities"].as_array().into_iter().flatten() {
            features.insert(format!("data.{}", capability.as_str().unwrap_or("unknown")));
        }
        if view["kind"] == "file" && view["capabilities"].as_array().is_none_or(Vec::is_empty) {
            features.insert("data.file".to_string());
        }
    }
    for rule in data["rules"].as_array().unwrap() {
        let value = &manifest[rule["key"].as_str().unwrap()];
        let present = match value {
            Value::Null => false,
            Value::Array(v) => !v.is_empty(),
            Value::Object(v) => !v.is_empty(),
            Value::String(v) => !v.is_empty(),
            Value::Bool(v) => *v,
            _ => true,
        };
        if present {
            features.insert(rule["feature"].as_str().unwrap().to_string());
        }
    }
    if manifest["browser"]["workers"] == true {
        features.insert("browser.workers".into());
    }
    if manifest.get("theme").is_some_and(|value| !value.is_null()) {
        features.insert("theme.lite".into());
    }
    if manifest["browser"]["networkOrigins"]
        .as_array()
        .is_some_and(|v| !v.is_empty())
    {
        features.insert("browser.network".into());
    }
    let supported_features = host["features"].as_array().unwrap();
    let missing: Vec<_> = features
        .into_iter()
        .filter(|f| !supported_features.contains(&json!(f)))
        .collect();
    let requirement = manifest.get("requires");
    let required = requirement
        .and_then(|r| r.get("pluginApi"))
        .and_then(Value::as_str);
    let result = |reason: &str, message: String| json!({"compatible":matches!(reason,"COMPATIBLE"|"UNDECLARED"),"reason":reason,"requiredApi":required,"supportedApi":supported,"missingFeatures":missing,"message":message});
    if manifest["apiVersion"] != 1 {
        return result(
            "UNSUPPORTED_PROTOCOL",
            "Unsupported plugin protocol; update your host.".into(),
        );
    }
    if let Some(r) = requirement {
        if !r
            .as_object()
            .is_some_and(|o| o.len() == 1 && o.contains_key("pluginApi"))
            || required.and_then(version).is_none()
        {
            return result(
                "INVALID_REQUIREMENT",
                "Invalid minimum plugin API version.".into(),
            );
        }
    }
    if let Some(required) = required {
        let needed = version(required).unwrap();
        let available = version(supported).unwrap();
        if needed[0] != available[0] || needed > available {
            return result("API_VERSION",format!("This plugin requires plugin API {required}; eidos-cli supports {supported}. Update the host to a compatible release."));
        }
    }
    for view in manifest["views"].as_array().into_iter().flatten() {
        let capabilities = view["capabilities"].as_array();
        if view.get("context").is_some()
            || !matches!(view["kind"].as_str(), Some("page" | "file"))
            || (view.get("capabilities").is_some() && capabilities.is_none())
            || capabilities.is_some_and(|values| {
                values
                    .iter()
                    .map(Value::as_str)
                    .collect::<BTreeSet<_>>()
                    .len()
                    != values.len()
                    || (values.iter().any(|v| v == "document")
                        && values
                            .iter()
                            .any(|v| v.as_str().is_some_and(|v| v.starts_with("eidos/"))))
                    || (view["kind"] == "page" && !values.is_empty())
                    || values.iter().any(|value| {
                        !matches!(
                            value.as_str(),
                            Some("document" | "eidos/schema" | "eidos/table" | "eidos/config")
                        )
                    })
            })
        {
            return result(
                "INVALID_MANIFEST",
                "Views require kind page/file and unique supported capabilities; document and Eidos capabilities cannot be combined.".into(),
            );
        }
    }
    if !missing.is_empty() {
        return result(
            "HOST_FEATURES",
            format!(
                "eidos-cli does not support this plugin's features: {}.",
                missing.join(", ")
            ),
        );
    }
    if required.is_none() {
        result(
            "UNDECLARED",
            "Legacy plugin: minimum API is undeclared; only manifest features were checked.".into(),
        )
    } else {
        result("COMPATIBLE", "Compatible".into())
    }
}

pub fn ensure(manifest: &Value) -> Result<(), String> {
    let result = check(manifest);
    if result["compatible"] == true {
        Ok(())
    } else {
        Err(result["message"].as_str().unwrap().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn checks_version_and_inferred_features() {
        let mut manifest =
            json!({"apiVersion":1,"views":[{"kind":"file","capabilities":["eidos/table"]}]});
        assert_eq!(check(&manifest)["reason"], "UNDECLARED");
        manifest["requires"] = json!({"pluginApi":"3.0.0"});
        assert_eq!(check(&manifest)["compatible"], true);
        manifest["requires"] = json!({"pluginApi":"1.1.0"});
        assert_eq!(check(&manifest)["reason"], "API_VERSION");
        manifest["requires"] = json!({"pluginApi":"01.0.0"});
        assert_eq!(check(&manifest)["reason"], "INVALID_REQUIREMENT");
        manifest.as_object_mut().unwrap().remove("requires");
        manifest["extension"] = json!("./extension.js");
        assert_eq!(check(&manifest)["reason"], "HOST_FEATURES");
        assert!(ensure(&manifest).is_err());
        let theme = json!({"apiVersion":1,"kind":"theme","requires":{"pluginApi":"1.6.0"},"theme":{"stylesheet":"./theme.css"}});
        let result = check(&theme);
        assert_eq!(result["reason"], "API_VERSION");
        assert_eq!(result["missingFeatures"], json!(["theme.lite"]));
    }
    #[test]
    fn rejects_generic_file_views_on_table_only_host() {
        let manifest =
            json!({"apiVersion":1,"requires":{"pluginApi":"3.0.0"},"views":[{"kind":"file"}]});
        assert_eq!(check(&manifest)["missingFeatures"], json!(["data.file"]));
        assert!(ensure(&manifest).is_err());
    }
    #[test]
    fn rejects_ambiguous_view_declarations() {
        for view in [
            json!({"kind":"file","context":"table","capabilities":["eidos/table"]}),
            json!({"kind":"file","capabilities":["eidos/table","eidos/table"]}),
            json!({"kind":"page","capabilities":["eidos/table"]}),
            json!({"kind":"file","capabilities":"table"}),
            json!({"kind":"file","capabilities":["document", "eidos/schema"]}),
            json!({"kind":"file","capabilities":["table"]}),
            json!({"kind":"file","capabilities":["eidos"]}),
        ] {
            let manifest = json!({"apiVersion":1,"requires":{"pluginApi":"3.0.0"},"views":[view]});
            assert_eq!(check(&manifest)["reason"], "INVALID_MANIFEST");
        }
    }

    #[test]
    fn composed_capabilities_report_only_missing_host_features() {
        for capabilities in [
            json!(["eidos/schema", "eidos/table", "eidos/config"]),
            json!(["eidos/config", "eidos/table", "eidos/schema"]),
        ] {
            let manifest = json!({"apiVersion":1,"requires":{"pluginApi":"3.0.0"},"views":[{"kind":"file","capabilities":capabilities}]});
            assert_eq!(check(&manifest)["reason"], "HOST_FEATURES");
            assert_eq!(
                check(&manifest)["missingFeatures"],
                json!(["data.eidos/config", "data.eidos/schema"])
            );
        }
    }
}
