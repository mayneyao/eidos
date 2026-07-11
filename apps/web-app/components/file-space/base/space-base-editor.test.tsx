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
const updateTableMock = vi.hoisted(() => vi.fn())
const deleteTableMock = vi.hoisted(() => vi.fn())
const addFieldMock = vi.hoisted(() => vi.fn())
const updateFieldMock = vi.hoisted(() => vi.fn())
const deleteFieldMock = vi.hoisted(() => vi.fn())
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
    updateTable: updateTableMock,
    deleteTable: deleteTableMock,
    addField: addFieldMock,
    updateField: updateFieldMock,
    deleteField: deleteFieldMock,
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

vi.mock("./base-structure-menu", () => ({
  BaseStructureMenu: ({
    fields,
    onNewField,
    onRenameTable,
    onDeleteTable,
    onRenameField,
    onEditFieldOptions,
    onDeleteField,
  }: {
    fields: (typeof snapshot)["tables"][number]["fields"]
    onNewField: () => void
    onRenameTable: () => void
    onDeleteTable: () => void
    onRenameField: (
      field: (typeof snapshot)["tables"][number]["fields"][number]
    ) => void
    onEditFieldOptions: (
      field: (typeof snapshot)["tables"][number]["fields"][number]
    ) => void
    onDeleteField: (
      field: (typeof snapshot)["tables"][number]["fields"][number]
    ) => void
  }) => {
    const field = fields.find(
      (candidate) => candidate.tableColumnName === "status"
    )
    return (
      <>
        <button type="button" onClick={onNewField}>
          New field
        </button>
        <button type="button" onClick={onRenameTable}>
          Rename table
        </button>
        <button type="button" onClick={onDeleteTable}>
          Delete table
        </button>
        <button
          type="button"
          onClick={() => {
            if (field) onRenameField(field)
          }}
        >
          Rename field
        </button>
        <button
          type="button"
          onClick={() => {
            if (field) onDeleteField(field)
          }}
        >
          Delete field
        </button>
        <button
          type="button"
          onClick={() => {
            if (field) onEditFieldOptions(field)
          }}
        >
          Edit options
        </button>
      </>
    )
  },
}))

vi.mock("./base-field-options-dialog", () => ({
  BaseFieldOptionsDialog: ({
    open,
    onOpenChange,
    onSave,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSave: (property: Record<string, unknown>) => void
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => {
          onSave({
            options: [{ id: "done", name: "Done", color: "default" }],
          })
          onOpenChange(false)
        }}
      >
        Confirm options
      </button>
    ) : null,
}))

vi.mock("./base-rename-dialog", () => ({
  BaseRenameDialog: ({
    name,
    open,
    onRename,
    onOpenChange,
  }: {
    name: string
    open: boolean
    onRename: (name: string) => void
    onOpenChange: (open: boolean) => void
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => {
          onRename(name + " renamed")
          onOpenChange(false)
        }}
      >
        Confirm rename
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
    updateTableMock.mockReset()
    deleteTableMock.mockReset()
    addFieldMock.mockReset()
    updateFieldMock.mockReset()
    deleteFieldMock.mockReset()
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
    updateTableMock.mockResolvedValue(snapshot)
    deleteTableMock.mockResolvedValue(snapshot)
    addFieldMock.mockResolvedValue(snapshot)
    updateFieldMock.mockResolvedValue(snapshot)
    deleteFieldMock.mockResolvedValue(snapshot)
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

  it("renames and deletes tables and fields through the structure menu", async () => {
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Rename table")
        ?.click()
    })
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Confirm rename")
        ?.click()
      await Promise.resolve()
    })
    expect(updateTableMock).toHaveBeenCalledWith(
      "projects/tasks.base",
      "tasks",
      { name: "Tasks renamed" }
    )

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Rename field")
        ?.click()
    })
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Confirm rename")
        ?.click()
      await Promise.resolve()
    })
    expect(updateFieldMock).toHaveBeenCalledWith(
      "projects/tasks.base",
      "tasks",
      "status",
      { name: "Status renamed" }
    )

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Edit options")
        ?.click()
    })
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Confirm options")
        ?.click()
      await Promise.resolve()
    })
    expect(updateFieldMock).toHaveBeenLastCalledWith(
      "projects/tasks.base",
      "tasks",
      "status",
      {
        property: {
          options: [{ id: "done", name: "Done", color: "default" }],
        },
      }
    )

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Delete field")
        ?.click()
    })
    expect(document.body.textContent).toContain("Delete field “Status”?")
    await act(async () => {
      Array.from(document.body.querySelectorAll("button"))
        .filter((button) => button.textContent === "Delete field")
        .at(-1)
        ?.click()
      await Promise.resolve()
    })
    expect(deleteFieldMock).toHaveBeenCalledWith(
      "projects/tasks.base",
      "tasks",
      "status"
    )

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Delete table")
        ?.click()
    })
    expect(document.body.textContent).toContain("Delete table “Tasks”?")
    await act(async () => {
      Array.from(document.body.querySelectorAll("button"))
        .filter((button) => button.textContent === "Delete table")
        .at(-1)
        ?.click()
      await Promise.resolve()
    })
    expect(deleteTableMock).toHaveBeenCalledWith("projects/tasks.base", "tasks")
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
