// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  GridCellKind,
  type ProvideEditorComponent,
} from "@glideapps/glide-data-grid"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import selectRenderer, {
  EidosFileSelectCellEditor,
  type SelectCell,
} from "./select-cell"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const SelectEditor =
  EidosFileSelectCellEditor as ProvideEditorComponent<SelectCell>

describe("SelectCell editor", () => {
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

  it("preserves pasted values that are not yet in the option catalog", () => {
    const data: SelectCell["data"] = {
      kind: "select-cell",
      value: "Todo",
      allowedValues: [{ id: "Todo", name: "Todo", color: "blue" }],
      allowCreate: false,
    }
    expect(selectRenderer.onPaste?.("Blocked", data)).toMatchObject({
      value: "Blocked",
    })
  })

  it("persists a new option before committing its value", async () => {
    const order: string[] = []
    const onCreateOption = vi.fn(async () => {
      order.push("option")
    })
    const onFinishedEditing = vi.fn(() => {
      order.push("value")
    })
    const cell: SelectCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: "",
      data: {
        kind: "select-cell",
        value: null,
        allowedValues: [{ id: "Todo", name: "Todo", color: "blue" }],
        allowCreate: true,
        onCreateOption,
      },
    }

    await act(async () => {
      root.render(
        <SelectEditor
          value={cell}
          onChange={vi.fn()}
          onFinishedEditing={onFinishedEditing}
          isHighlighted={false}
          target={{ x: 0, y: 0, width: 240, height: 36 }}
          forceEditMode={false}
          theme={{ name: "light" } as never}
        />
      )
      await Promise.resolve()
    })

    const input = document.body.querySelector<HTMLInputElement>("[cmdk-input]")
    await act(async () => {
      if (!input) throw new Error("Expected Select search input")
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set
      setter?.call(input, "Blocked")
      input.dispatchEvent(new Event("input", { bubbles: true }))
      await Promise.resolve()
    })
    const create = Array.from(
      document.body.querySelectorAll<HTMLElement>("[cmdk-item]")
    ).find((item) => item.textContent?.includes('Create "Blocked"'))
    expect(create).toBeTruthy()

    await act(async () => {
      create?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(order).toEqual(["option", "value"])
    expect(onCreateOption).toHaveBeenCalledWith([
      { id: "Todo", name: "Todo", color: "blue" },
      { id: "Blocked", name: "Blocked", color: "gray" },
    ])
    expect(onFinishedEditing).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          value: "Blocked",
          allowedValues: expect.arrayContaining([
            { id: "Blocked", name: "Blocked", color: "gray" },
          ]),
        }),
      }),
      [0, 1]
    )
  })

  it("does not commit the value when persisting its option fails", async () => {
    const onFinishedEditing = vi.fn()
    const cell: SelectCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: "",
      data: {
        kind: "select-cell",
        value: null,
        allowedValues: [],
        allowCreate: true,
        onCreateOption: vi.fn(async () => {
          throw new Error("stale revision")
        }),
      },
    }

    await act(async () => {
      root.render(
        <SelectEditor
          value={cell}
          onChange={vi.fn()}
          onFinishedEditing={onFinishedEditing}
          isHighlighted={false}
          target={{ x: 0, y: 0, width: 240, height: 36 }}
          forceEditMode={false}
          theme={{ name: "light" } as never}
        />
      )
      await Promise.resolve()
    })
    const input = document.body.querySelector<HTMLInputElement>("[cmdk-input]")
    await act(async () => {
      if (!input) throw new Error("Expected Select search input")
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set?.call(input, "Blocked")
      input.dispatchEvent(new Event("input", { bubbles: true }))
      await Promise.resolve()
    })
    const create = Array.from(
      document.body.querySelectorAll<HTMLElement>("[cmdk-item]")
    ).find((item) => item.textContent?.includes('Create "Blocked"'))
    await act(async () => {
      create?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onFinishedEditing).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("Unable to create option")
  })
})
