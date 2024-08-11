import { timeAgo } from "@/lib/utils"
import { useCurrentNode } from "@/hooks/use-current-node"
import { useNodeBaseInfo } from "@/hooks/use-node-base-info"

export const NodeUpdateTime = () => {
  const node = useCurrentNode()
  const { updated_at } = useNodeBaseInfo(node)
  const tips = updated_at
    ? "last updated: " + timeAgo(new Date(updated_at + "Z"))
    : ""
  if (!updated_at?.length) return null
  return <div className="flex h-full p-2 text-sm opacity-60">{tips}</div>
}
