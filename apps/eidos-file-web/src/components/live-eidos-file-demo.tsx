import { useEffect, useMemo, useRef, useState } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRowMutationResult,
  EidosFileSnapshot,
} from "@eidos.space/eidos-file"
import {
  ArrowUpRight,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
  Search,
} from "lucide-react"

import { useI18n } from "../i18n"
import { EidosFileWorkerClient } from "../runtime/worker-client"
import {
  getEidosFileTemplateSource,
  loadSampleEidosFile,
} from "../sample-eidos-file"
import { SharedEidosFileEditorView } from "./shared-eidos-file-editor-view"
interface LiveEidosFileDemoProps {
  embedded?: boolean
  theme: "light" | "dark"
  onOpenFullEditor: () => void
}

type DemoPhase = "loading" | "ready" | "error"

function updateRowCount(
  snapshot: EidosFileSnapshot,
  result: EidosFileRowMutationResult
): EidosFileSnapshot {
  return {
    ...snapshot,
    tables: snapshot.tables.map((table) =>
      table.table.id === result.tableId
        ? { ...table, rowCount: result.rowCount }
        : table
    ),
  }
}

export function LiveEidosFileDemo({
  embedded = false,
  theme,
  onOpenFullEditor,
}: LiveEidosFileDemoProps) {
  const { locale, t } = useI18n()
  const clientRef = useRef<EidosFileWorkerClient | null>(null)
  const [generation, setGeneration] = useState(0)
  const [phase, setPhase] = useState<DemoPhase>("loading")
  const [snapshot, setSnapshot] = useState<EidosFileSnapshot | null>(null)
  const [search, setSearch] = useState("")
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [propertyField, setPropertyField] = useState<EidosFileFieldInfo | null>(
    null
  )

  useEffect(() => {
    let active = true
    const client = new EidosFileWorkerClient()
    clientRef.current = client
    setPhase("loading")
    setSnapshot(null)
    setSearch("")
    setDirty(false)
    setMessage(null)
    setPropertyField(null)

    void loadSampleEidosFile(locale)
      .then(async (file) => {
        const result = await client.openEditorSource(
          file.name,
          "live-demo-preview",
          await file.arrayBuffer()
        )
        if (!active) return
        setSnapshot(result.snapshot)
        setPhase("ready")
      })
      .catch((error: unknown) => {
        if (!active) return
        setMessage(
          error instanceof Error ? error.message : "The live demo did not load"
        )
        setPhase("error")
      })

    return () => {
      active = false
      if (clientRef.current === client) clientRef.current = null
      client.terminate()
    }
  }, [generation, locale])

  const table = snapshot?.tables[0] ?? null
  const gridView = useMemo(
    () => table?.views.find((view) => view.type === "grid"),
    [table]
  )
  const fileName = getEidosFileTemplateSource(
    "project-portfolio",
    locale
  ).fileName
  const stateLabel =
    phase === "loading"
      ? t("demoLoading")
      : dirty
        ? t("demoChanged")
        : t("demoLive")
  const stateDescription = [
    stateLabel,
    message ?? t("demoTemporary"),
    t("workerIsolated"),
  ].join(" · ")

  const markMutation = (result: EidosFileRowMutationResult) => {
    setSnapshot((current) =>
      current ? updateRowCount(current, result) : current
    )
    setDirty(true)
    setMessage(null)
  }

  return (
    <section
      className={
        embedded
          ? "live-demo-section live-demo-embedded"
          : "landing-section live-demo-section"
      }
      id="live-demo"
      aria-labelledby="live-demo-title"
    >
      {!embedded ? (
        <header className="live-demo-heading">
          <div>
            <p className="eyebrow">{t("demoEyebrow")}</p>
            <h2 id="live-demo-title">{t("demoTitle")}</h2>
            <p>{t("demoIntro")}</p>
          </div>
          <button
            className="primary-button compact-button"
            type="button"
            onClick={onOpenFullEditor}
          >
            {t("openFullEditor")}
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        </header>
      ) : null}

      <div className="live-demo-frame">
        <div className="live-demo-toolbar">
          {embedded ? (
            <div className="live-demo-identity">
              <FileSpreadsheet size={13} aria-hidden="true" />
              <h2 id="live-demo-title">{fileName}</h2>
            </div>
          ) : null}
          <div
            className="live-demo-state"
            aria-label={stateDescription}
            aria-live="polite"
            title={stateDescription}
          >
            {phase === "loading" ? (
              <LoaderCircle className="spin" size={12} aria-hidden="true" />
            ) : (
              <span className="live-demo-status-dot" aria-hidden="true" />
            )}
            <span>{stateLabel}</span>
          </div>
          <label className="search-field live-demo-search">
            <Search size={13} aria-hidden="true" />
            <span className="visually-hidden">Search live demo records</span>
            <input
              value={search}
              placeholder={t("demoSearch")}
              disabled={phase !== "ready"}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            className={embedded ? "icon-button live-demo-reset" : "text-button"}
            type="button"
            aria-label={t("demoReset")}
            disabled={phase === "loading"}
            title={t("demoReset")}
            onClick={() => setGeneration((current) => current + 1)}
          >
            <RotateCcw size={13} aria-hidden="true" />
            {embedded ? null : t("demoReset")}
          </button>
          {embedded ? (
            <button
              className="text-button live-demo-open"
              type="button"
              aria-label={t("openFullEditor")}
              onClick={onOpenFullEditor}
            >
              <span>{t("openFullEditor")}</span>
              <ArrowUpRight size={13} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div
          className="live-demo-grid"
          aria-busy={phase === "loading"}
          data-demo-phase={phase}
        >
          {phase === "ready" && table && clientRef.current ? (
            <SharedEidosFileEditorView
              theme={theme}
              source={clientRef.current}
              table={table}
              tables={snapshot?.tables}
              view={gridView}
              search={search}
              propertyField={propertyField}
              onMutation={markMutation}
              onSnapshot={(next) => {
                setSnapshot(next)
                setPropertyField((current) =>
                  current
                    ? (next.tables[0]?.fields.find(
                        (field) =>
                          field.tableColumnName === current.tableColumnName
                      ) ?? null)
                    : null
                )
                setDirty(true)
              }}
              onFieldOpen={setPropertyField}
              onFieldClose={() => setPropertyField(null)}
              onError={(error) =>
                setMessage(
                  error instanceof Error ? error.message : "Demo edit failed"
                )
              }
            />
          ) : (
            <div className="live-demo-loading">
              {phase === "error" ? (
                <>
                  <strong>{t("demoUnavailable")}</strong>
                  <span>{message}</span>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setGeneration((current) => current + 1)}
                  >
                    {t("tryAgain")}
                  </button>
                </>
              ) : (
                <>
                  <LoaderCircle className="spin" size={20} aria-hidden="true" />
                  <span>{t("demoOpening")}</span>
                </>
              )}
            </div>
          )}
        </div>
        {!embedded ? (
          <footer className="live-demo-note">
            <span>{message ?? t("demoTemporary")}</span>
            <span>{t("workerIsolated")}</span>
          </footer>
        ) : null}
      </div>
    </section>
  )
}
