import { ViewTableName } from "@/lib/sqlite/const"
import { getUuid } from "@/lib/utils"

import { BaseTable, BaseTableImpl } from "./base"

export enum ViewTypeEnum {
  Grid = "grid",
  Gallery = "gallery",
}

export interface IView {
  id: string
  name: string
  type: ViewTypeEnum
  tableId: string // tableId uuid
  query: string
}

export class ViewTable extends BaseTableImpl implements BaseTable<IView> {
  name = ViewTableName
  createTableSql = `
CREATE TABLE IF NOT EXISTS ${this.name} (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  tableId TEXT NOT NULL,
  query TEXT NOT NULL
);
`

  async add(data: IView): Promise<IView> {
    await this.dataSpace.exec2(
      `INSERT INTO ${this.name} (id,name,type,tableId,query) VALUES (? , ? , ? , ? , ?);`,
      [data.id, data.name, data.type, data.tableId, data.query]
    )
    return data
  }

  get(id: string): Promise<IView | null> {
    throw new Error("Method not implemented.")
  }
  set(id: string, data: Partial<IView>): Promise<boolean> {
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

  // methods
  public async updateQuery(id: string, query: string) {
    await this.dataSpace.exec2(
      `UPDATE ${this.name} SET query = ? WHERE id = ?`,
      [query, id]
    )
  }

  public async list(tableId: string): Promise<IView[]> {
    return this.dataSpace.exec2(
      `SELECT * FROM ${this.name} WHERE tableId = ?;`,
      [tableId]
    )
  }

  public async createDefaultView(tableId: string) {
    return await this.add({
      id: getUuid(),
      name: "New View",
      type: ViewTypeEnum.Grid,
      tableId,
      query: "",
    })
  }
}
