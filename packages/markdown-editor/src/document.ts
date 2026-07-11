import { parse as parseYaml } from "yaml"

export interface MarkdownFrontmatter {
  /** Includes the opening/closing delimiter and its original line endings. */
  readonly raw: string
  /** YAML between the delimiters, without normalization. */
  readonly yaml: string
  /** Parsed YAML when valid. The exact raw source remains authoritative. */
  readonly data?: unknown
  readonly parseError?: string
}

export interface MarkdownDocumentParts {
  readonly body: string
  readonly bodyOffset: number
  readonly frontmatter: MarkdownFrontmatter | null
}

/**
 * Splits a leading YAML frontmatter envelope without changing a single source
 * character. A closing delimiter is required so a thematic break at line one
 * is never misclassified as metadata.
 */
export function splitMarkdownDocument(markdown: string): MarkdownDocumentParts {
  const opening = markdown.match(/^(?:\uFEFF)?---[ \t]*\r?\n/)
  if (!opening) {
    return { body: markdown, bodyOffset: 0, frontmatter: null }
  }

  const remainder = markdown.slice(opening[0].length)
  const closingPattern = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/gm
  const closing = closingPattern.exec(remainder)
  if (!closing) {
    return { body: markdown, bodyOffset: 0, frontmatter: null }
  }

  const rawEnd = opening[0].length + (closing.index ?? 0) + closing[0].length
  const raw = markdown.slice(0, rawEnd)
  const yaml = remainder.slice(0, closing.index ?? 0).replace(/\r?\n$/, "")
  let data: unknown
  let parseError: string | undefined
  try {
    data = parseYaml(yaml) as unknown
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error)
  }

  return {
    body: markdown.slice(raw.length),
    bodyOffset: raw.length,
    frontmatter: { raw, yaml, data, parseError },
  }
}
