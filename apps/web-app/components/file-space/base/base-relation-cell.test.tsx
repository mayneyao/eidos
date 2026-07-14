// @vitest-environment jsdom

import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { GridCellKind, type Theme } from "@glideapps/glide-data-grid"

import {
  BaseRelationCellEditor,
  type BaseRelationCell,
} from "./base-relation-cell"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("Base relation cell", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("searches and selects records inside the Grid overlay", async () => {
    const onChange = vi.fn()
    const onFinishedEditing = vi.fn()
    const onSearch = vi.fn().mockResolvedValue([
      { id: "row_ada", title: "Ada Lovelace" },
      { id: "row_grace", title: "Grace Hopper" },
    ])
    const cell: BaseRelationCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: "",
      data: {
        kind: "base-relation-cell",
        values: [],
        multiple: true,
        onSearch,
      },
    }

    await act(async () => {
      root.render(
        <BaseRelationCellEditor
          value={cell}
          onChange={onChange}
          onFinishedEditing={onFinishedEditing}
          isHighlighted={false}
          target={{ x: 0, y: 0, width: 240, height: 36 }}
          forceEditMode={false}
          theme={{} as Theme}
        />
      )
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    expect(onSearch).toHaveBeenCalledWith("")
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    const combobox =
      document.body.querySelector<HTMLInputElement>('[role="combobox"]')
    const listbox = document.body.querySelector<HTMLElement>('[role="listbox"]')
    const options =
      document.body.querySelectorAll<HTMLElement>('[role="option"]')
    expect(combobox?.getAttribute("aria-controls")).toBe(listbox?.id)
    expect(combobox?.getAttribute("aria-expanded")).toBe("true")
    expect(options).toHaveLength(2)
    expect(combobox?.getAttribute("aria-activedescendant")).toBe(options[0]?.id)

    act(() => {
      combobox?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
      )
    })
    expect(combobox?.getAttribute("aria-activedescendant")).toBe(options[1]?.id)
    act(() => {
      combobox?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })
      )
    })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        copyData: '["row_grace"]',
        data: expect.objectContaining({
          values: [{ id: "row_grace", title: "Grace Hopper" }],
        }),
      })
    )
    expect(onFinishedEditing).not.toHaveBeenCalled()

    act(() => {
      combobox?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "Enter",
          ctrlKey: true,
        })
      )
    })
    expect(onFinishedEditing).toHaveBeenCalledWith(
      expect.objectContaining({ copyData: '["row_grace"]' })
    )
  })
})
