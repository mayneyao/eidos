use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use crate::app::CommandOutput;
use crate::cli::SkillsInitArgs;
use crate::error::{AppError, Result};

const SKILL_FILES: &[(&str, &str)] = &[
    ("SKILL.md", include_str!("../../../skills/eidos/SKILL.md")),
    (
        "agents/openai.yaml",
        include_str!("../../../skills/eidos/agents/openai.yaml"),
    ),
    (
        "references/cli.md",
        include_str!("../../../skills/eidos/references/cli.md"),
    ),
    (
        "references/operations.md",
        include_str!("../../../skills/eidos/references/operations.md"),
    ),
];

pub fn init(args: SkillsInitArgs) -> Result<CommandOutput> {
    let (scope, root) = if args.global {
        ("global", global_root()?)
    } else {
        (
            "project",
            absolute_path(args.path.as_deref().unwrap_or_else(|| Path::new(".")))?,
        )
    };
    install_at(&root, scope, args.force)
}

fn install_at(root: &Path, scope: &str, force: bool) -> Result<CommandOutput> {
    let target = root.join(".agents").join("skills").join("eidos");
    let mut planned = Vec::with_capacity(SKILL_FILES.len());

    // Preflight every file before creating or changing anything. This keeps a
    // typo or an unconfirmed overwrite from leaving a half-initialized Skill.
    for (relative, content) in SKILL_FILES {
        let destination = target.join(relative);
        let status = match fs::symlink_metadata(&destination) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(AppError::runtime(
                    "conflict",
                    format!(
                        "refusing to write through symlink {}",
                        destination.display()
                    ),
                    None,
                ));
            }
            Ok(metadata) if !metadata.is_file() => {
                return Err(AppError::runtime(
                    "conflict",
                    format!(
                        "Skill destination is not a regular file: {}",
                        destination.display()
                    ),
                    None,
                ));
            }
            Ok(_) => {
                let existing = fs::read(&destination).map_err(|error| {
                    AppError::internal(format!(
                        "failed to read existing Skill file {}: {error}",
                        destination.display()
                    ))
                })?;
                if existing == content.as_bytes() {
                    "unchanged"
                } else if force {
                    "updated"
                } else {
                    return Err(AppError::runtime(
                        "already-exists",
                        format!(
                            "Eidos Skill differs at {}; pass --force to update it",
                            destination.display()
                        ),
                        None,
                    ));
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => "created",
            Err(error) => {
                return Err(AppError::internal(format!(
                    "failed to inspect Skill file {}: {error}",
                    destination.display()
                )));
            }
        };
        planned.push(json!({"path": relative, "status": status}));
    }

    let changed = planned.iter().any(|file| {
        matches!(
            file.get("status").and_then(Value::as_str),
            Some("created" | "updated")
        )
    });
    if changed {
        fs::create_dir_all(&target).map_err(|error| {
            AppError::internal(format!(
                "failed to create Skill directory {}: {error}",
                target.display()
            ))
        })?;
        for ((relative, content), file) in SKILL_FILES.iter().zip(&planned) {
            if !matches!(
                file.get("status").and_then(Value::as_str),
                Some("created" | "updated")
            ) {
                continue;
            }
            let destination = target.join(relative);
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    AppError::internal(format!(
                        "failed to create Skill directory {}: {error}",
                        parent.display()
                    ))
                })?;
            }
            fs::write(&destination, content).map_err(|error| {
                AppError::internal(format!(
                    "failed to write Skill file {}: {error}",
                    destination.display()
                ))
            })?;
        }
    }

    Ok(CommandOutput::success(json!({
        "skill": "eidos",
        "version": env!("CARGO_PKG_VERSION"),
        "scope": scope,
        "path": target,
        "changed": changed,
        "files": planned,
    })))
}

fn global_root() -> Result<PathBuf> {
    absolute_path(&home_dir()?.join(".agents").join("skills"))
}

fn home_dir() -> Result<PathBuf> {
    #[cfg(windows)]
    {
        if let Some(home) = env::var_os("USERPROFILE") {
            return Ok(PathBuf::from(home));
        }
        if let (Some(drive), Some(path)) = (env::var_os("HOMEDRIVE"), env::var_os("HOMEPATH")) {
            return Ok(PathBuf::from(format!(
                "{}{}",
                drive.to_string_lossy(),
                path.to_string_lossy()
            )));
        }
    }

    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| AppError::internal("could not determine the current user's home directory"))
}

fn absolute_path(path: &Path) -> Result<PathBuf> {
    if path.is_absolute() {
        return Ok(path.to_path_buf());
    }
    Ok(env::current_dir()
        .map_err(|error| {
            AppError::internal(format!("could not determine current directory: {error}"))
        })?
        .join(path))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::{SKILL_FILES, install_at};

    #[test]
    fn initializes_the_complete_skill_and_is_idempotent() {
        let root = tempdir().unwrap();
        let first = install_at(root.path(), "project", false).unwrap();
        assert_eq!(first.value["changed"], true);
        assert_eq!(
            first.value["files"].as_array().unwrap().len(),
            SKILL_FILES.len()
        );

        let target = root.path().join(".agents/skills/eidos");
        for (relative, _) in SKILL_FILES {
            assert!(target.join(relative).is_file(), "missing {relative}");
        }

        let second = install_at(root.path(), "project", false).unwrap();
        assert_eq!(second.value["changed"], false);
        assert!(
            second.value["files"]
                .as_array()
                .unwrap()
                .iter()
                .all(|file| file["status"] == "unchanged")
        );
    }

    #[test]
    fn protects_local_edits_until_force_is_explicit() {
        let root = tempdir().unwrap();
        install_at(root.path(), "project", false).unwrap();
        let skill = root.path().join(".agents/skills/eidos/SKILL.md");
        fs::write(&skill, "local edit\n").unwrap();

        let error = match install_at(root.path(), "project", false) {
            Ok(_) => panic!("local edits should require --force"),
            Err(error) => error,
        };
        assert_eq!(error.code, "already-exists");
        assert!(error.message.contains("--force"));

        let forced = install_at(root.path(), "project", true).unwrap();
        assert_eq!(forced.value["changed"], true);
        assert_eq!(
            fs::read_to_string(skill).unwrap(),
            include_str!("../../../skills/eidos/SKILL.md")
        );
    }
}
