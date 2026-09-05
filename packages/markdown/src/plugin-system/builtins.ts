import { HIGHLIGHT } from "@lexical/markdown"
import { gfmFootnote, gfmFootnoteHtml } from "micromark-extension-gfm-footnote"
import { gfmFootnoteFromMarkdown } from "mdast-util-gfm-footnote"
import { EfmBlockNode, EfmInlineNode } from "../nodes/efm-semantic-node"
import { EfmSourceRangeNode } from "../nodes/efm-source-range-node"
import { SourceRangeEditingPlugin } from "../plugins/source-range-editing-plugin"
import { RelativeLinkBehavior } from "../features/commonmark/relative-link-behavior"
import { defineMarkdownPlugin } from "./plugin-api"
import {
  compileMarkdownPlugins,
  defineMarkdownPlugins,
} from "./plugin-compiler"
import { MARKDOWN_FEATURES } from "./feature-ids"
import { mathPlugin } from "../features/math/plugin"
import { rawHtmlPlugin } from "../features/html/plugin"
import { mathInsertions } from "../features/math/insertions"
import { mathBlockSyntax } from "../features/math/block-syntax"
import { calloutBlockSyntax } from "../features/vault-blocks/callout-syntax"
import { mathInlineSyntax } from "../features/math/inline-syntax"
import { frontmatterBoundary } from "../features/frontmatter/boundary"
import { footnoteBoundary } from "../features/footnote/boundary"
import { commonmarkPlugin } from "../features/commonmark/plugin"
import { gfmPlugin } from "../features/gfm/plugin"
import { vaultInlineSyntax } from "../features/vault-inline/syntax"
export { commonmarkPlugin } from "../features/commonmark/plugin"
export { gfmPlugin } from "../features/gfm/plugin"
export { mathPlugin } from "../features/math/plugin"
export { rawHtmlPlugin } from "../features/html/plugin"

export const sourceEditingPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "eidos.source-range-editing",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.sourceRangeEditing],
  nodes: [EfmSourceRangeNode],
  behaviors: [
    {
      id: "eidos.source-range-editing.behavior",
      component: SourceRangeEditingPlugin,
    },
  ],
})

export const highlightPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "eidos.highlight",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.highlight],
  transformers: [{ order: 170, transformer: HIGHLIGHT }],
  toolbar: [
    {
      id: "format.highlight",
      order: 130,
      glyph: "==",
      labelKey: "highlight",
      format: "highlight",
    },
  ],
})

export const imagePlugin = defineMarkdownPlugin({
  grammar: { commonmark: ["labelStartImage", "definition"] },
  apiVersion: 1,
  id: "eidos.image",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.image],
  nodes: [EfmBlockNode, EfmInlineNode],
  insertions: [
    {
      id: "image",
      order: 220,
      contexts: ["block"],
      glyph: "▧",
      labelKey: "image",
      section: "extended",
    },
  ],
})

export const footnotePlugin = defineMarkdownPlugin({
  grammar: {
    extensions: [gfmFootnote()],
    mdastExtensions: [gfmFootnoteFromMarkdown()],
    htmlExtensions: [gfmFootnoteHtml()],
  },
  blockBoundaries: [footnoteBoundary],
  apiVersion: 1,
  id: "eidos.footnote",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.footnote],
  nodes: [EfmBlockNode, EfmInlineNode],
  insertions: [
    {
      id: "footnote",
      order: 230,
      contexts: ["block", "inline"],
      glyph: "¹",
      labelKey: "footnote",
      section: "extended",
    },
  ],
})

export const frontmatterPlugin = defineMarkdownPlugin({
  blockBoundaries: [frontmatterBoundary],
  apiVersion: 1,
  id: "eidos.frontmatter",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.frontmatter],
  nodes: [EfmBlockNode],
  insertions: [
    {
      id: "frontmatter",
      order: 250,
      contexts: ["block"],
      glyph: "≡",
      labelKey: "frontmatter",
      section: "extended",
    },
  ],
})

export const referencePlugin = defineMarkdownPlugin({
  grammar: { commonmark: ["definition"] },
  apiVersion: 1,
  id: "eidos.reference",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.reference],
  nodes: [EfmBlockNode, EfmInlineNode],
})

/** Obsidian-owned syntax and UI contributions layered only on shared Markdown. */
export const obsidianSyntaxPlugin = defineMarkdownPlugin({
  inlineSyntax: [...vaultInlineSyntax, mathInlineSyntax],
  grammar: {
    ...footnotePlugin.grammar,
    commonmark: ["labelStartImage", "definition", "htmlFlow", "htmlText"],
  },
  blockBoundaries: [frontmatterBoundary, footnoteBoundary],
  blockSyntax: [mathBlockSyntax, calloutBlockSyntax],
  apiVersion: 1,
  id: "obsidian.syntax",
  version: "1.0.0",
  requires: [commonmarkPlugin.id, gfmPlugin.id],
  features: [
    MARKDOWN_FEATURES.obsidianHighlight,
    MARKDOWN_FEATURES.obsidianMath,
    MARKDOWN_FEATURES.obsidianAttachment,
    MARKDOWN_FEATURES.obsidianFootnote,
    MARKDOWN_FEATURES.obsidianProperties,
    MARKDOWN_FEATURES.obsidianRawHtml,
    MARKDOWN_FEATURES.obsidianReference,
    MARKDOWN_FEATURES.obsidianWikilink,
    MARKDOWN_FEATURES.obsidianEmbed,
    MARKDOWN_FEATURES.obsidianBlockId,
    MARKDOWN_FEATURES.obsidianCallout,
    MARKDOWN_FEATURES.obsidianComment,
    MARKDOWN_FEATURES.obsidianTag,
    MARKDOWN_FEATURES.obsidianInlineFootnote,
  ],
  nodes: [EfmBlockNode, EfmInlineNode],
  behaviors: [
    {
      id: "obsidian.internal-link-dom",
      component: RelativeLinkBehavior,
    },
  ],
  transformers: [{ order: 170, transformer: HIGHLIGHT }],
  toolbar: [
    {
      id: "obsidian.format.highlight",
      order: 130,
      glyph: "==",
      labelKey: "highlight",
      format: "highlight",
    },
  ],
  insertions: [
    ...mathInsertions,
    {
      id: "image",
      order: 220,
      contexts: ["block"],
      glyph: "▧",
      labelKey: "image",
      section: "extended",
    },
    {
      id: "footnote",
      order: 230,
      contexts: ["block", "inline"],
      glyph: "¹",
      labelKey: "footnote",
      section: "extended",
    },
    {
      id: "html",
      order: 240,
      contexts: ["block"],
      glyph: "<>",
      labelKey: "rawHtml",
      section: "extended",
    },
    {
      id: "frontmatter",
      order: 250,
      contexts: ["block"],
      glyph: "≡",
      labelKey: "frontmatter",
      section: "extended",
    },
  ],
})

export const obsidianMarkdownPlugins = defineMarkdownPlugins([
  sourceEditingPlugin,
  commonmarkPlugin,
  gfmPlugin,
  obsidianSyntaxPlugin,
])

export const OBSIDIAN_MARKDOWN_PLUGIN_REGISTRY = compileMarkdownPlugins(
  obsidianMarkdownPlugins
)

/** The shipped EFM profile. Consumers can remove or append plugins immutably. */
export const eidosMarkdownPlugins = defineMarkdownPlugins([
  sourceEditingPlugin,
  commonmarkPlugin,
  gfmPlugin,
  highlightPlugin,
  mathPlugin,
  imagePlugin,
  footnotePlugin,
  frontmatterPlugin,
  rawHtmlPlugin,
  referencePlugin,
])

/** Precompiled default registry reused by the component and advanced hosts. */
export const EIDOS_MARKDOWN_PLUGIN_REGISTRY =
  compileMarkdownPlugins(eidosMarkdownPlugins)

/** GFM's complete syntax families, without EFM or vault-specific extensions. */
export const gfmMarkdownPlugins = defineMarkdownPlugins([
  sourceEditingPlugin,
  commonmarkPlugin,
  gfmPlugin,
  imagePlugin,
  rawHtmlPlugin,
  referencePlugin,
])
