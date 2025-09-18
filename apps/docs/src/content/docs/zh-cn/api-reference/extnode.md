---
title: ExtNode API 参考
---

`eidos__extnode` 表是 Eidos 中用于存储扩展节点的内置表，主要用于存储自定义扩展节点的数据内容。该表与 Tree 表配合使用，Tree 表存储节点的层次结构和元数据，而 ExtNode 表存储节点的具体内容数据。

## 模型

### 数据库 Schema

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

### 字段说明

| 字段名       | 类型      | 说明                                        | 约束        |
| ------------ | --------- | ------------------------------------------- | ----------- |
| `id`         | TEXT      | 扩展节点的唯一标识符                        | PRIMARY KEY |
| `blob`       | BLOB      | 二进制数据内容，用于存储复杂数据            | 可选        |
| `text`       | TEXT      | 文本数据内容，用于存储 JSON 或纯文本        | 可选        |
| `type`       | TEXT      | 扩展节点类型，如 `excalidraw`、`mermaid` 等 | NOT NULL    |
| `created_at` | TIMESTAMP | 创建时间                                    | 自动生成    |
| `updated_at` | TIMESTAMP | 最后更新时间                                | 自动更新    |

### TypeScript 接口

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

## 方法

### `getText(id)`

获取节点的文本内容

```typescript
async getText(id: string): Promise<string | null>
```

**示例：**

```typescript
const textContent = await eidos.currentSpace.extNode.getText("node_123")
if (textContent) {
  const data = JSON.parse(textContent)
  console.log("解析后的数据:", data)
}
```

### `setText(id, text)`

设置节点的文本内容

```typescript
async setText(id: string, text: string): Promise<boolean>
```

**示例：**

```typescript
const data = { elements: [], appState: {} }
await eidos.currentSpace.extNode.setText("node_123", JSON.stringify(data))
```

### `getBlob(id)`

获取节点的二进制数据

```typescript
async getBlob(id: string): Promise<Buffer | null>
```

**示例：**

```typescript
const blobData = await eidos.currentSpace.extNode.getBlob("node_123")
if (blobData) {
  // 处理二进制数据
  console.log("二进制数据大小:", blobData.length)
}
```

### `setBlob(id, blob)`

设置节点的二进制数据

```typescript
async setBlob(id: string, blob: Buffer): Promise<boolean>
```

**示例：**

```typescript
const buffer = Buffer.from("some binary data")
await eidos.currentSpace.extNode.setBlob("node_123", buffer)
```
