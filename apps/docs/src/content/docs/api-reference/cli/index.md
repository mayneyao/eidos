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
| `-f, --format`     | Output format: `table` (default) or `json`       |
| `-h, --help`       | Show help                                        |
| `-V, --version`    | Show version                                     |

## Node Commands

### `ls [path]`

List nodes at the specified path.

```bash
eidos ls [path] [options]
```

**Options:**

| Option       | Description                                 |
| ------------ | ------------------------------------------- |
| `-l, --long` | Show detailed info (ID, type, created time) |

### `cat <path>`

View document content (markdown output).

```bash
eidos cat <path>
```

**Note:** Only works with documents. Use `sql` for table data.

### `mkdir <path>`

Create a folder.

```bash
eidos mkdir <path>
```

### `touch <path>`

Create a document.

```bash
eidos touch <path> [options]
```

**Options:**

| Option                 | Description              |
| ---------------------- | ------------------------ |
| `-c, --content <text>` | Initial document content |

**Piping:**

```bash
cat file.md | eidos touch notes/doc
echo "text" | eidos touch notes/doc
```

### `mv <source> <destination>`

Move or rename a node.

```bash
eidos mv <source> <destination>
```

### `append <path>`

Append content to a document.

```bash
eidos append <path> [options]
```

**Options:**

| Option                 | Description       |
| ---------------------- | ----------------- |
| `-c, --content <text>` | Content to append |

**Piping:**

```bash
echo "text" | eidos append notes/doc
```

### `rm <path>`

Delete a node.

```bash
eidos rm <path> [options]
```

**Options:**

| Option            | Description                   |
| ----------------- | ----------------------------- |
| `-f, --force`     | Permanent delete (skip trash) |
| `-r, --recursive` | Required for folders          |

## Query Commands

### `sql <query>`

Execute read-only SQL queries.

```bash
eidos sql "SELECT * FROM eidos__tree WHERE type = 'doc'"
```

:::caution
**Read-only only.** Do not use `INSERT`, `UPDATE`, or `DELETE` - they bypass transaction handling.
:::

## Table Commands

### `table ls`

List all tables.

```bash
eidos table ls [options]
```

**Options:**

| Option       | Description    |
| ------------ | -------------- |
| `-l, --long` | Show table IDs |

### `table schema <table-id>`

Show table schema.

```bash
eidos table schema <table-id>
```

**Output columns:**

| Column       | Description                            |
| ------------ | -------------------------------------- |
| `Name`       | Field display name                     |
| `ColumnName` | Database column name (for SQL)         |
| `Type`       | Field type                             |
| `Property`   | Formula expression (formula type only) |

## Mount Commands

### `mount`

List all mounts (default).

```bash
eidos mount
eidos mount -l
```

### `mount <name> <path>`

Mount a directory.

```bash
eidos mount <name> <path>
```

**Path handling:**

- `~` expands to home directory
- Relative paths resolve to absolute
- Directory must exist

**Access pattern:** `/@/<name>/filename`

### `mount -u <name>`

Unmount a directory.

```bash
eidos mount -u <name>
```

## Extension Commands

### `ext deploy <path>`

Deploy an extension.

```bash
eidos ext deploy <path> [options]
```

**Options:**

| Option          | Description                              |
| --------------- | ---------------------------------------- |
| `--slug <slug>` | Update existing extension with this slug |

**File extensions:**

- `.tsx` — Block with JSX components
- `.ts` — Pure TypeScript script

### `ext ls`

List extensions.

```bash
eidos ext ls
```

### `ext rm <id>`

Delete an extension.

```bash
eidos ext rm <id>
```

## Space Commands

### `space ls`

List all spaces.

```bash
eidos space ls
```

### `space open [id]`

Open space in Eidos Desktop.

```bash
eidos space open
eidos space open <id>
```

## Other Commands

### `status`

Check connection to Eidos Desktop.

```bash
eidos status
```

### `completions <shell>`

Generate shell completions.

```bash
eidos completions bash
eidos completions zsh
eidos completions fish
```
