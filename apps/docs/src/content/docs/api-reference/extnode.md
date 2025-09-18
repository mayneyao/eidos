---
title: ExtNode API Reference
---

The `eidos__extnode` table is a built-in table in Eidos used for storing extension nodes, primarily for storing data content of custom extension nodes. This table works in conjunction with the Tree table, where the Tree table stores the hierarchical structure and metadata of nodes, while the ExtNode table stores the specific content data of nodes.

## Model

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS eidos__extnode (
  id TEXT PRIMARY KEY,
  blob BLOB,
  text TEXT,
  type TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_eidos__extnode_type ON eidos__extnode(type);

CREATE TRIGGER IF NOT EXISTS update_time_trigger__eidos__extnode
AFTER UPDATE ON eidos__extnode
FOR EACH ROW
BEGIN
  UPDATE eidos__extnode SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

### Field Description

| Field Name   | Type      | Description                                      | Constraints    |
| ------------ | --------- | ------------------------------------------------ | -------------- |
| `id`         | TEXT      | Unique identifier for the extension node         | PRIMARY KEY    |
| `blob`       | BLOB      | Binary data content for storing complex data     | Optional       |
| `text`       | TEXT      | Text data content for storing JSON or plain text | Optional       |
| `type`       | TEXT      | Extension node type, such as `excalidraw`, `mermaid`, etc. | NOT NULL    |
| `created_at` | TIMESTAMP | Creation time                                    | Auto-generated |
| `updated_at` | TIMESTAMP | Last update time                                 | Auto-updated   |

### TypeScript Interface

```typescript
export interface IExtNode {
  id: string
  blob?: Buffer
  text?: string
  type: string
  created_at?: string
  updated_at?: string
}
```

## Methods

### `getText(id)`

Get the text content of a node

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

### `setText(id, text)`

Set the text content of a node

```typescript
async setText(id: string, text: string): Promise<boolean>
```

**Example:**

```typescript
const data = { elements: [], appState: {} }
await eidos.currentSpace.extNode.setText("node_123", JSON.stringify(data))
```

### `getBlob(id)`

Get the binary data of a node

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

### `setBlob(id, blob)`

Set the binary data of a node

```typescript
async setBlob(id: string, blob: Buffer): Promise<boolean>
```

**Example:**

```typescript
const buffer = Buffer.from("some binary data")
await eidos.currentSpace.extNode.setBlob("node_123", buffer)
```
