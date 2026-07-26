.PHONY: build release install test clean dev fmt lint check watch ci

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
	cargo test --workspace

# Format code
fmt:
	cargo fmt --all

# Run clippy linting
lint:
	cargo clippy --workspace --all-targets -- -D warnings

# Check for errors without building
check:
	cargo check --workspace

# Clean build artifacts
clean:
	cargo clean

# Run in development mode with args
# Usage: make dev ARGS="tracker.eidos inspect"
dev:
	cargo run -- $(ARGS)

# Watch for changes and rebuild
watch:
	cargo watch -x build

# Run all checks before commit
ci: fmt lint test
	@echo "All checks passed!"
