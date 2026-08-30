// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  decodeEidosFileValues,
  encodeEidosFileAttachmentPaths,
  encodeEidosFileValues,
  type EidosFileFieldInfo,
  type EidosFileRow,
  type EidosFileRowPage,
  type EidosFileRowMutationResult,
  type EidosFileRowsMutationResult,
  type EidosFileSqlPrimitive,
  type EidosFileTableSnapshot,
  type FileEntry,
} from "@eidos.space/eidos-file"
import {
  CompactSelection,
  GridCellKind,
  type DataEditorProps,
  type EditableGridCell,
  type UriCell,
} from "@glideapps/glide-data-grid"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EidosFileUIProvider } from "./context"
import { EidosFileGrid, type EidosFileGridRowEdit } from "./eidos-file-grid"

const ADA_ID = "0198c72d-82b5-7968-b163-98be4b7477df"
const GRACE_ID = "0198c72d-82b5-7969-8163-98be4b7477df"

const mocks = vi.hoisted(() => ({
  props: null as DataEditorProps | null,
  appendRow: vi.fn(),
  scrollTo: vi.fn(),
  updateCells: vi.fn(),
  focus: vi.fn(),
  getBounds: vi.fn((col: number, row: number) => ({
    x: col * 100,
    y: 32 + row * 32,
    width: 100,
    height: 32,
  })),
}))

vi.mock("@glideapps/glide-data-grid", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  const React = await import("react")
  return {
    ...actual,
    default: React.forwardRef((_props: DataEditorProps, ref) => {
      mocks.props = _props
      React.useImperativeHandle(ref, () => ({
        appendRow: mocks.appendRow,
        scrollTo: mocks.scrollTo,
        updateCells: mocks.updateCells,
        focus: mocks.focus,
        getBounds: mocks.getBounds,
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
    mocks.appendRow.mockReset()
    mocks.appendRow.mockImplementation(async () => {
      await mocks.props?.onRowAppended?.()
    })
    mocks.scrollTo.mockReset()
    mocks.updateCells.mockReset()
    mocks.focus.mockReset()
    mocks.getBounds.mockClear()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    // Behave like Glide's focus: it moves focus to the grid canvas.
    mocks.focus.mockImplementation(() => {
      container
        .querySelector<HTMLElement>('[data-testid="glide-grid"]')
        ?.focus()
    })
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
          showRowMarkers={false}
          loadPage={loadPage}
          onAddRow={vi.fn()}
          onCellEdit={onCellEdit}
        />
      )
      await Promise.resolve()
    })

    expect(mocks.props?.rowMarkers).toBe("none")
    expect(
      container.querySelector('[data-testid="glide-grid"]')?.parentElement
        ?.classList
    ).toContain("pl-2")

    expect(container.firstElementChild?.classList).toContain(
      "eidos-file-detail-layout"
    )
    expect(
      document.getElementById("portal")?.dataset.eidosFileUiGlidePortal
    ).toBe("true")
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

  it("opens a Formula cell editor with the activated record as preview", async () => {
    const formulaField: EidosFileFieldInfo = {
      ...table.fields[1],
      id: "0198c72d-82b5-7000-8000-000000000003",
      name: "Score",
      type: "formula",
      tableColumnName: "score",
      property: { formula: '"Done" + 1', displayType: "number" },
      valueKind: "derived",
      isDerived: true,
      dependsOn: [table.fields[1]!.id],
    }
    const formulaTable: EidosFileTableSnapshot = {
      ...table,
      fields: [table.fields[0]!, formulaField],
      rowCount: 1,
    }
    const onEditFormula = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={formulaTable}
          loadPage={createLoadPage(formulaTable)}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit(formulaTable)}
          onEditFormula={onEditFormula}
        />
      )
      await Promise.resolve()
    })

    await act(async () => {
      mocks.props?.onCellActivated?.([1, 0])
    })

    expect(onEditFormula).toHaveBeenCalledWith(formulaField, "row_0", {
      left: 100,
      top: 32,
      width: 100,
      height: 32,
    })
  })

  it("activates only the link text while leaving the rest of a URL cell editable", async () => {
    const uri = "https://example.com/artwork?id=42#preview"
    const activateUrl = vi.fn(async () => undefined)
    const urlTable: EidosFileTableSnapshot = {
      ...table,
      fields: [
        {
          ...table.fields[0],
          name: "Artwork",
          type: "url",
          tableColumnName: "artwork",
        },
      ],
      rowCount: 1,
    }
    const loadPage = vi.fn(async (offset: number, limit: number) => ({
      tableId: urlTable.table.id,
      offset,
      limit,
      total: 1,
      rows: [{ _id: "row_0", artwork: uri }],
    }))

    await act(async () => {
      root.render(
        <EidosFileUIProvider activateUrl={activateUrl}>
          <EidosFileGrid
            table={urlTable}
            loadPage={loadPage}
            onAddRow={vi.fn()}
            onCellEdit={createCellEdit(urlTable)}
          />
        </EidosFileUIProvider>
      )
      await Promise.resolve()
    })

    const cell = mocks.props?.getCellContent([0, 0]) as UriCell
    expect(cell).toMatchObject({
      kind: GridCellKind.Uri,
      data: uri,
      hoverEffect: true,
    })
    expect(cell.onClickUri).toEqual(expect.any(Function))
    expect(mocks.props?.onCellClicked).toBeUndefined()

    const preventDefault = vi.fn()
    await act(async () => {
      cell.onClickUri?.({
        preventDefault,
      } as never)
      await Promise.resolve()
    })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(activateUrl).toHaveBeenCalledWith(uri)
  })

  it("leaves URL cell selection untouched when the Host cannot activate URLs", async () => {
    const uri = "https://example.com/artwork"
    const urlTable: EidosFileTableSnapshot = {
      ...table,
      fields: [
        {
          ...table.fields[0],
          name: "Artwork",
          type: "url",
          tableColumnName: "artwork",
        },
      ],
      rowCount: 1,
    }

    await act(async () => {
      root.render(
        <EidosFileGrid
          table={urlTable}
          loadPage={async (offset, limit) => ({
            tableId: urlTable.table.id,
            offset,
            limit,
            total: 1,
            rows: [{ _id: "row_0", artwork: uri }],
          })}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit(urlTable)}
        />
      )
      await Promise.resolve()
    })

    expect(mocks.props?.onCellClicked).toBeUndefined()
  })

  it("updates the mounted Canvas from its scoped semantic theme", async () => {
    const loadPage = createLoadPage()
    const renderTheme = async (
      themeName: "light" | "dark",
      primary: string,
      background: string
    ) => {
      await act(async () => {
        root.render(
          <EidosFileUIProvider themeName={themeName}>
            <div
              data-eidos-file-root=""
              data-theme={themeName}
              style={
                {
                  "--background": background,
                  "--foreground": "rgb(24, 30, 35)",
                  "--muted": "rgb(238, 242, 244)",
                  "--muted-foreground": "rgb(91, 101, 108)",
                  "--accent": "rgb(215, 240, 244)",
                  "--border": "rgb(210, 216, 220)",
                  "--primary": primary,
                  "--primary-foreground": "rgb(250, 253, 254)",
                } as never
              }
            >
              <EidosFileGrid
                table={table}
                loadPage={loadPage}
                onAddRow={vi.fn()}
                onCellEdit={createCellEdit()}
              />
            </div>
          </EidosFileUIProvider>
        )
        await Promise.resolve()
      })
    }

    await renderTheme("light", "rgb(12, 132, 150)", "rgb(255, 255, 255)")
    const mountedGrid = container.querySelector('[data-testid="glide-grid"]')
    const mountedPortal = document.getElementById("portal")
    await vi.waitFor(() => {
      expect(mocks.props?.theme?.accentColor).toBe("rgb(12, 132, 150)")
      expect(mocks.props?.theme?.bgCell).toBe("rgb(255, 255, 255)")
      expect(mocks.props?.theme?.accentLight).toBe("rgb(215, 240, 244)")
    })

    await renderTheme("dark", "rgb(94, 208, 220)", "rgb(28, 34, 38)")
    await vi.waitFor(() => {
      expect(mocks.props?.theme?.accentColor).toBe("rgb(94, 208, 220)")
      expect(mocks.props?.theme?.bgCell).toBe("rgb(28, 34, 38)")
    })
    expect(container.querySelector('[data-testid="glide-grid"]')).toBe(
      mountedGrid
    )
    expect(document.getElementById("portal")).toBe(mountedPortal)
    expect(mountedPortal?.dataset.theme).toBe("dark")
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

  it("protects optimistic cells and keeps saves flowing across a refresh", async () => {
    let resolveTitle: ((result: EidosFileRowMutationResult) => void) | undefined
    const onCellEdit = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveTitle = resolve
          })
      )
      .mockImplementation(async (row, field, value) => ({
        tableId: "tasks",
        row: { ...row, [field.tableColumnName]: value },
        rowCount: table.rowCount,
      }))
    const renderGrid = (
      loadPage: (offset: number, limit: number) => Promise<EidosFileRowPage>
    ) => (
      <EidosFileGrid
        table={table}
        view={table.views[0]}
        loadPage={loadPage}
        onAddRow={vi.fn()}
        onCellEdit={onCellEdit}
      />
    )
    await act(async () => {
      root.render(renderGrid(createLoadPage()))
      await Promise.resolve()
    })

    act(() => {
      mocks.props?.onCellEdited?.([0, 0], {
        kind: GridCellKind.Text,
        allowOverlay: true,
        data: "Write implementation",
        displayData: "Write implementation",
      })
    })
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      data: "Write implementation",
    })

    // A snapshot refresh lands while the first save is still in flight. Its
    // refetch reads stale rows and must not clobber the optimistic cell, or
    // an open editor would reset mid-typing.
    await act(async () => {
      root.render(renderGrid(createLoadPage()))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      data: "Write implementation",
    })

    act(() => {
      mocks.props?.onCellEdited?.([1, 0], {
        kind: GridCellKind.Boolean,
        allowOverlay: false,
        data: true,
      })
    })

    // Completing the first save must drain the queued edit even though the
    // refresh advanced the grid generation; previously the queue stalled and
    // the second write was silently discarded.
    await act(async () => {
      resolveTitle?.({
        tableId: "tasks",
        row: { ...rowAt(0), title: "Write implementation" },
        rowCount: table.rowCount,
      })
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(onCellEdit).toHaveBeenCalledTimes(2)
    await act(async () => {
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      data: "Write implementation",
    })
    expect(mocks.props?.getCellContent([1, 0])).toMatchObject({ data: true })
  })

  it("keeps customRenderers referentially stable across refreshes", async () => {
    const renderGrid = (
      loadPage: (offset: number, limit: number) => Promise<EidosFileRowPage>
    ) => (
      <EidosFileGrid
        table={table}
        view={table.views[0]}
        loadPage={loadPage}
        onAddRow={vi.fn()}
        onCellEdit={vi.fn()}
      />
    )
    await act(async () => {
      root.render(renderGrid(createLoadPage()))
      await Promise.resolve()
    })
    const firstRenderers = mocks.props?.customRenderers

    // A snapshot refresh re-renders the grid. Glide rebuilds its cell-renderer
    // lookup whenever customRenderers changes identity, which remounts an open
    // overlay editor and re-selects its text mid-typing.
    await act(async () => {
      root.render(renderGrid(createLoadPage()))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(firstRenderers).toBeDefined()
    expect(mocks.props?.customRenderers).toBe(firstRenderers)
  })

  it("pins an appended row under its editor until the draft session ends", async () => {
    const rowA = rowAt(0)
    const rowB = rowAt(1)
    const appendedRow = { _id: "row_appended", title: null, done: 0 }
    const onCellEdit = createCellEdit()
    const onAddRow = vi.fn(async () => ({
      tableId: "tasks",
      row: appendedRow,
      rowCount: 3,
    }))
    const renderGrid = (rows: EidosFileRow[], reloadToken: number) => (
      <EidosFileGrid
        table={{ ...table, rowCount: 2 }}
        view={table.views[0]}
        reloadToken={reloadToken}
        loadPage={vi.fn(async () => ({
          tableId: "tasks",
          offset: 0,
          limit: 100,
          total: rows.length,
          rows,
        }))}
        onAddRow={onAddRow}
        onCellEdit={onCellEdit}
      />
    )
    await act(async () => {
      root.render(renderGrid([rowA, rowB], 0))
      await Promise.resolve()
    })
    await act(async () => {
      await mocks.props?.onRowAppended?.()
    })
    const appendedCell = mocks.props?.getCellContent([0, 2])
    expect(appendedCell).toMatchObject({ data: "" })

    // Glide focuses the appended row and opens its editor.
    act(() => {
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: [0, 2],
          range: { x: 0, y: 2, width: 1, height: 1 },
          rangeStack: [],
        },
      })
    })

    // The updated-time sort puts the just-created row at the top, but the
    // draft stays pinned at its creation index while its editor is open:
    // the revalidation is deferred instead of moving the row mid-edit.
    await act(async () => {
      root.render(renderGrid([appendedRow, rowA, rowB], 1))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      data: "Write RFC",
    })
    expect(mocks.props?.getCellContent([0, 2])).toMatchObject({
      data: "",
    })
    expect(mocks.props?.highlightRegions).toContainEqual({
      color: "rgba(43, 81, 128, 0.1)",
      range: { x: 0, y: 2, width: 2, height: 1 },
      style: "no-outline",
    })

    act(() => {
      mocks.props?.onItemHovered?.({
        kind: "cell",
        location: [0, 2],
        bounds: { x: 100, y: 200, width: 180, height: 36 },
      } as never)
    })
    expect(
      document.querySelector("[data-eidos-file-draft-move-tooltip]")
        ?.textContent
    ).toContain("may move or leave the view")

    // DataEditor always offers edits to onCellsEdited first. Exiting the
    // untouched empty editor must not clear the pinned draft row.
    act(() => {
      mocks.props?.onCellsEdited?.([
        {
          location: [0, 2],
          value: appendedCell as EditableGridCell,
        },
      ])
    })
    await act(async () => {
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onCellEdit).not.toHaveBeenCalled()
    expect(mocks.props?.getCellContent([0, 2])).toMatchObject({
      data: "",
    })

    act(() => {
      mocks.props?.onCellsEdited?.([
        {
          location: [0, 2],
          value: {
            ...(appendedCell as EditableGridCell),
            data: "New task",
            displayData: "New task",
          } as EditableGridCell,
        },
      ])
    })
    await act(async () => {
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(onCellEdit).toHaveBeenCalledWith(
      appendedRow,
      table.fields[0],
      "New task"
    )
    expect(mocks.props?.getCellContent([0, 2])).toMatchObject({
      data: "New task",
    })

    // Moving the selection off the draft ends its session: the deferred
    // refresh applies and the row lands at its truthful sorted position.
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
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      data: "",
    })
    expect(mocks.props?.getCellContent([0, 2])).toMatchObject({
      data: "Row 1",
    })
    expect(
      document.querySelector("[data-eidos-file-draft-move-tooltip]")
    ).toBeNull()
    expect(mocks.props?.highlightRegions).not.toContainEqual(
      expect.objectContaining({
        range: expect.objectContaining({ y: 2 }),
        style: "no-outline",
      })
    )
  })

  it("follows a sorted draft to its truthful row when keyboard editing ends", async () => {
    const rowA = rowAt(0)
    const rowB = rowAt(1)
    const appendedRow = { _id: "row_appended", title: "New task", done: 0 }
    const locateRow = vi.fn(async () => 0)
    const renderGrid = (rows: EidosFileRow[], reloadToken: number) => (
      <EidosFileGrid
        table={{ ...table, rowCount: 2 }}
        view={table.views[0]}
        reloadToken={reloadToken}
        loadPage={vi.fn(async () => ({
          tableId: "tasks",
          offset: 0,
          limit: 100,
          total: rows.length,
          rows,
        }))}
        locateRow={locateRow}
        onAddRow={vi.fn(async () => ({
          tableId: "tasks",
          row: appendedRow,
          rowCount: 3,
        }))}
        onCellEdit={createCellEdit()}
      />
    )

    await act(async () => {
      root.render(renderGrid([rowA, rowB], 0))
      await Promise.resolve()
    })
    await act(async () => {
      await mocks.props?.onRowAppended?.()
    })
    act(() => {
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: [0, 2],
          range: { x: 0, y: 2, width: 1, height: 1 },
          rangeStack: [],
        },
      })
    })
    await act(async () => {
      root.render(renderGrid([appendedRow, rowA, rowB], 1))
      await Promise.resolve()
      await Promise.resolve()
    })

    act(() => {
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: [0, 1],
          range: { x: 0, y: 1, width: 1, height: 1 },
          rangeStack: [],
        },
      })
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(locateRow).toHaveBeenCalledWith("row_appended")
    expect(mocks.props?.gridSelection?.current?.cell).toEqual([0, 0])
    expect(mocks.scrollTo).toHaveBeenCalledWith(0, 0, "both", 0, 24, {
      vAlign: "center",
    })
    expect(mocks.focus).toHaveBeenCalled()
  })

  it("does not reclaim focus when a released draft remains at the same row", async () => {
    const appendedRow = { _id: "row_appended", title: "New task", done: 0 }
    let created = false
    const locateRow = vi.fn(async () => 2)
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={{ ...table, rowCount: 2 }}
          view={table.views[0]}
          loadPage={vi.fn(async () => ({
            tableId: "tasks",
            offset: 0,
            limit: 100,
            total: created ? 3 : 2,
            rows: created
              ? [rowAt(0), rowAt(1), appendedRow]
              : [rowAt(0), rowAt(1)],
          }))}
          locateRow={locateRow}
          onAddRow={vi.fn(async () => {
            created = true
            return { tableId: "tasks", row: appendedRow, rowCount: 3 }
          })}
          onCellEdit={createCellEdit()}
        />
      )
      await Promise.resolve()
    })
    await act(async () => {
      await mocks.props?.onRowAppended?.()
    })
    act(() => {
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: [0, 2],
          range: { x: 0, y: 2, width: 1, height: 1 },
          rangeStack: [],
        },
      })
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: [0, 1],
          range: { x: 0, y: 1, width: 1, height: 1 },
          rangeStack: [],
        },
      })
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(locateRow).toHaveBeenCalledWith("row_appended")
    expect(mocks.props?.gridSelection?.current?.cell).toEqual([0, 1])
    expect(mocks.scrollTo).not.toHaveBeenCalled()
  })

  it("does not follow a sorted draft after the user deliberately clicks away", async () => {
    const rowA = rowAt(0)
    const rowB = rowAt(1)
    const appendedRow = { _id: "row_appended", title: "New task", done: 0 }
    const locateRow = vi.fn(async () => 0)
    const renderGrid = (rows: EidosFileRow[], reloadToken: number) => (
      <EidosFileGrid
        table={{ ...table, rowCount: 2 }}
        view={table.views[0]}
        reloadToken={reloadToken}
        loadPage={vi.fn(async () => ({
          tableId: "tasks",
          offset: 0,
          limit: 100,
          total: rows.length,
          rows,
        }))}
        locateRow={locateRow}
        onAddRow={vi.fn(async () => ({
          tableId: "tasks",
          row: appendedRow,
          rowCount: 3,
        }))}
        onCellEdit={createCellEdit()}
      />
    )

    await act(async () => {
      root.render(renderGrid([rowA, rowB], 0))
      await Promise.resolve()
    })
    await act(async () => {
      await mocks.props?.onRowAppended?.()
    })
    act(() => {
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: [0, 2],
          range: { x: 0, y: 2, width: 1, height: 1 },
          rangeStack: [],
        },
      })
    })
    await act(async () => {
      root.render(renderGrid([appendedRow, rowA, rowB], 1))
      await Promise.resolve()
      await Promise.resolve()
    })

    act(() => {
      container
        .querySelector('[data-testid="glide-grid"]')
        ?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }))
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: [0, 1],
          range: { x: 0, y: 1, width: 1, height: 1 },
          rangeStack: [],
        },
      })
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      await Promise.resolve()
    })

    expect(locateRow).not.toHaveBeenCalled()
    expect(mocks.props?.gridSelection?.current?.cell).toEqual([0, 1])
  })

  it("keeps an appended row visible against a filter while its editor is open", async () => {
    const rowA = rowAt(0)
    const rowB = rowAt(1)
    const appendedRow = { _id: "row_appended", title: null, done: 0 }
    const onAddRow = vi.fn(async () => ({
      tableId: "tasks",
      row: appendedRow,
      rowCount: 3,
    }))
    const renderGrid = (
      rows: EidosFileRow[],
      total: number,
      reloadToken: number
    ) => (
      <EidosFileGrid
        table={{ ...table, rowCount: 2 }}
        view={table.views[0]}
        reloadToken={reloadToken}
        loadPage={vi.fn(async () => ({
          tableId: "tasks",
          offset: 0,
          limit: 100,
          total,
          rows,
        }))}
        onAddRow={onAddRow}
        onCellEdit={createCellEdit()}
      />
    )
    await act(async () => {
      root.render(renderGrid([rowA, rowB], 2, 0))
      await Promise.resolve()
    })
    await act(async () => {
      await mocks.props?.onRowAppended?.()
    })
    expect(mocks.props?.rows).toBe(3)
    expect(mocks.props?.getCellContent([0, 2])).toMatchObject({ data: "" })

    // Glide focuses the appended row and opens its editor.
    act(() => {
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: [0, 2],
          range: { x: 0, y: 2, width: 1, height: 1 },
          rangeStack: [],
        },
      })
    })

    // The active filter excludes the new row: the revalidation reports the
    // smaller total. The pinned draft must survive instead of vanishing
    // while its editor is open.
    await act(async () => {
      root.render(renderGrid([rowA, rowB], 2, 1))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mocks.props?.rows).toBe(3)
    expect(mocks.props?.getCellContent([0, 2])).toMatchObject({ data: "" })

    // Ending the session releases the pin; the deferred refresh then applies
    // the filter truthfully and the non-matching row leaves the view.
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
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mocks.props?.rows).toBe(2)
  })

  it("does not duplicate a pinned draft when an unloaded page sees its sorted identity", async () => {
    const appendedRow = { _id: "row_appended", title: null, done: 0 }
    let created = false
    const loadPage = vi.fn(async (offset: number, limit: number) => {
      if (offset === 0) {
        return {
          tableId: "tasks",
          offset,
          limit,
          total: created ? 251 : 250,
          rows: created
            ? [
                appendedRow,
                ...Array.from({ length: 99 }, (_, index) => rowAt(index)),
              ]
            : Array.from({ length: 100 }, (_, index) => rowAt(index)),
        }
      }
      if (offset === 200) {
        return {
          tableId: "tasks",
          offset,
          limit,
          total: 251,
          rows: [
            appendedRow,
            ...Array.from({ length: 50 }, (_, index) => rowAt(200 + index)),
          ],
        }
      }
      throw new Error(`Unexpected page offset: ${offset}`)
    })
    const onAddRow = vi.fn(async () => {
      created = true
      return { tableId: "tasks", row: appendedRow, rowCount: 251 }
    })
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          view={table.views[0]}
          loadPage={loadPage}
          onAddRow={onAddRow}
          onCellEdit={createCellEdit()}
        />
      )
      await Promise.resolve()
    })
    await act(async () => {
      await mocks.props?.onRowAppended?.()
    })
    act(() => {
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: [0, 250],
          range: { x: 0, y: 250, width: 1, height: 1 },
          rangeStack: [],
        },
      })
    })

    await act(async () => {
      mocks.props?.onVisibleRegionChanged?.(
        { x: 0, y: 200, width: 2, height: 20 },
        0,
        0,
        {}
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(loadPage).toHaveBeenCalledWith(200, 100)
    expect(mocks.props?.getCellContent([0, 200])).toMatchObject({
      kind: GridCellKind.Loading,
    })
    expect(mocks.props?.getCellContent([0, 250])).toMatchObject({ data: "" })

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
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({ data: "" })
  })

  it("keeps fill edits on their target rows", async () => {
    const onCellEdit = createCellEdit()
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={{ ...table, rowCount: 2 }}
          view={table.views[0]}
          loadPage={vi.fn(async () => ({
            tableId: "tasks",
            offset: 0,
            limit: 100,
            total: 2,
            rows: [rowAt(0), rowAt(1)],
          }))}
          onAddRow={vi.fn()}
          onCellEdit={onCellEdit}
        />
      )
      await Promise.resolve()
    })
    const sourceCell = mocks.props?.getCellContent([0, 0])

    // Glide's fill handle copies the source cell object into another row. Its
    // identity metadata describes the value source, while the edit location
    // is the record that must be changed.
    act(() => {
      mocks.props?.onCellsEdited?.([
        {
          location: [0, 1],
          value: sourceCell as EditableGridCell,
        },
      ])
    })
    await act(async () => {
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onCellEdit).toHaveBeenCalledWith(
      rowAt(1),
      table.fields[0],
      "Write RFC"
    )
    expect(mocks.props?.getCellContent([0, 1])).toMatchObject({
      data: "Write RFC",
    })
  })

  it("retargets undo history after rows are re-sorted", async () => {
    const rowA = rowAt(0)
    const rowB = rowAt(1)
    const onCellEdit = createCellEdit()
    const renderGrid = (rows: EidosFileRow[]) => (
      <EidosFileGrid
        table={{ ...table, rowCount: 2 }}
        view={table.views[0]}
        loadPage={vi.fn(async () => ({
          tableId: "tasks",
          offset: 0,
          limit: 100,
          total: 2,
          rows,
        }))}
        onAddRow={vi.fn()}
        onCellEdit={onCellEdit}
      />
    )
    await act(async () => {
      root.render(renderGrid([rowA, rowB]))
      await Promise.resolve()
    })
    act(() => {
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: [0, 1],
          range: { x: 0, y: 1, width: 1, height: 1 },
          rangeStack: [],
        },
      })
    })
    const editedCell = mocks.props?.getCellContent([0, 1])
    act(() => {
      mocks.props?.onCellsEdited?.([
        {
          location: [0, 1],
          value: {
            ...(editedCell as EditableGridCell),
            data: "Edited row B",
            displayData: "Edited row B",
          } as EditableGridCell,
        },
      ])
    })
    await act(async () => {
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    await act(async () => {
      root.render(renderGrid([{ ...rowB, title: "Edited row B" }, rowA]))
      await Promise.resolve()
      await Promise.resolve()
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
      expect.objectContaining({ _id: rowB._id }),
      table.fields[0],
      rowB.title
    )
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      data: rowB.title,
    })
    expect(mocks.props?.getCellContent([0, 1])).toMatchObject({
      data: rowA.title,
    })
  })

  it("drops an editor commit whose row left the grid", async () => {
    const rowA = rowAt(0)
    const rowB = rowAt(1)
    const onCellEdit = createCellEdit()
    const renderGrid = (rows: ReturnType<typeof rowAt>[]) => (
      <EidosFileGrid
        table={{ ...table, rowCount: rows.length }}
        view={table.views[0]}
        loadPage={vi.fn(async () => ({
          tableId: "tasks",
          offset: 0,
          limit: 100,
          total: rows.length,
          rows,
        }))}
        onAddRow={vi.fn()}
        onCellEdit={onCellEdit}
      />
    )
    await act(async () => {
      root.render(renderGrid([rowA, rowB]))
      await Promise.resolve()
    })
    const editedCell = mocks.props?.getCellContent([0, 1])

    await act(async () => {
      root.render(renderGrid([rowA]))
      await Promise.resolve()
      await Promise.resolve()
    })
    act(() => {
      mocks.props?.onCellsEdited?.([
        {
          location: [0, 1],
          value: {
            ...(editedCell as EditableGridCell),
            data: "Edited row B",
            displayData: "Edited row B",
          } as EditableGridCell,
        },
      ])
    })
    await act(async () => {
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(onCellEdit).not.toHaveBeenCalled()
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

  it("focuses the Grid when a view opens so keys work immediately", async () => {
    const renderGrid = (viewId: string) => (
      <EidosFileGrid
        table={table}
        view={{ ...table.views[0], id: viewId }}
        loadPage={createLoadPage()}
        onAddRow={vi.fn()}
        onCellEdit={createCellEdit()}
      />
    )
    await act(async () => {
      root.render(renderGrid("view_a"))
    })
    // Focus retries on animation frames because Glide mounts its canvas a
    // commit after the editor shell. Wait after React has flushed the effect
    // that schedules the first frame.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(mocks.focus).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-testid="glide-grid"]')).toBe(
      document.activeElement
    )

    // Simulate the user moving focus out (e.g. opening a kanban view), then
    // switch back: the Grid takes focus again.
    await act(async () => {
      ;(document.activeElement as HTMLElement | null)?.blur()
      root.render(renderGrid("view_b"))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(mocks.focus).toHaveBeenCalledTimes(2)
  })

  it("does not steal focus from a control used before the first Grid frame", async () => {
    const frames: FrameRequestCallback[] = []
    const requestFrame = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation((callback) => {
        frames.push(callback)
        return frames.length
      })
    const outsideButton = document.createElement("button")
    document.body.append(outsideButton)
    try {
      await act(async () => {
        root.render(
          <EidosFileGrid
            table={table}
            view={table.views[0]}
            loadPage={createLoadPage()}
            onAddRow={vi.fn()}
            onCellEdit={createCellEdit()}
          />
        )
      })
      outsideButton.focus()
      act(() => frames.shift()?.(0))

      expect(mocks.focus).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(outsideButton)
    } finally {
      requestFrame.mockRestore()
      outsideButton.remove()
    }
  })

  it("creates a record with the Grid shortcut and edits the record label", async () => {
    const onAddRow = vi.fn(async () => ({
      tableId: table.table.id,
      row: { _id: "row_new", title: "", done: 0 },
      rowCount: table.rowCount + 1,
    }))
    const view = {
      ...table.views[0],
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
          onAddRow={onAddRow}
          onCellEdit={createCellEdit()}
        />
      )
      await Promise.resolve()
    })

    const gridElement = container.querySelector<HTMLElement>(
      '[data-testid="glide-grid"]'
    )
    await act(async () => {
      gridElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
      await Promise.resolve()
    })

    expect(mocks.appendRow).toHaveBeenCalledWith(1, true)
    expect(onAddRow).toHaveBeenCalledOnce()
  })

  it("keeps cell actions keyboard-accessible from the focused cell", async () => {
    const onRequestDeleteRows = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          view={table.views[0]}
          loadPage={createLoadPage()}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit()}
          onRequestDeleteRows={onRequestDeleteRows}
        />
      )
      await Promise.resolve()
    })
    act(() => {
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: [0, 1],
          range: { x: 0, y: 1, width: 1, height: 1 },
          rangeStack: [],
        },
      })
    })

    const gridElement = container.querySelector<HTMLElement>(
      '[data-testid="glide-grid"]'
    )
    act(() => {
      gridElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F10",
          shiftKey: true,
          bubbles: true,
        })
      )
    })

    const menu = [...document.body.querySelectorAll('[role="menu"]')].find(
      (candidate) => candidate.textContent?.includes("Delete record")
    )
    expect(menu).toBeTruthy()
    expect(mocks.getBounds).toHaveBeenCalledWith(0, 1)
    expect(menu?.contains(document.activeElement)).toBe(true)

    const deleteItem = [...(menu?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent?.includes("Delete record")
    )
    act(() => {
      menu?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "End",
          bubbles: true,
          cancelable: true,
        })
      )
    })
    expect(document.activeElement).toBe(deleteItem)
    await act(async () => {
      deleteItem?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onRequestDeleteRows).toHaveBeenCalledWith([
      { startIndex: 1, endIndex: 2 },
    ])

    // Windows keyboards may expose a dedicated Menu key instead of the
    // Shift+F10 chord. It must reopen the same actions for the current cell.
    act(() => {
      gridElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ContextMenu",
          bubbles: true,
        })
      )
    })
    expect(
      [...document.body.querySelectorAll('[role="menu"]')].some((candidate) =>
        candidate.textContent?.includes("Delete record")
      )
    ).toBe(true)
  })

  it("undoes and redoes a deleted record through the asynchronous row command", async () => {
    let authoritativeRowCount = 250
    const loadPage = vi.fn((offset: number, limit: number) =>
      createLoadPage({ ...table, rowCount: authoritativeRowCount })(
        offset,
        limit
      )
    )
    const undoApply = vi.fn()
    const redoApply = vi.fn()
    undoApply.mockImplementation(async () => {
      authoritativeRowCount = 250
      return { rowCountDelta: -1, apply: redoApply }
    })
    redoApply.mockImplementation(async () => {
      authoritativeRowCount = 249
      return { rowCountDelta: 1, apply: undoApply }
    })
    const onRequestDeleteRows = vi.fn(async () => {
      authoritativeRowCount = 249
      return {
        rowCount: 249,
        undo: { rowCountDelta: 1, apply: undoApply },
      }
    })
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          view={table.views[0]}
          loadPage={loadPage}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit()}
          onRequestDeleteRows={onRequestDeleteRows}
        />
      )
      await Promise.resolve()
    })

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
      mocks.props?.onCellContextMenu?.([0, 0], {
        bounds: { x: 40, y: 56, width: 180, height: 36 },
        localEventX: 30,
        localEventY: 18,
        preventDefault: vi.fn(),
      } as never)
    })
    const deleteRecord = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Delete record")
    )
    await act(async () => {
      deleteRecord?.click()
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(onRequestDeleteRows).toHaveBeenCalledWith([
      { startIndex: 0, endIndex: 1 },
    ])
    expect(mocks.props?.rows).toBe(249)

    const gridElement = container.querySelector<HTMLElement>(
      '[data-testid="glide-grid"]'
    )!
    gridElement.focus()
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", metaKey: true })
      )
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(undoApply).toHaveBeenCalledOnce()
    expect(mocks.props?.rows).toBe(250)

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          metaKey: true,
          shiftKey: true,
        })
      )
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(redoApply).toHaveBeenCalledOnce()
    expect(mocks.props?.rows).toBe(249)

    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          view={table.views[0]}
          historyScopeKey="filtered-query"
          loadPage={loadPage}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit()}
          onRequestDeleteRows={onRequestDeleteRows}
        />
      )
      await Promise.resolve()
    })
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", metaKey: true })
      )
      await Promise.resolve()
    })
    expect(undoApply).toHaveBeenCalledOnce()
  })

  it("restores Grid focus so the cell actions shortcut can be used repeatedly", async () => {
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          view={table.views[0]}
          loadPage={createLoadPage()}
          onAddRow={vi.fn()}
          onCellEdit={createCellEdit()}
        />
      )
      await Promise.resolve()
    })
    act(() => {
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: [0, 1],
          range: { x: 0, y: 1, width: 1, height: 1 },
          rangeStack: [],
        },
      })
    })
    const gridElement = container.querySelector<HTMLElement>(
      '[data-testid="glide-grid"]'
    )
    gridElement?.focus()

    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F10",
          shiftKey: true,
          bubbles: true,
        })
      )
    })
    const firstMenu = [...document.body.querySelectorAll('[role="menu"]')].find(
      (candidate) => candidate.textContent?.includes("Copy cell")
    )
    const copyCell = [...(firstMenu?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent?.includes("Copy cell")
    )
    expect(firstMenu?.contains(document.activeElement)).toBe(true)

    await act(async () => {
      copyCell?.click()
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(document.activeElement).toBe(gridElement)

    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F10",
          shiftKey: true,
          bubbles: true,
        })
      )
    })
    expect(
      [...document.body.querySelectorAll('[role="menu"]')].some((candidate) =>
        candidate.textContent?.includes("Copy cell")
      )
    ).toBe(true)
  })

  it("uses the Host-configured shortcut for cell actions", async () => {
    await act(async () => {
      root.render(
        <EidosFileUIProvider
          keyboardShortcuts={{ openCellActions: ["Alt+Enter"] }}
        >
          <EidosFileGrid
            table={table}
            view={table.views[0]}
            loadPage={createLoadPage()}
            onAddRow={vi.fn()}
            onCellEdit={createCellEdit()}
            onRequestDeleteRows={vi.fn()}
          />
        </EidosFileUIProvider>
      )
      await Promise.resolve()
    })
    act(() => {
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: [0, 1],
          range: { x: 0, y: 1, width: 1, height: 1 },
          rangeStack: [],
        },
      })
    })
    const gridElement = container.querySelector<HTMLElement>(
      '[data-testid="glide-grid"]'
    )

    act(() => {
      gridElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F10",
          shiftKey: true,
          bubbles: true,
        })
      )
    })
    expect(document.body.textContent).not.toContain("Delete record")

    act(() => {
      gridElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          altKey: true,
          bubbles: true,
        })
      )
    })
    expect(document.body.textContent).toContain("Delete record")
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

  it("renders and edits a new row before its authoritative insert settles", async () => {
    let resolveInsert:
      | ((result: EidosFileRowMutationResult) => void)
      | undefined
    const settled = new Promise<EidosFileRowMutationResult>((resolve) => {
      resolveInsert = resolve
    })
    const onAddRow = vi.fn(() => ({
      tableId: "tasks",
      row: { _id: "optimistic:new-row" },
      rowCount: 1,
      settled,
    }))
    const onCellEdit = vi.fn(
      async (
        row: EidosFileRow,
        field: EidosFileFieldInfo,
        value: EidosFileSqlPrimitive
      ) => ({
        tableId: "tasks",
        row: { ...row, [field.tableColumnName]: value },
        rowCount: 1,
      })
    )
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={{ ...table, rowCount: 0 }}
          loadPage={vi.fn(async () => ({
            tableId: "tasks",
            offset: 0,
            limit: 100,
            total: 0,
            rows: [],
          }))}
          onAddRow={onAddRow}
          onCellEdit={onCellEdit}
        />
      )
      await Promise.resolve()
    })

    await act(async () => {
      await mocks.props?.onRowAppended?.()
    })
    expect(mocks.props?.rows).toBe(1)
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({ data: "" })

    act(() => {
      mocks.props?.onCellEdited?.([0, 0], {
        kind: GridCellKind.Text,
        allowOverlay: true,
        data: "Draft task",
        displayData: "Draft task",
      })
    })
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      data: "Draft task",
    })
    expect(onCellEdit).not.toHaveBeenCalled()

    await act(async () => {
      resolveInsert?.({
        tableId: "tasks",
        row: { _id: "row_created", title: null, done: 0 },
        rowCount: 1,
      })
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(onCellEdit).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "row_created" }),
      expect.objectContaining({ tableColumnName: "title" }),
      "Draft task"
    )
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      data: "Draft task",
    })
  })

  it("does not replace a filtered result count with the full table count after insert", async () => {
    let resolveInsert:
      | ((result: EidosFileRowMutationResult) => void)
      | undefined
    const settled = new Promise<EidosFileRowMutationResult>((resolve) => {
      resolveInsert = resolve
    })
    const onAddRow = vi.fn(() => ({
      tableId: "tasks",
      row: { _id: "optimistic:filtered-row" },
      rowCount: 14,
      settled,
    }))
    const filteredRows = Array.from({ length: 10 }, (_, index) => rowAt(index))

    await act(async () => {
      root.render(
        <EidosFileGrid
          table={{ ...table, rowCount: 13 }}
          view={{
            ...table.views[0]!,
            filter: {
              type: "group",
              conjunction: "and",
              children: [
                {
                  type: "rule",
                  field: table.fields[0]!.id,
                  operator: "is-not-empty",
                },
              ],
            },
          }}
          loadPage={vi.fn(async (offset: number, limit: number) => ({
            tableId: "tasks",
            offset,
            limit,
            total: filteredRows.length,
            rows: filteredRows.slice(offset, offset + limit),
          }))}
          onAddRow={onAddRow}
          onCellEdit={createCellEdit()}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mocks.props?.rows).toBe(10)

    await act(async () => {
      await mocks.props?.onRowAppended?.()
    })
    expect(mocks.props?.rows).toBe(11)

    act(() => {
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: [0, 10],
          range: { x: 0, y: 10, width: 1, height: 1 },
          rangeStack: [],
        },
      })
    })

    await act(async () => {
      resolveInsert?.({
        tableId: "tasks",
        row: { _id: "row_filtered", title: null, done: 0 },
        rowCount: 14,
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.props?.rows).toBe(11)
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

  it("routes synchronous column stat loader failures through the Grid error boundary", async () => {
    const runtimeError = new Error(
      "The Eidos File editor Runtime is not connected"
    )
    const loadColumnStats = vi.fn(() => {
      throw runtimeError
    })
    const onError = vi.fn()
    const view = {
      ...table.views[0],
      properties: {
        columnStats: {
          "0198c72d-82b5-7000-8000-000000000002": {
            type: "percent-checked" as const,
          },
        },
      },
    }

    await act(async () => {
      root.render(
        <EidosFileGrid
          table={table}
          view={view}
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

    expect(loadColumnStats).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(runtimeError)
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
    const openInTab = container.querySelector<HTMLButtonElement>(
      '[aria-label="Open record in tab"]'
    )
    act(() => {
      openInTab?.focus()
      openInTab?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F10",
          shiftKey: true,
          bubbles: true,
        })
      )
    })
    expect(
      [...document.body.querySelectorAll('[role="menu"]')].some((candidate) =>
        candidate.textContent?.includes("Delete record")
      )
    ).toBe(false)
    act(() => {
      openInTab?.click()
    })
    expect(onOpenRecordInTab).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "row_0", title: "Write RFC" })
    )

    openCellMenu()
    const deleteRecord = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Delete record")
    )
    expect(deleteRecord).toBeTruthy()
    await act(async () => {
      deleteRecord?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
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
        color: "rgba(43, 81, 128, 0.14)",
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
    const duplicateExisting: FileEntry = {
      ...existingEntries[0]!,
      id: "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45f",
    }
    const loadPage = vi.fn(async () => ({
      tableId: "tasks",
      offset: 0,
      limit: 100,
      total: 1,
      rows: [row],
    }))
    const onCellEdit = createCellEdit()
    const onImportFiles = vi.fn().mockResolvedValue(pickedEntries)
    const onImportDroppedFiles = vi
      .fn()
      .mockResolvedValue([duplicateExisting, ...droppedEntries])
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
        color: "rgba(43, 81, 128, 0.18)",
        range: { x: 2, y: 0, width: 1, height: 1 },
      },
    ])
    await act(async () => {
      mocks.props?.onDrop?.([2, 0], transfer)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onImportDroppedFiles).toHaveBeenCalledWith([dropped], "drop")
    expect(onCellEdit).toHaveBeenCalledWith(row, fileField, expect.any(String))
    expect(
      decodeEidosFileValues(
        onCellEdit.mock.calls.at(-1)?.[2] as string | undefined
      ).map((entry) => entry.uri)
    ).toEqual(["assets/existing.pdf", "assets/dropped.png"])
  })

  it("imports clipboard image files into the selected attachment cell", async () => {
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
    const droppedEntries = decodeEidosFileValues(
      encodeEidosFileAttachmentPaths(["assets/pasted.png"])
    )
    const loadPage = vi.fn(async () => ({
      tableId: "tasks",
      offset: 0,
      limit: 100,
      total: 1,
      rows: [row],
    }))
    const onCellEdit = createCellEdit()
    const onImportDroppedFiles = vi.fn().mockResolvedValue(droppedEntries)
    await act(async () => {
      root.render(
        <EidosFileGrid
          table={fileTable}
          loadPage={loadPage}
          onAddRow={vi.fn()}
          onCellEdit={onCellEdit}
          onImportDroppedFiles={onImportDroppedFiles}
        />
      )
      await Promise.resolve()
    })

    const dispatchPaste = (file: File, target: EventTarget = document.body) => {
      const pasteEvent = new Event("paste", {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(pasteEvent, "clipboardData", {
        value: { files: [file] },
      })
      target.dispatchEvent(pasteEvent)
      return pasteEvent
    }
    const pasted = new File(["image"], "pasted.png", { type: "image/png" })

    // A text cell is selected: clipboard files stay untouched.
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
    expect(dispatchPaste(pasted).defaultPrevented).toBe(false)
    expect(onImportDroppedFiles).not.toHaveBeenCalled()

    // The attachment cell is selected: pasted files import and persist.
    act(() => {
      mocks.props?.onGridSelectionChange?.({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: [2, 0],
          range: { x: 2, y: 0, width: 1, height: 1 },
          rangeStack: [],
        },
      })
    })
    const handledPaste = dispatchPaste(pasted)
    expect(handledPaste.defaultPrevented).toBe(true)
    expect(onImportDroppedFiles).toHaveBeenCalledWith([pasted], "paste")
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onCellEdit).toHaveBeenCalledWith(row, fileField, expect.any(String))
    expect(
      decodeEidosFileValues(
        onCellEdit.mock.calls.at(-1)?.[2] as string | undefined
      ).map((entry) => entry.uri)
    ).toEqual(["assets/existing.pdf", "assets/pasted.png"])

    // Pasting into an unrelated editor must not retarget the selected cell.
    const unrelatedInput = document.createElement("input")
    document.body.appendChild(unrelatedInput)
    const unrelatedPaste = dispatchPaste(pasted, unrelatedInput)
    expect(unrelatedPaste.defaultPrevented).toBe(false)
    expect(onImportDroppedFiles).toHaveBeenCalledTimes(1)
    unrelatedInput.remove()
  })

  it("keeps loaded attachment thumbnails across equivalent page loader updates", async () => {
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
    const entry: FileEntry = {
      id: "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e",
      mediaType: "image/png",
      name: "cover.png",
      size: "12",
      uri: "assets/cover.png",
    }
    const row = {
      ...rowAt(0),
      files: encodeEidosFileValues([entry]),
    }
    const lease = {
      leaseId: "lease-1",
      entryId: entry.id,
      purpose: "thumbnail" as const,
      mediaType: entry.mediaType,
      name: entry.name,
      size: entry.size,
      expiresAt: "2099-01-01T00:00:00.000Z",
      resourceToken: "blob:host/lease-1",
    }
    const resolveAsset = vi.fn(async () => lease)
    const releaseAsset = vi.fn(async () => undefined)
    const source = { height: 32, width: 32 } as unknown as CanvasImageSource
    const loadImage = vi.fn(async () => source)
    const assetPresenter = { loadImage }
    const assetSession = {
      services: { resolveAsset, releaseAsset },
      serviceCapabilities: { canUseAssets: true },
      state: {
        sessionId: "session-1",
        phase: "ready-clean",
        capabilities: { assetReadSchemes: ["relative"] },
        limits: {
          assetPreviewBytesMax: "1048576",
          concurrentAssetLeasesMax: 8,
        },
      },
    }
    const page = () => ({
      tableId: "tasks",
      offset: 0,
      limit: 100,
      total: 1,
      rows: [row],
    })
    const renderGrid = async (loadPage: ReturnType<typeof vi.fn>) => {
      await act(async () => {
        root.render(
          <EidosFileUIProvider
            assetSession={assetSession as never}
            assetPresenter={assetPresenter as never}
          >
            <EidosFileGrid
              table={fileTable}
              loadPage={loadPage}
              onAddRow={vi.fn()}
              onCellEdit={createCellEdit()}
            />
          </EidosFileUIProvider>
        )
        await Promise.resolve()
        await Promise.resolve()
      })
    }

    await renderGrid(vi.fn(async () => page()))
    mocks.props?.getCellContent([2, 0])
    await vi.waitFor(() => expect(resolveAsset).toHaveBeenCalledOnce())
    await vi.waitFor(() =>
      expect(mocks.props?.getCellContent([2, 0])).toMatchObject({
        data: { thumbnails: [source] },
      })
    )

    await renderGrid(vi.fn(async () => page()))

    expect(mocks.props?.getCellContent([2, 0])).toMatchObject({
      data: { thumbnails: [source] },
    })
    expect(resolveAsset).toHaveBeenCalledOnce()
    expect(releaseAsset).toHaveBeenCalledOnce()
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
