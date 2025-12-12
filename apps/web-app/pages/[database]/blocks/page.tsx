import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useMblock } from "@/hooks/use-mblock"
import { useTabTitle } from "@/hooks/use-tab-title"
import { BlockApp } from "@/components/block-renderer/block-app"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

export const BlocksPage = () => {
  const {
    params: { blockId },
  } = useRouterAdapter()
  const { space } = useCurrentPathInfo()
  const { location } = useRouterAdapter()
  const block = useMblock(blockId)
  useTabTitle(block?.name)
  if (!blockId) {
    return <div>Block not found</div>
  }

  const url = `block://${blockId}@${space}${location.hash}`
  return <BlockApp url={url} height={"100%"} />
}
