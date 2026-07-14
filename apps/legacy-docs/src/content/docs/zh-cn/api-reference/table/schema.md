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

---

## Schema 导入 / 导出

这两个方法允许你将**表格结构**（字段定义）以紧凑的可移植字符串形式分享——不包含任何行数据。

### `export(tableId)`

将表的 Schema 导出为可移植对象。系统字段（`_id`、`title`、时间戳等）会自动排除。

```typescript
async export(tableId: string): Promise<TableSchemaExport>

interface TableSchemaExport {
  version: 1
  name: string
  fields: CreateFieldInput[]
}
```

**示例 — 导出并复制为 base64 字符串:**

```typescript
const schema = await eidos.space.schema.export("table_id_here")

// 编码为 base64，便于复制分享
const encoded = btoa(
  encodeURIComponent(JSON.stringify(schema)).replace(
    /%([0-9A-F]{2})/g,
    (_, p1) => String.fromCharCode(parseInt(p1, 16))
  )
)
console.log(encoded) // "eyJ2ZXJzaW9uIjox..."
```

### `import(schema, nameOverride?)`

根据之前导出的 Schema 创建新表，是 `export()` 的逆操作。

```typescript
async import(schema: TableSchemaExport, nameOverride?: string): Promise<TableInfo>
```

**参数:**

- `schema` — `TableSchemaExport` 对象（例如从 base64 字符串解码而来）
- `nameOverride` — 可选：覆盖 Schema 中的表名

**示例 — 解码 base64 并重建表格:**

```typescript
// 将 base64 字符串解码为 Schema 对象
const schema = JSON.parse(
  decodeURIComponent(
    atob(encodedString)
      .split("")
      .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("")
  )
)

// 创建表格
const table = await eidos.space.schema.import(schema)
console.log("已创建:", table.name, "共", table.fields.length, "个字段")

// 使用不同名称创建
const copy = await eidos.space.schema.import(schema, "我的副本")
```

**完整往返示例:**

```typescript
// 从源表导出
const schema = await eidos.space.schema.export(sourceTableId)

// 分享 schema 或编码后，在另一个 space 重建：
const newTable = await eidos.space.schema.import(schema, "任务（副本）")
```

:::tip[UI 快捷方式]
无需脚本也可完成此操作：

- **导出**：右键点击表格 → **导出 → Copy Schema** → base64 字符串已复制到剪贴板
- **导入**：按 `⌘K` → 搜索 **"Import Table Schema"** → 粘贴字符串 → 预览确认 → **Create Table**
  :::

:::note
在导入 Schema 时，`_id` 和 `title` 等系统字段会自动被系统创建。我们了解到部分用户可能不喜欢强制性的 `title` 字段，目前正在思考是否有更完美的解决方案。
:::
