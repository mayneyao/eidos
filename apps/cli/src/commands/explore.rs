use anyhow::{Context, Result};
use clap::Args;
use colored::Colorize;
use serde::{Deserialize, Serialize};

use crate::client::EidosClient;
use crate::utils::OutputFormat;

/// Explore a URL using browser and capture network requests
/// 
/// This command uses Eidos Desktop's browser to visit a URL and capture
/// all network requests (API calls) made by the page. This is useful for
/// discovering APIs that can be used to create RawData adapters.
/// 
/// Examples:
///   eidos explore https://weread.qq.com/web/shelf
///   eidos explore https://space.bilibili.com/favlist --scroll --output apis.json
#[derive(Args)]
pub struct ExploreArgs {
    /// URL to explore
    pub url: String,

    /// Timeout in milliseconds
    #[arg(short, long, default_value = "30000")]
    pub timeout: u64,

    /// Scroll to bottom to trigger lazy loading
    #[arg(short, long)]
    pub scroll: bool,

    /// Wait for network idle (milliseconds)
    #[arg(short, long, default_value = "2000")]
    pub wait_idle: u64,

    /// Click selectors (comma-separated)
    #[arg(short, long, value_delimiter = ',')]
    pub click: Vec<String>,

    /// Maximum requests to capture
    #[arg(short, long, default_value = "100")]
    pub max_requests: usize,

    /// Filter URLs by regex pattern
    #[arg(short, long)]
    pub filter: Option<String>,

    /// Skip capturing response bodies (faster)
    #[arg(long)]
    pub no_response: bool,

    /// Output file (JSON format)
    #[arg(short, long)]
    pub output: Option<String>,

    /// Filter responses by content type (e.g., "json", "api")
    #[arg(long)]
    pub content_type: Option<String>,

    /// Show browser window for debugging (not headless)
    #[arg(short, long)]
    pub visible: bool,
}

#[derive(Debug, Deserialize)]
pub struct ExploreResponse {
    pub success: bool,
    pub data: Option<ExploreResult>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExploreResult {
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub requests: Vec<NetworkRequest>,
    pub responses: Vec<NetworkResponse>,
    pub logs: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct NetworkRequest {
    pub id: String,
    pub url: String,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "postData")]
    pub post_data: Option<String>,
    pub timestamp: i64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct NetworkResponse {
    #[serde(rename = "requestId")]
    pub request_id: String,
    pub url: String,
    #[serde(rename = "statusCode")]
    pub status_code: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "contentType")]
    pub content_type: Option<String>,
    pub timestamp: i64,
}

pub async fn execute(args: ExploreArgs, client: EidosClient, format: OutputFormat) -> Result<()> {
    // Validate URL
    let url = if args.url.starts_with("http://") || args.url.starts_with("https://") {
        args.url
    } else {
        format!("https://{}", args.url)
    };

    println!("{}", format!("Exploring: {}", url).cyan().bold());
    println!("{}", "This may take a few seconds...".dimmed());
    println!();

    // Build request body
    let body = serde_json::json!({
        "url": url,
        "timeout": args.timeout,
        "scrollToBottom": args.scroll,
        "waitForNetworkIdle": args.wait_idle,
        "clickSelectors": args.click,
        "maxRequests": args.max_requests,
        "urlFilter": args.filter,
        "captureResponse": !args.no_response,
        "headless": !args.visible,
    });

    // Send request to API server
    let response_json = client
        .post_json("/api/explore", body)
        .await
        .context("Failed to send explore request")?;

    let result: ExploreResponse = serde_json::from_value(response_json)
        .context("Failed to parse explore response")?;

    if !result.success {
        return Err(anyhow::anyhow!(
            "Explore failed: {}",
            result.error.unwrap_or_else(|| "Unknown error".to_string())
        ));
    }

    let data = result.data.context("No data in response")?;

    // Filter responses by content type if specified
    let responses: Vec<_> = if let Some(filter) = &args.content_type {
        data.responses
            .clone()
            .into_iter()
            .filter(|r| {
                r.content_type
                    .as_ref()
                    .map(|ct| ct.to_lowercase().contains(&filter.to_lowercase()))
                    .unwrap_or(false)
            })
            .collect()
    } else {
        data.responses.clone()
    };

    // Output results
    match format {
        OutputFormat::Json => {
            let output = serde_json::json!({
                "url": data.url,
                "title": data.title,
                "description": data.description,
                "requests": data.requests,
                "responses": responses,
                "logs": data.logs,
                "errors": data.errors,
            });
            
            let json_str = serde_json::to_string_pretty(&output)?;
            
            if let Some(output_file) = args.output {
                std::fs::write(&output_file, json_str)?;
                println!("{}", format!("Results saved to: {}", output_file).green());
            } else {
                println!("{}", json_str);
            }
        }
        OutputFormat::Table => {
            print_text_output(&data, &responses, args.output)?;
        }
    }

    Ok(())
}

fn print_text_output(
    data: &ExploreResult,
    responses: &[NetworkResponse],
    output_file: Option<String>,
) -> Result<()> {
    // Page info
    if let Some(title) = &data.title {
        println!("{}", "Page Information".green().bold());
        println!("  Title:       {}", title);
        if let Some(desc) = &data.description {
            println!("  Description: {}", desc.chars().take(100).collect::<String>());
        }
        println!();
    }

    // Summary
    println!("{}", "Summary".green().bold());
    println!("  Total requests:  {}", data.requests.len());
    println!("  With responses:  {}", responses.len());
    println!("  Logs:            {}", data.logs.len());
    if !data.errors.is_empty() {
        println!("  {}:          {}", "Errors".red(), data.errors.len());
    }
    println!();

    // API discoveries
    if !responses.is_empty() {
        println!("{}", "Discovered APIs".green().bold());
        println!();

        for (i, resp) in responses.iter().take(20).enumerate() {
            let req = data.requests.iter().find(|r| r.id == resp.request_id);
            
            println!("{}. {}", i + 1, resp.url.cyan());
            
            if let Some(req) = req {
                println!("   Method:  {}", req.method.yellow());
            }
            
            let status_color = if resp.status_code >= 200 && resp.status_code < 300 {
                resp.status_code.to_string().green()
            } else if resp.status_code >= 400 {
                resp.status_code.to_string().red()
            } else {
                resp.status_code.to_string().yellow()
            };
            println!("   Status:  {}", status_color);
            
            if let Some(ct) = &resp.content_type {
                println!("   Type:    {}", ct.dimmed());
            }

            // Show body preview for JSON responses
            if let Some(body) = &resp.body {
                let preview: String = body.chars().take(200).collect();
                if !preview.is_empty() {
                    println!("   Preview: {}", preview.dimmed());
                }
            }
            
            println!();
        }

        if responses.len() > 20 {
            println!("  ... and {} more responses", responses.len() - 20);
            println!();
        }
    }

    // Save to file if requested
    if let Some(output_file) = output_file {
        let output = serde_json::json!({
            "url": data.url,
            "title": data.title,
            "description": data.description,
            "requests": data.requests,
            "responses": responses,
            "logs": data.logs,
            "errors": data.errors,
        });
        
        let json_str = serde_json::to_string_pretty(&output)?;
        std::fs::write(&output_file, json_str)?;
        println!("{}", format!("Full results saved to: {}", output_file).green());
    }

    // Show tip
    println!();
    println!("{}", "Tip:".yellow().bold());
    println!("  Use {} to filter by content type", "--content-type json".cyan());
    println!("  Use {} to save full results", "--output results.json".cyan());
    println!();

    Ok(())
}
