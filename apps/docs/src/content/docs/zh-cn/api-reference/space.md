---
title: Space API 参考
description: Eidos Space 功能完整 API 参考
sidebar:
  order: 4
---

`eidos.space` 对象提供对所有数据空间功能的访问，包括导航、文档管理和扩展节点操作。

:::tip
`eidos.space` 暴露了比文档中多得多的接口。但是为了稳定性，请尽量使用文档中提到的接口，我们会逐步评估可暴露的方法。
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
- `"/<docId>#<hash>" - 导航到文档（支持 hash 锚点，如 `#标题`）
- `"/2025-09-30"` - 导航到基于日期的节点
- `"/extensions/<extensionId>"` - 导航到扩展
- `"/blocks/<blockId>"` - 导航到块
- `"/file-handler/#<filePath>"` - 导航到文件处理器

**示例:**

```typescript
// 导航到特定表格
eidos.space.navigate("/table_123")

// 导航到文档
eidos.space.navigate("/doc_456")

// 导航到文档的特定标题
eidos.space.navigate("/doc_456#我的标题")

// 导航到今日页面
const today = new Date().toISOString().split("T")[0]
eidos.space.navigate(`/${today}`)

// 导航到扩展
eidos.space.navigate("/extensions/my-extension")

// 导航到块
eidos.space.navigate("/blocks/block_789")

// 导航到文件处理器（打开项目文件夹中的文件）
eidos.space.navigate("/file-handler/#~/readme.md")

// 导航到文件处理器（打开挂载文件夹中的文件）
eidos.space.navigate("/file-handler/#@/music/song.mp3")
```

### `notify(msg: string)`

向用户显示支持 markdown 的通知。支持通过按钮进行高级交互。

```typescript
// 简单模式：只传字符串，作为通知内容
notify(msg: string): void

// 完整模式：传对象，自定义标题和内容
notify(msg: {
  title: string
  description: string
  actions?: Array<{
    label: string
    action: "reload" | "dismiss"
    variant?: "primary" | "secondary"
  }>
}): void
```

**参数:**

- `msg` (string | object): 通知消息
  - **简单模式**: 传入字符串，将作为通知内容显示，标题默认为 "Notification"
  - **完整模式**: 传入对象，包含：
    - `title` (string): 通知标题
    - `description` (string): 通知描述（支持 markdown）
    - `actions` (Array): 可选的交互按钮
      - `label` (string): 按钮文本
      - `action` (string): 执行动作：`"reload"`（刷新页面）或 `"dismiss"`（关闭通知）
      - `variant` (string): 按钮样式：`"primary"`（实心）或 `"secondary"`（描边）

**示例:**

```typescript
// 简单模式 - 快速显示通知
eidos.space.notify("操作已完成")

// 完整模式 - 自定义标题和内容
eidos.space.notify({
  title: "任务完成",
  description: "成功处理了 **100 条记录** 并更新了数据库。",
})

// 带有交互按钮
eidos.space.notify({
  title: "发现更新",
  description: "新版本已准备就绪。是否现在刷新页面？",
  actions: [
    { label: "稍后", action: "dismiss", variant: "secondary" },
    { label: "立即刷新", action: "reload", variant: "primary" },
  ],
})
```

---

## 表格 API

表格相关的操作已移动到独立的专题页面：

- [Table SDK (增删改查)](../table/sdk/)：findMany, create, update, delete 等数据操作。
- [架构管理 (Schema)](../table/schema/)：createTable, addField, createView 等表结构管理。
- [字段对象 (Fields)](../table/fields/)：字段类型参考及 Property 配置。
- [视图对象 (Views)](../table/views/)：视图类型参考及属性配置。

---

---

## 文档 API

`eidos.space.doc` 对象提供文档管理功能。

### `getMarkdown(id: string)`

获取文档的 Markdown 内容。

```typescript
async getMarkdown(id: string): Promise<string>
```

**示例:**

```typescript
const markdown = await eidos.space.doc.getMarkdown("doc_123")
console.log("Markdown 内容:", markdown)
```

### `getProperties(id: string)`

获取文档的所有属性（包括系统属性和自定义属性）。

```typescript
async getProperties(id: string): Promise<Record<string, any>>
```

**示例:**

```typescript
const allProps = await eidos.space.doc.getProperties("doc_123")
console.log("所有属性:", allProps)
```

### `setProperties(id: string, properties: Record<string, any>)`

设置文档的属性。

```typescript
async setProperties(id: string, properties: Record<string, any>): Promise<{ success: boolean; message?: string; updatedProperties?: string[] }>
```

**示例:**

```typescript
const result = await eidos.space.doc.setProperties("doc_123", {
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
await eidos.space.doc.deleteProperty("old_property")
console.log("属性已删除")
```

---

## 扩展节点 API

`eidos.space.extNode` 对象提供扩展节点数据存储功能。

### `getText(id: string)`

获取节点的文本内容。

```typescript
async getText(id: string): Promise<string | null>
```

**示例:**

```typescript
const textContent = await eidos.space.extNode.getText("node_123")
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
await eidos.space.extNode.setText("node_123", JSON.stringify(data))
```

### `getBlob(id: string)`

获取节点的二进制数据。

```typescript
async getBlob(id: string): Promise<Buffer | null>
```

**示例:**

```typescript
const blobData = await eidos.space.extNode.getBlob("node_123")
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
await eidos.space.extNode.setBlob("node_123", buffer)
```

---

## 文件系统 API

Eidos 提供了受限的外部文件 API，使你可以访问原生文件系统。这是一种受限的机制，提供了安全的文件系统访问能力。

**权限机制：**

- **项目文件夹** (`~/`) - `.eidos` 所在的项目目录。默认具备读写权限，无需额外授权。
- **挂载文件夹** (`@/`) - 外部挂载的目录。需要用户手动进行 mount 授权操作，只有在授权后才能访问。

### 路径格式

| 路径格式           | 说明                          |
| ------------------ | ----------------------------- |
| `~/src/main.js`    | 项目文件夹（.eidos 所在目录） |
| `@/music/song.mp3` | 挂载文件夹（需手动授权）      |

### `readdir(path, options?)`

列出目录内容（类似 Node.js `fs.readdir`）。

```typescript
readdir(path: string): Promise<string[]>
readdir(path: string, options: { withFileTypes: true }): Promise<IDirectoryEntry[]>
readdir(path: string, options?: {
  withFileTypes?: boolean
  recursive?: boolean
}): Promise<string[] | IDirectoryEntry[]>
```

**参数:**

- `path` (string): 目录路径，支持 `~/` 或 `@/` 前缀
- `options.withFileTypes` (boolean): 可选，返回带类型信息的 `IDirectoryEntry` 对象
- `options.recursive` (boolean): 可选，递归列出所有子目录内容

**返回值:**

- 默认返回文件名数组
- 使用 `withFileTypes: true` 时返回 `IDirectoryEntry` 对象数组，包含 `name`、`path`、`parentPath` 和 `kind` 属性
- 使用 `recursive: true` 时递归列出所有子目录

**示例:**

```typescript
// 列出项目根目录
const files = await eidos.space.fs.readdir("~/")
console.log(files)
// ["package.json", "src", "README.md"]

// 列出项目子目录
const srcFiles = await eidos.space.fs.readdir("~/src")

// 获取带类型信息的条目
const entries = await eidos.space.fs.readdir("~/", {
  withFileTypes: true,
})
entries.forEach((entry) => {
  console.log(`${entry.name}: ${entry.kind === "directory" ? "目录" : "文件"}`)
})
// package.json: 文件
// src: 目录
// README.md: 文件

// 递归列出所有文件（包括子目录）
const allFiles = await eidos.space.fs.readdir("~/", { recursive: true })
console.log(allFiles)
// ["package.json", "src", "src/index.js", "src/utils.js", "README.md"]

// 递归列出并获取类型信息
const allEntries = await eidos.space.fs.readdir("~/", {
  withFileTypes: true,
  recursive: true,
})

// 列出挂载的文件夹
const musicFiles = await eidos.space.fs.readdir("@/music")

// 递归列出挂载文件夹的所有文件
const allMusicFiles = await eidos.space.fs.readdir("@/music", {
  recursive: true,
})
```

**支持的路径:**

- `~/` - 项目根目录
- `~/src` - 项目子目录
- `@/music` - 挂载文件夹根目录
- `@/music/albums` - 挂载文件夹子目录

### `mkdir(path, options?)`

创建目录（类似 Node.js `fs.mkdir`）。

```typescript
mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>
```

**参数:**

- `path` (string): 要创建的目录路径
- `options.recursive` (boolean): 可选，是否递归创建父目录

**返回值:**

- 返回创建的目录路径，如果目录已存在则返回 `undefined`

**示例:**

```typescript
// 在挂载文件夹中创建目录
await eidos.space.fs.mkdir("@/work/projects")

// 递归创建嵌套目录
await eidos.space.fs.mkdir("@/work/2024/Q1", { recursive: true })
```

**常见用例:**

```typescript
// 按年月组织文件
const today = new Date()
const year = today.getFullYear()
const month = String(today.getMonth() + 1).padStart(2, "0")
await eidos.space.fs.mkdir(`@/archive/${year}/${month}`, {
  recursive: true,
})

// 检查目录是否存在，不存在则创建
try {
  await eidos.space.fs.readdir("@/work/temp")
} catch {
  await eidos.space.fs.mkdir("@/work/temp")
}
```

### `readFile(path, options?)`

读取文件内容（类似 Node.js `fs.readFile`）。

```typescript
readFile(path: string): Promise<Uint8Array>
readFile(path: string, options: { encoding: BufferEncoding; flag?: string } | BufferEncoding): Promise<string>
readFile(path: string, options?: {
  encoding?: BufferEncoding | null
  flag?: string
}): Promise<string | Uint8Array>
```

**参数:**

- `path` (string): 文件路径，支持 `~/` 或 `@/` 前缀
- `options` (可选): 读取选项
  - `encoding` (BufferEncoding | null): 文件编码，如 `'utf8'`、`'utf-8'`、`'base64'` 等
  - `flag` (string): 文件系统标志，如 `'r'`（默认）

**返回值:**

- 不传 `encoding` 时返回 `Uint8Array`（二进制数据）
- 传入 `encoding` 时返回 `string`（文本内容）

**示例:**

```typescript
// 读取文本文件
const text = await eidos.space.fs.readFile("~/readme.md", "utf8")
console.log(text) // "# 我的项目\n这是一个示例项目..."

// 读取 JSON 文件
const configText = await eidos.space.fs.readFile("~/config.json", "utf8")
const config = JSON.parse(configText)

// 使用选项对象读取
const content = await eidos.space.fs.readFile("~/data.txt", {
  encoding: "utf8",
})

// 读取二进制文件（图片、视频等）
const imageData = await eidos.space.fs.readFile("~/image.png")
console.log(imageData) // Uint8Array(1234) [137, 80, 78, 71, ...]

// 读取挂载文件夹中的文件
const musicData = await eidos.space.fs.readFile("@/music/song.mp3")
```

**常见用例:**

```typescript
// 读取并解析 JSON 配置文件
async function loadConfig(path: string) {
  const content = await eidos.space.fs.readFile(path, "utf8")
  return JSON.parse(content)
}

// 读取图片并转换为 base64
async function imageToBase64(path: string) {
  const data = await eidos.space.fs.readFile(path)
  const base64 = btoa(String.fromCharCode(...data))
  return `data:image/png;base64,${base64}`
}

// 读取文本文件并按行处理
async function processTextFile(path: string) {
  const content = await eidos.space.fs.readFile(path, "utf8")
  const lines = content.split("\n")
  return lines.filter((line) => line.trim().length > 0)
}
```

### `writeFile(path, data, options?)`

写入文件内容（类似 Node.js `fs.writeFile`）。

```typescript
writeFile(
  path: string,
  data: string | Uint8Array,
  options?: {
    encoding?: BufferEncoding | null
    mode?: number
    flag?: string
  } | BufferEncoding
): Promise<void>
```

**参数:**

- `path` (string): 文件路径，支持 `~/` 或 `@/` 前缀
- `data` (string | Uint8Array): 要写入的内容
  - `string`: 文本内容
  - `Uint8Array`: 二进制数据
- `options` (可选): 写入选项
  - `encoding` (BufferEncoding | null): 文件编码，默认 `'utf8'`
  - `mode` (number): 文件权限模式，默认 `0o666`
  - `flag` (string): 文件系统标志，默认 `'w'`（覆盖写入）

**示例:**

```typescript
// 写入文本文件
await eidos.space.fs.writeFile("~/hello.txt", "Hello, World!")

// 写入 JSON 数据
const config = { theme: "dark", language: "zh-CN" }
await eidos.space.fs.writeFile(
  "~/config.json",
  JSON.stringify(config, null, 2),
  "utf8"
)

// 写入二进制数据
const imageData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
await eidos.space.fs.writeFile("~/image.png", imageData)

// 使用选项对象写入
await eidos.space.fs.writeFile("~/data.txt", "内容", {
  encoding: "utf8",
  mode: 0o644,
})

// 写入到挂载文件夹
await eidos.space.fs.writeFile("@/backup/data.json", JSON.stringify(data))
```

**常见用例:**

```typescript
// 保存用户配置
async function saveConfig(config: object) {
  const content = JSON.stringify(config, null, 2)
  await eidos.space.fs.writeFile("~/config.json", content, "utf8")
  eidos.space.notify("配置已保存")
}

// 导出数据到文件
async function exportData(data: any[], filename: string) {
  const csv = data.map((row) => Object.values(row).join(",")).join("\n")
  await eidos.space.fs.writeFile(`@/exports/${filename}`, csv, "utf8")
}

// 保存 Canvas 截图
async function saveCanvasToFile(canvas: HTMLCanvasElement, path: string) {
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob(resolve as any, "image/png")
  )
  const arrayBuffer = await blob!.arrayBuffer()
  const data = new Uint8Array(arrayBuffer)
  await eidos.space.fs.writeFile(path, data)
}

// 创建日志文件（追加模式）
async function appendLog(message: string) {
  const timestamp = new Date().toISOString()
  const logEntry = `[${timestamp}] ${message}\n`
  try {
    const existing = await eidos.space.fs.readFile("~/app.log", "utf8")
    await eidos.space.fs.writeFile("~/app.log", existing + logEntry)
  } catch {
    await eidos.space.fs.writeFile("~/app.log", logEntry)
  }
}
```

### `stat(path)`

获取文件或目录的统计信息（类似 Node.js `fs.stat`）。

```typescript
stat(path: string): Promise<IStats>

interface IStats {
  size: number              // 文件大小（字节）
  mtimeMs: number          // 最后修改时间（毫秒时间戳）
  atimeMs: number          // 最后访问时间（毫秒时间戳）
  ctimeMs: number          // 状态更改时间（毫秒时间戳）
  birthtimeMs: number      // 创建时间（毫秒时间戳）
  isFile: boolean          // 是否为文件
  isDirectory: boolean     // 是否为目录
  isSymbolicLink: boolean  // 是否为符号链接
  isBlockDevice: boolean   // 是否为块设备
  isCharacterDevice: boolean // 是否为字符设备
  isFIFO: boolean          // 是否为 FIFO 管道
  isSocket: boolean        // 是否为套接字
  mode: number             // 文件权限模式
  uid: number              // 用户 ID
  gid: number              // 组 ID
}
```

**参数:**

- `path` (string): 文件或目录路径，支持 `~/` 或 `@/` 前缀

**返回值:**

- `IStats` 对象，包含文件或目录的详细信息

**示例:**

```typescript
// 获取文件信息
const stats = await eidos.space.fs.stat("~/readme.md")
console.log(`文件大小: ${stats.size} 字节`)
console.log(`是否为文件: ${stats.isFile}`)
console.log(`最后修改时间: ${new Date(stats.mtimeMs)}`)

// 检查是文件还是目录
const stats = await eidos.space.fs.stat("~/src")
if (stats.isDirectory) {
  console.log("这是一个目录")
} else if (stats.isFile) {
  console.log("这是一个文件")
}

// 获取挂载文件夹中的文件信息
const musicStats = await eidos.space.fs.stat("@/music/song.mp3")
console.log(`歌曲大小: ${(musicStats.size / 1024 / 1024).toFixed(2)} MB`)
```

**常见用例:**

```typescript
// 检查文件是否存在
async function fileExists(path: string): Promise<boolean> {
  try {
    await eidos.space.fs.stat(path)
    return true
  } catch {
    return false
  }
}

// 获取文件大小（人类可读格式）
async function getFileSize(path: string): Promise<string> {
  const stats = await eidos.space.fs.stat(path)
  const bytes = stats.size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

// 列出目录中的文件及其大小
async function listFilesWithSize(dirPath: string) {
  const files = await eidos.space.fs.readdir(dirPath)
  const filesWithSize = await Promise.all(
    files.map(async (file) => {
      const filePath = `${dirPath}/${file}`
      const stats = await eidos.space.fs.stat(filePath)
      return {
        name: file,
        size: stats.size,
        isDirectory: stats.isDirectory,
        modified: new Date(stats.mtimeMs),
      }
    })
  )
  return filesWithSize
}

// 查找最近修改的文件
async function findRecentlyModified(dirPath: string, days: number = 7) {
  const files = await eidos.space.fs.readdir(dirPath)
  const now = Date.now()
  const cutoff = now - days * 24 * 60 * 60 * 1000

  const recentFiles = []
  for (const file of files) {
    const stats = await eidos.space.fs.stat(`${dirPath}/${file}`)
    if (stats.isFile && stats.mtimeMs > cutoff) {
      recentFiles.push({
        name: file,
        modified: new Date(stats.mtimeMs),
      })
    }
  }
  return recentFiles.sort((a, b) => b.modified.getTime() - a.modified.getTime())
}

// 比较两个文件的修改时间
async function isNewer(file1: string, file2: string): Promise<boolean> {
  const stats1 = await eidos.space.fs.stat(file1)
  const stats2 = await eidos.space.fs.stat(file2)
  return stats1.mtimeMs > stats2.mtimeMs
}
```

**支持的路径:**

- `~/` - 项目根目录
- `~/src/index.js` - 项目文件
- `@/music` - 挂载文件夹根目录
- `@/music/albums/song.mp3` - 挂载文件夹中的文件

### `rename(oldPath, newPath)`

重命名文件或目录（类似 Node.js `fs.rename`）。

```typescript
rename(oldPath: string, newPath: string): Promise<void>
```

**参数:**

- `oldPath` (string): 当前文件或目录路径，支持 `~/` 或 `@/` 前缀
- `newPath` (string): 新的文件或目录路径，支持 `~/` 或 `@/` 前缀

**重要提示：**

- 两个路径必须都是虚拟路径或都是真实路径，不能混合使用
- 对于虚拟路径（如 `~/.eidos/__NODES__/` 下的节点），重命名会更新数据库中的记录
- 对于真实路径，重命名会修改文件系统中的文件或目录
- 重命名也可以用于移动文件或目录到不同的位置

**示例:**

```typescript
// 重命名文件
await eidos.space.fs.rename("~/old-name.md", "~/new-name.md")

// 重命名目录
await eidos.space.fs.rename("~/old-folder", "~/new-folder")

// 移动文件到不同目录
await eidos.space.fs.rename("~/src/old.js", "~/lib/new.js")

// 重命名挂载文件夹中的文件
await eidos.space.fs.rename("@/music/old-song.mp3", "@/music/new-song.mp3")

// 重命名节点（虚拟路径）
await eidos.space.fs.rename(
  "~/.eidos/__NODES__/node-id",
  "~/.eidos/__NODES__/New Name"
)

// 重命名扩展（虚拟路径）
await eidos.space.fs.rename(
  "~/.eidos/__EXTENSIONS__/ext-id",
  "~/.eidos/__EXTENSIONS__/new-slug.ts"
)
```

**常见用例:**

```typescript
// 批量重命名文件
async function renameFiles(files: string[], prefix: string) {
  for (const file of files) {
    const dir = file.substring(0, file.lastIndexOf("/"))
    const name = file.substring(file.lastIndexOf("/") + 1)
    const newName = `${prefix}-${name}`
    await eidos.space.fs.rename(file, `${dir}/${newName}`)
  }
}

// 整理文件到按日期组织的目录
async function organizeByDate(filePath: string) {
  const stats = await eidos.space.fs.stat(filePath)
  const date = new Date(stats.mtimeMs)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const dir = `@/archive/${year}/${month}`

  // 确保目录存在
  await eidos.space.fs.mkdir(dir, { recursive: true })

  // 移动文件
  const fileName = filePath.substring(filePath.lastIndexOf("/") + 1)
  await eidos.space.fs.rename(filePath, `${dir}/${fileName}`)
}

// 重命名并备份原文件
async function renameWithBackup(oldPath: string, newPath: string) {
  const backupPath = `${oldPath}.backup`
  // 先复制文件（通过读取和写入）
  const content = await eidos.space.fs.readFile(oldPath)
  await eidos.space.fs.writeFile(backupPath, content)
  // 然后重命名原文件
  await eidos.space.fs.rename(oldPath, newPath)
}
```

### `watch(path, options?)`

监听文件或目录的变化（类似 Node.js `fs.watch`）。

```typescript
watch(path: string, options?: IWatchOptions): AsyncIterable<IWatchEvent>

interface IWatchOptions {
  encoding?: BufferEncoding    // 编码格式，默认 'utf8'
  persistent?: boolean          // 是否持续监听，默认 true
  recursive?: boolean           // 是否递归监听子目录，默认 false
  signal?: AbortSignal          // 用于取消监听的信号
}

interface IWatchEvent {
  eventType: 'rename' | 'change'  // 事件类型：'rename' 表示文件/目录创建或删除，'change' 表示文件内容变化
  filename: string                 // 发生变化的文件名或路径
}
```

**参数:**

- `path` (string): 要监听的文件或目录路径，支持 `~/` 或 `@/` 前缀
- `options` (IWatchOptions, 可选): 监听选项

**返回值:**

- 返回一个 `AsyncIterable<IWatchEvent>`，可以使用 `for await...of` 循环监听变化

**重要提示：**

- 对于虚拟路径（如 `~/.eidos/__NODES__/`），只能监听根虚拟目录
- 使用 `AbortSignal` 可以优雅地停止监听
- `eventType` 为 `'rename'` 时表示文件/目录的创建或删除
- `eventType` 为 `'change'` 时表示文件内容的变化

**示例:**

```typescript
// 监听节点目录的变化
for await (const event of eidos.space.fs.watch("~/.eidos/__NODES__/")) {
  console.log(
    `节点 ${event.filename} ${event.eventType === "rename" ? "创建/删除" : "内容变化"}`
  )
}

// 监听扩展目录的变化
for await (const event of eidos.space.fs.watch("~/.eidos/__EXTENSIONS__/")) {
  if (event.eventType === "rename") {
    console.log(`扩展 ${event.filename} 已创建或删除`)
  } else {
    console.log(`扩展 ${event.filename} 内容已更新`)
  }
}

// 递归监听目录及其子目录
for await (const event of eidos.space.fs.watch("~/src", {
  recursive: true,
})) {
  console.log(`文件 ${event.filename} 发生变化`)
}

// 使用 AbortSignal 控制监听时长
const controller = new AbortController()
const { signal } = controller

// 5 秒后自动停止监听
setTimeout(() => controller.abort(), 5000)

for await (const event of eidos.space.fs.watch("~/", {
  recursive: true,
  signal,
})) {
  console.log(`变化: ${event.filename}`)
}

// 监听挂载文件夹
for await (const event of eidos.space.fs.watch("@/music", {
  recursive: true,
})) {
  console.log(`音乐文件 ${event.filename} 发生变化`)
}
```

**常见用例:**

```typescript
// 监听文件变化并自动重新加载
async function watchAndReload(filePath: string, callback: () => void) {
  for await (const event of eidos.space.fs.watch(filePath)) {
    if (event.eventType === "change") {
      console.log(`文件 ${filePath} 已更新，重新加载...`)
      callback()
    }
  }
}

// 监听目录变化并同步到数据库
async function syncDirectoryChanges(dirPath: string) {
  for await (const event of eidos.space.fs.watch(dirPath, {
    recursive: true,
  })) {
    if (event.eventType === "rename") {
      // 文件创建或删除
      const fullPath = `${dirPath}/${event.filename}`
      try {
        await eidos.space.fs.stat(fullPath)
        // 文件存在，说明是创建
        console.log(`新文件: ${fullPath}`)
        // 同步到数据库...
      } catch {
        // 文件不存在，说明是删除
        console.log(`文件已删除: ${fullPath}`)
        // 从数据库删除...
      }
    } else {
      // 文件内容变化
      console.log(`文件已更新: ${event.filename}`)
      // 更新数据库...
    }
  }
}

// 带超时的监听
async function watchWithTimeout(path: string, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    for await (const event of eidos.space.fs.watch(path, {
      signal: controller.signal,
    })) {
      console.log(`变化: ${event.filename}`)
    }
  } catch (error) {
    if (error.name === "AbortError") {
      console.log("监听已超时")
    } else {
      throw error
    }
  } finally {
    clearTimeout(timeout)
  }
}

// 监听多个目录
async function watchMultipleDirs(paths: string[]) {
  const watchers = paths.map((path) =>
    eidos.space.fs.watch(path, { recursive: true })
  )

  // 使用 Promise.race 监听所有目录
  const events = watchers.map(async function* (watcher) {
    for await (const event of watcher) {
      yield event
    }
  })

  // 合并所有事件流
  for await (const event of mergeAsyncIterables(...events)) {
    console.log(`变化: ${event.filename}`)
  }
}

// 辅助函数：合并多个 AsyncIterable
async function* mergeAsyncIterables<T>(
  ...iterables: AsyncIterable<T>[]
): AsyncIterable<T> {
  const iterators = iterables.map((it) => it[Symbol.asyncIterator]())
  const nextPromises = iterators.map((it) => it.next())

  while (nextPromises.length > 0) {
    const { value, done } = await Promise.race(
      nextPromises.map((p, i) => p.then((result) => ({ ...result, index: i })))
    )

    if (done) {
      nextPromises.splice(value.index, 1)
      iterators.splice(value.index, 1)
    } else {
      yield value.value
      nextPromises[value.index] = iterators[value.index].next()
    }
  }
}
```

**支持的路径:**

- `~/` - 项目根目录
- `~/src` - 项目子目录
- `~/.eidos/__NODES__/` - 节点目录（虚拟路径，仅支持根目录）
- `~/.eidos/__EXTENSIONS__/` - 扩展目录（虚拟路径，仅支持根目录）
- `@/music` - 挂载文件夹根目录
- `@/music/albums` - 挂载文件夹子目录

---

## Graft (版本控制) API

`eidos.space.graft` 对象提供了对 Graft 的访问，Graft 是一个用于 SQLite 数据库的分布式版本控制系统。你可以把它想象成 **"数据库界的 Git"**：它允许你跟踪更改、与远程仓库同步，并管理数据空间的不同版本。

:::note
这些方法是 [Graft SQLite PRAGMAs](https://graft.rs/docs/sqlite/pragmas/) 的高级封装。
:::

### `status()`

获取当前同步状态，包括领先（ahead）和落后（behind）的提交数量。

```typescript
async status(): Promise<{
  ahead: number        // 尚未推送到远程的本地提交数量
  behind: number       // 尚未拉取到本地的远程提交数量
  last_pushed_at: string
  last_pulled_at: string
}>
```

**示例:**

```typescript
const status = await eidos.space.graft.status()
if (status.behind > 0) {
  console.log(`你落后了 ${status.behind} 个提交。正在拉取...`)
  await eidos.space.graft.pull()
}
```

### `fetch()`

从远程服务器获取最新状态而不应用它。这会更新本地对远程状态的了解（例如更新状态中的 `behind` 计数），但不会修改你的数据。

```typescript
async fetch(): Promise<void>
```

### `pull()`

从远程服务器拉取更改并应用到本地空间。

- 首先执行 `fetch`。
- 将远程更改合并到本地数据库。
- 如果应用了更改，会自动触发页面重新加载。

```typescript
async pull(): Promise<void>
```

### `push()`

将本地更改推送到远程服务器。

```typescript
async push(): Promise<void>
```

### `tags()`

获取此空间可用的所有标签（快照）列表。

```typescript
async tags(): Promise<Array<{
  tag: string         // 标签名称
  log_id: string      // 日志/提交的唯一 ID
  created_at: string  // 创建时间戳
}>>
```

**示例:**

```typescript
const tags = await eidos.space.graft.tags()
tags.forEach((tag) => console.log(`快照: ${tag.tag} (${tag.created_at})`))
```

### `clone(remoteLogId?)`

重置本地空间以匹配远程状态或特定快照。

:::danger
**破坏性操作**: 这将用远程或指定快照的数据替换你当前的本地数据。任何未推送的本地更改都将丢失。
:::

```typescript
async clone(remoteLogId?: string): Promise<void>
```

**参数:**

- `remoteLogId` (string, 可选): 要克隆的特定日志 ID。如果省略，则从默认分支的头部（最新）克隆。

### `hydrate()`

从快照填充（Hydrate）本地数据库。这用于将数据库恢复到从 Graft 存储的数据中提取的一致状态。

```typescript
async hydrate(): Promise<void>
```

### `info()`

获取有关 Graft 状态的详细信息，例如快照大小、页计数和版本信息。

```typescript
async info(): Promise<any>
```

### `audit()`

根据远程状态审计本地数据库，以检查一致性和完整性问题。

```typescript
async audit(): Promise<any>
```

### `volumes()`

列出与此空间关联的卷（Volumes）。卷在 Graft 中代表一个独特的存储单元或分支。

```typescript
async volumes(): Promise<any[]>
```

### `version()`

获取正在使用的 Graft 扩展和协议的版本。

```typescript
async version(): Promise<{ graft_version: string }>
```
