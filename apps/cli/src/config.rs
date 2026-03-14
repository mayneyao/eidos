use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// CLI configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    /// Default Eidos Desktop endpoint
    #[serde(default = "default_endpoint")]
    pub endpoint: String,

    /// Current active space ID
    pub space_id: Option<String>,

    /// API key for authentication (if enabled on server)
    pub api_key: Option<String>,

    /// Request timeout in seconds
    #[serde(default = "default_timeout")]
    pub timeout: u64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            endpoint: default_endpoint(),
            space_id: None,
            api_key: None,
            timeout: default_timeout(),
        }
    }
}

fn default_endpoint() -> String {
    "http://localhost:13128".to_string()
}

fn default_timeout() -> u64 {
    30
}

impl Config {
    /// Get the config directory
    pub fn config_dir() -> Result<PathBuf> {
        let dir = dirs::config_dir()
            .context("Failed to get config directory")?
            .join("eidos");
        Ok(dir)
    }

    /// Get the config file path
    pub fn config_path() -> Result<PathBuf> {
        Ok(Self::config_dir()?.join("cli.toml"))
    }

    /// Load config from file, or create default if not exists
    pub fn load() -> Result<Self> {
        let path = Self::config_path()?;

        if !path.exists() {
            return Ok(Self::default());
        }

        let content = std::fs::read_to_string(&path)
            .with_context(|| format!("Failed to read config from {}", path.display()))?;

        let config: Config = toml::from_str(&content)
            .with_context(|| format!("Failed to parse config from {}", path.display()))?;

        Ok(config)
    }

    /// Save config to file
    pub fn save(&self) -> Result<()> {
        let dir = Self::config_dir()?;
        let path = Self::config_path()?;

        std::fs::create_dir_all(&dir)
            .with_context(|| format!("Failed to create config directory: {}", dir.display()))?;

        let content = toml::to_string_pretty(self)
            .context("Failed to serialize config")?;

        std::fs::write(&path, content)
            .with_context(|| format!("Failed to write config to {}", path.display()))?;

        Ok(())
    }

    /// Get the RPC endpoint URL
    pub fn rpc_url(&self) -> String {
        format!("{}/rpc", self.endpoint.trim_end_matches('/'))
    }

    /// Get current space ID or return error
    pub fn require_space(&self) -> Result<String> {
        self.space_id.clone()
            .context("No space selected. Use 'eidos space use <space-id>' or pass --space")
    }

    /// Get the full endpoint for a space (with hostname)
    pub fn space_endpoint(&self, space_id: &str) -> String {
        // Desktop uses hostname pattern: <space-id>.eidos.localhost:<port>
        let base = self.endpoint.replace("localhost", &format!("{}.eidos.localhost", space_id));
        base
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.endpoint, "http://localhost:13128");
        assert_eq!(config.timeout, 30);
        assert!(config.space_id.is_none());
    }

    #[test]
    fn test_rpc_url() {
        let config = Config::default();
        assert_eq!(config.rpc_url(), "http://localhost:13128/rpc");
    }
}
