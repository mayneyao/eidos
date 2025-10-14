import { useParams } from "react-router-dom"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { BlockApp } from "@/components/block-renderer/block-app"

export const BlocksPage = () => {
  const { blockId } = useParams()
  const { space } = useCurrentPathInfo()
  if (!blockId) {
    return <div>Block not found</div>
  }
  return <BlockApp url={`block://${blockId}@${space}`} height={"100%"} />
}
