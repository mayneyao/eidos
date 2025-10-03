import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useSpaceAppStore } from "@/apps/web-app/pages/[database]/store"

import { SimpleNodeComponent } from "./simple-node-component"

export const NodeAppPanel = () => {
  const { currentApp } = useSpaceAppStore()
  const { space } = useCurrentPathInfo()

  if (!currentApp || !currentApp.startsWith("node://")) {
    return null
  }

  const [nodeIdWithSchema, nodeSpace] = currentApp.split("@")
  const nodeId = nodeIdWithSchema.split("://")[1]

  // Only show if the node is in the current space
  if (nodeSpace !== space) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p>Node not in current space</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden">
      <div className="h-full overflow-y-auto">
        <SimpleNodeComponent nodeId={nodeId} space={space} />
      </div>
    </div>
  )
}
