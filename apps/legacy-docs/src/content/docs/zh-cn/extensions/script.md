---
title: Script
description: "一个灵活的数据层解决方案，通过多个执行上下文实现可扩展功能：LLM 工具、表格动作、文档动作、文件动作和用户自定义函数 (UDF)。"
sidebar:
  order: 1
  badge: RFC
---

本文档规定了脚本扩展，这是一个灵活的数据层解决方案，通过多个执行上下文实现可扩展功能。脚本扩展为数据处理工作流程中的自定义逻辑执行提供了统一的接口。

支持的脚本类型包括：

- **LLM 工具**：作为 AI 代理的可调用工具
- **表格动作**：在表格记录上触发的自定义动作
- **文档动作**：在文档上触发的智能处理
- **文件动作**：后台处理文件的一键操作
- **用户自定义函数 (UDF)**：可在 SQL 查询中调用的数据库函数
- **Relay 处理器**：后台处理通过 Relay 接收的消息

## 1. 介绍

脚本扩展通过提供一个标准化框架来在多个上下文中执行自定义逻辑，满足了可扩展数据处理功能的需求。本规范定义了每种支持的脚本类型的元配置结构和执行模式。

## 2. 脚本类型和规范

### 2.1 LLM 工具脚本

#### 2.1.1 概述

当 `type` 属性设置为 `"tool"` 时，脚本作为大型语言模型 (LLM) 工作流程中的可调用工具，使 AI 代理能够执行具有结构化输入/输出模式的自定义函数。

#### 2.1.2 元配置

```typescript
interface ToolMeta {
  type: "tool"
  funcName: string
  tool: {
    name: string
    description: string
    inputJSONSchema: JSONSchema
    outputJSONSchema: JSONSchema
  }
}
```

#### 2.1.3 实现示例

```ts
export const meta = {
  type: "tool",
  funcName: "hello",
  tool: {
    name: "hello",
    description: "这是一个 hello world 块",
    inputJSONSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
        },
      },
    },
    outputJSONSchema: {
      type: "string",
    },
  },
}

export function hello({ name }: { name: string }) {
  return `Hello, ${name}!`
}
```

### 2.2 表格动作脚本

#### 2.2.1 概述

当 `type` 属性设置为 `"tableAction"` 时，脚本作为表格级动作，可以在选定记录上触发。这些动作通过上下文菜单访问，使用自定义功能扩展表格界面。

#### 2.2.2 元配置

```typescript
interface TableActionMeta {
  type: "tableAction"
  funcName: string
  tableAction: {
    name: string
    description: string
    /** 可选：限制此动作只在特定表格显示。省略则显示在所有表格上。 */
    tableId?: string
  }
}
```

#### 2.2.3 执行上下文

表格动作函数接收两个参数：

- `input`: 作为 `Record<string, any>` 的选定记录数据
- `ctx`: 包含 `tableId`、`viewId`、`rowId` 和 `env` 的上下文对象

#### 2.2.4 实现示例

```ts
export const meta = {
  type: "tableAction",
  funcName: "toggleChecked",
  tableAction: {
    name: "切换选中状态",
    description: "切换选定记录的选中状态",
  },
}

export async function toggleChecked(
  input: Record<string, any>,
  ctx: {
    tableId: string
    viewId: string
    rowId: string
  }
) {
  const { tableId, rowId, env } = ctx
  console.log(env.MY_SECRET) // 获取环境变量
  const Users = eidos.currentSpace.table(tableId)
  await Users.update({
    where: { _id: rowId },
    data: { checked: !input.checked },
  })
  return {
    success: true,
  }
}
```

#### 2.2.5 表格范围限定

默认情况下，`tableAction` 扩展会出现在**所有表格**的上下文菜单中。要将其限制在特定表格，在 meta 中设置 `tableAction.tableId`：

```ts
export const meta = {
  type: "tableAction",
  funcName: "markDone",
  tableAction: {
    name: "标记完成",
    description: "将选定记录标记为完成",
    tableId: "a1b2c3d4e5f6...", // 仅在该表格上显示
  },
}
```

当 `tableId` 设置后，动作在数据库层面被过滤，仅在匹配表格的上下文菜单中渲染。省略 `tableId` 则保持全局行为。

### 2.3 文档动作脚本

#### 2.3.1 概述

当 `type` 属性设置为 `"docAction"` 时，脚本作为文档级动作，可以在特定文档上触发。这些动作通过文档动作菜单访问，让您的文档变得更加智能和自动化。

#### 2.3.2 元配置

```typescript
interface DocActionMeta {
  type: "docAction"
  funcName: string
  docAction: {
    name: string
    description: string
  }
}
```

#### 2.3.3 执行上下文

文档动作函数接收两个参数：

- `input`: 作为 `Record<string, any>` 的输入参数
- `ctx`: 包含 `docId` 和 `env` 的上下文对象

#### 2.3.4 实现示例

```ts
export const meta = {
  type: "docAction",
  funcName: "calculateCompletion",
  docAction: {
    name: "计算完成度",
    description: "计算文档中待办事项的完成百分比",
  },
}

export async function calculateCompletion(
  input: Record<string, any>,
  ctx: {
    docId: string
  }
) {
  const { docId, env } = ctx
  const doc = await eidos.currentSpace.doc.getMarkdown(docId)

  // 从 markdown 中提取 checkbox 的完成占比
  const uncheckedCount = doc
    .split("\n")
    .filter((line) => line.startsWith("- [ ]")).length
  const checkedCount = doc
    .split("\n")
    .filter((line) => line.startsWith("- [x]")).length
  const totalCount = uncheckedCount + checkedCount
  const completion = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0

  await eidos.currentSpace.doc.setProperties(docId, {
    completion,
  })

  return {
    completion,
  }
}
```

### 2.4 文件动作脚本

#### 2.4.1 概述

当 `type` 属性设置为 `"fileAction"` 时，脚本作为文件级动作，可以在特定文件上触发。这些动作通过文件右键菜单访问，实现后台文件处理功能，无需打开 UI 界面。

:::tip[File Action vs File Handler]
**有无 UI 之分**：

- **File Handler（文件处理器）**: 需要 **UI 界面**，用于查看、编辑文件内容（如 Markdown 编辑器、音频播放器）。双击文件时打开。

- **File Action（文件动作）**: **无需 UI**，在后台处理文件（如压缩、转换、格式化）。通过右键菜单触发，执行完成后显示通知。

简单来说：File Handler 打开文件查看/编辑，File Action 后台处理文件。
:::

#### 2.4.2 元配置

```typescript
interface FileActionMeta {
  type: "fileAction"
  funcName: string
  fileAction: {
    name: string
    description: string
    extensions: string[] // 支持的文件扩展名，如 [".jpg", ".png"]
    icon?: string // 可选图标
  }
}
```

#### 2.4.3 执行上下文

文件动作函数接收两个参数：

- `filePath`: 文件路径字符串（格式同 File Handler，支持 `~/` 和 `@/` 前缀）
- `ctx`: 上下文对象，包含 `env` 环境变量

#### 2.4.4 实现示例

```ts
export const meta = {
  type: "fileAction",
  funcName: "compressImage",
  fileAction: {
    name: "压缩图片",
    description: "将图片压缩到原大小的 50%",
    extensions: [".jpg", ".jpeg", ".png"],
    icon: "🗜️",
  },
}

export async function compressImage(
  filePath: string,
  ctx: {
    env: Record<string, string>
  }
) {
  const { env } = ctx
  try {
    // 读取原始文件
    const data = await eidos.currentSpace.fs.readFile(filePath)

    // 压缩图片（使用第三方库，如 browser-image-compression）
    const compressed = await compressImageData(data, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
    })

    // 生成新文件路径
    const newPath = filePath.replace(/(\.\w+)$/, "_compressed$1")
    await eidos.currentSpace.fs.writeFile(newPath, compressed)

    // 显示成功通知
    eidos.currentSpace.notify({
      title: "成功",
      description: `已压缩并保存到 ${newPath}`,
    })

    return {
      success: true,
      outputPath: newPath,
      originalSize: data.byteLength,
      compressedSize: compressed.byteLength,
    }
  } catch (error) {
    eidos.currentSpace.notify({
      title: "错误",
      description: `压缩失败: ${error.message}`,
    })
    return {
      success: false,
      error: error.message,
    }
  }
}
```

#### 2.4.5 用户体验流程

1. 用户在文件树中右键点击文件
2. 看到"文件动作"子菜单，列出所有支持该扩展名的 `fileAction`
3. 点击某个动作（如"压缩图片"）
4. 脚本在后台执行
5. 完成后显示通知，告知结果

#### 2.4.6 文件访问 API

与 File Handler 相同，使用 `eidos.currentSpace.fs` API 访问文件：

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

### 2.5 用户自定义函数 (UDF) 脚本

#### 2.5.1 概述

当 `type` 属性设置为 `"udf"` 时，脚本创建可以在 SQL 查询中调用的数据库函数，扩展数据库的计算能力。

#### 2.5.2 元配置

```typescript
interface UDFMeta {
  type: "udf"
  funcName: string
  udf: {
    name: string
    deterministic?: boolean
  }
}
```

#### 2.5.3 UDF 类型

##### 2.5.3.1 标量 UDF

标量 UDF 对单个值进行操作，每次调用返回单个结果。

```ts
export const meta = {
  type: "udf",
  funcName: "add",
  udf: {
    // add 是 SQL 中的保留字，所以我们使用不同的名称
    name: "myAdd",
    deterministic: true,
  },
}

function add(a: number, b: number) {
  return a + b
}
```

### 2.6 Relay 处理器脚本

#### 2.6.1 概述

当 `type` 属性设置为 `"relayHandler"` 时，脚本作为通过 Relay 服务接收的数据的后台消费者。这模拟了 "Push-Pull" 模式，Eidos 会自动从云端拉取数据并触发你的脚本进行处理。

#### 2.6.2 元配置

```typescript
interface RelayHandlerMeta {
  type: "relayHandler"
  funcName: string
  relayHandler: {
    name: string
    description: string
  }
}
```

#### 2.6.3 执行上下文

Relay 处理器函数接收一个 `batch` 对象，其中包含从本地 `inbox.sqlite` 中提取的消息。

- `batch`: 一个包含以下内容的对象：
  - `messages`: `Message` 对象数组
    - `id`: 字符串
    - `body`: 任意类型（消息负载）
    - `timestamp`: 数字（时间戳）
    - `metadata`: 对象（元数据）
    - `ack()`: 显式确认消息处理成功
    - `retry()`: 显式标记消息需要重试
  - `ackAll()`: 确认批次中的所有消息
  - `retryAll()`: 标记批次中的所有消息为重试

**处理逻辑：**

- **隐式确认 (Implicit ACK)**：如果处理器函数成功返回（未抛出错误），批次中所有未显式标记重试的消息都将被视为已确认，并从 `inbox.sqlite` 中移除。
- **自动重试**：如果处理器抛出未捕获的异常，所有未显式调用 `ack()` 的消息将留在 `inbox.sqlite` 中，并在下一个执行周期重新尝试处理。

#### 2.6.4 实现示例

```ts
export const meta = {
  type: "relayHandler",
  funcName: "handleInbox",
  relayHandler: {
    name: "处理 Webhooks",
    description: "解析来自 inbox.sqlite 的原始数据并归档到主表",
  },
}

export async function handleInbox(batch) {
  for (const message of batch.messages) {
    try {
      const { title, content } = message.body
      const Notes = eidos.currentSpace.table("notes")
      await Notes.create({
        data: {
          title: title || "无标题",
          content: content || "",
          source: "relay",
          receivedAt: message.timestamp,
        },
      })
      // 可选：显式确认
      message.ack()
    } catch (e) {
      // 处理该特定消息时出错
      console.error("处理消息失败:", message.id, e)
      message.retry()
    }
  }
}
```

## 3. 安全注意事项

脚本执行应该被适当沙箱化，以防止未经授权性系统访问。实现必须验证输入参数，并根据执行上下文强制执行适当的访问控制。

## 4. 实现要求

- 所有脚本必须导出符合指定接口的 `meta` 对象
- `meta.funcName` 属性中的函数名必须与实际导出的函数匹配
- 应该为所有脚本类型实现输入验证
- 错误处理在所有执行上下文中必须保持一致

## 5. 未来扩展

本规范可能会扩展以支持其他脚本类型，例如：

- 事件处理器
- 数据验证器
- 自定义字段类型
- 工作流触发器
