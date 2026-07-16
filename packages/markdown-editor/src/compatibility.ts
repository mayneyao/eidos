import { splitMarkdownDocument } from "./document"

export type MarkdownCompatibilityIssueCode =
  | "footnote"
  | "math"
  | "obsidian-block-id"
  | "obsidian-callout"
  | "obsidian-comment"
  | "obsidian-highlight"
  | "raw-html"

export interface MarkdownCompatibilityIssue {
  code: MarkdownCompatibilityIssueCode
  line: number
  message: string
  source: string
}

const ISSUE_MESSAGES: Record<MarkdownCompatibilityIssueCode, string> = {
  footnote:
    "Footnotes are preserved as source but are not visually editable yet.",
  math: "Math notation is preserved as source but is not visually editable yet.",
  "obsidian-block-id":
    "Obsidian block identifiers are preserved as source but are not visually editable yet.",
  "obsidian-callout":
    "Obsidian callouts are preserved as source but are not visually editable yet.",
  "obsidian-comment":
    "Obsidian comments are preserved as source but are not visually editable yet.",
  "obsidian-highlight":
    "Obsidian highlights are preserved as source but are not visually editable yet.",
  "raw-html":
    "Raw HTML or MDX is preserved as source but is not visually editable yet.",
}

/**
 * Finds extensions that the package deliberately keeps in its lossless raw
 * fallback. CommonMark and GFM constructs are handled by `@lexical/mdast` and
 * must not be rejected here merely because their source spelling is unusual.
 */
export function findUnsupportedMarkdown(
  markdown: string
): MarkdownCompatibilityIssue[] {
  const source = markdown.replace(/\r\n?/g, "\n")
  const { body, bodyOffset } = splitMarkdownDocument(source)
  const visible = maskCode(body)
  const issues: MarkdownCompatibilityIssue[] = []
  const seen = new Set<string>()

  const add = (
    code: MarkdownCompatibilityIssueCode,
    match: RegExpMatchArray
  ) => {
    const index = bodyOffset + (match.index ?? 0)
    const line = lineAt(source, index)
    const key = `${code}:${line}`
    if (seen.has(key)) return
    seen.add(key)
    issues.push({
      code,
      line,
      message: ISSUE_MESSAGES[code],
      source: source.slice(index, index + match[0].length).split("\n", 1)[0],
    })
  }

  collect(visible, /\[\^[^\]\n]+\](?::)?/g, (match) => add("footnote", match))
  collect(
    visible,
    /(?:<!--|<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s[^<>]*|\s*\/?)>)/g,
    (match) => add("raw-html", match)
  )
  collect(visible, /(?<!\\)\$\$/g, (match) => add("math", match))
  collect(
    visible,
    /(?<!\\)\\\([\s\S]*?(?<!\\)\\\)|(?<!\\)\\\[[\s\S]*?(?<!\\)\\\]/g,
    (match) => add("math", match)
  )
  collect(
    visible,
    /(?<!\\)\$(?![\s$])(?:[^$\n\\]|\\.)+?(?<![\s\\])\$/g,
    (match) => add("math", match)
  )
  collect(visible, /%%[^\n]*(?:%%|$)/g, (match) =>
    add("obsidian-comment", match)
  )
  collect(visible, /==[^=\n]+==/g, (match) => add("obsidian-highlight", match))
  collect(visible, /^ {0,3}>[ \t]*\[![^\]\n]+\]/gm, (match) =>
    add("obsidian-callout", match)
  )
  collect(visible, /(?:^|[ \t])\^[A-Za-z0-9][\w-]*[ \t]*$/gm, (match) =>
    add("obsidian-block-id", match)
  )

  return issues.sort((left, right) => left.line - right.line)
}

function collect(
  value: string,
  pattern: RegExp,
  visit: (match: RegExpMatchArray) => void
) {
  for (const match of value.matchAll(pattern)) visit(match)
}

function lineAt(source: string, index: number): number {
  let line = 1
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source.charCodeAt(cursor) === 10) line += 1
  }
  return line
}

/** Masks fenced, indented, and inline code without changing UTF-16 offsets. */
function maskCode(source: string): string {
  const output = source.split("")
  const lines = source.match(/[^\n]*(?:\n|$)/g) ?? []
  let offset = 0
  let fence: { marker: "`" | "~"; length: number } | null = null

  const mask = (start: number, end: number) => {
    for (let index = start; index < end; index += 1) {
      if (output[index] !== "\n") output[index] = "\uE000"
    }
  }

  for (const rawLine of lines) {
    if (!rawLine) continue
    const line = rawLine.endsWith("\n") ? rawLine.slice(0, -1) : rawLine
    if (fence) {
      mask(offset, offset + rawLine.length)
      const closing = line.match(/^ {0,3}(`+|~+)[ \t]*$/)
      if (
        closing &&
        closing[1]?.[0] === fence.marker &&
        closing[1].length >= fence.length
      ) {
        fence = null
      }
      offset += rawLine.length
      continue
    }

    const opening = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (opening?.[1]) {
      fence = {
        marker: opening[1][0] as "`" | "~",
        length: opening[1].length,
      }
      mask(offset, offset + rawLine.length)
      offset += rawLine.length
      continue
    }

    if (/^(?: {4}|\t)/.test(line)) {
      mask(offset, offset + rawLine.length)
      offset += rawLine.length
      continue
    }

    maskInlineCode(line, offset, mask)
    offset += rawLine.length
  }
  return output.join("")
}

function maskInlineCode(
  line: string,
  offset: number,
  mask: (start: number, end: number) => void
) {
  let cursor = 0
  while (cursor < line.length) {
    if (line[cursor] !== "`") {
      cursor += 1
      continue
    }
    let openerEnd = cursor + 1
    while (line[openerEnd] === "`") openerEnd += 1
    const length = openerEnd - cursor
    let search = openerEnd
    let closing = -1
    while (search < line.length) {
      if (line[search] !== "`") {
        search += 1
        continue
      }
      let runEnd = search + 1
      while (line[runEnd] === "`") runEnd += 1
      if (runEnd - search === length) {
        closing = runEnd
        break
      }
      search = runEnd
    }
    if (closing < 0) {
      cursor = openerEnd
      continue
    }
    mask(offset + cursor, offset + closing)
    cursor = closing
  }
}
