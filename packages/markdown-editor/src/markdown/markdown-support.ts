import { analyzeEfmMarkdown, type EfmAnalysisOptions } from "./efm-document"
import type {
  EfmDiagnostic,
  MarkdownUnsupportedFeature,
  MarkdownUnsupportedFeatureKind,
} from "../types"

const BLOCKING_DIAGNOSTICS: Readonly<
  Record<string, { kind: MarkdownUnsupportedFeatureKind; label: string }>
> = {
  "efm-frontmatter-duplicate-key": {
    kind: "frontmatter",
    label: "Invalid YAML frontmatter",
  },
  "efm-frontmatter-invalid": {
    kind: "frontmatter",
    label: "Invalid YAML frontmatter",
  },
  "efm-frontmatter-not-mapping": {
    kind: "frontmatter",
    label: "Invalid YAML frontmatter",
  },
  "efm-math-unterminated": {
    kind: "math",
    label: "Unterminated display mathematics",
  },
}

/**
 * Finds malformed EFM that requires a source-preserving block. The editor can
 * still open the rest of the document in WYSIWYG mode and edits that syntax in
 * place instead of switching the whole document to a source editor.
 */
export function findUnsupportedMarkdownFeatures(
  markdown: string,
  options: EfmAnalysisOptions = {}
): MarkdownUnsupportedFeature[] {
  return unsupportedMarkdownFeaturesFromDiagnostics(
    analyzeEfmMarkdown(markdown, options).diagnostics
  )
}

export function unsupportedMarkdownFeaturesFromDiagnostics(
  diagnostics: readonly EfmDiagnostic[]
): MarkdownUnsupportedFeature[] {
  const seen = new Set<MarkdownUnsupportedFeatureKind>()
  const features: MarkdownUnsupportedFeature[] = []
  for (const diagnostic of diagnostics) {
    const unsupported = BLOCKING_DIAGNOSTICS[diagnostic.code]
    if (!unsupported || seen.has(unsupported.kind)) continue
    seen.add(unsupported.kind)
    features.push({
      kind: unsupported.kind,
      label: unsupported.label,
      line: diagnostic.start.line,
    })
  }
  return features
}

export function markdownIsWysiwygSafe(
  markdown: string,
  options: EfmAnalysisOptions = {}
): boolean {
  return findUnsupportedMarkdownFeatures(markdown, options).length === 0
}
