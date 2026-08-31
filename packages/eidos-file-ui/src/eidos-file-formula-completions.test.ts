// @vitest-environment node

import {
  EIDOS_FILE_FORMULA_FIELD_FUNCTION_NAMES,
  EIDOS_FILE_FORMULA_FUNCTION_NAMES,
  type EidosFileFieldInfo,
} from "@eidos.space/eidos-file"
import { describe, expect, it } from "vitest"

import { eidosFileFormulaCompletions } from "./eidos-file-formula-completions"

function field(
  name: string,
  columnName: string,
  options: { hidden?: boolean } = {}
): EidosFileFieldInfo {
  return {
    id: `0198c72d-82b5-7000-8000-${columnName.length.toString().padStart(12, "0")}`,
    tableId: "0198c72d-82b5-7000-8000-000000000010",
    name,
    type: "number",
    tableName: "tb_tasks",
    tableColumnName: columnName,
    property: null,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: options.hidden ?? false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }
}

describe("Eidos File formula completions", () => {
  it("uses display names while inserting the supported field syntax", () => {
    const completions = eidosFileFormulaCompletions(
      [
        field("Unit price", "unit_price"),
        field("Total", "total"),
        field("Internal", "internal", { hidden: true }),
      ],
      "total"
    )

    expect(completions.filter((item) => item.kind === "field")).toEqual([
      expect.objectContaining({
        label: "Unit price",
        detail: "unit_price · number",
        insert: '"Unit price"',
      }),
    ])
  })

  it("stays in sync with every formula function accepted by the runtime", () => {
    const functions = eidosFileFormulaCompletions([])
      .filter((item) => item.kind === "function")
      .map((item) => item.label)

    expect(functions).toEqual(
      [
        ...EIDOS_FILE_FORMULA_FIELD_FUNCTION_NAMES,
        ...EIDOS_FILE_FORMULA_FUNCTION_NAMES,
      ].map((name) => name.toUpperCase())
    )
    expect(
      eidosFileFormulaCompletions([]).find((item) => item.label === "SUBSTR")
    ).toMatchObject({ insert: "SUBSTR()", cursorOffset: -1 })
    expect(
      eidosFileFormulaCompletions([])
        .filter((item) => item.kind === "syntax")
        .map((item) => item.label)
    ).toEqual(["CAST", "CASE", "IS NULL", "IS NOT NULL"])
  })
})
