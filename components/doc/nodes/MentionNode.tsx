import { ReactNode, useEffect, useState } from "react"
import { ITreeNode } from "@/worker/meta_table/tree"
import { DecoratorNode } from "lexical"
import { NodeKey } from "lexical/LexicalNode"
import { Link } from "react-router-dom"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useQueryNode } from "@/hooks/use-query-node"
import { ItemIcon } from "@/components/sidebar/item-tree"
import { NodeIconEditor } from "@/app/[database]/[table]/node-icon"

const MentionComponent = (props: { id: string }) => {
  const [node, setNode] = useState<ITreeNode | null>(null)
  const { space } = useCurrentPathInfo()
  // TODO: pass from props
  const { getNode } = useQueryNode()
  const { id } = props
  useEffect(() => {
    getNode(id).then((node) => {
      setNode(node ?? null)
    })
  }, [getNode, id])
  return (
    <Link
      className="inline-block rounded-sm px-1 hover:bg-secondary"
      id={id}
      to={`/${space}/${id}`}
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
              className="mr-1 inline-block h-5 w-5"
            />
          }
        />
      )}
      {node?.name ?? "loading"}
    </Link>
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

  decorate(): ReactNode {
    return <MentionComponent id={this.__id} />
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
