import { DataSpace } from "../DataSpace"

export interface MetaTable<T> {
  add(data: T): Promise<T>
  get(id: string): Promise<T | null>
  set(id: string, data: Partial<T>): Promise<boolean>
  del(id: string): Promise<boolean>
}

export interface BaseTable<T> extends MetaTable<T> {
  name: string // raw table name
  createTableSql: string
  JSONFields?: string[]
}

export class BaseTableImpl<T = any> {
  name = ""
  constructor(protected dataSpace: DataSpace) {}

  initTable(createTableSql: string) {
    this.dataSpace.exec(createTableSql)
  }

  async set(id: string, data: Partial<T>): Promise<boolean> {
    const kv = Object.entries(data).map(([k, v]) => {
      if (typeof v === "object") v = JSON.stringify(v)
      return [k, v]
    })
    const setK = kv.map(([k, v]) => `${k} = ?`).join(", ")
    const setV = kv.map(([, v]) => v)
    await this.dataSpace.exec2(`UPDATE ${this.name} SET ${setK} WHERE id = ?`, [
      ...setV,
      id,
    ])
    return true
  }
}
