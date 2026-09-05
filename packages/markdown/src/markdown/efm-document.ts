import {
  $convertToMarkdownString,
  $generateNodesFromMarkdownString,
  type Transformer,
} from "@lexical/markdown"
import { fromMarkdown } from "mdast-util-from-markdown"
import { gfmFromMarkdown } from "mdast-util-gfm"
import { gfm } from "micromark-extension-gfm"
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isTextNode,
  type ElementNode,
  type LexicalNode,
} from "lexical"
import {
  $createListItemNode,
  $createListNode,
  type ListNode,
  type ListType,
} from "@lexical/list"
import { isMap, LineCounter, parseDocument } from "yaml"

import {
  isDeniedEfmUri,
  normalizeEfmUri,
  resolveEfmResourceUri,
} from "./efm-uri"
import {
  $setRichListSource,
  EIDOS_MARKDOWN_TRANSFORMERS,
} from "./markdown-transformers"
import { obsidianImagePresentation } from "./obsidian-image-presentation"
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
import { scanDisplayMath, scanInlineMath } from "../features/math/syntax"
import { mathInlineSyntax } from "../features/math/inline-syntax"
import { calloutBlockSyntax } from "../features/vault-blocks/callout-syntax"
import { markdownPreviewHtml } from "./preview"
import { isEscaped } from "./source-escapes"
import type { MarkdownGrammar } from "../core/markdown-grammar"
import { importBlockSyntax, scanBlockSyntax } from "../core/block-syntax"
import { importInlineSyntax, scanInlineSyntax } from "../core/inline-syntax"
import { ACTIVE_HTML } from "../core/html-safety"
import { htmlBlockSyntax } from "../features/html/plugin"
import type {
  MarkdownAnalysisOptions,
  MarkdownDocumentAnalysis,
  MarkdownSourceSegment,
} from "../core/document-contract"

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
  ordered?: boolean
  start?: number | null
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

export interface EfmAnalysisOptions extends MarkdownAnalysisOptions {
  /** Internal dialect switch used by mutually exclusive built-in profiles. */
  dialect?: "eidos" | "obsidian" | "gfm"
}

export interface EfmImportSegment extends MarkdownSourceSegment {
  syntaxId?: string
  sourceKind?: EfmSourceBlockKind | "commonmark-container" | "rich-list"
  /** @deprecated Use projection for the actual enabled editor placement. */
  placement?: "footnote-tail"
}

export interface EfmDocumentAnalysis extends MarkdownDocumentAnalysis {
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

function parseMarkdown(source: string, grammar?: MarkdownGrammar): MdastNode {
  return fromMarkdown(
    source,
    grammar ?? {
      extensions: [gfm()],
      mdastExtensions: [gfmFromMarkdown()],
    }
  ) as unknown as MdastNode
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

  const scan = scanDisplayMath(source, protectedRanges)
  return {
    ranges: scan.ranges,
    diagnostics: scan.unterminated.map((range) =>
      diagnosticAt(
        fullSource,
        "efm-math-unterminated",
        "error",
        "Display mathematics is missing a closing $$ delimiter line.",
        sourceOffset + range.start,
        sourceOffset + range.end
      )
    ),
  }
}

function sourceForNode(node: MdastNode, source: string): string {
  const range = nodeRange(node)
  return range ? source.slice(range.start, range.end) : ""
}

function sourceForNestedBlock(node: MdastNode, source: string): string {
  const markdown = sourceForNode(node, source)
  const indent = Math.max(0, (node.position?.start.column ?? 1) - 1)
  if (indent === 0 || !markdown.includes("\n")) return markdown
  const prefix = " ".repeat(indent)
  return markdown
    .split("\n")
    .map((line, index) =>
      index > 0 && line.startsWith(prefix) ? line.slice(indent) : line
    )
    .join("\n")
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

function inlineMathRanges(node: MdastNode, source: string): OffsetRange[] {
  const range = nodeRange(node)
  if (!range) return []
  const protectedRanges: OffsetRange[] = []
  visit(node, (candidate) => {
    if (candidate.type !== "inlineCode" && candidate.type !== "html") return
    const protectedRange = nodeRange(candidate)
    if (protectedRange) protectedRanges.push(protectedRange)
  })

  return scanInlineMath(source, range, protectedRanges)
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
    // URI safety is handled by the denied-link replacement during import.
    // A denied destination does not make the surrounding paragraph unsupported.
    case "link":
      return (node.children ?? []).every((child) => isSafeInline(child, source))
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

function isRichListInline(node: MdastNode, source: string): boolean {
  if (isSafeInline(node, source)) return true
  switch (node.type) {
    case "image":
    case "imageReference":
    case "linkReference":
    case "footnoteReference":
      return true
    case "emphasis":
    case "strong":
    case "delete":
      return (node.children ?? []).every((child) =>
        isRichListInline(child, source)
      )
    default:
      return false
  }
}

function isRichListBlock(node: MdastNode, source: string): boolean {
  switch (node.type) {
    case "paragraph":
      return (node.children ?? []).every((child) =>
        isRichListInline(child, source)
      )
    case "blockquote":
      return (node.children ?? []).every((child) =>
        isRichListBlock(child, source)
      )
    case "list":
      return isRichListImportable(node, source)
    case "code":
      return node.lang !== "math" && node.meta == null
    case "thematicBreak":
      return true
    default:
      return false
  }
}

function isRichListImportable(node: MdastNode, source: string): boolean {
  return (
    node.type === "list" &&
    (node.children ?? []).every(
      (item) =>
        item.type === "listItem" &&
        (item.children ?? []).length > 0 &&
        (item.children ?? []).every((child) => isRichListBlock(child, source))
    )
  )
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

function opaqueKind(
  node: MdastNode,
  source: string
): EfmSourceBlockKind | "commonmark-container" {
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
  return "commonmark-container"
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
  inlineOptions?: MarkdownAnalysisOptions
  grammar?: MarkdownGrammar
  footnoteDefinitions: Set<string>
  footnoteNumbers: Map<string, number>
  footnoteOccurrences: Map<string, number>
  footnoteReferenceIds: Map<string, string[]>
  references: Map<string, EfmReferenceDefinition>
}

interface EfmInlineReplacement {
  data?: EfmInlineData
  importNode?: () => LexicalNode
  end: number
  start: number
}

function imagePresentation(
  alt: string,
  dialect: EfmAnalysisOptions["dialect"]
): { alt: string; width?: number; height?: number; obsidian?: boolean } {
  if (dialect !== "obsidian") return { alt }
  return obsidianImagePresentation(alt)
}

function isProtectedInlineNode(node: MdastNode): boolean {
  return (
    node.type === "code" ||
    node.type === "inlineCode" ||
    node.type === "html" ||
    node.type === "link" ||
    node.type === "image"
  )
}

function createImportContext(
  source: string,
  profile: EfmInputProfile,
  grammar?: MarkdownGrammar,
  hasFrontmatter = true,
  inlineOptions?: MarkdownAnalysisOptions
): EfmImportContext {
  const frontmatter = hasFrontmatter ? readFrontmatter(source, profile) : null
  const bodyOffset = frontmatter
    ? frontmatter.end < source.length && source[frontmatter.end] === "\n"
      ? frontmatter.end + 1
      : frontmatter.end
    : 0
  const root = parseMarkdown(source.slice(bodyOffset), grammar)
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
    grammar,
    inlineOptions,
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
  syntaxFeatures?: ReadonlySet<string>,
  dialect: EfmAnalysisOptions["dialect"] = "eidos"
): { replacements: EfmInlineReplacement[]; sourceRoot?: MdastNode } {
  const enabled = (feature: string) => syntaxFeatures?.has(feature) ?? true
  const imageDialect =
    (syntaxFeatures?.has(MARKDOWN_FEATURES.obsidianAttachment) ??
    dialect === "obsidian")
      ? "obsidian"
      : "eidos"
  const semanticEnabled = (eidosFeature: string, obsidianFeature: string) =>
    enabled(eidosFeature) || enabled(obsidianFeature)
  const semanticInlineNodesEnabled =
    syntaxFeatures === undefined ||
    [
      MARKDOWN_FEATURES.link,
      MARKDOWN_FEATURES.math,
      MARKDOWN_FEATURES.image,
      MARKDOWN_FEATURES.footnote,
      MARKDOWN_FEATURES.reference,
      MARKDOWN_FEATURES.gfmAutolink,
      MARKDOWN_FEATURES.obsidianMath,
      MARKDOWN_FEATURES.obsidianAttachment,
      MARKDOWN_FEATURES.obsidianFootnote,
      MARKDOWN_FEATURES.obsidianReference,
      MARKDOWN_FEATURES.obsidianWikilink,
      MARKDOWN_FEATURES.obsidianEmbed,
    ].some(enabled)
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
      : source,
    context.grammar
  )
  const replacements: EfmInlineReplacement[] = []

  visit(root, (node) => {
    const range = nodeRange(node)
    if (!range || range.start >= source.length || range.end > source.length) {
      return
    }
    const original = source.slice(range.start, range.end)

    if (node.type === "link" && node.url) {
      const normalizedUrl = normalizeEfmUri(node.url)
      if (isDeniedEfmUri(normalizedUrl)) {
        replacements.push({
          start: range.start,
          end: range.end,
          data: {
            kind: "denied-link",
            source: original,
            url: node.url,
            label: textFromNode(node),
          },
        })
        return
      }
    }

    if (
      semanticInlineNodesEnabled &&
      node.type === "link" &&
      node.url &&
      !original.startsWith("[")
    ) {
      const normalizedUrl = normalizeEfmUri(node.url)
      if (isDeniedEfmUri(normalizedUrl)) return
      replacements.push({
        start: range.start,
        end: range.end,
        data: {
          kind: "autolink",
          source: original,
          url: node.url,
          resolvedUrl: resolveEfmResourceUri(node.url, baseUri) ?? undefined,
          label: textFromNode(node),
          ...(node.title ? { title: node.title } : {}),
        },
      })
      return
    }

    if (
      semanticEnabled(
        MARKDOWN_FEATURES.footnote,
        MARKDOWN_FEATURES.obsidianFootnote
      ) &&
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

    if (
      semanticEnabled(
        MARKDOWN_FEATURES.image,
        MARKDOWN_FEATURES.obsidianAttachment
      ) &&
      node.type === "image" &&
      node.url
    ) {
      const presentation = imagePresentation(node.alt ?? "", imageDialect)
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
          ...presentation,
          ...(node.title ? { title: node.title } : {}),
        },
      })
      return
    }

    if (
      ((semanticEnabled(
        MARKDOWN_FEATURES.image,
        MARKDOWN_FEATURES.obsidianAttachment
      ) &&
        node.type === "imageReference") ||
        (semanticEnabled(
          MARKDOWN_FEATURES.reference,
          MARKDOWN_FEATURES.obsidianReference
        ) &&
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
                ...imagePresentation(
                  node.alt ?? node.label ?? node.identifier,
                  imageDialect
                ),
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
                labelHtml: inlineMarkdownPreviewHtml(
                  childSource(node, source),
                  context.grammar
                ),
                ...(definition.title ? { title: definition.title } : {}),
              },
      })
    }
  })

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
  return {
    replacements: nonOverlapping,
    // Supplemental definitions can change how references are parsed. Only
    // share the tree when both consumers parse exactly the same source.
    sourceRoot: supplementalDefinitions.length === 0 ? root : undefined,
  }
}

function replaceInlinePlaceholders(
  nodes: readonly LexicalNode[],
  placeholders: readonly { importNode: () => LexicalNode; value: string }[]
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
      target.replace(match.importNode())
    }
  }
}

function importMarkdownWithSemantics(
  source: string,
  transformers: readonly Transformer[],
  context: EfmImportContext,
  baseUri?: string,
  syntaxFeatures?: ReadonlySet<string>,
  dialect: EfmAnalysisOptions["dialect"] = "eidos"
): LexicalNode[] {
  const { replacements, sourceRoot } = inlineReplacements(
    source,
    context,
    baseUri,
    syntaxFeatures,
    dialect
  )
  const inlineOptions = context.inlineOptions ?? {}
  // The grammar has already recognized a table. Lexical's generic paragraph
  // normalization can merge rows with only one outer pipe before TABLE runs.
  const preserveTableRows =
    (sourceRoot ?? parseMarkdown(source, context.grammar)).children?.some(
      (node) => node.type === "table"
    ) ?? false
  // Preserve the direct EFM codec's legacy default; composed presets always
  // supply their explicit registry (including an intentionally empty one).
  const inlineSyntax =
    inlineOptions.inlineSyntax ??
    (!syntaxFeatures ||
    syntaxFeatures.has(MARKDOWN_FEATURES.math) ||
    syntaxFeatures.has(MARKDOWN_FEATURES.obsidianMath)
      ? [mathInlineSyntax]
      : [])
  if (inlineSyntax.length) {
    const protectedRanges: OffsetRange[] = []
    visit(sourceRoot ?? parseMarkdown(source, context.grammar), (node) => {
      if (!isProtectedInlineNode(node)) return
      const range = nodeRange(node)
      if (range) protectedRanges.push(range)
    })
    const captures = scanInlineSyntax(
      source,
      inlineSyntax.filter((syntax) => syntax.capturesContent),
      protectedRanges,
      inlineOptions
    )
    for (let index = replacements.length - 1; index >= 0; index--)
      if (
        captures.some(
          (range) =>
            replacements[index].start < range.end &&
            replacements[index].end > range.start
        )
      )
        replacements.splice(index, 1)
    const matches = [
      ...captures,
      ...scanInlineSyntax(
        source,
        inlineSyntax.filter((syntax) => !syntax.capturesContent),
        [...protectedRanges, ...replacements, ...captures],
        inlineOptions
      ),
    ]
    for (const match of matches)
      replacements.push({
        start: match.start,
        end: match.end,
        importNode: () =>
          importInlineSyntax(
            match.syntax,
            source.slice(match.start, match.end),
            inlineOptions
          ),
      })
    replacements.sort((a, b) => a.start - b.start)
  }
  if (replacements.length === 0) {
    return $generateNodesFromMarkdownString(
      source,
      [...transformers],
      preserveTableRows,
      true
    )
  }

  const placeholders = replacements.map((replacement, index) => ({
    importNode:
      replacement.importNode ?? (() => $createEfmInlineNode(replacement.data!)),
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
    preserveTableRows,
    true
  )
  replaceInlinePlaceholders(nodes, placeholders)
  return nodes
}

function richListType(node: MdastNode): ListType {
  if (node.ordered) return "number"
  const items = node.children ?? []
  return items.length > 0 && items.every((item) => item.checked != null)
    ? "check"
    : "bullet"
}

function importRichList(
  source: string,
  node: MdastNode,
  transformers: readonly Transformer[],
  context: EfmImportContext,
  baseUri?: string,
  syntaxFeatures?: ReadonlySet<string>,
  dialect: EfmAnalysisOptions["dialect"] = "eidos"
): ListNode {
  const listType = richListType(node)
  const list = $createListNode(
    listType,
    listType === "number" ? (node.start ?? 1) : undefined
  )
  for (const item of node.children ?? []) {
    const listItem = $createListItemNode(
      listType === "check" ? item.checked === true : undefined
    )
    for (const [index, child] of (item.children ?? []).entries()) {
      const markdown = sourceForNestedBlock(child, source)
      if (child.type === "list") {
        const parsedChild = firstNode(markdown)
        if (parsedChild) {
          listItem.splice(listItem.getChildrenSize(), 0, [
            importRichList(
              markdown,
              parsedChild,
              transformers,
              context,
              baseUri,
              syntaxFeatures,
              dialect
            ),
          ])
        }
        continue
      }
      const nodes = importMarkdownWithSemantics(
        markdown,
        transformers,
        context,
        baseUri,
        syntaxFeatures,
        dialect
      )
      if (
        index === 0 &&
        child.type === "paragraph" &&
        nodes.length === 1 &&
        $isParagraphNode(nodes[0])
      ) {
        listItem.append(...nodes[0].getChildren())
      } else {
        listItem.splice(listItem.getChildrenSize(), 0, nodes)
      }
    }
    list.append(listItem)
  }
  $setRichListSource(list, source)
  return list
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

function firstNode(
  source: string,
  grammar?: MarkdownGrammar
): MdastNode | undefined {
  return parseMarkdown(source, grammar).children?.[0]
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
  baseUri?: string,
  dialect: EfmAnalysisOptions["dialect"] = "eidos"
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
    ...imagePresentation(image.alt ?? "", dialect),
    ...(image.title ? { title: image.title } : {}),
  }
}

function inlineMarkdownPreviewHtml(
  source: string,
  grammar?: MarkdownGrammar
): string {
  return markdownPreviewHtml(source, grammar)
    .replace(/^<p>/u, "")
    .replace(/<\/p>\n?$/u, "")
}

function appendMarkdownSegments(
  target: EfmImportSegment[],
  source: string,
  root: MdastNode | undefined = undefined,
  sourceOffset = 0,
  dialect: EfmAnalysisOptions["dialect"] = "eidos",
  grammar?: MarkdownGrammar,
  syntaxFeatures?: ReadonlySet<string>,
  legacyCallouts = true
): void {
  if (!source.trim()) return
  const children = (root ?? parseMarkdown(source, grammar)).children ?? []
  if (children.length === 0) {
    target.push({
      start: sourceOffset,
      end: sourceOffset + source.length,
      source,
      sourceKind: "commonmark-container",
    })
    return
  }

  for (const node of children) {
    const range = nodeRange(node)
    if (!range) continue
    const markdown = source.slice(range.start, range.end)
    if (
      legacyCallouts &&
      (syntaxFeatures?.has(MARKDOWN_FEATURES.obsidianCallout) ??
        dialect === "obsidian") &&
      /^ {0,3}>[ \t]*\[![A-Za-z][\w-]*\][+-]?(?:[ \t]+.*)?(?:\n|$)/u.test(
        markdown
      )
    ) {
      target.push({
        start: sourceOffset + range.start,
        end: sourceOffset + range.end,
        source: markdown,
        sourceKind: "obsidian-callout",
      })
      continue
    }
    const placement =
      node.type === "footnoteDefinition"
        ? { placement: "footnote-tail" as const }
        : {}
    target.push(
      isLexicalSafe(node, source)
        ? {
            start: sourceOffset + range.start,
            end: sourceOffset + range.end,
            source: markdown,
            ...placement,
          }
        : isRichListImportable(node, source)
          ? {
              start: sourceOffset + range.start,
              end: sourceOffset + range.end,
              source: markdown,
              sourceKind: "rich-list",
              ...placement,
            }
          : {
              start: sourceOffset + range.start,
              end: sourceOffset + range.end,
              source: markdown,
              sourceKind:
                (syntaxFeatures
                  ? !syntaxFeatures.has(MARKDOWN_FEATURES.math) &&
                    !syntaxFeatures.has(MARKDOWN_FEATURES.obsidianMath)
                  : dialect === "gfm") && opaqueKind(node, source) === "math"
                  ? "commonmark-container"
                  : opaqueKind(node, source),
              ...placement,
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
  const frontmatter = (
    options.grammar !== undefined
      ? !options.syntaxFeatures?.has(MARKDOWN_FEATURES.obsidianProperties) &&
        !options.syntaxFeatures?.has(MARKDOWN_FEATURES.frontmatter)
      : options.dialect === "gfm"
  )
    ? null
    : readFrontmatter(normalizedSource, profile)
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
  const markdownRoot = parseMarkdown(body, options.grammar)
  let blocks: {
    ranges: (OffsetRange & { syntaxId?: string })[]
    diagnostics: EfmDiagnostic[]
  }
  if (options.blockSyntax !== undefined) {
    const protectedRanges: OffsetRange[] = []
    visit(markdownRoot, (node) => {
      if (
        !["code", "html", "inlineCode", "list", "blockquote"].includes(
          node.type
        )
      )
        return
      const range = nodeRange(node)
      if (range) protectedRanges.push(range)
    })
    const matches = scanBlockSyntax(
      body,
      options.blockSyntax,
      protectedRanges,
      options,
      (markdownRoot.children ?? []).flatMap((node) => {
        const range = nodeRange(node)
        return range
          ? [
              Object.freeze({
                ...range,
                type: node.type,
                source: body.slice(range.start, range.end),
              }),
            ]
          : []
      })
    )
    blocks = {
      ranges: matches,
      diagnostics: matches.flatMap((match) =>
        (match.diagnostics ?? []).map((entry) =>
          diagnosticAt(
            normalizedSource,
            entry.code,
            entry.severity,
            entry.message,
            bodyOffset + entry.start,
            bodyOffset + entry.end
          )
        )
      ),
    }
  } else {
    blocks = displayMathRanges(body, markdownRoot, normalizedSource, bodyOffset)
  }
  diagnostics.push(...blocks.diagnostics)
  diagnostics.push(
    ...collectBodyDiagnostics(
      markdownRoot,
      body,
      normalizedSource,
      bodyOffset,
      blocks.ranges,
      options.baseUri
    ).filter(
      (entry) =>
        (options.syntaxFeatures
          ? options.syntaxFeatures.has(MARKDOWN_FEATURES.footnote) ||
            options.syntaxFeatures.has(MARKDOWN_FEATURES.obsidianFootnote)
          : options.dialect !== "gfm") ||
        !entry.code.startsWith("efm-footnote-")
    )
  )

  if (blocks.ranges.length === 0) {
    appendMarkdownSegments(
      segments,
      body,
      markdownRoot,
      bodyOffset,
      options.dialect,
      options.grammar,
      options.syntaxFeatures,
      options.blockSyntax === undefined
    )
  } else {
    let cursor = 0
    for (const range of blocks.ranges) {
      appendMarkdownSegments(
        segments,
        body.slice(cursor, range.start),
        undefined,
        bodyOffset + cursor,
        options.dialect,
        options.grammar,
        options.syntaxFeatures,
        options.blockSyntax === undefined
      )
      segments.push({
        start: bodyOffset + range.start,
        end: bodyOffset + range.end,
        source: body.slice(range.start, range.end),
        ...(range.syntaxId
          ? { syntaxId: range.syntaxId }
          : { sourceKind: "math" as const }),
      })
      cursor = range.end
      if (body[cursor] === "\n") cursor += 1
    }
    appendMarkdownSegments(
      segments,
      body.slice(cursor),
      undefined,
      bodyOffset + cursor,
      options.dialect,
      options.grammar,
      options.syntaxFeatures,
      options.blockSyntax === undefined
    )
  }

  const projectsFootnotes =
    options.syntaxFeatures === undefined ||
    options.syntaxFeatures.has(MARKDOWN_FEATURES.obsidianFootnote) ||
    options.syntaxFeatures.has(MARKDOWN_FEATURES.footnote)
  for (const segment of segments) {
    if (segment.placement === "footnote-tail" && projectsFootnotes) {
      segment.projection = { placement: "end", sourceEditable: false }
    }
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
    options.inputProfile ?? "document",
    options.grammar,
    analysis.segments[0]?.sourceKind === "frontmatter",
    options
  )
  const deferredFootnotes: LexicalNode[] = []
  const enabled = (feature: string) =>
    options.syntaxFeatures?.has(feature) ?? true
  const semanticEnabled = (eidosFeature: string, obsidianFeature: string) =>
    enabled(eidosFeature) || enabled(obsidianFeature)
  const semanticBlockNodesEnabled =
    options.syntaxFeatures === undefined ||
    [
      MARKDOWN_FEATURES.math,
      MARKDOWN_FEATURES.image,
      MARKDOWN_FEATURES.footnote,
      MARKDOWN_FEATURES.frontmatter,
      MARKDOWN_FEATURES.rawHtml,
      MARKDOWN_FEATURES.reference,
      MARKDOWN_FEATURES.obsidianMath,
      MARKDOWN_FEATURES.obsidianAttachment,
      MARKDOWN_FEATURES.obsidianFootnote,
      MARKDOWN_FEATURES.obsidianProperties,
      MARKDOWN_FEATURES.obsidianRawHtml,
      MARKDOWN_FEATURES.obsidianReference,
      MARKDOWN_FEATURES.obsidianCallout,
    ].some(enabled)
  root.clear()

  for (const segment of analysis.segments) {
    if (segment.syntaxId) {
      const syntax = options.blockSyntax?.find(
        (candidate) => candidate.id === segment.syntaxId
      )
      if (!syntax)
        throw new Error(
          `Missing block syntax "${segment.syntaxId}" during import.`
        )
      root.append(importBlockSyntax(syntax, segment.source, options))
      continue
    }
    if (segment.sourceKind === "frontmatter") {
      if (
        !semanticEnabled(
          MARKDOWN_FEATURES.frontmatter,
          MARKDOWN_FEATURES.obsidianProperties
        )
      ) {
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
      if (
        !semanticEnabled(MARKDOWN_FEATURES.math, MARKDOWN_FEATURES.obsidianMath)
      ) {
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
            options.syntaxFeatures,
            options.dialect
          )
        )
      }
      continue
    }

    const parsed = segment.sourceKind
      ? firstNode(segment.source, options.grammar)
      : undefined
    if (
      (segment.sourceKind === "image" &&
        !semanticEnabled(
          MARKDOWN_FEATURES.image,
          MARKDOWN_FEATURES.obsidianAttachment
        )) ||
      (segment.sourceKind === "footnote" &&
        !semanticEnabled(
          MARKDOWN_FEATURES.footnote,
          MARKDOWN_FEATURES.obsidianFootnote
        )) ||
      (segment.sourceKind === "reference" &&
        !semanticEnabled(
          MARKDOWN_FEATURES.reference,
          MARKDOWN_FEATURES.obsidianReference
        ))
    ) {
      root.append($createEfmSourceBlockNode(segment.source, segment.sourceKind))
      continue
    }
    if (
      semanticEnabled(
        MARKDOWN_FEATURES.image,
        MARKDOWN_FEATURES.obsidianAttachment
      ) &&
      segment.sourceKind === "image" &&
      parsed
    ) {
      const image = standaloneImageData(
        segment.source,
        parsed,
        options.baseUri,
        (options.syntaxFeatures?.has(MARKDOWN_FEATURES.obsidianAttachment) ??
          options.dialect === "obsidian")
          ? "obsidian"
          : "eidos"
      )
      if (image) {
        root.append($createEfmBlockNode(image))
        continue
      }
    }
    if (
      segment.sourceKind === "footnote" &&
      semanticEnabled(
        MARKDOWN_FEATURES.footnote,
        MARKDOWN_FEATURES.obsidianFootnote
      ) &&
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
          previewHtml: markdownPreviewHtml(previewSource, options.grammar),
        })
      )
      continue
    }

    if (
      segment.sourceKind === "reference" &&
      semanticEnabled(
        MARKDOWN_FEATURES.reference,
        MARKDOWN_FEATURES.obsidianReference
      ) &&
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
      if (
        !semanticEnabled(
          MARKDOWN_FEATURES.rawHtml,
          MARKDOWN_FEATURES.obsidianRawHtml
        )
      ) {
        root.append($createEfmSourceBlockNode(segment.source, "raw-html"))
        continue
      }
      root.append(htmlBlockSyntax.import(segment.source, options))
      continue
    }

    if (
      segment.sourceKind === "obsidian-callout" &&
      enabled(MARKDOWN_FEATURES.obsidianCallout)
    ) {
      root.append(calloutBlockSyntax.import(segment.source, options))
      continue
    }

    if (
      segment.sourceKind === "rich-list" &&
      parsed?.type === "list" &&
      isRichListImportable(parsed, segment.source)
    ) {
      root.append(
        importRichList(
          segment.source,
          parsed,
          transformers,
          context,
          options.baseUri,
          options.syntaxFeatures,
          options.dialect
        )
      )
      continue
    }

    if (
      segment.sourceKind === "commonmark" ||
      segment.sourceKind === "commonmark-container"
    ) {
      // An explicitly registered inline owner can make an otherwise opaque
      // paragraph editable, without declaring a built-in semantic feature.
      if (parsed?.type === "paragraph" || parsed?.type === "heading") {
        const protectedRanges: OffsetRange[] = []
        visit(parsed, (child) => {
          const range = nodeRange(child)
          if (range && isProtectedInlineNode(child)) protectedRanges.push(range)
        })
        if (
          options.inlineSyntax?.some(
            (syntax) =>
              syntax.scan(segment.source, { protectedRanges, options }).length >
              0
          )
        ) {
          root.append(
            ...importMarkdownWithSemantics(
              segment.source,
              transformers,
              context,
              options.baseUri,
              options.syntaxFeatures,
              options.dialect
            )
          )
          continue
        }
      }
      root.append(
        semanticBlockNodesEnabled
          ? $createEfmBlockNode({
              kind: "commonmark-container",
              source: segment.source,
              previewHtml: markdownPreviewHtml(segment.source, options.grammar),
            })
          : $createEfmSourceBlockNode(segment.source, "commonmark")
      )
      continue
    }

    root.append(
      ...importMarkdownWithSemantics(
        segment.source,
        transformers,
        context,
        options.baseUri,
        options.syntaxFeatures,
        options.dialect
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
