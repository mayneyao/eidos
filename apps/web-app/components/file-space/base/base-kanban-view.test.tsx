// @vitest-environment jsdom

import { act, type AriaRole } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  BaseRowPage,
  BaseTableSnapshot,
  BaseViewInfo,
} from "@eidos.space/base"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BaseKanbanView } from "./base-kanban-view"
import {
  BASE_VIRTUAL_SCROLL_MAX_ITEMS,
  BASE_VIRTUAL_SCROLL_MAX_SIZE,
} from "./base-virtual-scroll"

const kanbanMocks = vi.hoisted(() => ({
  onDragEnd: undefined as ((event: unknown) => void) | undefined,
  onDragStart: undefined as ((event: unknown) => void) | undefined,
}))

const recordCardMocks = vi.hoisted(() => ({
  renders: new Map<string, number>(),
}))

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))

vi.mock("@/components/ui/kibo-ui/kanban", () => ({
  KanbanProvider: ({
    children,
    onDragEnd,
    onDragStart,
  }: {
    children: React.ReactNode
    onDragEnd: (event: unknown) => void
    onDragStart?: (event: unknown) => void
  }) => {
    kanbanMocks.onDragEnd = onDragEnd
    kanbanMocks.onDragStart = onDragStart
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
  KanbanCard: ({
    children,
    disabled,
  }: {
    children: React.ReactNode
    disabled?: boolean
  }) => (
    <div data-kanban-card-disabled={String(Boolean(disabled))}>{children}</div>
  ),
  KanbanHeader: ({ children }: { children: React.ReactNode }) => (
    <header>{children}</header>
  ),
}))

vi.mock("./base-record-card", () => ({
  BaseRecordCard: ({
    row,
    onOpen,
    onDelete,
    moveOptions,
    onMove,
    focused,
  }: {
    row: { _id?: string; title?: string }
    onOpen: (row: { _id?: string; title?: string }) => void
    onDelete?: (row: { _id?: string; title?: string }) => void
    moveOptions?: Array<{ id: string; label: string; disabled?: boolean }>
    onMove?: (row: { _id?: string; title?: string }, targetId: string) => void
    focused?: boolean
  }) => {
    const rowId = String(row._id)
    recordCardMocks.renders.set(
      rowId,
      (recordCardMocks.renders.get(rowId) ?? 0) + 1
    )
    return (
      <div data-base-row-id={rowId} aria-current={focused ? "true" : undefined}>
        <button onClick={() => onOpen(row)}>{row.title}</button>
        {onDelete ? (
          <button type="button" onClick={() => onDelete(row)}>
            Delete {row.title}
          </button>
        ) : null}
        {moveOptions
          ?.filter((option) => !option.disabled)
          .map((option) => (
            <button key={option.id} onClick={() => onMove?.(row, option.id)}>
              Move {row.title} to {option.label}
            </button>
          ))}
      </div>
    )
  },
}))

vi.mock("./base-record-delete-dialog", () => ({
  BaseRecordDeleteDialog: ({
    row,
    onDelete,
    onOpenChange,
  }: {
    row: { _id?: string; title?: string } | null
    onDelete: (row: { _id?: string; title?: string }) => Promise<void>
    onOpenChange: (open: boolean) => void
  }) =>
    row ? (
      <button
        type="button"
        onClick={() => void onDelete(row).then(() => onOpenChange(false))}
      >
        Confirm delete {row.title}
      </button>
    ) : null,
}))

vi.mock("./base-record-inspector", () => ({
  BaseRecordInspector: ({
    row,
    fields,
    onCellEdit,
  }: {
    row: { _id?: string; title?: string; status?: string; priority?: string }
    fields: Array<{ tableColumnName: string }>
    onCellEdit: (
      row: {
        _id?: string
        title?: string
        status?: string
        priority?: string
      },
      field: { tableColumnName: string },
      value: string
    ) => Promise<unknown>
  }) => (
    <aside data-testid="record-inspector">
      <button
        type="button"
        onClick={() => {
          const status = fields.find(
            (field) => field.tableColumnName === "status"
          )
          if (status) void onCellEdit(row, status, "done")
        }}
      >
        Set status to Done
      </button>
      <button
        type="button"
        onClick={() => {
          const priority = fields.find(
            (field) => field.tableColumnName === "priority"
          )
          if (priority) void onCellEdit(row, priority, "high")
        }}
      >
        Set priority to High
      </button>
    </aside>
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, reject, resolve }
}

describe("BaseKanbanView", () => {
  let container: HTMLDivElement
  let root: Root
  const scrollIntoView = vi.fn()

  beforeEach(() => {
    kanbanMocks.onDragEnd = undefined
    kanbanMocks.onDragStart = undefined
    recordCardMocks.renders.clear()
    scrollIntoView.mockReset()
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get: () => 1024,
    })
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get: () => 640,
    })
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value(this: HTMLElement, options: ScrollToOptions) {
        this.scrollTop = typeof options.top === "number" ? options.top : 0
        queueMicrotask(() => this.dispatchEvent(new Event("scroll")))
      },
    })
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
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

  afterEach(async () => {
    act(() => root.unmount())
    container.remove()
    await new Promise((resolve) => setTimeout(resolve, 200))
    vi.unstubAllGlobals()
  })

  it("queries select groups and persists cross-column moves", async () => {
    const row = { _id: "row_1", title: "Write RFC", status: "todo" }
    const loadGroupCounts = vi.fn(async () => [{ value: "todo", total: 1 }])
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
          loadGroupCounts={loadGroupCounts}
          loadGroupPage={loadGroupPage}
          onCellEdit={onCellEdit}
          onAddRow={vi.fn()}
        />
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.firstElementChild?.classList).toContain(
      "base-detail-layout"
    )
    expect(loadGroupCounts).toHaveBeenCalledTimes(1)
    expect(loadGroupPage.mock.calls.map((call) => call[1])).toEqual([
      "todo",
      "done",
      null,
    ])
    expect(container.textContent).toContain("Write RFC")
    expect(
      container.querySelector('[role="region"][aria-label="Todo, 1 records"]')
    ).not.toBeNull()
    expect(
      container.querySelector('[role="list"][aria-label="Todo records"]')
    ).not.toBeNull()
    expect(
      container
        .querySelector('[data-base-row-id="row_1"]')
        ?.closest('[role="listitem"]')
        ?.getAttribute("aria-posinset")
    ).toBe("1")
    expect(
      container
        .querySelector('[data-base-row-id="row_1"]')
        ?.closest('[role="listitem"]')
        ?.getAttribute("aria-setsize")
    ).toBe("1")

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

  it("serializes card moves so a failed save cannot duplicate a record", async () => {
    const row = { _id: "row_1", title: "Write RFC", status: "todo" }
    const firstMove = deferred<{
      tableId: string
      row: typeof row
      rowCount: number
    }>()
    const onCellEdit = vi.fn(() => firstMove.promise)

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          loadGroupCounts={vi.fn(async () => [{ value: "todo", total: 1 }])}
          loadGroupPage={vi.fn(async (_field, value, offset, limit) => ({
            tableId: "tasks",
            offset,
            limit,
            total: value === "todo" ? 1 : 0,
            rows: value === "todo" ? [row] : [],
          }))}
          onCellEdit={onCellEdit}
          onAddRow={vi.fn()}
        />
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    await act(async () => {
      kanbanMocks.onDragEnd?.({
        active: { id: "row_1" },
        over: { id: "base-kanban:done" },
      })
      await Promise.resolve()
    })

    expect(onCellEdit).toHaveBeenCalledTimes(1)
    expect(
      container
        .querySelector('[data-base-row-id="row_1"]')
        ?.parentElement?.getAttribute("data-kanban-card-disabled")
    ).toBe("true")
    expect(
      container
        .querySelector("[data-base-kanban-scroll]")
        ?.getAttribute("aria-busy")
    ).toBe("true")
    expect(container.textContent).not.toContain("Move Write RFC to No status")

    await act(async () => {
      kanbanMocks.onDragEnd?.({
        active: { id: "row_1" },
        over: { id: "base-kanban:__eidos_empty_group__" },
      })
      await Promise.resolve()
    })

    expect(onCellEdit).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Another record move is still saving."
    )

    await act(async () => {
      firstMove.reject(new Error("disk is read-only"))
      await firstMove.promise.catch(() => undefined)
      await Promise.resolve()
    })

    expect(
      container.querySelectorAll('[data-base-row-id="row_1"]')
    ).toHaveLength(1)
    expect(
      container.querySelector('[role="region"][aria-label="Todo, 1 records"]')
        ?.textContent
    ).toContain("Write RFC")
    expect(
      container.querySelector('[role="region"][aria-label="Done, 0 records"]')
    ).not.toBeNull()
    expect(
      container.querySelector(
        '[role="region"][aria-label="No status, 0 records"]'
      )
    ).not.toBeNull()
    expect(
      container
        .querySelector('[data-base-row-id="row_1"]')
        ?.parentElement?.getAttribute("data-kanban-card-disabled")
    ).toBe("false")
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "The change was reverted."
    )
  })

  it("recovers an initial grouped-count failure inside the board", async () => {
    const row = { _id: "row_1", title: "Recovered record", status: "todo" }
    const onError = vi.fn()
    const loadGroupCounts = vi
      .fn()
      .mockRejectedValueOnce(new Error("counts failed"))
      .mockResolvedValueOnce([{ value: "todo", total: 1 }])
    const loadGroupPage = vi.fn(async (_field, value, offset, limit) => ({
      tableId: "tasks",
      offset,
      limit,
      total: value === "todo" ? 1 : 0,
      rows: value === "todo" ? [row] : [],
    }))

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          loadGroupCounts={loadGroupCounts}
          loadGroupPage={loadGroupPage}
          onCellEdit={vi.fn()}
          onAddRow={vi.fn()}
          onError={onError}
        />
      )
      await Promise.resolve()
    })

    expect(loadGroupCounts).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    expect(container.textContent).toContain("Could not load Kanban records")
    expect(
      container
        .querySelector("[data-base-kanban-scroll]")
        ?.getAttribute("aria-busy")
    ).toBe("false")

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Retry")
        ?.click()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(loadGroupCounts).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain("Recovered record")
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
          loadGroupCounts={vi.fn(async () => [])}
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
    expect(input?.getAttribute("aria-label")).toBe("Record title in Todo")
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

  it("keeps failed inline creation recoverable without a global error", async () => {
    const onAddRow = vi
      .fn()
      .mockRejectedValueOnce(new Error("Base is read-only"))
      .mockResolvedValueOnce({
        tableId: "tasks",
        row: { _id: "row_new", title: "Draft release", status: "todo" },
        rowCount: 1,
      })
    const onError = vi.fn()

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          loadGroupCounts={vi.fn(async () => [])}
          loadGroupPage={vi.fn(async (_field, _value, offset, limit) => ({
            tableId: "tasks",
            offset,
            limit,
            total: 0,
            rows: [],
          }))}
          onCellEdit={vi.fn()}
          onAddRow={onAddRow}
          onError={onError}
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
    const addButton = Array.from(
      todoColumn?.querySelectorAll("button") ?? []
    ).find((button) => button.textContent === "Add")
    await act(async () => {
      addButton?.click()
      addButton?.click()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onAddRow).toHaveBeenCalledOnce()
    expect(todoColumn?.querySelector('[role="alert"]')?.textContent).toContain(
      "Base is read-only"
    )
    expect(todoColumn?.querySelector<HTMLInputElement>("input")?.value).toBe(
      "Draft release"
    )
    expect(onError).not.toHaveBeenCalled()

    await act(async () => {
      Array.from(todoColumn?.querySelectorAll("button") ?? [])
        .find((button) => button.textContent === "Add")
        ?.click()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onAddRow).toHaveBeenCalledTimes(2)
    expect(todoColumn?.querySelector('[role="alert"]')).toBeNull()
    expect(todoColumn?.textContent).toContain("Draft release")
  })

  it("deletes a loaded card without requerying the board", async () => {
    const row = { _id: "row_1", title: "Write RFC", status: "todo" }
    const loadGroupCounts = vi.fn(async () => [{ value: "todo", total: 1 }])
    const loadGroupPage = vi.fn(async (_field, value, offset, limit) => ({
      tableId: "tasks",
      offset,
      limit,
      total: value === "todo" ? 1 : 0,
      rows: value === "todo" ? [row] : [],
    }))
    const onDeleteRow = vi.fn(async () => undefined)
    const onRowCountChange = vi.fn()

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          loadGroupCounts={loadGroupCounts}
          loadGroupPage={loadGroupPage}
          onCellEdit={vi.fn()}
          onAddRow={vi.fn()}
          onDeleteRow={onDeleteRow}
          onRowCountChange={onRowCountChange}
        />
      )
      await Promise.resolve()
    })
    const pageCalls = loadGroupPage.mock.calls.length

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Delete Write RFC")
        ?.click()
    })
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Confirm delete Write RFC")
        ?.click()
      await Promise.resolve()
    })

    expect(onDeleteRow).toHaveBeenCalledWith(row)
    expect(
      container.querySelector('[role="region"][aria-label="Todo, 0 records"]')
    ).not.toBeNull()
    expect(loadGroupCounts).toHaveBeenCalledTimes(1)
    expect(loadGroupPage).toHaveBeenCalledTimes(pageCalls)
    expect(onRowCountChange).toHaveBeenLastCalledWith(0)
  })

  it("keeps cards mounted while grouped counts and visible pages refresh", async () => {
    let refreshing = false
    let resolveCounts:
      | ((counts: Array<{ value: string | null; total: number }>) => void)
      | undefined
    let resolveTodoPage: ((page: BaseRowPage) => void) | undefined
    const loadGroupCounts = vi.fn(() => {
      if (!refreshing) {
        return Promise.resolve([{ value: "todo", total: 1 }])
      }
      return new Promise<Array<{ value: string | null; total: number }>>(
        (resolve) => {
          resolveCounts = resolve
        }
      )
    })
    const loadGroupPage = vi.fn(
      (_field, value: string | null, offset: number, limit: number) => {
        if (refreshing && value === "todo") {
          return new Promise<BaseRowPage>((resolve) => {
            resolveTodoPage = resolve
          })
        }
        return Promise.resolve({
          tableId: "tasks",
          offset,
          limit,
          total: value === "todo" ? 1 : 0,
          rows:
            value === "todo"
              ? [{ _id: "row_old", title: "Before refresh", status: "todo" }]
              : [],
        })
      }
    )
    const onRowCountChange = vi.fn()

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          reloadToken={0}
          loadGroupCounts={loadGroupCounts}
          loadGroupPage={loadGroupPage}
          onCellEdit={vi.fn()}
          onAddRow={vi.fn()}
          onRowCountChange={onRowCountChange}
        />
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.textContent).toContain("Before refresh")
    onRowCountChange.mockClear()

    refreshing = true
    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          reloadToken={1}
          loadGroupCounts={loadGroupCounts}
          loadGroupPage={loadGroupPage}
          onCellEdit={vi.fn()}
          onAddRow={vi.fn()}
          onRowCountChange={onRowCountChange}
        />
      )
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Before refresh")
    expect(
      container
        .querySelector("[data-base-kanban-scroll]")
        ?.getAttribute("aria-busy")
    ).toBe("true")

    await act(async () => {
      resolveCounts?.([{ value: "todo", total: 1 }])
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.textContent).toContain("Before refresh")
    expect(resolveTodoPage).toBeTypeOf("function")
    const rowCountNotifications = onRowCountChange.mock.calls.length
    expect(
      container
        .querySelector("[data-base-kanban-scroll]")
        ?.getAttribute("aria-busy")
    ).toBe("true")

    await act(async () => {
      resolveTodoPage?.({
        tableId: "tasks",
        offset: 0,
        limit: 50,
        total: 1,
        rows: [{ _id: "row_new", title: "After refresh", status: "todo" }],
      })
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).not.toContain("Before refresh")
    expect(container.textContent).toContain("After refresh")
    expect(onRowCountChange).toHaveBeenCalledTimes(rowCountNotifications)
    expect(
      container
        .querySelector("[data-base-kanban-scroll]")
        ?.getAttribute("aria-busy")
    ).toBe("false")
  })

  it("keeps the mounted board available when grouped-count refresh fails", async () => {
    const row = { _id: "row_1", title: "Stable record", status: "todo" }
    const onError = vi.fn()
    const loadGroupCounts = vi
      .fn()
      .mockResolvedValueOnce([{ value: "todo", total: 1 }])
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockResolvedValueOnce([{ value: "todo", total: 1 }])
    const loadGroupPage = vi.fn(async (_field, value, offset, limit) => ({
      tableId: "tasks",
      offset,
      limit,
      total: value === "todo" ? 1 : 0,
      rows: value === "todo" ? [row] : [],
    }))
    const onCellEdit = vi.fn()
    const onAddRow = vi.fn()

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          reloadToken={0}
          loadGroupCounts={loadGroupCounts}
          loadGroupPage={loadGroupPage}
          onCellEdit={onCellEdit}
          onAddRow={onAddRow}
          onError={onError}
        />
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.textContent).toContain("Stable record")

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          reloadToken={1}
          loadGroupCounts={loadGroupCounts}
          loadGroupPage={loadGroupPage}
          onCellEdit={onCellEdit}
          onAddRow={onAddRow}
          onError={onError}
        />
      )
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Stable record")
    expect(container.textContent).toContain("Could not refresh Kanban records")
    expect(onError).not.toHaveBeenCalled()
    expect(
      container
        .querySelector("[data-base-kanban-scroll]")
        ?.getAttribute("aria-busy")
    ).toBe("false")

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Retry")
        ?.click()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(loadGroupCounts).toHaveBeenCalledTimes(3)
    expect(container.textContent).toContain("Stable record")
    expect(container.textContent).not.toContain(
      "Could not refresh Kanban records"
    )
  })

  it("moves an inspected record when its group field changes", async () => {
    const row = { _id: "row_1", title: "Write RFC", status: "todo" }
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
          loadGroupCounts={vi.fn(async () => [{ value: "todo", total: 1 }])}
          loadGroupPage={vi.fn(async (_field, value, offset, limit) => ({
            tableId: "tasks",
            offset,
            limit,
            total: value === "todo" ? 1 : 0,
            rows: value === "todo" ? [row] : [],
          }))}
          onCellEdit={onCellEdit}
          onAddRow={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Write RFC")
        ?.click()
    })
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Set status to Done")
        ?.click()
      await Promise.resolve()
    })

    expect(onCellEdit).toHaveBeenCalledWith(
      row,
      expect.objectContaining({ tableColumnName: "status" }),
      "done"
    )
    expect(
      container.querySelector('[role="region"][aria-label="Todo, 0 records"]')
    ).not.toBeNull()
    expect(
      container.querySelector('[role="region"][aria-label="Done, 1 records"]')
        ?.textContent
    ).toContain("Write RFC")
  })

  it("keeps the server page cursor contiguous after moving a loaded row", async () => {
    const initialRows = Array.from({ length: 50 }, (_, index) => ({
      _id: `row_${index}`,
      title: `Task ${index}`,
      status: "todo",
    }))
    const initialDoneRows = Array.from({ length: 50 }, (_, index) => ({
      _id: `done_${index}`,
      title: `Done ${index}`,
      status: "done",
    }))
    const loadGroupPage = vi.fn(
      async (_field, value: string | null, offset: number, limit: number) => ({
        tableId: "tasks",
        offset,
        limit,
        total:
          value === "todo"
            ? offset === 0
              ? 51
              : 50
            : value === "done"
              ? 51
              : 0,
        rows:
          value === "todo"
            ? offset === 0
              ? initialRows
              : [{ _id: "row_50", title: "Task 50", status: "todo" }]
            : value === "done" && offset === 0
              ? initialDoneRows
              : [],
      })
    )

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          loadGroupCounts={vi.fn(async () => [
            { value: "todo", total: 51 },
            { value: "done", total: 51 },
          ])}
          loadGroupPage={loadGroupPage}
          onCellEdit={vi.fn(async (candidate, field, value) => ({
            tableId: "tasks",
            row: { ...candidate, [field.tableColumnName]: value },
            rowCount: 51,
          }))}
          onAddRow={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    loadGroupPage.mockClear()
    await act(async () => {
      kanbanMocks.onDragEnd?.({
        active: { id: "row_0" },
        over: { id: "base-kanban:done" },
      })
      await Promise.resolve()
    })
    await act(async () => {
      const scroller = container.querySelector<HTMLElement>(
        '[data-base-kanban-column-scroll="base-kanban:todo"]'
      )
      if (!scroller) return
      scroller.scrollTop = 100_000
      scroller.dispatchEvent(new Event("scroll"))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await act(async () => {
      const scroller = container.querySelector<HTMLElement>(
        '[data-base-kanban-column-scroll="base-kanban:done"]'
      )
      if (!scroller) return
      scroller.scrollTop = 100_000
      scroller.dispatchEvent(new Event("scroll"))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(loadGroupPage).toHaveBeenCalledWith(
      expect.objectContaining({ tableColumnName: "status" }),
      "todo",
      49,
      50,
      50
    )
    expect(loadGroupPage).toHaveBeenCalledWith(
      expect.objectContaining({ tableColumnName: "status" }),
      "done",
      0,
      50,
      52
    )
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
          loadGroupCounts={vi.fn(async () => [{ value: "todo", total: 51 }])}
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
      50,
      51
    )
    expect(onRowCountChange).toHaveBeenLastCalledWith(51)
    expect(
      container
        .querySelector('[data-base-row-id="row_50"]')
        ?.getAttribute("aria-current")
    ).toBe("true")
  })

  it("virtualizes a million-card column and loads the target window on scroll", async () => {
    const loadGroupPage = vi.fn(
      async (_field, value: string | null, offset: number, limit: number) => ({
        tableId: "tasks",
        offset,
        limit,
        total: value === "todo" ? 1_000_000 : 0,
        rows:
          value === "todo"
            ? Array.from({ length: 50 }, (_, index) => ({
                _id: `row_${offset + index}`,
                title: `Task ${offset + index}`,
                status: "todo",
              }))
            : [],
      })
    )

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          loadGroupCounts={vi.fn(async () => [
            { value: "todo", total: 1_000_000 },
          ])}
          loadGroupPage={loadGroupPage}
          onCellEdit={vi.fn()}
          onAddRow={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    const todoColumn = container.querySelector<HTMLElement>(
      '[data-board-id="base-kanban:todo"]'
    )
    const initialMountedCards =
      todoColumn?.querySelectorAll("[data-base-row-id]").length
    expect(initialMountedCards).toBeGreaterThan(0)
    expect(initialMountedCards).toBeLessThan(50)
    const virtualList = todoColumn?.querySelector<HTMLElement>(
      '[role="list"][data-base-physical-size]'
    )
    expect(Number(virtualList?.dataset.baseLogicalSize)).toBeGreaterThan(
      BASE_VIRTUAL_SCROLL_MAX_SIZE
    )
    expect(Number(virtualList?.dataset.basePhysicalSize)).toBe(
      BASE_VIRTUAL_SCROLL_MAX_SIZE
    )
    expect(Number(virtualList?.dataset.baseMeasurementCount)).toBe(
      BASE_VIRTUAL_SCROLL_MAX_ITEMS
    )

    await act(async () => {
      const scroller = todoColumn?.querySelector<HTMLElement>(
        '[data-base-kanban-column-scroll="base-kanban:todo"]'
      )
      if (!scroller) return
      const physicalSize = Number(
        scroller.querySelector<HTMLElement>("[data-base-physical-size]")
          ?.dataset.basePhysicalSize
      )
      scroller.scrollTop = Math.max(0, physicalSize - 640)
      scroller.dispatchEvent(new Event("scroll"))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(loadGroupPage).toHaveBeenCalledWith(
      expect.objectContaining({ tableColumnName: "status" }),
      "todo",
      999_950,
      50,
      1_000_000
    )
    expect(
      todoColumn
        ?.querySelector("[data-base-kanban-column-scroll]")
        ?.getAttribute("data-base-window-start")
    ).toBe("999950")
    expect(
      Number(
        todoColumn
          ?.querySelector("[data-base-kanban-column-scroll]")
          ?.getAttribute("data-base-window-size")
      )
    ).toBeLessThanOrEqual(150)
    expect(
      todoColumn?.querySelectorAll("[data-base-row-id]").length
    ).toBeLessThan(50)

    await act(async () => {
      const scroller = todoColumn?.querySelector<HTMLElement>(
        '[data-base-kanban-column-scroll="base-kanban:todo"]'
      )
      if (!scroller) return
      scroller.scrollTop = 0
      scroller.dispatchEvent(new Event("scroll"))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(loadGroupPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ tableColumnName: "status" }),
      "todo",
      0,
      50,
      1_000_000
    )
    expect(
      todoColumn
        ?.querySelector("[data-base-kanban-column-scroll]")
        ?.getAttribute("data-base-window-start")
    ).toBe("0")
  })

  it("keeps a distant virtual card wrapper mounted when its page arrives", async () => {
    let resolveTargetPage: ((page: BaseRowPage) => void) | undefined
    const loadGroupPage = vi.fn(
      (_field, value: string | null, offset: number, limit: number) => {
        if (value !== "todo") {
          return Promise.resolve({
            tableId: "tasks",
            offset,
            limit,
            total: 0,
            rows: [],
          })
        }
        if (offset === 0) {
          return Promise.resolve({
            tableId: "tasks",
            offset,
            limit,
            total: 100_000,
            rows: Array.from({ length: 50 }, (_, index) => ({
              _id: `row_${index}`,
              title: `Task ${index}`,
              status: "todo",
            })),
          })
        }
        return new Promise<BaseRowPage>((resolve) => {
          resolveTargetPage = resolve
        })
      }
    )

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          loadGroupCounts={vi.fn(async () => [
            { value: "todo", total: 100_000 },
          ])}
          loadGroupPage={loadGroupPage}
          onCellEdit={vi.fn()}
          onAddRow={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    await act(async () => {
      const scroller = container.querySelector<HTMLElement>(
        '[data-base-kanban-column-scroll="base-kanban:todo"]'
      )
      if (!scroller) return
      const physicalSize = Number(
        scroller.querySelector<HTMLElement>("[data-base-physical-size]")
          ?.dataset.basePhysicalSize
      )
      scroller.scrollTop = Math.max(0, physicalSize - 640)
      scroller.dispatchEvent(new Event("scroll"))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const targetCall = loadGroupPage.mock.calls.find(
      ([, value, offset]) => value === "todo" && offset > 0
    )
    const targetOffset = targetCall?.[2]
    expect(targetOffset).toBeTypeOf("number")
    expect(resolveTargetPage).toBeTypeOf("function")
    const placeholder = container.querySelector<HTMLElement>(
      "[data-base-kanban-placeholder]"
    )
    const wrapper = placeholder?.closest<HTMLElement>("[data-index]")
    const virtualIndex = wrapper?.dataset.index
    expect(wrapper).not.toBeNull()
    expect(virtualIndex).toBeTruthy()

    await act(async () => {
      resolveTargetPage?.({
        tableId: "tasks",
        offset: targetOffset ?? 0,
        limit: 50,
        total: 100_000,
        rows: Array.from({ length: 50 }, (_, index) => ({
          _id: `row_${(targetOffset ?? 0) + index}`,
          title: `Task ${(targetOffset ?? 0) + index}`,
          status: "todo",
        })),
      })
      await Promise.resolve()
    })

    expect(container.querySelector(`[data-index="${virtualIndex}"]`)).toBe(
      wrapper
    )
  })

  it("prefetches a group page before visible cards reach the loaded edge", async () => {
    let resolveNextPage: ((page: BaseRowPage) => void) | undefined
    const loadGroupPage = vi.fn(
      (_field, value: string | null, offset: number, limit: number) => {
        if (value === "todo" && offset === 50) {
          return new Promise<BaseRowPage>((resolve) => {
            resolveNextPage = resolve
          })
        }
        return Promise.resolve({
          tableId: "tasks",
          offset,
          limit,
          total: value === "todo" ? 500 : 0,
          ...(value === "todo" ? { nextCursor: `rowid:${offset + 50}` } : {}),
          rows:
            value === "todo"
              ? Array.from({ length: 50 }, (_, index) => ({
                  _id: `row_${offset + index}`,
                  title: `Task ${offset + index}`,
                  status: "todo",
                }))
              : [],
        })
      }
    )

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          loadGroupCounts={vi.fn(async () => [{ value: "todo", total: 500 }])}
          loadGroupPage={loadGroupPage}
          onCellEdit={vi.fn()}
          onAddRow={vi.fn()}
        />
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    loadGroupPage.mockClear()

    const scroller = container.querySelector<HTMLElement>(
      '[data-base-kanban-column-scroll="base-kanban:todo"]'
    )
    for (
      let scrollTop = 500;
      scrollTop <= 20_000 && loadGroupPage.mock.calls.length === 0;
      scrollTop += 500
    ) {
      await act(async () => {
        if (!scroller) return
        scroller.scrollTop = scrollTop
        scroller.dispatchEvent(new Event("scroll"))
        await Promise.resolve()
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }

    expect(loadGroupPage).toHaveBeenCalledWith(
      expect.objectContaining({ tableColumnName: "status" }),
      "todo",
      50,
      50,
      500,
      "rowid:50"
    )
    expect(
      container.querySelectorAll("[data-base-kanban-placeholder]")
    ).toHaveLength(0)
    expect(
      container
        .querySelector('[data-base-kanban-column-scroll="base-kanban:todo"]')
        ?.getAttribute("data-base-window-start")
    ).toBe("0")

    await act(async () => {
      resolveNextPage?.({
        tableId: "tasks",
        offset: 50,
        limit: 50,
        total: 500,
        nextCursor: "rowid:100",
        rows: Array.from({ length: 50 }, (_, index) => ({
          _id: `row_${50 + index}`,
          title: `Task ${50 + index}`,
          status: "todo",
        })),
      })
      await Promise.resolve()
    })
  })

  it("keeps mounted cards isolated when their group appends a page", async () => {
    let resolveNextPage: ((page: BaseRowPage) => void) | undefined
    const loadGroupPage = vi.fn(
      (_field, value: string | null, offset: number, limit: number) => {
        if (value === "todo" && offset === 50) {
          return new Promise<BaseRowPage>((resolve) => {
            resolveNextPage = resolve
          })
        }
        return Promise.resolve({
          tableId: "tasks",
          offset,
          limit,
          total: value === "todo" ? 500 : 0,
          rows:
            value === "todo"
              ? Array.from({ length: 50 }, (_, index) => ({
                  _id: `row_${offset + index}`,
                  title: `Task ${offset + index}`,
                  status: "todo",
                }))
              : [],
        })
      }
    )

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          loadGroupCounts={vi.fn(async () => [{ value: "todo", total: 500 }])}
          loadGroupPage={loadGroupPage}
          onCellEdit={vi.fn()}
          onAddRow={vi.fn()}
        />
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const scroller = container.querySelector<HTMLElement>(
      '[data-base-kanban-column-scroll="base-kanban:todo"]'
    )
    const hasRequestedNextPage = () =>
      loadGroupPage.mock.calls.some(
        (call) => call[1] === "todo" && call[2] === 50
      )
    for (
      let scrollTop = 500;
      scrollTop <= 20_000 && !hasRequestedNextPage();
      scrollTop += 500
    ) {
      await act(async () => {
        if (!scroller) return
        scroller.scrollTop = scrollTop
        scroller.dispatchEvent(new Event("scroll"))
        await Promise.resolve()
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }

    expect(loadGroupPage).toHaveBeenCalledWith(
      expect.objectContaining({ tableColumnName: "status" }),
      "todo",
      50,
      50,
      500
    )
    const mountedRowId = scroller
      ?.querySelector<HTMLElement>("[data-base-row-id]")
      ?.getAttribute("data-base-row-id")
    expect(mountedRowId).toBeTruthy()
    const rendersWhilePending = recordCardMocks.renders.get(mountedRowId ?? "")

    await act(async () => {
      resolveNextPage?.({
        tableId: "tasks",
        offset: 50,
        limit: 50,
        total: 500,
        rows: Array.from({ length: 50 }, (_, index) => ({
          _id: `row_${50 + index}`,
          title: `Task ${50 + index}`,
          status: "todo",
        })),
      })
      await Promise.resolve()
    })

    expect(recordCardMocks.renders.get(mountedRowId ?? "")).toBe(
      rendersWhilePending
    )
  })

  it("does not rerender unaffected columns when one group loads another page", async () => {
    const todoRows = Array.from({ length: 50 }, (_, index) => ({
      _id: `todo_${index}`,
      title: `Todo ${index}`,
      status: "todo",
    }))
    const doneRow = { _id: "done_0", title: "Done 0", status: "done" }
    const loadGroupPage = vi.fn(
      async (_field, value: string | null, offset: number, limit: number) => ({
        tableId: "tasks",
        offset,
        limit,
        total: value === "todo" ? 51 : value === "done" ? 1 : 0,
        rows:
          value === "todo"
            ? offset === 0
              ? todoRows
              : [{ _id: "todo_50", title: "Todo 50", status: "todo" }]
            : value === "done"
              ? [doneRow]
              : [],
      })
    )

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          loadGroupCounts={vi.fn(async () => [
            { value: "todo", total: 51 },
            { value: "done", total: 1 },
          ])}
          loadGroupPage={loadGroupPage}
          onCellEdit={vi.fn()}
          onAddRow={vi.fn()}
        />
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const doneRendersBefore = recordCardMocks.renders.get("done_0")
    expect(doneRendersBefore).toBeGreaterThan(0)
    loadGroupPage.mockClear()

    await act(async () => {
      const scroller = container.querySelector<HTMLElement>(
        '[data-base-kanban-column-scroll="base-kanban:todo"]'
      )
      if (!scroller) return
      scroller.scrollTop = 100_000
      scroller.dispatchEvent(new Event("scroll"))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(loadGroupPage).toHaveBeenCalledWith(
      expect.objectContaining({ tableColumnName: "status" }),
      "todo",
      50,
      50,
      51
    )
    expect(recordCardMocks.renders.get("done_0")).toBe(doneRendersBefore)
  })

  it("does not rerender unaffected columns when an inspected field changes", async () => {
    const priorityField = {
      name: "Priority",
      type: "select" as const,
      tableName: "tb_tasks",
      tableColumnName: "priority",
      property: {
        options: [
          { id: "low", name: "Low", color: "gray" },
          { id: "high", name: "High", color: "red" },
        ],
      },
      storageCodec: "scalar" as const,
      valueKind: "source" as const,
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    }
    const tableWithPriority: BaseTableSnapshot = {
      ...table,
      fields: [...table.fields, priorityField],
    }
    const todoRow = {
      _id: "todo_0",
      title: "Todo 0",
      status: "todo",
      priority: "low",
    }
    const doneRow = {
      _id: "done_0",
      title: "Done 0",
      status: "done",
      priority: "low",
    }
    const onCellEdit = vi.fn(async (candidate, field, value) => ({
      tableId: "tasks",
      row: { ...candidate, [field.tableColumnName]: value },
      rowCount: 2,
    }))

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={tableWithPriority}
          view={view}
          loadGroupCounts={vi.fn(async () => [
            { value: "todo", total: 1 },
            { value: "done", total: 1 },
          ])}
          loadGroupPage={vi.fn(async (_field, value, offset, limit) => ({
            tableId: "tasks",
            offset,
            limit,
            total: value === "todo" || value === "done" ? 1 : 0,
            rows:
              value === "todo" ? [todoRow] : value === "done" ? [doneRow] : [],
          }))}
          onCellEdit={onCellEdit}
          onAddRow={vi.fn()}
        />
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Todo 0")
        ?.click()
    })
    const doneRendersBefore = recordCardMocks.renders.get("done_0")
    const todoRendersBefore = recordCardMocks.renders.get("todo_0") ?? 0

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Set priority to High")
        ?.click()
      await Promise.resolve()
    })

    expect(onCellEdit).toHaveBeenCalledWith(
      todoRow,
      expect.objectContaining({ tableColumnName: "priority" }),
      "high"
    )
    expect(recordCardMocks.renders.get("todo_0")).toBeGreaterThan(
      todoRendersBefore
    )
    expect(recordCardMocks.renders.get("done_0")).toBe(doneRendersBefore)
  })

  it("only mounts the horizontal window for a large set of columns", async () => {
    const manyOptions = Array.from({ length: 200 }, (_, index) => ({
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
    const loadGroupPage = vi.fn(
      async (_field, value: string | null, offset, limit) => ({
        tableId: "tasks",
        offset,
        limit,
        total: value === null ? 0 : 1,
        rows:
          value === null
            ? []
            : [
                {
                  _id: `row_${value}`,
                  title: `Task ${value}`,
                  status: value,
                },
              ],
      })
    )
    const loadGroupCounts = vi.fn(async () =>
      manyOptions.map((option) => ({ value: option.id, total: 1 }))
    )

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={manyColumnTable}
          view={view}
          loadGroupCounts={loadGroupCounts}
          loadGroupPage={loadGroupPage}
          onCellEdit={vi.fn()}
          onAddRow={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    expect(loadGroupCounts).toHaveBeenCalledTimes(1)
    expect(loadGroupPage.mock.calls.length).toBeGreaterThan(0)
    expect(loadGroupPage.mock.calls.length).toBeLessThanOrEqual(8)
    const renderedColumns = container.querySelectorAll('[role="region"]')
    expect(renderedColumns.length).toBeGreaterThan(0)
    expect(renderedColumns.length).toBeLessThanOrEqual(8)
    expect(
      Number(
        container
          .querySelector("[data-base-kanban-scroll]")
          ?.getAttribute("data-base-cached-group-windows")
      )
    ).toBeLessThanOrEqual(10)

    await act(async () => {
      const scroller = container.querySelector<HTMLElement>(
        "[data-base-kanban-scroll]"
      )
      if (!scroller) return
      scroller.scrollLeft = 4_000
      scroller.dispatchEvent(new Event("scroll"))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(loadGroupPage.mock.calls.length).toBeGreaterThan(
      renderedColumns.length
    )
    expect(
      Number(
        container
          .querySelector("[data-base-kanban-scroll]")
          ?.getAttribute("data-base-cached-group-windows")
      )
    ).toBeLessThanOrEqual(12)
    const renderedColumnsAfterScroll =
      container.querySelectorAll('[role="region"]').length

    await act(async () => {
      kanbanMocks.onDragStart?.({ active: { id: "row_1" } })
      await Promise.resolve()
    })

    expect(container.querySelectorAll('[role="region"]')).toHaveLength(
      renderedColumnsAfterScroll
    )
  })

  it("stops failed group paging until the user retries", async () => {
    const onError = vi.fn()
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      _id: `todo_${index}`,
      title: `Todo ${index}`,
      status: "todo",
    }))
    let todoRequests = 0
    const loadGroupPage = vi.fn(
      async (_field, value: string | null, offset: number, limit: number) => {
        if (value !== "todo") {
          return { tableId: "tasks", offset, limit, total: 0, rows: [] }
        }
        todoRequests += 1
        if (todoRequests === 2) throw new Error("page failed")
        return {
          tableId: "tasks",
          offset,
          limit,
          total: 51,
          rows:
            offset === 0
              ? firstPage
              : [{ _id: "todo_50", title: "Todo 50", status: "todo" }],
        }
      }
    )

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          loadGroupCounts={vi.fn(async () => [{ value: "todo", total: 51 }])}
          loadGroupPage={loadGroupPage}
          onCellEdit={vi.fn()}
          onAddRow={vi.fn()}
          onError={onError}
        />
      )
      await Promise.resolve()
    })

    await act(async () => {
      const scroller = container.querySelector<HTMLElement>(
        '[data-base-kanban-column-scroll="base-kanban:todo"]'
      )
      if (!scroller) return
      scroller.scrollTop = 100_000
      scroller.dispatchEvent(new Event("scroll"))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(todoRequests).toBe(2)
    expect(onError).not.toHaveBeenCalled()
    expect(container.textContent).toContain("Retry loading records")
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Retry loading records"
    )

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Retry loading records")
        ?.click()
      await Promise.resolve()
    })

    expect(todoRequests).toBe(3)
    expect(loadGroupPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ tableColumnName: "status" }),
      "todo",
      50,
      50,
      51
    )
  })

  it("recovers an initial group failure without reloading the board", async () => {
    const onError = vi.fn()
    let todoRequests = 0
    const loadGroupPage = vi.fn(
      async (_field, value: string | null, offset: number, limit: number) => {
        if (value !== "todo") {
          return { tableId: "tasks", offset, limit, total: 0, rows: [] }
        }
        todoRequests += 1
        if (todoRequests === 1) throw new Error("initial page failed")
        return {
          tableId: "tasks",
          offset,
          limit,
          total: 1,
          rows: [{ _id: "todo_1", title: "Recovered todo", status: "todo" }],
        }
      }
    )

    await act(async () => {
      root.render(
        <BaseKanbanView
          table={table}
          view={view}
          loadGroupCounts={vi.fn(async () => [{ value: "todo", total: 1 }])}
          loadGroupPage={loadGroupPage}
          onCellEdit={vi.fn()}
          onAddRow={vi.fn()}
          onError={onError}
        />
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(todoRequests).toBe(1)
    expect(onError).not.toHaveBeenCalled()
    expect(container.textContent).toContain("Could not load records")
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not load records"
    )

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Retry")
        ?.click()
      await Promise.resolve()
    })

    expect(todoRequests).toBe(2)
    expect(container.textContent).toContain("Recovered todo")
  })
})
