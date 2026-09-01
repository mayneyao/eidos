import type {
  MarkdownUnsupportedFeature,
  MarkdownUnsupportedFeatureKind,
} from "./types"

interface UnsupportedPattern {
  kind: MarkdownUnsupportedFeatureKind
  label: string
  expression: RegExp
}

const UNSUPPORTED_PATTERNS: readonly UnsupportedPattern[] = [
  {
    kind: "frontmatter",
    label: "YAML frontmatter",
    expression: /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u,
  },
  {
    kind: "image",
    label: "Image",
    expression: /!\[[^\]]*\]\([^\n)]+(?:\s+["'][^"']*["'])?\)/u,
  },
  {
    kind: "html",
    label: "Raw HTML",
    expression:
      /<(?:address|article|aside|base|blockquote|body|button|canvas|details|dialog|div|embed|fieldset|figure|footer|form|frame|frameset|head|header|hgroup|html|iframe|legend|link|main|menu|menuitem|nav|noframes|object|ol|optgroup|option|p|param|script|search|section|style|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul|video)\b/iu,
  },
  {
    kind: "footnote",
    label: "Footnote",
    expression: /\[\^[^\]\n]+\](?::|\b)/u,
  },
  {
    kind: "definition",
    label: "Reference definition",
    expression: /^\s{0,3}\[[^\]^\n]+\]:\s+\S+/mu,
  },
  {
    kind: "math",
    label: "Math block",
    expression: /(?:^|\r?\n)\s*\$\$[\s\S]*?\$\$\s*(?:\r?\n|$)/u,
  },
  {
    kind: "directive",
    label: "Markdown directive",
    expression: /(?:^|\r?\n)\s*:::{1,2}[A-Za-z][\w-]*/u,
  },
]

function lineAt(source: string, index: number): number {
  let line = 1
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source.charCodeAt(cursor) === 10) line += 1
  }
  return line
}

/**
 * Finds syntax that the current Lexical transformer set cannot safely preserve.
 * Hosts should keep these documents in their source editor until a transformer
 * or raw passthrough node exists.
 */
export function findUnsupportedMarkdownFeatures(
  markdown: string
): MarkdownUnsupportedFeature[] {
  const features: MarkdownUnsupportedFeature[] = []
  for (const pattern of UNSUPPORTED_PATTERNS) {
    const match = pattern.expression.exec(markdown)
    if (!match || match.index === undefined) continue
    features.push({
      kind: pattern.kind,
      label: pattern.label,
      line: lineAt(markdown, match.index),
    })
  }
  return features.sort((left, right) => left.line - right.line)
}

export function markdownIsWysiwygSafe(markdown: string): boolean {
  return findUnsupportedMarkdownFeatures(markdown).length === 0
}
