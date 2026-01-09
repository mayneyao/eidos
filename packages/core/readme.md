# @eidos.space/core

[![npm version](https://img.shields.io/npm/v/@eidos.space/core.svg)](https://www.npmjs.com/package/@eidos.space/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **[Experimental]** Core functionality package for Eidos - A runtime-agnostic personal data management framework

## Features

- 🚀 **Runtime-agnostic** - Works in Deno, Bun, Node.js, Browser, and more
- 🔌 **Adapter pattern** - Pluggable database and filesystem implementations
- 🗄️ **SQLite-powered** - Efficient local-first data storage
- 📝 **Rich APIs** - Table operations, document management, tree structures
- 🎯 **Headless mode** - Perfect for CLI tools and server-side automation
- 🔒 **Type-safe** - Written in TypeScript with full type definitions

## Installation

```bash
# npm
npm install @eidos.space/core

# pnpm
pnpm add @eidos.space/core

# yarn
yarn add @eidos.space/core
```

## Quick Start

### Basic Setup

```typescript
import { DataSpace } from '@eidos.space/core'

// 1. Initialize database adapter (example with your custom adapter)
const db = new YourDatabaseAdapter("./data.sqlite3")

// 2. Create DataSpace instance
const dataSpace = new DataSpace({
  db: db,
  activeUndoManager: false,
  dbName: "my-workspace",
  context: {
    setInterval: undefined, // Runtime-specific APIs
  },
  efsManager: new YourFileSystemManager(),
})
```

### Working with Tables

```typescript
// Query all rows from a table
const rows = await dataSpace.table("tasks").rows.query()

// Query with filters
const completedTasks = await dataSpace.table("tasks").rows.query({
  where: { status: "completed" }
})

// Create a new row
await dataSpace.table("tasks").rows.create({
  title: "New Task",
  status: "pending",
  priority: "high"
})

// Update a row
await dataSpace.table("tasks").rows.update("row-id", {
  status: "completed"
})

// Delete a row
await dataSpace.table("tasks").rows.delete("row-id")
```

### Document Management

```typescript
// Get a document
const doc = await dataSpace.doc.get("document-id")

// Full-text search across documents
const results = await dataSpace.doc.search("project planning")

// Create a document
await dataSpace.doc.create({
  title: "Meeting Notes",
  content: "...",
})
```

### Tree Structure Operations

```typescript
// List all nodes in the tree
const allNodes = await dataSpace.tree.list()

// Get node details
const node = await dataSpace.tree.getNode("node-id")

// Create a new node
await dataSpace.tree.createNode({
  name: "New Folder",
  type: "folder",
  parentId: "parent-node-id"
})
```

## API Reference

### DataSpace

The main entry point for interacting with your data:

#### Table Operations

- `dataSpace.table(tableId)` - Get a table instance
  - `.rows.query(options?)` - Query rows with optional filters
  - `.rows.create(data)` - Create a new row
  - `.rows.update(rowId, data)` - Update a row
  - `.rows.delete(rowId)` - Delete a row

#### Document Operations

- `dataSpace.doc.get(docId)` - Get a document by ID
- `dataSpace.doc.search(query)` - Full-text search
- `dataSpace.doc.create(data)` - Create a new document

#### Tree Structure

- `dataSpace.tree.list()` - List all nodes
- `dataSpace.tree.listNodes()` - Alternative list method
- `dataSpace.tree.getNode(nodeId)` - Get a specific node
- `dataSpace.tree.createNode(data)` - Create a new node

## Architecture

### BaseServerDatabase Abstract Class

The core abstract class defines standard interfaces for database interactions:

```typescript
abstract class BaseServerDatabase {
  filename?: string

  abstract prepare(sql: string): any
  abstract close(): void
  abstract selectObjects(
    sql: string,
    bind?: any[]
  ): Promise<{ [columnName: string]: any }[]>
  abstract transaction(func: (db: BaseServerDatabase) => void): any
  abstract exec(opts: any): Promise<any>
  abstract createFunction(opt: {
    name: string
    xFunc: (...args: any[]) => any
  }): any
}
```

### Runtime Adapters

Each JavaScript runtime requires its own adapter implementation:

```typescript
// Example: Deno adapter
import { Database } from "jsr:@db/sqlite@0.12"

export class DenoServerDatabase implements BaseServerDatabase {
  db: Database

  constructor(path: string) {
    this.db = new Database(path)
  }

  prepare(sql: string) {
    return this.db.prepare(sql)
  }

  // ... implement other methods
}

// Example: Node.js adapter with better-sqlite3
import Database from 'better-sqlite3'

export class NodeServerDatabase implements BaseServerDatabase {
  db: Database.Database

  constructor(path: string) {
    this.db = new Database(path)
  }

  // ... implement required methods
}
```

### Supported Environments

| Runtime | SQLite Library | Status |
|---------|---------------|--------|
| Browser | `@sqlite.org/sqlite-wasm` | ✅ Supported |
| Node.js | `better-sqlite3` | ✅ Supported |
| Deno | `@db/sqlite` | ✅ Supported |
| Bun | `bun:sqlite` | 🔄 Experimental |
| Cloudflare Workers | `D1` | 🔄 Experimental |

## Advanced Usage

### Custom Database Adapter

Implement the `BaseServerDatabase` interface for your runtime:

```typescript
import { BaseServerDatabase } from '@eidos.space/core'

export class CustomDatabaseAdapter extends BaseServerDatabase {
  // Implement required methods based on your SQLite library
  prepare(sql: string) { /* ... */ }
  close() { /* ... */ }
  selectObjects(sql: string, bind?: any[]) { /* ... */ }
  transaction(func: Function) { /* ... */ }
  exec(opts: any) { /* ... */ }
  createFunction(opt: { name: string; xFunc: Function }) { /* ... */ }
}
```

### Custom Filesystem Manager

Implement filesystem operations for your environment:

```typescript
export class CustomFileSystemManager {
  // Implement file operations
  async read(path: string): Promise<Uint8Array> { /* ... */ }
  async write(path: string, data: Uint8Array): Promise<void> { /* ... */ }
  async delete(path: string): Promise<void> { /* ... */ }
  // ... other file operations
}
```

## Use Cases

- 📱 **CLI Tools** - Build command-line tools with local data storage
- 🤖 **Automation Scripts** - Automate data processing workflows
- 🌐 **Server-side Apps** - Use as backend data layer
- 📊 **Data Analysis** - Process and analyze personal data
- 🔄 **Data Migration** - Move data between different systems
- 🧪 **Testing** - Create test environments with isolated data

## Project Status

⚠️ **Experimental** - This package is under active development. APIs may change between versions. Use with caution in production environments.

## Related Projects

- [Eidos](https://github.com/mayneyao/eidos) - The main Eidos application
- [Eidos Desktop](https://github.com/mayneyao/eidos/tree/main/apps/desktop) - Desktop application
- [Eidos Web App](https://github.com/mayneyao/eidos/tree/main/apps/web-app) - Web application

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

- 📖 [Documentation](https://docs.eidos.space)
- 💬 [Discord Community](https://discord.gg/eidos)
- 🐛 [Issue Tracker](https://github.com/mayneyao/eidos/issues)
- 📧 Email: support@eidos.space

## License

MIT License - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2025 mayneyao
