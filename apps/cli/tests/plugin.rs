use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::process::{Command, Output};

use flate2::Compression;
use flate2::write::GzEncoder;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tempfile::TempDir;

fn run(args: &[&str], envs: &[(&str, &str)]) -> Output {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_eidos"));
    cmd.args(args);
    for (k, v) in envs {
        cmd.env(k, v);
    }
    cmd.output().expect("run eidos CLI")
}

fn success_json(args: &[&str], envs: &[(&str, &str)]) -> Value {
    let mut all_args = vec!["--json"];
    all_args.extend_from_slice(args);
    let output = run(&all_args, envs);
    assert!(
        output.status.success(),
        "command failed: stdout: {}, stderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).expect("stdout is JSON")
}

fn create_test_plugin_package(id: &str, name: &str, version: &str) -> (Vec<u8>, String) {
    let manifest = json!({
        "apiVersion": 1,
        "id": id,
        "name": name,
        "version": version,
        "description": format!("Test plugin {name}"),
        "views": [
            {
                "id": "main-view",
                "title": format!("{name} View"),
                "context": "table",
                "entry": "./src/main.js"
            }
        ]
    });

    let mut modules = HashMap::new();
    modules.insert(
        "./src/main.js".to_string(),
        format!("export default function mount() {{ console.log('{id}'); }}"),
    );

    let envelope = json!({
        "format": 1,
        "manifest": manifest,
        "modules": modules,
    });

    let json_bytes = serde_json::to_vec(&envelope).unwrap();
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&json_bytes).unwrap();
    let package_bytes = encoder.finish().unwrap();
    let sha256 = format!("{:x}", Sha256::digest(&package_bytes));
    (package_bytes, sha256)
}

#[test]
fn incompatible_update_preserves_installed_bytes_and_configuration() {
    let temp = TempDir::new().unwrap();
    let store = temp.path().join("store");
    let file = temp.path().join("test.eidos-plugin");
    let (bytes, _) = create_test_plugin_package("local.compat", "Compat", "1.0.0");
    fs::write(&file, &bytes).unwrap();
    success_json(
        &[
            "plugin",
            "install",
            file.to_str().unwrap(),
            "--dir",
            store.to_str().unwrap(),
        ],
        &[],
    );
    let config = fs::read(store.join("config.json")).unwrap();
    let mut raw = String::new();
    flate2::read::GzDecoder::new(bytes.as_slice())
        .read_to_string(&mut raw)
        .unwrap();
    let mut package: Value = serde_json::from_str(&raw).unwrap();
    package["format"] = json!(2);
    package["manifest"]["requires"] = json!({"pluginApi":"1.1.0"});
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(&serde_json::to_vec(&package).unwrap())
        .unwrap();
    fs::write(&file, encoder.finish().unwrap()).unwrap();
    let output = run(
        &[
            "plugin",
            "install",
            file.to_str().unwrap(),
            "--dir",
            store.to_str().unwrap(),
            "--force",
        ],
        &[],
    );
    assert!(!output.status.success());
    assert_eq!(fs::read(store.join("config.json")).unwrap(), config);
    assert_eq!(
        fs::read(store.join("local.compat.eidos-plugin")).unwrap(),
        bytes
    );
    let report = success_json(&["plugin", "doctor", file.to_str().unwrap()], &[]);
    assert_eq!(report["compatibility"]["reason"], "API_VERSION");
}

#[test]
fn install_local_plugin_and_list_info_uninstall() {
    let temp = TempDir::new().unwrap();
    let eidos_home = temp.path().join("home");
    fs::create_dir_all(&eidos_home).unwrap();
    let eidos_home_str = eidos_home.to_str().unwrap();

    let (package_bytes, _hash) = create_test_plugin_package("local.csv", "CSV Test", "1.0.0");
    let package_file = temp.path().join("local.csv-1.0.0.eidos-plugin");
    fs::write(&package_file, &package_bytes).unwrap();
    let package_file_str = package_file.to_str().unwrap();

    // 1. Install local package
    let install_res = success_json(
        &["plugin", "install", package_file_str, "--unpack"],
        &[("EIDOS_HOME", eidos_home_str)],
    );
    assert_eq!(install_res["installed"], true);
    assert_eq!(install_res["id"], "local.csv");
    assert_eq!(install_res["version"], "1.0.0");

    // Check files created in ~/.eidos/plugins
    let plugins_dir = eidos_home.join("plugins");
    assert!(plugins_dir.join("local.csv.eidos-plugin").is_file());
    assert!(plugins_dir.join("config.json").is_file());
    let config: Value =
        serde_json::from_slice(&fs::read(plugins_dir.join("config.json")).unwrap()).unwrap();
    assert_eq!(config["version"], 1);
    // Unpacked directory
    assert!(plugins_dir.join("local.csv").join("plugin.json").is_file());
    assert!(
        plugins_dir
            .join("local.csv")
            .join("src")
            .join("main.js")
            .is_file()
    );

    // 2. List plugins
    let list_res = success_json(&["plugin", "list"], &[("EIDOS_HOME", eidos_home_str)]);
    let plugins = list_res["plugins"].as_array().unwrap();
    assert_eq!(plugins.len(), 1);
    assert_eq!(plugins[0]["id"], "local.csv");
    assert_eq!(plugins[0]["name"], "CSV Test");
    assert_eq!(plugins[0]["version"], "1.0.0");

    // 3. Info plugin
    let info_res = success_json(
        &["plugin", "info", "local.csv"],
        &[("EIDOS_HOME", eidos_home_str)],
    );
    assert_eq!(info_res["info"]["source"], "installed");
    assert_eq!(info_res["info"]["manifest"]["id"], "local.csv");

    // Info from direct package file
    let info_file_res = success_json(
        &["plugin", "info", package_file_str],
        &[("EIDOS_HOME", eidos_home_str)],
    );
    assert_eq!(info_file_res["info"]["source"], "local_file");
    assert_eq!(info_file_res["info"]["manifest"]["id"], "local.csv");

    // 4. Uninstall plugin
    let uninstall_res = success_json(
        &["plugin", "uninstall", "local.csv"],
        &[("EIDOS_HOME", eidos_home_str)],
    );
    assert_eq!(uninstall_res["uninstalled"], true);
    assert!(!plugins_dir.join("local.csv.eidos-plugin").is_file());
    assert!(!plugins_dir.join("local.csv").exists());

    // After uninstall, list should be empty
    let list_after = success_json(&["plugin", "list"], &[("EIDOS_HOME", eidos_home_str)]);
    assert_eq!(list_after["plugins"].as_array().unwrap().len(), 0);
}

#[test]
fn uninstall_rejects_paths_without_touching_external_files() {
    let temp = TempDir::new().unwrap();
    let home = temp.path().join("home");
    fs::create_dir_all(home.join("plugins")).unwrap();
    let victim = home.join("victim");
    fs::create_dir(&victim).unwrap();
    fs::write(victim.join("keep.txt"), "keep").unwrap();
    for id in [
        "../victim",
        "..\\victim",
        victim.to_str().unwrap(),
        ".",
        "..",
    ] {
        let output = run(
            &["--json", "plugin", "uninstall", id],
            &[("EIDOS_HOME", home.to_str().unwrap())],
        );
        assert!(!output.status.success(), "accepted {id}");
        assert_eq!(fs::read_to_string(victim.join("keep.txt")).unwrap(), "keep");
    }
}

#[test]
fn update_and_reinstall_preserve_host_state_without_restoring_authority() {
    let temp = TempDir::new().unwrap();
    let home = temp.path().join("home");
    let package = temp.path().join("test.eidos-plugin");
    let envs = [("EIDOS_HOME", home.to_str().unwrap())];
    let config_path = home.join("plugins/config.json");
    fs::write(
        &package,
        create_test_plugin_package("local.csv", "CSV", "1.0.0").0,
    )
    .unwrap();
    success_json(&["plugin", "install", package.to_str().unwrap()], &envs);
    let mut config: Value = serde_json::from_slice(&fs::read(&config_path).unwrap()).unwrap();
    config["routes"] = json!({"space": {"local.csv/page": "/saved"}});
    config["spaces"] = json!({"space": {
        "plugins": {"local.csv": {"enabled": true}, "local.other": {"enabled": true}},
        "associations": {".csv": "local.csv/main", ".txt": "local.other/main"},
        "formatters": {".csv": "local.csv/format", ".txt": "local.other/format"}
    }});
    config["associations"] = json!({".csv": "local.csv/main", ".txt": "local.other/main"});
    fs::write(&config_path, serde_json::to_vec(&config).unwrap()).unwrap();
    let grants_path = home.join("plugins/resource-grants.json");
    fs::write(
        &grants_path,
        serde_json::to_vec(&json!({"version":1,"authorities":[
            {"spaceId":"space","pluginId":"local.csv","resources":[]},
            {"spaceId":"space","pluginId":"local.other","resources":[]}
        ]}))
        .unwrap(),
    )
    .unwrap();
    fs::write(
        &package,
        create_test_plugin_package("local.csv", "CSV", "2.0.0").0,
    )
    .unwrap();
    success_json(&["plugin", "install", package.to_str().unwrap()], &envs);
    let updated: Value = serde_json::from_slice(&fs::read(&config_path).unwrap()).unwrap();
    assert_eq!(updated["routes"], config["routes"]);
    assert_eq!(updated["spaces"], config["spaces"]);
    success_json(&["plugin", "uninstall", "local.csv"], &envs);
    assert_eq!(
        success_json(&["plugin", "list"], &envs)["plugins"],
        json!([])
    );
    success_json(&["plugin", "install", package.to_str().unwrap()], &envs);
    let reinstalled: Value = serde_json::from_slice(&fs::read(&config_path).unwrap()).unwrap();
    assert!(reinstalled["spaces"]["space"]["plugins"]["local.csv"].is_null());
    assert_eq!(
        reinstalled["spaces"]["space"]["plugins"]["local.other"]["enabled"],
        true
    );
    for field in ["associations", "formatters"] {
        assert!(reinstalled["spaces"]["space"][field][".csv"].is_null());
        assert!(reinstalled["spaces"]["space"][field][".txt"].is_string());
    }
    assert_eq!(reinstalled["routes"], config["routes"]);
    assert_eq!(
        reinstalled["associations"],
        json!({".txt":"local.other/main"})
    );
    let grants: Value = serde_json::from_slice(&fs::read(grants_path).unwrap()).unwrap();
    assert_eq!(grants["authorities"].as_array().unwrap().len(), 1);
    assert_eq!(grants["authorities"][0]["pluginId"], "local.other");
}

#[test]
fn oversized_expansion_and_unsafe_modules_are_rejected_before_installation() {
    let temp = TempDir::new().unwrap();
    let home = temp.path().join("home");
    let package = temp.path().join("test.eidos-plugin");
    let envs = [("EIDOS_HOME", home.to_str().unwrap())];
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&vec![b' '; 17 * 1024 * 1024]).unwrap();
    fs::write(&package, encoder.finish().unwrap()).unwrap();
    let output = run(
        &["--json", "plugin", "install", package.to_str().unwrap()],
        &envs,
    );
    assert!(!output.status.success());
    assert!(
        String::from_utf8_lossy(&output.stderr).contains("byte limit"),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    for entry in [
        "../outside",
        "/absolute",
        "C:\\outside",
        ".\\..\\outside",
        "plugin.json",
    ] {
        let raw = json!({"format":1,"manifest":{"id":"local.bad","name":"Bad","version":"1.0.0"},"modules":{entry:"code"}});
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder
            .write_all(&serde_json::to_vec(&raw).unwrap())
            .unwrap();
        fs::write(&package, encoder.finish().unwrap()).unwrap();
        let output = run(
            &[
                "--json",
                "plugin",
                "install",
                package.to_str().unwrap(),
                "--unpack",
            ],
            &envs,
        );
        assert!(!output.status.success(), "accepted {entry}");
    }
    assert!(!home.join("plugins/config.json").exists());
}

#[test]
fn registry_integration_and_download_flow() {
    let temp = TempDir::new().unwrap();
    let eidos_home = temp.path().join("home");
    fs::create_dir_all(&eidos_home).unwrap();
    let eidos_home_str = eidos_home.to_str().unwrap();

    let (_package_bytes, sha256) = create_test_plugin_package("eidos.chart", "Chart", "0.1.0");

    // Mock registry server
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();

    let registry_json = json!({
        "schemaVersion": 1,
        "plugins": [
            {
                "id": "eidos.chart",
                "name": "Chart",
                "description": "Chart visualization plugin",
                "repo": "eidos-space/eidos-chart-plugin",
                "version": "0.1.0",
                "tag": "v0.1.0",
                "asset": "eidos.chart-0.1.0.eidos-plugin",
                "sha256": sha256,
                "preview": true,
                "compatibility": "Test build"
            }
        ]
    });
    let registry_payload = serde_json::to_vec(&registry_json).unwrap();

    let server_payload = registry_payload.clone();
    let server_thread = std::thread::spawn(move || {
        // Handle requests (registry request + optional download request)
        for _ in 0..3 {
            let (mut socket, _) = match listener.accept() {
                Ok(conn) => conn,
                Err(_) => break,
            };
            let mut request = [0u8; 1024];
            let read = socket.read(&mut request).unwrap_or(0);
            let req_str = String::from_utf8_lossy(&request[..read]);

            if req_str.starts_with("GET /plugins.registry.json") {
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    server_payload.len()
                );
                let _ = socket.write_all(header.as_bytes());
                let _ = socket.write_all(&server_payload);
            } else {
                let header =
                    "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                let _ = socket.write_all(header.as_bytes());
            }
        }
    });

    let mock_registry_url = format!("http://127.0.0.1:{port}/plugins.registry.json");

    // 1. Search against mock registry
    let search_res = success_json(
        &["plugin", "search", "chart"],
        &[
            ("EIDOS_HOME", eidos_home_str),
            ("EIDOS_PLUGIN_REGISTRY_URL", &mock_registry_url),
        ],
    );
    assert_eq!(search_res["count"], 1);
    assert_eq!(search_res["plugins"][0]["id"], "eidos.chart");

    // 2. List marketplace
    let list_res = success_json(
        &["plugin", "list", "--marketplace"],
        &[
            ("EIDOS_HOME", eidos_home_str),
            ("EIDOS_PLUGIN_REGISTRY_URL", &mock_registry_url),
        ],
    );
    assert_eq!(list_res["plugins"].as_array().unwrap().len(), 1);
    assert_eq!(list_res["plugins"][0]["installed"], false);

    drop(server_thread);
}
