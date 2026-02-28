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
