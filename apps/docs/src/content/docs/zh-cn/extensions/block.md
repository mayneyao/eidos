---
title: Block
description: 一个通用的 UI 扩展框架，实现自定义渲染和交互功能。
sidebar:
  order: 3
  badge: RFC
---

Block 扩展框架是一个通用的 UI 扩展解决方案，提供轻量级的单文件 UI 扩展方法，支持 React 组件渲染，同时在不同环境中保持可重用性。

## 1. 设计原则

### 1.1 轻量级设计

- 采用单文件组件方法，便于项目间重用代码
- 复杂组件建议使用传统方法开发并发布到 npm
- 保持关注点分离，减少维护开销

### 1.2 无构建开发体验

- 零配置构建，保存后立即预览更改
- 自动将导入转换为最新的外部包版本
- 利用 npm 生态系统，减少版本管理复杂性

### 1.3 导入解析策略

使用标准 Node.js 导入语法，自动解析到外部包：

```tsx
// 标准导入语法
import { Excalidraw } from "@excalidraw/excalidraw"

// 自动解析为: https://esm.sh/@excalidraw/excalidraw
```

## 2. 内置组件库集成

### 2.1 Shadcn/ui 集成

提供与 Shadcn/ui 组件的无缝集成，实现与 Eidos 界面一致的 UI 样式：

```tsx
import { Button } from "@/components/ui/button"
```

组件与主应用程序共享主题配置，同时支持独立的主题自定义。

### 2.2 AI 辅助开发

Shadcn/ui 的 LLM 友好架构促进了 AI 辅助开发，在简单场景下无需手动编码即可生成代码。

## 3. 运行时环境

Block 组件在标准 React 组件的浏览器环境中执行。在 Eidos Desktop 中，每个 Block 都在独立域中运行：

```
<extid>.block.<spaceId>.eidos.localhost:13127
```

## 4. 扩展类型和规范

### 4.1 表格视图扩展

提供超出默认网格、画廊和看板视图的自定义可视化选项。

#### 元配置

```typescript
interface TableViewMeta {
  type: "tableView"
  componentName: string
  tableView: {
    title: string
    type: string // 内置类型: grid, gallery, kanban
    description: string
  }
}
```

#### 数据存储

自定义扩展视图类型信息存储在 `eidos__views` 表中，采用 `ext__<type>` 格式：

- 内置视图：`grid`、`gallery`、`kanban`
- 自定义扩展：`ext__list`、`ext__timeline`、`ext__chart` 等

#### URL 访问模式

当作为表格视图扩展渲染时，块将访问以下 URL 结构：

```
<extid>.block.<spaceId>.eidos.localhost:13127/<tableid>/<viewid>
```

#### 实现示例

```tsx
export const meta = {
  type: "tableView",
  componentName: "MyListView",
  tableView: {
    title: "列表视图",
    type: "list",
    description: "这是一个列表视图",
  },
}

export function MyListView() {
  const [rows, setRows] = useState<any[]>([])

  // 从 URL 中获取 tableId 和 viewId
  const pathParts = window.location.pathname.split("/")
  const tableId = pathParts[pathParts.length - 2]
  const viewId = pathParts[pathParts.length - 1]

  useEffect(() => {
    const Table = eidos.currentSpace.table(tableId)
    Table.findMany().then(setRows)
  }, [tableId, viewId])

  return (
    <div>
      {rows.map((row) => (
        <div key={row._id}>{row.title}</div>
      ))}
    </div>
  )
}
```

### 4.2 扩展节点类型

提供超出默认文档和表格节点的自定义节点类型，具有一致的目录树行为但自定义渲染逻辑。

#### URL 访问模式

```
<extid>.block.<spaceId>.eidos.localhost:13127/<nodeid>
```

#### 元配置

```typescript
interface ExtNodeMeta {
  type: "extNode"
  componentName: string
  extNode: {
    title: string
    description: string
    type: string
  }
}
```

#### 实现示例

**客户端数据检索（仅本地）：**

```tsx
export const meta = {
  type: "extNode",
  componentName: "MyExcalidraw",
  extNode: {
    title: "Excalidraw",
    description: "这是一个 excalidraw 节点",
    type: "excalidraw",
  },
}

export function MyExcalidraw() {
  const [initialData, setInitialData] = useState("")
  const nodeId = window.location.pathname.split("/").pop()

  useEffect(() => {
    eidos.currentSpace.extNode.getText(nodeId).then((text) => {
      setInitialData(JSON.parse(text))
    })
  }, [nodeId])

  return <Excalidraw initialData={initialData} />
}
```

**服务端数据检索（可发布）：**

```tsx
export const loader = async () => {
  const nodeid = request.url.split("/").pop()
  const text = await eidos.currentSpace.extNode.getText(nodeid)
  return { props: { text } }
}

export function MyExtNode({ text }: { text: string }) {
  return <div>{text}</div>
}
```

### 4.3 文件处理器扩展

提供自定义文件类型处理器，类似操作系统的"打开方式"功能，让 Block 扩展可以注册为特定文件类型的处理器。

:::tip[File Handler vs ExtNode]
**内外之分**：

- **File Handler（文件处理器）**: 处理**外部文件**，即本地文件系统中的文件（项目文件 `~/`、挂载文件 `@/`）。这些文件独立于 Eidos 数据库存在。

- **ExtNode（扩展节点）**: 处理**内部数据**，即存储在 Eidos SQLite 数据库中的结构化数据。ExtNode 的数据通过 `eidos.currentSpace.extNode.getText()`/`setText()` 等方法访问，完全由 Eidos 管理。

简单来说：File Handler 打开文件系统中的文件，ExtNode 管理数据库中的数据。
:::

#### URL 访问模式

文件路径通过 hash 传递：

```
<extid>.block.<spaceId>.eidos.localhost:13127#<filePath>
```

**重要提示：** 文件路径在 URL hash 中是经过 URL 编码的（例如空格会被编码为 `%20`），因此在读取时需要先移除开头的 `#`，然后使用 `decodeURIComponent()` 进行解码。

**支持的文件路径格式：**

| 路径格式            | 说明                           | 示例                    |
| ------------------- | ------------------------------ | ----------------------- |
| `~/path/to/file`    | 项目文件夹（.eidos 所在目录）  | `~/readme.md`           |
| `@/mount/path/file` | 挂载文件夹（需授权）           | `@/music/song.mp3`      |

**URL 示例：**

```
# 打开项目中的 README 文件
markdown-editor.block.my-space.eidos.localhost:13127#~/readme.md

# 播放挂载的音乐文件（包含空格的文件名会被编码）
audio-player.block.my-space.eidos.localhost:13127#@/music/my%20song.mp3
```

#### 元配置

```typescript
interface FileHandlerMeta {
  type: "fileHandler"
  componentName: string
  fileHandler: {
    title: string // 处理器名称
    description: string // 描述
    extensions: string[] // 支持的扩展名，如 [".md", ".markdown"]
    icon?: string // 可选图标
  }
}
```

#### 处理器选择逻辑

系统会自动查询 `eidos__extensions` 表找出所有支持该文件扩展名的处理器：

1. 如果只有一个处理器，直接使用
2. 如果有多个处理器，查询用户设置的默认处理器（存储在 KV 表中）
3. 如果没有设置默认，提示用户选择

**默认处理器存储：**

```typescript
// 仅在存在多个处理器时才需要在 KV 表中存储用户偏好
// 键格式: eidos:space:file:handler:default:<扩展名>
// 值: 处理器扩展 ID

await eidos.currentSpace.kv.put(
  `eidos:space:file:handler:default:.md`,
  "markdown-editor-ext-id"
)
```

#### 实现示例

**Markdown 编辑器：**

```tsx
export const meta = {
  type: "fileHandler",
  componentName: "MarkdownEditor",
  fileHandler: {
    title: "Markdown 编辑器",
    description: "支持实时预览的 Markdown 编辑器",
    extensions: [".md", ".markdown"],
    icon: "📝",
  },
}

export function MarkdownEditor() {
  const [content, setContent] = useState("")
  // 从 hash 中获取文件路径，需要先移除 # 然后解码 URL 编码
  const filePath = decodeURIComponent(window.location.hash.slice(1))

  useEffect(() => {
    // 读取文件内容
    eidos.currentSpace.fs
      .readFile(filePath, "utf8")
      .then(setContent)
      .catch((err) => {
        eidos.currentSpace.notify({ title: "错误", description: `无法读取文件: ${err.message}` })
      })
  }, [filePath])

  const handleSave = async () => {
    try {
      await eidos.currentSpace.fs.writeFile(filePath, content, "utf8")
      eidos.currentSpace.notify("文件已保存")
    } catch (err) {
      eidos.currentSpace.notify({ title: "错误", description: `保存失败: ${err.message}` })
    }
  }

  return (
    <div className="flex h-screen">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-1/2 p-4"
      />
      <div className="w-1/2 p-4 markdown-preview">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
      <button onClick={handleSave}>保存</button>
    </div>
  )
}
```

**音频播放器：**

```tsx
export const meta = {
  type: "fileHandler",
  componentName: "AudioPlayer",
  fileHandler: {
    title: "音频播放器",
    description: "支持多种音频格式的播放器",
    extensions: [".mp3", ".flac", ".wav", ".ogg", ".m4a"],
    icon: "🎵",
  },
}

export function AudioPlayer() {
  const [audioUrl, setAudioUrl] = useState("")
  // 从 hash 中获取文件路径，需要先移除 # 然后解码 URL 编码
  const filePath = decodeURIComponent(window.location.hash.slice(1))

  useEffect(() => {
    // 构造音频 URL（通过 Eidos 的文件服务）
    const url = `http://${window.location.host}${filePath}`
    setAudioUrl(url)
  }, [filePath])

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h2 className="text-2xl font-bold mb-4">{filePath.split("/").pop()}</h2>
      <audio controls src={audioUrl} className="w-full max-w-md">
        您的浏览器不支持音频播放
      </audio>
    </div>
  )
}
```

#### 文件访问 API

使用 `eidos.currentSpace.fs` API 访问文件：

```typescript
// 读取文本文件
const text = await eidos.currentSpace.fs.readFile(filePath, "utf8")

// 读取二进制文件
const data = await eidos.currentSpace.fs.readFile(filePath)

// 写入文件
await eidos.currentSpace.fs.writeFile(filePath, content, "utf8")

// 获取文件信息
const stats = await eidos.currentSpace.fs.stat(filePath)
```

更多文件系统 API 详情，请参阅 [Space API 参考 - 文件系统 API](/zh-cn/api-reference/space/#文件系统-api)。

## 5. 指令系统

Block 支持一套指令系统，专为无需复杂 `meta` 配置对象的轻量级扩展设计。通过在文件顶部添加特定的字符串字面量，你可以轻松定义 Block 的行为和渲染方式。

这些指令简化了开发流程，让你无需额外的 API 开销即可开启特定的系统集成功能（如侧边栏渲染或新标签页）。

### 5.1 use sidebar 指令

`use sidebar` 指令用于指示 Block 组件应该在左侧边栏中渲染，而不是在主区域打开。

#### 默认行为

当 Block 被添加到左侧边栏标签页时，**默认行为**是点击后在主区域打开独立的 Block 页面：

```tsx
// 默认行为 - 在主区域打开
export function MyDashboard() {
  return (
    <div>
      <h1>仪表盘</h1>
      <p>这个组件会在主区域的独立页面中显示</p>
    </div>
  )
}
```

这种默认行为适用于：

- 仪表盘组件
- 数据可视化
- 详细内容页面
- 需要较大显示区域的功能

#### 使用指令改变行为

如果希望 Block 在侧边栏中直接展示（如导航栏、工具栏等），需要添加 `use sidebar` 指令：

```tsx
"use sidebar"

// 在侧边栏中渲染
export function MyNavigation() {
  const navigateToTable = () => {
    eidos.currentSpace.navigate("/table_123")
  }

  const navigateToToday = () => {
    const today = new Date().toISOString().split("T")[0]
    eidos.currentSpace.navigate(`/${today}`)
  }

  return (
    <div className="space-y-2">
      <h3 className="font-medium">快速导航</h3>

      <button
        onClick={navigateToTable}
        className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
      >
        📊 我的表格
      </button>

      <button
        onClick={navigateToToday}
        className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
      >
        📅 今日页面
      </button>

      <button
        onClick={() => eidos.currentSpace.navigate("/extensions")}
        className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
      >
        🔧 扩展管理
      </button>
    </div>
  )
}
```

**指令行为说明：**

- 包含 `use sidebar` 指令的 Block 点击后会在侧边栏中直接渲染组件内容
- 不包含此指令的 Block 点击后导航到主区域的独立 Block 页面
- 指令必须作为字符串字面量出现在文件顶部

**适用场景：**

- 导航栏组件
- 工具栏组件
- 快速操作面板
- 状态显示组件
- 侧边栏工具

### 5.2 use newtab 指令

`use newtab` 指令允许将 Block 组件配置为自定义的新标签页（New Tab）。

#### 配置方法

1. 在 Block 文件顶部添加 `"use newtab"`。
2.前往 **设置** -> **空间设置** -> **新标签页**。
3. 从列表中选择你的 Block。

```tsx
"use newtab"

export function MyNewTab() {
  return (
    <div className="p-8">
      <h1>早上好！</h1>
      {/* 自定义仪表盘内容 */}
    </div>
  )
}
```

#### 行为说明

- 配置完成后，打开新标签页（或主页）将渲染此 Block，而不是默认的 Eidos 仪表盘。
- 你可以随时在设置中恢复为默认仪表盘。

## 6. 安全注意事项

扩展执行应该被适当沙箱化，防止未经授权的系统访问。实现必须验证组件属性，并在扩展和主机应用程序之间强制执行适当的隔离。

## 7. 实现要求

- 需要特定扩展功能时，应导出符合指定接口的 `meta` 对象
- 不导出 `meta` 对象时，组件作为普通 React 组件运行
- 导出 `meta` 对象时，`meta.componentName` 必须与实际导出的组件匹配
- 应实现适当的错误边界和加载状态
- 与应用程序数据交互时，必须通过 Eidos SDK 执行

## 8. 未来扩展

本规范可能会扩展以支持其他扩展类型，包括但不限于：

- **自定义字段渲染器**: 为表格字段提供自定义渲染和编辑组件
- **MIME 类型支持**: 文件处理器支持基于 MIME 类型的匹配
- **协议处理器**: 支持自定义 URL 协议（如 `eidos://`, `notion://`）
- **上下文菜单扩展**: 为文件和节点提供自定义右键菜单项
- **命令面板扩展**: 注册自定义命令到全局命令面板
