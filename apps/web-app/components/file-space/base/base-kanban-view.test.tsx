// @vitest-environment jsdom

import { act, type AriaRole } from "react"
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
    role,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode
    id: string
    role?: AriaRole
    "aria-label"?: string
  }) => (
    <section data-board-id={id} role={role} aria-label={ariaLabel}>
      {children}
    </section>
  ),
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
    moveOptions,
    onMove,
    focused,
  }: {
    row: { _id?: string; title?: string }
    onOpen: (row: { _id?: string; title?: string }) => void
    moveOptions?: Array<{ id: string; label: string; disabled?: boolean }>
    onMove?: (row: { _id?: string; title?: string }, targetId: string) => void
    focused?: boolean
  }) => (
    <div
      data-base-row-id={String(row._id)}
      aria-current={focused ? "true" : undefined}
    >
      <button onClick={() => onOpen(row)}>{row.title}</button>
      {moveOptions
        ?.filter((option) => !option.disabled)
        .map((option) => (
          <button key={option.id} onClick={() => onMove?.(row, option.id)}>
            Move {row.title} to {option.label}
          </button>
        ))}
    </div>
  ),
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
  const scrollIntoView = vi.fn()

  beforeEach(() => {
    kanbanMocks.onDragEnd = undefined
    scrollIntoView.mockReset()
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    })
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 640,
        height: 640,
        left: 0,
        right: 1024,
        top: 0,
        width: 1024,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })
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
    expect(
      container.querySelector('[role="region"][aria-label="Todo, 1 records"]')
    ).not.toBeNull()

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
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Write RFC moved from Todo to Done."
    )

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Move Write RFC to Todo")
        ?.click()
      await Promise.resolve()
    })
    expect(onCellEdit).toHaveBeenLastCalledWith(
      expect.objectContaining({ _id: "row_1", status: "done" }),
      expect.objectContaining({ tableColumnName: "status" }),
      "todo"
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

  it("loads the target group page and reveals a search result", async () => {
    const loadGroupPage = vi.fn(
      async (_field, value: string | null, offset: number, limit: number) => ({
        tableId: "tasks",
        offset,
        limit,
        total: value === "todo" ? 51 : 0,
        rows:
          value === "todo"
            ? Array.from({ length: offset === 0 ? 50 : 1 }, (_, index) => ({
                _id: `row_${offset + index}`,
                title: `Task ${offset + index}`,
                status: "todo",
              }))
            : [],
      })
    )
    const onRowCountChange = vi.fn()

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          searchResultIndex={50}
          loadGroupPage={loadGroupPage}
          onCellEdit={vi.fn()}
          onAddRow={vi.fn()}
          onRowCountChange={onRowCountChange}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(loadGroupPage).toHaveBeenCalledWith(
      expect.objectContaining({ tableColumnName: "status" }),
      "todo",
      50,
      50
    )
    expect(onRowCountChange).toHaveBeenLastCalledWith(51)
    expect(
      container
        .querySelector('[data-base-row-id="row_50"]')
        ?.getAttribute("aria-current")
    ).toBe("true")
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it("only mounts the horizontal window for a large set of columns", async () => {
    const manyOptions = Array.from({ length: 20 }, (_, index) => ({
      id: `status_${index}`,
      name: `Status ${index}`,
      color: "blue",
    }))
    const manyColumnTable: BaseTableSnapshot = {
      ...table,
      fields: table.fields.map((field) =>
        field.tableColumnName === "status"
          ? { ...field, property: { options: manyOptions } }
          : field
      ),
    }
    const loadGroupPage = vi.fn(async (_field, _value, offset, limit) => ({
      tableId: "tasks",
      offset,
      limit,
      total: 0,
      rows: [],
    }))

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={manyColumnTable}
          view={view}
          loadGroupPage={loadGroupPage}
          onCellEdit={vi.fn()}
          onAddRow={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    expect(loadGroupPage).toHaveBeenCalledTimes(21)
    const renderedColumns = container.querySelectorAll('[role="region"]')
    expect(renderedColumns.length).toBeGreaterThan(0)
    expect(renderedColumns.length).toBeLessThan(21)
  })
})
