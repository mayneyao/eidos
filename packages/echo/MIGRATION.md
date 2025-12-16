# Migration Guide

## Overview

This guide helps you migrate from the existing SQLite channel/RPC implementation to Echo.

## Why Migrate?

- **Less Code**: 95% reduction in boilerplate
- **Type Safety**: Full TypeScript type inference
- **Consistency**: Same API across all transports
- **Extensibility**: Middleware system for custom logic
- **New Features**: Child Process support, better error handling

## Migration Strategy

Echo is designed to be **backward compatible**. You can migrate gradually:

1. Install Echo package
2. Update imports
3. Replace implementation
4. Test thoroughly
5. Remove old code

## Step-by-Step Migration

### 1. Web Worker Migration

**Before:**

```typescript
import { getSqliteProxy } from '@/packages/core/sqlite/channel'
import type { DataSpace } from '@/packages/core/data-space'

const worker = new Worker('./worker.js')
const dataSpace = getSqliteProxy(dbName, userId) as DataSpace
```

**After:**

```typescript
import { createEchoClient, WebWorkerTransport } from '@eidos.space/echo'
import type { DataSpace } from '@/packages/core/data-space'

const worker = new Worker('./worker.js')
const transport = new WebWorkerTransport(worker)
const dataSpace = createEchoClient<DataSpace>(transport, {
  context: { dbName, userId }
})
```

### 2. Electron IPC Migration

**Before:**

```typescript
import { getSqliteProxy } from '@/packages/core/sqlite/channel'

const dataSpace = getSqliteProxy(dbName, userId, { 
  isReadonly: true 
}) as DataSpace
```

**After:**

```typescript
import { createEchoClient, ElectronIPCTransport } from '@eidos.space/echo'

const ipcRenderer = (window as any).eidos
const transport = new ElectronIPCTransport(ipcRenderer, { 
  readonly: true 
})
const dataSpace = createEchoClient<DataSpace>(transport, {
  context: { dbName, userId }
})
```

### 3. Server-Side Migration

**Before (worker.ts):**

```typescript
import { handleFunctionCall } from '@/packages/core/rpc'

parentPort.on('message', async ({ port, ...payload }) => {
  const res = await handleFunctionCall(payload.data, dataSpace)
  
  // Manual iterator handling...
  if (isIterFunc && res && Symbol.asyncIterator in res) {
    for await (const value of res) {
      port.postMessage({
        id: payload.id,
        data: { value },
        type: MsgType.IteratorValue,
      })
    }
    // ...
  }
})
```

**After:**

```typescript
import { EchoServerHandler } from '@eidos.space/echo/server'

const handler = new EchoServerHandler(dataSpace)

parentPort.on('message', async ({ port, ...payload }) => {
  await handler.handle(payload, port)
})
```

That's it! The handler automatically handles:
- Iterator functions
- AbortSignal injection
- Error propagation
- Message formatting

### 4. HTTP Transport (New!)

**Before:** Not easily possible

**After:**

```typescript
import { createEchoClient, HTTPTransport } from '@eidos.space/echo'

const transport = new HTTPTransport('http://api.example.com/rpc', {
  timeout: 30000,
  headers: { 'Authorization': 'Bearer token' }
})

const api = createEchoClient<MyAPI>(transport)
```

### 5. Child Process (New!)

**Before:** Not possible

**After:**

```typescript
import { createEchoClient, ChildProcessTransport } from '@eidos.space/echo'
import { fork } from 'child_process'

const child = fork('./worker.js')
const transport = new ChildProcessTransport(child)
const api = createEchoClient<MyAPI>(transport)
```

## Iterator Function Registry

If you have custom iterator functions, register them:

```typescript
import { registerIteratorFunction } from '@eidos.space/echo'

// Register your custom iterator functions
registerIteratorFunction('myCustom.watch')
registerIteratorFunction('stream.read')
```

Or provide a custom registry:

```typescript
const customFunctions = new Set(['myCustom.watch'])

const dataSpace = createEchoClient<DataSpace>(transport, {
  iteratorFunctions: customFunctions
})
```

## Middleware Usage

Add logging to all calls:

```typescript
import { createLoggerMiddleware } from '@eidos.space/echo'

const dataSpace = createEchoClient<DataSpace>(transport, {
  middlewares: [
    createLoggerMiddleware({
      logRequests: true,
      logResponses: true,
      logTiming: true
    })
  ]
})
```

Add custom middleware:

```typescript
const authMiddleware = async (context, next) => {
  // Add auth header
  context.data.userId = getCurrentUserId()
  return next()
}

const dataSpace = createEchoClient<DataSpace>(transport, {
  middlewares: [authMiddleware]
})
```

## Binary Data

Binary data is automatically handled:

```typescript
// Just pass binary data - Echo handles serialization
const buffer = new Uint8Array([1, 2, 3])
await dataSpace.file.upload({ 
  name: 'test.bin', 
  data: buffer 
})
```

## Error Handling

Errors are automatically propagated:

```typescript
try {
  await dataSpace.someMethod()
} catch (error) {
  console.error('Remote error:', error.message)
  // error.stack contains the remote stack trace
}
```

## Testing

Use the mock transport for testing:

```typescript
import { createMockTransport } from '@eidos.space/echo'

const transport = createMockTransport()
const client = createEchoClient<MyAPI>(transport)

// Make calls - they're stored in transport._sentMessages
await client.someMethod()

// Inspect sent messages
console.log(transport._sentMessages)
```

## Compatibility Layer

For gradual migration, the old `getSqliteProxy` can be updated to use Echo internally:

```typescript
// packages/core/sqlite/channel/index.ts
import { createEchoClient, WebWorkerTransport } from '@eidos.space/echo'

export const getSqliteProxy = (
  dbName: string, 
  userId: string, 
  config?: IConfig
) => {
  // Use Echo under the hood
  const transport = new WebWorkerTransport(getWorker())
  return createEchoClient(transport, { 
    context: { dbName, userId } 
  })
}
```

This allows existing code to work unchanged while using Echo internally.

## Common Issues

### Issue: "Channel not found for iterator call"

**Cause**: Iterator function not registered

**Solution**:
```typescript
registerIteratorFunction('your.method.name')
```

### Issue: "Transport does not support iterators"

**Cause**: Using HTTP transport with iterator function

**Solution**: Use WebSocket or other streaming-capable transport

### Issue: Type inference not working

**Cause**: Missing generic type parameter

**Solution**:
```typescript
const client = createEchoClient<YourAPIType>(transport)
//                             ^^^^^^^^^^^^^
```

## Performance Tips

1. **Reuse transports**: Create once, use many times
2. **Use middleware sparingly**: Each adds latency
3. **Batch operations**: Send multiple values together
4. **Use iterators**: For large result sets

## Next Steps

1. Read [Architecture](./ARCHITECTURE.md) for deep dive
2. Check [API Reference](./API.md) for complete API
3. See examples in the repository
4. Join community for help

## Support

- GitHub Issues: Report bugs and request features
- Documentation: Full API reference
- Examples: Sample code for common scenarios

