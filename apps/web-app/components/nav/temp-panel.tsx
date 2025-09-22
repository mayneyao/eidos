import { useSpaceAppStore } from "@/apps/web-app/pages/[database]/store"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { SimpleNodeComponent } from "./simple-node-component"

export const TempPanel = () => {
  const { tempPanelNode } = useSpaceAppStore()
  const { space } = useCurrentPathInfo()

  if (!tempPanelNode) return null

  return (
    <div className="h-full overflow-hidden">
      {tempPanelNode.name === "Loading..." ? (
        <div className="p-4 text-center text-muted-foreground">
          <p>Loading node content...</p>
        </div>
      ) : (
        <div className="h-full overflow-y-auto">
          <SimpleNodeComponent 
            nodeId={tempPanelNode.id} 
            space={space}
          />
        </div>
      )}
    </div>
  )
}
