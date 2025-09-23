---
title: Doc API Reference
---

The `eidos__docs` table is a built-in table in Eidos used for storing documents, supporting document content management, property management, and full-text search functionality. This table works in conjunction with the Tree table, where the Tree table stores the hierarchical structure and metadata of documents, while the Doc table stores the specific content and custom properties of documents.

The document table supports a dynamic property system. In addition to predefined system fields, users can add any number of custom properties to each document. These custom properties are automatically created as database columns with a default type of Text.

## Model

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS eidos__docs (
  id TEXT PRIMARY KEY,
  content TEXT,
  markdown TEXT,
  is_day_page BOOLEAN DEFAULT 0,
  meta TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS update_time_trigger__eidos__doc
AFTER UPDATE ON eidos__docs
FOR EACH ROW
BEGIN
  UPDATE eidos__docs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

### Field Description

| Field Name    | Type      | Description                              | Constraints    |
| ------------- | --------- | ---------------------------------------- | -------------- |
| `id`          | TEXT      | Unique identifier for the document       | PRIMARY KEY    |
| `content`     | TEXT      | Original content of the document         | Optional       |
| `markdown`    | TEXT      | Markdown formatted content of the document | Optional       |
| `is_day_page` | BOOLEAN   | Whether it's a daily page                | Default false  |
| `meta`        | TEXT      | Metadata configuration (JSON format)     | Default '{}'   |
| `created_at`  | TIMESTAMP | Creation time                            | Auto-generated |
| `updated_at`  | TIMESTAMP | Last update time                         | Auto-updated   |

### TypeScript Interface

```typescript
export interface IDoc {
  id: string
  content: string
  markdown: string
  is_day_page?: boolean
  created_at?: string
  updated_at?: string
  meta?: string // JSON string for display configuration
  [key: string]: any // Supports arbitrary custom properties
}

export interface DocMeta {
  displayProperties?: string[]
  [key: string]: any // Allow for future extensions
}
```

## Methods

### `getMarkdown(id)`

Get the Markdown content of a document

```typescript
async getMarkdown(id: string): Promise<string>
```

**Example:**

```typescript
const markdown = await eidos.currentSpace.doc.getMarkdown("doc_123")
console.log("Markdown content:", markdown)
```

### `getProperties(id)`

Get all properties of a document (including system properties and custom properties)

```typescript
async getProperties(id: string): Promise<Record<string, any>>
```

**Example:**

```typescript
const allProps = await eidos.currentSpace.doc.getProperties("doc_123")
console.log("All properties:", allProps)
```

### `setProperties(id, properties)`

Set properties of a document

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

### `deleteProperty(propertyName)`

Delete the specified property column

```typescript
async deleteProperty(propertyName: string): Promise<void>
```

**Example:**

```typescript
await eidos.currentSpace.doc.deleteProperty("old_property")
console.log("Property deleted")
```
