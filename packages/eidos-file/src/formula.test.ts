import { describe, expect, it } from "vitest"

import { EidosFileError } from "./errors"
import {
  compileEidosFileFormula,
  compileEidosFileFormulaFields,
} from "./formula"
import type { EidosFileFieldInfo } from "./types"

function field(
  name: string,
  columnName: string,
  type: EidosFileFieldInfo["type"] = "number"
): EidosFileFieldInfo {
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
): EidosFileFieldInfo {
  return {
    ...field(name, columnName, "formula"),
    property: { formula: expression, displayType: "number" },
    valueKind: "derived",
    isDerived: true,
  }
}

describe("Eidos File formula compiler", () => {
  it("resolves raw columns and prop() display-name references", () => {
    const price = field("Unit price", "unit_price")
    const quantity = field("Quantity", "quantity")
    const total = formula("Total", "total", 'prop("Unit price") * quantity')
    expect(
      compileEidosFileFormula(total, [price, quantity, total])
    ).toMatchObject({
      dependencies: ["unit_price", "quantity"],
    })
  })

  it("orders chained formulas and rejects circular dependencies", () => {
    const price = field("Price", "price")
    const total = formula("Total", "total", "price * 2")
    const taxed = formula("Taxed", "taxed", "total * 1.2")
    expect(
      compileEidosFileFormulaFields([price, taxed, total]).map(
        (compiled) => compiled.field.tableColumnName
      )
    ).toEqual(["total", "taxed"])

    const circularTotal = formula("Total", "total", "taxed")
    expect(() =>
      compileEidosFileFormulaFields([price, circularTotal, taxed])
    ).toThrow(/Circular Eidos File formula dependency/)
  })

  it("rejects statements, comments, and unknown fields", () => {
    const total = formula("Total", "total", "missing + 1")
    expect(() => compileEidosFileFormula(total, [total])).toThrow(
      EidosFileError
    )
    expect(() =>
      compileEidosFileFormula(formula("Unsafe", "unsafe", "title; DELETE"), [
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
    expect(compileEidosFileFormula(safe, [title, safe])).toMatchObject({
      expression: expect.stringMatching(/upper/i),
      dependencies: ["title"],
    })

    expect(() =>
      compileEidosFileFormula(formula("Unsafe", "unsafe", "randomblob(100)"), [
        title,
      ])
    ).toThrow(/Unsupported Eidos File formula function/)
    expect(() =>
      compileEidosFileFormula(
        formula("Nested", "nested", "(SELECT title FROM tb_tasks)"),
        [title]
      )
    ).toThrow(/nested queries/)
  })
})
