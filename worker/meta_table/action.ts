import { ActionTableName } from "@/lib/sqlite/const"

import { BaseTable, BaseTableImpl } from "./base"

type ParamType = "string" | "number" | "boolean"

interface IFunction {
  name: string
  params: {
    name: string
    value: any
  }[]
}

export interface IAction {
  id: string
  name: string
  params: {
    name: string
    type: ParamType
  }[]
  nodes: IFunction[]
}

export class ActionTable extends BaseTableImpl implements BaseTable<IAction> {
  name = ActionTableName
  createTableSql = `
  CREATE TABLE IF NOT EXISTS ${this.name} (
    id TEXT PRIMARY KEY,
    name TEXT,
    params TEXT,
    nodes TEXT
  );
`

  add(data: IAction): Promise<IAction> {
    this.dataSpace.exec2(`INSERT INTO ${this.name} VALUES (?, ?, ?, ?)`, [
      data.id,
      data.name,
      JSON.stringify(data.params),
      JSON.stringify(data.nodes),
    ])
    return Promise.resolve(data)
  }
  set(id: string, data: IAction): Promise<boolean> {
    this.dataSpace.exec2(
      `UPDATE ${this.name} SET name = ?, nodes = ? WHERE id = ?`,
      [data.name, JSON.stringify(data.nodes), id]
    )
    return Promise.resolve(true)
  }
  del(id: string): Promise<boolean> {
    this.dataSpace.exec2(`DELETE FROM ${this.name} WHERE id = ?`, [id])
    return Promise.resolve(true)
  }
  async get(id: string) {
    const res = await this.dataSpace.exec2(
      `SELECT * FROM ${this.name} WHERE id = ?`,
      [id]
    )
    if (!res.length) {
      return Promise.resolve(null)
    }
    return Promise.resolve({
      id: res[0].id,
      name: res[0].name,
      params: JSON.parse(res[0].params),
      nodes: JSON.parse(res[0].nodes),
    })
  }
  async list(): Promise<IAction[]> {
    const res = await this.dataSpace.exec2(`SELECT * FROM ${this.name}`)
    return Promise.resolve(
      res.map((item) => ({
        id: item.id,
        name: item.name,
        params: JSON.parse(item.params),
        nodes: JSON.parse(item.nodes),
      }))
    )
  }
}
