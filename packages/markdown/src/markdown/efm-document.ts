import {
  $convertToMarkdownString,
  $generateNodesFromMarkdownString,
  type Transformer,
} from "@lexical/markdown"
import { fromMarkdown } from "mdast-util-from-markdown"
import { gfmFromMarkdown } from "mdast-util-gfm"
import { micromark } from "micromark"
import { gfm } from "micromark-extension-gfm"
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isTextNode,
  type ElementNode,
  type LexicalNode,
} from "lexical"
import { isMap, LineCounter, parseDocument } from "yaml"

import {
  isDeniedEfmUri,
  normalizeEfmUri,
  resolveEfmResourceUri,
} from "./efm-uri"
import { EIDOS_MARKDOWN_TRANSFORMERS } from "./markdown-transformers"
import {
  $createEfmSourceBlockNode,
  type EfmSourceBlockKind,
} from "../nodes/efm-source-block-node"
import {
  $createEfmBlockNode,
  $createEfmInlineNode,
  type EfmBlockData,
  type EfmInlineData,
} from "../nodes/efm-semantic-node"
import type { EfmDiagnostic, EfmInputProfile } from "../types"
import { MARKDOWN_FEATURES } from "../plugin-system/feature-ids"

interface MdastPosition {
  start: { line: number; column: number; offset?: number }
  end: { line: number; column: number; offset?: number }
}

interface MdastNode {
  type: string
  position?: MdastPosition
  children?: MdastNode[]
  checked?: boolean | null
  identifier?: string
  label?: string
  lang?: string | null
  meta?: string | null
  spread?: boolean
  title?: string | null
  url?: string
  value?: string
  alt?: string | null
}

interface OffsetRange {
  start: number
  end: number
}

export interface EfmAnalysisOptions {
  inputProfile?: EfmInputProfile
  baseUri?: string
  /** Enabled editor capabilities. Omit to preserve the complete EFM profile. */
  syntaxFeatures?: ReadonlySet<string>
}

export interface EfmImportSegment {
  /** Start offset in normalized LF source. */
  start: number
  /** End offset in normalized LF source. */
  end: number
  source: string
  sourceKind?: EfmSourceBlockKind
  /** Non-visual source ordering that the editor projects to a pinned region. */
  placement?: "footnote-tail"
}

export interface EfmDocumentAnalysis {
  diagnostics: EfmDiagnostic[]
  normalizedSource: string
  segments: EfmImportSegment[]
}

interface FrontmatterEnvelope {
  end: number
  source: string
  diagnostics: EfmDiagnostic[]
}

interface MathScan {
  diagnostics: EfmDiagnostic[]
  ranges: OffsetRange[]
}

const ACTIVE_HTML =
  /<(?:script|iframe|object|embed|style|link|meta|base|title|textarea|xmp|noembed|noframes|plaintext|form|input|button|select)\b|\son[a-z]+\s*=|(?:javascript|vbscript)\s*:/iu

export function normalizeEfmSource(source: string): string {
  const withoutBom = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source
  return withoutBom.replace(/\r\n?/gu, "\n")
}

function positionAt(source: string, offset: number) {
  let line = 1
  let column = 1
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }
  return { line, column }
}

function diagnosticAt(
  source: string,
  code: string,
  severity: EfmDiagnostic["severity"],
  message: string,
  start: number,
  end?: number
): EfmDiagnostic {
  return {
    code,
    severity,
    message,
    start: positionAt(source, Math.max(0, start)),
    ...(end === undefined
      ? {}
      : { end: positionAt(source, Math.max(start, end)) }),
  }
}

function lineEnd(source: string, start: number): number {
  const newline = source.indexOf("\n", start)
  return newline === -1 ? source.length : newline
}

function readFrontmatter(
  source: string,
  profile: EfmInputProfile
): FrontmatterEnvelope | null {
  if (profile !== "document" || source.slice(0, lineEnd(source, 0)) !== "---") {
    return null
  }

  const openingEnd = lineEnd(source, 0)
  if (openingEnd === source.length) return null

  let closingStart = openingEnd + 1
  while (closingStart <= source.length) {
    const closingEnd = lineEnd(source, closingStart)
    if (source.slice(closingStart, closingEnd) === "---") {
      const yamlSource = source.slice(openingEnd + 1, closingStart)
      const lineCounter = new LineCounter()
      const document = parseDocument(yamlSource, {
        lineCounter,
        prettyErrors: false,
        strict: true,
        uniqueKeys: true,
        version: "1.2",
      })
      const diagnostics = document.errors.map((error) =>
        diagnosticAt(
          source,
          error.code === "DUPLICATE_KEY"
            ? "efm-frontmatter-duplicate-key"
            : "efm-frontmatter-invalid",
          "error",
          error.code === "DUPLICATE_KEY"
            ? "YAML frontmatter contains a duplicate mapping key."
            : error.message,
          openingEnd + 1 + error.pos[0],
          openingEnd + 1 + error.pos[1]
        )
      )

      if (
        diagnostics.length === 0 &&
        document.contents !== null &&
        !isMap(document.contents)
      ) {
        diagnostics.push(
          diagnosticAt(
            source,
            "efm-frontmatter-not-mapping",
            "error",
            "YAML frontmatter must contain a mapping or be empty.",
            openingEnd + 1,
            closingStart
          )
        )
      }

      return {
        end: closingEnd,
        source: source.slice(0, closingEnd),
        diagnostics,
      }
    }
    if (closingEnd === source.length) break
    closingStart = closingEnd + 1
  }

  // EFM treats an unmatched opening delimiter as ordinary Markdown.
  return null
}

function parseMarkdown(source: string): MdastNode {
  return fromMarkdown(source, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }) as unknown as MdastNode
}

function nodeRange(node: MdastNode): OffsetRange | null {
  const start = node.position?.start.offset
  const end = node.position?.end.offset
  return start === undefined || end === undefined ? null : { start, end }
}

function visit(node: MdastNode, callback: (node: MdastNode) => void): void {
  callback(node)
  for (const child of node.children ?? []) visit(child, callback)
}

function isInsideRange(
  offset: number,
  ranges: readonly OffsetRange[]
): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end)
}

function displayMathRanges(
  source: string,
  markdownRoot: MdastNode,
  fullSource: string,
  sourceOffset: number
): MathScan {
  const protectedRanges: OffsetRange[] = []
  visit(markdownRoot, (node) => {
    if (
      node.type !== "code" &&
      node.type !== "html" &&
      node.type !== "inlineCode"
    ) {
      return
    }
    const range = nodeRange(node)
    if (range) protectedRanges.push(range)
  })

  const ranges: OffsetRange[] = []
  const diagnostics: EfmDiagnostic[] = []
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
        diagnostics.push(
          diagnosticAt(
            fullSource,
            "efm-math-unterminated",
            "error",
            "Display mathematics is missing a closing $$ delimiter line.",
            sourceOffset + cursor,
            sourceOffset + end
          )
        )
        break
      }

      ranges.push({ start: cursor, end: closingEnd })
      cursor = closingEnd < source.length ? closingEnd + 1 : source.length + 1
      continue
    }
    if (end === source.length) break
    cursor = end + 1
  }
  return { diagnostics, ranges }
}

function sourceForNode(node: MdastNode, source: string): string {
  const range = nodeRange(node)
  return range ? source.slice(range.start, range.end) : ""
}

function descendantsMatch(
  node: MdastNode,
  predicate: (candidate: MdastNode) => boolean
): boolean {
  if (predicate(node)) return true
  return (node.children ?? []).some((child) =>
    descendantsMatch(child, predicate)
  )
}

function isEscaped(source: string, offset: number): boolean {
  let slashes = 0
  for (
    let index = offset - 1;
    index >= 0 && source[index] === "\\";
    index -= 1
  ) {
    slashes += 1
  }
  return slashes % 2 === 1
}

function inlineMathRanges(node: MdastNode, source: string): OffsetRange[] {
  const range = nodeRange(node)
  if (!range) return []
  const protectedRanges: OffsetRange[] = []
  visit(node, (candidate) => {
    if (candidate.type !== "inlineCode" && candidate.type !== "html") return
    const protectedRange = nodeRange(candidate)
    if (protectedRange) protectedRanges.push(protectedRange)
  })

  const mathRanges: OffsetRange[] = []
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

function hasInlineMath(node: MdastNode, source: string): boolean {
  return inlineMathRanges(node, source).length > 0
}

function isSafeInline(node: MdastNode, source: string): boolean {
  switch (node.type) {
    case "text":
    case "inlineCode":
    case "break":
      return true
    case "emphasis":
    case "strong":
    case "delete":
      return (node.children ?? []).every((child) => isSafeInline(child, source))
    case "link": {
      const markdown = sourceForNode(node, source)
      const normalizedUrl = normalizeEfmUri(node.url ?? "")
      return (
        !isDeniedEfmUri(normalizedUrl) &&
        /^\[[\s\S]+\]\([^\s()]+(?:\s+"(?:[^"\\]|\\.)*")?\)$/u.test(markdown) &&
        (node.children ?? []).every((child) => isSafeInline(child, source))
      )
    }
    default:
      return false
  }
}

function isSimpleList(node: MdastNode, source: string): boolean {
  if (node.spread) return false
  return (node.children ?? []).every((item) => {
    if (item.type !== "listItem" || item.spread) return false
    const children = item.children ?? []
    if (children.length === 0 || children.length > 2) return false
    if (
      children[0].type !== "paragraph" ||
      hasInlineMath(children[0], source) ||
      !(children[0].children ?? []).every((child) =>
        isSafeInline(child, source)
      )
    ) {
      return false
    }
    return children.length === 1 || isSimpleList(children[1], source)
  })
}

function isLexicalSafe(node: MdastNode, source: string): boolean {
  switch (node.type) {
    case "paragraph":
      return (
        !hasInlineMath(node, source) &&
        (node.children ?? []).every((child) => isSafeInline(child, source))
      )
    case "heading": {
      const markdown = sourceForNode(node, source)
      return (
        /^#{1,6}[ \t]+/u.test(markdown) &&
        !/[ \t]+#+[ \t]*$/u.test(markdown) &&
        !hasInlineMath(node, source) &&
        (node.children ?? []).every((child) => isSafeInline(child, source))
      )
    }
    case "blockquote": {
      const children = node.children ?? []
      return (
        children.length === 1 &&
        children[0].type === "paragraph" &&
        isLexicalSafe(children[0], source)
      )
    }
    case "list":
      return isSimpleList(node, source)
    case "code": {
      const markdown = sourceForNode(node, source)
      const firstLine = markdown.slice(0, lineEnd(markdown, 0))
      return (
        node.lang !== "math" &&
        node.meta == null &&
        /^ {0,3}`{3,}(?:[\w-]+)?[ \t]*$/u.test(firstLine)
      )
    }
    case "thematicBreak":
      return true
    case "table":
      return (node.children ?? []).every((row) =>
        (row.children ?? []).every((cell) =>
          (cell.children ?? []).every((child) => isSafeInline(child, source))
        )
      )
    default:
      return false
  }
}

function opaqueKind(node: MdastNode, source: string): EfmSourceBlockKind {
  if (node.type === "code" && node.lang === "math") return "math"
  if (hasInlineMath(node, source)) return "math"
  if (
    descendantsMatch(
      node,
      (candidate) =>
        candidate.type === "footnoteDefinition" ||
        candidate.type === "footnoteReference"
    )
  ) {
    return "footnote"
  }
  if (
    descendantsMatch(
      node,
      (candidate) =>
        candidate.type === "image" || candidate.type === "imageReference"
    )
  ) {
    return "image"
  }
  if (descendantsMatch(node, (candidate) => candidate.type === "html")) {
    return "raw-html"
  }
  if (
    descendantsMatch(
      node,
      (candidate) =>
        candidate.type === "definition" || candidate.type === "linkReference"
    )
  ) {
    return "reference"
  }
  return "commonmark"
}

function normalizeIdentifier(identifier: string): string {
  return identifier.trim().replace(/\s+/gu, " ").toLowerCase()
}

function collectBodyDiagnostics(
  root: MdastNode,
  body: string,
  fullSource: string,
  sourceOffset: number,
  mathRanges: readonly OffsetRange[],
  baseUri: string | undefined
): EfmDiagnostic[] {
  const diagnostics: EfmDiagnostic[] = []
  const astDefinitions: { identifier: string; range: OffsetRange }[] = []
  const footnoteProtectedRanges = [...mathRanges]

  visit(root, (node) => {
    const range = nodeRange(node)
    if (range && isInsideRange(range.start, mathRanges)) return

    if (node.type === "footnoteDefinition" && node.identifier) {
      if (range) astDefinitions.push({ identifier: node.identifier, range })
    }

    if (
      node.type === "code" ||
      node.type === "inlineCode" ||
      node.type === "html"
    ) {
      if (range) footnoteProtectedRanges.push(range)
    }

    if (node.type === "html" && range) {
      const html = body.slice(range.start, range.end)
      if (ACTIVE_HTML.test(html)) {
        diagnostics.push(
          diagnosticAt(
            fullSource,
            "efm-unsafe-raw-html",
            "warning",
            "Raw HTML is rendered as inert source because it contains active content.",
            sourceOffset + range.start,
            sourceOffset + range.end
          )
        )
      }
    }

    if (
      (node.type === "link" ||
        node.type === "image" ||
        node.type === "definition") &&
      node.url &&
      range
    ) {
      const normalizedUrl = normalizeEfmUri(node.url)
      if (isDeniedEfmUri(normalizedUrl)) {
        diagnostics.push(
          diagnosticAt(
            fullSource,
            "efm-uri-denied",
            "warning",
            `The ${node.type} URI uses a denied scheme and remains inactive.`,
            sourceOffset + range.start,
            sourceOffset + range.end
          )
        )
      } else if (
        !baseUri &&
        !normalizedUrl.startsWith("#") &&
        !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(normalizedUrl)
      ) {
        diagnostics.push(
          diagnosticAt(
            fullSource,
            "efm-resource-unresolved",
            "warning",
            `The relative ${node.type} URI remains unresolved because no base URI was declared.`,
            sourceOffset + range.start,
            sourceOffset + range.end
          )
        )
      }
    }
  })

  const definitions = new Map<string, OffsetRange>()
  const definitionStarts = new Set<number>()
  const references: { identifier: string; range: OffsetRange }[] = []
  const footnotePattern = /\[\^([^\]\n]+)\]/gu
  for (const match of body.matchAll(footnotePattern)) {
    const start = match.index
    if (
      start === undefined ||
      isEscaped(body, start) ||
      isInsideRange(start, footnoteProtectedRanges)
    ) {
      continue
    }
    const end = start + match[0].length
    const lineStart = body.lastIndexOf("\n", start - 1) + 1
    const isDefinition =
      body[end] === ":" && /^ {0,3}$/u.test(body.slice(lineStart, start))
    const range = { start, end }
    if (isDefinition) {
      const identifier = normalizeIdentifier(match[1])
      const firstDefinition = definitions.get(identifier)
      if (firstDefinition) {
        diagnostics.push(
          diagnosticAt(
            fullSource,
            "efm-footnote-duplicate",
            "error",
            `Footnote label "${match[1]}" is defined more than once.`,
            sourceOffset + start,
            sourceOffset + end
          )
        )
      } else {
        definitions.set(identifier, range)
      }
      definitionStarts.add(start)
    } else {
      references.push({ identifier: match[1], range })
    }
  }

  for (const definition of astDefinitions) {
    if (definitionStarts.has(definition.range.start)) continue
    const identifier = normalizeIdentifier(definition.identifier)
    if (definitions.has(identifier)) {
      diagnostics.push(
        diagnosticAt(
          fullSource,
          "efm-footnote-duplicate",
          "error",
          `Footnote label "${definition.identifier}" is defined more than once.`,
          sourceOffset + definition.range.start,
          sourceOffset + definition.range.end
        )
      )
    } else {
      definitions.set(identifier, definition.range)
    }
  }

  for (const reference of references) {
    if (definitions.has(normalizeIdentifier(reference.identifier))) continue
    diagnostics.push(
      diagnosticAt(
        fullSource,
        "efm-footnote-undefined",
        "warning",
        `Footnote label "${reference.identifier}" has no definition and remains literal source.`,
        sourceOffset + reference.range.start,
        sourceOffset + reference.range.end
      )
    )
  }
  return diagnostics
}

interface EfmReferenceDefinition {
  title?: string
  url: string
}

interface EfmImportContext {
  footnoteDefinitions: Set<string>
  footnoteNumbers: Map<string, number>
  footnoteOccurrences: Map<string, number>
  footnoteReferenceIds: Map<string, string[]>
  references: Map<string, EfmReferenceDefinition>
}

interface EfmInlineReplacement {
  data: EfmInlineData
  end: number
  start: number
}

function createImportContext(
  source: string,
  profile: EfmInputProfile
): EfmImportContext {
  const frontmatter = readFrontmatter(source, profile)
  const bodyOffset = frontmatter
    ? frontmatter.end < source.length && source[frontmatter.end] === "\n"
      ? frontmatter.end + 1
      : frontmatter.end
    : 0
  const root = parseMarkdown(source.slice(bodyOffset))
  const footnoteDefinitions = new Set<string>()
  const references = new Map<string, EfmReferenceDefinition>()

  visit(root, (node) => {
    if (node.type === "footnoteDefinition" && node.identifier) {
      footnoteDefinitions.add(normalizeIdentifier(node.identifier))
    } else if (node.type === "definition" && node.identifier && node.url) {
      references.set(normalizeIdentifier(node.identifier), {
        url: node.url,
        ...(node.title ? { title: node.title } : {}),
      })
    }
  })

  const footnoteNumbers = new Map<string, number>()
  const footnoteReferenceIds = new Map<string, string[]>()
  visit(root, (node) => {
    if (node.type !== "footnoteReference" || !node.identifier) return
    const identifier = normalizeIdentifier(node.identifier)
    if (
      footnoteDefinitions.has(identifier) &&
      !footnoteNumbers.has(identifier)
    ) {
      footnoteNumbers.set(identifier, footnoteNumbers.size + 1)
    }
    if (footnoteDefinitions.has(identifier)) {
      const number = footnoteNumbers.get(identifier)
      const ids = footnoteReferenceIds.get(identifier) ?? []
      ids.push(`efm-footnote-reference-${number}-${ids.length + 1}`)
      footnoteReferenceIds.set(identifier, ids)
    }
  })
  for (const identifier of footnoteDefinitions) {
    if (!footnoteNumbers.has(identifier)) {
      footnoteNumbers.set(identifier, footnoteNumbers.size + 1)
    }
  }
  return {
    footnoteDefinitions,
    footnoteNumbers,
    footnoteOccurrences: new Map(),
    footnoteReferenceIds,
    references,
  }
}

function textFromNode(node: MdastNode): string {
  if (node.value !== undefined) return node.value
  return (node.children ?? []).map(textFromNode).join("")
}

function childSource(node: MdastNode, source: string): string {
  const children = node.children ?? []
  const first = children[0] ? nodeRange(children[0]) : null
  const lastChild = children.at(-1)
  const last = lastChild ? nodeRange(lastChild) : null
  return first && last
    ? source.slice(first.start, last.end)
    : textFromNode(node)
}

function inlineReplacements(
  source: string,
  context: EfmImportContext,
  baseUri?: string,
  syntaxFeatures?: ReadonlySet<string>
): EfmInlineReplacement[] {
  const enabled = (feature: string) => syntaxFeatures?.has(feature) ?? true
  const supplementalDefinitions = [
    ...Array.from(
      context.footnoteDefinitions,
      (identifier) => `[^${identifier}]: Footnote`
    ),
    ...Array.from(
      context.references,
      ([identifier, definition]) => `[${identifier}]: ${definition.url}`
    ),
  ]
  const root = parseMarkdown(
    supplementalDefinitions.length > 0
      ? `${source}\n\n${supplementalDefinitions.join("\n\n")}`
      : source
  )
  const replacements: EfmInlineReplacement[] = []

  visit(root, (node) => {
    const range = nodeRange(node)
    if (!range || range.start >= source.length || range.end > source.length) {
      return
    }
    const original = source.slice(range.start, range.end)

    if (
      enabled(MARKDOWN_FEATURES.footnote) &&
      node.type === "footnoteReference" &&
      node.identifier
    ) {
      const identifier = normalizeIdentifier(node.identifier)
      if (!context.footnoteDefinitions.has(identifier)) return
      const occurrence = (context.footnoteOccurrences.get(identifier) ?? 0) + 1
      context.footnoteOccurrences.set(identifier, occurrence)
      const number = context.footnoteNumbers.get(identifier)
      const referenceId =
        context.footnoteReferenceIds.get(identifier)?.[occurrence - 1]
      replacements.push({
        start: range.start,
        end: range.end,
        data: {
          kind: "footnote-reference",
          source: original,
          identifier,
          label: node.label ?? node.identifier,
          number,
          referenceId,
        },
      })
      return
    }

    if (enabled(MARKDOWN_FEATURES.image) && node.type === "image" && node.url) {
      replacements.push({
        start: range.start,
        end: range.end,
        data: {
          kind: "image",
          source: original,
          url: node.url,
          resolvedUrl:
            resolveEfmResourceUri(node.url, baseUri, { image: true }) ??
            undefined,
          alt: node.alt ?? "",
          ...(node.title ? { title: node.title } : {}),
        },
      })
      return
    }

    if (
      ((enabled(MARKDOWN_FEATURES.image) && node.type === "imageReference") ||
        (enabled(MARKDOWN_FEATURES.reference) &&
          node.type === "linkReference")) &&
      node.identifier
    ) {
      const definition = context.references.get(
        normalizeIdentifier(node.identifier)
      )
      if (!definition) return
      replacements.push({
        start: range.start,
        end: range.end,
        data:
          node.type === "imageReference"
            ? {
                kind: "image",
                source: original,
                identifier: normalizeIdentifier(node.identifier),
                url: definition.url,
                resolvedUrl:
                  resolveEfmResourceUri(definition.url, baseUri, {
                    image: true,
                  }) ?? undefined,
                alt: node.alt ?? node.label ?? node.identifier,
                ...(definition.title ? { title: definition.title } : {}),
              }
            : {
                kind: "reference-link",
                source: original,
                identifier: normalizeIdentifier(node.identifier),
                url: definition.url,
                resolvedUrl:
                  resolveEfmResourceUri(definition.url, baseUri) ?? undefined,
                label: textFromNode(node),
                labelHtml: inlineMarkdownPreviewHtml(childSource(node, source)),
                ...(definition.title ? { title: definition.title } : {}),
              },
      })
    }
  })

  if (enabled(MARKDOWN_FEATURES.math)) {
    for (const range of inlineMathRanges(root, source)) {
      const original = source.slice(range.start, range.end)
      replacements.push({
        start: range.start,
        end: range.end,
        data: {
          kind: "math",
          source: original,
          value: original.slice(1, -1),
        },
      })
    }
  }

  const nonOverlapping: EfmInlineReplacement[] = []
  for (const replacement of replacements.sort(
    (left, right) => left.start - right.start || right.end - left.end
  )) {
    if (
      nonOverlapping.some(
        (current) =>
          replacement.start < current.end && replacement.end > current.start
      )
    ) {
      continue
    }
    nonOverlapping.push(replacement)
  }
  return nonOverlapping
}

function replaceInlinePlaceholders(
  nodes: readonly LexicalNode[],
  placeholders: readonly { data: EfmInlineData; value: string }[]
): void {
  const textNodes = nodes.flatMap((node) =>
    $isTextNode(node)
      ? [node]
      : $isElementNode(node)
        ? node.getAllTextNodes()
        : []
  )

  for (const textNode of textNodes) {
    const content = textNode.getTextContent()
    const matches = placeholders
      .map((placeholder) => ({
        ...placeholder,
        start: content.indexOf(placeholder.value),
      }))
      .filter((match) => match.start >= 0)
      .sort((left, right) => right.start - left.start)

    for (const match of matches) {
      const end = match.start + match.value.length
      const offsets = [
        ...(match.start > 0 ? [match.start] : []),
        ...(end < content.length ? [end] : []),
      ]
      const pieces = textNode.splitText(...offsets)
      const target = pieces[match.start > 0 ? 1 : 0]
      target.replace($createEfmInlineNode(match.data))
    }
  }
}

function importMarkdownWithSemantics(
  source: string,
  transformers: readonly Transformer[],
  context: EfmImportContext,
  baseUri?: string,
  syntaxFeatures?: ReadonlySet<string>
): LexicalNode[] {
  const replacements = inlineReplacements(
    source,
    context,
    baseUri,
    syntaxFeatures
  )
  if (replacements.length === 0) {
    return $generateNodesFromMarkdownString(
      source,
      [...transformers],
      false,
      true
    )
  }

  const placeholders = replacements.map((replacement, index) => ({
    data: replacement.data,
    value: `\u{e000}efm-${index}\u{e001}`,
  }))
  let cursor = 0
  let markdown = ""
  replacements.forEach((replacement, index) => {
    markdown += source.slice(cursor, replacement.start)
    markdown += placeholders[index].value
    cursor = replacement.end
  })
  markdown += source.slice(cursor)

  const nodes = $generateNodesFromMarkdownString(
    markdown,
    [...transformers],
    false,
    true
  )
  replaceInlinePlaceholders(nodes, placeholders)
  return nodes
}

function mathBlockValue(source: string): string | null {
  const lines = source.split("\n")
  if (/^ {0,3}\$\$$/u.test(lines[0] ?? "")) {
    return /^ {0,3}\$\$$/u.test(lines.at(-1) ?? "")
      ? lines.slice(1, -1).join("\n")
      : null
  }

  const fence = lines[0]?.match(
    /^ {0,3}((?:`{3,})|(?:~{3,}))math(?:[ \t].*)?$/u
  )
  if (!fence) return null
  const closingFence = lines.at(-1)?.trim() ?? ""
  const fenceCharacter = fence[1][0]
  return closingFence.length >= fence[1].length &&
    Array.from(closingFence).every((character) => character === fenceCharacter)
    ? lines.slice(1, -1).join("\n")
    : null
}

function firstNode(source: string): MdastNode | undefined {
  return parseMarkdown(source).children?.[0]
}

function footnotePreviewSource(source: string, node: MdastNode): string {
  const children = node.children ?? []
  const first = children[0] ? nodeRange(children[0]) : null
  const last = children.at(-1) ? nodeRange(children.at(-1)!) : null
  if (!first || !last) return ""
  return source.slice(first.start, last.end).replace(/\n {1,4}/gu, "\n")
}

function standaloneImageData(
  source: string,
  node: MdastNode,
  baseUri?: string
): EfmBlockData | null {
  if (node.type !== "paragraph" || node.children?.length !== 1) return null
  const image = node.children[0]
  if (image.type !== "image" || image.url === undefined) return null
  return {
    kind: "image",
    source,
    url: image.url,
    resolvedUrl:
      resolveEfmResourceUri(image.url, baseUri, { image: true }) ?? undefined,
    alt: image.alt ?? "",
    ...(image.title ? { title: image.title } : {}),
  }
}

function markdownPreviewHtml(source: string): string {
  return micromark(source, {
    allowDangerousHtml: true,
    extensions: [gfm()],
  })
}

function inlineMarkdownPreviewHtml(source: string): string {
  return markdownPreviewHtml(source)
    .replace(/^<p>/u, "")
    .replace(/<\/p>\n?$/u, "")
}

function appendMarkdownSegments(
  target: EfmImportSegment[],
  source: string,
  root: MdastNode = parseMarkdown(source),
  sourceOffset = 0
): void {
  if (!source.trim()) return
  const children = root.children ?? []
  if (children.length === 0) {
    target.push({
      start: sourceOffset,
      end: sourceOffset + source.length,
      source,
      sourceKind: "commonmark",
    })
    return
  }

  for (const node of children) {
    const range = nodeRange(node)
    if (!range) continue
    const markdown = source.slice(range.start, range.end)
    target.push(
      isLexicalSafe(node, source)
        ? {
            start: sourceOffset + range.start,
            end: sourceOffset + range.end,
            source: markdown,
            ...(node.type === "footnoteDefinition"
              ? { placement: "footnote-tail" as const }
              : {}),
          }
        : {
            start: sourceOffset + range.start,
            end: sourceOffset + range.end,
            source: markdown,
            sourceKind: opaqueKind(node, source),
            ...(node.type === "footnoteDefinition"
              ? { placement: "footnote-tail" as const }
              : {}),
          }
    )
  }
}

export function analyzeEfmMarkdown(
  markdown: string,
  options: EfmAnalysisOptions = {}
): EfmDocumentAnalysis {
  const normalizedSource = normalizeEfmSource(markdown)
  const profile = options.inputProfile ?? "document"
  const diagnostics: EfmDiagnostic[] = []
  const segments: EfmImportSegment[] = []
  const frontmatter = readFrontmatter(normalizedSource, profile)
  let bodyOffset = 0

  if (frontmatter) {
    segments.push({
      start: 0,
      end: frontmatter.end,
      source: frontmatter.source,
      sourceKind: "frontmatter",
    })
    diagnostics.push(...frontmatter.diagnostics)
    bodyOffset =
      frontmatter.end < normalizedSource.length &&
      normalizedSource[frontmatter.end] === "\n"
        ? frontmatter.end + 1
        : frontmatter.end
  }

  const body = normalizedSource.slice(bodyOffset)
  const markdownRoot = parseMarkdown(body)
  const math = displayMathRanges(
    body,
    markdownRoot,
    normalizedSource,
    bodyOffset
  )
  diagnostics.push(...math.diagnostics)
  diagnostics.push(
    ...collectBodyDiagnostics(
      markdownRoot,
      body,
      normalizedSource,
      bodyOffset,
      math.ranges,
      options.baseUri
    )
  )

  if (math.ranges.length === 0) {
    appendMarkdownSegments(segments, body, markdownRoot, bodyOffset)
  } else {
    let cursor = 0
    for (const range of math.ranges) {
      appendMarkdownSegments(
        segments,
        body.slice(cursor, range.start),
        undefined,
        bodyOffset + cursor
      )
      segments.push({
        start: bodyOffset + range.start,
        end: bodyOffset + range.end,
        source: body.slice(range.start, range.end),
        sourceKind: "math",
      })
      cursor = range.end
      if (body[cursor] === "\n") cursor += 1
    }
    appendMarkdownSegments(
      segments,
      body.slice(cursor),
      undefined,
      bodyOffset + cursor
    )
  }

  return {
    diagnostics: diagnostics.sort(
      (left, right) =>
        left.start.line - right.start.line ||
        left.start.column - right.start.column
    ),
    normalizedSource,
    segments,
  }
}

export function $convertFromEfmMarkdownString(
  markdown: string,
  transformers: readonly Transformer[] = EIDOS_MARKDOWN_TRANSFORMERS,
  options: EfmAnalysisOptions = {},
  node?: ElementNode
): EfmDocumentAnalysis {
  const analysis = analyzeEfmMarkdown(markdown, options)
  const root = node ?? $getRoot()
  const context = createImportContext(
    analysis.normalizedSource,
    options.inputProfile ?? "document"
  )
  const deferredFootnotes: LexicalNode[] = []
  const enabled = (feature: string) =>
    options.syntaxFeatures?.has(feature) ?? true
  root.clear()

  for (const segment of analysis.segments) {
    if (segment.sourceKind === "frontmatter") {
      if (!enabled(MARKDOWN_FEATURES.frontmatter)) {
        root.append($createEfmSourceBlockNode(segment.source, "frontmatter"))
        continue
      }
      const hasInvalidFrontmatter = analysis.diagnostics.some((diagnostic) =>
        diagnostic.code.startsWith("efm-frontmatter-")
      )
      root.append(
        hasInvalidFrontmatter
          ? $createEfmSourceBlockNode(segment.source, "frontmatter")
          : $createEfmBlockNode({
              kind: "frontmatter",
              source: segment.source,
            })
      )
      continue
    }

    if (segment.sourceKind === "math") {
      if (!enabled(MARKDOWN_FEATURES.math)) {
        root.append($createEfmSourceBlockNode(segment.source, "math"))
        continue
      }
      const value = mathBlockValue(segment.source)
      if (value !== null) {
        root.append(
          $createEfmBlockNode({
            kind: "math",
            source: segment.source,
            value,
          })
        )
      } else if (/^ {0,3}\$\$(?:\n|$)/u.test(segment.source)) {
        root.append($createEfmSourceBlockNode(segment.source, "math"))
      } else {
        root.append(
          ...importMarkdownWithSemantics(
            segment.source,
            transformers,
            context,
            options.baseUri,
            options.syntaxFeatures
          )
        )
      }
      continue
    }

    const parsed = segment.sourceKind ? firstNode(segment.source) : undefined
    if (
      (segment.sourceKind === "image" && !enabled(MARKDOWN_FEATURES.image)) ||
      (segment.sourceKind === "footnote" &&
        !enabled(MARKDOWN_FEATURES.footnote)) ||
      (segment.sourceKind === "reference" &&
        !enabled(MARKDOWN_FEATURES.reference))
    ) {
      root.append($createEfmSourceBlockNode(segment.source, segment.sourceKind))
      continue
    }
    if (
      enabled(MARKDOWN_FEATURES.image) &&
      segment.sourceKind === "image" &&
      parsed
    ) {
      const image = standaloneImageData(segment.source, parsed, options.baseUri)
      if (image) {
        root.append($createEfmBlockNode(image))
        continue
      }
    }
    if (
      segment.sourceKind === "footnote" &&
      enabled(MARKDOWN_FEATURES.footnote) &&
      parsed?.type === "footnoteDefinition" &&
      parsed.identifier
    ) {
      const identifier = normalizeIdentifier(parsed.identifier)
      const previewSource = footnotePreviewSource(segment.source, parsed)
      deferredFootnotes.push(
        $createEfmBlockNode({
          kind: "footnote-definition",
          source: segment.source,
          identifier,
          label: parsed.label ?? parsed.identifier,
          number: context.footnoteNumbers.get(identifier),
          referenceIds: context.footnoteReferenceIds.get(identifier) ?? [],
          previewHtml: markdownPreviewHtml(previewSource),
        })
      )
      continue
    }

    if (
      segment.sourceKind === "reference" &&
      enabled(MARKDOWN_FEATURES.reference) &&
      parsed?.type === "definition" &&
      parsed.identifier
    ) {
      root.append(
        $createEfmBlockNode({
          kind: "reference-definition",
          source: segment.source,
          identifier: normalizeIdentifier(parsed.identifier),
        })
      )
      continue
    }

    if (segment.sourceKind === "raw-html") {
      if (!enabled(MARKDOWN_FEATURES.rawHtml)) {
        root.append($createEfmSourceBlockNode(segment.source, "raw-html"))
        continue
      }
      root.append(
        ACTIVE_HTML.test(segment.source)
          ? $createEfmSourceBlockNode(segment.source, "raw-html")
          : $createEfmBlockNode({
              kind: "raw-html",
              source: segment.source,
              previewHtml: markdownPreviewHtml(segment.source),
            })
      )
      continue
    }

    if (segment.sourceKind === "commonmark") {
      root.append($createEfmSourceBlockNode(segment.source, "commonmark"))
      continue
    }

    root.append(
      ...importMarkdownWithSemantics(
        segment.source,
        transformers,
        context,
        options.baseUri,
        options.syntaxFeatures
      )
    )
  }

  root.append(...deferredFootnotes)

  if (root.getChildrenSize() === 0) root.append($createParagraphNode())
  if ($getSelection() !== null) root.selectStart()
  return analysis
}

export function $convertToEfmMarkdownString(
  transformers: readonly Transformer[] = EIDOS_MARKDOWN_TRANSFORMERS,
  node?: ElementNode
): string {
  return $convertToMarkdownString([...transformers], node)
}
