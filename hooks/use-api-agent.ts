import { useAppRuntimeStore } from "@/lib/store/runtime-store"

export const useAPIAgent = () => {
  const { isWebsocketConnected } = useAppRuntimeStore()

  return {
    connected: isWebsocketConnected,
  }
}
