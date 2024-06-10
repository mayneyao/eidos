import { ITreeNode } from "@/lib/store/ITreeNode"
import { NodeIconEditor } from "@/app/[database]/[node]/node-icon"

import { ItemIcon } from "./sidebar/item-tree"

export const NodeName = ({ node }: { node: ITreeNode }) => {
  return (
    <div
      key={node.id}
      onClick={() => {}}
      title={node.name || "Untitled"}
      className="flex  items-center gap-1"
    >
      {node.type == null ? (
        <NodeIconEditor icon={node.icon} nodeId={node.id} size="1em" disabled />
      ) : (
        <div className="w-5">
          <NodeIconEditor
            icon={node.icon}
            nodeId={node.id}
            size="1em"
            disabled
            customTrigger={<ItemIcon type={node.type} className="h-4 w-4" />}
          />
        </div>
      )}

      <p className="min-w-0 max-w-[15rem] truncate">
        {node.name || "Untitled"}
      </p>
    </div>
  )
}
