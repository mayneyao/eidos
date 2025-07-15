---
title: Block
description: A universal UI extension framework that enables custom rendering and interaction capabilities.
sidebar:
  order: 2
  badge: RFC
---

This document specifies the block extension framework, a universal UI extension solution that enables custom rendering and interaction capabilities. The block extension provides a lightweight, single-file UI extension approach that supports React component rendering while maintaining reusability across different environments.

## 1. Introduction

The block extension addresses the need for extensible UI capabilities within the Eidos ecosystem while preserving generality for code reuse in other projects. This specification defines a lightweight, single-file UI extension approach that can serve as both a development playground and a production component library.

block functions as pure UI components, with Eidos SDK integration available when interaction with Eidos logic is required. Without the Eidos SDK, block components behave identically to standard React components.

## 2. Architecture and Design Principles

### 2.1 Lightweight Design Philosophy

The framework adopts a single-file component approach to facilitate code reuse across projects. Complex components should be developed using conventional methods, published to npm, and imported as third-party components to maintain separation of concerns and reduce maintenance overhead.

### 2.2 Build-Free Development Experience

The system provides a build-free (zero-config build) development experience where users can preview changes immediately upon saving, similar to Deno's development workflow. The framework automatically transforms imports to the latest external package versions, leveraging the npm ecosystem while reducing version management complexity.

### 2.3 Import Resolution Strategy

The framework uses standard Node.js import syntax while automatically resolving to external packages:

```tsx
// Standard import syntax
import { Excalidraw } from "@excalidraw/excalidraw"

// Automatically resolved to: https://esm.sh/@excalidraw/excalidraw
```

Manual version specification is only required when issues arise.

## 3. Built-in Component Library Integration

### 3.1 Shadcn/ui Integration

The framework provides seamless integration with Shadcn/ui components, enabling consistent UI styling with the Eidos interface. Components share theme configurations with the main application while supporting independent theme customization.

```tsx
import { Button } from "@/components/ui/button"
```

### 3.2 AI-Assisted Development

Shadcn/ui's LLM-friendly architecture facilitates AI-assisted development, enabling code generation for simple scenarios without manual coding.

## 4. Runtime Environment

### 4.1 Execution Context

block components execute in browser environments similar to standard React components. In Eidos Desktop, each block runs in an isolated domain:

```
<extid>.block.<spaceId>.eidos.localhost:13127
```

## 5. Extension Types and Specifications

### 5.1 Table View Extensions

#### 5.1.1 Overview

Table view extensions provide custom visualization options beyond the default grid, gallery, and kanban views.

#### 5.1.2 Meta Configuration

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

#### 5.1.3 Implementation Example

```tsx
export const meta = {
  type: "tableView",
  componentName: "MyListView",
  tableView: {
    title: "List View",
    description: "This is a list view",
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

### 5.2 Extension Node Types

#### 5.2.1 Overview

Extension nodes provide custom node types beyond the default document and table nodes, with consistent directory tree behavior but custom rendering logic.

#### 5.2.2 URL Access Pattern

When rendering as an extNode, the block will default to accessing the following URL structure:

```
<extid>.block.<spaceId>.eidos.localhost:13127/<nodeid>
```

This URL pattern enables isolated execution of extension nodes within the Eidos Desktop environment while maintaining proper scoping to the specific space and node.

#### 5.2.3 Meta Configuration

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

#### 5.2.4 Data Retrieval Strategies

##### 5.2.4.1 Client-Side Data Retrieval

For local-only extension nodes:

```tsx
export const meta = {
  type: "extNode",
  componentName: "MyExcalidraw",
  extNode: {
    title: "Excalidraw",
    description: "This is a excalidraw node",
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

##### 5.2.4.2 Server-Side Data Retrieval

For publishable extension nodes:

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

### 5.3 Default Component Override

#### 5.3.1 Overview

The framework supports overriding default components, such as replacing the default Lexical-based document editor with alternative implementations.

#### 5.3.2 Implementation Example

```tsx
import Editor from "@monaco-editor/react"

export const meta = {
  type: "document",
  componentName: "MyDocument",
}

export function MyDocument() {
  if (ctx.type !== "document") {
    return <div>Not a document</div>
  }
  return <Editor />
}
```

## 6. Security Considerations

Extension execution should be properly sandboxed to prevent unauthorized system access. Implementations must validate component props and enforce appropriate isolation between extensions and the host application.

## 7. Implementation Requirements

- block extensions SHOULD export a `meta` object conforming to the specified interface when specific extension functionality is required
- When no `meta` object is exported, the component will run as a regular React component without injected specific props
- If a `meta` object is exported, component names in `meta.componentName` MUST match the actual exported component
- Extensions SHOULD implement proper error boundaries and loading states
- Data fetching MUST be performed through the Eidos SDK when interacting with application data

## 8. Future Extensions

This specification may be extended to support additional extension types such as:

- Custom field renderers
