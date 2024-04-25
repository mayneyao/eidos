import { getTransformedQuery } from "./helper"
import { rewriteQuery2getSortedRowIds } from "./sql-sort-parser"

describe("rewriteQuery2getSortedRowIds", () => {
  test("should rewrite query to get sorted row IDs", () => {
    const query = "SELECT * FROM table_name"
    const expected = "SELECT _id FROM table_name ORDER BY rowid ASC"
    const result = rewriteQuery2getSortedRowIds(query)
    expect(result).toBe(getTransformedQuery(expected))
  })
})
