import { useEffect, useRef, useState } from "react"
import type {
  TextSearchHit,
  TextSearchProgress,
  TextSearchOptions,
} from "../shared/text-search"
import { useEidosLiteI18n } from "./i18n"
import { WorkspaceSearchResults } from "./workspace-search-results"

export function WorkspaceTextSearch({
  onOpen,
  onClose,
  query,
  hidden = false,
  options,
}: {
  onOpen(hit: TextSearchHit): Promise<void>
  onClose(): void
  query: string
  hidden?: boolean
  options?: TextSearchOptions
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
    if (options?.regex) {
      try {
        new RegExp(query, options.caseSensitive ? "gu" : "giu")
      } catch {
        setError(t("Invalid regular expression."))
        return
      }
    }
    const id = crypto.randomUUID()
    active.current = id
    const accept = (next: TextSearchProgress) => {
      if (active.current === next.requestId) setProgress(next)
    }
    const unsubscribe = window.eidosLite.onTextSearchProgress(accept)
    const timer = window.setTimeout(() => {
      pendingTimer.current = null
      void window.eidosLite
        .searchSpaceText(id, query, options)
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
  }, [query, generation, options])
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
            "Whole word treats consecutive Unicode letters, numbers, marks and underscores as one word, including Chinese text. Regular expressions use JavaScript syntax; empty matches are ignored."
          )}
        </p>
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
      {progress && (progress.skipped > 0 || progress.errors > 0) ? (
        <p>
          {t("{scanned} scanned · {skipped} skipped · {errors} errors", {
            scanned: progress.scanned,
            skipped: progress.skipped,
            errors: progress.errors,
          })}
        </p>
      ) : null}
      {error ? (
        <p role="alert">{error}</p>
      ) : query ? (
        <p role="status">
          {progress?.done ? t("Search finished") : t("Searching…")}{" "}
          {progress
            ? t("{matches} matches in {files} files", {
                matches: progress.hits.length,
                files: new Set(progress.hits.map((hit) => hit.relativePath))
                  .size,
              })
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
      <WorkspaceSearchResults
        hits={progress?.hits ?? []}
        query={query}
        opening={opening}
        onOpen={async (hit) => {
          setOpening(true)
          try {
            await onOpen(hit)
          } catch (cause) {
            setError(String(cause))
          } finally {
            setOpening(false)
          }
        }}
      />
    </section>
  )
}
