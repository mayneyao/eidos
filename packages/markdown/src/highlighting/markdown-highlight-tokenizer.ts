import { parse, postprocess, preprocess } from "micromark"
import { gfm } from "micromark-extension-gfm"

import type {
  CodeHighlightKind,
  CodeHighlightToken,
} from "./code-highlight-tokenizer"

interface HighlightCandidate extends CodeHighlightToken {
  order: number
  priority: number
}

interface SourceLine {
  contentEnd: number
  end: number
  start: number
  text: string
}

interface SourceRange {
  end: number
  start: number
}

const GFM_EXTENSION = gfm()

function sourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = []
  let start = 0
  while (start < source.length) {
    const newline = source.indexOf("\n", start)
    const end = newline < 0 ? source.length : newline + 1
    let contentEnd = newline < 0 ? source.length : newline
    if (contentEnd > start && source[contentEnd - 1] === "\r") contentEnd -= 1
    lines.push({
      contentEnd,
      end,
      start,
      text: source.slice(start, contentEnd),
    })
    start = end
  }
  return lines
}

function overlaps(range: SourceRange, ranges: readonly SourceRange[]): boolean {
  return ranges.some(
    (candidate) => range.start < candidate.end && range.end > candidate.start
  )
}

function contains(range: SourceRange, inner: SourceRange): boolean {
  return inner.start >= range.start && inner.end <= range.end
}

function addCandidate(
  candidates: HighlightCandidate[],
  sourceLength: number,
  start: number,
  end: number,
  kind: CodeHighlightKind,
  priority: number
): void {
  if (start < 0 || end <= start || end > sourceLength) return
  candidates.push({
    start,
    end,
    kind,
    priority,
    order: candidates.length,
  })
}

function candidateWins(
  left: HighlightCandidate,
  right: HighlightCandidate
): boolean {
  if (left.priority !== right.priority) return left.priority > right.priority
  const leftLength = left.end - left.start
  const rightLength = right.end - right.start
  if (leftLength !== rightLength) return leftLength < rightLength
  return left.order > right.order
}

function flattenCandidates(
  candidates: readonly HighlightCandidate[]
): CodeHighlightToken[] {
  const starts = new Map<number, HighlightCandidate[]>()
  const ends = new Map<number, HighlightCandidate[]>()
  const offsets = new Set<number>()
  for (const candidate of candidates) {
    offsets.add(candidate.start)
    offsets.add(candidate.end)
    const starting = starts.get(candidate.start)
    if (starting) starting.push(candidate)
    else starts.set(candidate.start, [candidate])
    const ending = ends.get(candidate.end)
    if (ending) ending.push(candidate)
    else ends.set(candidate.end, [candidate])
  }

  const active = new Set<HighlightCandidate>()
  const tokens: CodeHighlightToken[] = []
  let previous: number | null = null
  for (const offset of [...offsets].sort((left, right) => left - right)) {
    if (previous !== null && offset > previous && active.size > 0) {
      let winner: HighlightCandidate | null = null
      for (const candidate of active) {
        if (!winner || candidateWins(candidate, winner)) winner = candidate
      }
      if (winner) {
        const last = tokens.at(-1)
        if (last?.kind === winner.kind && last.end === previous)
          last.end = offset
        else tokens.push({ start: previous, end: offset, kind: winner.kind })
      }
    }
    for (const candidate of ends.get(offset) ?? []) active.delete(candidate)
    for (const candidate of starts.get(offset) ?? []) active.add(candidate)
    previous = offset
  }
  return tokens
}

function markdownKind(type: string): {
  kind: CodeHighlightKind
  priority: number
} | null {
  switch (type) {
    case "atxHeadingSequence":
    case "atxHeadingText":
    case "setextHeadingLineSequence":
    case "setextHeadingText":
      return { kind: "keyword", priority: 30 }
    case "blockQuote":
      return { kind: "comment", priority: 5 }
    case "blockQuoteMarker":
      return { kind: "comment", priority: 90 }
    case "listItemMarker":
    case "listItemValue":
    case "taskListCheckMarker":
    case "taskListCheckValueChecked":
    case "taskListCheckValueUnchecked":
      return { kind: "keyword", priority: 90 }
    case "emphasisSequence":
    case "emphasisText":
      return { kind: "variable", priority: 50 }
    case "strongSequence":
    case "strongText":
      return { kind: "type", priority: 55 }
    case "strikethroughSequence":
    case "strikethroughText":
      return { kind: "deleted", priority: 55 }
    case "labelText":
    case "referenceString":
      return { kind: "function", priority: 45 }
    case "definitionLabelString":
    case "gfmFootnoteDefinitionLabelString":
      return { kind: "property", priority: 55 }
    case "gfmFootnoteCallString":
      return { kind: "function", priority: 55 }
    case "resourceDestinationString":
    case "definitionDestinationString":
    case "autolinkEmail":
    case "autolinkProtocol":
    case "literalAutolinkEmail":
    case "literalAutolinkHttp":
    case "literalAutolinkWww":
      return { kind: "string", priority: 65 }
    case "resourceTitleString":
    case "definitionTitleString":
      return { kind: "string", priority: 60 }
    case "codeTextData":
    case "codeTextPadding":
    case "codeFlowValue":
    case "codeIndented":
      return { kind: "string", priority: 60 }
    case "codeFencedFenceInfo":
    case "codeFencedFenceMeta":
      return { kind: "property", priority: 70 }
    case "codeFencedFenceSequence":
    case "codeTextSequence":
      return { kind: "operator", priority: 90 }
    case "tableDelimiterRow":
      return { kind: "operator", priority: 20 }
    case "tableCellDivider":
    case "tableDelimiterFiller":
    case "tableDelimiterMarker":
      return { kind: "operator", priority: 90 }
    case "htmlFlowData":
    case "htmlTextData":
      return { kind: "tag", priority: 70 }
    case "characterReferenceValue":
      return { kind: "number", priority: 60 }
    case "autolinkMarker":
    case "characterReferenceMarker":
    case "characterReferenceMarkerHexadecimal":
    case "characterReferenceMarkerNumeric":
    case "definitionLabelMarker":
    case "definitionMarker":
    case "definitionTitleMarker":
    case "escapeMarker":
    case "gfmFootnoteCallLabelMarker":
    case "gfmFootnoteCallMarker":
    case "gfmFootnoteDefinitionLabelMarker":
    case "gfmFootnoteDefinitionMarker":
    case "hardBreakEscape":
    case "hardBreakTrailing":
    case "labelImageMarker":
    case "labelMarker":
    case "referenceMarker":
    case "resourceDestinationLiteralMarker":
    case "resourceMarker":
    case "resourceTitleMarker":
    case "thematicBreakSequence":
      return { kind: "operator", priority: 90 }
    default:
      return null
  }
}

function yamlCommentStart(line: string): number {
  let quote: "double" | "single" | null = null
  let escaped = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (quote === "double") {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === '"') quote = null
      continue
    }
    if (quote === "single") {
      if (character === "'" && line[index + 1] === "'") index += 1
      else if (character === "'") quote = null
      continue
    }
    if (character === '"') quote = "double"
    else if (character === "'") quote = "single"
    else if (character === "#" && (index === 0 || /\s/u.test(line[index - 1])))
      return index
  }
  return -1
}

function addFrontmatter(
  source: string,
  lines: readonly SourceLine[],
  candidates: HighlightCandidate[],
  blocked: SourceRange[]
): void {
  if (lines[0]?.text.trimEnd() !== "---") return
  const closingIndex = lines.findIndex(
    (line, index) =>
      index > 0 && (line.text.trim() === "---" || line.text.trim() === "...")
  )
  if (closingIndex < 0) return

  const closing = lines[closingIndex]
  blocked.push({ start: 0, end: closing.contentEnd })
  addCandidate(candidates, source.length, 0, 3, "property", 100)
  const closingStart = closing.start + closing.text.search(/\S/u)
  addCandidate(
    candidates,
    source.length,
    closingStart,
    closingStart + closing.text.trim().length,
    "property",
    100
  )

  for (const line of lines.slice(1, closingIndex)) {
    const commentStart = yamlCommentStart(line.text)
    const syntaxEnd = commentStart < 0 ? line.text.length : commentStart
    if (commentStart >= 0) {
      addCandidate(
        candidates,
        source.length,
        line.start + commentStart,
        line.contentEnd,
        "comment",
        90
      )
    }

    const syntax = line.text.slice(0, syntaxEnd)
    const key = /^(?:\s*-\s+)?\s*([A-Za-z_][\w.-]*)(?=\s*:)/u.exec(syntax)
    if (key?.index !== undefined) {
      const keyStart = line.start + key.index + key[0].lastIndexOf(key[1])
      addCandidate(
        candidates,
        source.length,
        keyStart,
        keyStart + key[1].length,
        "property",
        70
      )
    }

    for (const match of syntax.matchAll(/"(?:\\.|[^"\\])*"|'(?:''|[^'])*'/gu)) {
      addCandidate(
        candidates,
        source.length,
        line.start + match.index,
        line.start + match.index + match[0].length,
        "string",
        80
      )
    }
    for (const match of syntax.matchAll(
      /\b(?:false|null|true|[-+]?\d+(?:\.\d+)?)\b|(?<!\S)~(?!\S)/giu
    )) {
      addCandidate(
        candidates,
        source.length,
        line.start + match.index,
        line.start + match.index + match[0].length,
        /\d/u.test(match[0]) ? "number" : "keyword",
        60
      )
    }
  }
}

function addDisplayMath(
  source: string,
  lines: readonly SourceLine[],
  protectedRanges: readonly SourceRange[],
  candidates: HighlightCandidate[],
  blocked: SourceRange[]
): void {
  for (let index = 0; index < lines.length; index += 1) {
    const opening = lines[index]
    if (opening.text.trim() !== "$$") continue
    if (overlaps(opening, protectedRanges) || overlaps(opening, blocked))
      continue

    let closingIndex = -1
    for (let candidate = index + 1; candidate < lines.length; candidate += 1) {
      if (lines[candidate].text.trim() === "$$") {
        closingIndex = candidate
        break
      }
    }
    const closing = closingIndex < 0 ? null : lines[closingIndex]
    const end = closing?.contentEnd ?? source.length
    blocked.push({ start: opening.start, end })

    const openingStart = opening.start + opening.text.indexOf("$$")
    addCandidate(
      candidates,
      source.length,
      openingStart,
      openingStart + 2,
      "type",
      100
    )
    const bodyStart = opening.end
    const bodyEnd = closing?.start ?? source.length
    addCandidate(candidates, source.length, bodyStart, bodyEnd, "type", 60)
    if (closing) {
      const closingStart = closing.start + closing.text.indexOf("$$")
      addCandidate(
        candidates,
        source.length,
        closingStart,
        closingStart + 2,
        "type",
        100
      )
      index = closingIndex
    } else {
      break
    }
  }
}

function addInlineEfm(
  source: string,
  protectedRanges: readonly SourceRange[],
  candidates: HighlightCandidate[]
): void {
  for (const match of source.matchAll(
    /==(?=\S)(?:\\.|[^=\n]|=(?!=))+?(?<=\S)==/gu
  )) {
    const range = { start: match.index, end: match.index + match[0].length }
    if (overlaps(range, protectedRanges)) continue
    addCandidate(
      candidates,
      source.length,
      range.start,
      range.end,
      "inserted",
      65
    )
  }

  for (const match of source.matchAll(
    /(^|[^\\$])\$(?![\s$])(?:\\.|[^\\$\n])*(?<!\s)\$(?!\d)/gmu
  )) {
    const start = match.index + match[1].length
    const range = { start, end: match.index + match[0].length }
    if (overlaps(range, protectedRanges)) continue
    addCandidate(candidates, source.length, range.start, range.end, "type", 70)
  }
}

/**
 * Tokenize CommonMark, GFM, and the source-editable EFM extensions. Micromark
 * supplies exact parser-owned offsets; the small supplemental pass covers YAML
 * frontmatter, math, and `==highlight==`, which are outside its GFM grammar.
 */
export function tokenizeMarkdownLightweight(
  source: string
): readonly CodeHighlightToken[] {
  if (!source) return []

  const events = postprocess(
    parse({ extensions: [GFM_EXTENSION] })
      .document()
      .write(preprocess()(source, undefined, true))
  )
  const enterEvents = events.filter(([action]) => action === "enter")
  const candidates: HighlightCandidate[] = []
  const extensionProtected: SourceRange[] = []
  const customBlocked: SourceRange[] = []
  const lines = sourceLines(source)

  for (const [, token] of enterEvents) {
    const type: string = token.type
    if (
      type === "codeFenced" ||
      type === "codeIndented" ||
      type === "codeText" ||
      type === "htmlFlow" ||
      type === "htmlText"
    ) {
      extensionProtected.push({
        start: token.start.offset,
        end: token.end.offset,
      })
    }
  }

  addFrontmatter(source, lines, candidates, customBlocked)
  addDisplayMath(source, lines, extensionProtected, candidates, customBlocked)

  const mathFences = enterEvents.flatMap(([, token]) => {
    if (token.type !== "codeFenced") return []
    const range = { start: token.start.offset, end: token.end.offset }
    const info = enterEvents.find(
      ([, candidate]) =>
        candidate.type === "codeFencedFenceInfo" &&
        contains(range, {
          start: candidate.start.offset,
          end: candidate.end.offset,
        })
    )
    return info &&
      source.slice(info[1].start.offset, info[1].end.offset) === "math"
      ? [range]
      : []
  })

  for (const [, token] of enterEvents) {
    const range = { start: token.start.offset, end: token.end.offset }
    if (overlaps(range, customBlocked)) continue
    const mapping = markdownKind(String(token.type))
    if (!mapping) continue
    const kind =
      token.type === "codeFlowValue" &&
      mathFences.some((fence) => contains(fence, range))
        ? "type"
        : mapping.kind
    const fragment = source.slice(range.start, range.end)
    addCandidate(
      candidates,
      source.length,
      range.start,
      range.end,
      (token.type === "htmlFlowData" || token.type === "htmlTextData") &&
        fragment.startsWith("<!--")
        ? "comment"
        : kind,
      mapping.priority
    )
  }

  addInlineEfm(source, [...extensionProtected, ...customBlocked], candidates)
  return flattenCandidates(candidates)
}
