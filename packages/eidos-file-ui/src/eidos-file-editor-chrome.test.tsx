import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileTableInfo,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"

import {
  EidosFileEditorContent,
  EidosFileEditorRoot,
  EidosFileEditorWorkbar,
  EidosFileSheetTabStrip,
  EidosFileViewTabStrip,
} from "./eidos-file-editor-chrome"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const now = "2026-07-17T00:00:00.000Z"
const views: EidosFileViewInfo[] = [
  {
    id: "grid",
    name: "Grid",
    type: "grid",
    tableId: "tasks",
    query: "",
    properties: null,
    filter: null,
    sorts: [],
    orderMap: null,
    hiddenFields: [],
    position: 0,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "gallery",
    name: "Gallery",
    type: "gallery",
    tableId: "tasks",
    query: "",
    properties: null,
    filter: null,
    sorts: [],
    orderMap: null,
    hiddenFields: [],
    position: 1,
    createdAt: now,
    updatedAt: now,
  },
]
const tables: EidosFileTableInfo[] = [
  {
    id: "tasks",
    name: "Tasks",
    rawTableName: "tb_tasks",
    position: 0,
    icon: null,
    description: null,
    createdAt: now,
    updatedAt: now,
  },
]

describe("shared Eidos File editor chrome", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("keeps the Desktop workbar, content, and bottom sheet order", () => {
    act(() => {
      root.render(
        <EidosFileEditorRoot data-testid="root">
          <EidosFileEditorWorkbar>Workbar</EidosFileEditorWorkbar>
          <EidosFileEditorContent>Grid</EidosFileEditorContent>
          <EidosFileSheetTabStrip
            tables={tables}
            activeTableId="tasks"
            onSelect={() => undefined}
            status="Saved"
          />
        </EidosFileEditorRoot>
      )
    })

    const shell = container.querySelector('[data-testid="root"]')
    expect(shell?.children[0]?.hasAttribute("data-eidos-file-workbar")).toBe(
      true
    )
    expect(shell?.children[1]?.textContent).toContain("Grid")
    expect(shell?.children[2]?.hasAttribute("data-eidos-file-sheet-tabs")).toBe(
      true
    )
    expect(
      shell?.children[2]?.querySelector("[data-eidos-file-sheet-status]")
    ).not.toBeNull()
    expect(shell?.children[2]?.textContent).toContain("Saved")
  })

  it("shares keyboard view navigation between hosts", () => {
    const selected: string[] = []
    act(() => {
      root.render(
        <EidosFileViewTabStrip
          views={views}
          activeViewId="grid"
          onSelect={(id) => selected.push(id)}
        />
      )
    })

    const grid = container.querySelector<HTMLButtonElement>(
      '[data-eidos-file-view-id="grid"]'
    )
    expect(
      container.querySelector("[data-eidos-file-view-tabs]")
    ).not.toBeNull()
    act(() =>
      grid?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          bubbles: true,
        })
      )
    )
    expect(selected).toEqual(["gallery"])
  })
})
