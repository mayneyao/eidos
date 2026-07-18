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
  name: "Owner",
  type: "link",
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
    createdAt: "2026-07-18 00:00:00",
    updatedAt: "2026-07-18 00:00:00",
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

  it("searches relation targets through the public data source contract", async () => {
    const getPage = vi.fn().mockResolvedValue({
      tableId: "people",
      offset: 0,
      limit: 50,
      total: 1,
      rows: [{ _id: "person_1", title: "Ada Lovelace" }],
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
      createView: vi.fn(),
      duplicateView: vi.fn(),
      deleteView: vi.fn(),
      reorderViews: vi.fn(),
      updateView: vi.fn(),
      getSnapshot: vi.fn(),
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
        columns: ["title"],
        preservedColumns: ["_id", "title"],
        fieldLimit: 1,
      }
    )
    expect(result).toEqual([{ id: "person_1", title: "Ada Lovelace" }])
  })
})
