/** Document contracts shared by codecs, source editing, and host integrations. */
import type { MarkdownBlockSyntax } from "./block-syntax"
import type { MarkdownGrammar } from "./markdown-grammar"
import type { MarkdownInlineSyntax } from "./inline-syntax"
export type MarkdownInputMode = "document" | "fragment"

export interface MarkdownSourcePosition {
  line: number
  column: number
}

export interface MarkdownDiagnostic {
  code: string
  severity: "info" | "warning" | "error"
  message: string
  start: MarkdownSourcePosition
  end?: MarkdownSourcePosition
}

export interface MarkdownAnalysisOptions {
  /** Explicit grammar; an empty object means CommonMark without extensions. */
  grammar?: MarkdownGrammar
  /** Explicit grammar registry. Undefined is reserved for legacy codec defaults. */
  blockSyntax?: readonly MarkdownBlockSyntax[]
  inlineSyntax?: readonly MarkdownInlineSyntax[]
  inputProfile?: MarkdownInputMode
  baseUri?: string
  syntaxFeatures?: ReadonlySet<string>
}

export interface MarkdownSourceSegment {
  /** Half-open offsets into normalizedSource, not the original CRLF text. */
  start: number
  end: number
  source: string
  /** Only declare a projection when import actually applies it. */
  projection?: {
    placement: "end"
    /** Whether the projected block can participate in local source editing. */
    sourceEditable: boolean
  }
}

export interface MarkdownDocumentAnalysis {
  diagnostics: MarkdownDiagnostic[]
  /** Input with one leading BOM removed and CRLF/CR converted to LF; no other rewrites. */
  normalizedSource: string
  /** Source order. One segment corresponds to one source-backed root block. */
  segments: MarkdownSourceSegment[]
}
