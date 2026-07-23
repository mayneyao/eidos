// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileTableInfo,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EidosFileSheetTabs } from "./eidos-file-sheet-tabs"
import { EidosFileViewTabs } from "./eidos-file-view-tabs"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const tables: EidosFileTableInfo[] = [
  {
    id: "tasks",
    name: "Tasks",
    rawTableName: "tb_tasks",
    position: 1,
    icon: null,
    description: null,
    createdAt: "2026-07-13 00:00:00",
    updatedAt: "2026-07-13 00:00:00",
  },
  {
    id: "projects",
    name: "Projects",
    rawTableName: "tb_projects",
    position: 2,
    icon: null,
    description: null,
    createdAt: "2026-07-13 00:00:00",
    updatedAt: "2026-07-13 00:00:00",
  },
]

const views: EidosFileViewInfo[] = [
  {
    id: "grid",
    name: "All tasks",
    type: "grid",
    tableId: "tasks",
    query: "SELECT * FROM tb_tasks",
    properties: null,
    filter: null,
    sorts: [],
    orderMap: null,
    hiddenFields: [],
    position: 1,
    createdAt: "2026-07-13 00:00:00",
    updatedAt: "2026-07-13 00:00:00",
  },
  {
    id: "board",
    name: "By status",
    type: "kanban",
    tableId: "tasks",
    query: "SELECT * FROM tb_tasks",
    properties: { groupField: "field-status" },
    filter: null,
    sorts: [],
    orderMap: null,
    hiddenFields: [],
    position: 2,
    createdAt: "2026-07-13 00:00:00",
    updatedAt: "2026-07-13 00:00:00",
  },
]

const scrollIntoView = vi.fn()

describe("Eidos File navigation hierarchy", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    scrollIntoView.mockReset()
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("uses top tabs for views and a bottom sheet bar for tables", async () => {
    const onSelectView = vi.fn()
    const onSelectTable = vi.fn()
    const onCreateTable = vi.fn()
    const onRenameTable = vi.fn()
    const onDeleteTable = vi.fn()
    const onRenameView = vi.fn()
    const onDeleteView = vi.fn()
    await act(async () => {
      root.render(
        <div>
          <EidosFileViewTabs
            views={views}
            fields={[]}
            activeView={views[0]}
            onSelect={onSelectView}
            onCreate={vi.fn()}
            onRename={onRenameView}
            onDuplicate={vi.fn()}
            onDelete={onDeleteView}
            onReorder={vi.fn()}
            onUpdate={vi.fn()}
          />
          <EidosFileSheetTabs
            tables={tables}
            activeTableId="tasks"
            onSelect={onSelectTable}
            createAction={
              <button
                type="button"
                aria-label="Add Eidos File table"
                onClick={onCreateTable}
              >
                Add table
              </button>
            }
            onRename={onRenameTable}
            onDelete={onDeleteTable}
          />
        </div>
      )
    })

    const viewTabs = container.querySelector(
      '[role="tablist"][aria-label="Eidos File views"]'
    )
    const sheetTabs = container.querySelector(
      '[role="tablist"][aria-label="Eidos File tables"]'
    )
    expect(viewTabs?.textContent).toContain("All tasks")
    expect(viewTabs?.textContent).toContain("By status")
    expect(
      viewTabs?.querySelector('[role="tab"][aria-selected="true"]')?.className
    ).toContain("h-full")
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Add Eidos File view"]'
      )?.className
    ).toContain("h-full")
    expect(
      container.querySelector('[aria-label="Manage Eidos File views"]')
    ).toBeNull()
    expect(sheetTabs?.textContent).toContain("Tasks")
    expect(sheetTabs?.textContent).toContain("Projects")
    expect(sheetTabs?.getAttribute("aria-keyshortcuts")).toBe(
      "Control+PageUp Control+PageDown"
    )
    expect(
      sheetTabs?.closest("[data-eidos-file-sheet-tabs]")?.className
    ).toContain("eidos-shell-statusbar")
    expect(
      sheetTabs?.querySelector('[role="tab"][aria-selected="true"]')
        ?.textContent
    ).toContain("Tasks")
    const sheetViewport = container.querySelector(
      "[data-eidos-file-sheet-tabs-viewport]"
    )
    const createAction = container.querySelector(
      "[data-eidos-file-sheet-create-action]"
    )
    expect(sheetViewport?.lastElementChild).toBe(createAction)
    expect(sheetViewport?.contains(sheetTabs ?? null)).toBe(true)

    await act(async () => {
      Array.from(viewTabs?.querySelectorAll<HTMLButtonElement>("button") ?? [])
        .find((button) => button.textContent?.includes("By status"))
        ?.click()
      Array.from(sheetTabs?.querySelectorAll<HTMLButtonElement>("button") ?? [])
        .find((button) => button.textContent?.includes("Projects"))
        ?.click()
      container
        .querySelector<HTMLButtonElement>('[aria-label="Add Eidos File table"]')
        ?.click()
    })

    expect(onSelectView).toHaveBeenCalledWith("board")
    expect(onSelectTable).toHaveBeenCalledWith("projects")
    expect(onCreateTable).toHaveBeenCalledOnce()

    const boardTab = viewTabs?.querySelector<HTMLElement>(
      '[data-eidos-file-view-id="board"]'
    )
    await act(async () => {
      boardTab?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          button: 2,
          clientX: 40,
          clientY: 40,
        })
      )
      await Promise.resolve()
    })
    expect(
      Array.from(document.body.querySelectorAll('[role="menuitem"]')).map(
        (item) => item.textContent?.trim()
      )
    ).toEqual(["Rename view", "Configure view", "Delete view"])

    await act(async () => {
      Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
      )
        .find((item) => item.textContent?.includes("Rename view"))
        ?.click()
      await Promise.resolve()
    })
    const viewNameInput = document.body.querySelector<HTMLInputElement>(
      "#eidos-file-managed-view-name"
    )
    expect(viewNameInput?.value).toBe("By status")
    expect(document.activeElement).toBe(viewNameInput)

    await act(async () => {
      if (viewNameInput) {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set?.call(viewNameInput, "Status board")
        viewNameInput.dispatchEvent(new Event("input", { bubbles: true }))
      }
      Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.trim() === "Save")
        ?.click()
      await Promise.resolve()
    })
    expect(onRenameView).toHaveBeenCalledWith("board", "Status board")

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })
      )
      await Promise.resolve()
      boardTab?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          button: 2,
          clientX: 40,
          clientY: 40,
        })
      )
      await Promise.resolve()
    })
    await act(async () => {
      Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
      )
        .find((item) => item.textContent?.includes("Delete view"))
        ?.click()
      await Promise.resolve()
    })
    expect(document.body.textContent).toContain("Delete “By status”?")
    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.trim() === "Delete")
        ?.click()
      await Promise.resolve()
    })
    expect(onDeleteView).toHaveBeenCalledWith("board")

    const projectsTab = sheetTabs?.querySelector<HTMLElement>(
      '[data-eidos-file-table-id="projects"]'
    )
    await act(async () => {
      projectsTab?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          button: 2,
          clientX: 40,
          clientY: 40,
        })
      )
      await Promise.resolve()
    })
    await act(async () => {
      Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
      )
        .find((item) => item.textContent?.includes("Rename table"))
        ?.click()
      await Promise.resolve()
    })
    const tableNameInput = Array.from(
      document.body.querySelectorAll<HTMLInputElement>("input")
    ).find((input) => input.value === "Projects")
    await act(async () => {
      if (tableNameInput) {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set?.call(tableNameInput, "Roadmap")
        tableNameInput.dispatchEvent(new Event("input", { bubbles: true }))
      }
      Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.trim() === "Rename")
        ?.click()
      await Promise.resolve()
    })
    expect(onRenameTable).toHaveBeenCalledWith(tables[1], "Roadmap")

    await act(async () => {
      projectsTab?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          button: 2,
          clientX: 40,
          clientY: 40,
        })
      )
      await Promise.resolve()
    })
    await act(async () => {
      Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
      )
        .find((item) => item.textContent?.includes("Delete table"))
        ?.click()
      await Promise.resolve()
    })
    expect(document.body.textContent).toContain("Delete table “Projects”?")
    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.trim() === "Delete table")
        ?.click()
      await Promise.resolve()
    })
    expect(onDeleteTable).toHaveBeenCalledWith(tables[1])
  })

  it("reveals directional controls when the view strip overflows", async () => {
    await act(async () => {
      root.render(
        <EidosFileViewTabs
          views={views}
          fields={[]}
          activeView={views[0]}
          onSelect={vi.fn()}
          onCreate={vi.fn()}
          onRename={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          onReorder={vi.fn()}
          onUpdate={vi.fn()}
        />
      )
    })

    const viewViewport = container.querySelector<HTMLElement>(
      "[data-eidos-file-view-tabs-viewport]"
    )
    expect(viewViewport).not.toBeNull()
    Object.defineProperties(viewViewport as HTMLElement, {
      clientWidth: { configurable: true, value: 180 },
      scrollLeft: { configurable: true, value: 0, writable: true },
      scrollWidth: { configurable: true, value: 600 },
    })

    act(() => window.dispatchEvent(new Event("resize")))

    const forward = container.querySelector<HTMLButtonElement>(
      '[aria-label="Scroll Eidos File views forward"]'
    )
    expect(forward).not.toBeNull()
    expect(
      container.querySelector('[aria-label="Scroll Eidos File views backward"]')
    ).toBeNull()

    act(() => forward?.click())

    expect(viewViewport?.scrollLeft).toBeGreaterThan(0)
    expect(
      container.querySelector('[aria-label="Scroll Eidos File views backward"]')
    ).not.toBeNull()
  })

  it("uses roving focus and standard horizontal tab keys", async () => {
    const onSelectView = vi.fn()
    const onSelectTable = vi.fn()
    await act(async () => {
      root.render(
        <div>
          <EidosFileViewTabs
            views={views}
            fields={[]}
            activeView={views[0]}
            onSelect={onSelectView}
            onCreate={vi.fn()}
            onRename={vi.fn()}
            onDuplicate={vi.fn()}
            onDelete={vi.fn()}
            onReorder={vi.fn()}
            onUpdate={vi.fn()}
          />
          <EidosFileSheetTabs
            tables={tables}
            activeTableId="tasks"
            onSelect={onSelectTable}
          />
        </div>
      )
    })

    const viewTabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Eidos File views"] [role="tab"]'
      )
    )
    const tableTabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Eidos File tables"] [role="tab"]'
      )
    )
    expect(viewTabs.map((tab) => tab.tabIndex)).toEqual([0, -1])
    expect(tableTabs.map((tab) => tab.tabIndex)).toEqual([0, -1])

    viewTabs[0].focus()
    act(() => {
      viewTabs[0].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      )
    })
    expect(onSelectView).toHaveBeenCalledWith("board")
    expect(document.activeElement).toBe(viewTabs[1])

    tableTabs[0].focus()
    act(() => {
      tableTabs[0].dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true })
      )
    })
    expect(onSelectTable).toHaveBeenCalledWith("projects")
    expect(document.activeElement).toBe(tableTabs[1])
  })

  it("keeps overflowing sheets navigable and reveals the active table", async () => {
    const renderSheets = async (activeTableId: string) => {
      await act(async () => {
        root.render(
          <EidosFileSheetTabs
            tables={tables}
            activeTableId={activeTableId}
            onSelect={vi.fn()}
          />
        )
      })
    }
    await renderSheets("tasks")

    const sheetViewport = container.querySelector<HTMLElement>(
      "[data-eidos-file-sheet-tabs-viewport]"
    )
    expect(sheetViewport).not.toBeNull()
    Object.defineProperties(sheetViewport as HTMLElement, {
      clientWidth: { configurable: true, value: 180 },
      scrollLeft: { configurable: true, value: 0, writable: true },
      scrollWidth: { configurable: true, value: 600 },
    })

    act(() => window.dispatchEvent(new Event("resize")))

    const forward = container.querySelector<HTMLButtonElement>(
      '[aria-label="Scroll Eidos File tables forward"]'
    )
    expect(forward).not.toBeNull()
    expect(
      container.querySelector(
        '[aria-label="Scroll Eidos File tables backward"]'
      )
    ).toBeNull()

    act(() => forward?.click())

    expect(sheetViewport?.scrollLeft).toBeGreaterThan(0)
    expect(
      container.querySelector(
        '[aria-label="Scroll Eidos File tables backward"]'
      )
    ).not.toBeNull()

    scrollIntoView.mockClear()
    await renderSheets("projects")
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    })
  })
})
