---
title: Block
description: A universal UI extension framework that enables custom rendering and interaction capabilities.
sidebar:
  order: 3
  badge: RFC
---

The Block extension framework is a universal UI extension solution that provides a lightweight, single-file UI extension approach supporting React component rendering while maintaining reusability across different environments.

## 1. Design Principles

### 1.1 Lightweight Design

- Adopts a single-file component approach for easy code reuse across projects
- Complex components are recommended to be developed using conventional methods and published to npm
- Maintains separation of concerns to reduce maintenance overhead

### 1.2 Build-Free Development Experience

- Zero-config build with immediate preview of changes upon saving
- Automatically transforms imports to the latest external package versions
- Leverages the npm ecosystem while reducing version management complexity

### 1.3 Import Resolution Strategy

Uses standard Node.js import syntax with automatic resolution to external packages:

```tsx
// Standard import syntax
import { Excalidraw } from "@excalidraw/excalidraw"

// Automatically resolved to: https://esm.sh/@excalidraw/excalidraw
```

## 2. Built-in Component Library Integration

### 2.1 Shadcn/ui Integration

Provides seamless integration with Shadcn/ui components, enabling consistent UI styling with the Eidos interface:

```tsx
import { Button } from "@/components/ui/button"
```

Components share theme configurations with the main application while supporting independent theme customization.

### 2.2 AI-Assisted Development

Shadcn/ui's LLM-friendly architecture facilitates AI-assisted development, enabling code generation for simple scenarios without manual coding.

## 3. Runtime Environment

Block components execute in browser environments similar to standard React components. In Eidos Desktop, each block runs in an isolated domain:

```
<extid>.block.<spaceId>.eidos.localhost:13127
```

## 4. Extension Types and Specifications

### 4.1 Table View Extensions

Provide custom visualization options beyond the default grid, gallery, and kanban views.

#### Meta Configuration

```typescript
interface TableViewMeta {
  type: "tableView"
  componentName: string
  tableView: {
    title: string
    type: string // Built-in types: grid, gallery, kanban
    description: string
  }
}
```

#### Data Storage

Custom extension view type information is stored in the `eidos__views` table using the `ext__<type>` format:

- Built-in views: `grid`, `gallery`, `kanban`
- Custom extensions: `ext__list`, `ext__timeline`, `ext__chart`, etc.

#### URL Access Pattern

When rendering as a table view extension, the block will access the following URL structure:

```
<extid>.block.<spaceId>.eidos.localhost:13127/<tableid>/<viewid>
```

#### Implementation Example

```tsx
export const meta = {
  type: "tableView",
  componentName: "MyListView",
  tableView: {
    title: "List View",
    type: "list",
    description: "This is a list view",
  },
}

export function MyListView() {
  const [rows, setRows] = useState<any[]>([])

  // Get tableId and viewId from URL
  const pathParts = window.location.pathname.split("/")
  const tableId = pathParts[pathParts.length - 2]
  const viewId = pathParts[pathParts.length - 1]

  useEffect(() => {
    eidos.currentSpace.table(tableId).rows.query({}, { viewId }).then(setRows)
  }, [tableId, viewId])

  return (
    <div>
      {rows.map((row) => (
        <div key={row.id}>{row.title}</div>
      ))}
    </div>
  )
}
```

### 4.2 Extension Node Types

Provide custom node types beyond the default document and table nodes, with consistent directory tree behavior but custom rendering logic.

#### URL Access Pattern

```
<extid>.block.<spaceId>.eidos.localhost:13127/<nodeid>
```

#### Meta Configuration

```typescript
interface ExtNodeMeta {
  type: "extNode"
  componentName: string
  extNode: {
    title: string
    description: string
    type: string
  }
}
```

#### Implementation Examples

**Client-side Data Retrieval (Local Only):**

```tsx
export const meta = {
  type: "extNode",
  componentName: "MyExcalidraw",
  extNode: {
    title: "Excalidraw",
    description: "This is an excalidraw node",
    type: "excalidraw",
  },
}

export function MyExcalidraw() {
  const [initialData, setInitialData] = useState("")
  const nodeId = window.location.pathname.split("/").pop()

  useEffect(() => {
    eidos.currentSpace.extNode.getText(nodeId).then((text) => {
      setInitialData(JSON.parse(text))
    })
  }, [nodeId])

  return <Excalidraw initialData={initialData} />
}
```

**Server-side Data Retrieval (Publishable):**

```tsx
export const loader = async () => {
  const nodeid = request.url.split("/").pop()
  const text = await eidos.currentSpace.extNode.getText(nodeid)
  return { props: { text } }
}

export function MyExtNode({ text }: { text: string }) {
  return <div>{text}</div>
}
```

### 4.3 File Handler Extensions

Provide custom file type handlers, similar to the operating system's "Open With" functionality, allowing Block extensions to register as handlers for specific file types.

:::tip[File Handler vs ExtNode]
**External vs Internal**:

- **File Handler**: Handles **external files**, i.e., files in the local file system (project files `~/`, mounted files `@/`). These files exist independently of the Eidos database.

- **ExtNode**: Handles **internal data**, i.e., structured data stored in the Eidos SQLite database. ExtNode data is accessed through methods like `eidos.currentSpace.extNode.getText()`/`setText()`, and is fully managed by Eidos.

In simple terms: File Handler opens files in the file system, ExtNode manages data in the database.
:::

#### URL Access Pattern

File paths are passed through hash:

```
<extid>.block.<spaceId>.eidos.localhost:13127#<filePath>
```

**Important:** File paths in URL hash are URL-encoded (e.g., spaces are encoded as `%20`), so when reading them, you need to first remove the leading `#` and then use `decodeURIComponent()` to decode them.

**Supported file path formats:**

| Path Format            | Description                          | Example                    |
| ---------------------- | ------------------------------------- | -------------------------- |
| `~/path/to/file`       | Project folder (.eidos directory)     | `~/readme.md`              |
| `@/mount/path/file`    | Mounted folder (requires authorization) | `@/music/song.mp3`         |

**URL Examples:**

```
# Open README file in project
markdown-editor.block.my-space.eidos.localhost:13127#~/readme.md

# Play mounted music file (filename with spaces will be encoded)
audio-player.block.my-space.eidos.localhost:13127#@/music/my%20song.mp3
```

#### Meta Configuration

```typescript
interface FileHandlerMeta {
  type: "fileHandler"
  componentName: string
  fileHandler: {
    title: string // Handler name
    description: string // Description
    extensions: string[] // Supported extensions, e.g., [".md", ".markdown"]
    icon?: string // Optional icon
  }
}
```

#### Handler Selection Logic

The system automatically queries the `eidos__extensions` table to find all handlers that support the file extension:

1. If there is only one handler, use it directly
2. If there are multiple handlers, query the user's default handler (stored in KV table)
3. If no default is set, prompt the user to choose

**Default Handler Storage:**

```typescript
// Only need to store user preference in KV table when multiple handlers exist
// Key format: eidos:space:file:handler:default:<extension>
// Value: Handler extension ID

await eidos.currentSpace.kv.put(
  `eidos:space:file:handler:default:.md`,
  "markdown-editor-ext-id"
)
```

#### Implementation Examples

**Markdown Editor:**

```tsx
export const meta = {
  type: "fileHandler",
  componentName: "MarkdownEditor",
  fileHandler: {
    title: "Markdown Editor",
    description: "Markdown editor with live preview",
    extensions: [".md", ".markdown"],
    icon: "📝",
  },
}

export function MarkdownEditor() {
  const [content, setContent] = useState("")
  // Get file path from hash, need to remove # first then decode URL encoding
  const filePath = decodeURIComponent(window.location.hash.slice(1))

  useEffect(() => {
    // Read file content
    eidos.currentSpace.fs
      .readFile(filePath, "utf8")
      .then(setContent)
      .catch((err) => {
        eidos.currentSpace.notify({ title: "Error", description: `Failed to read file: ${err.message}` })
      })
  }, [filePath])

  const handleSave = async () => {
    try {
      await eidos.currentSpace.fs.writeFile(filePath, content, "utf8")
      eidos.currentSpace.notify("File saved")
    } catch (err) {
      eidos.currentSpace.notify({ title: "Error", description: `Failed to save: ${err.message}` })
    }
  }

  return (
    <div className="flex h-screen">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-1/2 p-4"
      />
      <div className="w-1/2 p-4 markdown-preview">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
      <button onClick={handleSave}>Save</button>
    </div>
  )
}
```

**Audio Player:**

```tsx
export const meta = {
  type: "fileHandler",
  componentName: "AudioPlayer",
  fileHandler: {
    title: "Audio Player",
    description: "Player supporting multiple audio formats",
    extensions: [".mp3", ".flac", ".wav", ".ogg", ".m4a"],
    icon: "🎵",
  },
}

export function AudioPlayer() {
  const [audioUrl, setAudioUrl] = useState("")
  // Get file path from hash, need to remove # first then decode URL encoding
  const filePath = decodeURIComponent(window.location.hash.slice(1))

  useEffect(() => {
    // Construct audio URL (through Eidos file service)
    const url = `http://${window.location.host}${filePath}`
    setAudioUrl(url)
  }, [filePath])

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h2 className="text-2xl font-bold mb-4">{filePath.split("/").pop()}</h2>
      <audio controls src={audioUrl} className="w-full max-w-md">
        Your browser does not support audio playback
      </audio>
    </div>
  )
}
```

#### File Access API

Use the `eidos.currentSpace.fs` API to access files:

```typescript
// Read text file
const text = await eidos.currentSpace.fs.readFile(filePath, "utf8")

// Read binary file
const data = await eidos.currentSpace.fs.readFile(filePath)

// Write file
await eidos.currentSpace.fs.writeFile(filePath, content, "utf8")

// Get file information
const stats = await eidos.currentSpace.fs.stat(filePath)
```

For more details on the file system API, see [Space API Reference - File System API](/api-reference/space/#file-system-api).

## 5. Directive System

Block supports special directives to control component behavior and rendering methods. These directives are declared at the top of the code as string literals.

### 5.1 use sidebar Directive

The `use sidebar` directive instructs the Block component to render in the left sidebar instead of opening in the main area.

#### Default Behavior

When a Block is added to the left sidebar tabs, the **default behavior** is to click and open an independent Block page in the main area:

```tsx
// Default behavior - opens in main area
export function MyDashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      <p>This component displays in the main area on an independent page</p>
    </div>
  )
}
```

This default behavior applies to:
- Dashboard components
- Data visualization
- Detailed content pages
- Features requiring larger display areas

#### Using Directive to Change Behavior

If you want the Block to display directly in the sidebar (such as navigation bars, toolbars, etc.), you need to add the `use sidebar` directive:

```tsx
"use sidebar"

// Renders in sidebar
export function MyNavigation() {
  const navigateToTable = () => {
    eidos.currentSpace.navigate("/table_123")
  }

  const navigateToToday = () => {
    const today = new Date().toISOString().split("T")[0]
    eidos.currentSpace.navigate(`/${today}`)
  }

  return (
    <div className="space-y-2">
      <h3 className="font-medium">Quick Navigation</h3>

      <button
        onClick={navigateToTable}
        className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
      >
        📊 My Table
      </button>

      <button
        onClick={navigateToToday}
        className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
      >
        📅 Today Page
      </button>

      <button
        onClick={() => eidos.currentSpace.navigate("/extensions")}
        className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
      >
        🔧 Extension Management
      </button>
    </div>
  )
}
```

**Directive Behavior Explanation:**
- Blocks containing the `use sidebar` directive will render component content directly in the sidebar when clicked
- Blocks without this directive will navigate to the main area's independent Block page when clicked
- The directive must appear as a string literal at the top of the file

**Applicable Scenarios:**
- Navigation bar components
- Toolbar components
- Quick action panels
- Status display components
- Sidebar tools

## 7. Security Considerations

Extension execution should be properly sandboxed to prevent unauthorized system access. Implementations must validate component props and enforce appropriate isolation between extensions and the host application.

## 8. Implementation Requirements

- When specific extension functionality is required, a `meta` object conforming to the specified interface should be exported
- When no `meta` object is exported, the component runs as a regular React component
- When a `meta` object is exported, `meta.componentName` must match the actual exported component
- Proper error boundaries and loading states should be implemented
- When interacting with application data, data fetching must be performed through the Eidos SDK

## 7. Future Extensions

This specification may be extended to support additional extension types, including but not limited to:

- **Custom Field Renderers**: Provide custom rendering and editing components for table fields
- **MIME Type Support**: File handlers supporting MIME type-based matching
- **Protocol Handlers**: Support for custom URL protocols (e.g., `eidos://`, `notion://`)
- **Context Menu Extensions**: Provide custom right-click menu items for files and nodes
- **Command Palette Extensions**: Register custom commands to the global command palette
