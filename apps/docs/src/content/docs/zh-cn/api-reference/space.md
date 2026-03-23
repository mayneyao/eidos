---
title: Space API 参考
description: Eidos Space 功能的完整 API 参考
sidebar:
  order: 4
---

`eidos.space` 对象提供了对所有数据空间功能的访问，包括导航、文档管理和扩展节点操作。

:::tip
`eidos.space` 暴露的接口比文档中记录的更多。但是，为了稳定性，请尽量使用文档中提到的接口。我们会逐步评估哪些方法可以暴露。
:::

---

## 常用方法

### `navigate(path: string, options?)`

导航到当前空间内的节点。

```typescript
navigate(path: string, options?: { target?: "_blank" | "_self" }): void
```

**参数：**

- `path` (string): 要导航到的路径，相对于当前空间
- `options` (object, 可选): 导航选项
  - `target` (string, 可选): 在哪里打开导航目标
    - `"_self"` (默认): 在当前标签页打开
    - `"_blank"`: 在新标签页打开

**支持的路径格式：**

- `"/<nodeId>"` - 通过 ID 导航到特定节点
- `"/<tableId>"` - 导航到表格视图
- `"/<docId>#<hash>"` - 导航到文档（支持 hash 锚点，例如 `#title`）
- `"/2025-09-30"` - 导航到基于日期的节点
- `"/extensions/<extensionId>"` - 导航到扩展
- `"/blocks/<blockId>"` - 导航到区块
- `"/file-handler/#<filePath>"` - 导航到文件处理器

**示例：**

```typescript
// 导航到特定表格
eidos.space.navigate("/table_123")

// 导航到文档
eidos.space.navigate("/doc_456")

// 导航到文档中的特定标题
eidos.space.navigate("/doc_456#my-title")

// 导航到今天的页面
const today = new Date().toISOString().split("T")[0]
eidos.space.navigate(`/${today}`)

// 导航到扩展
eidos.space.navigate("/extensions/my-extension")

// 导航到区块
eidos.space.navigate("/blocks/block_789")

// 导航到文件处理器（在项目文件夹中打开文件）
eidos.space.navigate("/file-handler/#~/readme.md")

// 导航到文件处理器（在挂载文件夹中打开文件）
eidos.space.navigate("/file-handler/#@/music/song.mp3")

// 在新标签页中打开
eidos.space.navigate("/doc_456", { target: "_blank" })
```

### `notify(msg: string)`

向用户显示支持 markdown 的通知。支持通过按钮进行高级交互。

```typescript
// 简单模式：传递字符串作为通知内容
notify(msg: string): void

// 完整模式：传递对象以自定义标题和内容
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

**参数：**

- `msg` (string | object): 通知消息
  - **简单模式**: 传递字符串，将显示为通知内容，默认标题为 "通知"
  - **完整模式**: 传递包含以下内容的对象：
    - `title` (string): 通知标题
    - `description` (string): 通知描述（支持 markdown）
    - `actions` (Array): 可选的交互按钮
      - `label` (string): 按钮文本
      - `action` (string): 要执行的操作：`"reload"`（刷新页面）或 `"dismiss"`（关闭通知）
      - `variant` (string): 按钮样式：`"primary"`（实心）或 `"secondary"`（轮廓）

**示例：**

```typescript
// 简单模式 - 快速通知
eidos.space.notify("操作完成")

// 完整模式 - 自定义标题和内容
eidos.space.notify({
  title: "任务完成",
  description: "成功处理了 **100 条记录** 并更新了数据库。",
})

// 带交互操作
await eidos.space.notify({
  title: "有可用更新",
  description: "有新版本可用。您想刷新页面吗？",
  actions: [
    { label: "稍后", action: "dismiss", variant: "secondary" },
    { label: "立即刷新", action: "reload", variant: "primary" },
  ],
})
```

---

## Node API

`eidos.space.node` 对象提供了一个统一的接口，用于管理所有节点类型（文档、表格、文件夹、数据视图和扩展节点），支持基于路径的寻址。

请参阅 [Node API 参考](./node/) 获取完整文档。

**快速示例：**

```typescript
// 通过路径获取节点
const node = await eidos.space.node.get("projects/roadmap")

// 创建文档
await eidos.space.node.create("notes/idea", "doc", {
  content: "# 我的想法",
})

// 移动或重命名
await eidos.space.node.move("drafts/article", "published/article")

// 删除
await eidos.space.node.delete("old-document")
```

---

## Table API

表格操作已移至专门的页面。

- [Table SDK (CRUD)](../table/sdk/): findMany、create、update、delete 等。
- [Schema 管理](../table/schema/): createTable、addField、createView 等。
- [Field 对象](../table/fields/): 字段类型参考和属性。
- [View 对象](../table/views/): 视图类型参考和属性。

---

## Document API

`eidos.space.doc` 对象提供文档内容管理功能。

:::tip[通过路径寻址]
启用名称唯一性后，可以通过路径寻址文档：

```typescript
await eidos.space.doc.read("notes/idea")
await eidos.space.doc.write("notes/idea", "# 内容")
```

:::

### 内容操作（基于路径）

#### `read(path: string)`

通过路径读取文档内容。返回 markdown。

```typescript
async read(path: string): Promise<string>
```

**示例：**

```typescript
// 读取文档内容
const content = await eidos.space.doc.read("notes/ideas")
console.log(content)
```

#### `write(path: string, markdown: string)`

通过路径写入文档内容（覆盖现有内容）。

```typescript
async write(path: string, markdown: string): Promise<void>
```

**示例：**

```typescript
// 写入文档内容
await eidos.space.doc.write("notes/ideas", "# 我的想法\n\n- 想法 1")

// 通过 node.create 创建并写入内容
await eidos.space.node.create("notes/new-doc", "doc", {
  content: "# 初始内容",
})
```

#### `append(path: string, markdown: string)`

通过路径追加文档内容。

```typescript
async append(path: string, markdown: string): Promise<void>
```

**示例：**

```typescript
// 追加到每日日志
await eidos.space.doc.append("journal/daily", "\n## 晚上\n去散步了。")

// 追加命令输出
const output = await eidos.space.exec("some command")
await eidos.space.doc.append("logs/output", output)
```

#### `prepend(path: string, markdown: string)`

通过路径前置文档内容。

```typescript
async prepend(path: string, markdown: string): Promise<void>
```

**示例：**

```typescript
// 向现有文档添加标题
await eidos.space.doc.prepend("notes/ideas", "# 想法合集\n\n")

// 向日志添加时间戳
await eidos.space.doc.prepend(
  "logs/activity",
  `[${new Date().toISOString()}] 开始\n`
)
```

### 内容操作（基于 ID）

#### `getMarkdown(id: string)`

通过 ID 获取文档的 Markdown 内容。

```typescript
async getMarkdown(id: string): Promise<string>
```

**示例：**

```typescript
const markdown = await eidos.space.doc.getMarkdown("doc_123")
console.log("Markdown 内容:", markdown)
```

### 文档属性

#### `getProperties(id: string)`

获取文档的所有属性（包括系统属性和自定义属性）。

```typescript
async getProperties(id: string): Promise<Record<string, any>>
```

**示例：**

```typescript
const allProps = await eidos.space.doc.getProperties("doc_123")
console.log("所有属性:", allProps)
```

#### `setProperties(id: string, properties: Record<string, any>)`

设置文档的属性。

```typescript
async setProperties(id: string, properties: Record<string, any>): Promise<{ success: boolean; message?: string; updatedProperties?: string[] }>
```

**示例：**

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

#### `deleteProperty(propertyName: string)`

删除指定的属性列。

```typescript
async deleteProperty(propertyName: string): Promise<void>
```

**示例：**

```typescript
await eidos.space.doc.deleteProperty("old_property")
console.log("属性已删除")
```

---

## Theme API

`eidos.space.theme` 对象提供了主题管理功能，用于自定义空间的外观。主题存储在 `<space>/.eidos/themes/<theme-name>/` 目录中。

### 存储结构

```
<space>/.eidos/
└── themes/
    ├── <theme-name-1>/
    │   ├── theme.css       # 主题样式（必需）
    │   └── manifest.json   # 主题元数据（可选）
    └── <theme-name-2>/
        ├── theme.css
        └── manifest.json
```

**主题 CSS 示例：**

```css
/* 定义浅色模式的 CSS 变量 */
:root {
  --background: hsl(0 0% 100%);
  --foreground: hsl(222.2 84% 4.9%);
  --primary: hsl(222.2 47.4% 11.2%);
  --primary-foreground: hsl(210 40% 98%);
  /* ... 更多变量 */
}

/* 定义深色模式的 CSS 变量 */
.dark {
  --background: hsl(222.2 84% 4.9%);
  --foreground: hsl(210 40% 98%);
  --primary: hsl(210 40% 98%);
  --primary-foreground: hsl(222.2 47.4% 11.2%);
  /* ... 更多变量 */
}
```

**Manifest 示例：**

```json
{
  "name": "我的自定义主题",
  "version": "1.0.0",
  "author": "张三",
  "description": "一个简洁极简的主题"
}
```

### `list()`

列出空间中所有可用的主题。

```typescript
async list(): Promise<ThemeInfo[]>

interface ThemeInfo {
  name: string
  manifest?: {
    name?: string
    version?: string
    author?: string
    description?: string
  }
}
```

**返回：**

- 包含主题名称和可选 manifest 数据的 `ThemeInfo` 对象数组

**示例：**

```typescript
// 列出所有主题
const themes = await eidos.space.theme.list()
console.log(themes)
// [
//   { name: "Default" },
//   { name: "dark-pro", manifest: { name: "Dark Pro", author: "Eidos" } }
// ]

// 显示主题名称
for (const theme of themes) {
  console.log(theme.name)
  if (theme.manifest) {
    console.log(`  作者 ${theme.manifest.author}`)
    console.log(`  ${theme.manifest.description}`)
  }
}
```

### `getCss(name: string)`

获取主题的 CSS 内容。

```typescript
async getCss(name: string): Promise<string | null>
```

**参数：**

- `name` (string): 主题名称

**返回：**

- CSS 内容字符串，如果主题不存在则返回 `null`

**示例：**

```typescript
// 获取主题 CSS
const css = await eidos.space.theme.getCss("dark-pro")
if (css) {
  console.log("主题已加载:", css.length, "个字符")
}
```

### `get(name: string)`

获取完整的主题信息，包括 CSS 和 manifest。

```typescript
async get(name: string): Promise<{
  name: string
  css: string
  manifest?: ThemeManifest
} | null>
```

**参数：**

- `name` (string): 主题名称

**返回：**

- 包含 name、css 和可选 manifest 的主题对象，如果主题不存在则返回 `null`

**示例：**

```typescript
// 获取完整的主题信息
const theme = await eidos.space.theme.get("dark-pro")
if (theme) {
  console.log(theme.name)
  console.log(theme.css)
  console.log(theme.manifest?.author)
}
```

### `install(name: string, css: string, manifest?)`

安装或更新主题。

```typescript
async install(
  name: string,
  css: string,
  manifest?: ThemeManifest
): Promise<void>

interface ThemeManifest {
  name?: string
  version?: string
  author?: string
  description?: string
}
```

**参数：**

- `name` (string): 主题名称（将用作目录名）
- `css` (string): 主题 CSS 内容
- `manifest` (可选): 主题元数据

**示例：**

```typescript
// 安装简单主题
const css = `
:root {
  --primary: hsl(222.2 47.4% 11.2%);
}
`
await eidos.space.theme.install("my-theme", css)

// 安装带元数据的主题
await eidos.space.theme.install("my-theme", css, {
  name: "我的自定义主题",
  version: "1.0.0",
  author: "张三",
  description: "一个简洁极简的主题",
})
```

### `uninstall(name: string)`

从空间中删除主题。

```typescript
async uninstall(name: string): Promise<void>
```

**参数：**

- `name` (string): 要删除的主题名称

**示例：**

```typescript
// 卸载主题
await eidos.space.theme.uninstall("old-theme")
console.log("主题已移除")
```

### `getCurrent()`

获取当前激活的主题名称。

```typescript
async getCurrent(): Promise<string | null>
```

**返回：**

- 当前主题名称，如果使用默认主题则返回 `null`

**示例：**

```typescript
// 获取当前主题
const current = await eidos.space.theme.getCurrent()
if (current) {
  console.log(`当前主题: ${current}`)
} else {
  console.log("使用默认主题")
}
```

### `setCurrent(name: string | null)`

设置激活的主题。

```typescript
async setCurrent(name: string | null): Promise<void>
```

**参数：**

- `name` (string | null): 要激活的主题名称，或 `null` 重置为默认主题

**示例：**

```typescript
// 应用主题
await eidos.space.theme.setCurrent("dark-pro")

// 重置为默认
await eidos.space.theme.setCurrent(null)
```

## 文件系统 API

Eidos 提供了一个受限的外部文件 API，可以访问原生文件系统。这是一个受限机制，提供安全的文件系统访问能力。

**支持的路径：**

- **项目文件夹** (`~/`) - `.eidos` 所在的项目目录
- **挂载文件夹** (`@/`) - 外部挂载的目录

### 路径格式

| 路径格式           | 描述                          |
| ------------------ | ----------------------------- |
| `~/src/main.js`    | 项目文件夹（.eidos 所在位置） |
| `@/music/song.mp3` | 挂载文件夹                    |

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

**参数：**

- `path` (string): 目录路径，支持 `~/` 或 `@/` 前缀
- `options.withFileTypes` (boolean): 可选，返回带类型信息的 `IDirectoryEntry` 对象
- `options.recursive` (boolean): 可选，递归列出所有子目录

**返回：**

- 默认返回文件名数组
- 使用 `withFileTypes: true` 时，返回带 `name`、`path`、`parentPath` 和 `kind` 属性的 `IDirectoryEntry` 对象数组
- 使用 `recursive: true` 时，递归列出所有子目录

**示例：**

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

// 递归列出带类型信息
const allEntries = await eidos.space.fs.readdir("~/", {
  withFileTypes: true,
  recursive: true,
})

// 列出挂载文件夹
const musicFiles = await eidos.space.fs.readdir("@/music")

// 递归列出挂载文件夹中的所有文件
const allMusicFiles = await eidos.space.fs.readdir("@/music", {
  recursive: true,
})

// 访问 .eidos/files 目录（可通过 ~/ 自然访问）
const eidosFiles = await eidos.space.fs.readdir("~/.eidos/files")
console.log(eidosFiles)
// ["photo.jpg", "document.pdf", "data.json"]

// 递归列出 .eidos/files 中的所有文件
const allEidosFiles = await eidos.space.fs.readdir("~/.eidos/files", {
  recursive: true,
})
```

**支持的路径：**

- `~/` - 项目根目录
- `~/src` - 项目子目录
- `~/.eidos/files/` - 项目文件夹内的 .eidos 子目录
- `@/music` - 挂载文件夹根目录
- `@/music/albums` - 挂载文件夹子目录

### `mkdir(path, options?)`

创建目录（类似 Node.js `fs.mkdir`）。

```typescript
mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>
```

**参数：**

- `path` (string): 要创建的目录路径
- `options.recursive` (boolean): 可选，是否创建父目录

**返回：**

- 返回创建的目录路径，如果目录已存在则返回 `undefined`

**示例：**

```typescript
// 在挂载文件夹中创建目录
await eidos.space.fs.mkdir("@/work/projects")

// 递归创建嵌套目录
await eidos.space.fs.mkdir("@/work/2024/Q1", { recursive: true })
```

**常见用例：**

```typescript
// 按年月整理文件
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

**参数：**

- `path` (string): 文件路径，支持 `~/` 或 `@/` 前缀
- `options` (可选): 读取选项
  - `encoding` (BufferEncoding | null): 文件编码，例如 `'utf8'`、`'utf-8'`、`'base64'` 等
  - `flag` (string): 文件系统标志，例如 `'r'`（默认）

**返回：**

- 未指定 `encoding` 时返回 `Uint8Array`（二进制数据）
- 指定 `encoding` 时返回 `string`（文本内容）

**示例：**

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

// 从挂载文件夹读取文件
const musicData = await eidos.space.fs.readFile("@/music/song.mp3")
```

**常见用例：**

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

// 读取文本文件并逐行处理
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

**参数：**

- `path` (string): 文件路径，支持 `~/` 或 `@/` 前缀
- `data` (string | Uint8Array): 要写入的内容
  - `string`: 文本内容
  - `Uint8Array`: 二进制数据
- `options` (可选): 写入选项
  - `encoding` (BufferEncoding | null): 文件编码，默认 `'utf8'`
  - `mode` (number): 文件权限模式，默认 `0o666`
  - `flag` (string): 文件系统标志，默认 `'w'`（覆盖）

**示例：**

```typescript
// 写入文本文件
await eidos.space.fs.writeFile("~/hello.txt", "你好，世界！")

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
await eidos.space.fs.writeFile("~/data.txt", "content", {
  encoding: "utf8",
  mode: 0o644,
})

// 写入挂载文件夹
await eidos.space.fs.writeFile("@/backup/data.json", JSON.stringify(data))
```

**常见用例：**

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

获取文件或目录统计信息（类似 Node.js `fs.stat`）。

```typescript
stat(path: string): Promise<IStats>

interface IStats {
  size: number              // 文件大小（字节）
  mtimeMs: number          // 最后修改时间（毫秒时间戳）
  atimeMs: number          // 最后访问时间（毫秒时间戳）
  ctimeMs: number          // 状态改变时间（毫秒时间戳）
  birthtimeMs: number      // 创建时间（毫秒时间戳）
  isFile: boolean          // 是否是文件
  isDirectory: boolean     // 是否是目录
  isSymbolicLink: boolean  // 是否是符号链接
  isBlockDevice: boolean   // 是否是块设备
  isCharacterDevice: boolean // 是否是字符设备
  isFIFO: boolean          // 是否是 FIFO 管道
  isSocket: boolean        // 是否是套接字
  mode: number             // 文件权限模式
  uid: number              // 用户 ID
  gid: number              // 组 ID
}
```

**参数：**

- `path` (string): 文件或目录路径，支持 `~/` 或 `@/` 前缀

**返回：**

- 包含详细文件或目录信息的 `IStats` 对象

**示例：**

```typescript
// 获取文件信息
const stats = await eidos.space.fs.stat("~/readme.md")
console.log(`文件大小: ${stats.size} 字节`)
console.log(`是文件: ${stats.isFile}`)
console.log(`最后修改: ${new Date(stats.mtimeMs)}`)

// 检查是文件还是目录
const stats = await eidos.space.fs.stat("~/src")
if (stats.isDirectory) {
  console.log("这是一个目录")
} else if (stats.isFile) {
  console.log("这是一个文件")
}

// 从挂载文件夹获取文件信息
const musicStats = await eidos.space.fs.stat("@/music/song.mp3")
console.log(`歌曲大小: ${(musicStats.size / 1024 / 1024).toFixed(2)} MB`)
```

**常见用例：**

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

// 获取人类可读的文件大小
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

**支持的路径：**

- `~/` - 项目根目录
- `~/src/index.js` - 项目文件
- `@/music` - 挂载文件夹根目录
- `@/music/albums/song.mp3` - 挂载文件夹中的文件

### `rename(oldPath, newPath)`

重命名文件或目录（类似 Node.js `fs.rename`）。

```typescript
rename(oldPath: string, newPath: string): Promise<void>
```

**参数：**

- `oldPath` (string): 当前文件或目录路径，支持 `~/` 或 `@/` 前缀
- `newPath` (string): 新文件或目录路径，支持 `~/` 或 `@/` 前缀

**重要说明：**

- 两个路径必须都是虚拟路径或都是真实路径，不能混用
- 对于虚拟路径（例如 `~/.eidos/__NODES__/` 下的节点），重命名会更新数据库记录
- 对于真实路径，重命名会修改文件系统中的文件或目录
- 重命名也可用于将文件或目录移动到不同位置

**示例：**

```typescript
// 重命名文件
await eidos.space.fs.rename("~/old-name.md", "~/new-name.md")

// 重命名目录
await eidos.space.fs.rename("~/old-folder", "~/new-folder")

// 将文件移动到不同目录
await eidos.space.fs.rename("~/src/old.js", "~/lib/new.js")

// 在挂载文件夹中重命名文件
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

**常见用例：**

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

// 按日期整理文件
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

// 带备份的重命名
async function renameWithBackup(oldPath: string, newPath: string) {
  const backupPath = `${oldPath}.backup`
  // 首先复制文件（通过读取和写入）
  const content = await eidos.space.fs.readFile(oldPath)
  await eidos.space.fs.writeFile(backupPath, content)
  // 然后重命名原文件
  await eidos.space.fs.rename(oldPath, newPath)
}
```

### `watch(path, options?)`

监视文件或目录的更改（类似 Node.js `fs.watch`）。

```typescript
watch(path: string, options?: IWatchOptions): AsyncIterable<IWatchEvent>

interface IWatchOptions {
  encoding?: BufferEncoding    // 编码格式，默认 'utf8'
  persistent?: boolean          // 是否持续监视，默认 true
  recursive?: boolean           // 是否递归监视子目录，默认 false
  signal?: AbortSignal          // 取消监视的信号
}

interface IWatchEvent {
  eventType: 'rename' | 'change'  // 事件类型：'rename' 表示文件/目录创建或删除，'change' 表示文件内容更改
  filename: string                 // 更改的文件名或路径
}
```

**参数：**

- `path` (string): 要监视的文件或目录路径，支持 `~/` 或 `@/` 前缀
- `options` (IWatchOptions, 可选): 监视选项

**返回：**

- 返回一个 `AsyncIterable<IWatchEvent>`，可与 `for await...of` 循环一起使用来监视更改

**重要说明：**

- 对于虚拟路径（例如 `~/.eidos/__NODES__/`），只能监视根虚拟目录
- 使用 `AbortSignal` 优雅地停止监视
- `eventType` 为 `'rename'` 表示文件/目录创建或删除
- `eventType` 为 `'change'` 表示文件内容更改

**示例：**

```typescript
// 监视 nodes 目录的更改
for await (const event of eidos.space.fs.watch("~/.eidos/__NODES__/")) {
  console.log(
    `Node ${event.filename} ${event.eventType === "rename" ? "创建/删除" : "内容更改"}`
  )
}

// 监视 extensions 目录的更改
for await (const event of eidos.space.fs.watch("~/.eidos/__EXTENSIONS__/")) {
  if (event.eventType === "rename") {
    console.log(`Extension ${event.filename} 创建或删除`)
  } else {
    console.log(`Extension ${event.filename} 内容更新`)
  }
}

// 递归监视目录和子目录
for await (const event of eidos.space.fs.watch("~/src", {
  recursive: true,
})) {
  console.log(`文件 ${event.filename} 更改`)
}

// 使用 AbortSignal 控制监视持续时间
const controller = new AbortController()
const { signal } = controller

// 5 秒后自动停止监视
setTimeout(() => controller.abort(), 5000)

for await (const event of eidos.space.fs.watch("~/", {
  recursive: true,
  signal,
})) {
  console.log(`更改: ${event.filename}`)
}

// 监视挂载文件夹
for await (const event of eidos.space.fs.watch("@/music", {
  recursive: true,
})) {
  console.log(`音乐文件 ${event.filename} 更改`)
}
```

**常见用例：**

```typescript
// 监视文件更改并自动重载
async function watchAndReload(filePath: string, callback: () => void) {
  for await (const event of eidos.space.fs.watch(filePath)) {
    if (event.eventType === "change") {
      console.log(`文件 ${filePath} 更新，正在重载...`)
      callback()
    }
  }
}

// 监视目录更改并同步到数据库
async function syncDirectoryChanges(dirPath: string) {
  for await (const event of eidos.space.fs.watch(dirPath, {
    recursive: true,
  })) {
    if (event.eventType === "rename") {
      // 文件创建或删除
      const fullPath = `${dirPath}/${event.filename}`
      try {
        await eidos.space.fs.stat(fullPath)
        // 文件存在，是创建
        console.log(`新文件: ${fullPath}`)
        // 同步到数据库...
      } catch {
        // 文件不存在，是删除
        console.log(`文件删除: ${fullPath}`)
        // 从数据库删除...
      }
    } else {
      // 文件内容更改
      console.log(`文件更新: ${event.filename}`)
      // 更新数据库...
    }
  }
}

// 带超时的监视
async function watchWithTimeout(path: string, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    for await (const event of eidos.space.fs.watch(path, {
      signal: controller.signal,
    })) {
      console.log(`更改: ${event.filename}`)
    }
  } catch (error) {
    if (error.name === "AbortError") {
      console.log("监视超时")
    } else {
      throw error
    }
  } finally {
    clearTimeout(timeout)
  }
}

// 监视多个目录
async function watchMultipleDirs(paths: string[]) {
  const watchers = paths.map((path) =>
    eidos.space.fs.watch(path, { recursive: true })
  )

  // 使用 Promise.race 监视所有目录
  const events = watchers.map(async function* (watcher) {
    for await (const event of watcher) {
      yield event
    }
  })

  // 合并所有事件流
  for await (const event of mergeAsyncIterables(...events)) {
    console.log(`更改: ${event.filename}`)
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

**支持的路径：**

- `~/` - 项目根目录
- `~/src` - 项目子目录
- `~/.eidos/__NODES__/` - Nodes 目录（虚拟路径，仅根目录）
- `~/.eidos/__EXTENSIONS__/` - Extensions 目录（虚拟路径，仅根目录）
- `@/music` - 挂载文件夹根目录
- `@/music/albums` - 挂载文件夹子目录

---

## Graft（版本控制）API

`eidos.space.graft` 对象提供对 Graft 的访问，Graft 是一个用于 SQLite 数据库的分布式版本控制系统。可以将其视为**数据库的 Git**：它允许您跟踪更改、与远程仓库同步以及管理数据空间的不同版本。

:::note
这些方法是 [Graft SQLite PRAGMAs](https://graft.rs/docs/sqlite/pragmas/) 的高级包装器。
:::

### `status()`

获取当前同步状态，包括 ahead/behind 提交计数。

```typescript
async status(): Promise<{
  ahead: number        // 尚未推送的本地提交数
  behind: number       // 尚未拉取的远程提交数
  last_pushed_at: string
  last_pulled_at: string
}>
```

**示例：**

```typescript
const status = await eidos.space.graft.status()
if (status.behind > 0) {
  console.log(`落后 ${status.behind} 个提交。正在拉取...`)
  await eidos.space.graft.pull()
}
```

### `pull()`

从远程仓库拉取最新更改。

```typescript
async pull(): Promise<void>
```

**示例：**

```typescript
await eidos.space.graft.pull()
console.log("拉取成功完成")
```

### `push()`

将本地提交推送到远程仓库。

```typescript
async push(): Promise<void>
```

**示例：**

```typescript
await eidos.space.graft.push()
console.log("推送成功完成")
```

### `fetch()`

从远程仓库获取最新更改而不合并它们。

```typescript
async fetch(): Promise<void>
```

**示例：**

```typescript
await eidos.space.graft.fetch()
const status = await eidos.space.graft.status()
console.log(`获取后落后 ${status.behind} 个提交`)
```

### `clone(remoteLogId?: string)`

将远程仓库克隆到当前空间。

```typescript
async clone(remoteLogId?: string): Promise<void>
```

**参数：**

- `remoteLogId` (string, 可选): 要克隆的远程日志 ID。如果未提供，则使用默认远程。

**示例：**

```typescript
// 克隆默认远程
await eidos.space.graft.clone()

// 克隆特定远程
await eidos.space.graft.clone("https://sync.eidos.space/logs/abc123")
```

### `info()`

获取当前 Graft 仓库的信息。

```typescript
async info(): Promise<any>
```

### `tags()`

列出仓库中的所有标签。

```typescript
async tags(): Promise<any[]>
```

### `audit()`

根据远程状态审计本地数据库，检查一致性和完整性问题。

```typescript
async audit(): Promise<any>
```

### `volumes()`

列出与此空间关联的卷。卷代表 Graft 中不同的存储单元或分支。

```typescript
async volumes(): Promise<any[]>
```

### `version()`

获取正在使用的 Graft 扩展和协议的版本。

```typescript
async version(): Promise<{ graft_version: string }>
```
