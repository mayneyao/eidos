import type { BaseConnection, BaseSqlParams } from "./connection"
import {
  BASE_COLUMNS_TABLE,
  BASE_META_TABLE,
  BASE_REFERENCES_TABLE,
  BASE_TABLES_TABLE,
  BASE_VIEWS_TABLE,
} from "./constants"
import { BaseError } from "./errors"
import { decodeBaseFilePaths, encodeBaseFilePaths } from "./file-values"
import {
  assertBaseColumnName,
  assertBaseTableId,
  createBaseId,
  quoteIdentifier,
  rawTableNameForId,
} from "./identifiers"
import { setBaseMetadata } from "./schema"
import {
  compileBaseRowQuery,
  normalizeBaseFilter,
  normalizeBaseSorts,
  removeBaseFilterField,
} from "./query"
import type {
  BaseFieldInfo,
  BaseFieldType,
  BaseMetadata,
  BaseRow,
  BaseRowPage,
  BaseRowQuery,
  BaseRowRange,
  BaseStorageCodec,
  BaseTableInfo,
  BaseViewInfo,
  CreateBaseFieldInput,
  CreateBaseReferenceInput,
  CreateBaseTableInput,
  CreateBaseViewInput,
  ImportBaseFieldInput,
  UpdateBaseFieldInput,
  UpdateBaseTableInput,
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

const SYSTEM_FIELD_COLUMNS = new Set(
  SYSTEM_FIELDS.map((field) => field.columnName)
)

function assertKnownFieldColumnName(columnName: string): string {
  return SYSTEM_FIELD_COLUMNS.has(columnName)
    ? columnName
    : assertBaseColumnName(columnName)
}

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

function sqlTypeForField(type: BaseFieldType): string {
  if (type === "checkbox") return "BOOLEAN"
  if (type === "number") return "REAL"
  if (type === "rating") return "INT"
  return "TEXT"
}

function defaultStorageCodec(type: BaseFieldType): BaseStorageCodec {
  if (type === "multi-select") return "csv_ids"
  if (type === "file") return "json_array"
  if (type === "link") return "relation"
  if (type === "formula" || type === "lookup") return "materialized_text"
  return "scalar"
}

function sqliteParameter(value: BaseRow[string]): BaseSqlParams[number] {
  return typeof value === "boolean" ? (value ? 1 : 0) : value
}

function writableFieldValue(
  field: BaseFieldInfo | undefined,
  value: BaseRow[string]
): BaseRow[string] {
  if (field?.type !== "file" || value === null) return value
  return encodeBaseFilePaths(decodeBaseFilePaths(value))
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

  updateTable(tableId: string, changes: UpdateBaseTableInput): BaseTableInfo {
    const table = this.getTable(tableId)
    const name = changes.name === undefined ? table.name : changes.name.trim()
    if (!name) {
      throw new BaseError("invalid-identifier", "Base table name is required")
    }
    this.connection.transaction(() => {
      this.connection.run(
        `UPDATE ${BASE_TABLES_TABLE}
            SET name = ?, icon = ?, description = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [
          name,
          changes.icon === undefined ? table.icon : changes.icon,
          changes.description === undefined
            ? table.description
            : changes.description,
          tableId,
        ]
      )
      setBaseMetadata(this.connection, {})
    })
    return this.getTable(tableId)
  }

  deleteTable(tableId: string): boolean {
    const table = this.getTable(tableId)
    return this.connection.transaction(() => {
      this.connection.run(
        `DELETE FROM ${BASE_REFERENCES_TABLE}
          WHERE self_table_name = ? OR ref_table_name = ? OR link_table_name = ?`,
        [table.rawTableName, table.rawTableName, table.rawTableName]
      )
      this.connection.run(
        `DELETE FROM ${BASE_VIEWS_TABLE} WHERE table_id = ?`,
        [tableId]
      )
      this.connection.run(
        `DELETE FROM ${BASE_COLUMNS_TABLE} WHERE table_name = ?`,
        [table.rawTableName]
      )
      this.connection.run(`DELETE FROM ${BASE_TABLES_TABLE} WHERE id = ?`, [
        tableId,
      ])
      this.connection.exec(`DROP TABLE ${quoteIdentifier(table.rawTableName)}`)

      const currentDefault = this.connection.get<{ value: string }>(
        `SELECT value FROM ${BASE_META_TABLE} WHERE key = 'default_table_id'`
      )
      if (currentDefault?.value === tableId) {
        const nextDefault = this.connection.get<{ id: string }>(
          `SELECT id FROM ${BASE_TABLES_TABLE}
            ORDER BY position, created_at, id LIMIT 1`
        )
        if (nextDefault) {
          this.connection.run(
            `UPDATE ${BASE_META_TABLE} SET value = ? WHERE key = 'default_table_id'`,
            [nextDefault.id]
          )
        } else {
          this.connection.run(
            `DELETE FROM ${BASE_META_TABLE} WHERE key = 'default_table_id'`
          )
        }
      }
      setBaseMetadata(this.connection, {})
      return true
    })
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
      .map((view) => {
        const properties = parseJson(view.properties) as Record<
          string,
          unknown
        > | null
        return {
          id: view.id,
          name: view.name,
          type: view.type,
          tableId: view.table_id,
          query: view.query,
          properties,
          filter: normalizeBaseFilter(parseJson(view.filter)),
          sorts: normalizeBaseSorts(properties?.sorts),
          orderMap: parseJson(view.order_map) as Record<string, number> | null,
          hiddenFields:
            (parseJson(view.hidden_fields) as string[] | null) ?? [],
          position: view.position,
          createdAt: view.created_at,
          updatedAt: view.updated_at,
        }
      })
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
    const name =
      changes.name === undefined ? existing.name : changes.name.trim()
    if (!name) {
      throw new BaseError("invalid-identifier", "Base view name is required")
    }
    if (
      changes.position !== undefined &&
      changes.position !== null &&
      (!Number.isSafeInteger(changes.position) || changes.position < 0)
    ) {
      throw new BaseError(
        "invalid-range",
        "Base view position must be a non-negative integer"
      )
    }
    const currentProperties = parseJson(existing.properties) as Record<
      string,
      unknown
    > | null
    const requestedProperties =
      changes.properties === undefined ? currentProperties : changes.properties
    const properties =
      changes.sorts === undefined
        ? requestedProperties
        : {
            ...(requestedProperties ?? {}),
            sorts: normalizeBaseSorts(changes.sorts),
          }
    this.connection.run(
      `UPDATE ${BASE_VIEWS_TABLE}
          SET name = ?, position = ?, properties = ?, filter = ?,
              order_map = ?, hidden_fields = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [
        name,
        changes.position === undefined ? existing.position : changes.position,
        JSON.stringify(properties),
        JSON.stringify(
          changes.filter === undefined
            ? normalizeBaseFilter(parseJson(existing.filter))
            : normalizeBaseFilter(changes.filter)
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

  createView(tableId: string, input: CreateBaseViewInput): BaseViewInfo {
    const table = this.getTable(tableId)
    const name = input.name.trim()
    const type = input.type.trim()
    if (!name || !type) {
      throw new BaseError(
        "invalid-identifier",
        "Base view name and type are required"
      )
    }
    if (
      input.position !== undefined &&
      input.position !== null &&
      (!Number.isSafeInteger(input.position) || input.position < 0)
    ) {
      throw new BaseError(
        "invalid-range",
        "Base view position must be a non-negative integer"
      )
    }
    const viewId = input.id ?? createBaseId("view")
    const position =
      input.position ??
      this.connection.get<{ position: number }>(
        `SELECT COALESCE(MAX(position), 0) + 1 AS position
           FROM ${BASE_VIEWS_TABLE} WHERE table_id = ?`,
        [tableId]
      )?.position ??
      1
    this.connection.run(
      `INSERT INTO ${BASE_VIEWS_TABLE}
        (id, name, type, table_id, query, properties, filter,
         order_map, hidden_fields, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        viewId,
        name,
        type,
        tableId,
        input.query ?? `SELECT * FROM ${quoteIdentifier(table.rawTableName)}`,
        input.properties === undefined && input.sorts === undefined
          ? null
          : JSON.stringify({
              ...(input.properties ?? {}),
              ...(input.sorts === undefined
                ? {}
                : { sorts: normalizeBaseSorts(input.sorts) }),
            }),
        input.filter === undefined
          ? null
          : JSON.stringify(normalizeBaseFilter(input.filter)),
        input.orderMap === undefined ? null : JSON.stringify(input.orderMap),
        JSON.stringify(input.hiddenFields ?? []),
        position,
      ]
    )
    setBaseMetadata(this.connection, {})
    const created = this.listViews(tableId).find((view) => view.id === viewId)
    if (!created) {
      throw new BaseError(
        "view-not-found",
        `Unable to create Base view: ${viewId}`
      )
    }
    return created
  }

  duplicateView(viewId: string, name?: string): BaseViewInfo {
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
    const view = this.listViews(existing.table_id).find(
      (candidate) => candidate.id === viewId
    )
    if (!view) {
      throw new BaseError("view-not-found", `Base view not found: ${viewId}`)
    }
    return this.createView(view.tableId, {
      name: name?.trim() || `${view.name} copy`,
      type: view.type,
      query: view.query,
      properties: view.properties,
      filter: view.filter,
      sorts: view.sorts,
      orderMap: view.orderMap,
      hiddenFields: view.hiddenFields,
    })
  }

  deleteView(viewId: string): boolean {
    const existing = this.connection.get<{ table_id: string }>(
      `SELECT table_id FROM ${BASE_VIEWS_TABLE} WHERE id = ?`,
      [viewId]
    )
    if (!existing) {
      throw new BaseError("view-not-found", `Base view not found: ${viewId}`)
    }
    const count =
      this.connection.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${BASE_VIEWS_TABLE} WHERE table_id = ?`,
        [existing.table_id]
      )?.count ?? 0
    if (count <= 1) {
      throw new BaseError(
        "protected-view",
        "A Base table must keep at least one view"
      )
    }
    return this.connection.transaction(() => {
      const result = this.connection.run(
        `DELETE FROM ${BASE_VIEWS_TABLE} WHERE id = ?`,
        [viewId]
      )
      if (result.changes > 0) setBaseMetadata(this.connection, {})
      return result.changes > 0
    })
  }

  reorderViews(tableId: string, viewIds: string[]): BaseViewInfo[] {
    const current = this.listViews(tableId)
    const expected = new Set(current.map((view) => view.id))
    if (
      viewIds.length !== current.length ||
      new Set(viewIds).size !== viewIds.length ||
      viewIds.some((viewId) => !expected.has(viewId))
    ) {
      throw new BaseError(
        "invalid-range",
        "Base view order must contain every table view exactly once"
      )
    }
    this.connection.transaction(() => {
      viewIds.forEach((viewId, index) => {
        this.connection.run(
          `UPDATE ${BASE_VIEWS_TABLE}
              SET position = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND table_id = ?`,
          [index + 1, viewId, tableId]
        )
      })
      setBaseMetadata(this.connection, {})
    })
    return this.listViews(tableId)
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

  importField(tableId: string, field: ImportBaseFieldInput): BaseFieldInfo {
    const table = this.getTable(tableId)
    const existing = this.listFields(tableId).find(
      (candidate) => candidate.tableColumnName === field.columnName
    )
    const columnName = existing
      ? existing.tableColumnName
      : assertBaseColumnName(field.columnName)
    this.connection.transaction(() => {
      if (!existing) {
        this.connection.exec(
          `ALTER TABLE ${quoteIdentifier(table.rawTableName)}
             ADD COLUMN ${quoteIdentifier(columnName)} ${sqlTypeForField(field.type)} NULL`
        )
        this.connection.run(
          `INSERT INTO ${BASE_COLUMNS_TABLE}
            (name, type, table_name, table_column_name, property,
             storage_codec, value_kind, is_hidden, is_derived,
             source_table_column_name, depends_on)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            field.name,
            field.type,
            table.rawTableName,
            columnName,
            field.property === undefined || field.property === null
              ? null
              : JSON.stringify(field.property),
            field.storageCodec ?? defaultStorageCodec(field.type),
            field.valueKind ?? "source",
            field.isHidden ? 1 : 0,
            field.isDerived ? 1 : 0,
            field.sourceTableColumnName ?? null,
            field.dependsOn === undefined
              ? null
              : JSON.stringify(field.dependsOn),
          ]
        )
      } else {
        this.connection.run(
          `UPDATE ${BASE_COLUMNS_TABLE}
              SET name = ?, type = ?, property = ?, storage_codec = ?,
                  value_kind = ?, is_hidden = ?, is_derived = ?,
                  source_table_column_name = ?, depends_on = ?,
                  updated_at = CURRENT_TIMESTAMP
            WHERE table_name = ? AND table_column_name = ?`,
          [
            field.name,
            field.type,
            field.property === undefined || field.property === null
              ? null
              : JSON.stringify(field.property),
            field.storageCodec ?? existing.storageCodec,
            field.valueKind ?? existing.valueKind,
            field.isHidden === undefined
              ? existing.isHidden
                ? 1
                : 0
              : field.isHidden
                ? 1
                : 0,
            field.isDerived === undefined
              ? existing.isDerived
                ? 1
                : 0
              : field.isDerived
                ? 1
                : 0,
            field.sourceTableColumnName === undefined
              ? existing.sourceTableColumnName
              : field.sourceTableColumnName,
            field.dependsOn === undefined
              ? existing.dependsOn === null
                ? null
                : JSON.stringify(existing.dependsOn)
              : JSON.stringify(field.dependsOn),
            table.rawTableName,
            columnName,
          ]
        )
      }
      setBaseMetadata(this.connection, {})
    })
    return this.getField(tableId, columnName)
  }

  createReference(input: CreateBaseReferenceInput): void {
    const selfTable = this.getTable(input.selfTableId)
    const refTable = this.getTable(input.refTableId)
    const linkTable = this.getTable(input.linkTableId)
    const selfField = this.getField(input.selfTableId, input.selfColumnName)
    const refField = this.getField(input.refTableId, input.refColumnName)
    const linkField = this.getField(input.linkTableId, input.linkColumnName)
    this.connection.run(
      `INSERT INTO ${BASE_REFERENCES_TABLE}
        (self_table_name, self_table_column_name,
         ref_table_name, ref_table_column_name,
         link_table_name, link_table_column_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        selfTable.rawTableName,
        selfField.tableColumnName,
        refTable.rawTableName,
        refField.tableColumnName,
        linkTable.rawTableName,
        linkField.tableColumnName,
      ]
    )
    setBaseMetadata(this.connection, {})
  }

  updateField(
    tableId: string,
    columnName: string,
    changes: UpdateBaseFieldInput
  ): BaseFieldInfo {
    const table = this.getTable(tableId)
    const field = this.getField(tableId, columnName)
    const name = changes.name === undefined ? field.name : changes.name.trim()
    if (!name) {
      throw new BaseError("invalid-identifier", "Base field name is required")
    }
    this.connection.transaction(() => {
      this.connection.run(
        `UPDATE ${BASE_COLUMNS_TABLE}
            SET name = ?, property = ?, updated_at = CURRENT_TIMESTAMP
          WHERE table_name = ? AND table_column_name = ?`,
        [
          name,
          changes.property === undefined
            ? field.property === null
              ? null
              : JSON.stringify(field.property)
            : changes.property === null
              ? null
              : JSON.stringify(changes.property),
          table.rawTableName,
          field.tableColumnName,
        ]
      )
      setBaseMetadata(this.connection, {})
    })
    return this.getField(tableId, field.tableColumnName)
  }

  deleteField(tableId: string, columnName: string): boolean {
    const table = this.getTable(tableId)
    const field = this.getField(tableId, columnName)
    if (field.valueKind === "system" || field.tableColumnName === "title") {
      throw new BaseError(
        "protected-field",
        `Base system field cannot be deleted: ${field.name}`
      )
    }
    return this.connection.transaction(() => {
      this.connection.run(
        `DELETE FROM ${BASE_REFERENCES_TABLE}
          WHERE (self_table_name = ? AND self_table_column_name = ?)
             OR (ref_table_name = ? AND ref_table_column_name = ?)
             OR (link_table_name = ? AND link_table_column_name = ?)`,
        [
          table.rawTableName,
          field.tableColumnName,
          table.rawTableName,
          field.tableColumnName,
          table.rawTableName,
          field.tableColumnName,
        ]
      )
      this.connection.exec(
        `ALTER TABLE ${quoteIdentifier(table.rawTableName)}
          DROP COLUMN ${quoteIdentifier(field.tableColumnName)}`
      )
      this.connection.run(
        `DELETE FROM ${BASE_COLUMNS_TABLE}
          WHERE table_name = ? AND table_column_name = ?`,
        [table.rawTableName, field.tableColumnName]
      )
      for (const view of this.listViews(tableId)) {
        const orderMap = Object.fromEntries(
          Object.entries(view.orderMap ?? {})
            .filter(([columnName]) => columnName !== field.tableColumnName)
            .sort((left, right) => left[1] - right[1])
            .map(([columnName], index) => [columnName, index])
        )
        const properties = { ...(view.properties ?? {}) }
        properties.sorts = view.sorts.filter(
          (sort) => sort.field !== field.tableColumnName
        )
        const fieldWidthMap = properties.fieldWidthMap
        if (
          typeof fieldWidthMap === "object" &&
          fieldWidthMap !== null &&
          !Array.isArray(fieldWidthMap)
        ) {
          const nextWidths: Record<string, unknown> = { ...fieldWidthMap }
          delete nextWidths[field.tableColumnName]
          properties.fieldWidthMap = nextWidths
        }
        this.connection.run(
          `UPDATE ${BASE_VIEWS_TABLE}
              SET properties = ?, filter = ?, order_map = ?, hidden_fields = ?,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          [
            JSON.stringify(properties),
            JSON.stringify(
              removeBaseFilterField(view.filter, field.tableColumnName)
            ),
            JSON.stringify(orderMap),
            JSON.stringify(
              view.hiddenFields.filter(
                (candidate) => candidate !== field.tableColumnName
              )
            ),
            view.id,
          ]
        )
      }
      setBaseMetadata(this.connection, {})
      return true
    })
  }

  private getField(tableId: string, columnName: string): BaseFieldInfo {
    const safeColumnName = assertKnownFieldColumnName(columnName)
    const field = this.listFields(tableId).find(
      (candidate) => candidate.tableColumnName === safeColumnName
    )
    if (!field) {
      throw new BaseError(
        "field-not-found",
        `Base field not found: ${safeColumnName}`
      )
    }
    return field
  }

  listRows(
    tableId: string,
    limit = 200,
    offset = 0,
    query: BaseRowQuery = {}
  ): BaseRow[] {
    const table = this.getTable(tableId)
    const compiled = compileBaseRowQuery(this.listFields(tableId), query)
    return this.connection.query<BaseRow>(
      `SELECT * FROM ${quoteIdentifier(table.rawTableName)}
        ${compiled.whereSql} ${compiled.orderSql} LIMIT ? OFFSET ?`,
      [...compiled.params, Math.max(0, limit), Math.max(0, offset)]
    )
  }

  countRows(tableId: string, query: BaseRowQuery = {}): number {
    const table = this.getTable(tableId)
    const compiled = compileBaseRowQuery(this.listFields(tableId), query)
    return (
      this.connection.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table.rawTableName)}
          ${compiled.whereSql}`,
        compiled.params
      )?.count ?? 0
    )
  }

  getRowPage(
    tableId: string,
    offset = 0,
    limit = 100,
    query: BaseRowQuery = {}
  ): BaseRowPage {
    const safeOffset = Math.max(0, Math.trunc(offset))
    const safeLimit = Math.min(500, Math.max(1, Math.trunc(limit)))
    return {
      tableId,
      offset: safeOffset,
      limit: safeLimit,
      total: this.countRows(tableId, query),
      rows: this.listRows(tableId, safeLimit, safeOffset, query),
    }
  }

  insertRow(tableId: string, row: BaseRow): BaseRow {
    const table = this.getTable(tableId)
    const fields = this.listFields(tableId)
    const fieldsByColumn = new Map(
      fields.map((field) => [field.tableColumnName, field])
    )
    const allowedColumns = new Set([
      "_id",
      ...fields
        .filter(
          (field) =>
            field.tableColumnName === "title" || field.valueKind === "source"
        )
        .map((field) => field.tableColumnName),
    ])
    const record: BaseRow = {
      ...Object.fromEntries(
        Object.entries(row).map(([column, value]) => [
          column,
          writableFieldValue(fieldsByColumn.get(column), value),
        ])
      ),
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

  insertImportedRow(tableId: string, row: BaseRow): BaseRow {
    const record = this.insertImportedRows(tableId, [row])[0]
    const table = this.getTable(tableId)
    return this.connection.get<BaseRow>(
      `SELECT * FROM ${quoteIdentifier(table.rawTableName)} WHERE _id = ?`,
      [sqliteParameter(record._id)]
    )!
  }

  insertImportedRows(tableId: string, rows: BaseRow[]): BaseRow[] {
    if (rows.length === 0) return []
    const table = this.getTable(tableId)
    const writableColumns = new Set(
      this.connection
        .query<{ name: string; hidden: number }>(
          `PRAGMA table_xinfo(${quoteIdentifier(table.rawTableName)})`
        )
        .filter((column) => column.hidden === 0)
        .map((column) => column.name)
    )
    const records: BaseRow[] = rows.map((row) => ({
      ...row,
      _id: row._id ?? createBaseId("row"),
    }))
    this.connection.transaction(() => {
      const batches = new Map<
        string,
        { columns: string[]; parameterSets: BaseSqlParams[] }
      >()
      for (const record of records) {
        const columns = Object.keys(record)
        for (const column of columns) {
          if (!writableColumns.has(column)) {
            throw new BaseError(
              "field-not-found",
              `Base field cannot be imported: ${column}`
            )
          }
        }
        const signature = columns.join("\u0000")
        const batch = batches.get(signature) ?? {
          columns,
          parameterSets: [],
        }
        batch.parameterSets.push(
          columns.map((column) => sqliteParameter(record[column]))
        )
        batches.set(signature, batch)
      }
      for (const batch of batches.values()) {
        const sql = `INSERT INTO ${quoteIdentifier(table.rawTableName)}
            (${batch.columns.map(quoteIdentifier).join(", ")})
           VALUES (${batch.columns.map(() => "?").join(", ")})`
        if (this.connection.runMany) {
          this.connection.runMany(sql, batch.parameterSets)
        } else {
          for (const params of batch.parameterSets) {
            this.connection.run(sql, params)
          }
        }
      }
    })
    setBaseMetadata(this.connection, {})
    return records
  }

  updateRow(tableId: string, rowId: string, changes: BaseRow): BaseRow {
    const table = this.getTable(tableId)
    const fields = this.listFields(tableId)
    const fieldsByColumn = new Map(
      fields.map((field) => [field.tableColumnName, field])
    )
    const allowedColumns = new Set(
      fields
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
        [
          ...columns.map((column) =>
            sqliteParameter(
              writableFieldValue(fieldsByColumn.get(column), changes[column])
            )
          ),
          rowId,
        ]
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
    return this.deleteRows(tableId, [rowId]).length === 1
  }

  deleteRows(tableId: string, rowIds: string[]): string[] {
    const table = this.getTable(tableId)
    const uniqueIds = [...new Set(rowIds)]
    if (uniqueIds.length === 0) return []
    return this.connection.transaction(() =>
      this.deleteRowsInTransaction(table.rawTableName, uniqueIds)
    )
  }

  deleteRowRanges(
    tableId: string,
    ranges: BaseRowRange[],
    query: BaseRowQuery = {}
  ): number {
    const table = this.getTable(tableId)
    const compiled = compileBaseRowQuery(this.listFields(tableId), query)
    const normalized = this.normalizeRowRanges(ranges)
    if (normalized.length === 0) return 0
    return this.connection.transaction(() => {
      let deletedCount = 0
      for (const { startIndex, endIndex } of normalized.reverse()) {
        const result = this.connection.run(
          `DELETE FROM ${quoteIdentifier(table.rawTableName)}
            WHERE rowid IN (
              SELECT rowid FROM ${quoteIdentifier(table.rawTableName)}
              ${compiled.whereSql} ${compiled.orderSql} LIMIT ? OFFSET ?
            )`,
          [...compiled.params, endIndex - startIndex, startIndex]
        )
        deletedCount += result.changes
      }
      if (deletedCount > 0) setBaseMetadata(this.connection, {})
      return deletedCount
    })
  }

  private normalizeRowRanges(ranges: BaseRowRange[]): BaseRowRange[] {
    const sorted = ranges
      .map(({ startIndex, endIndex }) => {
        if (
          !Number.isSafeInteger(startIndex) ||
          !Number.isSafeInteger(endIndex) ||
          startIndex < 0 ||
          endIndex <= startIndex
        ) {
          throw new BaseError(
            "invalid-range",
            `Invalid Base row range: ${startIndex}..${endIndex}`
          )
        }
        return { startIndex, endIndex }
      })
      .sort((left, right) => left.startIndex - right.startIndex)
    const merged: BaseRowRange[] = []
    for (const range of sorted) {
      const previous = merged.at(-1)
      if (!previous || range.startIndex > previous.endIndex) {
        merged.push({ ...range })
      } else {
        previous.endIndex = Math.max(previous.endIndex, range.endIndex)
      }
    }
    return merged
  }

  private deleteRowsInTransaction(
    rawTableName: string,
    rowIds: string[]
  ): string[] {
    const deleted: string[] = []
    for (const rowId of new Set(rowIds)) {
      const result = this.connection.run(
        `DELETE FROM ${quoteIdentifier(rawTableName)} WHERE _id = ?`,
        [rowId]
      )
      if (result.changes > 0) deleted.push(rowId)
    }
    if (deleted.length > 0) setBaseMetadata(this.connection, {})
    return deleted
  }
}
