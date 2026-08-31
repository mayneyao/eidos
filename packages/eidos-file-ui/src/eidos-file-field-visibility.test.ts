// @vitest-environment node

import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"
import { describe, expect, it } from "vitest"

import {
  isEidosFileFieldWritable,
  isEidosFileRecordLabelEligible,
} from "./eidos-file-field-visibility"

function field(
  type: EidosFileFieldInfo["type"],
  overrides: Partial<EidosFileFieldInfo> = {}
): EidosFileFieldInfo {
  return {
    id: `field-${type}`,
    tableId: "table-tasks",
    name: type,
    type,
    tableName: "tasks",
    tableColumnName: type,
    property: null,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: type,
    dependsOn: null,
    ...overrides,
  }
}

describe("Eidos File field capabilities", () => {
  it("uses Runtime writability and safely handles legacy relation descriptors", () => {
    expect(isEidosFileFieldWritable(field("text", { writable: false }))).toBe(
      false
    )
    expect(isEidosFileFieldWritable(field("text", { writable: true }))).toBe(
      true
    )
    expect(
      isEidosFileFieldWritable(
        field("relation", {
          valueKind: "relation",
          property: { direction: "inverse" },
        })
      )
    ).toBe(false)
    expect(
      isEidosFileFieldWritable(
        field("relation", {
          valueKind: "relation",
          property: { direction: "forward" },
        })
      )
    ).toBe(true)
    expect(
      isEidosFileFieldWritable(
        field("formula", { valueKind: "derived", isDerived: true })
      )
    ).toBe(false)
  })

  it("offers only scalar Fields and eligible Formula results as Record Labels", () => {
    for (const type of [
      "text",
      "number",
      "integer",
      "checkbox",
      "date",
      "datetime",
      "url",
      "rating",
      "select",
      "row-id",
      "created-time",
      "last-edited-time",
    ] as const) {
      expect(isEidosFileRecordLabelEligible(field(type))).toBe(true)
    }

    for (const type of [
      "file",
      "multi-select",
      "relation",
      "lookup",
    ] as const) {
      expect(isEidosFileRecordLabelEligible(field(type))).toBe(false)
    }

    expect(
      isEidosFileRecordLabelEligible(
        field("formula", {
          valueKind: "derived",
          isDerived: true,
          property: { displayType: "text" },
        })
      )
    ).toBe(true)
    expect(
      isEidosFileRecordLabelEligible(
        field("formula", {
          valueKind: "derived",
          isDerived: true,
          property: { displayType: "json" },
        })
      )
    ).toBe(false)
  })
})
