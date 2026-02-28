import { v4 as uuidv4 } from "uuid"
import {
  getRawTableNameById,
  getUuid,
  validateSqliteColumnName,
  EIDOS_RESERVED_FIELDS,
} from "@/lib/utils"
import { FieldType } from "../fields/const"
import { allFieldTypesMap } from "../fields"
import { ColumnTableName, TreeTableName } from "../sqlite/const"
import { ColumnTable } from "../meta-table/column"
import type { DataSpaceWithTable } from "../data-space/table"
import type { IField } from "../types/IField"
import type { ViewType } from "../types/IView"

// ===== Input Types =====

export interface CreateTableInput {
  /** Table display name */
  name: string
  /** Field definitions (system fields like _id, title, timestamps are auto-created) */
  fields: CreateFieldInput[]
}

export interface CreateFieldInput {
  /** Field display name */
  name: string
  /** Database column name (required, must be valid SQLite identifier) */
  columnName: string
  /** Field type */
  type: FieldType | `${FieldType}`
  /** Field-type-specific properties (e.g., select options, link config) */
  property?: Record<string, any>
}

export interface UpdateTableInput {
  /** New table display name */
  name?: string
}

export interface UpdateFieldInput {
  /** New display name */
  name?: string
  /** Updated field-type-specific properties */
  property?: Record<string, any>
}

export interface CreateViewInput {
  /** View display name */
  name: string
  /** View type */
  type: ViewType
}

// ===== Output Types =====

export interface TableInfo {
  id: string
  name: string
  fields: FieldInfo[]
  views: ViewInfo[]
}

export interface FieldInfo {
  /** Display name */
  name: string
  /** Database column name */
  columnName: string
  /** Field type */
  type: FieldType | `${FieldType}`
  /** Field-type-specific properties */
  property?: Record<string, any>
}

export interface ViewInfo {
  id: string
  name: string
  type: ViewType
}

export interface TableListItem {
  id: string
  name: string
}

/**
 * Schema management client for table/field/view lifecycle operations.
 *
 * Access via `eidos.currentSpace.schema.*`
 *
 * @example
 * ```typescript
 * // Create a table
 * const table = await eidos.currentSpace.schema.createTable({
 *   name: "Tasks",
 *   fields: [
 *     { name: "Status", columnName: "status", type: "select" },
 *     { name: "Due Date", columnName: "due_date", type: "date" },
 *     { name: "Priority", columnName: "priority", type: "number" },
 *   ]
 * })
 *
 * // Then use Prisma-style CRUD
 * const Tasks = eidos.currentSpace.table(table.id)
 * await Tasks.create({ data: { title: "Design API", status: "In Progress" } })
 * ```
 */
export class SchemaClient {
  constructor(private dataSpace: DataSpaceWithTable) {}

  // ============ TABLE OPERATIONS ============

  /**
   * Create a new table with the given fields.
   * System fields (_id, title, _created_time, etc.) are auto-created.
   *
   * @param input Table name and field definitions
   * @returns Created table info including generated id, fields, and default view
   */
  async createTable(input: CreateTableInput): Promise<TableInfo> {
    // Validate field column names
    const existingColumns = [...EIDOS_RESERVED_FIELDS]
    for (const field of input.fields) {
      const validation = validateSqliteColumnName(
        field.columnName,
        existingColumns
      )
      if (!validation.isValid) {
        throw new Error(
          `Invalid column name "${field.columnName}": ${validation.error}`
        )
      }
      existingColumns.push(field.columnName)
    }

    // Generate table ID and raw table name
    const tableId = uuidv4().split("-").join("")
    const rawTableName = getRawTableNameById(tableId)

    // Filter out title field from user fields (title is a system field)
    const userFields = input.fields.filter(
      (f) =>
        f.columnName.toLowerCase() !== "title" && f.type !== FieldType.Title
    )

    // Build CREATE TABLE SQL
    let createTableSql = `
CREATE TABLE ${rawTableName} (
  _id TEXT PRIMARY KEY NOT NULL,
  title TEXT NULL,
  _created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  _last_edited_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  _created_by TEXT DEFAULT 'unknown',
  _last_edited_by TEXT DEFAULT 'unknown'${userFields.length > 0 ? "," : ""}
`
    userFields.forEach((field, index) => {
      const sqlType = ColumnTable.getColumnTypeByFieldType(
        field.type as FieldType
      )
      const isLast = index === userFields.length - 1
      createTableSql += `  ${field.columnName} ${sqlType} NULL${isLast ? "\n" : ",\n"}`
    })
    createTableSql += `);`

    // Insert field metadata into column meta-table
    createTableSql += `
    INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('_id', 'row-id', '${rawTableName}', '_id');
    INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('title', 'title', '${rawTableName}', 'title');
`
    for (const field of userFields) {
      const defaultProperty =
        allFieldTypesMap[field.type].getDefaultFieldProperty()
      const mergedProperty = field.property
        ? { ...defaultProperty, ...field.property }
        : defaultProperty
      const escapedName = field.name.replace(/'/g, "''")
      createTableSql += `    INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name, property) VALUES ('${escapedName}', '${field.type}', '${rawTableName}', '${field.columnName}', '${JSON.stringify(mergedProperty)}');\n`
    }

    // Execute: create tree node + run SQL + create default view
    await this.dataSpace.createTableViaSchema(
      tableId,
      input.name,
      createTableSql
    )

    // Return full table info
    return await this.getTable(tableId)
  }

  /**
   * Get full table info including fields and views.
   * @param tableId Table ID
   */
  async getTable(tableId: string): Promise<TableInfo> {
    const rawTableName = getRawTableNameById(tableId)

    // Get table node for name
    const tableNode = await this.dataSpace.tree.getNode(tableId)
    if (!tableNode) {
      throw new Error(`Table not found: ${tableId}`)
    }

    // Get fields
    const rawFields = await this.dataSpace.column.list({
      table_name: rawTableName,
    })
    const fields: FieldInfo[] = rawFields
      .filter((f) => f.table_column_name !== "_id") // exclude _id meta-field
      .map((f) => ({
        name: f.name,
        columnName: f.table_column_name,
        type: f.type,
        ...(f.property ? { property: f.property } : {}),
      }))

    // Get views
    const rawViews = await this.dataSpace.view.list(
      { table_id: tableId },
      { orderBy: "position", order: "ASC" }
    )
    const views: ViewInfo[] = rawViews.map((v) => ({
      id: v.id,
      name: v.name,
      type: v.type,
    }))

    return {
      id: tableId,
      name: tableNode.name,
      fields,
      views,
    }
  }

  /**
   * List all tables in the current space.
   */
  async listTables(): Promise<TableListItem[]> {
    const nodes = await this.dataSpace.exec2(
      `SELECT id, name FROM ${TreeTableName} WHERE type = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY position DESC`,
      ["table"]
    )
    return nodes.map((n: any) => ({
      id: n.id,
      name: n.name,
    }))
  }

  /**
   * Update table metadata (e.g., rename).
   * @param tableId Table ID
   * @param input Fields to update
   */
  async updateTable(
    tableId: string,
    input: UpdateTableInput
  ): Promise<TableInfo> {
    if (input.name) {
      await this.dataSpace.tree.updateNodeName(tableId, input.name)
    }
    return await this.getTable(tableId)
  }

  /**
   * Delete a table and all associated data (fields, views, records).
   * @param tableId Table ID
   */
  async deleteTable(tableId: string): Promise<boolean> {
    await this.dataSpace.deleteTable(tableId)
    return true
  }

  // ============ FIELD OPERATIONS ============

  /**
   * Add a field to an existing table.
   * @param tableId Table ID
   * @param input Field definition
   */
  async addField(tableId: string, input: CreateFieldInput): Promise<FieldInfo> {
    const rawTableName = getRawTableNameById(tableId)

    // Validate column name against existing columns
    const existingFields = await this.dataSpace.column.list({
      table_name: rawTableName,
    })
    const existingColumns = existingFields.map((f) => f.table_column_name)
    const validation = validateSqliteColumnName(
      input.columnName,
      existingColumns
    )
    if (!validation.isValid) {
      throw new Error(
        `Invalid column name "${input.columnName}": ${validation.error}`
      )
    }

    const defaultProperty =
      allFieldTypesMap[input.type].getDefaultFieldProperty()
    const mergedProperty = input.property
      ? { ...defaultProperty, ...input.property }
      : defaultProperty

    const fieldData: IField = {
      name: input.name,
      type: input.type,
      table_name: rawTableName,
      table_column_name: input.columnName,
      property: mergedProperty,
    }

    await this.dataSpace.column.add(fieldData)

    return {
      name: input.name,
      columnName: input.columnName,
      type: input.type,
      property: mergedProperty,
    }
  }

  /**
   * Update field metadata (display name, properties).
   * @param tableId Table ID
   * @param columnName Database column name of the field to update
   * @param input Fields to update
   */
  async updateField(
    tableId: string,
    columnName: string,
    input: UpdateFieldInput
  ): Promise<FieldInfo> {
    const rawTableName = getRawTableNameById(tableId)

    const existingField = await this.dataSpace.column.getColumn(
      rawTableName,
      columnName
    )
    if (!existingField) {
      throw new Error(`Field not found: ${columnName} in table ${tableId}`)
    }

    const updateData: Partial<IField> = {
      table_name: rawTableName,
      table_column_name: columnName,
    }

    if (input.name !== undefined) {
      updateData.name = input.name
    }

    if (input.property !== undefined) {
      await this.dataSpace.column.updateProperty({
        tableName: rawTableName,
        tableColumnName: columnName,
        property: input.property,
        type: existingField.type,
      })
    }

    if (input.name !== undefined) {
      // Update the display name in the column meta-table
      await this.dataSpace.exec2(
        `UPDATE ${ColumnTableName} SET name = ? WHERE table_name = ? AND table_column_name = ?`,
        [input.name, rawTableName, columnName]
      )
    }

    // Return updated field info
    const updatedField = await this.dataSpace.column.getColumn(
      rawTableName,
      columnName
    )
    return {
      name: updatedField!.name,
      columnName: updatedField!.table_column_name,
      type: updatedField!.type,
      property: updatedField!.property,
    }
  }

  /**
   * Delete a field from a table.
   * @param tableId Table ID
   * @param columnName Database column name of the field to delete
   */
  async deleteField(tableId: string, columnName: string): Promise<boolean> {
    const rawTableName = getRawTableNameById(tableId)
    await this.dataSpace.column.deleteField(rawTableName, columnName)
    return true
  }

  /**
   * List all fields in a table.
   * @param tableId Table ID
   */
  async listFields(tableId: string): Promise<FieldInfo[]> {
    const rawTableName = getRawTableNameById(tableId)
    const rawFields = await this.dataSpace.column.list({
      table_name: rawTableName,
    })
    return rawFields
      .filter((f) => f.table_column_name !== "_id")
      .map((f) => ({
        name: f.name,
        columnName: f.table_column_name,
        type: f.type,
        ...(f.property ? { property: f.property } : {}),
      }))
  }

  // ============ VIEW OPERATIONS ============

  /**
   * Create a new view for a table.
   * @param tableId Table ID
   * @param input View definition
   */
  async createView(tableId: string, input: CreateViewInput): Promise<ViewInfo> {
    const rawTableName = getRawTableNameById(tableId)
    const viewId = getUuid()

    const view = await this.dataSpace.view.add({
      id: viewId,
      name: input.name,
      type: input.type,
      table_id: tableId,
      query: `SELECT * FROM ${rawTableName}`,
    })

    return {
      id: view.id,
      name: view.name,
      type: view.type,
    }
  }

  /**
   * List all views for a table.
   * @param tableId Table ID
   */
  async listViews(tableId: string): Promise<ViewInfo[]> {
    const rawViews = await this.dataSpace.view.list(
      { table_id: tableId },
      { orderBy: "position", order: "ASC" }
    )
    return rawViews.map((v) => ({
      id: v.id,
      name: v.name,
      type: v.type,
    }))
  }

  /**
   * Delete a view.
   * @param tableId Table ID (for validation)
   * @param viewId View ID
   */
  async deleteView(tableId: string, viewId: string): Promise<boolean> {
    await this.dataSpace.view.del(viewId)
    return true
  }
}
