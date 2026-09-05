import {
  DecoratorBlockNode,
  type SerializedDecoratorBlockNode,
} from "@lexical/react/LexicalDecoratorBlockNode"
import { inlineMathSourceFromValue } from "../features/math/syntax"
import {
  $applyNodeReplacement,
  $getNodeByKey,
  DecoratorNode,
  type EditorConfig,
  type ElementFormatType,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical"
import type { JSX } from "react"
import type { EfmInlineData, EfmBlockData } from "./efm-semantic-data"
import { EfmInlineView, EfmBlockView } from "../ui/efm-semantic-view"
import { EfmBlockSelection } from "../ui/efm-block-selection"

export type {
  EfmInlineKind,
  EfmInlineData,
  EfmBlockKind,
  EfmBlockData,
} from "./efm-semantic-data"
export { parseObsidianPreviewText } from "../ui/efm-semantic-view"

type SerializedEfmInlineNode = Spread<
  { data: EfmInlineData },
  SerializedLexicalNode
>

type SerializedEfmBlockNode = Spread<
  { data: EfmBlockData },
  SerializedDecoratorBlockNode
>

export class EfmInlineNode extends DecoratorNode<JSX.Element> {
  __data: EfmInlineData

  static getType(): string {
    return "efm-inline"
  }

  static clone(node: EfmInlineNode): EfmInlineNode {
    return new EfmInlineNode({ ...node.__data }, node.__key)
  }

  static importJSON(serializedNode: SerializedEfmInlineNode): EfmInlineNode {
    return $createEfmInlineNode(serializedNode.data)
  }

  constructor(data: EfmInlineData, key?: NodeKey) {
    super(key)
    this.__data = data
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("span")
    element.className = "eme-efm-inline-shell"
    element.contentEditable = "false"
    return element
  }

  updateDOM(): false {
    return false
  }

  exportJSON(): SerializedEfmInlineNode {
    return {
      ...super.exportJSON(),
      data: { ...this.getData() },
      type: "efm-inline",
      version: 1,
    }
  }

  getData(): EfmInlineData {
    return this.getLatest().__data
  }

  setData(data: EfmInlineData): this {
    const writable = this.getWritable()
    writable.__data = data
    return writable
  }

  getTextContent(): string {
    return this.getData().source
  }

  decorate(editor: LexicalEditor): JSX.Element {
    const nodeKey = this.getKey()
    return (
      <EfmInlineView
        data={this.getData()}
        onSaveMath={(value) =>
          editor.update(() => {
            const node = $getNodeByKey(nodeKey)
            if (!$isEfmInlineNode(node)) return
            const current = node.getData()
            node.setData({
              ...current,
              value,
              source: inlineMathSourceFromValue(current.source, value),
            })
          })
        }
      />
    )
  }
}

export class EfmBlockNode extends DecoratorBlockNode {
  __data: EfmBlockData

  static getType(): string {
    return "efm-block"
  }

  static clone(node: EfmBlockNode): EfmBlockNode {
    return new EfmBlockNode({ ...node.__data }, node.__format, node.__key)
  }

  static importJSON(serializedNode: SerializedEfmBlockNode): EfmBlockNode {
    return $createEfmBlockNode(serializedNode.data).setFormat(
      serializedNode.format
    )
  }

  constructor(data: EfmBlockData, format?: ElementFormatType, key?: NodeKey) {
    super(format, key)
    this.__data = data
  }

  exportJSON(): SerializedEfmBlockNode {
    return {
      ...super.exportJSON(),
      data: { ...this.getData() },
      type: "efm-block",
      version: 1,
    }
  }

  getData(): EfmBlockData {
    return this.getLatest().__data
  }

  setData(data: EfmBlockData): this {
    const writable = this.getWritable()
    writable.__data = data
    return writable
  }

  getTextContent(): string {
    return this.getData().source
  }

  decorate(editor: LexicalEditor): JSX.Element {
    const nodeKey = this.getKey()
    return (
      <>
        <EfmBlockSelection editor={editor} nodeKey={nodeKey} />
        <EfmBlockView data={this.getData()} />
      </>
    )
  }
}

export function $createEfmInlineNode(data: EfmInlineData): EfmInlineNode {
  return $applyNodeReplacement(new EfmInlineNode(data))
}

export function $isEfmInlineNode(
  node: LexicalNode | null | undefined
): node is EfmInlineNode {
  return node instanceof EfmInlineNode
}

export function $createEfmBlockNode(data: EfmBlockData): EfmBlockNode {
  return $applyNodeReplacement(new EfmBlockNode(data))
}

export function $isEfmBlockNode(
  node: LexicalNode | null | undefined
): node is EfmBlockNode {
  return node instanceof EfmBlockNode
}
