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

  public toJson = (data: T) => {
    Object.entries(data as any).forEach(([key, value]) => {
      if (this.JSONFields.includes(key) && value) {
        ;(data as any)[key] = JSON.parse(value as string)
      }
    })
    return data
  }

  async delBy(data: Partial<T>): Promise<boolean> {
    const { deleteKPlaceholder, values } = this.transformData(data)
    await this.dataSpace.exec2(
      `DELETE FROM ${this.name} WHERE ${deleteKPlaceholder};`,
      values
    )
    return true
  }

  async get(id: string): Promise<T | null> {
    const res = await this.dataSpace.exec2(
      `SELECT * FROM ${this.name} where id = ?;`,
      [id]
    )
    if (res.length === 0) {
      return null
    }
    // JSONFields transform
    const item = res[0]
    return this.toJson(item)
  }

  transformData = (data: Partial<T>) => {
    const kv = Object.entries(data as object).map(([k, v]) => {
      if (typeof v === "object") v = JSON.stringify(v)
      // if (typeof v == "boolean") v = v ? 1 : 0
      return [k, v]
    })
    const updateKPlaceholder = kv.map(([k, v]) => `${k} = ?`).join(", ")
    const insertKPlaceholder = kv.map(([k]) => k).join(", ")
    const insertVPlaceholder = kv.map(() => "?").join(", ")
    const deleteKPlaceholder = kv.map(([k]) => `${k} = ?`).join(" AND ")
    const values = kv.map(([, v]) => v)
    return {
      kv,
      updateKPlaceholder,
      insertKPlaceholder,
      insertVPlaceholder,
      deleteKPlaceholder,
      values,
    }
  }

  async add(data: T, db = this.dataSpace.db): Promise<T> {
    console.log(data)
    const { insertKPlaceholder, insertVPlaceholder, values } =
      this.transformData(data)
    this.dataSpace.syncExec2(
      `INSERT INTO ${this.name} (${insertKPlaceholder}) VALUES (${insertVPlaceholder});`,
      values,
      db
    )
    return data
  }

  async set(id: string, data: Partial<T>): Promise<boolean> {
    const { updateKPlaceholder, values } = this.transformData(data)
    await this.dataSpace.exec2(
      `UPDATE ${this.name} SET ${updateKPlaceholder} WHERE id = ?`,
      [...values, id]
    )
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
      return this.toJson(item)
    })
  }
}
