import {
  $createEfmInlineNode,
  $isEfmInlineNode,
  type EfmInlineData,
} from "../../nodes/efm-semantic-node"
import type { MarkdownInlineSyntax } from "../../core/inline-syntax"
import type { MarkdownSyntaxRange } from "../../core/block-syntax"
import { MARKDOWN_FEATURES } from "../../plugin-system/feature-ids"
import { isEscaped } from "../../markdown/source-escapes"

interface VaultMatch extends MarkdownSyntaxRange {
  data: EfmInlineData
}

function firstUnescaped(value: string, character: string): number {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === character && !isEscaped(value, index)) return index
  }
  return -1
}

function obsidianLinkData(
  source: string,
  body: string,
  embed: boolean
): EfmInlineData | null {
  const aliasOffset = firstUnescaped(body, "|")
  const target = (aliasOffset < 0 ? body : body.slice(0, aliasOffset)).trim()
  if (!target) return null
  const displayText =
    aliasOffset < 0
      ? undefined
      : body
          .slice(aliasOffset + 1)
          .replace(/\\\|/gu, "|")
          .trim()
  const hashOffset = firstUnescaped(target, "#")
  const path = (hashOffset < 0 ? target : target.slice(0, hashOffset)).trim()
  const fragment = hashOffset < 0 ? "" : target.slice(hashOffset + 1).trim()
  const size = embed
    ? (displayText?.match(/^(\d+)(?:x(\d+))?$/u) ?? null)
    : null
  return {
    kind: embed ? "obsidian-embed" : "obsidian-link",
    source,
    target,
    path,
    ...(displayText && !size ? { label: displayText } : {}),
    ...(size ? { width: Number(size[1]) } : {}),
    ...(size?.[2] ? { height: Number(size[2]) } : {}),
    ...(fragment.startsWith("^")
      ? { blockId: fragment.slice(1) }
      : fragment
        ? { heading: fragment }
        : {}),
  }
}

function vaultInlineMatches(
  source: string,
  enabled: (feature: string) => boolean,
  protectedRanges: readonly MarkdownSyntaxRange[]
): VaultMatch[] {
  const replacements: VaultMatch[] = []
  const available = (start: number, end: number) =>
    !isEscaped(source, start) &&
    !protectedRanges.some((range) => start < range.end && end > range.start)

  if (
    enabled(MARKDOWN_FEATURES.obsidianWikilink) ||
    enabled(MARKDOWN_FEATURES.obsidianEmbed)
  ) {
    for (const match of source.matchAll(/(!?)\[\[([^\]\n]+)\]\]/gu)) {
      const start = match.index
      if (start === undefined) continue
      const end = start + match[0].length
      const embed = match[1] === "!"
      if (
        !available(start, end) ||
        (embed
          ? !enabled(MARKDOWN_FEATURES.obsidianEmbed)
          : !enabled(MARKDOWN_FEATURES.obsidianWikilink))
      ) {
        continue
      }
      const data = obsidianLinkData(match[0], match[2], embed)
      if (data) replacements.push({ start, end, data })
    }
  }

  if (enabled(MARKDOWN_FEATURES.obsidianInlineFootnote)) {
    for (const match of source.matchAll(/\^\[([^\]\n]+)\]/gu)) {
      const start = match.index
      if (start === undefined) continue
      const end = start + match[0].length
      if (!available(start, end)) continue
      replacements.push({
        start,
        end,
        data: {
          kind: "obsidian-inline-footnote",
          source: match[0],
          value: match[1],
        },
      })
    }
  }

  if (enabled(MARKDOWN_FEATURES.obsidianComment)) {
    for (const match of source.matchAll(/%%([\s\S]*?)%%/gu)) {
      const start = match.index
      if (start === undefined) continue
      const end = start + match[0].length
      if (!available(start, end)) continue
      replacements.push({
        start,
        end,
        data: {
          kind: "obsidian-comment",
          source: match[0],
          value: match[1],
        },
      })
    }
  }

  if (enabled(MARKDOWN_FEATURES.obsidianBlockId)) {
    for (const match of source.matchAll(
      /(?:^|\s)\^([A-Za-z0-9-]+)(?=\s*$)/gmu
    )) {
      const rawStart = match.index
      if (rawStart === undefined) continue
      const caretOffset = match[0].indexOf("^")
      const start = rawStart + caretOffset
      const end = start + match[0].length - caretOffset
      if (!available(start, end)) continue
      replacements.push({
        start,
        end,
        data: {
          kind: "obsidian-block-id",
          source: source.slice(start, end),
          identifier: match[1],
        },
      })
    }
  }

  if (enabled(MARKDOWN_FEATURES.obsidianTag)) {
    for (const match of source.matchAll(
      /(^|[\s(])#([\p{L}\p{M}\p{S}\p{Emoji_Presentation}_/-]*[\p{L}\p{M}\p{S}\p{Emoji_Presentation}_/-][\p{L}\p{M}\p{N}\p{S}\p{Emoji_Presentation}_/-]*)/gmu
    )) {
      const matchStart = match.index
      if (matchStart === undefined || !/[^0-9]/u.test(match[2])) continue
      const start = matchStart + match[1].length
      const end = start + match[2].length + 1
      if (!available(start, end)) continue
      replacements.push({
        start,
        end,
        data: {
          kind: "obsidian-tag",
          source: source.slice(start, end),
          value: match[2],
        },
      })
    }
  }
  return replacements
}

function syntax(id: string, kind: EfmInlineData["kind"]): MarkdownInlineSyntax {
  return {
    id,
    capturesContent: kind !== "obsidian-tag" && kind !== "obsidian-block-id",
    scan(source, context) {
      const candidates = vaultInlineMatches(
        source,
        (feature) => context.options.syntaxFeatures?.has(feature) ?? true,
        context.protectedRanges
      ).sort((a, b) => a.start - b.start || b.end - a.end)
      const accepted: VaultMatch[] = []
      for (const match of candidates) {
        if (
          !accepted.some(
            (range) => match.start < range.end && match.end > range.start
          )
        )
          accepted.push(match)
      }
      return accepted
        .filter((match) => match.data.kind === kind)
        .map(({ start, end }) => ({ start, end }))
    },
    import(source) {
      const match = vaultInlineMatches(source, () => true, []).find(
        (match) =>
          match.data.kind === kind &&
          match.start === 0 &&
          match.end === source.length
      )
      if (!match) throw new Error(`Invalid source for inline syntax "${id}".`)
      return $createEfmInlineNode(match.data)
    },
    export(node) {
      return $isEfmInlineNode(node) && node.getData().kind === kind
        ? node.getData().source
        : null
    },
  }
}
export const wikilinkSyntax = syntax(
  "markdown.wikilink.syntax",
  "obsidian-link"
)
export const embedSyntax = syntax("markdown.embed.syntax", "obsidian-embed")
export const tagSyntax = syntax("markdown.tag.syntax", "obsidian-tag")
export const commentSyntax = syntax(
  "markdown.comment.syntax",
  "obsidian-comment"
)
export const blockIdSyntax = syntax(
  "markdown.block-id.syntax",
  "obsidian-block-id"
)
export const inlineFootnoteSyntax = syntax(
  "markdown.inline-footnote.syntax",
  "obsidian-inline-footnote"
)
export const vaultInlineSyntax = [
  wikilinkSyntax,
  embedSyntax,
  tagSyntax,
  commentSyntax,
  blockIdSyntax,
  inlineFootnoteSyntax,
] as const
