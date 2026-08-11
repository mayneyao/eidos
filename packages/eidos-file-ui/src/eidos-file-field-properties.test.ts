// @vitest-environment node

import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"
import { describe, expect, it } from "vitest"

import {
  eidosFileFieldDisplaysUrl,
  eidosFileNumberProperty,
  eidosFileOptionColor,
  eidosFileSelectOptions,
  eidosFileUrlDisplaysImage,
} from "./eidos-file-field-properties"

function field(
  property: Record<string, unknown> | null,
  type: EidosFileFieldInfo["type"] = "select"
): EidosFileFieldInfo {
  return {
    id: "0198c72d-82b5-7000-8000-000000000001",
    tableId: "0198c72d-82b5-7000-8000-000000000010",
    name: "Field",
    type,
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
          options: [{ name: "Todo", color: "blue" }, { name: "Done" }],
        })
      )
    ).toEqual([
      { name: "Todo", value: "Todo", color: "blue" },
      { name: "Done", value: "Done", color: "default" },
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

  it("recognizes only the field-level URL image display setting", () => {
    expect(
      eidosFileUrlDisplaysImage(field({ display: { kind: "image" } }, "url"))
    ).toBe(true)
    expect(
      eidosFileUrlDisplaysImage(field({ display: { kind: "link" } }, "url"))
    ).toBe(false)
    expect(eidosFileUrlDisplaysImage(field({ display: "image" }, "url"))).toBe(
      false
    )
    expect(
      eidosFileUrlDisplaysImage(field({ display: { kind: "image" } }))
    ).toBe(false)
  })

  it("recognizes scalar URL Formula and Lookup presentation", () => {
    expect(
      eidosFileFieldDisplaysUrl(field({ displayType: "url" }, "formula"))
    ).toBe(true)
    expect(
      eidosFileFieldDisplaysUrl(field({ displayType: "url" }, "lookup"))
    ).toBe(true)
    expect(
      eidosFileFieldDisplaysUrl(field({ displayType: "text" }, "formula"))
    ).toBe(false)
  })
})
