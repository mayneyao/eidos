---
title: Script
description: "A flexible data-layer solution that enables extensible functionality through multiple execution contexts: LLM Tools, Table Actions, Document Actions, File Actions, and User-Defined Functions (UDFs)."
sidebar:
  order: 1
  badge: RFC
---

This document specifies the Script extension, a flexible data-layer solution that enables extensible functionality through multiple execution contexts. The Script extension provides a unified interface for custom logic execution within data processing workflows.

Supported script types include:

- **LLM Tools**: Callable tools for AI agents
- **Table Actions**: Custom actions triggered on table records
- **Document Actions**: Intelligent processing triggered on documents
- **File Actions**: One-click operations for background file processing
- **User-Defined Functions (UDFs)**: Database functions callable in SQL queries
- **Relay Handlers**: Background processing for messages received via Relay

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
  const { tableId, rowId } = ctx
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

### 2.3 Document Action Scripts

#### 2.3.1 Overview

When the `type` property is set to `"docAction"`, scripts function as document-level operations that can be triggered on specific documents. These actions are accessible through the document actions menu, making your documents more intelligent and automated.

#### 2.3.2 Meta Configuration

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

#### 2.3.3 Execution Context

Document action functions receive two parameters:

- `input`: Input parameters as `Record<string, any>`
- `ctx`: Context object containing `docId`

#### 2.3.4 Implementation Example

```ts
export const meta = {
  type: "docAction",
  funcName: "calculateCompletion",
  docAction: {
    name: "Calculate Completion",
    description: "Calculates the completion percentage of the document",
  },
}

export async function calculateCompletion(
  input: Record<string, any>,
  ctx: {
    docId: string
  }
) {
  const { docId } = ctx
  const doc = await eidos.currentSpace.doc.getMarkdown(docId)

  // Extract completion ratio from markdown checkboxes
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

### 2.4 File Action Scripts

#### 2.4.1 Overview

When the `type` property is set to `"fileAction"`, scripts function as file-level actions that can be triggered on specific files. These actions are accessible through the file context menu, enabling background file processing without requiring a UI interface.

:::tip[File Action vs File Handler]
**UI vs No-UI**:

- **File Handler**: Requires **UI interface**, used for viewing and editing file content (e.g., Markdown editor, audio player). Opened by double-clicking files.

- **File Action**: **No UI required**, processes files in the background (e.g., compression, conversion, formatting). Triggered via context menu, displays notification upon completion.

Simply put: File Handler opens files for viewing/editing, File Action processes files in the background.
:::

#### 2.4.2 Meta Configuration

```typescript
interface FileActionMeta {
  type: "fileAction"
  funcName: string
  fileAction: {
    name: string
    description: string
    extensions: string[] // Supported file extensions, e.g., [".jpg", ".png"]
    icon?: string // Optional icon
  }
}
```

#### 2.4.3 Execution Context

File action functions receive two parameters:

- `filePath`: File path string (same format as File Handler, supports `~/` and `@/` prefixes)
- `ctx`: Context object (currently empty, reserved for future extensions)

#### 2.4.4 Implementation Example

```ts
export const meta = {
  type: "fileAction",
  funcName: "compressImage",
  fileAction: {
    name: "Compress Image",
    description: "Compress image to 50% of original size",
    extensions: [".jpg", ".jpeg", ".png"],
    icon: "🗜️",
  },
}

export async function compressImage(
  filePath: string,
  ctx: Record<string, any>
) {
  try {
    // Read original file
    const data = await eidos.currentSpace.fs.readFile(filePath)

    // Compress image (using third-party library like browser-image-compression)
    const compressed = await compressImageData(data, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
    })

    // Generate new file path
    const newPath = filePath.replace(/(\.\w+)$/, "_compressed$1")
    await eidos.currentSpace.fs.writeFile(newPath, compressed)

    // Show success notification
    eidos.currentSpace.notify({
      title: "Success",
      description: `Compressed and saved to ${newPath}`,
    })

    return {
      success: true,
      outputPath: newPath,
      originalSize: data.byteLength,
      compressedSize: compressed.byteLength,
    }
  } catch (error) {
    eidos.currentSpace.notify({
      title: "Error",
      description: `Compression failed: ${error.message}`,
    })
    return {
      success: false,
      error: error.message,
    }
  }
}
```

#### 2.4.5 User Experience Flow

1. User right-clicks a file in the file tree
2. Sees "File Actions" submenu listing all `fileAction` scripts supporting that extension
3. Clicks an action (e.g., "Compress Image")
4. Script executes in the background
5. Notification displays upon completion

#### 2.4.6 File Access API

Same as File Handler, use `eidos.currentSpace.fs` API to access files:

```typescript
// Read text file
const text = await eidos.currentSpace.fs.readFile(filePath, "utf8")

// Read binary file
const data = await eidos.currentSpace.fs.readFile(filePath)

// Write file
await eidos.currentSpace.fs.writeFile(filePath, content, "utf8")

// Get file info
const stats = await eidos.currentSpace.fs.stat(filePath)
```

For more file system API details, see [Space API Reference - File System API](/api-reference/space/#file-system-api).

### 2.5 User-Defined Function (UDF) Scripts

#### 2.5.1 Overview

When the `type` property is set to `"udf"`, scripts create database functions that can be invoked within SQL queries, extending the database's computational capabilities.

#### 2.5.2 Meta Configuration

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

#### 2.5.3 UDF Types

##### 2.5.3.1 Scalar UDF

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

### 2.6 Relay Handler Scripts

#### 2.6.1 Overview

When the `type` property is set to `"relayHandler"`, scripts function as background consumers for data received via the Relay service. This mimics a "Push-Pull" pattern where Eidos automatically pulls data from the cloud and triggers your script to process it.

#### 2.6.2 Meta Configuration

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

#### 2.6.3 Execution Context

Relay handler functions receive a `batch` object containing the messages pulled from the local `inbox.sqlite`.

- `batch`: An object containing:
  - `messages`: An array of `Message` objects
    - `id`: string
    - `body`: any (the payload)
    - `timestamp`: number
    - `metadata`: object
    - `ack()`: Explicitly acknowledge the message
    - `retry()`: Explicitly mark the message for retry
  - `ackAll()`: Acknowledge all messages in the batch
  - `retryAll()`: Mark all messages in the batch for retry

**Processing Logic:**

- **Implicit ACK**: If the handler function returns successfully, all messages in the batch that were not explicitly marked for retry are considered acknowledged and will be removed from `inbox.sqlite`.
- **Automatic Retry**: If the handler throws an unhandled exception, all messages that were not explicitly acknowledged via `ack()` will remain in `inbox.sqlite` and be retried in the next execution cycle.

#### 2.6.4 Implementation Example

```ts
export const meta = {
  type: "relayHandler",
  funcName: "handleInbox",
  relayHandler: {
    name: "Process Webhooks",
    description:
      "Parses raw payloads from inbox.sqlite and archives them to main tables",
  },
}

export async function handleInbox(batch) {
  for (const message of batch.messages) {
    try {
      const { title, content } = message.body
      const Notes = eidos.currentSpace.table("notes")
      await Notes.create({
        data: {
          title: title || "Untitled",
          content: content || "",
          source: "relay",
          receivedAt: message.timestamp,
        },
      })
      // Optional: Explicitly ack
      message.ack()
    } catch (e) {
      // Something went wrong with this specific message
      console.error("Failed to process message", message.id, e)
      message.retry()
    }
  }
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
