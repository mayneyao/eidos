import { isEscaped } from "../../markdown/source-escapes"
import type { MarkdownSyntaxRange } from "../../core/block-syntax"

export const HIGHLIGHT_DELIMITER = "=="
export function scanHighlight(
  source: string,
  protectedRanges: readonly MarkdownSyntaxRange[]
) {
  const ranges: MarkdownSyntaxRange[] = []
  for (const match of source.matchAll(/==(?=\S)([^\n]+?\S|\S)==/gu)) {
    const start = match.index,
      end = start + match[0].length
    if (
      isEscaped(source, start) ||
      isEscaped(source, end - HIGHLIGHT_DELIMITER.length) ||
      protectedRanges.some((range) => start < range.end && end > range.start)
    )
      continue
    ranges.push({ start, end })
  }
  return ranges
}
