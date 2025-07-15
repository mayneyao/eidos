---
title: Block
description: 一个通用的 UI 扩展框架，实现自定义渲染和交互功能。
sidebar:
  order: 3
  badge: RFC
---

本文档规定了 Block 扩展框架，这是一个通用的 UI 扩展解决方案，实现自定义渲染和交互功能。 Block 扩展提供了一个轻量级的单文件 UI 扩展方法，支持 React 组件渲染，同时在不同环境中保持可重用性。

## 1. 介绍

Block 扩展解决了 Eidos 生态系统中对可扩展 UI 功能的需求，同时保持代码在其他项目中复用的通用性。本规范定义了一个轻量级的单文件 UI 扩展方法，可以作为开发游乐场和生产组件库。

Block 作为纯 UI 组件运行，当需要与 Eidos 逻辑交互时可以使用 Eidos SDK 集成。在没有 Eidos SDK 的情况下， Block 组件的行为与标准 React 组件相同。

## 2. 架构和设计原则

### 2.1 轻量级设计理念

该框架采用单文件组件方法，以便在项目之间重用代码。复杂的组件应该使用传统方法开发，发布到 npm，并作为第三方组件导入，以保持关注点分离并减少维护开销。

### 2.2 无构建开发体验

系统提供无构建（零配置构建）的开发体验，用户可以在保存后立即预览更改，类似于 Deno 的开发工作流程。该框架自动将导入转换为最新的外部包版本，利用 npm 生态系统，同时减少版本管理的复杂性。

### 2.3 导入解析策略

该框架使用标准的 Node.js 导入语法，同时自动解析到外部包：

```tsx
// 标准导入语法
import { Excalidraw } from "@excalidraw/excalidraw"

// 自动解析为: https://esm.sh/@excalidraw/excalidraw
```

只有在出现问题时才需要手动指定版本。

## 3. 内置组件库集成

### 3.1 Shadcn/ui 集成

该框架提供与 Shadcn/ui 组件的无缝集成，实现与 Eidos 界面一致的 UI 样式。组件与主应用程序共享主题配置，同时支持独立的主题自定义。

```tsx
import { Button } from "@/components/ui/button"
```

### 3.2 AI 辅助开发

Shadcn/ui 的 LLM 友好架构促进了 AI 辅助开发，在简单场景下无需手动编码即可生成代码。

## 4. 运行时环境

### 4.1 执行上下文

Block 组件在类似于标准 React 组件的浏览器环境中执行。在 Eidos Desktop 中，每个 Block 都在一个独立的域中运行：

```
<extid>.block.<spaceId>.eidos.localhost:13127
```

## 5. 扩展类型和规范

### 5.1 表格视图扩展

#### 5.1.1 概述

表格视图扩展提供超出默认网格、画廊和看板视图的自定义可视化选项。

#### 5.1.2 元配置

```typescript
interface TableViewMeta {
  type: "tableView"
  componentName: string
  tableView: {
    title: string
    // the type of the view. built-in types are: grid, gallery, kanban.
    type: string
    description: string
  }
}
```

#### 5.1.3 数据存储

自定义扩展视图的类型信息存储在 `eidos__views` 表中，其中 `type` 字段采用 `ext__<type>` 的格式。例如：

- 内置视图类型：`grid`、`gallery`、`kanban`
- 自定义扩展视图类型：`ext__list`、`ext__timeline`、`ext__chart` 等

这种命名约定确保了自定义扩展视图与内置视图类型的明确区分，避免命名冲突。

#### 5.1.4 实现示例

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

interface ITableViewContext {
  tableId: string
  viewId: string
}

const getRows = async (ctx: ITableViewContext) => {
  const rows = await eidos.currentSpace.table(ctx.tableId).rows.query(
    {},
    {
      viewId: ctx.viewId,
    }
  )
  return rows
}

export function MyListView({ ctx }: { ctx: ITableViewContext }) {
  const [rows, setRows] = useState<any[]>([])

  useEffect(() => {
    getRows(ctx).then((rows) => {
      setRows(rows)
    })
  }, [ctx])

  return (
    <div>
      {rows.map((row) => (
        <div key={row.id}>{row.title}</div>
      ))}
    </div>
  )
}
```

### 5.2 扩展节点类型

#### 5.2.1 概述

扩展节点提供超出默认文档和表格节点的自定义节点类型，具有一致的目录树行为但自定义渲染逻辑。

#### 5.2.2 URL 访问模式

当作为 extNode 渲染时，块将默认访问以下 URL 结构：

```
<extid>.block.<spaceId>.eidos.localhost:13127/<nodeid>
```

此 URL 模式使扩展节点能够在 Eidos Desktop 环境中独立执行，同时维护对特定空间和节点的适当范围限制。

#### 5.2.3 元配置

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

#### 5.2.4 数据检索策略

##### 5.2.4.1 客户端数据检索

对于仅本地的扩展节点：

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

##### 5.2.4.2 服务端数据检索

对于可发布的扩展节点：

```tsx
export const loader = async () => {
  const nodeid = request.url.split("/").pop()
  const text = await eidos.currentSpace.extNode.getText(nodeid)
  return {
    props: {
      text,
    },
  }
}

export function MyExtNode({ text }: { text: string }) {
  return <div>{text}</div>
}
```

### 5.3 默认组件覆盖

#### 5.3.1 概述

该框架支持覆盖默认组件，例如用替代实现替换默认的基于 Lexical 的文档编辑器。

#### 5.3.2 实现示例

```tsx
import Editor from "@monaco-editor/react"

export const meta = {
  type: "document",
  componentName: "MyDocument",
}

export function MyDocument() {
  if (ctx.type !== "document") {
    return <div>不是文档</div>
  }
  return <Editor />
}
```

## 6. 安全注意事项

扩展执行应该被适当沙箱化，以防止未经授权的系统访问。实现必须验证组件属性，并在扩展和主机应用程序之间强制执行适当的隔离。

## 7. 实现要求

- 当需要特定扩展功能时，Block 扩展应该导出符合指定接口的 `meta` 对象
- 当不导出 `meta` 对象时，组件将作为普通的 React 组件运行，不会注入特定的 props
- 如果导出 `meta` 对象，`meta.componentName` 中的组件名称必须与实际导出的组件匹配
- 扩展应该实现适当的错误边界和加载状态
- 与应用程序数据交互时，数据获取必须通过 Eidos SDK 执行

## 8. 未来扩展

本规范可能会扩展以支持其他扩展类型，例如：

- 自定义字段渲染器
