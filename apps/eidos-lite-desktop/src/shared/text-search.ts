export interface TextSearchOptions {
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
}
export function normalizeTextSearchOptions(value: unknown): TextSearchOptions {
  if (value === undefined) return {}
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid search options")
  const options = value as Record<string, unknown>
  for (const [key, setting] of Object.entries(options))
    if (
      !["caseSensitive", "wholeWord", "regex"].includes(key) ||
      typeof setting !== "boolean"
    )
      throw new Error("Invalid search options")
  return {
    caseSensitive: options.caseSensitive === true,
    wholeWord: options.wholeWord === true,
    regex: options.regex === true,
  }
}

export interface TextSearchHit {
  relativePath: string
  revision: string
  start: number
  end: number
  line: number
  column: number
  snippet: string
  query: string
  options?: TextSearchOptions
  matchedText?: string
  highlightRanges?: { start: number; end: number }[]
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
  options?: TextSearchOptions
}

export function literalTextMatches(
  content: string,
  query: string,
  limit = 500,
  options: TextSearchOptions = {}
): { start: number; end: number }[] {
  if (!query) return []
  const expression = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    options.caseSensitive ? "gu" : "giu"
  )
  const matches: { start: number; end: number }[] = []
  for (const match of content.matchAll(expression)) {
    if (
      options.wholeWord &&
      (/[\p{L}\p{N}\p{M}_]$/u.test(
        content.slice(Math.max(0, match.index - 2), match.index)
      ) ||
        /^[\p{L}\p{N}\p{M}_]/u.test(
          content.slice(
            match.index + match[0].length,
            match.index + match[0].length + 2
          )
        ))
    )
      continue
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
  const matches = literalTextMatches(
    content,
    target.query,
    2000,
    target.options
  )
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
