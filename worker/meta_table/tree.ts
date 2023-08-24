import { TreeTableName } from "@/lib/sqlite/const"
import { getRawTableNameById } from "@/lib/utils"

import { BaseTable, BaseTableImpl } from "./base"

export interface ITreeNode {
  id: string
  name: string
  type: "table" | "doc" | "subDoc"
  parentId?: string
}

export class TreeTable extends BaseTableImpl implements BaseTable<ITreeNode> {
  name = TreeTableName
  createTableSql = `
  CREATE TABLE IF NOT EXISTS ${TreeTableName} (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT,
    parentId TEXT NULL
  );
  `

  add(data: ITreeNode): Promise<ITreeNode> {
    this.dataSpace.exec(
      `INSERT INTO ${TreeTableName} (id,name,type,parentId) VALUES (? , ? , ? , ?);`,
      [data.id, data.name, data.type, data.parentId]
    )
    return Promise.resolve(data)
  }

  async get(id: string): Promise<ITreeNode | null> {
    const res = await this.dataSpace.exec2(
      `SELECT * FROM ${TreeTableName} where id = ?;`,
      [id]
    )
    if (res.length === 0) {
      return null
    }
    return res[0] as ITreeNode
  }

  async updateName(id: string, name: string): Promise<boolean> {
    try {
      await this.dataSpace.exec2(
        `UPDATE ${TreeTableName} SET name = ? WHERE id = ?;`,
        [name, id]
      )
      return Promise.resolve(true)
    } catch (error) {
      return Promise.resolve(false)
    }
  }

  async set(id: string, data: ITreeNode): Promise<boolean> {
    await this.dataSpace.exec2(
      `UPDATE ${TreeTableName} SET name = ? , type = ? , parentId = ? WHERE id = ?;`,
      [data.name, data.type, data.parentId, id]
    )
    return Promise.resolve(true)
  }

  del(id: string): Promise<boolean> {
    throw new Error("Method not implemented.")
  }

  // @deprecated Proxy can't pass to main thread
  makeProxyRow(row: any): ITreeNode {
    const dataSpace = this.dataSpace
    return new Proxy(row, {
      get(target, p, receiver) {
        if (p === "children") {
          return []
        }
        return Reflect.get(target, p, receiver)
      },
      set(target, p: string, value, receiver) {
        dataSpace.exec(`UPDATE ${TreeTableName} SET ${p} = ? WHERE id = ?;`, [
          value,
          target.id,
        ])
        return Reflect.set(target, p, value, receiver)
      },
    })
  }

  async list(query?: string, withSubNode?: boolean): Promise<ITreeNode[]> {
    let sql = `SELECT * FROM ${TreeTableName} `
    if (query) {
      sql += ` WHERE name like ?`
    }
    if (query && !withSubNode) {
      sql += ` AND parentId is null;`
    }
    const bind = query ? [`%${query}%`] : undefined
    const res = await this.dataSpace.exec2(sql, bind)
    return res.map((row) => row)
  }

  async moveIntoTable(id: string, tableId: string): Promise<boolean> {
    try {
      await this.dataSpace.withTransaction(async () => {
        // update parentId
        await this.dataSpace.exec2(
          `UPDATE ${TreeTableName} SET parentId = ? WHERE id = ?;`,
          [tableId, id]
        )
        // add new row in table
        // row. _id = nodeId
        const tableName = getRawTableNameById(tableId)
        const title = (await this.get(id))?.name
        await this.dataSpace.exec2(
          `INSERT INTO ${tableName} (_id,title) VALUES (?,?);`,
          [id, title]
        )
      })
      return Promise.resolve(true)
    } catch (error) {
      return Promise.resolve(false)
    }
  }
}
