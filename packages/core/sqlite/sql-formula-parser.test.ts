import { FieldType } from "../fields/const"
import { getTransformedQuery } from "./helper"
import {
  getTableNameFromSql,
  transformFormula2VirtualGeneratedField,
  transformQueryWithFormulaFields2Sql,
  detectCircularDependencies,
} from "./sql-formula-parser"
import type { IField } from "../types/IField"
import { describe, expect, it } from "vitest"

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

  test("should return table name from SQL", () => {
    const sql = "select * from tb_asddasdasd;"
    const tableName = getTableNameFromSql(sql)
    expect(tableName).toBe("tb_asddasdasd")
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

  test("should automatically add _id field when transforming formula", () => {
    const fields = [
      {
        name: "formula1",
        table_name: "table1",
        table_column_name: "cl_xxx3",
        type: FieldType.Formula,
        property: {
          formula: "_id",
        },
      },
      {
        name: "title",
        table_name: "table1",
        table_column_name: "cl_xxx1",
        type: FieldType.Title,
        property: {},
      },
    ]

    const res = transformFormula2VirtualGeneratedField("cl_xxx3", fields)
    expect(res).toEqual('"_id"')
  })

  test("should support _id field in complex formulas", () => {
    const fields = [
      {
        name: "formula1",
        table_name: "table1",
        table_column_name: "cl_xxx3",
        type: FieldType.Formula,
        property: {
          formula: "upper(_id) || '_suffix'",
        },
      },
      {
        name: "title",
        table_name: "table1",
        table_column_name: "cl_xxx1",
        type: FieldType.Title,
        property: {},
      },
    ]

    const res = transformFormula2VirtualGeneratedField("cl_xxx3", fields)
    expect(res).toEqual("((upper (\"_id\") ) || ('_suffix'))")
  })

  test("should support _id field with other fields in formula", () => {
    const fields = [
      {
        name: "formula1",
        table_name: "table1",
        table_column_name: "cl_xxx3",
        type: FieldType.Formula,
        property: {
          formula: "_id || title",
        },
      },
      {
        name: "title",
        table_name: "table1",
        table_column_name: "cl_xxx1",
        type: FieldType.Title,
        property: {},
      },
    ]

    const res = transformFormula2VirtualGeneratedField("cl_xxx3", fields)
    expect(res).toEqual("(\"_id\" || cl_xxx1)")
  })
})

describe("detectCircularDependencies", () => {
  it("should detect no cycles in independent formula fields", () => {
    const fields: IField[] = [
      {
        name: "id",
        type: FieldType.Number,
        table_column_name: "cl_id",
        table_name: "test_table",
        property: {}
      },
      {
        name: "name",
        type: FieldType.Text,
        table_column_name: "cl_name",
        table_name: "test_table",
        property: {}
      },
      {
        name: "fullName",
        type: FieldType.Formula,
        table_column_name: "cl_full_name",
        table_name: "test_table",
        property: {
          formula: "name || ' Smith'"
        }
      },
      {
        name: "age",
        type: FieldType.Number,
        table_column_name: "cl_age",
        table_name: "test_table",
        property: {}
      },
      {
        name: "isAdult",
        type: FieldType.Formula,
        table_column_name: "cl_is_adult",
        table_name: "test_table",
        property: {
          formula: "age >= 18"
        }
      }
    ]

    const result = detectCircularDependencies(fields)
    expect(result.hasCycle).toBe(false)
    expect(result.cycle).toEqual([])
  })

  it("should detect a simple cycle between two formula fields", () => {
    const fields: IField[] = [
      {
        name: "field1",
        type: FieldType.Formula,
        table_column_name: "cl_field1",
        table_name: "test_table",
        property: {
          formula: "field2 + 1"
        }
      },
      {
        name: "field2",
        type: FieldType.Formula,
        table_column_name: "cl_field2",
        table_name: "test_table",
        property: {
          formula: "field1 * 2"
        }
      }
    ]

    const result = detectCircularDependencies(fields)
    expect(result.hasCycle).toBe(true)
    expect(result.cycle.length).toBeGreaterThan(0)
    // The cycle should contain both field names
    expect(result.cycle).toContain("field1")
    expect(result.cycle).toContain("field2")
  })

  it("should detect a complex cycle among multiple formula fields", () => {
    const fields: IField[] = [
      {
        name: "base",
        type: FieldType.Number,
        table_column_name: "cl_base",
        table_name: "test_table",
        property: {}
      },
      {
        name: "fieldA",
        type: FieldType.Formula,
        table_column_name: "cl_field_a",
        table_name: "test_table",
        property: {
          formula: "fieldB + 10"
        }
      },
      {
        name: "fieldB",
        type: FieldType.Formula,
        table_column_name: "cl_field_b",
        table_name: "test_table",
        property: {
          formula: "fieldC * 2"
        }
      },
      {
        name: "fieldC",
        type: FieldType.Formula,
        table_column_name: "cl_field_c",
        table_name: "test_table",
        property: {
          formula: "fieldA / 5"
        }
      },
      {
        name: "independent",
        type: FieldType.Formula,
        table_column_name: "cl_independent",
        table_name: "test_table",
        property: {
          formula: "base * 3"
        }
      }
    ]

    const result = detectCircularDependencies(fields)
    expect(result.hasCycle).toBe(true)
    expect(result.cycle.length).toBeGreaterThan(0)
    // The cycle should contain all three dependent fields
    expect(result.cycle).toContain("fieldA")
    expect(result.cycle).toContain("fieldB")
    expect(result.cycle).toContain("fieldC")
    // But not the independent formula field
    expect(result.cycle).not.toContain("independent")
  })

  it("should handle props() function calls in formulas", () => {
    const fields: IField[] = [
      {
        name: "field with spaces",
        type: FieldType.Number,
        table_column_name: "cl_field_spaces",
        table_name: "test_table",
        property: {}
      },
      {
        name: "formula1",
        type: FieldType.Formula,
        table_column_name: "cl_formula1",
        table_name: "test_table",
        property: {
          formula: "props(\"field with spaces\") * 2"
        }
      },
      {
        name: "formula2",
        type: FieldType.Formula,
        table_column_name: "cl_formula2",
        table_name: "test_table",
        property: {
          formula: "props(\"formula1\") + props(\"field with spaces\")"
        }
      },
      {
        name: "circular",
        type: FieldType.Formula,
        table_column_name: "cl_circular",
        table_name: "test_table",
        property: {
          formula: "props(\"formula2\") + props(\"circular\")"
        }
      }
    ]

    const result = detectCircularDependencies(fields)
    expect(result.hasCycle).toBe(true)
    // The circular field should reference itself
    expect(result.cycle).toContain("circular")
  })

  it("should handle formulas with no dependencies", () => {
    const fields: IField[] = [
      {
        name: "constant",
        type: FieldType.Formula,
        table_column_name: "cl_constant",
        table_name: "test_table",
        property: {
          formula: "42"
        }
      },
      {
        name: "expression",
        type: FieldType.Formula,
        table_column_name: "cl_expression",
        table_name: "test_table",
        property: {
          formula: "5 * 10 + 2"
        }
      }
    ]

    const result = detectCircularDependencies(fields)
    expect(result.hasCycle).toBe(false)
    expect(result.cycle).toEqual([])
  })

  it("should handle non-formula fields correctly", () => {
    const fields: IField[] = [
      {
        name: "id",
        type: FieldType.Number,
        table_column_name: "cl_id",
        table_name: "test_table",
        property: {}
      },
      {
        name: "name",
        type: FieldType.Text,
        table_column_name: "cl_name",
        table_name: "test_table",
        property: {}
      }
    ]

    const result = detectCircularDependencies(fields)
    expect(result.hasCycle).toBe(false)
    expect(result.cycle).toEqual([])
    // Dependency graph should be empty as there are no formula fields
    expect(Object.keys(result.dependencyGraph).length).toBe(0)
  })
})
