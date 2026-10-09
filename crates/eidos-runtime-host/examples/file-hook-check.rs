//! Local plugin authoring check; JSON request on stdin, isolated hook result on stdout.
use std::io::{self, Read};
fn main() -> anyhow::Result<()> {
    let mut input = String::new();
    io::stdin()
        .take(20 * 1024 * 1024)
        .read_to_string(&mut input)?;
    let request = serde_json::from_str(&input)?;
    println!("{}", eidos_runtime_host::file_hooks::run(&request)?);
    Ok(())
}
