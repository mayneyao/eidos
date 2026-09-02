import type { CodeHighlightTokenizer } from "./code-highlight-tokenizer"

export type MarkdownEditorTheme = "light" | "dark"
export type MarkdownEditorLayout = "document" | "embedded"

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
  inlineCode: string
  undo: string
  redo: string
  unsupportedTitle: string
  unsupportedDescription: string
  useSourceEditor: string
}

export interface MarkdownEditorProps {
  /** Stable identity used to reset Lexical when a different document opens. */
  documentKey: string
  /** Canonical Markdown value. Lexical state is never persisted by this package. */
  markdown: string
  onMarkdownChange(markdown: string): void
  onSaveRequest?(markdown: string): void | Promise<void>
  onRequestSourceMode?(): void
  onOpenExternalUrl?(url: string): void | Promise<void>
  onError?(error: Error): void
  onUnsupportedMarkdown?(features: readonly MarkdownUnsupportedFeature[]): void
  labels?: Partial<MarkdownEditorLabels>
  placeholder?: string
  ariaLabel?: string
  className?: string
  theme?: MarkdownEditorTheme
  /** Document keeps reading margins; embedded fills the width owned by its host. */
  layout?: MarkdownEditorLayout
  readOnly?: boolean
  autoFocus?: boolean
  showToolbar?: boolean
  /** Custom fenced-code tokenizer, or false to disable syntax highlighting. */
  codeHighlightTokenizer?: CodeHighlightTokenizer | false
}
