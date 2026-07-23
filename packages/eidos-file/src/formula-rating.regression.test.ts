import { describe, expect, it } from "vitest"

import { compileEidosFileFormulaFields } from "./formula"
import type { EidosFileFieldInfo } from "./types"

const TABLE_ID = "0198c72d-82b5-7968-b163-98be4b7477df"
const RATING_ID = "0198c72d-82b5-7968-b163-98be4b7477e0"
const FORMULA_ID = "0198c72d-82b5-7968-b163-98be4b7477e1"

describe("Formula Rating operand regression", () => {
  it("treats the Rating UI alias as its canonical Integer value", () => {
    const rating: EidosFileFieldInfo = {
      id: RATING_ID,
      tableId: TABLE_ID,
      name: "Confidence",
      type: "rating",
      tableName: "Experiments",
      tableColumnName: "confidence",
      physicalName: "confidence",
      isRecordLabel: false,
      position: 0,
      settings: { display: { kind: "rating" } },
      property: { display: { kind: "rating" } },
      storageCodec: "scalar",
      valueKind: "source",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    }
    const formula: EidosFileFieldInfo = {
      id: FORMULA_ID,
      tableId: TABLE_ID,
      name: "Confidence doubled",
      type: "formula",
      tableName: "Experiments",
      tableColumnName: "confidence_doubled",
      physicalName: null,
      isRecordLabel: false,
      position: 1,
      settings: {},
      property: {
        formula: '"Confidence" * 2',
        displayType: "integer",
      },
      storageCodec: "scalar",
      valueKind: "derived",
      isHidden: false,
      isDerived: true,
      sourceTableColumnName: null,
      dependsOn: null,
    }

    expect(compileEidosFileFormulaFields([rating, formula])).toEqual([
      expect.objectContaining({
        field: expect.objectContaining({ id: FORMULA_ID }),
        dependencyFieldIds: [RATING_ID],
        expression: expect.stringContaining("eidos_formula_int_mul"),
      }),
    ])
  })
})
