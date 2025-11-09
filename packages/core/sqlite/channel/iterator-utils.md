# Iterator Functions and Parameter Serialization

## Overview

This module provides a generic system for handling iterator functions (functions that return `AsyncIterable`) and smart parameter serialization for RPC calls.

## Features

1. **Iterator Function Registry**: Centralized registry for iterator functions
2. **Smart Parameter Serialization**: Automatically extracts non-serializable values (AbortSignal, Date, RegExp, etc.)
3. **Automatic Detection**: Proxy layer automatically detects and handles iterator functions

## Registering Iterator Functions

To add a new iterator function, simply register it:

```typescript
import { registerIteratorFunction } from '@/packages/core/sqlite/channel/iterator-utils'

// Register a new iterator function
registerIteratorFunction('fs.watch')        // Already registered
registerIteratorFunction('stream.read')      // Example: add new one
registerIteratorFunction('events.on')        // Example: add new one
```

## Using Iterator Functions

Iterator functions work automatically once registered:

```typescript
// In your code
const controller = new AbortController()
const { signal } = controller

// AbortSignal is automatically extracted and handled
for await (const event of sqlite.fs.watch(path, { 
  recursive: true,
  signal  // Automatically extracted and handled
})) {
  console.log('File changed:', event)
  
  // Cancel after 5 seconds
  setTimeout(() => controller.abort(), 5000)
}
```

## Parameter Serialization

The system automatically handles non-serializable values:

- **AbortSignal**: Extracted and replaced with placeholder, new signal created on remote
- **AbortController**: Converted to AbortSignal
- **Date**: Serialized to ISO string, restored on remote
- **RegExp**: Serialized to { source, flags }, restored on remote
- **Map/Set**: Serialized to arrays, restored on remote
- **Error**: Serialized to { name, message, stack }, restored on remote

## How It Works

1. **Proxy Layer** (`getSqliteProxy`):
   - Detects iterator functions using registry
   - Serializes parameters (extracts non-serializable values)
   - Extracts AbortSignal for cancellation support
   - Routes to `onIterator` for iterator functions

2. **Worker/Main Process**:
   - Detects iterator functions using registry
   - Creates new AbortController for cancellation
   - Restores serialized parameters (if needed)
   - Handles iterator results appropriately

3. **Client Side**:
   - Listens for AbortSignal abort events
   - Sends cancellation messages to remote
   - Receives iterator values via `onIterator`

## Adding Support for New Non-Serializable Types

To add support for a new non-serializable type, update `extractNonSerializable` and `restoreNonSerializable` in `iterator-utils.ts`:

```typescript
// In extractNonSerializable
if (val instanceof YourCustomType) {
  const key = currentPath || "yourType"
  extracted.set(key, { type: "YourCustomType", value: serializeYourType(val) })
  return { __serialized: "YourCustomType", __path: key }
}

// In restoreNonSerializable
case "YourCustomType":
  return deserializeYourType(extractedItem.value)
```

