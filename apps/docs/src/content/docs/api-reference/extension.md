---
title: Extension API Reference
description: API reference for @eidos.space/react
sidebar:
  order: 1
---

The `@eidos.space/react` package provides a set of React hooks and utilities for building Eidos extensions. It allows extensions to interact with Eidos data, UI, and system services in a type-safe manner across different rendering environments.

## useEidos

React hook to access the Eidos SDK.

### Usage

```tsx
import { useEidos } from "@eidos.space/react"

function MyExtension() {
  const eidos = useEidos()

  // Example: Query table
  eidos.space.table("myTable").rows.query()

  // Example: Read file
  eidos.space.fs.readFile("/path/to/file", "utf8")
}
```

### Signature

| Property                | Type        | Description                              |
| ----------------------- | ----------- | ---------------------------------------- |
| [`currentSpace`](../space) | `DataSpace` | Current space data access                |
| `space`                 | `DataSpace` | Alias for `currentSpace`                 |
| [`AI`](../ai)              | `object`    | AI capabilities (text/object generation) |

---

## useExtensionContext

React hook to retrieve typed extension context.

### Usage

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

### Context Types

#### ExtNodeContext

| Property | Type        | Description        |
| -------- | ----------- | ------------------ |
| `type`   | `"extNode"` | Discriminator      |
| `space`  | `string`    | Current space name |
| `nodeId` | `string`    | Unique node ID     |

#### TableViewContext

| Property  | Type          | Description        |
| --------- | ------------- | ------------------ |
| `type`    | `"tableView"` | Discriminator      |
| `space`   | `string`      | Current space name |
| `tableId` | `string`      | Target table ID    |
| `viewId`  | `string`      | Target view ID     |

#### FileHandlerContext

| Property   | Type            | Description        |
| ---------- | --------------- | ------------------ |
| `type`     | `"fileHandler"` | Discriminator      |
| `space`    | `string`        | Current space name |
| `filePath` | `string`        | Absolute file path |

---

## Utilities

### Type Guards

```tsx
import {
  isExtNodeContext,
  isFileHandlerContext,
  isTableViewContext,
} from "@eidos.space/react"

const ctx = useExtensionContext()

if (isExtNodeContext(ctx)) {
  // ctx.nodeId is available
}
```
