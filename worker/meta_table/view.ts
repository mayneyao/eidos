import { ViewTableName } from "@/lib/sqlite/const"

import { BaseTable } from "./base"

interface IView {
  id: string
  name: string
  type: string
  tableId: string // tableId uuid
  query: string
}

export class ViewTable implements BaseTable<IView> {
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
  add(data: IView): Promise<IView> {
    throw new Error("Method not implemented.")
  }
  get(id: string): Promise<IView | null> {
    throw new Error("Method not implemented.")
  }
  set(id: string, data: IView): Promise<boolean> {
    throw new Error("Method not implemented.")
  }
  del(id: string): Promise<boolean> {
    throw new Error("Method not implemented.")
  }
}
