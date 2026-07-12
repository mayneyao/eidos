// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { BaseTableSnapshot, BaseViewInfo } from "@eidos.space/base"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BaseKanbanView } from "./base-kanban-view"

const kanbanMocks = vi.hoisted(() => ({
  onDragEnd: undefined as ((event: unknown) => void) | undefined,
}))

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))

vi.mock("@/components/ui/kibo-ui/kanban", () => ({
  KanbanProvider: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode
    onDragEnd: (event: unknown) => void
  }) => {
    kanbanMocks.onDragEnd = onDragEnd
    return <div data-testid="kanban-provider">{children}</div>
  },
  KanbanBoard: ({
    children,
    id,
  }: {
    children: React.ReactNode
    id: string
  }) => <section data-board-id={id}>{children}</section>,
  KanbanCard: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  KanbanHeader: ({ children }: { children: React.ReactNode }) => (
    <header>{children}</header>
  ),
}))

vi.mock("./base-record-card", () => ({
  BaseRecordCard: ({
    row,
    onOpen,
  }: {
    row: { title?: string }
    onOpen: (row: { title?: string }) => void
  }) => <button onClick={() => onOpen(row)}>{row.title}</button>,
}))

vi.mock("./base-record-inspector", () => ({
  BaseRecordInspector: () => <aside data-testid="record-inspector" />,
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
        options: [
          { id: "todo", name: "Todo", color: "blue" },
          { id: "done", name: "Done", color: "green" },
        ],
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
  rowCount: 1,
}

const view: BaseViewInfo = {
  id: "view_board",
  name: "Board",
  type: "kanban",
  tableId: "tasks",
  query: "SELECT * FROM tb_tasks",
  properties: { cardSize: "medium", groupByField: "status" },
  filter: null,
  sorts: [],
  orderMap: null,
  hiddenFields: [],
  position: 1,
  createdAt: "2026-07-12 00:00:00",
  updatedAt: "2026-07-12 00:00:00",
}

describe("BaseKanbanView", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    kanbanMocks.onDragEnd = undefined
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("queries select groups and persists cross-column moves", async () => {
    const row = { _id: "row_1", title: "Write RFC", status: "todo" }
    const loadGroupPage = vi.fn(async (_field, value, offset, limit) => ({
      tableId: "tasks",
      offset,
      limit,
      total: value === "todo" ? 1 : 0,
      rows: value === "todo" ? [row] : [],
    }))
    const onCellEdit = vi.fn(async (candidate, field, value) => ({
      tableId: "tasks",
      row: { ...candidate, [field.tableColumnName]: value },
      rowCount: 1,
    }))

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          loadGroupPage={loadGroupPage}
          onCellEdit={onCellEdit}
          onAddRow={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    expect(loadGroupPage.mock.calls.map((call) => call[1])).toEqual([
      "todo",
      "done",
      null,
    ])
    expect(container.textContent).toContain("Write RFC")

    await act(async () => {
      kanbanMocks.onDragEnd?.({
        active: { id: "row_1" },
        over: { id: "base-kanban:done" },
      })
      await Promise.resolve()
    })
    expect(onCellEdit).toHaveBeenCalledWith(
      row,
      expect.objectContaining({ tableColumnName: "status" }),
      "done"
    )
  })

  it("creates a record directly in its target group", async () => {
    const onAddRow = vi.fn(async (_field, value, title) => ({
      tableId: "tasks",
      row: { _id: "row_new", title, status: value },
      rowCount: 1,
    }))

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          loadGroupPage={vi.fn(async (_field, _value, offset, limit) => ({
            tableId: "tasks",
            offset,
            limit,
            total: 0,
            rows: [],
          }))}
          onCellEdit={vi.fn()}
          onAddRow={onAddRow}
        />
      )
      await Promise.resolve()
    })

    const todoColumn = container.querySelector<HTMLElement>(
      '[data-board-id="base-kanban:todo"]'
    )
    await act(async () => {
      Array.from(todoColumn?.querySelectorAll("button") ?? [])
        .find((button) => button.textContent?.includes("Add record"))
        ?.click()
    })
    const input = todoColumn?.querySelector<HTMLInputElement>("input")
    await act(async () => {
      if (!input) return
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set
      setter?.call(input, "Draft release")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      Array.from(todoColumn?.querySelectorAll("button") ?? [])
        .find((button) => button.textContent === "Add")
        ?.click()
      await Promise.resolve()
    })

    expect(onAddRow).toHaveBeenCalledWith(
      expect.objectContaining({ tableColumnName: "status" }),
      "todo",
      "Draft release"
    )
    expect(todoColumn?.textContent).toContain("Draft release")
  })
})
