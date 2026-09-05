import { createMarkdownPreset } from "./profile-system/create-preset"
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
  embedPlugin,
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
export const eidosPreset = createMarkdownPreset({
  id: "eidos.composable",
  extends: gfmPreset,
  plugins: [mathPlugin, footnotePlugin, frontmatterPlugin, highlightPlugin],
})

export const obsidianPreset = createMarkdownPreset({
  id: "obsidian.composable",
  extends: eidosPreset,
  plugins: [
    wikilinkPlugin,
    embedPlugin,
    tagPlugin,
    commentPlugin,
    blockIdPlugin,
    inlineFootnotePlugin,
    calloutPlugin,
    attachmentPlugin,
    vaultLinkPlugin,
  ],
})
