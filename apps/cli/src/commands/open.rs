use std::path::PathBuf;

use anyhow::{Context, Result};

/// Open a file in Eidos editor
pub async fn execute(file: &str) -> Result<()> {
    // Convert to absolute path
    let path = PathBuf::from(file);
    let abs_path = if path.is_relative() {
        std::env::current_dir()
            .context("Failed to get current directory")?
            .join(path)
    } else {
        path
    };

    // Canonicalize path (resolves .., ., etc.)
    let abs_path = abs_path
        .canonicalize()
        .context(format!("File not found: {}", file))?;

    // Check if file exists
    if !abs_path.exists() {
        anyhow::bail!("File does not exist: {}", abs_path.display());
    }

    // Check if it's a file (not a directory)
    if !abs_path.is_file() {
        anyhow::bail!("Path is not a file: {}", abs_path.display());
    }

    // Construct protocol URL
    let file_path = abs_path.to_string_lossy();
    let url = format!(
        "eidos://file?path={}",
        urlencoding::encode(&file_path)
    );

    // Open URL (this will trigger the protocol handler in Eidos Desktop)
    open::that(&url).context("Failed to open URL")?;

    Ok(())
}
