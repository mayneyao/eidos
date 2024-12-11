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

import { SyncBlockComponent } from "./component"

export type SerializedSyncBlockNode = Spread<
  {
    id: string
  },
  SerializedLexicalNode
>

export class SyncBlockNode extends DecoratorNode<ReactNode> {
  __id: string

  static getType(): string {
    return "sync-block"
  }

  static clone(node: SyncBlockNode): SyncBlockNode {
    return new SyncBlockNode(node.__id, node.__key)
  }

  constructor(id: string, key?: NodeKey) {
    super(key)
    this.__id = id
  }

  getTextContent(): string {
    return `<sync-block id="${this.__id}">`
  }

  createDOM(): HTMLElement {
    return document.createElement("div")
  }

  updateDOM(): false {
    return false
  }

  static importJSON(data: SerializedSyncBlockNode): SyncBlockNode {
    return $createSyncBlockNode(data.id)
  }

  exportJSON(): SerializedSyncBlockNode {
    return {
      id: this.__id,
      type: "sync-block",
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
        <SyncBlockComponent id={this.__id} />
      </BlockWithAlignableContents>
    )
  }

  canInsertTextBefore(): boolean {
    return false
  }

  canInsertTextAfter(): boolean {
    return false
  }
}

export function $createSyncBlockNode(id: string): SyncBlockNode {
  return new SyncBlockNode(id)
}

export function $isSyncBlockNode(
  node: LexicalNode | null | undefined
): node is SyncBlockNode {
  return node instanceof SyncBlockNode
}
