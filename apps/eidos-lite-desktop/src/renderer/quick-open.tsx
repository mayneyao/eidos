import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Database, FileText, Folder, Search, Table2, X } from "lucide-react"

import type { SpacePathSearchHit, SpaceTreeEntry } from "../shared/contracts"
import type { TextSearchHit, TextSearchOptions } from "../shared/text-search"
import type { RecentFileEntry } from "./recent-files"
import { useEidosLiteI18n } from "./i18n"
import { SearchHighlight } from "./search-highlight"
import { useQuickOpenSearch, type QuickOpenMode } from "./use-quick-open-search"
export type { QuickOpenMode } from "./use-quick-open-search"

export type QuickOpenSelection = Pick<
  SpaceTreeEntry,
  "kind" | "name" | "relativePath"
>
export interface QuickOpenTableSource {
  relativePath: string
  tables: { tableId: string; name: string }[]
}
interface QuickOpenItem {
  relativePath: string
  name: string
  kind: SpacePathSearchHit["kind"]
  tableId?: string
  hit?: TextSearchHit
}
export function quickOpenItemToSelection(
  item: QuickOpenItem
): QuickOpenSelection {
  return { kind: item.kind, name: item.name, relativePath: item.relativePath }
}
export function filterQuickOpenTables(
  tables: QuickOpenTableSource["tables"],
  query: string
): QuickOpenTableSource["tables"] {
  const needle = query.trim().toLowerCase()
  if (!needle) return tables
  return tables.filter((table) => {
    const name = table.name.toLowerCase()
    let cursor = 0
    for (const character of needle) {
      const index = name.indexOf(character, cursor)
      if (index === -1) return false
      cursor = index + 1
    }
    return true
  })
}

export function QuickOpen({
  recentFiles,
  activeTableSource,
  mode: requestedMode,
  onModeChange,
  onOpen,
  onOpenTable,
  onOpenText,
  onClose,
}: {
  recentFiles: RecentFileEntry[]
  activeTableSource?: QuickOpenTableSource | null
  mode?: QuickOpenMode
  onModeChange?(mode: QuickOpenMode): void
  onOpen(selection: QuickOpenSelection): void
  onOpenTable?(tableId: string): void
  onOpenText?(hit: TextSearchHit, signal?: AbortSignal): Promise<void>
  onClose(): void
}) {
  const { t } = useEidosLiteI18n()
  const [localMode, setLocalMode] = useState<QuickOpenMode>("name")
  const mode = requestedMode ?? localMode
  const [query, setQuery] = useState("")
  const [options, setOptions] = useState<TextSearchOptions>({})
  const [composing, setComposing] = useState(false)
  const composingRef = useRef(false)
  const [generation, setGeneration] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [opening, setOpening] = useState(false)
  const openingRef = useRef(false)
  const openingControllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const revealSelectionRef = useRef(true)
  const trimmedQuery = mode === "text" ? query : query.trim()
  let invalidRegex = false
  if (mode === "text" && options.regex && trimmedQuery) {
    try {
      new RegExp(trimmedQuery, options.caseSensitive ? "gu" : "giu")
    } catch {
      invalidRegex = true
    }
  }
  const search = useQuickOpenSearch(
    invalidRegex ? "" : trimmedQuery,
    mode,
    options,
    composing,
    generation
  )
  const error =
    openError ??
    (invalidRegex ? t("Invalid regular expression.") : search.error)
  const tableItems = useMemo<QuickOpenItem[]>(
    () =>
      mode === "name"
        ? filterQuickOpenTables(activeTableSource?.tables ?? [], query).map(
            (table) => ({
              relativePath: activeTableSource?.relativePath ?? "",
              name: table.name,
              kind: "eidos",
              tableId: table.tableId,
            })
          )
        : [],
    [activeTableSource, query, mode]
  )
  const items: QuickOpenItem[] =
    mode === "text"
      ? (search.progress?.hits ?? []).map((hit) => ({
          relativePath: hit.relativePath,
          name: hit.relativePath.split("/").at(-1)!,
          kind: "file",
          hit,
        }))
      : [...tableItems, ...(trimmedQuery ? search.paths : recentFiles)]
  const selectedItem = items[selectedIndex]

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement
    mountedRef.current = true
    // The modal top layer prevents background editors from reclaiming focus.
    dialog.showModal()
    inputRef.current?.focus({ preventScroll: true })
    return () => {
      mountedRef.current = false
      openingControllerRef.current?.abort()
      dialog.close()
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true })
    }
  }, [])
  useLayoutEffect(() => {
    if (!revealSelectionRef.current) return
    dialogRef.current
      ?.querySelector<HTMLElement>('[data-selected="true"]')
      ?.scrollIntoView?.({
        block: "nearest",
        inline: "nearest",
        behavior: "instant",
      })
  }, [
    selectedIndex,
    selectedItem?.relativePath,
    selectedItem?.tableId,
    selectedItem?.hit?.start,
  ])
  useLayoutEffect(() => {
    setSelectedIndex(0)
    setOpenError(null)
    revealSelectionRef.current = true
    inputRef.current?.focus({ preventScroll: true })
  }, [mode, trimmedQuery, options, generation])
  useEffect(() => {
    if (selectedIndex >= items.length) setSelectedIndex(0)
  }, [items.length, selectedIndex])
  const pick = (item: QuickOpenItem | undefined) => {
    if (!item || openingRef.current || composingRef.current) return
    if (item.hit && onOpenText) {
      openingRef.current = true
      setOpening(true)
      setOpenError(null)
      const controller = new AbortController()
      openingControllerRef.current = controller
      void onOpenText(item.hit, controller.signal)
        .then(() => {
          if (mountedRef.current) onClose()
        })
        .catch((cause: unknown) => {
          if (mountedRef.current)
            setOpenError(cause instanceof Error ? cause.message : String(cause))
        })
        .finally(() => {
          openingRef.current = false
          if (mountedRef.current) setOpening(false)
        })
    } else if (item.tableId) onOpenTable?.(item.tableId)
    else onOpen(quickOpenItemToSelection(item))
  }
  const changeMode = (next: QuickOpenMode) => {
    setLocalMode(next)
    onModeChange?.(next)
    inputRef.current?.focus({ preventScroll: true })
  }
  const placeholder =
    mode === "name" ? t("Search files by name") : t("Search saved text")
  return (
    <dialog
      ref={dialogRef}
      className="quick-open-backdrop"
      aria-label={t("Quick Open")}
      onCancel={(event) => {
        event.preventDefault()
        if (!composingRef.current) onClose()
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="quick-open-panel quick-open-search-panel">
        <div
          className="quick-open-input-row"
          data-loading={
            (search.loading && search.showProgress) || opening || undefined
          }
          aria-busy={search.loading || opening}
        >
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            maxLength={512}
            disabled={opening}
            placeholder={placeholder}
            aria-label={placeholder}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-busy={search.loading || opening}
            aria-controls="quick-open-results"
            aria-activedescendant={
              selectedItem ? `quick-open-item-${selectedIndex}` : undefined
            }
            onChange={(event) => {
              revealSelectionRef.current = true
              setSelectedIndex(0)
              setQuery(event.target.value)
            }}
            onCompositionStart={() => {
              composingRef.current = true
              setComposing(true)
            }}
            onCompositionEnd={() => {
              composingRef.current = false
              setComposing(false)
            }}
            onKeyDown={(event) => {
              if (
                event.nativeEvent.isComposing ||
                composingRef.current ||
                event.keyCode === 229
              )
                return
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault()
                revealSelectionRef.current = true
                const delta = event.key === "ArrowDown" ? 1 : -1
                setSelectedIndex((current) =>
                  items.length
                    ? (current + delta + items.length) % items.length
                    : 0
                )
              } else if (event.key === "Enter") {
                event.preventDefault()
                pick(selectedItem)
              } else if (event.key === "Escape") {
                event.preventDefault()
                event.stopPropagation()
                onClose()
              }
            }}
          />
          {mode === "text" ? (
            <div className="workspace-search-modes">
              {(
                [
                  ["caseSensitive", "Aa", "Match case"],
                  ["wholeWord", "ab", "Match whole word"],
                  ["regex", ".*", "Use regular expression"],
                ] as const
              ).map(([key, label, title]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={t(title)}
                  title={t(title)}
                  aria-pressed={!!options[key]}
                  disabled={opening}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    setOptions((current) => ({
                      ...current,
                      [key]: !current[key],
                    }))
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          <button
            className="icon-button"
            type="button"
            aria-label={t("Close search")}
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <div className="quick-open-body" aria-busy={search.loading || opening}>
          {error ? (
            <div className="quick-open-error" role="alert">
              {error}
              <button
                type="button"
                className="quiet-button"
                onClick={() => {
                  setOpenError(null)
                  setGeneration((value) => value + 1)
                }}
              >
                {t("Search again")}
              </button>
            </div>
          ) : null}
          <ul
            className="quick-open-results"
            id="quick-open-results"
            role="listbox"
            aria-label={
              mode === "text"
                ? t("Search Space text")
                : trimmedQuery
                  ? t("Matching files")
                  : t("Recent files")
            }
          >
            {items.length === 0 ? (
              <li className="quick-open-empty" role="presentation">
                {!error
                  ? search.loading
                    ? null
                    : trimmedQuery
                      ? mode === "text"
                        ? t("No text matches in the scanned files.")
                        : t("No matching files")
                      : placeholder
                  : null}
              </li>
            ) : (
              items.map((item, index) => {
                const directory = item.tableId
                  ? item.relativePath
                  : item.relativePath.slice(
                      0,
                      item.relativePath.length - item.name.length
                    )
                const groupLabel =
                  mode === "name" && index === 0
                    ? tableItems.length
                      ? t("Tables")
                      : trimmedQuery
                        ? t("Files")
                        : t("Recent files")
                    : tableItems.length && index === tableItems.length
                      ? trimmedQuery
                        ? t("Files")
                        : t("Recent files")
                      : null
                return (
                  <li
                    key={
                      item.tableId ??
                      `${item.relativePath}:${item.hit?.start ?? ""}`
                    }
                    role="presentation"
                    className={
                      groupLabel ? "quick-open-group-start" : undefined
                    }
                  >
                    {groupLabel ? (
                      <div
                        className="quick-open-group-label"
                        aria-hidden="true"
                      >
                        {groupLabel}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      tabIndex={-1}
                      id={`quick-open-item-${index}`}
                      role="option"
                      aria-selected={index === selectedIndex}
                      aria-disabled={opening || undefined}
                      className={`quick-open-item${item.hit ? " quick-open-text-item" : ""}`}
                      title={
                        item.hit
                          ? `${item.relativePath}:${item.hit.line}:${item.hit.column}\n${item.hit.snippet}`
                          : item.relativePath
                      }
                      data-selected={
                        index === selectedIndex ? "true" : undefined
                      }
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseMove={(event) => {
                        if (!event.movementX && !event.movementY) return
                        revealSelectionRef.current = false
                        setSelectedIndex(index)
                      }}
                      onClick={() => pick(item)}
                    >
                      {item.tableId ? (
                        <Table2 aria-hidden="true" />
                      ) : item.kind === "directory" ? (
                        <Folder aria-hidden="true" />
                      ) : item.kind === "eidos" ? (
                        <Database aria-hidden="true" />
                      ) : (
                        <FileText aria-hidden="true" />
                      )}
                      {item.hit ? (
                        <>
                          <span className="quick-open-snippet">
                            <SearchHighlight
                              text={item.hit.snippet}
                              query={item.hit.query}
                              ranges={item.hit.highlightRanges}
                            />
                          </span>
                          <span className="quick-open-text-path">
                            {item.relativePath}:{item.hit.line}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="quick-open-item-name">
                            <SearchHighlight
                              text={item.name}
                              query={trimmedQuery}
                            />
                          </span>
                          {directory ? (
                            <span className="quick-open-item-dir">
                              {directory}
                            </span>
                          ) : null}
                        </>
                      )}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
          <div className="quick-open-status" role="status" aria-live="polite">
            {mode === "text" && search.progress && !search.loading
              ? search.progress.stopped === "limit"
                ? t(
                    "Partial results: a search limit was reached. Use a more specific phrase."
                  )
                : t("{matches} matches in {files} files", {
                    matches: search.progress.hits.length,
                    files: new Set(
                      search.progress.hits.map((hit) => hit.relativePath)
                    ).size,
                  })
              : null}
          </div>
        </div>
        <footer className="quick-open-footer">
          <div
            className="quick-open-modes"
            role="group"
            aria-label={t("Search mode")}
          >
            <button
              type="button"
              aria-pressed={mode === "name"}
              disabled={opening}
              onClick={() => changeMode("name")}
            >
              <Folder />
              {t("Files")}
            </button>
            <button
              type="button"
              aria-pressed={mode === "text"}
              disabled={opening}
              onClick={() => changeMode("text")}
            >
              <FileText />
              {t("Text")}
            </button>
          </div>
          {mode === "text" ? (
            <details className="quick-open-scope">
              <summary>{t("Search scope and limits")}</summary>
              <div>
                <p>
                  {t(
                    "Saved Markdown and text files only. Unsaved drafts and Eidos tables are not searched."
                  )}
                </p>
                <p>
                  {t(
                    "Whole word treats consecutive Unicode letters, numbers, marks and underscores as one word, including Chinese text. Regular expressions use JavaScript syntax; empty matches are ignored."
                  )}
                </p>
                <p>
                  {t(
                    "Skips symlinks, binaries, unsupported types, implementation and build folders. Up to 2 MB per file, 64 MB, 2,000 files, 10,000 entries, 10 seconds and 500 matches per search."
                  )}
                </p>
                {search.progress ? (
                  <p>
                    {t(
                      "{scanned} scanned · {skipped} skipped · {errors} errors",
                      {
                        scanned: search.progress.scanned,
                        skipped: search.progress.skipped,
                        errors: search.progress.errors,
                      }
                    )}
                  </p>
                ) : null}
              </div>
            </details>
          ) : null}
        </footer>
      </div>
    </dialog>
  )
}
