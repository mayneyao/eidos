import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ChevronRight, LoaderCircle } from "lucide-react"
import type { SpaceTreeEntry } from "../shared/contracts"
import {
  groupExplorerFiles,
  explorerGroupDateLabel,
  explorerRecentCutoff,
  type ModifiedFileGroup,
} from "./explorer-layout"
import type { ExplorerSort } from "./explorer-sort"
import { useEidosLiteI18n } from "./i18n"
import {
  ALL_EXPLORER_FILES,
  type ExplorerFileFilter,
} from "./explorer-file-filter"
import { useExplorerRecentFiles } from "./use-explorer-recent-files"
import { canSummarizeFile } from "./explorer-card-summary"
import { useExplorerCardSummary } from "./use-explorer-card-summary"
import { setSpacePathDragData } from "./space-path-drag"
import type { SpaceTreeRenameRequest } from "./space-file-tree"

interface Props {
  spaceId: string
  directory?: string | null
  fileFilter?: ExplorerFileFilter
  changes?: readonly string[]
  entries: SpaceTreeEntry[]
  sort: ExplorerSort
  visible: boolean
  activePath: string | null
  revealToken: number
  disabled: boolean
  openingPath?: string | null
  loading: boolean
  error?: string
  hasFilter: boolean
  renameRequest: SpaceTreeRenameRequest | null
  onRetry(): void
  onClearFilter(): void
  onShowTree(): void
  onSelect(entry: SpaceTreeEntry | null): void
  onOpen(entry: SpaceTreeEntry): void
  onRename(entry: SpaceTreeEntry, name: string): Promise<void>
  onRenameError(error: unknown): void
  onContextMenu(
    entry: SpaceTreeEntry,
    x: number,
    y: number,
    entries: SpaceTreeEntry[]
  ): void
}
type CardRow = {
  key: string
  group: ModifiedFileGroup
  entry?: SpaceTreeEntry
  loadMore?: boolean
}
function useLocalCalendar() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    )
    const timer = window.setTimeout(
      () => setNow(new Date()),
      Math.max(1, midnight.getTime() - Date.now() + 20)
    )
    const refresh = () => setNow(new Date())
    window.addEventListener("focus", refresh)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("focus", refresh)
    }
  }, [now])
  return now
}
function CardContent({
  entry,
  spaceId,
  visible,
  locale,
  includeDate,
}: {
  entry: SpaceTreeEntry
  spaceId: string
  visible: boolean
  locale: string
  includeDate: boolean
}) {
  const summary = useExplorerCardSummary(spaceId, entry, visible)
  const parent = entry.relativePath.split("/").slice(0, -1).join("/")
  const modifiedAt = Number.isFinite(entry.modifiedAtMs)
    ? new Date(entry.modifiedAtMs)
    : null
  return (
    <>
      <span className="explorer-card-title">
        <strong>{entry.name}</strong>
        {parent && (
          <span className="explorer-card-location" title={parent}>
            {parent}
          </span>
        )}
        {modifiedAt && (
          <time
            dateTime={modifiedAt.toISOString()}
            title={modifiedAt.toLocaleString(locale)}
          >
            {new Intl.DateTimeFormat(
              locale,
              includeDate
                ? {
                    month: "numeric",
                    day: "numeric",
                    ...(modifiedAt.getFullYear() !== new Date().getFullYear()
                      ? { year: "numeric" }
                      : {}),
                  }
                : { hour: "2-digit", minute: "2-digit" }
            ).format(modifiedAt)}
          </time>
        )}
      </span>
      {summary && <span className="explorer-card-summary">{summary}</span>}
    </>
  )
}
export function SpaceFileGroups(props: Props) {
  const { t, locale } = useEidosLiteI18n()
  const now = useLocalCalendar()
  const entriesSignature = JSON.stringify(
    props.entries,
    (key, value: unknown) =>
      key === "ignored" || key === "childrenLoaded" ? undefined : value
  )
  const refreshKey = useMemo(
    () => ({ entriesSignature, changes: props.changes }),
    [entriesSignature, props.changes]
  )
  const interactionBlocked = props.disabled || props.openingPath != null
  const recent = useExplorerRecentFiles({
    spaceId: props.spaceId,
    directory: props.directory ?? null,
    filter: props.fileFilter ?? ALL_EXPLORER_FILES,
    sort: props.sort,
    sinceMs: explorerRecentCutoff(now),
    visible: props.visible,
    refreshKey,
  })
  const groups = useMemo(
    () => groupExplorerFiles(recent.entries, props.sort, now),
    [recent.entries, props.sort, now]
  )
  const rows = useMemo<CardRow[]>(() => {
    const result: CardRow[] = groups.flatMap((group) => [
      { key: "group:" + group.id, group },
      ...group.files.map((entry) => ({
        key: "file:" + entry.relativePath,
        group,
        entry,
      })),
    ])
    if (recent.earlierCount) {
      const group: ModifiedFileGroup = {
        id: "earlier",
        label: "Earlier",
        files: recent.earlier,
      }
      result.push({ key: "group:earlier", group })
      if (recent.expanded) {
        result.push(
          ...recent.earlier.map((entry) => ({
            key: "file:" + entry.relativePath,
            group,
            entry,
          }))
        )
        if (recent.hasMore || recent.loadingMore)
          result.push({ key: "load-more", group, loadMore: true })
      }
    }
    return result
  }, [
    groups,
    recent.earlier,
    recent.earlierCount,
    recent.expanded,
    recent.hasMore,
    recent.loadingMore,
  ])
  const files = useMemo(
    () => rows.flatMap((row) => (row.entry ? [row.entry] : [])),
    [rows]
  )
  const [selected, setSelected] = useState<string[]>([])
  const [progress, setProgress] = useState(false)
  const [editing, setEditing] = useState<{
    entry: SpaceTreeEntry
    name: string
  } | null>(null)
  const editingRef = useRef(editing)
  editingRef.current = editing
  const renaming = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const anchor = useRef<string | null>(null)
  const [pendingReveal, setPendingReveal] = useState<string | null>(null)
  const [focusPath, setFocusPath] = useState<string | null>(null)
  const lastRename = useRef<number | null>(null)
  const revealed = useRef({ path: null as string | null, token: -1 })
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroll.current,
    getItemKey: (index) => rows[index]!.key,
    estimateSize: (index) =>
      rows[index]!.loadMore
        ? 32
        : rows[index]!.entry
          ? canSummarizeFile(rows[index]!.entry!.name)
            ? 67
            : 31
          : index === 0
            ? 28
            : 40,
    overscan: 5,
  })
  const virtualRows = virtualizer.getVirtualItems()
  useEffect(() => {
    setSelected(props.activePath ? [props.activePath] : [])
  }, [props.activePath])
  useEffect(() => {
    if (!props.visible || !props.activePath) return
    if (
      revealed.current.path === props.activePath &&
      revealed.current.token === props.revealToken
    )
      return
    if (!files.some((entry) => entry.relativePath === props.activePath)) return
    revealed.current = { path: props.activePath, token: props.revealToken }
    setPendingReveal(props.activePath)
  }, [props.visible, props.activePath, props.revealToken, files])
  useEffect(() => {
    if (
      !props.visible ||
      !props.renameRequest ||
      lastRename.current === props.renameRequest.nonce
    )
      return
    const entry = files.find(
      (file) => file.relativePath === props.renameRequest!.treePath
    )
    if (!entry) return
    lastRename.current = props.renameRequest.nonce
    setEditing({ entry, name: entry.name })
    setPendingReveal(entry.relativePath)
  }, [props.renameRequest, props.visible, files])
  useLayoutEffect(() => {
    if (!props.visible || !pendingReveal) return
    const index = rows.findIndex(
      (row) => row.entry?.relativePath === pendingReveal
    )
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: "auto" })
      setPendingReveal(null)
    }
  }, [pendingReveal, rows, virtualizer, props.visible])
  useLayoutEffect(() => {
    if (editing && input.current && document.activeElement !== input.current) {
      input.current.focus({ preventScroll: true })
      input.current.select()
    }
  }, [editing?.entry.relativePath, virtualRows])
  useLayoutEffect(() => {
    if (!focusPath || !props.visible) return
    const row = [
      ...(scroll.current?.querySelectorAll<HTMLButtonElement>(
        ".explorer-card-open"
      ) ?? []),
    ].find((node) => node.dataset.path === focusPath)
    if (row) {
      row.focus({ preventScroll: true })
      setFocusPath(null)
    }
  }, [focusPath, virtualRows, props.visible])
  useEffect(() => {
    if (!recent.loading || !props.visible) {
      setProgress(false)
      return
    }
    const timer = window.setTimeout(() => setProgress(true), 200)
    return () => window.clearTimeout(timer)
  }, [recent.loading, props.visible])
  const commitRename = async () => {
    const current = editingRef.current
    if (!current || renaming.current) return
    renaming.current = true
    try {
      if (current.name !== current.entry.name)
        await props.onRename(current.entry, current.name)
      editingRef.current = null
      setEditing(null)
    } catch (cause) {
      props.onRenameError(cause)
    } finally {
      renaming.current = false
    }
  }
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement || interactionBlocked) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault()
      setSelected(files.map((file) => file.relativePath))
      props.onSelect(files.length === 1 ? files[0]! : null)
      return
    }
    if (event.altKey || event.metaKey || event.ctrlKey) return
    if (event.key === "F2") {
      const path = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-card-path]"
      )?.dataset.cardPath
      const entry = files.find((file) => file.relativePath === path)
      if (entry) {
        event.preventDefault()
        setEditing({ entry, name: entry.name })
      }
      return
    }
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return
    const path = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-card-path]"
    )?.dataset.cardPath
    const index = files.findIndex((file) => file.relativePath === path)
    if (index < 0) return
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? files.length - 1
          : Math.max(
              0,
              Math.min(
                files.length - 1,
                index + (event.key === "ArrowDown" ? 1 : -1)
              )
            )
    event.preventDefault()
    const target = files[next]!.relativePath
    setPendingReveal(target)
    setFocusPath(target)
  }
  return (
    <div
      className="space-file-groups explorer-cards"
      data-explorer-layout="modified"
    >
      {recent.error && (
        <div className="explorer-grouped-notice" role="alert">
          {t("Could not load files.")}{" "}
          <button type="button" className="quiet-button" onClick={recent.retry}>
            {t("Retry")}
          </button>
        </div>
      )}
      {!recent.loading &&
        !recent.error &&
        !groups.length &&
        !recent.earlierCount && (
          <div className="explorer-grouped-notice" role="status">
            {t(props.hasFilter ? "No matching files" : "No files")}{" "}
            <button
              type="button"
              className="quiet-button"
              onClick={props.hasFilter ? props.onClearFilter : props.onShowTree}
            >
              {t(props.hasFilter ? "Clear filters" : "Browse folders")}
            </button>
          </div>
        )}
      <div
        ref={scroll}
        className="explorer-card-scroll"
        aria-label={t("Recent files")}
        onKeyDown={keyDown}
      >
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualRows.map((item) => {
            const row = rows[item.index]!
            const entry = row.entry
            if (row.loadMore)
              return (
                <div
                  key={row.key}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className="explorer-card-position"
                  style={{ transform: "translateY(" + item.start + "px)" }}
                >
                  <button
                    type="button"
                    className="quiet-button explorer-load-more"
                    disabled={recent.loadingMore}
                    onClick={recent.loadMore}
                  >
                    {recent.loadingMore && (
                      <LoaderCircle className="spin" aria-hidden="true" />
                    )}
                    {t(
                      recent.loadingMore ? "Reading files…" : "Load more files"
                    )}
                  </button>
                </div>
              )
            if (!entry)
              return (
                <div
                  key={row.key}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className="explorer-card-position explorer-card-group"
                  data-first-group={item.index === 0 || undefined}
                  style={{ transform: "translateY(" + item.start + "px)" }}
                >
                  <h3>
                    {row.group.id === "earlier" ? (
                      <button
                        type="button"
                        className="explorer-earlier-toggle"
                        aria-expanded={recent.expanded}
                        onClick={() => recent.setExpanded(!recent.expanded)}
                      >
                        <ChevronRight aria-hidden="true" />
                        {t("Earlier")}
                      </button>
                    ) : row.group.label === "Date" ? (
                      explorerGroupDateLabel(row.group, now, locale)
                    ) : (
                      t(row.group.label)
                    )}
                  </h3>
                </div>
              )
            const isSelected = selected.includes(entry.relativePath)
            return (
              <div
                key={row.key}
                ref={virtualizer.measureElement}
                data-index={item.index}
                className="explorer-card-position"
                style={{ transform: "translateY(" + item.start + "px)" }}
              >
                <div
                  className="explorer-file-card"
                  data-card-path={entry.relativePath}
                  data-selected={isSelected || undefined}
                  data-active={
                    entry.relativePath === props.activePath || undefined
                  }
                  onContextMenu={(event) => {
                    event.preventDefault()
                    if (interactionBlocked) return
                    if (!isSelected) setSelected([entry.relativePath])
                    const selection = isSelected
                      ? files.filter((file) =>
                          selected.includes(file.relativePath)
                        )
                      : [entry]
                    props.onSelect(selection.length === 1 ? entry : null)
                    props.onContextMenu(
                      entry,
                      event.clientX,
                      event.clientY,
                      selection
                    )
                  }}
                >
                  <button
                    type="button"
                    className="explorer-card-open"
                    data-path={entry.relativePath}
                    disabled={props.disabled}
                    aria-disabled={interactionBlocked || undefined}
                    aria-current={
                      entry.relativePath === props.activePath
                        ? "page"
                        : undefined
                    }
                    title={entry.relativePath}
                    draggable={!interactionBlocked}
                    onDragStart={(event) =>
                      setSpacePathDragData(
                        event.dataTransfer,
                        entry.relativePath,
                        isSelected ? selected : [entry.relativePath]
                      )
                    }
                    onClick={(event) => {
                      if (interactionBlocked) return
                      if (event.shiftKey || event.metaKey || event.ctrlKey) {
                        let next = isSelected
                          ? selected.filter(
                              (path) => path !== entry.relativePath
                            )
                          : [...selected, entry.relativePath]
                        if (event.shiftKey && anchor.current) {
                          const start = files.findIndex(
                            (file) => file.relativePath === anchor.current
                          )
                          const end = files.indexOf(entry)
                          if (start >= 0)
                            next = files
                              .slice(
                                Math.min(start, end),
                                Math.max(start, end) + 1
                              )
                              .map((file) => file.relativePath)
                        }
                        setSelected(next)
                        props.onSelect(
                          next.length === 1
                            ? files.find(
                                (file) => file.relativePath === next[0]
                              )!
                            : null
                        )
                        return
                      }
                      anchor.current = entry.relativePath
                      setSelected([entry.relativePath])
                      props.onSelect(entry)
                      props.onOpen(entry)
                    }}
                  >
                    <CardContent
                      entry={entry}
                      spaceId={props.spaceId}
                      visible={props.visible}
                      locale={locale}
                      includeDate={row.group.id === "earlier"}
                    />
                  </button>
                  {editing?.entry.relativePath === entry.relativePath && (
                    <input
                      ref={input}
                      className="explorer-card-rename"
                      aria-label={t("Rename")}
                      value={editing.name}
                      onChange={(event) =>
                        setEditing({ entry, name: event.target.value })
                      }
                      onBlur={() => void commitRename()}
                      onKeyDown={(event) => {
                        if (event.nativeEvent.isComposing) return
                        if (event.key === "Enter") {
                          event.preventDefault()
                          void commitRename()
                        }
                        if (event.key === "Escape") {
                          event.preventDefault()
                          event.stopPropagation()
                          editingRef.current = null
                          setEditing(null)
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {progress && recent.loading && props.visible && (
        <div className="explorer-grouped-progress" role="status">
          <LoaderCircle className="spin" />
          {t("Reading files…")}
        </div>
      )}
    </div>
  )
}
