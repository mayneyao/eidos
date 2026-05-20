import { useCallback } from "react"
import { FileCodeIcon } from "lucide-react"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useMblock } from "@/hooks/use-mblock"
import { useTabTitle } from "@/hooks/use-tab-title"
import { useRegisterTabContextMenuItem } from "@/hooks/use-tab-context-menu-registry"
import { BlockApp } from "@/components/block-renderer/block-app"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

export const BlocksPage = () => {
  const {
    params: { blockId },
  } = useRouterAdapter()
  const { space } = useCurrentPathInfo()
  const { location, navigate } = useRouterAdapter()
  const block = useMblock(blockId)
  useTabTitle(block?.name)

  const viewExtension = useCallback(() => {
    if (blockId) navigate(`/extensions/${blockId}`)
  }, [blockId, navigate])

  useRegisterTabContextMenuItem("/blocks", {
    id: "view-block-extension",
    label: "View Block Extension",
    Icon: FileCodeIcon,
    onClick: viewExtension,
  })

  if (!blockId) {
    return <div>Block not found</div>
  }

  const url = `block://${blockId}@${space}${location.hash}`
  return <BlockApp url={url} height={"100%"} />
}
