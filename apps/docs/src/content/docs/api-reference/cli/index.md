---
title: CLI Reference
description: Complete command reference for the Eidos CLI
sidebar:
  order: 6
---

Complete command reference for the `eidos` CLI.

## Global Options

| Option             | Description                                      |
| ------------------ | ------------------------------------------------ |
| `-s, --space <id>` | Target space ID (optional if in space directory) |
| `-h, --help`       | Show help                                        |
| `-V, --version`    | Show version                                     |

## Space Selection

The CLI automatically detects which space to use:

1. **Auto-detection** (recommended): When inside a space directory, the CLI automatically uses that space
2. **Explicit flag**: Use `-s <space>` or `--space <space>` to specify a space

```bash
# Inside a space directory - auto-detected
cd /path/to/my-space
eidos ls
eidos cat readme

# Outside a space directory - explicit selection
eidos -s my-space ls
eidos --space my-space cat readme
```

## Node Commands (Filesystem Style)

With name uniqueness enabled, nodes can be addressed by paths like `/folder/document`.

### `ls [path]`

List nodes at the specified path.

```bash
eidos ls              # List root nodes
eidos ls projects     # List nodes in folder
eidos ls -l           # Long format with IDs
```

**Options:**

| Option       | Description                                 |
| ------------ | ------------------------------------------- |
| `-l, --long` | Show detailed info (ID, type, created time) |

### `cat <path>`

View document content (markdown output).

```bash
eidos cat readme                 # View document markdown
eidos cat notes/ideas             # View document content
```

**Note:** `cat` only works with documents. Use `sql` for querying table data.

### `mkdir <path>`

Create a folder.

```bash
eidos mkdir projects
eidos mkdir projects/2024/q1
```

**Note:** Will fail if a node with the same name already exists at the path.

### `touch <path>`

Create a document.

```bash
eidos touch notes/ideas
eidos touch projects/readme
```

**Options:**

| Option                 | Description              |
| ---------------------- | ------------------------ |
| `-c, --content <text>` | Initial document content |

**Piping Content:**

```bash
# Create from file
cat readme.md | eidos touch projects/readme

# Create from echo
echo "# Hello World" | eidos touch notes/hello

# Create from command output
date | eidos touch daily/now

# Or use --content flag
eidos touch notes/ideas --content "# My Ideas"
```

**Note:** Will fail if a node with the same name already exists at the path.

### `mv <source> <destination>`

Move or rename a node.

```bash
# Rename
eidos mv drafts/article drafts/final-article

# Move to different folder
eidos mv drafts/article published/article

# Move to root
eidos mv archive/2024/report report
```

### `append <path>`

Append content to an existing document.

```bash
# Append from string
eidos append notes/daily --content "## Evening notes"

# Append from stdin (pipe)
echo "New line" | eidos append notes/log
cat footer.md | eidos append projects/readme

# Append command output
date | eidos append journal/activity
```

**Note:** The document must exist. Use `touch` to create first if needed.

### `rm <path>`

Delete a node.

```bash
eidos rm old-document              # Soft delete (move to trash)
eidos rm sensitive -f              # Permanent delete
eidos rm old-folder -r             # Delete folder recursively
eidos rm sensitive-folder -rf      # Force + recursive
```

**Options:**

| Option            | Description                   |
| ----------------- | ----------------------------- |
| `-f, --force`     | Permanent delete (skip trash) |
| `-r, --recursive` | Required for deleting folders |

## Query Commands

### `sql <query>`

Execute SQL query directly against the SQLite database for **read-only operations**.

```bash
eidos sql "SELECT * FROM eidos__tree WHERE type = 'doc'"
eidos sql "SELECT title, status FROM tb_abc123 WHERE status = 'todo'"
```

:::caution
**Important**: This command is for `SELECT` queries only. Do not use `INSERT`, `UPDATE`, or `DELETE` statements as they bypass Eidos' transaction handling and can lead to data corruption. Use the appropriate CLI commands (`touch`, `mkdir`, `mv`, `rm`) or Desktop app for data modifications.
:::

## Table Commands

### `table ls`

List all tables in the current space.

```bash
eidos table ls         # Simple list
eidos table ls -l      # Detailed list with IDs
```

### `table schema <table-id>`

Show the schema of a table, including field names, column names, types, and formula properties.

```bash
eidos table schema tb_abc123
```

**Output columns:**

| Column       | Description                                      |
| ------------ | ------------------------------------------------ |
| `Name`       | Field display name                               |
| `ColumnName` | Database column name (for SQL queries)           |
| `Type`       | Field type (text, number, select, formula, etc.) |
| `Property`   | Formula expression (only shown for formula type) |

## Extension Commands

### `ext deploy <path>`

Deploy an extension from a file.

```bash
# Deploy a block with UI components (JSX supported)
eidos ext deploy ./my-view.tsx

# Deploy a pure TypeScript script (no JSX)
eidos ext deploy ./my-script.ts

# Update an existing extension by slug
eidos ext deploy ./my-view.tsx --slug my-existing-slug
```

**Options:**

| Option          | Description                              |
| --------------- | ---------------------------------------- |
| `--slug <slug>` | Update existing extension with this slug |

**File Extensions:**

The file extension determines how the code is parsed:

| Extension | Mode             | Use Case                                                              |
| --------- | ---------------- | --------------------------------------------------------------------- |
| `.tsx`    | JSX + TypeScript | Blocks with UI components (supports generics like `useState<T[]>()` ) |
| `.ts`     | Pure TypeScript  | Scripts without JSX (table actions, doc actions, tools, etc.)         |

### `ext ls`

List all extensions.

```bash
eidos ext ls
```

### `ext rm <id>`

Delete an extension.

```bash
eidos ext rm my-extension
```

## Other Commands

### `status`

Check connection to Eidos Desktop.

```bash
eidos status
```

**Output:**

```
✓ Connected to Eidos Desktop (v0.5.0)
  Space: my-space
```

### `completions <shell>`

Generate shell completions.

```bash
eidos completions bash
eidos completions zsh
eidos completions fish
```

## Examples

### Working with Documents

```bash
# Create and view a document
eidos touch notes/ideas
eidos cat notes/ideas

# Move document to different folder
eidos mkdir archive
eidos mv notes/ideas archive/ideas
```

### Working with Tables

```bash
# Query table data with SQL
eidos sql "SELECT * FROM tb_xxx WHERE status = 'todo'"
```

### Batch Operations

```bash
# Create folder structure
eidos mkdir projects
eidos mkdir projects/2024
eidos touch projects/2024/roadmap
eidos touch projects/2024/milestones
```
