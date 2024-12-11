import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import {
  DecoratorBlockNode,
  SerializedDecoratorBlockNode,
} from "@lexical/react/LexicalDecoratorBlockNode"
import {
  EditorConfig,
  ElementFormatType,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  Spread
} from "lexical"

import { CustomBlockComponent } from "./component"

export type SerializedCustomBlockNode = Spread<
  {
    url: string
    height?: number
  },
  SerializedDecoratorBlockNode
>

export class CustomBlockNode extends DecoratorBlockNode {
  __url: string
  __height?: number

  static getType(): string {
    return "custom"
  }

  static clone(node: CustomBlockNode): CustomBlockNode {
    return new CustomBlockNode(
      node.__url,
      node.__height,
      node.__format,
      node.__key
    )
  }

  constructor(
    url: string,
    height?: number,
    format?: ElementFormatType,
    key?: NodeKey
  ) {
    super(format, key)
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
      ...super.exportJSON(),
      url: this.__url,
      height: this.__height,
      type: "custom",
      version: 1,
    }
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    const embedBlockTheme = config.theme.embedBlock || {}
    const className = {
      base: embedBlockTheme.base || "",
      focus: embedBlockTheme.focus || "",
    }
    return (
      <BlockWithAlignableContents
        format={this.__format}
        className={className}
        nodeKey={this.__key}
      >
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
