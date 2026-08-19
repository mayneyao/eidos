// @vitest-environment jsdom

import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { GridCellKind, type Theme } from "@glideapps/glide-data-grid"

import {
  EidosFileRelationCellEditor,
  EidosFileRelationCellRenderer,
  type EidosFileRelationCell,
} from "./eidos-file-relation-cell"
import { EidosFileUIProvider } from "./context"

const ADA_ID = "0198c72d-82b5-7968-b163-98be4b7477df"
const GRACE_ID = "0198c72d-82b5-7969-8163-98be4b7477df"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("Eidos File relation cell", () => {
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

  it("uses only its own overlay chrome", () => {
    const cell: EidosFileRelationCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: "",
      data: {
        kind: "eidos-file-relation-cell",
        values: [],
        multiple: true,
      },
    }

    expect(EidosFileRelationCellRenderer.provideEditor?.(cell)).toMatchObject({
      editor: EidosFileRelationCellEditor,
      disablePadding: true,
      disableStyling: true,
    })
  })

  it("searches and selects records inside the Grid overlay", async () => {
    const onChange = vi.fn()
    const onFinishedEditing = vi.fn()
    const onSearch = vi.fn().mockResolvedValue([
      { id: ADA_ID, title: "Ada Lovelace" },
      { id: GRACE_ID, title: "Grace Hopper" },
    ])
    const cell: EidosFileRelationCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: "",
      data: {
        kind: "eidos-file-relation-cell",
        values: [],
        multiple: true,
        onSearch,
      },
    }

    await act(async () => {
      root.render(
        <EidosFileRelationCellEditor
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
    expect(
      document.body.querySelector(
        "[data-eidos-file-grid-editor-popover] [data-eidos-file-grid-editor-surface]"
      )
    ).not.toBeNull()
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
        copyData: JSON.stringify([GRACE_ID]),
        data: expect.objectContaining({
          values: [{ id: GRACE_ID, title: "Grace Hopper" }],
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
      expect.objectContaining({ copyData: JSON.stringify([GRACE_ID]) })
    )
  })

  it("opens an already linked record without unlinking it", async () => {
    const openRelationRecord = vi.fn()
    const onChange = vi.fn()
    const onFinishedEditing = vi.fn()
    const cell: EidosFileRelationCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: JSON.stringify([ADA_ID]),
      data: {
        kind: "eidos-file-relation-cell",
        values: [{ id: ADA_ID, title: "Ada Lovelace" }],
        multiple: true,
        targetTableId: "people",
      },
    }

    await act(async () => {
      root.render(
        <EidosFileUIProvider openRelationRecord={openRelationRecord}>
          <EidosFileRelationCellEditor
            value={cell}
            onChange={onChange}
            onFinishedEditing={onFinishedEditing}
            isHighlighted={false}
            target={{ x: 0, y: 0, width: 240, height: 36 }}
            forceEditMode={false}
            theme={{} as Theme}
          />
        </EidosFileUIProvider>
      )
    })

    act(() => {
      document.body
        .querySelector<HTMLButtonElement>(
          '[aria-label="Open linked record Ada Lovelace"]'
        )
        ?.click()
    })

    expect(openRelationRecord).toHaveBeenCalledWith({
      tableId: "people",
      rowId: ADA_ID,
      title: "Ada Lovelace",
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(onFinishedEditing).toHaveBeenCalledOnce()
  })
})
