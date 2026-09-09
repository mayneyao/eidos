import { micromark } from "micromark"
import { eidosSyntax, type EidosExtensionId } from "./syntax/presets"
import { parseStaticDocument } from "./syntax/parse"
import {
  renderDocument,
  STATIC_EXTENSION_SUPPORT,
  type StaticLinkTarget,
} from "./static/render"
import type { MarkdownGrammar } from "./core/markdown-grammar"

export type { MarkdownGrammar } from "./core/markdown-grammar"
export { composeMarkdownGrammar } from "./core/markdown-grammar"

export { eidosSyntax, gfmSyntax } from "./syntax/presets"
export type { StaticLinkTarget } from "./static/render"

export interface StaticMarkdownOptions {
  /** Defaults to the same extended syntax set as the editor's eidosPreset. */
  syntax?: { grammar: MarkdownGrammar; extensions: readonly EidosExtensionId[] }
  /** Trusted parser/HTML contributions, shared with editor plugin grammars. */
  grammar?: MarkdownGrammar
  resolveInternalLink?: (target: StaticLinkTarget) => string | null
}

/**
 * Render the editor's Eidos syntax without React, Lexical or a DOM.
 * Safe HTML is sanitized; active HTML stays visible as escaped source.
 * The host owns attachment URLs, publication mappings and the document shell.
 */
export function renderMarkdownToHtml(
  source: string,
  options: StaticMarkdownOptions = {}
): string {
  if (options.grammar)
    return micromark(source, {
      ...options.grammar,
      allowDangerousHtml: false,
      allowDangerousProtocol: false,
    })
  const syntax = options.syntax ?? eidosSyntax
  for (const id of syntax.extensions) {
    if (!Object.prototype.hasOwnProperty.call(STATIC_EXTENSION_SUPPORT, id))
      throw new Error(`Unsupported static syntax owner: ${id}`)
  }
  const normalized = source.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n")
  const parsed = parseStaticDocument(
    normalized,
    syntax.grammar,
    syntax.extensions
  )
  return renderDocument(parsed.tree, {
    source: parsed.source,
    extensions: syntax.extensions,
    resolveInternalLink: options.resolveInternalLink,
    renderFragment: (source) =>
      renderMarkdownToHtml(source, {
        ...options,
        syntax: {
          ...syntax,
          extensions: syntax.extensions.filter(
            (id) => id !== "eidos.frontmatter"
          ),
        },
      }),
  })
}
