import { z } from "zod"

const sqlQuery = {
  name: "sqlQuery",
  description: "sql query",
  schema: z
    .object({
      sql: z.string({
        description: "sql",
      }),
    })
    .describe("sql query"),
}

export default sqlQuery
