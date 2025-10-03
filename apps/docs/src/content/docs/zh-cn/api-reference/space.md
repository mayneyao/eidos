---
title: Space API 参考
description: Eidos Space 功能完整 API 参考
sidebar:
  order: 1
---

`eidos.currentSpace` 对象提供对所有数据空间功能的访问，包括导航、文档管理和扩展节点操作。

:::tip
`eidos.currentSpace` 暴露了比文档中多得多的接口。但是为了稳定性，请尽量使用文档中提到的接口，我们会逐步评估可暴露的方法。
:::

## 通用方法

### `navigate(path: string)`

在当前空间内导航到节点。

```typescript
navigate(path: string): void
```

**参数:**

- `path` (string): 要导航到的路径，相对于当前空间

**支持的路径格式:**

- `"/<nodeId>"` - 通过 ID 导航到特定节点
- `"/<tableId>"` - 导航到表格视图
- `"/<docId>#<hash>" - 导航到文档（支持 hash 锚点，如 `#标题`）
- `"/2025-09-30"` - 导航到基于日期的节点
- `"/extensions/<extensionId>"` - 导航到扩展
- `"/blocks/<blockId>"` - 导航到块

**示例:**

```typescript
// 导航到特定表格
eidos.currentSpace.navigate("/table_123")

// 导航到文档
eidos.currentSpace.navigate("/doc_456")

// 导航到文档的特定标题
eidos.currentSpace.navigate("/doc_456#我的标题")

// 导航到今日页面
const today = new Date().toISOString().split("T")[0]
eidos.currentSpace.navigate(`/${today}`)

// 导航到扩展
eidos.currentSpace.navigate("/extensions/my-extension")

// 导航到块
eidos.currentSpace.navigate("/blocks/block_789")
```

### `notify(title: string, description: string)`

向用户显示支持 markdown 的通知。

```typescript
notify(title: string, description: string): void
```

**参数:**

- `title` (string): 通知标题
- `description` (string): 通知描述（支持 markdown）

**示例:**

```typescript
eidos.currentSpace.notify(
  "任务完成",
  "成功处理了 **100 条记录** 并更新了数据库。"
)
```

---

## 文档 API

`eidos.currentSpace.doc` 对象提供文档管理功能。

### `getMarkdown(id: string)`

获取文档的 Markdown 内容。

```typescript
async getMarkdown(id: string): Promise<string>
```

**示例:**

```typescript
const markdown = await eidos.currentSpace.doc.getMarkdown("doc_123")
console.log("Markdown 内容:", markdown)
```

### `getProperties(id: string)`

获取文档的所有属性（包括系统属性和自定义属性）。

```typescript
async getProperties(id: string): Promise<Record<string, any>>
```

**示例:**

```typescript
const allProps = await eidos.currentSpace.doc.getProperties("doc_123")
console.log("所有属性:", allProps)
```

### `setProperties(id: string, properties: Record<string, any>)`

设置文档的属性。

```typescript
async setProperties(id: string, properties: Record<string, any>): Promise<{ success: boolean; message?: string; updatedProperties?: string[] }>
```

**示例:**

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

### `deleteProperty(propertyName: string)`

删除指定的属性列。

```typescript
async deleteProperty(propertyName: string): Promise<void>
```

**示例:**

```typescript
await eidos.currentSpace.doc.deleteProperty("old_property")
console.log("属性已删除")
```

---

## 扩展节点 API

`eidos.currentSpace.extNode` 对象提供扩展节点数据存储功能。

### `getText(id: string)`

获取节点的文本内容。

```typescript
async getText(id: string): Promise<string | null>
```

**示例:**

```typescript
const textContent = await eidos.currentSpace.extNode.getText("node_123")
if (textContent) {
  const data = JSON.parse(textContent)
  console.log("解析的数据:", data)
}
```

### `setText(id: string, text: string)`

设置节点的文本内容。

```typescript
async setText(id: string, text: string): Promise<boolean>
```

**示例:**

```typescript
const data = { elements: [], appState: {} }
await eidos.currentSpace.extNode.setText("node_123", JSON.stringify(data))
```

### `getBlob(id: string)`

获取节点的二进制数据。

```typescript
async getBlob(id: string): Promise<Buffer | null>
```

**示例:**

```typescript
const blobData = await eidos.currentSpace.extNode.getBlob("node_123")
if (blobData) {
  // 处理二进制数据
  console.log("二进制数据大小:", blobData.length)
}
```

### `setBlob(id: string, blob: Buffer)`

设置节点的二进制数据。

```typescript
async setBlob(id: string, blob: Buffer): Promise<boolean>
```

**示例:**

```typescript
const buffer = Buffer.from("some binary data")
await eidos.currentSpace.extNode.setBlob("node_123", buffer)
```
