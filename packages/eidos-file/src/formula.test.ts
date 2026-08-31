import { describe, expect, it } from "vitest"

import { EidosFileError } from "./errors"
import {
  compileEidosFileFormula,
  compileEidosFileFormulaFields,
  EIDOS_FILE_FORMULA_FUNCTION_NAMES,
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
        'lower ( "Status" )||\'Status\' || "Other"',
        "Status",
        'Current "Status"'
      )
    ).toBe('LOWER("Current ""Status""") || \'Status\' || "Other"')
    expect(
      rewriteEidosFileFormulaFieldReferences(
        'lower ( "Other" )',
        "Status",
        "State"
      )
    ).toBe('lower ( "Other" )')
  })

  it("compiles the SQLite 3.45 text profile without private aliases", () => {
    const title = field("Title", "Title", "text")
    const expression = compileEidosFileFormula(
      formula(
        "Summary",
        "CONCAT(LOWER(\"Title\"), SUBSTR('😀ab', 1, 2))",
        "text"
      ),
      [title]
    ).expression
    expect(expression).toContain("lower(")
    expect(expression).toContain("substr(")
    expect(expression).not.toContain("eidos_formula")
  })

  it("compiles embedded NUL text as UTF-8 bytes rather than SQL source", () => {
    const expression = compileEidosFileFormula(
      formula("NUL", "LENGTH('a\u0000😀')", "integer"),
      []
    ).expression
    expect(expression).toContain("length(")
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

  it("enforces scalar operands and exact result types", () => {
    const tags = field("Tags", "Tags", "multi-select")
    const values = {
      ...field("Values", "Values", "lookup"),
      physicalName: null,
      property: { aggregate: "values", displayType: "text" },
    }
    for (const candidate of [tags, values]) {
      expect(() =>
        compileEidosFileFormula(
          formula("Invalid", `"${candidate.name}" IS NULL`, "checkbox"),
          [candidate]
        )
      ).toThrow(/not a Formula scalar operand/)
    }
    expect(() =>
      compileEidosFileFormula(formula("Wrong", "1", "number"), [])
    ).toThrow(/expected number/)
    expect(() =>
      compileEidosFileFormula(
        formula("Negative", "SUBSTR('abc', 2, -1)", "text"),
        []
      )
    ).not.toThrow()
  })

  it("supports SQLite spelling for formatting, casts, null tests, and CASE", () => {
    const seconds = field("Seconds", "seconds", "integer")
    const duration = compileEidosFileFormula(
      formula(
        "Duration",
        `CASE WHEN "Seconds" IS NULL THEN NULL ELSE FORMAT('%d小时%d分钟', FLOOR("Seconds" / 3600), ROUND(("Seconds" % 3600) / 60)) END`,
        "text"
      ),
      [seconds]
    ).expression
    expect(duration).toContain("CASE WHEN")
    expect(duration).toContain("format(")
    expect(duration).toContain("floor(")

    expect(
      compileEidosFileFormula(
        formula("Casted", "CAST(42 AS TEXT) || ' minutes'", "text"),
        []
      ).expression
    ).toContain("CAST((42) AS TEXT)")

    expect(
      rewriteEidosFileFormulaFieldReferences(
        `case when "Seconds" is not null then cast("Seconds" as text) else 'n/a' end`,
        "Seconds",
        "Reading seconds"
      )
    ).toBe(
      `CASE WHEN "Reading seconds" IS NOT NULL THEN CAST("Reading seconds" AS TEXT) ELSE 'n/a' END`
    )
  })

  it("rejects former Eidos-only function names", () => {
    for (const source of [
      "IF(TRUE, 1, 0)",
      "IS_NULL(NULL)",
      "LOWER_ASCII('A')",
      "DATE_ADD_DAYS('2026-01-01', 1)",
    ]) {
      expect(() =>
        compileEidosFileFormula(formula("Legacy", source, "integer"), [])
      ).toThrow(/Unsupported/)
    }
  })

  it("keeps every published SQLite profile function wired into the compiler", () => {
    const calls: Record<
      (typeof EIDOS_FILE_FORMULA_FUNCTION_NAMES)[number],
      { source: string; type: "text" | "number" | "integer" | "checkbox" }
    > = {
      abs: { source: "ABS(-1)", type: "integer" },
      ceil: { source: "CEIL(1.5)", type: "number" },
      ceiling: { source: "CEILING(1.5)", type: "number" },
      char: { source: "CHAR(65, 66)", type: "text" },
      coalesce: { source: "COALESCE(NULL, 'x')", type: "text" },
      concat: { source: "CONCAT(1, NULL, 'x')", type: "text" },
      concat_ws: { source: "CONCAT_WS('-', 1, NULL, 2)", type: "text" },
      date: { source: "CAST(DATE('2026-01-01') AS TEXT)", type: "text" },
      datetime: {
        source: "CAST(DATETIME('2026-01-01') AS TEXT)",
        type: "text",
      },
      floor: { source: "FLOOR(1.5)", type: "number" },
      format: { source: "FORMAT('%d', 1)", type: "text" },
      glob: { source: "GLOB('a*', 'abc')", type: "checkbox" },
      hex: { source: "HEX('A')", type: "text" },
      ifnull: { source: "IFNULL(NULL, 'x')", type: "text" },
      iif: { source: "IIF(TRUE, 1, 0)", type: "integer" },
      instr: { source: "INSTR('abc', 'b')", type: "integer" },
      julianday: {
        source: "JULIANDAY('2026-01-01')",
        type: "number",
      },
      length: { source: "LENGTH('abc')", type: "integer" },
      like: { source: "LIKE('a%', 'abc')", type: "checkbox" },
      lower: { source: "LOWER('ABC')", type: "text" },
      ltrim: { source: "LTRIM('  x')", type: "text" },
      max: { source: "MAX(1, 2)", type: "integer" },
      min: { source: "MIN(1, 2)", type: "integer" },
      nullif: { source: "NULLIF(1, 2)", type: "integer" },
      octet_length: { source: "OCTET_LENGTH('😀')", type: "integer" },
      printf: { source: "PRINTF('%d', 1)", type: "text" },
      quote: { source: "QUOTE('x')", type: "text" },
      replace: { source: "REPLACE('abc', 'b', 'x')", type: "text" },
      round: { source: "ROUND(1.5)", type: "number" },
      rtrim: { source: "RTRIM('x  ')", type: "text" },
      sign: { source: "SIGN(-1)", type: "integer" },
      strftime: {
        source: "STRFTIME('%Y', '2026-01-01')",
        type: "text",
      },
      substr: { source: "SUBSTR('abc', 1, 2)", type: "text" },
      substring: { source: "SUBSTRING('abc', 1, 2)", type: "text" },
      time: { source: "TIME('2026-01-01T12:00:00Z')", type: "text" },
      timediff: {
        source: "TIMEDIFF('2026-01-02', '2026-01-01')",
        type: "text",
      },
      trim: { source: "TRIM(' x ')", type: "text" },
      typeof: { source: "TYPEOF(1)", type: "text" },
      unicode: { source: "UNICODE('A')", type: "integer" },
      unixepoch: { source: "UNIXEPOCH('2026-01-01')", type: "integer" },
      upper: { source: "UPPER('abc')", type: "text" },
    }
    expect(Object.keys(calls)).toEqual([...EIDOS_FILE_FORMULA_FUNCTION_NAMES])
    for (const [name, call] of Object.entries(calls)) {
      expect(
        compileEidosFileFormula(formula(name, call.source, call.type), [])
          .expression
      ).toContain("(")
    }
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
      "unixepoch('2026-01-01', 'subsec')",
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
