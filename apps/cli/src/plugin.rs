use std::fs;
use std::path::Path;

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
        PluginCommand::Create { .. }
        | PluginCommand::Check(_)
        | PluginCommand::Dev(_)
        | PluginCommand::Pack(_) => Err(AppError::invalid_request(
            "Plugin authoring commands (create, check, dev, pack) have moved to @eidos.space/plugin-tools in Eidos 2.0.\n\nUse:\n  npx @eidos.space/plugin-tools <command>\n\nSee https://docs.eidos.space/extensibility for details.",
        )),
        PluginCommand::Install(args) => install(args, human),
        PluginCommand::List(args) => list(args),
        PluginCommand::Search(args) => search(args),
        PluginCommand::Info(args) => info(args),
        PluginCommand::Uninstall(args) => uninstall(args),
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authoring_commands_return_clear_migration_guidance() {
        let temporary = tempfile::tempdir().unwrap();
        let project = temporary.path().join("csv-editor");
        let result = run(
            PluginArgs {
                command: PluginCommand::Create {
                    directory: project,
                    template: "document-view".to_string(),
                },
            },
            false,
        );
        let Err(err) = result else {
            panic!("expected error");
        };
        assert!(err.message.contains("@eidos.space/plugin-tools"));
    }
}
