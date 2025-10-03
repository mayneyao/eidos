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
