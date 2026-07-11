import { configExtension, HorizontalRuleExtension } from "@lexical/extension"
import {
  MdastCommonMarkExtension,
  MdastExtension,
  MdastGfmExtension,
  MdastImportExtension,
  MdastShadowRootQuoteExtension,
  MdastShortcutsExtension,
  type MdastExportHandler,
  type MdastImportHandler,
} from "@lexical/mdast"
import type { Image, ImageReference } from "mdast"
import {
  defineExtension,
  type EditorThemeClasses,
  type InitialEditorStateType,
  type LexicalEditor,
} from "lexical"

import {
  $createMarkdownImageNode,
  $isMarkdownImageNode,
  MarkdownImageNode,
} from "./nodes/image-node"
import {
  $createWikiLinkNode,
  $isWikiLinkNode,
  WikiLinkNode,
  type WikiLinkPayload,
} from "./nodes/wiki-link-node"

const WIKI_LINK_SCHEME = "eidos-wiki:"
const WIKI_EMBED_SCHEME = "eidos-wiki-embed:"

const $importImage: MdastImportHandler<Image> = (node) => {
  const wiki = decodeWikiPlaceholder(node.url)
  return wiki
    ? $createWikiLinkNode(wiki)
    : $createMarkdownImageNode({
        alt: node.alt ?? "",
        src: node.url,
        title: node.title ?? undefined,
      })
}

const $importImageReference: MdastImportHandler<ImageReference> = (
  node,
  context
) => {
  const definition = context.getDefinition(node.identifier)
  if (!definition) return null
  const wiki = decodeWikiPlaceholder(definition.url)
  if (wiki) return $createWikiLinkNode(wiki)
  return $createMarkdownImageNode({
    alt: node.alt ?? "",
    src: definition.url,
    title: definition.title ?? undefined,
  })
}

const $exportImage: MdastExportHandler<MarkdownImageNode> = (node) =>
  $isMarkdownImageNode(node)
    ? {
        alt: node.getAlt(),
        title: node.getTitle() ?? null,
        type: "image",
        url: node.getSrc(),
      }
    : null

const $exportWikiLink: MdastExportHandler<WikiLinkNode> = (node) => {
  if (!$isWikiLinkNode(node)) return null
  const payload: WikiLinkPayload = {
    embed: node.isEmbed(),
    label: node.getLabel(),
    target: node.getTarget(),
  }
  return {
    alt: payload.label || displayWikiLabel(payload.target),
    title: null,
    type: "image",
    url: encodeWikiPlaceholder(payload),
  }
}

export const EIDOS_MDAST_SYNTAX_EXTENSION = /* @__PURE__ */ defineExtension({
  dependencies: [
    /* @__PURE__ */ configExtension(MdastImportExtension, {
      exportRules: [
        { $export: $exportImage, type: "markdown-image" },
        { $export: $exportWikiLink, type: "wiki-link" },
      ],
      importRules: [
        { $import: $importImage, type: "image" },
        { $import: $importImageReference, type: "imageReference" },
      ],
    }),
  ],
  name: "@eidos.space/markdown-editor/MdastSyntax",
  nodes: [MarkdownImageNode, WikiLinkNode],
})

/** Shared parser/serializer graph used by every editor created by the package. */
export const EIDOS_MARKDOWN_DOCUMENT_EXTENSION =
  /* @__PURE__ */ defineExtension({
    dependencies: [
      MdastCommonMarkExtension,
      MdastGfmExtension,
      MdastExtension,
      MdastShadowRootQuoteExtension,
      EIDOS_MDAST_SYNTAX_EXTENSION,
    ],
    name: "@eidos.space/markdown-editor/Document",
  })

/** Interactive graph adds shortcuts driven by the exact same mdast grammar. */
export const EIDOS_MARKDOWN_EDITOR_EXTENSION =
  /* @__PURE__ */ defineExtension({
    dependencies: [
      EIDOS_MARKDOWN_DOCUMENT_EXTENSION,
      MdastShortcutsExtension,
      HorizontalRuleExtension,
    ],
    name: "@eidos.space/markdown-editor/Editor",
  })

export interface MarkdownExtensionOptions {
  editable?: boolean
  initialEditorState?: InitialEditorStateType
  namespace?: string
  onError?: (error: Error) => void
  theme?: EditorThemeClasses
  withShortcuts?: boolean
}

export function createMarkdownExtension({
  editable = true,
  initialEditorState,
  namespace = "eidos-markdown-editor",
  onError,
  theme,
  withShortcuts = true,
}: MarkdownExtensionOptions = {}) {
  return defineExtension({
    $initialEditorState: initialEditorState,
    dependencies: [
      withShortcuts
        ? EIDOS_MARKDOWN_EDITOR_EXTENSION
        : EIDOS_MARKDOWN_DOCUMENT_EXTENSION,
    ],
    editable,
    name: `${namespace}/Root` as const,
    namespace,
    onError: (error: Error, _editor: LexicalEditor) => {
      if (onError) onError(error)
      else throw error
    },
    theme,
  })
}

export function preprocessWikiLinks(markdown: string): string {
  const masked = maskMarkdownSyntax(markdown)
  const replacements: Array<{ end: number; start: number; value: string }> = []
  const pattern = /(?<!\\)(!?)\[\[([^\]\n]+)\]\]/g

  for (const match of masked.matchAll(pattern)) {
    const start = match.index ?? 0
    const rawContent = markdown.slice(
      start + (match[1] === "!" ? 3 : 2),
      start + match[0].length - 2
    )
    const [rawTarget, rawLabel] = splitUnescapedPipe(rawContent)
    const target = unescapeWikiPart(rawTarget.trim())
    if (!target) continue
    const label = rawLabel
      ? unescapeWikiPart(rawLabel.trim()) || undefined
      : undefined
    const payload: WikiLinkPayload = {
      embed: match[1] === "!",
      label,
      target,
    }
    const visibleLabel = escapeMarkdownLabel(label || displayWikiLabel(target))
    replacements.push({
      end: start + match[0].length,
      start,
      value: `![${visibleLabel}](${encodeWikiPlaceholder(payload)})`,
    })
  }

  let output = markdown
  for (const replacement of replacements.reverse()) {
    output =
      output.slice(0, replacement.start) +
      replacement.value +
      output.slice(replacement.end)
  }
  return output
}

export function postprocessWikiLinks(markdown: string): string {
  return markdown.replace(
    /!?\[[^\n]*?\]\((?:<)?(eidos-wiki(?:-embed)?:[^)>\s]+)(?:>)?\)/g,
    (full, url: string) => {
      const payload = decodeWikiPlaceholder(url)
      return payload ? markdownForWikiPayload(payload) : full
    }
  )
}

function encodeWikiPlaceholder(payload: WikiLinkPayload): string {
  const scheme = payload.embed ? WIKI_EMBED_SCHEME : WIKI_LINK_SCHEME
  const encoded = encodeURIComponent(JSON.stringify(payload)).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  )
  return `${scheme}${encoded}`
}

function decodeWikiPlaceholder(url: string): WikiLinkPayload | null {
  const embed = url.startsWith(WIKI_EMBED_SCHEME)
  const prefix = embed ? WIKI_EMBED_SCHEME : WIKI_LINK_SCHEME
  if (!url.startsWith(prefix)) return null
  try {
    const value: unknown = JSON.parse(
      decodeURIComponent(url.slice(prefix.length))
    )
    if (
      typeof value !== "object" ||
      value === null ||
      !("target" in value) ||
      typeof value.target !== "string" ||
      !value.target
    ) {
      return null
    }
    const label =
      "label" in value && typeof value.label === "string"
        ? value.label
        : undefined
    return { target: value.target, label, embed }
  } catch {
    return null
  }
}

function markdownForWikiPayload(payload: WikiLinkPayload): string {
  return `${payload.embed ? "!" : ""}[[${escapeWikiPart(payload.target)}${
    payload.label ? `|${escapeWikiPart(payload.label)}` : ""
  }]]`
}

function splitUnescapedPipe(value: string): [string, string?] {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "|") continue
    let escapes = 0
    for (
      let cursor = index - 1;
      cursor >= 0 && value[cursor] === "\\";
      cursor -= 1
    ) {
      escapes += 1
    }
    if (escapes % 2 === 0) {
      return [value.slice(0, index), value.slice(index + 1)]
    }
  }
  return [value]
}

function escapeWikiPart(value: string): string {
  return value.replace(/([\\|])/g, "\\$1")
}

function unescapeWikiPart(value: string): string {
  return value.replace(/\\([\\|])/g, "$1")
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/([\\\]])/g, "\\$1")
}

function displayWikiLabel(target: string): string {
  const withoutHeading = target.split("#", 1)[0]
  const name = withoutHeading.split("/").pop() || target.replace(/^#/, "")
  return name.replace(/\.md$/i, "")
}

function maskMarkdownSyntax(markdown: string): string {
  // RegExp indices are UTF-16 code-unit offsets. split("") deliberately uses
  // the same indexing so astral characters before a match cannot shift masks.
  const characters = markdown.split("")
  const maskRange = (start: number, length: number) => {
    for (let index = start; index < start + length; index += 1) {
      if (characters[index] !== "\n") characters[index] = "\uE000"
    }
  }
  const maskMatches = (pattern: RegExp) => {
    for (const match of markdown.matchAll(pattern)) {
      maskRange(match.index ?? 0, match[0].length)
    }
  }

  maskMatches(
    /(^|\n) {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\2[ \t]*(?=\n|$)|$)/g
  )
  maskMatches(/`+[^`\n]*`+/g)
  maskMatches(/!?\[[^\]\n]*\]\([^\n)]*(?:\([^\n)]*\)[^\n)]*)*\)/g)
  maskMatches(/\[[^\]\n]+\]\[[^\]\n]*\]/g)
  return characters.join("")
}
