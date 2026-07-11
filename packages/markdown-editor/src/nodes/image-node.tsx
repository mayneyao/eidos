import React from "react"
import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical"

import { MarkdownImageView } from "../rendering"

export interface MarkdownImagePayload {
  alt: string
  src: string
  title?: string
}

export type SerializedMarkdownImageNode = Spread<
  MarkdownImagePayload & { type: "markdown-image"; version: 1 },
  SerializedLexicalNode
>

export class MarkdownImageNode extends DecoratorNode<React.ReactNode> {
  __src: string
  __alt: string
  __title?: string

  static getType(): string {
    return "markdown-image"
  }

  static clone(node: MarkdownImageNode): MarkdownImageNode {
    return new MarkdownImageNode(
      { src: node.__src, alt: node.__alt, title: node.__title },
      node.__key
    )
  }

  static importJSON(
    serialized: SerializedLexicalNode & Record<string, unknown>
  ): MarkdownImageNode {
    return $createMarkdownImageNode({
      alt: typeof serialized.alt === "string" ? serialized.alt : "",
      src: typeof serialized.src === "string" ? serialized.src : "",
      title:
        typeof serialized.title === "string" ? serialized.title : undefined,
    })
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: (domNode: Node): DOMConversionOutput | null => {
          if (!(domNode instanceof HTMLImageElement)) return null
          return {
            node: $createMarkdownImageNode({
              alt: domNode.alt,
              src: domNode.getAttribute("src") ?? "",
              title: domNode.title || undefined,
            }),
          }
        },
        priority: 1,
      }),
    }
  }

  constructor(payload: MarkdownImagePayload, key?: NodeKey) {
    super(key)
    this.__src = payload.src
    this.__alt = payload.alt
    this.__title = payload.title
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement("span")
    const className = config.theme.image
    if (typeof className === "string") element.className = className
    return element
  }

  updateDOM(): false {
    return false
  }

  exportDOM(): DOMExportOutput {
    const image = document.createElement("img")
    image.src = this.__src
    image.alt = this.__alt
    if (this.__title) image.title = this.__title
    return { element: image }
  }

  exportJSON(): SerializedMarkdownImageNode {
    return {
      ...super.exportJSON(),
      alt: this.__alt,
      src: this.__src,
      title: this.__title,
      type: "markdown-image",
      version: 1,
    }
  }

  getAlt(): string {
    return this.getLatest().__alt
  }

  getSrc(): string {
    return this.getLatest().__src
  }

  getTitle(): string | undefined {
    return this.getLatest().__title
  }

  getTextContent(): string {
    const latest = this.getLatest()
    return markdownForImage({
      alt: latest.__alt,
      src: latest.__src,
      title: latest.__title,
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
      <MarkdownImageView
        alt={this.__alt}
        kind="markdown"
        src={this.__src}
        title={this.__title}
      />
    )
  }
}

export function $createMarkdownImageNode(
  payload: MarkdownImagePayload
): MarkdownImageNode {
  return $applyNodeReplacement(new MarkdownImageNode(payload))
}

export function $isMarkdownImageNode(
  node: LexicalNode | null | undefined
): node is MarkdownImageNode {
  return node instanceof MarkdownImageNode
}

function markdownForImage(payload: MarkdownImagePayload): string {
  const alt = payload.alt.replace(/([\\\]])/g, "\\$1")
  const src = /[\s()]/.test(payload.src) ? `<${payload.src}>` : payload.src
  const title = payload.title
    ? ` "${payload.title.replace(/([\\"])/g, "\\$1")}"`
    : ""
  return `![${alt}](${src}${title})`
}
