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
  {
    id: "projects",
    name: "Projects",
    rawTableName: "tb_projects",
    position: 1,
    icon: null,
    description: null,
    createdAt: now,
    updatedAt: now,
  },
]

async function keyboardDrag(
  label: string,
  direction: "ArrowLeft" | "ArrowRight"
) {
  const handle = document.body.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`
  )
  Array.from(
    document.body.querySelectorAll<HTMLElement>(
      "[data-eidos-file-sortable-tab]"
    )
  ).forEach((item, index) => {
    item.getBoundingClientRect = () => new DOMRect(index * 120, 0, 112, 32)
  })
  await act(async () => {
    handle?.focus()
    handle?.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        code: "Space",
        key: " ",
      })
    )
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        code: direction,
        key: direction,
      })
    )
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        code: "Space",
        key: " ",
      })
    )
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })
}

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

  it("keeps the dropped tab order while persistence is still pending", async () => {
    let resolveViewReorder: (() => void) | undefined
    const onViewReorder = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveViewReorder = resolve
        })
    )
    await act(async () => {
      root.render(
        <EidosFileViewTabStrip
          views={views}
          activeViewId="grid"
          onSelect={vi.fn()}
          onReorder={onViewReorder}
        />
      )
    })

    await keyboardDrag("Reorder Gallery view", "ArrowLeft")
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-eidos-file-view-id]")
      ).map((tab) => tab.dataset.eidosFileViewId)
    ).toEqual(["gallery", "grid"])
    expect(onViewReorder).toHaveBeenCalledWith(["gallery", "grid"])

    await act(async () => {
      root.render(
        <EidosFileViewTabStrip
          views={views.map((view) => ({ ...view }))}
          activeViewId="grid"
          disabled
          onSelect={vi.fn()}
          onReorder={onViewReorder}
        />
      )
      await Promise.resolve()
    })
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-eidos-file-view-id]")
      ).map((tab) => tab.dataset.eidosFileViewId)
    ).toEqual(["gallery", "grid"])

    await act(async () => resolveViewReorder?.())

    let resolveTableReorder: (() => void) | undefined
    const onTableReorder = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveTableReorder = resolve
        })
    )
    await act(async () => {
      root.render(
        <EidosFileSheetTabStrip
          tables={tables}
          activeTableId="tasks"
          onSelect={vi.fn()}
          onReorder={onTableReorder}
        />
      )
    })

    await keyboardDrag("Reorder Projects table", "ArrowLeft")
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-eidos-file-table-id]")
      ).map((tab) => tab.dataset.eidosFileTableId)
    ).toEqual(["projects", "tasks"])
    expect(onTableReorder).toHaveBeenCalledWith(["projects", "tasks"])

    await act(async () => {
      root.render(
        <EidosFileSheetTabStrip
          tables={tables.map((table) => ({ ...table }))}
          activeTableId="tasks"
          disabled
          onSelect={vi.fn()}
          onReorder={onTableReorder}
        />
      )
      await Promise.resolve()
    })
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-eidos-file-table-id]")
      ).map((tab) => tab.dataset.eidosFileTableId)
    ).toEqual(["projects", "tasks"])

    await act(async () => resolveTableReorder?.())
  })

  it("restores the authoritative tab order when persistence rejects", async () => {
    const onReorder = vi.fn().mockRejectedValue(new Error("revision conflict"))
    await act(async () => {
      root.render(
        <EidosFileViewTabStrip
          views={views}
          activeViewId="grid"
          onSelect={vi.fn()}
          onReorder={onReorder}
        />
      )
    })

    await keyboardDrag("Reorder Gallery view", "ArrowLeft")
    expect(onReorder).toHaveBeenCalledWith(["gallery", "grid"])
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-eidos-file-view-id]")
      ).map((tab) => tab.dataset.eidosFileViewId)
    ).toEqual(["grid", "gallery"])
  })
})
