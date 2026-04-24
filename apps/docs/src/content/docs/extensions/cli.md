---
title: CLI
description: Command-line interface for Eidos Desktop
sidebar:
  order: 5
---

The `eidos` CLI provides a command-line interface for interacting with Eidos Desktop. It is designed for automation, AI agents, and power users who prefer terminal-based workflows.

:::tip
Eidos Desktop must be running for the CLI to work.
:::

## Design Philosophy

The CLI treats your Eidos space as a filesystem:

- **Documents** are files you can read (`cat`), create (`touch`), and modify (`append`)
- **Folders** are directories you can navigate (`ls`) and create (`mkdir`)
- **Tables** are queryable data stores accessible via SQL
- **External directories** can be mounted and accessed via `/@/<name>/` paths

This design allows you to use familiar Unix-style commands to manage your personal data.

## Installation

The CLI is bundled with Eidos Desktop:

1. Open Eidos Desktop
2. Press `Cmd/Ctrl + K` to open Command Palette
3. Type "install eidos" and select "Install 'eidos' command in PATH"

Verify with `eidos status`.

## Space Selection

The CLI automatically detects your space based on the current directory. When inside a space directory, commands automatically target that space.

For other locations, use the `-s <space>` flag to specify a space explicitly.

## Key Capabilities

### Filesystem-Style Operations

Manage nodes using familiar commands: `ls`, `cat`, `mkdir`, `touch`, `mv`, `rm`, `append`. Nodes are addressed by paths like `projects/roadmap` when name uniqueness is enabled.

### External Directory Mounts

Mount local directories to access them via `/@/<mount-name>/` paths within Eidos. This is useful for large files (media libraries, document collections) that you don't want to store in the synchronized `.eidos` directory.

### SQL Queries

Execute read-only SQL queries directly against your space's SQLite database for advanced data extraction.

### Extension Deployment

Deploy blocks and scripts from local files without using the GUI. The CLI detects file types (`.tsx` for JSX components, `.ts` for pure scripts) and handles compilation automatically.

### AI-Optimized Output

Use `--format json` for machine-readable output, enabling easy integration with AI agents and automation scripts.

## Documentation

- [CLI How-To Guide](../../how-to/use-cli/) - Common workflows and examples
- [CLI API Reference](../../api-reference/cli/) - Complete command reference
- [Node API Reference](../../api-reference/node/) - Understanding node structures
