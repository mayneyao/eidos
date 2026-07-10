"use client"

import { useEffect, useState } from "react"
import type { FileDiffMetadata } from "@pierre/diffs"
import { LoaderIcon } from "lucide-react"
import { useTheme } from "@/components/theme-provider"

import type {
  DiffComputationRequest,
  DiffComputationResponse,
} from "./diff-computation"

/**
 * Renders a side-by-side diff of old/new content using @pierre/diffs.
 * Uses a dynamic import for the React component to avoid type conflicts.
 */
export function DiffView({
  oldContent,
  newContent,
  filename = "row",
  diffStyle = "split",
}: {
  oldContent: string
  newContent: string
  filename?: string
  diffStyle?: "split" | "unified"
}) {
  const { resolvedTheme } = useTheme()
  const [diff, setDiff] = useState<FileDiffMetadata | null>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [ReadyComponent, setReadyComponent] = useState<any>(null)

  useEffect(() => {
    setDiff(null)
    setDiffError(null)
    const worker = new Worker(new URL("./diff-worker.ts", import.meta.url), {
      type: "module",
    })
    worker.onmessage = (event: MessageEvent<DiffComputationResponse>) => {
      worker.terminate()
      if (event.data.diff) {
        setDiff(event.data.diff)
        return
      }
      setDiffError(event.data.error ?? "Unable to compute this diff")
    }
    worker.onerror = () => {
      worker.terminate()
      setDiffError("Unable to compute this diff")
    }
    const request: DiffComputationRequest = {
      oldContent,
      newContent,
      filename,
    }
    worker.postMessage(request)
    return () => worker.terminate()
  }, [oldContent, newContent, filename])

  useEffect(() => {
    import("@pierre/diffs/react").then((mod) => {
      setReadyComponent(() => mod.FileDiff)
    })
  }, [])

  if (diffError) {
    return (
      <div className="py-3 text-xs text-destructive" role="alert">
        {diffError}
      </div>
    )
  }

  if (!diff) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <LoaderIcon className="h-3 w-3 animate-spin" />
        Computing diff...
      </div>
    )
  }

  if (!ReadyComponent) {
    return (
      <div className="min-h-[60px] text-xs text-muted-foreground py-2">
        Loading diff viewer...
      </div>
    )
  }

  return (
    <ReadyComponent
      key={resolvedTheme}
      fileDiff={diff}
      options={{
        diffStyle,
        lineDiffType: "word",
        diffIndicators: "classic",
        themeType: resolvedTheme ?? "system",
      }}
    />
  )
}
