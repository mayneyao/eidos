import { useCallback } from "react"

import { MsgType } from "@/lib/const"
import { embeddingTexts, getEmbeddingWorker } from "@/lib/embedding/worker"
import { getWorker } from "@/lib/sqlite/worker"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useToast } from "@/components/ui/use-toast"

import { _convertMarkdown2State, _getDocMarkdown } from "./use-doc-editor"
import { useSqliteStore } from "./use-sqlite"

export const useWorker = () => {
  const { setInitialized, isInitialized } = useSqliteStore()
  const { setWebsocketConnected, setBlockUIMsg, setBlockUIData } =
    useAppRuntimeStore()

  const { toast } = useToast()
  const initWorker = useCallback(() => {
    const worker = getWorker()
    worker.addEventListener("message", async (event) => {
      if (event.data === "init") {
        console.log("sqlite is loaded")
        setInitialized(true)
      }
      const { type, data } = event.data
      switch (type) {
        case MsgType.WebSocketConnected:
          setWebsocketConnected(true)
          break
        case MsgType.WebSocketDisconnected:
          setWebsocketConnected(false)
          break
        case MsgType.Notify:
          toast({
            title: data.title,
            description: data.description,
          })
          break
        case MsgType.BlockUIMsg:
          setBlockUIMsg(data.msg)
          setBlockUIData(data.data)
          break
        case MsgType.Error:
          toast({
            title: "Error",
            description: data.message,
            duration: 5000,
          })
          break
        case MsgType.GetDocMarkdown:
          const res = await _getDocMarkdown(data)
          event.ports[0].postMessage(res)
          break
        case MsgType.ConvertMarkdown2State:
          const res2 = await _convertMarkdown2State(data)
          event.ports[0].postMessage(res2)
          break
        default:
          break
      }
    })
  }, [
    setBlockUIData,
    setBlockUIMsg,
    setInitialized,
    setWebsocketConnected,
    toast,
  ])

  const initEmbeddingWorker = useCallback(() => {
    const worker = getEmbeddingWorker()
    ;(window as any).embeddingWorker = worker
    ;(window as any).embeddingTexts = embeddingTexts
    const handler = async (event: MessageEvent) => {
      console.log("embedding worker message", event.data)
    }
    worker.addEventListener("message", handler)
    return () => worker.removeEventListener("message", handler)
  }, [])

  return {
    initEmbeddingWorker,
    initWorker,
    isInitialized,
  }
}
