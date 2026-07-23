import { GridCellKind } from "@glideapps/glide-data-grid"
import { describe, expect, it } from "vitest"

import renderer, { type DatePickerCell } from "./date-picker-cell"

function dateCell(readonly: boolean): DatePickerCell {
  const date = new Date(2026, 6, 23, 10, 30)
  return {
    kind: GridCellKind.Custom,
    allowOverlay: true,
    readonly,
    copyData: "2026-07-23 10:30:00",
    data: {
      kind: "date-picker-cell",
      date,
      displayDate: date.toLocaleString(),
      format: "datetime-local",
    },
  }
}

describe("date picker cell renderer", () => {
  it("does not provide an editor for readonly cells", () => {
    expect(renderer.provideEditor?.(dateCell(true))).toBeUndefined()
  })

  it("still provides an editor for writable cells", () => {
    expect(renderer.provideEditor?.(dateCell(false))).toBeTypeOf("function")
  })

  it("does not clear readonly cells through the renderer delete path", () => {
    expect(renderer.onDelete?.(dateCell(true))).toBeUndefined()
  })
})
