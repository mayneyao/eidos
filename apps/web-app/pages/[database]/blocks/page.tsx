import { useParams, useLocation } from "react-router-dom"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { BlockApp } from "@/components/block-renderer/block-app"

export const BlocksPage = () => {
  const { blockId } = useParams()
  const { space } = useCurrentPathInfo()
  const location = useLocation()
  
  if (!blockId) {
    return <div>Block not found</div>
  }
  
  const url = `block://${blockId}@${space}${location.hash}`
  return <BlockApp url={url} height={"100%"} />
}
