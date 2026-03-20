---
title: Node API 参考
description: 管理 Eidos 中节点（文档、表格、文件夹、数据视图）的统一 API
sidebar:
  order: 3
---

`eidos.space.node` 对象提供了一个统一的**语义化接口**，用于管理 Eidos 中的所有节点类型。当**节点名称唯一性**开启时，节点可以通过人类可读的路径（如 `folder/document`）来访问，而不需要使用 UUID。

```typescript
// 通过路径访问节点（需要名称唯一性）
// 路径相对于 space 根目录，不需要 "/" 前缀
eidos.space.node.get("projects/roadmap")
eidos.space.node.create("projects/ideas/new-idea", "doc")
eidos.space.node.move("drafts/article", "published/article")

// 或使用传统的 ID
eidos.space.node.getById("abc123")
```

## 核心概念

### 节点类型

| 类型          | 描述                | 图标 |
| ------------- | ------------------- | ---- |
| `doc`         | Markdown 内容文档   | 📄   |
| `table`       | 结构化数据表格      | 📊   |
| `folder`      | 用于组织节点的容器  | 📁   |
| `dataview`    | 保存的查询/数据视图 | 👁   |
| `ext__{type}` | 扩展定义的节点类型  | 🔌   |

### 基于路径的寻址

当开启节点名称唯一性时，节点可以通过相对于 space 根目录的路径来寻址：

- `folder` - 根目录下的文件夹
- `folder/doc` - 文件夹内的文档
- `folder/subfolder/table` - 嵌套路径

:::tip
基于路径的寻址需要在 space 设置中开启**节点名称唯一性**。如果未开启，请使用 `getById()` 代替。
:::

---

## 常用方法

### `get(path: string)`

通过路径获取节点。返回完整的节点元数据。

```typescript
async get(path: string): Promise<Node | null>

interface Node {
  id: string
  name: string
  type: 'doc' | 'table' | 'folder' | 'dataview' | string
  parent_id: string | null
  created_at: string
  updated_at: string
  is_pinned: boolean
  is_deleted: boolean
  // 类型特定的元数据
  metadata?: Record<string, any>
}
```

**示例：**

```typescript
const node = await eidos.space.node.get("projects/roadmap")
if (node) {
  console.log(`找到 ${node.type}: ${node.name}`)
  console.log(`ID: ${node.id}`)
}
```

### `getById(id: string)`

通过 UUID 获取节点。无论是否开启名称唯一性都可用。

```typescript
async getById(id: string): Promise<Node | null>
```

**示例：**

```typescript
const node = await eidos.space.node.getById("abc123def456")
```

### `list(path?: string)`

列出某路径下的子节点。

```typescript
async list(path?: string): Promise<Node[]>
```

**参数：**

- `path` (string, 可选): 要列出的路径。默认为根目录 `/`。

**示例：**

```typescript
// 列出根节点
const rootNodes = await eidos.space.node.list()

// 列出文件夹中的节点
const docs = await eidos.space.node.list("projects")
docs.forEach((node) => {
  console.log(`${node.type}: ${node.name}`)
})
```

### `create(path: string, type: string, options?: object)`

在指定路径创建新节点。

```typescript
-async create(
-  path: string,
-  type: 'doc' | 'table' | 'folder' | 'dataview',
-  options?: CreateOptions
-): Promise<Node>
-
-interface CreateOptions {
-  content?: string           // 初始内容（用于文档）
-  schema?: TableSchema       // 表格结构（用于表格）
-  query?: string             // 查询字符串（用于数据视图）
-  hideProperties?: boolean   // 隐藏属性面板
-}
+// 重载签名
+async create(path: string, type: 'folder', options?: FolderCreateOptions): Promise<Node>
+async create(path: string, type: 'doc', options?: DocCreateOptions): Promise<Node>
+async create(path: string, type: 'table', options?: TableCreateOptions): Promise<Node>
+async create(path: string, type: 'dataview', options?: DataViewCreateOptions): Promise<Node>
+
+interface FolderCreateOptions {
+  /**
+   * 如果中间的父文件夹不存在，则自动创建。
+   * @default true
+   */
+  recursive?: boolean
+}
+
+interface DocCreateOptions {
+  content?: string           // 初始 Markdown 内容
+  hideProperties?: boolean   // 隐藏属性面板
+}
+
+interface TableCreateOptions {
+  schema?: TableSchema       // 初始表格结构
+  hideProperties?: boolean   // 隐藏属性面板
+}
+
+interface DataViewCreateOptions {
+  query?: string             // 初始 SQL 查询
+  hideProperties?: boolean   // 隐藏属性面板
+}
```

**示例：**

```typescript
// 创建文件夹（自动创建不存在的中间文件夹）
await eidos.space.node.create("projects/2025/q1", "folder")

// 创建带内容的文档
await eidos.space.node.create("projects/readme", "doc", {
  content: "# 项目 README\n\n这是 readme 文件。",
})

// 创建表格
await eidos.space.node.create("projects/tasks", "table", {
  schema: {
    columns: [
      { name: "title", type: "title" },
      { name: "status", type: "select", options: ["todo", "done"] },
      { name: "due", type: "date" },
    ],
  },
})

// 创建数据视图
await eidos.space.node.create("projects/active-tasks", "dataview", {
  query: "SELECT * FROM tasks WHERE status = 'todo'",
})
```

### `move(source: string, destination: string)`

移动或重命名节点。

```typescript
async move(source: string, destination: string): Promise<Node>
```

**示例：**

```typescript
// 移动到不同文件夹
await eidos.space.node.move("drafts/article", "published/article")

// 原地重命名
await eidos.space.node.move("projects/old-name", "projects/new-name")

// 移动到根目录
await eidos.space.node.move("archive/2024/report", "report")
```

### `delete(path: string, options?: object)`

删除节点。

```typescript
async delete(path: string, options?: DeleteOptions): Promise<void>

interface DeleteOptions {
  permanent?: boolean   // 默认：false（移入回收站）
  recursive?: boolean   // 默认：false（文件夹需要）
}
```

**示例：**

```typescript
// 移入回收站（默认）
await eidos.space.node.delete("old-document")

// 永久删除
await eidos.space.node.delete("sensitive-data", { permanent: true })

// 删除文件夹及其所有内容
await eidos.space.node.delete("old-project", { recursive: true })
```

### `exists(path: string)`

检查给定路径是否存在节点。

```typescript
async exists(path: string): Promise<boolean>
```

**示例：**

```typescript
if (await eidos.space.node.exists("readme")) {
  console.log("Readme 已存在")
} else {
  await eidos.space.node.create("readme", "doc")
}
```

---

## 类型特定操作

### 操作文档

```typescript
// 通过路径读取文档内容
const content = await eidos.space.doc.read("notes/idea")

// 通过路径写入文档内容（覆盖）
await eidos.space.doc.write("notes/idea", "# 更新的内容")

// 追加内容到文档
await eidos.space.doc.append("journal/daily", "\n## 晚间\n去散步了。")

// 前置内容到文档
await eidos.space.doc.prepend("notes/ideas", "# 想法收集\n\n")
```

### 操作表格

```typescript
// 获取表格引用
const table = await eidos.space.node.get("projects/tasks")
const tableId = table.id

// 使用表格 SDK
const rows = await eidos.currentSpace.table(tableId).rows.findMany({
  where: { status: "todo" },
})
```

### 操作数据视图

```typescript
// 创建数据视图
const dataview = await eidos.space.node.create("dashboard/active", "dataview", {
  query: `SELECT title, status, due FROM tasks WHERE status != 'done'`,
})

// 刷新数据视图结果
const results = await eidos.space.dataView.refresh(dataview.id)
```

### 操作扩展节点

扩展节点 (`ext__{type}`) 可以使用文本或二进制存储来保存自定义数据。

#### `getText(id: string)`

获取扩展节点的文本内容。

```typescript
async getText(id: string): Promise<string | null>
```

**示例：**

```typescript
const node = await eidos.space.node.get("diagrams/flowchart")
const textContent = await eidos.space.node.getText(node.id)
if (textContent) {
  const data = JSON.parse(textContent)
  console.log("解析的数据:", data)
}
```

#### `setText(id: string, text: string)`

设置扩展节点的文本内容。

```typescript
async setText(id: string, text: string): Promise<boolean>
```

**示例：**

```typescript
const node = await eidos.space.node.get("diagrams/flowchart")
const data = { elements: [], appState: {} }
await eidos.space.node.setText(node.id, JSON.stringify(data))
```

#### `getBlob(id: string)`

获取扩展节点的二进制数据。

```typescript
async getBlob(id: string): Promise<Buffer | null>
```

**示例：**

```typescript
const node = await eidos.space.node.get("drawings/sketch")
const blobData = await eidos.space.node.getBlob(node.id)
if (blobData) {
  console.log("二进制数据大小:", blobData.length)
}
```

#### `setBlob(id: string, blob: Buffer)`

设置扩展节点的二进制数据。

```typescript
async setBlob(id: string, blob: Buffer): Promise<boolean>
```

**示例：**

```typescript
const node = await eidos.space.node.get("drawings/sketch")
const buffer = Buffer.from("some binary data")
await eidos.space.node.setBlob(node.id, buffer)
```

---

## 高级方法

### `find(query: object)`

在整个 space 中搜索节点。

```typescript
async find(query: FindQuery): Promise<Node[]>

interface FindQuery {
  name?: string           // 按名称搜索（部分匹配）
  type?: string | string[] // 按类型过滤
  parent?: string         // 限制在特定父路径下
  isDeleted?: boolean     // 包含已删除节点
}
```

**示例：**

```typescript
// 查找名称包含 "spec" 的所有文档
const specs = await eidos.space.node.find({
  name: "spec",
  type: "doc",
})

// 查找文件夹中的所有表格
const tables = await eidos.space.node.find({
  type: "table",
  parent: "projects",
})
```

### `duplicate(path: string, newPath?: string)`

复制节点。

```typescript
async duplicate(path: string, newPath?: string): Promise<Node>
```

**示例：**

```typescript
// 复制并自动生成名称（"Document Copy"）
await eidos.space.node.duplicate("templates/project")

// 复制并指定新名称
await eidos.space.node.duplicate("templates/project", "templates/project-v2")
```

### `resolvePath(path: string)`

将路径解析为节点 ID（用于调试）。

```typescript
async resolvePath(path: string): Promise<{ id: string; node: Node } | null>
```

**示例：**

```typescript
const resolved = await eidos.space.node.resolvePath("projects/roadmap")
if (resolved) {
  console.log(`路径解析为: ${resolved.id}`)
}
```

---

## 错误处理

常见错误及处理方法：

```typescript
try {
  await eidos.space.node.create("existing-path", "doc")
} catch (error) {
  if (error.message.includes("already exists")) {
    // 处理重复名称
    console.log("节点已存在，改为更新...")
  }
}

try {
  await eidos.space.node.move("a", "b/c")
} catch (error) {
  if (error.message.includes("parent not found")) {
    // 父路径不存在
    console.log("创建父文件夹...")
    await eidos.space.node.create("b", "folder")
    await eidos.space.node.move("a", "b/c")
  }
}
```

---

## CLI 等价命令

Node API 设计与 CLI 命令保持一致：

| CLI 命令           | SDK 等价写法                                  |
| ------------------ | --------------------------------------------- |
| `eidos ls path`    | `eidos.space.node.list("path")`               |
| `eidos cat path`   | `eidos.space.node.get("path")` + 类型特定获取 |
| `eidos mkdir path` | `eidos.space.node.create("path", "folder")`   |
| `eidos touch path` | `eidos.space.node.create("path", "doc")`      |
| `eidos mv a b`     | `eidos.space.node.move("a", "b")`             |
| `eidos rm path`    | `eidos.space.node.delete("path")`             |
