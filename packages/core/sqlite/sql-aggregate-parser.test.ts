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

  // test("transforms aggregate items without group by columns", () => {
  //   const baseSql = "SELECT * FROM orders";
  //   const aggregateItems: AggregateItem[] = [
  //     { column: "*", function: "count", alias: "order_count" }
  //   ];
  //   const result = transformAggregateItems2SqlString(baseSql, aggregateItems);

  //   // For count with "*" the args array is empty, so it should be converted to COUNT(*)
  //   expect(result).toMatch(/COUNT\s*\(\s*\*\s*\)/i);
  //   expect(result).toMatch(/AS\s+order_count/i);
  //   // There should be no GROUP BY clause when none is provided.
  //   expect(result).not.toMatch(/GROUP BY/i);
  // });

  // test("transforms count distinct aggregate item correctly", () => {
  //   const baseSql = "SELECT category FROM products";
  //   const aggregateItems: AggregateItem[] = [
  //     { column: "price", function: "count_distinct", alias: "unique_price_count" }
  //   ];
  //   const groupByColumns = ["category"];
  //   const result = transformAggregateItems2SqlString(baseSql, aggregateItems, groupByColumns);
  //   console.log(result)

  //   // Check that the COUNT(DISTINCT ...) expression is generated correctly.
  //   expect(result).toMatch(/COUNT\s*\(\s*DISTINCT\s+price\s*\)/i);
  //   expect(result).toMatch(/AS\s+unique_price_count/i);
  //   expect(result).toMatch(/GROUP BY\s+category/i);
  // });
})
