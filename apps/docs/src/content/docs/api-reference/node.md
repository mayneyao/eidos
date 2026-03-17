---
title: Node API Reference
description: Unified API for managing nodes (documents, tables, folders, dataviews) in Eidos
sidebar:
  order: 3
---

The `eidos.space.node` object provides a unified, **semantic interface** for managing all node types in Eidos. With **name uniqueness enabled**, nodes can be addressed by human-readable paths like `folder/document` instead of just UUIDs.

```typescript
// Address nodes by path (requires name uniqueness)
// Paths are relative to space root, no "/" prefix needed
eidos.space.node.get("projects/roadmap")
eidos.space.node.create("projects/ideas/new-idea", "doc")
eidos.space.node.move("drafts/article", "published/article")

// Or use traditional IDs
eidos.space.node.getById("abc123")
```

## Core Concepts

### Node Types

| Type          | Description                    | Icon |
| ------------- | ------------------------------ | ---- |
| `doc`         | Document with markdown content | 📄   |
| `table`       | Structured data table          | 📊   |
| `folder`      | Container for organizing nodes | 📁   |
| `dataview`    | Saved query/dataview           | 👁   |
| `ext__{type}` | Extension-defined node types   | 🔌   |

### Path-Based Addressing

When name uniqueness is enabled, nodes can be addressed by paths relative to the space root:

- `folder` - A folder at root
- `folder/doc` - A document inside a folder
- `folder/subfolder/table` - Nested paths

:::tip
Path-based addressing requires **Node Name Uniqueness** to be enabled in space settings. Without it, use `getById()` instead.
:::

---

## Common Methods

### `get(path: string)`

Get a node by its path. Returns full node metadata.

```typescript
async get(path: string): Promise<Node | null>

interface Node {
  id: string
  name: string
  type: 'doc' | 'table' | 'folder' | 'dataview' | string
  parent_id: string | null
  created_at: string
  updated_at: string
  is_pinned: boolean
  is_deleted: boolean
  // Type-specific metadata
  metadata?: Record<string, any>
}
```

**Example:**

```typescript
const node = await eidos.space.node.get("projects/roadmap")
if (node) {
  console.log(`Found ${node.type}: ${node.name}`)
  console.log(`ID: ${node.id}`)
}
```

### `getById(id: string)`

Get a node by its UUID. Works regardless of name uniqueness setting.

```typescript
async getById(id: string): Promise<Node | null>
```

**Example:**

```typescript
const node = await eidos.space.node.getById("abc123def456")
```

### `list(path?: string)`

List child nodes at a path.

```typescript
async list(path?: string): Promise<Node[]>
```

**Parameters:**

- `path` (string, optional): Path to list. Defaults to root `/`.

**Example:**

```typescript
// List root nodes
const rootNodes = await eidos.space.node.list()

// List nodes in a folder
const docs = await eidos.space.node.list("projects")
docs.forEach((node) => {
  console.log(`${node.type}: ${node.name}`)
})
```

### `create(path: string, type: string, options?: object)`

Create a new node at the specified path.

```typescript
// Overloaded signatures
async create(path: string, type: 'folder', options?: FolderCreateOptions): Promise<Node>
async create(path: string, type: 'doc', options?: DocCreateOptions): Promise<Node>
async create(path: string, type: 'table', options?: TableCreateOptions): Promise<Node>
async create(path: string, type: 'dataview', options?: DataViewCreateOptions): Promise<Node>

interface FolderCreateOptions {
  /**
   * Automatically create intermediate parent folders if they don't exist.
   * @default true
   */
  recursive?: boolean
}

interface DocCreateOptions {
  content?: string           // Initial markdown content
  hideProperties?: boolean   // Hide properties panel
}

interface TableCreateOptions {
  schema?: TableSchema       // Initial table schema
  hideProperties?: boolean   // Hide properties panel
}

interface DataViewCreateOptions {
  query?: string             // Initial SQL query
  hideProperties?: boolean   // Hide properties panel
}
```

**Examples:**

```typescript
// Create a folder (automatically creates intermediate parent folders)
await eidos.space.node.create("projects/2025/q1", "folder")

// Create a document with content
await eidos.space.node.create("projects/readme", "doc", {
  content: "# Project README\n\nThis is the readme file.",
})

// Create a table
await eidos.space.node.create("projects/tasks", "table", {
  schema: {
    columns: [
      { name: "title", type: "title" },
      { name: "status", type: "select", options: ["todo", "done"] },
      { name: "due", type: "date" },
    ],
  },
})

// Create a dataview
await eidos.space.node.create("projects/active-tasks", "dataview", {
  query: "SELECT * FROM tasks WHERE status = 'todo'",
})
```

### `move(source: string, destination: string)`

Move or rename a node.

```typescript
async move(source: string, destination: string): Promise<Node>
```

**Example:**

```typescript
// Move to different folder
await eidos.space.node.move("drafts/article", "published/article")

// Rename in place
await eidos.space.node.move("projects/old-name", "projects/new-name")

// Move to root
await eidos.space.node.move("archive/2024/report", "report")
```

### `delete(path: string, options?: object)`

Delete a node.

```typescript
async delete(path: string, options?: DeleteOptions): Promise<void>

interface DeleteOptions {
  permanent?: boolean   // Default: false (move to trash)
  recursive?: boolean   // Default: false (required for folders)
}
```

**Example:**

```typescript
// Move to trash (default)
await eidos.space.node.delete("old-document")

// Permanently delete
await eidos.space.node.delete("sensitive-data", { permanent: true })

// Delete folder and all contents
await eidos.space.node.delete("old-project", { recursive: true })
```

### `exists(path: string)`

Check if a node exists at the given path.

```typescript
async exists(path: string): Promise<boolean>
```

**Example:**

```typescript
if (await eidos.space.node.exists("readme")) {
  console.log("Readme already exists")
} else {
  await eidos.space.node.create("readme", "doc")
}
```

---

## Type-Specific Operations

### Working with Documents

```typescript
// Read document content by path
const content = await eidos.space.doc.read("notes/idea")

// Write document content by path (overwrite)
await eidos.space.doc.write("notes/idea", "# Updated content")

// Append content to document
await eidos.space.doc.append("journal/daily", "\n## Evening\nWent for a walk.")

// Prepend content to document
await eidos.space.doc.prepend("notes/ideas", "# Ideas Collection\n\n")
```

### Working with Tables

```typescript
// Get table reference
const table = await eidos.space.node.get("projects/tasks")
const tableId = table.id

// Use table SDK
const rows = await eidos.currentSpace.table(tableId).rows.findMany({
  where: { status: "todo" },
})
```

### Working with Views

```typescript
// Create a dataview
const dataview = await eidos.space.node.create("dashboard/active", "dataview", {
  query: `SELECT title, status, due FROM tasks WHERE status != 'done'`,
})

// Refresh dataview results
const results = await eidos.space.dataView.refresh(dataview.id)
```

### Working with Extension Nodes

Extension nodes (`ext__{type}`) can store custom data using text or binary storage.

#### `getText(id: string)`

Get the text content of an extension node.

```typescript
async getText(id: string): Promise<string | null>
```

**Example:**

```typescript
const node = await eidos.space.node.get("diagrams/flowchart")
const textContent = await eidos.space.node.getText(node.id)
if (textContent) {
  const data = JSON.parse(textContent)
  console.log("Parsed data:", data)
}
```

#### `setText(id: string, text: string)`

Set the text content of an extension node.

```typescript
async setText(id: string, text: string): Promise<boolean>
```

**Example:**

```typescript
const node = await eidos.space.node.get("diagrams/flowchart")
const data = { elements: [], appState: {} }
await eidos.space.node.setText(node.id, JSON.stringify(data))
```

#### `getBlob(id: string)`

Get the binary data of an extension node.

```typescript
async getBlob(id: string): Promise<Buffer | null>
```

**Example:**

```typescript
const node = await eidos.space.node.get("drawings/sketch")
const blobData = await eidos.space.node.getBlob(node.id)
if (blobData) {
  console.log("Binary data size:", blobData.length)
}
```

#### `setBlob(id: string, blob: Buffer)`

Set the binary data of an extension node.

```typescript
async setBlob(id: string, blob: Buffer): Promise<boolean>
```

**Example:**

```typescript
const node = await eidos.space.node.get("drawings/sketch")
const buffer = Buffer.from("some binary data")
await eidos.space.node.setBlob(node.id, buffer)
```

---

## Advanced Methods

### `find(query: object)`

Search for nodes across the space.

```typescript
async find(query: FindQuery): Promise<Node[]>

interface FindQuery {
  name?: string           // Search by name (partial match)
  type?: string | string[] // Filter by type
  parent?: string         // Limit to specific parent path
  isDeleted?: boolean     // Include deleted nodes
}
```

**Example:**

```typescript
// Find all documents with "spec" in name
const specs = await eidos.space.node.find({
  name: "spec",
  type: "doc",
})

// Find all tables in a folder
const tables = await eidos.space.node.find({
  type: "table",
  parent: "projects",
})
```

### `duplicate(path: string, newPath?: string)`

Duplicate a node.

```typescript
async duplicate(path: string, newPath?: string): Promise<Node>
```

**Example:**

```typescript
// Duplicate with auto-generated name ("Document Copy")
await eidos.space.node.duplicate("templates/project")

// Duplicate with specific name
await eidos.space.node.duplicate("templates/project", "templates/project-v2")
```

### `resolvePath(path: string)`

Resolve a path to node ID (for debugging).

```typescript
async resolvePath(path: string): Promise<{ id: string; node: Node } | null>
```

**Example:**

```typescript
const resolved = await eidos.space.node.resolvePath("projects/roadmap")
if (resolved) {
  console.log(`Path resolves to: ${resolved.id}`)
}
```

---

## Error Handling

Common errors and how to handle them:

```typescript
try {
  await eidos.space.node.create("existing-path", "doc")
} catch (error) {
  if (error.message.includes("already exists")) {
    // Handle duplicate name
    console.log("Node already exists, updating instead...")
  }
}

try {
  await eidos.space.node.move("a", "b/c")
} catch (error) {
  if (error.message.includes("parent not found")) {
    // Parent path doesn't exist
    console.log("Creating parent folder...")
    await eidos.space.node.create("b", "folder")
    await eidos.space.node.move("a", "b/c")
  }
}
```

---

## CLI Equivalents

The Node API is designed to match the CLI commands:

| CLI Command        | SDK Equivalent                                       |
| ------------------ | ---------------------------------------------------- |
| `eidos ls path`    | `eidos.space.node.list("path")`                      |
| `eidos cat path`   | `eidos.space.node.get("path")` + type-specific fetch |
| `eidos mkdir path` | `eidos.space.node.create("path", "folder")`          |
| `eidos touch path` | `eidos.space.node.create("path", "doc")`             |
| `eidos mv a b`     | `eidos.space.node.move("a", "b")`                    |
| `eidos rm path`    | `eidos.space.node.delete("path")`                    |
