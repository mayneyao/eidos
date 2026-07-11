import React from "react"
import {
  $applyNodeReplacement,
  DecoratorNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical"

import { MarkdownImageView, useMarkdownRendering } from "../rendering"
import { sanitizeMarkdownHref } from "../url"

export interface WikiLinkPayload {
  target: string
  label?: string
  embed?: boolean
}

export type SerializedWikiLinkNode = Spread<
  WikiLinkPayload & { type: "wiki-link"; version: 1 },
  SerializedLexicalNode
>

const IMAGE_EXTENSIONS = new Set([
  "avif",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
])

export class WikiLinkNode extends DecoratorNode<React.ReactNode> {
  __target: string
  __label?: string
  __embed: boolean

  static getType(): string {
    return "wiki-link"
  }

  static clone(node: WikiLinkNode): WikiLinkNode {
    return new WikiLinkNode(
      {
        target: node.__target,
        label: node.__label,
        embed: node.__embed,
      },
      node.__key
    )
  }

  static importJSON(
    serialized: SerializedLexicalNode & Record<string, unknown>
  ): WikiLinkNode {
    return $createWikiLinkNode({
      embed: serialized.embed === true,
      label:
        typeof serialized.label === "string" ? serialized.label : undefined,
      target: typeof serialized.target === "string" ? serialized.target : "",
    })
  }

  constructor(payload: WikiLinkPayload, key?: NodeKey) {
    super(key)
    this.__target = payload.target
    this.__label = payload.label
    this.__embed = payload.embed ?? false
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement("span")
    const className = config.theme.wikiLink
    if (typeof className === "string") element.className = className
    return element
  }

  updateDOM(): false {
    return false
  }

  exportJSON(): SerializedWikiLinkNode {
    return {
      ...super.exportJSON(),
      embed: this.__embed,
      label: this.__label,
      target: this.__target,
      type: "wiki-link",
      version: 1,
    }
  }

  getTarget(): string {
    return this.getLatest().__target
  }

  getLabel(): string | undefined {
    return this.getLatest().__label
  }

  isEmbed(): boolean {
    return this.getLatest().__embed
  }

  getTextContent(): string {
    const latest = this.getLatest()
    return markdownForWikiLink({
      embed: latest.__embed,
      label: latest.__label,
      target: latest.__target,
    })
  }

  isInline(): true {
    return true
  }

  isKeyboardSelectable(): true {
    return true
  }

  decorate(): React.ReactNode {
    return (
      <WikiLinkView
        embed={this.__embed}
        label={this.__label}
        target={this.__target}
      />
    )
  }
}

function WikiLinkView({ target, label, embed = false }: WikiLinkPayload) {
  const rendering = useMarkdownRendering()
  const kind = embed ? "wiki-embed" : "wiki"

  if (embed && IMAGE_EXTENSIONS.has(extensionOf(target))) {
    const alt = label && !/^\d+(?:x\d+)?$/.test(label) ? label : ""
    return (
      <MarkdownImageView
        alt={alt}
        kind="wiki-embed"
        src={target}
        target={target}
      />
    )
  }

  const href = sanitizeMarkdownHref(
    rendering.resolveWikiLink?.(target) ?? noteTarget(target)
  )
  const visibleLabel = label || displayLabel(target)
  return (
    <a
      className="eidos-md-wiki-link"
      data-eidos-wiki-link="true"
      href={href}
      onClick={(event) => {
        rendering.onLinkActivate?.(
          { href, kind, label: visibleLabel, target },
          event
        )
      }}
    >
      {visibleLabel}
    </a>
  )
}

export function $createWikiLinkNode(payload: WikiLinkPayload): WikiLinkNode {
  return $applyNodeReplacement(new WikiLinkNode(payload))
}

export function $isWikiLinkNode(
  node: LexicalNode | null | undefined
): node is WikiLinkNode {
  return node instanceof WikiLinkNode
}

function markdownForWikiLink(payload: WikiLinkPayload): string {
  return `${payload.embed ? "!" : ""}[[${payload.target}${
    payload.label ? `|${payload.label}` : ""
  }]]`
}

function extensionOf(target: string): string {
  const path = target.split(/[?#]/, 1)[0]
  return path.split(".").pop()?.toLowerCase() ?? ""
}

function noteTarget(target: string): string {
  if (!target || target.startsWith("#")) return target
  const hashIndex = target.indexOf("#")
  const path = hashIndex >= 0 ? target.slice(0, hashIndex) : target
  const fragment = hashIndex >= 0 ? target.slice(hashIndex) : ""
  if (/\.[^/]+$/.test(path)) return target
  return `${path}.md${fragment}`
}

function displayLabel(target: string): string {
  const withoutHeading = target.split("#", 1)[0]
  const name = withoutHeading.split("/").pop() || target.replace(/^#/, "")
  return name.replace(/\.md$/i, "")
}
