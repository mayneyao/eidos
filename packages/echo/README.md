# @eidos.space/echo

Universal RPC library for cross-environment remote procedure calls.

## Overview

Echo provides a unified abstraction for remote procedure calls across different JavaScript environments:

- **Web Worker** - Browser web workers
- **Electron IPC** - Electron main/renderer communication
- **HTTP** - REST-style HTTP communication
- **WebRTC** - Peer-to-peer data channels
- **Child Process** - Node.js child process IPC

## Features

- 🔄 **AsyncIterator Support** - Stream data with cancellation
- 📦 **Binary Data Handling** - Automatic serialization of ArrayBuffer, Blob, etc.
- 🎯 **Type-Safe** - Full TypeScript type inference
- 🔌 **Middleware System** - Pluggable request/response interceptors
- 🌐 **Universal** - Same API across all transports
- 🛡️ **Error Handling** - Consistent error propagation

## Installation

```bash
pnpm add @eidos.space/echo
```

## Quick Start

### Client Side

```typescript
import { createEchoClient, WebWorkerTransport } from '@eidos.space/echo'

const worker = new Worker('./worker.js')
const transport = new WebWorkerTransport(worker)
const client = createEchoClient<MyAPI>(transport)

// Call remote methods
const result = await client.getData()

// Use async iterators with cancellation
const controller = new AbortController()
for await (const event of client.watchEvents({ signal: controller.signal })) {
  console.log(event)
  if (shouldStop) controller.abort()
}
```

### Server Side

```typescript
import { EchoServerHandler } from '@eidos.space/echo/server'

const handler = new EchoServerHandler(myApiImplementation)

self.onmessage = async (e) => {
  await handler.handle(e.data, e.ports[0])
}
```

## Documentation

- [Architecture](./ARCHITECTURE.md)
- [API Reference](./API.md)
- [Migration Guide](./MIGRATION.md)

## License

AGPL-3.0

