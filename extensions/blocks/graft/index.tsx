"use sidebar"

/**
 * Graft Sidebar Block Extension
 */
import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  useEidos,
  useExtensionContext,
  type SidebarBlockContext,
} from "@eidos.space/react"
import type { GraftWorkflowAction } from "@eidos.space/sync"
import {
  ArrowUpFromLine,
  ChevronRight,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  LoaderIcon,
  RefreshCw,
  Undo2,
} from "lucide-react"

import { useTabStore } from "@/apps/web-app/store/tabs"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { CommitHistoryList } from "./commit-history-list"
import { useGraft } from "./use-graft"

/**
 * Extension metadata
 */
export const meta = {
  type: "sidebarBlock",
  componentName: "GraftSidebar",
  icon: "git-branch",
  sidebarBlock: {
    title: "Graft",
    description:
      "Synchronize your workspace with remote repositories using Git-like operations (pull, push, clone). View sync status, branch information, and commit history.",
  },
}

const cn = (...classes: (string | boolean | undefined)[]) =>
  classes.filter(Boolean).join(" ")

type TabKey = "changes" | "history" | "sync"
type BranchResetMode = "soft" | "hard"
type PendingBranchReset = { lsn: string; mode: BranchResetMode }

const WORKTREE_DIFF_URL = "/graft/diff/HEAD/WORKTREE"

function getWorktreeDiffUrl(table?: string) {
  return table
    ? `${WORKTREE_DIFF_URL}#table=${encodeURIComponent(table)}`
    : WORKTREE_DIFF_URL
}

function normalizePathname(url: string) {
  try {
    return new URL(url, window.location.origin).pathname.replace(/\/$/, "")
  } catch {
    return (url.split(/[?#]/)[0] ?? "").replace(/\/$/, "")
  }
}

function isWorktreeDiffTab(url: string) {
  return normalizePathname(url) === WORKTREE_DIFF_URL
}

function focusWorktreeDiffTab(url: string) {
  const { tabs, getActiveTabId, updateTab, setActiveTab } =
    useTabStore.getState()
  const activeTabId = getActiveTabId()
  const targetTab =
    tabs.find((tab) => tab.id === activeTabId && isWorktreeDiffTab(tab.url)) ??
    tabs.find((tab) => isWorktreeDiffTab(tab.url))

  if (!targetTab) return false

  if (targetTab.url !== url) {
    updateTab(targetTab.id, { url })
  }
  setActiveTab(targetTab.id)
  return true
}

function getWorktreeState(status: any) {
  const staged: unknown[] = Array.isArray(status?.staged) ? status.staged : []
  const unstaged: unknown[] = Array.isArray(status?.unstaged)
    ? status.unstaged
    : []
  const unstagedChanges: Record<string, unknown>[] = Array.isArray(
    status?.unstagedChanges
  )
    ? status.unstagedChanges
    : []
  const conflicted: unknown[] = Array.isArray(status?.conflicted)
    ? status.conflicted
    : []
  const mergeHead =
    typeof status?.mergeHead === "string"
      ? status.mergeHead
      : typeof status?.merge_head === "string"
        ? status.merge_head
        : undefined
  const isMergeInProgress = Boolean(status?.isMergeInProgress || mergeHead)
  const conflictAnalysis = getConflictAnalysis(status)
  const conflictCanAutoMerge = Boolean(
    conflictAnalysis?.canAutoMerge ?? conflictAnalysis?.can_auto_merge
  )
  const canCompleteMerge = Boolean(
    status?.canCompleteMerge ??
    (isMergeInProgress && (conflicted.length === 0 || conflictCanAutoMerge))
  )
  const paths = new Set<string>()
  for (const path of staged) paths.add(String(path))
  for (const path of unstaged) paths.add(String(path))
  for (const change of unstagedChanges) {
    if (change?.path) paths.add(String(change.path))
  }
  for (const path of conflicted) paths.add(String(path))

  const hasChanges = Boolean(
    status?.dirty ||
    staged.length > 0 ||
    unstaged.length > 0 ||
    unstagedChanges.length > 0 ||
    conflicted.length > 0 ||
    isMergeInProgress ||
    status?.suggestedAction === "commit"
  )

  return {
    hasChanges,
    count: paths.size || (hasChanges ? 1 : 0),
    stagedCount: staged.length,
    unstagedCount: unstagedChanges.length || unstaged.length,
    conflictedCount: conflicted.length,
    conflictedPaths: conflicted.map(String),
    mergeHead,
    isMergeInProgress,
    canCompleteMerge,
  }
}

function getConflictAnalysis(status: any) {
  return status?.conflictAnalysis ?? status?.conflict_analysis
}

function formatByteSize(value: unknown) {
  const bytes =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN
  if (!Number.isFinite(bytes) || bytes < 0) return null
  if (bytes === 0) return "0 B"

  const units = ["B", "KB", "MB", "GB", "TB"]
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )
  const size = bytes / Math.pow(1024, unitIndex)
  const formatted =
    unitIndex === 0
      ? String(Math.round(size))
      : new Intl.NumberFormat(undefined, {
          maximumFractionDigits: 1,
        }).format(size)
  return `${formatted} ${units[unitIndex]}`
}

function workflowAllows(status: any, action: GraftWorkflowAction) {
  const allowedActions = status?.workflow?.allowedActions
  return Array.isArray(allowedActions) && allowedActions.includes(action)
}

export const GraftSidebar = () => {
  const ctx = useExtensionContext<SidebarBlockContext>()
  const [pendingBranchReset, setPendingBranchReset] =
    useState<PendingBranchReset | null>(null)
  const [tab, setTabState] = useState<TabKey>("history")
  const hasUserSelectedTabRef = useRef(false)
  const [isEnabling, setIsEnabling] = useState(false)
  const [commitMessage, setCommitMessage] = useState("")
  const commitInputRef = useRef<HTMLInputElement>(null)
  const eidos = useEidos()
  const navigate = eidos.currentSpace.navigate.bind(eidos.currentSpace)

  const isDesktop =
    typeof window !== "undefined" &&
    window.eidos?.spaceMgmt?.toggleLocalVersioning != null

  const handleEnableVersioning = async () => {
    setIsEnabling(true)
    try {
      const result = await window.eidos.spaceMgmt.toggleLocalVersioning(
        ctx.space,
        true
      )
      if (result.success) {
        window.location.reload()
      } else {
        eidos.currentSpace.notify({
          title: "Failed to enable version history",
          description: result.error || "Unknown error",
        })
      }
    } catch (e: any) {
      eidos.currentSpace.notify({
        title: "Failed to enable version history",
        description: e?.message ?? "Unknown error",
      })
    } finally {
      setIsEnabling(false)
    }
  }

  const {
    status: syncStatus,
    lastUpdated,
    isStatusLoading,
    isPulling,
    isPushing,
    isFetching,
    isActiveFetching,
    branches,
    graftInfo,
    auditResult,
    log,
    isLogLoading,
    fetchLog,
    diff: worktreeDiff,
    isDiffLoading,
    fetchDiff,
    fetchStatus,
    refreshStatus,
    commit,
    isCommitLoading,
    completeMerge,
    isCompletingMerge,
    abortMerge,
    isAbortingMerge,
    resetTo,
    isResetLoading,
    pull: handlePull,
    push: handlePush,
    fetch,
  } = useGraft()

  const isSyncEnabled = ctx.syncEnabled ?? false
  const isVersioningEnabled = ctx.versioningEnabled ?? isSyncEnabled
  const worktree = useMemo(() => getWorktreeState(syncStatus), [syncStatus])

  const setTab = (nextTab: TabKey) => {
    hasUserSelectedTabRef.current = true
    setTabState(nextTab)
  }

  // Load history and working tree status on mount.
  useEffect(() => {
    if (isVersioningEnabled) {
      fetchLog()
      fetchStatus()
    }
  }, [isVersioningEnabled, fetchLog, fetchStatus])

  useEffect(() => {
    if (!isVersioningEnabled || hasUserSelectedTabRef.current || !syncStatus) {
      return
    }
    if (worktree.hasChanges || worktree.isMergeInProgress) {
      setTabState("changes")
    }
  }, [
    isVersioningEnabled,
    syncStatus,
    worktree.hasChanges,
    worktree.isMergeInProgress,
  ])

  useEffect(() => {
    if (isVersioningEnabled && tab === "changes" && worktree.hasChanges) {
      fetchDiff("HEAD", undefined, "rows")
    }
  }, [isVersioningEnabled, tab, worktree.hasChanges, fetchDiff])

  useEffect(() => {
    if (isVersioningEnabled && tab === "sync") {
      refreshStatus()
    }
  }, [isVersioningEnabled, tab, refreshStatus])

  const handleSyncRefresh = async () => {
    await fetch()
    await refreshStatus()
  }

  const notifySyncActionError = (title: string, e: any) => {
    eidos.currentSpace.notify({
      title,
      description: e?.message ?? "Unknown error",
    })
  }

  const handlePullRemoteChanges = async () => {
    try {
      await handlePull()
      await Promise.all([fetchLog(), fetchStatus()])
    } catch (e: any) {
      notifySyncActionError("Failed to pull changes", e)
    }
  }

  const handleMergeRemoteChanges = async () => {
    try {
      await handlePull()
      await Promise.all([
        fetchLog(),
        fetchStatus(),
        fetchDiff("HEAD", undefined, "rows").catch(() => undefined),
      ])
      setTab("changes")
    } catch (e: any) {
      notifySyncActionError("Failed to merge remote changes", e)
    }
  }

  const handlePushLocalChanges = async () => {
    try {
      await handlePush()
      await Promise.all([fetchLog(), fetchStatus()])
    } catch (e: any) {
      notifySyncActionError("Failed to push changes", e)
    }
  }

  const handleChangesRefresh = async () => {
    await Promise.all([
      fetchStatus(),
      worktree.hasChanges
        ? fetchDiff("HEAD", undefined, "rows")
        : Promise.resolve(),
    ])
  }

  const handleHistoryRefresh = async () => {
    await Promise.all([fetchLog(), fetchStatus()])
  }

  const handleConfirmLsnReset = async () => {
    if (!pendingBranchReset) return
    await resetTo(pendingBranchReset.lsn, pendingBranchReset.mode)
    setPendingBranchReset(null)
    fetchLog()
  }

  const handleCommit = async () => {
    const trimmedMessage = commitMessage.trim()
    if (!trimmedMessage) {
      commitInputRef.current?.focus()
      return
    }

    try {
      const result: any = await commit(trimmedMessage)
      await fetchLog()
      await fetchStatus()
      if (result?.empty) {
        eidos.currentSpace.notify({
          title: "No changes to commit",
          description: "Working tree is clean.",
        })
      } else {
        setCommitMessage("")
      }
    } catch (e: any) {
      eidos.currentSpace.notify({
        title: "Failed to commit changes",
        description: e?.message ?? "Unknown error",
      })
    }
  }

  const handleCompleteMerge = async () => {
    try {
      const message = commitMessage.trim() || "Merge remote changes"
      await completeMerge(message)
      setCommitMessage("")
      await fetchLog()
      await fetchStatus()
      eidos.currentSpace.notify({
        title: "Merge completed",
        description: "Remote changes are now part of this space history.",
      })
    } catch (e: any) {
      eidos.currentSpace.notify({
        title: "Failed to complete merge",
        description: e?.message ?? "Unknown error",
      })
    }
  }

  const handleAbortMerge = async () => {
    try {
      await abortMerge()
      setCommitMessage("")
      await Promise.all([fetchLog(), fetchStatus()])
      eidos.currentSpace.notify({
        title: "Merge aborted",
        description: "The space is back at the local branch state.",
      })
    } catch (e: any) {
      eidos.currentSpace.notify({
        title: "Failed to abort merge",
        description: e?.message ?? "Unknown error",
      })
    }
  }

  const handleDiscardWorktreeChanges = async () => {
    try {
      await resetTo("HEAD")
    } catch (e: any) {
      eidos.currentSpace.notify({
        title: "Failed to discard changes",
        description: e?.message ?? "Unknown error",
      })
    }
  }

  const handleViewWorktreeChanges = (table?: string) => {
    const url = getWorktreeDiffUrl(table)
    if (focusWorktreeDiffTab(url)) return
    navigate(url)
  }

  const handleOpenConflicts = () => {
    navigate("/graft/conflicts")
  }

  const getRelativeTime = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)
    const diffHours = Math.floor(diffMinutes / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffSeconds < 60) return "just now"
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const getStatusText = () => {
    if (!syncStatus) return "Unknown"
    if (syncStatus.workflow?.statusLabel) {
      return syncStatus.workflow.statusLabel
    }
    if (worktree.canCompleteMerge) return "Merge ready"
    if (worktree.isMergeInProgress) return "Merge in progress"
    if (syncStatus.status === "up_to_date") return "Up to date"

    const parts = []
    if (syncStatus.ahead && syncStatus.ahead > 0) {
      parts.push(
        `${syncStatus.ahead} commit${syncStatus.ahead > 1 ? "s" : ""} ahead`
      )
    }
    if (syncStatus.behind && syncStatus.behind > 0) {
      parts.push(
        `${syncStatus.behind} commit${syncStatus.behind > 1 ? "s" : ""} behind`
      )
    }

    if (parts.length > 0) {
      return parts.join(", ")
    }

    return "Unknown"
  }

  const canPull =
    !worktree.isMergeInProgress && workflowAllows(syncStatus, "pull")
  const canPush =
    !worktree.isMergeInProgress && workflowAllows(syncStatus, "push")
  const canMergeRemote =
    !worktree.isMergeInProgress && workflowAllows(syncStatus, "merge")
  const isSyncActionLoading = isPulling || isPushing || isFetching

  const getSyncTabBadge = () => {
    if (!syncStatus || syncStatus.status === "up_to_date") return null
    if (syncStatus.status === "ahead") return `↑${syncStatus.ahead || 0}`
    if (syncStatus.status === "behind") return `↓${syncStatus.behind || 0}`
    if (syncStatus.status === "diverged") {
      return `↑${syncStatus.ahead || 0} ↓${syncStatus.behind || 0}`
    }
    return null
  }

  const getSyncTabBadgeClassName = () => {
    if (syncStatus?.status === "ahead") {
      return "bg-emerald-500/10 text-emerald-700"
    }
    if (syncStatus?.status === "behind") {
      return "bg-rose-500/10 text-rose-700"
    }
    if (syncStatus?.status === "diverged") {
      return "bg-amber-500/10 text-amber-700"
    }
    return ""
  }

  const headLsn = useMemo(() => log?.entries?.[0]?.lsn, [log])
  const pendingResetShortId = pendingBranchReset?.lsn.slice(0, 12)
  const canFocusCommit = isVersioningEnabled && worktree.hasChanges
  const canCommit =
    canFocusCommit && commitMessage.trim().length > 0 && !isCommitLoading
  const handleTabRefresh =
    tab === "changes"
      ? handleChangesRefresh
      : tab === "history"
        ? handleHistoryRefresh
        : handleSyncRefresh
  const isTabRefreshLoading =
    tab === "changes"
      ? isStatusLoading || isDiffLoading
      : tab === "history"
        ? isLogLoading || isStatusLoading
        : isActiveFetching || isStatusLoading || isFetching
  const isTabRefreshDisabled =
    !isVersioningEnabled || (tab === "sync" && !isSyncEnabled)

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header + Tabs merged */}
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-1">
        <div className="flex items-center gap-1">
          <TabButton
            active={tab === "changes"}
            onClick={() => setTab("changes")}
            badge={worktree.hasChanges ? worktree.count : undefined}
            badgeClassName="bg-amber-500/10 text-amber-700"
          >
            Changes
          </TabButton>
          <span className="text-muted-foreground/20 text-xs">/</span>
          <TabButton
            active={tab === "history"}
            onClick={() => setTab("history")}
            badge={log && !log.isEmpty ? log.entries.length : undefined}
            badgeClassName="bg-muted text-muted-foreground"
          >
            History
          </TabButton>
          {isVersioningEnabled ? (
            <>
              <span className="text-muted-foreground/20 text-xs">/</span>
              <TabButton
                active={tab === "sync"}
                onClick={() => setTab("sync")}
                badge={getSyncTabBadge()}
                badgeClassName={getSyncTabBadgeClassName()}
              >
                Sync
              </TabButton>
            </>
          ) : null}
        </div>
        <div className="flex h-6 items-center justify-end">
          <ToolButton
            icon={RefreshCw}
            onClick={handleTabRefresh}
            loading={isTabRefreshLoading}
            disabled={isTabRefreshDisabled}
            tooltip="Refresh"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {!isVersioningEnabled ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
            <div>
              <h3 className="text-sm font-medium">
                Version History Not Enabled
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {isDesktop
                  ? "Enable local version history to track changes and browse commit history."
                  : "Enable local version history or sync in space settings to use Graft features."}
              </p>
            </div>
            {isDesktop ? (
              <Button
                size="sm"
                onClick={handleEnableVersioning}
                disabled={isEnabling}
              >
                {isEnabling ? (
                  <LoaderIcon className="mr-2 h-3 w-3 animate-spin" />
                ) : null}
                Enable Version History
              </Button>
            ) : null}
          </div>
        ) : tab === "changes" ? (
          <div className="flex h-full flex-col overflow-hidden">
            {worktree.hasChanges ? (
              <WorktreeChangesPanel
                status={syncStatus}
                isStatusLoading={isStatusLoading}
                diff={worktreeDiff}
                isDiffLoading={isDiffLoading}
                onOpenTable={handleViewWorktreeChanges}
                isCommitLoading={isCommitLoading}
                isCompletingMerge={isCompletingMerge}
                isAbortingMerge={isAbortingMerge}
                onOpenConflicts={handleOpenConflicts}
                onCommit={handleCommit}
                onCompleteMerge={handleCompleteMerge}
                onAbortMerge={handleAbortMerge}
                canCommit={canCommit}
                onDiscard={handleDiscardWorktreeChanges}
                canDiscard={worktree.hasChanges}
                isDiscardLoading={isResetLoading}
                message={commitMessage}
                onMessageChange={setCommitMessage}
                inputRef={commitInputRef}
              />
            ) : (
              <CleanWorktreePanel
                status={syncStatus}
                isLoading={isStatusLoading}
              />
            )}
          </div>
        ) : tab === "history" ? (
          <div className="flex h-full flex-col overflow-hidden">
            {isLogLoading && !log ? (
              <div className="flex items-center gap-2 px-3 py-6 text-xs text-muted-foreground">
                <LoaderIcon className="h-3 w-3 animate-spin" />
                Loading commit history...
              </div>
            ) : (
              <CommitHistoryList
                log={log}
                loading={isLogLoading}
                onRefresh={fetchLog}
                onReset={(lsn, mode) => {
                  if (lsn === headLsn) return
                  setPendingBranchReset({ lsn, mode })
                }}
                isResetting={isResetLoading}
                syncStatus={syncStatus}
                remoteLsnCacheId={isSyncEnabled ? ctx.space : undefined}
                onNavigateShow={(lsn, from) => {
                  navigate(`/graft/commit/${lsn}${from ? `?from=${from}` : ""}`)
                }}
              />
            )}
          </div>
        ) : tab === "sync" ? (
          isSyncEnabled ? (
            <StatusTab
              syncStatus={syncStatus}
              lastUpdated={lastUpdated}
              branches={branches}
              graftInfo={graftInfo}
              auditResult={auditResult}
              getStatusText={getStatusText}
              getRelativeTime={getRelativeTime}
              worktree={worktree}
              onPull={handlePullRemoteChanges}
              onPush={handlePushLocalChanges}
              onMerge={handleMergeRemoteChanges}
              onOpenChanges={() => setTab("changes")}
              canPull={canPull}
              canPush={canPush}
              canMerge={canMergeRemote}
              isActionLoading={isSyncActionLoading}
            />
          ) : (
            <EnableSyncPanel spaceId={ctx.space} isDesktop={isDesktop} />
          )
        ) : null}
      </div>

      <AlertDialog
        open={pendingBranchReset !== null}
        onOpenChange={(open) => {
          if (!open) setPendingBranchReset(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingBranchReset?.mode === "soft"
                ? "Soft reset"
                : "Hard reset"}{" "}
              to {pendingResetShortId}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingBranchReset?.mode === "soft"
                ? "Move the current branch to this commit and keep later changes staged in the index."
                : "Move the current branch to this commit and discard later changes from the worktree."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmLsnReset}
              className={
                pendingBranchReset?.mode === "hard"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {pendingBranchReset?.mode === "soft"
                ? "Soft reset"
                : "Hard reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function WorktreeStatusBar({
  status,
  isLoading,
}: {
  status: any
  isLoading: boolean
}) {
  const worktree = getWorktreeState(status)
  const summary = worktree.hasChanges
    ? `${worktree.count} ${worktree.count === 1 ? "file" : "files"} changed`
    : "Working tree clean"
  const detail = worktree.hasChanges
    ? [
        worktree.canCompleteMerge ? "merge ready" : "",
        worktree.isMergeInProgress && !worktree.canCompleteMerge
          ? "merge in progress"
          : "",
        worktree.unstagedCount > 0 ? `${worktree.unstagedCount} unstaged` : "",
        worktree.stagedCount > 0 ? `${worktree.stagedCount} staged` : "",
        worktree.conflictedCount > 0
          ? `${worktree.conflictedCount} conflicted`
          : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "No local changes"

  return (
    <div
      className={cn(
        "border-b border-border/60 px-3 py-2",
        worktree.hasChanges ? "bg-amber-500/5" : "bg-muted/20"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium">
            {isLoading && !status ? "Checking working tree..." : summary}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {detail}
          </div>
        </div>
      </div>
    </div>
  )
}

function CleanWorktreePanel({
  status,
  isLoading,
}: {
  status: any
  isLoading: boolean
}) {
  return (
    <div className="flex h-full flex-col">
      <WorktreeStatusBar status={status} isLoading={isLoading} />
      <div className="flex flex-1 items-center justify-center px-4 text-center">
        <div>
          <GitCommitHorizontal className="mx-auto mb-2 h-5 w-5 text-muted-foreground/50" />
          <div className="text-xs font-medium">Working tree clean</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            No local changes.
          </div>
        </div>
      </div>
    </div>
  )
}

function WorktreeChangesPanel({
  status,
  isStatusLoading,
  diff,
  isDiffLoading,
  onOpenTable,
  isCommitLoading,
  isCompletingMerge,
  isAbortingMerge,
  onOpenConflicts,
  onCommit,
  onCompleteMerge,
  onAbortMerge,
  canCommit,
  onDiscard,
  canDiscard,
  isDiscardLoading,
  message,
  onMessageChange,
  inputRef,
}: {
  status: any
  isStatusLoading: boolean
  diff: any
  isDiffLoading: boolean
  onOpenTable: (table: string) => void
  isCommitLoading: boolean
  isCompletingMerge: boolean
  isAbortingMerge: boolean
  onOpenConflicts: () => void
  onCommit: () => void
  onCompleteMerge: () => void
  onAbortMerge: () => void
  canCommit: boolean
  onDiscard: () => void
  canDiscard: boolean
  isDiscardLoading: boolean
  message: string
  onMessageChange: (message: string) => void
  inputRef: React.RefObject<HTMLInputElement>
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const worktree = getWorktreeState(status)
  const primaryLoading = isCommitLoading || isCompletingMerge
  const isMergeReady = worktree.canCompleteMerge
  const hasMergeConflicts =
    worktree.isMergeInProgress && !worktree.canCompleteMerge
  const conflictAnalysis = getConflictAnalysis(status)
  const isAutoMergeCandidate = Boolean(
    conflictAnalysis?.canAutoMerge ?? conflictAnalysis?.can_auto_merge
  )
  const canRunPrimary = !hasMergeConflicts && (isMergeReady || canCommit)
  const rowsByTable = useMemo(() => groupDiffRowsByTable(diff?.rows), [diff])
  const opaqueChanges = useMemo(() => getOpaqueChanges(diff), [diff])
  const tableNames = useMemo(
    () => Object.keys(rowsByTable).sort(),
    [rowsByTable]
  )
  const semanticChangeCount = tableNames.length + opaqueChanges.length
  const changeCount = semanticChangeCount || worktree.count
  const changeLabel = semanticChangeCount
    ? [
        tableNames.length > 0
          ? `${tableNames.length} table${tableNames.length === 1 ? "" : "s"}`
          : "",
        opaqueChanges.length > 0 ? `${opaqueChanges.length} opaque` : "",
      ]
        .filter(Boolean)
        .join(", ")
    : `${worktree.count} ${worktree.count === 1 ? "file" : "files"}`

  return (
    <div className="border-b border-border/60 bg-background">
      <div className="space-y-2 px-2 py-2">
        {isMergeReady ? (
          <div className="rounded-sm border border-emerald-500/25 bg-emerald-500/5 p-2">
            <div className="flex items-start gap-2">
              <GitMerge className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <div className="text-xs font-medium text-emerald-700">
                  {isAutoMergeCandidate
                    ? "Auto-merge ready"
                    : "Auto-merged without conflicts"}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {isAutoMergeCandidate
                    ? "Complete the merge to apply compatible database changes."
                    : "Complete the merge to add remote changes to history."}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {hasMergeConflicts ? (
          <div className="rounded-sm border border-amber-500/25 bg-amber-500/5 p-2">
            <div className="flex items-start gap-2">
              <GitMerge className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-amber-700">
                  Merge conflict
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Auto-merge could not resolve this database file.
                </div>
                {worktree.conflictedPaths.length > 0 ? (
                  <div className="mt-1 space-y-0.5">
                    {worktree.conflictedPaths.map((path) => (
                      <div
                        key={path}
                        className="truncate font-mono text-[10px] text-muted-foreground"
                      >
                        {path}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {!hasMergeConflicts ? (
          <Input
            ref={inputRef}
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.nativeEvent.isComposing &&
                canRunPrimary
              ) {
                if (isMergeReady) {
                  onCompleteMerge()
                } else {
                  onCommit()
                }
              }
            }}
            disabled={primaryLoading}
            placeholder={isMergeReady ? "Merge message" : "Message"}
            className="h-8 w-full rounded-sm border-border/70 bg-background px-2 text-xs"
          />
        ) : null}

        {hasMergeConflicts ? (
          <div className="grid grid-cols-2 gap-1">
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onOpenConflicts}
            >
              <GitMerge className="mr-1.5 h-3 w-3" />
              Resolve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={onAbortMerge}
              disabled={isAbortingMerge}
            >
              {isAbortingMerge ? (
                <LoaderIcon className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <Undo2 className="mr-1.5 h-3 w-3" />
              )}
              Abort
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            className="h-7 w-full px-2 text-xs"
            onClick={isMergeReady ? onCompleteMerge : onCommit}
            disabled={!canRunPrimary || primaryLoading}
          >
            {primaryLoading ? (
              <LoaderIcon className="mr-1.5 h-3 w-3 animate-spin" />
            ) : isMergeReady ? (
              <GitMerge className="mr-1.5 h-3 w-3" />
            ) : (
              <GitCommitHorizontal className="mr-1.5 h-3 w-3" />
            )}
            {isMergeReady ? "Complete merge" : "Commit"}
          </Button>
        )}
      </div>

      <div className="border-t border-border/60">
        <div className="flex h-7 items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <ChevronRight className="h-3 w-3 rotate-90" />
          <span className="min-w-0 flex-1 truncate">Changes</span>
          <span className="shrink-0 text-[10px] font-medium tabular-nums">
            {isStatusLoading && !status ? "..." : changeCount}
          </span>
          <div className="ml-1 flex shrink-0 items-center gap-0.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmDiscard(true)}
                    disabled={
                      !canDiscard ||
                      worktree.isMergeInProgress ||
                      primaryLoading ||
                      isDiscardLoading ||
                      confirmDiscard
                    }
                  >
                    {isDiscardLoading ? (
                      <LoaderIcon className="h-3 w-3 animate-spin" />
                    ) : (
                      <Undo2 className="h-3 w-3" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {worktree.isMergeInProgress
                    ? "Abort merge before discarding changes"
                    : "Discard all uncommitted changes"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {confirmDiscard ? (
          <div className="mx-2 mb-1 rounded-sm border border-destructive/30 bg-destructive/5 p-2">
            <div className="text-xs font-medium text-destructive">
              Discard all changes?
            </div>
            <div className="mt-2 flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 flex-1 px-2 text-xs"
                onClick={() => setConfirmDiscard(false)}
                disabled={isDiscardLoading}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 flex-1 px-2 text-xs"
                onClick={() => {
                  setConfirmDiscard(false)
                  onDiscard()
                }}
                disabled={!canDiscard || isDiscardLoading}
              >
                {isDiscardLoading ? (
                  <LoaderIcon className="mr-1.5 h-3 w-3 animate-spin" />
                ) : (
                  <Undo2 className="mr-1.5 h-3 w-3" />
                )}
                Discard
              </Button>
            </div>
          </div>
        ) : null}

        {isDiffLoading && !diff ? (
          <div className="flex items-center gap-2 px-6 py-2 text-xs text-muted-foreground">
            <LoaderIcon className="h-3 w-3 animate-spin" />
            Loading diff...
          </div>
        ) : semanticChangeCount > 0 ? (
          <div className="pb-1">
            {tableNames.map((name) => {
              const rows = rowsByTable[name]
              const counts = countRowOps(rows)
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onOpenTable(name)}
                  className="flex h-7 w-full items-center gap-2 px-6 pr-2 text-left text-xs hover:bg-muted/40"
                >
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[10px] tabular-nums">
                    {counts.inserts > 0 ? (
                      <span className="text-emerald-600">
                        +{counts.inserts}
                      </span>
                    ) : null}
                    {counts.deletes > 0 ? (
                      <span className="text-rose-600">-{counts.deletes}</span>
                    ) : null}
                    {counts.updates > 0 ? (
                      <span className="text-amber-600">~{counts.updates}</span>
                    ) : null}
                    <span className="text-muted-foreground">{rows.length}</span>
                  </span>
                </button>
              )
            })}
            {opaqueChanges.map((change) => (
              <div
                key={`${change.table}-${change.change}-${change.reason}`}
                className="flex h-7 items-center justify-between gap-2 px-6 pr-2 text-xs text-muted-foreground"
              >
                <span className="min-w-0 truncate font-mono">
                  {change.owner || change.table}
                </span>
                <span className="shrink-0 uppercase">
                  {formatOpaqueReason(change)}
                </span>
              </div>
            ))}
          </div>
        ) : diff?.files?.length ? (
          <div className="pb-1 text-xs text-muted-foreground">
            {diff.files.map((file: any) => (
              <div
                key={`${file.path}-${file.change}`}
                className="flex h-7 items-center justify-between gap-2 px-6 pr-2"
              >
                <span className="min-w-0 truncate font-mono">{file.path}</span>
                <span className="shrink-0 uppercase">{file.change}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-2 text-xs text-muted-foreground">
            {isDiffLoading ? "Loading table diff..." : `${changeLabel} changed`}
          </div>
        )}
      </div>
    </div>
  )
}

function groupDiffRowsByTable(rows: any[] | undefined) {
  const grouped: Record<string, any[]> = {}
  for (const row of rows ?? []) {
    const table = String(row?.table ?? "unknown")
    if (!grouped[table]) grouped[table] = []
    grouped[table].push(row)
  }
  return grouped
}

type OpaqueChange = {
  table: string
  change: string
  reason: string
  owner?: string
}

function getOpaqueChanges(diff: any): OpaqueChange[] {
  const changes = Array.isArray(diff?.opaqueChanges)
    ? diff.opaqueChanges
    : Array.isArray(diff?.opaque_changes)
      ? diff.opaque_changes
      : []
  const normalized = changes
    .map((change: any) => ({
      table: String(change?.table ?? change?.name ?? ""),
      change: String(change?.change ?? "modified"),
      reason: String(change?.reason ?? "opaque"),
      owner:
        change?.owner === undefined || change?.owner === null
          ? undefined
          : String(change.owner),
    }))
    .filter((change: any) => change.table || change.owner)
  return Array.from(
    new Map<string, OpaqueChange>(
      normalized.map((change: OpaqueChange) => [
        `${change.owner || change.table}:${change.reason}:${change.change}`,
        change,
      ])
    ).values()
  )
}

function formatOpaqueReason(change: OpaqueChange) {
  if (change.reason === "fts_shadow_table") return `FTS ${change.change}`
  if (change.reason === "virtual_table") return `virtual ${change.change}`
  return change.change
}

function countRowOps(rows: any[]) {
  return {
    inserts: rows.filter((row) => row.op === "insert").length,
    deletes: rows.filter((row) => row.op === "delete").length,
    updates: rows.filter((row) => row.op === "update").length,
  }
}

interface ProviderInfo {
  id: string
  name: string
  hasCredentials: boolean
}

function EnableSyncPanel({
  spaceId,
  isDesktop,
}: {
  spaceId: string
  isDesktop: boolean
}) {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [selected, setSelected] = useState<string>("")
  const [isEnablingSync, setIsEnablingSync] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!isDesktop) return
    ;(async () => {
      try {
        const config = await window.eidos.config.get("sync")
        const list: ProviderInfo[] = []

        // eidos.space (built-in)
        const eidosCreds =
          await window.eidos.credentials.hasSyncCredentials("eidos.space")
        list.push({
          id: "eidos.space",
          name: "eidos.space",
          hasCredentials: eidosCreds,
        })

        // Custom providers
        if (config?.providers) {
          for (const [id, p] of Object.entries(config.providers) as any) {
            const hasCreds =
              await window.eidos.credentials.hasSyncCredentials(id)
            list.push({ id, name: p.name || id, hasCredentials: hasCreds })
          }
        }

        setProviders(list)
        const defaultId = config?.defaultProvider || "eidos.space"
        setSelected(
          list.some((p) => p.id === defaultId) ? defaultId : list[0]?.id || ""
        )
      } catch (e) {
        console.error("Failed to load providers:", e)
        setError("Failed to load sync providers.")
      }
    })()
  }, [isDesktop])

  const handleEnableSync = async () => {
    if (!selected) return
    setIsEnablingSync(true)
    setError("")
    try {
      const provider = providers.find((p) => p.id === selected)
      if (!provider || !provider.hasCredentials) {
        setError(
          "Please configure credentials for the selected provider first."
        )
        setIsEnablingSync(false)
        return
      }

      const remote =
        selected === "eidos.space"
          ? `https://eidos.space/${spaceId}`
          : `s3://custom/${spaceId}`

      const result = await window.eidos.spaceMgmt.toggleSpaceSync(
        spaceId,
        true,
        remote,
        selected as "eidos.space" | "custom"
      )

      if (result.success) {
        window.location.reload()
      } else {
        setError(result.error || "Failed to enable remote sync.")
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to enable remote sync.")
    } finally {
      setIsEnablingSync(false)
    }
  }

  if (!isDesktop) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-sm text-muted-foreground">
          Remote sync is only available on desktop.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Enable Remote Sync</h3>
        <p className="text-xs text-muted-foreground">
          Choose a provider to push your local history to and enable
          bi-directional sync.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {/* Provider List */}
      <div className="space-y-2">
        {providers.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p.id)}
            disabled={!p.hasCredentials}
            className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
              selected === p.id
                ? "border-primary bg-primary/5"
                : "border-border hover:border-border/80"
            } ${!p.hasCredentials ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <div className="mt-0.5">
              <div
                className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                  selected === p.id
                    ? "border-primary"
                    : "border-muted-foreground"
                }`}
              >
                {selected === p.id ? (
                  <div className="h-2 w-2 rounded-full bg-primary" />
                ) : null}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{p.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {p.hasCredentials ? "Credentials configured" : "No credentials"}
              </div>
            </div>
          </button>
        ))}
      </div>

      <Button
        size="sm"
        className="w-full"
        onClick={handleEnableSync}
        disabled={
          isEnablingSync ||
          !selected ||
          !providers.find((p) => p.id === selected)?.hasCredentials
        }
      >
        {isEnablingSync ? (
          <LoaderIcon className="mr-2 h-3 w-3 animate-spin" />
        ) : null}
        Enable Remote Sync
      </Button>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  badge,
  badgeClassName,
  children,
}: {
  active: boolean
  onClick: () => void
  badge?: React.ReactNode
  badgeClassName?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground/60 hover:text-muted-foreground"
      )}
    >
      <span>{children}</span>
      {badge !== undefined && badge !== null ? (
        <span
          className={cn(
            "rounded-sm px-1 py-px text-[9px] font-medium leading-none tracking-normal tabular-nums",
            badgeClassName
          )}
        >
          {badge}
        </span>
      ) : null}
    </button>
  )
}

interface StatusTabProps {
  syncStatus: any
  lastUpdated: Date | null
  branches: any
  graftInfo: any
  auditResult: any
  getStatusText: () => string
  getRelativeTime: (date: Date) => string
  worktree: ReturnType<typeof getWorktreeState>
  onPull: () => void
  onPush: () => void
  onMerge: () => void
  onOpenChanges: () => void
  canPull: boolean
  canPush: boolean
  canMerge: boolean
  isActionLoading: boolean
}

function StatusTab({
  syncStatus,
  lastUpdated,
  branches,
  graftInfo,
  auditResult,
  getStatusText,
  getRelativeTime,
  worktree,
  onPull,
  onPush,
  onMerge,
  onOpenChanges,
  canPull,
  canPush,
  canMerge,
  isActionLoading,
}: StatusTabProps) {
  const snapshotSizeLabel = formatByteSize(graftInfo?.snapshotSize)
  const snapshotSizeTitle =
    graftInfo?.snapshotSize === undefined || graftInfo?.snapshotSize === null
      ? undefined
      : `${graftInfo.snapshotSize} bytes`

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">Status</h3>

        {/* Detailed Status */}
        <div className="space-y-2 text-sm">
          {syncStatus ? (
            <>
              {syncStatus.currentBranch ? (
                <p>
                  <span className="text-muted-foreground">Branch:</span>{" "}
                  {syncStatus.currentBranch}
                </p>
              ) : null}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <p>
                    <span className="text-muted-foreground mr-1">Status:</span>
                    <span className="font-medium text-foreground">
                      {getStatusText()}
                    </span>
                  </p>
                  {lastUpdated ? (
                    <span className="text-[10px] text-muted-foreground">
                      {getRelativeTime(lastUpdated)}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5 py-1">
                  <div className="flex h-1.5 flex-1 items-stretch rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className={cn(
                        "transition-all duration-500 ease-out flex-shrink-0",
                        (syncStatus.ahead || 0) > 0
                          ? "bg-green-500"
                          : "bg-muted"
                      )}
                      style={{
                        width: `${
                          (syncStatus.ahead || 0) > 0 &&
                          (syncStatus.behind || 0) > 0
                            ? Math.max(
                                15,
                                ((syncStatus.ahead || 0) /
                                  ((syncStatus.ahead || 0) +
                                    (syncStatus.behind || 0))) *
                                  100
                              )
                            : (syncStatus.ahead || 0) > 0
                              ? 100
                              : 0
                        }%`,
                        opacity: (syncStatus.ahead || 0) > 0 ? 1 : 0.3,
                      }}
                    />
                    <div
                      className={cn(
                        "transition-all duration-500 ease-out flex-shrink-0",
                        (syncStatus.behind || 0) > 0 ? "bg-red-500" : "bg-muted"
                      )}
                      style={{
                        width: `${
                          (syncStatus.ahead || 0) > 0 &&
                          (syncStatus.behind || 0) > 0
                            ? Math.max(
                                15,
                                ((syncStatus.behind || 0) /
                                  ((syncStatus.ahead || 0) +
                                    (syncStatus.behind || 0))) *
                                  100
                              )
                            : (syncStatus.behind || 0) > 0
                              ? 100
                              : 0
                        }%`,
                        opacity: (syncStatus.behind || 0) > 0 ? 1 : 0.3,
                        marginLeft:
                          (syncStatus.ahead || 0) > 0 &&
                          (syncStatus.behind || 0) > 0
                            ? "1px"
                            : "0",
                      }}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              Click refresh to fetch status
            </p>
          )}
        </div>
      </div>

      <SyncActionBand
        syncStatus={syncStatus}
        worktree={worktree}
        onPull={onPull}
        onPush={onPush}
        onMerge={onMerge}
        onOpenChanges={onOpenChanges}
        canPull={canPull}
        canPush={canPush}
        canMerge={canMerge}
        isLoading={isActionLoading}
      />

      {/* Info Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Info</h3>
        <div className="space-y-2 text-sm">
          {snapshotSizeLabel ? (
            <p title={snapshotSizeTitle}>
              <span className="text-muted-foreground">Size:</span>{" "}
              {snapshotSizeLabel}
            </p>
          ) : null}
          {auditResult &&
          auditResult.localPages !== undefined &&
          auditResult.totalPages !== undefined ? (
            <p>
              <span className="text-muted-foreground">Cached:</span>{" "}
              {auditResult.localPages} / {auditResult.totalPages} pages
              {auditResult.percentage !== undefined ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({auditResult.percentage}%)
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      {/* Branches Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Branches</h3>
        <div className="space-y-2">
          {Array.isArray(branches) && branches.length > 0 ? (
            branches.map((branch: any) => (
              <div
                key={branch.name}
                className={cn(
                  "rounded-lg border p-2 text-xs transition-colors",
                  branch.isCurrent
                    ? "border-primary/30 bg-primary/5 ring-1 ring-primary/20"
                    : "border-border/40 bg-muted/20"
                )}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-semibold">
                    {branch.name}
                    {branch.isCurrent ? (
                      <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-primary">
                        Current
                      </span>
                    ) : null}
                  </span>
                  {branch.status ? (
                    <span className="rounded border border-border/40 bg-background/50 px-1.5 py-0.5 text-[10px] text-muted-foreground opacity-80">
                      {branch.status}
                    </span>
                  ) : null}
                </div>
                <div className="space-y-1 font-mono text-[9px] text-muted-foreground/80">
                  {branch.volumeId ? (
                    <p className="flex justify-between gap-2 overflow-hidden">
                      <span className="shrink-0">Rev:</span>
                      <span className="truncate">{branch.volumeId}</span>
                    </p>
                  ) : null}
                  {branch.local ? (
                    <p className="flex justify-between gap-2 overflow-hidden">
                      <span className="shrink-0">Loc:</span>
                      <span className="truncate">{branch.local}</span>
                    </p>
                  ) : null}
                  {branch.remote ? (
                    <p className="flex justify-between gap-2 overflow-hidden">
                      <span className="shrink-0">Rem:</span>
                      <span className="truncate text-foreground/70">
                        {branch.remote}
                      </span>
                    </p>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-border/40 bg-muted/30 p-3 text-xs italic text-muted-foreground">
              No branch data available
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SyncActionBand({
  syncStatus,
  worktree,
  onPull,
  onPush,
  onMerge,
  onOpenChanges,
  canPull,
  canPush,
  canMerge,
  isLoading,
}: {
  syncStatus: any
  worktree: ReturnType<typeof getWorktreeState>
  onPull: () => void
  onPush: () => void
  onMerge: () => void
  onOpenChanges: () => void
  canPull: boolean
  canPush: boolean
  canMerge: boolean
  isLoading: boolean
}) {
  const workflow = syncStatus?.workflow
  const primaryAction = workflow?.primaryAction
  const action = (() => {
    if (worktree.canCompleteMerge) {
      return {
        icon: GitMerge,
        title: "Review merge",
        buttonLabel: "Review",
        description:
          "Remote changes are applied; complete the merge in Changes.",
        onClick: onOpenChanges,
        disabled: false,
      }
    }
    if (worktree.isMergeInProgress) {
      return {
        icon: GitMerge,
        title: "Resolve merge",
        buttonLabel: "Resolve",
        description: `${worktree.conflictedCount || "Some"} conflict${
          worktree.conflictedCount === 1 ? "" : "s"
        } need attention in Changes.`,
        onClick: onOpenChanges,
        disabled: false,
      }
    }
    if (primaryAction === "commit") {
      return {
        icon: GitCommitHorizontal,
        title: "Commit local changes first",
        buttonLabel: "Changes",
        description:
          workflow?.description ||
          "Commit or discard local changes before syncing with the remote.",
        onClick: onOpenChanges,
        disabled: false,
      }
    }
    if (primaryAction === "merge" || syncStatus?.status === "diverged") {
      return {
        icon: GitMerge,
        title: "Merge remote changes",
        buttonLabel: "Merge",
        description: `${syncStatus.ahead || 0} local, ${
          syncStatus.behind || 0
        } remote commit${(syncStatus.behind || 0) === 1 ? "" : "s"}.`,
        onClick: onMerge,
        disabled: !canMerge,
      }
    }
    if (primaryAction === "pull" || syncStatus?.status === "behind") {
      return {
        icon: GitPullRequest,
        title: "Pull changes",
        buttonLabel: "Pull",
        description: `${syncStatus.behind || 0} remote commit${
          (syncStatus.behind || 0) === 1 ? "" : "s"
        } ready.`,
        onClick: onPull,
        disabled: !canPull,
      }
    }
    if (primaryAction === "push" || syncStatus?.status === "ahead") {
      return {
        icon: ArrowUpFromLine,
        title: "Push changes",
        buttonLabel: "Push",
        description: `${syncStatus.ahead || 0} local commit${
          (syncStatus.ahead || 0) === 1 ? "" : "s"
        } ready.`,
        onClick: onPush,
        disabled: !canPush,
      }
    }
    return null
  })()

  if (!action) return null
  const Icon = action.icon

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-background text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{action.title}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {action.description}
          </div>
        </div>
        <Button
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={action.onClick}
          disabled={action.disabled || isLoading}
        >
          {isLoading ? (
            <LoaderIcon className="mr-1.5 h-3 w-3 animate-spin" />
          ) : (
            <Icon className="mr-1.5 h-3 w-3" />
          )}
          {action.buttonLabel}
        </Button>
      </div>
    </div>
  )
}

const ToolButton = ({
  icon: Icon,
  onClick,
  loading,
  disabled,
  tooltip,
}: {
  icon: any
  onClick: () => void
  loading: boolean
  disabled?: boolean
  tooltip: string
}) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="xs"
          variant="ghost"
          className="h-6 w-6 p-0 opacity-60"
          onClick={onClick}
          disabled={disabled || loading}
        >
          {loading ? (
            <LoaderIcon className="h-3 w-3 animate-spin" />
          ) : (
            <Icon className="h-3 w-3" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)
