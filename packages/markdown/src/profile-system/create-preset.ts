import { compileMarkdownPlugins } from "../plugin-system/plugin-compiler"
import type { MarkdownPlugin } from "../plugin-system/plugin-api"
import {
  $convertFromEfmMarkdownString,
  $convertToEfmMarkdownString,
  analyzeEfmMarkdown,
} from "../markdown/efm-document"
import {
  defineMarkdownProfile,
  type MarkdownProfile,
  type MarkdownProfileCodec,
} from "./profile-api"
import type { EfmAnalysisOptions } from "../markdown/efm-document"

export interface MarkdownPresetOptions {
  id: string
  version?: string
  /** A reusable composition. Plugins are inherited, not a second codec. */
  extends?: MarkdownProfile
  plugins?: readonly MarkdownPlugin[]
  /** Explicit removals. Required dependencies cannot be silently removed. */
  exclude?: readonly string[]
}

/** Compile one explicit syntax set. No implicit GFM or vault extensions. */
export function createMarkdownPreset(
  options: MarkdownPresetOptions
): MarkdownProfile {
  const plugins = new Map<string, MarkdownPlugin>()
  for (const plugin of options.extends?.plugins ?? [])
    plugins.set(plugin.id, plugin)
  for (const plugin of options.plugins ?? []) {
    const existing = plugins.get(plugin.id)
    if (existing && existing !== plugin) {
      throw new Error(
        `Preset plugin "${plugin.id}" has two different definitions.`
      )
    }
    plugins.set(plugin.id, plugin)
  }
  for (const id of options.exclude ?? []) {
    if (!plugins.delete(id))
      throw new Error(`Cannot remove unknown preset plugin "${id}".`)
  }
  const registry = compileMarkdownPlugins([...plugins.values()])
  const analysisOptions = (input: EfmAnalysisOptions): EfmAnalysisOptions => ({
    ...input,
    grammar: registry.grammar,
    syntaxFeatures: registry.features,
    blockSyntax: registry.blockSyntax,
    inlineSyntax: registry.inlineSyntax,
    // Legacy dialect defaults must not override an explicit composition.
    dialect: undefined,
  })
  const codec: MarkdownProfileCodec = {
    analyze: (source, input) =>
      analyzeEfmMarkdown(source, analysisOptions(input)),
    import: (source, transformers, input, node) =>
      $convertFromEfmMarkdownString(
        source,
        transformers,
        analysisOptions(input),
        node
      ),
    export: $convertToEfmMarkdownString,
  }
  return defineMarkdownProfile({
    apiVersion: 1,
    id: options.id,
    version: options.version ?? "1.0.0",
    plugins: registry.plugins,
    codec,
  })
}
