# Eidos CLI (Rust)

AI Agent friendly command-line interface for Eidos.

## Overview

This CLI is designed for AI Agents (like Claude Code) and developers to interact with Eidos Desktop through a simple command-line interface. Unlike the previous headless implementation, this version **requires Eidos Desktop to be running** as the backend.

## Features

- **Space Management**: List, switch between, and open spaces
- **Table Operations**: Query, create, update, delete table rows
- **Document Management**: Create, edit, search documents
- **AI-Optimized Output**: Structured output with tables and JSON support

## Installation

### From Source

```bash
cd apps/cli
cargo build --release

# Binary will be at target/release/eidos
```

### Shell Completion

```bash
# Generate completion scripts
eidos completions bash > /usr/local/share/bash-completion/completions/eidos
eidos completions zsh > /usr/share/zsh/site-functions/_eidos
eidos completions fish > ~/.config/fish/completions/eidos.fish
```

## Usage

### Prerequisites

Eidos Desktop must be running. Check status with:

```bash
eidos status
```

### Quick Start

```bash
# List all spaces
eidos space list

# Set current space
eidos space use my-space

# List tables in current space
eidos table list

# Query a table
eidos table query posts --limit 10

# List documents
eidos doc list

# Search documents
eidos doc search "meeting notes"
```

### Environment Variables

| Variable         | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `EIDOS_ENDPOINT` | Eidos Desktop endpoint (default: http://localhost:13128) |
| `EIDOS_SPACE`    | Default space ID                                         |
| `EIDOS_API_KEY`  | API key for authentication                               |

### Global Flags

```bash
eidos --endpoint http://localhost:13128 --space my-space table list
eidos -s my-space doc list
eidos --format json table query users
```

## Commands

### Space

```bash
eidos space list              # List all spaces
eidos space info              # Show current space info
eidos space info <space-id>   # Show specific space info
eidos space use <space-id>    # Set current space
eidos space open              # Open current space in browser
eidos space open <space-id>   # Open specific space
```

### Table

```bash
# List tables
eidos table list

# Query with filter
eidos table query posts --filter '{"published":true}' --limit 20

# Get single row
eidos table get users <row-id>

# Create row
eidos table create users '{"name":"John","email":"john@example.com"}'

# Update row
eidos table update users <row-id> '{"name":"Jane"}'

# Delete row
eidos table delete users <row-id>

# Show schema
eidos table schema users
```

### Filesystem-style Commands

Eidos CLI provides Unix-like commands to navigate and manage nodes:

```bash
# List nodes (like ls)
eidos ls                    # List root
eidos ls <path>             # List specific folder
eidos ls -l                 # Long format with IDs

# View document content (like cat)
eidos cat <doc-path>        # Output document markdown content

# Create folder (like mkdir)
eidos mkdir <path>

# Create document (like touch)
eidos touch <path> [--content "text"]

# Move/rename node (like mv)
eidos mv <src> <dst>

# Append to document
eidos append <path> [--content "text"]

# Delete node (like rm)
eidos rm <path>
eidos rm -r <folder>        # Remove folder recursively
eidos rm -f <path>          # Permanent delete

# Execute SQL query
eidos sql "SELECT * FROM mytable"
```

### Document (Legacy)

```bash
# List documents
eidos doc list
eidos doc list --parent <folder-id>

# Get document
eidos doc get <doc-id>

# Create document
eidos doc create "My Title" --content "Hello World"

# Update document
eidos doc update <doc-id> --title "New Title" --content "Updated content"

# Delete document
eidos doc delete <doc-id>

# Search documents
eidos doc search "keyword"
```

## For AI Agents

This CLI is optimized for AI agent usage:

1. **Structured Output**: Tables are formatted for easy parsing
2. **JSON Mode**: Use `--format json` for programmatic output
3. **Error Handling**: Clear error messages with suggestions
4. **Exit Codes**: Non-zero exit codes on failure for script integration

Example agent workflow:

```bash
# Check if Eidos is available
if eidos status; then
    # Use current space or set one
    eidos space use my-project

    # Query data
    eidos table query tasks --filter '{"status":"todo"}' --format json

    # Create document
    eidos doc create "Meeting Notes" --content "..."
fi
```

## Development

```bash
# Run in development
cargo run -- status
cargo run -- space list
cargo run -- table list

# Run tests
cargo test

# Build release
cargo build --release
```

## Architecture

```
src/
├── main.rs          # CLI entry point
├── config.rs        # Configuration management
├── client.rs        # HTTP RPC client
└── commands/
    ├── mod.rs       # Command dispatcher
    ├── space.rs     # Space commands
    ├── table.rs     # Table operations
    ├── doc.rs       # Document operations
    └── status.rs    # Status check
```

## License

AGPL-3.0
