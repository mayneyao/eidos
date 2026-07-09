"use client"

import { useEffect, useState } from "react"
import { parseDiffFromFile, type FileDiffMetadata } from "@pierre/diffs"
import { LoaderIcon } from "lucide-react"
import { useTheme } from "@/components/theme-provider"

/**
 * Renders a side-by-side diff of old/new content using @pierre/diffs.
 * Uses a dynamic import for the React component to avoid type conflicts.
 */
export function DiffView({
  oldContent,
  newContent,
  filename = "row",
}: {
  oldContent: string
  newContent: string
  filename?: string
}) {
  const { resolvedTheme } = useTheme()
  const [diff, setDiff] = useState<FileDiffMetadata | null>(null)
  const [ReadyComponent, setReadyComponent] = useState<any>(null)

  useEffect(() => {
    const result = parseDiffFromFile(
      { name: filename, contents: oldContent },
      { name: filename, contents: newContent }
    )
    setDiff(result)
  }, [oldContent, newContent, filename])

  useEffect(() => {
    import("@pierre/diffs/react").then((mod) => {
      setReadyComponent(() => mod.FileDiff)
    })
  }, [])

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
        diffStyle: "split",
        lineDiffType: "word",
        diffIndicators: "classic",
        themeType: resolvedTheme ?? "system",
      }}
    />
  )
}
