import { ReactNode } from "react"
import { TextMatchTransformer } from "@lexical/markdown"
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import {
  DecoratorBlockNode,
  SerializedDecoratorBlockNode,
} from "@lexical/react/LexicalDecoratorBlockNode"
import {
  EditorConfig,
  ElementFormatType,
  ElementNode,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  Spread,
} from "lexical"

import { Mermaid } from "./component"

export type SerializedMermaidNode = Spread<
  {
    text: string
  },
  SerializedDecoratorBlockNode
>

export class MermaidNode extends DecoratorBlockNode {
  __text: string

  static getType(): string {
    return "mermaid"
  }

  static clone(node: MermaidNode): MermaidNode {
    return new MermaidNode(node.__text, node.__format, node.__key)
  }

  constructor(text: string, format?: ElementFormatType, key?: NodeKey) {
    super(format, key)
    this.__text = text
  }

  setText(text: string) {
    const writable = this.getWritable()
    writable.__text = text
  }

  createDOM(): HTMLElement {
    return document.createElement("div")
  }

  updateDOM(): false {
    return false
  }

  exportJSON(): SerializedMermaidNode {
    return {
      ...super.exportJSON(),
      text: this.__text,
      type: "mermaid",
      version: 1,
    }
  }

  static importJSON(serializedNode: SerializedMermaidNode): MermaidNode {
    const node = $createMermaidNode(serializedNode.text)
    node.setFormat(serializedNode.format)
    return node
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    if (this.__text.length === 0 || this.__text == null) {
      return <div>Empty Mermaid text</div>
    }
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
        <Mermaid text={this.__text} nodeKey={this.__key} />
      </BlockWithAlignableContents>
    )
  }

  getTextContent(): string {
    return this.__text
  }
}

export function $createMermaidNode(text: string): MermaidNode {
  return new MermaidNode(text)
}

export function $isMermaidNode(
  node: LexicalNode | null | undefined
): node is MermaidNode {
  return node instanceof MermaidNode
}

export const MERMAID_NODE_TRANSFORMER: TextMatchTransformer = {
  dependencies: [MermaidNode],
  export: (
    node: LexicalNode,
    traverseChildren: (node: ElementNode) => string
  ) => {
    if (!$isMermaidNode(node)) {
      return null
    }
    const textContent = node.getTextContent()
    return (
      "```mermaid\n" +
      (node.__text || "") +
      (textContent ? "\n" + textContent : "") +
      "\n" +
      "```"
    )
  },

  // not working cause the bug
  // https://github.com/facebook/lexical/issues/2564
  importRegExp: /```mermaid([\s\S]*?)```/,
  regExp: /```mermaid([\s\S]*?)```$/,
  replace: (textNode, match) => {
    const text = match[1].trim()
    const imageNode = $createMermaidNode(text)
    textNode.replace(imageNode)
  },
  trigger: "```",
  type: "text-match",
}
