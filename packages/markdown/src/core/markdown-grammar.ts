import type { Options as ParseOptions } from "mdast-util-from-markdown"
import type { Options as HtmlOptions } from "micromark"

/** Configurable CommonMark constructs. Escapes, entities and line endings remain core. */
export const COMMONMARK_CONSTRUCTS = [
  "headingAtx",
  "setextUnderline",
  "blockQuote",
  "list",
  "codeFenced",
  "codeIndented",
  "codeText",
  "attention",
  "autolink",
  "labelStartLink",
  "labelStartImage",
  "definition",
  "htmlFlow",
  "htmlText",
  "thematicBreak",
] as const
export type MarkdownCommonmarkConstruct = (typeof COMMONMARK_CONSTRUCTS)[number]

/** A syntax owner's matching parser and safe-preview contributions. */
export interface MarkdownGrammar {
  /**
   * Opt into explicit CommonMark composition. Contributions are unioned; omitted
   * constructs are disabled in both parsing and HTML previews. If no plugin
   * declares this field, the legacy complete CommonMark grammar is retained.
   */
  commonmark?: readonly MarkdownCommonmarkConstruct[]
  extensions?: ParseOptions["extensions"]
  mdastExtensions?: ParseOptions["mdastExtensions"]
  htmlExtensions?: HtmlOptions["htmlExtensions"]
}

export function composeMarkdownGrammar(
  grammars: readonly MarkdownGrammar[]
): MarkdownGrammar {
  const explicit = grammars.some((grammar) => grammar.commonmark !== undefined)
  const enabled = new Set(
    grammars.flatMap((grammar) => grammar.commonmark ?? [])
  )
  for (const construct of enabled) {
    if (!COMMONMARK_CONSTRUCTS.includes(construct))
      throw new Error(`Unknown CommonMark construct "${construct}".`)
  }
  const disabled = explicit
    ? COMMONMARK_CONSTRUCTS.filter((construct) => !enabled.has(construct))
    : []
  return Object.freeze({
    extensions: [
      ...grammars.flatMap((grammar) => grammar.extensions ?? []),
      ...(disabled.length ? [{ disable: { null: disabled } }] : []),
    ],
    mdastExtensions: grammars.flatMap(
      (grammar) => grammar.mdastExtensions ?? []
    ),
    htmlExtensions: grammars.flatMap((grammar) => grammar.htmlExtensions ?? []),
  })
}
