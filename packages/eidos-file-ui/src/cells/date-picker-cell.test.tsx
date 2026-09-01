// @vitest-environment jsdom

import React, { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { GridCellKind } from "@glideapps/glide-data-grid"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import renderer, {
  EidosFileDatePickerCellEditor,
  type DatePickerCell,
} from "./date-picker-cell"
import { formatEidosFileGridDate } from "../eidos-file-grid-date-format"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

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
      displayDate: formatEidosFileGridDate(date, "datetime-local"),
      format: "datetime-local",
    },
  }
}

describe("date picker cell renderer", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it("does not provide an editor for readonly cells", () => {
    expect(renderer.provideEditor?.(dateCell(true))).toBeUndefined()
  })

  it("still provides an editor for writable cells", () => {
    expect(renderer.provideEditor?.(dateCell(false))).toMatchObject({
      disablePadding: true,
      disableStyling: true,
    })
  })

  it("distributes every calendar week across the editor width", async () => {
    const onFinishedEditing = vi.fn()

    function Harness() {
      const [cell, setCell] = useState(dateCell(false))
      return (
        <EidosFileDatePickerCellEditor
          value={cell}
          onChange={setCell}
          onFinishedEditing={onFinishedEditing}
          isHighlighted={false}
          target={{ x: 0, y: 0, width: 240, height: 36 }}
          forceEditMode={false}
          theme={{ name: "light" } as never}
        />
      )
    }

    await act(async () => {
      root.render(<Harness />)
      await Promise.resolve()
    })

    const calendar = document.body.querySelector(
      "[data-eidos-file-grid-editor-surface] table"
    )
    const weekdayRow = calendar?.querySelector("thead tr")
    const weekRows = Array.from(calendar?.querySelectorAll("tbody tr") ?? [])

    expect(weekdayRow?.children).toHaveLength(7)
    expect(weekdayRow?.classList.contains("justify-between")).toBe(true)
    expect(weekRows.length).toBeGreaterThan(0)
    expect(
      weekRows.every(
        (row) =>
          row.children.length === 7 && row.classList.contains("justify-between")
      )
    ).toBe(true)
  })

  it("does not clear readonly cells through the renderer delete path", () => {
    expect(renderer.onDelete?.(dateCell(true))).toBeUndefined()
  })

  it("commits an empty value after clearing an existing date", async () => {
    const onFinishedEditing = vi.fn()

    function Harness() {
      const [cell, setCell] = useState(dateCell(false))
      return (
        <EidosFileDatePickerCellEditor
          value={cell}
          onChange={setCell}
          onFinishedEditing={onFinishedEditing}
          isHighlighted={false}
          target={{ x: 0, y: 0, width: 240, height: 36 }}
          forceEditMode={false}
          theme={{ name: "light" } as never}
        />
      )
    }

    await act(async () => {
      root.render(<Harness />)
      await Promise.resolve()
    })

    const input = document.body.querySelector<HTMLInputElement>(
      'input[type="datetime-local"]'
    )
    expect(input).toBeTruthy()

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set
      valueSetter?.call(input, "")
      input?.dispatchEvent(new Event("input", { bubbles: true }))
      await Promise.resolve()
    })

    const done = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Done")
    )
    expect(done).toBeTruthy()

    await act(async () => {
      done?.click()
      await Promise.resolve()
    })

    expect(onFinishedEditing).toHaveBeenCalledWith(
      expect.objectContaining({
        copyData: "2026-07-23 10:30:00",
        data: expect.objectContaining({
          date: undefined,
          displayDate: "",
        }),
      }),
      [0, 1]
    )
  })
})
