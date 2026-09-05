import {
  $isDecoratorNode,
  $isElementNode,
  $isRootOrShadowRoot,
  type LexicalNode,
} from "lexical"
import type {
  MarkdownAnalysisOptions,
  MarkdownDiagnostic,
} from "./document-contract"

export interface MarkdownSyntaxRange {
  start: number
  end: number
}
export interface MarkdownBlockMatch extends MarkdownSyntaxRange {
  diagnostics?: readonly (Omit<MarkdownDiagnostic, "start" | "end"> &
    MarkdownSyntaxRange)[]
}

/** A complete root-level block produced by the selected Markdown grammar. */
export interface MarkdownParsedBlock extends MarkdownSyntaxRange {
  readonly type: string
  readonly source: string
}

/** Top-level block grammar. Inline ownership uses MarkdownInlineSyntax. */
export interface MarkdownBlockSyntax {
  id: string
  scan?(
    source: string,
    context: {
      protectedRanges: readonly MarkdownSyntaxRange[]
      options: MarkdownAnalysisOptions
    }
  ): readonly MarkdownBlockMatch[]
  /** Claim a whole parsed block, e.g. a quote with a callout marker. */
  matchParsedBlock?(
    block: MarkdownParsedBlock,
    options: MarkdownAnalysisOptions
  ): boolean
  /** Called inside a Lexical update. Must create one detached root-level block. */
  import(source: string, options: MarkdownAnalysisOptions): LexicalNode
  /** Null means this grammar does not own the node. Empty string is valid. */
  export(node: LexicalNode): string | null
}

/** Enforce the one-source-segment / one-root-block mapping at the boundary. */
export function importBlockSyntax(
  syntax: MarkdownBlockSyntax,
  source: string,
  options: MarkdownAnalysisOptions
): LexicalNode {
  const node = syntax.import(source, options)
  if (
    (!$isElementNode(node) && !$isDecoratorNode(node)) ||
    $isRootOrShadowRoot(node) ||
    node.isInline() ||
    node.getParent() !== null
  ) {
    throw new Error(
      `Block syntax "${syntax.id}" must import one detached block node.`
    )
  }
  return node
}

export function scanBlockSyntax(
  source: string,
  syntaxes: readonly MarkdownBlockSyntax[],
  protectedRanges: readonly MarkdownSyntaxRange[],
  options: MarkdownAnalysisOptions,
  parsedBlocks: readonly MarkdownParsedBlock[] = []
): (MarkdownBlockMatch & { syntaxId: string })[] {
  const matches: (MarkdownBlockMatch & { syntaxId: string })[] = []
  for (const syntax of syntaxes) {
    const scanned = syntax.scan?.(source, { protectedRanges, options }) ?? []
    const claimed = parsedBlocks.filter((block) =>
      syntax.matchParsedBlock?.(block, options)
    )
    for (const match of [...scanned, ...claimed]) {
      if (
        !Number.isInteger(match.start) ||
        !Number.isInteger(match.end) ||
        match.start < 0 ||
        match.end <= match.start ||
        match.end > source.length ||
        (match.start > 0 && source[match.start - 1] !== "\n") ||
        (match.end < source.length && source[match.end] !== "\n")
      ) {
        throw new Error(
          `Block syntax "${syntax.id}" returned an invalid whole-line source range.`
        )
      }
      if (
        !claimed.some((block) => block === match) &&
        protectedRanges.some(
          (range) => match.start >= range.start && match.start < range.end
        )
      )
        continue
      if (
        matches.some(
          (range) => match.start < range.end && match.end > range.start
        )
      ) {
        throw new Error(
          `Block syntax "${syntax.id}" overlaps another block grammar.`
        )
      }
      matches.push({ ...match, syntaxId: syntax.id })
    }
  }
  return matches.sort((a, b) => a.start - b.start)
}
