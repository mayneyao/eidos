import type {
  MarkdownInputMode,
  MarkdownAnalysisOptions,
  MarkdownDocumentAnalysis,
} from "./document-contract"

export type SourceRangeUnavailableReason =
  | "discontinuous-editor-selection"
  | "discontinuous-source"
  | "empty-selection"
  | "protected-block"
  | "source-map-mismatch"

export interface EditableSourceRange {
  end: number
  /** Exact original interval when protected projected blocks are excluded. */
  expectedSource?: string
  inputProfile: MarkdownInputMode
  /** Preserved source reinserted after the edited source on commit. */
  protectedSourceSuffix?: string
  source: string
  start: number
}

export type EditableSourceRangeResult =
  | { range: EditableSourceRange; reason?: never }
  | { range?: never; reason: SourceRangeUnavailableReason }

function originalOffsetAtNormalizedOffset(
  source: string,
  normalizedOffset: number
): number {
  let originalOffset = source.charCodeAt(0) === 0xfeff ? 1 : 0
  let currentNormalizedOffset = 0
  while (
    originalOffset < source.length &&
    currentNormalizedOffset < normalizedOffset
  ) {
    if (source[originalOffset] === "\r") {
      originalOffset += source[originalOffset + 1] === "\n" ? 2 : 1
    } else {
      originalOffset += 1
    }
    currentNormalizedOffset += 1
  }
  return originalOffset
}

function sourceIndexGroups(indices: readonly number[]): number[][] {
  const groups: number[][] = []
  for (const index of indices) {
    const group = groups.at(-1)
    if (group?.at(-1) === index - 1) group.push(index)
    else groups.push([index])
  }
  return groups
}

function blockSeparator(source: string): string {
  const lineEnding = source.match(/\r\n|\r|\n/u)?.[0] ?? "\n"
  return `${lineEnding}${lineEnding}`
}

/**
 * Resolves consecutive editor root children back to their exact host-owned
 * Markdown source span. The mapping deliberately uses parser-owned offsets
 * rather than searching serialized text, so duplicate blocks and noncanonical
 * whitespace remain unambiguous.
 */
export function resolveEditableSourceRange({
  analyze,
  inputProfile,
  markdown,
  selectedIndices,
  syntaxFeatures,
  topLevelCount,
}: {
  analyze(
    markdown: string,
    options: MarkdownAnalysisOptions
  ): MarkdownDocumentAnalysis
  inputProfile: MarkdownInputMode
  markdown: string
  selectedIndices: readonly number[]
  syntaxFeatures: ReadonlySet<string>
  topLevelCount: number
}): EditableSourceRangeResult {
  if (selectedIndices.length === 0) return { reason: "empty-selection" }

  const orderedSelection = [...selectedIndices].sort(
    (left, right) => left - right
  )
  if (
    new Set(orderedSelection).size !== orderedSelection.length ||
    orderedSelection.some(
      (index, position) =>
        !Number.isInteger(index) ||
        index < 0 ||
        index >= topLevelCount ||
        (position > 0 && index !== orderedSelection[position - 1] + 1)
    )
  ) {
    return { reason: "discontinuous-editor-selection" }
  }

  const analysis = analyze(markdown, {
    inputProfile,
    syntaxFeatures,
  })
  const documentSegments = analysis.segments
  const editorSegments = [
    ...documentSegments.filter(
      (segment) => segment.projection?.placement !== "end"
    ),
    ...documentSegments.filter(
      (segment) => segment.projection?.placement === "end"
    ),
  ]

  if (editorSegments.length !== topLevelCount) {
    return { reason: "source-map-mismatch" }
  }

  const selectedSegments = orderedSelection.map(
    (index) => editorSegments[index]
  )
  if (
    selectedSegments.some(
      (segment) => segment.projection?.sourceEditable === false
    )
  ) {
    return { reason: "protected-block" }
  }

  const sourceIndices = selectedSegments
    .map((segment) => documentSegments.indexOf(segment))
    .sort((left, right) => left - right)
  if (sourceIndices.some((index) => index < 0)) {
    return { reason: "discontinuous-source" }
  }

  const selectedSourceIndices = new Set(sourceIndices)
  const firstSourceIndex = sourceIndices[0]
  const lastSourceIndex = sourceIndices.at(-1)!
  const protectedSourceIndices = Array.from(
    { length: lastSourceIndex - firstSourceIndex + 1 },
    (_, position) => firstSourceIndex + position
  ).filter((index) => !selectedSourceIndices.has(index))
  if (
    protectedSourceIndices.some(
      (index) => documentSegments[index].projection?.placement !== "end"
    )
  ) {
    return { reason: "discontinuous-source" }
  }

  const first = selectedSegments.reduce((current, segment) =>
    segment.start < current.start ? segment : current
  )
  const last = selectedSegments.reduce((current, segment) =>
    segment.end > current.end ? segment : current
  )
  const start = originalOffsetAtNormalizedOffset(markdown, first.start)
  const end = originalOffsetAtNormalizedOffset(markdown, last.end)
  const separator = blockSeparator(markdown)
  const source = sourceIndexGroups(sourceIndices)
    .map((group) => {
      const groupFirst = documentSegments[group[0]]
      const groupLast = documentSegments[group.at(-1)!]
      const groupStart = originalOffsetAtNormalizedOffset(
        markdown,
        groupFirst.start
      )
      const groupEnd = originalOffsetAtNormalizedOffset(markdown, groupLast.end)
      return markdown.slice(groupStart, groupEnd)
    })
    .join(separator)
  const protectedSource = sourceIndexGroups(protectedSourceIndices)
    .map((group) => {
      const groupFirst = documentSegments[group[0]]
      const groupLast = documentSegments[group.at(-1)!]
      const groupStart = originalOffsetAtNormalizedOffset(
        markdown,
        groupFirst.start
      )
      const groupEnd = originalOffsetAtNormalizedOffset(markdown, groupLast.end)
      return markdown.slice(groupStart, groupEnd)
    })
    .join(separator)
  return {
    range: {
      start,
      end,
      source,
      inputProfile:
        first.start === 0 && inputProfile === "document"
          ? "document"
          : "fragment",
      ...(protectedSource
        ? {
            expectedSource: markdown.slice(start, end),
            protectedSourceSuffix: `${separator}${protectedSource}`,
          }
        : {}),
    },
  }
}
