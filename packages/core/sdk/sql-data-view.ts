import { ViewTypeEnum } from "../types/IView"
import type { DataSpace } from "../data-space"
import { shortenId, uuidv7 } from "@/lib/utils"
import type { IField } from "../types/IField"
import { FieldType } from "../fields/const"
import { allFieldTypesMap } from "../fields"
import { parseColumnTypesFromComments } from "../sqlite/sql-comment-parser"

export class SqlDataView {
  constructor(private dataSpace: DataSpace) {}

  async delete(id: string) {
    const viewName = `vw_${id}`
    await this.dataSpace.db.prepare("BEGIN TRANSACTION;").run()
    try {
      await this.dataSpace.db.prepare(`DROP VIEW IF EXISTS ${viewName};`).run()
      await this.dataSpace.view.deleteByTableId(id)
      await this.dataSpace.column.deleteByRawTableName(viewName)
      await this.dataSpace.tree.del(id)
    } catch (error) {
      await this.dataSpace.db.prepare("ROLLBACK;").run()
      console.error("Error in delete view transaction:", error)
      throw error
    } finally {
      await this.dataSpace.db.prepare("COMMIT;").run()
    }
  }

  async getAllDataViewIds() {
    const views = await this.dataSpace.exec2(
      `SELECT name FROM sqlite_master WHERE type='view' and name like 'vw_%';`
    )
    return views.map((view: any) => view.name.replace("vw_", ""))
  }

  async isDataViewExist(id: string) {
    const viewName = `vw_${id}`
    const view = await this.dataSpace.db.exec({
      sql: `SELECT name, sql FROM sqlite_master WHERE type='view' and name = ?;`,
      bind: [viewName],
    })
    return view.length > 0
  }

  async getViewRawQuery(tableName: string) {
    const view = await this.dataSpace.db.exec({
      sql: `SELECT sql FROM sqlite_master WHERE type='view' and name = ?;`,
      bind: [tableName],
    })
    const fullSql = view[0]?.sql || ""

    // Extract only the query part, removing CREATE VIEW statement
    // Match pattern: CREATE VIEW view_name AS query_statement
    const createViewRegex =
      /^CREATE\s+(?:TEMPORARY\s+)?VIEW\s+\w+\s+AS\s+(.*)$/is
    const match = fullSql.match(createViewRegex)

    if (match && match[1]) {
      return match[1].trim()
    }

    // Fallback to original SQL if pattern doesn't match
    return fullSql
  }

  async getViewColumns(id: string) {
    const viewName = `vw_${id}`
    const columns = await this.dataSpace.db
      .prepare(`PRAGMA table_info(${viewName});`)
      .all()
    return columns
  }

  async getViewFields(id: string): Promise<IField[]> {
    const viewName = `vw_${id}`
    const columns = await this.getViewColumns(id)
    const modifiedColumns = await this.dataSpace.column.list({
      table_name: viewName,
    })
    return columns.map((column) => {
      const modifiedColumn = modifiedColumns.find(
        (c) => c.table_column_name === column.name
      )
      if (modifiedColumn) {
        return modifiedColumn
      }
      return {
        name: column.name,
        type: FieldType.Text,
        table_column_name: column.name,
        table_name: viewName,
        property: {},
      }
    })
  }

  async updateViewColumn({
    tableName,
    tableColumnName,
    type,
    property,
  }: {
    tableName: string
    tableColumnName: string
    type: FieldType
    property: any
  }) {
    const defaultFieldProperty =
      allFieldTypesMap[type].getDefaultFieldProperty()

    const isEmptyProperty = Object.keys(property).length === 0
    const updateData = {
      name: tableColumnName,
      type,
      table_name: tableName,
      table_column_name: tableColumnName,
      property: isEmptyProperty ? defaultFieldProperty : property,
    }
    const column = await this.dataSpace.column.getColumn(
      tableName,
      tableColumnName
    )
    if (!column) {
      await this.dataSpace.column.addPureUIColumn(updateData)
    } else {
      await this.dataSpace.column.updatePureUIColumn(updateData)
    }
  }

  async createDataView(
    id: string,
    createViewSql: string,
    isTemp: boolean = false
  ) {
    const viewName = `vw_${id}`
    // delete temp view
    await this.dataSpace.db.prepare(`DROP VIEW IF EXISTS ${viewName};`).run()
    await this.dataSpace.view.deleteByTableId(id)
    // Clean up existing column metadata for this view
    await this.dataSpace.column.deleteByRawTableName(viewName)
    await this.dataSpace.db.prepare("BEGIN TRANSACTION;").run()

    try {
      await this.dataSpace.db
        .prepare(
          `CREATE ${isTemp ? "TEMPORARY" : ""} VIEW IF NOT EXISTS ${viewName} AS \n ${createViewSql};`
        )
        .run()
      await this.dataSpace.view.add({
        id: shortenId(uuidv7()),
        name: `New View`,
        type: ViewTypeEnum.Grid,
        table_id: id,
        query: `select * from ${viewName}`,
      })
      // Parse column types from SQL comments and create column metadata
      await this.createColumnMetadataFromComments(viewName, createViewSql)
    } catch (error) {
      await this.dataSpace.db.prepare("ROLLBACK;").run()
      console.error("Error in createDataView transaction:", error)
      throw error
    } finally {
      await this.dataSpace.db.prepare("COMMIT;").run()
    }
    return true
  }

  /**
   * Create column metadata from SQL comments
   * @param viewName The view name
   * @param createViewSql The SQL used to create the view
   */
  private async createColumnMetadataFromComments(
    viewName: string,
    createViewSql: string
  ) {
    try {
      // Parse column types from SQL comments
      const columnTypes = parseColumnTypesFromComments(createViewSql)

      if (Object.keys(columnTypes).length === 0) {
        // No column type comments found, no need to create metadata
        // System will default to text type for all columns
        return
      }

      // Create column metadata only for columns with type comments
      for (const [columnName, fieldType] of Object.entries(columnTypes)) {
        const defaultProperty =
          allFieldTypesMap[fieldType].getDefaultFieldProperty()
        await this.dataSpace.column.addPureUIColumn({
          name: columnName,
          type: fieldType,
          table_name: viewName,
          table_column_name: columnName,
          property: defaultProperty,
        })
      }
    } catch (error) {
      console.error("Error creating column metadata from comments:", error)
      // Don't throw error here to avoid breaking the view creation
      // Just log the error and continue with default behavior
    }
  }
}
