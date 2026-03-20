import {
  extractIdFromShortId,
  getRawTableNameById,
  getTableIdByRawTableName,
  shortenId,
} from "@/lib/utils"

import { FieldType } from "../fields/const"
import { RowsManager } from "../sdk/rows"
import { SchemaClient } from "../sdk/schema"
import { TableManager } from "../sdk/table"
import { TableClient } from "../sdk/table-client"
import type { IField } from "../types/IField"
import { TreeNodeType, type ITreeNode } from "../types/ITreeNode"
import { DataSpaceWithNode } from "./node"
import { TreeTableName } from "../sqlite/const"

// Extension class to add table-related methods
export class DataSpaceWithTable extends DataSpaceWithNode {
  /**
   * Schema management client for table/field/view lifecycle operations.
   *
   * @example
   * ```typescript
   * const table = await eidos.currentSpace.schema.createTable({
   *   name: "Tasks",
   *   fields: [
   *     { name: "Status", columnName: "status", type: "select" },
   *     { name: "Due Date", columnName: "due_date", type: "date" },
   *   ]
   * })
   * ```
   */
  get schema() {
    return new SchemaClient(this)
  }
  /**
   * @deprecated Use table() instead. This is the legacy API that returns TableManager.
   * Kept for internal use and backward compatibility.
   */
  public _table(id: string) {
    return new TableManager(id, this)
  }

  /**
   * Prisma-style Table SDK client for CRUD operations
   * Operates directly on database column names for simplified usage
   *
   * @example
   * ```typescript
   * const Users = eidos.currentSpace.table("users")
   * await Users.create({ data: { cl_name: "张三" } })
   * await Users.findMany({ where: { cl_age: { gte: 18 } } })
   * ```
   */
  public table(id: string) {
    return new TableClient(getRawTableNameById(id), this)
  }

  // table full text search
  public async rebuildFTS(tableId: string) {
    this.blockUIMsg("Rebuilding FTS table, please wait.")
    const tableName = getRawTableNameById(tableId)
    await this.tableFullTextSearch.rebuildFTS(tableName)
    this.blockUIMsg(null)
  }

  public semanticSearch = async (params: {
    tableName: string
    query: string
    viewId?: string
    fieldId?: string
    page: number
    pageSize: number
  }) => {
    return this.tableSemanticSearch.search(params)
  }

  public async getLookupContext(tableName: string, columnName: string) {
    const tableId = getTableIdByRawTableName(tableName)
    const tableManager = this._table(tableId)
    return tableManager.fields.lookup.getLookupContext(tableName, columnName)
  }

  public deleteSelectOption = async (
    field: IField,
    option: string
  ): Promise<void> => {
    const tableId = getTableIdByRawTableName(field.table_name)
    const tableManager = this._table(tableId)
    if (field.type === FieldType.Select) {
      return await tableManager.fields.select.deleteSelectOption(field, option)
    } else if (field.type === FieldType.MultiSelect) {
      return await tableManager.fields.multiSelect.deleteSelectOption(
        field,
        option
      )
    }
  }

  public updateSelectOptionName = async (
    field: IField,
    update: {
      from: string
      to: string
    }
  ) => {
    if (update.from == update.to) {
      return
    }
    const tableId = getTableIdByRawTableName(field.table_name)
    const tableManager = this._table(tableId)
    if (field.type === FieldType.Select) {
      return await tableManager.fields.select.updateSelectOptionName(
        field,
        update
      )
    } else if (field.type === FieldType.MultiSelect) {
      return await tableManager.fields.multiSelect.updateSelectOptionName(
        field,
        update
      )
    }
  }

  // embedding methods
  public updateEmbedding = async (
    tableId: string,
    fieldId: string,
    data: { recordId: string; value: string }[]
  ) => {
    const tm = new TableManager(tableId, this)
    await tm.fields.text.updateEmbedding(fieldId, data)
  }

  public queryEmbedding = async (
    tableId: string,
    fieldId: string,
    query: string,
    limit = 10
  ) => {
    const tm = new TableManager(tableId, this)
    return await tm.fields.text.queryEmbedding(fieldId, query, limit)
  }

  public getEmbeddingStats = async (tableId: string, fieldId: string) => {
    const tm = new TableManager(tableId, this)
    return await tm.fields.text.getEmbeddingStats(fieldId)
  }

  public resetEmbedding = async (tableId: string, fieldId: string) => {
    const tm = new TableManager(tableId, this)
    return await tm.fields.text.resetEmbedding(fieldId)
  }

  public updateLookupColumn(tableName: string, columnName: string) {
    const tableId = getTableIdByRawTableName(tableName)
    const tableManager = this._table(tableId)
    return tableManager.fields.lookup.updateColumn({
      tableName,
      tableColumnName: columnName,
    })
  }

  // index methods
  public createTableIndex(tableId: string, column: string) {
    this._table(tableId).index.createIndex(
      column,
      () => {
        this.blockUIMsg(
          "You are operating on a large table; auto indexing, please wait."
        )
      },
      () => {
        this.blockUIMsg(null)
      }
    )
    return
  }

  // row operations
  public async setRow(tableId: string, rowId: string, data: any) {
    return await this._table(tableId).rows.update(rowId, data, {
      useFieldId: true,
    })
  }

  public async setCell(data: {
    tableId: string
    rowId: string
    fieldId: string
    value: any
  }) {
    const tableManager = this._table(data.tableId)
    const row = await tableManager.rows.get(data.rowId, { raw: true })
    const oldValue = row?.[data.fieldId]
    if (oldValue !== data.value) {
      await this._table(data.tableId).rows.update(
        data.rowId,
        {
          [data.fieldId]: data.value,
        },
        { useFieldId: true }
      )
      return
    }
  }

  public async getRow(tableId: string, rowId: string) {
    const tableManager = this._table(tableId)
    const row = await tableManager.rows.query(
      {
        _id: rowId,
      },
      {
        limit: 1,
        raw: true,
      }
    )
    if (row.length === 0) {
      return null
    }
    return row[0]
  }

  /**
   * Starting from v0.5.0, we switched to using uuidv7 as the _id, and the logic of deleteRowsByRange changed from sorting by rowid to sorting by _id.
   * This function is suitable for old versions of tables where _id of row is uuidv4, and data cannot be deleted by selection, but by a list of _id values.
   * There are some limitations, such as the maximum number of records that can be deleted at once is limited by the sqlite bind parameter.
   * @param rowIds
   * @param tableId
   */
  public async deleteRowsByIds(ids: string[], tableName: string) {
    const tableId = getTableIdByRawTableName(tableName)
    const tableManager = this._table(tableId)
    await tableManager.rows.batchDelete(ids)
    // Also delete associated sub-documents
    await this.deleteSubDocsForRows(ids, tableId)
    this.undoRedoManager.event()
  }

  /**
   * Delete sub-documents associated with table rows.
   * When a row is expanded, a sub-document with id = shortenId(row._id) and parent_id = tableId is created.
   * This method deletes those sub-documents when the rows are deleted.
   *
   * Uses batch query to find sub-docs, then deletes them serially to maintain consistency.
   */
  private async deleteSubDocsForRows(
    rowIds: string[],
    tableId: string
  ): Promise<void> {
    if (rowIds.length === 0) return

    // Convert rowIds to subDocIds (shortened format)
    const subDocIds = rowIds.map((id) => shortenId(id))

    // Build placeholders for IN clause
    const placeholders = subDocIds.map(() => "?").join(",")

    // Batch query: Get all sub-docs that belong to this table
    const subDocs = (await this.exec2(
      `SELECT id, name, type, parent_id, is_deleted FROM ${TreeTableName} WHERE id IN (${placeholders}) AND parent_id = ?`,
      [...subDocIds, tableId]
    )) as ITreeNode[]

    if (subDocs.length === 0) return

    // Serial deletion: Delete sub-docs one by one to maintain consistency
    for (const subDoc of subDocs) {
      await this.tree.permanentlyDeleteNodeByType(subDoc)
    }
  }

  public async deleteRowsByRange(
    range: { startIndex: number; endIndex: number }[],
    tableName: string,
    query: string
  ) {
    const tableId = getTableIdByRawTableName(tableName)
    // query is a sql string like "select * from tb_xxxxx Order by _id"
    // range is a array of {startIndex: number, endIndex: number}
    // we need to delete rows from startIndex to endIndex
    if ("order by" !== query.toLowerCase().match(/order by/g)?.[0]) {
      // when query has no order by, we need to add order by to make sure delete from start to end
      query += " ORDER BY _id"
    }
    // First, get the IDs of rows to be deleted for sub-doc cleanup
    const rowIdsToDelete: string[] = []
    for (const item of range) {
      const limit = item.endIndex - item.startIndex
      const offset = item.startIndex
      const idQuery = `SELECT _id FROM (${query}) LIMIT ${limit} OFFSET ${offset}`
      const rows = await this.exec2(idQuery)
      rowIdsToDelete.push(...rows.map((r: any) => r._id))
    }

    const sql = `DELETE FROM ${tableName} WHERE _id in (SELECT _id FROM (${query}) LIMIT ? OFFSET ?)`
    await this.db.transaction(async (db) => {
      // reverse range, delete from end to start to avoid index change
      for (const item of range.reverse()) {
        const bind = [item.endIndex - item.startIndex, item.startIndex]
        await this.syncExec2(sql, bind, db)
      }
    })
    // Also delete associated sub-documents
    await this.deleteSubDocsForRows(rowIdsToDelete, tableId)
    this.undoRedoManager.event()
  }

  public async createRecords(table_id: string, records: Record<string, any>[]) {
    const tm = new TableManager(table_id, this)
    const res = await tm.rows.batchCreate(records, {
      returnReadableData: true,
    })
    return res
  }

  public async addRow(
    tableName: string,
    data: Record<string, any>,
    options?: {
      useFieldId?: boolean
    }
  ): Promise<Record<string, any>> {
    const tableId = getTableIdByRawTableName(tableName)
    const tm = new TableManager(tableId, this)
    const res = await tm.rows.create(data, options)
    // this.undoRedoManager.event()
    const row = await tm.rows.get(res._id, { raw: true, withRowId: true })
    return row
  }

  // table lifecycle methods
  public async createTable(
    fields: Array<{
      name: string
      type: FieldType
    }>,
    name: string
  ) {
    const { createTableSql, tableId } =
      TableManager.generateCreateTableSql(fields)
    console.log("create table sql: ", createTableSql)
    await this.createTableViaSchema(tableId, name, createTableSql)
    return tableId
  }

  public async createTableViaSchema(
    id: string,
    name: string,
    tableSchema: string,
    parent_id?: string
  ) {
    // FIXME: should use db transaction to execute multiple sql

    try {
      await this.db.prepare("BEGIN TRANSACTION;").run()
      await this.tree.addNode({ id, name, type: TreeNodeType.Table, parent_id })
      await this.db.exec(tableSchema)
      // create view for table
      await this.view.createDefaultView(getRawTableNameById(id))
      await this.db.prepare("COMMIT;").run()
    } catch (error) {
      await this.db.prepare("ROLLBACK;").run()
      throw error
    }
  }

  public async fixTable(tableId: string) {
    const tableManager = this._table(tableId)
    return await tableManager.fixTable(tableId)
  }

  public async hasSystemColumn(tableId: string, column: string) {
    const tableManager = this._table(tableId)
    return await tableManager.hasSystemColumn(tableId, column)
  }

  public async isTableExist(id: string) {
    const tableManager = this._table(id)
    return await tableManager.isExist(id)
  }

  public async deleteTable(id: string) {
    await this._table(id).del(id)
  }

  // FTS methods for tables
  public async createTableFTS(tableName: string, temporary: boolean = false) {
    return await this.tableFullTextSearch.createDynamicFTS(tableName, temporary)
  }

  public async searchTableFTS(
    tableName: string,
    query: string,
    viewId: string,
    page: number = 1,
    pageSize: number = 20
  ) {
    return await this.tableFullTextSearch.search(
      tableName,
      query,
      viewId,
      page,
      pageSize
    )
  }

  public async hasTableFTS(tableName: string) {
    return await this.tableFullTextSearch.hasFTS(tableName)
  }

  // AI generated SQL execution
  public async runAIgeneratedSQL(sql: string, tableName: string) {
    const { getTableNameFromSql, transformQuery } =
      await import("../sqlite/sql-formula-parser")
    const _tableName = getTableNameFromSql(sql) || tableName
    const fields = await this.column.list({ table_name: _tableName })
    const _sql = transformQuery(sql, fields)
    const res = await this.exec2(_sql)
    return RowsManager.getReadableRows(res, fields)
  }

  /**
   * Migrate file paths in file fields from old format (/{spaceName}/files/) to new format (/files/)
   * @param tableId The table ID to migrate
   * @returns Migration statistics
   */
  public async migrateTableFilePaths(
    tableId: string
  ): Promise<{ migrated: number; errors: number }> {
    return await this._table(tableId).migrateFilePaths()
  }

  /**
   * Check if a table needs file path migration
   * @param tableId The table ID to check
   * @returns True if migration is needed
   */
  public async needsTableFilePathMigration(tableId: string): Promise<boolean> {
    return await this._table(tableId).needsFilePathMigration()
  }
}
