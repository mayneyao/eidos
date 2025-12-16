# Echo Architecture

## Overview

Echo is a universal RPC (Remote Procedure Call) library that provides a unified abstraction for remote method invocation across different JavaScript environments.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                     │
│                  (DataSpace, Sandbox APIs)               │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                      Proxy Layer                         │
│  • Method Interception                                   │
│  • Type Inference                                        │
│  • Iterator Detection                                    │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Middleware Layer                       │
│  • Logger                                                │
│  • Serializer                                            │
│  • Iterator Handler                                      │
│  • Custom Middleware                                     │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Transport Layer                        │
│  • WebWorker                                             │
│  • Electron IPC                                          │
│  • HTTP                                                  │
│  • WebRTC                                                │
│  • Child Process                                         │
└─────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Transport Layer

The transport layer provides adapters for different communication channels:

- **WebWorkerTransport**: Browser web workers using MessageChannel
- **ElectronIPCTransport**: Electron IPC communication
- **HTTPTransport**: REST-style HTTP communication
- **WebRTCTransport**: Peer-to-peer WebRTC data channels
- **ChildProcessTransport**: Node.js child process IPC

All transports implement the `EchoTransport` interface:

```typescript
interface EchoTransport<TConnector = any> {
  connector: TConnector
  send(message: EchoMessage): Promise<void> | void
  onMessage(handler: MessageHandler): void
  onIterator?<T>(callId: string): AsyncIterable<T>
  close(): void
}
```

### 2. Serialization Layer

Handles serialization of parameters for transport:

- **Non-Serializable Objects**: AbortSignal, Date, RegExp, Map, Set, Error
- **Binary Data**: ArrayBuffer, Blob, File, TypedArrays
- **Strategy Selection**: Automatically chooses JSON or FormData based on content

### 3. Middleware Layer

Pluggable middleware system for request/response interception:

- **Logger**: Logs requests, responses, and timing
- **Validator**: Parameter validation with custom rules
- **Custom**: User-defined middleware for auth, rate limiting, etc.

### 4. Proxy Layer

Creates JavaScript Proxy objects that:

- Intercept method calls
- Handle nested property access (`table(id).rows.query()`)
- Automatically detect iterator functions
- Apply middleware chain
- Serialize parameters
- Handle AbortSignal for cancellation

### 5. Server Handler

Unified server-side request handler:

- Executes remote method calls
- Handles iterator results (streaming)
- Manages AbortController for cancellation
- Applies server-side middleware

## Message Protocol

All communication uses a unified message protocol:

```typescript
interface EchoMessage {
  id: string              // Unique call ID (uuidv7)
  type: MessageType       // Message type
  data: Record<string, any> // Payload
}
```

### Message Types

- `CallFunction`: Client → Server function call
- `QueryResp`: Server → Client response
- `Error`: Server → Client error
- `IteratorValue`: Server → Client iterator value
- `IteratorDone`: Server → Client iterator completion
- `IteratorError`: Server → Client iterator error
- `IteratorCancel`: Client → Server cancel iterator

## Iterator Support

Echo provides first-class support for async iterators:

1. **Client Side**:
   - Detects iterator functions using registry
   - Extracts AbortSignal from parameters
   - Creates async iterator proxy
   - Listens for abort events to send cancel message

2. **Server Side**:
   - Creates AbortController for the iterator
   - Injects signal into parameters
   - Iterates and sends values as messages
   - Handles cancellation via abort signal

## Type Safety

Echo provides full TypeScript type inference:

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

This ensures:
- All sync methods become async
- Iterator types are preserved
- Nested objects are recursively typed

## Error Handling

Echo provides consistent error handling:

1. **Transport Errors**: Network failures, timeouts
2. **Serialization Errors**: Invalid data types
3. **Method Errors**: Exceptions from remote methods
4. **Iterator Errors**: Exceptions during iteration

All errors are propagated as `Error` messages with stack traces.

## Performance Considerations

### Optimizations

1. **MessageChannel**: One channel per call for parallelism
2. **Lazy Serialization**: Only serialize when needed
3. **Streaming**: Iterator support for large datasets
4. **Binary Transfer**: Efficient binary data handling

### Trade-offs

1. **Middleware Overhead**: Small latency cost per middleware
2. **Type Safety**: Runtime checks for iterator functions
3. **Memory**: MessageChannels kept until response received

## Extension Points

Echo is designed for extensibility:

1. **Custom Transports**: Implement `EchoTransport`
2. **Custom Middleware**: Implement `Middleware` function
3. **Custom Serializers**: Extend serialization logic
4. **Custom Registry**: Create isolated iterator registries

## Migration Path

For existing code:

1. **Phase 1**: Echo deployed, old code unchanged
2. **Phase 2**: Create compatibility adapters
3. **Phase 3**: Gradually migrate to Echo APIs
4. **Phase 4**: Remove old implementations

The compatibility layer ensures no breaking changes during migration.

