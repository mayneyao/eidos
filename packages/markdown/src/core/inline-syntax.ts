import { $isRootOrShadowRoot, type LexicalNode } from "lexical"
import type { MarkdownAnalysisOptions } from "./document-contract"
import type { MarkdownSyntaxRange } from "./block-syntax"

export interface MarkdownInlineSyntax {
  id: string
  /** Own the whole token before inner semantics, e.g. comments containing math. */
  capturesContent?: boolean
  scan(
    source: string,
    context: {
      protectedRanges: readonly MarkdownSyntaxRange[]
      options: MarkdownAnalysisOptions
    }
  ): readonly MarkdownSyntaxRange[]
  /** Called inside a Lexical update. Return one detached inline node. */
  import(source: string, options: MarkdownAnalysisOptions): LexicalNode
  export(node: LexicalNode): string | null
}

export function importInlineSyntax(
  syntax: MarkdownInlineSyntax,
  source: string,
  options: MarkdownAnalysisOptions
): LexicalNode {
  const node = syntax.import(source, options)
  if (
    $isRootOrShadowRoot(node) ||
    !node.isInline() ||
    node.getParent() !== null
  )
    throw new Error(
      `Inline syntax "${syntax.id}" must import one detached inline node.`
    )
  return node
}

export function scanInlineSyntax(
  source: string,
  syntaxes: readonly MarkdownInlineSyntax[],
  protectedRanges: readonly MarkdownSyntaxRange[],
  options: MarkdownAnalysisOptions
) {
  const matches: (MarkdownSyntaxRange & { syntax: MarkdownInlineSyntax })[] = []
  for (const syntax of syntaxes) {
    for (const match of syntax.scan(source, { protectedRanges, options })) {
      if (
        !Number.isInteger(match.start) ||
        !Number.isInteger(match.end) ||
        match.start < 0 ||
        match.end <= match.start ||
        match.end > source.length
      )
        throw new Error(
          `Inline syntax "${syntax.id}" returned an invalid source range.`
        )
      if (
        protectedRanges.some(
          (range) => match.start < range.end && match.end > range.start
        )
      )
        continue
      if (
        matches.some(
          (range) => match.start < range.end && match.end > range.start
        )
      )
        throw new Error(
          `Inline syntax "${syntax.id}" overlaps another inline grammar.`
        )
      matches.push({ ...match, syntax })
    }
  }
  return matches.sort((a, b) => a.start - b.start)
}
