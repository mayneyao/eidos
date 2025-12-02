import { ArrowLeft, ArrowUpRight } from "lucide-react"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

import { getBlockIdFromUrl, isDayPageId } from "@/lib/utils"
import { ContextMenuItem } from "@/components/ui/context-menu"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"

export const NodeContextMenu = ({ url }: { url: string }) => {
  const { navigate } = useRouterAdapter()
  const { space } = useCurrentPathInfo()

  const handleGoToNode = (e: Event) => {
    e.preventDefault()
    const id = getBlockIdFromUrl(url)
    const [nodeIdWithSchema, nodeSpace] = id.split("@")
    const nodeId = nodeIdWithSchema.split("://")[1]

    // Navigate to the node in the same space
    if (nodeSpace === space) {
      if (isDayPageId(nodeId)) {
        navigate(`/journals/${nodeId}`)
      } else {
        navigate(`/${nodeId}`)
      }
    }
  }

  const handleOpenInNewWindow = (e: Event) => {
    e.preventDefault()
    const id = getBlockIdFromUrl(url)
    const [nodeIdWithSchema, nodeSpace] = id.split("@")
    const nodeId = nodeIdWithSchema.split("://")[1]

    // Open the node in a new window
    if (isDayPageId(nodeId)) {
      window.open(`/journals/${nodeId}`)
    } else {
      window.open(`/${nodeId}`)
    }
  }

  return (
    <>
      <ContextMenuItem onSelect={handleGoToNode}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        <span>Go to Node</span>
      </ContextMenuItem>
    </>
  )
}
