import type { EidosFileFieldInfo } from "./types"
import { encodeEidosFileAttachmentPaths } from "./file-values"
import {
  eidosFileFieldConversionMayRequireLossyConfirmation,
  planEidosFileFieldConversion,
} from "./field-conversion"

function field(
  type: EidosFileFieldInfo["type"],
  property: Record<string, unknown> | null = null
): EidosFileFieldInfo {
  return {
    id: "0198c72d-82b5-7000-8000-000000000001",
    tableId: "0198c72d-82b5-7000-8000-000000000002",
    name: "Value",
    type,
    tableName: "tb_tasks",
    tableColumnName: "value",
    physicalName: "value",
    isRecordLabel: false,
    position: 0,
    settings: {},
    property,
    storageCodec:
      type === "file" || type === "multi-select" ? "json_array" : "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }
}

describe("Eidos File field conversion", () => {
  it("marks every editor route that can use a lossy default policy", () => {
    expect(
      [
        ["multi-select", "select"],
        ["datetime", "date"],
        ["number", "checkbox"],
        ["number", "rating"],
        ["rating", "checkbox"],
        ["rating", "number"],
      ].every(([from, to]) =>
        eidosFileFieldConversionMayRequireLossyConfirmation(
          from as EidosFileFieldInfo["type"],
          to as EidosFileFieldInfo["type"]
        )
      )
    ).toBe(true)
    expect(
      eidosFileFieldConversionMayRequireLossyConfirmation("text", "select")
    ).toBe(false)
    expect(
      eidosFileFieldConversionMayRequireLossyConfirmation("date", "datetime")
    ).toBe(false)
  })

  it("normalizes numeric, checkbox, and rating values", () => {
    const rows = [
      { id: "a", value: "12.5" },
      { id: "b", value: "no" },
      { id: "c", value: null },
    ]
    expect(
      planEidosFileFieldConversion(field("text"), rows, "number").values
    ).toEqual([
      { id: "a", value: 12.5 },
      { id: "b", value: null },
      { id: "c", value: null },
    ])
    expect(
      planEidosFileFieldConversion(field("text"), rows, "checkbox").values
    ).toEqual([
      { id: "a", value: 1 },
      { id: "b", value: 0 },
      { id: "c", value: null },
    ])
    expect(
      planEidosFileFieldConversion(
        field("number"),
        [{ id: "a", value: 9 }],
        "rating"
      ).values
    ).toEqual([{ id: "a", value: 5 }])
  })

  it("derives stable select options from existing display values", () => {
    const source = field("select", {
      options: [{ name: "Todo", color: "red" }],
    })
    const plan = planEidosFileFieldConversion(
      source,
      [
        { id: "a", value: "Todo" },
        { id: "b", value: "done" },
      ],
      "multi-select"
    )
    expect(plan.property).toMatchObject({
      options: [
        { name: "Todo", color: "red" },
        { name: "done", color: "brown" },
      ],
    })
    expect(plan.values).toEqual([
      { id: "a", value: '["Todo"]' },
      { id: "b", value: '["done"]' },
    ])
  })

  it("converts file arrays into readable text", () => {
    expect(
      planEidosFileFieldConversion(
        field("file"),
        [
          {
            id: "a",
            value: encodeEidosFileAttachmentPaths([
              "assets/a.pdf",
              "assets/b.png",
            ]),
          },
        ],
        "text"
      ).values
    ).toEqual([{ id: "a", value: "assets/a.pdf, assets/b.png" }])
  })

  it("normalizes date and datetime conversions to canonical TEXT", () => {
    expect(
      planEidosFileFieldConversion(
        field("text"),
        [{ id: "a", value: "2026-07-20" }],
        "date"
      ).values
    ).toEqual([{ id: "a", value: "2026-07-20" }])
    expect(
      planEidosFileFieldConversion(
        field("text"),
        [{ id: "a", value: "2026-07-20T18:00:00+08:00" }],
        "datetime"
      ).values
    ).toEqual([{ id: "a", value: "2026-07-20T10:00:00.000Z" }])
    expect(() =>
      planEidosFileFieldConversion(
        field("text"),
        [{ id: "a", value: "2026-02-30" }],
        "date"
      )
    ).toThrow(/canonical YYYY-MM-DD/)
  })
})
