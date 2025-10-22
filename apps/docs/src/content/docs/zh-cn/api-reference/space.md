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

---

## 文件 API

`eidos.currentSpace.file` 对象提供文件上传和管理功能。

### `upload(source, options?)`

通用文件上传方法，支持多种输入类型：URL、base64 字符串、ArrayBuffer、Blob 或 File 对象。

```typescript
async upload(
  source: string | ArrayBuffer | Blob | File,
  options?: UploadOptions
): Promise<IFile & { publicUrl: string }>

interface UploadOptions {
  fileName?: string        // 对于 URL/File 可选，对于其他类型必需
  mimeType?: string        // 对于 URL/File/Blob 可选，对于 ArrayBuffer/base64 必需
  parentPath?: string[]    // 父目录路径，例如 ["images", "avatars"]
  checkDuplicate?: boolean // 检查文件是否存在，如存在则返回已有文件
}
```

**参数:**

- `source` (string | ArrayBuffer | Blob | File): 文件源
  - **URL 字符串** (http/https): 自动获取并上传
  - **Base64 字符串**: 解码并上传（需要 `fileName` 和 `mimeType`）
  - **ArrayBuffer**: 原始二进制数据（需要 `fileName` 和 `mimeType`）
  - **Blob**: 二进制大对象（需要 `fileName`）
  - **File**: 来自文件输入或拖放的文件对象
- `options` (UploadOptions, 可选): 上传配置

**返回值:**

```typescript
{
  id: string           // 唯一文件 ID
  name: string         // 文件名
  path: string         // 完整文件路径
  size: number         // 文件大小（字节）
  mime: string         // MIME 类型
  created_at?: string  // 创建时间戳
  publicUrl: string    // 可直接访问文件的 URL
}
```

**示例:**

```typescript
// 1. 从 URL 上传
const file = await eidos.currentSpace.file.upload(
  "https://example.com/image.jpg",
  { parentPath: ["images"] }
)
console.log("文件已上传:", file.publicUrl)

// 2. 自定义文件名上传
const file = await eidos.currentSpace.file.upload(
  "https://example.com/photo.jpg",
  { 
    fileName: "头像.jpg",
    parentPath: ["avatars"],
    checkDuplicate: true  // 如已存在则不重复上传
  }
)

// 3. 从 base64 字符串上传
const base64Data = "iVBORw0KGgoAAAANSUhEUgAA..." // base64 图片数据
const file = await eidos.currentSpace.file.upload(base64Data, {
  fileName: "截图.png",
  mimeType: "image/png",
  parentPath: ["screenshots"]
})

// 4. 从 File 对象上传（例如文件输入）
const fileInput = document.querySelector('input[type="file"]')
const selectedFile = fileInput.files[0]
const file = await eidos.currentSpace.file.upload(selectedFile, {
  parentPath: ["documents"]
})

// 5. 从 ArrayBuffer 上传
const arrayBuffer = await fetch("https://example.com/doc.pdf")
  .then(res => res.arrayBuffer())
const file = await eidos.currentSpace.file.upload(arrayBuffer, {
  fileName: "文档.pdf",
  mimeType: "application/pdf",
  parentPath: ["pdfs"]
})

// 6. 从 Blob 上传
const blob = new Blob(["你好，世界！"], { type: "text/plain" })
const file = await eidos.currentSpace.file.upload(blob, {
  fileName: "问候.txt",
  parentPath: ["texts"]
})
```

**常见用例:**

```typescript
// 从外部 API 保存下载的图片
async function saveImageFromAPI(imageUrl: string, category: string) {
  const file = await eidos.currentSpace.file.upload(imageUrl, {
    parentPath: ["api-images", category],
    checkDuplicate: true
  })
  return file.publicUrl
}

// 处理并上传 Canvas 截图
async function uploadCanvasScreenshot(canvas: HTMLCanvasElement) {
  const blob = await new Promise(resolve => 
    canvas.toBlob(resolve, "image/png")
  )
  const file = await eidos.currentSpace.file.upload(blob, {
    fileName: `截图-${Date.now()}.png`,
    parentPath: ["screenshots"]
  })
  return file
}

// 从文件输入上传多个文件
async function uploadUserFiles(files: FileList) {
  const results = []
  for (const file of Array.from(files)) {
    const uploaded = await eidos.currentSpace.file.upload(file, {
      parentPath: ["user-uploads", new Date().toISOString().split('T')[0]]
    })
    results.push(uploaded)
  }
  return results
}
```

### `get(id: string)`

通过 ID 获取文件元数据。

```typescript
async get(id: string): Promise<IFile | null>
```

**示例:**

```typescript
const fileInfo = await eidos.currentSpace.file.get("file_123")
if (fileInfo) {
  console.log("文件名:", fileInfo.name)
  console.log("文件大小:", fileInfo.size)
  console.log("MIME 类型:", fileInfo.mime)
}
```

### `getByPath(path: string)`

通过文件路径获取文件元数据。

```typescript
async getByPath(path: string): Promise<IFile | null>
```

**参数:**

- `path` (string): 文件路径，例如 `"files/images/photo.jpg"`

**示例:**

```typescript
const fileInfo = await eidos.currentSpace.file.getByPath("files/images/photo.jpg")
if (fileInfo) {
  console.log("文件 ID:", fileInfo.id)
  console.log("文件名:", fileInfo.name)
  console.log("文件大小:", fileInfo.size)
  console.log("MIME 类型:", fileInfo.mime)
}
```

**错误处理:**

```typescript
try {
  const file = await eidos.currentSpace.file.upload(source, options)
  eidos.currentSpace.notify("成功", `文件已上传: ${file.name}`)
} catch (error) {
  if (error.name === "FileUploadError") {
    eidos.currentSpace.notify("上传失败", error.message)
  } else if (error.name === "FileSystemError") {
    eidos.currentSpace.notify("错误", "文件系统不可用")
  }
}
```
