---
title: Space API Reference
description: Complete API reference for Eidos Space functionality
sidebar:
  order: 4
---

The `eidos.space` object provides access to all data space functionality including navigation, document management, and extension node operations.

:::tip
`eidos.space` exposes many more interfaces than documented here. However, for stability, please try to use the interfaces mentioned in the documentation. We will gradually evaluate which methods can be exposed.
:::

---

## Common Methods

### `navigate(path: string, options?)`

Navigate to a node within the current space.

```typescript
navigate(path: string, options?: { target?: "_blank" | "_self" }): void
```

**Parameters:**

- `path` (string): The path to navigate to, relative to the current space
- `options` (object, optional): Navigation options
  - `target` (string, optional): Where to open the navigation target
    - `"_self"` (default): Open in the current tab
    - `"_blank"`: Open in a new tab

**Supported Path Formats:**

- `"/<nodeId>"` - Navigate to a specific node by ID
- `"/<tableId>"` - Navigate to a table view
- `"/<docId>#<hash>"` - Navigate to a document (supports hash anchors, e.g., `#title`)
- `"/2025-09-30"` - Navigate to a date-based node
- `"/extensions/<extensionId>"` - Navigate to an extension
- `"/blocks/<blockId>"` - Navigate to a block
- `"/file-handler/#<filePath>"` - Navigate to a file handler

**Example:**

```typescript
// Navigate to a specific table
eidos.space.navigate("/table_123")

// Navigate to a document
eidos.space.navigate("/doc_456")

// Navigate to a specific title in a document
eidos.space.navigate("/doc_456#my-title")

// Navigate to today's page
const today = new Date().toISOString().split("T")[0]
eidos.space.navigate(`/${today}`)

// Navigate to an extension
eidos.space.navigate("/extensions/my-extension")

// Navigate to a block
eidos.space.navigate("/blocks/block_789")

// Navigate to a file handler (open a file in the project folder)
eidos.space.navigate("/file-handler/#~/readme.md")

// Navigate to a file handler (open a file in a mounted folder)
eidos.space.navigate("/file-handler/#@/music/song.mp3")

// Open in a new tab
eidos.space.navigate("/doc_456", { target: "_blank" })
```

### `notify(msg: string)`

Show a notification to the user with markdown support. Supports advanced interactions via buttons.

```typescript
// Simple mode: pass a string as notification content
notify(msg: string): void

// Full mode: pass an object to customize title and content
notify(msg: {
  title: string
  description: string
  actions?: Array<{
    label: string
    action: "reload" | "dismiss"
    variant?: "primary" | "secondary"
  }>
}): void
```

**Parameters:**

- `msg` (string | object): Notification message
  - **Simple mode**: Pass a string, which will be displayed as notification content with default title "Notification"
  - **Full mode**: Pass an object containing:
    - `title` (string): The notification title
    - `description` (string): The notification description (supports markdown)
    - `actions` (Array): Optional interactive buttons
      - `label` (string): Button text
      - `action` (string): Action to perform: `"reload"` (refresh page) or `"dismiss"` (close notification)
      - `variant` (string): Button style: `"primary"` (solid) or `"secondary"` (outline)

**Examples:**

```typescript
// Simple mode - quick notification
eidos.space.notify("Operation completed")

// Full mode - custom title and content
eidos.space.notify({
  title: "Task Completed",
  description:
    "Successfully processed **100 records** and updated the database.",
})

// With interactive actions
eidos.space.notify({
  title: "Update Available",
  description:
    "A new version is available. Would you like to refresh the page?",
  actions: [
    { label: "Later", action: "dismiss", variant: "secondary" },
    { label: "Refresh Now", action: "reload", variant: "primary" },
  ],
})
```

---

## Node API

The `eidos.space.node` object provides a unified interface for managing all node types (documents, tables, folders, dataviews, and extension nodes) with path-based addressing.

See [Node API Reference](./node/) for complete documentation.

**Quick Examples:**

```typescript
// Get node by path
const node = await eidos.space.node.get("projects/roadmap")

// Create a document
await eidos.space.node.create("notes/idea", "doc", {
  content: "# My Idea",
})

// Move or rename
await eidos.space.node.move("drafts/article", "published/article")

// Delete
await eidos.space.node.delete("old-document")
```

---

## Table API

Table operations have been moved to their own focused pages.

- [Table SDK (CRUD)](../table/sdk/): findMany, create, update, delete, etc.
- [Schema Management](../table/schema/): createTable, addField, createView, etc.
- [Field Objects](../table/fields/): Field type references and properties.
- [View Objects](../table/views/): View type references and properties.

---

## Document API

The `eidos.space.doc` object provides document content management functionality.

:::tip[Addressing by Path]
With name uniqueness enabled, documents can be addressed by path:

```typescript
await eidos.space.doc.read("notes/idea")
await eidos.space.doc.write("notes/idea", "# Content")
```

:::

### Content Operations (Path-based)

#### `read(path: string)`

Read document content by path. Returns markdown.

```typescript
async read(path: string): Promise<string>
```

**Example:**

```typescript
// Read document content
const content = await eidos.space.doc.read("notes/ideas")
console.log(content)
```

#### `write(path: string, markdown: string)`

Write document content by path (overwrites existing content).

```typescript
async write(path: string, markdown: string): Promise<void>
```

**Example:**

```typescript
// Write content to document
await eidos.space.doc.write("notes/ideas", "# My Ideas\n\n- Idea 1")

// Create with content via node.create
await eidos.space.node.create("notes/new-doc", "doc", {
  content: "# Initial content",
})
```

#### `append(path: string, markdown: string)`

Append content to document by path.

```typescript
async append(path: string, markdown: string): Promise<void>
```

**Example:**

```typescript
// Append to daily log
await eidos.space.doc.append("journal/daily", "\n## Evening\nWent for a walk.")

// Append command output
const output = await eidos.space.exec("some command")
await eidos.space.doc.append("logs/output", output)
```

#### `prepend(path: string, markdown: string)`

Prepend content to document by path.

```typescript
async prepend(path: string, markdown: string): Promise<void>
```

**Example:**

```typescript
// Add header to existing document
await eidos.space.doc.prepend("notes/ideas", "# Ideas Collection\n\n")

// Add timestamp to log
await eidos.space.doc.prepend(
  "logs/activity",
  `[${new Date().toISOString()}] Started\n`
)
```

### Content Operations (ID-based)

#### `getMarkdown(id: string)`

Get the Markdown content of a document by ID.

```typescript
async getMarkdown(id: string): Promise<string>
```

**Example:**

```typescript
const markdown = await eidos.space.doc.getMarkdown("doc_123")
console.log("Markdown content:", markdown)
```

### Document Properties

#### `getProperties(id: string)`

Get all properties of a document (including system properties and custom properties).

```typescript
async getProperties(id: string): Promise<Record<string, any>>
```

**Example:**

```typescript
const allProps = await eidos.space.doc.getProperties("doc_123")
console.log("All properties:", allProps)
```

#### `setProperties(id: string, properties: Record<string, any>)`

Set properties of a document.

```typescript
async setProperties(id: string, properties: Record<string, any>): Promise<{ success: boolean; message?: string; updatedProperties?: string[] }>
```

**Example:**

```typescript
const result = await eidos.space.doc.setProperties("doc_123", {
  title: "My Document",
  author: "John Doe",
  tags: "important,work",
})

if (result.success) {
  console.log("Properties set successfully:", result.updatedProperties)
}
```

#### `deleteProperty(propertyName: string)`

Delete the specified property column.

```typescript
async deleteProperty(propertyName: string): Promise<void>
```

**Example:**

```typescript
await eidos.space.doc.deleteProperty("old_property")
console.log("Property deleted")
```

---

## Theme API

The `eidos.space.theme` object provides theme management functionality for customizing the appearance of your space.

Themes are stored as CSS files in `<space>/.eidos/themes/<name>/theme.css`.

**Theme CSS Example:**

```css
/* Define CSS variables for light mode */
:root {
  --background: hsl(0 0% 100%);
  --foreground: hsl(222.2 84% 4.9%);
  --primary: hsl(222.2 47.4% 11.2%);
  --primary-foreground: hsl(210 40% 98%);
  /* ... more variables */
}

/* Define CSS variables for dark mode */
.dark {
  --background: hsl(222.2 84% 4.9%);
  --foreground: hsl(210 40% 98%);
  --primary: hsl(210 40% 98%);
  --primary-foreground: hsl(222.2 47.4% 11.2%);
  /* ... more variables */
}
```

### `list()`

List all available theme names.

```typescript
async list(): Promise<string[]>
```

**Returns:**

- Array of theme names

**Example:**

```typescript
const themes = await eidos.space.theme.list()
console.log(themes) // ["dark-pro", "minimal", "retro"]
```

### `get(name: string)`

Get theme CSS content.

```typescript
async get(name: string): Promise<string | null>
```

**Parameters:**

- `name` (string): Theme name

**Returns:**

- CSS content as string, or `null` if theme not found

**Example:**

```typescript
const css = await eidos.space.theme.get("dark-pro")
if (css) {
  console.log("Theme loaded:", css.length, "characters")
}
```

### `install(name: string, css: string)`

Install or update a theme.

```typescript
async install(name: string, css: string): Promise<void>
```

**Parameters:**

- `name` (string): Theme name
- `css` (string): Theme CSS content

**Example:**

```typescript
const css = `
:root {
  --primary: hsl(222.2 47.4% 11.2%);
}
`
await eidos.space.theme.install("my-theme", css)
```

### `uninstall(name: string)`

Delete a theme.

```typescript
async uninstall(name: string): Promise<void>
```

**Parameters:**

- `name` (string): Theme name to delete

**Example:**

```typescript
await eidos.space.theme.uninstall("old-theme")
```

### `getCurrent()`

Get the currently active theme name.

```typescript
async getCurrent(): Promise<string | null>
```

**Returns:**

- Current theme name, or `null` if using default theme

**Example:**

```typescript
const current = await eidos.space.theme.getCurrent()
if (current) {
  console.log(`Current theme: ${current}`)
} else {
  console.log("Using default theme")
}
```

### `setCurrent(name: string | null)`

Set the active theme.

```typescript
async setCurrent(name: string | null): Promise<void>
```

**Parameters:**

- `name` (string | null): Theme name to activate, or `null` to reset to default

**Example:**

```typescript
// Apply a theme
await eidos.space.theme.setCurrent("dark-pro")

// Reset to default
await eidos.space.theme.setCurrent(null)
```

## File System API

Eidos provides a restricted external file API that enables access to the native file system. This is a restricted mechanism that provides secure file system access capabilities.

**Supported paths:**

- **Project folder** (`~/`) - The project directory where `.eidos` is located
- **Mounted folders** (`@/`) - Externally mounted directories

### Path Format

| Path Format        | Description                              |
| ------------------ | ---------------------------------------- |
| `~/src/main.js`    | Project folder (where .eidos is located) |
| `@/music/song.mp3` | Mounted folder                           |

### `readdir(path, options?)`

List directory contents (like Node.js `fs.readdir`).

```typescript
readdir(path: string): Promise<string[]>
readdir(path: string, options: { withFileTypes: true }): Promise<IDirectoryEntry[]>
readdir(path: string, options?: {
  withFileTypes?: boolean
  recursive?: boolean
}): Promise<string[] | IDirectoryEntry[]>
```

**Parameters:**

- `path` (string): Directory path, supports `~/` or `@/` prefix
- `options.withFileTypes` (boolean): Optional, returns `IDirectoryEntry` objects with type information
- `options.recursive` (boolean): Optional, recursively list all subdirectories

**Returns:**

- By default, returns an array of file names
- With `withFileTypes: true`, returns an array of `IDirectoryEntry` objects with `name`, `path`, `parentPath`, and `kind` properties
- With `recursive: true`, recursively lists all subdirectories

**Examples:**

```typescript
// List project root directory
const files = await eidos.space.fs.readdir("~/")
console.log(files)
// ["package.json", "src", "README.md"]

// List project subdirectory
const srcFiles = await eidos.space.fs.readdir("~/src")

// Get entries with type information
const entries = await eidos.space.fs.readdir("~/", {
  withFileTypes: true,
})
entries.forEach((entry) => {
  console.log(
    `${entry.name}: ${entry.kind === "directory" ? "directory" : "file"}`
  )
})
// package.json: file
// src: directory
// README.md: file

// Recursively list all files (including subdirectories)
const allFiles = await eidos.space.fs.readdir("~/", { recursive: true })
console.log(allFiles)
// ["package.json", "src", "src/index.js", "src/utils.js", "README.md"]

// Recursively list with type information
const allEntries = await eidos.space.fs.readdir("~/", {
  withFileTypes: true,
  recursive: true,
})

// List mounted folder
const musicFiles = await eidos.space.fs.readdir("@/music")

// Recursively list all files in mounted folder
const allMusicFiles = await eidos.space.fs.readdir("@/music", {
  recursive: true,
})

// Access .eidos/files directory (naturally available through ~/ access)
const eidosFiles = await eidos.space.fs.readdir("~/.eidos/files")
console.log(eidosFiles)
// ["photo.jpg", "document.pdf", "data.json"]

// Recursively list all files in .eidos/files
const allEidosFiles = await eidos.space.fs.readdir("~/.eidos/files", {
  recursive: true,
})
```

**Supported paths:**

- `~/` - Project root
- `~/src` - Project subdirectory
- `~/.eidos/files/` - .eidos subdirectory within project folder
- `@/music` - Mounted folder root
- `@/music/albums` - Mounted folder subdirectory

### `mkdir(path, options?)`

Create directory (like Node.js `fs.mkdir`).

```typescript
mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>
```

**Parameters:**

- `path` (string): Directory path to create
- `options.recursive` (boolean): Optional, whether to create parent directories

**Returns:**

- Returns the created directory path, or `undefined` if directory already exists

**Examples:**

```typescript
// Create directory in mounted folder
await eidos.space.fs.mkdir("@/work/projects")

// Recursively create nested directories
await eidos.space.fs.mkdir("@/work/2024/Q1", { recursive: true })
```

**Common use cases:**

```typescript
// Organize files by year and month
const today = new Date()
const year = today.getFullYear()
const month = String(today.getMonth() + 1).padStart(2, "0")
await eidos.space.fs.mkdir(`@/archive/${year}/${month}`, {
  recursive: true,
})

// Check if directory exists, create if not
try {
  await eidos.space.fs.readdir("@/work/temp")
} catch {
  await eidos.space.fs.mkdir("@/work/temp")
}
```

### `readFile(path, options?)`

Read file contents (like Node.js `fs.readFile`).

```typescript
readFile(path: string): Promise<Uint8Array>
readFile(path: string, options: { encoding: BufferEncoding; flag?: string } | BufferEncoding): Promise<string>
readFile(path: string, options?: {
  encoding?: BufferEncoding | null
  flag?: string
}): Promise<string | Uint8Array>
```

**Parameters:**

- `path` (string): File path, supports `~/` or `@/` prefix
- `options` (optional): Read options
  - `encoding` (BufferEncoding | null): File encoding, e.g., `'utf8'`, `'utf-8'`, `'base64'`, etc.
  - `flag` (string): File system flag, e.g., `'r'` (default)

**Returns:**

- Returns `Uint8Array` (binary data) when no `encoding` is specified
- Returns `string` (text content) when `encoding` is specified

**Examples:**

```typescript
// Read text file
const text = await eidos.space.fs.readFile("~/readme.md", "utf8")
console.log(text) // "# My Project\nThis is a sample project..."

// Read JSON file
const configText = await eidos.space.fs.readFile("~/config.json", "utf8")
const config = JSON.parse(configText)

// Read using options object
const content = await eidos.space.fs.readFile("~/data.txt", {
  encoding: "utf8",
})

// Read binary file (images, videos, etc.)
const imageData = await eidos.space.fs.readFile("~/image.png")
console.log(imageData) // Uint8Array(1234) [137, 80, 78, 71, ...]

// Read file from mounted folder
const musicData = await eidos.space.fs.readFile("@/music/song.mp3")
```

**Common use cases:**

```typescript
// Read and parse JSON config file
async function loadConfig(path: string) {
  const content = await eidos.space.fs.readFile(path, "utf8")
  return JSON.parse(content)
}

// Read image and convert to base64
async function imageToBase64(path: string) {
  const data = await eidos.space.fs.readFile(path)
  const base64 = btoa(String.fromCharCode(...data))
  return `data:image/png;base64,${base64}`
}

// Read text file and process line by line
async function processTextFile(path: string) {
  const content = await eidos.space.fs.readFile(path, "utf8")
  const lines = content.split("\n")
  return lines.filter((line) => line.trim().length > 0)
}
```

### `writeFile(path, data, options?)`

Write file contents (like Node.js `fs.writeFile`).

```typescript
writeFile(
  path: string,
  data: string | Uint8Array,
  options?: {
    encoding?: BufferEncoding | null
    mode?: number
    flag?: string
  } | BufferEncoding
): Promise<void>
```

**Parameters:**

- `path` (string): File path, supports `~/` or `@/` prefix
- `data` (string | Uint8Array): Content to write
  - `string`: Text content
  - `Uint8Array`: Binary data
- `options` (optional): Write options
  - `encoding` (BufferEncoding | null): File encoding, default `'utf8'`
  - `mode` (number): File permission mode, default `0o666`
  - `flag` (string): File system flag, default `'w'` (overwrite)

**Examples:**

```typescript
// Write text file
await eidos.space.fs.writeFile("~/hello.txt", "Hello, World!")

// Write JSON data
const config = { theme: "dark", language: "en-US" }
await eidos.space.fs.writeFile(
  "~/config.json",
  JSON.stringify(config, null, 2),
  "utf8"
)

// Write binary data
const imageData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
await eidos.space.fs.writeFile("~/image.png", imageData)

// Write with options object
await eidos.space.fs.writeFile("~/data.txt", "content", {
  encoding: "utf8",
  mode: 0o644,
})

// Write to mounted folder
await eidos.space.fs.writeFile("@/backup/data.json", JSON.stringify(data))
```

**Common use cases:**

```typescript
// Save user configuration
async function saveConfig(config: object) {
  const content = JSON.stringify(config, null, 2)
  await eidos.space.fs.writeFile("~/config.json", content, "utf8")
  eidos.space.notify("Configuration saved")
}

// Export data to file
async function exportData(data: any[], filename: string) {
  const csv = data.map((row) => Object.values(row).join(",")).join("\n")
  await eidos.space.fs.writeFile(`@/exports/${filename}`, csv, "utf8")
}

// Save Canvas screenshot
async function saveCanvasToFile(canvas: HTMLCanvasElement, path: string) {
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob(resolve as any, "image/png")
  )
  const arrayBuffer = await blob!.arrayBuffer()
  const data = new Uint8Array(arrayBuffer)
  await eidos.space.fs.writeFile(path, data)
}

// Create log file (append mode)
async function appendLog(message: string) {
  const timestamp = new Date().toISOString()
  const logEntry = `[${timestamp}] ${message}\n`
  try {
    const existing = await eidos.space.fs.readFile("~/app.log", "utf8")
    await eidos.space.fs.writeFile("~/app.log", existing + logEntry)
  } catch {
    await eidos.space.fs.writeFile("~/app.log", logEntry)
  }
}
```

### `stat(path)`

Get file or directory statistics (like Node.js `fs.stat`).

```typescript
stat(path: string): Promise<IStats>

interface IStats {
  size: number              // File size in bytes
  mtimeMs: number          // Last modified time (milliseconds timestamp)
  atimeMs: number          // Last accessed time (milliseconds timestamp)
  ctimeMs: number          // Status change time (milliseconds timestamp)
  birthtimeMs: number      // Creation time (milliseconds timestamp)
  isFile: boolean          // Whether it's a file
  isDirectory: boolean     // Whether it's a directory
  isSymbolicLink: boolean  // Whether it's a symbolic link
  isBlockDevice: boolean   // Whether it's a block device
  isCharacterDevice: boolean // Whether it's a character device
  isFIFO: boolean          // Whether it's a FIFO pipe
  isSocket: boolean        // Whether it's a socket
  mode: number             // File permission mode
  uid: number              // User ID
  gid: number              // Group ID
}
```

**Parameters:**

- `path` (string): File or directory path, supports `~/` or `@/` prefix

**Returns:**

- `IStats` object containing detailed file or directory information

**Examples:**

```typescript
// Get file information
const stats = await eidos.space.fs.stat("~/readme.md")
console.log(`File size: ${stats.size} bytes`)
console.log(`Is file: ${stats.isFile}`)
console.log(`Last modified: ${new Date(stats.mtimeMs)}`)

// Check if it's a file or directory
const stats = await eidos.space.fs.stat("~/src")
if (stats.isDirectory) {
  console.log("This is a directory")
} else if (stats.isFile) {
  console.log("This is a file")
}

// Get file info from mounted folder
const musicStats = await eidos.space.fs.stat("@/music/song.mp3")
console.log(`Song size: ${(musicStats.size / 1024 / 1024).toFixed(2)} MB`)
```

**Common use cases:**

```typescript
// Check if file exists
async function fileExists(path: string): Promise<boolean> {
  try {
    await eidos.space.fs.stat(path)
    return true
  } catch {
    return false
  }
}

// Get human-readable file size
async function getFileSize(path: string): Promise<string> {
  const stats = await eidos.space.fs.stat(path)
  const bytes = stats.size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

// List files in directory with their sizes
async function listFilesWithSize(dirPath: string) {
  const files = await eidos.space.fs.readdir(dirPath)
  const filesWithSize = await Promise.all(
    files.map(async (file) => {
      const filePath = `${dirPath}/${file}`
      const stats = await eidos.space.fs.stat(filePath)
      return {
        name: file,
        size: stats.size,
        isDirectory: stats.isDirectory,
        modified: new Date(stats.mtimeMs),
      }
    })
  )
  return filesWithSize
}

// Find recently modified files
async function findRecentlyModified(dirPath: string, days: number = 7) {
  const files = await eidos.space.fs.readdir(dirPath)
  const now = Date.now()
  const cutoff = now - days * 24 * 60 * 60 * 1000

  const recentFiles = []
  for (const file of files) {
    const stats = await eidos.space.fs.stat(`${dirPath}/${file}`)
    if (stats.isFile && stats.mtimeMs > cutoff) {
      recentFiles.push({
        name: file,
        modified: new Date(stats.mtimeMs),
      })
    }
  }
  return recentFiles.sort((a, b) => b.modified.getTime() - a.modified.getTime())
}

// Compare modification times of two files
async function isNewer(file1: string, file2: string): Promise<boolean> {
  const stats1 = await eidos.space.fs.stat(file1)
  const stats2 = await eidos.space.fs.stat(file2)
  return stats1.mtimeMs > stats2.mtimeMs
}
```

**Supported paths:**

- `~/` - Project root
- `~/src/index.js` - Project file
- `@/music` - Mounted folder root
- `@/music/albums/song.mp3` - File in mounted folder

### `rename(oldPath, newPath)`

Rename a file or directory (like Node.js `fs.rename`).

```typescript
rename(oldPath: string, newPath: string): Promise<void>
```

**Parameters:**

- `oldPath` (string): Current file or directory path, supports `~/` or `@/` prefix
- `newPath` (string): New file or directory path, supports `~/` or `@/` prefix

**Important Notes:**

- Both paths must be either virtual paths or real paths, cannot mix them
- For virtual paths (e.g., nodes under `~/.eidos/__NODES__/`), renaming updates the database records
- For real paths, renaming modifies files or directories in the file system
- Renaming can also be used to move files or directories to different locations

**Examples:**

```typescript
// Rename a file
await eidos.space.fs.rename("~/old-name.md", "~/new-name.md")

// Rename a directory
await eidos.space.fs.rename("~/old-folder", "~/new-folder")

// Move file to different directory
await eidos.space.fs.rename("~/src/old.js", "~/lib/new.js")

// Rename file in mounted folder
await eidos.space.fs.rename("@/music/old-song.mp3", "@/music/new-song.mp3")

// Rename a node (virtual path)
await eidos.space.fs.rename(
  "~/.eidos/__NODES__/node-id",
  "~/.eidos/__NODES__/New Name"
)

// Rename an extension (virtual path)
await eidos.space.fs.rename(
  "~/.eidos/__EXTENSIONS__/ext-id",
  "~/.eidos/__EXTENSIONS__/new-slug.ts"
)
```

**Common use cases:**

```typescript
// Batch rename files
async function renameFiles(files: string[], prefix: string) {
  for (const file of files) {
    const dir = file.substring(0, file.lastIndexOf("/"))
    const name = file.substring(file.lastIndexOf("/") + 1)
    const newName = `${prefix}-${name}`
    await eidos.space.fs.rename(file, `${dir}/${newName}`)
  }
}

// Organize files by date
async function organizeByDate(filePath: string) {
  const stats = await eidos.space.fs.stat(filePath)
  const date = new Date(stats.mtimeMs)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const dir = `@/archive/${year}/${month}`

  // Ensure directory exists
  await eidos.space.fs.mkdir(dir, { recursive: true })

  // Move file
  const fileName = filePath.substring(filePath.lastIndexOf("/") + 1)
  await eidos.space.fs.rename(filePath, `${dir}/${fileName}`)
}

// Rename with backup
async function renameWithBackup(oldPath: string, newPath: string) {
  const backupPath = `${oldPath}.backup`
  // First copy the file (by reading and writing)
  const content = await eidos.space.fs.readFile(oldPath)
  await eidos.space.fs.writeFile(backupPath, content)
  // Then rename the original file
  await eidos.space.fs.rename(oldPath, newPath)
}
```

### `watch(path, options?)`

Watch for changes on a file or directory (like Node.js `fs.watch`).

```typescript
watch(path: string, options?: IWatchOptions): AsyncIterable<IWatchEvent>

interface IWatchOptions {
  encoding?: BufferEncoding    // Encoding format, default 'utf8'
  persistent?: boolean          // Whether to persist watching, default true
  recursive?: boolean           // Whether to recursively watch subdirectories, default false
  signal?: AbortSignal          // Signal to cancel watching
}

interface IWatchEvent {
  eventType: 'rename' | 'change'  // Event type: 'rename' means file/directory created or deleted, 'change' means file content changed
  filename: string                 // Name or path of the changed file
}
```

**Parameters:**

- `path` (string): File or directory path to watch, supports `~/` or `@/` prefix
- `options` (IWatchOptions, optional): Watch options

**Returns:**

- Returns an `AsyncIterable<IWatchEvent>` that can be used with `for await...of` loop to watch for changes

**Important Notes:**

- For virtual paths (e.g., `~/.eidos/__NODES__/`), only root virtual directories can be watched
- Use `AbortSignal` to gracefully stop watching
- `eventType` of `'rename'` indicates file/directory creation or deletion
- `eventType` of `'change'` indicates file content changes

**Examples:**

```typescript
// Watch for changes in nodes directory
for await (const event of eidos.space.fs.watch("~/.eidos/__NODES__/")) {
  console.log(
    `Node ${event.filename} ${event.eventType === "rename" ? "created/deleted" : "content changed"}`
  )
}

// Watch for changes in extensions directory
for await (const event of eidos.space.fs.watch("~/.eidos/__EXTENSIONS__/")) {
  if (event.eventType === "rename") {
    console.log(`Extension ${event.filename} created or deleted`)
  } else {
    console.log(`Extension ${event.filename} content updated`)
  }
}

// Recursively watch directory and subdirectories
for await (const event of eidos.space.fs.watch("~/src", {
  recursive: true,
})) {
  console.log(`File ${event.filename} changed`)
}

// Use AbortSignal to control watch duration
const controller = new AbortController()
const { signal } = controller

// Automatically stop watching after 5 seconds
setTimeout(() => controller.abort(), 5000)

for await (const event of eidos.space.fs.watch("~/", {
  recursive: true,
  signal,
})) {
  console.log(`Change: ${event.filename}`)
}

// Watch mounted folder
for await (const event of eidos.space.fs.watch("@/music", {
  recursive: true,
})) {
  console.log(`Music file ${event.filename} changed`)
}
```

**Common use cases:**

```typescript
// Watch file changes and auto-reload
async function watchAndReload(filePath: string, callback: () => void) {
  for await (const event of eidos.space.fs.watch(filePath)) {
    if (event.eventType === "change") {
      console.log(`File ${filePath} updated, reloading...`)
      callback()
    }
  }
}

// Watch directory changes and sync to database
async function syncDirectoryChanges(dirPath: string) {
  for await (const event of eidos.space.fs.watch(dirPath, {
    recursive: true,
  })) {
    if (event.eventType === "rename") {
      // File created or deleted
      const fullPath = `${dirPath}/${event.filename}`
      try {
        await eidos.space.fs.stat(fullPath)
        // File exists, it's a creation
        console.log(`New file: ${fullPath}`)
        // Sync to database...
      } catch {
        // File doesn't exist, it's a deletion
        console.log(`File deleted: ${fullPath}`)
        // Delete from database...
      }
    } else {
      // File content changed
      console.log(`File updated: ${event.filename}`)
      // Update database...
    }
  }
}

// Watch with timeout
async function watchWithTimeout(path: string, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    for await (const event of eidos.space.fs.watch(path, {
      signal: controller.signal,
    })) {
      console.log(`Change: ${event.filename}`)
    }
  } catch (error) {
    if (error.name === "AbortError") {
      console.log("Watch timed out")
    } else {
      throw error
    }
  } finally {
    clearTimeout(timeout)
  }
}

// Watch multiple directories
async function watchMultipleDirs(paths: string[]) {
  const watchers = paths.map((path) =>
    eidos.space.fs.watch(path, { recursive: true })
  )

  // Use Promise.race to watch all directories
  const events = watchers.map(async function* (watcher) {
    for await (const event of watcher) {
      yield event
    }
  })

  // Merge all event streams
  for await (const event of mergeAsyncIterables(...events)) {
    console.log(`Change: ${event.filename}`)
  }
}

// Helper function: merge multiple AsyncIterables
async function* mergeAsyncIterables<T>(
  ...iterables: AsyncIterable<T>[]
): AsyncIterable<T> {
  const iterators = iterables.map((it) => it[Symbol.asyncIterator]())
  const nextPromises = iterators.map((it) => it.next())

  while (nextPromises.length > 0) {
    const { value, done } = await Promise.race(
      nextPromises.map((p, i) => p.then((result) => ({ ...result, index: i })))
    )

    if (done) {
      nextPromises.splice(value.index, 1)
      iterators.splice(value.index, 1)
    } else {
      yield value.value
      nextPromises[value.index] = iterators[value.index].next()
    }
  }
}
```

**Supported paths:**

- `~/` - Project root
- `~/src` - Project subdirectory
- `~/.eidos/__NODES__/` - Nodes directory (virtual path, root only)
- `~/.eidos/__EXTENSIONS__/` - Extensions directory (virtual path, root only)
- `@/music` - Mounted folder root
- `@/music/albums` - Mounted folder subdirectory

---

## Graft (Version Control) API

The `eidos.space.graft` object provides access to Graft, a distributed version control system for SQLite databases. Think of it as **Git for your database**: it allows you to track changes, synchronize with remote repositories, and manage different versions of your data space.

:::note
These methods are high-level wrappers around the [Graft SQLite PRAGMAs](https://graft.rs/docs/sqlite/pragmas/).
:::

### `status()`

Get the current synchronization status, including ahead/behind commit counts.

```typescript
async status(): Promise<{
  ahead: number        // Number of local commits not yet pushed
  behind: number       // Number of remote commits not yet pulled
  last_pushed_at: string
  last_pulled_at: string
}>
```

**Example:**

```typescript
const status = await eidos.space.graft.status()
if (status.behind > 0) {
  console.log(`You are ${status.behind} commits behind. pulling...`)
  await eidos.space.graft.pull()
}
```

### `pull()`

Pull the latest changes from the remote repository.

```typescript
async pull(): Promise<void>
```

**Example:**

```typescript
await eidos.space.graft.pull()
console.log("Pull completed successfully")
```

### `push()`

Push local commits to the remote repository.

```typescript
async push(): Promise<void>
```

**Example:**

```typescript
await eidos.space.graft.push()
console.log("Push completed successfully")
```

### `fetch()`

Fetch the latest changes from the remote repository without merging them.

```typescript
async fetch(): Promise<void>
```

**Example:**

```typescript
await eidos.space.graft.fetch()
const status = await eidos.space.graft.status()
console.log(`Behind by ${status.behind} commits after fetch`)
```

### `clone(remoteLogId?: string)`

Clone a remote repository into the current space.

```typescript
async clone(remoteLogId?: string): Promise<void>
```

**Parameters:**

- `remoteLogId` (string, optional): The ID of the remote log to clone. If not provided, uses the default remote.

**Example:**

```typescript
// Clone the default remote
await eidos.space.graft.clone()

// Clone a specific remote
await eidos.space.graft.clone("https://sync.eidos.space/logs/abc123")
```

### `info()`

Get information about the current Graft repository.

```typescript
async info(): Promise<any>
```

### `tags()`

List all tags in the repository.

```typescript
async tags(): Promise<any[]>
```

### `audit()`

Audit the local database against the remote state to check for consistency and integrity issues.

```typescript
async audit(): Promise<any>
```

### `volumes()`

List the volumes associated with this space. A volume represents a distinct storage unit or branch in Graft.

```typescript
async volumes(): Promise<any[]>
```

### `version()`

Get the version of the Graft extension and protocol being used.

```typescript
async version(): Promise<{ graft_version: string }>
```
