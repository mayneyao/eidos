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
    src: string
    height?: number
  },
  SerializedLexicalNode
>

export class CustomBlockNode extends DecoratorNode<ReactNode> {
  __src: string
  __height?: number

  static getType(): string {
    return "custom"
  }

  static clone(node: CustomBlockNode): CustomBlockNode {
    return new CustomBlockNode(node.__src, node.__height, node.__key)
  }

  constructor(src: string, height?: number, key?: NodeKey) {
    super(key)
    this.__src = src
    this.__height = height
  }

  setSrc(src: string): void {
    const writable = this.getWritable()
    writable.__src = src
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
    const node = $createCustomBlockNode(data.src, data.height)
    return node
  }

  exportJSON() {
    return {
      src: this.__src,
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
          url={this.__src}
          nodeKey={this.__key}
          height={this.__height}
        />
      </BlockWithAlignableContents>
    )
  }

  getTextContent(): string {
    return this.__src
  }
}

export function $createCustomBlockNode(
  src: string,
  height?: number
): CustomBlockNode {
  return new CustomBlockNode(src, height)
}

export function $isCustomBlockNode(
  node: LexicalNode | null | undefined
): node is CustomBlockNode {
  return node instanceof CustomBlockNode
}
