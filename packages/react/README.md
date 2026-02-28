# @eidos.space/react

Unified React hooks for building Eidos extensions. These hooks work seamlessly across both **built-in** (direct React rendering) and **sandboxed** (iframe) environments.

## Installation

```bash
npm install @eidos.space/react
```

## Core Hooks

### `useEidos()`

Access the Eidos SDK to interact with spaces, tables, files, and more.

```tsx
import { useEidos } from "@eidos.space/react"

export function MyExtension() {
  const eidos = useEidos()

  const handleNotify = () => {
    eidos.currentSpace.notify({ title: "Hello", description: "From Extension" })
  }

  return <button onClick={handleNotify}>Click Me</button>
}
```

### `useExtensionContext<T>()`

Retrieves the current extension's execution context (e.g., `nodeId`, `tableId`, `filePath`).

```tsx
import {
  useExtensionContext,
  type FileHandlerContext,
} from "@eidos.space/react"

export function MyFileHandler() {
  const ctx = useExtensionContext<FileHandlerContext>()

  return <div>Editing: {ctx.filePath}</div>
}
```

## Setup for App Implementation

If you are implementing an Eidos-host environment (like a Web App) that renders extensions, follow these steps to initialize the hooks.

### 1. Initialize Eidos SDK

Built-in environments use a global Zustand store to provide the SDK to all extensions.

```tsx
import { useEidosStore, createEidos } from "@eidos.space/react"

// Initialize once at app startup
const eidos = createEidos(dataSpaceProxy)
useEidosStore.getState().setEidos(eidos)
```

### 2. Wrap Extensions with Context

For built-in extensions, use `ExtensionContextProvider` to provide the specific context (node ID, file path, etc.) for that instance.

```tsx
import { ExtensionContextProvider } from "@eidos.space/react"

function BuiltInRunner({ slug, context }) {
  const Component = getExtensionComponent(slug)

  return (
    <ExtensionContextProvider context={context}>
      <Component />
    </ExtensionContextProvider>
  )
}
```

## License

MIT
