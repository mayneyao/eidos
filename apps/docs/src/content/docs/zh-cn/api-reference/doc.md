---
title: Doc API 参考
---

`eidos__doc` 表是 Eidos 中用于存储文档的内置表，支持文档内容管理、属性管理和全文搜索功能。该表与 Tree 表配合使用，Tree 表存储文档的层次结构和元数据，而 Doc 表存储文档的具体内容和自定义属性。

文档表支持动态属性系统，除了预定义的系统字段外，用户可以为每个文档添加任意数量的自定义属性。这些自定义属性会自动创建为数据库列，默认类型为 Text。

## 模型

### 数据库 Schema

```sql
CREATE TABLE IF NOT EXISTS eidos__doc (
  id TEXT PRIMARY KEY,
  content TEXT,
  markdown TEXT,
  is_day_page BOOLEAN DEFAULT 0,
  meta TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS update_time_trigger__eidos__doc
AFTER UPDATE ON eidos__doc
FOR EACH ROW
BEGIN
  UPDATE eidos__doc SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

### 字段说明

| 字段名        | 类型      | 说明                     | 约束        |
| ------------- | --------- | ------------------------ | ----------- |
| `id`          | TEXT      | 文档的唯一标识符         | PRIMARY KEY |
| `content`     | TEXT      | 文档的原始内容           | 可选        |
| `markdown`    | TEXT      | 文档的 Markdown 格式内容 | 可选        |
| `is_day_page` | BOOLEAN   | 是否为日记页面           | 默认 false  |
| `meta`        | TEXT      | 元数据配置（JSON 格式）  | 默认 '{}'   |
| `created_at`  | TIMESTAMP | 创建时间                 | 自动生成    |
| `updated_at`  | TIMESTAMP | 最后更新时间             | 自动更新    |

### TypeScript 接口

```typescript
export interface IDoc {
  id: string
  content: string
  markdown: string
  is_day_page?: boolean
  created_at?: string
  updated_at?: string
  meta?: string // JSON string for display configuration
  [key: string]: any // 支持任意自定义属性
}

export interface DocMeta {
  displayProperties?: string[]
  [key: string]: any // Allow for future extensions
}
```

## 方法

### `getMarkdown(id)`

获取文档的 Markdown 内容

```typescript
async getMarkdown(id: string): Promise<string>
```

**示例：**

```typescript
const markdown = await eidos.currentSpace.doc.getMarkdown("doc_123")
console.log("Markdown 内容:", markdown)
```

### `getProperties(id)`

获取文档的所有属性（包括系统属性和自定义属性）

```typescript
async getProperties(id: string): Promise<Record<string, any>>
```

**示例：**

```typescript
const allProps = await eidos.currentSpace.doc.getProperties("doc_123")
console.log("所有属性:", allProps)
```

### `setProperties(id, properties)`

设置文档的属性

```typescript
async setProperties(id: string, properties: Record<string, any>): Promise<{ success: boolean; message?: string; updatedProperties?: string[] }>
```

**示例：**

```typescript
const result = await eidos.currentSpace.doc.setProperties("doc_123", {
  title: "我的文档",
  author: "张三",
  tags: "重要,工作",
})

if (result.success) {
  console.log("属性设置成功:", result.updatedProperties)
}
```

### `deleteProperty(propertyName)`

删除指定的属性列

```typescript
async deleteProperty(propertyName: string): Promise<void>
```

**示例：**

```typescript
await eidos.currentSpace.doc.deleteProperty("old_property")
console.log("属性已删除")
```
