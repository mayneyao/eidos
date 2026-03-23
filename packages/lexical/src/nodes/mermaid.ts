import type {
  MultilineElementTransformer,
  TextMatchTransformer,
} from "@lexical/markdown"
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

export type SerializedMermaidNode = Spread<
  {
    code: string
  },
  SerializedDecoratorBlockNode
>

export class BaseMermaidNode extends DecoratorBlockNode {
  public __code: string

  static getType(): string {
    return "mermaid"
  }

  static clone(node: BaseMermaidNode): BaseMermaidNode {
    return new BaseMermaidNode(node.__code, node.__format, node.__key)
  }

  constructor(code: string, format?: ElementFormatType, key?: NodeKey) {
    super(format, key)
    this.__code = code
  }

  static importJSON(serializedNode: SerializedMermaidNode): BaseMermaidNode {
    const node = new BaseMermaidNode(serializedNode.code)
    node.setFormat(serializedNode.format)
    return node
  }

  exportJSON(): SerializedMermaidNode {
    return {
      ...super.exportJSON(),
      code: this.__code,
      type: "mermaid",
      version: 1,
    }
  }

  getCode(): string {
    return this.__code
  }

  setText(code: string): void {
    const writable = this.getWritable()
    writable.__code = code
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): any {
    return null
  }
}

export function $isBaseMermaidNode(
  node: LexicalNode | null | undefined
): node is BaseMermaidNode {
  return node instanceof BaseMermaidNode
}

export function createMermaidTransformer<T extends typeof LexicalNode>(
  nodeClass: any = BaseMermaidNode,
  createNode: (code: string) => InstanceType<T> = (code) =>
    new nodeClass(code) as any
): MultilineElementTransformer {
  return {
    dependencies: [nodeClass],
    export: (node: LexicalNode) => {
      if (!(node instanceof nodeClass)) {
        return null
      }
      return "```mermaid\n" + (node as BaseMermaidNode).getCode() + "\n```"
    },
    regExpEnd: {
      optional: true,
      regExp: /^```$/,
    },
    regExpStart: /^```mermaid/,
    replace: (rootNode, _children, _startMatch, _endMatch, linesInBetween) => {
      const text = linesInBetween?.join("\n").trim()
      if (text === undefined) {
        return false
      }
      const mermaidNode = createNode(text)
      rootNode.append(mermaidNode)
      return true
    },
    type: "multiline-element",
  }
}

export const MERMAID_NODE_TRANSFORMER = createMermaidTransformer()
