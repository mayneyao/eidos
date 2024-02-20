import { replaceQueryTableName } from "./sql-parser"

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
})
