use anyhow::{Context, Result};
use reqwest::{Client, Response};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::{debug, error};

use crate::config::Config;

/// RPC request payload
#[derive(Debug, Serialize)]
struct RpcRequest {
    method: String,
    params: Vec<Value>,
}

/// RPC response payload
#[derive(Debug, Deserialize)]
struct RpcResponse {
    success: bool,
    #[serde(default)]
    data: Option<Value>,
    #[serde(default)]
    error: Option<String>,
}

/// Eidos RPC Client
#[derive(Clone)]
pub struct EidosClient {
    http: Client,
    config: Config,
}

impl EidosClient {
    /// Create a new client from config
    pub fn new(config: Config) -> Result<Self> {
        let http = Client::builder()
            .timeout(std::time::Duration::from_secs(config.timeout))
            .build()
            .context("Failed to create HTTP client")?;

        Ok(Self { http, config })
    }

    /// Make an RPC call to the Eidos server
    pub async fn call(&self, method: &str, params: Vec<Value>) -> Result<Value> {
        // Extract port from endpoint
        let port = self.config.endpoint
            .split(':')
            .last()
            .and_then(|p| p.parse::<u16>().ok())
            .unwrap_or(13127);
        
        // Use 127.0.0.1 with Host header for proper routing
        let url = format!("http://127.0.0.1:{}/rpc", port);
        
        // Build Host header from space_id
        let host = if let Some(space_id) = &self.config.space_id {
            format!("{}.eidos.localhost", space_id)
        } else {
            "localhost".to_string()
        };
        
        // Build request with proper hostname for space identification
        let request = self.http
            .post(&url)
            .header("Content-Type", "application/json")
            .header("Host", &host);

        // Add API key if configured
        let request = if let Some(api_key) = &self.config.api_key {
            request.header("Authorization", format!("Bearer {}", api_key))
        } else {
            request
        };

        let body = RpcRequest {
            method: method.to_string(),
            params,
        };

        debug!("RPC call: {} -> {} (Host: {})", method, url, host);

        let response = request
            .json(&body)
            .send()
            .await
            .context(format!("Failed to connect to Eidos server at {} (Host: {})", url, host))?;

        self.handle_response(response).await
    }

    /// Make an RPC call for a specific space
    pub async fn call_for_space(
        &self,
        space_id: &str,
        method: &str,
        params: Vec<Value>,
    ) -> Result<Value> {
        // Use 127.0.0.1 but set Host header for proper routing
        let port = self.config.endpoint
            .split(':')
            .last()
            .and_then(|p| p.parse::<u16>().ok())
            .unwrap_or(13127);
        let rpc_url = format!("http://127.0.0.1:{}/rpc", port);
        let host = format!("{}.eidos.localhost", space_id);

        let request = self.http
            .post(&rpc_url)
            .header("Content-Type", "application/json")
            .header("Host", &host);

        let request = if let Some(api_key) = &self.config.api_key {
            request.header("Authorization", format!("Bearer {}", api_key))
        } else {
            request
        };

        let body = RpcRequest {
            method: method.to_string(),
            params,
        };

        debug!("RPC call for space [{}]: {} -> {} (Host: {})", space_id, method, rpc_url, host);

        let response = request
            .json(&body)
            .send()
            .await
            .with_context(|| format!(
                "Failed to connect to space '{}' at {}.\n\
                 Make sure Eidos Desktop is running and the space is open.",
                space_id, rpc_url
            ))?;

        self.handle_response(response).await
    }

    /// Handle HTTP response and parse RPC result
    async fn handle_response(&self, response: Response) -> Result<Value> {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        // 1. Try to parse as standard RPC response (success or controlled error)
        if let Ok(rpc_resp) = serde_json::from_str::<RpcResponse>(&text) {
            if rpc_resp.success {
                return Ok(rpc_resp.data.unwrap_or(Value::Null));
            } else {
                let msg = rpc_resp.error.unwrap_or_else(|| "Unknown error".to_string());
                anyhow::bail!("{}", msg);
            }
        }

        // 2. If not a valid RPC JSON, check for HTTP failure
        if !status.is_success() {
            anyhow::bail!("Server error: {} ({})", status, text);
        }

        // 3. Success status but invalid JSON
        anyhow::bail!("Unexpected response format: {}", text);
    }

    /// Check if the server is healthy
    /// 
    /// Desktop uses hostname-based routing, so we need a space ID
    /// to properly route the request. If not provided, uses default endpoint.
    pub async fn health_check(&self, space_id: Option<&str>) -> Result<bool> {
        // Build URL with proper hostname - use 127.0.0.1 instead of localhost
        // and set Host header manually for proper routing
        let (url, host) = if let Some(space_id) = space_id {
            let host = format!("{}.eidos.localhost", space_id);
            let port = self.config.endpoint
                .split(':')
                .last()
                .and_then(|p| p.parse::<u16>().ok())
                .unwrap_or(13127);
            (format!("http://127.0.0.1:{}", port), host)
        } else {
            let host = "localhost".to_string();
            (self.config.endpoint.clone(), host)
        };
        
        tracing::debug!("Health check URL: {} (Host: {})", url, host);
        
        // Use IP address but set Host header for proper routing
        match self.http
            .get(&url)
            .header("Host", host)
            .send()
            .await 
        {
            Ok(resp) => {
                let status = resp.status();
                tracing::debug!("Health check response: {}", status);
                Ok(true)
            }
            Err(e) => {
                tracing::debug!("Health check error: {}", e);
                Ok(false)
            }
        }
    }

    /// List all available spaces
    pub async fn list_spaces(&self) -> Result<Vec<SpaceInfo>> {
        // Try to get from server, fallback to local registry
        let data = self.call("space.list", vec![]).await?;
        
        let spaces: Vec<SpaceInfo> = serde_json::from_value(data)
            .context("Failed to parse space list")?;
        
        Ok(spaces)
    }

    /// Get space info
    pub async fn get_space_info(&self, space_id: &str) -> Result<SpaceInfo> {
        let data = self.call_for_space(space_id, "space.info", vec![]).await?;
        
        let info: SpaceInfo = serde_json::from_value(data)
            .context("Failed to parse space info")?;
        
        Ok(info)
    }
}

/// Space information
#[derive(Debug, Deserialize)]
pub struct SpaceInfo {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

/// Table information
#[derive(Debug, Deserialize)]
pub struct TableInfo {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
}

/// Document information
#[derive(Debug, Deserialize)]
pub struct DocInfo {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rpc_request_serialization() {
        let req = RpcRequest {
            method: "doc.list".to_string(),
            params: vec![],
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("doc.list"));
    }
}
