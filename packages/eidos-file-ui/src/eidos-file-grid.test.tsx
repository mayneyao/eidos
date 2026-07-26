// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  decodeEidosFileValues,
  encodeEidosFileAttachmentPaths,
  type EidosFileRowPage,
  type EidosFileRowMutationResult,
  type EidosFileRowsMutationResult,
  type EidosFileTableSnapshot,
} from "@eidos.space/eidos-file"
import {
  CompactSelection,
  GridCellKind,
  type DataEditorProps,
} from "@glideapps/glide-data-grid"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EidosFileGrid, type EidosFileGridRowEdit } from "./eidos-file-grid"

const ADA_ID = "0198c72d-82b5-7968-b163-98be4b7477df"
const GRACE_ID = "0198c72d-82b5-7969-8163-98be4b7477df"

const mocks = vi.hoisted(() => ({
  props: null as DataEditorProps | null,
  scrollTo: vi.fn(),
  updateCells: vi.fn(),
}))

vi.mock("@glideapps/glide-data-grid", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  const React = await import("react")
  return {
    ...actual,
    default: React.forwardRef((_props: DataEditorProps, ref) => {
      mocks.props = _props
      React.useImperativeHandle(ref, () => ({
        scrollTo: mocks.scrollTo,
        updateCells: mocks.updateCells,
      }))
      return <div data-testid="glide-grid" tabIndex={-1} />
    }),
  }
})

vi.mock("./cells/select-cell", () => ({
  default: {},
}))
vi.mock("./cells/multi-select-cell", () => ({
  default: {},
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const table: EidosFileTableSnapshot = {
  table: {
    id: "tasks",
    name: "Tasks",
    rawTableName: "tb_tasks",
    physicalName: "tb_tasks",
    position: 1,
    icon: null,
    description: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
  },
  fields: [
    {
      id: "0198c72d-82b5-7000-8000-000000000001",
      tableId: "0198c72d-82b5-7000-8000-000000000010",
      name: "Title",
      type: "text",
      isRecordLabel: true,
      tableName: "tb_tasks",
      tableColumnName: "title",
      property: null,
      storageCodec: "scalar",
      valueKind: "source",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    },
    {
      id: "0198c72d-82b5-7000-8000-000000000002",
      tableId: "0198c72d-82b5-7000-8000-000000000010",
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
      sorts: [],
      orderMap: null,
      hiddenFields: [],
      position: 1,
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
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

function createLoadPage(snapshot: EidosFileTableSnapshot = table) {
  return vi.fn(async (offset: number, limit: number) => ({
    tableId: snapshot.table.id,
    offset,
    limit,
    total: snapshot.rowCount,
    rows: Array.from(
      { length: Math.min(limit, Math.max(0, snapshot.rowCount - offset)) },
      (_, index) => rowAt(offset + index)
    ),
  }))
}

function createCellEdit(snapshot: EidosFileTableSnapshot = table) {
  return vi.fn(async (row, field, value) => ({
    tableId: snapshot.table.id,
    row: { ...row, [field.tableColumnName]: value },
    rowCount: snapshot.rowCount,
  }))
}

describe("EidosFileGrid", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mocks.props = null
    mocks.scrollTo.mockReset()
    mocks.updateCells.mockReset()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    vi.useRealTimers()
    act(() => root.unmount())
    container.remove()
  })

  it("adapts paged Eidos File rows to the production grid contract", async () => {
    const onCellEdit = createCellEdit()
    const loadPage = createLoadPage()
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          loadPage={loadPage}
          onAddRow={vi.fn()}
          onCellEdit={onCellEdit}
        />
      )
      await Promise.resolve()
    })

    expect(container.firstElementChild?.classList).toContain(
      "eidos-file-detail-layout"
    )
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

  it("keeps rendered rows, focus, and selection while a .eidos file query revalidates", async () => {
    const initialLoad = createLoadPage()
    let resolveRefresh: ((page: EidosFileRowPage) => void) | undefined
    const refreshLoad = vi.fn(
      (_offset: number, _limit: number) =>
        new Promise<EidosFileRowPage>((resolve) => {
          resolveRefresh = resolve
        })
    )
    const renderGrid = (
      loadPage: (offset: number, limit: number) => Promise<EidosFileRowPage>
    ) => (
      <EidosFileGrid
        table={table}
        view={table.views[0]}
        loadPage={loadPage}
        onAddRow={vi.fn()}
        onCellEdit={createCellEdit()}
      />
    )
    await act(async () => {
      root.render(renderGrid(initialLoad))
      await Promise.resolve()
    })
    const grid = container.querySelector<HTMLElement>(
      '[data-testid="glide-grid"]'
    )
    grid?.focus()
    act(() => {
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: [0, 0],
          range: { x: 0, y: 0, width: 1, height: 1 },
          rangeStack: [],
        },
      })
    })

    await act(async () => {
      root.render(renderGrid(refreshLoad))
      await Promise.resolve()
    })

    expect(refreshLoad).toHaveBeenCalledWith(0, 100)
    expect(container.querySelector('[data-testid="glide-grid"]')).toBe(grid)
    expect(document.activeElement).toBe(grid)
    expect(mocks.props?.gridSelection?.current?.cell).toEqual([0, 0])
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      kind: GridCellKind.Text,
      data: "Write RFC",
    })

    await act(async () => {
      resolveRefresh?.({
        tableId: "tasks",
        offset: 0,
        limit: 100,
        total: 1,
        rows: [{ _id: "row_filtered", title: "Filtered result", done: 1 }],
      })
      await Promise.resolve()
    })
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      kind: GridCellKind.Text,
      data: "Filtered result",
    })
  })

  it("persists a multi-cell paste as one row batch", async () => {
    const onCellEdit = createCellEdit()
    const onRowsEdit = vi.fn(async (edits: EidosFileGridRowEdit[]) => ({
      tableId: "tasks",
      rows: edits.map(({ row, changes }) => ({ ...row, ...changes })),
      rowCount: table.rowCount,
    }))
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          loadPage={createLoadPage()}
          onAddRow={vi.fn()}
          onCellEdit={onCellEdit}
          onRowsEdit={onRowsEdit}
        />
      )
      await Promise.resolve()
    })

    await act(async () => {
      mocks.props?.onCellsEdited?.([
        {
          location: [0, 0],
          value: {
            kind: GridCellKind.Text,
            allowOverlay: true,
            data: "Write implementation",
            displayData: "Write implementation",
          },
        },
        {
          location: [1, 0],
          value: {
            kind: GridCellKind.Boolean,
            allowOverlay: false,
            data: true,
          },
        },
      ])
      await Promise.resolve()
    })

    expect(onRowsEdit).toHaveBeenCalledOnce()
    expect(onRowsEdit).toHaveBeenCalledWith([
      {
        row: rowAt(0),
        changes: { title: "Write implementation", done: 1 },
      },
    ])
    expect(onCellEdit).not.toHaveBeenCalled()
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      data: "Write implementation",
    })
    expect(mocks.props?.getCellContent([1, 0])).toMatchObject({ data: true })
  })

  it("keeps a failed cell edit visible and retries it from the Grid", async () => {
    const error = new Error("Eidos File is read-only")
    const onCellEdit = createCellEdit()
    onCellEdit.mockRejectedValueOnce(error)
    const onError = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          loadPage={createLoadPage()}
          onAddRow={vi.fn()}
          onCellEdit={onCellEdit}
          onError={onError}
        />
      )
      await Promise.resolve()
    })

    await act(async () => {
      mocks.props?.onCellEdited?.([0, 0], {
        kind: GridCellKind.Text,
        allowOverlay: true,
        data: "Write implementation",
        displayData: "Write implementation",
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      data: "Write implementation",
    })
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Eidos File is read-only"
    )
    expect(container.textContent).toContain(
      "Your change is preserved in the grid."
    )
    expect(mocks.props?.onCellEdited).toBeUndefined()
    expect(onError).not.toHaveBeenCalled()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Retry")
        ?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onCellEdit).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      data: "Write implementation",
    })
  })

  it("keeps a failed pasted range visible until it is discarded", async () => {
    const onRowsEdit = vi
      .fn<
        (edits: EidosFileGridRowEdit[]) => Promise<EidosFileRowsMutationResult>
      >()
      .mockRejectedValueOnce(new Error("Batch write failed"))
    const onError = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          loadPage={createLoadPage()}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit()}
          onRowsEdit={onRowsEdit}
          onError={onError}
        />
      )
      await Promise.resolve()
    })

    await act(async () => {
      mocks.props?.onCellsEdited?.([
        {
          location: [0, 0],
          value: {
            kind: GridCellKind.Text,
            allowOverlay: true,
            data: "Write implementation",
            displayData: "Write implementation",
          },
        },
        {
          location: [1, 0],
          value: {
            kind: GridCellKind.Boolean,
            allowOverlay: false,
            data: true,
          },
        },
      ])
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      data: "Write implementation",
    })
    expect(mocks.props?.getCellContent([1, 0])).toMatchObject({ data: true })
    expect(container.textContent).toContain("2 changes are preserved")
    expect(onError).not.toHaveBeenCalled()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Discard changes")
        ?.click()
      await Promise.resolve()
    })

    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      data: "Write RFC",
    })
    expect(mocks.props?.getCellContent([1, 0])).toMatchObject({ data: false })
  })

  it("undoes a pasted range through one batch mutation", async () => {
    const onRowsEdit = vi.fn(async (edits: EidosFileGridRowEdit[]) => ({
      tableId: "tasks",
      rows: edits.map(({ row, changes }) => ({ ...row, ...changes })),
      rowCount: table.rowCount,
    }))
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          loadPage={createLoadPage()}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit()}
          onRowsEdit={onRowsEdit}
        />
      )
      await Promise.resolve()
    })

    act(() => {
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: undefined,
      })
    })
    await act(async () => {
      mocks.props?.onCellsEdited?.([
        {
          location: [0, 0],
          value: {
            kind: GridCellKind.Text,
            allowOverlay: true,
            data: "Write implementation",
            displayData: "Write implementation",
          },
        },
        {
          location: [1, 0],
          value: {
            kind: GridCellKind.Boolean,
            allowOverlay: false,
            data: true,
          },
        },
      ])
      await Promise.resolve()
    })
    onRowsEdit.mockClear()
    container.querySelector<HTMLElement>('[data-testid="glide-grid"]')?.focus()

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", metaKey: true })
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onRowsEdit).toHaveBeenCalledOnce()
    expect(onRowsEdit).toHaveBeenCalledWith([
      {
        row: {
          ...rowAt(0),
          title: "Write implementation",
          done: 1,
        },
        changes: { title: "Write RFC", done: 0 },
      },
    ])
    expect(mocks.updateCells).toHaveBeenCalledOnce()
  })

  it("does not let an older save result overwrite a newer optimistic cell", async () => {
    let resolveTitle: ((result: EidosFileRowMutationResult) => void) | undefined
    let resolveDone: ((result: EidosFileRowMutationResult) => void) | undefined
    const onCellEdit = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveTitle = resolve
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveDone = resolve
          })
      )
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          loadPage={createLoadPage()}
          onAddRow={vi.fn()}
          onCellEdit={onCellEdit}
        />
      )
      await Promise.resolve()
    })

    act(() => {
      mocks.props?.onCellEdited?.([0, 0], {
        kind: GridCellKind.Text,
        allowOverlay: true,
        data: "Write implementation",
        displayData: "Write implementation",
      })
      mocks.props?.onCellEdited?.([1, 0], {
        kind: GridCellKind.Boolean,
        allowOverlay: false,
        data: true,
      })
    })

    await act(async () => {
      resolveTitle?.({
        tableId: "tasks",
        row: { ...rowAt(0), title: "Write implementation" },
        rowCount: table.rowCount,
      })
      await Promise.resolve()
    })
    expect(mocks.props?.getCellContent([1, 0])).toMatchObject({ data: true })

    await act(async () => {
      resolveDone?.({
        tableId: "tasks",
        row: { ...rowAt(0), title: "Write implementation", done: true },
        rowCount: table.rowCount,
      })
      await Promise.resolve()
    })
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      data: "Write implementation",
    })
    expect(mocks.props?.getCellContent([1, 0])).toMatchObject({ data: true })
  })

  it("merges queued optimistic edits into recovery when the first save fails", async () => {
    let rejectTitle: ((error: Error) => void) | undefined
    const onCellEdit = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectTitle = reject
          })
      )
      .mockImplementation(async (row, field, value) => ({
        tableId: "tasks",
        row: { ...row, [field.tableColumnName]: value },
        rowCount: table.rowCount,
      }))
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          loadPage={createLoadPage()}
          onAddRow={vi.fn()}
          onCellEdit={onCellEdit}
        />
      )
      await Promise.resolve()
    })

    act(() => {
      mocks.props?.onCellEdited?.([0, 0], {
        kind: GridCellKind.Text,
        allowOverlay: true,
        data: "Write implementation",
        displayData: "Write implementation",
      })
      mocks.props?.onCellEdited?.([1, 0], {
        kind: GridCellKind.Boolean,
        allowOverlay: false,
        data: true,
      })
    })

    await act(async () => {
      rejectTitle?.(new Error("First save failed"))
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onCellEdit).toHaveBeenCalledOnce()
    expect(container.textContent).toContain("2 changes are preserved")
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      data: "Write implementation",
    })
    expect(mocks.props?.getCellContent([1, 0])).toMatchObject({ data: true })

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Retry")
        ?.click()
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onCellEdit).toHaveBeenCalledTimes(3)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      data: "Write implementation",
    })
    expect(mocks.props?.getCellContent([1, 0])).toMatchObject({ data: true })
  })

  it("forwards the trailing row action", async () => {
    const onAddRow = vi.fn(async () => ({
      tableId: "tasks",
      row: rowAt(250),
      rowCount: 251,
    }))
    act(() =>
      root.render(
        <EidosFileGrid
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
    const onPropertyFieldOpen = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          loadPage={createLoadPage()}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit()}
          onPropertyFieldOpen={onPropertyFieldOpen}
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
    const editProperty = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Edit property")
    )
    expect(editProperty).toBeTruthy()
    act(() => editProperty?.click())
    expect(onPropertyFieldOpen).toHaveBeenCalledWith(table.fields[0])
  })

  it("keeps visible system fields read-only in the field menu", async () => {
    const onCellEdit = createCellEdit()
    const systemTable: EidosFileTableSnapshot = {
      ...table,
      fields: [
        ...table.fields,
        {
          id: "0198c72d-82b5-7000-8000-000000000003",
          tableId: "0198c72d-82b5-7000-8000-000000000010",
          name: "Created time",
          type: "created-time",
          tableName: "tb_tasks",
          tableColumnName: "_created_time",
          property: null,
          storageCodec: "scalar",
          valueKind: "system",
          isHidden: true,
          isDerived: false,
          sourceTableColumnName: null,
          dependsOn: null,
        },
      ],
      views: [
        {
          ...table.views[0],
          properties: {
            visibleSystemFields: ["0198c72d-82b5-7000-8000-000000000003"],
          },
        },
      ],
    }
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={systemTable}
          view={systemTable.views[0]}
          loadPage={vi.fn(async (offset: number, limit: number) => ({
            tableId: systemTable.table.id,
            offset,
            limit,
            total: systemTable.rowCount,
            rows: Array.from(
              {
                length: Math.min(
                  limit,
                  Math.max(0, systemTable.rowCount - offset)
                ),
              },
              (_, index) => ({
                ...rowAt(offset + index),
                _created_time: "2026-07-14T08:30:00.000Z",
              })
            ),
          }))}
          onAddRow={vi.fn()}
          onCellEdit={onCellEdit}
          onPropertyFieldOpen={vi.fn()}
          onDeleteField={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    expect(mocks.props?.columns[2]?.title).toBe("Created at")
    act(() => {
      mocks.props?.onHeaderClicked?.(2, {
        bounds: { x: 400, y: 20, width: 180, height: 36 },
        preventDefault: vi.fn(),
      } as never)
    })
    const menuButtons = [...document.body.querySelectorAll("button")]
    expect(
      menuButtons.find((button) =>
        button.textContent?.includes("Edit property")
      )?.disabled
    ).toBe(true)
    expect(
      menuButtons.find((button) => button.textContent?.includes("Delete field"))
        ?.disabled
    ).toBe(true)

    await act(async () => {
      mocks.props?.onCellEdited?.([2, 0], {
        kind: GridCellKind.Custom,
        allowOverlay: true,
        copyData: "2027-01-01T00:00:00.000Z",
        data: {
          kind: "date-picker-cell",
          date: new Date("2027-01-01T00:00:00.000Z"),
          displayDate: "1/1/2027, 12:00:00 AM",
          format: "datetime-local",
        },
      })
      await Promise.resolve()
    })
    expect(onCellEdit).not.toHaveBeenCalled()
  })

  it("persists sort, insertion, and freeze commands from the field menu", async () => {
    const onViewUpdate = vi.fn()
    const onAddField = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          view={table.views[0]}
          loadPage={createLoadPage()}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit()}
          onAddField={onAddField}
          onViewUpdate={onViewUpdate}
        />
      )
      await Promise.resolve()
    })

    const openDoneMenu = () => {
      act(() => {
        mocks.props?.onHeaderClicked?.(1, {
          bounds: { x: 220, y: 20, width: 180, height: 36 },
          preventDefault: vi.fn(),
        } as never)
      })
    }
    const clickMenuItem = (label: string) => {
      const button = [...document.body.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.includes(label)
      )
      expect(button).toBeTruthy()
      act(() => button?.click())
    }

    openDoneMenu()
    clickMenuItem("Sort descending")
    expect(onViewUpdate).toHaveBeenLastCalledWith({
      sorts: [
        {
          field: "0198c72d-82b5-7000-8000-000000000002",
          direction: "desc",
        },
      ],
    })

    openDoneMenu()
    clickMenuItem("Insert field left")
    expect(onAddField).toHaveBeenCalledWith(1)

    openDoneMenu()
    clickMenuItem("Freeze to this field")
    expect(onViewUpdate).toHaveBeenLastCalledWith({
      properties: { freezeColumns: 2 },
    })

    openDoneMenu()
    clickMenuItem("Calculate")
    clickMenuItem("Count non-null")
    expect(onViewUpdate).toHaveBeenLastCalledWith({
      properties: {
        columnStats: {
          "0198c72d-82b5-7000-8000-000000000002": {
            type: "count-non-null",
          },
        },
      },
    })

    openDoneMenu()
    clickMenuItem("Hide field")
    expect(onViewUpdate).toHaveBeenLastCalledWith({
      hiddenFields: ["0198c72d-82b5-7000-8000-000000000002"],
    })
  })

  it("loads configured column stats into the trailing row and refreshes after edits", async () => {
    const view = {
      ...table.views[0],
      properties: {
        columnStats: {
          "0198c72d-82b5-7000-8000-000000000001": {
            type: "count-non-null",
          },
          "0198c72d-82b5-7000-8000-000000000002": {
            type: "count-distinct",
          },
        },
      },
    }
    const loadColumnStats = vi.fn().mockResolvedValue([
      {
        fieldId: "0198c72d-82b5-7000-8000-000000000001",
        type: "count-non-null",
        value: 250,
      },
      {
        fieldId: "0198c72d-82b5-7000-8000-000000000002",
        type: "count-distinct",
        value: 40,
      },
    ])
    const onCellEdit = createCellEdit()
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          view={view}
          loadPage={createLoadPage()}
          loadColumnStats={loadColumnStats}
          onAddRow={vi.fn()}
          onCellEdit={onCellEdit}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(loadColumnStats).toHaveBeenCalledWith([
      {
        fieldId: "0198c72d-82b5-7000-8000-000000000001",
        type: "count-non-null",
      },
      {
        fieldId: "0198c72d-82b5-7000-8000-000000000002",
        type: "count-distinct",
      },
    ])
    expect(mocks.props?.columns[0].trailingRowOptions?.hint).toBe(
      "Count non-null: 250"
    )
    expect(mocks.props?.columns[0].trailingRowOptions?.addIcon).toBe(
      "eidos-file-empty-stat"
    )
    expect(mocks.props?.columns[1].trailingRowOptions?.hint).toBe(
      "Count distinct: 40"
    )
    expect(mocks.props?.columns[1].trailingRowOptions?.addIcon).toBe(
      "eidos-file-empty-stat"
    )

    await act(async () => {
      mocks.props?.onCellEdited?.([1, 0], {
        kind: GridCellKind.Boolean,
        allowOverlay: false,
        data: true,
      })
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onCellEdit).toHaveBeenCalledOnce()
    expect(loadColumnStats).toHaveBeenCalledTimes(2)
  })

  it("formats Checkbox percentage stats with a percent suffix", async () => {
    const view = {
      ...table.views[0],
      properties: {
        columnStats: {
          "0198c72d-82b5-7000-8000-000000000002": {
            type: "percent-checked",
          },
        },
      },
    }
    const loadColumnStats = vi.fn().mockResolvedValue([
      {
        fieldId: "0198c72d-82b5-7000-8000-000000000002",
        type: "percent-checked",
        value: 62.5,
      },
    ])

    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          view={view}
          loadPage={createLoadPage()}
          loadColumnStats={loadColumnStats}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit()}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(loadColumnStats).toHaveBeenCalledWith([
      {
        fieldId: "0198c72d-82b5-7000-8000-000000000002",
        type: "percent-checked",
      },
    ])
    expect(mocks.props?.columns[1].trailingRowOptions?.hint).toBe(
      "Percent checked: 62.5%"
    )
  })

  it("persists a complete option catalog before a Grid editor can use a new option", async () => {
    const optionTable: EidosFileTableSnapshot = {
      ...table,
      fields: [
        ...table.fields,
        {
          id: "0198c72d-82b5-7000-8000-000000000003",
          tableId: "0198c72d-82b5-7000-8000-000000000010",
          name: "Status",
          type: "select",
          tableName: "tb_tasks",
          tableColumnName: "status",
          property: {
            options: [{ name: "Todo", color: "blue", icon: "circle" }],
          },
          storageCodec: "scalar",
          valueKind: "source",
          isHidden: false,
          isDerived: false,
          sourceTableColumnName: null,
          dependsOn: null,
        },
      ],
      rowCount: 1,
    }
    const loadPage = vi.fn(async () => ({
      tableId: optionTable.table.id,
      offset: 0,
      limit: 100,
      total: 1,
      rows: [{ _id: ADA_ID, title: "Write RFC", done: 0, status: null }],
    }))
    const onFieldUpdate = vi.fn(async () => undefined)

    await act(async () => {
      root.render(
        <EidosFileGrid
          table={optionTable}
          view={optionTable.views[0]}
          loadPage={loadPage}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit(optionTable)}
          onFieldUpdate={onFieldUpdate}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const cell = mocks.props?.getCellContent?.([2, 0])
    expect(cell?.kind).toBe(GridCellKind.Custom)
    if (cell?.kind !== GridCellKind.Custom) {
      throw new Error("Expected Select custom cell")
    }
    const data = cell.data as {
      allowCreate?: boolean
      onCreateOption?: (
        options: Array<{ id: string; name: string; color: string }>
      ) => Promise<void>
    }
    expect(data.allowCreate).toBe(true)
    await act(async () => {
      await data.onCreateOption?.([
        { id: "Todo", name: "Todo", color: "blue" },
        { id: "Blocked", name: "Blocked", color: "gray" },
      ])
    })

    expect(onFieldUpdate).toHaveBeenCalledWith(optionTable.fields[2], {
      property: {
        options: [
          { name: "Todo", color: "blue", icon: "circle" },
          { name: "Blocked", color: "gray" },
        ],
      },
    })
  })

  it("reports a column stat failure once and retries on an explicit reload", async () => {
    const view = {
      ...table.views[0],
      properties: {
        columnStats: {
          "0198c72d-82b5-7000-8000-000000000002": {
            type: "count-non-null",
          },
        },
      },
    }
    const error = new Error("stats unavailable")
    const loadColumnStats = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce([
        {
          fieldId: "0198c72d-82b5-7000-8000-000000000002",
          type: "count-non-null",
          value: 100,
        },
      ])
    const onError = vi.fn()
    const render = async (reloadToken: number) => {
      await act(async () => {
        root.render(
          <EidosFileGrid
            table={table}
            view={view}
            reloadToken={reloadToken}
            loadPage={createLoadPage()}
            loadColumnStats={loadColumnStats}
            onAddRow={vi.fn()}
            onCellEdit={createCellEdit()}
            onError={onError}
          />
        )
        await Promise.resolve()
        await Promise.resolve()
      })
    }

    await render(0)
    expect(loadColumnStats).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(error)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(loadColumnStats).toHaveBeenCalledTimes(1)

    await render(1)
    expect(loadColumnStats).toHaveBeenCalledTimes(2)
    expect(mocks.props?.columns[1].trailingRowOptions?.hint).toBe(
      "Count non-null: 100"
    )
  })

  it("opens record details and deletes the right-clicked record", async () => {
    const onRequestDeleteRows = vi.fn()
    const onOpenRecordInTab = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          view={table.views[0]}
          loadPage={createLoadPage()}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit()}
          onRequestDeleteRows={onRequestDeleteRows}
          onOpenRecordInTab={onOpenRecordInTab}
        />
      )
      await Promise.resolve()
    })

    const openCellMenu = () => {
      act(() => {
        mocks.props?.onCellContextMenu?.([0, 0], {
          bounds: { x: 40, y: 56, width: 180, height: 36 },
          localEventX: 30,
          localEventY: 18,
          preventDefault: vi.fn(),
        } as never)
      })
    }

    openCellMenu()
    const openRecord = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Open record")
    )
    expect(openRecord).toBeTruthy()
    act(() => openRecord?.click())
    expect(
      container.querySelector('[aria-label="Record details for Write RFC"]')
    ).toBeTruthy()
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Open record in tab"]')
        ?.click()
    })
    expect(onOpenRecordInTab).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "row_0", title: "Write RFC" })
    )

    openCellMenu()
    const deleteRecord = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Delete record")
    )
    expect(deleteRecord).toBeTruthy()
    act(() => deleteRecord?.click())
    expect(onRequestDeleteRows).toHaveBeenCalledWith([
      { startIndex: 0, endIndex: 1 },
    ])
  })

  it("hydrates and persists Eidos File view column layout", async () => {
    vi.useFakeTimers()
    const onViewUpdate = vi.fn()
    const view = {
      ...table.views[0],
      properties: {
        fieldWidths: { "0198c72d-82b5-7000-8000-000000000002": 140 },
      },
      orderMap: {
        "0198c72d-82b5-7000-8000-000000000002": 0,
        "0198c72d-82b5-7000-8000-000000000001": 1,
      },
    }
    await act(async () => {
      root.render(
        <EidosFileGrid
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
      properties: {
        fieldWidths: {
          "0198c72d-82b5-7000-8000-000000000002": 210 / 180,
        },
      },
    })

    act(() => {
      mocks.props?.onColumnMoved?.(0, 1)
    })
    expect(onViewUpdate).toHaveBeenCalledWith({
      orderMap: {
        "0198c72d-82b5-7000-8000-000000000001": 0,
        "0198c72d-82b5-7000-8000-000000000002": 1,
      },
    })
  })

  it("loads only the pages around the visible Grid region", async () => {
    const loadPage = createLoadPage()
    await act(async () => {
      root.render(
        <EidosFileGrid
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

  it("lets the latest visible Grid region replace queued page loads", async () => {
    const largeTable = { ...table, rowCount: 2_500 }
    let resolvePage200: ((page: EidosFileRowPage) => void) | undefined
    const page = (offset: number, limit: number): EidosFileRowPage => ({
      tableId: largeTable.table.id,
      offset,
      limit,
      total: largeTable.rowCount,
      rows: Array.from({ length: limit }, (_, index) => rowAt(offset + index)),
    })
    const loadPage = vi.fn((offset: number, limit: number) => {
      if (offset === 0) return Promise.resolve(page(offset, limit))
      return new Promise<EidosFileRowPage>((resolve) => {
        if (offset === 200) resolvePage200 = resolve
      })
    })
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={largeTable}
          loadPage={loadPage}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit(largeTable)}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      mocks.props?.onVisibleRegionChanged?.(
        { x: 0, y: 200, width: 2, height: 20 },
        0,
        0,
        {}
      )
      await Promise.resolve()
    })
    expect(loadPage).toHaveBeenLastCalledWith(200, 100)

    await act(async () => {
      mocks.props?.onVisibleRegionChanged?.(
        { x: 0, y: 1_000, width: 2, height: 20 },
        0,
        0,
        {}
      )
      await Promise.resolve()
    })
    expect(loadPage).not.toHaveBeenCalledWith(1_000, 100)
    expect(mocks.props?.getCellContent([0, 1_000])).toMatchObject({
      kind: GridCellKind.Loading,
      skeletonWidth: 96,
      skeletonWidthVariability: 32,
      skeletonHeight: 10,
    })

    await act(async () => {
      resolvePage200?.(page(200, 100))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(loadPage).toHaveBeenCalledWith(1_000, 100)
    expect(loadPage.mock.calls.map(([offset]) => offset)).toEqual([
      0, 200, 1_000,
    ])
  })

  it("bounds a million-row Grid cache and reloads an evicted page", async () => {
    const largeTable = { ...table, rowCount: 1_000_000 }
    const loadPage = createLoadPage(largeTable)
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={largeTable}
          loadPage={loadPage}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit(largeTable)}
        />
      )
      await Promise.resolve()
    })

    for (const y of [200, 400, 600, 800, 1_000]) {
      await act(async () => {
        mocks.props?.onVisibleRegionChanged?.(
          { x: 0, y, width: 2, height: 20 },
          0,
          0,
          {}
        )
        await Promise.resolve()
        await Promise.resolve()
      })
    }

    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      kind: GridCellKind.Loading,
    })

    await act(async () => {
      mocks.props?.onVisibleRegionChanged?.(
        { x: 0, y: 0, width: 2, height: 20 },
        0,
        0,
        {}
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(loadPage.mock.calls.filter(([offset]) => offset === 0)).toHaveLength(
      2
    )
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      kind: GridCellKind.Text,
      data: "Write RFC",
    })
  })

  it("keeps an edited page cached while the edit remains undoable", async () => {
    const largeTable = { ...table, rowCount: 1_000_000 }
    const onCellEdit = createCellEdit(largeTable)
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={largeTable}
          loadPage={createLoadPage(largeTable)}
          onAddRow={vi.fn()}
          onCellEdit={onCellEdit}
        />
      )
      await Promise.resolve()
    })

    act(() => {
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: undefined,
      })
    })
    await act(async () => {
      mocks.props?.onCellEdited?.([0, 0], {
        kind: GridCellKind.Text,
        allowOverlay: true,
        data: "Write implementation",
        displayData: "Write implementation",
      })
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    for (const y of [200, 400, 600, 800, 1_000]) {
      await act(async () => {
        mocks.props?.onVisibleRegionChanged?.(
          { x: 0, y, width: 2, height: 20 },
          0,
          0,
          {}
        )
        await Promise.resolve()
        await Promise.resolve()
      })
    }

    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      kind: GridCellKind.Text,
      data: "Write implementation",
    })

    container.querySelector<HTMLElement>('[data-testid="glide-grid"]')?.focus()
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", metaKey: true })
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onCellEdit).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Write implementation" }),
      table.fields[0],
      "Write RFC"
    )
  })

  it("clears undo history when the Grid query reloads", async () => {
    const onCellEdit = createCellEdit()
    const loadPage = createLoadPage()
    const renderGrid = (reloadToken: number) => (
      <EidosFileGrid
        table={table}
        reloadToken={reloadToken}
        loadPage={loadPage}
        onAddRow={vi.fn()}
        onCellEdit={onCellEdit}
      />
    )
    await act(async () => {
      root.render(renderGrid(0))
      await Promise.resolve()
    })

    act(() => {
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: undefined,
      })
    })
    await act(async () => {
      mocks.props?.onCellEdited?.([0, 0], {
        kind: GridCellKind.Text,
        allowOverlay: true,
        data: "Write implementation",
        displayData: "Write implementation",
      })
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    await act(async () => {
      root.render(renderGrid(1))
      await Promise.resolve()
      await Promise.resolve()
    })
    container.querySelector<HTMLElement>('[data-testid="glide-grid"]')?.focus()
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", metaKey: true })
      )
      await Promise.resolve()
    })

    expect(onCellEdit).toHaveBeenCalledOnce()
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      kind: GridCellKind.Text,
      data: "Write RFC",
    })
  })

  it("scrolls to and highlights a filtered search result", async () => {
    const loadPage = createLoadPage()
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          searchResultIndex={180}
          loadPage={loadPage}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit()}
        />
      )
      await Promise.resolve()
    })

    expect(mocks.scrollTo).toHaveBeenCalledWith(0, 180, "vertical", 0, 24, {
      vAlign: "center",
    })
    expect(loadPage).toHaveBeenCalledWith(100, 100)
    expect(loadPage).toHaveBeenCalledWith(200, 100)
    expect(mocks.props?.highlightRegions).toMatchObject([
      {
        color: "color-mix(in srgb, #37352f 14%, transparent)",
        range: { x: 0, y: 180, width: 2, height: 1 },
      },
    ])
  })

  it("reports compact cross-page row ranges without loading every row", async () => {
    const loadPage = createLoadPage()
    const onSelectedRowsChange = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileGrid
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

  it("imports dropped files into file cells through the Grid edit history", async () => {
    const fileField = {
      ...table.fields[1],
      name: "Files",
      type: "file" as const,
      tableColumnName: "files",
      storageCodec: "json_array" as const,
    }
    const fileTable: EidosFileTableSnapshot = {
      ...table,
      fields: [...table.fields, fileField],
      rowCount: 1,
    }
    const row = {
      ...rowAt(0),
      files: encodeEidosFileAttachmentPaths(["assets/existing.pdf"]),
    }
    const existingEntries = decodeEidosFileValues(row.files)
    const pickedEntries = decodeEidosFileValues(
      encodeEidosFileAttachmentPaths(["assets/picked.pdf"])
    )
    const droppedEntries = decodeEidosFileValues(
      encodeEidosFileAttachmentPaths(["assets/dropped.png"])
    )
    const loadPage = vi.fn(async () => ({
      tableId: "tasks",
      offset: 0,
      limit: 100,
      total: 1,
      rows: [row],
    }))
    const onCellEdit = createCellEdit()
    const onImportFiles = vi.fn().mockResolvedValue(pickedEntries)
    const onImportDroppedFiles = vi.fn().mockResolvedValue(droppedEntries)
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={fileTable}
          loadPage={loadPage}
          onAddRow={vi.fn()}
          onCellEdit={onCellEdit}
          onImportFiles={onImportFiles}
          onImportDroppedFiles={onImportDroppedFiles}
        />
      )
      await Promise.resolve()
    })

    expect(mocks.props?.getCellContent([2, 0])).toMatchObject({
      kind: GridCellKind.Custom,
      data: {
        kind: "eidos-file-file-cell",
        entries: existingEntries,
        onImport: onImportFiles,
      },
    })

    const dropped = new File(["image"], "dropped.png", {
      type: "image/png",
    })
    const transfer = {
      files: [dropped],
      items: [{ kind: "file", type: "image/png" }],
    } as unknown as DataTransfer
    act(() => mocks.props?.onDragOverCell?.([2, 0], transfer))
    expect(mocks.props?.highlightRegions).toMatchObject([
      {
        color: "color-mix(in srgb, #37352f 18%, transparent)",
        range: { x: 2, y: 0, width: 1, height: 1 },
      },
    ])
    await act(async () => {
      mocks.props?.onDrop?.([2, 0], transfer)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onImportDroppedFiles).toHaveBeenCalledWith([dropped])
    expect(onCellEdit).toHaveBeenCalledWith(row, fileField, expect.any(String))
    expect(
      decodeEidosFileValues(
        onCellEdit.mock.calls.at(-1)?.[2] as string | undefined
      ).map((entry) => entry.uri)
    ).toEqual(["assets/existing.pdf", "assets/dropped.png"])
  })

  it("hydrates relation cells and delegates target record search", async () => {
    const relationField = {
      ...table.fields[1],
      name: "Owners",
      type: "relation" as const,
      tableColumnName: "owners",
      storageCodec: "relation" as const,
      valueKind: "relation" as const,
      property: {
        targetTableId: "people",
        targetField: "title",
        multiple: true,
      },
    }
    const relationTable: EidosFileTableSnapshot = {
      ...table,
      fields: [table.fields[0], relationField],
      rowCount: 1,
    }
    const row = {
      ...rowAt(0),
      owners: JSON.stringify([ADA_ID]),
      owners__display: JSON.stringify([{ id: ADA_ID, title: "Ada Lovelace" }]),
    }
    const onSearchRelation = vi
      .fn()
      .mockResolvedValue([{ id: GRACE_ID, title: "Grace Hopper" }])
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={relationTable}
          loadPage={vi.fn().mockResolvedValue({
            tableId: "tasks",
            offset: 0,
            limit: 100,
            total: 1,
            rows: [row],
          })}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit()}
          onSearchRelation={onSearchRelation}
        />
      )
      await Promise.resolve()
    })

    const cell = mocks.props?.getCellContent([1, 0])
    expect(cell).toMatchObject({
      kind: GridCellKind.Custom,
      data: {
        kind: "eidos-file-relation-cell",
        values: [{ id: ADA_ID, title: "Ada Lovelace" }],
      },
    })
    if (
      cell?.kind === GridCellKind.Custom &&
      "onSearch" in cell.data &&
      typeof cell.data.onSearch === "function"
    ) {
      await cell.data.onSearch("Grace")
    }
    expect(onSearchRelation).toHaveBeenCalledWith(relationField, "Grace")
  })
})
