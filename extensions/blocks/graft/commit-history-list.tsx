/**
 * Commit history list for the graft sidebar.
 * Renders normalized Graft CLI log entries with quick actions (show, reset).
 * Navigates to route pages for detail/diff views.
 */
import { HistoryIcon, LoaderIcon, MoreHorizontal } from "lucide-react"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { useVirtualList } from "ahooks"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { GraftLogEntry, GraftLogResult } from "@eidos.space/sync"

const cn = (...classes: (string | boolean | undefined)[]) =>
  classes.filter(Boolean).join(" ")

const ROW_HEIGHT = 56
const REMOTE_LSN_CACHE_PREFIX = "eidos:graft:remote-rev:"

type SyncStatus = { ahead?: number; behind?: number; status?: string }
type CommitResetMode = "soft" | "hard"

const readCachedRemoteLsn = (key?: string) => {
  if (!key || typeof window === "undefined") return undefined
  return window.localStorage.getItem(key) || undefined
}

const writeCachedRemoteLsn = (key: string, lsn: string) => {
  if (typeof window === "undefined") return
  window.localStorage.setItem(key, lsn)
}

const removeCachedRemoteLsn = (key: string) => {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(key)
}

const resolveRemoteLsn = (
  entries: GraftLogEntry[],
  syncStatus?: SyncStatus | null
) => {
  if (entries.length === 0) return undefined
  const head = entries[0].lsn

  // Calculate remote tracking revision from sync status.
  // ahead=N means remote is N commits behind HEAD = entries[N].lsn.
  // behind=N means remote is N commits ahead (beyond our log), no exact entry.
  if (syncStatus?.status === "up_to_date") {
    return head
  }
  if (syncStatus?.status === "ahead" && (syncStatus.ahead ?? 0) > 0) {
    const idx = Math.min(syncStatus.ahead ?? 0, entries.length - 1)
    return entries[idx].lsn
  }
  if (syncStatus?.status === "diverged") {
    // For diverged, estimate remote at the split point.
    return entries[entries.length - 1]?.lsn
  }
  return undefined
}

const formatTime = (ms: number) => {
  const d = new Date(ms)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

const formatChangeScope = (entry: GraftLogEntry) => {
  if (entry.changedTables > 0) {
    return `${entry.changedTables} table${entry.changedTables === 1 ? "" : "s"}`
  }
  if (entry.changed > 0) {
    return `${entry.changed} page${entry.changed === 1 ? "" : "s"}`
  }
  return "database"
}

interface CommitListProps {
  log: GraftLogResult | null
  loading: boolean
  onRefresh: () => void
  onReset: (lsn: string, mode: CommitResetMode) => void
  isResetting: boolean
  /** Navigate to commit detail page. `from` is the previous commit for the Changes tab. */
  onNavigateShow: (lsn: string, from?: string) => void
  /** Sync status (for remote tracking indicator). */
  syncStatus?: SyncStatus | null
  /** LocalStorage key suffix used to keep the last known remote revision visible before status loads. */
  remoteLsnCacheId?: string
}

export function CommitHistoryList({
  log,
  loading,
  onRefresh,
  onReset,
  isResetting,
  onNavigateShow,
  syncStatus,
  remoteLsnCacheId,
}: CommitListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const remoteLsnCacheKey = remoteLsnCacheId
    ? `${REMOTE_LSN_CACHE_PREFIX}${remoteLsnCacheId}`
    : undefined
  const [cachedRemoteLsn, setCachedRemoteLsn] = useState<string | undefined>(
    () => readCachedRemoteLsn(remoteLsnCacheKey)
  )

  const entries = useMemo(() => log?.entries ?? [], [log])
  const resolvedRemoteLsn = useMemo(
    () => resolveRemoteLsn(entries, syncStatus),
    [entries, syncStatus]
  )

  useEffect(() => {
    setCachedRemoteLsn(readCachedRemoteLsn(remoteLsnCacheKey))
  }, [remoteLsnCacheKey])

  useEffect(() => {
    if (!remoteLsnCacheKey || !resolvedRemoteLsn) return
    writeCachedRemoteLsn(remoteLsnCacheKey, resolvedRemoteLsn)
    setCachedRemoteLsn(resolvedRemoteLsn)
  }, [remoteLsnCacheKey, resolvedRemoteLsn])

  useEffect(() => {
    if (!remoteLsnCacheKey || !cachedRemoteLsn || entries.length === 0) return
    if (entries.some((entry) => entry.lsn === cachedRemoteLsn)) return
    removeCachedRemoteLsn(remoteLsnCacheKey)
    setCachedRemoteLsn(undefined)
  }, [cachedRemoteLsn, entries, remoteLsnCacheKey])

  const [virtualList] = useVirtualList(entries, {
    containerTarget: containerRef,
    wrapperTarget: wrapperRef,
    itemHeight: ROW_HEIGHT,
    overscan: 8,
  })

  if (loading && !log) {
    return (
      <div className="flex items-center gap-2 px-3 py-6 text-xs text-muted-foreground">
        <LoaderIcon className="h-3 w-3 animate-spin" />
        Loading commit history...
      </div>
    )
  }

  if (!log) {
    return (
      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
        <p>No history loaded yet.</p>
        <Button variant="ghost" size="xs" className="mt-2" onClick={onRefresh}>
          Load history
        </Button>
      </div>
    )
  }

  if (log.isEmpty || log.entries.length === 0) {
    return (
      <div className="m-3 rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
        <HistoryIcon className="mx-auto mb-2 h-5 w-5 opacity-50" />
        <p>No commits in this repository yet.</p>
        <p className="mt-1 opacity-70">
          Make some changes to create your first commit.
        </p>
      </div>
    )
  }

  const head = log.entries[0].lsn
  const remoteLsn = resolvedRemoteLsn ?? cachedRemoteLsn

  return (
    <div className="flex h-full w-full flex-col">
      <div
        ref={containerRef}
        className="relative flex-1 overflow-y-auto w-full"
      >
        <div ref={wrapperRef} className="w-full">
          {virtualList.map((item) => {
            const entry = item.data
            const idx = item.index
            const prevEntry = entries[idx + 1]
            const diffBase =
              entry.parent ?? entry.parents?.[0] ?? prevEntry?.lsn
            return (
              <div
                key={entry.lsn}
                style={{ height: ROW_HEIGHT }}
                className="w-full"
              >
                <CommitRow
                  entry={entry}
                  isHead={entry.lsn === head}
                  isRemote={entry.lsn === remoteLsn}
                  disabled={isResetting}
                  onShow={() => {
                    onNavigateShow(entry.lsn, diffBase)
                  }}
                  onReset={(mode) => onReset(entry.lsn, mode)}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CommitRow({
  entry,
  isHead,
  isRemote,
  disabled,
  onShow,
  onReset,
}: {
  entry: GraftLogEntry
  isHead: boolean
  isRemote?: boolean
  disabled: boolean
  onShow: () => void
  onReset: (mode: CommitResetMode) => void
}) {
  const [hover, setHover] = React.useState(false)
  const displayId = entry.shortId || entry.lsn.slice(0, 12)
  const changeScope = formatChangeScope(entry)
  const status = isHead
    ? { label: "HEAD", className: "" }
    : isRemote
      ? {
          label: "remote",
          className: "border-blue-500/40 text-blue-600",
        }
      : entry.checkpoint
        ? {
            label: "checkpoint",
            className: "border-amber-500/40 text-amber-600",
          }
        : null

  return (
    <div
      className="h-full w-full"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className={cn(
          "group flex h-full items-start gap-2 px-2 py-1.5 text-xs w-full",
          hover ? "bg-muted/30" : ""
        )}
      >
        <span
          className={cn(
            "mt-2 h-1.5 w-1.5 shrink-0 rounded-full border",
            isHead
              ? "border-primary bg-primary"
              : isRemote
                ? "border-blue-500 bg-blue-500/30"
                : entry.checkpoint
                  ? "border-amber-500 bg-amber-500/30"
                  : "border-muted-foreground/40 bg-background"
          )}
        />
        <button
          type="button"
          onClick={onShow}
          className="flex min-w-0 flex-1 flex-col gap-1 text-left"
        >
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
              <span className="shrink-0 font-mono font-semibold tabular-nums">
                {displayId}
              </span>
              {entry.segment ? (
                <span
                  className="min-w-0 max-w-[72px] truncate font-mono text-[10px] text-muted-foreground"
                  title={entry.segment}
                >
                  {entry.segment.slice(0, 8)}
                </span>
              ) : null}
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {changeScope}
              </span>
              {status ? (
                <Badge
                  variant={isHead ? "default" : "outline"}
                  className={cn(
                    "h-4 shrink-0 px-1.5 py-0 text-[9px] leading-none",
                    status.className
                  )}
                >
                  {status.label}
                </Badge>
              ) : null}
            </span>
            {entry.timestampMs ? (
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {formatTime(entry.timestampMs)}
              </span>
            ) : null}
          </div>
          {entry.message ? (
            <div className="min-w-0 truncate text-[10px] text-muted-foreground/70">
              {entry.message}
            </div>
          ) : (
            <div className="h-3" />
          )}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="xs"
              variant="ghost"
              className={cn(
                "h-6 w-6 shrink-0 self-center p-0",
                hover ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
              disabled={disabled}
              aria-label="Commit actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={onShow}>Show details</DropdownMenuItem>
            <DropdownMenuItem
              disabled={isHead}
              onSelect={() => onReset("soft")}
            >
              Soft reset here
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isHead}
              onSelect={() => onReset("hard")}
              className="text-destructive focus:text-destructive"
            >
              Hard reset here
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
