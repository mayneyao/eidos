// @vitest-environment node

import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"
import { describe, expect, it } from "vitest"

import {
  eidosFileNumberProperty,
  eidosFileOptionColor,
  eidosFileSelectOptions,
} from "./eidos-file-field-properties"

function field(property: Record<string, unknown> | null): EidosFileFieldInfo {
  return {
    name: "Field",
    type: "select",
    tableName: "tb_tasks",
    tableColumnName: "field",
    property,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }
}

describe("Eidos File field properties", () => {
  it("normalizes persisted select options", () => {
    expect(
      eidosFileSelectOptions(
        field({
          options: [
            { value: "Todo", color: "blue" },
            { value: "Done" },
            { name: "Invalid" },
          ],
        })
      )
    ).toEqual([
      { value: "Todo", color: "blue" },
      { value: "Done", color: "default" },
    ])
  })

  it("fills safe defaults for incomplete number display metadata", () => {
    expect(
      eidosFileNumberProperty(field({ showAs: "bar", divideBy: -1 }))
    ).toEqual({
      format: "number",
      showAs: "bar",
      color: "purple",
      divideBy: 100,
      showNumber: true,
    })
  })

  it("uses the default swatch for unknown option colors", () => {
    expect(eidosFileOptionColor("missing", "light")).toBe("#cccccc")
  })
})
