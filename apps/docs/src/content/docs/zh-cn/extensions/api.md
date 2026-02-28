---
title: API & SDK
---

Eidos 没有提供传统的 REST API，而是通过统一的 SDK 接口来暴露 Eidos 的核心能力。这意味着无论是官方功能、扩展开发还是 API 调用，都使用相同的接口和方法。

## 统一的调用方式

Eidos 提供了三种不同的使用场景，但它们都使用相同的 API 接口：

### 1. 扩展开发

在扩展中，您可以直接使用全局的 `eidos` 对象：

```ts
// 查询当前空间的表格数据（tableId 是不带连字符的 UUIDv7）
const Users = eidos.currentSpace.table("01935b4c9d2e7f8a0b1c2d3e4f5a6b7c")

// CRUD 操作
const users = await Users.findMany()
const newUser = await Users.create({
  data: { name: "新记录", status: "active" },
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
    method: "table('01935b4c9d2e7f8a0b1c2d3e4f5a6b7c').findMany",
    params: [{}],
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

// 1. 初始化数据库适配器
const db = new DenoServerDatabase("./db.sqlite3")

// 2. 创建 DataSpace 实例
const dataSpace = new DataSpace({
  db: db,
  activeUndoManager: false,
  dbName: "your-db-name",
  context: {
    // 运行时特定的 API 实现
    setInterval: undefined,
  },
  // TODO: 文件系统管理器实现
  efsManager: new EidosFileSystemManager(),
})
```

#### 典型应用场景

**1. 博客系统**

```ts
const Posts = dataSpace.table("01935b4c9d2e7f8a0b1c2d3e4f5a6b7c")
const posts = await Posts.findMany()
```

**2. 个人网站 CMS**

```ts
const Pages = dataSpace.table("01935b4c9d2e7f8a0b1c2d3e4f5a6b7c")
const pages = await Pages.findMany()
```

**3. API 服务后端**

```ts
import express from "express"

const Users = dataSpace.table("01935b4c9d2e7f8a0b1c2d3e4f5a6b7c")

// RESTful API 端点
app.get("/api/users", async (req, res) => {
  const users = await Users.findMany()
  res.json(users)
})

app.post("/api/users", async (req, res) => {
  const newUser = await Users.create({ data: req.body })
  res.json(newUser)
})
```

## API 参考

Eidos 提供了完整的 API 参考文档，详细说明了所有可用的方法和功能：

- [Space API 参考](../../api-reference/space) - 导航、文档管理、表格操作和扩展节点操作
- [AI API 参考](../../api-reference/ai) - 文本生成和结构化数据处理
