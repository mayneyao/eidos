import { Client, createClient } from "@libsql/client/web"

export class ServerDatabase {
  db: Client
  filename: string
  constructor(url: string, token: string) {
    // token below just for testing, should be removed
    this.db = createClient({
      url,
      authToken: token,
    })
    this.filename = "demo"
  }

  prepare(): any { }
  close() {
    this.db.close()
  }

  async selectObjects(sql: string): Promise<{ [columnName: string]: any }[]> {
    const { rows } = await this.db.execute(sql)
    return rows
  }
  transaction() { }
  async exec(opts: any) {
    if (typeof opts === "string") {
      const { rows } = await this.db.execute(opts)
      return rows
    } else if (typeof opts === "object") {
      const { sql, bind, rowMode } = opts
      if (rowMode === "object") {
        const { rows } = await this.db.execute({
          sql,
          args: bind,
        })
        return rows
      }
      if (rowMode === "array") {
        const { rows, columns } = await this.db.execute({
          sql,
          args: bind,
        })

        return rows.map((row: any) => {
          return columns.map((col: any, index: number) => {
            return row[index]
          })
        })
      }
    }
    return []
  }
  createFunction() { }
}
