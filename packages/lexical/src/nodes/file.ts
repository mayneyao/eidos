import type { SerializedDecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode"
import { DecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode"
import {
  type EditorConfig,
  type ElementFormatType,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type Spread,
} from "lexical"

export type SerializedFileNode = Spread<
  {
    src: string
    fileName: string
  },
  SerializedDecoratorBlockNode
>

export class BaseFileNode extends DecoratorBlockNode {
  public __src: string
  public __fileName: string

  static getType(): string {
    return "file"
  }

  static clone(node: BaseFileNode): BaseFileNode {
    return new BaseFileNode(
      node.__src,
      node.__fileName,
      node.__format,
      node.__key
    )
  }

  constructor(
    src: string,
    fileName: string,
    format?: ElementFormatType,
    key?: NodeKey
  ) {
    super(format, key)
    this.__src = src
    this.__fileName = fileName
  }

  static importJSON(serializedNode: SerializedFileNode): BaseFileNode {
    const node = new BaseFileNode(serializedNode.src, serializedNode.fileName)
    node.setFormat(serializedNode.format)
    return node
  }

  exportJSON(): SerializedFileNode {
    return {
      ...super.exportJSON(),
      fileName: this.__fileName,
      src: this.__src,
      type: "file",
      version: 1,
    }
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): any {
    return null
  }
}

export function $isBaseFileNode(
  node: LexicalNode | null | undefined
): node is BaseFileNode {
  return node instanceof BaseFileNode
}
