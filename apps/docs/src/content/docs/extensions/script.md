---
title: Script
description: "A flexible data-layer solution that enables extensible functionality through three primary execution contexts: LLM Tools, Table Actions, and User-Defined Functions (UDFs)."
sidebar:
  order: 1
  badge: RFC
---

This document specifies the Script extension, a flexible data-layer solution that enables extensible functionality through three primary execution contexts: LLM Tools, Table Actions, and User-Defined Functions (UDFs). The Script extension provides a unified interface for custom logic execution within data processing workflows.

## 1. Introduction

The Script extension addresses the need for extensible data processing capabilities by providing a standardized framework for executing custom logic across multiple contexts. This specification defines the meta configuration structure and execution patterns for each supported script type.

## 2. Script Types and Specifications

### 2.1 LLM Tool Scripts

#### 2.1.1 Overview

When the `type` property is set to `"tool"`, scripts function as callable tools within Large Language Model (LLM) workflows, enabling AI agents to execute custom functions with structured input/output schemas.

#### 2.1.2 Meta Configuration

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

#### 2.1.3 Implementation Example

```ts
export const meta = {
  type: "tool",
  funcName: "hello",
  tool: {
    name: "hello",
    description: "This is a hello world block",
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

### 2.2 Table Action Scripts

#### 2.2.1 Overview

When the `type` property is set to `"action"`, scripts serve as table-level operations that can be triggered on selected records. These actions extend the table interface with custom functionality accessible through context menus.

#### 2.2.2 Meta Configuration

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

#### 2.2.3 Execution Context

Table action functions receive two parameters:

- `input`: The selected record data as `Record<string, any>`
- `ctx`: Context object containing `tableId`, `viewId`, and `rowId`

#### 2.2.4 Implementation Example

```ts
export const meta = {
  type: "tableAction",
  funcName: "toggleChecked",
  tableAction: {
    name: "Toggle Checked Status",
    description: "Toggles the checked status of the selected record",
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

### 2.3 User-Defined Function (UDF) Scripts

#### 2.3.1 Overview

When the `type` property is set to `"udf"`, scripts create database functions that can be invoked within SQL queries, extending the database's computational capabilities.

#### 2.3.2 Meta Configuration

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

#### 2.3.3 UDF Types

##### 2.3.3.1 Scalar UDF

Scalar UDFs operate on individual values and return a single result per invocation.

```ts
export const meta = {
  type: "udf",
  funcName: "add",
  udf: {
    // add is a reserved word in SQL, so we use a different name
    name: "myAdd",
    deterministic: true,
  },
}

function add(a: number, b: number) {
  return a + b
}
```

## 3. Security Considerations

Script execution should be sandboxed appropriately to prevent unauthorized system access. Implementations must validate input parameters and enforce proper access controls based on the execution context.

## 4. Implementation Requirements

- All scripts MUST export a `meta` object conforming to the specified interface
- Function names in the `meta.funcName` property MUST match the actual exported function
- Input validation SHOULD be implemented for all script types
- Error handling MUST be consistent across all execution contexts

## 5. Future Extensions

This specification may be extended to support additional script types such as:

- Event handlers
- Data validators
- Custom field types
- Workflow triggers
