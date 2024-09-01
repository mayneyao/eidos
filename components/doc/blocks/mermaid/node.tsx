import { ReactNode } from "react"
import { TextMatchTransformer } from "@lexical/markdown"
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import {
  DecoratorNode,
  EditorConfig,
  ElementNode,
  LexicalEditor,
  LexicalNode,
  NodeKey,
} from "lexical"

import { Mermaid } from "./component"

export class MermaidNode extends DecoratorNode<ReactNode> {
  __text: string

  static getType(): string {
    return "mermaid"
  }

  static clone(node: MermaidNode): MermaidNode {
    return new MermaidNode(node.__text, node.__key)
  }

  constructor(text: string, key?: NodeKey) {
    super(key)
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

  exportJSON(): any {
    return {
      type: MermaidNode.getType(),
      __text: this.__text,
    }
  }

  static importJSON(_serializedNode: any) {
    return new MermaidNode(_serializedNode.__text)
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): ReactNode {
    if (this.__text.length === 0 || this.__text == null) {
      return <div>Empty Mermaid text</div>
    }
    const nodeKey = this.getKey()
    const embedBlockTheme = config.theme.embedBlock || {}

    const className = {
      base: embedBlockTheme.base || "",
      focus: embedBlockTheme.focus || "",
    }
    return (
      <BlockWithAlignableContents className={className} nodeKey={nodeKey}>
        <Mermaid text={this.__text} nodeKey={this.__key} />
      </BlockWithAlignableContents>
    )
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
