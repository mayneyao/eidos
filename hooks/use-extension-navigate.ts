import { getBlockIdFromUrl } from "@/lib/utils"
import { useNavigate } from "react-router-dom"
import { useCurrentPathInfo } from "./use-current-pathinfo"


/**
 * const navigate = useLocalNavigate()
 * navigate("block://<blockid>?params=xxx") will redirect to the block page
 */
export const useExtensionNavigate = () => {
    const navigate = useNavigate()
    const { space } = useCurrentPathInfo()
    return (url: string) => {
        const blockId = getBlockIdFromUrl(url)
        if (!blockId) return
        const [id, _space] = blockId.split("@")
        navigate(`/${_space || space}/extensions/${id}`)
    }
}
