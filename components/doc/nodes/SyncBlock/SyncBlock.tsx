import { ReactNode, useEffect, useState } from "react"
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import { DecoratorNode, EditorConfig, LexicalEditor, NodeKey } from "lexical"
import { useNavigate } from "react-router-dom"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useQueryNode } from "@/hooks/use-query-node"
import { nodeInfoMap } from "@/components/ai-chat/ai-input-editor"

import { Editor, InnerEditor } from "../../editor"

export const SyncBlockComponent = (props: { id: string }) => {
  const [node, setNode] = useState<ITreeNode | null>(null)
  const { space } = useCurrentPathInfo()
  // TODO: pass from props
  const { getNode } = useQueryNode()
  const { id } = props
  const router = useNavigate()
  const onClick = () => {
    router(`/${space}/${id}`)
  }
  useEffect(() => {
    getNode(id).then((node) => {
      setNode(node ?? null)
    })
  }, [getNode, id])

  return (
    <div className="rounded-sm ring-purple-300 hover:ring">
      {node?.type === "doc" && (
        <InnerEditor
          isEditable={node.is_locked ? false : true}
          docId={node.id}
          title={node.name}
          disableSelectionPlugin
          disableSafeBottomPaddingPlugin
          className={"max-w-full border"}
        />
      )}
    </div>
  )
}

export class SyncBlock extends DecoratorNode<ReactNode> {
  __id: string

  static getType(): string {
    return "sync-block"
  }

  static clone(node: SyncBlock): SyncBlock {
    return new SyncBlock(node.__id, node.__key)
  }

  constructor(id: string, key?: NodeKey) {
    super(key)
    this.__id = id
  }

  getTextContent(): string {
    const title = nodeInfoMap.get(this.__id)?.name ?? "Untitled"
    return `<span data-node-id="${this.__id}">${title}</span>`
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
      <BlockWithAlignableContents className={className} nodeKey={nodeKey}>
        <SyncBlockComponent id={this.__id} />
      </BlockWithAlignableContents>
    )
  }

  static importJSON(data: any): SyncBlock {
    const node = $createSyncBlock(data.id)
    return node
  }

  exportJSON() {
    return {
      id: this.__id,
      type: "sync-block",
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

export function $createSyncBlock(id: string): SyncBlock {
  return new SyncBlock(id)
}

export function $isSyncBlock(
  node: SyncBlock | null | undefined
): node is SyncBlock {
  return node instanceof SyncBlock
}
