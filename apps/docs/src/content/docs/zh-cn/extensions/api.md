---
title: API & SDK
---

Eidos 没有提供传统的 REST API，而是通过统一的 SDK 接口来暴露 Eidos 的核心能力。这意味着无论是官方功能、扩展开发还是 API 调用，都使用相同的接口和方法。

## 统一的调用方式

Eidos 提供了三种不同的使用场景，但它们都使用相同的 API 接口：

### 1. 扩展开发

在扩展中，您可以直接使用全局的 `eidos` 对象：

```ts
// 查询当前空间的表格数据
eidos.currentSpace.table("tableId").rows.query()

// 操作指定空间的表格
eidos.space("mySpace").table("tableId").rows.add({
  name: "新记录",
  status: "active",
})
```

### 2. HTTP API 调用

通过 RPC 接口，您可以远程调用相同的方法。

```ts
const response = await fetch("http://localhost:13127/rpc", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    space: "mySpace",
    method: "table('tableId').rows.query",
    params: [],
  }),
})

const data = await response.json()
console.log(data)
```

### 3. Headless 模式

Headless 模式是 Eidos 的一个强大特性，允许您在不依赖 Eidos Desktop 的情况下独立运行 Eidos 实例。

#### 核心概念

每个 Eidos Space 本质上就是一个独立的 SQLite 文件，这意味着：

- **完全独立**：每个 Space 可以单独导出和运行
- **轻量级部署**：只需要 SQLite 文件即可启动完整的 Eidos 实例
- **易于集成**：可以快速集成到任何 JavaScript/TypeScript 运行时应用中

#### 使用方式

其核心围绕着 `DataSpace` 展开。构建一个 `DataSpace` 实例，然后就可以使用相同的 API 进行操作：

```ts
import { DataSpace } from "@eidos.space/core"

// 1. Initialize database adapter
const db = new DenoServerDatabase("./db.sqlite3")

// 2. Create DataSpace instance
const dataSpace = new DataSpace({
  db: db,
  activeUndoManager: false,
  dbName: "your-db-name",
  context: {
    // Runtime-specific API implementations
    setInterval: undefined,
  },
  // TODO: Filesystem manager implementation
  efsManager: new EidosFileSystemManager(),
})
```

#### 典型应用场景

**1. 博客系统**

```ts
const posts = await dataSpace.table("posts").rows.query()
```

**2. 个人网站 CMS**

```ts
const pages = await dataSpace.table("pages").rows.query()
```

**3. API 服务后端**

```ts
import express from "express"

// RESTful API 端点
app.get("/api/users", async (req, res) => {
  const users = await dataSpace.table("users").rows.query()
  res.json(users)
})

app.post("/api/users", async (req, res) => {
  const newUser = await dataSpace.table("users").rows.add(req.body)
  res.json(newUser)
})
```

## API 参考

Eidos 提供了完整的 API 参考文档，详细说明了所有可用的方法和功能：

- [Space API 参考](../../api-reference/space) - 导航、文档管理和扩展节点操作
- [AI API 参考](../../api-reference/ai) - 文本生成和结构化数据处理
