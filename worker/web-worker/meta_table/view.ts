import { ViewTableName } from "@/lib/sqlite/const"
import { replaceQueryTableName } from "@/lib/sqlite/sql-parser"
import { IView, ViewTypeEnum } from "@/lib/store/IView"
import { getUuid } from "@/lib/utils"

import { BaseTable, BaseTableImpl } from "./base"

export class ViewTable extends BaseTableImpl implements BaseTable<IView> {
  name = ViewTableName
  createTableSql = `
CREATE TABLE IF NOT EXISTS ${this.name} (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  table_id TEXT NOT NULL,
  query TEXT NOT NULL,
  properties TEXT,
  filter TEXT,
  order_map TEXT,
  hidden_fields TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`

  JSONFields = ["properties", "filter", "order_map", "hidden_fields"]
  async add(data: IView): Promise<IView> {
    await this.dataSpace.exec2(
      `INSERT INTO ${this.name} (id,name,type,table_id,query) VALUES (? , ? , ? , ? , ?);`,
      [data.id, data.name, data.type, data.table_id, data.query]
    )
    return data
  }

  get(id: string): Promise<IView | null> {
    throw new Error("Method not implemented.")
  }

  async del(id: string): Promise<boolean> {
    try {
      await this.dataSpace.exec2(`DELETE FROM ${this.name} WHERE id = ?`, [id])
      return true
    } catch (error) {
      console.warn(error)
      return false
    }
  }

  async deleteByTableId(table_id: string) {
    await this.dataSpace.exec2(`DELETE FROM ${this.name} WHERE table_id = ?`, [
      table_id,
    ])
  }

  // methods
  public async updateQuery(id: string, query: string) {
    await this.dataSpace.exec2(
      `UPDATE ${this.name} SET query = ? WHERE id = ?`,
      [query, id]
    )
  }

  public async createDefaultView(table_id: string) {
    return await this.add({
      id: getUuid(),
      name: "New View",
      type: ViewTypeEnum.Grid,
      table_id,
      query: `SELECT * FROM tb_${table_id}`,
    })
  }

  public async isRowExistInQuery(
    table_id: string,
    rowId: string,
    query: string
  ) {
    const tmpTableName = `temp_table_${getUuid().slice(0, 8)}`
    const tableName = `tb_${table_id}`
    let isExist = false
    try {
      await this.dataSpace.exec2(
        `CREATE TEMPORARY TABLE ${tmpTableName} AS SELECT * FROM ${tableName} WHERE _id = ?`,
        [rowId]
      )
      // Check if the row exists in the temporary table
      const newQuery = replaceQueryTableName(query, {
        [tableName]: tmpTableName,
      })
      const result = await this.dataSpace.exec2(newQuery)
      isExist = result.length > 0
    } catch (error) {
    } finally {
      // Drop the temporary table
      await this.dataSpace.exec2(`DROP TABLE ${tmpTableName}`)
    }
    return isExist
  }

  // after entity field changed, the formula field may be changed, so we need to recompute the formula field
  public async recompute(table_id: string, rowIds: string[]) {
    const tableName = `tb_${table_id}`
    const placeholders = rowIds.map(() => "?").join(",")
    const result = await this.dataSpace.exec2(
      `SELECT * FROM ${tableName} where _id in (${placeholders})`,
      rowIds
    )
    return result
  }
}
