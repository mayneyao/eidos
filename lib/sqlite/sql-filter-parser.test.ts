import { transformSql2FilterItems } from "./sql-filter-parser"

describe("transformSql2FilterItems", () => {
  test("should transform SQL to filter items", () => {
    const sql =
      "SELECT * FROM tb_4dc5698724ef41729feb8f21bbf63975 where title NOT LIKE 'Eidos'"
    const expected = {
      operator: "AND",
      operands: [
        {
          operator: "NotContains",
          operands: ["title", "Eidos"],
        },
      ],
    }
    const result = transformSql2FilterItems(sql)
    expect(result).toEqual(expected)
  })

  test("should transform SQL to filter items", () => {
    const sql =
      "SELECT * FROM tb_4dc5698724ef41729feb8f21bbf63975 where title  LIKE '%Eidos%' OR title LIKE '%Build%'"
    const expected = {
      operator: "OR",
      operands: [
        {
          operator: "Contains",
          operands: ["title", "Eidos"],
        },
        {
          operator: "Contains",
          operands: ["title", "Build"],
        },
      ],
    }
    const result = transformSql2FilterItems(sql)
    expect(result).toEqual(expected)
  })
})
