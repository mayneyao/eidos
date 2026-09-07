import { useEffect, useRef, useState } from "react"
import type { TextSearchHit, TextSearchProgress } from "../shared/text-search"
import { useEidosLiteI18n } from "./i18n"
import { SearchHighlight } from "./search-highlight"

export function WorkspaceTextSearch({
  onOpen,
  onClose,
  query,
  hidden = false,
}: {
  onOpen(hit: TextSearchHit): Promise<void>
  onClose(): void
  query: string
  hidden?: boolean
}) {
  const { t } = useEidosLiteI18n()
  const [progress, setProgress] = useState<TextSearchProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [generation, setGeneration] = useState(0)
  const active = useRef<string | null>(null)
  const pendingTimer = useRef<number | null>(null)
  useEffect(() => {
    setProgress(null)
    setError(null)
    if (!query) return
    const id = crypto.randomUUID()
    active.current = id
    const accept = (next: TextSearchProgress) => {
      if (active.current === next.requestId) setProgress(next)
    }
    const unsubscribe = window.eidosLite.onTextSearchProgress(accept)
    const timer = window.setTimeout(() => {
      pendingTimer.current = null
      void window.eidosLite
        .searchSpaceText(id, query)
        .then(accept)
        .catch((cause) => {
          if (active.current === id) setError(String(cause))
        })
    }, 200)
    pendingTimer.current = timer
    return () => {
      active.current = null
      window.clearTimeout(timer)
      unsubscribe()
      void window.eidosLite.cancelTextSearch(id).catch(() => undefined)
    }
  }, [query, generation])
  return (
    <section
      id="workspace-search-panel"
      role="region"
      hidden={hidden}
      className="workspace-text-search"
      aria-label={t("Search Space text")}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <details>
        <summary>{t("Search scope and limits")}</summary>
        <p>
          {t(
            "Saved Markdown and text files only. Unsaved drafts and Eidos tables are not searched."
          )}
        </p>
        <p>
          {t(
            "Skips symlinks, binaries, unsupported types, implementation and build folders. Up to 2 MB per file, 64 MB, 2,000 files, 10,000 entries, 10 seconds and 500 matches per search."
          )}
        </p>
      </details>
      {error ? (
        <p role="alert">{error}</p>
      ) : query ? (
        <p role="status">
          {progress?.done ? t("Search finished") : t("Searching…")}{" "}
          {progress
            ? t(
                "{matches} matches · {files} files · {skipped} skipped · {errors} errors",
                {
                  matches: progress.hits.length,
                  files: progress.scanned,
                  skipped: progress.skipped,
                  errors: progress.errors,
                }
              )
            : ""}
        </p>
      ) : null}
      {progress?.stopped === "limit" ? (
        <p role="status">
          {t(
            "Partial results: a search limit was reached. Use a more specific phrase."
          )}
        </p>
      ) : null}
      {query && !error && !progress?.done ? (
        <button
          onClick={() => {
            if (!active.current) return
            if (pendingTimer.current !== null) {
              window.clearTimeout(pendingTimer.current)
              pendingTimer.current = null
              setProgress({
                requestId: active.current,
                hits: [],
                scanned: 0,
                skipped: 0,
                errors: 0,
                done: true,
                stopped: "cancelled",
              })
            } else
              void window.eidosLite
                .cancelTextSearch(active.current)
                .catch((cause) => setError(String(cause)))
          }}
        >
          {t("Stop search")}
        </button>
      ) : null}
      {query && (progress?.done || error) ? (
        <button onClick={() => setGeneration((value) => value + 1)}>
          {t("Search again")}
        </button>
      ) : null}
      {progress?.stopped === "cancelled" ? (
        <p role="status">{t("Search stopped. Results are partial.")}</p>
      ) : null}
      {progress?.done && progress.hits.length === 0 ? (
        <p>{t("No text matches in the scanned files.")}</p>
      ) : null}
      <ol className="workspace-search-results">
        {progress?.hits.map((hit) => (
          <li key={`${hit.relativePath}:${hit.start}`}>
            <button
              disabled={opening}
              title={`${hit.relativePath}:${hit.line}:${hit.column}`}
              onClick={() => {
                setOpening(true)
                void onOpen(hit)
                  .catch((cause) => setError(String(cause)))
                  .finally(() => setOpening(false))
              }}
            >
              <strong>{hit.relativePath}</strong>
              <span>
                {hit.line}:{hit.column}
              </span>
              <pre>
                <SearchHighlight text={hit.snippet} query={hit.query} />
              </pre>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
