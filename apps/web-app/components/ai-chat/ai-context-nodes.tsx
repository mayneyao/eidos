import { XIcon } from "lucide-react"
import { useNavigate } from "react-router-dom"

import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { isDayPageId } from "@/lib/utils"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { NodeName } from "@/components/node-name"

interface AIContextNodesProps {
  contextNodes: ITreeNode[]
  onRemoveNode: (nodeId: string) => void
}

export const AIContextNodes = ({
  contextNodes,
  onRemoveNode,
}: AIContextNodesProps) => {
  const navigate = useNavigate()
  const { space } = useCurrentPathInfo()

  if (!contextNodes || contextNodes.length === 0) {
    return null
  }

  const handleNodeClick = (node: ITreeNode) => {
    if (isDayPageId(node.id)) {
      navigate(`/journals/${node.id}`)
    } else {
      navigate(`/${node.id}`)
    }
  }

  return (
    <div className="flex flex-wrap gap-1">
      {contextNodes.map((node) => (
        <Badge
          key={node.id}
          variant="secondary"
          className="flex items-center gap-1 px-1.5 py-0.5"
        >
          <div
            className="flex items-center gap-1 min-w-0 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => handleNodeClick(node)}
            title={`Go to ${node.name || "Untitled"}`}
          >
            <NodeName node={node} />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onRemoveNode(node.id)
            }}
            className="h-3 w-3 p-0 hover:bg-transparent hover:text-muted-foreground/70"
          >
            <XIcon size={10} />
          </Button>
        </Badge>
      ))}
    </div>
  )
}
