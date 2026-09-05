export type EfmInlineKind =
  | "autolink"
  | "denied-link"
  | "footnote-reference"
  | "image"
  | "math"
  | "reference-link"
  | "obsidian-link"
  | "obsidian-embed"
  | "obsidian-block-id"
  | "obsidian-comment"
  | "obsidian-inline-footnote"
  | "obsidian-tag"

export interface EfmInlineData {
  kind: EfmInlineKind
  source: string
  value?: string
  url?: string
  resolvedUrl?: string
  alt?: string
  title?: string
  label?: string
  labelHtml?: string
  identifier?: string
  number?: number
  referenceId?: string
  target?: string
  path?: string
  heading?: string
  blockId?: string
  width?: number
  height?: number
  obsidian?: boolean
}

export type EfmBlockKind =
  | "commonmark-container"
  | "footnote-definition"
  | "frontmatter"
  | "image"
  | "math"
  | "raw-html"
  | "reference-definition"
  | "obsidian-callout"

export interface EfmBlockData {
  kind: EfmBlockKind
  source: string
  value?: string
  previewHtml?: string
  label?: string
  identifier?: string
  number?: number
  referenceIds?: string[]
  url?: string
  resolvedUrl?: string
  alt?: string
  title?: string
  width?: number
  height?: number
  obsidian?: boolean
  calloutType?: string
  calloutTitle?: string
  calloutFold?: "+" | "-"
}
