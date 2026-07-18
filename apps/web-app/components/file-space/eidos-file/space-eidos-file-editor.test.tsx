import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowMutationResult,
  EidosFileRowPage,
  EidosFileSnapshot,
  EidosFileSqlPrimitive,
} from "@eidos.space/eidos-file"

import { TabProvider } from "@/apps/web-app/components/tab-manager/tab-context"
import { useFileSpaceSettings } from "@/apps/web-app/store/file-space-settings"
import { useQuickOpenStore } from "@/apps/web-app/store/quick-open-store"
import { SETTINGS_OPEN_EVENT } from "@/components/settings/settings-events"

import { SpaceEidosFileEditor } from "./space-eidos-file-editor"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const getSnapshotMock = vi.hoisted(() => vi.fn())
const getTablePageMock = vi.hoisted(() => vi.fn())
const getTableRowMock = vi.hoisted(() => vi.fn())
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
const updateTabTitleMock = vi.hoisted(() => vi.fn())
const insertRowMock = vi.hoisted(() => vi.fn())
const updateRowMock = vi.hoisted(() => vi.fn())
const updateRowsMock = vi.hoisted(() => vi.fn())
const deleteRowsMock = vi.hoisted(() => vi.fn())
const deleteRowRangesMock = vi.hoisted(() => vi.fn())
const exportCsvMock = vi.hoisted(() => vi.fn())
const getCsvOperationMock = vi.hoisted(() => vi.fn())
const cancelCsvOperationMock = vi.hoisted(() => vi.fn())
const spaceFileChanges = vi.hoisted(() => ({
  handler: undefined as
    | ((event: { eventType: "change" | "rescan"; path: string }) => void)
    | undefined,
}))
const extensionEidosFileViewState = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
  rendered: [] as Array<Record<string, unknown>>,
}))
const eidosFileViewHostProps = vi.hoisted(() => ({
  grid: [] as Array<{
    table: object
    view?: { id: string; type: string }
    onOpenRecordInTab?: (row: EidosFileRow) => void
    onRevealFile: unknown
    onPropertyFieldOpen: unknown
    onPropertyFieldClose: unknown
    onDeleteField: unknown
    onRequestDeleteRows: unknown
  }>,
  gallery: [] as Array<{
    table: object
    loadPage: (
      offset: number,
      limit: number,
      totalHint?: number,
      cursor?: string
    ) => Promise<EidosFileRowPage>
    loadRow?: (rowId: string) => Promise<EidosFileRow | null>
    onCellEdit?: (
      row: EidosFileRow,
      field: EidosFileFieldInfo,
      value: EidosFileSqlPrimitive
    ) => Promise<EidosFileRowMutationResult>
    onRevealFile: unknown
    onOpenRecordInTab?: (row: EidosFileRow) => void
  }>,
  kanban: [] as Array<{
    table: object
    loadGroupPage: (
      field: EidosFileFieldInfo,
      value: string | null,
      offset: number,
      limit: number,
      totalHint: number,
      cursor?: string
    ) => Promise<EidosFileRowPage>
    loadRow?: (rowId: string) => Promise<EidosFileRow | null>
    onCellEdit: (
      row: EidosFileRow,
      field: EidosFileFieldInfo,
      value: EidosFileSqlPrimitive
    ) => Promise<EidosFileRowMutationResult>
    onRevealFile: unknown
    onOpenRecordInTab?: (row: EidosFileRow) => void
  }>,
}))

vi.mock("@/apps/web-app/hooks/use-current-space", () => ({
  useCurrentSpace: () => ({ currentSpace: { id: "space-a", mode: "file" } }),
}))

vi.mock("@/apps/web-app/hooks/use-file-extension-eidos-file-views", () => ({
  useFileExtensionEidosFileViews: () => ({
    eidosFileViews: extensionEidosFileViewState.items,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}))

vi.mock("../../file-extensions/extension-eidos-file-view-surface", () => ({
  ExtensionEidosFileViewSurface: (props: Record<string, unknown>) => {
    extensionEidosFileViewState.rendered.push(props)
    return <div>Extension Eidos File view</div>
  },
}))

vi.mock("@/apps/web-app/hooks/use-space-eidos-file", () => ({
  useSpaceEidosFile: () => ({
    getSnapshot: getSnapshotMock,
    getTablePage: getTablePageMock,
    getTableRow: getTableRowMock,
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
    updateRows: updateRowsMock,
    deleteRows: deleteRowsMock,
    deleteRowRanges: deleteRowRangesMock,
    exportCsv: exportCsvMock,
    getCsvOperation: getCsvOperationMock,
    cancelCsvOperation: cancelCsvOperationMock,
  }),
}))

vi.mock("./eidos-file-sheet-create-popover", () => ({
  EidosFileSheetCreatePopover: ({
    disabled,
    csvImportProps,
    onCreate,
  }: {
    disabled?: boolean
    csvImportProps: { onSelect: () => Promise<unknown> }
    onCreate: (value: { name: string }) => Promise<void> | void
  }) => {
    const [open, setOpen] = React.useState(false)
    return (
      <div>
        <button
          type="button"
          aria-label="Add Eidos File table"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          Add table
        </button>
        {open ? (
          <>
            <button
              type="button"
              onClick={() => void onCreate({ name: "Projects" })}
            >
              Confirm table
            </button>
            <button
              type="button"
              aria-label="Import CSV as new Eidos File table"
              onClick={() => void csvImportProps.onSelect()}
            >
              Import CSV
            </button>
          </>
        ) : null}
      </div>
    )
  },
}))

vi.mock("@eidos.space/eidos-file-ui/eidos-file-field-create-popover", () => ({
  EidosFileFieldCreatePopover: ({
    open,
    onCreate,
  }: {
    open: boolean
    onCreate: (value: {
      name: string
      columnName: string
      type: "text"
    }) => void
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onCreate({
            name: "Owner",
            columnName: "owner",
            type: "text",
          })
        }
      >
        Confirm field
      </button>
    ) : null,
}))

vi.mock("./eidos-file-structure-menu", () => ({
  EidosFileStructureMenu: ({
    fields,
    onNewField,
    onRenameTable,
    onDeleteTable,
    onRevealEidosFile,
    onEditField,
    onDeleteField,
  }: {
    fields: (typeof snapshot)["tables"][number]["fields"]
    onNewField: () => void
    onRenameTable: () => void
    onDeleteTable: () => void
    onRevealEidosFile: () => void
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
        <button type="button" onClick={onRevealEidosFile}>
          Show Eidos File in file manager
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

vi.mock("./eidos-file-view-menu", () => ({
  EidosFileViewMenu: ({
    onVisibilityChange,
  }: {
    onVisibilityChange: (visibility: {
      hiddenFields: string[]
      visibleSystemFields: string[]
    }) => void
  }) => (
    <button
      type="button"
      onClick={() =>
        onVisibilityChange({
          hiddenFields: [],
          visibleSystemFields: ["_created_time"],
        })
      }
    >
      Show created time
    </button>
  ),
}))

vi.mock("@eidos.space/eidos-file-ui/eidos-file-derived-field-editor", () => ({
  EidosFileFormulaEditorPopover: ({
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
    onSave: (property: Record<string, unknown>) => Promise<void> | void
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
            void Promise.resolve(
              onSave({
                formula: "price * quantity",
                displayType: "number",
              })
            ).catch(() => undefined)
          }
        >
          Confirm formula
        </button>
      </>
    ) : null,
  EidosFileLookupEditorPopover: ({
    open,
    onSave,
  }: {
    open: boolean
    onSave: (property: Record<string, unknown>) => Promise<void> | void
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          void Promise.resolve(
            onSave({
              relationField: "owners",
              targetField: "title",
              aggregate: "count",
              displayType: "number",
            })
          ).catch(() => undefined)
        }
      >
        Confirm lookup
      </button>
    ) : null,
}))

vi.mock("./eidos-file-rename-dialog", () => ({
  EidosFileRenameDialog: ({
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
  useSpaceFileChanges: (
    _spaceId: string | undefined,
    onChange: (event: { eventType: "change" | "rescan"; path: string }) => void
  ) => {
    spaceFileChanges.handler = onChange
  },
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
    getState: () => ({
      openTab: openTabMock,
      updateTab: updateTabTitleMock,
    }),
  },
}))

vi.mock("./eidos-file-grid", async () => {
  const { memo } = await vi.importActual<typeof React>("react")
  return {
    EidosFileGrid: memo(function EidosFileGrid({
      table,
      view,
      onCellEdit,
      onInspectorCellEdit,
      onRowsEdit,
      onSelectedRowsChange,
      onImportFiles,
      onImportDroppedFiles,
      onOpenFile,
      onRevealFile,
      onOpenRecordInTab,
      onSearchRelation,
      propertyField,
      onPropertyFieldOpen,
      onPropertyFieldClose,
      onFieldUpdate,
      onDeleteField,
      onRequestDeleteRows,
      onAddField,
      onEditFormula,
      onEditLookup,
      searchResultIndex,
      onRowCountChange,
      disabled,
      reloadToken,
    }: {
      table: (typeof snapshot)["tables"][number]
      view?: { id: string; type: string }
      onCellEdit: (
        row: { _id: string; title: string; status: string },
        field: (typeof snapshot)["tables"][number]["fields"][number],
        value: string
      ) => Promise<unknown>
      onInspectorCellEdit?: (
        row: { _id: string; title: string; status: string },
        field: (typeof snapshot)["tables"][number]["fields"][number],
        value: string
      ) => Promise<unknown>
      onRowsEdit?: (
        edits: Array<{
          row: { _id: string; title: string; status: string }
          changes: Record<string, string>
        }>
      ) => void
      onSelectedRowsChange: (
        ranges: Array<{ startIndex: number; endIndex: number }>
      ) => void
      onImportFiles?: () => Promise<string[]>
      onImportDroppedFiles?: (files: File[]) => Promise<string[]>
      onOpenFile?: (path: string) => void
      onRevealFile?: (path: string) => Promise<void> | void
      onOpenRecordInTab?: (row: EidosFileRow) => void
      onSearchRelation?: (
        field: (typeof snapshot)["tables"][number]["fields"][number],
        query: string
      ) => Promise<Array<{ id: string; title: string }>>
      propertyField?:
        | (typeof snapshot)["tables"][number]["fields"][number]
        | null
      onPropertyFieldOpen?: (
        field: (typeof snapshot)["tables"][number]["fields"][number]
      ) => void
      onPropertyFieldClose?: () => void
      onFieldUpdate?: (
        field: (typeof snapshot)["tables"][number]["fields"][number],
        changes: Record<string, unknown>
      ) => Promise<void> | void
      onDeleteField?: (
        field: (typeof snapshot)["tables"][number]["fields"][number]
      ) => void
      onRequestDeleteRows?: (
        ranges: Array<{ startIndex: number; endIndex: number }>
      ) => void
      onAddField?: (position?: number) => void
      onEditFormula?: (
        field: (typeof snapshot)["tables"][number]["fields"][number]
      ) => void
      onEditLookup?: (
        field: (typeof snapshot)["tables"][number]["fields"][number]
      ) => void
      searchResultIndex?: number | null
      onRowCountChange?: (rowCount: number | null) => void
      disabled?: boolean
      reloadToken?: number
    }) {
      eidosFileViewHostProps.grid.push({
        table,
        view,
        onOpenRecordInTab,
        onRevealFile,
        onPropertyFieldOpen,
        onPropertyFieldClose,
        onDeleteField,
        onRequestDeleteRows,
      })
      const row = { _id: "row_1", title: "Write RFC", status: "todo" }
      const title = table.fields.find(
        (field) => field.tableColumnName === "title"
      )
      return (
        <div
          data-testid="eidos-file-grid"
          data-disabled={String(Boolean(disabled))}
          data-reload-token={String(reloadToken ?? 0)}
        >
          {table.fields
            .filter((field) => !field.isHidden)
            .map((field) => (
              <span key={field.tableColumnName}>{field.name}</span>
            ))}
          <span>{String(row?.title ?? "")}</span>
          <span>{String(row?.status ?? "")}</span>
          <span data-testid="eidos-file-search-result-index">
            Search result {searchResultIndex ?? "none"}
          </span>
          <button type="button" onClick={() => onRowCountChange?.(3)}>
            Report search results
          </button>
          <button
            type="button"
            onClick={() => {
              if (row && title) {
                void onCellEdit(row, title, "Write implementation").catch(
                  () => undefined
                )
              }
            }}
          >
            Edit title
          </button>
          <button
            type="button"
            onClick={() => {
              if (row && title) {
                void onInspectorCellEdit?.(
                  row,
                  title,
                  "Write inspected implementation"
                ).catch(() => undefined)
              }
            }}
          >
            Edit inspected title
          </button>
          <button
            type="button"
            onClick={() =>
              onRowsEdit?.([
                {
                  row,
                  changes: { title: "Write implementation", status: "done" },
                },
              ])
            }
          >
            Paste row
          </button>
          <button
            type="button"
            onClick={() =>
              onSelectedRowsChange([{ startIndex: 0, endIndex: 1 }])
            }
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
                      options: [{ value: "done", color: "default" }],
                    },
                  })?.catch(() => undefined)
                }
              >
                Save property
              </button>
              <button
                type="button"
                onClick={() =>
                  void onFieldUpdate?.(propertyField, {
                    type: "text",
                  })?.catch(() => undefined)
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
          <button
            type="button"
            onClick={() => onOpenFile?.("assets/report.pdf")}
          >
            Open attachment
          </button>
          <button type="button" onClick={() => onOpenRecordInTab?.(row)}>
            Open record in tab
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
    }),
  }
})

vi.mock("./eidos-file-view-selector", () => ({
  eidosFileExtensionContributionId: (type: string) =>
    type.startsWith("extension:") ? type.slice("extension:".length) : null,
  isEidosFileBuiltInViewType: (type: string) =>
    type === "grid" || type === "gallery" || type === "kanban",
  EidosFileViewTypeIcon: ({ type }: { type: string }) => <span>{type}</span>,
}))

vi.mock("./eidos-file-view-tabs", () => ({
  EidosFileViewTabs: ({
    activeView,
    onCreate,
    onRename,
    onDuplicate,
    onDelete,
    onReorder,
    onUpdate,
  }: {
    activeView?: (typeof snapshot)["tables"][number]["views"][number]
    onCreate: (name: string, type: "grid" | "gallery" | "kanban") => void
    onRename: (viewId: string, name: string) => void
    onDuplicate: (viewId: string) => void
    onDelete: (viewId: string) => void
    onReorder: (viewIds: string[]) => void
    onUpdate: (viewId: string, changes: { name: string }) => Promise<void>
  }) => (
    <div data-testid="eidos-file-view-tabs">
      <div role="tablist" aria-label="Eidos File views">
        <button type="button" role="tab" aria-selected="true">
          {activeView?.name ?? "Views"}
        </button>
      </div>
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
      <button
        type="button"
        onClick={() => {
          if (activeView) {
            void onUpdate(activeView.id, { name: "Unavailable" }).catch(
              () => undefined
            )
          }
        }}
      >
        Update view
      </button>
    </div>
  ),
}))

vi.mock("./eidos-file-gallery-view", async () => {
  const { memo } = await vi.importActual<typeof React>("react")
  return {
    EidosFileGalleryView: memo(function EidosFileGalleryView({
      table,
      disabled,
      loadPage,
      loadRow,
      onCellEdit,
      onDeleteRow,
      onRevealFile,
      onOpenRecordInTab,
      reloadToken,
    }: {
      table: (typeof snapshot)["tables"][number]
      disabled?: boolean
      loadPage: (
        offset: number,
        limit: number,
        totalHint?: number,
        cursor?: string
      ) => Promise<EidosFileRowPage>
      loadRow?: (rowId: string) => Promise<EidosFileRow | null>
      onCellEdit?: (
        row: EidosFileRow,
        field: EidosFileFieldInfo,
        value: EidosFileSqlPrimitive
      ) => Promise<EidosFileRowMutationResult>
      onDeleteRow?: (row: { _id: string; title: string }) => Promise<void>
      onRevealFile?: (path: string) => Promise<void> | void
      onOpenRecordInTab?: (row: EidosFileRow) => void
      reloadToken?: number
    }) {
      eidosFileViewHostProps.gallery.push({
        table,
        loadPage,
        loadRow,
        onCellEdit,
        onRevealFile,
        onOpenRecordInTab,
      })
      const title = table.fields.find(
        (field) => field.tableColumnName === "title"
      )
      return (
        <div
          data-testid="eidos-file-gallery-view"
          data-disabled={String(Boolean(disabled))}
          data-reload-token={String(reloadToken ?? 0)}
        >
          Gallery
          <button
            type="button"
            onClick={() =>
              void onDeleteRow?.({ _id: "row_1", title: "Write RFC" })
            }
          >
            Delete gallery row
          </button>
          <button
            type="button"
            onClick={() => {
              if (title) {
                void onCellEdit?.(
                  { _id: "row_1", title: "Write RFC", status: "todo" },
                  title,
                  "Write Gallery implementation"
                )
              }
            }}
          >
            Edit Gallery title
          </button>
        </div>
      )
    }),
  }
})

vi.mock("./eidos-file-kanban-view", async () => {
  const { memo } = await vi.importActual<typeof React>("react")
  return {
    EidosFileKanbanView: memo(function EidosFileKanbanView({
      table,
      disabled,
      loadGroupPage,
      loadRow,
      onAddRow,
      onCellEdit,
      onRevealFile,
      onOpenRecordInTab,
      reloadToken,
    }: {
      table: (typeof snapshot)["tables"][number]
      disabled?: boolean
      loadGroupPage: (
        field: EidosFileFieldInfo,
        value: string | null,
        offset: number,
        limit: number,
        totalHint: number,
        cursor?: string
      ) => Promise<EidosFileRowPage>
      loadRow?: (rowId: string) => Promise<EidosFileRow | null>
      onAddRow: (
        field: (typeof snapshot)["tables"][number]["fields"][number],
        value: string,
        title: string
      ) => Promise<unknown>
      onCellEdit: (
        row: EidosFileRow,
        field: EidosFileFieldInfo,
        value: EidosFileSqlPrimitive
      ) => Promise<EidosFileRowMutationResult>
      onRevealFile?: (path: string) => Promise<void> | void
      onOpenRecordInTab?: (row: EidosFileRow) => void
      reloadToken?: number
    }) {
      eidosFileViewHostProps.kanban.push({
        table,
        loadGroupPage,
        loadRow,
        onCellEdit,
        onRevealFile,
        onOpenRecordInTab,
      })
      const title = table.fields.find(
        (field) => field.tableColumnName === "title"
      )
      const status = table.fields.find(
        (field) => field.tableColumnName === "status"
      )
      return (
        <div
          data-testid="eidos-file-kanban-view"
          data-disabled={String(Boolean(disabled))}
          data-reload-token={String(reloadToken ?? 0)}
        >
          Kanban
          <button
            type="button"
            onClick={() => {
              if (status) void onAddRow(status, "todo", "Draft release")
            }}
          >
            Add Kanban row
          </button>
          <button
            type="button"
            onClick={() => {
              if (title) {
                void onCellEdit(
                  { _id: "row_1", title: "Write RFC", status: "todo" },
                  title,
                  "Write Kanban implementation"
                )
              }
            }}
          >
            Edit Kanban title
          </button>
        </div>
      )
    }),
  }
})

const snapshot: EidosFileSnapshot = {
  path: "projects/tasks.eidos",
  metadata: {
    format: "eidos-file",
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
            options: [{ value: "todo" }, { value: "done" }],
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

describe("SpaceEidosFileEditor", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    getSnapshotMock.mockReset()
    getTablePageMock.mockReset()
    getTableRowMock.mockReset()
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
    updateTabTitleMock.mockReset()
    insertRowMock.mockReset()
    updateRowMock.mockReset()
    updateRowsMock.mockReset()
    deleteRowsMock.mockReset()
    deleteRowRangesMock.mockReset()
    exportCsvMock.mockReset()
    getCsvOperationMock.mockReset()
    cancelCsvOperationMock.mockReset()
    eidosFileViewHostProps.grid.length = 0
    eidosFileViewHostProps.gallery.length = 0
    eidosFileViewHostProps.kanban.length = 0
    extensionEidosFileViewState.items = []
    extensionEidosFileViewState.rendered = []
    useFileSpaceSettings.setState({ bySpace: {} })
    useQuickOpenStore.setState({ sectionsByTab: {} })
    spaceFileChanges.handler = undefined
    getSnapshotMock.mockResolvedValue(snapshot)
    getTablePageMock.mockResolvedValue({
      tableId: "tasks",
      offset: 0,
      limit: 100,
      total: 1,
      rows: [{ _id: "row_1", title: "Write RFC", status: "todo" }],
    })
    getTableRowMock.mockResolvedValue({
      _id: "row_1",
      title: "Write RFC",
      status: "todo",
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
      revision: "2026-07-13T01:00:00.000Z",
    })
    updateRowMock.mockResolvedValue({
      tableId: "tasks",
      row: {
        _id: "row_1",
        title: "Write implementation",
        status: "todo",
      },
      rowCount: 1,
      revision: "2026-07-13T01:00:00.000Z",
    })
    updateRowsMock.mockResolvedValue({
      tableId: "tasks",
      rows: [
        {
          _id: "row_1",
          title: "Write implementation",
          status: "done",
        },
      ],
      rowCount: 1,
      revision: "2026-07-13T01:00:00.000Z",
    })
    deleteRowsMock.mockResolvedValue({
      tableId: "tasks",
      deletedCount: 1,
      rowCount: 0,
      revision: "2026-07-13T01:00:00.000Z",
    })
    deleteRowRangesMock.mockResolvedValue({
      tableId: "tasks",
      deletedCount: 1,
      rowCount: 0,
      revision: "2026-07-13T01:00:00.000Z",
    })
    exportCsvMock.mockResolvedValue({
      canceled: false,
      fileName: "tasks.csv",
      result: { exportedRowCount: 1 },
    })
    getCsvOperationMock.mockResolvedValue(null)
    cancelCsvOperationMock.mockResolvedValue(true)
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
      root.render(
        <TabProvider
          value={{
            tabId: "tab-base",
            containerRef: null,
            isActive: true,
            isFocused: true,
          }}
        >
          <SpaceEidosFileEditor filePath="projects/tasks.eidos" />
        </TabProvider>
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  async function renderRecordEditor() {
    await act(async () => {
      root.render(
        <TabProvider
          value={{
            tabId: "tab-record",
            containerRef: null,
            isActive: true,
            isFocused: true,
          }}
        >
          <SpaceEidosFileEditor
            filePath="projects/tasks.eidos"
            recordTarget={{ tableId: "tasks", recordId: "row_1" }}
          />
        </TabProvider>
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it("opens the default table and exposes editable source fields", async () => {
    await renderEditor()

    expect(getSnapshotMock).toHaveBeenCalledWith("projects/tasks.eidos")
    expect(
      container.querySelector('[role="tablist"][aria-label="Eidos File views"]')
        ?.textContent
    ).toContain("Grid")
    expect(
      container.querySelector('[role="tablist"][aria-label="Eidos File views"]')
        ?.textContent
    ).not.toContain("Tasks")
    expect(
      container.querySelector(
        '[role="tablist"][aria-label="Eidos File tables"]'
      )?.textContent
    ).toContain("Tasks")
    expect(
      container.querySelector("[data-eidos-file-workbar]")?.className
    ).toContain("eidos-shell-workbar")
    expect(container.textContent).toContain("Tasks")
    expect(container.textContent).toContain("Status")
    expect(container.textContent).not.toContain("_id")
    expect(container.textContent).toContain("Write RFC")
    expect(container.textContent).toContain("todo")
  })

  it("renders a saved extension Eidos File view with a host-owned page loader", async () => {
    const extensionView = {
      ...snapshot.tables[0].views[0],
      id: "view_extension",
      name: "Task cards",
      type: "extension:example.tasks.cards",
    }
    extensionEidosFileViewState.items = [
      {
        packageId: "example.tasks",
        contentDigest: `sha256:${"1".repeat(64)}`,
        permissionHash: `sha256:${"2".repeat(64)}`,
        id: "example.tasks.cards",
        displayName: "Task cards",
        extensionDisplayName: "Tasks",
      },
    ]
    getSnapshotMock.mockResolvedValue({
      ...snapshot,
      tables: [
        {
          ...snapshot.tables[0],
          views: [extensionView],
        },
      ],
    })

    await renderEditor()

    expect(container.textContent).toContain("Extension Eidos File view")
    expect(extensionEidosFileViewState.rendered.at(-1)).toMatchObject({
      extension: { id: "example.tasks.cards" },
      filePath: "projects/tasks.eidos",
      table: { table: { id: "tasks" } },
      view: { id: "view_extension" },
      loadPage: expect.any(Function),
      onFallback: expect.any(Function),
    })

    await act(async () => {
      ;(
        extensionEidosFileViewState.rendered.at(-1)?.onFallback as
          | (() => void)
          | undefined
      )?.()
    })
    expect(container.textContent).toContain(
      "Showing Grid instead of Task cards"
    )
    expect(eidosFileViewHostProps.grid.at(-1)?.view).toMatchObject({
      id: "view_extension",
      type: "grid",
    })

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Retry view")
        ?.click()
    })
    expect(container.textContent).toContain("Extension Eidos File view")
  })

  it("keeps Eidos File data usable when a saved extension view is unavailable", async () => {
    const extensionView = {
      ...snapshot.tables[0].views[0],
      id: "view_extension",
      name: "Task cards",
      type: "extension:example.tasks.cards",
    }
    getSnapshotMock.mockResolvedValue({
      ...snapshot,
      tables: [
        {
          ...snapshot.tables[0],
          views: [extensionView],
        },
      ],
    })
    const settingsOpened = vi.fn()
    window.addEventListener(SETTINGS_OPEN_EVENT, settingsOpened)

    try {
      await renderEditor()

      expect(
        container.querySelector("[data-extension-eidos-file-view-fallback]")
          ?.textContent
      ).toContain("Showing Grid instead of Task cards")
      expect(
        container.querySelector('[data-testid="eidos-file-grid"]')
      ).not.toBeNull()
      expect(eidosFileViewHostProps.grid.at(-1)?.view).toMatchObject({
        id: "view_extension",
        type: "grid",
      })
      expect(extensionEidosFileViewState.rendered).toHaveLength(0)

      await act(async () => {
        Array.from(container.querySelectorAll("button"))
          .find((button) => button.textContent === "Manage extensions")
          ?.click()
      })
      const event = settingsOpened.mock.calls[0]?.[0] as CustomEvent | undefined
      expect(event?.detail).toEqual({
        section: "space-extensions",
        showSpaceSettings: true,
      })
    } finally {
      window.removeEventListener(SETTINGS_OPEN_EVENT, settingsOpened)
    }
  })

  it("opens a selected row in a stable record tab URL", async () => {
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Open record in tab")
        ?.click()
    })

    expect(openTabMock).toHaveBeenCalledWith(
      "/space-file?table=tasks&record=row_1#projects%2Ftasks.eidos",
      "Write RFC"
    )
  })

  it("loads and edits a record directly in its non-modal tab", async () => {
    await renderRecordEditor()

    expect(getTableRowMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      "tasks",
      "row_1"
    )
    expect(
      container.querySelector("[data-eidos-file-record-page]")
    ).not.toBeNull()
    expect(
      container.querySelector('[data-testid="eidos-file-grid"]')
    ).toBeNull()
    expect(container.textContent).toContain("Write RFC")
    expect(updateTabTitleMock).toHaveBeenCalledWith("tab-record", {
      title: "Write RFC",
    })

    const title = container.querySelector<HTMLTextAreaElement>("textarea")
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set
      setter?.call(title, "Ship record tabs")
      title?.dispatchEvent(new Event("input", { bubbles: true }))
      title?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(updateRowMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      "tasks",
      "row_1",
      { title: "Ship record tabs" }
    )
    expect(updateTabTitleMock).toHaveBeenLastCalledWith("tab-record", {
      title: "Write implementation",
    })

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Back to Eidos File"))
        ?.click()
    })
    expect(openTabMock).toHaveBeenCalledWith(
      "/space-file#projects%2Ftasks.eidos",
      "tasks.eidos"
    )
  })

  it("refreshes an open record tab when its Eidos File changes externally", async () => {
    getTableRowMock
      .mockResolvedValueOnce({
        _id: "row_1",
        title: "Before external edit",
        status: "todo",
      })
      .mockResolvedValueOnce({
        _id: "row_1",
        title: "After external edit",
        status: "todo",
      })

    await renderRecordEditor()
    expect(container.textContent).toContain("Before external edit")

    getSnapshotMock.mockResolvedValue({
      ...snapshot,
      metadata: {
        ...snapshot.metadata,
        updatedAt: "2026-07-13T03:00:00.000Z",
      },
    })
    await act(async () => {
      spaceFileChanges.handler?.({
        eventType: "change",
        path: "projects/tasks.eidos",
      })
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(getTableRowMock).toHaveBeenLastCalledWith(
      "projects/tasks.eidos",
      "tasks",
      "row_1"
    )
    expect(container.textContent).toContain("After external edit")
    expect(container.textContent).not.toContain("Before external edit")
    expect(updateTabTitleMock).toHaveBeenLastCalledWith("tab-record", {
      title: "After external edit",
    })
  })

  it("keeps table import in the sheet menu and exports from the workbar", async () => {
    await renderEditor()

    const workbar = container.querySelector("[data-eidos-file-workbar]")
    expect(
      workbar?.querySelector(
        '[aria-label="Import CSV as new Eidos File table"]'
      )
    ).toBeNull()
    expect(
      workbar?.querySelector(
        '[aria-label="Export current Eidos File view as CSV"]'
      )
    ).not.toBeNull()
    expect(
      container.querySelector(
        '[data-eidos-file-sheet-tabs] [aria-label="Import CSV as new Eidos File table"]'
      )
    ).toBeNull()
    expect(
      container.querySelectorAll(
        '[data-eidos-file-sheet-tabs] [aria-label="Add Eidos File table"]'
      )
    ).toHaveLength(1)

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-eidos-file-sheet-tabs] [aria-label="Add Eidos File table"]'
        )
        ?.click()
    })
    expect(
      container.querySelector(
        '[data-eidos-file-sheet-tabs] [aria-label="Import CSV as new Eidos File table"]'
      )
    ).not.toBeNull()

    const exportButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Export current Eidos File view as CSV"]'
    )
    expect(exportButton?.textContent).toContain("Export CSV")
    await act(async () => {
      exportButton?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(exportCsvMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      "tasks",
      {
        query: { filter: null, sorts: [] },
        columns: [
          { columnName: "title", name: "Title" },
          { columnName: "status", name: "Status" },
        ],
      },
      "tasks - Tasks - Grid.csv",
      expect.any(String)
    )
  })

  it("creates rows and saves a changed cell", async () => {
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("New row"))
        ?.click()
      await Promise.resolve()
    })
    expect(insertRowMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      "tasks",
      {
        title: "Untitled",
      }
    )

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Edit title")
        ?.click()
      await Promise.resolve()
    })
    expect(updateRowMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      "tasks",
      "row_1",
      { title: "Write implementation" }
    )
  })

  it("keeps expensive Grid host props stable while saving an existing row", async () => {
    await renderEditor()
    const initialProps = eidosFileViewHostProps.grid.at(-1)
    expect(initialProps).toBeDefined()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Edit title")
        ?.click()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const savedProps = eidosFileViewHostProps.grid.at(-1)
    expect(savedProps?.table).toBe(initialProps?.table)
    expect(savedProps?.onRevealFile).toBe(initialProps?.onRevealFile)
    expect(savedProps?.onPropertyFieldOpen).toBe(
      initialProps?.onPropertyFieldOpen
    )
    expect(savedProps?.onPropertyFieldClose).toBe(
      initialProps?.onPropertyFieldClose
    )
    expect(savedProps?.onDeleteField).toBe(initialProps?.onDeleteField)
    expect(savedProps?.onRequestDeleteRows).toBe(
      initialProps?.onRequestDeleteRows
    )
    expect(eidosFileViewHostProps.grid).toHaveLength(1)
  })

  it("does not rerender the Gallery host while saving an existing row", async () => {
    getSnapshotMock.mockResolvedValue({
      ...snapshot,
      tables: snapshot.tables.map((table) => ({
        ...table,
        views: table.views.map((view) => ({
          ...view,
          name: "Cards",
          type: "gallery" as const,
          properties: { cardSize: "medium" },
        })),
      })),
    })
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Edit Gallery title")
        ?.click()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(updateRowMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      "tasks",
      "row_1",
      { title: "Write Gallery implementation" }
    )
    expect(eidosFileViewHostProps.gallery).toHaveLength(1)
  })

  it("bounds Gallery pages and loads a complete row only for inspection", async () => {
    getSnapshotMock.mockResolvedValue({
      ...snapshot,
      tables: snapshot.tables.map((table) => ({
        ...table,
        views: table.views.map((view) => ({
          ...view,
          name: "Cards",
          type: "gallery" as const,
          properties: { cardSize: "medium" },
        })),
      })),
    })
    await renderEditor()

    const hostProps = eidosFileViewHostProps.gallery.at(-1)
    await hostProps?.loadPage(0, 100, 1, "next-page")
    await hostProps?.loadRow?.("row_1")

    expect(getTablePageMock).toHaveBeenLastCalledWith(
      "projects/tasks.eidos",
      "tasks",
      0,
      100,
      { filter: null, sorts: [] },
      1,
      "next-page",
      {
        columns: ["status"],
        fieldLimit: 6,
        omitEmptyFields: true,
      }
    )
    expect(getTableRowMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      "tasks",
      "row_1"
    )
  })

  it("only refreshes a filtered Gallery when the edited field affects its query", async () => {
    getSnapshotMock.mockResolvedValue({
      ...snapshot,
      tables: snapshot.tables.map((table) => ({
        ...table,
        views: table.views.map((view) => ({
          ...view,
          name: "Cards",
          type: "gallery" as const,
          properties: { cardSize: "medium" },
          filter: {
            type: "group" as const,
            conjunction: "and" as const,
            children: [
              {
                type: "rule" as const,
                field: "status",
                operator: "equals" as const,
                value: "todo",
              },
            ],
          },
        })),
      })),
    })
    await renderEditor()

    const gallery = () =>
      container.querySelector<HTMLElement>(
        '[data-testid="eidos-file-gallery-view"]'
      )
    const hostProps = eidosFileViewHostProps.gallery.at(-1)
    const title = snapshot.tables[0].fields.find(
      (field) => field.tableColumnName === "title"
    )
    const status = snapshot.tables[0].fields.find(
      (field) => field.tableColumnName === "status"
    )
    expect(hostProps?.onCellEdit).toBeTypeOf("function")
    expect(title).toBeDefined()
    expect(status).toBeDefined()
    expect(gallery()?.dataset.reloadToken).toBe("1")

    await act(async () => {
      if (title) {
        await hostProps?.onCellEdit?.(
          { _id: "row_1", title: "Write RFC", status: "todo" },
          title,
          "Write implementation"
        )
      }
    })
    expect(gallery()?.dataset.reloadToken).toBe("1")
    expect(eidosFileViewHostProps.gallery).toHaveLength(1)

    await act(async () => {
      if (status) {
        await hostProps?.onCellEdit?.(
          { _id: "row_1", title: "Write implementation", status: "todo" },
          status,
          "done"
        )
      }
    })
    expect(gallery()?.dataset.reloadToken).toBe("2")
  })

  it("does not rerender the Kanban host while saving an existing row", async () => {
    getSnapshotMock.mockResolvedValue({
      ...snapshot,
      tables: snapshot.tables.map((table) => ({
        ...table,
        views: table.views.map((view) => ({
          ...view,
          name: "Board",
          type: "kanban" as const,
          properties: { cardSize: "medium", groupByField: "status" },
        })),
      })),
    })
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Edit Kanban title")
        ?.click()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(updateRowMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      "tasks",
      "row_1",
      { title: "Write Kanban implementation" }
    )
    expect(eidosFileViewHostProps.kanban).toHaveLength(1)
  })

  it("bounds Kanban group pages while retaining the group field", async () => {
    getSnapshotMock.mockResolvedValue({
      ...snapshot,
      tables: snapshot.tables.map((table) => ({
        ...table,
        views: table.views.map((view) => ({
          ...view,
          name: "Board",
          type: "kanban" as const,
          properties: { cardSize: "medium", groupByField: "status" },
        })),
      })),
    })
    await renderEditor()

    const status = snapshot.tables[0].fields.find(
      (field) => field.tableColumnName === "status"
    )
    const hostProps = eidosFileViewHostProps.kanban.at(-1)
    expect(status).toBeDefined()
    if (!status) return

    await hostProps?.loadGroupPage(status, "todo", 0, 50, 1, "next-group")
    const call = getTablePageMock.mock.calls.at(-1)

    expect(call?.slice(0, 4)).toEqual(["projects/tasks.eidos", "tasks", 0, 50])
    expect(call?.[4]).toMatchObject({
      filter: {
        type: "group",
        children: expect.arrayContaining([
          {
            type: "rule",
            field: "status",
            operator: "equals",
            value: "todo",
          },
        ]),
      },
      sorts: [],
    })
    expect(call?.slice(5)).toEqual([
      1,
      "next-group",
      {
        columns: [],
        preservedColumns: ["status"],
        fieldLimit: 4,
        omitEmptyFields: true,
      },
    ])
  })

  it("persists a multi-cell Grid edit as one Eidos File batch", async () => {
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Paste row")
        ?.click()
      await Promise.resolve()
    })

    expect(updateRowsMock).toHaveBeenCalledOnce()
    expect(updateRowsMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      "tasks",
      [
        {
          rowId: "row_1",
          changes: { title: "Write implementation", status: "done" },
        },
      ]
    )
  })

  it("registers table switching for Quick Open and Ctrl+PageDown", async () => {
    const peopleTable = {
      ...snapshot.tables[0],
      table: {
        ...snapshot.tables[0].table,
        id: "people",
        name: "People",
        rawTableName: "tb_people",
        position: 2,
      },
      fields: snapshot.tables[0].fields.map((field) => ({
        ...field,
        tableName: "tb_people",
      })),
      views: snapshot.tables[0].views.map((view) => ({
        ...view,
        id: "view_people",
        tableId: "people",
        query: "SELECT * FROM tb_people",
      })),
      rowCount: 4,
    }
    getSnapshotMock.mockResolvedValue({
      ...snapshot,
      tables: [...snapshot.tables, peopleTable],
    })
    await renderEditor()

    const section =
      useQuickOpenStore.getState().sectionsByTab["tab-base"][
        "eidos-file-tables"
      ]
    expect(section.heading).toBe("Tables in tasks.eidos")
    expect(section.items.map(({ label, detail }) => [label, detail])).toEqual([
      ["Tasks", "1 row"],
      ["People", "4 rows"],
    ])

    const workbar = container.querySelector("[data-eidos-file-workbar]")
    act(() => {
      workbar?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "PageDown",
          ctrlKey: true,
          bubbles: true,
        })
      )
    })
    expect(
      container.querySelector(
        '[aria-label="Eidos File tables"] [role="tab"][aria-selected="true"]'
      )?.textContent
    ).toContain("People")

    await act(async () => section.items[0].onSelect())
    expect(
      container.querySelector(
        '[aria-label="Eidos File tables"] [role="tab"][aria-selected="true"]'
      )?.textContent
    ).toContain("Tasks")
  })

  it("keeps the Grid mounted when its own delayed file-change echo arrives", async () => {
    await renderEditor()
    const grid = () =>
      container.querySelector<HTMLElement>('[data-testid="eidos-file-grid"]')
    expect(grid()?.dataset.reloadToken).toBe("1")

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Edit title")
        ?.click()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(getSnapshotMock).toHaveBeenCalledTimes(1)
    getSnapshotMock.mockResolvedValue({
      ...snapshot,
      metadata: {
        ...snapshot.metadata,
        updatedAt: "2026-07-13T01:00:00.000Z",
      },
    })

    await act(async () => {
      spaceFileChanges.handler?.({
        eventType: "change",
        path: "projects/tasks.eidos",
      })
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(getSnapshotMock).toHaveBeenCalledTimes(2)
    expect(grid()?.dataset.reloadToken).toBe("1")

    getSnapshotMock.mockResolvedValue({
      ...snapshot,
      metadata: {
        ...snapshot.metadata,
        updatedAt: "2026-07-13T02:00:00.000Z",
      },
    })
    await act(async () => {
      spaceFileChanges.handler?.({
        eventType: "change",
        path: "projects/tasks.eidos",
      })
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(getSnapshotMock).toHaveBeenCalledTimes(3)
    expect(grid()?.dataset.reloadToken).toBe("2")
  })

  it("keeps Kanban mounted when adding a row without an active query", async () => {
    getSnapshotMock.mockResolvedValue({
      ...snapshot,
      tables: snapshot.tables.map((table) => ({
        ...table,
        views: table.views.map((view) => ({
          ...view,
          name: "Board",
          type: "kanban" as const,
          properties: { cardSize: "medium", groupByField: "status" },
        })),
      })),
    })
    insertRowMock.mockResolvedValueOnce({
      tableId: "tasks",
      row: { _id: "row_2", title: "Draft release", status: "todo" },
      rowCount: 2,
      revision: "2026-07-13T02:00:00.000Z",
    })
    await renderEditor()
    const kanban = () =>
      container.querySelector<HTMLElement>(
        '[data-testid="eidos-file-kanban-view"]'
      )
    expect(kanban()?.dataset.reloadToken).toBe("1")

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Add Kanban row")
        ?.click()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(insertRowMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      "tasks",
      {
        title: "Draft release",
        status: "todo",
      }
    )
    expect(kanban()?.dataset.reloadToken).toBe("1")
  })

  it("does not make the whole Grid read-only while an optimistic cell save is pending", async () => {
    let resolveUpdate: ((value: unknown) => void) | undefined
    updateRowMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve
        })
    )
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Edit title")
        ?.click()
      await Promise.resolve()
    })

    expect(
      container.querySelector<HTMLElement>('[data-testid="eidos-file-grid"]')
        ?.dataset.disabled
    ).toBe("false")
    expect(container.textContent).toContain("Saving…")

    await act(async () => {
      resolveUpdate?.({
        tableId: "tasks",
        row: {
          _id: "row_1",
          title: "Write implementation",
          status: "todo",
        },
        rowCount: 1,
        revision: "2026-07-13T01:00:00.000Z",
      })
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  })

  it.each(["gallery", "kanban"] as const)(
    "makes the %s view read-only while a schema mutation is pending",
    async (type) => {
      const cardSnapshot: EidosFileSnapshot = {
        ...snapshot,
        tables: snapshot.tables.map((table) => ({
          ...table,
          views: table.views.map((view) => ({
            ...view,
            name: type === "gallery" ? "Cards" : "Board",
            type,
            properties:
              type === "gallery"
                ? { cardSize: "medium" }
                : { cardSize: "medium", groupByField: "status" },
          })),
        })),
      }
      let resolveCreate: ((value: EidosFileSnapshot) => void) | undefined
      getSnapshotMock.mockResolvedValue(cardSnapshot)
      createTableMock.mockImplementationOnce(
        () =>
          new Promise<EidosFileSnapshot>((resolve) => {
            resolveCreate = resolve
          })
      )
      await renderEditor()

      const cardView = () =>
        container.querySelector<HTMLElement>(
          `[data-testid="eidos-file-${type}-view"]`
        )
      expect(cardView()?.dataset.disabled).toBe("false")

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>(
            '[aria-label="Add Eidos File table"]'
          )
          ?.click()
      })
      await act(async () => {
        Array.from(container.querySelectorAll("button"))
          .find((button) => button.textContent === "Confirm table")
          ?.click()
        await Promise.resolve()
      })

      expect(cardView()?.dataset.disabled).toBe("true")

      await act(async () => {
        resolveCreate?.(cardSnapshot)
        await Promise.resolve()
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(cardView()?.dataset.disabled).toBe("false")
    }
  )

  it("leaves a failed Grid save to the anchored Grid recovery surface", async () => {
    updateRowMock.mockRejectedValueOnce(new Error("Eidos File is read-only"))
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Edit title")
        ?.click()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(getSnapshotMock).toHaveBeenCalledTimes(2)
    expect(
      container.querySelector('[aria-label="Dismiss Eidos File error"]')
    ).toBeNull()
  })

  it("offers all first-table paths and creates the shared task template", async () => {
    const emptySnapshot: EidosFileSnapshot = {
      ...snapshot,
      metadata: {
        ...snapshot.metadata,
        defaultTableId: undefined,
      },
      tables: [],
    }
    getSnapshotMock.mockResolvedValue(emptySnapshot)
    createTableMock.mockResolvedValue(snapshot)

    await renderEditor()

    expect(container.textContent).toContain("Start this Eidos File")
    expect(container.textContent).toContain("Blank table")
    expect(container.textContent).toContain("Task tracker")
    expect(container.textContent).toContain("Import CSV")

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Task tracker")
        ?.click()
      await Promise.resolve()
    })

    expect(createTableMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      expect.objectContaining({
        name: "Tasks",
        fields: expect.arrayContaining([
          expect.objectContaining({ name: "Status", type: "select" }),
          expect.objectContaining({ name: "Priority", type: "select" }),
          expect.objectContaining({ name: "Due", type: "date" }),
          expect.objectContaining({ name: "Done", type: "checkbox" }),
        ]),
      })
    )
  })

  it("keeps a failed first template recoverable in the empty state", async () => {
    const emptySnapshot: EidosFileSnapshot = {
      ...snapshot,
      metadata: {
        ...snapshot.metadata,
        defaultTableId: undefined,
      },
      tables: [],
    }
    getSnapshotMock.mockResolvedValue(emptySnapshot)
    createTableMock.mockRejectedValueOnce(
      new Error("The task tracker could not be created")
    )

    await renderEditor()
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Task tracker")
        ?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "task tracker could not be created"
    )
    expect(container.textContent).toContain("Retry task tracker")
    expect(
      container.querySelector('[aria-label="Dismiss Eidos File error"]')
    ).toBeNull()
  })

  it("does not report Saved until the failed resource is retried", async () => {
    await renderEditor()
    const clickButton = async (label: string) => {
      await act(async () => {
        Array.from(container.querySelectorAll("button"))
          .find((button) => button.textContent === label)
          ?.click()
        await Promise.resolve()
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }

    await clickButton("Edit title")
    expect(container.textContent).toContain("Saved")

    updateRowMock.mockRejectedValueOnce(new Error("Eidos File is read-only"))
    await clickButton("Edit title")
    expect(container.textContent).not.toContain("Saved")

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Add Eidos File table"]')
        ?.click()
    })
    await clickButton("Confirm table")
    expect(container.textContent).not.toContain("Saved")

    await clickButton("Edit title")
    expect(container.textContent).toContain("Saved")
  })

  it("keeps Saved suppressed until every failed resource is retried", async () => {
    updateRowMock.mockRejectedValueOnce(new Error("Cell write failed"))
    updateRowsMock.mockRejectedValueOnce(new Error("Batch write failed"))
    await renderEditor()
    const clickButton = async (label: string) => {
      await act(async () => {
        Array.from(container.querySelectorAll("button"))
          .find((button) => button.textContent === label)
          ?.click()
        await Promise.resolve()
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }

    await clickButton("Edit title")
    await clickButton("Paste row")
    expect(container.textContent).not.toContain("Saved")

    await clickButton("Edit title")
    expect(container.textContent).not.toContain("Saved")

    await clickButton("Paste row")
    expect(container.textContent).toContain("Saved")
  })

  it("leaves a failed pasted range to the anchored Grid recovery surface", async () => {
    updateRowsMock.mockRejectedValueOnce(new Error("Batch write failed"))
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Paste row")
        ?.click()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(getSnapshotMock).toHaveBeenCalledTimes(2)
    expect(
      container.querySelector('[aria-label="Dismiss Eidos File error"]')
    ).toBeNull()
  })

  it("leaves Inspector save recovery inside the record workspace", async () => {
    updateRowMock.mockRejectedValueOnce(new Error("Inspector save failed"))
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Edit inspected title")
        ?.click()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(updateRowMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      "tasks",
      "row_1",
      { title: "Write inspected implementation" }
    )
    expect(getSnapshotMock).toHaveBeenCalledTimes(2)
    expect(
      container.querySelector('[aria-label="Dismiss Eidos File error"]')
    ).toBeNull()
  })

  it("leaves view mutation errors to the anchored view workspace", async () => {
    updateViewMock.mockRejectedValueOnce(new Error("View update failed"))
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Update view")
        ?.click()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(getSnapshotMock).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it("keeps filter mutation errors inside the recoverable filter workspace", async () => {
    updateViewMock.mockRejectedValueOnce(new Error("Filter update failed"))
    await renderEditor()

    const exactButton = (label: string) =>
      Array.from(document.body.querySelectorAll("button"))
        .filter((candidate) => candidate.textContent?.trim() === label)
        .at(-1)
    await act(async () => exactButton("Filter")?.click())
    await act(async () => exactButton("Add filter")?.click())
    await act(async () => exactButton("Add condition")?.click())
    await act(async () => {
      exactButton("Apply")?.click()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(getSnapshotMock).toHaveBeenCalledTimes(2)
    const alerts = document.body.querySelectorAll('[role="alert"]')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.textContent).toContain("Filter update failed")
    expect(
      document.body.querySelector('[aria-label="Remove filter"]')
    ).not.toBeNull()
    expect(
      container.querySelector('[aria-label="Dismiss Eidos File error"]')
    ).toBeNull()
  })

  it("does not duplicate recoverable field property errors globally", async () => {
    updateFieldMock.mockRejectedValueOnce(new Error("Field update failed"))
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Edit property")
        ?.click()
    })
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Save property")
        ?.click()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(getSnapshotMock).toHaveBeenCalledTimes(2)
    expect(updateFieldMock).toHaveBeenCalledTimes(1)
    expect(
      container.querySelector('[aria-label="Dismiss Eidos File error"]')
    ).toBeNull()
  })

  it("leaves formula save errors inside the anchored formula editor", async () => {
    updateFieldMock.mockRejectedValueOnce(new Error("Formula update failed"))
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Edit formula")
        ?.click()
    })
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Confirm formula")
        ?.click()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(getSnapshotMock).toHaveBeenCalledTimes(2)
    expect(updateFieldMock).toHaveBeenCalledTimes(1)
    expect(
      container.querySelector('[aria-label="Dismiss Eidos File error"]')
    ).toBeNull()
  })

  it("leaves lookup save errors inside the anchored lookup editor", async () => {
    updateFieldMock.mockRejectedValueOnce(new Error("Lookup update failed"))
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
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(getSnapshotMock).toHaveBeenCalledTimes(2)
    expect(updateFieldMock).toHaveBeenCalledTimes(1)
    expect(
      container.querySelector('[aria-label="Dismiss Eidos File error"]')
    ).toBeNull()
  })

  it("adds tables and fields through the Eidos File structure API", async () => {
    await renderEditor()

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Add Eidos File table"]')
        ?.click()
    })
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Confirm table")
        ?.click()
      await Promise.resolve()
    })
    expect(createTableMock).toHaveBeenCalledWith("projects/tasks.eidos", {
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
    expect(addFieldMock).toHaveBeenCalledWith("projects/tasks.eidos", "tasks", {
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
      "projects/tasks.eidos",
      "tasks",
      { name: "Owner", columnName: "owner", type: "text" },
      { viewId: "view_tasks", index: 1 }
    )
  })

  it("routes view lifecycle actions through the Eidos File API", async () => {
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
      "projects/tasks.eidos",
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
      "projects/tasks.eidos",
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
      "projects/tasks.eidos",
      "tasks",
      {
        name: "Board",
        type: "kanban",
        properties: {
          cardSize: "medium",
          groupByField: "status",
          hideEmptyFields: true,
        },
      }
    )
    expect(updateViewMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      "view_tasks",
      { name: "Renamed view" }
    )
    expect(duplicateViewMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      "view_tasks"
    )
    expect(deleteViewMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      "view_tasks"
    )
    expect(reorderViewsMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      "tasks",
      ["view_tasks"]
    )
  })

  it("reveals the current Eidos File from its overflow actions", async () => {
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find(
          (button) => button.textContent === "Show Eidos File in file manager"
        )
        ?.click()
      await Promise.resolve()
    })

    expect(revealFileMock).toHaveBeenCalledWith("projects/tasks.eidos")
  })

  it("keeps a failed Eidos File reveal recoverable in the editor", async () => {
    revealFileMock.mockRejectedValueOnce(new Error("File manager unavailable"))
    await renderEditor()

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find(
          (button) => button.textContent === "Show Eidos File in file manager"
        )
        ?.click()
      await Promise.resolve()
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "File manager unavailable"
    )
  })

  it("persists system field visibility in the active view", async () => {
    getSnapshotMock.mockResolvedValue({
      ...snapshot,
      tables: snapshot.tables.map((table) => ({
        ...table,
        fields: [
          ...table.fields,
          {
            name: "Created time",
            type: "created-time" as const,
            tableName: table.table.rawTableName,
            tableColumnName: "_created_time",
            property: null,
            storageCodec: "scalar" as const,
            valueKind: "system" as const,
            isHidden: true,
            isDerived: false,
            sourceTableColumnName: null,
            dependsOn: null,
          },
        ],
      })),
    })
    await renderEditor()

    const showCreatedTime = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button")
    ).find((button) => button.textContent === "Show created time")
    expect(showCreatedTime).toBeDefined()
    await act(async () => {
      showCreatedTime?.click()
      await Promise.resolve()
    })

    expect(updateViewMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      "view_tasks",
      {
        hiddenFields: [],
        properties: { visibleSystemFields: ["_created_time"] },
      }
    )
  })

  it("imports, opens, and reveals Eidos File attachments as Space files", async () => {
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

  it("imports attachments beside the Eidos File when configured for this Space", async () => {
    useFileSpaceSettings.setState({
      bySpace: {
        "space-a": {
          showHiddenFiles: false,
          showObsidianFolder: false,
          defaultEidosFileTemplate: "blank",
          eidosFileAssetFolder: "eidos-file-folder-assets",
        },
      },
    })
    importFilesMock.mockResolvedValue({
      canceled: false,
      imported: [],
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

    expect(listFilesMock).toHaveBeenCalledWith("projects/assets")
    expect(importFilesMock).toHaveBeenCalledWith("projects/assets")
  })

  it("searches relation candidates through the target Eidos File table", async () => {
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
      "projects/tasks.eidos",
      "people",
      0,
      50,
      { search: "Ada" }
    )
  })

  it("coordinates row search navigation with the active Eidos File layout", async () => {
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
      container.querySelector('[data-testid="eidos-file-search-result-index"]')
        ?.textContent
    ).toContain("Search result 0")

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Next search result"]')
        ?.click()
    })
    expect(
      container.querySelector('[data-testid="eidos-file-search-result-index"]')
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
      "projects/tasks.eidos",
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
      "projects/tasks.eidos",
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
      "projects/tasks.eidos",
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
      "projects/tasks.eidos",
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
      "projects/tasks.eidos",
      "tasks",
      "status",
      {
        property: {
          options: [{ value: "done", color: "default" }],
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
      "projects/tasks.eidos",
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
      "projects/tasks.eidos",
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
    expect(deleteTableMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      "tasks"
    )
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
      "projects/tasks.eidos",
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
    const gallery = () =>
      container.querySelector<HTMLElement>(
        '[data-testid="eidos-file-gallery-view"]'
      )
    expect(gallery()?.dataset.reloadToken).toBe("1")

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Delete gallery row")
        ?.click()
      await Promise.resolve()
    })

    expect(deleteRowsMock).toHaveBeenCalledWith(
      "projects/tasks.eidos",
      "tasks",
      ["row_1"]
    )
    expect(gallery()?.dataset.reloadToken).toBe("1")
  })
})
