---
title: Schema SDK
description: Eidos 表格、字段与视图生命周期管理 API 参考
---

`eidos.space.schema` 对象提供了管理表、字段和视图生命周期的各种方法。

## 表操作 (Table Operations)

### `createTable(input)`

创建一个包含指定字段的新表。

```typescript
async createTable(input: CreateTableInput): Promise<TableInfo>
```

**示例:**

```typescript
const table = await eidos.space.schema.createTable({
  name: "任务清单",
  fields: [
    {
      name: "优先级",
      columnName: "priority",
      type: "select",
      property: {
        options: [
          { name: "高", color: "red" },
          { name: "低", color: "blue" },
        ],
      },
    },
    { name: "截止日期", columnName: "deadline", type: "date" },
  ],
})
console.log("创建的表格 ID:", table.id)
```

### `getTable(tableId)`

获取特定表的详细信息。

```typescript
async getTable(tableId: string): Promise<TableInfo>
```

**示例:**

```typescript
const tableInfo = await eidos.space.schema.getTable("table_id_here")
console.log(`表格 ${tableInfo.name} 共有 ${tableInfo.fields.length} 个字段。`)
```

### `listTables()`

列出当前空间中的所有表。

```typescript
async listTables(): Promise<TableListItem[]>
```

**示例:**

```typescript
const tables = await eidos.space.schema.listTables()
tables.forEach((t) => console.log(`${t.name} (${t.id})`))
```

### `updateTable(tableId, input)`

更新表元数据 (例如重命名)。

```typescript
async updateTable(tableId: string, input: UpdateTableInput): Promise<TableInfo>
```

**示例:**

```typescript
await eidos.space.schema.updateTable("table_id", { name: "新名称" })
```

### `deleteTable(tableId)`

永久删除一个表。

```typescript
async deleteTable(tableId: string): Promise<boolean>
```

---

## 字段操作 (Field Operations)

### `addField(tableId, input)`

向现有表添加新字段。

```typescript
async addField(tableId: string, input: CreateFieldInput): Promise<FieldInfo>
```

**示例:**

```typescript
await eidos.space.schema.addField("table_id", {
  name: "新字段",
  columnName: "new_field",
  type: "text",
})
```

### `updateField(tableId, columnName, input)`

更新现有字段的元数据。

```typescript
async updateField(tableId: string, columnName: string, input: UpdateFieldInput): Promise<FieldInfo>
```

**示例:**

```typescript
await eidos.space.schema.updateField("table_id", "priority", {
  name: "任务优先级",
})
```

### `deleteField(tableId, columnName)`

从表中删除字段。

```typescript
async deleteField(tableId: string, columnName: string): Promise<boolean>
```

---

## 视图操作 (View Operations)

### `createView(tableId, input)`

为表创建新视图。

```typescript
async createView(tableId: string, input: CreateViewInput): Promise<ViewInfo>
```

**示例:**

```typescript
await eidos.space.schema.createView("table_id", {
  name: "我的看板",
  type: "kanban",
})
```

### `listViews(tableId)`

列出与表关联的所有视图。

```typescript
async listViews(tableId: string): Promise<ViewInfo[]>
```

### `deleteView(tableId, viewId)`

删除特定视图。

```typescript
async deleteView(tableId: string, viewId: string): Promise<boolean>
```
