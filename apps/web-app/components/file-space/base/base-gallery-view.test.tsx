// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { BaseTableSnapshot, BaseViewInfo } from "@eidos.space/base"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BaseGalleryView } from "./base-gallery-view"

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))

vi.mock("./base-record-inspector", () => ({
  BaseRecordInspector: ({ row }: { row: { title?: string } }) => (
    <aside data-testid="record-inspector">{row.title}</aside>
  ),
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const table: BaseTableSnapshot = {
  table: {
    id: "tasks",
    name: "Tasks",
    rawTableName: "tb_tasks",
    position: 1,
    icon: null,
    description: null,
    createdAt: "2026-07-12 00:00:00",
    updatedAt: "2026-07-12 00:00:00",
  },
  fields: [
    {
      name: "Title",
      type: "title",
      tableName: "tb_tasks",
      tableColumnName: "title",
      property: null,
      storageCodec: "scalar",
      valueKind: "system",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    },
    {
      name: "Status",
      type: "select",
      tableName: "tb_tasks",
      tableColumnName: "status",
      property: {
        options: [{ id: "todo", name: "Todo", color: "blue" }],
      },
      storageCodec: "scalar",
      valueKind: "source",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    },
  ],
  views: [],
  rowCount: 3,
}

const view: BaseViewInfo = {
  id: "view_gallery",
  name: "Cards",
  type: "gallery",
  tableId: "tasks",
  query: "SELECT * FROM tb_tasks",
  properties: { cardSize: "medium", hideEmptyFields: true },
  filter: null,
  sorts: [],
  orderMap: null,
  hiddenFields: [],
  position: 1,
  createdAt: "2026-07-12 00:00:00",
  updatedAt: "2026-07-12 00:00:00",
}

describe("BaseGalleryView", () => {
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

  it("loads paged cards and opens the record inspector", async () => {
    const loadPage = vi.fn(async (offset: number, limit: number) => ({
      tableId: "tasks",
      offset,
      limit,
      total: 3,
      rows:
        offset === 0
          ? [
              { _id: "row_1", title: "Write RFC", status: "todo" },
              { _id: "row_2", title: "Ship Base", status: null },
            ]
          : [{ _id: "row_3", title: "Review UX", status: "todo" }],
    }))

    await act(async () => {
      root.render(
        <BaseGalleryView table={table} view={view} loadPage={loadPage} />
      )
      await Promise.resolve()
    })

    expect(loadPage).toHaveBeenCalledWith(0, 100)
    expect(container.textContent).toContain("Write RFC")
    expect(container.textContent).toContain("Todo")
    expect(container.querySelector('[role="list"]')).not.toBeNull()
    expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(2)

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Open Write RFC"]')
        ?.click()
    })
    expect(
      container.querySelector('[data-testid="record-inspector"]')?.textContent
    ).toBe("Write RFC")

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Load more"))
        ?.click()
      await Promise.resolve()
    })
    expect(loadPage).toHaveBeenLastCalledWith(2, 100)
    expect(container.textContent).toContain("Review UX")
  })
})
