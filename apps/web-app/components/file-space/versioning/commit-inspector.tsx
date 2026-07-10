import { useEffect, useState } from "react"
import {
  Copy,
  FileDiff,
  FileText,
  GitCommitHorizontal,
  LoaderCircle,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type {
  SpaceVersionCommit,
  SpaceVersionDiff,
  SpaceVersionDiffRequest,
  SpaceVersionPathChange,
} from "@/apps/web-app/hooks/use-space-versioning"

import {
  STATUS_META,
  formatAbsoluteVersionTime,
  formatVersionTime,
  shortCommitId,
} from "./versioning-utils"

interface CommitInspectorProps {
  commit: SpaceVersionCommit | null
  getCommit: (commitId: string) => Promise<SpaceVersionCommit | null>
  getDiff: (request: SpaceVersionDiffRequest) => Promise<SpaceVersionDiff>
  placement?: "side" | "below"
}

function ChangeDetails({
  diff,
  loading,
  error,
  notice,
  selectedPath,
}: {
  diff: SpaceVersionDiff | null
  loading: boolean
  error: string | null
  notice: string | null
  selectedPath: string | null
}) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <LoaderCircle
          className="h-4 w-4 animate-spin"
          aria-label="Loading change details"
        />
      </div>
    )
  }
  if (error) {
    return <p className="p-3 text-xs leading-5 text-destructive">{error}</p>
  }
  if (notice) {
    return (
      <div className="flex h-full items-start gap-2.5 px-3 py-3 text-xs text-muted-foreground">
        <FileDiff className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="max-w-md leading-5">{notice}</p>
      </div>
    )
  }
  if (!diff) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
        Select a changed path to inspect its metadata.
      </div>
    )
  }
  const pathChange =
    diff.paths.find((entry) => entry.path === selectedPath) ?? diff.paths[0]
  if (!pathChange) {
    return (
      <div className="flex h-full items-start gap-2.5 px-3 py-3 text-xs text-muted-foreground">
        <FileDiff className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="max-w-md leading-5">
          Graft returned no path metadata for this comparison.
        </p>
      </div>
    )
  }

  const meta = STATUS_META[pathChange.change]
  const kindLabel: Record<SpaceVersionPathChange["kind"], string> = {
    sqlite_database: "SQLite database",
    text_file: "Text file",
    binary_file: "Binary file",
    unknown: "File type unavailable",
  }
  const storageLabel: Record<SpaceVersionPathChange["storage"], string> = {
    sqlite_snapshot: "SQLite snapshot",
    inline: "Stored inline",
    external: "External content",
    unknown: "Storage unavailable",
  }
  return (
    <div className="flex h-full items-start gap-2.5 px-3 py-3 text-xs">
      <FileDiff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("font-medium", meta.className)}>
            {meta.label}
          </span>
          <code
            className="min-w-0 truncate font-mono text-[10px] text-muted-foreground"
            title={pathChange.path}
          >
            {pathChange.path}
          </code>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
          <span>{kindLabel[pathChange.kind]}</span>
          <span aria-hidden="true">·</span>
          <span>{storageLabel[pathChange.storage]}</span>
          {diff.from && diff.to ? (
            <>
              <span aria-hidden="true">·</span>
              <span title={`${diff.from} → ${diff.to}`}>
                {shortCommitId(diff.from)} → {shortCommitId(diff.to)}
              </span>
            </>
          ) : null}
        </div>
        <p className="mt-2 max-w-md leading-5 text-muted-foreground">
          Graft currently provides path-level metadata for this comparison;
          content preview is not available in Space history yet.
        </p>
      </div>
    </div>
  )
}

export function CommitInspector({
  commit,
  getCommit,
  getDiff,
  placement = "side",
}: CommitInspectorProps) {
  const [detail, setDetail] = useState<SpaceVersionCommit | null>(null)
  const [detailReadyId, setDetailReadyId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [diff, setDiff] = useState<SpaceVersionDiff | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [diffNotice, setDiffNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDetail(commit)
    setDetailReadyId(null)
    setSelectedPath(commit?.changedPaths[0]?.path ?? null)
    setDiff(null)
    setDiffNotice(null)
    setDetailError(null)
    if (!commit) return

    setDetailLoading(true)
    void getCommit(commit.id)
      .then((loadedCommit) => {
        if (cancelled || !loadedCommit) return
        const mergedCommit = {
          ...loadedCommit,
          changedPaths:
            loadedCommit.changedPaths.length > 0
              ? loadedCommit.changedPaths
              : commit.changedPaths,
        }
        setDetail(mergedCommit)
        setSelectedPath(
          (current) => current ?? mergedCommit.changedPaths[0]?.path ?? null
        )
      })
      .catch((loadError) => {
        if (!cancelled) {
          setDetailError(
            loadError instanceof Error ? loadError.message : String(loadError)
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false)
          setDetailReadyId(commit.id)
        }
      })
    return () => {
      cancelled = true
    }
  }, [commit, getCommit])

  useEffect(() => {
    let cancelled = false
    if (!detail || detailReadyId !== detail.id) {
      setDiff(null)
      setDiffLoading(false)
      return
    }
    setDiff(null)
    setDiffError(null)
    setDiffNotice(null)
    setDiffLoading(true)
    const firstParent = detail.parents[0]
    if (!firstParent) {
      setDiffNotice(
        "This is the first version, so there is no earlier version to compare."
      )
      setDiffLoading(false)
      return
    }
    const request: SpaceVersionDiffRequest = {
      from: firstParent,
      to: detail.id,
    }
    void getDiff(request)
      .then((nextDiff) => {
        if (!cancelled) setDiff(nextDiff)
      })
      .catch((loadError) => {
        if (!cancelled) {
          setDiffError(
            loadError instanceof Error ? loadError.message : String(loadError)
          )
        }
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detail, detailReadyId, getDiff])

  if (!commit || !detail) {
    return (
      <aside
        className={cn(
          "flex h-full min-h-0 items-center justify-center overflow-hidden bg-background px-6 text-center text-xs text-muted-foreground",
          placement === "side" ? "border-l" : "border-t"
        )}
      >
        Select a version to inspect its changed paths.
      </aside>
    )
  }

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-background",
        placement === "side" ? "border-l" : "border-t"
      )}
    >
      <header className="shrink-0 border-b px-3 py-2.5">
        <div className="flex min-w-0 items-start gap-2">
          <GitCommitHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium leading-5 text-foreground">
              {detail.message}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-muted-foreground">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-[2px] font-mono outline-hidden hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                title="Copy commit ID"
                onClick={() => void navigator.clipboard?.writeText(detail.id)}
              >
                {shortCommitId(detail.id)}
                <Copy className="h-2.5 w-2.5" />
              </button>
              <span aria-hidden="true">·</span>
              <span title={formatAbsoluteVersionTime(detail.timestamp)}>
                {formatVersionTime(detail.timestamp)}
              </span>
              {detail.parents.length > 1 ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{detail.parents.length} parents</span>
                </>
              ) : null}
            </div>
          </div>
          {detailLoading ? (
            <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        {detailError ? (
          <p className="mt-2 text-[10px] leading-4 text-destructive">
            {detailError}
          </p>
        ) : null}
      </header>

      <section
        className={cn(
          "flex shrink-0 flex-col border-b",
          placement === "side"
            ? "max-h-[38%] min-h-[120px]"
            : "max-h-[42%] min-h-[84px]"
        )}
      >
        <div className="flex h-7 shrink-0 items-center justify-between bg-muted/45 px-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <span>Changed paths</span>
          <span className="tabular-nums">{detail.changedPaths.length}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
          {detail.changedPaths.length === 0 ? (
            <p className="px-3 py-3 text-[11px] leading-5 text-muted-foreground">
              No changed-path metadata was returned for this version.
            </p>
          ) : (
            <ul>
              {detail.changedPaths.map((change) => {
                const meta = STATUS_META[change.status]
                return (
                  <li key={`${change.status}:${change.path}`}>
                    <button
                      type="button"
                      className={cn(
                        "flex h-7 w-full min-w-0 items-center gap-1.5 px-3 text-left text-[11px] outline-hidden hover:bg-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
                        selectedPath === change.path &&
                          "bg-accent text-accent-foreground"
                      )}
                      title={change.path}
                      onClick={() => setSelectedPath(change.path)}
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {change.path}
                      </span>
                      <span
                        className={cn(
                          "w-3 shrink-0 text-right text-[10px] font-semibold",
                          meta.className
                        )}
                        title={meta.label}
                      >
                        {meta.shortLabel}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-7 shrink-0 items-center gap-1.5 border-b bg-muted/45 px-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <FileDiff className="h-3 w-3" />
          <span className="shrink-0">Change details</span>
          <span aria-hidden="true">·</span>
          <span className="min-w-0 truncate normal-case tracking-normal">
            {selectedPath ?? "Select a path"}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <ChangeDetails
            diff={diff}
            loading={diffLoading}
            error={diffError}
            notice={diffNotice}
            selectedPath={selectedPath}
          />
        </div>
      </section>
    </aside>
  )
}
