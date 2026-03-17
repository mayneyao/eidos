use anyhow::Result;
use clap_complete::{generate, Shell};
use std::io;

use crate::Cli;

/// Generate shell completions
pub fn execute(shell: Shell) -> Result<()> {
    let mut cmd = <Cli as clap::CommandFactory>::command();
    let name = cmd.get_name().to_string();
    
    generate(shell, &mut cmd, name, &mut io::stdout());
    
    Ok(())
}
