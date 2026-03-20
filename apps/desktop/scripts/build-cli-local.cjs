#!/usr/bin/env node
/**
 * Build CLI for local desktop development/packaging
 * This script builds the Rust CLI and copies it to the dist-cli directory
 * for electron-builder to package
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const platform = process.platform;
const arch = process.arch;

// Determine target and output filename
let target;
let outputName;

if (platform === 'darwin') {
  // macOS
  target = arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  outputName = arch === 'arm64' ? 'eidos-macos-arm' : 'eidos-macos-intel';
} else if (platform === 'win32') {
  // Windows
  target = 'x86_64-pc-windows-msvc';
  outputName = 'eidos-windows-x64.exe';
} else {
  // Linux
  target = 'x86_64-unknown-linux-gnu';
  outputName = 'eidos-linux-x64';
}

const cliDir = path.join(__dirname, '../../cli');
const distCliDir = path.join(__dirname, '../dist-cli');

// Check if cargo is installed
try {
  execSync('cargo --version', { stdio: 'ignore' });
} catch {
  console.error('❌ Rust/Cargo is not installed. Please install Rust to build the CLI.');
  console.error('   Visit: https://rustup.rs/');
  process.exit(1);
}

console.log(`🔨 Building CLI for ${platform} (${arch})...`);
console.log(`   Target: ${target}`);
console.log(`   Output: ${outputName}`);

// Build CLI
try {
  execSync(`cargo build --release`, {
    cwd: cliDir,
    stdio: 'inherit'
  });
} catch (error) {
  console.error('❌ Failed to build CLI');
  process.exit(1);
}

// Create dist-cli directory if it doesn't exist
if (!fs.existsSync(distCliDir)) {
  fs.mkdirSync(distCliDir, { recursive: true });
}

// Determine source binary path
const sourceBinary = path.join(cliDir, 'target/release', platform === 'win32' ? 'eidos.exe' : 'eidos');
const destBinary = path.join(distCliDir, outputName);

// Copy binary to dist-cli
try {
  fs.copyFileSync(sourceBinary, destBinary);
  
  // Make executable on Unix systems
  if (platform !== 'win32') {
    fs.chmodSync(destBinary, 0o755);
  }
  
  console.log(`✅ CLI built successfully: ${destBinary}`);
} catch (error) {
  console.error(`❌ Failed to copy CLI binary: ${error.message}`);
  process.exit(1);
}
