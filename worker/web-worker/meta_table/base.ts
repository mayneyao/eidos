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
}

export class BaseTableImpl<T = any> {
  name = ""
  constructor(protected dataSpace: DataSpace) {}

  initTable(createTableSql: string) {
    this.dataSpace.exec(createTableSql)
  }

  async set(id: string, data: Partial<T>): Promise<boolean> {
    const setKv = Object.entries(data)
      .map(([k, v]) => `${k} = ?`)
      .join(", ")
    await this.dataSpace.exec2(
      `UPDATE ${this.name} SET ${setKv} WHERE id = ?`,
      [...Object.values(data), id]
    )
    return true
  }
}
