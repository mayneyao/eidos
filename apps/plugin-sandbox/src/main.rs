use clap::{Args, Parser, Subcommand};
use eidos_plugin_sandbox::{run, scan_bluetooth, RunOptions};
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    version,
    about = "Capability-controlled QuickJS plugin runner (not an OS sandbox)"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Run a bundled JavaScript ES module.
    Run(Options),
    /// Host-only discovery of BLE device IDs. Does not connect.
    BluetoothScan {
        #[arg(long, default_value_t = 5)]
        seconds: u64,
    },
}

#[derive(Args)]
struct Options {
    file: PathBuf,
    #[arg(long)]
    listen: bool,
    #[arg(long, default_value_t = 64)]
    memory_mb: usize,
    #[arg(long, default_value_t = 100)]
    turn_budget_ms: u64,
    #[arg(long, default_value_t = 30000)]
    max_duration_ms: u64,
    /// Exact HTTP(S)/WS(S) origins. Repeat to grant multiple origins.
    #[arg(long)]
    allow_net: Vec<String>,
    #[arg(long)]
    allow_private_net: bool,
    #[arg(long)]
    bluetooth_policy: Option<PathBuf>,
    #[arg(long)]
    bluetooth_mock: bool,
    /// Versioned host protocol for Node SDK; EOF stops the worker.
    #[arg(long, requires = "listen")]
    control_protocol: bool,
}

fn main() {
    let result = match Cli::parse().command {
        Command::Run(o) => run(RunOptions {
            file: o.file,
            listen: o.listen,
            memory_mb: o.memory_mb,
            turn_budget_ms: o.turn_budget_ms,
            max_duration_ms: o.max_duration_ms,
            allow_net: o.allow_net,
            allow_private_net: o.allow_private_net,
            bluetooth_policy: o.bluetooth_policy,
            bluetooth_mock: o.bluetooth_mock,
            control_protocol: o.control_protocol,
        }),
        Command::BluetoothScan { seconds } => scan_bluetooth(seconds),
    };
    if let Err(error) = result {
        eprintln!("plugin-sandbox: {error:#}");
        std::process::exit(1);
    }
}
