// @vitest-environment node

import {
  decodeEidosFileValues,
  encodeEidosFileAttachmentPaths,
  type EidosFileFieldInfo,
} from "@eidos.space/eidos-file"
import { GridCellKind } from "@glideapps/glide-data-grid"
import { describe, expect, it } from "vitest"

import {
  eidosFileValueToGridCell,
  gridCellToEidosFileValue,
  visibleEidosFileFields,
} from "./eidos-file-grid-adapter"
import { eidosFileSelectOptions } from "./eidos-file-field-properties"
import { eidosFileRecordFieldText } from "./eidos-file-record-format"

const ADA_ID = "0198c72d-82b5-7968-b163-98be4b7477df"
const GRACE_ID = "0198c72d-82b5-7969-8163-98be4b7477df"

function field(
  type: EidosFileFieldInfo["type"],
  property: Record<string, unknown> | null = null
): EidosFileFieldInfo {
  return {
    id: `0198c72d-82b5-7000-8000-${type.length.toString().padStart(12, "0")}`,
    tableId: "0198c72d-82b5-7000-8000-000000000010",
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
          ...field("text"),
          tableColumnName: "title",
          isRecordLabel: true,
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

  it("keeps cleared number values empty after rendering", () => {
    for (const value of [null, "", "   "]) {
      expect(eidosFileValueToGridCell(field("number"), value)).toMatchObject({
        kind: GridCellKind.Number,
        data: undefined,
        displayData: "",
      })
    }

    expect(
      eidosFileValueToGridCell(
        field("number", {
          showAs: "bar",
          divideBy: 20,
        }),
        null
      )
    ).toMatchObject({
      kind: GridCellKind.Number,
      data: undefined,
      displayData: "",
    })
  })

  it("adapts direct select values to the shared Grid cell shape", () => {
    const select = field("select", {
      options: [{ name: "Todo" }, { name: "Done", color: "green" }],
    })

    expect(eidosFileSelectOptions(select)).toEqual([
      { name: "Todo", value: "Todo", color: "default" },
      { name: "Done", value: "Done", color: "green" },
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

  it("round-trips multi-select edits as canonical JSON arrays", () => {
    const multiSelect = {
      ...field("multi-select", {
        options: [
          { name: "Quality", color: "green" },
          { name: "Speed", color: "blue" },
        ],
      }),
      storageCodec: "json_array" as const,
    }
    const cell = eidosFileValueToGridCell(
      multiSelect,
      JSON.stringify(["Quality"])
    )
    expect(cell).toMatchObject({
      kind: GridCellKind.Custom,
      data: {
        kind: "multi-select-cell",
        values: ["Quality"],
        allowCreate: false,
      },
    })
    if (cell.kind !== GridCellKind.Custom) {
      throw new Error("Expected a multi-select custom cell")
    }
    expect(
      gridCellToEidosFileValue(multiSelect, {
        ...cell,
        data: { ...cell.data, values: ["Quality", "Speed"] },
      })
    ).toBe(JSON.stringify(["Quality", "Speed"]))
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

  it("preserves nullable Checkbox NULL separately from false", () => {
    const nullableCheckbox = { ...field("checkbox"), nullable: true }
    expect(eidosFileValueToGridCell(nullableCheckbox, null)).toMatchObject({
      kind: GridCellKind.Boolean,
      data: null,
    })
    expect(
      gridCellToEidosFileValue(nullableCheckbox, {
        kind: GridCellKind.Boolean,
        allowOverlay: false,
        data: null,
      })
    ).toBeNull()

    const requiredCheckbox = { ...field("checkbox"), nullable: false }
    expect(eidosFileValueToGridCell(requiredCheckbox, null)).toMatchObject({
      kind: GridCellKind.Boolean,
      data: false,
    })
    expect(
      gridCellToEidosFileValue(requiredCheckbox, {
        kind: GridCellKind.Boolean,
        allowOverlay: false,
        data: null,
      })
    ).toBe(0)
  })

  it("reuses the rich date and rating cells from the existing table", () => {
    expect(eidosFileValueToGridCell(field("rating"), 4)).toMatchObject({
      kind: GridCellKind.Custom,
      data: { kind: "rating-cell", rating: 4 },
    })
    expect(eidosFileValueToGridCell(field("date"), "2026-07-12")).toMatchObject(
      {
        kind: GridCellKind.Custom,
        themeOverride: {
          fontFamily: expect.stringContaining("monospace"),
        },
        data: {
          kind: "date-picker-cell",
          format: "date",
          displayDate: "2026-07-12",
        },
      }
    )
    expect(
      eidosFileValueToGridCell(field("datetime"), "2026-07-12T03:04:05")
    ).toMatchObject({
      kind: GridCellKind.Custom,
      themeOverride: {
        fontFamily: expect.stringContaining("monospace"),
      },
      data: {
        kind: "date-picker-cell",
        format: "datetime-local",
        displayDate: "2026-07-12 03:04:05",
      },
    })
    expect(
      eidosFileValueToGridCell(
        field("datetime"),
        "2026-01-01T00:30:00.000Z",
        false,
        undefined,
        "Unavailable record",
        false,
        "America/Los_Angeles"
      )
    ).toMatchObject({
      data: {
        kind: "date-picker-cell",
        displayDate: "2025-12-31 16:30:00",
        timeZone: "America/Los_Angeles",
      },
    })
  })

  it("maps file fields to portable multi-attachment cells", () => {
    const stored = encodeEidosFileAttachmentPaths([
      "assets/cover.png",
      "assets/report, final.pdf",
    ])
    const entries = decodeEidosFileValues(stored)
    expect(
      eidosFileValueToGridCell(
        { ...field("file"), storageCodec: "json_array" },
        stored
      )
    ).toMatchObject({
      kind: GridCellKind.Custom,
      data: {
        kind: "eidos-file-file-cell",
        entries,
      },
    })
    const encoded = gridCellToEidosFileValue(field("file"), {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: "",
      data: {
        kind: "eidos-file-file-cell",
        entries,
      },
    })
    expect(decodeEidosFileValues(encoded ?? undefined)).toEqual(entries)
  })

  it("renders URL fields as editable image cells when configured by the field", () => {
    const imageUrl = field("url", { display: { kind: "image" } })
    const cell = eidosFileValueToGridCell(
      imageUrl,
      "https://cdn.example.com/avatar.png"
    )

    expect(cell).toMatchObject({
      kind: GridCellKind.Custom,
      readonly: false,
      data: {
        kind: "eidos-file-url-image-cell",
        uri: "https://cdn.example.com/avatar.png",
      },
    })
    if (cell.kind !== GridCellKind.Custom) {
      throw new Error("Expected a URL image custom cell")
    }
    expect(gridCellToEidosFileValue(imageUrl, cell)).toBe(
      "https://cdn.example.com/avatar.png"
    )
  })

  it("renders URL Formula results as read-only image cells", () => {
    const imageUrl = {
      ...field("formula", {
        displayType: "url",
        display: { kind: "image" },
      }),
      valueKind: "derived" as const,
      isDerived: true,
    }

    expect(
      eidosFileValueToGridCell(
        imageUrl,
        "https://cdn.example.com/generated.png"
      )
    ).toMatchObject({
      kind: GridCellKind.Custom,
      readonly: true,
      data: {
        kind: "eidos-file-url-image-cell",
        uri: "https://cdn.example.com/generated.png",
      },
    })
  })

  it("maps relation IDs to hydrated record titles and back", () => {
    const relation = {
      ...field("relation", {
        targetTableId: "people",
        targetField: "title",
        multiple: true,
      }),
      tableColumnName: "owners",
      storageCodec: "relation" as const,
      valueKind: "relation" as const,
    }
    expect(
      eidosFileValueToGridCell(relation, JSON.stringify([ADA_ID]), false, {
        owners: JSON.stringify([ADA_ID]),
        owners__display: JSON.stringify([
          { id: ADA_ID, title: "Ada Lovelace" },
        ]),
      })
    ).toMatchObject({
      kind: GridCellKind.Custom,
      data: {
        kind: "eidos-file-relation-cell",
        targetTableId: "people",
        values: [{ id: ADA_ID, title: "Ada Lovelace" }],
      },
    })
    expect(
      eidosFileValueToGridCell(
        relation,
        JSON.stringify([GRACE_ID]),
        false,
        { owners: JSON.stringify([GRACE_ID]) },
        "Unavailable record"
      )
    ).toMatchObject({
      data: {
        values: [{ id: GRACE_ID, title: "Unavailable record" }],
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
            { id: ADA_ID, title: "Ada Lovelace" },
            { id: GRACE_ID, title: "Grace Hopper" },
          ],
          multiple: true,
        },
      })
    ).toBe(JSON.stringify([ADA_ID, GRACE_ID]))
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
      allowOverlay: false,
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
      allowOverlay: false,
      data: 2,
      readonly: true,
    })
  })

  it("renders typed Lookup lists without stringifying structured values", () => {
    const files = {
      ...field("lookup", {
        relationField: "projects",
        targetField: "attachments",
        aggregate: "values",
        displayType: "text",
        valueType: { kind: "list", element: "file-entry" },
      }),
      tableColumnName: "project_files",
      storageCodec: "json_array" as const,
      valueKind: "derived" as const,
      isDerived: true,
    }
    const fileValue = encodeEidosFileAttachmentPaths([
      "assets/spec.pdf",
      "assets/diagram.png",
    ])
    expect(eidosFileValueToGridCell(files, fileValue)).toMatchObject({
      kind: GridCellKind.Custom,
      allowOverlay: false,
      readonly: true,
      data: {
        kind: "eidos-file-file-cell",
        entries: [{ name: "spec.pdf" }, { name: "diagram.png" }],
      },
    })
    expect(
      eidosFileRecordFieldText(
        { _id: "row_1", project_files: fileValue },
        files
      )
    ).toBe("spec.pdf, diagram.png")

    const owners = {
      ...field("lookup", {
        relationField: "projects",
        targetField: "owners",
        aggregate: "values",
        displayType: "text",
        valueType: { kind: "list", element: "row-id" },
      }),
      tableColumnName: "project_owners",
      storageCodec: "json_array" as const,
      valueKind: "derived" as const,
      isDerived: true,
    }
    const ownerRow = {
      _id: "row_1",
      project_owners: JSON.stringify([ADA_ID, GRACE_ID]),
      project_owners__display: JSON.stringify([
        { id: ADA_ID, title: "Ada Lovelace" },
        { id: GRACE_ID, title: "Grace Hopper" },
      ]),
    }
    expect(
      eidosFileValueToGridCell(owners, ownerRow.project_owners, false, ownerRow)
    ).toMatchObject({
      kind: GridCellKind.Custom,
      allowOverlay: false,
      readonly: true,
      data: {
        kind: "eidos-file-relation-cell",
        values: [
          { id: ADA_ID, title: "Ada Lovelace" },
          { id: GRACE_ID, title: "Grace Hopper" },
        ],
      },
    })
    expect(eidosFileRecordFieldText(ownerRow, owners)).toBe(
      "Ada Lovelace, Grace Hopper"
    )

    const statuses = {
      ...field("lookup", {
        relationField: "projects",
        targetField: "status",
        aggregate: "values",
        displayType: "text",
        valueType: { kind: "list", element: "select" },
      }),
      tableColumnName: "project_statuses",
      storageCodec: "json_array" as const,
      valueKind: "derived" as const,
      isDerived: true,
    }
    expect(
      eidosFileValueToGridCell(statuses, JSON.stringify(["Todo", "Done"]))
    ).toMatchObject({
      kind: GridCellKind.Custom,
      allowOverlay: false,
      readonly: true,
      data: {
        kind: "multi-select-cell",
        values: ["Todo", "Done"],
      },
    })
  })

  it("keeps row-id Lookup rendering safe while refreshed values are loading", () => {
    const owners = {
      ...field("lookup", {
        relationField: "projects",
        targetField: "owners",
        aggregate: "values",
        displayType: "text",
        valueType: { kind: "list", element: "row-id" },
      }),
      tableColumnName: "project_owners",
      storageCodec: "json_array" as const,
      valueKind: "derived" as const,
      isDerived: true,
    }

    expect(eidosFileValueToGridCell(owners, 2)).toMatchObject({
      kind: GridCellKind.Custom,
      allowOverlay: false,
      readonly: true,
      data: {
        kind: "eidos-file-relation-cell",
        values: [],
      },
    })
    expect(
      eidosFileValueToGridCell(owners, JSON.stringify(["stale text value"]))
    ).toMatchObject({
      data: { values: [] },
    })
    expect(
      eidosFileValueToGridCell(
        owners,
        JSON.stringify([ADA_ID, ADA_ID]),
        false,
        {
          project_owners: JSON.stringify([ADA_ID, ADA_ID]),
          project_owners__display: JSON.stringify([
            { id: ADA_ID, title: "Ada Lovelace" },
          ]),
        }
      )
    ).toMatchObject({
      copyData: JSON.stringify([ADA_ID, ADA_ID]),
      data: {
        values: [
          { id: ADA_ID, title: "Ada Lovelace" },
          { id: ADA_ID, title: "Ada Lovelace" },
        ],
      },
    })
  })

  it("applies per-view field visibility without changing Eidos File schema", () => {
    const text = field("text")
    const number = field("number")
    expect(
      visibleEidosFileFields([text, number], [number.id]).map(
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
    expect(visibleEidosFileFields([createdTime], [], [createdTime.id])).toEqual(
      [createdTime]
    )
    expect(
      eidosFileValueToGridCell(createdTime, "2026-07-14 08:30:00")
    ).toMatchObject({
      kind: GridCellKind.Custom,
      allowOverlay: false,
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
      themeOverride: {
        fontFamily: expect.stringContaining("monospace"),
      },
    })

    expect(eidosFileValueToGridCell(field("text"), "row_1")).not.toHaveProperty(
      "themeOverride.fontFamily"
    )
  })
})
