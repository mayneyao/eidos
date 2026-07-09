---
title: API & SDK
---

Eidos doesn't provide traditional REST APIs. Instead, it exposes Eidos's core capabilities through a unified SDK interface. This means that official features, extension development, and API calls all use the same interfaces and methods.

## Unified Calling Approach

Eidos provides two different usage scenarios, but they both use the same API interface:

### 1. Extension Development

In extensions, you can directly use the global `eidos` object:

```ts
// Query table data in current space (tableId is a UUIDv7 without dashes)
const Users = eidos.currentSpace.table("01935b4c9d2e7f8a0b1c2d3e4f5a6b7c")

// CRUD operations
const users = await Users.findMany()
const newUser = await Users.create({
  data: { name: "New Record", status: "active" },
})
```

### 2. HTTP API Calls

Through RPC interface, you can remotely call the same methods.

```ts
const response = await fetch("http://localhost:13127/rpc", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    space: "mySpace",
    method: "table('01935b4c9d2e7f8a0b1c2d3e4f5a6b7c').findMany",
    params: [{}],
  }),
})

const data = await response.json()
console.log(data)
```

## API Reference

Eidos provides complete API reference documentation with detailed descriptions of all available methods and functionality:

- [Space API Reference](../../api-reference/space) - Navigation, document management, table operations, and extension node operations
- [AI API Reference](../../api-reference/ai) - Text generation and structured data processing
