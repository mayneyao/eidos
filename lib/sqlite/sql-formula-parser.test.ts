import { FieldType } from "../fields/const"
import { getTransformedQuery } from "./helper"
import {
  transformFormula2VirtualGeneratedField,
  transformQueryWithFormulaFields2Sql,
} from "./sql-formula-parser"

describe("transformQueryWithFormulaFields2Sql", () => {
  test("should formula transformed to sql function call", () => {
    const fields = [
      {
        name: "formula1",
        table_name: "table1",
        table_column_name: "cl_xxx3",
        type: FieldType.Formula,
        property: {
          formula: "upper(title) + field1",
        },
      },
      {
        name: "title",
        table_name: "table1",
        table_column_name: "cl_xxx1",
        type: FieldType.Title,
        property: {},
      },
      {
        name: "field1",
        table_name: "table1",
        table_column_name: "cl_xxx2",
        type: FieldType.Text,
        property: {},
      },
    ]
    const expected = getTransformedQuery(
      "SELECT *, (upper(cl_xxx1) + cl_xxx2) as cl_xxx3 from table1"
    )
    const qs = "select * from table1"
    const result = transformQueryWithFormulaFields2Sql(qs, fields)
    expect(result).toBe(qs)
  })

  test("should formula transformed to sql function call", () => {
    const fields = [
      {
        name: "formula1",
        table_name: "table1",
        table_column_name: "cl_xxx3",
        type: FieldType.Formula,
        property: {
          formula: "upper(title) + field1",
        },
      },
      {
        name: "title",
        table_name: "table1",
        table_column_name: "cl_xxx1",
        type: FieldType.Title,
        property: {},
      },
      {
        name: "field1",
        table_name: "table1",
        table_column_name: "cl_xxx2",
        type: FieldType.Text,
        property: {},
      },
    ]

    const res = transformFormula2VirtualGeneratedField("cl_xxx3", fields)
    expect(res).toEqual("((upper (cl_xxx1) ) + cl_xxx2)")
  })
})
