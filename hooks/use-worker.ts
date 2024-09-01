import { useCallback } from "react"

import { MsgType } from "@/lib/const"
import { getEmbeddingWorker } from "@/lib/embedding/worker"
import { getWorker } from "@/lib/sqlite/worker"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useSqlite } from "@/hooks/use-sqlite"
import { useToast } from "@/components/ui/use-toast"

import {
  _convertEmail2State,
  _convertHtml2State,
  _convertMarkdown2State,
  _getDocMarkdown,
} from "./use-doc-editor"
import { useSqliteStore } from "./use-sqlite"
import { useCurrentUser } from "./user-current-user"
import { isInkServiceMode } from "@/lib/env"

export const useWorker = () => {
  const { setInitialized, isInitialized } = useSqliteStore()
  const { id: userId } = useCurrentUser()
  const { } = useSqlite
  const {
    setWebsocketConnected,
    setBlockUIMsg,
    setBlockUIData,
    setEmbeddingModeLoaded,
  } = useAppRuntimeStore()

  const { toast } = useToast()
  const initWorker = useCallback(() => {
    if (isInkServiceMode) {
      setInitialized(true)
      return () => { }
    }
    const worker = getWorker()

    const handle = async (event: MessageEvent) => {
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
        case MsgType.ConvertHtml2State:
          const res3 = await _convertHtml2State(data)
          event.ports[0].postMessage(res3)
          break
        case MsgType.ConvertEmail2State:
          const res4 = await _convertEmail2State(data.email, data.space, userId)
          event.ports[0].postMessage(res4)
          break
        default:
          break
      }
    }
    worker.addEventListener("message", handle)
    return () => worker.removeEventListener("message", handle)
  }, [
    setBlockUIData,
    setBlockUIMsg,
    setInitialized,
    setWebsocketConnected,
    toast,
    userId,
  ])

  const initEmbeddingWorker = useCallback(() => {
    const worker = getEmbeddingWorker()
    const handler = async (event: MessageEvent) => {
      if (event.data.status === "ready") {
        console.log("embedding worker is ready")
        setEmbeddingModeLoaded(true)
      }
    }
    worker.addEventListener("message", handler)
    return () => worker.removeEventListener("message", handler)
  }, [setEmbeddingModeLoaded])

  return {
    initEmbeddingWorker,
    initWorker,
    isInitialized,
  }
}
