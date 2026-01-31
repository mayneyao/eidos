<eidos-sdk>

### Base

You can directly call the global object `eidos`, which provides many APIs to fetch data. For example:

```jsx
// Get a table client (tableId is a UUIDv7 without dashes)
const Users = eidos.currentSpace.table("01935b4c9d2e7f8a0b1c2d3e4f5a6b7c")

// Basic query - get all rows
const rows = await Users.findMany()

// Query with where condition
// Note: Use Database Column Names (not Field Names) in the where clause
const filteredRows = await Users.findMany({
  where: {
    title: "123"  // title is the database column name
  }
})

// Advanced query with ordering, pagination and field selection
const advancedRows = await Users.findMany({
  where: {
    status: "active"  // status is the database column name
  },
  orderBy: {
    _created_time: "desc"  // _created_time is the database column name
  },
  skip: 10,
  take: 20
})

// Count rows matching a condition
const count = await Users.count({
  where: {
    status: "active"  // status is the database column name
  }
})

// Create a new row
const newUser = await Users.create({
  data: { name: "张三", status: "active" }
})

// Update a row by _id
await Users.update({
  where: { _id: "rowId" },
  data: { status: "inactive" }
})

// Delete a row by _id
await Users.delete({
  where: { _id: "rowId" }
})
```

NOTE: don't use `eidos.currentSpace.table(...).findMany` to query data unless you have been told that the table is available.

### Table

- every table has a `_id` field, you can use it to identify a record.

**Important**: There are two naming systems in Eidos:
- **Field Name**: The human-readable name shown in the UI (e.g., "Title", "Status")
- **Database Column Name**: The internal database column name (e.g., "title", "status")

When using `findMany`, `count`, or other query methods, you must use **Database Column Names** in the `where` clause, not Field Names.

{{bindings}}

#### API Reference

```ts
/**
 * Get a table client
 * @param tableId Table ID (UUIDv7 without dashes)
 * @returns TableClient instance
 */
table(tableId: string): TableClient;

/**
 * Find many rows with advanced query options
 * @param options Query options including where, orderBy, skip, take
 * @returns Array of rows
 */
findMany(options?: {
  where?: Record<string, any>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  skip?: number;
  take?: number;
}): Promise<Record<string, any>[]>;

/**
 * Count rows matching a condition
 * @param options Query options with where clause
 * @returns Count of matching rows
 */
count(options?: {
  where?: Record<string, any>;
}): Promise<number>;

/**
 * Create a new row
 * @param args Object with data property
 * @returns Created row with _id
 */
create(args: {
  data: Record<string, any>;
}): Promise<Record<string, any>>;

/**
 * Update a row by _id
 * @param args Object with where and data properties
 * @returns Updated row or null
 */
update(args: {
  where: { _id: string };
  data: Record<string, any>;
}): Promise<Record<string, any> | null>;

/**
 * Delete a row by _id
 * @param args Object with where property
 * @returns Deleted row or null
 */
delete(args: {
  where: { _id: string };
}): Promise<Record<string, any> | null>;
```

### File

- for file, you can use `eidos.currentSpace.file.upload` to upload file.
  Note: In the `eidos__files` table, the stored path starts with `files/`. To construct a pathname that can be accessed in references and extensions, prefix it with `/`, i.e., use `"/" + path`. The file path can be used in table file field.

#### API Reference

```jsx

interface IFile {
  id: string
  name: string
  path: string
  size: number
  mime: string
  created_at?: string
  is_vectorized?: boolean // whether the file is vectorized, when file is vectorized, it will be stored in `eidos__embeddings` table
}

/**
 * Upload a file to EFS with specified parent path
 * @param fileData File data as ArrayBuffer or base64 string
 * @param fileName Original file name
 * @param mimeType File mime type
 * @param parentPath Parent path array, defaults to ["files"]
 * @returns Uploaded file info
 */
public async upload(
  fileData: ArrayBuffer | string, // ArrayBuffer 或 base64 字符串
  fileName: string,
  mimeType: string,
  parentPath?: string[]
): Promise<IFile>;


```

</eidos-sdk>
