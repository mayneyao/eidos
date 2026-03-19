use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Space entry from spaces.json registry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub sync: Option<SyncConfig>,
    #[serde(default)]
    pub relay: Option<RelayConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConfig {
    pub enabled: bool,
    #[serde(default)]
    pub remote: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayConfig {
    pub enabled: bool,
}

/// Spaces registry from ~/.eidos/spaces.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceRegistry {
    pub spaces: Vec<SpaceEntry>,
}

impl SpaceRegistry {
    /// Get the registry file path
    pub fn registry_path() -> Result<PathBuf> {
        let path = dirs::home_dir()
            .context("Failed to get home directory")?
            .join(".eidos")
            .join("spaces.json");
        Ok(path)
    }

    /// Load registry from file
    pub fn load() -> Result<Self> {
        let path = Self::registry_path()?;

        if !path.exists() {
            return Ok(Self { spaces: vec![] });
        }

        let content = std::fs::read_to_string(&path)
            .with_context(|| format!("Failed to read registry from {}", path.display()))?;

        let registry: SpaceRegistry = serde_json::from_str(&content)
            .with_context(|| format!("Failed to parse registry from {}", path.display()))?;

        Ok(registry)
    }

    /// Save registry to file
    pub fn save(&self) -> Result<()> {
        let path = Self::registry_path()?;

        std::fs::create_dir_all(path.parent().unwrap())
            .with_context(|| format!("Failed to create .eidos directory"))?;

        let content = serde_json::to_string_pretty(self)
            .context("Failed to serialize registry")?;

        std::fs::write(&path, content)
            .with_context(|| format!("Failed to write registry to {}", path.display()))?;

        Ok(())
    }

    /// Get all spaces
    pub fn list(&self) -> &[SpaceEntry] {
        &self.spaces
    }

    /// Get space by ID
    pub fn get(&self, id: &str) -> Option<&SpaceEntry> {
        self.spaces.iter().find(|s| s.id == id)
    }

    /// Find space that contains the given path
    /// Returns the space ID if current directory is inside a space
    pub fn find_space_for_path(&self, path: &std::path::Path) -> Option<String> {
        let current = path.canonicalize().ok()?;
        
        for space in &self.spaces {
            if let Ok(space_path) = std::path::Path::new(&space.path).canonicalize() {
                if current.starts_with(&space_path) {
                    return Some(space.id.clone());
                }
            }
        }
        None
    }

    /// Get current directory's space ID if inside a space
    pub fn current_dir_space() -> Option<String> {
        let current_dir = std::env::current_dir().ok()?;
        let registry = Self::load().ok()?;
        registry.find_space_for_path(&current_dir)
    }

    /// Add a new space
    pub fn add(&mut self, space: SpaceEntry) {
        // Remove existing space with same ID
        self.spaces.retain(|s| s.id != space.id);
        self.spaces.push(space);
    }

    /// Remove a space by ID
    pub fn remove(&mut self, id: &str) -> bool {
        let len = self.spaces.len();
        self.spaces.retain(|s| s.id != id);
        self.spaces.len() < len
    }
}

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

    /// Current directory path within the space (filesystem-style navigation)
    #[serde(default)]
    pub current_path: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            endpoint: default_endpoint(),
            space_id: None,
            api_key: None,
            timeout: default_timeout(),
            current_path: Some("/".to_string()),
        }
    }
}

fn default_endpoint() -> String {
    "http://localhost:13127".to_string()
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
            .context("No space selected. Change to a space directory or use -s <space-id>")
    }

    /// Get the full endpoint for a space (with hostname)
    pub fn space_endpoint(&self, space_id: &str) -> String {
        // Desktop uses hostname pattern: <space-id>.eidos.localhost:<port>
        // Extract port from endpoint, default to 13127
        let port = self
            .endpoint
            .split(':')
            .last()
            .and_then(|p| p.parse::<u16>().ok())
            .unwrap_or(13127);
        format!("http://{}.eidos.localhost:{}", space_id, port)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.endpoint, "http://localhost:13127");
        assert_eq!(config.timeout, 30);
        assert!(config.space_id.is_none());
    }

    #[test]
    fn test_rpc_url() {
        let config = Config::default();
        assert_eq!(config.rpc_url(), "http://localhost:13127/rpc");
    }
}
