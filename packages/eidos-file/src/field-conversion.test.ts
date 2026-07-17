import type { EidosFileFieldInfo } from "./types"
import { planEidosFileFieldConversion } from "./field-conversion"

function field(
  type: EidosFileFieldInfo["type"],
  property: Record<string, unknown> | null = null
): EidosFileFieldInfo {
  return {
    name: "Value",
    type,
    tableName: "tb_tasks",
    tableColumnName: "value",
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
      options: [{ value: "Todo", color: "red" }],
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
      options: [{ value: "Todo", color: "red" }, { value: "done" }],
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
        [{ id: "a", value: '["assets/a.pdf","assets/b.png"]' }],
        "text"
      ).values
    ).toEqual([{ id: "a", value: "assets/a.pdf, assets/b.png" }])
  })
})
