<eidos-sdk>

### Base

You can directly call the global object `eidos`, which provides many APIs to fetch data. For example:

```jsx
// Basic query with where condition
// Note: Use Database Column Names (not Field Names) in the where clause
const rows = await eidos.currentSpace.table("tableId").rows.findMany({
  where: {
    title_col: "123"  // title_col is the database column name
  }
})

// Advanced query with ordering, pagination and field selection
const advancedRows = await eidos.currentSpace.table("tableId").rows.findMany({
  where: {
    status_field: "active"  // status_field is the database column name
  },
  orderBy: {
    _created_time: "desc"  // _created_time is the database column name
  },
  skip: 10,
  take: 20,
  select: ["title_col", "status_field", "_created_time"]  // Use database column names
})

// Count rows matching a condition
const count = await eidos.currentSpace.table("tableId").rows.count({
  where: {
    status_field: "active"  // status_field is the database column name
  }
})
```

NOTE: don't use `eidos.currentSpace.<table>.rows.findMany` to query data unless you have been told that the table is available.

### Table

- every table has a `_id` field, you can use it to identify a record.

**Important**: There are two naming systems in Eidos:
- **Field Name**: The human-readable name shown in the UI (e.g., "Title", "Status")
- **Database Column Name**: The internal database column name (e.g., "title_col", "status_field")

When using `findMany`, `count`, or other query methods, you must use **Database Column Names** in the `where` clause and `select` array, not Field Names.

{{bindings}}

#### API Reference

```ts
/**
 * Find many rows with advanced query options
 * @param options Query options including where, orderBy, skip, take, select
 * @returns Array of transformed rows
 */
findMany(options?: {
  where?: Record<string, any>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  skip?: number;
  take?: number;
  select?: string[];
}): Promise<Record<string, any>[]>;

/**
 * Count rows with advanced query options
 * @param options Query options excluding select, orderBy, skip, take
 * @returns Count of matching rows
 */
count(options?: {
  where?: Record<string, any>;
}): Promise<number>;
```

### File

- for file, you can use `eidos.currentSpace.file.upload` to upload file.
  the `publicUrl` is the file url in EFS, you can use it to access the file. it can be used in table file field.

#### API Reference

```jsx

interface IFile {
  id: string
  name: string
  path: string
  size: number
  mime: string
  publicUrl: string
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
