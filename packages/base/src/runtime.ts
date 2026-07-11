import type { BaseConnection, BaseSqlParams } from "./connection"
import {
  BASE_COLUMNS_TABLE,
  BASE_META_TABLE,
  BASE_TABLES_TABLE,
  BASE_VIEWS_TABLE,
} from "./constants"
import { BaseError } from "./errors"
import {
  assertBaseColumnName,
  assertBaseTableId,
  createBaseId,
  quoteIdentifier,
  rawTableNameForId,
} from "./identifiers"
import { setBaseMetadata } from "./schema"
import type {
  BaseFieldInfo,
  BaseFieldType,
  BaseMetadata,
  BaseRow,
  BaseStorageCodec,
  BaseTableInfo,
  BaseViewInfo,
  CreateBaseFieldInput,
  CreateBaseTableInput,
  UpdateBaseViewInput,
} from "./types"
import { validateBase } from "./validation"

interface RegistryRow {
  id: string
  name: string
  raw_table_name: string
  position: number | null
  icon: string | null
  description: string | null
  created_at: string
  updated_at: string
}

interface FieldRow {
  name: string
  type: BaseFieldType
  table_name: string
  table_column_name: string
  property: string | null
  storage_codec: BaseStorageCodec
  value_kind: BaseFieldInfo["valueKind"]
  is_hidden: number
  is_derived: number
  source_table_column_name: string | null
  depends_on: string | null
}

interface ViewRow {
  id: string
  name: string
  type: string
  table_id: string
  query: string
  properties: string | null
  filter: string | null
  order_map: string | null
  hidden_fields: string | null
  position: number | null
  created_at: string
  updated_at: string
}

const SYSTEM_FIELDS: Array<{
  name: string
  type: BaseFieldType
  columnName: string
  hidden: boolean
}> = [
  { name: "_id", type: "row-id", columnName: "_id", hidden: true },
  { name: "title", type: "title", columnName: "title", hidden: false },
  {
    name: "Created time",
    type: "created-time",
    columnName: "_created_time",
    hidden: true,
  },
  {
    name: "Last edited time",
    type: "last-edited-time",
    columnName: "_last_edited_time",
    hidden: true,
  },
  {
    name: "Created by",
    type: "created-by",
    columnName: "_created_by",
    hidden: true,
  },
  {
    name: "Last edited by",
    type: "last-edited-by",
    columnName: "_last_edited_by",
    hidden: true,
  },
]

function tableInfoFromRow(row: RegistryRow): BaseTableInfo {
  return {
    id: row.id,
    name: row.name,
    rawTableName: row.raw_table_name,
    position: row.position,
    icon: row.icon,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseJson(value: string | null): unknown {
  if (value === null) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function sqlTypeForField(type: CreateBaseFieldInput["type"]): string {
  if (type === "checkbox") return "BOOLEAN"
  if (type === "number") return "REAL"
  if (type === "rating") return "INT"
  return "TEXT"
}

function defaultStorageCodec(
  type: CreateBaseFieldInput["type"]
): BaseStorageCodec {
  return type === "multi-select" ? "csv_ids" : "scalar"
}

function sqliteParameter(value: BaseRow[string]): BaseSqlParams[number] {
  return typeof value === "boolean" ? (value ? 1 : 0) : value
}

export class BaseRuntime {
  constructor(
    readonly connection: BaseConnection,
    private readonly closeConnection = false
  ) {}

  close(): void {
    if (this.closeConnection) this.connection.close?.()
  }

  info(): BaseMetadata {
    const result = validateBase(this.connection)
    if (!result.valid || !result.metadata) {
      throw new BaseError(
        "invalid-schema",
        result.errors.map((issue) => issue.message).join("; ") ||
          "Invalid Base file"
      )
    }
    return result.metadata
  }

  listTables(): BaseTableInfo[] {
    return this.connection
      .query<RegistryRow>(
        `SELECT id, name, raw_table_name, position, icon, description,
                created_at, updated_at
           FROM ${BASE_TABLES_TABLE}
          ORDER BY position, created_at, id`
      )
      .map(tableInfoFromRow)
  }

  getTable(tableId: string): BaseTableInfo {
    assertBaseTableId(tableId)
    const row = this.connection.get<RegistryRow>(
      `SELECT id, name, raw_table_name, position, icon, description,
              created_at, updated_at
         FROM ${BASE_TABLES_TABLE}
        WHERE id = ?`,
      [tableId]
    )
    if (!row) {
      throw new BaseError("table-not-found", `Base table not found: ${tableId}`)
    }
    return tableInfoFromRow(row)
  }

  createTable(input: CreateBaseTableInput): BaseTableInfo {
    const tableId = assertBaseTableId(input.id ?? createBaseId("table"))
    const rawTableName = rawTableNameForId(tableId)
    const quotedTable = quoteIdentifier(rawTableName)
    const position =
      this.connection.get<{ position: number }>(
        `SELECT COALESCE(MAX(position), 0) + 1 AS position FROM ${BASE_TABLES_TABLE}`
      )?.position ?? 1

    this.connection.transaction(() => {
      this.connection.exec(`
        CREATE TABLE ${quotedTable} (
          _id TEXT PRIMARY KEY NOT NULL,
          title TEXT NULL,
          _created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          _last_edited_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          _created_by TEXT DEFAULT 'unknown',
          _last_edited_by TEXT DEFAULT 'unknown'
        );
      `)
      this.connection.run(
        `INSERT INTO ${BASE_TABLES_TABLE}
          (id, name, raw_table_name, position, icon, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          tableId,
          input.name,
          rawTableName,
          position,
          input.icon ?? null,
          input.description ?? null,
        ]
      )
      for (const field of SYSTEM_FIELDS) {
        this.connection.run(
          `INSERT INTO ${BASE_COLUMNS_TABLE}
            (name, type, table_name, table_column_name, storage_codec,
             value_kind, is_hidden, is_derived)
           VALUES (?, ?, ?, ?, 'scalar', 'system', ?, 0)`,
          [
            field.name,
            field.type,
            rawTableName,
            field.columnName,
            field.hidden ? 1 : 0,
          ]
        )
      }
      for (const field of input.fields ?? []) this.addField(tableId, field)
      if (input.createDefaultView !== false) {
        this.connection.run(
          `INSERT INTO ${BASE_VIEWS_TABLE}
            (id, name, type, table_id, query, position)
           VALUES (?, 'Grid', 'grid', ?, ?, 1)`,
          [createBaseId("view"), tableId, `SELECT * FROM ${quotedTable}`]
        )
      }
      const currentDefault = this.connection.get<{ value: string }>(
        `SELECT value FROM ${BASE_META_TABLE} WHERE key = 'default_table_id'`
      )
      if (!currentDefault) {
        setBaseMetadata(this.connection, { default_table_id: tableId })
      }
    })
    return this.getTable(tableId)
  }

  listFields(tableId: string): BaseFieldInfo[] {
    const table = this.getTable(tableId)
    return this.connection
      .query<FieldRow>(
        `SELECT name, type, table_name, table_column_name, property,
                storage_codec, value_kind, is_hidden, is_derived,
                source_table_column_name, depends_on
           FROM ${BASE_COLUMNS_TABLE}
          WHERE table_name = ?
          ORDER BY created_at, rowid`,
        [table.rawTableName]
      )
      .map((field) => ({
        name: field.name,
        type: field.type,
        tableName: field.table_name,
        tableColumnName: field.table_column_name,
        property: parseJson(field.property) as Record<string, unknown> | null,
        storageCodec: field.storage_codec,
        valueKind: field.value_kind,
        isHidden: field.is_hidden === 1,
        isDerived: field.is_derived === 1,
        sourceTableColumnName: field.source_table_column_name,
        dependsOn: parseJson(field.depends_on),
      }))
  }

  listViews(tableId: string): BaseViewInfo[] {
    this.getTable(tableId)
    return this.connection
      .query<ViewRow>(
        `SELECT id, name, type, table_id, query, properties, filter,
                order_map, hidden_fields, position, created_at, updated_at
           FROM ${BASE_VIEWS_TABLE}
          WHERE table_id = ?
          ORDER BY position, created_at, id`,
        [tableId]
      )
      .map((view) => ({
        id: view.id,
        name: view.name,
        type: view.type,
        tableId: view.table_id,
        query: view.query,
        properties: parseJson(view.properties) as Record<
          string,
          unknown
        > | null,
        filter: parseJson(view.filter),
        orderMap: parseJson(view.order_map) as Record<string, number> | null,
        hiddenFields: (parseJson(view.hidden_fields) as string[] | null) ?? [],
        position: view.position,
        createdAt: view.created_at,
        updatedAt: view.updated_at,
      }))
  }

  updateView(viewId: string, changes: UpdateBaseViewInput): BaseViewInfo {
    const existing = this.connection.get<ViewRow>(
      `SELECT id, name, type, table_id, query, properties, filter,
              order_map, hidden_fields, position, created_at, updated_at
         FROM ${BASE_VIEWS_TABLE}
        WHERE id = ?`,
      [viewId]
    )
    if (!existing) {
      throw new BaseError("view-not-found", `Base view not found: ${viewId}`)
    }
    this.connection.run(
      `UPDATE ${BASE_VIEWS_TABLE}
          SET properties = ?, order_map = ?, hidden_fields = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [
        JSON.stringify(
          changes.properties === undefined
            ? parseJson(existing.properties)
            : changes.properties
        ),
        JSON.stringify(
          changes.orderMap === undefined
            ? parseJson(existing.order_map)
            : changes.orderMap
        ),
        JSON.stringify(
          changes.hiddenFields === undefined
            ? parseJson(existing.hidden_fields)
            : changes.hiddenFields
        ),
        viewId,
      ]
    )
    setBaseMetadata(this.connection, {})
    const updated = this.listViews(existing.table_id).find(
      (view) => view.id === viewId
    )
    if (!updated) {
      throw new BaseError("view-not-found", `Base view not found: ${viewId}`)
    }
    return updated
  }

  addField(tableId: string, field: CreateBaseFieldInput): BaseFieldInfo {
    const table = this.getTable(tableId)
    const columnName = assertBaseColumnName(field.columnName)
    const quotedTable = quoteIdentifier(table.rawTableName)
    const quotedColumn = quoteIdentifier(columnName)
    this.connection.transaction(() => {
      this.connection.exec(
        `ALTER TABLE ${quotedTable} ADD COLUMN ${quotedColumn} ${sqlTypeForField(field.type)} NULL`
      )
      this.connection.run(
        `INSERT INTO ${BASE_COLUMNS_TABLE}
          (name, type, table_name, table_column_name, property,
           storage_codec, value_kind, is_hidden, is_derived)
         VALUES (?, ?, ?, ?, ?, ?, 'source', 0, 0)`,
        [
          field.name,
          field.type,
          table.rawTableName,
          columnName,
          field.property ? JSON.stringify(field.property) : null,
          field.storageCodec ?? defaultStorageCodec(field.type),
        ]
      )
      setBaseMetadata(this.connection, {})
    })
    const created = this.listFields(tableId).find(
      (candidate) => candidate.tableColumnName === columnName
    )
    if (!created) {
      throw new BaseError(
        "field-not-found",
        `Unable to create Base field: ${columnName}`
      )
    }
    return created
  }

  listRows(tableId: string, limit = 200, offset = 0): BaseRow[] {
    const table = this.getTable(tableId)
    return this.connection.query<BaseRow>(
      `SELECT * FROM ${quoteIdentifier(table.rawTableName)} LIMIT ? OFFSET ?`,
      [Math.max(0, limit), Math.max(0, offset)]
    )
  }

  insertRow(tableId: string, row: BaseRow): BaseRow {
    const table = this.getTable(tableId)
    const allowedColumns = new Set([
      "_id",
      ...this.listFields(tableId)
        .filter(
          (field) =>
            field.tableColumnName === "title" || field.valueKind === "source"
        )
        .map((field) => field.tableColumnName),
    ])
    const record: BaseRow = {
      ...row,
      _id: row._id ?? createBaseId("row"),
    }
    const columns = Object.keys(record)
    for (const column of columns) {
      if (!allowedColumns.has(column)) {
        throw new BaseError(
          "field-not-found",
          `Base field cannot be written: ${column}`
        )
      }
    }
    const placeholders = columns.map(() => "?").join(", ")
    this.connection.run(
      `INSERT INTO ${quoteIdentifier(table.rawTableName)}
        (${columns.map(quoteIdentifier).join(", ")}) VALUES (${placeholders})`,
      columns.map((column) => sqliteParameter(record[column]))
    )
    setBaseMetadata(this.connection, {})
    return this.connection.get<BaseRow>(
      `SELECT * FROM ${quoteIdentifier(table.rawTableName)} WHERE _id = ?`,
      [sqliteParameter(record._id)]
    )!
  }

  updateRow(tableId: string, rowId: string, changes: BaseRow): BaseRow {
    const table = this.getTable(tableId)
    const allowedColumns = new Set(
      this.listFields(tableId)
        .filter(
          (field) =>
            field.tableColumnName === "title" || field.valueKind === "source"
        )
        .map((field) => field.tableColumnName)
    )
    const columns = Object.keys(changes).filter((column) => column !== "_id")
    for (const column of columns) {
      if (!allowedColumns.has(column)) {
        throw new BaseError(
          "field-not-found",
          `Base field not found: ${column}`
        )
      }
    }
    if (columns.length > 0) {
      const assignments = columns
        .map((column) => `${quoteIdentifier(column)} = ?`)
        .join(", ")
      this.connection.run(
        `UPDATE ${quoteIdentifier(table.rawTableName)}
            SET ${assignments}, _last_edited_time = CURRENT_TIMESTAMP
          WHERE _id = ?`,
        [...columns.map((column) => sqliteParameter(changes[column])), rowId]
      )
      setBaseMetadata(this.connection, {})
    }
    const row = this.connection.get<BaseRow>(
      `SELECT * FROM ${quoteIdentifier(table.rawTableName)} WHERE _id = ?`,
      [rowId]
    )
    if (!row) throw new BaseError("row-not-found", `Row not found: ${rowId}`)
    return row
  }

  deleteRow(tableId: string, rowId: string): boolean {
    const table = this.getTable(tableId)
    const result = this.connection.run(
      `DELETE FROM ${quoteIdentifier(table.rawTableName)} WHERE _id = ?`,
      [rowId]
    )
    if (result.changes > 0) setBaseMetadata(this.connection, {})
    return result.changes > 0
  }
}
