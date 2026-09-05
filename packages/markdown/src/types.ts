import type { CodeHighlightTokenizer } from "./highlighting/code-highlight-tokenizer"
import type { MarkdownPlugin } from "./plugin-system/plugin-api"
import type { MarkdownProfile } from "./profile-system/profile-api"
import type { MarkdownShortcutOverrides } from "./shortcuts/shortcut-registry"
import type {
  MarkdownInputMode,
  MarkdownSourcePosition,
  MarkdownDiagnostic,
} from "./core/document-contract"

export type MarkdownEditorTheme = "light" | "dark"
export type MarkdownEditorLayout = "document" | "embedded"
export type EfmInputProfile = MarkdownInputMode
export type BuiltInMarkdownProfileId = "eidos" | "obsidian" | "gfm"

export interface MarkdownEditorInternalLinkRequest {
  documentKey: string
  /** Raw internal-link destination before an optional display alias. */
  target: string
  /** Note or attachment path, resolved by the host. Empty for this document. */
  path: string
  heading?: string
  blockId?: string
  displayText?: string
  embed: boolean
  syntax: "wikilink" | "markdown"
}

export type MarkdownEditorInternalLinkHandler = (
  request: MarkdownEditorInternalLinkRequest
) => void | Promise<void>

export interface MarkdownEditorNavigationTarget {
  /** Changes whenever the host requests navigation to the same target again. */
  requestId: string | number
  heading?: string
  blockId?: string
}

export interface MarkdownEditorPasteImageRequest {
  /** Stable identity of the document receiving the paste. */
  documentKey: string
  /** Clipboard image supplied by the browser. */
  file: File
  /** Zero-based position when one paste contains multiple images. */
  index: number
  /** Total number of images in this paste operation. */
  total: number
  /** Aborted when the editor unmounts before the host finishes persistence. */
  signal: AbortSignal
}

export interface MarkdownEditorPastedImage {
  /** Stable destination serialized into canonical Markdown. */
  markdownUrl: string
  /** Optional presentation URL for the current page, commonly a blob URL. */
  displayUrl?: string
  /** Falls back to the clipboard file name when omitted. */
  alt?: string
  title?: string
}

export type MarkdownEditorPasteImageHandler = (
  request: MarkdownEditorPasteImageRequest
) =>
  | MarkdownEditorPastedImage
  | null
  | Promise<MarkdownEditorPastedImage | null>

export interface MarkdownEditorResolveImageUrlRequest {
  documentKey: string
  /** Canonical destination read from Markdown. */
  markdownUrl: string
  /** Aborted when the image changes or its view unmounts. */
  signal: AbortSignal
}

export type MarkdownEditorImageUrlResolver = (
  request: MarkdownEditorResolveImageUrlRequest
) => string | null | Promise<string | null>

export type EfmSourcePosition = MarkdownSourcePosition
export type EfmDiagnostic = MarkdownDiagnostic

export type MarkdownUnsupportedFeatureKind =
  | "frontmatter"
  | "image"
  | "html"
  | "footnote"
  | "definition"
  | "math"
  | "directive"

export interface MarkdownUnsupportedFeature {
  kind: MarkdownUnsupportedFeatureKind
  label: string
  line: number
}

export interface MarkdownEditorLabels {
  paragraph: string
  heading1: string
  heading2: string
  heading3: string
  quote: string
  codeBlock: string
  bulletList: string
  numberedList: string
  checkList: string
  bold: string
  italic: string
  strikethrough: string
  highlight: string
  inlineCode: string
  undo: string
  redo: string
  saveBlock: string
  cancelBlockEdit: string
  insertBlock: string
  insertInline: string
  addBlockBelow: string
  dragBlock: string
  insert: string
  basicBlocks: string
  extendedBlocks: string
  mathBlock: string
  inlineMath: string
  frontmatter: string
  image: string
  footnote: string
  rawHtml: string
  table: string
  divider: string
  frontmatterAlreadyExists: string
  backToInsertMenu: string
  emptyMathBlock: string
  emptyImageBlock: string
  frontmatterYaml: string
  footnoteText: string
  htmlSource: string
  formulaSource: string
  filterBlocks: string
  filterInline: string
  noMatchingBlocks: string
  noMatchingInlineCommands: string
  insertMenuHint: string
  inlineMenuHint: string
}

export interface MarkdownEditorInteractions {
  /** Floating text formatting toolbar. Does not disable formatting shortcuts. */
  toolbar?: boolean
  /** Plus control and slash insertion menus, including inline insertions. */
  insertMenu?: boolean
  /** Block drag handle and its keyboard sorting controls. */
  blockDrag?: boolean
  /** Block marquee and block selection shortcuts; native text selection remains. */
  blockSelection?: boolean
}

export interface MarkdownEditorProps {
  /** Stable identity used to reset Lexical when a different document opens. */
  documentKey: string
  /** Canonical Markdown value. Lexical state is never persisted by this package. */
  markdown: string
  onMarkdownChange(markdown: string): void
  onSaveRequest?(markdown: string): void | Promise<void>
  onOpenExternalUrl?(url: string): void | Promise<void>
  /** Opens an Obsidian wikilink after the editor has parsed its target. */
  onOpenInternalLink?: MarkdownEditorInternalLinkHandler
  /** Scrolls a newly opened document to an Obsidian heading or block target. */
  navigationTarget?: MarkdownEditorNavigationTarget
  /** Persists a pasted clipboard image and returns its canonical Markdown URL. */
  onPasteImage?: MarkdownEditorPasteImageHandler
  /** Resolves a canonical image URL to a safe URL usable by the current DOM. */
  resolveImageUrl?: MarkdownEditorImageUrlResolver
  onError?(error: Error): void
  onEfmDiagnostics?(diagnostics: readonly EfmDiagnostic[]): void
  onUnsupportedMarkdown?(features: readonly MarkdownUnsupportedFeature[]): void
  labels?: Partial<MarkdownEditorLabels>
  placeholder?: string
  ariaLabel?: string
  className?: string
  theme?: MarkdownEditorTheme
  /** Document keeps reading margins; embedded fills the width owned by its host. */
  layout?: MarkdownEditorLayout
  /** EFM document enables offset-zero frontmatter; fragment treats it as Markdown. */
  inputProfile?: EfmInputProfile
  /** Base used to resolve relative links. Without one they remain inactive. */
  baseUri?: string
  readOnly?: boolean
  autoFocus?: boolean
  /** Legacy default for toolbar, insertion menu and drag controls. */
  showToolbar?: boolean
  /** Independent interaction switches. Explicit values override legacy defaults. */
  interactions?: MarkdownEditorInteractions
  /** Custom fenced-code tokenizer, or false to disable syntax highlighting. */
  codeHighlightTokenizer?: CodeHighlightTokenizer | false
  /** Override or disable package-owned keyboard shortcuts by stable shortcut ID. */
  shortcuts?: MarkdownShortcutOverrides
  /** Immutable syntax and behavior plugins. Defaults to the complete EFM profile. */
  plugins?: readonly MarkdownPlugin[]
  /**
   * Mutually exclusive document syntax profile. Defaults to Eidos EFM.
   * Cannot be combined with `plugins`; use a custom profile when the codec
   * itself must change.
   */
  profile?: BuiltInMarkdownProfileId | MarkdownProfile
  /** Composable preset. Alias of profile; do not provide both. */
  preset?: BuiltInMarkdownProfileId | MarkdownProfile
}
