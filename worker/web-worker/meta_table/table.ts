import { generateMergeTableWithNewColumnsSql } from "@/lib/sqlite/sql-merge-table-with-new-columns"
import { IView } from "@/lib/store/IView"

import { DataSpace } from "../DataSpace"
import { MetaTable } from "./base"

interface ITable {
  id: string
  name: string
  views: IView[]
}

export class Table implements MetaTable<ITable> {
  constructor(protected dataSpace: DataSpace) {}
  add(data: ITable): Promise<ITable> {
    throw new Error("Method not implemented.")
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
  set(id: string, data: Partial<ITable>): Promise<boolean> {
    throw new Error("Method not implemented.")
  }
  async del(id: string): Promise<boolean> {
    const rawTableName = `tb_${id}`
    await this.dataSpace.withTransaction(async () => {
      // delete table
      await this.dataSpace.exec2(`DROP TABLE ${rawTableName}`)
      // delete fields
      await this.dataSpace.column.deleteByRawTableName(rawTableName)
      // delete views
      await this.dataSpace.view.deleteByTableId(id)
      // delete tree node
      await this.dataSpace.tree.del(id)
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
}
