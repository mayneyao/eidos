---
title: Script
description: "一个灵活的数据层解决方案，通过三个主要执行上下文实现可扩展功能：LLM 工具、表格操作和用户自定义函数 (UDF)。"
sidebar:
  order: 1
  badge: RFC
---

本文档规定了脚本扩展，这是一个灵活的数据层解决方案，通过三个主要执行上下文实现可扩展功能：LLM 工具、表格操作和用户自定义函数 (UDF)。脚本扩展为数据处理工作流程中的自定义逻辑执行提供了统一的接口。

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

### 2.2 表格操作脚本

#### 2.2.1 概述

当 `type` 属性设置为 `"tableAction"` 时，脚本作为表格级操作，可以在选定记录上触发。这些操作通过上下文菜单访问，使用自定义功能扩展表格界面。

#### 2.2.2 元配置

```typescript
interface ActionMeta {
  type: "tableAction"
  funcName: string
  tableAction: {
    name: string
    description: string
  }
}
```

#### 2.2.3 执行上下文

表格操作函数接收两个参数：

- `input`: 作为 `Record<string, any>` 的选定记录数据
- `ctx`: 包含 `tableId`、`viewId` 和 `rowId` 的上下文对象

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
  const { tableId, viewId, rowId } = ctx
  await eidos.currentSpace.table(tableId).rows.update(rowId, {
    checked: !input.checked,
  })
  return {
    success: true,
  }
}
```

### 2.3 用户自定义函数 (UDF) 脚本

#### 2.3.1 概述

当 `type` 属性设置为 `"udf"` 时，脚本创建可以在 SQL 查询中调用的数据库函数，扩展数据库的计算能力。

#### 2.3.2 元配置

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

#### 2.3.3 UDF 类型

##### 2.3.3.1 标量 UDF

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

## 3. 安全注意事项

脚本执行应该被适当沙箱化，以防止未经授权的系统访问。实现必须验证输入参数，并根据执行上下文强制执行适当的访问控制。

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
