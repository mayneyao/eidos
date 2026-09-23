use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};

use serde_json::json;

use crate::app::CommandOutput;
use crate::cli::{
    PluginArgs, PluginCommand, PluginInfoArgs, PluginInstallArgs, PluginListArgs, PluginSearchArgs,
    PluginUninstallArgs,
};
use crate::error::{AppError, Result};
use crate::plugin_registry::{
    PluginRegistryClient, install_package_bytes, list_installed_plugins, plugin_info,
    uninstall_plugin,
};

const CATALOG: &str = include_str!("../../../packages/plugin-tools/templates/catalog.json");
const PROJECT: &str = include_str!("../../../packages/plugin-tools/templates/project.json");
const TEMPLATES: &[(&str, &str)] = &[
    (
        "main.ts.txt",
        include_str!("../../../packages/plugin-tools/templates/main.ts.txt"),
    ),
    (
        "csv.ts.txt",
        include_str!("../../../packages/plugin-tools/templates/csv.ts.txt"),
    ),
    (
        "style.css.txt",
        include_str!("../../../packages/plugin-tools/templates/style.css.txt"),
    ),
    (
        "base.css.txt",
        include_str!("../../../packages/plugin-tools/templates/base.css.txt"),
    ),
    (
        "eidos-view.ts.txt",
        include_str!("../../../packages/plugin-tools/templates/eidos-view.ts.txt"),
    ),
    (
        "table-view.ts.txt",
        include_str!("../../../packages/plugin-tools/templates/table-view.ts.txt"),
    ),
    (
        "table-action.ts.txt",
        include_str!("../../../packages/plugin-tools/templates/table-action.ts.txt"),
    ),
    (
        "page.ts.txt",
        include_str!("../../../packages/plugin-tools/templates/page.ts.txt"),
    ),
    (
        "page-extension.ts.txt",
        include_str!("../../../packages/plugin-tools/templates/page-extension.ts.txt"),
    ),
    (
        "action.test.mjs.txt",
        include_str!("../../../packages/plugin-tools/templates/action.test.mjs.txt"),
    ),
    (
        "README.md",
        include_str!("../../../packages/plugin-tools/templates/README.md"),
    ),
];

// Resolve the project's installed backend, never a global installation or an
// automatically downloaded package. Arguments are passed without a shell.
const BRIDGE: &str = r#"
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error('Plugin development requires Node.js >=22.12.');
  process.exit(1);
}
const require = createRequire(path.join(process.cwd(), 'package.json'));
const [command, source, output, json, target] = process.argv.slice(1);
let entry;
try {
  if (process.env.EIDOS_PLUGIN_TOOLS) entry = path.resolve(process.env.EIDOS_PLUGIN_TOOLS);
  else {
  const pkg = require('@eidos.space/plugin-tools/package.json');
  if (typeof pkg.version !== 'string' || !/^0\.(1|2)\.\d+$/.test(pkg.version)) throw new Error('Expected plugin-tools 0.1.x or 0.2.x');
  if (target && (/^0\.1\./.test(pkg.version) || pkg.version === '0.2.0')) throw new Error('--target requires plugin-tools newer than 0.2.0. Upgrade the project dependency; older tools ignore this option.');
  entry = require.resolve('@eidos.space/plugin-tools/bin/eidos-plugin.mjs');
  }
} catch (error) {
  console.error('Install @eidos.space/plugin-tools 0.2.x in this project (pnpm install). ' + error.message);
  process.exit(1);
}
process.argv = [process.execPath, entry, command, source, ...(output ? ['--out', output] : []), ...(json === 'true' ? ['--json'] : []), ...(target ? ['--target', target] : [])];
await import(pathToFileURL(entry).href);
"#;

pub fn run(args: PluginArgs, human: bool) -> Result<CommandOutput> {
    match args.command {
        PluginCommand::Doctor { package } => {
            let compatibility = if let Some(path) = package {
                let bytes = fs::read(path).map_err(|e| AppError::invalid_request(e.to_string()))?;
                let package = crate::plugin_registry::decode_package(&bytes)?;
                Some(qjs_host::plugin_compatibility::check(
                    &serde_json::to_value(package.manifest)
                        .map_err(|e| AppError::internal(e.to_string()))?,
                ))
            } else {
                None
            };
            Ok(CommandOutput::success(json!({
                "command": "plugin doctor", "host": qjs_host::plugin_compatibility::host_info(),
                "hostVersion": env!("CARGO_PKG_VERSION"), "compatibility": compatibility
            })))
        }
        PluginCommand::Fs { .. } => Err(AppError::invalid_request(
            "Filesystem transport requires the host protocol",
        )),
        PluginCommand::Create {
            directory,
            template,
        } => create(&directory, &template),
        PluginCommand::Check(args) => {
            run_node_bridge("check", args.directory, args.output, args.target, human)
        }
        PluginCommand::Dev(args) => {
            run_node_bridge("dev", args.directory, args.output, args.target, human)
        }
        PluginCommand::Pack(args) => {
            run_node_bridge("pack", args.directory, args.output, args.target, human)
        }
        PluginCommand::Install(args) => install(args, human),
        PluginCommand::List(args) => list(args),
        PluginCommand::Search(args) => search(args),
        PluginCommand::Info(args) => info(args),
        PluginCommand::Uninstall(args) => uninstall(args),
    }
}

fn run_node_bridge(
    command: &str,
    directory: std::path::PathBuf,
    output: Option<std::path::PathBuf>,
    target: Option<String>,
    human: bool,
) -> Result<CommandOutput> {
    let directory = fs::canonicalize(directory).map_err(|error| {
        AppError::invalid_request(format!("Cannot open plugin project: {error}"))
    })?;
    if output.is_some() && command != "pack" {
        return Err(AppError::invalid_request(
            "--out is only supported by plugin pack",
        ));
    }
    if target.is_some() && command != "check" {
        return Err(AppError::invalid_request(
            "--target is only supported by plugin check",
        ));
    }
    let output = output
        .map(|path| std::path::absolute(path).map_err(node_error))
        .transpose()?;
    let mut child = Command::new("node");
    child
        .current_dir(if directory.is_dir() {
            directory.as_path()
        } else {
            directory.parent().unwrap()
        })
        .args(["--input-type=module", "-e", BRIDGE, command])
        .arg(&directory)
        .arg(
            output
                .as_ref()
                .map(|path| path.to_string_lossy().into_owned())
                .unwrap_or_default(),
        )
        .arg(if human { "false" } else { "true" })
        .arg(target.unwrap_or_default())
        .stdin(Stdio::inherit())
        .stdout(if human {
            Stdio::inherit()
        } else {
            Stdio::piped()
        })
        .stderr(Stdio::inherit());
    // Replace the watch process on Unix so Ctrl-C and termination reach Node
    // directly, without leaving an orphan watcher behind.
    #[cfg(unix)]
    if command == "dev" {
        use std::os::unix::process::CommandExt;
        let error = child.exec();
        return Err(node_error(error));
    }
    if !human {
        let result = child.output().map_err(node_error)?;
        let value: serde_json::Value = serde_json::from_slice(&result.stdout).map_err(|error| {
            AppError::invalid_request(format!("Invalid compiler response: {error}"))
        })?;
        if !result.status.success() {
            return Err(AppError::invalid_request(
                value["error"]["message"]
                    .as_str()
                    .unwrap_or("Plugin compilation failed"),
            ));
        }
        let mut value = value;
        value["command"] = json!(format!("plugin {command}"));
        return Ok(CommandOutput::success(value));
    }
    let status = child.status().map_err(node_error)?;
    if !status.success() {
        return Err(AppError::invalid_request(format!(
            "plugin {command} failed ({status}); see diagnostics"
        )));
    }

    Ok(CommandOutput::success(
        json!({"command": format!("plugin {command}"), "directory": directory}),
    ))
}

fn install(args: PluginInstallArgs, human: bool) -> Result<CommandOutput> {
    let target_path = Path::new(&args.target);
    let bytes = if target_path.is_file() {
        if human {
            println!(
                "Installing plugin from local file: {}",
                target_path.display()
            );
        }
        fs::read(target_path).map_err(|e| {
            AppError::invalid_request(format!("Cannot read {}: {e}", target_path.display()))
        })?
    } else {
        let client = PluginRegistryClient::new()?;
        let entry = client.find(&args.target)?;
        if let Some(req_version) = &args.version
            && &entry.version != req_version
        {
            return Err(AppError::invalid_request(format!(
                "Registry lists version {}, but {} was requested",
                entry.version, req_version
            )));
        }
        if human {
            println!(
                "Downloading {} v{} from {}...",
                entry.name, entry.version, entry.repo
            );
        }
        client.download(&entry)?
    };

    let info = install_package_bytes(&bytes, args.dir.as_deref(), args.unpack, args.force)?;
    if human {
        println!(
            "Installed {} v{} ({}) -> {}",
            info.name,
            info.version,
            info.id,
            info.path.display()
        );
    }
    Ok(CommandOutput::success(json!({
        "command": "plugin install",
        "installed": true,
        "id": info.id,
        "name": info.name,
        "version": info.version,
        "sha256": info.hash,
        "path": info.path,
        "description": info.description,
    })))
}

fn list(args: PluginListArgs) -> Result<CommandOutput> {
    let installed = list_installed_plugins(args.dir.as_deref())?;
    if args.marketplace {
        let client = PluginRegistryClient::new()?;
        let catalog = client.fetch_catalog()?;
        let items: Vec<serde_json::Value> = catalog
            .into_iter()
            .map(|entry| {
                let inst = installed.iter().find(|p| p.id == entry.id);
                json!({
                    "id": entry.id,
                    "name": entry.name,
                    "version": entry.version,
                    "installed": inst.is_some(),
                    "installedVersion": inst.map(|i| &i.version),
                    "description": entry.description,
                    "repo": entry.repo,
                })
            })
            .collect();
        Ok(CommandOutput::success(json!({
            "command": "plugin list",
            "marketplace": true,
            "plugins": items,
        })))
    } else {
        let items: Vec<serde_json::Value> = installed
            .into_iter()
            .map(|item| {
                json!({
                    "id": item.id,
                    "name": item.name,
                    "version": item.version,
                    "sha256": item.hash,
                    "path": item.path,
                    "description": item.description,
                })
            })
            .collect();
        Ok(CommandOutput::success(json!({
            "command": "plugin list",
            "count": items.len(),
            "plugins": items,
        })))
    }
}

fn search(args: PluginSearchArgs) -> Result<CommandOutput> {
    let client = PluginRegistryClient::new()?;
    let matches = client.search(&args.query)?;
    let installed = list_installed_plugins(None).unwrap_or_default();
    let items: Vec<serde_json::Value> = matches
        .into_iter()
        .map(|entry| {
            let inst = installed.iter().find(|p| p.id == entry.id);
            json!({
                "id": entry.id,
                "name": entry.name,
                "version": entry.version,
                "installed": inst.is_some(),
                "installedVersion": inst.map(|i| &i.version),
                "description": entry.description,
                "repo": entry.repo,
            })
        })
        .collect();
    Ok(CommandOutput::success(json!({
        "command": "plugin search",
        "query": args.query,
        "count": items.len(),
        "plugins": items,
    })))
}

fn info(args: PluginInfoArgs) -> Result<CommandOutput> {
    let info = plugin_info(&args.target, args.dir.as_deref())?;
    Ok(CommandOutput::success(json!({
        "command": "plugin info",
        "target": args.target,
        "info": info,
    })))
}

fn uninstall(args: PluginUninstallArgs) -> Result<CommandOutput> {
    let removed = uninstall_plugin(&args.id, args.dir.as_deref())?;
    if !removed {
        return Err(AppError::invalid_request(format!(
            "Plugin '{}' is not installed",
            args.id
        )));
    }
    Ok(CommandOutput::success(json!({
        "command": "plugin uninstall",
        "uninstalled": true,
        "id": args.id,
    })))
}

fn node_error(error: std::io::Error) -> AppError {
    AppError::invalid_request(format!(
        "Could not start plugin tools: {error}. Install Node.js >=22.12 and run pnpm install in the plugin project."
    ))
}

fn create(directory: &Path, template: &str) -> Result<CommandOutput> {
    let name = directory
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            AppError::invalid_request("Choose a lowercase project name, for example my-csv-editor")
        })?;
    if !name.starts_with(|c: char| c.is_ascii_lowercase())
        || !name
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
    {
        return Err(AppError::invalid_request(
            "Choose a lowercase project name, for example my-csv-editor",
        ));
    }
    let catalog: serde_json::Value =
        serde_json::from_str(CATALOG).map_err(|e| AppError::internal(e.to_string()))?;
    let definition = catalog
        .get(template)
        .ok_or_else(|| AppError::invalid_request("Unknown plugin template"))?;
    let project: serde_json::Value =
        serde_json::from_str(PROJECT).map_err(|e| AppError::internal(e.to_string()))?;
    let mut manifest = definition["manifest"].clone();
    manifest["apiVersion"] = json!(1);
    manifest["id"] = json!(format!("local.{name}"));
    manifest["name"] = json!(name);
    manifest["version"] = json!("0.1.0");
    let mut package = project["package"].clone();
    package["name"] = json!(name);
    if let Some(scripts) = definition["scripts"].as_object() {
        for (key, value) in scripts {
            package["scripts"][key] = value.clone();
        }
    }
    let tsconfig = project["tsconfig"].clone();
    // create_dir refuses existing files/directories, including symlinks.
    fs::create_dir(directory).map_err(|error| {
        AppError::invalid_request(format!("Cannot create {}: {error}", directory.display()))
    })?;
    let write = || -> std::io::Result<()> {
        for (destination, source) in definition["files"]
            .as_object()
            .expect("embedded template files")
        {
            let content = TEMPLATES
                .iter()
                .find(|(name, _)| Some(*name) == source.as_str())
                .expect("embedded template source")
                .1;
            let target = directory.join(destination);
            fs::create_dir_all(target.parent().expect("template parent"))?;
            fs::write(target, content)?;
        }
        fs::write(directory.join(".gitignore"), "node_modules/\ndist/\n")?;
        fs::write(
            directory.join("README.md"),
            TEMPLATES
                .iter()
                .find(|(name, _)| *name == "README.md")
                .expect("template README")
                .1,
        )?;
        for (file, value) in [
            ("plugin.json", manifest),
            ("package.json", package),
            ("tsconfig.json", tsconfig),
        ] {
            fs::write(
                directory.join(file),
                format!("{}\n", serde_json::to_string_pretty(&value)?),
            )?;
        }
        Ok(())
    };
    write()
        .map_err(|error| AppError::internal(format!("Could not finish plugin project: {error}")))?;
    let directory = fs::canonicalize(directory)
        .map_err(|error| AppError::internal(format!("Cannot resolve created project: {error}")))?;
    Ok(CommandOutput::success(json!({
        "directory": directory,
        "next": "Use eidos plugin check/pack. In Lite, load plugin.json as a development source. CLI authoring sessions are not yet available."
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scaffold_uses_unified_commands_and_never_overwrites() {
        let temporary = tempfile::tempdir().unwrap();
        let project = temporary.path().join("csv-editor");
        create(&project, "document-view").unwrap();
        let package: serde_json::Value =
            serde_json::from_slice(&fs::read(project.join("package.json")).unwrap()).unwrap();
        assert_eq!(package["scripts"]["check"], "eidos-plugin check .");
        assert_eq!(
            package["devDependencies"]["@eidos.space/plugin-tools"],
            "^0.2.0"
        );
        assert_eq!(
            package["devDependencies"]["@eidos.space/plugin-sdk"],
            "^0.2.0"
        );
        assert!(project.join("plugin.json").is_file());
        fs::write(project.join("src/main.ts"), "user changes").unwrap();
        assert!(create(&project, "document-view").is_err());
        assert_eq!(
            fs::read_to_string(project.join("src/main.ts")).unwrap(),
            "user changes"
        );
        assert!(create(&temporary.path().join("Invalid Name"), "document-view").is_err());
    }
}
