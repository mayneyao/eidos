# Eidos CLI (Rust)

AI Agent friendly command-line interface for Eidos.

## Overview

This CLI is designed for AI Agents (like Claude Code) and developers to interact with Eidos Desktop through a simple command-line interface. Unlike the previous headless implementation, this version **requires Eidos Desktop to be running** as the backend.

## Features

- **Auto Space Detection**: Automatically detects space from current directory
- **Filesystem-style Commands**: Manage nodes using familiar Unix commands
- **Table Operations**: Query, create, update, delete table rows
- **Document Management**: Create, edit, search documents
- **AI-Optimized Output**: Structured output with tables and JSON support

## Installation

The CLI binary is bundled with Eidos Desktop. No separate download needed.

### Install via Command Palette

1. Open Eidos Desktop
2. Press `Cmd/Ctrl + K` to open Command Palette
3. Type "install eidos" and select "Install 'eidos' command in PATH"
4. The CLI will be added to your system PATH

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
# When inside a space directory, CLI automatically uses that space
eidos ls                      # List all nodes
eidos cat readme              # View document content
eidos mkdir projects          # Create folder
eidos touch notes/ideas       # Create document

# Otherwise, specify space with -s flag
eidos -s my-space ls
eidos -s my-space cat readme

# Query tables with SQL
eidos sql "SELECT * FROM eidos__tree WHERE type = 'doc'"
```

### Space Selection

The CLI automatically detects the space to use:

1. **Auto-detection** (recommended): When inside a space directory, CLI automatically uses that space
2. **Explicit flag**: Use `-s <space>` to specify a space

```bash
# Auto-detect from current directory
cd /path/to/my-space
eidos ls

# Explicit space selection
eidos -s my-space ls
eidos -s my-space cat readme
```

## Commands

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
# Check if Eidos is available and auto-detect space
if eidos status; then
    # List nodes in current space
    eidos ls

    # Query data
    eidos sql "SELECT * FROM mytable WHERE status = 'todo'"

    # Create document
    eidos touch notes/meeting-notes --content "# Meeting Notes"
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
