import { ReactNode, useEffect, useState } from "react"
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import { DecoratorNode, EditorConfig, LexicalEditor, NodeKey } from "lexical"
import { useNavigate } from "react-router-dom"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useQueryNode } from "@/hooks/use-query-node"
import { ItemIcon } from "@/components/sidebar/item-tree"
import { NodeIconEditor } from "@/app/[database]/[node]/node-icon"

export const MentionComponent = (props: { id: string }) => {
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
    <span
      className=" inline-block cursor-pointer rounded-sm px-1 underline hover:bg-secondary"
      id={id}
      onClick={onClick}
    >
      {node && (
        <NodeIconEditor
          icon={node.icon}
          nodeId={node.id}
          disabled
          size="1em"
          customTrigger={
            <ItemIcon
              type={node?.type ?? ""}
              className="mr-1 inline-block h-4 w-4"
            />
          }
        />
      )}
      {node?.name ?? "loading"}
    </span>
  )
}

export class MentionNode extends DecoratorNode<ReactNode> {
  __id: string

  static getType(): string {
    return "mention"
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__id, node.__key)
  }

  constructor(id: string, key?: NodeKey) {
    super(key)
    this.__id = id
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
          <MentionComponent id={this.__id} />
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

export function $createMentionNode(id: string): MentionNode {
  return new MentionNode(id)
}

export function $isMentionNode(
  node: MentionNode | null | undefined
): node is MentionNode {
  return node instanceof MentionNode
}
