/**
 * Graft Sidebar Block Extension
 */
import { useEffect, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpFromLine,
  GitPullRequest,
  RefreshCw,
  RotateCcw,
} from "lucide-react"

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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import {
  useEidos,
  useExtensionContext,
  type SidebarBlockContext,
} from "@eidos.space/react"
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
      "Synchronize your workspace with remote repositories using Git-like operations (pull, push, clone). View sync status, branch information, and commit history deviation.",
  },
}

export const GraftSidebar = () => {
  const ctx = useExtensionContext<SidebarBlockContext>()
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const {
    status: syncStatus,
    lastUpdated,
    isStatusLoading,
    isPulling,
    isPushing,
    isFetching,
    isActiveFetching,
    isCloning,
    tags,
    graftInfo,
    auditResult,
    pull: handlePull,
    push: handlePush,
    fetch,
    refreshStatus,
    clone,
  } = useGraft()

  // Auto-refresh status when graft tab becomes active
  useEffect(() => {
    refreshStatus()
    fetch()
  }, [refreshStatus, fetch])

  const handleClone = async () => {
    await clone()
    setShowResetConfirm(false)
  }

  const handleResetClick = () => {
    setShowResetConfirm(true)
  }

  const handleRefreshAndFetch = async () => {
    refreshStatus()
    fetch()
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
    syncStatus?.status === "behind" || syncStatus?.status === "diverged"
  const canPush =
    syncStatus?.status === "ahead" || syncStatus?.status === "diverged"

  const getStatusSummary = () => {
    if (!syncStatus) return "Loading..."

    switch (syncStatus.status) {
      case "up_to_date":
        return "Up to date"

      case "ahead":
        return (
          <span className="flex items-center gap-1 text-green-600 font-medium">
            <ArrowUp className="h-3 w-3" />
            {syncStatus.ahead || 0}
          </span>
        )

      case "behind":
        return (
          <span className="flex items-center gap-1 text-red-600 font-medium">
            <ArrowDown className="h-3 w-3" />
            {syncStatus.behind || 0}
          </span>
        )

      case "diverged":
        return (
          <span className="flex items-center gap-2 font-medium">
            <span className="flex items-center gap-1 text-green-600">
              <ArrowUp className="h-3 w-3" />
              {syncStatus.ahead || 0}
            </span>
            <span className="flex items-center gap-1 text-red-600">
              <ArrowDown className="h-3 w-3" />
              {syncStatus.behind || 0}
            </span>
          </span>
        )

      default:
        return getStatusText()
    }
  }

  const isSyncEnabled = ctx.syncEnabled ?? false

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 pl-4 pr-2 py-1">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Graft</h2>
          {syncStatus && <div className={`text-xs`}>{getStatusSummary()}</div>}
        </div>
        <div className="flex items-center gap-1">
          {syncStatus?.status === "behind" && (
            <ToolButton
              icon={GitPullRequest}
              onClick={handlePull}
              loading={isPulling}
              disabled={!canPull}
              tooltip="Pull latest changes"
            />
          )}
          {syncStatus?.status === "ahead" && (
            <>
              <ToolButton
                icon={ArrowUpFromLine}
                onClick={handlePush}
                loading={isPushing}
                disabled={!canPush}
                tooltip="Push local changes"
              />
              <ToolButton
                icon={RotateCcw}
                onClick={handleResetClick}
                loading={isCloning}
                disabled={false}
                tooltip="Reset to remote state"
              />
            </>
          )}
          {syncStatus?.status === "diverged" && (
            <ToolButton
              icon={RotateCcw}
              onClick={handleResetClick}
              loading={isCloning}
              disabled={false}
              tooltip="Reset to remote state"
            />
          )}
          <ToolButton
            icon={RefreshCw}
            onClick={handleRefreshAndFetch}
            loading={isActiveFetching || isStatusLoading || isFetching}
            tooltip="Fetch latest changes from remote"
          />
        </div>
      </div>

      {/* Status Info */}
      <div className="flex-1 space-y-4 p-4 overflow-y-auto">
        {!isSyncEnabled ? (
          <div className="flex flex-col items-center justify-center h-full px-4">
            <div className="text-center space-y-2">
              <h3 className="text-sm font-medium">Sync Not Enabled</h3>
              <p className="text-sm text-muted-foreground">
                This space doesn't have sync enabled. Enable sync in space settings to use Graft features.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Status</h3>

          {/* Detailed Status */}
          <div className="space-y-2 text-sm">
            {syncStatus ? (
              <>
                {syncStatus.currentBranch && (
                  <p>
                    <span className="text-muted-foreground">Branch:</span>{" "}
                    {syncStatus.currentBranch}
                  </p>
                )}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <p>
                      <span className="text-muted-foreground mr-1">
                        Status:
                      </span>
                      <span className="font-medium text-foreground">
                        {getStatusText()}
                      </span>
                    </p>
                    {lastUpdated && (
                      <span className="text-[10px] text-muted-foreground">
                        {getRelativeTime(lastUpdated)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 py-1">
                    <div className="flex h-1.5 flex-1 items-stretch rounded-full bg-muted/50 overflow-hidden">
                      <div
                        className={`transition-all duration-500 ease-out flex-shrink-0 ${
                          (syncStatus.ahead || 0) > 0
                            ? "bg-green-500"
                            : "bg-muted"
                        }`}
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
                        className={`transition-all duration-500 ease-out flex-shrink-0 ${
                          (syncStatus.behind || 0) > 0
                            ? "bg-red-500"
                            : "bg-muted"
                        }`}
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

        {/* Info Section */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Info</h3>
          <div className="space-y-2 text-sm">
            {graftInfo?.snapshotSize && (
              <p>
                <span className="text-muted-foreground">Size:</span>{" "}
                {graftInfo.snapshotSize}
              </p>
            )}
            {auditResult &&
              auditResult.localPages !== undefined &&
              auditResult.totalPages !== undefined && (
                <p>
                  <span className="text-muted-foreground">Cached:</span>{" "}
                  {auditResult.localPages} / {auditResult.totalPages} pages
                  {auditResult.percentage !== undefined && (
                    <span className="text-xs text-muted-foreground ml-1">
                      ({auditResult.percentage}%)
                    </span>
                  )}
                </p>
              )}
          </div>
        </div>

        {/* Tags Section */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Tags</h3>
          <div className="space-y-2">
            {tags && Array.isArray(tags) ? (
              tags.map((tag: any) => (
                <div
                  key={tag.name}
                  className={`rounded-lg border p-2 text-xs transition-colors ${
                    tag.isCurrent
                      ? "border-primary/30 bg-primary/5 ring-1 ring-primary/20"
                      : "border-border/40 bg-muted/20"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold flex items-center gap-1.5">
                      {tag.name}
                      {tag.isCurrent && (
                        <span className="bg-primary/20 text-primary text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider">
                          Current
                        </span>
                      )}
                    </span>
                    {tag.status && (
                      <span className="text-[10px] text-muted-foreground opacity-80 bg-background/50 px-1.5 py-0.5 rounded border border-border/40">
                        {tag.status}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 font-mono text-[9px] text-muted-foreground/80">
                    {tag.volumeId && (
                      <p className="flex justify-between gap-2 overflow-hidden">
                        <span className="shrink-0">Vol:</span>
                        <span className="truncate">{tag.volumeId}</span>
                      </p>
                    )}
                    {tag.local && (
                      <p className="flex justify-between gap-2 overflow-hidden">
                        <span className="shrink-0">Loc:</span>
                        <span className="truncate">{tag.local}</span>
                      </p>
                    )}
                    {tag.remote && (
                      <p className="flex justify-between gap-2 overflow-hidden">
                        <span className="shrink-0">Rem:</span>
                        <span className="truncate text-foreground/70">
                          {tag.remote}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-border/40 bg-muted/30 p-3 italic text-xs text-muted-foreground">
                No tags data available
              </div>
            )}
          </div>
        </div>
          </>
        )}
      </div>

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to Remote State</AlertDialogTitle>
            <AlertDialogDescription>
              This will discard all local changes and reset your repository to
              match the remote state. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClone}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
            <div className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full" />
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
