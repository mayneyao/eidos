import { useCallback, useEffect, useRef, useState } from "react"
import type { SpaceFilePreview } from "@eidos.space/file-space"
import { FileQuestion, FileWarning, RefreshCw } from "lucide-react"

import { isSameOrDescendant } from "@/apps/web-app/components/file-space/file-path"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import {
  useSpaceFileChanges,
  useSpaceFiles,
} from "@/apps/web-app/hooks/use-space-files"

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  const units = ["KB", "MB", "GB"]
  let value = size / 1024
  let unit = units[0]
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024
    unit = units[index]
  }
  const formatted = Number.isInteger(value)
    ? String(value)
    : value < 10
      ? value.toFixed(1)
      : String(Math.round(value))
  return `${formatted} ${unit}`
}

function PreviewState({
  kind,
  message,
  detail,
}: {
  kind: "loading" | "binary" | "error"
  message: string
  detail?: string
}) {
  const Icon =
    kind === "loading"
      ? RefreshCw
      : kind === "binary"
        ? FileWarning
        : FileQuestion
  return (
    <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
      <div className="flex max-w-md items-start gap-3">
        <Icon
          className={
            kind === "loading"
              ? "mt-0.5 h-4 w-4 animate-spin"
              : "mt-0.5 h-4 w-4"
          }
        />
        <div className="space-y-1 text-sm">
          <p className="text-foreground/80">{message}</p>
          {detail ? <p className="text-xs">{detail}</p> : null}
        </div>
      </div>
    </div>
  )
}

export function SpaceFileFallbackPreview({ filePath }: { filePath: string }) {
  const { currentSpace } = useCurrentSpace()
  const { readPreview } = useSpaceFiles(currentSpace?.id)
  const [preview, setPreview] = useState<SpaceFilePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadVersionRef = useRef(0)

  const load = useCallback(async () => {
    const loadVersion = ++loadVersionRef.current
    try {
      const nextPreview = await readPreview(filePath)
      if (loadVersion !== loadVersionRef.current) return
      setPreview(nextPreview)
      setError(null)
    } catch (loadError) {
      if (loadVersion !== loadVersionRef.current) return
      setPreview(null)
      setError(
        loadError instanceof Error ? loadError.message : "Unable to open file"
      )
    } finally {
      if (loadVersion === loadVersionRef.current) setLoading(false)
    }
  }, [filePath, readPreview])

  useEffect(() => {
    setLoading(true)
    void load()
    return () => {
      loadVersionRef.current += 1
    }
  }, [load])

  useSpaceFileChanges(
    currentSpace?.id,
    useCallback(
      (event) => {
        if (
          event.path === filePath ||
          (event.eventType === "rescan" &&
            isSameOrDescendant(filePath, event.path))
        ) {
          void load()
        }
      },
      [filePath, load]
    )
  )

  if (loading) {
    return <PreviewState kind="loading" message="Checking file contents…" />
  }
  if (error) return <PreviewState kind="error" message={error} />
  if (!preview) {
    return <PreviewState kind="error" message="Unable to preview file" />
  }
  if (preview.kind === "binary") {
    return (
      <PreviewState
        kind="binary"
        message="Binary file"
        detail={`${formatFileSize(preview.size)} · No text preview is available.`}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {preview.truncated ? (
        <div className="shrink-0 border-b bg-muted/35 px-5 py-2 text-xs text-muted-foreground">
          Showing the first {formatFileSize(preview.previewBytes)} of{" "}
          {formatFileSize(preview.size)}.
        </div>
      ) : null}
      <div
        className="min-h-0 flex-1 overflow-auto"
        role="region"
        aria-label="Text file preview"
        tabIndex={0}
      >
        {preview.content ? (
          <pre className="min-h-full whitespace-pre-wrap break-words px-6 py-5 font-mono text-[13px] leading-6 text-foreground/90">
            {preview.content}
          </pre>
        ) : (
          <p className="px-6 py-5 text-sm text-muted-foreground">
            Empty text file
          </p>
        )}
      </div>
    </div>
  )
}
