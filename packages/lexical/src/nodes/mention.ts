import type { TextMatchTransformer } from "@lexical/markdown"
import {
  DecoratorNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical"

export interface MentionPayload {
  id: string
  title?: string
}

export interface SerializedMentionNode {
  id: string
  title?: string
  type: "mention"
  version: 1
}

export class BaseMentionNode extends DecoratorNode<any> {
  public __id: string
  public __title?: string

  static getType(): string {
    return "mention"
  }

  static clone(node: BaseMentionNode): BaseMentionNode {
    return new BaseMentionNode(node.__id, node.__title, node.__key)
  }

  constructor(id: string, title?: string, key?: NodeKey) {
    super(key)
    this.__id = id
    this.__title = title
  }

  static importJSON(data: SerializedMentionNode): BaseMentionNode {
    return new BaseMentionNode(data.id, data.title)
  }

  exportJSON(): SerializedMentionNode {
    return {
      id: this.__id,
      title: this.__title,
      type: "mention",
      version: 1,
    }
  }

  getId(): string {
    return this.__id
  }

  getTitle(): string | undefined {
    return this.__title
  }

  getTextContent(): string {
    return `[[ ${this.__id} ]]`
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): any {
    return null
  }
}

export function $isBaseMentionNode(
  node: LexicalNode | null | undefined
): node is BaseMentionNode {
  return node instanceof BaseMentionNode
}

export function createMentionTransformer<T extends typeof LexicalNode>(
  nodeClass: any = BaseMentionNode,
  createNode: (id: string) => InstanceType<T> = (id) =>
    new nodeClass(id.trim()) as any
): TextMatchTransformer {
  return {
    dependencies: [nodeClass],
    export: (node) => {
      if (!(node instanceof nodeClass)) {
        return null
      }
      return `[[ ${(node as BaseMentionNode).getId()} ]]`
    },
    importRegExp: /\[\[ ([^\]]+) \]\]/,
    regExp: /\[\[ ([^\]]+) \]\]$/,
    replace: (textNode, match) => {
      const [, id] = match
      const mentionNode = createNode(id)
      textNode.replace(mentionNode)
    },
    trigger: "]",
    type: "text-match",
  }
}

export const MENTION_NODE_TRANSFORMER = createMentionTransformer()
