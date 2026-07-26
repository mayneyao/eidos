// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileDataSource,
  EidosFileFieldInfo,
  EidosFileTableSnapshot,
} from "@eidos.space/eidos-file"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EidosFileDataGrid } from "./eidos-file-data-grid"

const mocks = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}))

vi.mock("./eidos-file-grid", () => ({
  EidosFileGrid: (props: Record<string, unknown>) => {
    mocks.props = props
    return <div data-testid="grid" />
  },
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const relationField: EidosFileFieldInfo = {
  id: "0198c72d-82b5-7000-8000-000000000001",
  tableId: "0198c72d-82b5-7000-8000-000000000010",
  name: "Owner",
  type: "relation",
  tableName: "tb_tasks",
  tableColumnName: "owner",
  property: {
    targetTableId: "people",
    targetField: "title",
    multiple: false,
  },
  storageCodec: "relation",
  valueKind: "relation",
  isHidden: false,
  isDerived: false,
  sourceTableColumnName: null,
  dependsOn: null,
}

const table: EidosFileTableSnapshot = {
  table: {
    id: "tasks",
    name: "Tasks",
    rawTableName: "tb_tasks",
    position: 1,
    icon: null,
    description: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
  },
  fields: [relationField],
  views: [],
  rowCount: 0,
}

describe("EidosFileDataGrid", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mocks.props = null
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("does not reuse the unfiltered table count for a filtered Grid", async () => {
    const filter = {
      type: "group" as const,
      conjunction: "and" as const,
      children: [
        {
          type: "rule" as const,
          field: "estimate",
          operator: "greater-than" as const,
          value: 10,
        },
      ],
    }
    const getPage = vi.fn().mockResolvedValue({
      tableId: "tasks",
      offset: 0,
      limit: 100,
      total: 3,
      rows: [],
    })
    const source = {
      getPage,
      calculateColumnStats: vi.fn(),
      insertRow: vi.fn(),
      updateRow: vi.fn(),
      deleteRowRanges: vi.fn(),
      deleteRows: vi.fn(),
      updateField: vi.fn(),
      addField: vi.fn(),
      deleteField: vi.fn(),
      createTable: vi.fn(),
      updateTable: vi.fn(),
      deleteTable: vi.fn(),
      createView: vi.fn(),
      duplicateView: vi.fn(),
      deleteView: vi.fn(),
      reorderViews: vi.fn(),
      updateView: vi.fn(),
      getSnapshot: vi.fn(),
    } as unknown as EidosFileDataSource

    await act(async () => {
      root.render(
        <EidosFileDataGrid
          source={source}
          table={{ ...table, rowCount: 2_500 }}
          view={{
            id: "filtered-grid",
            name: "Filtered Grid",
            type: "grid",
            tableId: "tasks",
            query: "",
            properties: null,
            filter,
            sorts: [],
            orderMap: null,
            hiddenFields: [],
            position: 0,
            createdAt: "2026-07-19T00:00:00.000Z",
            updatedAt: "2026-07-19T00:00:00.000Z",
          }}
        />
      )
      await Promise.resolve()
    })

    const loadPage = mocks.props?.loadPage
    expect(typeof loadPage).toBe("function")
    await (loadPage as (offset: number, limit: number) => Promise<void>)(0, 100)

    expect(getPage).toHaveBeenCalledWith("tasks", 0, 100, { filter }, undefined)
  })

  it("searches relation targets through the public data source contract", async () => {
    const getPage = vi.fn().mockResolvedValue({
      tableId: "people",
      offset: 0,
      limit: 50,
      total: 1,
      rows: [{ _id: "person_1", Name: "Ada Lovelace" }],
    })
    const source = {
      getPage,
      calculateColumnStats: vi.fn(),
      insertRow: vi.fn(),
      updateRow: vi.fn(),
      deleteRowRanges: vi.fn(),
      deleteRows: vi.fn(),
      updateField: vi.fn(),
      addField: vi.fn(),
      deleteField: vi.fn(),
      createTable: vi.fn(),
      updateTable: vi.fn(),
      deleteTable: vi.fn(),
      createView: vi.fn(),
      duplicateView: vi.fn(),
      deleteView: vi.fn(),
      reorderViews: vi.fn(),
      updateView: vi.fn(),
      getSnapshot: vi.fn().mockResolvedValue({
        tables: [
          {
            table: { id: "people" },
            fields: [
              {
                ...table.fields[0],
                name: "Name",
                tableName: "People",
                tableColumnName: "Name",
                type: "text",
                valueKind: "source",
                isRecordLabel: true,
              },
            ],
            views: [],
            rowCount: 1,
          },
        ],
      }),
    } as unknown as EidosFileDataSource

    await act(async () => {
      root.render(<EidosFileDataGrid source={source} table={table} />)
      await Promise.resolve()
    })

    const search = mocks.props?.onSearchRelation
    expect(typeof search).toBe("function")
    const result = await (
      search as (
        field: EidosFileFieldInfo,
        query: string
      ) => Promise<Array<{ id: string; title: string }>>
    )(relationField, "Ada")

    expect(getPage).toHaveBeenCalledWith(
      "people",
      0,
      50,
      { search: "Ada" },
      undefined,
      undefined,
      {
        columns: ["Name"],
        preservedColumns: ["_id"],
        fieldLimit: 1,
      }
    )
    expect(result).toEqual([{ id: "person_1", title: "Ada Lovelace" }])
  })

  it("requires explicit confirmation before deleting a field", async () => {
    const deleteField = vi.fn().mockResolvedValue({ tables: [table] })
    const onSnapshot = vi.fn()
    const source = {
      getPage: vi.fn(),
      calculateColumnStats: vi.fn(),
      insertRow: vi.fn(),
      updateRow: vi.fn(),
      deleteRowRanges: vi.fn(),
      deleteRows: vi.fn(),
      updateField: vi.fn(),
      addField: vi.fn(),
      deleteField,
      createTable: vi.fn(),
      updateTable: vi.fn(),
      deleteTable: vi.fn(),
      createView: vi.fn(),
      duplicateView: vi.fn(),
      deleteView: vi.fn(),
      reorderViews: vi.fn(),
      updateView: vi.fn(),
      getSnapshot: vi.fn(),
    } as unknown as EidosFileDataSource

    await act(async () => {
      root.render(
        <EidosFileDataGrid
          source={source}
          table={table}
          onSnapshot={onSnapshot}
        />
      )
    })

    await act(async () => {
      ;(mocks.props?.onDeleteField as (field: EidosFileFieldInfo) => void)(
        relationField
      )
    })

    expect(deleteField).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("Delete field “Owner”?")

    await act(async () => {
      Array.from(document.body.querySelectorAll("button"))
        .find((button) => button.textContent === "Delete field")
        ?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(deleteField).toHaveBeenCalledWith("tasks", relationField.id)
    expect(onSnapshot).toHaveBeenCalledWith({ tables: [table] })
  })
})
