import type { Transformer } from "@lexical/markdown"
import type { ElementNode } from "lexical"

import type {
  MarkdownAnalysisOptions,
  MarkdownDocumentAnalysis,
} from "../core/document-contract"
import type { MarkdownPlugin } from "../plugin-system/plugin-api"

export const MARKDOWN_PROFILE_API_VERSION = 1 as const

export type MarkdownProfileApiVersion = typeof MARKDOWN_PROFILE_API_VERSION

export interface MarkdownProfileCodec {
  analyze(
    markdown: string,
    options: MarkdownAnalysisOptions
  ): MarkdownDocumentAnalysis
  import(
    markdown: string,
    transformers: readonly Transformer[],
    options: MarkdownAnalysisOptions,
    node?: ElementNode
  ): MarkdownDocumentAnalysis
  export(transformers: readonly Transformer[], node?: ElementNode): string
}

/**
 * One mutually exclusive document-level Markdown interpretation.
 *
 * Plugins describe syntax nodes and editor behavior. The codec owns the
 * matching import, analysis, and serialization rules. An editor session never
 * combines codecs from multiple profiles.
 */
export interface MarkdownProfile {
  apiVersion: MarkdownProfileApiVersion
  id: string
  version: string
  plugins: readonly MarkdownPlugin[]
  codec: MarkdownProfileCodec
}

export function defineMarkdownProfile<const Profile extends MarkdownProfile>(
  profile: Profile
): Profile {
  if (profile.apiVersion !== MARKDOWN_PROFILE_API_VERSION) {
    throw new Error(
      `Markdown profile "${profile.id}" uses unsupported API version ${profile.apiVersion}.`
    )
  }
  if (!/^[a-z0-9]+(?:[._/-][a-z0-9]+)+$/u.test(profile.id)) {
    throw new Error(`Markdown profile ID "${profile.id}" is not namespaced.`)
  }
  if (!profile.version.trim()) {
    throw new Error(`Markdown profile "${profile.id}" needs a version.`)
  }
  return Object.freeze({
    ...profile,
    plugins: Object.freeze([...profile.plugins]),
  })
}
