---
title: CLI Reference
description: Complete command reference for the Eidos CLI
sidebar:
  order: 6
---

Complete command reference for the `eidos` CLI.

## Global Options

| Option                 | Description                                      |
| ---------------------- | ------------------------------------------------ |
| `-s, --space <id>`     | Target space ID (optional if in space directory) |
| `-e, --endpoint <url>` | Eidos Desktop endpoint                           |
| `-h, --help`           | Show help                                        |
| `-V, --version`        | Show version                                     |

## Node Commands (Filesystem Style)

With name uniqueness enabled, nodes can be addressed by paths like `/folder/document`.

### `ls [path]`

List nodes at the specified path.

```bash
eidos ls              # List root nodes
eidos ls /projects    # List nodes in folder
eidos ls -l           # Long format with IDs
```

**Options:**

| Option       | Description                                 |
| ------------ | ------------------------------------------- |
| `-l, --long` | Show detailed info (ID, type, created time) |

### `cat <path>`

View node content.

```bash
eidos cat /readme                 # View document markdown
eidos cat /projects/tasks         # View table as JSON
eidos cat /dashboard/active-view  # View dataview results
```

### `mkdir <path>`

Create a folder.

```bash
eidos mkdir /projects
eidos mkdir /projects/2024/q1
```

**Note:** Will fail if a node with the same name already exists at the path.

### `touch <path>`

Create a document.

```bash
eidos touch /notes/ideas
eidos touch /projects/readme
```

**Options:**

| Option                 | Description              |
| ---------------------- | ------------------------ |
| `-c, --content <text>` | Initial document content |

**Piping Content:**

```bash
# Create from file
cat readme.md | eidos touch /projects/readme

# Create from echo
echo "# Hello World" | eidos touch /notes/hello

# Create from command output
date | eidos touch /daily/now

# Or use --content flag
eidos touch /notes/ideas --content "# My Ideas"
```

**Note:** Will fail if a node with the same name already exists at the path.

### `mv <source> <destination>`

Move or rename a node.

```bash
# Rename
eidos mv /drafts/article /drafts/final-article

# Move to different folder
eidos mv /drafts/article /published/article

# Move to root
eidos mv /archive/2024/report /report
```

### `append <path>`

Append content to an existing document.

```bash
# Append from string
eidos append /notes/daily --content "## Evening notes"

# Append from stdin (pipe)
echo "New line" | eidos append /notes/log
cat footer.md | eidos append /projects/readme

# Append command output
date | eidos append /journal/activity
```

**Note:** The document must exist. Use `touch` to create first if needed.

### `rm <path>`

Delete a node.

```bash
eidos rm /old-document              # Soft delete (move to trash)
eidos rm /sensitive -f              # Permanent delete
eidos rm /old-folder -r             # Delete folder recursively
eidos rm /sensitive-folder -rf      # Force + recursive
```

**Options:**

| Option            | Description                   |
| ----------------- | ----------------------------- |
| `-f, --force`     | Permanent delete (skip trash) |
| `-r, --recursive` | Required for deleting folders |

### `sql <query>`

Execute SQL query.

```bash
eidos sql "SELECT * FROM eidos__tree WHERE type = 'doc'"
eidos sql "SELECT title, status FROM tb_abc123 WHERE status = 'todo'"
```

## Space Commands

### `space list`

List all registered spaces.

```bash
eidos space list
```

### `space use <id>`

Set the current space.

```bash
eidos space use my-space
```

### `space open [id]`

Open a space in Eidos Desktop.

```bash
eidos space open              # Open current space
eidos space open my-space     # Open specific space
```

### `space add <id> <endpoint>`

Add a new space.

```bash
eidos space add my-workspace http://127.0.0.1:13127
```

### `space remove <id>`

Remove a space from registry.

```bash
eidos space remove old-space
```

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

### `ext list`

List all extensions.

```bash
eidos ext list
```

### `ext enable <id>`

Enable an extension.

```bash
eidos ext enable my-extension
```

### `ext disable <id>`

Disable an extension.

```bash
eidos ext disable my-extension
```

### `ext delete <id>`

Delete an extension.

```bash
eidos ext delete my-extension
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

## Environment Variables

| Variable         | Description                | Default                  |
| ---------------- | -------------------------- | ------------------------ |
| `EIDOS_ENDPOINT` | Desktop RPC endpoint       | `http://127.0.0.1:13127` |
| `EIDOS_SPACE`    | Default space ID           | -                        |
| `EIDOS_API_KEY`  | API key for authentication | -                        |

## Examples

### Working with Documents

```bash
# Create and view a document
eidos touch /notes/ideas
eidos cat /notes/ideas

# Move document to different folder
eidos mkdir /archive
eidos mv /notes/ideas /archive/ideas
```

### Working with Tables

```bash
# Query table data with SQL
eidos sql "SELECT * FROM tb_xxx WHERE status = 'todo'"
```

### Batch Operations

```bash
# Create folder structure
eidos mkdir /projects
eidos mkdir /projects/2024
eidos touch /projects/2024/roadmap
eidos touch /projects/2024/milestones
```
