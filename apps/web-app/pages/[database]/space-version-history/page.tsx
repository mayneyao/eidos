import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  GitBranch,
  GitCommitHorizontal,
  History,
  LoaderCircle,
  RefreshCw,
  Search,
} from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"

import { cn } from "@/lib/utils"
import {
  useSpaceVersioning,
  type SpaceVersionCommit,
} from "@/apps/web-app/hooks/use-space-versioning"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useTabTitle } from "@/apps/web-app/hooks/use-tab-title"
import {
  CommitGraphCell,
  buildCommitGraphRows,
  commitGraphWidth,
} from "@/apps/web-app/components/file-space/versioning/commit-graph"
import { CommitInspector } from "@/apps/web-app/components/file-space/versioning/commit-inspector"
import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
import {
  formatAbsoluteVersionTime,
  formatVersionTime,
  shortCommitId,
} from "@/apps/web-app/components/file-space/versioning/versioning-utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

const HISTORY_ROW_HEIGHT = 48
const STACKED_LAYOUT_BREAKPOINT = 960

function commitMatches(commit: SpaceVersionCommit, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  return (
    commit.message.toLowerCase().includes(normalizedQuery) ||
    commit.id.toLowerCase().includes(normalizedQuery) ||
    commit.labels.some((label) =>
      label.toLowerCase().includes(normalizedQuery)
    ) ||
    commit.changedPaths.some((change) =>
      change.path.toLowerCase().includes(normalizedQuery)
    )
  )
}

function HistoryEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-8 text-center">
      <GitCommitHorizontal className="mb-3 h-5 w-5 text-muted-foreground/60" />
      <p className="text-sm font-medium text-foreground">
        {filtered ? "No matching versions" : "No versions yet"}
      </p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
        {filtered
          ? "Try a commit message, path, label, or hash."
          : "Create a version from the Version sidebar after changing files."}
      </p>
    </div>
  )
}

export function SpaceVersionHistoryPage() {
  useTabTitle("Version History")
  const { isActive } = useTabContext()
  const { currentSpace } = useCurrentSpace()
  const spaceId = currentSpace?.id
  const location = useLocation()
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [enableError, setEnableError] = useState<string | null>(null)
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null)
  const [stackedLayout, setStackedLayout] = useState(false)
  const pageRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const {
    status,
    history,
    historyHasMore,
    statusLoading,
    historyLoading,
    historyLoadingMore,
    operation,
    error,
    available,
    enable,
    getCommit,
    getDiff,
    restorePath,
    restoreVersion,
    refresh,
    loadMoreHistory,
  } = useSpaceVersioning(spaceId, {
    loadHistory: true,
    historyLimit: 250,
    active: isActive,
  })

  const requestedCommitId = useMemo(
    () => new URLSearchParams(location.search).get("commit"),
    [location.search]
  )
  const filteredHistory = useMemo(
    () => history.filter((commit) => commitMatches(commit, query)),
    [history, query]
  )
  const matchingCommitIds = useMemo(
    () => new Set(filteredHistory.map((commit) => commit.id)),
    [filteredHistory]
  )
  const allGraphRows = useMemo(() => buildCommitGraphRows(history), [history])
  // Keep every topology row while filtering so parent/merge lines never jump
  // across hidden commits. Non-matches are dimmed in the list instead.
  const graphRows = useMemo(
    () => (filteredHistory.length > 0 ? allGraphRows : []),
    [allGraphRows, filteredHistory.length]
  )
  const graphWidth = useMemo(() => commitGraphWidth(graphRows), [graphRows])
  const selectedCommit = useMemo(
    () => history.find((commit) => commit.id === selectedCommitId) ?? null,
    [history, selectedCommitId]
  )

  useEffect(() => {
    const element = pageRef.current
    if (!element) return
    const update = (width: number) =>
      setStackedLayout(width < STACKED_LAYOUT_BREAKPOINT)
    update(element.getBoundingClientRect().width)

    if (typeof ResizeObserver === "undefined") {
      const handleResize = () => update(element.getBoundingClientRect().width)
      window.addEventListener("resize", handleResize)
      return () => window.removeEventListener("resize", handleResize)
    }

    const observer = new ResizeObserver(([entry]) => {
      update(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [available, status?.enabled, statusLoading])

  useEffect(() => {
    if (filteredHistory.length === 0) {
      setSelectedCommitId(null)
      return
    }
    if (
      requestedCommitId &&
      filteredHistory.some((commit) => commit.id === requestedCommitId)
    ) {
      setSelectedCommitId(requestedCommitId)
      return
    }
    if (!filteredHistory.some((commit) => commit.id === selectedCommitId)) {
      setSelectedCommitId(filteredHistory[0].id)
    }
  }, [filteredHistory, requestedCommitId, selectedCommitId])

  const selectCommit = useCallback(
    (commitId: string) => {
      setSelectedCommitId(commitId)
      const params = new URLSearchParams(location.search)
      params.set("commit", commitId)
      navigate(
        {
          pathname: location.pathname,
          search: `?${params.toString()}`,
          hash: location.hash,
        },
        { replace: true }
      )
    },
    [location.hash, location.pathname, location.search, navigate]
  )

  useEffect(() => {
    if (!selectedCommitId || requestedCommitId === selectedCommitId) return
    const params = new URLSearchParams(location.search)
    params.set("commit", selectedCommitId)
    navigate(
      {
        pathname: location.pathname,
        search: `?${params.toString()}`,
        hash: location.hash,
      },
      { replace: true }
    )
  }, [
    location.hash,
    location.pathname,
    location.search,
    navigate,
    requestedCommitId,
    selectedCommitId,
  ])

  const virtualizer = useVirtualizer({
    count: graphRows.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => HISTORY_ROW_HEIGHT,
    overscan: 14,
  })

  useEffect(() => {
    if (!selectedCommitId) return
    const selectedIndex = graphRows.findIndex(
      (row) => row.commit.id === selectedCommitId
    )
    if (selectedIndex >= 0) {
      virtualizer.scrollToIndex(selectedIndex, { align: "auto" })
    }
  }, [graphRows, selectedCommitId, virtualizer])

  if (!available) {
    return (
      <div className="flex h-full items-center justify-center bg-background px-8">
        <div className="max-w-sm text-left">
          <GitBranch className="mb-3 h-5 w-5 text-muted-foreground" />
          <h1 className="text-sm font-medium">
            Version history is unavailable
          </h1>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            Open this Space in the desktop app to use Graft.
          </p>
        </div>
      </div>
    )
  }

  if (error && status === null) {
    return (
      <div className="flex h-full items-center justify-center bg-background px-8">
        <div className="max-w-sm text-left">
          <GitBranch className="mb-3 h-5 w-5 text-destructive" />
          <h1 className="text-sm font-medium">
            Version history could not be loaded
          </h1>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            {error.message}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="xs"
              variant="outline"
              className="h-7 text-xs"
              disabled={statusLoading}
              onClick={() => void refresh()}
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", statusLoading && "animate-spin")}
              />
              Try again
            </Button>
            <Button
              size="xs"
              variant="outline"
              className="h-7 text-xs"
              disabled={operation === "enabling"}
              onClick={() => {
                setEnableError(null)
                void enable().catch((requestError) => {
                  setEnableError(
                    requestError instanceof Error
                      ? requestError.message
                      : String(requestError)
                  )
                })
              }}
            >
              {operation === "enabling" ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GitBranch className="h-3.5 w-3.5" />
              )}
              {operation === "enabling" ? "Repairing…" : "Repair history"}
            </Button>
          </div>
          {enableError ? (
            <p className="mt-2 text-xs leading-5 text-destructive" role="alert">
              {enableError}
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  if (statusLoading && status === null) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-muted-foreground">
        <LoaderCircle
          className="h-5 w-5 animate-spin"
          aria-label="Loading version history"
        />
      </div>
    )
  }

  if (status === null) {
    return (
      <div className="flex h-full items-center justify-center bg-background px-8">
        <div className="max-w-sm text-left">
          <GitBranch className="mb-3 h-5 w-5 text-muted-foreground" />
          <h1 className="text-sm font-medium">
            Version history could not be loaded
          </h1>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            Version status is unavailable for this Space.
          </p>
        </div>
      </div>
    )
  }

  if (status && !status.enabled) {
    return (
      <div className="flex h-full items-center justify-center bg-background px-8">
        <div className="max-w-sm text-left">
          <GitBranch className="mb-3 h-5 w-5 text-muted-foreground" />
          <h1 className="text-sm font-medium">
            Version history is not enabled
          </h1>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            Enable Graft to keep local versions of this Space.
          </p>
          <Button
            size="xs"
            className="mt-4 h-7 text-xs"
            disabled={operation === "enabling"}
            onClick={() => {
              setEnableError(null)
              void enable().catch((requestError) => {
                setEnableError(
                  requestError instanceof Error
                    ? requestError.message
                    : String(requestError)
                )
              })
            }}
          >
            {operation === "enabling" ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GitBranch className="h-3.5 w-3.5" />
            )}
            Enable version history
          </Button>
          {enableError ? (
            <p className="mt-2 text-xs leading-5 text-destructive" role="alert">
              {enableError}
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={pageRef}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground"
    >
      <header
        className={cn(
          "flex shrink-0 items-center gap-3 border-b px-3",
          stackedLayout ? "min-h-[42px] flex-wrap py-1.5" : "h-[42px]"
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate text-sm font-medium">Version History</h1>
          {status?.branch ? (
            <span className="max-w-40 truncate rounded-[3px] bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {status.branch}
            </span>
          ) : null}
        </div>
        <div
          className={cn(
            "ml-auto flex min-w-0 items-center gap-1.5",
            stackedLayout && "ml-0 w-full"
          )}
        >
          <div
            className={cn(
              "relative",
              stackedLayout
                ? "min-w-0 flex-1"
                : "w-[min(30vw,280px)] min-w-[160px]"
            )}
          >
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              className="h-7 pl-7 pr-2 text-xs shadow-none"
              placeholder="Filter message, path, or hash"
              aria-label="Filter version history"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] text-muted-foreground outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            aria-label="Refresh version history"
            title="Refresh"
            disabled={historyLoading || statusLoading}
            onClick={() => void refresh()}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                (historyLoading || statusLoading) && "animate-spin"
              )}
            />
          </button>
        </div>
      </header>

      {error ? (
        <div
          className="shrink-0 border-b border-destructive/30 bg-destructive/5 px-3 py-1.5 text-[11px] text-destructive"
          role="alert"
        >
          {error.message}
        </div>
      ) : null}

      <ResizablePanelGroup
        key={stackedLayout ? "stacked" : "columns"}
        data-testid="version-history-workspace"
        direction={stackedLayout ? "vertical" : "horizontal"}
        autoSaveId={
          stackedLayout
            ? "eidos-version-history-stacked"
            : "eidos-version-history-columns"
        }
        className="min-h-0 min-w-0 flex-1"
      >
        <ResizablePanel
          id={stackedLayout ? "history-log-stacked" : "history-log-columns"}
          order={1}
          defaultSize={stackedLayout ? 36 : 26}
          minSize={stackedLayout ? 20 : 18}
          maxSize={stackedLayout ? 65 : 44}
          tagName="section"
          data-testid="version-history-log-pane"
          className="flex min-h-0 min-w-0 flex-col overflow-hidden"
        >
          <div className="flex h-7 shrink-0 items-center border-b bg-muted/35 text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            <span className="shrink-0 px-2" style={{ width: graphWidth }}>
              Graph
            </span>
            <span className="min-w-0 flex-1 px-2">Message</span>
            <span className="w-[72px] shrink-0 px-2">Commit</span>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-auto">
            {historyLoading && history.length === 0 ? (
              <div className="flex h-full min-h-[240px] items-center justify-center text-muted-foreground">
                <LoaderCircle
                  className="h-5 w-5 animate-spin"
                  aria-label="Loading commits"
                />
              </div>
            ) : graphRows.length === 0 ? (
              <HistoryEmptyState filtered={Boolean(query.trim())} />
            ) : (
              <div
                className="relative w-full min-w-0"
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const graphRow = graphRows[virtualRow.index]
                  const commit = graphRow.commit
                  const selected = commit.id === selectedCommitId
                  const matchesFilter =
                    !query.trim() || matchingCommitIds.has(commit.id)
                  return (
                    <button
                      key={commit.id}
                      type="button"
                      aria-current={selected ? "true" : undefined}
                      aria-label={`${commit.message}, ${formatVersionTime(commit.timestamp)}, commit ${shortCommitId(commit.id)}`}
                      disabled={!matchesFilter}
                      className={cn(
                        "absolute left-0 top-0 flex w-full items-center border-b border-border/45 text-left text-xs outline-hidden",
                        "hover:bg-accent/55 focus-visible:z-10 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
                        selected && "bg-accent text-accent-foreground",
                        !matchesFilter &&
                          "cursor-default opacity-25 hover:bg-transparent"
                      )}
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      onClick={() => selectCommit(commit.id)}
                    >
                      <CommitGraphCell row={graphRow} width={graphWidth} />
                      <span className="flex min-w-0 flex-1 flex-col items-start justify-center px-2">
                        <span className="truncate" title={commit.message}>
                          {commit.message}
                        </span>
                        <span className="mt-0.5 flex max-w-full items-center gap-1.5 truncate text-[10px] text-muted-foreground">
                          <span className="shrink-0 tabular-nums">
                            {commit.changedPaths.length}{" "}
                            {commit.changedPaths.length === 1
                              ? "path"
                              : "paths"}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className="shrink-0"
                            title={formatAbsoluteVersionTime(commit.timestamp)}
                          >
                            {formatVersionTime(commit.timestamp)}
                          </span>
                          {commit.labels[0] ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span
                                className="min-w-0 truncate font-mono"
                                title={commit.labels[0]}
                              >
                                {commit.labels[0]}
                              </span>
                            </>
                          ) : null}
                        </span>
                      </span>
                      <code
                        className="w-[72px] shrink-0 truncate px-2 font-mono text-[10px] text-muted-foreground"
                        title={commit.id}
                      >
                        {shortCommitId(commit.id)}
                      </code>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {historyHasMore || historyLoadingMore ? (
            <div className="flex h-8 shrink-0 items-center justify-center border-t bg-muted/20 px-2">
              <button
                type="button"
                className="inline-flex h-6 items-center gap-1.5 rounded-[3px] px-2 text-[11px] font-medium text-muted-foreground outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
                disabled={historyLoadingMore}
                onClick={() => void loadMoreHistory()}
              >
                {historyLoadingMore ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <History className="h-3.5 w-3.5" />
                )}
                {historyLoadingMore
                  ? "Loading older versions…"
                  : "Load older versions"}
              </button>
            </div>
          ) : null}
        </ResizablePanel>

        <ResizableHandle
          data-testid="version-history-log-resize-handle"
          aria-label={
            stackedLayout
              ? "Resize version list and commit details vertically"
              : "Resize version list and commit details"
          }
          title="Drag to resize"
          className="z-10 shrink-0 transition-colors hover:bg-primary/60 focus-visible:bg-primary/60 data-[resize-handle-active]:bg-primary/60"
        />

        <ResizablePanel
          id={
            stackedLayout ? "history-detail-stacked" : "history-detail-columns"
          }
          order={2}
          defaultSize={stackedLayout ? 64 : 74}
          minSize={stackedLayout ? 35 : 45}
          data-testid="version-history-detail-pane"
          className="min-h-0 min-w-0"
        >
          <CommitInspector
            key={selectedCommit?.id ?? "empty"}
            commit={selectedCommit}
            getCommit={getCommit}
            getDiff={getDiff}
            status={status}
            operation={operation}
            restorePath={restorePath}
            restoreVersion={restoreVersion}
            placement={stackedLayout ? "below" : "side"}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

export default SpaceVersionHistoryPage
