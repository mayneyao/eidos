---
title: Schema SDK
description: Documentation for managing Table, Field, and View lifecycles in Eidos
---

The `eidos.space.schema` object provides methods for managing the lifecycle of tables, fields, and views.

## Table Operations

### `createTable(input)`

Create a new table with specified fields.

```typescript
async createTable(input: CreateTableInput): Promise<TableInfo>
```

**Example:**

```typescript
const table = await eidos.space.schema.createTable({
  name: "Tasks",
  fields: [
    {
      name: "Priority",
      columnName: "priority",
      type: "select",
      property: {
        options: [
          { name: "High", color: "red" },
          { name: "Low", color: "blue" },
        ],
      },
    },
    { name: "Deadline", columnName: "deadline", type: "date" },
  ],
})
console.log("Created table ID:", table.id)
```

### `getTable(tableId)`

Get detailed information about a specific table.

```typescript
async getTable(tableId: string): Promise<TableInfo>
```

**Example:**

```typescript
const tableInfo = await eidos.space.schema.getTable("table_id_here")
console.log(`Table ${tableInfo.name} has ${tableInfo.fields.length} fields.`)
```

### `listTables()`

List all tables in the current space.

```typescript
async listTables(): Promise<TableListItem[]>
```

**Example:**

```typescript
const tables = await eidos.space.schema.listTables()
tables.forEach((t) => console.log(`${t.name} (${t.id})`))
```

### `updateTable(tableId, input)`

Update table metadata (e.g., rename).

```typescript
async updateTable(tableId: string, input: UpdateTableInput): Promise<TableInfo>
```

**Example:**

```typescript
await eidos.space.schema.updateTable("table_id", { name: "New Name" })
```

### `deleteTable(tableId)`

Permanently delete a table.

```typescript
async deleteTable(tableId: string): Promise<boolean>
```

---

## Field Operations

### `addField(tableId, input)`

Add a new field to an existing table.

```typescript
async addField(tableId: string, input: CreateFieldInput): Promise<FieldInfo>
```

**Example:**

```typescript
await eidos.space.schema.addField("table_id", {
  name: "New Field",
  columnName: "new_field",
  type: "text",
})
```

### `updateField(tableId, columnName, input)`

Update field metadata.

```typescript
async updateField(tableId: string, columnName: string, input: UpdateFieldInput): Promise<FieldInfo>
```

**Example:**

```typescript
await eidos.space.schema.updateField("table_id", "priority", {
  name: "Task Priority",
})
```

### `deleteField(tableId, columnName)`

Delete a field from a table.

```typescript
async deleteField(tableId: string, columnName: string): Promise<boolean>
```

---

## View Operations

### `createView(tableId, input)`

Create a new view for a table.

```typescript
async createView(tableId: string, input: CreateViewInput): Promise<ViewInfo>
```

**Example:**

```typescript
await eidos.space.schema.createView("table_id", {
  name: "My Kanban",
  type: "kanban",
})
```

### `listViews(tableId)`

List all views for a table.

```typescript
async listViews(tableId: string): Promise<ViewInfo[]>
```

### `deleteView(tableId, viewId)`

Delete a view.

```typescript
async deleteView(tableId: string, viewId: string): Promise<boolean>
```

---

## Schema Import / Export

These two methods let you **share a table's structure** (field definitions) as a compact, portable string — without any row data.

### `export(tableId)`

Export a table's schema as a portable object. System fields (`_id`, `title`, timestamps, etc.) are automatically excluded.

```typescript
async export(tableId: string): Promise<TableSchemaExport>

interface TableSchemaExport {
  version: 1
  name: string
  fields: CreateFieldInput[]
}
```

**Example — copy to clipboard as base64:**

```typescript
const schema = await eidos.space.schema.export("table_id_here")

// Encode to base64 for easy copying/sharing
const encoded = btoa(
  encodeURIComponent(JSON.stringify(schema)).replace(
    /%([0-9A-F]{2})/g,
    (_, p1) => String.fromCharCode(parseInt(p1, 16))
  )
)
console.log(encoded) // "eyJ2ZXJzaW9uIjox..."
```

### `import(schema, nameOverride?)`

Create a new table from a previously exported schema. This is the counterpart to `export()`.

```typescript
async import(schema: TableSchemaExport, nameOverride?: string): Promise<TableInfo>
```

**Parameters:**

- `schema` — A `TableSchemaExport` object (e.g., decoded from a base64 string)
- `nameOverride` — Optional: override the table name from the schema

**Example — decode base64 and recreate the table:**

```typescript
// Decode the base64 string back to a schema object
const schema = JSON.parse(
  decodeURIComponent(
    atob(encodedString)
      .split("")
      .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("")
  )
)

// Create the table
const table = await eidos.space.schema.import(schema)
console.log("Created:", table.name, "with", table.fields.length, "fields")

// Create with a different name
const copy = await eidos.space.schema.import(schema, "My Copy")
```

**Round-trip example:**

```typescript
// Export from source table
const schema = await eidos.space.schema.export(sourceTableId)

// Share `schema` or encode it — then recreate elsewhere:
const newTable = await eidos.space.schema.import(schema, "Tasks (Copy)")
```

:::tip[UI shortcut]
You can also do this without scripts:

- **Export**: Right-click a table → **Export → Copy Schema** → base64 string is copied to clipboard
- **Import**: Press `⌘K` → search **"Import Table Schema"** → paste the string → preview → **Create Table**
  :::

:::note
When importing a schema, system fields like `_id` and `title` are automatically recreated by the system. We understand that some users may prefer a more flexible approach to the `title` field, and we are currently exploring potential solutions to address this.
:::
