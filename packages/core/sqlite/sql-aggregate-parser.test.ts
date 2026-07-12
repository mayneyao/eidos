import type { AggregateItem } from "./interface"
import { transformAggregateItems2SqlString } from "./sql-aggregate-parser"

describe("transformAggregateItems2SqlString", () => {
  test("transforms aggregate items with group by columns", () => {
    const baseSql = "SELECT department FROM employees"
    const aggregateItems: AggregateItem[] = [
      { column: "salary", function: "sum", alias: "total_salary" },
      { column: "id", function: "count", alias: "employee_count" },
    ]
    const groupByColumns = ["department"]
    const result = transformAggregateItems2SqlString(
      baseSql,
      aggregateItems,
      groupByColumns
    )

    // Check that the result contains aggregate expressions and the group by column
    expect(result).toMatch(/SUM\s*\(\s*salary\s*\)/i)
    expect(result).toMatch(/COUNT\s*\(\s*id\s*\)/i)
    expect(result).toMatch(/AS\s+total_salary/i)
    expect(result).toMatch(/AS\s+employee_count/i)
    expect(result).toMatch(/GROUP BY\s+department/i)
  })

  test("transforms count star without group by columns", () => {
    const result = transformAggregateItems2SqlString("SELECT * FROM orders", [
      { column: "*", function: "count", alias: "order_count" },
    ])

    expect(result).toMatch(/COUNT\s*\(\s*\*\s*\)/i)
    expect(result).toMatch(/AS\s+order_count/i)
    expect(result).not.toMatch(/GROUP BY/i)
  })

  test("transforms count distinct aggregate item correctly", () => {
    const result = transformAggregateItems2SqlString(
      "SELECT category FROM products",
      [
        {
          column: "price",
          function: "count_distinct",
          alias: "unique_price_count",
        },
      ],
      ["category"]
    )

    expect(result).toMatch(/COUNT\s*\(\s*DISTINCT\s+price\s*\)/i)
    expect(result).toMatch(/AS\s+unique_price_count/i)
    expect(result).toMatch(/GROUP BY\s+category/i)
  })
})
