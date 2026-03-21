import { generateColumnName, getRawTableNameById } from "@/lib/utils"
import { v4 as uuidv4 } from "uuid"
import { generateMergeTableWithNewColumnsSql } from "../sqlite/sql-merge-table-with-new-columns"
import type { IView } from "../types/IView"

import { isDesktopMode } from "@/lib/env"
import type { EidosDatabase } from "../data-space"
import type { DataSpaceWithTable } from "../data-space/table"
import { allFieldTypesMap } from "../fields"
import type { FieldType } from "../fields/const"
import { smartSplitFilePaths } from "../fields/helper"
import { ColumnTable } from "../meta-table/column"
import { ColumnTableName } from "../sqlite/const"
import { IndexManager } from "./index-manager"
import { RowsManager } from "./rows"
import { FieldsManager } from "./service"
import { ComputeService } from "./service/compute"

interface ITable {
  id: string
  name: string
  views: IView[]
}

export class TableManager {
  // table name in sqlite
  rawTableName: string
  db: EidosDatabase
  constructor(
    public id: string,
    public dataSpace: DataSpaceWithTable
  ) {
    this.rawTableName = getRawTableNameById(id)
    this.db = dataSpace.db
  }

  get compute() {
    return new ComputeService(this.dataSpace)
  }

  get rows() {
    return new RowsManager(this)
  }
  get fields() {
    return new FieldsManager(this)
  }

  get index() {
    return new IndexManager(this)
  }

  async isExist(id: string): Promise<boolean> {
    const tableNode = await this.dataSpace.tree.getNode(id)
    return Boolean(tableNode)
  }

  async get(id: string): Promise<ITable | null> {
    const views = await this.dataSpace.view.list(
      { table_id: id },
      {
        order: "ASC",
        orderBy: "position",
      }
    )
    const tableNode = await this.dataSpace.tree.getNode(id)
    if (!tableNode) {
      return null
    }
    return {
      id: tableNode.id,
      name: tableNode.name,
      views,
    }
  }

  async del(id: string): Promise<boolean> {
    const rawTableName = `tb_${id}`
    await this.dataSpace.db.transaction(async (db) => {
      // before delete table, we need to delete all related triggers and references
      this.fields.link.beforeDeleteTable(rawTableName, db)
      // delete table
      db.exec(`DROP TABLE ${rawTableName}`)
      // delete fields
      await this.dataSpace.column.deleteByRawTableName(rawTableName, db)
      // delete views
      await this.dataSpace.view.deleteByTableId(id, db)
      // delete tree node
      await this.dataSpace.tree.del(id, db)
      if (isDesktopMode) {
        // clear fts table
        await this.dataSpace.tableFullTextSearch.clearFTS(rawTableName)
        // delete fts table
        await this.dataSpace.tableFullTextSearch.dropFTS(rawTableName)
      }
    })
    return true
  }

  async hasSystemColumn(tableId: string, column: string) {
    const res = await this.dataSpace.exec2(`PRAGMA table_info(tb_${tableId})`)
    const columns = res.map((item: any) => item.name)
    return columns.includes(column)
  }

  // we add system columns to table, but old tables don't have these columns, so we need to fix them.
  async fixTable(tableId: string) {
    const hasSystemColumn = await this.hasSystemColumn(tableId, "_created_time")
    if (!hasSystemColumn) {
      const createTableSqlRes = await this.dataSpace.exec2(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name='tb_${tableId}'`
      )
      const createTableSql = createTableSqlRes[0].sql
      const { sql } = generateMergeTableWithNewColumnsSql(
        createTableSql,
        `
      _created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      _last_edited_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      _created_by TEXT DEFAULT 'unknown',
      _last_edited_by TEXT DEFAULT 'unknown'
  `
      )
      console.log(sql)
      const res = await this.dataSpace.exec2(sql)
      console.log(res)
    }
  }

  /**
   * Migrate file paths in file fields from old format (/{spaceName}/files/) to new format (/files/)
   * @returns Migration statistics
   */
  async migrateFilePaths(): Promise<{ migrated: number; errors: number }> {
    let migrated = 0
    let errors = 0

    try {
      // Get all file-type columns for this table
      const allColumns = await this.dataSpace.column.list({
        table_name: this.rawTableName,
      })
      const columns = allColumns.filter((col) => col.type === "file")

      if (columns.length === 0) {
        console.log(`No file columns found in table ${this.rawTableName}`)
        return { migrated: 0, errors: 0 }
      }

      console.log(
        `Found ${columns.length} file columns in table ${this.rawTableName}`
      )

      // Get all rows from the table
      const rows = await this.dataSpace.exec2(
        `SELECT * FROM ${this.rawTableName}`
      )

      console.log(
        `Processing ${rows.length} rows in table ${this.rawTableName}`
      )

      for (const row of rows) {
        const rowId = row._id
        const updates: Record<string, string> = {}
        let rowChanged = false

        for (const column of columns) {
          const fieldValue = row[column.table_column_name]

          if (!fieldValue || typeof fieldValue !== "string") {
            continue
          }

          // Parse comma-separated file paths using smart split
          const paths = smartSplitFilePaths(fieldValue)

          let pathsChanged = false
          const migratedPaths = paths.map((path) => {
            // Skip network URLs and data URIs
            if (
              path.startsWith("http://") ||
              path.startsWith("https://") ||
              path.startsWith("data:")
            ) {
              return path
            }

            // Check if path matches old format: /{spaceName}/files/
            if (/^\/[^\/]+\/files\//.test(path)) {
              const newPath = path.replace(/^\/[^\/]+\/files\//, "/files/")
              if (newPath !== path) {
                console.log(`Migrating path: ${path} -> ${newPath}`)
                pathsChanged = true
                migrated++
              }
              return newPath
            }

            return path
          })

          if (pathsChanged) {
            updates[column.table_column_name] = migratedPaths.join(",")
            rowChanged = true
          }
        }

        // Update the row if any paths were changed
        if (rowChanged) {
          console.log("updates", updates)
          try {
            await this.rows.update(rowId, updates, { useFieldId: true })
          } catch (error) {
            console.error(`Error updating row ${rowId}:`, error)
            errors++
          }
        }
      }

      console.log(
        `Migration completed: ${migrated} paths migrated, ${errors} errors`
      )
      return { migrated, errors }
    } catch (error) {
      console.error("Error during table file path migration:", error)
      throw error
    }
  }

  /**
   * Detect and fix orphan __title columns that don't have corresponding link fields
   * This can happen when link fields were deleted incorrectly in older versions
   * @returns Object with arrays of fixed columns and any errors
   */
  async fixOrphanTitleColumns(): Promise<{
    fixed: string[]
    errors: string[]
  }> {
    const fixed: string[] = []
    const errors: string[] = []

    try {
      // Get all columns in the table
      const tableInfo = await this.dataSpace.exec2(
        `PRAGMA table_info(${this.rawTableName})`
      )
      const allColumns = tableInfo.map((col: any) => col.name)

      // Find all __title columns
      const titleColumns = allColumns.filter((col: string) =>
        col.endsWith("__title")
      )

      if (titleColumns.length === 0) {
        return { fixed: [], errors: [] }
      }

      // Get all link fields for this table from eidos__column
      const linkFields = await this.dataSpace.column.list({
        table_name: this.rawTableName,
      })
      const linkFieldNames = new Set(
        linkFields
          .filter((f) => f.type === "link")
          .map((f) => f.table_column_name)
      )

      // Find orphan columns to drop
      const columnsToDrop: string[] = []
      for (const titleColumn of titleColumns) {
        const linkColumnName = titleColumn.slice(0, -7) // Remove '__title'
        if (!linkFieldNames.has(linkColumnName)) {
          columnsToDrop.push(titleColumn)
        }
      }

      if (columnsToDrop.length === 0) {
        return { fixed: [], errors: [] }
      }

      // Need to drop triggers before dropping columns because triggers reference columns
      // Drop existing triggers
      try {
        await this.dataSpace.db.exec(`
          DROP TRIGGER IF EXISTS data_update_trigger_${this.rawTableName};
          DROP TRIGGER IF EXISTS data_insert_trigger_${this.rawTableName};
          DROP TRIGGER IF EXISTS data_delete_trigger_${this.rawTableName};
        `)
      } catch (e) {
        // Ignore errors if triggers don't exist
      }

      // Clean up orphaned references for __title columns before dropping columns
      // These references were created when link fields were added but not cleaned up when deleted
      for (const titleColumn of columnsToDrop) {
        try {
          await this.dataSpace.reference.delBy({
            self_table_name: this.rawTableName,
            self_table_column_name: titleColumn,
          })
          console.log(
            `Cleaned up reference for orphan column: ${this.rawTableName}.${titleColumn}`
          )
        } catch (e) {
          // Ignore errors if reference doesn't exist
          console.log(
            `No reference to clean for ${this.rawTableName}.${titleColumn}`
          )
        }
      }

      // Drop orphan columns
      for (const titleColumn of columnsToDrop) {
        try {
          await this.dataSpace.db.exec(
            `ALTER TABLE ${this.rawTableName} DROP COLUMN ${titleColumn};`
          )
          fixed.push(titleColumn)
          console.log(
            `Fixed orphan __title column: ${this.rawTableName}.${titleColumn}`
          )
        } catch (error) {
          const errorMsg = `Failed to drop column ${titleColumn}: ${error}`
          console.error(errorMsg)
          errors.push(errorMsg)
        }
      }

      // Recreate triggers with updated column list
      if (fixed.length > 0) {
        try {
          // Get updated column list after dropping columns
          const updatedTableInfo = await this.dataSpace.exec2(
            `PRAGMA table_info(${this.rawTableName})`
          )
          await this.dataSpace.dataChangeTrigger.setTrigger(
            this.dataSpace,
            this.rawTableName,
            updatedTableInfo
          )
        } catch (e) {
          const errorMsg = `Failed to recreate triggers: ${e}`
          console.error(errorMsg)
          errors.push(errorMsg)
        }
      }

      return { fixed, errors }
    } catch (error) {
      const errorMsg = `Error fixing orphan title columns: ${error}`
      console.error(errorMsg)
      errors.push(errorMsg)
      return { fixed, errors }
    }
  }

  /**
   * Check if this table has orphan __title columns that need fixing
   * @returns True if there are orphan columns
   */
  async hasOrphanTitleColumns(): Promise<boolean> {
    try {
      // Get all columns in the table
      const tableInfo = await this.dataSpace.exec2(
        `PRAGMA table_info(${this.rawTableName})`
      )
      const allColumns = tableInfo.map((col: any) => col.name)

      // Find all __title columns
      const titleColumns = allColumns.filter((col: string) =>
        col.endsWith("__title")
      )

      if (titleColumns.length === 0) {
        return false
      }

      // Get all link fields for this table from eidos__column
      const linkFields = await this.dataSpace.column.list({
        table_name: this.rawTableName,
      })
      const linkFieldNames = new Set(
        linkFields
          .filter((f) => f.type === "link")
          .map((f) => f.table_column_name)
      )

      // Check if any __title column is orphan
      for (const titleColumn of titleColumns) {
        const linkColumnName = titleColumn.slice(0, -7)
        if (!linkFieldNames.has(linkColumnName)) {
          return true
        }
      }

      return false
    } catch (error) {
      console.error("Error checking for orphan title columns:", error)
      return false
    }
  }

  /**
   * Check if this table needs file path migration
   * @returns True if migration is needed
   */
  async needsFilePathMigration(): Promise<boolean> {
    try {
      // Get all file-type columns for this table
      const allColumns = await this.dataSpace.column.list({
        table_name: this.rawTableName,
      })
      console.log("allColumns", allColumns, this.rawTableName)
      const columns = allColumns.filter((col) => col.type === "file")
      console.log("columns", columns)

      if (columns.length === 0) {
        return false
      }

      // Check if any row contains old path pattern
      for (const column of columns) {
        const result = await this.dataSpace.exec2(
          `SELECT COUNT(*) as count FROM ${this.rawTableName} 
           WHERE ${column.table_column_name} LIKE '%/files/%' 
           AND ${column.table_column_name} NOT LIKE 'http%'
           AND ${column.table_column_name} NOT LIKE 'data:%'
           LIMIT 1`
        )
        console.log("result", result)
        if (result && result[0]?.count > 0) {
          return true
        }
      }

      return false
    } catch (error) {
      console.error("Error checking table file path migration need:", error)
      return false
    }
  }

  static generateCreateTableSql(
    fields: Array<{
      name: string
      type: FieldType
    }>
  ) {
    const tableId = uuidv4().split("-").join("")
    const rawTableName = getRawTableNameById(tableId)
    const fieldsWithoutTitle = fields.filter(
      (field) => field.name.toLowerCase() !== "title"
    )
    const rawColumns = fieldsWithoutTitle.map((_, index) =>
      generateColumnName()
    )

    let createTableSql = `
CREATE TABLE ${rawTableName} (
  _id TEXT PRIMARY KEY NOT NULL,
  title TEXT NULL,
  _created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  _last_edited_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  _created_by TEXT DEFAULT 'unknown',
  _last_edited_by TEXT DEFAULT 'unknown',
`
    rawColumns.forEach((column, index) => {
      const field = fieldsWithoutTitle[index]
      const sqlType = ColumnTable.getColumnTypeByFieldType(field.type)
      const isLastColumn = index === rawColumns.length - 1
      createTableSql +=
        `${column} ${sqlType} NULL` + (isLastColumn ? "\n" : ",\n")
    })
    createTableSql += `);`

    createTableSql += `
    --- insert ui-column to table
    INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('_id', 'row-id', '${rawTableName}', '_id');
    INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('title', 'title', '${rawTableName}', 'title');
    `
    fieldsWithoutTitle.forEach((field, index) => {
      const defaultFieldProperty =
        allFieldTypesMap[field.type].getDefaultFieldProperty()
      const rawColumn = rawColumns[index]
      const escapedName = field.name.replace(/'/g, "''")
      createTableSql += `INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name, property) VALUES ('${escapedName}', '${field.type}', '${rawTableName}', '${rawColumn}', '${JSON.stringify(defaultFieldProperty)}');`
    })

    return {
      tableId,
      createTableSql,
    }
  }
}
