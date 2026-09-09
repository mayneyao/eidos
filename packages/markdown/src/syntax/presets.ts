import { composeMarkdownGrammar } from "../core/markdown-grammar"
import { GFM_GRAMMARS } from "../features/gfm/grammar"
import { footnoteGrammar } from "../features/footnote/grammar"

/** The extra syntax owners shared by editor presets and static rendering.
 * Every entry must have an editor adapter and a static handler (tested).
 */
export const EIDOS_EXTENSION_IDS = [
  "eidos.math",
  "eidos.footnote",
  "eidos.frontmatter",
  "eidos.highlight",
  "markdown.wikilink",
  "markdown.tag",
  "markdown.comment",
  "markdown.block-id",
  "markdown.inline-footnote",
  "markdown.callout",
  "markdown.attachment",
  "markdown.vault-link",
] as const
export type EidosExtensionId = (typeof EIDOS_EXTENSION_IDS)[number]

export const gfmSyntax = Object.freeze({
  id: "gfm",
  grammar: composeMarkdownGrammar(Object.values(GFM_GRAMMARS)),
  extensions: [] as readonly EidosExtensionId[],
})
export const eidosSyntax = Object.freeze({
  id: "eidos",
  grammar: composeMarkdownGrammar([
    ...Object.values(GFM_GRAMMARS),
    footnoteGrammar,
  ]),
  extensions: EIDOS_EXTENSION_IDS,
})
