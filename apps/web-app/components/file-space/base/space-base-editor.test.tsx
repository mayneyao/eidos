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
const previewFormulaMock = vi.hoisted(() => vi.fn())
const updateFieldMock = vi.hoisted(() => vi.fn())
const deleteFieldMock = vi.hoisted(() => vi.fn())
const createViewMock = vi.hoisted(() => vi.fn())
const updateViewMock = vi.hoisted(() => vi.fn())
const duplicateViewMock = vi.hoisted(() => vi.fn())
const deleteViewMock = vi.hoisted(() => vi.fn())
const reorderViewsMock = vi.hoisted(() => vi.fn())
const listFilesMock = vi.hoisted(() => vi.fn())
const createDirectoryMock = vi.hoisted(() => vi.fn())
const createBinaryMock = vi.hoisted(() => vi.fn())
const importFilesMock = vi.hoisted(() => vi.fn())
const revealFileMock = vi.hoisted(() => vi.fn())
const openTabMock = vi.hoisted(() => vi.fn())
const insertRowMock = vi.hoisted(() => vi.fn())
const updateRowMock = vi.hoisted(() => vi.fn())
const deleteRowsMock = vi.hoisted(() => vi.fn())
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
    previewFormula: previewFormulaMock,
    updateField: updateFieldMock,
    deleteField: deleteFieldMock,
    createView: createViewMock,
    updateView: updateViewMock,
    duplicateView: duplicateViewMock,
    deleteView: deleteViewMock,
    reorderViews: reorderViewsMock,
    insertRow: insertRowMock,
    updateRow: updateRowMock,
    deleteRows: deleteRowsMock,
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
    onEditField,
    onDeleteField,
  }: {
    fields: (typeof snapshot)["tables"][number]["fields"]
    onNewField: () => void
    onRenameTable: () => void
    onDeleteTable: () => void
    onEditField: (
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
            if (field) onDeleteField(field)
          }}
        >
          Delete field
        </button>
        <button
          type="button"
          onClick={() => {
            if (field) onEditField(field)
          }}
        >
          Edit property
        </button>
      </>
    )
  },
}))

vi.mock("./base-formula-editor", () => ({
  BaseFormulaEditor: ({
    open,
    onPreview,
    onSave,
  }: {
    open: boolean
    onPreview: (input: {
      name: string
      columnName: string
      formula: string
      displayType: "number"
    }) => void
    onSave: (property: Record<string, unknown>) => void
  }) =>
    open ? (
      <>
        <button
          type="button"
          onClick={() =>
            onPreview({
              name: "Total",
              columnName: "total",
              formula: "price * quantity",
              displayType: "number",
            })
          }
        >
          Preview formula
        </button>
        <button
          type="button"
          onClick={() =>
            onSave({ formula: "price * quantity", displayType: "number" })
          }
        >
          Confirm formula
        </button>
      </>
    ) : null,
}))

vi.mock("./base-lookup-editor", () => ({
  BaseLookupEditor: ({
    open,
    onSave,
  }: {
    open: boolean
    onSave: (property: Record<string, unknown>) => void
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onSave({
            relationField: "owners",
            targetField: "title",
            aggregate: "count",
            displayType: "number",
          })
        }
      >
        Confirm lookup
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
  useSpaceFiles: () => ({
    reveal: revealFileMock,
    list: listFilesMock,
    createDirectory: createDirectoryMock,
    createBinary: createBinaryMock,
    importFiles: importFilesMock,
  }),
}))

vi.mock("@/apps/web-app/store/tabs", () => ({
  useTabStore: {
    getState: () => ({ openTab: openTabMock }),
  },
}))

vi.mock("./base-grid", () => ({
  BaseGrid: ({
    table,
    onCellEdit,
    onSelectedRowsChange,
    onImportFiles,
    onImportDroppedFiles,
    onOpenFile,
    onRevealFile,
    onSearchRelation,
    propertyField,
    onFieldUpdate,
    onAddField,
    onEditFormula,
    onEditLookup,
    searchResultIndex,
    onRowCountChange,
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
    onImportFiles?: () => Promise<string[]>
    onImportDroppedFiles?: (files: File[]) => Promise<string[]>
    onOpenFile?: (path: string) => void
    onRevealFile?: (path: string) => Promise<void> | void
    onSearchRelation?: (
      field: (typeof snapshot)["tables"][number]["fields"][number],
      query: string
    ) => Promise<Array<{ id: string; title: string }>>
    propertyField?: (typeof snapshot)["tables"][number]["fields"][number] | null
    onFieldUpdate?: (
      field: (typeof snapshot)["tables"][number]["fields"][number],
      changes: Record<string, unknown>
    ) => Promise<void> | void
    onAddField?: (position?: number) => void
    onEditFormula?: (
      field: (typeof snapshot)["tables"][number]["fields"][number]
    ) => void
    onEditLookup?: (
      field: (typeof snapshot)["tables"][number]["fields"][number]
    ) => void
    searchResultIndex?: number | null
    onRowCountChange?: (rowCount: number | null) => void
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
        <span data-testid="base-search-result-index">
          Search result {searchResultIndex ?? "none"}
        </span>
        <button type="button" onClick={() => onRowCountChange?.(3)}>
          Report search results
        </button>
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
        <button type="button" onClick={() => onAddField?.(1)}>
          Insert field at 1
        </button>
        {propertyField ? (
          <>
            <span>Properties for {propertyField.name}</span>
            <button
              type="button"
              onClick={() =>
                void onFieldUpdate?.(propertyField, {
                  property: {
                    options: [{ id: "done", name: "Done", color: "default" }],
                  },
                })
              }
            >
              Save property
            </button>
            <button
              type="button"
              onClick={() =>
                void onFieldUpdate?.(propertyField, { type: "text" })
              }
            >
              Convert field
            </button>
          </>
        ) : null}
        <button type="button" onClick={() => void onImportFiles?.()}>
          Import attachments
        </button>
        <button
          type="button"
          onClick={() =>
            void onImportDroppedFiles?.([
              {
                name: "cover.png",
                type: "image/png",
                arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
              } as File,
            ])
          }
        >
          Drop attachment
        </button>
        <button type="button" onClick={() => onOpenFile?.("assets/report.pdf")}>
          Open attachment
        </button>
        <button
          type="button"
          onClick={() => void onRevealFile?.("assets/report.pdf")}
        >
          Reveal attachment
        </button>
        <button
          type="button"
          onClick={() =>
            void onSearchRelation?.(
              {
                ...title!,
                name: "Owners",
                type: "link",
                tableColumnName: "owners",
                storageCodec: "relation",
                valueKind: "relation",
                property: {
                  targetTableId: "people",
                  targetField: "title",
                  multiple: true,
                },
              },
              "Ada"
            )
          }
        >
          Search relation
        </button>
        <button
          type="button"
          onClick={() =>
            onEditFormula?.({
              ...title!,
              name: "Total",
              type: "formula",
              tableColumnName: "total",
              valueKind: "derived",
              isDerived: true,
              property: { formula: "price", displayType: "number" },
            })
          }
        >
          Edit formula
        </button>
        <button
          type="button"
          onClick={() =>
            onEditLookup?.({
              ...title!,
              name: "Owner count",
              type: "lookup",
              tableColumnName: "owner_count",
              valueKind: "derived",
              isDerived: true,
              property: {
                relationField: "owners",
                targetField: "title",
                aggregate: "count",
                displayType: "number",
              },
            })
          }
        >
          Edit lookup
        </button>
      </div>
    )
  },
}))

vi.mock("./base-view-selector", () => ({
  isBaseBuiltInViewType: (type: string) =>
    type === "grid" || type === "gallery" || type === "kanban",
  BaseViewTypeIcon: ({ type }: { type: string }) => <span>{type}</span>,
  BaseViewSelector: ({
    activeView,
    onCreate,
    onRename,
    onDuplicate,
    onDelete,
    onReorder,
  }: {
    activeView?: (typeof snapshot)["tables"][number]["views"][number]
    onCreate: (name: string, type: "grid" | "gallery" | "kanban") => void
    onRename: (viewId: string, name: string) => void
    onDuplicate: (viewId: string) => void
    onDelete: (viewId: string) => void
    onReorder: (viewIds: string[]) => void
  }) => (
    <div data-testid="base-view-selector">
      <span>{activeView?.name ?? "Views"}</span>
      <button type="button" onClick={() => onCreate("By priority", "grid")}>
        Create view
      </button>
      <button type="button" onClick={() => onCreate("Cards", "gallery")}>
        Create gallery view
      </button>
      <button type="button" onClick={() => onCreate("Board", "kanban")}>
        Create kanban view
      </button>
      <button
        type="button"
        onClick={() => activeView && onRename(activeView.id, "Renamed view")}
      >
        Rename view
      </button>
      <button
        type="button"
        onClick={() => activeView && onDuplicate(activeView.id)}
      >
        Duplicate view
      </button>
      <button
        type="button"
        onClick={() => activeView && onDelete(activeView.id)}
      >
        Delete view
      </button>
      <button type="button" onClick={() => onReorder(["view_tasks"])}>
        Reorder views
      </button>
    </div>
  ),
}))

vi.mock("./base-gallery-view", () => ({
  BaseGalleryView: ({
    onDeleteRow,
  }: {
    onDeleteRow?: (row: { _id: string; title: string }) => Promise<void>
  }) => (
    <div data-testid="base-gallery-view">
      Gallery
      <button
        type="button"
        onClick={() => void onDeleteRow?.({ _id: "row_1", title: "Write RFC" })}
      >
        Delete gallery row
      </button>
    </div>
  ),
}))

vi.mock("./base-kanban-view", () => ({
  BaseKanbanView: () => <div data-testid="base-kanban-view">Kanban</div>,
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
          sorts: [],
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
    previewFormulaMock.mockReset()
    updateFieldMock.mockReset()
    deleteFieldMock.mockReset()
    createViewMock.mockReset()
    updateViewMock.mockReset()
    duplicateViewMock.mockReset()
    deleteViewMock.mockReset()
    reorderViewsMock.mockReset()
    listFilesMock.mockReset()
    createDirectoryMock.mockReset()
    createBinaryMock.mockReset()
    importFilesMock.mockReset()
    revealFileMock.mockReset()
    openTabMock.mockReset()
    insertRowMock.mockReset()
    updateRowMock.mockReset()
    deleteRowsMock.mockReset()
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
    previewFormulaMock.mockResolvedValue({
      expression: "price * quantity",
      dependencies: [],
      samples: [],
    })
    updateFieldMock.mockResolvedValue(snapshot)
    deleteFieldMock.mockResolvedValue(snapshot)
    createViewMock.mockResolvedValue(snapshot)
    updateViewMock.mockResolvedValue(snapshot)
    duplicateViewMock.mockResolvedValue(snapshot)
    deleteViewMock.mockResolvedValue(snapshot)
    reorderViewsMock.mockResolvedValue(snapshot)
    listFilesMock.mockResolvedValue([])
    createDirectoryMock.mockResolvedValue({})
    createBinaryMock.mockResolvedValue({})
    importFilesMock.mockResolvedValue({
      canceled: true,
      imported: [],
      errors: [],
    })
    revealFileMock.mockResolvedValue({ success: true })
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
    deleteRowsMock.mockResolvedValue({
      tableId: "tasks",
      deletedCount: 1,
      rowCount: 0,
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
    expect(
      container.querySelector('[role="tablist"][aria-label="Base views"]')
        ?.textContent
    ).toContain("Grid")
    expect(
      container.querySelector('[role="tablist"][aria-label="Base views"]')
        ?.textContent
    ).not.toContain("Tasks")
    expect(
      container.querySelector('[role="tablist"][aria-label="Base tables"]')
        ?.textContent
    ).toContain("Tasks")
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

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Insert field at 1")
        ?.click()
    })
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Confirm field")
        ?.click()
      await Promise.resolve()
    })
    expect(addFieldMock).toHaveBeenLastCalledWith(
      "projects/tasks.base",
      "tasks",
      { name: "Owner", columnName: "owner", type: "text" },
      { viewId: "view_tasks", index: 1 }
    )
  })

  it("routes view lifecycle actions through the Base file API", async () => {
    await renderEditor()

    for (const label of [
      "Create view",
      "Rename view",
      "Duplicate view",
      "Delete view",
      "Reorder views",
    ]) {
      await act(async () => {
        Array.from(container.querySelectorAll("button"))
          .find((button) => button.textContent === label)
          ?.click()
        await Promise.resolve()
      })
    }

    expect(createViewMock).toHaveBeenCalledWith(
      "projects/tasks.base",
      "tasks",
      { name: "By priority", type: "grid" }
    )

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Create gallery view")
        ?.click()
      await Promise.resolve()
    })
    expect(createViewMock).toHaveBeenLastCalledWith(
      "projects/tasks.base",
      "tasks",
      {
        name: "Cards",
        type: "gallery",
        properties: { cardSize: "medium", hideEmptyFields: true },
      }
    )

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Create kanban view")
        ?.click()
      await Promise.resolve()
    })
    expect(createViewMock).toHaveBeenLastCalledWith(
      "projects/tasks.base",
      "tasks",
      {
        name: "Board",
        type: "kanban",
        properties: { cardSize: "medium", groupByField: "status" },
      }
    )
    expect(updateViewMock).toHaveBeenCalledWith(
      "projects/tasks.base",
      "view_tasks",
      { name: "Renamed view" }
    )
    expect(duplicateViewMock).toHaveBeenCalledWith(
      "projects/tasks.base",
      "view_tasks"
    )
    expect(deleteViewMock).toHaveBeenCalledWith(
      "projects/tasks.base",
      "view_tasks"
    )
    expect(reorderViewsMock).toHaveBeenCalledWith(
      "projects/tasks.base",
      "tasks",
      ["view_tasks"]
    )
  })

  it("imports, opens, and reveals Base attachments as Space files", async () => {
    importFilesMock.mockResolvedValue({
      canceled: false,
      imported: [
        {
          name: "report.pdf",
          path: "assets/report.pdf",
          parentPath: "assets",
          kind: "file",
          size: 10,
          mtimeMs: 1,
        },
      ],
      errors: [],
    })
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Import attachments")
        ?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(listFilesMock).toHaveBeenCalledWith("assets")
    expect(importFilesMock).toHaveBeenCalledWith("assets")

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Drop attachment")
        ?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(createBinaryMock).toHaveBeenCalledWith(
      "assets/cover.png",
      expect.any(Uint8Array)
    )

    act(() => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Open attachment")
        ?.click()
    })
    expect(openTabMock).toHaveBeenCalledWith(
      "/space-file#assets%2Freport.pdf",
      "report.pdf"
    )

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Reveal attachment")
        ?.click()
      await Promise.resolve()
    })
    expect(revealFileMock).toHaveBeenCalledWith("assets/report.pdf")
  })

  it("searches relation candidates through the target Base table", async () => {
    getTablePageMock.mockResolvedValueOnce({
      tableId: "people",
      offset: 0,
      limit: 50,
      total: 1,
      rows: [{ _id: "row_ada", title: "Ada Lovelace" }],
    })
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Search relation")
        ?.click()
      await Promise.resolve()
    })
    expect(getTablePageMock).toHaveBeenCalledWith(
      "projects/tasks.base",
      "people",
      0,
      50,
      { search: "Ada" }
    )
  })

  it("coordinates row search navigation with the active Base layout", async () => {
    await renderEditor()

    act(() => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.trim() === "Search")
        ?.click()
    })
    const input = container.querySelector<HTMLInputElement>(
      'input[placeholder="Search rows"]'
    )
    act(() => {
      if (!input) return
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set
      setter?.call(input, "RFC")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    act(() => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Report search results")
        ?.click()
    })

    expect(container.textContent).toContain("1 of 3")
    expect(
      container.querySelector('[data-testid="base-search-result-index"]')
        ?.textContent
    ).toContain("Search result 0")

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Next search result"]')
        ?.click()
    })
    expect(
      container.querySelector('[data-testid="base-search-result-index"]')
        ?.textContent
    ).toContain("Search result 1")
  })

  it("updates formula metadata and reloads calculated rows", async () => {
    await renderEditor()
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Edit formula")
        ?.click()
    })
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Preview formula")
        ?.click()
      await Promise.resolve()
    })
    expect(previewFormulaMock).toHaveBeenCalledWith(
      "projects/tasks.base",
      "tasks",
      {
        name: "Total",
        columnName: "total",
        formula: "price * quantity",
        displayType: "number",
      }
    )
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Confirm formula")
        ?.click()
      await Promise.resolve()
    })
    expect(updateFieldMock).toHaveBeenCalledWith(
      "projects/tasks.base",
      "tasks",
      "total",
      {
        property: { formula: "price * quantity", displayType: "number" },
      }
    )
  })

  it("updates lookup metadata and reloads derived rows", async () => {
    await renderEditor()
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Edit lookup")
        ?.click()
    })
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Confirm lookup")
        ?.click()
      await Promise.resolve()
    })
    expect(updateFieldMock).toHaveBeenCalledWith(
      "projects/tasks.base",
      "tasks",
      "owner_count",
      {
        property: {
          relationField: "owners",
          targetField: "title",
          aggregate: "count",
          displayType: "number",
        },
      }
    )
  })

  it("renames tables and edits or deletes fields through the structure menu", async () => {
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
        .find((button) => button.textContent === "Edit property")
        ?.click()
    })
    expect(container.textContent).toContain("Properties for Status")
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Save property")
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
        .find((button) => button.textContent === "Convert field")
        ?.click()
      await Promise.resolve()
    })
    expect(updateFieldMock).toHaveBeenLastCalledWith(
      "projects/tasks.base",
      "tasks",
      "status",
      { type: "text" }
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
      [{ startIndex: 0, endIndex: 1 }],
      { filter: null, sorts: [] }
    )
  })

  it("deletes a card record by stable row id", async () => {
    getSnapshotMock.mockResolvedValueOnce({
      ...snapshot,
      tables: snapshot.tables.map((candidate) => ({
        ...candidate,
        views: candidate.views.map((view) => ({
          ...view,
          name: "Cards",
          type: "gallery",
        })),
      })),
    })
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Delete gallery row")
        ?.click()
      await Promise.resolve()
    })

    expect(deleteRowsMock).toHaveBeenCalledWith(
      "projects/tasks.base",
      "tasks",
      ["row_1"]
    )
  })
})
