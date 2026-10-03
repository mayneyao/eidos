import { useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import type { EidosFileSnapshot } from "@eidos.space/eidos-file"
import { EidosRuntimeEditorDataSource } from "@eidos.space/eidos-file-ui"
import { EidosFileUIProvider } from "@eidos.space/eidos-file-ui/context"
import { EidosFileRelatedRecordPanel } from "@eidos.space/eidos-file-ui/eidos-file-related-record-panel"
import { eidosFileGalleryPlugin } from "@eidos.space/eidos-file-ui/plugins/gallery"
import { eidosFileKanbanPlugin } from "@eidos.space/eidos-file-ui/plugins/kanban"
import { eidosFileCalendarPlugin } from "@eidos.space/eidos-file-ui/plugins/calendar"
import { eidosFileFormPlugin } from "@eidos.space/eidos-file-ui/plugins/form"
import { eidosFileFeedPlugin } from "@eidos.space/eidos-file-ui/plugins/feed"
import { createEidosFilePluginRegistry } from "@eidos.space/eidos-file-ui/plugin"
import { HttpRuntimeClient } from "@eidos.space/eidos-file-serve"
import { BrowserEidosFileEditorView } from "@eidos.space/eidos-file-serve/record-view"
import { RecordContentProvider } from "@eidos.space/eidos-file-serve/record-content"
import { MarkdownEditor } from "@eidos.space/markdown"
import { eidosPreset } from "@eidos.space/markdown/presets"
import {
  createRequest,
  resetSession,
  drainRequests,
  type BridgeRequest,
} from "./bridge"
import "./style.css"

type Document = {
  path: string
  kind: "markdown" | "eidos"
  text?: string
  digest?: string
  recovered?: boolean
  dark: boolean
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
const viewRegistry = createEidosFilePluginRegistry(viewPlugins)

function Markdown({
  document,
  request,
  session,
}: {
  document: Document
  request: BridgeRequest
  session: string
}) {
  const [text, setText] = useState(document.text ?? "")
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
        const result = await request<{ digest: string }>("markdown.save", {
          text: value,
          digest: digest.current,
        })
        digest.current = result.digest
        saved.current = value
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
    // A bounded window coalesces keystrokes without postponing saves indefinitely
    // during continuous typing. Explicit leave/background always flush immediately.
    if (saveTimer.current === null)
      saveTimer.current = setTimeout(() => {
        void flush().catch((error) => setError(errorText(error)))
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
            重试保存
          </button>
        </div>
      )}
      <div className="markdown-content touch-editing">
        <MarkdownEditor
          documentKey={document.path}
          documentPath={document.path}
          markdown={text}
          onMarkdownChange={change}
          onSaveRequest={flush}
          preset={eidosPreset}
          theme={document.dark ? "dark" : "light"}
          layout="embedded"
          autoFocus
          toolbarMode="mobile"
          interactions={{
            toolbar: true,
            blockDrag: false,
            blockSelection: false,
            insertMenu: true,
          }}
          labels={{
            bold: "加粗",
            italic: "斜体",
            strikethrough: "删除线",
            highlight: "高亮",
            inlineCode: "行内代码",
            undo: "撤销",
            redo: "重做",
            heading2: "二级标题",
            quote: "引用",
            bulletList: "无序列表",
            checkList: "待办列表",
          }}
          ariaLabel="Markdown 编辑器"
          baseUri={`https://appassets.androidplatform.net/document/${session}/`}
          resolveImageUrl={async ({ markdownUrl }) => {
            const url = new URL(
              markdownUrl,
              `https://appassets.androidplatform.net/document/${session}/`
            )
            return url.origin === location.origin &&
              url.pathname.startsWith(`/document/${session}/`)
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
  source,
  initialSnapshot,
  request,
}: {
  source: EidosRuntimeEditorDataSource
  initialSnapshot: EidosFileSnapshot
  request: BridgeRequest
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [tableId, setTable] = useState("")
  const [search, setSearch] = useState("")
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [record, setRecord] = useState<string | null>(null)
  const [viewId, setViewId] = useState("")
  const load = () =>
    source
      .getSnapshot()
      .then(setSnapshot)
      .catch((error) => setError(errorText(error)))
  useEffect(() => {
    const finish = async () => {
      if (window.document.activeElement instanceof HTMLElement)
        window.document.activeElement.blur()
      await drainRequests()
    }
    window.eidosFlush = () =>
      finish().catch((error) => {
        setError(errorText(error))
        throw error
      })
    window.eidosLeave = (mode) => {
      void finish()
        .then(() => request("leave", { mode }))
        .catch((error) => setError(errorText(error)))
    }
    return () => {
      delete window.eidosFlush
    }
  }, [source, request])
  const table =
    snapshot?.tables.find((value) => value.table.id === tableId) ??
    snapshot?.tables[0]
  const view =
    table?.views.find((value) => value.id === viewId) ?? table?.views[0]
  return (
    <main className="database-page">
      <div className="tools">
        <select
          aria-label="数据表"
          value={table?.table.id ?? ""}
          onChange={(event) => {
            setRecord(null)
            setTable(event.target.value)
            setViewId("")
          }}
        >
          {snapshot?.tables.map((value) => (
            <option key={value.table.id} value={value.table.id}>
              {value.table.name}
            </option>
          ))}
        </select>
        <input
          aria-label="搜索记录"
          placeholder="搜索记录"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button
          disabled={!table || busy}
          onClick={async () => {
            if (!table) return
            setBusy(true)
            try {
              const result = await source.insertRow(table.table.id, {})
              setSnapshot(await source.getSnapshot())
              setRecord(String(result.row._id))
              setReload((value) => value + 1)
            } catch (error) {
              setError(errorText(error))
            } finally {
              setBusy(false)
            }
          }}
        >
          新增
        </button>
      </div>
      {table && !record && (
        <div className="view-tools">
          <div className="mobile-view-tabs" role="tablist" aria-label="视图">
            {!table.views.length && (
              <button role="tab" aria-selected>
                默认表格
              </button>
            )}
            {table.views.map((value) => (
              <button
                key={value.id}
                role="tab"
                aria-selected={value.id === view?.id}
                disabled={busy}
                onClick={() => setViewId(value.id)}
              >
                {value.name}
              </button>
            ))}
          </div>
          <select
            aria-label="新建视图"
            value=""
            disabled={busy}
            onChange={async (event) => {
              const type = event.target.value as keyof typeof viewTypes
              if (!type) return
              setBusy(true)
              try {
                const created = await source.createView(table.table.id, {
                  name: viewTypes[type],
                  type,
                  properties: viewRegistry.views[type]?.create?.properties?.(
                    table.fields
                  ),
                })
                setSnapshot(created)
                setViewId(
                  created.tables
                    .find((value) => value.table.id === table.table.id)
                    ?.views.find(
                      (value) => !table.views.some((old) => old.id === value.id)
                    )?.id ?? ""
                )
              } catch (error) {
                setError(errorText(error))
              } finally {
                setBusy(false)
              }
            }}
          >
            <option value="">＋ 新建视图</option>
            {Object.entries(viewTypes).map(([type, name]) => (
              <option
                key={type}
                value={type}
                disabled={
                  viewRegistry.views[type]?.create?.isAvailable?.(
                    table.fields
                  ) === false
                }
              >
                {name}
              </option>
            ))}
          </select>
        </div>
      )}
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
            重新加载
          </button>
        </div>
      )}
      {!table ? (
        <p>当前文件没有数据表，请切换原生编辑器或在桌面端创建。</p>
      ) : (
        <div className="data-content">
          <RecordContentProvider>
            {record ? (
              <EidosFileRelatedRecordPanel
                source={source}
                table={table}
                target={{ tableId: table.table.id, rowId: record, title: "" }}
                presentation="page"
                onClose={() => setRecord(null)}
                onMutation={() => setReload((value) => value + 1)}
                onError={(error) => setError(errorText(error))}
              />
            ) : (
              <BrowserEidosFileEditorView
                key={table.table.id}
                source={source}
                table={table}
                tables={snapshot.tables}
                view={view}
                plugins={viewPlugins}
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
              />
            )}
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

function App({
  session,
  request,
}: {
  session: string
  request: BridgeRequest
}) {
  const [opened, setOpened] = useState<OpenedDocument | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    request<Document>("init")
      .then(async (document) => {
        window.document.documentElement.classList.toggle("dark", document.dark)
        window.document.documentElement.classList.toggle(
          "light",
          !document.dark
        )
        window.document.documentElement.style.background = ""
        window.document.documentElement.style.colorScheme = document.dark
          ? "dark"
          : "light"
        let database: OpenedDocument["database"]
        if (document.kind === "eidos") {
          const source = new EidosRuntimeEditorDataSource(
            new HttpRuntimeClient((method, params) =>
              request("runtime", { method, request: params })
            ),
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
    }
  }, [])
  useEffect(() => {
    if (opened || error) void request("editor.ready").catch(() => {})
  }, [opened, error])
  if (error) return <p role="alert">{error}</p>
  // Native owns startup feedback; mount the editor only with its document and schema ready.
  if (!opened) return null
  const { document, database } = opened
  return (
    <EidosFileUIProvider
      interactionMode="mobile"
      themeName={document.dark ? "dark" : "light"}
      locale="zh"
      activateUrl={(url) => request<void>("openLink", { url })}
    >
      {document.kind === "markdown" ? (
        <Markdown document={document} request={request} session={session} />
      ) : (
        database && <Database {...database} request={request} />
      )}
    </EidosFileUIProvider>
  )
}
const root = createRoot(document.getElementById("root")!)
window.eidosOpen = (session) => {
  resetSession(session)
  const request = createRequest(session)
  window.eidosLeave = (mode) => {
    void request("leave", { mode }).catch(() => {})
  }
  root.render(<App key={session} session={session} request={request} />)
}
window.eidosSuspend = () => {
  resetSession("")
  window.eidosLeave = () => {}
  root.render(null)
}
