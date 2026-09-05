// Editor surface
export { createMarkdownPreset } from "./profile-system/create-preset"
export type { MarkdownPresetOptions } from "./profile-system/create-preset"
export {
  tablePlugin,
  taskListPlugin,
  strikethroughPlugin,
  autolinkPlugin,
  tagFilterPlugin,
  gfmSyntaxPlugins,
} from "./features/gfm/individual-plugins"
export type {
  MarkdownGrammar,
  MarkdownCommonmarkConstruct,
} from "./core/markdown-grammar"
export type {
  MarkdownBlockSyntax,
  MarkdownParsedBlock,
  MarkdownBlockMatch,
  MarkdownSyntaxRange,
} from "./core/block-syntax"
export type {
  MarkdownAnalysisOptions,
  MarkdownDiagnostic,
  MarkdownDocumentAnalysis,
  MarkdownInputMode,
  MarkdownSourcePosition,
  MarkdownSourceSegment,
} from "./core/document-contract"
export { MarkdownEditor } from "./editor/markdown-editor"

// Optional behavior and highlighting extension points
export { CodeHighlightPlugin } from "./plugins/code-highlight-plugin"
export {
  CODE_HIGHLIGHT_KINDS,
  tokenizeCodeLightweight,
} from "./highlighting/code-highlight-tokenizer"
export { tokenizeMarkdownLightweight } from "./highlighting/markdown-highlight-tokenizer"

// Markdown analysis, conversion, and syntax contract
export {
  findUnsupportedMarkdownFeatures,
  markdownIsWysiwygSafe,
} from "./markdown/markdown-support"
export {
  $convertFromEfmMarkdownString,
  $convertToEfmMarkdownString,
  analyzeEfmMarkdown,
  normalizeEfmSource,
} from "./markdown/efm-document"
export { EIDOS_MARKDOWN_TRANSFORMERS } from "./markdown/markdown-transformers"
export { markdownImageSource } from "./markdown/image-source"
export {
  compileMarkdownPlugins,
  defineMarkdownPlugin,
  defineMarkdownPlugins,
  MARKDOWN_FEATURES,
  MARKDOWN_PLUGIN_API_VERSION,
} from "./plugin-system"
export {
  defineMarkdownProfile,
  eidosMarkdownProfile,
  gfmMarkdownProfile,
  obsidianMarkdownProfile,
  MARKDOWN_PROFILE_API_VERSION,
} from "./profile-system"
export {
  commonmarkPlugin,
  EIDOS_MARKDOWN_PLUGIN_REGISTRY,
  eidosMarkdownPlugins,
  gfmMarkdownPlugins,
  footnotePlugin,
  frontmatterPlugin,
  gfmPlugin,
  highlightPlugin,
  imagePlugin,
  mathPlugin,
  rawHtmlPlugin,
  referencePlugin,
  sourceEditingPlugin,
  obsidianSyntaxPlugin,
  obsidianMarkdownPlugins,
  OBSIDIAN_MARKDOWN_PLUGIN_REGISTRY,
} from "./plugin-system/builtins"
export {
  DEFAULT_MARKDOWN_SHORTCUTS,
  markdownShortcutAriaKeys,
  markdownShortcutConflicts,
  markdownShortcutLabel,
  markdownShortcutLabels,
  matchesMarkdownShortcut,
  resolveMarkdownShortcuts,
} from "./shortcuts/shortcut-registry"
export { useMarkdownShortcuts } from "./shortcuts/shortcut-context"
export {
  applySourceTextareaCommand,
  SOURCE_TEXTAREA_SHORTCUT_IDS,
  sourceTextareaCommandForEvent,
} from "./ui/source-textarea-shortcuts"

// Public Lexical node definitions for advanced consumers
export {
  $createEfmSourceBlockNode,
  $isEfmSourceBlockNode,
  EfmSourceBlockNode,
} from "./nodes/efm-source-block-node"
export {
  $createEfmBlockNode,
  $createEfmInlineNode,
  $isEfmBlockNode,
  $isEfmInlineNode,
  EfmBlockNode,
  EfmInlineNode,
} from "./nodes/efm-semantic-node"

// Public types
export type { CodeHighlightPluginProps } from "./plugins/code-highlight-plugin"
export type {
  CodeHighlightKind,
  CodeHighlightToken,
  CodeHighlightTokenizer,
} from "./highlighting/code-highlight-tokenizer"
export type {
  BuiltInMarkdownShortcutId,
  KeyboardShortcutEvent,
  MarkdownShortcutBinding,
  MarkdownShortcutDefinition,
  MarkdownShortcutId,
  MarkdownShortcutOverrides,
  MarkdownShortcutScope,
  ResolvedMarkdownShortcuts,
  ShortcutDisplayPlatform,
} from "./shortcuts/shortcut-registry"
export type { MarkdownShortcutContextValue } from "./shortcuts/shortcut-context"
export type {
  SourceTextareaCommand,
  SourceTextareaState,
} from "./ui/source-textarea-shortcuts"
export type {
  CompiledMarkdownPluginBehavior,
  CompiledMarkdownPluginInsertion,
  CompiledMarkdownPluginToolbarItem,
  CompiledMarkdownPlugins,
  MarkdownFeatureId,
  MarkdownInsertionContext,
  MarkdownInsertionPlacement,
  MarkdownInsertionSection,
  MarkdownPlugin,
  MarkdownPluginApiVersion,
  MarkdownPluginBehavior,
  MarkdownPluginBehaviorProps,
  MarkdownPluginInsertion,
  MarkdownPluginInsertionExecutionContext,
  MarkdownPluginToolbarItem,
  MarkdownTransformerContribution,
} from "./plugin-system"
export type {
  MarkdownProfile,
  MarkdownProfileApiVersion,
  MarkdownProfileCodec,
} from "./profile-system"
export type {
  EfmDiagnostic,
  EfmInputProfile,
  BuiltInMarkdownProfileId,
  EfmSourcePosition,
  MarkdownEditorImageUrlResolver,
  MarkdownEditorInteractions,
  MarkdownEditorInternalLinkHandler,
  MarkdownEditorInternalLinkRequest,
  MarkdownEditorNavigationTarget,
  MarkdownEditorLabels,
  MarkdownEditorLayout,
  MarkdownEditorPasteImageHandler,
  MarkdownEditorPasteImageRequest,
  MarkdownEditorPastedImage,
  MarkdownEditorProps,
  MarkdownEditorResolveImageUrlRequest,
  MarkdownEditorTheme,
  MarkdownUnsupportedFeature,
  MarkdownUnsupportedFeatureKind,
} from "./types"
export type {
  EfmAnalysisOptions,
  EfmDocumentAnalysis,
  EfmImportSegment,
} from "./markdown/efm-document"
export type { EfmSourceBlockKind } from "./nodes/efm-source-block-node"
export type {
  EfmBlockData,
  EfmBlockKind,
  EfmInlineData,
  EfmInlineKind,
} from "./nodes/efm-semantic-node"
export type { MarkdownBlockBoundary } from "./core/block-boundary"
export type { MarkdownInlineSyntax } from "./core/inline-syntax"
