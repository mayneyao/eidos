import { describe, expect, it } from "vitest"

import {
  compileEidosFileColumnStatExpression,
  eidosFileColumnStatTypesForField,
} from "./column-stats"
import type { EidosFileFieldInfo } from "./types"

function field(type: EidosFileFieldInfo["type"]): EidosFileFieldInfo {
  return {
    id: "018f0000-0000-7000-8000-000000000001",
    tableId: "018f0000-0000-7000-8000-000000000002",
    name: "Value",
    type,
    tableName: "Items",
    tableColumnName: "Value",
    nullable: true,
    writable: true,
    property: null,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: "Value",
    dependsOn: null,
  }
}

describe("Eidos File column statistics", () => {
  it("offers numeric statistics for Integer fields without casting sums to REAL", () => {
    const integer = field("integer")
    expect(eidosFileColumnStatTypesForField(integer)).toEqual(
      expect.arrayContaining(["sum", "average", "min", "max"])
    )
    expect(compileEidosFileColumnStatExpression(integer, "sum")).not.toContain(
      "REAL"
    )
    expect(
      compileEidosFileColumnStatExpression(field("number"), "sum")
    ).toContain("REAL")
  })
})
