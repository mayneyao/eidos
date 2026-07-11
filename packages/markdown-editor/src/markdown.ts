import { buildEditorFromExtensions } from "@lexical/extension"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/mdast"
import type {
  EditorState,
  LexicalEditor,
  LexicalEditorWithDispose,
} from "lexical"

import {
  findUnsupportedMarkdown,
  type MarkdownCompatibilityIssue,
} from "./compatibility"
import { splitMarkdownDocument, type MarkdownFrontmatter } from "./document"
import {
  createMarkdownExtension,
  postprocessWikiLinks,
  preprocessWikiLinks,
} from "./mdast-extension"

export const MARKDOWN_IMPORT_TAG = "eidos-markdown-import"

export interface MarkdownSourceSnapshot {
  /** The exact UTF-16 source provided by the caller. */
  readonly source: string
  /** Stable Markdown produced from the imported Lexical semantics. */
  readonly canonical: string
  /** Exact body source imported into Lexical. */
  readonly bodySource: string
  /** Canonical representation of the Lexical body. */
  readonly canonicalBody: string
  /** Exact leading YAML envelope, kept outside the rich-text AST. */
  readonly frontmatter: MarkdownFrontmatter | null
}

export interface MarkdownExport {
  /** Exact source when semantics are unchanged; canonical Markdown otherwise. */
  readonly markdown: string
  /** Canonical Markdown for the current Lexical state. */
  readonly canonical: string
  /** Whether `markdown` is the byte-for-byte caller source. */
  readonly sourcePreserved: boolean
}

export interface MarkdownCompatibility {
  /** Import-export-import converges on one canonical representation. */
  readonly semanticRoundTripStable: boolean
  /** Source already uses the canonical spelling and whitespace. */
  readonly sourceIsCanonical: boolean
  readonly source: string
  readonly canonical: string
  /** Positive findings for syntax the node set cannot safely edit. */
  readonly issues: ReadonlyArray<MarkdownCompatibilityIssue>
  /** True only when no known Markdown semantics would be dropped on edit. */
  readonly safeToEdit: boolean
}

export interface CreateMarkdownEditorOptions {
  namespace?: string
  onError?: (error: Error) => void
}

export function createMarkdownHeadlessEditor(
  options: CreateMarkdownEditorOptions = {}
): LexicalEditorWithDispose {
  return buildEditorFromExtensions(
    createMarkdownExtension({
      editable: false,
      namespace: options.namespace ?? "eidos-markdown-editor-headless",
      onError: options.onError,
      withShortcuts: false,
    })
  )
}

/** Must run inside `editor.update(...)` or an editor-state initialization. */
export function $importMarkdown(markdown: string): void {
  $convertFromMarkdownString(
    preprocessWikiLinks(normalizeLineEndings(markdown))
  )
}

/** Must run inside `editorState.read(...)` or `editor.update(...)`. */
export function $exportMarkdown(): string {
  return postprocessWikiLinks($convertToMarkdownString())
}

/** Creates an exact-source snapshot using the package-owned mdast runtime. */
export function markdownToSourceSnapshot(
  markdown: string,
  options: CreateMarkdownEditorOptions = {}
): MarkdownSourceSnapshot {
  const editor = createMarkdownHeadlessEditor(options)
  const document = splitMarkdownDocument(markdown)
  let canonicalBody = ""
  try {
    editor.update(
      () => {
        $importMarkdown(document.body)
        canonicalBody = $exportMarkdown()
      },
      { discrete: true, tag: MARKDOWN_IMPORT_TAG }
    )

    return {
      source: markdown,
      canonical: `${document.frontmatter?.raw ?? ""}${canonicalBody}`,
      bodySource: document.body,
      canonicalBody,
      frontmatter: document.frontmatter,
    }
  } finally {
    editor.dispose()
  }
}

/** Replaces an editor's document and returns the matching source snapshot. */
export function setEditorMarkdown(
  editor: LexicalEditor,
  markdown: string
): MarkdownSourceSnapshot {
  const document = splitMarkdownDocument(markdown)
  let canonicalBody = ""

  editor.update(
    () => {
      $importMarkdown(document.body)
      canonicalBody = $exportMarkdown()
    },
    { discrete: true, tag: MARKDOWN_IMPORT_TAG }
  )

  return {
    source: markdown,
    canonical: `${document.frontmatter?.raw ?? ""}${canonicalBody}`,
    bodySource: document.body,
    canonicalBody,
    frontmatter: document.frontmatter,
  }
}

/** Returns stable canonical Markdown without source-spelling preservation. */
function editorStateToCanonicalMarkdown(
  editorState: EditorState,
  editor: LexicalEditor
): string {
  return editorState.read(() => $exportMarkdown(), { editor })
}

/**
 * Exports a state while preserving the caller's exact source when its Lexical
 * semantics have not changed. Once edited, the result is canonical Markdown.
 */
export function editorStateToMarkdown(
  editorState: EditorState,
  editor: LexicalEditor,
  source?: MarkdownSourceSnapshot | null
): MarkdownExport {
  const canonical = editorStateToCanonicalMarkdown(editorState, editor)
  const sourcePreserved = source?.canonicalBody === canonical
  const canonicalDocument = `${source?.frontmatter?.raw ?? ""}${canonical}`

  return {
    markdown: sourcePreserved ? source.source : canonicalDocument,
    canonical: canonicalDocument,
    sourcePreserved,
  }
}

export function normalizeMarkdown(markdown: string): string {
  return markdownToSourceSnapshot(markdown).canonical
}

/**
 * Reports the two guarantees this package can prove. Rich-text editing cannot
 * preserve arbitrary Markdown spelling after a semantic change, so callers
 * should retain the source snapshot and inspect `sourcePreserved` on export.
 */
export function inspectMarkdownCompatibility(
  markdown: string,
  knownCanonical?: string
): MarkdownCompatibility {
  const first = knownCanonical ?? normalizeMarkdown(markdown)
  const second = normalizeMarkdown(first)
  const issues = findUnsupportedMarkdown(markdown)

  return {
    semanticRoundTripStable: first === second,
    sourceIsCanonical: markdown === first,
    source: markdown,
    canonical: first,
    issues,
    safeToEdit: issues.length === 0 && first === second,
  }
}

function normalizeLineEndings(markdown: string): string {
  return markdown.replace(/\r\n?/g, "\n")
}
