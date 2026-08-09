// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileDataSource,
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowMutationResult,
  EidosFileSqlPrimitive,
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

const titleField: EidosFileFieldInfo = {
  id: "0198c72d-82b5-7000-8000-000000000002",
  tableId: "tasks",
  name: "Title",
  type: "text",
  tableName: "tb_tasks",
  tableColumnName: "title",
  property: null,
  storageCodec: "scalar",
  valueKind: "source",
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
  fields: [relationField, titleField],
  views: [],
  rowCount: 0,
}

type EditCell = (
  row: EidosFileRow,
  field: EidosFileFieldInfo,
  value: EidosFileSqlPrimitive
) => Promise<EidosFileRowMutationResult>

function capturedEditCell(): EditCell {
  expect(typeof mocks.props?.onCellEdit).toBe("function")
  return mocks.props?.onCellEdit as EditCell
}

function staleRevisionError() {
  return Object.assign(new Error("File revision has changed"), {
    code: "stale-revision",
    retryable: true,
  })
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

  it("forwards shared search navigation state to the Grid", async () => {
    const onSearchResultCountChange = vi.fn()
    const source = {
      getPage: vi.fn(),
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
          table={table}
          search="Ada"
          searchResultIndex={2}
          onSearchResultCountChange={onSearchResultCountChange}
        />
      )
      await Promise.resolve()
    })

    expect(mocks.props?.searchResultIndex).toBe(2)
    expect(mocks.props?.onRowCountChange).toBe(onSearchResultCountChange)
  })

  it("returns an optimistic row while the Runtime insert is pending", async () => {
    let resolveInsert:
      | ((result: EidosFileRowMutationResult) => void)
      | undefined
    const insertRow = vi.fn(
      () =>
        new Promise<EidosFileRowMutationResult>((resolve) => {
          resolveInsert = resolve
        })
    )
    const onMutation = vi.fn()
    const source = {
      insertRow,
    } as unknown as EidosFileDataSource

    await act(async () => {
      root.render(
        <EidosFileDataGrid
          source={source}
          table={{ ...table, rowCount: 3 }}
          onMutation={onMutation}
        />
      )
      await Promise.resolve()
    })

    const addRow = mocks.props?.onAddRow
    expect(typeof addRow).toBe("function")
    const optimistic = (
      addRow as () => {
        row: EidosFileRow
        rowCount: number
        settled: Promise<EidosFileRowMutationResult>
      }
    )()
    expect(optimistic.row._id).toMatch(/^optimistic:/)
    expect(optimistic.rowCount).toBe(4)
    expect(onMutation).not.toHaveBeenCalled()

    const committed: EidosFileRowMutationResult = {
      tableId: "tasks",
      row: { _id: "row_created" },
      rowCount: 4,
    }
    await act(async () => {
      resolveInsert?.(committed)
      await expect(optimistic.settled).resolves.toBe(committed)
    })
    expect(onMutation).toHaveBeenCalledWith(committed)
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

  it("reapplies a disjoint scalar edit once after verifying fresh state", async () => {
    const stale = staleRevisionError()
    const committed: EidosFileRowMutationResult = {
      tableId: "tasks",
      row: { _id: "row_1", [titleField.id]: "Mine", status: "theirs" },
      rowCount: 1,
      revision: 3,
    }
    const updateRow = vi
      .fn()
      .mockRejectedValueOnce(stale)
      .mockResolvedValueOnce(committed)
    const getSnapshot = vi.fn().mockResolvedValue({ tables: [table] })
    const getRow = vi.fn().mockResolvedValue({
      _id: "row_1",
      [titleField.id]: "Base",
      status: "theirs",
    })
    const onMutation = vi.fn()
    const source = {
      updateRow,
      getSnapshot,
      getRow,
    } as unknown as EidosFileDataSource

    await act(async () => {
      root.render(
        <EidosFileDataGrid
          source={source}
          table={table}
          tables={[table]}
          onMutation={onMutation}
        />
      )
    })

    await expect(
      capturedEditCell()(
        { _id: "row_1", [titleField.id]: "Base", status: "base" },
        titleField,
        "Mine"
      )
    ).resolves.toBe(committed)

    expect(getSnapshot).toHaveBeenCalledTimes(1)
    expect(getRow).toHaveBeenCalledWith("tasks", "row_1")
    expect(updateRow).toHaveBeenCalledTimes(2)
    expect(updateRow).toHaveBeenNthCalledWith(2, "tasks", "row_1", {
      [titleField.id]: "Mine",
    })
    expect(onMutation).toHaveBeenCalledWith(committed)
  })

  it("preserves the stale conflict when the edited field overlaps", async () => {
    const stale = staleRevisionError()
    const updateRow = vi.fn().mockRejectedValue(stale)
    const getSnapshot = vi.fn().mockResolvedValue({ tables: [table] })
    const getRow = vi
      .fn()
      .mockResolvedValue({ _id: "row_1", [titleField.id]: "Theirs" })
    const source = {
      updateRow,
      getSnapshot,
      getRow,
    } as unknown as EidosFileDataSource

    await act(async () => {
      root.render(
        <EidosFileDataGrid source={source} table={table} tables={[table]} />
      )
    })

    await expect(
      capturedEditCell()(
        { _id: "row_1", [titleField.id]: "Base" },
        titleField,
        "Mine"
      )
    ).rejects.toBe(stale)
    expect(updateRow).toHaveBeenCalledTimes(1)
  })

  it("does not treat retryable or unknown-commit as replay authorization", async () => {
    const unknownCommit = Object.assign(
      new Error("Commit outcome is unknown"),
      {
        code: "unknown-commit",
        retryable: true,
      }
    )
    const updateRow = vi.fn().mockRejectedValue(unknownCommit)
    const getSnapshot = vi.fn()
    const getRow = vi.fn()
    const source = {
      updateRow,
      getSnapshot,
      getRow,
    } as unknown as EidosFileDataSource

    await act(async () => {
      root.render(
        <EidosFileDataGrid source={source} table={table} tables={[table]} />
      )
    })

    await expect(
      capturedEditCell()(
        { _id: "row_1", [titleField.id]: "Base" },
        titleField,
        "Mine"
      )
    ).rejects.toBe(unknownCommit)
    expect(getSnapshot).not.toHaveBeenCalled()
    expect(getRow).not.toHaveBeenCalled()
    expect(updateRow).toHaveBeenCalledTimes(1)
  })

  it("stops after one verified automatic reapplication attempt", async () => {
    const firstStale = staleRevisionError()
    const secondStale = staleRevisionError()
    const updateRow = vi
      .fn()
      .mockRejectedValueOnce(firstStale)
      .mockRejectedValueOnce(secondStale)
    const source = {
      updateRow,
      getSnapshot: vi.fn().mockResolvedValue({ tables: [table] }),
      getRow: vi
        .fn()
        .mockResolvedValue({ _id: "row_1", [titleField.id]: "Base" }),
    } as unknown as EidosFileDataSource

    await act(async () => {
      root.render(
        <EidosFileDataGrid source={source} table={table} tables={[table]} />
      )
    })

    await expect(
      capturedEditCell()(
        { _id: "row_1", [titleField.id]: "Base" },
        titleField,
        "Mine"
      )
    ).rejects.toBe(secondStale)
    expect(updateRow).toHaveBeenCalledTimes(2)
  })

  it("does not reapply across a schema or View descriptor change", async () => {
    const stale = staleRevisionError()
    const updateRow = vi.fn().mockRejectedValue(stale)
    const getSnapshot = vi.fn().mockResolvedValue({
      tables: [
        {
          ...table,
          views: [
            {
              id: "view_1",
              name: "Changed View",
              type: "grid",
              tableId: "tasks",
              query: "",
              properties: null,
              filter: null,
              sorts: [],
              orderMap: null,
              hiddenFields: [],
              position: 0,
              createdAt: "2026-08-09T00:00:00.000Z",
              updatedAt: "2026-08-09T00:00:00.000Z",
            },
          ],
        },
      ],
    })
    const getRow = vi.fn()
    const source = {
      updateRow,
      getSnapshot,
      getRow,
    } as unknown as EidosFileDataSource

    await act(async () => {
      root.render(
        <EidosFileDataGrid source={source} table={table} tables={[table]} />
      )
    })

    await expect(
      capturedEditCell()(
        { _id: "row_1", [titleField.id]: "Base" },
        titleField,
        "Mine"
      )
    ).rejects.toBe(stale)
    expect(getSnapshot).toHaveBeenCalledTimes(1)
    expect(getRow).not.toHaveBeenCalled()
    expect(updateRow).toHaveBeenCalledTimes(1)
  })

  it("does not automatically reapply relation field edits", async () => {
    const stale = staleRevisionError()
    const updateRow = vi.fn().mockRejectedValue(stale)
    const getSnapshot = vi.fn()
    const getRow = vi.fn()
    const source = {
      updateRow,
      getSnapshot,
      getRow,
    } as unknown as EidosFileDataSource

    await act(async () => {
      root.render(
        <EidosFileDataGrid source={source} table={table} tables={[table]} />
      )
    })

    await expect(
      capturedEditCell()(
        { _id: "row_1", [relationField.id]: "person_1" },
        relationField,
        "person_2"
      )
    ).rejects.toBe(stale)
    expect(getSnapshot).not.toHaveBeenCalled()
    expect(getRow).not.toHaveBeenCalled()
    expect(updateRow).toHaveBeenCalledTimes(1)
  })
})
