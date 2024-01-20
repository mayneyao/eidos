import { FieldType } from "../fields/const"
import { getTransformedQuery } from "./helper"
import { transformQueryWithFormulaFields2Sql } from "./sql-formula-parser"

describe("transformQueryWithFormulaFields2Sql", () => {
  test("should formula transformed to sql function call", () => {
    const fieldNameRawIdMap = {
      title: "cl_xxx1",
      field1: "cl_xxx2",
    }
    const formulaFields = [
      {
        name: "formula1",
        table_name: "table1",
        table_column_name: "cl_xxx3",
        type: FieldType.Formula,
        property: {
          formula: "upper(title) + field1",
        },
      },
    ]
    const expected = getTransformedQuery(
      "SELECT *, (upper(cl_xxx1) + cl_xxx2) as cl_xxx3 from table1"
    )
    const qs = "select * from table1"
    const result = transformQueryWithFormulaFields2Sql(
      qs,
      formulaFields,
      fieldNameRawIdMap
    )
    expect(result).toBe(expected)
  })
})
