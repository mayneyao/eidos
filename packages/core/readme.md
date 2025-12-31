# Eidos Core Package

> [WIP] [Experimental] Core functionality package for Eidos

## Overview

Eidos Core provides an abstract DataSpace implementation designed with the following goals:

- Runtime-agnostic: No direct dependencies on specific runtime APIs
- Adapter pattern support for different environments
- Headless mode support

Through different adapters, it supports:

- Multiple runtime environments (Deno, Bun, Node.js, Browser, etc.)
- Various filesystem implementations (Deno.Fs, Node fs, Browser OPFS)
- Different SQLite database connectors (sqlite3, better-sqlite3, libsql, etc.)

## Architecture

### BaseServerDatabase Abstract Class

This core abstract class defines standard interfaces for database interactions:

```ts
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

Each JavaScript runtime environment has its own adapter implementation:

```ts
import { Database } from "jsr:@db/sqlite@0.12"

/**
 * Example database adapter for Deno environment
 */
export class DenoServerDatabase implements BaseServerDatabase {
  db: Database

  constructor(path: string) {
    super()
    this.db = new Database(path)
  }

  // Implementation of abstract methods...
}
```

## Usage

```ts
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

// 3. Use DataSpace APIs

// standard meta table api
const allNodes = await dataSpace.tree.list()
// direct access to tree methods  
const allNodes2 = await dataSpace.tree.listNodes()

// Query table rows
await dataSpace.table("tableid").rows.query()
// modify table rows
await dataSpace.table("tableid").rows.update("rowid", {
  title: "New Title",
})

// get document
await dataSpace.doc.get("documentid")
// full text search for document
await dataSpace.doc.search("query")

// ...
```

## License

MIT
