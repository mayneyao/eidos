// @vitest-environment node

import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"
import { GridCellKind } from "@glideapps/glide-data-grid"
import { describe, expect, it } from "vitest"

import {
  eidosFileValueToGridCell,
  gridCellToEidosFileValue,
  visibleEidosFileFields,
} from "./eidos-file-grid-adapter"
import { eidosFileSelectOptions } from "./eidos-file-field-properties"

function field(
  type: EidosFileFieldInfo["type"],
  property: Record<string, unknown> | null = null
): EidosFileFieldInfo {
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

describe("Eidos File Grid adapter", () => {
  it("maps Eidos File scalar fields to editable Glide cells", () => {
    expect(eidosFileValueToGridCell(field("checkbox"), 1)).toMatchObject({
      kind: GridCellKind.Boolean,
      data: true,
    })
    expect(eidosFileValueToGridCell(field("number"), 42)).toMatchObject({
      kind: GridCellKind.Number,
      data: 42,
    })
    expect(eidosFileValueToGridCell(field("text"), "hello")).toMatchObject({
      kind: GridCellKind.Text,
      data: "hello",
    })
    expect(
      eidosFileValueToGridCell(
        {
          ...field("title"),
          tableColumnName: "title",
          valueKind: "system",
        },
        "Editable title"
      )
    ).toMatchObject({
      kind: GridCellKind.Text,
      readonly: false,
      data: "Editable title",
    })
  })

  it("applies persisted number formatting and bar presentation", () => {
    expect(
      eidosFileValueToGridCell(field("number", { format: "percent" }), 0.25)
    ).toMatchObject({
      kind: GridCellKind.Number,
      data: 0.25,
      displayData: "25%",
    })
    const bar = eidosFileValueToGridCell(
      field("number", {
        format: "number",
        showAs: "bar",
        divideBy: 20,
        color: "green",
        showNumber: true,
      }),
      12
    )
    expect(bar).toMatchObject({
      kind: GridCellKind.Custom,
      data: {
        kind: "range-cell",
        value: 12,
        max: 20,
        color: "green",
        label: "12",
      },
    })
    if (bar.kind !== GridCellKind.Custom) {
      throw new Error("Expected a range cell")
    }
    expect(gridCellToEidosFileValue(field("number"), bar)).toBe(12)
  })

  it("adapts direct select values to the shared Grid cell shape", () => {
    const select = field("select", {
      options: [{ value: "Todo" }, { value: "Done", color: "green" }],
    })

    expect(eidosFileSelectOptions(select)).toEqual([
      { value: "Todo", color: "default" },
      { value: "Done", color: "green" },
    ])
    expect(eidosFileValueToGridCell(select, "Done")).toMatchObject({
      kind: GridCellKind.Custom,
      data: {
        kind: "select-cell",
        value: "Done",
        allowCreate: false,
        allowedValues: [
          { id: "Todo", name: "Todo", color: "default" },
          { id: "Done", name: "Done", color: "green" },
        ],
      },
    })
  })

  it("normalizes edited cells to SQLite-compatible values", () => {
    expect(
      gridCellToEidosFileValue(field("checkbox"), {
        kind: GridCellKind.Boolean,
        allowOverlay: false,
        data: true,
      })
    ).toBe(1)
    expect(
      gridCellToEidosFileValue(field("text"), {
        kind: GridCellKind.Text,
        allowOverlay: true,
        data: "",
        displayData: "",
      })
    ).toBeNull()
  })

  it("reuses the rich date and rating cells from the existing table", () => {
    expect(eidosFileValueToGridCell(field("rating"), 4)).toMatchObject({
      kind: GridCellKind.Custom,
      data: { kind: "rating-cell", rating: 4 },
    })
    expect(eidosFileValueToGridCell(field("date"), "2026-07-12")).toMatchObject(
      {
        kind: GridCellKind.Custom,
        data: { kind: "date-picker-cell", format: "date" },
      }
    )
  })

  it("maps file fields to portable multi-attachment cells", () => {
    expect(
      eidosFileValueToGridCell(
        { ...field("file"), storageCodec: "json_array" },
        '["assets/cover.png","assets/report, final.pdf"]'
      )
    ).toMatchObject({
      kind: GridCellKind.Custom,
      data: {
        kind: "eidos-file-file-cell",
        paths: ["assets/cover.png", "assets/report, final.pdf"],
      },
    })
    expect(
      gridCellToEidosFileValue(field("file"), {
        kind: GridCellKind.Custom,
        allowOverlay: true,
        copyData: "",
        data: {
          kind: "eidos-file-file-cell",
          paths: ["/assets/cover.png", "assets/report, final.pdf"],
          displayData: [],
        },
      })
    ).toBe('["assets/cover.png","assets/report, final.pdf"]')
  })

  it("maps relation IDs to hydrated record titles and back", () => {
    const relation = {
      ...field("link", {
        targetTableId: "people",
        targetField: "title",
        multiple: true,
      }),
      tableColumnName: "owners",
      storageCodec: "relation" as const,
      valueKind: "relation" as const,
    }
    expect(
      eidosFileValueToGridCell(relation, '["row_ada"]', false, {
        owners: '["row_ada"]',
        owners__display: '[{"id":"row_ada","title":"Ada Lovelace"}]',
      })
    ).toMatchObject({
      kind: GridCellKind.Custom,
      data: {
        kind: "eidos-file-relation-cell",
        values: [{ id: "row_ada", title: "Ada Lovelace" }],
      },
    })
    expect(
      gridCellToEidosFileValue(relation, {
        kind: GridCellKind.Custom,
        allowOverlay: true,
        copyData: "",
        data: {
          kind: "eidos-file-relation-cell",
          values: [
            { id: "row_ada", title: "Ada Lovelace" },
            { id: "row_grace", title: "Grace Hopper" },
          ],
          multiple: true,
        },
      })
    ).toBe('["row_ada","row_grace"]')
  })

  it("renders formulas with their configured display type as readonly", () => {
    const formula = {
      ...field("formula", {
        formula: "price * quantity",
        displayType: "number",
      }),
      tableColumnName: "total",
      valueKind: "derived" as const,
      isDerived: true,
    }
    expect(eidosFileValueToGridCell(formula, 120)).toMatchObject({
      kind: GridCellKind.Number,
      data: 120,
      readonly: true,
    })
    expect(visibleEidosFileFields([formula])).toEqual([formula])
  })

  it("renders lookup rollups as readonly derived cells", () => {
    const lookup = {
      ...field("lookup", {
        relationField: "owners",
        targetField: "title",
        aggregate: "count",
        displayType: "number",
      }),
      tableColumnName: "owner_count",
      valueKind: "derived" as const,
      isDerived: true,
    }
    expect(eidosFileValueToGridCell(lookup, 2)).toMatchObject({
      kind: GridCellKind.Number,
      data: 2,
      readonly: true,
    })
  })

  it("applies per-view field visibility without changing Eidos File schema", () => {
    expect(
      visibleEidosFileFields([field("text"), field("number")], ["number"]).map(
        (candidate) => candidate.tableColumnName
      )
    ).toEqual(["text"])
  })

  it("shows selected system fields as readonly rich cells", () => {
    const createdTime = {
      ...field("created-time"),
      tableColumnName: "_created_time",
      valueKind: "system" as const,
      isHidden: true,
    }
    expect(visibleEidosFileFields([createdTime])).toEqual([])
    expect(
      visibleEidosFileFields([createdTime], [], ["_created_time"])
    ).toEqual([createdTime])
    expect(
      eidosFileValueToGridCell(createdTime, "2026-07-14 08:30:00")
    ).toMatchObject({
      kind: GridCellKind.Custom,
      readonly: true,
      data: { kind: "date-picker-cell", format: "datetime-local" },
    })

    const recordId = {
      ...field("row-id"),
      tableColumnName: "_id",
      valueKind: "system" as const,
      isHidden: true,
    }
    expect(eidosFileValueToGridCell(recordId, "row_1")).toMatchObject({
      kind: GridCellKind.Text,
      readonly: true,
      data: "row_1",
    })
  })
})
