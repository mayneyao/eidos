# `use-reactive-data` [WIP]

This document provides instructions on how to use the `createReactiveData` factory to create reactive data stores and associated React hooks for managing and synchronizing data with a `DataSpace` instance (SQLite worker).

## Table of Contents

1.  [Overview](#overview)
2.  [Core Concepts](#core-concepts)
    - [`BaseReactiveData`](#basereactivedata)
    - [`DataSpace`](#dataspace)
3.  [Creating a Reactive Store: `createReactiveData<T>(config)`](#creating-a-reactive-store-createreactivedatatconfig)
    - [Configuration: `ReactiveDataConfig<T>`](#configuration-reactivedataconfigt)
4.  [Returned Hooks](#returned-hooks)
    - [`useReactiveOperations`](#usereactiveoperations)
    - [`useItemById`](#useitembyid)
    - [`useItemsList`](#useitemslist)
    - [`useReload`](#usereload)
    - [`useSyncWithBroadcast`](#usesyncwithbroadcast)
    - [`useStore` (Advanced)](#usestore-advanced)
5.  [Example Usage](#example-usage)
6.  [Default CRUD Operations](#default-crud-operations)
7.  [Synchronization Mechanism](#synchronization-mechanism)

## Overview

The `createReactiveData` function is a factory that generates a set of React hooks and a data store for a specific data type (`T`) that extends `BaseReactiveData`. It aims to simplify data management by providing:

- Reactive updates to components when data changes.
- CRUD (Create, Read, Update, Delete) operations.
- Automatic synchronization across browser tabs/windows via `BroadcastChannel`.
- Caching of data to reduce database queries.

## Core Concepts

### `BaseReactiveData`

All data types managed by `createReactiveData` must extend the `BaseReactiveData` interface:

```typescript
interface BaseReactiveData {
  id: string
  // ... other common fields if any
}
```

The `id` field is crucial for identifying and managing individual data items.

### `DataSpace`

The `DataSpace` object (from ` '@/worker/web-worker/data-space'`) is a wrapper around the SQLite database running in a web worker. Most hooks require a `DataSpace | null` instance to interact with the database. If `null`, operations that require database access might be disabled or throw errors.

## Creating a Reactive Store: `createReactiveData<T>(config)`

You create a reactive data instance by calling `createReactiveData` with a configuration object.

```typescript
import { z } from "zod"

import { BaseReactiveData, createReactiveData } from "@/hooks/use-reactive-data"

interface MyData extends BaseReactiveData {
  name: string
  value: number
}

const myDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.number(),
})

const {
  useReactiveOperations,
  useItemById,
  useItemsList,
  // ... other hooks
} = createReactiveData<MyData>({
  tableName: "my_data_table",
  schema: myDataSchema,
  // Optional: override default CRUD operations
})
```

### Configuration: `ReactiveDataConfig<T>`

The `config` object has the following properties:

- `tableName: string`: (Required) The name of the table in the SQLite database that this data corresponds to.
- `schema: z.ZodType<T>`: (Required) A Zod schema for validating the data. While not strictly enforced for all internal operations in the provided code (e.g., commented out in `useSyncWithBroadcast`), it's good practice for ensuring data integrity, especially when parsing data from external sources or before sending it to the database.
- `get?: (sqlite: DataSpace, id: string, tableName?: string) => Promise<T>`: (Optional) A function to fetch a single item by its ID. Defaults to `(sqlite[tableName] as BaseTableImpl).get(id)`.
- `set?: (sqlite: DataSpace, data: T, tableName?: string) => Promise<void>`: (Optional) A function to update an existing item. Defaults to `(sqlite[tableName] as BaseTableImpl).set(data.id, data)`.
- `del?: (sqlite: DataSpace, data: T, tableName?: string) => Promise<void>`: (Optional) A function to delete an item. Defaults to `(sqlite[tableName]as BaseTableImpl).del(data.id)`.
- `add?: (sqlite: DataSpace, data: T, tableName?: string) => Promise<void>`: (Optional) A function to add a new item. Defaults to `(sqlite[tableName] as BaseTableImpl).add(data)`.
- `list?: (sqlite: DataSpace, tableName?: string) => Promise<T[]>`: (Optional) A function to fetch a list of all items. Defaults to `(sqlite[tableName] as BaseTableImpl).list()`.

You would typically override these CRUD functions if your data fetching or manipulation logic is more complex than the default direct table operations (e.g., joining tables, custom queries, as seen in `use-all-mblocks.ts` which uses `sqlite.extension.list`).

## Returned Hooks

Once `createReactiveData` is called, it returns an object containing several hooks:

### `useReactiveOperations(sqlite: DataSpace | null)`

This hook provides functions for modifying data.

- `insert(data: Omit<T, 'created_at' | 'updated_at'>): Promise<T>`:
  Adds a new item to the store and the database.
  Automatically updates the local cache.
  Throws an error if `sqlite` is not initialized.
- `update(id: string, data: Partial<Omit<T, 'id' | 'created_at' | 'updated_at'>>): Promise<T>`:
  Updates an existing item in the store and the database.
  Automatically updates `updated_at` timestamp.
  Merges existing data with the provided partial data.
  Automatically updates the local cache.
  Throws an error if `sqlite` is not initialized or if the item is not found.
- `delete(id: string): Promise<boolean>`:
  Removes an item from the store and the database.
  Automatically updates the local cache.
  Throws an error if `sqlite` is not initialized or if the item is not found. Returns `true` on success.

**Usage:**

```typescript
const { insert, update, delete: removeItem } = useReactiveOperations(sqlite)

// To insert
const newItem = await insert({ name: "New Item", value: 100 })

// To update
const updatedItem = await update("some-id", { value: 200 })

// To delete
await removeItem("some-id")
```

### `useItemById(sqlite: DataSpace | null, id: string)`

Fetches and subscribes to a single item by its ID.

- **Returns:** `{ data: T | null, loading: boolean }`
  - `data`: The item if found, otherwise `null`. The hook first checks the local cache. If not found, and `sqlite` is available, it attempts to fetch from the database using the configured `get` function (or default).
  - `loading`: `true` while fetching from the database, `false` otherwise.

**Usage:**

```typescript
const { data: item, loading } = useItemById(sqlite, 'item-id-123');

if (loading) return <p>Loading item...</p>;
if (!item) return <p>Item not found.</p>;
return <div>{item.name}</div>;
```

### `useItemsList(sqlite: DataSpace | null, params?: PaginationParams)`

Fetches and subscribes to a list of items.

- **Parameters:**
  - `sqlite: DataSpace | null`: The `DataSpace` instance.
  - `params?: PaginationParams`: Optional pagination parameters.
    - `PaginationParams: { page: number, pageSize: number }`
- **Returns:** `{ data: T[], loading: boolean }`
  - `data`: An array of items. If `params` are provided, the list is paginated. Initially, if data isn't cached and `sqlite` is available, it fetches using the configured `list` function (or default), populating the cache.
  - `loading`: `true` while initially fetching the list, `false` otherwise.

**Usage:**

```typescript
// Get all items
const { data: allItems, loading: loadingAll } = useItemsList(sqlite)

// Get paginated items
const { data: paginatedItems, loading: loadingPaginated } = useItemsList(
  sqlite,
  { page: 1, pageSize: 10 }
)
```

If `sqlite` is not available on mount, `itemsList` will be empty and `loading` will be false. If `sqlite` becomes available later, the effect will re-run and fetch the data.

### `useReload(sqlite: DataSpace | null)`

Provides a function to manually reload all data from the database.

- **Returns:** `reload: () => Promise<void>`
  - `reload`: An asynchronous function that, when called, re-fetches the entire list of items using the configured `list` function (or default) and updates the local store. Does nothing if `sqlite` is not available.

**Usage:**

```typescript
const reloadItems = useReload(sqlite)

// <button onClick={reloadItems}>Refresh Data</button>
```

### `useSyncWithBroadcast(sqlite: DataSpace | null)`

This hook sets up a `BroadcastChannel` to listen for data update signals from other tabs or contexts.

- When a message of type `EidosDataEventChannelMsgType.MetaTableUpdateSignalType` is received for the configured `tableName`:
  - It currently reloads the entire dataset for `Insert`, `Update`, and `Delete` operations to ensure consistency.
  - For `Delete` operations, it attempts to remove the item from the local cache immediately if `_old.id` is present, before the full reload.
- This hook should be called once in your component setup if you need cross-tab synchronization. It automatically cleans up the listener when the component unmounts.

**Usage:**

```typescript
// In your main component or custom hook that uses the reactive data
useSyncWithBroadcast(sqlite)
```

### `useStore()` (Advanced)

This hook provides direct access to the underlying ` Zustand`-like store created by `useSyncExternalStore`.

- **Returns:** The current state snapshot: `ReactiveDataState<T> = { items: Record<string, T>, itemsList: T[] }`
  - `items`: A key-value store of items, where the key is `item.id`.
  - `itemsList`: An array of all items.
- **Usage:** Generally, you should prefer using the more specific hooks (`useItemById`, `useItemsList`) for reading data, as they handle loading states and caching. `useStore` might be useful for specific scenarios where direct access to the entire cache is needed, but direct manipulation is not provided through this hook (manipulation should go through `useReactiveOperations`).

```typescript
const storeSnapshot = useStore()
console.log("Current cached items:", storeSnapshot.itemsList)
```

## Example Usage

Let's look at a simplified version inspired by `use-all-mblocks.ts`.

```typescript
// Assume this hook provides DataSpace
import { DataSpace } from "@/worker/web-worker/data-space"
import { z } from "zod"

import { useSqlite } from "@/hooks/use-sqlite"

import { BaseReactiveData, createReactiveData } from "./use-reactive-data"

// Path to your hook

// 1. Define the data structure and schema
interface Mblock extends BaseReactiveData {
  name: string
  type: "m_block"
  code: string
  icon?: string
}

const mblockSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  type: z.literal("m_block"),
  code: z.string(),
})

// 2. Create the reactive data hooks, overriding `list`
const {
  useItemsList: useMblockListInternal,
  useSyncWithBroadcast: useSyncMblocksInternal,
  useReload: useReloadMblocksInternal,
} = createReactiveData<Mblock>({
  tableName: "scripts" /* ScriptTableName */,
  schema: mblockSchema,
  // Custom list function for mblocks
  list: async (sqlite: DataSpace) => {
    const blocks = await sqlite.extension.list({
      // Example custom fetch
      type: "m_block",
      enabled: true,
    })
    return blocks as Mblock[] // Ensure the return type matches Mblock[]
  },
})

// 3. Create a custom hook to consume the reactive data
export const useAllMblocks = () => {
  const { sqlite } = useSqlite() // Get the DataSpace instance
  const { data: mblocks, loading } = useMblockListInternal(sqlite)
  useSyncMblocksInternal(sqlite) // Enable cross-tab sync
  const reload = useReloadMblocksInternal(sqlite)

  return {
    mblocks,
    reload,
    loading,
  }
}

// 4. Use the custom hook in a component
// function MyComponent() {
//   const { mblocks, reload, loading } = useAllMblocks();
//   if (loading) return <p>Loading mblocks...</p>;
//   return (
//     <>
//       <button onClick={reload}>Reload Mblocks</button>
//       <ul>{mblocks.map(block => <li key={block.id}>{block.name}</li>)}</ul>
//     </>
//   );
// }
```

## Default CRUD Operations

If you don't provide the `get`, `set`, `del`, `add`, or `list` functions in the `ReactiveDataConfig`, `createReactiveData` uses default implementations. These defaults assume that your `DataSpace` instance has table objects (extending `BaseTableImpl`) that match the `tableName` you provided.

- `defaultGet(sqlite, id, tableName)`: Calls `(sqlite[tableName]).get(id)`
- `defaultSet(sqlite, data, tableName)`: Calls `(sqlite[tableName]).set(data.id, data)`
- `defaultDel(sqlite, data, tableName)`: Calls `(sqlite[tableName]).del(data.id)`
- `defaultAdd(sqlite, data, tableName)`: Calls `(sqlite[tableName]).add(data)`
- `defaultList(sqlite, tableName)`: Calls `(sqlite[tableName]).list()`

These defaults interact directly with methods of a `BaseTableImpl` corresponding to the `tableName`.

## Synchronization Mechanism

The `useSyncWithBroadcast` hook facilitates real-time data synchronization across multiple browser tabs or windows using the `BroadcastChannel` API.

- **Channel Name:** It listens on a predefined channel named `EidosDataEventChannelName`.
- **Message Type:** It specifically processes messages of type `EidosDataEventChannelMsgType.MetaTableUpdateSignalType`.
- **Payload:** The message payload (`EidosDataEventChannelMsg['payload']`) is expected to contain:
  - `table: string`: The name of the table that was updated.
  - `_new: any`: The new state of the data (for Insert/Update).
  - `_old: any`: The old state of the data (for Delete/Update).
  - `type: DataUpdateSignalType`: The type of update (`Insert`, `Update`, `Delete`).

**Behavior:**

1.  The hook filters messages to only react to those where `payload.table` matches the `config.tableName` of the reactive store.
2.  Upon a relevant `Insert` or `Update` signal, it triggers a full reload of the data from the database via the `list` function.
    - The commented-out lines `// const validatedNew = config.schema.parse(_new)` and `// addItem(validatedNew as T)` suggest a more granular update was considered but the current implementation opts for a full reload for simplicity and guaranteed consistency.
3.  Upon a relevant `Delete` signal, it first attempts to optimistically remove the item from the local cache using `_old.id` if available, and then also triggers a full reload.
4.  The `Zod` schema (`config.schema`) is available within the hook but currently not used to parse `_new` or `_old` data directly from the broadcast message in the active code path for updates.

This reload-on-change strategy ensures data consistency across tabs but might not be the most performant for applications with very frequent updates or very large datasets, as it re-fetches the entire list. Future optimizations could involve more granularly applying changes from the broadcast message to the local store, using the provided `_new` and `_old` data.
