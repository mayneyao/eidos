use std::{path::Path, process::Command};

fn git_output(args: &[&str]) -> Option<String> {
    let output = Command::new("git").args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8(output.stdout)
        .ok()
        .map(|value| value.trim().to_string())
}

fn watch_git_path(path: &str) {
    let Some(git_path) = git_output(&["rev-parse", "--git-path", path]) else {
        return;
    };

    // Cargo treats a missing rerun-if-changed path as perpetually dirty.
    if Path::new(&git_path).exists() {
        println!("cargo:rerun-if-changed={git_path}");
    }
}

fn main() {
    // Get git version if available
    let git_hash =
        git_output(&["rev-parse", "--short", "HEAD"]).unwrap_or_else(|| "unknown".to_string());

    println!("cargo:rustc-env=GIT_HASH={}", git_hash);

    // The crate lives below the repository root, so apps/cli/.git/HEAD does
    // not exist. Resolve the actual Git metadata paths and watch only paths
    // that exist; otherwise Cargo rebuilds this crate on every invocation.
    watch_git_path("HEAD");
    watch_git_path("refs/heads");
    watch_git_path("packed-refs");
}
