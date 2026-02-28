import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { XIcon } from "lucide-react"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

import { isDayPageId } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { NodeName } from "@/components/node-name"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"

interface AIContextNodesProps {
  contextNodes: ITreeNode[]
  onRemoveNode: (nodeId: string) => void
}

export const AIContextNodes = ({
  contextNodes,
  onRemoveNode,
}: AIContextNodesProps) => {
  const { navigate } = useRouterAdapter()
  const { space } = useCurrentPathInfo()

  if (!contextNodes || contextNodes.length === 0) {
    return null
  }

  const handleNodeClick = (node: ITreeNode) => {
    // Check if this is a path-based node (starts with ~ or @/)
    const isPathNode = node.id.startsWith("~") || node.id.startsWith("@/")

    if (isPathNode) {
      // Navigate to file handler with the path as hash
      navigate(`/file-handler#${node.id}`)
    } else if (isDayPageId(node.id)) {
      navigate(`/journals/${node.id}`)
    } else if (node.type === "extension") {
      navigate(`/extensions/${node.id}`)
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
