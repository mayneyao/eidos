import type { CodeHighlightTokenizer } from "./highlighting/code-highlight-tokenizer"
import type { MarkdownShortcutOverrides } from "./shortcuts/shortcut-registry"

export type MarkdownEditorTheme = "light" | "dark"
export type MarkdownEditorLayout = "document" | "embedded"
export type EfmInputProfile = "document" | "fragment"

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

export interface EfmSourcePosition {
  line: number
  column: number
}

export interface EfmDiagnostic {
  code: string
  severity: "info" | "warning" | "error"
  message: string
  start: EfmSourcePosition
  end?: EfmSourcePosition
}

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
  editBlock: string
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
  imageUrl: string
  imageAlt: string
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

export interface MarkdownEditorProps {
  /** Stable identity used to reset Lexical when a different document opens. */
  documentKey: string
  /** Canonical Markdown value. Lexical state is never persisted by this package. */
  markdown: string
  onMarkdownChange(markdown: string): void
  onSaveRequest?(markdown: string): void | Promise<void>
  onOpenExternalUrl?(url: string): void | Promise<void>
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
  showToolbar?: boolean
  /** Custom fenced-code tokenizer, or false to disable syntax highlighting. */
  codeHighlightTokenizer?: CodeHighlightTokenizer | false
  /** Override or disable package-owned keyboard shortcuts by stable shortcut ID. */
  shortcuts?: MarkdownShortcutOverrides
}
