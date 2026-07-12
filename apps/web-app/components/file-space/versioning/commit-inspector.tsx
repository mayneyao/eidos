import { useEffect, useId, useMemo, useState, type MouseEvent } from "react"
import {
  AlertTriangle,
  Copy,
  FileDiff,
  FileText,
  FileWarning,
  GitCommitHorizontal,
  LoaderCircle,
  RotateCcw,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type {
  SpaceVersionCommit,
  SpaceVersionDiff,
  SpaceVersionDiffRequest,
  SpaceVersionPathChange,
  SpaceVersionRestorePathRequest,
  SpaceVersionRestorePathResult,
  SpaceVersionRestoreVersionRequest,
  SpaceVersionRestoreVersionResult,
  SpaceVersionSqliteFileDiff,
  SpaceVersionStatus,
  SpaceVersionTextContentDiff,
  SpaceVersioningOperation,
} from "@/apps/web-app/hooks/use-space-versioning"
import { DiffView } from "@/components/table/diff-view"
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

import { BaseDiffView } from "./base-diff-view"

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
  status: SpaceVersionStatus | null
  operation: SpaceVersioningOperation
  restorePath: (
    request: SpaceVersionRestorePathRequest
  ) => Promise<SpaceVersionRestorePathResult>
  restoreVersion: (
    request: SpaceVersionRestoreVersionRequest
  ) => Promise<SpaceVersionRestoreVersionResult>
  placement?: "side" | "below"
}

interface RestoreFeedback {
  tone: "success" | "error"
  message: string
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function TextContentDetails({
  content,
  loading,
  error,
  path,
}: {
  content: SpaceVersionTextContentDiff | null
  loading: boolean
  error: string | null
  path: string
}) {
  if (loading) {
    return (
      <div className="flex min-h-24 items-center justify-center text-muted-foreground">
        <LoaderCircle
          className="h-4 w-4 animate-spin"
          aria-label="Loading text content diff"
        />
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex items-start gap-2 px-3 py-3 text-xs text-destructive">
        <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="leading-5">{error}</p>
      </div>
    )
  }
  if (!content) {
    return (
      <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">
        Text content was not returned for this path.
      </p>
    )
  }

  const unavailable = [content.before, content.after].find(
    (state) => state.state !== "absent" && state.state !== "utf8"
  )
  if (unavailable) {
    const message =
      unavailable.state === "too_large"
        ? `Content preview was skipped because this version is ${formatFileSize(unavailable.size)}; history previews are limited to 1 MB per side.`
        : unavailable.state === "missing_payload"
          ? "Historical content is not available on this device. Fetch the Graft payload before inspecting this diff."
          : "Graft classified this path as text, but the complete historical content is not valid UTF-8."
    return (
      <div className="flex items-start gap-2 px-3 py-3 text-xs text-muted-foreground">
        <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="max-w-md leading-5">{message}</p>
      </div>
    )
  }

  const oldContent =
    content.before.state === "utf8" ? content.before.content : ""
  const newContent = content.after.state === "utf8" ? content.after.content : ""
  return (
    <div className="min-w-0 overflow-auto" data-testid="text-content-diff">
      <DiffView
        oldContent={oldContent}
        newContent={newContent}
        filename={path}
        diffStyle="unified"
      />
    </div>
  )
}

function BaseContentDetails({
  file,
  loading,
  error,
}: {
  file: SpaceVersionSqliteFileDiff | null
  loading: boolean
  error: string | null
}) {
  if (loading) {
    return (
      <div className="flex min-h-24 items-center justify-center text-muted-foreground">
        <LoaderCircle
          className="h-4 w-4 animate-spin"
          aria-label="Loading Base changes"
        />
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex items-start gap-2 px-3 py-3 text-xs text-destructive">
        <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="leading-5">{error}</p>
      </div>
    )
  }
  if (!file) {
    return (
      <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">
        Base row changes were not returned for this path.
      </p>
    )
  }
  return <BaseDiffView file={file} />
}

function pathsOverlap(left: string, right: string): boolean {
  return (
    left === right ||
    left.startsWith(`${right}/`) ||
    right.startsWith(`${left}/`)
  )
}

function ChangeDetails({
  diff,
  loading,
  error,
  notice,
  selectedPath,
  content,
  contentLoading,
  contentError,
  baseDiff,
  baseLoading,
  baseError,
}: {
  diff: SpaceVersionDiff | null
  loading: boolean
  error: string | null
  notice: string | null
  selectedPath: string | null
  content: SpaceVersionTextContentDiff | null
  contentLoading: boolean
  contentError: string | null
  baseDiff: SpaceVersionSqliteFileDiff | null
  baseLoading: boolean
  baseError: string | null
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
  const metadataNotice =
    pathChange.kind === "binary_file"
      ? "Binary history is tracked, but content preview is not available. Restore this version to inspect the file in the Space."
      : pathChange.kind === "unknown"
        ? "Graft did not return a recognized content type for this path."
        : null
  return (
    <div className="flex min-h-full flex-col text-xs">
      <div className="flex shrink-0 items-start gap-2.5 border-b px-3 py-2.5">
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
          {metadataNotice ? (
            <p className="mt-2 max-w-md leading-5 text-muted-foreground">
              {metadataNotice}
            </p>
          ) : null}
        </div>
      </div>
      {pathChange.kind === "text_file" && selectedPath ? (
        <TextContentDetails
          content={content}
          loading={contentLoading || (!content && !contentError)}
          error={contentError}
          path={selectedPath}
        />
      ) : pathChange.kind === "sqlite_database" && selectedPath ? (
        <BaseContentDetails
          file={baseDiff}
          loading={baseLoading || (!baseDiff && !baseError)}
          error={baseError}
        />
      ) : null}
    </div>
  )
}

export function CommitInspector({
  commit,
  getCommit,
  getDiff,
  status,
  operation,
  restorePath,
  restoreVersion,
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
  const [contentDiff, setContentDiff] =
    useState<SpaceVersionTextContentDiff | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [contentError, setContentError] = useState<string | null>(null)
  const [baseDiff, setBaseDiff] = useState<SpaceVersionSqliteFileDiff | null>(
    null
  )
  const [baseLoading, setBaseLoading] = useState(false)
  const [baseError, setBaseError] = useState<string | null>(null)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [spaceRestoreDialogOpen, setSpaceRestoreDialogOpen] = useState(false)
  const [restoreFeedback, setRestoreFeedback] =
    useState<RestoreFeedback | null>(null)
  const restoreReasonId = useId()
  const spaceRestoreReasonId = useId()

  useEffect(() => {
    let cancelled = false
    setDetail(commit)
    setDetailReadyId(null)
    setSelectedPath(commit?.changedPaths[0]?.path ?? null)
    setDiff(null)
    setDiffNotice(null)
    setContentDiff(null)
    setContentLoading(false)
    setContentError(null)
    setBaseDiff(null)
    setBaseLoading(false)
    setBaseError(null)
    setDetailError(null)
    setRestoreDialogOpen(false)
    setSpaceRestoreDialogOpen(false)
    setRestoreFeedback(null)
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
    const request: SpaceVersionDiffRequest = firstParent
      ? { from: firstParent, to: detail.id }
      : { root: detail.id }
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

  useEffect(() => {
    let cancelled = false
    setContentDiff(null)
    setContentError(null)
    setContentLoading(false)
    setBaseDiff(null)
    setBaseError(null)
    setBaseLoading(false)
    if (
      !detail ||
      detailReadyId !== detail.id ||
      !diff ||
      !diff.to ||
      !selectedPath
    ) {
      return
    }
    const selectedMetadata = diff.paths.find(
      (entry) => entry.path === selectedPath
    )
    if (
      selectedMetadata?.kind !== "text_file" &&
      selectedMetadata?.kind !== "sqlite_database"
    ) {
      return
    }

    const includeContent = selectedMetadata.kind === "text_file"
    if (includeContent) setContentLoading(true)
    else setBaseLoading(true)
    const request: SpaceVersionDiffRequest =
      diff.from === "root"
        ? {
            root: diff.to,
            path: selectedPath,
            ...(includeContent
              ? { includeContent: true }
              : { includeRows: true }),
          }
        : {
            from: diff.from ?? undefined,
            to: diff.to,
            path: selectedPath,
            ...(includeContent
              ? { includeContent: true }
              : { includeRows: true }),
          }
    void getDiff(request)
      .then((detailResult) => {
        if (cancelled) return
        if (includeContent) {
          if (!detailResult.content) {
            throw new Error("Graft returned no text content for this path")
          }
          setContentDiff(detailResult.content)
          return
        }
        const nextBaseDiff = detailResult.sqliteFiles.find(
          (file) => file.path === selectedPath
        )
        if (!nextBaseDiff) {
          throw new Error("Graft returned no Base row changes for this path")
        }
        setBaseDiff(nextBaseDiff)
      })
      .catch((loadError) => {
        if (!cancelled) {
          const message =
            loadError instanceof Error ? loadError.message : String(loadError)
          if (includeContent) setContentError(message)
          else setBaseError(message)
        }
      })
      .finally(() => {
        if (!cancelled) {
          if (includeContent) setContentLoading(false)
          else setBaseLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [detail, detailReadyId, diff, getDiff, selectedPath])

  useEffect(() => {
    setRestoreFeedback(null)
    setRestoreDialogOpen(false)
  }, [selectedPath])

  const selectedChange = useMemo(
    () =>
      detail?.changedPaths.find((change) => change.path === selectedPath) ??
      null,
    [detail, selectedPath]
  )
  const currentPathChanges = useMemo(
    () =>
      selectedPath
        ? (status?.changes.filter((change) =>
            pathsOverlap(change.path, selectedPath)
          ) ?? [])
        : [],
    [selectedPath, status?.changes]
  )
  const restoring = operation === "restoring"
  const restoresDeletion = selectedChange?.status === "deleted"
  const restoreDisabledReason = (() => {
    if (!detail || !selectedChange || !selectedPath) {
      return "Select a changed path to restore"
    }
    if (detailLoading || detailReadyId !== detail.id) {
      return "Wait for version details to load"
    }
    if (!status?.enabled || !status.head?.id) {
      return "Current version information is unavailable"
    }
    if (operation) {
      return restoring
        ? "This file is being restored"
        : "Wait for the current version operation to finish"
    }
    if (status.hasConflicts) {
      return "Resolve version conflicts before restoring a file"
    }
    if (
      selectedChange.status === "renamed" ||
      selectedChange.status === "unknown"
    ) {
      return "Renamed paths cannot be restored safely yet"
    }
    if (currentPathChanges.some((change) => change.conflicted)) {
      return "Resolve this path's conflict before restoring it"
    }
    if (currentPathChanges.some((change) => change.staged)) {
      return "Commit or unstage this path before restoring it"
    }
    if (detail.id === status.head.id && currentPathChanges.length === 0) {
      return "This file already matches the current version"
    }
    return null
  })()
  const spaceRestoreDisabledReason = (() => {
    if (!detail) return "Select a version to restore"
    if (detailLoading || detailReadyId !== detail.id) {
      return "Wait for version details to load"
    }
    if (!status?.enabled || !status.head?.id) {
      return "Current version information is unavailable"
    }
    if (operation) {
      return restoring
        ? "The Space is being restored"
        : "Wait for the current version operation to finish"
    }
    if (status.hasConflicts) {
      return "Resolve version conflicts before restoring the Space"
    }
    if (status.changes.some((change) => change.staged)) {
      return "Commit or unstage all staged paths before restoring the Space"
    }
    if (detail.id === status.head.id && status.clean) {
      return "The Space already matches this version"
    }
    return null
  })()
  const hasOverwritableSpaceChanges =
    status?.changes.some((change) => change.status !== "untracked") ?? false

  const handleRestoreConfirm = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (
      restoreDisabledReason ||
      !detail ||
      !selectedChange ||
      !selectedPath ||
      !status?.head?.id
    ) {
      return
    }

    setRestoreFeedback(null)
    try {
      const result = await restorePath({
        revision: detail.id,
        path: selectedPath,
        expectedHead: status.head.id,
        // The confirmation explicitly grants replacing any edits flushed just
        // before the restore. Staged changes remain blocked by Desktop.
        overwriteChanges: true,
        allowDelete: restoresDeletion,
      })
      setRestoreDialogOpen(false)
      const remainsChanged = result.status.changes.some(
        (change) => change.path === result.path
      )
      setRestoreFeedback({
        tone: "success",
        message:
          result.effect === "noop"
            ? `${result.path} already matches ${shortCommitId(result.revision)}.`
            : !remainsChanged
              ? `Restored ${result.path} from ${shortCommitId(result.revision)}. The working file now matches the current version.`
              : result.effect === "deleted"
                ? `Restored the deleted state of ${result.path}. Review the deletion in Changes before creating a version.`
                : `Restored ${result.path} from ${shortCommitId(result.revision)}. Review it in Changes before creating a version.`,
      })
    } catch (restoreError) {
      setRestoreFeedback({
        tone: "error",
        message:
          restoreError instanceof Error
            ? restoreError.message
            : String(restoreError),
      })
    }
  }

  const handleSpaceRestoreConfirm = async (
    event: MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault()
    if (spaceRestoreDisabledReason || !detail || !status?.head?.id) {
      return
    }

    setRestoreFeedback(null)
    try {
      const result = await restoreVersion({
        revision: detail.id,
        expectedHead: status.head.id,
        overwriteChanges: true,
      })
      setSpaceRestoreDialogOpen(false)
      const count = result.restoredPaths.length
      const cleanAfterRestore = result.status.clean
      setRestoreFeedback({
        tone: "success",
        message:
          count === 0
            ? "The Space already matches " +
              shortCommitId(result.revision) +
              "."
            : "Restored " +
              count +
              " versioned " +
              (count === 1 ? "path" : "paths") +
              " from " +
              shortCommitId(result.revision) +
              (cleanAfterRestore
                ? ". The Space now matches the current version."
                : ". Review the result in Changes before creating a version."),
      })
    } catch (restoreError) {
      setRestoreFeedback({
        tone: "error",
        message:
          restoreError instanceof Error
            ? restoreError.message
            : String(restoreError),
      })
    }
  }

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
          <button
            type="button"
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-[2px] px-1.5 text-[10px] font-medium text-muted-foreground outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-45"
            title={
              spaceRestoreDisabledReason ?? "Restore the Space to this version"
            }
            aria-disabled={spaceRestoreDisabledReason !== null}
            aria-describedby={
              spaceRestoreDisabledReason ? spaceRestoreReasonId : undefined
            }
            onClick={() => {
              if (spaceRestoreDisabledReason) return
              setRestoreFeedback(null)
              setSpaceRestoreDialogOpen(true)
            }}
          >
            {restoring ? (
              <LoaderCircle className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            <span>Restore Space</span>
          </button>
          {spaceRestoreDisabledReason ? (
            <span id={spaceRestoreReasonId} className="sr-only">
              {spaceRestoreDisabledReason}
            </span>
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
        <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-b bg-muted/45 px-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            <FileDiff className="h-3 w-3 shrink-0" />
            <span className="shrink-0">Change details</span>
            <span aria-hidden="true">·</span>
            <span className="min-w-0 truncate normal-case tracking-normal">
              {selectedPath ?? "Select a path"}
            </span>
          </span>
          <button
            type="button"
            className="inline-flex h-5 shrink-0 items-center gap-1 rounded-[2px] px-1.5 text-[10px] font-medium normal-case tracking-normal text-muted-foreground outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-45"
            aria-label={
              selectedPath
                ? `Restore ${selectedPath} from this version`
                : "Restore selected path from this version"
            }
            title={restoreDisabledReason ?? "Restore this file"}
            aria-disabled={restoreDisabledReason !== null}
            aria-describedby={
              restoreDisabledReason ? restoreReasonId : undefined
            }
            onClick={() => {
              if (restoreDisabledReason) return
              setRestoreFeedback(null)
              setRestoreDialogOpen(true)
            }}
          >
            {restoring ? (
              <LoaderCircle className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            <span>Restore</span>
          </button>
          {restoreDisabledReason ? (
            <span id={restoreReasonId} className="sr-only">
              {restoreDisabledReason}
            </span>
          ) : null}
        </div>
        {restoreFeedback ? (
          <div
            className={cn(
              "shrink-0 border-b px-3 py-2 text-[11px] leading-4",
              restoreFeedback.tone === "error"
                ? "border-destructive/25 bg-destructive/5 text-destructive"
                : "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
            )}
            role={restoreFeedback.tone === "error" ? "alert" : "status"}
          >
            {restoreFeedback.message}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-auto">
          <ChangeDetails
            diff={diff}
            loading={diffLoading}
            error={diffError}
            notice={diffNotice}
            selectedPath={selectedPath}
            content={contentDiff?.path === selectedPath ? contentDiff : null}
            contentLoading={contentLoading}
            contentError={contentError}
            baseDiff={baseDiff}
            baseLoading={baseLoading}
            baseError={baseError}
          />
        </div>
      </section>

      <AlertDialog
        open={restoreDialogOpen}
        onOpenChange={(open) => {
          if (!restoring) setRestoreDialogOpen(open)
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">
              {restoresDeletion
                ? `Restore the deletion of “${selectedPath}”?`
                : `Restore “${selectedPath}” from ${shortCommitId(detail.id)}?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-5">
              {restoresDeletion
                ? `This version does not contain ${selectedPath}. Restoring its state will delete the working file.`
                : `Eidos will replace ${selectedPath} with the copy from “${detail.message}” (${shortCommitId(detail.id)}).`}{" "}
              HEAD will not move and no version will be created. Changes will
              show any resulting difference from the current version.
              {currentPathChanges.length > 0 ? (
                <span className="mt-2 block font-medium text-foreground">
                  This path has uncommitted changes. They will be overwritten;
                  create a version first if you may need them.
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {restoreFeedback?.tone === "error" ? (
            <div
              className="flex items-start gap-2 rounded-[3px] bg-destructive/7 px-2.5 py-2 text-xs leading-5 text-destructive"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{restoreFeedback.message}</span>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                restoresDeletion &&
                  "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              )}
              disabled={restoreDisabledReason !== null}
              onClick={(event) => void handleRestoreConfirm(event)}
            >
              {restoring ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {restoring
                ? "Restoring…"
                : restoresDeletion
                  ? "Delete working file"
                  : "Restore file"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={spaceRestoreDialogOpen}
        onOpenChange={(open) => {
          if (!restoring) setSpaceRestoreDialogOpen(open)
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">
              Restore the Space to “{detail.message}”?
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-5">
              Every versioned file will be restored to{" "}
              {shortCommitId(detail.id)}. Untracked and ignored files that do
              not collide with versioned paths will remain. If an untracked path
              would collide, restoration stops before changing any files. HEAD
              will not move and history will not be rewritten. Changes will show
              any resulting difference from the current version.
              {hasOverwritableSpaceChanges ? (
                <span className="mt-2 block font-medium text-foreground">
                  Current uncommitted changes to versioned paths will be
                  overwritten.
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {restoreFeedback?.tone === "error" ? (
            <div
              className="flex items-start gap-2 rounded-[3px] bg-destructive/7 px-2.5 py-2 text-xs leading-5 text-destructive"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{restoreFeedback.message}</span>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={spaceRestoreDisabledReason !== null}
              onClick={(event) => void handleSpaceRestoreConfirm(event)}
            >
              {restoring ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {restoring ? "Restoring…" : "Restore Space"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  )
}
