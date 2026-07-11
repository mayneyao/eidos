import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { BaseSnapshot } from "@eidos.space/base"

import { SpaceBaseEditor } from "./space-base-editor"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const getSnapshotMock = vi.hoisted(() => vi.fn())
const getTablePageMock = vi.hoisted(() => vi.fn())
const createTableMock = vi.hoisted(() => vi.fn())
const addFieldMock = vi.hoisted(() => vi.fn())
const updateViewMock = vi.hoisted(() => vi.fn())
const insertRowMock = vi.hoisted(() => vi.fn())
const updateRowMock = vi.hoisted(() => vi.fn())
const deleteRowRangesMock = vi.hoisted(() => vi.fn())

vi.mock("@/apps/web-app/hooks/use-current-space", () => ({
  useCurrentSpace: () => ({ currentSpace: { id: "space-a", mode: "file" } }),
}))

vi.mock("@/apps/web-app/hooks/use-space-base", () => ({
  useSpaceBase: () => ({
    getSnapshot: getSnapshotMock,
    getTablePage: getTablePageMock,
    createTable: createTableMock,
    addField: addFieldMock,
    updateView: updateViewMock,
    insertRow: insertRowMock,
    updateRow: updateRowMock,
    deleteRowRanges: deleteRowRangesMock,
  }),
}))

vi.mock("./base-structure-dialog", () => ({
  BaseStructureDialog: ({
    mode,
    open,
    onCreateTable,
    onCreateField,
  }: {
    mode: "table" | "field"
    open: boolean
    onCreateTable: (value: { name: string }) => void
    onCreateField: (value: {
      name: string
      columnName: string
      type: "text"
    }) => void
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          mode === "table"
            ? onCreateTable({ name: "Projects" })
            : onCreateField({
                name: "Owner",
                columnName: "owner",
                type: "text",
              })
        }
      >
        Confirm {mode}
      </button>
    ) : null,
}))

vi.mock("@/apps/web-app/hooks/use-space-files", () => ({
  useSpaceFileChanges: () => undefined,
}))

vi.mock("./base-grid", () => ({
  BaseGrid: ({
    table,
    onCellEdit,
    onSelectedRowsChange,
  }: {
    table: (typeof snapshot)["tables"][number]
    onCellEdit: (
      row: { _id: string; title: string; status: string },
      field: (typeof snapshot)["tables"][number]["fields"][number],
      value: string
    ) => void
    onSelectedRowsChange: (
      ranges: Array<{ startIndex: number; endIndex: number }>
    ) => void
  }) => {
    const row = { _id: "row_1", title: "Write RFC", status: "todo" }
    const title = table.fields.find(
      (field) => field.tableColumnName === "title"
    )
    return (
      <div data-testid="base-grid">
        {table.fields
          .filter((field) => !field.isHidden)
          .map((field) => (
            <span key={field.tableColumnName}>{field.name}</span>
          ))}
        <span>{String(row?.title ?? "")}</span>
        <span>{String(row?.status ?? "")}</span>
        <button
          type="button"
          onClick={() => {
            if (row && title) onCellEdit(row, title, "Write implementation")
          }}
        >
          Edit title
        </button>
        <button
          type="button"
          onClick={() => onSelectedRowsChange([{ startIndex: 0, endIndex: 1 }])}
        >
          Select row
        </button>
      </div>
    )
  },
}))

const snapshot: BaseSnapshot = {
  path: "projects/tasks.base",
  metadata: {
    format: "eidos-base",
    formatVersion: 1,
    schemaVersion: 1,
    app: "eidos",
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    title: "Tasks",
    defaultTableId: "tasks",
  },
  tables: [
    {
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
          name: "_id",
          type: "row-id",
          tableName: "tb_tasks",
          tableColumnName: "_id",
          property: null,
          storageCodec: "scalar",
          valueKind: "system",
          isHidden: true,
          isDerived: false,
          sourceTableColumnName: null,
          dependsOn: null,
        },
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
              { id: "todo", name: "Todo" },
              { id: "done", name: "Done" },
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
      rowCount: 1,
    },
  ],
}

describe("SpaceBaseEditor", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    getSnapshotMock.mockReset()
    getTablePageMock.mockReset()
    createTableMock.mockReset()
    addFieldMock.mockReset()
    updateViewMock.mockReset()
    insertRowMock.mockReset()
    updateRowMock.mockReset()
    deleteRowRangesMock.mockReset()
    getSnapshotMock.mockResolvedValue(snapshot)
    getTablePageMock.mockResolvedValue({
      tableId: "tasks",
      offset: 0,
      limit: 100,
      total: 1,
      rows: [{ _id: "row_1", title: "Write RFC", status: "todo" }],
    })
    createTableMock.mockResolvedValue(snapshot)
    addFieldMock.mockResolvedValue(snapshot)
    updateViewMock.mockResolvedValue(snapshot)
    insertRowMock.mockResolvedValue({
      tableId: "tasks",
      row: { _id: "row_2", title: "Untitled", status: null },
      rowCount: 2,
    })
    updateRowMock.mockResolvedValue({
      tableId: "tasks",
      row: {
        _id: "row_1",
        title: "Write implementation",
        status: "todo",
      },
      rowCount: 1,
    })
    deleteRowRangesMock.mockResolvedValue({
      tableId: "tasks",
      deletedCount: 1,
      rowCount: 0,
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function renderEditor() {
    await act(async () => {
      root.render(<SpaceBaseEditor filePath="projects/tasks.base" />)
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it("opens the default table and exposes editable source fields", async () => {
    await renderEditor()

    expect(getSnapshotMock).toHaveBeenCalledWith("projects/tasks.base")
    expect(container.textContent).toContain("Tasks")
    expect(container.textContent).toContain("Status")
    expect(container.textContent).not.toContain("_id")
    expect(container.textContent).toContain("Write RFC")
    expect(container.textContent).toContain("todo")
  })

  it("creates rows and saves a changed cell", async () => {
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("New row"))
        ?.click()
      await Promise.resolve()
    })
    expect(insertRowMock).toHaveBeenCalledWith("projects/tasks.base", "tasks", {
      title: "Untitled",
    })

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Edit title")
        ?.click()
      await Promise.resolve()
    })
    expect(updateRowMock).toHaveBeenCalledWith(
      "projects/tasks.base",
      "tasks",
      "row_1",
      { title: "Write implementation" }
    )
  })

  it("adds tables and fields through the Base structure API", async () => {
    await renderEditor()

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Add Base table"]')
        ?.click()
    })
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Confirm table")
        ?.click()
      await Promise.resolve()
    })
    expect(createTableMock).toHaveBeenCalledWith("projects/tasks.base", {
      name: "Projects",
    })

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("New field"))
        ?.click()
    })
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Confirm field")
        ?.click()
      await Promise.resolve()
    })
    expect(addFieldMock).toHaveBeenCalledWith("projects/tasks.base", "tasks", {
      name: "Owner",
      columnName: "owner",
      type: "text",
    })
  })

  it("deletes the rows selected by the Grid in one operation", async () => {
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Select row")
        ?.click()
    })
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Delete 1"))
        ?.click()
    })
    expect(document.body.textContent).toContain("Delete 1 row?")

    await act(async () => {
      Array.from(document.body.querySelectorAll("button"))
        .find((button) => button.textContent === "Delete rows")
        ?.click()
      await Promise.resolve()
    })

    expect(deleteRowRangesMock).toHaveBeenCalledWith(
      "projects/tasks.base",
      "tasks",
      [{ startIndex: 0, endIndex: 1 }]
    )
  })
})
