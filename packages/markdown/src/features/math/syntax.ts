import { isEscaped } from "../../markdown/source-escapes"

export function inlineMathSourceFromValue(
  source: string,
  value: string
): string {
  return source.startsWith("\\(") && source.endsWith("\\)")
    ? `\\(${value}\\)`
    : `$${value}$`
}

export interface MathSourceRange {
  start: number
  end: number
}

function lineEnd(source: string, start: number): number {
  const newline = source.indexOf("\n", start)
  return newline === -1 ? source.length : newline
}

function isInsideRange(
  offset: number,
  ranges: readonly MathSourceRange[]
): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end)
}

export function scanDisplayMath(
  source: string,
  protectedRanges: readonly MathSourceRange[]
) {
  const ranges: MathSourceRange[] = []
  const unterminated: MathSourceRange[] = []
  let cursor = 0
  while (cursor <= source.length) {
    const end = lineEnd(source, cursor)
    const line = source.slice(cursor, end)
    if (!isInsideRange(cursor, protectedRanges) && /^ {0,3}\$\$$/u.test(line)) {
      let closingStart = end < source.length ? end + 1 : source.length
      let closingEnd: number | null = null
      while (closingStart <= source.length) {
        const candidateEnd = lineEnd(source, closingStart)
        if (/^ {0,3}\$\$$/u.test(source.slice(closingStart, candidateEnd))) {
          closingEnd = candidateEnd
          break
        }
        if (candidateEnd === source.length) break
        closingStart = candidateEnd + 1
      }

      if (closingEnd === null) {
        ranges.push({ start: cursor, end: source.length })
        unterminated.push({ start: cursor, end })
        break
      }

      ranges.push({ start: cursor, end: closingEnd })
      cursor = closingEnd < source.length ? closingEnd + 1 : source.length + 1
      continue
    }
    if (end === source.length) break
    cursor = end + 1
  }
  return { unterminated, ranges }
}

export function scanInlineMath(
  source: string,
  range: MathSourceRange,
  protectedRanges: readonly MathSourceRange[]
): MathSourceRange[] {
  const mathRanges: MathSourceRange[] = []
  for (let opening = range.start; opening < range.end; opening += 1) {
    if (
      source[opening] !== "$" ||
      source[opening - 1] === "$" ||
      source[opening + 1] === "$" ||
      isEscaped(source, opening) ||
      isInsideRange(opening, protectedRanges) ||
      source[opening + 1] === undefined ||
      /\s/u.test(source[opening + 1])
    ) {
      continue
    }

    for (let closing = opening + 1; closing < range.end; closing += 1) {
      const character = source[closing]
      if (character === "\n") break
      if (
        character !== "$" ||
        source[closing - 1] === "$" ||
        source[closing + 1] === "$" ||
        isEscaped(source, closing) ||
        isInsideRange(closing, protectedRanges) ||
        /\s/u.test(source[closing - 1]) ||
        /[0-9]/u.test(source[closing + 1] ?? "")
      ) {
        continue
      }
      mathRanges.push({ start: opening, end: closing + 1 })
      opening = closing
      break
    }
  }
  return mathRanges
}
