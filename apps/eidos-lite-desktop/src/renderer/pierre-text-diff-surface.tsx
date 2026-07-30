import { FileDiff, Virtualizer } from "@pierre/diffs/react"
import type { FileDiffMetadata } from "@pierre/diffs"

export default function PierreTextDiffSurface({
  diff,
  layout,
}: {
  diff: FileDiffMetadata
  layout: "split" | "unified"
}) {
  return (
    <Virtualizer className="version-text-diff-virtualizer">
      <FileDiff
        fileDiff={diff}
        options={{
          diffStyle: layout,
          lineDiffType: "word",
          diffIndicators: "classic",
          themeType: "system",
          disableFileHeader: true,
          stickyHeader: false,
          overflow: "scroll",
        }}
      />
    </Virtualizer>
  )
}
