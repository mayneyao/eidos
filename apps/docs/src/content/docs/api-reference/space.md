---
title: Space API Reference
description: Complete API reference for Eidos Space functionality
sidebar:
  order: 1
---

The `eidos.currentSpace` object provides access to all data space functionality including navigation, document management, and extension node operations.

:::tip
`eidos.currentSpace` exposes many more interfaces than documented here. However, for stability, please try to use the interfaces mentioned in the documentation. We will gradually evaluate which methods can be exposed.
:::

---

## Common Methods

### `navigate(path: string)`

Navigate to a node within the current space.

```typescript
navigate(path: string): void
```

**Parameters:**

- `path` (string): The path to navigate to, relative to the current space

**Supported Path Formats:**

- `"/<nodeId>"` - Navigate to a specific node by ID
- `"/<tableId>"` - Navigate to a table view
- `"/<docId>#<hash>"` - Navigate to a document (supports hash anchors, e.g., `#title`)
- `"/2025-09-30"` - Navigate to a date-based node
- `"/extensions/<extensionId>"` - Navigate to an extension
- `"/blocks/<blockId>"` - Navigate to a block

**Example:**

```typescript
// Navigate to a specific table
eidos.currentSpace.navigate("/table_123")

// Navigate to a document
eidos.currentSpace.navigate("/doc_456")

// Navigate to a specific title in a document
eidos.currentSpace.navigate("/doc_456#my-title")

// Navigate to today's page
const today = new Date().toISOString().split("T")[0]
eidos.currentSpace.navigate(`/${today}`)

// Navigate to an extension
eidos.currentSpace.navigate("/extensions/my-extension")

// Navigate to a block
eidos.currentSpace.navigate("/blocks/block_789")
```

### `notify(title: string, description: string)`

Show a notification to the user with markdown support.

```typescript
notify(title: string, description: string): void
```

**Parameters:**

- `title` (string): The notification title
- `description` (string): The notification description (supports markdown)

**Example:**

```typescript
eidos.currentSpace.notify(
  "Task Completed",
  "Successfully processed **100 records** and updated the database."
)
```

---

## Document API

The `eidos.currentSpace.doc` object provides document management functionality.

### `getMarkdown(id: string)`

Get the Markdown content of a document.

```typescript
async getMarkdown(id: string): Promise<string>
```

**Example:**

```typescript
const markdown = await eidos.currentSpace.doc.getMarkdown("doc_123")
console.log("Markdown content:", markdown)
```

### `getProperties(id: string)`

Get all properties of a document (including system properties and custom properties).

```typescript
async getProperties(id: string): Promise<Record<string, any>>
```

**Example:**

```typescript
const allProps = await eidos.currentSpace.doc.getProperties("doc_123")
console.log("All properties:", allProps)
```

### `setProperties(id: string, properties: Record<string, any>)`

Set properties of a document.

```typescript
async setProperties(id: string, properties: Record<string, any>): Promise<{ success: boolean; message?: string; updatedProperties?: string[] }>
```

**Example:**

```typescript
const result = await eidos.currentSpace.doc.setProperties("doc_123", {
  title: "My Document",
  author: "John Doe",
  tags: "important,work",
})

if (result.success) {
  console.log("Properties set successfully:", result.updatedProperties)
}
```

### `deleteProperty(propertyName: string)`

Delete the specified property column.

```typescript
async deleteProperty(propertyName: string): Promise<void>
```

**Example:**

```typescript
await eidos.currentSpace.doc.deleteProperty("old_property")
console.log("Property deleted")
```

---

## Extension Node API

The `eidos.currentSpace.extNode` object provides extension node data storage functionality.

### `getText(id: string)`

Get the text content of a node.

```typescript
async getText(id: string): Promise<string | null>
```

**Example:**

```typescript
const textContent = await eidos.currentSpace.extNode.getText("node_123")
if (textContent) {
  const data = JSON.parse(textContent)
  console.log("Parsed data:", data)
}
```

### `setText(id: string, text: string)`

Set the text content of a node.

```typescript
async setText(id: string, text: string): Promise<boolean>
```

**Example:**

```typescript
const data = { elements: [], appState: {} }
await eidos.currentSpace.extNode.setText("node_123", JSON.stringify(data))
```

### `getBlob(id: string)`

Get the binary data of a node.

```typescript
async getBlob(id: string): Promise<Buffer | null>
```

**Example:**

```typescript
const blobData = await eidos.currentSpace.extNode.getBlob("node_123")
if (blobData) {
  // Process binary data
  console.log("Binary data size:", blobData.length)
}
```

### `setBlob(id: string, blob: Buffer)`

Set the binary data of a node.

```typescript
async setBlob(id: string, blob: Buffer): Promise<boolean>
```

**Example:**

```typescript
const buffer = Buffer.from("some binary data")
await eidos.currentSpace.extNode.setBlob("node_123", buffer)
```

---

## File API

The `eidos.currentSpace.file` object provides file upload and management functionality.

### `upload(source, options?)`

Universal file upload method supporting multiple input types: URLs, base64 strings, ArrayBuffer, Blob, or File objects.

```typescript
async upload(
  source: string | ArrayBuffer | Blob | File,
  options?: UploadOptions
): Promise<IFile & { publicUrl: string }>

interface UploadOptions {
  fileName?: string        // Optional for URL/File, required for others
  mimeType?: string        // Optional for URL/File/Blob, required for ArrayBuffer/base64
  parentPath?: string[]    // Parent directory path, e.g., ["images", "avatars"]
  checkDuplicate?: boolean // Check if file exists and return existing file
}
```

**Parameters:**

- `source` (string | ArrayBuffer | Blob | File): The file source
  - **URL string** (http/https): Automatically fetched and uploaded
  - **Base64 string**: Decoded and uploaded (requires `fileName` and `mimeType`)
  - **ArrayBuffer**: Raw binary data (requires `fileName` and `mimeType`)
  - **Blob**: Binary large object (requires `fileName`)
  - **File**: File object from input or drag-drop
- `options` (UploadOptions, optional): Upload configuration

**Returns:**

```typescript
{
  id: string           // Unique file ID
  name: string         // File name
  path: string         // Full file path
  size: number         // File size in bytes
  mime: string         // MIME type
  created_at?: string  // Creation timestamp
  publicUrl: string    // Ready-to-use URL for accessing the file
}
```

**Examples:**

```typescript
// 1. Upload from URL
const file = await eidos.currentSpace.file.upload(
  "https://example.com/image.jpg",
  { parentPath: ["images"] }
)
console.log("File uploaded:", file.publicUrl)

// 2. Upload with custom name
const file = await eidos.currentSpace.file.upload(
  "https://example.com/photo.jpg",
  {
    fileName: "profile-picture.jpg",
    parentPath: ["avatars"],
    checkDuplicate: true  // Don't upload if already exists
  }
)

// 3. Upload from base64 string
const base64Data = "iVBORw0KGgoAAAANSUhEUgAA..." // base64 image data
const file = await eidos.currentSpace.file.upload(base64Data, {
  fileName: "screenshot.png",
  mimeType: "image/png",
  parentPath: ["screenshots"]
})

// 4. Upload from File object (e.g., from file input)
const fileInput = document.querySelector('input[type="file"]')
const selectedFile = fileInput.files[0]
const file = await eidos.currentSpace.file.upload(selectedFile, {
  parentPath: ["documents"]
})

// 5. Upload from ArrayBuffer
const arrayBuffer = await fetch("https://example.com/doc.pdf")
  .then(res => res.arrayBuffer())
const file = await eidos.currentSpace.file.upload(arrayBuffer, {
  fileName: "document.pdf",
  mimeType: "application/pdf",
  parentPath: ["pdfs"]
})

// 6. Upload from Blob
const blob = new Blob(["Hello, world!"], { type: "text/plain" })
const file = await eidos.currentSpace.file.upload(blob, {
  fileName: "greeting.txt",
  parentPath: ["texts"]
})
```

**Common Use Cases:**

```typescript
// Save downloaded image from external API
async function saveImageFromAPI(imageUrl: string, category: string) {
  const file = await eidos.currentSpace.file.upload(imageUrl, {
    parentPath: ["api-images", category],
    checkDuplicate: true,
  })
  return file.publicUrl
}

// Process and upload canvas screenshot
async function uploadCanvasScreenshot(canvas: HTMLCanvasElement) {
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png")
  )
  const file = await eidos.currentSpace.file.upload(blob, {
    fileName: `screenshot-${Date.now()}.png`,
    parentPath: ["screenshots"],
  })
  return file
}

// Upload files from file input with progress
async function uploadUserFiles(files: FileList) {
  const results = []
  for (const file of Array.from(files)) {
    const uploaded = await eidos.currentSpace.file.upload(file, {
      parentPath: ["user-uploads", new Date().toISOString().split("T")[0]],
    })
    results.push(uploaded)
  }
  return results
}
```

### `get(id: string)`

Get file metadata by ID.

```typescript
async get(id: string): Promise<IFile | null>
```

**Example:**

```typescript
const fileInfo = await eidos.currentSpace.file.get("file_123")
if (fileInfo) {
  console.log("File name:", fileInfo.name)
  console.log("File size:", fileInfo.size)
  console.log("MIME type:", fileInfo.mime)
}
```

### `getByPath(path: string)`

Get file metadata by file path.

```typescript
async getByPath(path: string): Promise<IFile | null>
```

**Parameters:**

- `path` (string): The file path, e.g., `"files/images/photo.jpg"`

**Example:**

```typescript
const fileInfo = await eidos.currentSpace.file.getByPath(
  "files/images/photo.jpg"
)
if (fileInfo) {
  console.log("File ID:", fileInfo.id)
  console.log("File name:", fileInfo.name)
  console.log("File size:", fileInfo.size)
  console.log("MIME type:", fileInfo.mime)
}
```

**Error Handling:**

```typescript
try {
  const file = await eidos.currentSpace.file.upload(source, options)
  eidos.currentSpace.notify("Success", `File uploaded: ${file.name}`)
} catch (error) {
  if (error.name === "FileUploadError") {
    eidos.currentSpace.notify("Upload Failed", error.message)
  } else if (error.name === "FileSystemError") {
    eidos.currentSpace.notify("Error", "File system not available")
  }
}
```

---

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
readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>
readdir(path: string, options?: {
  withFileTypes?: boolean
  recursive?: boolean
}): Promise<string[] | Dirent[]>
```

**Parameters:**

- `path` (string): Directory path, supports `~/` or `@/` prefix
- `options.withFileTypes` (boolean): Optional, returns `Dirent` objects with type information
- `options.recursive` (boolean): Optional, recursively list all subdirectories

**Returns:**

- By default, returns an array of file names
- With `withFileTypes: true`, returns an array of `Dirent` objects
- With `recursive: true`, recursively lists all subdirectories

**Examples:**

```typescript
// List project root directory
const files = await eidos.currentSpace.fs.readdir("~/")
console.log(files)
// ["package.json", "src", "README.md"]

// List project subdirectory
const srcFiles = await eidos.currentSpace.fs.readdir("~/src")

// Get entries with type information
const entries = await eidos.currentSpace.fs.readdir("~/", {
  withFileTypes: true,
})
entries.forEach((entry) => {
  console.log(`${entry.name}: ${entry.isDirectory() ? "directory" : "file"}`)
})
// package.json: file
// src: directory
// README.md: file

// Recursively list all files (including subdirectories)
const allFiles = await eidos.currentSpace.fs.readdir("~/", { recursive: true })
console.log(allFiles)
// ["package.json", "src", "src/index.js", "src/utils.js", "README.md"]

// Recursively list with type information
const allEntries = await eidos.currentSpace.fs.readdir("~/", {
  withFileTypes: true,
  recursive: true,
})

// List mounted folder
const musicFiles = await eidos.currentSpace.fs.readdir("@/music")

// Recursively list all files in mounted folder
const allMusicFiles = await eidos.currentSpace.fs.readdir("@/music", {
  recursive: true,
})

// Access .eidos/files directory (naturally available through ~/ access)
const eidosFiles = await eidos.currentSpace.fs.readdir("~/.eidos/files")
console.log(eidosFiles)
// ["photo.jpg", "document.pdf", "data.json"]

// Recursively list all files in .eidos/files
const allEidosFiles = await eidos.currentSpace.fs.readdir("~/.eidos/files", {
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
await eidos.currentSpace.fs.mkdir("@/work/projects")

// Recursively create nested directories
await eidos.currentSpace.fs.mkdir("@/work/2024/Q1", { recursive: true })
```

**Common use cases:**

```typescript
// Organize files by year and month
const today = new Date()
const year = today.getFullYear()
const month = String(today.getMonth() + 1).padStart(2, "0")
await eidos.currentSpace.fs.mkdir(`@/archive/${year}/${month}`, {
  recursive: true,
})

// Check if directory exists, create if not
try {
  await eidos.currentSpace.fs.readdir("@/work/temp")
} catch {
  await eidos.currentSpace.fs.mkdir("@/work/temp")
}
```
