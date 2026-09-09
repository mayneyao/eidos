import { gfmFootnote, gfmFootnoteHtml } from "micromark-extension-gfm-footnote"
import { gfmFootnoteFromMarkdown } from "mdast-util-gfm-footnote"
import type { MarkdownGrammar } from "../../core/markdown-grammar"

export const footnoteGrammar: MarkdownGrammar = {
  extensions: [gfmFootnote()],
  mdastExtensions: [gfmFootnoteFromMarkdown()],
  htmlExtensions: [gfmFootnoteHtml()],
}
