import { diffArrays } from "diff"

interface AlignmentSegment {
  baseStart: number
  baseEnd: number
  targetStart: number
  targetEnd: number
  equal: boolean
}

interface Replacement {
  baseStart: number
  baseEnd: number
  targetStart: number
  targetEnd: number
}

function lines(value: string): string[] {
  return value.match(/[^\n]*\n|[^\n]+$/gu) ?? []
}

function occurrenceIndex(
  value: string,
  search: string,
  ordinal: number
): number {
  let offset = 0
  for (let current = 0; current <= ordinal; current += 1) {
    offset = value.indexOf(search, offset)
    if (offset < 0) return -1
    if (current === ordinal) return offset
    offset += search.length
  }
  return -1
}

function correspondingOccurrence(
  source: string,
  canonical: string,
  search: string,
  canonicalOffset: number
): number {
  let ordinal = 0
  let occurrence = canonical.indexOf(search)
  while (occurrence >= 0 && occurrence < canonicalOffset) {
    ordinal += 1
    occurrence = canonical.indexOf(search, occurrence + search.length)
  }
  return occurrenceIndex(source, search, ordinal)
}

function localizedLineEdit(
  source: string,
  canonicalBefore: string,
  canonicalAfter: string,
  beforeLines: readonly string[],
  afterLines: readonly string[]
): string | null {
  let prefix = 0
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - suffix - 1] ===
      afterLines[afterLines.length - suffix - 1]
  ) {
    suffix += 1
  }

  const beforeEnd = beforeLines.length - suffix
  const afterEnd = afterLines.length - suffix
  const previous = beforeLines.slice(prefix, beforeEnd).join("")
  const next = afterLines.slice(prefix, afterEnd).join("")
  const canonicalOffset = beforeLines.slice(0, prefix).join("").length
  if (!previous.trim()) {
    const followingIndex = beforeLines
      .slice(beforeEnd)
      .findIndex((line) => line.trim())
    if (followingIndex < 0) return `${source}${next}`
    const followingLineIndex = beforeEnd + followingIndex
    const following = beforeLines[followingLineIndex]
    const followingOffset = beforeLines
      .slice(0, followingLineIndex)
      .join("").length
    const sourceOffset = correspondingOccurrence(
      source,
      canonicalBefore,
      following,
      followingOffset
    )
    if (sourceOffset < 0) return null
    return `${source.slice(0, sourceOffset)}${next}${source.slice(sourceOffset)}`
  }
  const sourceOffset = correspondingOccurrence(
    source,
    canonicalBefore,
    previous,
    canonicalOffset
  )
  if (sourceOffset < 0) return null
  return `${source.slice(0, sourceOffset)}${next}${source.slice(sourceOffset + previous.length)}`
}

function alignment(base: readonly string[], target: readonly string[]) {
  const segments: AlignmentSegment[] = []
  const changes = diffArrays([...base], [...target])
  let baseOffset = 0
  let targetOffset = 0

  for (let index = 0; index < changes.length; ) {
    const change = changes[index]
    if (!change.added && !change.removed) {
      const length = change.value.length
      segments.push({
        baseStart: baseOffset,
        baseEnd: baseOffset + length,
        targetStart: targetOffset,
        targetEnd: targetOffset + length,
        equal: true,
      })
      baseOffset += length
      targetOffset += length
      index += 1
      continue
    }

    const baseStart = baseOffset
    const targetStart = targetOffset
    while (index < changes.length) {
      const part = changes[index]
      if (!part.added && !part.removed) break
      if (part.removed) baseOffset += part.value.length
      if (part.added) targetOffset += part.value.length
      index += 1
    }
    segments.push({
      baseStart,
      baseEnd: baseOffset,
      targetStart,
      targetEnd: targetOffset,
      equal: false,
    })
  }

  return segments
}

function mapBoundary(
  segments: readonly AlignmentSegment[],
  boundary: number,
  bias: "start" | "end"
): number {
  for (const segment of segments) {
    if (boundary < segment.baseStart) return segment.targetStart
    if (boundary > segment.baseEnd) continue
    if (segment.equal) {
      return segment.targetStart + (boundary - segment.baseStart)
    }
    if (boundary === segment.baseStart) return segment.targetStart
    if (boundary === segment.baseEnd) return segment.targetEnd
    return bias === "start" ? segment.targetStart : segment.targetEnd
  }
  return segments.at(-1)?.targetEnd ?? 0
}

function changedSegments(
  base: readonly string[],
  target: readonly string[]
): Replacement[] {
  return alignment(base, target)
    .filter((segment) => !segment.equal)
    .map(({ baseStart, baseEnd, targetStart, targetEnd }) => ({
      baseStart,
      baseEnd,
      targetStart,
      targetEnd,
    }))
}

function intersectsOrTouchesInsertion(
  replacement: Replacement,
  segment: AlignmentSegment
): boolean {
  if (segment.equal) return false
  if (replacement.baseStart === replacement.baseEnd) {
    return (
      replacement.baseStart >= segment.baseStart &&
      replacement.baseStart <= segment.baseEnd
    )
  }
  return (
    replacement.baseStart < segment.baseEnd &&
    replacement.baseEnd > segment.baseStart
  )
}

/**
 * Applies edits made to Lexical's canonical Markdown projection back onto the
 * last host-owned source. Unchanged lines keep their original spelling and
 * separators, while edited regions adopt the new canonical representation.
 */
export function preserveMarkdownSourceEdits(
  source: string,
  canonicalBefore: string,
  canonicalAfter: string
): string {
  if (canonicalBefore === canonicalAfter) return source
  if (source === canonicalBefore) return canonicalAfter

  const sourceLines = lines(source)
  const beforeLines = lines(canonicalBefore)
  const afterLines = lines(canonicalAfter)
  const localized = localizedLineEdit(
    source,
    canonicalBefore,
    canonicalAfter,
    beforeLines,
    afterLines
  )
  if (localized !== null) return localized
  const sourceAlignment = alignment(beforeLines, sourceLines)
  const afterAlignment = alignment(beforeLines, afterLines)
  const replacements = changedSegments(beforeLines, afterLines)
    .map((replacement) => {
      let baseStart = replacement.baseStart
      let baseEnd = replacement.baseEnd
      for (const segment of sourceAlignment) {
        if (!intersectsOrTouchesInsertion(replacement, segment)) continue
        baseStart = Math.min(baseStart, segment.baseStart)
        baseEnd = Math.max(baseEnd, segment.baseEnd)
      }
      return {
        sourceStart: mapBoundary(sourceAlignment, baseStart, "start"),
        sourceEnd: mapBoundary(sourceAlignment, baseEnd, "end"),
        afterStart: mapBoundary(afterAlignment, baseStart, "start"),
        afterEnd: mapBoundary(afterAlignment, baseEnd, "end"),
      }
    })
    .sort((left, right) => left.sourceStart - right.sourceStart)

  const merged: typeof replacements = []
  for (const replacement of replacements) {
    const previous = merged.at(-1)
    if (!previous || replacement.sourceStart > previous.sourceEnd) {
      merged.push(replacement)
      continue
    }
    previous.sourceEnd = Math.max(previous.sourceEnd, replacement.sourceEnd)
    previous.afterEnd = Math.max(previous.afterEnd, replacement.afterEnd)
  }

  let output = sourceLines
  for (let index = merged.length - 1; index >= 0; index -= 1) {
    const replacement = merged[index]
    output = [
      ...output.slice(0, replacement.sourceStart),
      ...afterLines.slice(replacement.afterStart, replacement.afterEnd),
      ...output.slice(replacement.sourceEnd),
    ]
  }
  return output.join("")
}
