import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Columns2,
  ExternalLink,
  FileDiff,
  FileWarning,
  LoaderCircle,
  RefreshCw,
  Rows3,
} from "lucide-react"
import { useLocation } from "react-router-dom"

import { cn } from "@/lib/utils"
import { toSpaceFileUrl } from "@/apps/web-app/components/file-space/file-path"
import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
import { BaseDiffView } from "@/apps/web-app/components/file-space/versioning/base-diff-view"
import {
  STATUS_META,
  shortCommitId,
} from "@/apps/web-app/components/file-space/versioning/versioning-utils"
import {
  useSpaceVersioning,
  type SpaceVersionDiff,
  type SpaceVersionPathChange,
  type SpaceVersionSqliteFileDiff,
  type SpaceVersionTextContentDiff,
  type SpaceVersionTextContentState,
} from "@/apps/web-app/hooks/use-space-versioning"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useSpaceFiles } from "@/apps/web-app/hooks/use-space-files"
import { useTabTitle } from "@/apps/web-app/hooks/use-tab-title"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { DiffView } from "@/components/table/diff-view"
import { Button } from "@/components/ui/button"

type DiffStyle = "split" | "unified"

const TEXT_EXTENSIONS = new Set([
  "css",
  "csv",
  "html",
  "ini",
  "js",
  "json",
  "jsx",
  "log",
  "markdown",
  "md",
  "py",
  "sh",
  "sql",
  "toml",
  "ts",
  "tsv",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
])

function filenameOf(repositoryPath: string): string {
  return repositoryPath.split("/").pop() || repositoryPath
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function unavailableContentMessage(
  state: SpaceVersionTextContentState
): string {
  if (state.state === "too_large") {
    return `This file is ${formatFileSize(state.size)}. Text previews are limited to 1 MB per side.`
  }
  if (state.state === "missing_payload") {
    return "This content is not available on this device. Fetch the Graft payload and refresh."
  }
  return "Graft classified this path as text, but its complete content is not valid UTF-8."
}

function TextDiff({
  content,
  path,
  style,
}: {
  content: SpaceVersionTextContentDiff
  path: string
  style: DiffStyle
}) {
  const unavailable = [content.before, content.after].find(
    (state) => state.state !== "absent" && state.state !== "utf8"
  )
  if (unavailable) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <div className="max-w-md">
          <FileWarning className="mx-auto h-5 w-5 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">Preview unavailable</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {unavailableContentMessage(unavailable)}
          </p>
        </div>
      </div>
    )
  }

  const oldContent =
    content.before.state === "utf8" ? content.before.content : ""
  const newContent = content.after.state === "utf8" ? content.after.content : ""
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto bg-background px-3 pb-6 pt-2">
      <DiffView
        oldContent={oldContent}
        newContent={newContent}
        filename={path}
        diffStyle={style}
      />
    </div>
  )
}

function DiffEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center">
      <div className="max-w-sm">
        <FileDiff className="mx-auto h-5 w-5 text-muted-foreground/60" />
        <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  )
}

export function SpaceVersionDiffPage() {
  const { isActive } = useTabContext()
  const location = useLocation()
  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  )
  const repositoryPath = searchParams.get("path") ?? ""
  const requestedFrom = searchParams.get("from")
  const requestedTo = searchParams.get("to")
  const filename = filenameOf(repositoryPath)
  useTabTitle(repositoryPath ? `${filename} (Diff)` : "File Diff")

  const { currentSpace } = useCurrentSpace()
  const spaceId = currentSpace?.id
  const { status, statusLoading, available, getDiff, refreshStatus } =
    useSpaceVersioning(spaceId, { active: isActive })
  const { readText } = useSpaceFiles(spaceId)
  const openTab = useTabStore((state) => state.openTab)
  const [metadata, setMetadata] = useState<SpaceVersionDiff | null>(null)
  const [change, setChange] = useState<SpaceVersionPathChange | null>(null)
  const [content, setContent] = useState<SpaceVersionTextContentDiff | null>(
    null
  )
  const [baseDiff, setBaseDiff] = useState<SpaceVersionSqliteFileDiff | null>(
    null
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [style, setStyle] = useState<DiffStyle>("split")
  const requestRef = useRef(0)
  const baseline = status?.head?.id ?? null
  const diffFrom = requestedFrom ?? baseline
  const changeSignature = useMemo(
    () =>
      status?.changes
        .map(
          (entry) =>
            `${entry.path}:${entry.status}:${entry.staged ? "s" : ""}:${entry.unstaged ? "u" : ""}`
        )
        .join("|") ?? "",
    [status?.changes]
  )

  const loadDiff = useCallback(async () => {
    const requestId = ++requestRef.current
    setError(null)
    setMetadata(null)
    setChange(null)
    setContent(null)
    setBaseDiff(null)
    if (!repositoryPath) return

    setLoading(true)
    try {
      const pendingChange = !requestedFrom
        ? status?.changes.find((entry) => entry.path === repositoryPath)
        : undefined
      // Like Git, Graft's HEAD-to-worktree diff does not include untracked
      // paths. Build that preview from the working file instead so opening an
      // untracked change never produces a misleading "No differences" tab.
      if (!diffFrom || pendingChange?.status === "untracked") {
        if (!pendingChange) return
        const extension = filenameOf(repositoryPath)
          .split(".")
          .pop()
          ?.toLowerCase()
        const nextChange: SpaceVersionPathChange = {
          path: repositoryPath,
          change: "added",
          kind:
            extension === "base"
              ? "sqlite_database"
              : extension && TEXT_EXTENSIONS.has(extension)
                ? "text_file"
                : "unknown",
          storage: extension === "base" ? "sqlite_snapshot" : "inline",
        }
        let nextContent: SpaceVersionTextContentDiff | null = null
        let nextBaseDiff: SpaceVersionSqliteFileDiff | null = null
        if (nextChange.kind === "text_file") {
          const file = await readText(repositoryPath)
          nextContent = {
            path: repositoryPath,
            change: "added",
            kind: "text_file",
            storage: "inline",
            before: { state: "absent" },
            after:
              file.size > 1024 * 1024
                ? {
                    state: "too_large",
                    size: file.size,
                    contentHash: "worktree",
                  }
                : {
                    state: "utf8",
                    content: file.content,
                    size: file.size,
                    contentHash: "worktree",
                  },
          }
        } else if (nextChange.kind === "sqlite_database") {
          nextBaseDiff = {
            path: repositoryPath,
            change: "added",
            kind: "sqlite_database",
            storage: "sqlite_snapshot",
            rowDiffAvailable: false,
            logicalStatus: "unversioned",
            capabilities: [],
            limitations: [],
            message:
              "Include this Base in the next version to make table-level history available.",
            tables: [],
            opaqueChanges: [],
          }
        }
        if (requestId !== requestRef.current) return
        const nextMetadata: SpaceVersionDiff = {
          currentHead: null,
          currentBranch: status?.branch ?? null,
          from: "root",
          to: "worktree",
          paths: [nextChange],
          content: nextContent,
          sqliteFiles: [],
        }
        setMetadata(nextMetadata)
        setChange(nextChange)
        setContent(nextContent)
        setBaseDiff(nextBaseDiff)
        return
      }

      const nextMetadata = await getDiff({
        from: diffFrom,
        ...(requestedTo ? { to: requestedTo } : {}),
        path: repositoryPath,
      })
      if (requestId !== requestRef.current) return
      const nextChange =
        nextMetadata.paths.find((entry) => entry.path === repositoryPath) ??
        null
      setMetadata(nextMetadata)
      setChange(nextChange)
      if (nextChange?.kind === "text_file") {
        const contentDiff = await getDiff({
          from: diffFrom,
          ...(requestedTo ? { to: requestedTo } : {}),
          path: repositoryPath,
          includeContent: true,
        })
        if (requestId !== requestRef.current) return
        setContent(contentDiff.content)
      } else if (nextChange?.kind === "sqlite_database") {
        const rowDiff = await getDiff({
          from: diffFrom,
          ...(requestedTo ? { to: requestedTo } : {}),
          path: repositoryPath,
          includeRows: true,
        })
        if (requestId !== requestRef.current) return
        setBaseDiff(
          rowDiff.sqliteFiles.find((file) => file.path === repositoryPath) ??
            null
        )
      }
    } catch (requestError) {
      if (requestId !== requestRef.current) return
      setError(
        requestError instanceof Error
          ? requestError.message
          : String(requestError)
      )
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [
    changeSignature,
    diffFrom,
    getDiff,
    readText,
    repositoryPath,
    requestedTo,
    status?.branch,
    status?.changes,
  ])

  useEffect(() => {
    void loadDiff()
    return () => {
      requestRef.current += 1
    }
  }, [loadDiff])

  const openFile = () => {
    if (!repositoryPath || change?.change === "deleted") return
    openTab(toSpaceFileUrl(repositoryPath), filename)
  }
  const statusMeta = change ? STATUS_META[change.change] : null

  return (
    <main className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b bg-muted/20 px-3">
        <FileDiff className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium" title={repositoryPath}>
            {repositoryPath || "No file selected"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {diffFrom
              ? requestedTo
                ? `${shortCommitId(diffFrom)} → ${shortCommitId(requestedTo)}`
                : `Current version ${shortCommitId(diffFrom)} → working file`
              : "Empty Space → working file"}
          </p>
        </div>
        {statusMeta ? (
          <span
            className={cn(
              "rounded-sm border px-1.5 py-0.5 text-[10px] font-medium",
              statusMeta.className
            )}
          >
            {statusMeta.label}
          </span>
        ) : null}
        {change?.kind === "text_file" && content ? (
          <div className="flex items-center rounded-[4px] border bg-background p-0.5">
            <button
              type="button"
              className={cn(
                "flex h-6 w-7 items-center justify-center rounded-[3px] text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
                style === "split" && "bg-muted text-foreground"
              )}
              aria-label="Use side-by-side diff"
              aria-pressed={style === "split"}
              title="Side by side"
              onClick={() => setStyle("split")}
            >
              <Columns2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={cn(
                "flex h-6 w-7 items-center justify-center rounded-[3px] text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
                style === "unified" && "bg-muted text-foreground"
              )}
              aria-label="Use inline diff"
              aria-pressed={style === "unified"}
              title="Inline"
              onClick={() => setStyle("unified")}
            >
              <Rows3 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
        <Button
          size="xs"
          variant="ghost"
          className="h-7 px-2 text-xs"
          disabled={!repositoryPath || change?.change === "deleted"}
          title={
            change?.change === "deleted"
              ? "Deleted files cannot be opened"
              : "Open file"
          }
          onClick={openFile}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open file
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          aria-label="Refresh file diff"
          title="Refresh"
          disabled={loading || statusLoading}
          onClick={() => void refreshStatus().then(loadDiff)}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </header>

      {!available ? (
        <DiffEmptyState
          title="File diff is available on desktop"
          description="Open this Space in the desktop app to inspect Graft changes."
        />
      ) : statusLoading && status === null ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
          <LoaderCircle
            className="h-4 w-4 animate-spin"
            aria-label="Loading version status"
          />
        </div>
      ) : !repositoryPath ? (
        <DiffEmptyState
          title="No file selected"
          description="Select a changed file from the Version sidebar to inspect it."
        />
      ) : loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Loading file diff…
        </div>
      ) : error ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center">
          <div className="max-w-md" role="alert">
            <FileWarning className="mx-auto h-5 w-5 text-destructive/70" />
            <p className="mt-3 text-sm font-medium">Could not load this diff</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {error}
            </p>
            <Button
              size="xs"
              variant="outline"
              className="mt-4"
              onClick={() => void loadDiff()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        </div>
      ) : !change ? (
        <DiffEmptyState
          title="No differences"
          description="This file now matches the current version. You can close this diff tab."
        />
      ) : change.kind === "sqlite_database" ? (
        baseDiff ? (
          <BaseDiffView file={baseDiff} className="min-h-0 flex-1" />
        ) : (
          <DiffEmptyState
            title="Base details unavailable"
            description="Graft returned the Base file change without table-level details. Refresh to try again."
          />
        )
      ) : change.kind !== "text_file" ? (
        <DiffEmptyState
          title="Text preview unavailable"
          description={
            change.kind === "binary_file"
              ? "This binary file changed. Eidos currently shows its path-level status without rendering binary contents."
              : "This file changed, but Graft did not classify it as previewable text."
          }
        />
      ) : content ? (
        <TextDiff content={content} path={repositoryPath} style={style} />
      ) : (
        <DiffEmptyState
          title="Text content unavailable"
          description="Graft returned the file change without a text payload. Refresh to try again."
        />
      )}

      {metadata?.currentBranch ? (
        <footer className="flex h-6 shrink-0 items-center border-t bg-muted/20 px-3 text-[10px] text-muted-foreground">
          {metadata.currentBranch}
        </footer>
      ) : null}
    </main>
  )
}
