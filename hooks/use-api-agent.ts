import { useEffect } from "react"

import { MsgType } from "@/lib/const"
import { opfsManager } from "@/lib/opfs"
import { pdfLoader } from "@/lib/pdf"
import { getWorker } from "@/lib/sqlite/worker"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"

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

  useEffect(() => {
    const worker = getWorker()
    worker.onmessage = async (e) => {
      const { type, data } = e.data
      if (type === "loadPdf") {
        console.log("main loadPdf", data.fileUrl)
        const file = await opfsManager.getFileByURL(data.fileUrl)
        const pages = await pdfLoader(file)
        e.ports[0].postMessage(pages)
      }
    }
  }, [])

  return {
    connected: isWebsocketConnected,
  }
}
