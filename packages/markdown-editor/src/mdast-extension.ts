import { configExtension, HorizontalRuleExtension } from "@lexical/extension"
import {
  CodePrismExtension,
  PrismTokenizer,
  type Tokenizer,
} from "@lexical/code-prism"
import { $isAutoLinkNode, AutoLinkNode } from "@lexical/link"
import {
  $isListItemNode,
  $isListNode,
  type ListNode,
  type SerializedListNode,
} from "@lexical/list"
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
import type { Image, ImageReference, Link, List, ListItem, Text } from "mdast"
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
const EMPTY_TASK_PLACEHOLDER = "\uE000EIDOSEMPTYTASK\uE001"
const MARKDOWN_PRISM_TOKENIZER: Tokenizer = {
  ...PrismTokenizer,
  // An unlabeled fence must stay unlabeled after a Markdown round-trip.
  defaultLanguage: null,
}

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

const $importEmptyTaskPlaceholder: MdastImportHandler<Text> = (node, context) =>
  context.createText(node.value.split(EMPTY_TASK_PLACEHOLDER).join(""))

const $exportImage: MdastExportHandler<MarkdownImageNode> = (node) =>
  $isMarkdownImageNode(node)
    ? {
        alt: node.getAlt(),
        title: node.getTitle() ?? null,
        type: "image",
        url: node.getSrc(),
      }
    : null

const $exportAutoLink: MdastExportHandler<AutoLinkNode> = (node, context) =>
  $isAutoLinkNode(node)
    ? ({
        children: context.exportInline(node),
        title: node.getTitle() ?? null,
        type: "link",
        url: node.getURL(),
      } satisfies Link)
    : null

const $exportListWithEmptyTasks: MdastExportHandler<ListNode> = (
  node,
  context
) => {
  if (!$isListNode(node)) return null
  const listType = node.getListType()

  const list: List = {
    children: [],
    ordered: listType === "number",
    spread: false,
    start: listType === "number" ? node.getStart() : undefined,
    type: "list",
  }
  const syntax = (
    node.exportJSON() as SerializedListNode & {
      $?: {
        mdastListMarker?: unknown
        mdastOrderedMarker?: unknown
      }
    }
  ).$
  if (
    listType === "number" &&
    (syntax?.mdastOrderedMarker === "." || syntax?.mdastOrderedMarker === ")")
  ) {
    list.data = { mdastBulletOrdered: syntax.mdastOrderedMarker }
  } else if (
    syntax?.mdastListMarker === "-" ||
    syntax?.mdastListMarker === "*" ||
    syntax?.mdastListMarker === "+"
  ) {
    list.data = { mdastBullet: syntax.mdastListMarker }
  }
  let previousItem: ListItem | null = null

  for (const child of node.getChildren()) {
    if (!$isListItemNode(child) || !context.isIncluded(child)) continue
    const firstChild = child.getFirstChild()
    if (child.getChildrenSize() === 1 && $isListNode(firstChild)) {
      const nested = context
        .exportChildren(child)
        .find((candidate) => candidate.type === "list")
      if (!nested) continue
      if (previousItem) previousItem.children.push(nested)
      else {
        list.children.push({
          children: [nested],
          spread: false,
          type: "listItem",
        })
      }
      continue
    }

    const blocks = context.exportBlocks(child)
    const hasContent = blocks.some(
      (block) => block.type !== "paragraph" || block.children.length > 0
    )
    const item: ListItem = {
      checked: listType === "check" ? (child.getChecked() ?? false) : null,
      children:
        listType === "check" && !hasContent
          ? [
              {
                // mdast-util-gfm-task-list-item omits the checkbox when an
                // empty paragraph serializes to a bare list marker. This
                // export-only sentinel is stripped immediately afterward.
                children: [{ type: "text", value: EMPTY_TASK_PLACEHOLDER }],
                type: "paragraph",
              },
            ]
          : blocks,
      spread: false,
      type: "listItem",
    }
    list.children.push(item)
    previousItem = item
  }

  return list
}

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
        { $export: $exportListWithEmptyTasks, type: "list" },
        { $export: $exportAutoLink, type: "autolink" },
        { $export: $exportImage, type: "markdown-image" },
        { $export: $exportWikiLink, type: "wiki-link" },
      ],
      importRules: [
        { $import: $importEmptyTaskPlaceholder, type: "text" },
        { $import: $importImage, type: "image" },
        { $import: $importImageReference, type: "imageReference" },
      ],
    }),
  ],
  name: "@eidos.space/markdown-editor/MdastSyntax",
  nodes: [AutoLinkNode, MarkdownImageNode, WikiLinkNode],
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
      /* @__PURE__ */ configExtension(CodePrismExtension, {
        tokenizer: MARKDOWN_PRISM_TOKENIZER,
      }),
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
  return addEmptyTaskPlaceholders(output)
}

export function postprocessWikiLinks(markdown: string): string {
  return markdown
    .replace(
      /!?\[[^\n]*?\]\((?:<)?(eidos-wiki(?:-embed)?:[^)>\s]+)(?:>)?\)/g,
      (full, url: string) => {
        const payload = decodeWikiPlaceholder(url)
        return payload ? markdownForWikiPayload(payload) : full
      }
    )
    .split(EMPTY_TASK_PLACEHOLDER)
    .join("")
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

function addEmptyTaskPlaceholders(markdown: string): string {
  const masked = maskMarkdownSyntax(markdown)
  const pattern = /^([ \t]*[-*+][ \t]+\[[ xX]\])[ \t]*$/gm
  return markdown.replace(pattern, (match, marker: string, offset: number) => {
    const maskedLine = masked.slice(offset, offset + match.length)
    if (maskedLine.includes("\uE000")) return match
    return `${marker} ${EMPTY_TASK_PLACEHOLDER}`
  })
}
