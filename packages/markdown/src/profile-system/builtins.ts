import {
  $convertFromEfmMarkdownString,
  $convertToEfmMarkdownString,
  analyzeEfmMarkdown,
} from "../markdown/efm-document"
import { gfmMarkdownPlugins } from "../plugin-system/builtins"
import {
  defineMarkdownProfile,
  MARKDOWN_PROFILE_API_VERSION,
} from "./profile-api"
import { eidosPreset } from "../presets"

export const eidosMarkdownProfile = eidosPreset
/** @deprecated Compatibility alias, not a separate dialect. */
export const obsidianMarkdownProfile = eidosPreset

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
