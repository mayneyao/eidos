.PHONY: build release install test clean dev fmt lint completions

# Default target
all: build

# Build in debug mode
build:
	cargo build

# Build in release mode (optimized)
release:
	cargo build --release

# Install locally (requires cargo install)
install:
	cargo install --path .

# Run tests
test:
	cargo test

# Format code
fmt:
	cargo fmt

# Run clippy linting
lint:
	cargo clippy -- -D warnings

# Check for errors without building
check:
	cargo check

# Clean build artifacts
clean:
	cargo clean

# Run in development mode with args
# Usage: make dev ARGS="status"
dev:
	cargo run -- $(ARGS)

# Generate shell completions
completions:
	mkdir -p completions
	cargo run -- completions bash > completions/eidos.bash
	cargo run -- completions zsh > completions/_eidos
	cargo run -- completions fish > completions/eidos.fish
	cargo run -- completions powershell > completions/_eidos.ps1

# Watch for changes and rebuild
watch:
	cargo watch -x build

# Run all checks before commit
ci: fmt lint test
	@echo "All checks passed!"
