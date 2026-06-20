import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TableContext } from "./hooks"
import { ViewSortEditor } from "./view-sort-editor"

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, size, variant, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <button type="button" data-value={value}>
      {children}
    </button>
  ),
  SelectTrigger: ({ children }: any) => (
    <button type="button">{children}</button>
  ),
  SelectValue: () => null,
}))

vi.mock("@/apps/web-app/hooks/use-ui-columns", () => ({
  useUiColumns: () => ({
    uiColumns: [
      {
        name: "Title",
        table_column_name: "title",
        type: "text",
      },
    ],
  }),
}))

vi.mock("./fields/field-selector", () => ({
  FieldSelector: ({ value }: { value?: string }) => (
    <button type="button">{value}</button>
  ),
}))

vi.mock("./hooks", async () => {
  const React = await import("react")

  return {
    TableContext: React.createContext({
      tableName: "",
      space: "",
      isReadOnly: true,
      isView: false,
      isEmbed: false,
      udfs: [],
    }),
    useCurrentView: () => ({
      currentView: {
        id: "view-1",
        table_id: "table-1",
        query: "SELECT * FROM tb_test",
      },
    }),
  }
})

vi.mock("./hooks/use-view-query", () => {
  const parsedSql = { orderBy: [] }

  return {
    useViewQuery: () => ({
      parsedSql,
      sql: "SELECT * FROM tb_test",
    }),
  }
})

vi.mock("./sortable", () => ({
  SortableContainer: ({ items, renderItem }: any) => (
    <div>
      {items.map((item: any, index: number) => (
        <div key={item.id}>{renderItem(item, index)}</div>
      ))}
    </div>
  ),
}))

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}))

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}))

const roots: Root[] = []

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.length = 0
  document.body.innerHTML = ""
  vi.clearAllMocks()
})

const renderEditor = (onSortChange = vi.fn()) => {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)

  act(() => {
    root.render(
      <TableContext.Provider value={{ tableName: "tb_test", space: "main" }}>
        <ViewSortEditor onSortChange={onSortChange} />
      </TableContext.Provider>
    )
  })

  return { container, onSortChange }
}

describe("ViewSortEditor", () => {
  it("does not commit the current sort when mounted", () => {
    const { onSortChange } = renderEditor()

    expect(onSortChange).not.toHaveBeenCalled()
  })

  it("commits a sort only after a user action", () => {
    const { container, onSortChange } = renderEditor()
    const addButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("table.view.addSort")
    )

    expect(addButton).toBeTruthy()

    act(() => {
      addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(onSortChange).toHaveBeenCalledTimes(1)
    expect(onSortChange).toHaveBeenCalledWith([
      { column: "title", order: "ASC" },
    ])
  })
})
