import { useEffect, useMemo, useRef, useState } from "react"

import { Database, FileText, LoaderCircle, Table2 } from "lucide-react"

import type { SpacePathSearchHit, SpaceTreeEntry } from "../shared/contracts"
import type { RecentFileEntry } from "./recent-files"

export type QuickOpenSelection = Pick<
  SpaceTreeEntry,
  "kind" | "name" | "relativePath"
>

export interface QuickOpenTableSource {
  relativePath: string
  tables: { tableId: string; name: string }[]
}

const QUICK_OPEN_DEBOUNCE_MS = 80
const QUICK_OPEN_RESULT_LIMIT = 50

interface QuickOpenItem {
  relativePath: string
  name: string
  kind: SpacePathSearchHit["kind"]
  tableId?: string
}

export function quickOpenItemToSelection(
  item: QuickOpenItem
): QuickOpenSelection {
  return {
    kind: item.kind,
    name: item.name,
    relativePath: item.relativePath,
  }
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
  onOpen,
  onOpenTable,
  onClose,
}: {
  recentFiles: RecentFileEntry[]
  activeTableSource?: QuickOpenTableSource | null
  onOpen(selection: QuickOpenSelection): void
  onOpenTable?(tableId: string): void
  onClose(): void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<QuickOpenItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const requestIdRef = useRef(0)

  const tableItems = useMemo<QuickOpenItem[]>(
    () =>
      filterQuickOpenTables(activeTableSource?.tables ?? [], query).map(
        (table) => ({
          relativePath: activeTableSource?.relativePath ?? "",
          name: table.name,
          kind: "eidos" as const,
          tableId: table.tableId,
        })
      ),
    [activeTableSource, query]
  )

  const recentItems = useMemo<QuickOpenItem[]>(
    () =>
      recentFiles.map((file) => ({
        relativePath: file.relativePath,
        name: file.name,
        kind: file.kind,
      })),
    [recentFiles]
  )

  const trimmedQuery = query.trim()
  const items = trimmedQuery
    ? [...tableItems, ...results]
    : [...tableItems, ...recentItems]

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setSelectedIndex(0)
  }, [trimmedQuery])

  useEffect(() => {
    if (!trimmedQuery) {
      setResults([])
      setLoading(false)
      return
    }
    const requestId = ++requestIdRef.current
    setLoading(true)
    const timer = setTimeout(() => {
      window.eidosLite
        .searchSpacePaths(trimmedQuery, QUICK_OPEN_RESULT_LIMIT)
        .then((hits) => {
          if (requestIdRef.current !== requestId) return
          setResults(
            hits.map((hit) => ({
              relativePath: hit.relativePath,
              name: hit.name,
              kind: hit.kind,
            }))
          )
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return
          setResults([])
        })
        .finally(() => {
          if (requestIdRef.current !== requestId) return
          setLoading(false)
        })
    }, QUICK_OPEN_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [trimmedQuery])

  const pick = (item: QuickOpenItem | undefined) => {
    if (!item) return
    if (item.tableId) {
      onOpenTable?.(item.tableId)
      return
    }
    onOpen(quickOpenItemToSelection(item))
  }

  return (
    <div
      className="quick-open-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="quick-open-panel" role="dialog" aria-label="Quick Open">
        <div className="quick-open-input-row">
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Search files by name"
            aria-label="Search files by name"
            role="combobox"
            aria-expanded="true"
            aria-controls="quick-open-results"
            aria-activedescendant={
              items[selectedIndex]
                ? `quick-open-item-${selectedIndex}`
                : undefined
            }
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setSelectedIndex((current) =>
                  items.length ? (current + 1) % items.length : 0
                )
              } else if (event.key === "ArrowUp") {
                event.preventDefault()
                setSelectedIndex((current) =>
                  items.length ? (current - 1 + items.length) % items.length : 0
                )
              } else if (event.key === "Enter") {
                event.preventDefault()
                pick(items[selectedIndex])
              } else if (event.key === "Escape") {
                event.preventDefault()
                onClose()
              }
            }}
          />
          {loading ? (
            <LoaderCircle className="spin" aria-hidden="true" />
          ) : null}
        </div>
        <ul
          className="quick-open-results"
          id="quick-open-results"
          role="listbox"
          aria-label={trimmedQuery ? "Matching files" : "Recent files"}
        >
          {items.length === 0 && !loading ? (
            <li className="quick-open-empty" role="presentation">
              {trimmedQuery ? "No matching files" : "No recent files"}
            </li>
          ) : (
            items.map((item, index) => {
              const directory = item.tableId
                ? item.relativePath
                : item.relativePath.slice(
                    0,
                    item.relativePath.length - item.name.length
                  )
              const fileGroupStart = tableItems.length
              const groupLabel =
                tableItems.length > 0 && index === 0
                  ? "Tables"
                  : tableItems.length > 0 && index === fileGroupStart
                    ? trimmedQuery
                      ? "Files"
                      : "Recent files"
                    : null
              return (
                <li
                  key={item.tableId ?? item.relativePath}
                  role="presentation"
                  className={groupLabel ? "quick-open-group-start" : undefined}
                >
                  {groupLabel ? (
                    <div className="quick-open-group-label" aria-hidden="true">
                      {groupLabel}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    id={`quick-open-item-${index}`}
                    role="option"
                    aria-selected={index === selectedIndex}
                    className="quick-open-item"
                    data-selected={index === selectedIndex ? "true" : undefined}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => pick(item)}
                  >
                    {item.tableId ? (
                      <Table2 aria-hidden="true" />
                    ) : item.kind === "eidos" ? (
                      <Database aria-hidden="true" />
                    ) : (
                      <FileText aria-hidden="true" />
                    )}
                    <span className="quick-open-item-name">{item.name}</span>
                    {directory ? (
                      <span className="quick-open-item-dir">{directory}</span>
                    ) : null}
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </div>
  )
}
