import { describe, expect, it } from "vitest"

import { BaseError } from "./errors"
import { compileBaseFormula, compileBaseFormulaFields } from "./formula"
import type { BaseFieldInfo } from "./types"

function field(
  name: string,
  columnName: string,
  type: BaseFieldInfo["type"] = "number"
): BaseFieldInfo {
  return {
    name,
    type,
    tableName: "tb_orders",
    tableColumnName: columnName,
    property: null,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }
}

function formula(
  name: string,
  columnName: string,
  expression: string
): BaseFieldInfo {
  return {
    ...field(name, columnName, "formula"),
    property: { formula: expression, displayType: "number" },
    valueKind: "derived",
    isDerived: true,
  }
}

describe("Base formula compiler", () => {
  it("resolves raw columns and prop() display-name references", () => {
    const price = field("Unit price", "unit_price")
    const quantity = field("Quantity", "quantity")
    const total = formula("Total", "total", 'prop("Unit price") * quantity')
    expect(compileBaseFormula(total, [price, quantity, total])).toMatchObject({
      dependencies: ["unit_price", "quantity"],
    })
  })

  it("orders chained formulas and rejects circular dependencies", () => {
    const price = field("Price", "price")
    const total = formula("Total", "total", "price * 2")
    const taxed = formula("Taxed", "taxed", "total * 1.2")
    expect(
      compileBaseFormulaFields([price, taxed, total]).map(
        (compiled) => compiled.field.tableColumnName
      )
    ).toEqual(["total", "taxed"])

    const circularTotal = formula("Total", "total", "taxed")
    expect(() =>
      compileBaseFormulaFields([price, circularTotal, taxed])
    ).toThrow(/Circular Base formula dependency/)
  })

  it("rejects statements, comments, and unknown fields", () => {
    const total = formula("Total", "total", "missing + 1")
    expect(() => compileBaseFormula(total, [total])).toThrow(BaseError)
    expect(() =>
      compileBaseFormula(formula("Unsafe", "unsafe", "title; DELETE"), [
        field("Title", "title", "title"),
      ])
    ).toThrow(/statements or comments/)
  })

  it("recompiles cached expressions and rejects unbounded SQL features", () => {
    const title = field("Title", "title", "title")
    const safe = {
      ...formula("Safe", "safe", "upper(title)"),
      property: {
        formula: "upper(title)",
        displayType: "text",
        expression: "randomblob(1000000000)",
      },
      dependsOn: ["missing"],
    }
    expect(compileBaseFormula(safe, [title, safe])).toMatchObject({
      expression: expect.stringMatching(/upper/i),
      dependencies: ["title"],
    })

    expect(() =>
      compileBaseFormula(formula("Unsafe", "unsafe", "randomblob(100)"), [
        title,
      ])
    ).toThrow(/Unsupported Base formula function/)
    expect(() =>
      compileBaseFormula(
        formula("Nested", "nested", "(SELECT title FROM tb_tasks)"),
        [title]
      )
    ).toThrow(/nested queries/)
  })
})
