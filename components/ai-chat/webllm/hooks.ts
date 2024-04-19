import * as webllm from "@mlc-ai/web-llm"
import { useEffect, useRef, useState } from "react"
import { create } from "zustand"


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
  const ref = useRef<webllm.EngineInterface>()
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
      setCurrentModel(modelId)
      // if (!ref.current) return
      // if (loadingRef.current) return
      // if (currentModel !== modelId) {
      //   loadingRef.current = true
      //   console.log("reload", {
      //     modelId,
      //     currentModel,
      //   })
      //   try {
      //     await ref.current.reload(modelId, undefined, {
      //       model_list: WEB_LLM_MODELS,
      //     })
      //     setCurrentModel(modelId)
      //   } catch (error) {
      //   } finally {
      //     loadingRef.current = false
      //   }
      // }
    }

    return document.addEventListener("reloadModel", (event) => {
      const modelId = (event as CustomEvent).detail
      reload(modelId)
    })
  }, [currentModel])

  useEffect(() => {
    async function init() {
      if (ref.current || !currentModel.length) return
      const appConfig = webllm.prebuiltAppConfig
      // CHANGE THIS TO SEE EFFECTS OF BOTH, CODE BELOW DO NOT NEED TO CHANGE
      appConfig.useIndexedDBCache = true
      if (appConfig.useIndexedDBCache) {
        console.log("Using IndexedDB Cache")
      } else {
        console.log("Using Cache API")
      }
      const engine: webllm.EngineInterface = await webllm.CreateWebWorkerEngine(
        new Worker(
          new URL("@/worker/web-worker/web-llm/llm.ts", import.meta.url),
          {
            type: "module",
          }
        ),
        currentModel,
        {
          initProgressCallback: (report) => {
            setProgress(report)
          },
        }
      )
      ref.current = engine
      navigator.serviceWorker.addEventListener("message", async (event) => {
        const { type, data } = event.data
        if (type === "proxyMsg") {
          console.log(data)
          const res: any = await engine.chat.completions.create(data)
          for await (const chunk of res) {
            event.ports[0].postMessage(chunk)
          }
          console.log(await engine.runtimeStatsText())
          engine.resetChat()
        }
      })
    }
    init()
    return () => {
      if (ref.current) {
        ref.current.unload()
      }
    }
  }, [currentModel, setProgress])

  return {
    currentModel,
  }
}
