import { parseFirst } from "pgsql-ast-parser"

import { replaceQueryTableName, replaceWithFindIndexQuery } from "./sql-parser"

describe("replaceQueryTableName", () => {
  test("should replace table name in the query", () => {
    const query = "SELECT * FROM tb_a"
    const tableName = "raw_tb_a"
    const result = replaceQueryTableName(query, {
      tb_a: tableName,
    })
    const expected = replaceQueryTableName("SELECT * FROM raw_tb_a", {})
    expect(result).toBe(expected)
  })
  test("demo", () => {
    const q = `SELECT id,
       name,
       score
FROM students order by rowid DESC;`
    const parse = replaceWithFindIndexQuery(q, "1")
    console.log(parse)
  })
})
