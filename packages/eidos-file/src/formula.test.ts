import { describe, expect, it } from "vitest"

import { EidosFileError } from "./errors"
import {
  compileEidosFileFormula,
  compileEidosFileFormulaFields,
  rewriteEidosFileFormulaFieldReferences,
} from "./formula"
import type { EidosFileFieldInfo } from "./types"

const TABLE_ID = "0198c72d-82b5-7968-b163-98be4b7477df"
let nextId = 1

function field(
  name: string,
  physicalName: string,
  type: EidosFileFieldInfo["type"] = "number"
): EidosFileFieldInfo {
  const id = `0198c72d-82b5-7${String(nextId++).padStart(3, "0")}-8163-98be4b7477df`
  return {
    id,
    tableId: TABLE_ID,
    name,
    type,
    tableName: "Orders",
    tableColumnName: physicalName,
    physicalName,
    isRecordLabel: false,
    position: nextId,
    settings: {},
    property: null,
    storageCodec: type === "relation" ? "relation" : "scalar",
    valueKind: type === "relation" ? "relation" : "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }
}

function formula(
  name: string,
  expression: string,
  displayType: "text" | "number" | "integer" | "checkbox" = "number"
): EidosFileFieldInfo {
  const result = field(name, name, "formula")
  return {
    ...result,
    physicalName: null,
    property: { formula: expression, displayType },
    valueKind: "derived",
    isDerived: true,
  }
}

describe("Eidos File 1.0 Formula compiler", () => {
  it("resolves only exact double-quoted current Field names to stable IDs", () => {
    const price = field("Unit price", "Unit price")
    const quantity = field("Quantity", "Quantity")
    const total = formula("Total", '"Unit price" * "Quantity"')
    expect(
      compileEidosFileFormula(total, [price, quantity, total])
    ).toMatchObject({
      dependencies: ["Unit price", "Quantity"],
      dependencyFieldIds: [price.id, quantity.id],
    })
    expect(() =>
      compileEidosFileFormula(formula("Wrong case", '"unit price"'), [price])
    ).toThrow(/exact name/)
    expect(() =>
      compileEidosFileFormula(formula("Bare", "Quantity"), [quantity])
    ).toThrow(/double-quoted/)
  })

  it("orders chained Formula dependencies and reports cycles", () => {
    const price = field("Price", "Price")
    const total = formula("Total", '"Price" * 2')
    const taxed = formula("Taxed", '"Total" * 1.2')
    expect(
      compileEidosFileFormulaFields([price, taxed, total]).map(
        (compiled) => compiled.field.name
      )
    ).toEqual(["Total", "Taxed"])

    const circularTotal = {
      ...total,
      property: { formula: '"Taxed"', displayType: "number" },
    }
    expect(() => compileEidosFileFormulaFields([circularTotal, taxed])).toThrow(
      /Circular Eidos File Formula dependency/
    )
  })

  it("renames parsed references and emits the standard serializer", () => {
    expect(
      rewriteEidosFileFormulaFieldReferences(
        'lower_ascii ( "Status" )&\'Status\' & "Other"',
        "Status",
        'Current "Status"'
      )
    ).toBe('LOWER_ASCII("Current ""Status""") & \'Status\' & "Other"')
    expect(
      rewriteEidosFileFormulaFieldReferences(
        'lower_ascii ( "Other" )',
        "Status",
        "State"
      )
    ).toBe('lower_ascii ( "Other" )')
  })

  it("compiles only the deterministic 1.0 text functions", () => {
    const title = field("Title", "Title", "text")
    const expression = compileEidosFileFormula(
      formula(
        "Summary",
        "CONCAT(LOWER_ASCII(\"Title\"), SUBSTR('😀ab', 1, 2))",
        "text"
      ),
      [title]
    ).expression
    expect(expression).toContain("eidos_formula_lower_ascii")
    expect(expression).toContain("eidos_formula_substr3")
    expect(expression).not.toContain("LOWER_ASCII")
  })

  it("compiles embedded NUL text as UTF-8 bytes rather than SQL source", () => {
    const expression = compileEidosFileFormula(
      formula("NUL", "LENGTH('a\u0000😀')", "integer"),
      []
    ).expression
    expect(expression).toContain("eidos_formula_length")
    expect(expression).toContain("CAST(X'6100f09f9880' AS TEXT)")
    expect(expression).not.toContain("\u0000")
    expect(() =>
      compileEidosFileFormula(formula("Comment text", "'-- ; /*'", "text"), [])
    ).not.toThrow()
    expect(() =>
      compileEidosFileFormula(
        formula("Invalid Unicode", "'\ud800'", "text"),
        []
      )
    ).toThrow(/unpaired surrogate/)
  })

  it("enforces scalar operands, exact result types, and SUBSTR's literal rule", () => {
    const tags = field("Tags", "Tags", "multi-select")
    const values = {
      ...field("Values", "Values", "lookup"),
      physicalName: null,
      property: { aggregate: "values", displayType: "text" },
    }
    for (const candidate of [tags, values]) {
      expect(() =>
        compileEidosFileFormula(
          formula("Invalid", `IS_NULL("${candidate.name}")`, "checkbox"),
          [candidate]
        )
      ).toThrow(/not a Formula scalar operand/)
    }
    expect(() =>
      compileEidosFileFormula(formula("Wrong", "1", "number"), [])
    ).toThrow(/expected number/)
    expect(() =>
      compileEidosFileFormula(
        formula("Negative", "SUBSTR('a', 0, -1)", "text"),
        []
      )
    ).toThrow(/literal length cannot be negative/)
    expect(() =>
      compileEidosFileFormula(
        formula("Dynamic", "SUBSTR('a', 0, 0 - 1)", "text"),
        []
      )
    ).not.toThrow()
  })

  it("rejects statements, comments, subqueries, nondeterminism, and limits", () => {
    const title = field("Title", "Title", "text")
    for (const source of [
      '"Title"; DELETE',
      '"Title" -- comment',
      '(SELECT "Title")',
      "random()",
      "datetime()",
      "date('now')",
      "datetime('2026-01-01', 'localtime')",
      "list_count('x')",
      "\"Title\" LIKE 'x%'",
      "NOT NOT TRUE",
      "+-1",
      "1 = 1 = TRUE",
    ]) {
      expect(() =>
        compileEidosFileFormula(formula("Unsafe", source), [title])
      ).toThrow(EidosFileError)
    }
    expect(() =>
      compileEidosFileFormula(formula("Long", `'${"x".repeat(4097)}'`), [title])
    ).toThrow(/too long/)
  })
})
