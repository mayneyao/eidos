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
import { request, drainRequests } from "./bridge"
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

function Markdown({ document }: { document: Document }) {
  const [text, setText] = useState(document.text ?? "")
  const [source, setSource] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState(
    document.recovered ? "已恢复未保存的草稿" : "已保存在本机"
  )
  const [error, setError] = useState("")
  const digest = useRef(document.digest!)
  const latest = useRef(text)
  const saved = useRef<string | null>(document.recovered ? null : text)
  const saving = useRef<Promise<void> | null>(null)
  const flush = async () => {
    if (saving.current) await saving.current
    if (latest.current === saved.current) return
    const task = (async () => {
      setStatus("正在保存…")
      while (latest.current !== saved.current) {
        const value = latest.current
        const result = await request<{ digest: string }>("markdown.save", {
          text: value,
          digest: digest.current,
        })
        digest.current = result.digest
        saved.current = value
      }
      setStatus("已保存在本机")
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
    setStatus("正在保存…")
    void flush().catch((error) => {
      setError(errorText(error))
      setStatus("尚未保存")
    })
  }
  const finish = async () => {
    if (window.document.activeElement instanceof HTMLElement)
      window.document.activeElement.blur()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
  }
  useEffect(() => {
    window.eidosLeave = (mode) => {
      void finish()
        .then(() => request("leave", { mode }))
        .catch((error) => setError(errorText(error)))
    }
  })
  return (
    <main className="markdown-page">
      <div className="tools">
        <span role="status">{status}</span>
        <button
          onClick={() => {
            setSource(!source)
            setEditing(true)
          }}
        >
          {source ? "所见即所得" : "源码"}
        </button>
        <button
          onClick={() => {
            if (editing)
              void finish()
                .then(async () => {
                  setEditing(false)
                  setSource(false)
                  await request("keyboard.hide")
                })
                .catch((error) => setError(errorText(error)))
            else setEditing(true)
          }}
        >
          {editing ? "完成" : "编辑"}
        </button>
      </div>
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
            保留草稿并返回
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
                确认放弃草稿并读取磁盘版本
              </button>
              <button onClick={() => setDiscarding(false)}>取消</button>
            </>
          ) : (
            <button onClick={() => setDiscarding(true)}>
              放弃草稿，重新载入
            </button>
          )}
        </div>
      )}
      <div
        className={`markdown-content${editing && !source ? " touch-editing" : ""}`}
      >
        {source ? (
          <textarea
            autoFocus
            aria-label="Markdown 源码"
            value={text}
            onChange={(event) => change(event.target.value)}
          />
        ) : (
          <MarkdownEditor
            documentKey={document.path}
            documentPath={document.path}
            markdown={text}
            onMarkdownChange={change}
            onSaveRequest={flush}
            preset={eidosPreset}
            theme={document.dark ? "dark" : "light"}
            layout="embedded"
            readOnly={!editing}
            autoFocus={editing}
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
        )}
      </div>
    </main>
  )
}

function Database({
  source,
  initialSnapshot,
}: {
  source: EidosRuntimeEditorDataSource
  initialSnapshot: EidosFileSnapshot
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
    window.eidosLeave = (mode) => {
      if (window.document.activeElement instanceof HTMLElement)
        window.document.activeElement.blur()
      void drainRequests().then(() => request("leave", { mode }))
    }
  }, [source])
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
        <div className="tools view-tools">
          <select
            aria-label="视图"
            value={view?.id ?? ""}
            onChange={(event) => setViewId(event.target.value)}
            disabled={busy}
          >
            {!table.views.length && <option value="">默认表格</option>}
            {table.views.map((value) => (
              <option key={value.id} value={value.id}>
                {value.name} ·{" "}
                {viewTypes[value.type as keyof typeof viewTypes] ?? value.type}
              </option>
            ))}
          </select>
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
        <p>当前文件没有数据表，请在桌面端创建。</p>
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

function App() {
  const [opened, setOpened] = useState<OpenedDocument | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    request<Document>("init")
      .then(async (document) => {
        window.document.documentElement.classList.toggle("dark", document.dark)
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
  if (error) return <p role="alert">{error}</p>
  // Mount the editor only with its document and canonical schema ready.
  if (!opened) return <p role="status">正在打开文件…</p>
  const { document, database } = opened
  return (
    <EidosFileUIProvider
      themeName={document.dark ? "dark" : "light"}
      locale="zh"
      activateUrl={(url) => request<void>("openLink", { url })}
    >
      {document.kind === "markdown" ? (
        <Markdown document={document} />
      ) : (
        database && <Database {...database} />
      )}
    </EidosFileUIProvider>
  )
}
createRoot(document.getElementById("root")!).render(<App />)
