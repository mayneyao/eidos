import { useState, type KeyboardEvent, type MouseEvent } from "react"
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Cloud,
  CloudCog,
  GitBranch,
  GitCommitHorizontal,
  History,
  LoaderCircle,
  RefreshCw,
  Undo2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  FILE_SPACE_VERSION_CONFLICTS_ROUTE,
  FILE_SPACE_VERSION_DIFF_ROUTE,
} from "@/apps/web-app/file-space-route-policy"
import { navigateAfterFlushingSpaceFile } from "@/apps/web-app/components/file-space/file-navigation"
import { flushPendingFileWrites } from "@/apps/web-app/components/file-space/pending-writes"
import {
  filePathFromSpaceUrl,
  toSpaceFileUrl,
} from "@/apps/web-app/components/file-space/file-path"
import { useSpaceVersioning } from "@/apps/web-app/hooks/use-space-versioning"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { openSettings } from "@/components/settings/settings-events"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { Textarea } from "@/components/ui/textarea"

import { VersionChangeTree } from "./change-tree"

export interface VersionPanelProps {
  spaceId: string
}

function PanelToolbar({
  busy,
  branch,
  remoteConfigured,
  ahead,
  behind,
  onFetch,
  onPull,
  onPush,
  onOpenHistory,
  onRefresh,
}: {
  busy: boolean
  branch: string | null
  remoteConfigured: boolean
  ahead: number
  behind: number
  onFetch: () => void
  onPull: () => void
  onPush: () => void
  onOpenHistory: () => void
  onRefresh: () => void
}) {
  return (
    <div className="flex h-[34px] shrink-0 items-center gap-1 border-b border-sidebar-border/60 px-1.5">
      <span className="min-w-0 flex-1 truncate px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/70">
        Changes
      </span>
      {remoteConfigured ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-6 max-w-[108px] shrink-0 items-center gap-1 rounded-[3px] px-1.5 text-[10px] text-sidebar-foreground/60 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring disabled:opacity-50"
              aria-label="Synchronize Space versions"
              title="Synchronize versions"
              disabled={busy}
            >
              <Cloud className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{branch ?? "remote"}</span>
              {ahead > 0 ? <span>↑{ahead}</span> : null}
              {behind > 0 ? <span>↓{behind}</span> : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
              {branch ?? "Remote versions"}
              {ahead || behind ? ` · ↑${ahead} ↓${behind}` : " · up to date"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onFetch}>
              <RefreshCw />
              Check for updates
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onPull}>
              <ArrowDownToLine />
              Pull versions
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onPush}>
              <ArrowUpFromLine />
              Push versions
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() =>
                openSettings({
                  section: "space-versioning",
                  showSpaceSettings: true,
                })
              }
            >
              <CloudCog />
              Configure remote…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button
          type="button"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] text-sidebar-foreground/60 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring"
          aria-label="Configure remote version sync"
          title="Configure remote version sync"
          onClick={() =>
            openSettings({
              section: "space-versioning",
              showSpaceSettings: true,
            })
          }
        >
          <CloudCog className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] text-sidebar-foreground/60 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring"
        aria-label="Open version history"
        title="Open version history"
        onClick={onOpenHistory}
      >
        <History className="h-3.5 w-3.5" />
      </button>
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

export function VersionPanel({ spaceId }: VersionPanelProps) {
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
    statusLoading,
    operation,
    error,
    available,
    enable,
    commit,
    stagePath,
    unstagePath,
    discardPath,
    fetchRemote,
    pullRemote,
    pushRemote,
    refresh,
  } = useSpaceVersioning(spaceId)

  const busy = statusLoading || operation !== null
  const currentFilePath = filePathFromSpaceUrl(
    `${location.pathname}${location.search}${location.hash}`
  )
  const stagedChanges = status?.changes.filter((change) => change.staged) ?? []
  const unstagedChanges =
    status?.changes.filter((change) => change.unstaged || !change.staged) ?? []
  const stagedCount = stagedChanges.length
  const unstagedCount = unstagedChanges.length
  const discardTargetIsDirectory =
    discardTarget !== null &&
    unstagedChanges.some((change) =>
      change.path.startsWith(`${discardTarget}/`)
    )
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
    const conflicted = status?.changes.some(
      (change) => change.path === path && change.conflicted
    )
    if (conflicted && status?.head?.id && status.mergeHead) {
      params.set("from", status.head.id)
      params.set("to", status.mergeHead)
    }
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
    const discardingDirectory = discardTargetIsDirectory
    try {
      const result = await discardPath({
        path: discardTarget,
        expectedHead: status?.head?.id ?? null,
        confirmed: true,
      })
      setLocalNotice(
        result.effect === "deleted"
          ? discardingDirectory
            ? `Untracked changes in ${result.path} were deleted from the Space.`
            : `${result.path} was deleted from the Space.`
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
  const openConflictReview = (path: string) => {
    const url = `/${FILE_SPACE_VERSION_CONFLICTS_ROUTE}?path=${encodeURIComponent(path)}`
    const existingTab = tabs.find(
      (tab) =>
        tab.url.split(/[?#]/, 1)[0] === `/${FILE_SPACE_VERSION_CONFLICTS_ROUTE}`
    )
    if (existingTab) {
      updateTab(existingTab.id, { url, title: "Resolve Conflicts" })
      setActiveTab(existingTab.id)
      return
    }
    openTab(url, "Resolve Conflicts")
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
  const synchronize = async (action: "fetch" | "pull" | "push") => {
    if (operation || !status) return
    clearFeedback()
    try {
      const request = { expectedHead: status.head?.id ?? null }
      const result =
        action === "fetch"
          ? await fetchRemote(request)
          : action === "pull"
            ? await pullRemote(request)
            : await pushRemote(request)
      if (action === "fetch") {
        setLocalNotice(
          result.status.behind > 0
            ? `${result.status.behind} remote ${result.status.behind === 1 ? "version is" : "versions are"} ready to pull.`
            : "Remote version information is up to date."
        )
      } else if (action === "pull") {
        setLocalNotice(
          result.status.hasConflicts
            ? "Remote versions were pulled. Resolve the conflicts in Changes."
            : result.commits > 0
              ? `Pulled ${result.commits} ${result.commits === 1 ? "version" : "versions"}.`
              : "This Space is already up to date."
        )
      } else {
        setLocalNotice(
          result.commits > 0
            ? `Pushed ${result.commits} ${result.commits === 1 ? "version" : "versions"}.`
            : "Remote versions are already up to date."
        )
      }
    } catch (syncError) {
      setLocalError(
        syncError instanceof Error ? syncError.message : String(syncError)
      )
    }
  }
  return (
    <>
      <section
        className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground"
        aria-label="Space version history"
      >
        <PanelToolbar
          busy={busy}
          branch={
            status?.upstream
              ? `${status.upstream.remote}/${status.upstream.branch}`
              : (status?.branch ?? null)
          }
          remoteConfigured={(status?.remoteNames?.length ?? 0) > 0}
          ahead={status?.upstream?.ahead ?? status?.ahead ?? 0}
          behind={status?.upstream?.behind ?? status?.behind ?? 0}
          onFetch={() => void synchronize("fetch")}
          onPull={() => void synchronize("pull")}
          onPush={() => void synchronize("push")}
          onOpenHistory={() => openFullHistory()}
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
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {stagedChanges.length ? (
                <>
                  <div className="flex h-[28px] items-center justify-between border-b border-sidebar-border/30 px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/60">
                    <span>Staged Changes</span>
                    <span className="tabular-nums">{stagedCount}</span>
                  </div>
                  <VersionChangeTree
                    changes={stagedChanges}
                    mode="staged"
                    selectedPath={currentFilePath}
                    busyPath={busyPath}
                    actionsDisabled={operation !== null}
                    onOpenDiff={(path) => void openChangedDiff(path)}
                    onRevealPath={(path) => void openChangedPath(path)}
                    onUnstagePath={(path) => void excludeChangedPath(path)}
                  />
                </>
              ) : null}
              <div className="flex h-[28px] items-center justify-between border-b border-sidebar-border/30 px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/60">
                <span>Changes</span>
                <span className="tabular-nums">{unstagedCount}</span>
              </div>
              {unstagedChanges.length ? (
                <VersionChangeTree
                  changes={unstagedChanges}
                  mode="unstaged"
                  selectedPath={currentFilePath}
                  busyPath={busyPath}
                  actionsDisabled={operation !== null}
                  onOpenDiff={(path) => void openChangedDiff(path)}
                  onRevealPath={(path) => void openChangedPath(path)}
                  onStagePath={(path) => void includeChangedPath(path)}
                  onDiscardPath={setDiscardTarget}
                  onResolveConflict={openConflictReview}
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
                disabled={!stagedCount || operation !== null}
                onChange={(event) => {
                  setMessage(event.target.value)
                  setLocalError(null)
                }}
                onKeyDown={handleCommitKeyDown}
              />
              {status?.changes.length ? (
                <p className="mt-1 text-[10px] leading-4 text-sidebar-foreground/50">
                  {stagedCount > 0
                    ? `${stagedCount} staged${unstagedCount > 0 ? ` · ${unstagedCount} working ${unstagedCount === 1 ? "change" : "changes"} remain` : ""}`
                    : "Stage changes before creating a version."}
                </p>
              ) : null}
              <Button
                size="xs"
                className="mt-1.5 h-7 w-full text-xs"
                disabled={!stagedCount || !message.trim() || operation !== null}
                onClick={() => void submitCommit()}
              >
                {operation === "committing" ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <GitCommitHorizontal className="h-3.5 w-3.5" />
                )}
                {operation === "committing"
                  ? "Creating version…"
                  : `Create version${stagedCount ? ` (${stagedCount})` : ""}`}
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

      {discardTarget !== null ? (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open && !busyPath) setDiscardTarget(null)
          }}
        >
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base">
                {discardTargetIsDirectory
                  ? "Discard changes in this folder?"
                  : "Discard changes to this file?"}
              </AlertDialogTitle>
              <AlertDialogDescription className="leading-5">
                <code className="break-all font-mono text-foreground">
                  {discardTarget}
                </code>{" "}
                {discardTargetIsDirectory
                  ? "and every changed file inside it will be restored to the current version. Untracked files will be deleted from the Space. Included and working changes in this folder will both be discarded."
                  : "will be restored to the current version. If it is untracked, the file will be deleted from the Space. Included and working changes for this path will both be discarded."}
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
      ) : null}
    </>
  )
}
