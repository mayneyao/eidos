import { FileDiff, Virtualizer } from "@pierre/diffs/react"
import {
  getFiletypeFromFileName,
  preloadHighlighter,
  type FileDiffMetadata,
} from "@pierre/diffs"

import type { ResolvedAppearance } from "./app-appearance"

export async function preparePierreTextDiff(
  diff: FileDiffMetadata
): Promise<void> {
  await preloadHighlighter({
    themes: ["pierre-light", "pierre-dark"],
    langs: [diff.lang ?? getFiletypeFromFileName(diff.name)],
  })
}

export default function PierreTextDiffSurface({
  diff,
  layout,
  softWrap = false,
  theme,
}: {
  diff: FileDiffMetadata
  layout: "split" | "unified"
  softWrap?: boolean
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
          overflow: softWrap ? "wrap" : "scroll",
        }}
      />
    </Virtualizer>
  )
}
