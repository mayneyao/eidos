import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react"
import {
  Check,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  History,
  LoaderCircle,
  RefreshCw,
  Undo2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { FILE_SPACE_VERSION_DIFF_ROUTE } from "@/apps/web-app/file-space-route-policy"
import { navigateAfterFlushingSpaceFile } from "@/apps/web-app/components/file-space/file-navigation"
import { flushPendingFileWrites } from "@/apps/web-app/components/file-space/pending-writes"
import {
  filePathFromSpaceUrl,
  toSpaceFileUrl,
} from "@/apps/web-app/components/file-space/file-path"
import { useSpaceVersioning } from "@/apps/web-app/hooks/use-space-versioning"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

import { VersionChangeTree } from "./change-tree"
import {
  formatAbsoluteVersionTime,
  formatVersionTime,
  shortCommitId,
} from "./versioning-utils"

type VersionPanelView = "changes" | "history"

export interface VersionPanelProps {
  spaceId: string
}

function PanelToolbar({
  activeView,
  busy,
  onViewChange,
  onRefresh,
}: {
  activeView: VersionPanelView
  busy: boolean
  onViewChange: (view: VersionPanelView) => void
  onRefresh: () => void
}) {
  return (
    <div className="flex h-[34px] shrink-0 items-center gap-1 border-b border-sidebar-border/60 px-1.5">
      <div
        className="grid min-w-0 flex-1 grid-cols-2 rounded-[3px] bg-sidebar-accent/45 p-0.5"
        role="group"
        aria-label="Version views"
      >
        {(
          [
            ["changes", "Changes"],
            ["history", "History"],
          ] as const
        ).map(([view, label]) => (
          <button
            key={view}
            type="button"
            aria-pressed={activeView === view}
            className={cn(
              "h-[24px] truncate rounded-[2px] px-2 text-[11px] font-medium text-sidebar-foreground/60 outline-hidden transition-colors",
              "hover:text-sidebar-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring",
              activeView === view &&
                "bg-sidebar text-sidebar-foreground shadow-[0_0_0_1px_var(--sidebar-border)]"
            )}
            onClick={() => onViewChange(view)}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] text-sidebar-foreground/60 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring disabled:opacity-50"
        aria-label="Refresh version information"
        title="Refresh"
        disabled={busy}
        onClick={onRefresh}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
      </button>
    </div>
  )
}

function VersioningUnavailable({
  message,
  actionLabel,
  busy = false,
  onAction,
}: {
  message: string
  actionLabel?: string
  busy?: boolean
  onAction?: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center px-4 py-8">
      <GitBranch className="mb-3 h-5 w-5 text-sidebar-foreground/45" />
      <p className="text-xs font-medium text-sidebar-foreground">
        Version history unavailable
      </p>
      <p className="mt-1.5 text-[11px] leading-5 text-sidebar-foreground/55">
        {message}
      </p>
      {actionLabel && onAction ? (
        <Button
          size="xs"
          variant="outline"
          className="mt-3 h-7 text-xs"
          disabled={busy}
          onClick={onAction}
        >
          {busy ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {busy ? "Repairing…" : actionLabel}
        </Button>
      ) : null}
    </div>
  )
}

function EnableVersioning({
  busy,
  onEnable,
}: {
  busy: boolean
  onEnable: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center px-4 py-8">
      <GitBranch className="mb-3 h-5 w-5 text-sidebar-foreground/45" />
      <p className="text-xs font-medium text-sidebar-foreground">
        Keep a local history of this Space
      </p>
      <p className="mt-1.5 text-[11px] leading-5 text-sidebar-foreground/55">
        Graft records versions in this folder. Your files remain the source of
        truth.
      </p>
      <Button
        size="xs"
        className="mt-4 h-7 text-xs"
        disabled={busy}
        onClick={onEnable}
      >
        {busy ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <GitBranch className="h-3.5 w-3.5" />
        )}
        {busy ? "Enabling…" : "Enable version history"}
      </Button>
    </div>
  )
}

function CompactHistory({
  commits,
  loading,
  onOpenFullHistory,
}: {
  commits: ReturnType<typeof useSpaceVersioning>["history"]
  loading: boolean
  onOpenFullHistory: (commitId?: string) => void
}) {
  const [query, setQuery] = useState("")
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return commits.slice(0, 50)
    return commits
      .filter(
        (commit) =>
          commit.message.toLowerCase().includes(normalizedQuery) ||
          commit.id.toLowerCase().includes(normalizedQuery) ||
          commit.changedPaths.some((change) =>
            change.path.toLowerCase().includes(normalizedQuery)
          )
      )
      .slice(0, 50)
  }, [commits, query])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-sidebar-border/50 p-1.5">
        <Input
          value={query}
          className="h-7 border-sidebar-border bg-sidebar px-2 text-xs shadow-none"
          placeholder="Filter versions"
          aria-label="Filter versions"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
        {loading && commits.length === 0 ? (
          <div className="flex h-20 items-center justify-center text-sidebar-foreground/45">
            <LoaderCircle
              className="h-4 w-4 animate-spin"
              aria-label="Loading history"
            />
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-4 text-[11px] leading-5 text-sidebar-foreground/55">
            {query ? "No versions match this filter." : "No versions yet."}
          </p>
        ) : (
          <ol>
            {filtered.map((commit, index) => (
              <li
                key={commit.id}
                className="relative border-b border-sidebar-border/35 last:border-b-0"
              >
                <button
                  type="button"
                  className="group relative block w-full px-2.5 py-2 text-left outline-hidden hover:bg-sidebar-accent/70 focus-visible:bg-sidebar-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring"
                  title={`Open ${commit.message} in full history`}
                  onClick={() => onOpenFullHistory(commit.id)}
                >
                  <span
                    className={cn(
                      "absolute bottom-0 left-[14px] top-0 w-px bg-sidebar-border",
                      index === 0 && "top-1/2",
                      index === filtered.length - 1 && "bottom-1/2"
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className="absolute left-[11px] top-[15px] h-[7px] w-[7px] rounded-full border-[1.5px] border-sidebar-foreground/45 bg-sidebar group-hover:bg-sidebar-accent group-focus-visible:bg-sidebar-accent"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 pl-4">
                    <p
                      className="truncate text-[12px] text-sidebar-foreground"
                      title={commit.message}
                    >
                      {commit.message}
                    </p>
                    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-sidebar-foreground/50">
                      <span title={formatAbsoluteVersionTime(commit.timestamp)}>
                        {formatVersionTime(commit.timestamp)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <code className="truncate font-mono text-[10px]">
                        {shortCommitId(commit.id)}
                      </code>
                      {commit.changedPaths.length > 0 ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {commit.changedPaths.length}{" "}
                            {commit.changedPaths.length === 1
                              ? "path"
                              : "paths"}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
      <button
        type="button"
        className="flex h-8 shrink-0 items-center justify-between border-t border-sidebar-border/60 px-2.5 text-[11px] font-medium text-sidebar-foreground/70 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring"
        onClick={() => onOpenFullHistory()}
      >
        <span className="flex items-center gap-1.5">
          <History className="h-3.5 w-3.5" />
          Open full history
        </span>
        <ExternalLink className="h-3 w-3" />
      </button>
    </div>
  )
}

export function VersionPanel({ spaceId }: VersionPanelProps) {
  const [activeView, setActiveView] = useState<VersionPanelView>("changes")
  const [message, setMessage] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)
  const [localNotice, setLocalNotice] = useState<string | null>(null)
  const [busyPath, setBusyPath] = useState<string | null>(null)
  const [discardTarget, setDiscardTarget] = useState<string | null>(null)
  const { location, navigate } = useRouterAdapter()
  const openTab = useTabStore((state) => state.openTab)
  const tabs = useTabStore((state) => state.tabs)
  const updateTab = useTabStore((state) => state.updateTab)
  const setActiveTab = useTabStore((state) => state.setActiveTab)
  const {
    status,
    history,
    statusLoading,
    historyLoading,
    operation,
    error,
    available,
    enable,
    commit,
    stagePath,
    unstagePath,
    discardPath,
    refresh,
  } = useSpaceVersioning(spaceId, { loadHistory: true, historyLimit: 250 })

  const busy = statusLoading || historyLoading || operation !== null
  const currentFilePath = filePathFromSpaceUrl(
    `${location.pathname}${location.search}${location.hash}`
  )
  const stagedCount =
    status?.changes.filter((change) => change.staged).length ?? 0
  const unstagedCount =
    status?.changes.filter((change) => !change.staged || change.unstaged)
      .length ?? 0
  const commitPathCount = stagedCount || status?.changes.length || 0
  const clearFeedback = () => {
    setLocalError(null)
    setLocalNotice(null)
  }
  const openChangedPath = async (path: string) => {
    clearFeedback()
    const navigated = await navigateAfterFlushingSpaceFile({
      spaceId,
      currentFilePath,
      destination: toSpaceFileUrl(path),
      navigate,
    })
    if (!navigated) {
      setLocalError(
        "Eidos could not save the current file before opening this change."
      )
    }
  }
  const openChangedDiff = async (path: string) => {
    clearFeedback()
    const flushed = await flushPendingFileWrites({
      spaceId,
      path,
    })
    if (!flushed) {
      setLocalError(
        "Eidos could not save the current file before opening this diff."
      )
      return
    }
    const params = new URLSearchParams({ path })
    const url = `/${FILE_SPACE_VERSION_DIFF_ROUTE}?${params.toString()}`
    const existingTab = tabs.find((tab) => {
      try {
        const candidate = new URL(tab.url, "https://eidos.local")
        return (
          candidate.pathname === `/${FILE_SPACE_VERSION_DIFF_ROUTE}` &&
          candidate.searchParams.get("path") === path
        )
      } catch {
        return false
      }
    })
    if (existingTab) {
      updateTab(existingTab.id, { url })
      setActiveTab(existingTab.id)
      return
    }
    const filename = path.split("/").pop() || path
    openTab(url, `${filename} (Diff)`)
  }
  const includeChangedPath = async (path: string) => {
    if (operation || busyPath) return
    clearFeedback()
    setBusyPath(path)
    try {
      await stagePath({ path, expectedHead: status?.head?.id ?? null })
      setLocalNotice(`${path} is included in the next version.`)
    } catch (stageError) {
      setLocalError(
        stageError instanceof Error ? stageError.message : String(stageError)
      )
    } finally {
      setBusyPath(null)
    }
  }
  const excludeChangedPath = async (path: string) => {
    if (operation || busyPath) return
    clearFeedback()
    setBusyPath(path)
    try {
      await unstagePath({ path, expectedHead: status?.head?.id ?? null })
      setLocalNotice(`${path} is excluded from the next version.`)
    } catch (unstageError) {
      setLocalError(
        unstageError instanceof Error
          ? unstageError.message
          : String(unstageError)
      )
    } finally {
      setBusyPath(null)
    }
  }
  const confirmDiscard = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (!discardTarget || operation || busyPath) return
    clearFeedback()
    setBusyPath(discardTarget)
    try {
      const result = await discardPath({
        path: discardTarget,
        expectedHead: status?.head?.id ?? null,
        confirmed: true,
      })
      setLocalNotice(
        result.effect === "deleted"
          ? `${result.path} was deleted from the Space.`
          : result.effect === "noop"
            ? `${result.path} no longer has changes to discard.`
            : `${result.path} now matches the current version.`
      )
      setDiscardTarget(null)
    } catch (discardError) {
      setLocalError(
        discardError instanceof Error
          ? discardError.message
          : String(discardError)
      )
    } finally {
      setBusyPath(null)
    }
  }
  const openFullHistory = (commitId?: string) => {
    const url = commitId
      ? `/version/history?commit=${encodeURIComponent(commitId)}`
      : "/version/history"
    const existingTab = tabs.find(
      (tab) => tab.url.split(/[?#]/, 1)[0] === "/version/history"
    )
    if (existingTab) {
      updateTab(existingTab.id, { url })
      setActiveTab(existingTab.id)
      return
    }
    openTab(url, "Version History")
  }
  const submitCommit = async () => {
    if (!message.trim() || operation) return
    clearFeedback()
    try {
      await commit(message)
      setMessage("")
    } catch (commitError) {
      setLocalError(
        commitError instanceof Error ? commitError.message : String(commitError)
      )
    }
  }
  const handleCommitKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault()
      void submitCommit()
    }
  }

  return (
    <>
      <section
        className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground"
        aria-label="Space version history"
      >
        <PanelToolbar
          activeView={activeView}
          busy={busy}
          onViewChange={setActiveView}
          onRefresh={() => void refresh()}
        />

        {error && status !== null && !localError ? (
          <p
            className="shrink-0 border-b border-destructive/30 bg-destructive/5 px-3 py-1.5 text-[10px] leading-4 text-destructive"
            role="alert"
          >
            {error.message}
          </p>
        ) : null}

        {localError && status?.enabled ? (
          <p
            className="shrink-0 border-b border-destructive/30 bg-destructive/5 px-3 py-1.5 text-[10px] leading-4 text-destructive"
            role="alert"
          >
            {localError}
          </p>
        ) : localNotice && status?.enabled ? (
          <p
            className="shrink-0 border-b border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-[10px] leading-4 text-emerald-700 dark:text-emerald-300"
            role="status"
          >
            {localNotice}
          </p>
        ) : null}

        {!available ? (
          <VersioningUnavailable message="Open this Space in the desktop app to use Graft." />
        ) : error && status === null ? (
          <VersioningUnavailable
            message={error.message}
            actionLabel="Repair version history"
            busy={operation === "enabling"}
            onAction={() => {
              setLocalError(null)
              void enable().catch((enableError) => {
                setLocalError(
                  enableError instanceof Error
                    ? enableError.message
                    : String(enableError)
                )
              })
            }}
          />
        ) : statusLoading && status === null ? (
          <div className="flex flex-1 items-center justify-center text-sidebar-foreground/45">
            <LoaderCircle
              className="h-4 w-4 animate-spin"
              aria-label="Loading version status"
            />
          </div>
        ) : status === null ? (
          <VersioningUnavailable message="Version status could not be loaded." />
        ) : status && !status.enabled ? (
          <EnableVersioning
            busy={operation === "enabling"}
            onEnable={() => {
              setLocalError(null)
              void enable().catch((enableError) => {
                setLocalError(
                  enableError instanceof Error
                    ? enableError.message
                    : String(enableError)
                )
              })
            }}
          />
        ) : activeView === "history" ? (
          <CompactHistory
            commits={history}
            loading={historyLoading}
            onOpenFullHistory={openFullHistory}
          />
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex h-[28px] items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/60">
                <span>Changes</span>
                <span className="tabular-nums">
                  {status?.changes.length ?? 0}
                </span>
              </div>
              {status?.changes.length ? (
                <VersionChangeTree
                  changes={status.changes}
                  selectedPath={currentFilePath}
                  busyPath={busyPath}
                  actionsDisabled={operation !== null}
                  onOpenDiff={(path) => void openChangedDiff(path)}
                  onRevealPath={(path) => void openChangedPath(path)}
                  onStagePath={(path) => void includeChangedPath(path)}
                  onUnstagePath={(path) => void excludeChangedPath(path)}
                  onDiscardPath={setDiscardTarget}
                />
              ) : (
                <div className="flex items-start gap-2 px-3 py-3 text-[11px] leading-5 text-sidebar-foreground/55">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>This Space matches the latest version.</span>
                </div>
              )}
            </div>
            <div className="shrink-0 border-t border-sidebar-border/60 p-1.5">
              <label
                htmlFor={`space-version-message-${spaceId}`}
                className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/60"
              >
                Message
              </label>
              <Textarea
                id={`space-version-message-${spaceId}`}
                value={message}
                rows={2}
                className="min-h-[54px] resize-none border-sidebar-border bg-sidebar px-2 py-1.5 text-xs leading-4 shadow-none"
                placeholder="Version message (Ctrl+Enter)"
                aria-label="Version message"
                disabled={!status?.changes.length || operation !== null}
                onChange={(event) => {
                  setMessage(event.target.value)
                  setLocalError(null)
                }}
                onKeyDown={handleCommitKeyDown}
              />
              {status?.changes.length ? (
                <p className="mt-1 text-[10px] leading-4 text-sidebar-foreground/50">
                  {stagedCount > 0
                    ? `${stagedCount} included${unstagedCount > 0 ? ` · ${unstagedCount} working ${unstagedCount === 1 ? "change" : "changes"} remain` : ""}`
                    : "All working changes will be included."}
                </p>
              ) : null}
              <Button
                size="xs"
                className="mt-1.5 h-7 w-full text-xs"
                disabled={
                  !status?.changes.length ||
                  !message.trim() ||
                  operation !== null
                }
                onClick={() => void submitCommit()}
              >
                {operation === "committing" ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <GitCommitHorizontal className="h-3.5 w-3.5" />
                )}
                {operation === "committing"
                  ? "Creating version…"
                  : `Create version${commitPathCount ? ` (${commitPathCount})` : ""}`}
              </Button>
            </div>
          </>
        )}

        {localError && (!status || !status.enabled) ? (
          <p
            className="shrink-0 border-t border-sidebar-border/60 px-3 py-2 text-[10px] leading-4 text-destructive"
            role="alert"
          >
            {localError}
          </p>
        ) : null}
      </section>

      <AlertDialog
        open={discardTarget !== null}
        onOpenChange={(open) => {
          if (!open && !busyPath) setDiscardTarget(null)
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">
              Discard changes to this file?
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-5">
              <code className="break-all font-mono text-foreground">
                {discardTarget}
              </code>{" "}
              will be restored to the current version. If it is untracked, the
              file will be deleted from the Space. Included and working changes
              for this path will both be discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyPath !== null}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busyPath !== null}
              onClick={(event) => void confirmDiscard(event)}
            >
              {busyPath ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Undo2 className="h-3.5 w-3.5" />
              )}
              {busyPath ? "Discarding…" : "Discard changes"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
