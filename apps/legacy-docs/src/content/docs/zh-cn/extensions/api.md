---
title: API & SDK
---

Eidos 没有提供传统的 REST API，而是通过统一的 SDK 接口来暴露 Eidos 的核心能力。这意味着无论是官方功能、扩展开发还是 API 调用，都使用相同的接口和方法。

## 统一的调用方式

Eidos 提供了两种不同的使用场景，但它们都使用相同的 API 接口：

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

## API 参考

Eidos 提供了完整的 API 参考文档，详细说明了所有可用的方法和功能：

- [Space API 参考](../../api-reference/space) - 导航、文档管理、表格操作和扩展节点操作
- [AI API 参考](../../api-reference/ai) - 文本生成和结构化数据处理
