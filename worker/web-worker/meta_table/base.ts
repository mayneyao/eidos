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
  JSONFields: string[] = []
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

  public async list(query?: Record<string, any>): Promise<T[]> {
    let res: T[] = []
    if (!query) {
      res = await this.dataSpace.exec2(`SELECT * FROM ${this.name};`)
    } else {
      const kv = Object.entries(query)
      const setK = kv.map(([k, v]) => `${k} = ?`).join(", ")
      const setV = kv.map(([, v]) => v)
      res = await this.dataSpace.exec2(
        `SELECT * FROM ${this.name} WHERE ${setK};`,
        setV
      )
    }
    return res.map((item) => {
      Object.keys(item as any).forEach((key) => {
        if (this.JSONFields.includes(key)) {
          ;(item as any)[key] = JSON.parse((item as any)[key] as string)
        }
      })
      return item
    })
  }
}
