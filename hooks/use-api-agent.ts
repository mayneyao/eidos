import { useEffect } from "react"

import { MsgType } from "@/lib/const"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { getWorker } from "@/lib/sqlite/worker"

export const useAPIAgent = () => {
  const { isWebsocketConnected, setWebsocketConnected } = useAppRuntimeStore()

  useEffect(() => {
    const worker = getWorker()
    worker.onmessage = (e) => {
      const { type } = e.data
      if (type === MsgType.WebSocketConnected) {
        setWebsocketConnected(true)
      }
      if (type === MsgType.WebSocketDisconnected) {
        setWebsocketConnected(false)
      }
    }
  }, [setWebsocketConnected])

  return {
    connected: isWebsocketConnected,
  }
}
