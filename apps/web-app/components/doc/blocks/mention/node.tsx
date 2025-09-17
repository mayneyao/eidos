import type { ReactNode } from "react"
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import type { EditorConfig, LexicalEditor, NodeKey, LexicalNode } from "lexical";
import { DecoratorNode } from "lexical"
import type { TextMatchTransformer } from "@lexical/markdown"

import { MentionComponent } from "./component"

export class MentionNode extends DecoratorNode<ReactNode> {
  __id: string
  __title?: string

  static getType(): string {
    return "mention"
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__id, node.__title, node.__key)
  }

  constructor(id: string, title?: string, key?: NodeKey) {
    super(key)
    this.__id = id
    this.__title = title
  }

  getTextContent(): string {
    return `[[ ${this.__id} ]]`
  }

  createDOM(): HTMLElement {
    const node = document.createElement("span")
    // node.style.display = "inline-block"
    return node
  }

  updateDOM(): false {
    return false
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): ReactNode {
    const nodeKey = this.getKey()
    const embedBlockTheme = config.theme.embedBlock || {}

    const className = {
      base: embedBlockTheme.base || "",
      focus: embedBlockTheme.focus || "",
    }
    return (
      <div className="inline-block">
        <BlockWithAlignableContents className={className} nodeKey={nodeKey}>
          <MentionComponent 
            id={this.__id} 
            title={this.__title}
          />
        </BlockWithAlignableContents>
      </div>
    )
  }

  static importJSON(data: any): MentionNode {
    const node = $createMentionNode(data.id)
    return node
  }

  exportJSON() {
    return {
      id: this.__id,
      title: this.__title,
      type: "mention",
      version: 1,
    }
  }

  canInsertTextBefore(): boolean {
    return false
  }

  canInsertTextAfter(): boolean {
    return false
  }
}

export function $createMentionNode(id: string, title?: string): MentionNode {
  return new MentionNode(id, title)
}

export function $isMentionNode(
  node: LexicalNode | null | undefined
): node is MentionNode {
  return node instanceof MentionNode
}

export const MENTION_NODE_TRANSFORMER: TextMatchTransformer = {
  dependencies: [MentionNode],
  export: (node) => {
    if (!$isMentionNode(node)) {
      return null
    }
    const mentionNode = node as MentionNode
    return `[[ ${mentionNode.__id} ]]`
  },
  importRegExp: /\[\[ ([^\]]+) \]\]/,
  regExp: /\[\[ ([^\]]+) \]\]$/,
  replace: (textNode, match) => {
    const [, id] = match
    const mentionNode = $createMentionNode(id.trim())
    textNode.replace(mentionNode)
  },
  trigger: "]",
  type: "text-match",
}
