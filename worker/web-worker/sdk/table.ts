import { generateMergeTableWithNewColumnsSql } from "@/lib/sqlite/sql-merge-table-with-new-columns"
import { IView } from "@/lib/store/IView"
import { generateColumnName, getRawTableNameById } from "@/lib/utils"
import { v4 as uuidv4 } from "uuid"

import { DataSpace, EidosDatabase } from "../DataSpace"
import { IndexManager } from "./index-manager"
import { RowsManager } from "./rows"
import { FieldsManager } from "./service"
import { ComputeService } from "./service/compute"
import { FieldType } from "@/lib/fields/const"
import { ColumnTableName } from "@/lib/sqlite/const"
import { ColumnTable } from "../meta-table/column"

interface ITable {
  id: string
  name: string
  views: IView[]
}

export class TableManager {
  // table name in sqlite
  rawTableName: string
  db: EidosDatabase
  constructor(public id: string, public dataSpace: DataSpace) {
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
    const tableNode = await this.dataSpace.getTreeNode(id)
    return Boolean(tableNode)
  }

  async get(id: string): Promise<ITable | null> {
    const views = await this.dataSpace.listViews(id)
    const tableNode = await this.dataSpace.getTreeNode(id)
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

  static generateCreateTableSql(fields: Array<{
    name: string;
    type: FieldType;
  }>) {
    const tableId = uuidv4().split("-").join("")
    const rawTableName = getRawTableNameById(tableId)
    const fieldsWithoutTitle = fields.filter(field => field.name.toLowerCase() !== 'title')
    const rawColumns = fieldsWithoutTitle.map((_, index) => generateColumnName())

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
        `${column} ${sqlType} NULL` +
        (isLastColumn ? "\n" : ",\n")
    })
    createTableSql += `);`

    createTableSql += `
    --- insert ui-column to table
    INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('_id', 'row-id', '${rawTableName}', '_id');
    INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('title', 'title', '${rawTableName}', 'title');
    `
    fieldsWithoutTitle.forEach((field, index) => {
      const rawColumn = rawColumns[index]
      const escapedName = field.name.replace(/'/g, "''")
      createTableSql += `INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('${escapedName}', '${field.type}', '${rawTableName}', '${rawColumn}');`
    })

    return {
      tableId,
      createTableSql,
    }
  }
}
