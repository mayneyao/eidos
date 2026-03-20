use std::process::Command;

fn main() {
    // Get git version if available
    let git_hash = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    println!("cargo:rustc-env=GIT_HASH={}", git_hash);
    
    // Rebuild if git changes
    println!("cargo:rerun-if-changed=.git/HEAD");
}
