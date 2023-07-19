export interface BaseTable<T> {
  name: string
  createTableSql: string
  add(data: T): Promise<T>
  get(id: string): Promise<T | null>
  set(id: string, data: T): Promise<boolean>
  del(id: string): Promise<boolean>
}
