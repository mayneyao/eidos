---
title: Table SDK
description: Table data operations (CRUD) reference for Eidos
---

The `eidos.space.table()` method provides a Prisma-style API for CRUD (Create, Read, Update, Delete) operations on tables. This is the recommended way to interact with table data.

:::note
Eidos tables have two types of field names: **display names** (shown in the UI) and **database names** (actual column names in SQLite). The Table API uses the **actual database column names**. For example, a column displayed as "Created At" might have the database name `created_at` or a generated name like `cfbwxeq`. Reserved fields include `_id`, `title`, `_created_time`, `_last_edited_time`, etc.
:::

## Basic Usage

```typescript
// Get a table client (tableId is a UUIDv7 without dashes)
const Users = eidos.space.table("01935b4c9d2e7f8a0b1c2d3e4f5a6b7c")

// CRUD operations
await Users.create({ data: { name: "John Doe", age: 25 } })
await Users.findMany({ where: { age: { gte: 18 } } })
```

## `create(args)`

Create a single record. Auto-generates `_id` if not provided.

```typescript
async create(args: {
  data: Record<string, any>
}): Promise<Record<string, any> & { _id: string }>
```

## `createMany(args)`

Batch create multiple records.

```typescript
async createMany(args: {
  data: Record<string, any>[]
  skipDuplicates?: boolean
}): Promise<{ count: number }>
```

## `findUnique(args)`

Find a single record by `_id`.

```typescript
async findUnique(args: {
  where: { _id: string }
}): Promise<Record<string, any> | null>
```

## `findFirst(args)`

Find the first matching record.

```typescript
async findFirst(args: {
  where?: Record<string, any>
  orderBy?: Record<string, 'asc' | 'desc'>
}): Promise<Record<string, any> | null>
```

## `findMany(args)`

Query multiple records with filtering, sorting, and pagination.

```typescript
async findMany(args?: {
  where?: Record<string, any>
  orderBy?: Record<string, 'asc' | 'desc'>
  skip?: number
  take?: number
  select?: Record<string, boolean>
}): Promise<Record<string, any>[]>
```

**Where Clause Operators:**

| Operator     | Description           | Example                                     |
| ------------ | --------------------- | ------------------------------------------- |
| `equals`     | Exact match           | `{ name: { equals: "John" } }`              |
| `not`        | Not equal             | `{ status: { not: "deleted" } }`            |
| `gt`         | Greater than          | `{ age: { gt: 18 } }`                       |
| `gte`        | Greater than or equal | `{ age: { gte: 18 } }`                      |
| `lt`         | Less than             | `{ age: { lt: 65 } }`                       |
| `lte`        | Less than or equal    | `{ age: { lte: 65 } }`                      |
| `contains`   | Contains substring    | `{ name: { contains: "Jo" } }`              |
| `startsWith` | Starts with           | `{ email: { startsWith: "admin" } }`        |
| `endsWith`   | Ends with             | `{ email: { endsWith: "@gmail.com" } }`     |
| `in`         | In array              | `{ status: { in: ["active", "pending"] } }` |
| `notIn`      | Not in array          | `{ status: { notIn: ["deleted"] } }`        |

## `count(args)`

Count matching records.

```typescript
async count(args?: {
  where?: Record<string, any>
}): Promise<number>
```

## `update(args)`

Update a single record by `_id`.

```typescript
async update(args: {
  where: { _id: string }
  data: Record<string, any>
}): Promise<Record<string, any> | null>
```

## `updateMany(args)`

Batch update multiple records matching criteria.

```typescript
async updateMany(args: {
  where: Record<string, any>
  data: Record<string, any>
}): Promise<{ count: number }>
```

## `delete(args)`

Delete a single record by `_id`.

```typescript
async delete(args: {
  where: { _id: string }
}): Promise<Record<string, any> | null>
```

## `deleteMany(args)`

Batch delete multiple records matching criteria.

```typescript
async deleteMany(args?: {
  where?: Record<string, any>
}): Promise<{ count: number }>
```
