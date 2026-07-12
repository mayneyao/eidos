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
          onFinishedEditing={vi.fn()}
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
    const ada = [...document.body.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Ada Lovelace")
    )
    expect(ada).toBeTruthy()
    act(() => ada?.click())
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        copyData: '["row_ada"]',
        data: expect.objectContaining({
          values: [{ id: "row_ada", title: "Ada Lovelace" }],
        }),
      })
    )
  })
})
