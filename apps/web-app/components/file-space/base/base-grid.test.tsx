// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { BaseTableSnapshot } from "@eidos.space/base"
import {
  CompactSelection,
  GridCellKind,
  type DataEditorProps,
} from "@glideapps/glide-data-grid"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BaseGrid } from "./base-grid"

const mocks = vi.hoisted(() => ({
  props: null as DataEditorProps | null,
}))

vi.mock("@glideapps/glide-data-grid", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  const React = await import("react")
  return {
    ...actual,
    default: React.forwardRef((_props: DataEditorProps, _ref) => {
      mocks.props = _props
      return <div data-testid="glide-grid" />
    }),
  }
})

vi.mock("@/components/table/views/grid/cells/select-cell", () => ({
  default: {},
}))
vi.mock("@/components/table/views/grid/cells/multi-select-cell", () => ({
  default: {},
}))
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))
vi.mock("@/apps/web-app/hooks/use-current-theme", () => ({
  useCurrentTheme: () => ({ css: null }),
}))
vi.mock("@/components/table/views/grid/theme", () => ({
  useDynamicTheme: () => ({}),
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
      name: "Done",
      type: "checkbox",
      tableName: "tb_tasks",
      tableColumnName: "done",
      property: null,
      storageCodec: "scalar",
      valueKind: "source",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    },
  ],
  views: [
    {
      id: "view_tasks",
      name: "Grid",
      type: "grid",
      tableId: "tasks",
      query: "SELECT * FROM tb_tasks",
      properties: null,
      filter: null,
      orderMap: null,
      hiddenFields: [],
      position: 1,
      createdAt: "2026-07-12 00:00:00",
      updatedAt: "2026-07-12 00:00:00",
    },
  ],
  rowCount: 250,
}

function rowAt(index: number) {
  return {
    _id: `row_${index}`,
    title: index === 0 ? "Write RFC" : `Row ${index}`,
    done: 0,
  }
}

function createLoadPage() {
  return vi.fn(async (offset: number, limit: number) => ({
    tableId: "tasks",
    offset,
    limit,
    total: table.rowCount,
    rows: Array.from(
      { length: Math.min(limit, Math.max(0, table.rowCount - offset)) },
      (_, index) => rowAt(offset + index)
    ),
  }))
}

function createCellEdit() {
  return vi.fn(async (row, field, value) => ({
    tableId: "tasks",
    row: { ...row, [field.tableColumnName]: value },
    rowCount: table.rowCount,
  }))
}

describe("BaseGrid", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mocks.props = null
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    vi.useRealTimers()
    act(() => root.unmount())
    container.remove()
  })

  it("adapts paged Base rows to the production grid contract", async () => {
    const onCellEdit = createCellEdit()
    const loadPage = createLoadPage()
    await act(async () => {
      root.render(
        <BaseGrid
          table={table}
          loadPage={loadPage}
          onAddRow={vi.fn()}
          onCellEdit={onCellEdit}
        />
      )
      await Promise.resolve()
    })

    expect(loadPage).toHaveBeenCalledWith(0, 100)
    expect(mocks.props?.rows).toBe(250)
    expect(mocks.props?.columns.map((column) => column.title)).toEqual([
      "Title",
      "Done",
    ])
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      kind: GridCellKind.Text,
      data: "Write RFC",
    })
    expect(mocks.props?.getCellContent([1, 0])).toMatchObject({
      kind: GridCellKind.Boolean,
      data: false,
    })

    await act(async () => {
      mocks.props?.onCellEdited?.([0, 0], {
        kind: GridCellKind.Text,
        allowOverlay: true,
        data: "Write implementation",
        displayData: "Write implementation",
      })
      await Promise.resolve()
    })
    expect(onCellEdit).toHaveBeenCalledWith(
      rowAt(0),
      table.fields[0],
      "Write implementation"
    )
  })

  it("forwards the trailing row action", async () => {
    const onAddRow = vi.fn(async () => ({
      tableId: "tasks",
      row: rowAt(250),
      rowCount: 251,
    }))
    act(() =>
      root.render(
        <BaseGrid
          table={table}
          loadPage={createLoadPage()}
          onAddRow={onAddRow}
          onCellEdit={createCellEdit()}
        />
      )
    )

    await act(async () => {
      await mocks.props?.onRowAppended?.()
    })
    expect(onAddRow).toHaveBeenCalledOnce()
    expect(mocks.props?.rows).toBe(251)
    expect(mocks.props?.getCellContent([0, 250])).toMatchObject({
      kind: GridCellKind.Text,
      data: "Row 250",
    })
  })

  it("opens routine field actions from the column header", async () => {
    const onRenameField = vi.fn()
    await act(async () => {
      root.render(
        <BaseGrid
          table={table}
          loadPage={createLoadPage()}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit()}
          onRenameField={onRenameField}
        />
      )
      await Promise.resolve()
    })

    expect(mocks.props?.columns[0]?.hasMenu).toBe(true)
    act(() => {
      mocks.props?.onHeaderClicked?.(0, {
        bounds: { x: 40, y: 20, width: 180, height: 36 },
        preventDefault: vi.fn(),
      } as never)
    })
    const rename = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Rename field")
    )
    expect(rename).toBeTruthy()
    act(() => rename?.click())
    expect(onRenameField).toHaveBeenCalledWith(table.fields[0])
  })

  it("hydrates and persists Base view column layout", async () => {
    vi.useFakeTimers()
    const onViewUpdate = vi.fn()
    const view = {
      ...table.views[0],
      properties: { fieldWidthMap: { done: 140 } },
      orderMap: { done: 0, title: 1 },
    }
    await act(async () => {
      root.render(
        <BaseGrid
          table={table}
          view={view}
          loadPage={createLoadPage()}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit()}
          onViewUpdate={onViewUpdate}
        />
      )
      await Promise.resolve()
    })

    expect(mocks.props?.columns.map((column) => column.title)).toEqual([
      "Done",
      "Title",
    ])
    expect(
      mocks.props && "width" in mocks.props.columns[0]
        ? mocks.props.columns[0].width
        : undefined
    ).toBe(140)

    act(() => {
      mocks.props?.onColumnResize?.(mocks.props.columns[0], 210, 0, 210)
    })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(onViewUpdate).toHaveBeenCalledWith({
      properties: { fieldWidthMap: { done: 210 } },
    })

    act(() => {
      mocks.props?.onColumnMoved?.(0, 1)
    })
    expect(onViewUpdate).toHaveBeenCalledWith({
      orderMap: { title: 0, done: 1 },
    })
  })

  it("loads only the pages around the visible Grid region", async () => {
    const loadPage = createLoadPage()
    await act(async () => {
      root.render(
        <BaseGrid
          table={table}
          loadPage={loadPage}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit()}
        />
      )
      await Promise.resolve()
    })

    await act(async () => {
      mocks.props?.onVisibleRegionChanged?.(
        { x: 0, y: 180, width: 2, height: 30 },
        0,
        0,
        {}
      )
      await Promise.resolve()
    })

    expect(loadPage).toHaveBeenCalledWith(100, 100)
    expect(loadPage).toHaveBeenCalledWith(200, 100)
    expect(mocks.props?.getCellContent([0, 180])).toMatchObject({
      kind: GridCellKind.Text,
      data: "Row 180",
    })
  })

  it("reports compact cross-page row ranges without loading every row", async () => {
    const loadPage = createLoadPage()
    const onSelectedRowsChange = vi.fn()
    await act(async () => {
      root.render(
        <BaseGrid
          table={table}
          loadPage={loadPage}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit()}
          onSelectedRowsChange={onSelectedRowsChange}
        />
      )
      await Promise.resolve()
    })

    act(() => {
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.fromSingleSelection([90, 210]),
        current: undefined,
      })
    })

    expect(onSelectedRowsChange).toHaveBeenLastCalledWith([
      { startIndex: 90, endIndex: 210 },
    ])
    expect(loadPage).toHaveBeenCalledTimes(1)
  })
})
