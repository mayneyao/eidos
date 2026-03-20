use anyhow::Result;
use colored::Colorize;

use crate::client::EidosClient;
use crate::config::SpaceRegistry;

/// Check Eidos Desktop status
pub async fn execute(client: EidosClient) -> Result<()> {
    print!("Checking Eidos Desktop... ");
    
    // Get first available space from registry to test with
    let registry = SpaceRegistry::load()?;
    let test_space = registry.list().first().map(|s| s.id.clone());
    
    match client.health_check(test_space.as_deref()).await {
        Ok(true) => {
            println!("{}", "✓ Running".green());
            
            // Show available spaces
            let spaces = registry.list();
            if spaces.is_empty() {
                println!("  {} No spaces found", "!".yellow());
            } else {
                println!("  {} space(s) available:", spaces.len().to_string().cyan());
                for space in spaces.iter().take(5) {
                    println!("    • {}", space.id.cyan());
                }
                if spaces.len() > 5 {
                    println!("    ... and {} more", spaces.len() - 5);
                }
            }
            
            Ok(())
        }
        Ok(false) => {
            println!("{}", "✗ Not responding".red());
            println!("\n{}", "Make sure Eidos Desktop is running.".yellow());
            std::process::exit(1);
        }
        Err(e) => {
            println!("{}", "✗ Not running".red());
            println!("\n{}", format!("Error: {}", e).red());
            println!("\n{}", "Make sure Eidos Desktop is running.".yellow());
            std::process::exit(1);
        }
    }
}
