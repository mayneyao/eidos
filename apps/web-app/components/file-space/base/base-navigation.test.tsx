// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { BaseTableInfo, BaseViewInfo } from "@eidos.space/base"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BaseSheetTabs } from "./base-sheet-tabs"
import { BaseViewTabs } from "./base-view-tabs"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const tables: BaseTableInfo[] = [
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

const views: BaseViewInfo[] = [
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
    properties: { groupByField: "status" },
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

describe("Base navigation hierarchy", () => {
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
    await act(async () => {
      root.render(
        <div>
          <BaseViewTabs
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
          <BaseSheetTabs
            tables={tables}
            activeTableId="tasks"
            onSelect={onSelectTable}
            onCreate={onCreateTable}
          />
        </div>
      )
    })

    const viewTabs = container.querySelector(
      '[role="tablist"][aria-label="Base views"]'
    )
    const sheetTabs = container.querySelector(
      '[role="tablist"][aria-label="Base tables"]'
    )
    expect(viewTabs?.textContent).toContain("All tasks")
    expect(viewTabs?.textContent).toContain("By status")
    expect(sheetTabs?.textContent).toContain("Tasks")
    expect(sheetTabs?.textContent).toContain("Projects")
    expect(sheetTabs?.getAttribute("aria-keyshortcuts")).toBe(
      "Control+PageUp Control+PageDown"
    )
    expect(sheetTabs?.closest("[data-base-sheet-tabs]")?.className).toContain(
      "eidos-shell-statusbar"
    )
    expect(
      sheetTabs?.querySelector('[role="tab"][aria-selected="true"]')
        ?.textContent
    ).toContain("Tasks")

    await act(async () => {
      Array.from(viewTabs?.querySelectorAll<HTMLButtonElement>("button") ?? [])
        .find((button) => button.textContent?.includes("By status"))
        ?.click()
      Array.from(sheetTabs?.querySelectorAll<HTMLButtonElement>("button") ?? [])
        .find((button) => button.textContent?.includes("Projects"))
        ?.click()
      container
        .querySelector<HTMLButtonElement>('[aria-label="Add Base table"]')
        ?.click()
    })

    expect(onSelectView).toHaveBeenCalledWith("board")
    expect(onSelectTable).toHaveBeenCalledWith("projects")
    expect(onCreateTable).toHaveBeenCalledOnce()
  })

  it("reveals directional controls when the view strip overflows", async () => {
    await act(async () => {
      root.render(
        <BaseViewTabs
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

    const viewTabs = container.querySelector<HTMLElement>(
      '[role="tablist"][aria-label="Base views"]'
    )
    expect(viewTabs).not.toBeNull()
    Object.defineProperties(viewTabs as HTMLElement, {
      clientWidth: { configurable: true, value: 180 },
      scrollLeft: { configurable: true, value: 0, writable: true },
      scrollWidth: { configurable: true, value: 600 },
    })

    act(() => window.dispatchEvent(new Event("resize")))

    const forward = container.querySelector<HTMLButtonElement>(
      '[aria-label="Scroll Base views forward"]'
    )
    expect(forward).not.toBeNull()
    expect(
      container.querySelector('[aria-label="Scroll Base views backward"]')
    ).toBeNull()

    act(() => forward?.click())

    expect(viewTabs?.scrollLeft).toBeGreaterThan(0)
    expect(
      container.querySelector('[aria-label="Scroll Base views backward"]')
    ).not.toBeNull()
  })

  it("uses roving focus and standard horizontal tab keys", async () => {
    const onSelectView = vi.fn()
    const onSelectTable = vi.fn()
    await act(async () => {
      root.render(
        <div>
          <BaseViewTabs
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
          <BaseSheetTabs
            tables={tables}
            activeTableId="tasks"
            onSelect={onSelectTable}
            onCreate={vi.fn()}
          />
        </div>
      )
    })

    const viewTabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Base views"] [role="tab"]'
      )
    )
    const tableTabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Base tables"] [role="tab"]'
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
          <BaseSheetTabs
            tables={tables}
            activeTableId={activeTableId}
            onSelect={vi.fn()}
            onCreate={vi.fn()}
          />
        )
      })
    }
    await renderSheets("tasks")

    const sheetTabs = container.querySelector<HTMLElement>(
      '[role="tablist"][aria-label="Base tables"]'
    )
    expect(sheetTabs).not.toBeNull()
    Object.defineProperties(sheetTabs as HTMLElement, {
      clientWidth: { configurable: true, value: 180 },
      scrollLeft: { configurable: true, value: 0, writable: true },
      scrollWidth: { configurable: true, value: 600 },
    })

    act(() => window.dispatchEvent(new Event("resize")))

    const forward = container.querySelector<HTMLButtonElement>(
      '[aria-label="Scroll Base tables forward"]'
    )
    expect(forward).not.toBeNull()
    expect(
      container.querySelector('[aria-label="Scroll Base tables backward"]')
    ).toBeNull()

    act(() => forward?.click())

    expect(sheetTabs?.scrollLeft).toBeGreaterThan(0)
    expect(
      container.querySelector('[aria-label="Scroll Base tables backward"]')
    ).not.toBeNull()

    scrollIntoView.mockClear()
    await renderSheets("projects")
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    })
  })
})
