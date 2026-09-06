export interface TextSearchHit {
  relativePath: string
  revision: string
  start: number
  end: number
  line: number
  column: number
  snippet: string
  query: string
}

export interface TextSearchProgress {
  requestId: string
  hits: TextSearchHit[]
  scanned: number
  skipped: number
  errors: number
  done: boolean
  stopped: "cancelled" | "limit" | null
}

export interface TextSearchTarget {
  requestId: string
  query: string
  start: number
  end: number
}

export function literalTextMatches(
  content: string,
  query: string,
  limit = 500
): { start: number; end: number }[] {
  if (!query) return []
  const expression = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "giu"
  )
  const matches: { start: number; end: number }[] = []
  for (const match of content.matchAll(expression)) {
    matches.push({ start: match.index, end: match.index + match[0].length })
    if (matches.length >= limit) break
  }
  return matches
}

/** Never apply an old offset to changed bytes; choose the closest current match. */
export function resolveTextSearchTarget(
  content: string,
  target: TextSearchTarget
): TextSearchTarget | null {
  const matches = literalTextMatches(content, target.query, 2000)
  const match = matches.reduce<(typeof matches)[number] | null>(
    (best, current) =>
      !best ||
      Math.abs(current.start - target.start) <
        Math.abs(best.start - target.start)
        ? current
        : best,
    null
  )
  return match ? { ...target, ...match } : null
}

export function textOffsetPosition(
  content: string,
  offset: number
): { lineNumber: number; character: number } {
  const prefix = content.slice(0, offset)
  return {
    lineNumber: prefix.split("\n").length,
    character: offset - prefix.lastIndexOf("\n") - 1,
  }
}
