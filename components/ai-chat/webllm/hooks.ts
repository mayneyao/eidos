import { useEffect, useRef, useState } from "react"
import * as webllm from "@mlc-ai/web-llm"
import { create } from "zustand"

import { WEB_LLM_MODELS } from "./models"

type LoadingState = {
  progress: webllm.InitProgressReport | undefined
  setProgress: (progress: webllm.InitProgressReport | undefined) => void
}

export const useLoadingStore = create<LoadingState>((set) => ({
  progress: undefined,
  setProgress: (progress) => set({ progress }),
}))

export const useReloadModel = () => {
  const reload = (model: string) => {
    document.dispatchEvent(new CustomEvent("reloadModel", { detail: model }))
  }
  return {
    reload,
  }
}

export const useInitWebLLMWorker = () => {
  const ref = useRef<webllm.ChatWorkerClient>()
  const [currentModel, setCurrentModel] = useState<string>("")
  const loadingRef = useRef(false)
  const { progress, setProgress } = useLoadingStore()

  useEffect(() => {
    if (progress?.progress === 1) {
      setProgress(undefined)
    }
  }, [progress, setProgress])

  useEffect(() => {
    const reload = async (modelId: string) => {
      if (!ref.current) return
      if (loadingRef.current) return
      if (currentModel !== modelId) {
        loadingRef.current = true
        console.log("reload", {
          modelId,
          currentModel,
        })
        try {
          await ref.current.reload(modelId, undefined, {
            model_list: WEB_LLM_MODELS,
          })
          setCurrentModel(modelId)
        } catch (error) {
        } finally {
          loadingRef.current = false
        }
      }
    }

    return document.addEventListener("reloadModel", (event) => {
      const modelId = (event as CustomEvent).detail
      reload(modelId)
    })
  }, [currentModel])

  useEffect(() => {
    async function init() {
      if (ref.current) return
      const chat = new webllm.ChatWorkerClient(
        new Worker(
          new URL("@/worker/web-worker/web-llm/llm.ts", import.meta.url),
          {
            type: "module",
          }
        )
      )

      chat.setInitProgressCallback((report) => {
        setProgress(report)
      })
      ref.current = chat
      navigator.serviceWorker.onmessage = async (event) => {
        const { type, data } = event.data
        if (type === "proxyMsg") {
          const res: any = await chat.chatCompletion(data)
          for await (const chunk of res) {
            event.ports[0].postMessage(chunk)
          }
          chat.resetChat()
          console.log(await chat.runtimeStatsText())
        }
      }
    }
    init()
    return () => {
      if (ref.current) {
        ref.current.unload()
      }
    }
  }, [setProgress])

  return {
    currentModel,
  }
}
