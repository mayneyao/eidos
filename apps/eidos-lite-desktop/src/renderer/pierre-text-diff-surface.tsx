import { FileDiff, Virtualizer } from "@pierre/diffs/react"
import type { FileDiffMetadata } from "@pierre/diffs"

import type { ResolvedAppearance } from "./app-appearance"

export default function PierreTextDiffSurface({
  diff,
  layout,
  theme,
}: {
  diff: FileDiffMetadata
  layout: "split" | "unified"
  theme: ResolvedAppearance
}) {
  return (
    <Virtualizer className="version-text-diff-virtualizer">
      <FileDiff
        fileDiff={diff}
        options={{
          diffStyle: layout,
          lineDiffType: "word",
          diffIndicators: "classic",
          themeType: theme,
          disableFileHeader: true,
          stickyHeader: false,
          overflow: "scroll",
        }}
      />
    </Virtualizer>
  )
}
