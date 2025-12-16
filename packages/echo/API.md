# Echo API Reference

## Client API

### `createEchoClient<T>(transport, options?)`

Creates a typed client proxy for remote API calls.

**Type Parameters:**
- `T`: The API interface type

**Parameters:**
- `transport: EchoTransport` - The transport to use
- `options?: ProxyOptions` - Optional configuration

**Returns:** `EchoClient<T>` - Typed client proxy

**Example:**
```typescript
import { createEchoClient, WebWorkerTransport } from '@eidos.space/echo'
import type { DataSpace } from './types'

const transport = new WebWorkerTransport(worker)
const client = createEchoClient<DataSpace>(transport)

// Fully typed remote calls
const rows = await client.table('users').rows.query()
```

### ProxyOptions

```typescript
interface ProxyOptions {
  context?: Record<string, any>      // Context data for all calls
  middlewares?: Middleware[]         // Middleware to apply
  timeout?: number                   // Request timeout (ms)
  iteratorFunctions?: Set<string>    // Custom iterator registry
}
```

## Transport API

### WebWorkerTransport

**Constructor:**
```typescript
new WebWorkerTransport(worker: Worker)
```

**Example:**
```typescript
const worker = new Worker('./worker.js')
const transport = new WebWorkerTransport(worker)
```

### ElectronIPCTransport

**Constructor:**
```typescript
new ElectronIPCTransport(
  ipcRenderer: IpcRenderer,
  options?: ElectronIPCOptions
)
```

**Options:**
```typescript
interface ElectronIPCOptions {
  readonly?: boolean         // Readonly mode
  sendChannel?: string       // Custom send channel
  receiveChannel?: string    // Custom receive channel
}
```

**Example:**
```typescript
const transport = new ElectronIPCTransport(
  window.require('electron').ipcRenderer,
  { readonly: true }
)
```

### HTTPTransport

**Constructor:**
```typescript
new HTTPTransport(
  url: string,
  options?: HTTPTransportOptions
)
```

**Options:**
```typescript
interface HTTPTransportOptions {
  timeout?: number                    // Request timeout
  headers?: Record<string, string>    // Custom headers
  credentials?: RequestCredentials    // Credentials mode
}
```

**Example:**
```typescript
const transport = new HTTPTransport('https://api.example.com/rpc', {
  timeout: 30000,
  headers: { 'Authorization': 'Bearer token' }
})
```

**Note:** HTTP transport does not support iterators. Use WebSocket for streaming.

### WebRTCTransport

**Constructor:**
```typescript
new WebRTCTransport(connection: DataConnection)
```

**Example:**
```typescript
import Peer from 'peerjs'

const peer = new Peer()
const conn = peer.connect('peer-id')

conn.on('open', () => {
  const transport = new WebRTCTransport(conn)
  const client = createEchoClient<API>(transport)
})
```

### ChildProcessTransport

**Constructor:**
```typescript
new ChildProcessTransport(child: ChildProcess)
```

**Example:**
```typescript
import { fork } from 'child_process'

const child = fork('./worker.js')
const transport = new ChildProcessTransport(child)
```

## Server API

### EchoServerHandler

**Constructor:**
```typescript
new EchoServerHandler(
  target: any,
  options?: ServerHandlerOptions
)
```

**Options:**
```typescript
interface ServerHandlerOptions {
  middlewares?: Middleware[]          // Server middleware
  iteratorFunctions?: Set<string>     // Custom iterator registry
  debug?: boolean                     // Enable debug logging
}
```

**Methods:**

#### `handle(message, port?)`

Handle an incoming message.

**Parameters:**
- `message: EchoMessage` - The message to handle
- `port?: MessagePort` - Optional port for responses

**Returns:** `Promise<void>`

**Example:**
```typescript
const handler = new EchoServerHandler(apiImplementation, {
  debug: true,
  middlewares: [authMiddleware]
})

// Web Worker
self.onmessage = async (e) => {
  await handler.handle(e.data, e.ports[0])
}

// Electron
ipcMain.handle('sqlite-msg', async (event, message) => {
  await handler.handle(message)
})

// Child Process
process.on('message', async (message) => {
  await handler.handle(message)
})
```

## Middleware API

### Middleware Function

```typescript
type Middleware = (
  context: CallContext,
  next: () => Promise<any>
) => Promise<any>
```

**CallContext:**
```typescript
interface CallContext {
  id: string                    // Unique call ID
  method: string                // Method being called
  params: any[]                 // Call parameters
  data: Record<string, any>     // Context data
  transport: EchoTransport      // Transport instance
  isIterator: boolean           // Is iterator function
}
```

**Example:**
```typescript
const loggingMiddleware: Middleware = async (context, next) => {
  console.log(`Calling ${context.method}`)
  const result = await next()
  console.log(`${context.method} completed`)
  return result
}
```

### MiddlewareChain

**Methods:**

#### `use(middleware)`

Add middleware to chain.

**Parameters:**
- `middleware: Middleware` - Middleware function

**Returns:** `this` (for chaining)

#### `execute(context, finalHandler)`

Execute the middleware chain.

**Parameters:**
- `context: CallContext` - Call context
- `finalHandler: () => Promise<any>` - Final handler

**Returns:** `Promise<any>` - Result

### Built-in Middleware

#### createLoggerMiddleware

```typescript
createLoggerMiddleware(options?: LoggerOptions): Middleware
```

**Options:**
```typescript
interface LoggerOptions {
  logRequests?: boolean       // Log requests (default: true)
  logResponses?: boolean      // Log responses (default: true)
  logErrors?: boolean         // Log errors (default: true)
  logTiming?: boolean         // Log timing (default: true)
  logger?: Console            // Custom logger
  filter?: (context) => boolean // Filter function
}
```

**Example:**
```typescript
import { createLoggerMiddleware } from '@eidos.space/echo'

const logger = createLoggerMiddleware({
  logTiming: true,
  filter: (ctx) => !ctx.method.startsWith('internal.')
})
```

#### createValidatorMiddleware

```typescript
createValidatorMiddleware(options: ValidatorOptions): Middleware
```

**Options:**
```typescript
interface ValidatorOptions {
  rules: Record<string, ValidationRule[]>  // Rules by method
  stopOnError?: boolean                     // Stop on first error
  onError?: (errors, context) => void      // Error handler
}

interface ValidationRule {
  paramIndex?: number          // Parameter index
  paramName?: string           // Parameter name (object params)
  validate: (value, context) => boolean | string | Promise<...>
  message?: string             // Error message
}
```

**Example:**
```typescript
import { createValidatorMiddleware, validators } from '@eidos.space/echo'

const validator = createValidatorMiddleware({
  rules: {
    'user.create': [
      {
        paramIndex: 0,
        validate: validators.required(),
        message: 'User data is required'
      }
    ]
  }
})
```

## Registry API

### registerIteratorFunction

Register a method as returning an AsyncIterable.

```typescript
registerIteratorFunction(methodName: string): void
```

**Example:**
```typescript
import { registerIteratorFunction } from '@eidos.space/echo'

registerIteratorFunction('fs.watch')
registerIteratorFunction('stream.read')
```

### isIteratorFunction

Check if a method is registered as iterator.

```typescript
isIteratorFunction(methodName: string): boolean
```

### createRegistry

Create an isolated registry.

```typescript
createRegistry(): {
  register: (name: string) => void
  unregister: (name: string) => void
  isIterator: (name: string) => boolean
  getAll: () => string[]
  clear: () => void
}
```

## Serialization API

### serialize

Serialize data for transport.

```typescript
serialize(data: any[]): FullSerializationResult
```

**Returns:**
```typescript
interface FullSerializationResult {
  serialized: any[]                    // Serialized params
  extracted: Map<string, ExtractedItem> // Extracted items
  strategy: SerializationStrategy      // Recommended strategy
  binaryData?: Map<string, Blob>       // Binary data (if any)
}
```

### deserialize

Deserialize data after transport.

```typescript
deserialize(
  data: any[],
  extracted: Map<string, any>,
  binaryDataMap?: Record<string, any>
): any[]
```

### Utilities

#### containsBinaryData

Check if data contains binary content.

```typescript
containsBinaryData(data: any): boolean
```

#### toFormData / fromFormData

Convert to/from FormData (for HTTP with binary data).

```typescript
toFormData(result: FullSerializationResult): FormData
fromFormData(formData: FormData): Promise<{...}>
```

## Message API

### Message Creators

```typescript
createCallMessage(method, params, context?): CallFunctionMessage
createResponseMessage(id, result): QueryRespMessage
createErrorMessage(id, error): ErrorMessage
createIteratorValueMessage(id, value): IteratorValueMessage
createIteratorDoneMessage(id): IteratorDoneMessage
createIteratorErrorMessage(id, error): IteratorErrorMessage
createIteratorCancelMessage(id): IteratorCancelMessage
```

### Message Type Guards

```typescript
isCallMessage(message): message is CallFunctionMessage
isResponseMessage(message): message is QueryRespMessage
isErrorMessage(message): message is ErrorMessage
isIteratorValueMessage(message): message is IteratorValueMessage
// ... etc
```

## Iterator Utilities

### createIteratorProxy

Create async iterator proxy with cancellation support.

```typescript
createIteratorProxy<T>(
  transport: EchoTransport,
  callId: string,
  abortSignal?: AbortSignal
): AsyncIterable<T>
```

### isAsyncIterable

Check if value is an async iterable.

```typescript
isAsyncIterable(value: any): value is AsyncIterable<any>
```

### iteratorToArray

Convert async iterable to array (for testing).

```typescript
iteratorToArray<T>(
  iterable: AsyncIterable<T>,
  maxItems?: number
): Promise<T[]>
```

### withIteratorTimeout

Wrap async iterable with timeout.

```typescript
withIteratorTimeout<T>(
  iterable: AsyncIterable<T>,
  timeoutMs: number,
  onTimeout?: () => void
): AsyncIterable<T>
```

## Type Utilities

### EchoClient<T>

Transform an API type for remote use.

```typescript
type EchoClient<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => infer Ret
    ? Ret extends AsyncIterable<infer Item>
      ? (...args: Args) => AsyncIterable<Item>
      : (...args: Args) => Promise<Awaited<Ret>>
    : T[K] extends object
    ? EchoClient<T[K]>
    : T[K]
}
```

This type:
- Converts all methods to async
- Preserves iterator return types
- Recursively processes nested objects

