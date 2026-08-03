import { useEffect, useMemo, useRef, useState } from "react"
import type {
  CreateEidosFileFieldInput,
  CreateEidosFileTableInput,
  EidosFileFieldInfo,
  EidosFileFormulaPreviewInput,
  EidosFileRow,
  EidosFileRowQuery,
  EidosFileRowRange,
  EidosFileSnapshot,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
  UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"
import {
  createEidosFilePluginRegistry,
  EidosFileEditorShell,
  EidosFileEditorView,
  EidosFileFieldCreatePopover,
  EidosFileFormulaEditorPopover,
  EidosFileLookupEditorPopover,
  EidosFilePluginSlot,
  EidosFileQueryToolbar,
  EidosFileSheetCreatePopover,
  EidosFileSheetTabs,
  EidosFileUIProvider,
  EidosFileViewFieldsPopover,
  EidosFileViewTabs,
  exportEidosFileViewCsv,
  type EidosFilePluginContext,
  type EidosFilePlugin,
} from "@eidos.space/eidos-file-ui"
import {
  createEidosFileCsvImportPlugin,
  type EidosFileCsvImportSource,
} from "@eidos.space/eidos-file-ui/plugins/csv-import"
import { eidosFileGalleryPlugin } from "@eidos.space/eidos-file-ui/plugins/gallery"
import { eidosFileKanbanPlugin } from "@eidos.space/eidos-file-ui/plugins/kanban"
import { Check } from "lucide-react"

import { eidosLiteCsvFileName } from "./csv-workflow"
import { shouldFocusEidosFileSearch } from "./eidos-file-workbench-shortcuts"
import type { IpcEidosFileDataSource } from "./ipc-data-source"

const VIEW_PLUGINS: EidosFilePlugin[] = [
  eidosFileGalleryPlugin,
  eidosFileKanbanPlugin,
]
const PLUGIN_REGISTRY = createEidosFilePluginRegistry(VIEW_PLUGINS)

export interface EidosFileWorkbenchProps {
  relativePath: string
  snapshot: EidosFileSnapshot
  source: IpcEidosFileDataSource
  activeTableId: string
  disabled: boolean
  theme: "light" | "dark"
  onTableSelect(tableId: string): void
  onSnapshot(snapshot: EidosFileSnapshot): void
  onError(error: unknown): void
}

export function EidosFileWorkbench({
  relativePath,
  snapshot,
  source,
  activeTableId,
  disabled,
  theme,
  onTableSelect,
  onSnapshot,
  onError,
}: EidosFileWorkbenchProps) {
  const [activeViews, setActiveViews] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")
  const [focusSearchToken, setFocusSearchToken] = useState(0)
  const [propertyField, setPropertyField] = useState<EidosFileFieldInfo | null>(
    null
  )
  const [addPropertyOpen, setAddPropertyOpen] = useState(false)
  const [fieldInsertIndex, setFieldInsertIndex] = useState<number | null>(null)
  const [formulaTarget, setFormulaTarget] = useState<EidosFileFieldInfo | null>(
    null
  )
  const [lookupTarget, setLookupTarget] = useState<EidosFileFieldInfo | null>(
    null
  )
  const [reloadToken, setReloadToken] = useState(0)
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleFind = (event: KeyboardEvent) => {
      if (
        !shouldFocusEidosFileSearch(
          event,
          editorRef.current,
          document.activeElement
        )
      ) {
        return
      }
      event.preventDefault()
      setFocusSearchToken((current) => current + 1)
    }
    document.addEventListener("keydown", handleFind)
    return () => document.removeEventListener("keydown", handleFind)
  }, [])

  const editorPlugins = useMemo<EidosFilePlugin[]>(
    () => [
      ...VIEW_PLUGINS,
      createEidosFileCsvImportPlugin({
        async pickFile() {
          const selection = await window.eidosLite.selectCsvFile()
          if (!selection) return null
          const selected: EidosFileCsvImportSource = {
            id: selection.token,
            fileName: selection.fileName,
          }
          return selected
        },
        preview(selected, options, operationId) {
          return window.eidosLite.callRuntime(
            source.sessionId,
            "previewCsvFile",
            [selected.id, options, operationId]
          )
        },
        import(selected, options, operationId) {
          return window.eidosLite.callRuntime(
            source.sessionId,
            "importCsvFile",
            [selected.id, options, operationId]
          )
        },
        progress(operationId) {
          return window.eidosLite.callRuntime(
            source.sessionId,
            "getCsvOperationProgress",
            [operationId]
          )
        },
        cancel(operationId) {
          return window.eidosLite.callRuntime(
            source.sessionId,
            "cancelCsvOperation",
            [operationId]
          )
        },
        release(selected) {
          void window.eidosLite.releaseCsvFile(selected.id)
        },
      }),
    ],
    [source]
  )

  const activeTable = useMemo(
    () =>
      snapshot.tables.find((table) => table.table.id === activeTableId) ??
      snapshot.tables[0] ??
      null,
    [activeTableId, snapshot.tables]
  )
  const currentPropertyField = useMemo(() => {
    if (!propertyField) return null
    return (
      snapshot.tables
        .find((table) => table.table.id === propertyField.tableId)
        ?.fields.find((field) => field.id === propertyField.id) ?? propertyField
    )
  }, [propertyField, snapshot.tables])
  const activeView = useMemo(() => {
    if (!activeTable) return undefined
    const requested = activeViews[activeTable.table.id]
    return (
      activeTable.views.find((view) => view.id === requested) ??
      activeTable.views.find((view) => view.type === "grid") ??
      activeTable.views[0]
    )
  }, [activeTable, activeViews])

  const pluginContext = useMemo<EidosFilePluginContext | null>(() => {
    if (!activeTable) return null
    return {
      source,
      snapshot,
      activeTable,
      activeView,
      disabled,
      onSnapshot,
      onTableSelect,
      onError,
    }
  }, [
    activeTable,
    activeView,
    disabled,
    onError,
    onSnapshot,
    onTableSelect,
    snapshot,
    source,
  ])

  if (!activeTable) return null

  const updateActiveView = async (changes: UpdateEidosFileViewInput) => {
    if (!activeView) return
    await source.updateView(activeView.id, changes)
  }

  const addProperty = async (field: CreateEidosFileFieldInput) => {
    await source.addField(
      activeTable.table.id,
      field,
      activeView && fieldInsertIndex !== null
        ? { viewId: activeView.id, index: fieldInsertIndex }
        : undefined
    )
    setFieldInsertIndex(null)
    setReloadToken((current) => current + 1)
  }

  const previewFormula = (input: EidosFileFormulaPreviewInput) => {
    if (!source.previewFormula) {
      return Promise.reject(new Error("Formula preview is unavailable"))
    }
    return source.previewFormula(activeTable.table.id, input)
  }

  const saveDerivedProperty = async (
    field: EidosFileFieldInfo | null,
    property: Record<string, unknown>
  ) => {
    if (!field) return
    await source.updateField(activeTable.table.id, field.tableColumnName, {
      property,
    })
    setReloadToken((current) => current + 1)
  }

  const createTable = async (input: CreateEidosFileTableInput) => {
    const previousIds = new Set(snapshot.tables.map((table) => table.table.id))
    const next = await source.createTable(input)
    const created = next.tables.find(
      (table) => !previousIds.has(table.table.id)
    )
    if (created) onTableSelect(created.table.id)
  }

  const createView = async (name: string, type: string) => {
    const previousIds = new Set(activeTable.views.map((view) => view.id))
    const contribution = PLUGIN_REGISTRY.views[type]
    const next = await source.createView(activeTable.table.id, {
      name,
      type,
      properties: contribution?.create?.properties?.(activeTable.fields),
    })
    const created = next.tables
      .find((table) => table.table.id === activeTable.table.id)
      ?.views.find((view) => !previousIds.has(view.id))
    if (created) {
      setActiveViews((current) => ({
        ...current,
        [activeTable.table.id]: created.id,
      }))
    }
  }

  const duplicateView = async (viewId: string) => {
    const previousIds = new Set(activeTable.views.map((view) => view.id))
    const next = await source.duplicateView(viewId)
    const duplicate = next.tables
      .find((table) => table.table.id === activeTable.table.id)
      ?.views.find((view) => !previousIds.has(view.id))
    if (duplicate) {
      setActiveViews((current) => ({
        ...current,
        [activeTable.table.id]: duplicate.id,
      }))
    }
  }

  const deleteView = async (viewId: string) => {
    const next = await source.deleteView(viewId)
    const remaining = next.tables.find(
      (table) => table.table.id === activeTable.table.id
    )?.views
    if (activeView?.id === viewId && remaining?.[0]) {
      setActiveViews((current) => ({
        ...current,
        [activeTable.table.id]: remaining[0].id,
      }))
    }
  }

  const deleteRows = async (
    ranges: EidosFileRowRange[],
    query: EidosFileRowQuery
  ) => {
    await source.deleteRowRanges(activeTable.table.id, ranges, query)
    setReloadToken((current) => current + 1)
  }

  const deleteRow = async (row: EidosFileRow) => {
    if (row._id == null) return
    await source.deleteRows(activeTable.table.id, [String(row._id)])
    setReloadToken((current) => current + 1)
  }

  const exportTableCsv = async (
    table: EidosFileTableSnapshot,
    view?: EidosFileViewInfo,
    scopedSearch = ""
  ) => {
    const result = await exportEidosFileViewCsv({
      source,
      table,
      view,
      search: scopedSearch,
    })
    const fileBase = relativePath
      .split("/")
      .at(-1)
      ?.replace(/\.eidos$/i, "")
    await window.eidosLite.saveCsvFile(
      eidosLiteCsvFileName(fileBase, table.table.name, view?.name),
      result.bytes
    )
  }

  return (
    <EidosFileUIProvider locale="en" themeName={theme}>
      <EidosFileEditorShell
        ref={editorRef}
        className="lite-eidos-file-shell min-h-0 flex-1 !h-auto"
        searchNavigation={{
          search,
          scopeKey: `${relativePath}:${activeTable.table.id}:${activeView?.id ?? "default"}`,
        }}
        viewTabs={
          <EidosFileViewTabs
            views={activeTable.views}
            fields={activeTable.fields}
            activeView={activeView}
            disabled={disabled}
            onSelect={(viewId) =>
              setActiveViews((current) => ({
                ...current,
                [activeTable.table.id]: viewId,
              }))
            }
            onCreate={createView}
            onRename={async (viewId, name) => {
              await source.updateView(viewId, { name })
            }}
            onDuplicate={duplicateView}
            onDelete={deleteView}
            onReorder={(viewIds) =>
              source
                .reorderViews(activeTable.table.id, viewIds)
                .then(() => undefined)
            }
            onUpdate={async (viewId, changes) => {
              await source.updateView(viewId, changes)
            }}
            onExportCsv={(view) =>
              exportTableCsv(
                activeTable,
                view,
                view.id === activeView?.id ? search : ""
              )
            }
            onExportError={onError}
          />
        }
        queryToolbar={
          <EidosFileQueryToolbar
            fields={activeTable.fields}
            filter={activeView?.filter ?? null}
            sorts={activeView?.sorts ?? []}
            search={search}
            focusSearchToken={focusSearchToken}
            disabled={disabled}
            onSearchChange={setSearch}
            onFilterChange={(filter) => updateActiveView({ filter })}
            onSortsChange={(sorts) => updateActiveView({ sorts })}
          />
        }
        fields={
          activeView ? (
            <EidosFileViewFieldsPopover
              fields={activeTable.fields}
              view={activeView}
              disabled={disabled}
              onUpdate={updateActiveView}
              onFieldOpen={setPropertyField}
              onFieldAdd={() => {
                setFieldInsertIndex(null)
                setAddPropertyOpen(true)
              }}
            />
          ) : undefined
        }
        fieldCreator={
          <EidosFileFieldCreatePopover
            open={addPropertyOpen}
            onOpenChange={(open) => {
              setAddPropertyOpen(open)
              if (!open) setFieldInsertIndex(null)
            }}
            table={activeTable}
            tables={snapshot.tables}
            disabled={disabled}
            onCreate={addProperty}
            onPreviewFormula={previewFormula}
          />
        }
        contentProps={{
          className: "eidos-file-content",
          id: "eidos-file-grid",
        }}
        sheetTabs={
          <EidosFileSheetTabs
            tables={snapshot.tables.map((table) => table.table)}
            activeTableId={activeTable.table.id}
            disabled={disabled}
            createAction={
              <EidosFileSheetCreatePopover
                disabled={disabled}
                onCreate={createTable}
                importAction={
                  pluginContext ? (
                    <EidosFilePluginSlot
                      context={pluginContext}
                      plugins={editorPlugins}
                      slot="sheet-create"
                    />
                  ) : undefined
                }
              />
            }
            onSelect={(tableId) => {
              onTableSelect(tableId)
              setSearch("")
              setPropertyField(null)
              setFormulaTarget(null)
              setLookupTarget(null)
            }}
            onRename={async (table, name) => {
              await source.updateTable(table.id, { name })
            }}
            onDelete={async (table) => {
              const next = await source.deleteTable(table.id)
              if (table.id === activeTable.table.id) {
                const nextTableId =
                  next.metadata.defaultTableId ??
                  next.tables[0]?.table.id ??
                  activeTable.table.id
                onTableSelect(nextTableId)
              }
              setActiveViews((current) => {
                const nextViews = { ...current }
                delete nextViews[table.id]
                return nextViews
              })
            }}
            onExportCsv={(table) => {
              const tableSnapshot = snapshot.tables.find(
                (candidate) => candidate.table.id === table.id
              )
              if (!tableSnapshot) {
                return Promise.reject(new Error("Eidos File table not found"))
              }
              return exportTableCsv(tableSnapshot)
            }}
            onExportError={onError}
            status={
              <span
                className="lite-sheet-status"
                title={`Saved directly to ${relativePath}`}
              >
                <Check aria-hidden="true" />
                Local · SQLite {snapshot.metadata.schemaVersion}
              </span>
            }
          />
        }
        overlays={
          <>
            <EidosFileFormulaEditorPopover
              field={formulaTarget}
              fields={activeTable.fields}
              open={formulaTarget !== null}
              onOpenChange={(open) => {
                if (!open) setFormulaTarget(null)
              }}
              onPreview={previewFormula}
              onSave={(property) =>
                saveDerivedProperty(formulaTarget, property)
              }
            />
            <EidosFileLookupEditorPopover
              field={lookupTarget}
              fields={activeTable.fields}
              tables={snapshot.tables}
              open={lookupTarget !== null}
              onOpenChange={(open) => {
                if (!open) setLookupTarget(null)
              }}
              onSave={(property) => saveDerivedProperty(lookupTarget, property)}
            />
          </>
        }
      >
        <EidosFileEditorView
          key={`${activeTable.table.id}:${activeView?.id ?? "default"}`}
          plugins={editorPlugins}
          source={source}
          table={activeTable}
          tables={snapshot.tables}
          view={activeView}
          search={search}
          disabled={disabled}
          reloadToken={reloadToken}
          propertyField={currentPropertyField}
          capabilities={{
            read: true,
            mutate: !disabled,
            resolveAssets: false,
            rawFile: false,
            nativeFileSystem: false,
          }}
          onSnapshot={onSnapshot}
          onDeleteRow={deleteRow}
          onDeleteRows={deleteRows}
          onFieldOpen={setPropertyField}
          onFieldClose={() => setPropertyField(null)}
          onEditFormula={setFormulaTarget}
          onEditLookup={setLookupTarget}
          onFieldAdd={(position) => {
            setFieldInsertIndex(position ?? null)
            setAddPropertyOpen(true)
          }}
          onError={onError}
        />
      </EidosFileEditorShell>
    </EidosFileUIProvider>
  )
}
