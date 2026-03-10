---
title: "Extension API 参考"
description: "@eidos.space/react 的 API 参考"
sidebar:
  order: 2
---

`@eidos.space/react` 包提供了一组用于构建 Eidos 扩展的 React Hook 和工具。它允许扩展以类型安全的方式在不同的渲染环境中与 Eidos 数据、UI 和系统服务进行交互。

## useEidos

用于访问 Eidos SDK 的 React Hook。

### 用法

```tsx
import { useEidos } from "@eidos.space/react"

function MyExtension() {
  const eidos = useEidos()

  // 示例：查询表格（tableId 是不带连字符的 UUIDv7）
  const Users = eidos.space.table("01935b4c9d2e7f8a0b1c2d3e4f5a6b7c")
  const users = await Users.findMany()

  // 示例：读取文件
  eidos.space.fs.readFile("/path/to/file", "utf8")
}
```

### 签名

| 属性                       | 类型        | 描述                     |
| -------------------------- | ----------- | ------------------------ |
| [`currentSpace`](../space) | `DataSpace` | 当前空间数据访问         |
| `space`                    | `DataSpace` | `currentSpace` 的别名    |
| [`AI`](../ai)              | `object`    | AI 能力（文本/对象生成） |

---

## useExtensionContext

用于检索类型化的扩展上下文的 React Hook。

### 用法

```tsx
import {
  useExtensionContext,
  type FileHandlerContext,
} from "@eidos.space/react"

function MyExtension() {
  const ctx = useExtensionContext<FileHandlerContext>()
  console.log(ctx.filePath)
}
```

### 上下文类型

#### ExtNodeContext

| 属性     | 类型        | 描述          |
| -------- | ----------- | ------------- |
| `type`   | `"extNode"` | 区分符        |
| `space`  | `string`    | 当前空间名称  |
| `nodeId` | `string`    | 唯一的节点 ID |

#### TableViewContext

| 属性      | 类型          | 描述         |
| --------- | ------------- | ------------ |
| `type`    | `"tableView"` | 区分符       |
| `space`   | `string`      | 当前空间名称 |
| `tableId` | `string`      | 目标表格 ID  |
| `viewId`  | `string`      | 目标视图 ID  |

#### FileHandlerContext

| 属性       | 类型            | 描述         |
| ---------- | --------------- | ------------ |
| `type`     | `"fileHandler"` | 区分符       |
| `space`    | `string`        | 当前空间名称 |
| `filePath` | `string`        | 绝对文件路径 |

---

## 实用工具

### 类型守卫 (Type Guards)

```tsx
import {
  isExtNodeContext,
  isFileHandlerContext,
  isTableViewContext,
} from "@eidos.space/react"

const ctx = useExtensionContext()

if (isExtNodeContext(ctx)) {
  // ctx.nodeId 可用
}
```
