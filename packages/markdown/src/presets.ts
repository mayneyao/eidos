import { createMarkdownPreset } from "./profile-system/create-preset"
import { EIDOS_EXTENSION_IDS, type EidosExtensionId } from "./syntax/presets"
import type { MarkdownPlugin } from "./plugin-system/plugin-api"
import {
  sourceEditingPlugin,
  imagePlugin,
  rawHtmlPlugin,
  referencePlugin,
  mathPlugin,
  footnotePlugin,
  frontmatterPlugin,
  highlightPlugin,
} from "./plugin-system/builtins"
import { gfmSyntaxPlugins } from "./features/gfm/individual-plugins"
import {
  commonmarkSyntaxPlugins,
  paragraphPlugin,
} from "./features/commonmark/plugin"
import { wikilinkPlugin } from "./features/wikilink/plugin"
import {
  tagPlugin,
  commentPlugin,
  blockIdPlugin,
  inlineFootnotePlugin,
} from "./features/vault-inline/plugins"
import {
  calloutPlugin,
  attachmentPlugin,
  vaultLinkPlugin,
} from "./features/vault-blocks/plugins"

export { createMarkdownPreset } from "./profile-system/create-preset"
export type { MarkdownPresetOptions } from "./profile-system/create-preset"

export const minimalPreset = createMarkdownPreset({
  id: "markdown.minimal",
  plugins: [sourceEditingPlugin, paragraphPlugin],
})

export const commonmarkPreset = createMarkdownPreset({
  id: "markdown.commonmark",
  plugins: [
    sourceEditingPlugin,
    ...commonmarkSyntaxPlugins,
    imagePlugin,
    rawHtmlPlugin,
    referencePlugin,
  ],
})
export const gfmPreset = createMarkdownPreset({
  id: "markdown.gfm.composable",
  extends: commonmarkPreset,
  plugins: gfmSyntaxPlugins,
})
const eidosEditorAdapters = {
  "eidos.math": mathPlugin,
  "eidos.footnote": footnotePlugin,
  "eidos.frontmatter": frontmatterPlugin,
  "eidos.highlight": highlightPlugin,
  "markdown.wikilink": wikilinkPlugin,
  "markdown.tag": tagPlugin,
  "markdown.comment": commentPlugin,
  "markdown.block-id": blockIdPlugin,
  "markdown.inline-footnote": inlineFootnotePlugin,
  "markdown.callout": calloutPlugin,
  "markdown.attachment": attachmentPlugin,
  "markdown.vault-link": vaultLinkPlugin,
} satisfies Record<EidosExtensionId, MarkdownPlugin>

export const eidosPreset = createMarkdownPreset({
  id: "eidos.composable",
  extends: gfmPreset,
  plugins: EIDOS_EXTENSION_IDS.map((id) => eidosEditorAdapters[id]),
})

/** @deprecated Eidos Markdown includes these extensions by default. */
export const obsidianPreset = eidosPreset
