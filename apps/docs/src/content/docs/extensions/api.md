---
title: API & SDK
---

Eidos doesn't provide traditional REST APIs. Instead, it exposes Eidos's core capabilities through a unified SDK interface. This means that official features, extension development, and API calls all use the same interfaces and methods.

## Unified Calling Approach

Eidos provides three different usage scenarios, but they all use the same API interface:

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

### 3. Headless Mode

Headless mode is a powerful feature of Eidos that allows you to run Eidos instances independently without relying on Eidos Desktop.

#### Core Concepts

Each Eidos Space is essentially an independent SQLite file, which means:

- **Completely Independent**: Each Space can be exported and run separately
- **Lightweight Deployment**: Only requires SQLite file to start a complete Eidos instance
- **Easy Integration**: Can be quickly integrated into any JavaScript/TypeScript runtime application

#### Usage

It revolves around `DataSpace`. Build a `DataSpace` instance, then you can use the same API for operations:

```ts
import { DataSpace } from "@eidos.space/core"

// 1. Initialize database adapter
const db = new DenoServerDatabase("./db.sqlite3")

// 2. Create DataSpace instance
const dataSpace = new DataSpace({
  db: db,
  activeUndoManager: false,
  dbName: "your-db-name",
  context: {
    // Runtime-specific API implementations
    setInterval: undefined,
  },
  // TODO: Filesystem manager implementation
  efsManager: new EidosFileSystemManager(),
})
```

#### Typical Use Cases

**1. Blog System**

```ts
const Posts = dataSpace.table("01935b4c9d2e7f8a0b1c2d3e4f5a6b7c")
const posts = await Posts.findMany()
```

**2. Personal Website CMS**

```ts
const Pages = dataSpace.table("01935b4c9d2e7f8a0b1c2d3e4f5a6b7c")
const pages = await Pages.findMany()
```

**3. API Service Backend**

```ts
import express from "express"

const Users = dataSpace.table("01935b4c9d2e7f8a0b1c2d3e4f5a6b7c")

// RESTful API endpoints
app.get("/api/users", async (req, res) => {
  const users = await Users.findMany()
  res.json(users)
})

app.post("/api/users", async (req, res) => {
  const newUser = await Users.create({ data: req.body })
  res.json(newUser)
})
```

## API Reference

Eidos provides complete API reference documentation with detailed descriptions of all available methods and functionality:

- [Space API Reference](../../api-reference/space) - Navigation, document management, table operations, and extension node operations
- [AI API Reference](../../api-reference/ai) - Text generation and structured data processing
