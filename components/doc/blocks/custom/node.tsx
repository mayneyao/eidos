import { ReactNode } from "react"
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import {
  DecoratorNode,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical"

import { CustomBlockComponent } from "./component"

export type SerializedCustomBlockNode = Spread<
  {
    url: string
    height?: number
  },
  SerializedLexicalNode
>

export class CustomBlockNode extends DecoratorNode<ReactNode> {
  __url: string
  __height?: number

  static getType(): string {
    return "custom"
  }

  static clone(node: CustomBlockNode): CustomBlockNode {
    return new CustomBlockNode(node.__url, node.__height, node.__key)
  }

  constructor(url: string, height?: number, key?: NodeKey) {
    super(key)
    this.__url = url
    this.__height = height
  }

  setUrl(url: string): void {
    const writable = this.getWritable()
    writable.__url = url
  }

  setHeight(height?: number): void {
    const writable = this.getWritable()
    writable.__height = height
  }

  createDOM(): HTMLElement {
    return document.createElement("div")
  }

  updateDOM(): false {
    return false
  }

  static importJSON(data: SerializedCustomBlockNode): CustomBlockNode {
    const node = $createCustomBlockNode(data.url, data.height)
    return node
  }

  exportJSON() {
    return {
      url: this.__url,
      height: this.__height,
      type: "custom",
      version: 1,
    }
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): ReactNode {
    const nodeKey = this.getKey()
    const embedBlockTheme = config.theme.embedBlock || {}
    const className = {
      base: embedBlockTheme.base || "",
      focus: embedBlockTheme.focus || "",
    }
    return (
      <BlockWithAlignableContents className={className} nodeKey={nodeKey}>
        <CustomBlockComponent
          url={this.__url}
          nodeKey={this.__key}
          height={this.__height}
        />
      </BlockWithAlignableContents>
    )
  }

  getTextContent(): string {
    return this.__url
  }
}

export function $createCustomBlockNode(
  url: string,
  height?: number
): CustomBlockNode {
  return new CustomBlockNode(url, height)
}

export function $isCustomBlockNode(
  node: LexicalNode | null | undefined
): node is CustomBlockNode {
  return node instanceof CustomBlockNode
}
