---
title: CLI
description: Command-line interface for Eidos Desktop
sidebar:
  order: 5
  badge: New
---

The `eidos` CLI provides a powerful, developer-friendly command-line interface for interacting with Eidos Desktop. It is designed for automation, AI agents, and power users who prefer the terminal for fast data operations and extension management.

:::tip
Eidos Desktop must be running for the CLI to interact with your data.
:::

## Key Features

- **Filesystem-style Commands**: Manage documents and folders using familiar commands like `ls`, `cat`, `mkdir`, `touch`, `mv`, and `rm`.
- **Path-based Addressing**: Address any node using its semantic path (e.g., `projects/roadmap`) when name uniqueness is enabled.
- **AI-Optimized**: Supports `--format json` for easy parsing by AI agents and scripts.
- **Extension Deployment**: Deploy blocks and scripts directly from your local filesystem.
- **Raw SQL Access**: Execute queries directly against your space's SQLite database.

## Installation & Setup

Download the pre-compiled binary for your platform from the [GitHub Releases](https://github.com/mayneyao/eidos/releases) and add it to your system PATH.

Check connection status:

```bash
eidos status
```

## Space Management

Before performing data operations, you must select an active space.

```bash
# List available spaces
eidos space list

# Switch to a specific space
eidos space use my-workspace

# Show current space info
eidos space info

# Open space in default browser
eidos space open
```

## Node Operations (FS-style)

Eidos CLI treats your space like a filesystem. Documents and tables are nodes in a tree.

### `ls [path]`

List child nodes at a path.

```bash
# List root nodes
eidos ls

# List nodes in a folder with details
eidos ls projects --long
```

### `touch <path>`

Create a document.

```bash
# Create empty document
eidos touch notes/meeting-notes

# Create with content
eidos touch notes/idea --content "# My Idea\nThis is a great idea."

# Pipe content from another command
cat draft.md | eidos touch papers/final
```

### `cat <path>`

View node content.

```bash
# View document markdown
eidos cat notes/idea

# View table data as CSV-style table
eidos cat database/users
```

### `mkdir <path>`

Create a folder.

```bash
eidos mkdir archive/2024/january
```

### `mv <src> <dst>`

Move or rename a node.

```bash
# Rename
eidos mv notes/idea notes/archived-idea

# Move to different folder
eidos mv notes/archived-idea archive/2024/
```

### `rm <path>`

Delete a node.

```bash
# Move to trash
eidos rm old-doc

# Permanently delete recursively (be careful!)
eidos rm -f -r archive/2023
```

## Extension Management

Deploy and manage extensions without touching the GUI.

```bash
# Deploy a component from source with a specific slug
eidos ext deploy ./my-block.tsx --slug my-custom-view

# Force update an existing extension
eidos ext deploy ./my-block.tsx --force

# List installed extensions
eidos ext list

# Enable/Disable extension
eidos ext enable <ext-id>
eidos ext disable <ext-id>
```

## Scripting & AI Integration

The CLI is designed to be bridged with other tools.

### JSON Output

Use the `--format json` or `-f json` flag to get machine-readable output:

```bash
eidos ls -f json
```

### SQL Execution

Run raw SQL queries for complex data extraction:

```bash
eidos sql "SELECT title FROM users WHERE status = 'active' LIMIT 5"
```

### Shell Completions

Generate completion scripts for your shell:

```bash
eidos completions zsh > ~/.zsh/completion/_eidos
```

## Learn More

- [CLI API Reference](../../api-reference/cli/) - Complete command reference
- [API Reference: Node API](../../api-reference/node/) - Understanding node structures
- [How-to: Deploy Extensions](../../how-to/deploy-extensions/) - Practical extension development guide
