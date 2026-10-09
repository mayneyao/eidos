import {
  mobileText,
  getMobileLocale,
  subscribeMobileLocale,
} from "../../../packages/mobile-plugin-host/src/locale"
import {
  MobileRecordPage,
  useMobileRecordRoute,
} from "@eidos.space/eidos-file-ui/mobile-record-route"
import {
  MobileRecordSearch,
  MobileNewViewButton,
  MobileViewSwitcher,
  MobileTableSwitcher,
  MobileNewRecordButton,
} from "@eidos.space/eidos-file-ui/mobile-toolbar"
import { MobileViewSettings } from "@eidos.space/eidos-file-ui/mobile-view-settings"
import { nextEidosFileViewName } from "@eidos.space/eidos-file-ui/eidos-file-view-name"
import { handleMobileBack } from "@eidos.space/eidos-file-ui/mobile-back"
import { useMobileTableHeader } from "@eidos.space/eidos-file-ui/mobile-table-header"
import { MobileTableSettings } from "@eidos.space/eidos-file-ui/mobile-table-settings"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { createRoot } from "react-dom/client"
import type { EidosFileSnapshot, FileEntry } from "@eidos.space/eidos-file"
import { EidosRuntimeEditorDataSource } from "@eidos.space/eidos-file-ui"
import { EidosFileUIProvider } from "@eidos.space/eidos-file-ui/context"
import { createMobileAssets } from "@eidos.space/eidos-file-ui/mobile-assets"
import { EidosFileRelatedRecordPanel } from "@eidos.space/eidos-file-ui/eidos-file-related-record-panel"
import { eidosFileGalleryPlugin } from "@eidos.space/eidos-file-ui/plugins/gallery"
import { eidosFileKanbanPlugin } from "@eidos.space/eidos-file-ui/plugins/kanban"
import { eidosFileCalendarPlugin } from "@eidos.space/eidos-file-ui/plugins/calendar"
import { eidosFileFormPlugin } from "@eidos.space/eidos-file-ui/plugins/form"
import { eidosFileFeedPlugin } from "@eidos.space/eidos-file-ui/plugins/feed"
import { createEidosFilePluginRegistry } from "@eidos.space/eidos-file-ui/plugin"
import { HttpRuntimeClient } from "@eidos.space/eidos-file-serve"
import { BrowserEidosFileEditorView } from "@eidos.space/eidos-file-serve/record-view"
import {
  RecordContentProvider,
  getMobileMarkdownOptions,
} from "@eidos.space/eidos-file-serve/record-content"
import { MarkdownEditor } from "@eidos.space/markdown"
import { useMobilePlugins } from "@eidos.space/eidos-file-ui/mobile-plugins"
import { eidosPreset } from "@eidos.space/markdown/presets"
import { request, drainRequests } from "./bridge"
import "./style.css"
import {
  RecordDraftEditor,
  type RecordDraft,
  type SharedContent,
} from "./record-draft"

type Document = {
  path: string
  recordPath?: string
  kind: "markdown" | "eidos"
  text?: string
  digest?: string
  recovered?: boolean
  dark: boolean
  initialTable?: string
  initialQuery?: string
  recordDraft?: RecordDraft | null
  share?: SharedContent
}
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error)
const viewPlugins = [
  eidosFileGalleryPlugin,
  eidosFileKanbanPlugin,
  eidosFileCalendarPlugin,
  eidosFileFormPlugin,
  eidosFileFeedPlugin,
]
const viewTypes = {
  grid: "表格",
  gallery: "画廊",
  kanban: "看板",
  calendar: "日历",
  form: "表单",
  feed: "动态",
}

function Markdown({ document }: { document: Document }) {
  useMobilePlugins(request, true)
  const [text, setText] = useState(document.text ?? "")
  const [documentPath, setDocumentPath] = useState(document.path)
  const [discarding, setDiscarding] = useState(false)
  const [error, setError] = useState("")
  const digest = useRef(document.digest!)
  const latest = useRef(text)
  const saved = useRef<string | null>(document.recovered ? null : text)
  const saving = useRef<Promise<void> | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelTimer = () => {
    if (saveTimer.current !== null) clearTimeout(saveTimer.current)
    saveTimer.current = null
  }
  const flush = async () => {
    cancelTimer()
    if (saving.current) await saving.current
    if (latest.current === saved.current) return
    const task = (async () => {
      while (latest.current !== saved.current) {
        const value = latest.current
        const result = await request<{
          digest: string
          path?: string
          text?: string
        }>("markdown.save", {
          text: value,
          digest: digest.current,
        })
        digest.current = result.digest
        saved.current = result.text ?? value
        if (latest.current === value && result.text !== undefined) {
          latest.current = result.text
          setText(result.text)
        }
        if (result.path) setDocumentPath(result.path)
      }
      setError("")
    })()
    saving.current = task
    try {
      await task
    } finally {
      if (saving.current === task) saving.current = null
    }
  }
  const change = (value: string) => {
    latest.current = value
    setText(value)
    if (saveTimer.current === null)
      saveTimer.current = setTimeout(() => {
        void flush().catch((error) => {
          setError(errorText(error))
        })
      }, 300)
  }
  const finish = async () => {
    if (window.document.activeElement instanceof HTMLElement)
      window.document.activeElement.blur()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
  }
  useEffect(() => {
    window.eidosFlush = () =>
      finish().catch((error) => {
        setError(errorText(error))
        throw error
      })
    window.eidosLeave = (mode) => {
      if (mode === "back" && handleMobileBack()) return
      void finish()
        .then(() => request("leave", { mode }))
        .catch((error) => setError(errorText(error)))
    }
    return () => {
      delete window.eidosFlush
    }
  })
  useEffect(() => () => cancelTimer(), [])
  return (
    <main className="markdown-page">
      {error && (
        <div role="alert">
          {error}
          <button
            onClick={() =>
              void flush().catch((error) => setError(errorText(error)))
            }
          >
            {mobileText("重试保存")}
          </button>
          <button
            onClick={() => {
              void request("markdown.keepDraft", {
                text: latest.current,
                digest: digest.current,
              })
                .then(() => request("leave"))
                .catch((error) => setError(errorText(error)))
            }}
          >
            {mobileText("保留草稿并返回")}
          </button>
          {discarding ? (
            <>
              <button
                onClick={() => {
                  void request("markdown.discardDraft")
                    .then(() => window.location.reload())
                    .catch((error) => setError(errorText(error)))
                }}
              >
                {mobileText("确认放弃草稿并读取磁盘版本")}
              </button>
              <button onClick={() => setDiscarding(false)}>
                {mobileText("取消")}
              </button>
            </>
          ) : (
            <button onClick={() => setDiscarding(true)}>
              {mobileText("放弃草稿，重新载入")}
            </button>
          )}
        </div>
      )}
      <div className="markdown-content touch-editing">
        <MarkdownEditor
          documentKey={document.path}
          documentPath={documentPath}
          markdown={text}
          onMarkdownChange={change}
          onSaveRequest={flush}
          preset={eidosPreset}
          theme={document.dark ? "dark" : "light"}
          layout="embedded"
          readOnly={false}
          autoFocus={false}
          {...getMobileMarkdownOptions(getMobileLocale())}
          onDismissKeyboard={() => {
            void request("keyboard.hide").catch(() => {})
          }}
          ariaLabel={mobileText("Markdown 编辑器")}
          onImportFiles={async ({ kind }) => {
            const files = await request<
              Pick<FileEntry, "uri" | "name" | "mediaType">[]
            >("files.import", { imagesOnly: kind === "image" })
            return files.map((file) => ({
              markdownUrl: file.uri,
              name: file.name,
              mediaType: file.mediaType,
            }))
          }}
          baseUri="eidos://app/document/"
          resolveImageUrl={async ({ markdownUrl }) => {
            const url = new URL(markdownUrl, "eidos://app/document/")
            return url.origin === location.origin &&
              url.pathname.startsWith("/document/")
              ? url.href
              : null
          }}
          onOpenExternalUrl={(url) => request<void>("openLink", { url })}
          onError={(error) => setError(error.message)}
        />
      </div>
    </main>
  )
}

function Database({
  filePath,
  source,
  initialSnapshot,
  importFiles,
  initialTable = "",
  initialQuery = "",
  initialDraft = null,
  share,
}: {
  filePath: string
  source: EidosRuntimeEditorDataSource
  initialSnapshot: EidosFileSnapshot
  importFiles: (options?: { imagesOnly?: boolean }) => Promise<FileEntry[]>
  initialTable?: string
  initialQuery?: string
  initialDraft?: RecordDraft | null
  share?: SharedContent
}) {
  const mobilePlugins = useMobilePlugins(request)
  const plugins = [...viewPlugins, ...mobilePlugins]
  const viewRegistry = createEidosFilePluginRegistry(plugins)
  const availableViewTypes: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(viewTypes).map(([key, label]) => [key, mobileText(label)])
    ),
    ...Object.fromEntries(
      mobilePlugins.flatMap((p) => p.views ?? []).map((v) => [v.type, v.label])
    ),
  }
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [tableId, setTable] = useState(initialTable)
  const [search, setSearch] = useState(initialQuery)
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const recordRoute = useMobileRecordRoute(
    filePath,
    (active) => request("editor.recordPage", { active }),
    (error) => setError(errorText(error))
  )
  const record = recordRoute.route?.rowId ?? null
  const setRecord = (id: string | null) => {
    if (id && table) recordRoute.open(table.table.id, id)
    else recordRoute.close()
  }
  const [viewId, setViewId] = useState("")
  const [draft, setDraft] = useState(initialDraft)
  const [draftOpen, setDraftOpen] = useState(Boolean(share || initialDraft))
  const load = () =>
    source
      .getSnapshot()
      .then(setSnapshot)
      .catch((error) => setError(errorText(error)))
  useEffect(() => {
    window.eidosFlush = async () => {
      if (window.document.activeElement instanceof HTMLElement)
        window.document.activeElement.blur()
      await drainRequests()
    }
    window.eidosLeave = (mode) => {
      if (mode === "back" && handleMobileBack()) return
      if (window.document.activeElement instanceof HTMLElement)
        window.document.activeElement.blur()
      void drainRequests().then(() => request("leave", { mode }))
    }
    return () => {
      delete window.eidosFlush
    }
  }, [source])
  const table =
    snapshot?.tables.find((value) => value.table.id === tableId) ??
    snapshot?.tables[0]
  const recordTable = snapshot.tables.find(
    (item) => item.table.id === recordRoute.route?.tableId
  )
  const rememberedViews = useRef(new Map<string, string>())
  useEffect(() => {
    if (table?.table.id && viewId)
      rememberedViews.current.set(table.table.id, viewId)
  }, [table?.table.id, viewId])
  const view =
    table?.views.find((value) => value.id === viewId) ?? table?.views[0]
  useMobileTableHeader(
    snapshot.tables,
    table?.table.id,
    async (id) => {
      if (busy) return
      if (window.document.activeElement instanceof HTMLElement)
        window.document.activeElement.blur()
      await drainRequests()
      setRecord(null)
      setSearch("")
      setTable(id)
      setViewId(rememberedViews.current.get(id) ?? "")
    },
    request,
    (error) => setError(errorText(error))
  )
  if (draftOpen)
    return (
      <RecordDraftEditor
        source={source}
        tables={snapshot.tables}
        initial={draft}
        share={share}
        importFiles={importFiles}
        onDone={() => {
          if (share) {
            void request("leave")
            return
          }
          setDraftOpen(false)
          void load()
          setReload((value) => value + 1)
        }}
      />
    )
  return (
    <main
      className="database-page"
      style={
        record ? { visibility: "hidden", pointerEvents: "none" } : undefined
      }
      aria-hidden={record ? true : undefined}
    >
      {record && (
        <RecordContentProvider
          onDismissKeyboard={() => {
            void request("keyboard.hide").catch(() => {})
          }}
          onImportFiles={async ({ kind }) => {
            const files = await importFiles({ imagesOnly: kind === "image" })
            return files.map((file) => ({
              markdownUrl: file.uri,
              name: file.name,
              mediaType: file.mediaType,
            }))
          }}
        >
          <MobileRecordPage>
            {recordTable ? (
              <EidosFileRelatedRecordPanel
                onSnapshot={setSnapshot}
                onImportFiles={importFiles}
                source={source}
                table={recordTable}
                target={{
                  tableId: recordRoute.route!.tableId,
                  rowId: record,
                  title: "",
                }}
                onNavigate={(id) =>
                  recordRoute.open(recordRoute.route!.tableId, id)
                }
                presentation="page"
                onClose={() => setRecord(null)}
                onMutation={() => setReload((value) => value + 1)}
                onError={(error) => setError(errorText(error))}
              />
            ) : (
              <div className="p-6">
                <button onClick={() => recordRoute.close()}>
                  {mobileText("返回文件")}
                </button>
                <p role="alert">{mobileText("记录所属的数据表不存在。")}</p>
              </div>
            )}
          </MobileRecordPage>
        </RecordContentProvider>
      )}
      <MobileTableSettings
        key={table?.table.id ?? "empty"}
        source={source}
        table={table}
        onSnapshot={setSnapshot}
        onSelect={(id) => {
          setTable(id)
          setViewId("")
          setSearch("")
          setRecord(null)
        }}
      />
      <div className="view-tools">
        <MobileTableSwitcher
          tables={snapshot.tables.map(({ table }) => table)}
          activeId={table?.table.id}
          disabled={busy}
          onReorder={async (ids) => {
            setTable(table?.table.id ?? "")
            setBusy(true)
            try {
              setSnapshot(await source.reorderTables(ids))
            } finally {
              setBusy(false)
            }
          }}
        />
        {table && (
          <>
            <span className="mobile-view-path-separator" aria-hidden="true">
              /
            </span>
            <MobileViewSwitcher
              key={`view-switcher:${table.table.id}`}
              views={table.views.map((view) => ({
                ...view,
                icon: viewRegistry.views[view.type]?.icon,
              }))}
              activeId={view?.id}
              disabled={busy}
              onSelect={setViewId}
              onReorder={async (ids) => {
                setViewId(view?.id ?? "")
                setBusy(true)
                try {
                  setSnapshot(await source.reorderViews(table.table.id, ids))
                } finally {
                  setBusy(false)
                }
              }}
            >
              <MobileNewViewButton
                disabled={busy}
                options={Object.entries(availableViewTypes).map(
                  ([type, name]) => ({
                    type,
                    name,
                    pluginName: type.startsWith("plugin:")
                      ? viewRegistry.views[type]?.description
                      : undefined,
                    icon: viewRegistry.views[type]?.icon,
                    disabled:
                      viewRegistry.views[type]?.create?.isAvailable?.(
                        table.fields
                      ) === false,
                  })
                )}
                onCreate={async (value) => {
                  const type = value as keyof typeof viewTypes
                  setBusy(true)
                  try {
                    const created = await source.createView(table.table.id, {
                      name: nextEidosFileViewName(
                        availableViewTypes[type],
                        table.views
                      ),
                      type,
                      properties: viewRegistry.views[
                        type
                      ]?.create?.properties?.(table.fields),
                    })
                    setSnapshot(created)
                    setViewId(
                      created.tables
                        .find((value) => value.table.id === table.table.id)
                        ?.views.find(
                          (value) =>
                            !table.views.some((old) => old.id === value.id)
                        )?.id ?? ""
                    )
                  } finally {
                    setBusy(false)
                  }
                }}
              />
            </MobileViewSwitcher>
            <MobileRecordSearch value={search} onChange={setSearch} />
            <MobileViewSettings
              key={`view-settings:${table.table.id}`}
              source={source}
              table={table}
              tables={snapshot.tables}
              view={view}
              plugin={view ? viewRegistry.views[view.type] : undefined}
              onSnapshot={(next) => {
                setSnapshot(next)
                setReload((value) => value + 1)
              }}
            />
            <MobileNewRecordButton
              aria-label={mobileText("新记录")}
              title={mobileText("新记录")}
              disabled={!table || busy}
              onClick={async () => {
                if (!table) return
                setBusy(true)
                try {
                  const saved = await request<RecordDraft | null>(
                    "recordDraft.read"
                  )
                  const next = saved ?? {
                    tableId: table.table.id,
                    row: { _id: "draft" },
                  }
                  if (!saved) await request("recordDraft.save", next)
                  setDraft(next)
                  setDraftOpen(true)
                } catch (error) {
                  setError(errorText(error))
                } finally {
                  setBusy(false)
                }
              }}
            />
          </>
        )}
      </div>
      {error && (
        <div role="alert">
          {error}
          <button
            onClick={() => {
              setError("")
              void load()
              setReload((value) => value + 1)
            }}
          >
            {mobileText("重新加载")}
          </button>
        </div>
      )}
      {!table ? (
        <p>{mobileText("当前文件没有数据表，请在桌面端创建。")}</p>
      ) : (
        <div className="data-content">
          <RecordContentProvider
            onDismissKeyboard={() => {
              void request("keyboard.hide").catch(() => {})
            }}
            onImportFiles={async ({ kind }) => {
              const files = await importFiles({ imagesOnly: kind === "image" })
              return files.map((file) => ({
                markdownUrl: file.uri,
                name: file.name,
                mediaType: file.mediaType,
              }))
            }}
          >
            <BrowserEidosFileEditorView
              onImportFiles={importFiles}
              key={table.table.id}
              source={source}
              table={table}
              tables={snapshot.tables}
              view={view}
              plugins={plugins}
              onOpenRecord={(id) => setRecord(id)}
              recordPresentation="page"
              search={search}
              reloadToken={reload}
              disabled={busy}
              showRowMarkers={false}
              allowFrozenColumns={false}
              onError={(error) => setError(errorText(error))}
              onSnapshot={setSnapshot}
              onMutation={() => setReload((value) => value + 1)}
              onDeleteRows={async (ranges, query) => {
                const result = await source.deleteRowRanges(
                  table.table.id,
                  ranges,
                  query
                )
                setSnapshot(await source.getSnapshot())
                setReload((value) => value + 1)
                return result
              }}
              onDeleteRow={async (row) => {
                await source.deleteRows(table.table.id, [String(row._id)])
                setSnapshot(await source.getSnapshot())
                setReload((value) => value + 1)
              }}
            />
          </RecordContentProvider>
        </div>
      )}
    </main>
  )
}

type OpenedDocument = {
  document: Document
  database?: {
    source: EidosRuntimeEditorDataSource
    initialSnapshot: EidosFileSnapshot
  }
}

function App() {
  const locale = useSyncExternalStore(subscribeMobileLocale, getMobileLocale)
  const [assets] = useState(() =>
    createMobileAssets("ios-editor", "eidos://app/document/")
  )
  const [opened, setOpened] = useState<OpenedDocument | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    request<Document>("init")
      .then(async (document) => {
        window.document.documentElement.classList.toggle("dark", document.dark)
        window.document.documentElement.dataset.theme = document.dark
          ? "dark"
          : "light"
        let database: OpenedDocument["database"]
        if (document.kind === "eidos") {
          const source = new EidosRuntimeEditorDataSource(
            new HttpRuntimeClient(async (method, params) => {
              const value = await request("runtime", {
                method,
                request: params,
              })
              assets.observe(value)
              return value
            }),
            document.path
          )
          database = { source, initialSnapshot: await source.initialize() }
        }
        if (active) setOpened({ document, database })
      })
      .catch((error) => {
        if (active) setError(errorText(error))
      })
    return () => {
      active = false
      assets.close()
    }
  }, [])
  if (error) return <p role="alert">{error}</p>
  // Mount the editor only with its document and canonical schema ready.
  if (!opened) return <p role="status">{mobileText("正在打开文件…")}</p>
  const { document, database } = opened
  return (
    <EidosFileUIProvider
      interactionMode="mobile"
      assetSession={assets.session}
      assetPresenter={assets.presenter}
      themeName={document.dark ? "dark" : "light"}
      locale={locale}
      activateUrl={(url) => request<void>("openLink", { url })}
    >
      {document.kind === "markdown" ? (
        <Markdown document={document} />
      ) : (
        database && (
          <Database
            {...database}
            filePath={document.recordPath ?? document.path}
            initialTable={document.initialTable}
            initialQuery={document.initialQuery}
            initialDraft={document.recordDraft}
            share={document.share}
            importFiles={async (options) => {
              const entries = await request<FileEntry[]>(
                "files.import",
                options
              )
              assets.observe(entries)
              return entries
            }}
          />
        )
      )}
    </EidosFileUIProvider>
  )
}
createRoot(document.getElementById("root")!).render(<App />)
