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
    nodes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`
  JSONFields: string[] = ["params", "nodes"]
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
}
