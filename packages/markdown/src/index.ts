// Editor surface
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
  commonmarkPlugin,
  EIDOS_MARKDOWN_PLUGIN_REGISTRY,
  eidosMarkdownPlugins,
  footnotePlugin,
  frontmatterPlugin,
  gfmPlugin,
  highlightPlugin,
  imagePlugin,
  mathPlugin,
  rawHtmlPlugin,
  referencePlugin,
  sourceEditingPlugin,
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
  EfmDiagnostic,
  EfmInputProfile,
  EfmSourcePosition,
  MarkdownEditorImageUrlResolver,
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
