import { useEffect, useMemo, useRef, useState } from "react"
import type { EidosFileSnapshot } from "@eidos.space/eidos-file"
import {
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Search,
} from "lucide-react"

import { useI18n } from "../i18n"
import { EidosFileWorkerClient } from "../runtime/worker-client"
import {
  getEidosFileTemplateSource,
  loadTemplateEidosFile,
} from "../sample-eidos-file"
import { SharedEidosFileEditorView } from "./shared-eidos-file-editor-view"

interface ReadonlyEidosFileDocTableProps {
  theme: "light" | "dark"
}

const copy = {
  en: {
    download: "Download .eidos sample",
    error: "The capability matrix could not be loaded.",
    loading: "Opening the read-only Eidos table…",
    maximize: "Maximize table in page",
    readonly: "Read-only · same file as the editor template",
    restore: "Restore table size",
    search: "Search fields and capabilities",
    title: "Live field capability matrix",
  },
  zh: {
    download: "下载 .eidos 样本",
    error: "字段能力矩阵无法加载。",
    loading: "正在打开只读 Eidos 表…",
    maximize: "页面内最大化表格",
    readonly: "只读 · 与编辑器模板使用同一文件",
    restore: "恢复表格大小",
    search: "搜索字段与能力",
    title: "实时字段能力矩阵",
  },
} as const

export function ReadonlyEidosFileDocTable({
  theme,
}: ReadonlyEidosFileDocTableProps) {
  const { locale } = useI18n()
  const labels = copy[locale]
  const source = getEidosFileTemplateSource("field-capabilities", locale)
  const clientRef = useRef<EidosFileWorkerClient | null>(null)
  const maximizeButtonRef = useRef<HTMLButtonElement | null>(null)
  const [snapshot, setSnapshot] = useState<EidosFileSnapshot | null>(null)
  const [search, setSearch] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let active = true
    const client = new EidosFileWorkerClient()
    clientRef.current = client
    setSnapshot(null)
    setSearch("")
    setError(null)

    void loadTemplateEidosFile("field-capabilities", locale)
      .then(async (file) => {
        const opened = await client.openEditorSource(
          file.name,
          `docs-field-capabilities-${locale}`,
          await file.arrayBuffer()
        )
        if (active) setSnapshot(opened.snapshot)
      })
      .catch((reason: unknown) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : labels.error)
      })

    return () => {
      active = false
      if (clientRef.current === client) clientRef.current = null
      client.terminate()
    }
  }, [labels.error, locale])

  useEffect(() => {
    if (!maximized) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setMaximized(false)
      window.requestAnimationFrame(() => maximizeButtonRef.current?.focus())
    }
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [maximized])

  const table = useMemo(
    () =>
      snapshot?.tables.find(
        (candidate) => candidate.table.name === source.startTable
      ) ?? null,
    [snapshot, source.startTable]
  )
  const view = useMemo(
    () => table?.views.find((candidate) => candidate.type === "grid"),
    [table]
  )

  return (
    <section
      aria-label={labels.title}
      className="docs-eidos-table"
      data-eidos-file-doc-embed="field-capabilities"
      data-eidos-file-readonly="true"
      data-maximized={maximized ? "true" : "false"}
    >
      <header className="docs-eidos-table-header">
        <div className="docs-eidos-table-heading">
          <FileSpreadsheet size={16} aria-hidden="true" />
          <div>
            <strong>{labels.title}</strong>
            <span>{labels.readonly}</span>
          </div>
        </div>
        <div className="docs-eidos-table-actions">
          <a href={source.url} download={source.fileName}>
            <Download size={13} aria-hidden="true" />
            {labels.download}
          </a>
          <button
            ref={maximizeButtonRef}
            aria-label={maximized ? labels.restore : labels.maximize}
            aria-pressed={maximized}
            title={maximized ? labels.restore : labels.maximize}
            type="button"
            onClick={() => setMaximized((current) => !current)}
          >
            {maximized ? (
              <Minimize2 size={14} aria-hidden="true" />
            ) : (
              <Maximize2 size={14} aria-hidden="true" />
            )}
          </button>
        </div>
      </header>
      <div className="docs-eidos-table-toolbar">
        <label className="search-field">
          <Search size={14} aria-hidden="true" />
          <span className="visually-hidden">{labels.search}</span>
          <input
            aria-label={labels.search}
            disabled={!table}
            placeholder={labels.search}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <code>{source.fileName}</code>
      </div>
      <div className="docs-eidos-table-grid" aria-busy={!table && !error}>
        {table && clientRef.current ? (
          <SharedEidosFileEditorView
            capabilities={{
              read: true,
              mutate: false,
              resolveAssets: false,
              rawFile: false,
              nativeFileSystem: false,
            }}
            disabled
            search={search}
            source={clientRef.current}
            table={table}
            tables={snapshot?.tables}
            theme={theme}
            view={view}
          />
        ) : (
          <div className="docs-eidos-table-state" role="status">
            {error ? null : (
              <LoaderCircle className="spin" size={18} aria-hidden="true" />
            )}
            <span>{error ?? labels.loading}</span>
          </div>
        )}
      </div>
    </section>
  )
}
