---
title: Table SDK
description: Eidos Table（表格）数据操作 (CRUD) 参考
---

`eidos.space.table()` 方法提供了类似 Prisma 风格的 CRUD (增删改查) 操作 API。这是与表格数据交互的推荐方式。

:::note
Eidos 的表格存在两种字段名称：**展示名称** (UI 中显示的列名) 和 **数据库名称** (SQLite 中实际的列名)。Table API 使用的是**数据库真实列名**。例如，一个显示为 "Created At" 的列，其数据库名称可能是 `created_at` 或者是类似 `cfbwxeq` 的生成名称。保留字段包括 `_id`、`title`、`_created_time`、`_last_edited_time` 等。
:::

## 基本用法

```typescript
// 获取表格客户端 (tableId 是不带连字符的 UUIDv7)
const Users = eidos.space.table("01935b4c9d2e7f8a0b1c2d3e4f5a6b7c")

// CRUD 操作
await Users.create({ data: { name: "张三", age: 25 } })
await Users.findMany({ where: { age: { gte: 18 } } })
```

## `create(args)`

创建单条记录。如果未提供 `_id`，将自动生成。

```typescript
async create(args: {
  data: Record<string, any>
}): Promise<Record<string, any> & { _id: string }>
```

## `createMany(args)`

批量创建多条记录。

```typescript
async createMany(args: {
  data: Record<string, any>[]
  skipDuplicates?: boolean
}): Promise<{ count: number }>
```

## `findUnique(args)`

通过 `_id` 查找单条记录。

```typescript
async findUnique(args: {
  where: { _id: string }
}): Promise<Record<string, any> | null>
```

## `findFirst(args)`

查找符合条件的第一条记录。

```typescript
async findFirst(args: {
  where?: Record<string, any>
  orderBy?: Record<string, 'asc' | 'desc'>
}): Promise<Record<string, any> | null>
```

## `findMany(args)`

查询多条记录，支持过滤、排序和分页。

```typescript
async findMany(args?: {
  where?: Record<string, any>
  orderBy?: Record<string, 'asc' | 'desc'>
  skip?: number
  take?: number
  select?: Record<string, boolean>
}): Promise<Record<string, any>[]>
```

**Where 子句运算符:**

| 运算符       | 描述         | 示例                                        |
| ------------ | ------------ | ------------------------------------------- |
| `equals`     | 精确匹配     | `{ name: { equals: "张三" } }`              |
| `not`        | 不等于       | `{ status: { not: "deleted" } }`            |
| `gt`         | 大于         | `{ age: { gt: 18 } }`                       |
| `gte`        | 大于等于     | `{ age: { gte: 18 } }`                      |
| `lt`         | 小于         | `{ age: { lt: 65 } }`                       |
| `lte`        | 小于等于     | `{ age: { lte: 65 } }`                      |
| `contains`   | 包含子字符串 | `{ name: { contains: "张" } }`              |
| `startsWith` | 以...开头    | `{ email: { startsWith: "admin" } }`        |
| `endsWith`   | 以...结尾    | `{ email: { endsWith: "@gmail.com" } }`     |
| `in`         | 在数组中     | `{ status: { in: ["active", "pending"] } }` |
| `notIn`      | 不在数组中   | `{ status: { notIn: ["deleted"] } }`        |

## `count(args)`

统计符合条件的记录数。

```typescript
async count(args?: {
  where?: Record<string, any>
}): Promise<number>
```

## `update(args)`

通过 `_id` 更新单条记录。

```typescript
async update(args: {
  where: { _id: string }
  data: Record<string, any>
}): Promise<Record<string, any> | null>
```

## `updateMany(args)`

批量更新符合条件的记录。

```typescript
async updateMany(args: {
  where: Record<string, any>
  data: Record<string, any>
}): Promise<{ count: number }>
```

## `delete(args)`

通过 `_id` 删除单条记录。

```typescript
async delete(args: {
  where: { _id: string }
}): Promise<Record<string, any> | null>
```

## `deleteMany(args)`

批量删除符合条件的记录。

```typescript
async deleteMany(args?: {
  where?: Record<string, any>
}): Promise<{ count: number }>
```
