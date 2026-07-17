import { useEffect, useMemo, useRef, useState } from "react"
import type {
  BaseFieldInfo,
  BaseRowMutationResult,
  BaseSnapshot,
} from "@eidos.space/base"
import {
  ArrowUpRight,
  CircleDot,
  LoaderCircle,
  RotateCcw,
  Search,
} from "lucide-react"

import { useI18n } from "../i18n"
import { BaseWorkerClient } from "../runtime/worker-client"
import { loadSampleBaseFile } from "../sample-base"
import { BaseGrid } from "./base-grid"

interface LiveBaseDemoProps {
  onOpenFullEditor: () => void
}

type DemoPhase = "loading" | "ready" | "error"

function updateRowCount(
  snapshot: BaseSnapshot,
  result: BaseRowMutationResult
): BaseSnapshot {
  return {
    ...snapshot,
    tables: snapshot.tables.map((table) =>
      table.table.id === result.tableId
        ? { ...table, rowCount: result.rowCount }
        : table
    ),
  }
}

export function LiveBaseDemo({ onOpenFullEditor }: LiveBaseDemoProps) {
  const { t } = useI18n()
  const clientRef = useRef<BaseWorkerClient | null>(null)
  const [generation, setGeneration] = useState(0)
  const [phase, setPhase] = useState<DemoPhase>("loading")
  const [snapshot, setSnapshot] = useState<BaseSnapshot | null>(null)
  const [search, setSearch] = useState("")
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const client = new BaseWorkerClient()
    clientRef.current = client
    setPhase("loading")
    setSnapshot(null)
    setSearch("")
    setDirty(false)
    setMessage(null)

    void loadSampleBaseFile()
      .then(async (file) => {
        const result = await client.openSource(
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
  }, [generation])

  const table = snapshot?.tables[0] ?? null
  const gridView = useMemo(
    () => table?.views.find((view) => view.type === "grid"),
    [table]
  )

  const markMutation = (result: BaseRowMutationResult) => {
    setSnapshot((current) =>
      current ? updateRowCount(current, result) : current
    )
    setDirty(true)
    setMessage(null)
  }

  const explainProperty = (field: BaseFieldInfo) => {
    setMessage(t("demoProperty", { field: field.name }))
  }

  return (
    <section
      className="landing-section live-demo-section"
      id="live-demo"
      aria-labelledby="live-demo-title"
    >
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

      <div className="live-demo-frame">
        <div className="live-demo-toolbar">
          <div className="live-demo-state" aria-live="polite">
            {phase === "loading" ? (
              <LoaderCircle className="spin" size={14} aria-hidden="true" />
            ) : (
              <CircleDot size={14} aria-hidden="true" />
            )}
            <span>
              {phase === "loading"
                ? t("demoLoading")
                : dirty
                  ? t("demoChanged")
                  : t("demoLive")}
            </span>
          </div>
          <label className="search-field live-demo-search">
            <Search size={14} aria-hidden="true" />
            <span className="visually-hidden">Search live demo records</span>
            <input
              value={search}
              placeholder={t("demoSearch")}
              disabled={phase !== "ready"}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            className="text-button"
            type="button"
            disabled={phase === "loading"}
            onClick={() => setGeneration((current) => current + 1)}
          >
            <RotateCcw size={13} aria-hidden="true" />
            {t("demoReset")}
          </button>
        </div>

        <div className="live-demo-grid">
          {phase === "ready" && table && clientRef.current ? (
            <BaseGrid
              source={clientRef.current}
              table={table}
              view={gridView}
              search={search}
              onMutation={markMutation}
              onFieldOpen={explainProperty}
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
        <footer className="live-demo-note">
          <span>{message ?? t("demoTemporary")}</span>
          <span>{t("workerIsolated")}</span>
        </footer>
      </div>
    </section>
  )
}
