import { getBlockIdFromUrl } from "@/lib/utils"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useCurrentPathInfo } from "./use-current-pathinfo"

/**
 * const navigate = useLocalNavigate()
 * navigate("block://<blockid>?params=xxx") will redirect to the block page
 */
export const useExtensionNavigate = () => {
  const { navigate } = useRouterAdapter()
  const { space } = useCurrentPathInfo()
  return (url: string) => {
    const blockId = getBlockIdFromUrl(url)
    if (!blockId) return
    const [id, _space] = blockId.split("@")
    navigate(`/extensions/${id}`)
  }
}

export const useExtensionNavigateById = () => {
  const { navigate } = useRouterAdapter()
  const { space } = useCurrentPathInfo()
  return (id: string) => {
    navigate(`/extensions/${id}`)
  }
}
