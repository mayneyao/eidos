import { useEffect, useState } from "react"
import { useDebounceFn } from "ahooks"
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  GitPullRequest,
  List,
  RefreshCw,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  EidosDataEventChannelName,
  MsgType,
  type EidosDataEventChannelMsg,
} from "@/lib/const"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useCurrentSpaceId } from "@/apps/web-app/hooks/use-current-space"
import { useSpaceSyncStatus } from "@/apps/web-app/hooks/use-sync-status"
import { useSidebarStore } from "@/apps/web-app/store/sidebar-store"

export const GraftSidebar = () => {
  const { t } = useTranslation()
  const spaceId = useCurrentSpaceId()
  const { currentApp } = useSidebarStore()
  const {
    status: syncStatus,
    lastUpdated,
    isLoading: isStatusLoading,
    fetchStatus,
  } = useSpaceSyncStatus()

  const [isPulling, setIsPulling] = useState(false)
  const [isPushing, setIsPushing] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [isVolumesFetching, setIsVolumesFetching] = useState(false)
  const [isActiveFetching, setIsActiveFetching] = useState(false)

  // Debounced fetchStatus to prevent excessive calls
  const { run: debouncedFetchStatus } = useDebounceFn(fetchStatus, {
    wait: 300,
  })

  // Auto-refresh status when graft tab becomes active
  useEffect(() => {
    if (currentApp === "graft" && spaceId) {
      // Small delay to ensure smooth tab transition
      fetchStatus()
    }
  }, [currentApp, spaceId, fetchStatus])

  useEffect(() => {
    const bc = new BroadcastChannel(EidosDataEventChannelName)

    const handler = async (ev: MessageEvent<EidosDataEventChannelMsg>) => {
      debouncedFetchStatus()
    }

    bc.addEventListener("message", handler)
    return () => {
      bc.removeEventListener("message", handler)
      bc.close()
    }
  }, [debouncedFetchStatus])

  const handlePull = async () => {
    if (!spaceId || isPulling) return

    setIsPulling(true)
    try {
      await window.eidos.invoke(MsgType.Pull, { spaceName: spaceId })
      await fetchStatus() // Refresh status after pull
    } catch (error) {
      console.error("Failed to pull:", error)
    } finally {
      setIsPulling(false)
    }
  }

  const handlePush = async () => {
    if (!spaceId || isPushing) return

    setIsPushing(true)
    try {
      await window.eidos.invoke(MsgType.Push, { spaceName: spaceId })
      await fetchStatus() // Refresh status after push
    } catch (error) {
      console.error("Failed to push:", error)
    } finally {
      setIsPushing(false)
    }
  }

  const handleFetch = async () => {
    if (isFetching) return
    await fetchStatus()
  }

  const handleVolumes = async () => {
    if (!spaceId || isVolumesFetching) return

    setIsVolumesFetching(true)
    try {
      const res = await window.eidos.invoke(MsgType.Volumes, {
        spaceName: spaceId,
      })
      console.log("handleVolumes: Volumes fetched successfully:", res)
    } catch (error) {
      console.error("Failed to fetch volumes:", error)
    } finally {
      setIsVolumesFetching(false)
    }
  }

  const handleActiveFetch = async () => {
    if (!spaceId || isActiveFetching) return

    setIsActiveFetching(true)
    try {
      await window.eidos.invoke(MsgType.Fetch, { spaceName: spaceId })
      await fetchStatus() // Refresh status after fetch
    } catch (error) {
      console.error("Failed to fetch:", error)
    } finally {
      setIsActiveFetching(false)
    }
  }

  const getStatusIcon = () => {
    if (isStatusLoading) return "⟳"
    if (!syncStatus) return "?"

    switch (syncStatus.status) {
      case "up_to_date":
        return "✓"
      case "ahead":
        return `↑${syncStatus.commitDiff}`
      case "behind":
        return `↓${syncStatus.commitDiff}`
      case "diverged":
        return "↕"
      default:
        return "?"
    }
  }

  const getStatusColor = () => {
    if (isStatusLoading || !syncStatus) return ""

    switch (syncStatus.status) {
      case "up_to_date":
        return "text-green-600"
      case "ahead":
        return "text-blue-600"
      case "behind":
        return "text-orange-600"
      case "diverged":
        return "text-red-600"
      default:
        return ""
    }
  }

  const getSummaryTheme = () => {
    if (!syncStatus) return "from-primary/5 to-primary/10 border-primary/20"

    switch (syncStatus.status) {
      case "up_to_date":
        return "from-green-500/5 to-green-500/10 border-green-500/20"
      case "ahead":
        return "from-blue-500/5 to-blue-500/10 border-blue-500/20"
      case "behind":
        return "from-orange-500/5 to-orange-500/10 border-orange-500/20"
      case "diverged":
        return "from-red-500/5 to-red-500/10 border-red-500/20"
      default:
        return "from-primary/5 to-primary/10 border-primary/20"
    }
  }

  const getDotColor = () => {
    if (!syncStatus) return "bg-primary"

    switch (syncStatus.status) {
      case "up_to_date":
        return "bg-green-500"
      case "ahead":
        return "bg-blue-500"
      case "behind":
        return "bg-orange-500"
      case "diverged":
        return "bg-red-500"
      default:
        return "bg-primary"
    }
  }

  const getStatusText = () => {
    if (!syncStatus) return "Unknown"

    switch (syncStatus.status) {
      case "up_to_date":
        return "Up to date"
      case "ahead":
        return `Ahead by ${syncStatus.commitDiff} commits`
      case "behind":
        return `Behind by ${syncStatus.commitDiff} commits`
      case "diverged":
        return "Diverged"
      default:
        return "Unknown"
    }
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
        return `${syncStatus.commitDiff} ahead`

      case "behind":
        return `${syncStatus.commitDiff} behind`

      case "diverged":
        return "Diverged"

      default:
        return getStatusText()
    }
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-1">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Graft</h2>
          {syncStatus && (
            <span className={`text-sm ${getStatusColor()}`}>
              {getStatusSummary()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-6 w-6 p-0 opacity-60"
                  onClick={handleVolumes}
                  disabled={isVolumesFetching}
                  title="Fetch volumes"
                >
                  {isVolumesFetching ? (
                    <div className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full" />
                  ) : (
                    <List className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Fetch volumes</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {/* Fetch Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-6 w-6 p-0 opacity-60"
                  onClick={handleActiveFetch}
                  disabled={isActiveFetching}
                  title="Fetch changes"
                >
                  {isActiveFetching ? (
                    <div className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full" />
                  ) : (
                    <ArrowDownToLine className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Fetch latest changes from remote</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Pull Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-6 w-6 p-0 opacity-60"
                  onClick={handlePull}
                  disabled={!canPull || isPulling}
                  title="Pull changes"
                >
                  {isPulling ? (
                    <div className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full" />
                  ) : (
                    <GitPullRequest className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Pull latest changes</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Push Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-6 w-6 p-0 opacity-60"
                  onClick={handlePush}
                  disabled={!canPush || isPushing}
                  title="Push changes"
                >
                  {isPushing ? (
                    <div className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full" />
                  ) : (
                    <ArrowUpFromLine className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Push local changes</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Refresh Status Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-6 w-6 p-0 opacity-60"
                  onClick={handleFetch}
                  disabled={isStatusLoading || isFetching}
                  title="Refresh sync status"
                >
                  {isStatusLoading || isFetching ? (
                    <div className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh sync status</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Status Info */}
      <div className="flex-1 space-y-4 p-4 overflow-y-auto">
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Repository Status</h3>

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
                <p>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  {getStatusText()}
                </p>
                {syncStatus.localLogId && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Local:</span>{" "}
                    {syncStatus.localLogId}
                  </p>
                )}
                {syncStatus.remoteLogId && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Remote:</span>{" "}
                    {syncStatus.remoteLogId}
                  </p>
                )}
                {lastUpdated && (
                  <p className="text-xs text-muted-foreground">
                    Last updated: {lastUpdated.toLocaleTimeString()}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">
                Click refresh to fetch status
              </p>
            )}
          </div>
        </div>

        {/* Git Timeline */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Commit History</h3>
          <div className="space-y-2">
            {mockCommits.map((commit, index) => (
              <div key={commit.id} className="relative flex gap-3">
                {/* Timeline line */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-2 h-2 rounded-full mt-1 ${
                      commit.isLocalHead
                        ? "bg-blue-500"
                        : commit.isRemoteHead
                          ? "bg-green-500"
                          : "bg-gray-400"
                    }`}
                  />
                  {index < mockCommits.length - 1 && (
                    <div className="w-px h-4 bg-border mt-1" />
                  )}
                </div>

                {/* Commit content */}
                <div className="flex-1 flex items-start gap-2 pt-0.5">
                  <span className="text-xs font-mono text-muted-foreground min-w-0">
                    {commit.id.slice(0, 7)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {commit.date}
                  </span>
                  {commit.isLocalHead && (
                    <span className="px-1 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                      HEAD
                    </span>
                  )}
                  {commit.isRemoteHead && (
                    <span className="px-1 py-0.5 text-xs bg-green-100 text-green-800 rounded">
                      origin/main
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Mock commit data
const mockCommits = [
  {
    id: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    date: "2 hours ago",
    isLocalHead: true,
    isRemoteHead: false,
  },
  {
    id: "b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7",
    date: "3 hours ago",
    isLocalHead: false,
    isRemoteHead: true,
  },
  {
    id: "c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8",
    date: "5 hours ago",
    isLocalHead: false,
    isRemoteHead: false,
  },
  {
    id: "d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9",
    date: "8 hours ago",
    isLocalHead: false,
    isRemoteHead: false,
  },
  {
    id: "e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0",
    date: "12 hours ago",
    isLocalHead: false,
    isRemoteHead: false,
  },
  {
    id: "f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1",
    date: "1 day ago",
    isLocalHead: false,
    isRemoteHead: false,
  },
  {
    id: "g7h8i9j0k1l2m3n4o5p6q7r8s9t0u2",
    date: "2 days ago",
    isLocalHead: false,
    isRemoteHead: false,
  },
  {
    id: "h8i9j0k1l2m3n4o5p6q7r8s9t0u2v3",
    date: "3 days ago",
    isLocalHead: false,
    isRemoteHead: false,
  },
  {
    id: "i9j0k1l2m3n4o5p6q7r8s9t0u2v3w4",
    date: "4 days ago",
    isLocalHead: false,
    isRemoteHead: false,
  },
  {
    id: "j0k1l2m3n4o5p6q7r8s9t0u2v3w4x5",
    date: "5 days ago",
    isLocalHead: false,
    isRemoteHead: false,
  },
  {
    id: "k1l2m3n4o5p6q7r8s9t0u2v3w4x5y6",
    date: "6 days ago",
    isLocalHead: false,
    isRemoteHead: false,
  },
  {
    id: "l2m3n4o5p6q7r8s9t0u2v3w4x5y6z7",
    date: "1 week ago",
    isLocalHead: false,
    isRemoteHead: false,
  },
  {
    id: "m3n4o5p6q7r8s9t0u2v3w4x5y6z7a8",
    date: "8 days ago",
    isLocalHead: false,
    isRemoteHead: false,
  },
  {
    id: "n4o5p6q7r8s9t0u2v3w4x5y6z7a8b9",
    date: "9 days ago",
    isLocalHead: false,
    isRemoteHead: false,
  },
  {
    id: "o5p6q7r8s9t0u2v3w4x5y6z7a8b9c0",
    date: "10 days ago",
    isLocalHead: false,
    isRemoteHead: false,
  },
]
