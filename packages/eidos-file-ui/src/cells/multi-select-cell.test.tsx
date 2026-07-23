// @vitest-environment jsdom

import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  GridCellKind,
  type ProvideEditorComponent,
} from "@glideapps/glide-data-grid"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Editor, type MultiSelectCell } from "./multi-select-cell"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const initialCell: MultiSelectCell = {
  kind: GridCellKind.Custom,
  allowOverlay: true,
  copyData: "Quality",
  data: {
    kind: "multi-select-cell",
    values: ["Quality"],
    allowedValues: [
      { id: "Quality", name: "Quality", color: "green" },
      { id: "Speed", name: "Speed", color: "blue" },
    ],
    allowCreate: false,
  },
}

const MultiSelectEditor = Editor as ProvideEditorComponent<MultiSelectCell>

describe("MultiSelectCell editor", () => {
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
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it("commits the selected values when the popover closes", async () => {
    const onFinishedEditing = vi.fn()

    function Harness() {
      const [cell, setCell] = useState(initialCell)
      return (
        <MultiSelectEditor
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

    const speed = Array.from(
      document.body.querySelectorAll<HTMLElement>("[cmdk-item]")
    ).find((item) => item.textContent?.includes("Speed"))
    expect(speed).toBeTruthy()

    await act(async () => {
      speed?.click()
      await Promise.resolve()
    })
    expect(onFinishedEditing).not.toHaveBeenCalled()

    await act(async () => {
      document.body.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 })
      )
      await Promise.resolve()
    })

    expect(onFinishedEditing).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ values: ["Quality", "Speed"] }),
      }),
      [0, 1]
    )
  })
})
