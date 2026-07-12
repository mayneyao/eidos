// @vitest-environment node

import type { BaseFieldInfo } from "@eidos.space/base"
import { GridCellKind } from "@glideapps/glide-data-grid"
import { describe, expect, it } from "vitest"

import {
  baseSelectOptions,
  baseValueToGridCell,
  gridCellToBaseValue,
  visibleBaseFields,
} from "./base-grid-adapter"

function field(
  type: BaseFieldInfo["type"],
  property: Record<string, unknown> | null = null
): BaseFieldInfo {
  return {
    name: type,
    type,
    tableName: "tb_tasks",
    tableColumnName: type,
    property,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }
}

describe("Base Grid adapter", () => {
  it("maps Base scalar fields to editable Glide cells", () => {
    expect(baseValueToGridCell(field("checkbox"), 1)).toMatchObject({
      kind: GridCellKind.Boolean,
      data: true,
    })
    expect(baseValueToGridCell(field("number"), 42)).toMatchObject({
      kind: GridCellKind.Number,
      data: 42,
    })
    expect(baseValueToGridCell(field("text"), "hello")).toMatchObject({
      kind: GridCellKind.Text,
      data: "hello",
    })
  })

  it("reuses select options while supplying the legacy default color", () => {
    const select = field("select", {
      options: [
        { id: "todo", name: "Todo" },
        { id: "done", name: "Done", color: "green" },
      ],
    })

    expect(baseSelectOptions(select)).toEqual([
      { id: "todo", name: "Todo", color: "default" },
      { id: "done", name: "Done", color: "green" },
    ])
    expect(baseValueToGridCell(select, "done")).toMatchObject({
      kind: GridCellKind.Custom,
      data: { kind: "select-cell", value: "done" },
    })
  })

  it("normalizes edited cells to SQLite-compatible values", () => {
    expect(
      gridCellToBaseValue(field("checkbox"), {
        kind: GridCellKind.Boolean,
        allowOverlay: false,
        data: true,
      })
    ).toBe(1)
    expect(
      gridCellToBaseValue(field("text"), {
        kind: GridCellKind.Text,
        allowOverlay: true,
        data: "",
        displayData: "",
      })
    ).toBeNull()
  })

  it("reuses the rich date and rating cells from the existing table", () => {
    expect(baseValueToGridCell(field("rating"), 4)).toMatchObject({
      kind: GridCellKind.Custom,
      data: { kind: "rating-cell", rating: 4 },
    })
    expect(baseValueToGridCell(field("date"), "2026-07-12")).toMatchObject({
      kind: GridCellKind.Custom,
      data: { kind: "date-picker-cell", format: "date" },
    })
  })

  it("applies per-view field visibility without changing Base schema", () => {
    expect(
      visibleBaseFields([field("text"), field("number")], ["number"]).map(
        (candidate) => candidate.tableColumnName
      )
    ).toEqual(["text"])
  })
})
