// @vitest-environment node

import type { BaseFieldInfo } from "@eidos.space/base"
import { describe, expect, it } from "vitest"

import {
  baseNumberProperty,
  baseOptionColor,
  baseSelectOptions,
} from "./base-field-properties"

function field(property: Record<string, unknown> | null): BaseFieldInfo {
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

describe("Base field properties", () => {
  it("normalizes persisted select options", () => {
    expect(
      baseSelectOptions(
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
    expect(baseNumberProperty(field({ showAs: "bar", divideBy: -1 }))).toEqual({
      format: "number",
      showAs: "bar",
      color: "purple",
      divideBy: 100,
      showNumber: true,
    })
  })

  it("uses the default swatch for unknown option colors", () => {
    expect(baseOptionColor("missing", "light")).toBe("#cccccc")
  })
})
