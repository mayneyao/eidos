import { SelectFromStatement, parseFirst } from "pgsql-ast-parser"

import { FieldType } from "../fields/const"
import { getTransformedQuery } from "./helper"
import {
  rewriteQuery2getSortedRowIds,
  transformQueryWithOrderBy2Sql,
} from "./sql-sort-parser"

describe("rewriteQuery2getSortedRowIds", () => {
  test("should rewrite query to get sorted row IDs", () => {
    const query = "SELECT * FROM table_name"
    const expected = "SELECT _id FROM table_name ORDER BY rowid ASC"
    const result = rewriteQuery2getSortedRowIds(query)
    expect(result).toBe(getTransformedQuery(expected))
  })

  test("if order by field is number, should rewrite query with cast ", () => {
    const query = "SELECT * FROM table_name ORDER BY number_field"

    const res = transformQueryWithOrderBy2Sql(
      [
        {
          column: "number_field",
          order: "ASC",
        } as any,
      ],
      query,
      {
        number_field: {
          type: FieldType.Number,
          name: "number_field",
        } as any,
      }
    )
    const expected =
      "SELECT *  FROM table_name    ORDER BY CAST(number_field as real ) ASC"
    expect(res).toBe(expected)
  })

  test("rewrite query with order by field is text, should rewrite query with lower", () => {
    const query =
      "SELECT * FROM table_name ORDER BY text_field offset 0 limit 10"
    const r = parseFirst(query) as SelectFromStatement
    console.log(JSON.stringify(r, null, 2))
  })
})
