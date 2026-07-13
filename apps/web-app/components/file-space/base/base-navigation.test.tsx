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

describe("Base navigation hierarchy", () => {
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
})
