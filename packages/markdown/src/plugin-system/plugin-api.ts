import type { Transformer } from "@lexical/markdown"
import type {
  Klass,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  RangeSelection,
  TextFormatType,
} from "lexical"
import type { ComponentType } from "react"

import type { CodeHighlightTokenizer } from "../highlighting/code-highlight-tokenizer"
import type { EfmInputProfile, MarkdownEditorLabels } from "../types"
import type { MarkdownShortcutDefinition } from "../shortcuts/shortcut-registry"
import type { MarkdownBlockSyntax } from "../core/block-syntax"
import type { MarkdownBlockBoundary } from "../core/block-boundary"
import type { MarkdownGrammar } from "../core/markdown-grammar"
import type { MarkdownInlineSyntax } from "../core/inline-syntax"

export const MARKDOWN_PLUGIN_API_VERSION = 1 as const

export type MarkdownPluginApiVersion = typeof MARKDOWN_PLUGIN_API_VERSION
export type MarkdownInsertionContext = "block" | "inline"
export type MarkdownInsertionSection = "basic" | "extended"
export type MarkdownInsertionPlacement = "after" | "replace-empty"

export interface MarkdownPluginBehaviorProps {
  baseUri?: string
  codeHighlightTokenizer?: CodeHighlightTokenizer | false
  documentKey: string
  inputProfile: EfmInputProfile
  labels: MarkdownEditorLabels
  onError(error: Error): void
  readOnly: boolean
  syntaxFeatures: ReadonlySet<string>
  transformers: readonly Transformer[]
}

export interface MarkdownPluginInsertionExecutionContext {
  labels: MarkdownEditorLabels
  /** Opens a host-owned draft form, preserving the original insertion anchor. */
  requestText(options: MarkdownInsertionTextRequest): void
  /** Selects an inserted block after its decorator has mounted. */
  selectBlock(key: NodeKey): void
  anchorKey: NodeKey | null
  closeMenu(): void
  editor: LexicalEditor
  focusEditor(): void
  inputProfile: EfmInputProfile
  insertBlock(
    createNode: () => LexicalNode,
    options?: { focus: "start" | "after" }
  ): NodeKey | null
  insertInline(createNodes: () => readonly LexicalNode[]): boolean
  mode: MarkdownInsertionContext
  placement: MarkdownInsertionPlacement
}

export interface MarkdownInsertionTextRequest {
  title: string
  label: string
  initialValue?: string
  /** Keep the form open by not calling closeMenu when input is incomplete. */
  onSubmit(value: string): void
}

export interface MarkdownPluginInsertion {
  /** Stable, globally unique command ID. Namespace third-party IDs. */
  id: string
  /** Lower values render first. Equal values retain resolved plugin order. */
  order?: number
  contexts: readonly MarkdownInsertionContext[]
  glyph: string
  label?: string
  labelKey?: keyof MarkdownEditorLabels
  keywords?: readonly string[]
  section: MarkdownInsertionSection
  /**
   * Immediate insertion hook for external plugins. Built-in complex composers
   * currently resolve their stable IDs in the shared insertion host.
   */
  execute?(context: MarkdownPluginInsertionExecutionContext): void
}

export interface MarkdownPluginBehavior {
  id: string
  component: ComponentType<MarkdownPluginBehaviorProps>
}

export interface MarkdownPluginToolbarItem {
  /** Stable, globally unique action ID. */
  id: string
  /** Lower values render first. Equal values retain resolved plugin order. */
  order?: number
  glyph: string
  label?: string
  labelKey?: keyof MarkdownEditorLabels
  shortcutId?: string
  /** Covers native Lexical text formats; custom actions can use execute. */
  format?: TextFormatType
  execute?(editor: LexicalEditor): void
  isActive?(selection: RangeSelection): boolean
}

export interface MarkdownTransformerContribution {
  /** Lower values run first. Equal values retain resolved plugin order. */
  order?: number
  transformer: Transformer
  /** Bind a fresh transformer to the ordered, unbound contributions of this
   * composition. Do not mutate these shared definitions or the input array. */
  configure?(transformers: readonly Transformer[]): Transformer
}

export interface MarkdownPlugin {
  grammar?: MarkdownGrammar
  blockBoundaries?: readonly MarkdownBlockBoundary[]
  blockSyntax?: readonly MarkdownBlockSyntax[]
  inlineSyntax?: readonly MarkdownInlineSyntax[]
  apiVersion: MarkdownPluginApiVersion
  /** Stable plugin identity, for example `eidos.math`. */
  id: string
  version: string
  after?: readonly string[]
  before?: readonly string[]
  conflicts?: readonly string[]
  requires?: readonly string[]
  /** Syntax and presentation capabilities exposed by this plugin. */
  features?: readonly string[]
  nodes?: readonly Klass<LexicalNode>[]
  transformers?: readonly MarkdownTransformerContribution[]
  behaviors?: readonly MarkdownPluginBehavior[]
  insertions?: readonly MarkdownPluginInsertion[]
  shortcuts?: Readonly<Record<string, MarkdownShortcutDefinition>>
  toolbar?: readonly MarkdownPluginToolbarItem[]
}

export interface CompiledMarkdownPluginBehavior extends MarkdownPluginBehavior {
  pluginId: string
}

export interface CompiledMarkdownPluginInsertion extends MarkdownPluginInsertion {
  pluginId: string
}

export interface CompiledMarkdownPluginToolbarItem extends MarkdownPluginToolbarItem {
  pluginId: string
}

export interface CompiledMarkdownPlugins {
  grammar: MarkdownGrammar
  blockBoundaries: readonly MarkdownBlockBoundary[]
  blockSyntax: readonly MarkdownBlockSyntax[]
  inlineSyntax: readonly MarkdownInlineSyntax[]
  behaviors: readonly CompiledMarkdownPluginBehavior[]
  features: ReadonlySet<string>
  insertions: readonly CompiledMarkdownPluginInsertion[]
  nodes: readonly Klass<LexicalNode>[]
  plugins: readonly MarkdownPlugin[]
  shortcuts: Readonly<Record<string, MarkdownShortcutDefinition>>
  signature: string
  toolbar: readonly CompiledMarkdownPluginToolbarItem[]
  transformers: readonly Transformer[]
}

/** Defines one immutable plugin descriptor without registering global state. */
export function defineMarkdownPlugin<const Plugin extends MarkdownPlugin>(
  plugin: Plugin
): Plugin {
  return Object.freeze(plugin)
}
