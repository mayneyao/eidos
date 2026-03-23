import type { ReactNode } from "react"
import {
  BaseMentionNode,
  $isBaseMentionNode,
  createMentionTransformer,
} from "@eidos.space/lexical"
import type { EditorConfig, LexicalEditor, LexicalNode, NodeKey } from "lexical"

import { MentionComponent } from "./component"

export class MentionNode extends BaseMentionNode {
  static getType(): string {
    return "mention"
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__id, node.__title, node.__key)
  }

  constructor(id: string, title?: string, key?: NodeKey) {
    super(id, title, key)
  }

  static importJSON(data: any): MentionNode {
    const node = $createMentionNode(data.id, data.title)
    return node
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): ReactNode {
    return (
      <MentionComponent
        id={this.__id}
        title={this.__title}
        nodeKey={this.getKey()}
      />
    )
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

export const MENTION_NODE_TRANSFORMER = createMentionTransformer(
  MentionNode,
  (id) => $createMentionNode(id.trim())
)
