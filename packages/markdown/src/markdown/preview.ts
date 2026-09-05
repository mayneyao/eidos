import { micromark } from "micromark"
import { gfm } from "micromark-extension-gfm"
import type { MarkdownGrammar } from "../core/markdown-grammar"

/** Render markup for the semantic view. The view must sanitize before display. */
export function markdownPreviewHtml(
  source: string,
  grammar?: MarkdownGrammar
): string {
  return micromark(source, {
    allowDangerousHtml: true,
    ...(grammar ?? { extensions: [gfm()] }),
  })
}
