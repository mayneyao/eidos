# @eidos.space/electron-ipc

Decorator-based IPC framework for Electron with automatic method discovery.

## Features

- **Zero Boilerplate**: Define IPC handlers with simple decorators
- **Automatic Method Discovery**: No need to manually list methods in preload
- **Type Safety**: Full TypeScript support with automatic type inference
- **Natural Error Handling**: Errors throw naturally, just like direct function calls
- **Flexible Exposure Control**: Choose between exposing all methods or only decorated ones

## Installation

```bash
pnpm add @eidos.space/electron-ipc
```

## Quick Start

### 1. Define an IPC Service

```typescript
import { IpcService, IpcServiceBase } from "@eidos.space/electron-ipc"

@IpcService("my-service")
class MyService extends IpcServiceBase {
  async getData(id: string) {
    return { id, name: "Example" }
  }

  async saveData(data: any) {
    // Save logic here
    return { success: true }
  }
}
```

### 2. Register in Main Process

```typescript
import { setupRegistryIpc } from "@eidos.space/electron-ipc"

app.whenReady().then(() => {
  // Setup registry IPC (required for auto-discovery)
  setupRegistryIpc()

  // Create and register service
  const myService = new MyService()
  myService.register()
})
```

### 3. Expose in Preload

```typescript
import { createPreloadApiByNamespace } from "@eidos.space/electron-ipc"

contextBridge.exposeInMainWorld("eidos", {
  myService: createPreloadApiByNamespace("my-service"),
})
```

### 4. Use in Renderer

```typescript
// Direct return value - no wrapper!
const data = await window.eidos.myService.getData("123")
console.log(data) // { id: "123", name: "Example" }

// Errors throw naturally - use try/catch
try {
  await window.eidos.myService.saveData({ invalid: true })
} catch (error) {
  console.error("Save failed:", error)
}
```

## API Reference

### Decorators

#### `@IpcService(namespace, options?)`

Class decorator to mark a service as an IPC service.

- `namespace`: The IPC channel namespace (e.g., "browser-view", "rawdata")
- `options?.exposeMode`:
  - `"all"` (default): Expose all public methods
  - `"decorated"`: Only expose methods with `@IpcMethod` decorator

```typescript
@IpcService("browser-view")
class BrowserViewManager extends IpcServiceBase {
  // All public methods are exposed
}

@IpcService("rawdata", { exposeMode: "decorated" })
class RawDataService extends IpcServiceBase {
  @IpcMethod()
  async findAdapters() {
    /* exposed */
  }

  async _privateMethod() {
    /* not exposed (underscore prefix) */
  }
}
```

#### `@IpcMethod(channel?)`

Method decorator to explicitly mark a method for IPC exposure. Only effective when `exposeMode: "decorated"`.

```typescript
@IpcService("my-service", { exposeMode: "decorated" })
class MyService extends IpcServiceBase {
  @IpcMethod()
  async method1() {
    /* exposed */
  }

  @IpcMethod("custom-channel")
  async method2() {
    /* exposed as "custom-channel" */
  }

  async method3() {
    /* not exposed */
  }
}
```

### Base Class

#### `IpcServiceBase`

Abstract base class providing IPC registration functionality.

**Methods:**

- `register()`: Register all IPC handlers. Called automatically, idempotent.
- `unregister()`: Unregister all IPC handlers. Call when service is destroyed.
- `getRegisteredMethods()`: Get list of registered method names.

### Registry Functions

#### `setupRegistryIpc()`

Setup the IPC handler for synchronous method retrieval from preload. Must be called in main process before creating services.

```typescript
import { setupRegistryIpc } from "@eidos.space/electron-ipc"

app.whenReady().then(() => {
  setupRegistryIpc()
  // ... create and register services
})
```

#### `createPreloadApiByNamespace(namespace)`

Create a preload API object for a given namespace. Methods are automatically discovered from the registry.

```typescript
import { createPreloadApiByNamespace } from "@eidos.space/electron-ipc"

const api = createPreloadApiByNamespace("my-service")
// api now has all methods bound to ipcRenderer.invoke
```

### Types

#### `ExtractIpcApi<T>`

Type utility to extract the IPC API type from a service class.

```typescript
import type { ExtractIpcApi } from "@eidos.space/electron-ipc"
import { MyService } from "./my-service"

type MyServiceApi = ExtractIpcApi<typeof MyService>
// All methods become async and return raw results
```

## Error Handling

Unlike traditional IPC frameworks that wrap responses in `{ success, data, error }` objects, this framework lets errors throw naturally:

```typescript
// In main process
@IpcService("my-service")
class MyService extends IpcServiceBase {
  async validateUser(id: string) {
    if (!id) throw new Error("ID is required")
    return { id, name: "User" }
  }
}

// In renderer
try {
  const user = await window.eidos.myService.validateUser("")
  console.log(user)
} catch (error) {
  // Error throws naturally!
  console.error(error.message) // "ID is required"
}
```

This approach:

- ✅ More intuitive - works like regular async functions
- ✅ Better TypeScript inference - no need to check `result.success`
- ✅ Standard try/catch patterns work as expected
- ✅ Stack traces preserved

## Advanced Usage

### Adding Event Listeners

For event-based communication (not request/response), add custom methods in preload:

```typescript
browserView: {
  ...createPreloadApiByNamespace("browser-view"),
  onUpdate: (viewId: string, callback: (data: any) => void) => {
    const listener = (_: any, id: string, data: any) => {
      if (id === viewId) callback(data)
    }
    ipcRenderer.on("browser-view:update", listener)
    return () => ipcRenderer.removeListener("browser-view:update", listener)
  },
}
```

### Service Lifecycle

```typescript
class MyService extends IpcServiceBase {
  register() {
    super.register()
    // Additional setup
  }

  unregister() {
    // Cleanup
    super.unregister()
  }
}

// In main process
const service = new MyService()
service.register()

// When done
service.unregister()
```

## Best Practices

1. **Use underscore prefix** for private methods: `async _privateMethod()`
2. **Use `exposeMode: "decorated"`** when you need fine-grained control over exposed methods
3. **Always call `setupRegistryIpc()`** before creating services in main process
4. **Use try/catch** for error handling in renderer code
5. **Unregister services** when windows are closed to prevent memory leaks

## License

MIT
