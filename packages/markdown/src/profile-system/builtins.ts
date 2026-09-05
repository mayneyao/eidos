import {
  $convertFromEfmMarkdownString,
  $convertToEfmMarkdownString,
  analyzeEfmMarkdown,
} from "../markdown/efm-document"
import {
  eidosMarkdownPlugins,
  gfmMarkdownPlugins,
  obsidianMarkdownPlugins,
} from "../plugin-system/builtins"
import {
  defineMarkdownProfile,
  MARKDOWN_PROFILE_API_VERSION,
  type MarkdownProfileCodec,
} from "./profile-api"
import { vaultInlineSyntax } from "../features/vault-inline/syntax"
import { mathInlineSyntax } from "../features/math/inline-syntax"

const obsidianMarkdownCodec: MarkdownProfileCodec = {
  analyze: (markdown, options) =>
    analyzeEfmMarkdown(markdown, { ...options, dialect: "obsidian" }),
  import: (markdown, transformers, options, node) =>
    $convertFromEfmMarkdownString(
      markdown,
      transformers,
      {
        ...options,
        inlineSyntax: options.inlineSyntax ?? [
          ...vaultInlineSyntax,
          mathInlineSyntax,
        ],
        dialect: "obsidian",
      },
      node
    ),
  export: $convertToEfmMarkdownString,
}

export const eidosMarkdownProfile = defineMarkdownProfile({
  apiVersion: MARKDOWN_PROFILE_API_VERSION,
  id: "eidos.efm",
  version: "1.0.0",
  plugins: eidosMarkdownPlugins,
  codec: {
    analyze: analyzeEfmMarkdown,
    import: $convertFromEfmMarkdownString,
    export: $convertToEfmMarkdownString,
  },
})

export const obsidianMarkdownProfile = defineMarkdownProfile({
  apiVersion: MARKDOWN_PROFILE_API_VERSION,
  id: "obsidian.markdown",
  version: "0.1.0-experimental.1",
  plugins: obsidianMarkdownPlugins,
  codec: obsidianMarkdownCodec,
})

const gfmFeatures = new Set(
  gfmMarkdownPlugins.flatMap((plugin) => plugin.features ?? [])
)

export const gfmMarkdownProfile = defineMarkdownProfile({
  apiVersion: MARKDOWN_PROFILE_API_VERSION,
  id: "markdown.gfm",
  version: "1.0.0",
  plugins: gfmMarkdownPlugins,
  codec: {
    analyze: (markdown, options) =>
      analyzeEfmMarkdown(markdown, {
        ...options,
        syntaxFeatures: options.syntaxFeatures ?? gfmFeatures,
        dialect: "gfm",
        blockSyntax: [],
      }),
    import: (markdown, transformers, options, node = undefined) =>
      $convertFromEfmMarkdownString(
        markdown,
        transformers,
        {
          ...options,
          syntaxFeatures: options.syntaxFeatures ?? gfmFeatures,
          dialect: "gfm",
          blockSyntax: [],
        },
        node
      ),
    export: $convertToEfmMarkdownString,
  },
})
