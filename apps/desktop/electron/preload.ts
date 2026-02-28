import { contextBridge, ipcRenderer } from "electron"
import { getOriginPrivateDirectory } from "native-file-system-adapter"

import type { AppConfig } from "./config/index"
import type { PlaygroundFile } from "./file-system/playground"
import nodeAdapter from "./lib/node-adapter"
import type { ApiAgentStatus } from "./server/api-agent"

// AI related
import { generateText, generateObject } from "ai"
import { getProvider } from "@/packages/ai/helper"

type IpcListener = (event: Electron.IpcRendererEvent, ...args: any[]) => void

const checkIsDataFolderSet = async () => {
  const dataFolder = await ipcRenderer.invoke("get-config", "dataFolder")
  return !!dataFolder
}

const getConfigByModel = async (model: string) => {
  const aiConfig = await ipcRenderer.invoke("get-ai-config")

  if (!model?.includes("@")) {
    throw new Error(`Model ${model} is not valid`)
  }
  const [modelId, provider] = model.split("@")
  const llmProvider = aiConfig.llmProviders.find(
    (item: any) =>
      item?.name?.toLowerCase() === provider?.toLowerCase() && item.enabled
  )
  if (llmProvider) {
    return {
      baseUrl: llmProvider.baseUrl || "",
      apiKey: llmProvider.apiKey || "",
      modelId: modelId || "",
      type: llmProvider.type,
    }
  }
  throw new Error(`Provider ${provider} not found`)
}

const getModelByName = async (modelName: string) => {
  const modelConfig = await getConfigByModel(modelName)
  return getProvider({
    apiKey: modelConfig.apiKey,
    baseUrl: modelConfig.baseUrl,
    type: modelConfig.type,
  })(modelConfig.modelId)
}

// this function must be a sync function, because it will be called in the main process, otherwise window.eidos will be undefined
function main() {
  const listenerMap = new Map<string, Map<string, IpcListener>>()
  let listenerIdCounter = 0

  // we expose a readonly version of eidos, which only contains a invoke method
  //  eidosReadonly -> sqlite-msg-read -> main -> worker
  contextBridge.exposeInMainWorld("eidosReadonly", {
    invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
      const [channel, ...omit] = args
      return ipcRenderer.invoke(channel, ...omit)
    },
  })

  // --------- Expose some API to the Renderer process ---------
  contextBridge.exposeInMainWorld("eidos", {
    on(channel: string, listener: IpcListener) {
      if (typeof channel !== "string" || typeof listener !== "function") {
        throw new Error(
          "Invalid parameters for add listener for channel: " + channel
        )
      }
      if (!listenerMap.has(channel)) {
        listenerMap.set(channel, new Map())
      }

      const channelListeners = listenerMap.get(channel)!
      const listenerId = `listener_${++listenerIdCounter}`

      const wrappedListener = (
        event: Electron.IpcRendererEvent,
        ...args: any[]
      ) => {
        try {
          listener(event, ...args)
        } catch (error) {
          console.error(`Error in listener for ${channel}:`, error)
        }
      }

      channelListeners.set(listenerId, wrappedListener)
      ipcRenderer.on(channel, wrappedListener)

      return listenerId
    },

    off(channel: string, listenerId: string) {
      if (typeof channel !== "string" || typeof listenerId !== "string") {
        throw new Error(
          "Invalid parameters for remove listener for channel: " + channel
        )
      }

      const channelListeners = listenerMap.get(channel)
      if (!channelListeners) return

      const wrappedListener = channelListeners.get(listenerId)
      if (!wrappedListener) return

      channelListeners.delete(listenerId)
      ipcRenderer.removeListener(channel, wrappedListener)

      if (channelListeners.size === 0) {
        listenerMap.delete(channel)
      }
    },

    removeAllListeners(channel?: string) {
      if (channel) {
        const channelListeners = listenerMap.get(channel)
        if (channelListeners) {
          for (const [_, listener] of channelListeners) {
            ipcRenderer.removeListener(channel, listener)
          }
          listenerMap.delete(channel)
        }
      } else {
        for (const [channel, listeners] of listenerMap) {
          for (const [_, listener] of listeners) {
            ipcRenderer.removeListener(channel, listener)
          }
        }
        listenerMap.clear()
      }
    },

    send(...args: Parameters<typeof ipcRenderer.send>) {
      const [channel, ...omit] = args
      return ipcRenderer.send(channel, ...omit)
    },
    invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
      const [channel, ...omit] = args
      return ipcRenderer.invoke(channel, ...omit)
    },
    postMessage(...args: Parameters<typeof ipcRenderer.postMessage>) {
      const [channel, ...omit] = args
      return ipcRenderer.postMessage(channel, ...omit)
    },
    // versions
    chrome: process.versions.chrome,
    node: process.versions.node,
    // system info
    platform: process.platform,
    arch: process.arch,
    config: {
      get: (key: keyof AppConfig) => ipcRenderer.invoke("get-config", key),
      set: (key: keyof AppConfig, value: any) =>
        ipcRenderer.invoke("set-config", key, value),
    },
    checkIsDataFolderSet: checkIsDataFolderSet,
    selectFolder: () => ipcRenderer.invoke("select-folder"),
    showInFileManager: (path: string) =>
      ipcRenderer.invoke("show-in-file-manager", path),
    openUrl: (url: string) => ipcRenderer.invoke("open-url", url),
    reloadApp: () => ipcRenderer.invoke("reload-app"),
    initializePlayground: (
      space: string,
      blockId: string,
      files: PlaygroundFile[]
    ) => ipcRenderer.invoke("initialize-playground", space, blockId, files),
    minimizeWindow: () => ipcRenderer.send("window-control", "minimize"),
    maximizeWindow: () => ipcRenderer.send("window-control", "maximize"),
    unmaximizeWindow: () => ipcRenderer.send("window-control", "unmaximize"),
    closeWindow: () => ipcRenderer.send("window-control", "close"),

    onWindowStateChange: (
      callback: (state: "maximized" | "restored") => void
    ) => {
      const listener = (_: any, state: string) => {
        if (state === "maximized" || state === "restored") {
          callback(state)
        }
      }
      ipcRenderer.on("window-state-changed", listener)
      return () => ipcRenderer.removeListener("window-state-changed", listener)
    },

    // You can expose other APIs you need here.
    // ...

    // Add these new properties to eidos object
    onApiAgentStatusChanged: (callback: (status: ApiAgentStatus) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        status: ApiAgentStatus
      ) => callback(status)
      ipcRenderer.on("api-agent-status-changed", listener)

      return () => {
        console.log("remove listener")
        ipcRenderer.removeListener("api-agent-status-changed", listener)
      }
    },
    getApiAgentStatus: () => ipcRenderer.invoke("get-api-agent-status"),

    // Credentials management
    credentials: {
      setSyncCredentials: (credentials: any, providerId?: string) =>
        ipcRenderer.invoke("set-sync-credentials", credentials, providerId),
      getSyncCredentials: (providerId?: string) =>
        ipcRenderer.invoke("get-sync-credentials", providerId),
      clearSyncCredentials: (providerId?: string) =>
        ipcRenderer.invoke("clear-sync-credentials", providerId),
      hasSyncCredentials: (providerId?: string) =>
        ipcRenderer.invoke("has-sync-credentials", providerId),
      testSyncConnection: (config: {
        endpoint: string
        bucketName: string
        region?: string
        accessKeyId: string
        secretAccessKey: string
      }) => ipcRenderer.invoke("test-sync-connection", config),
    },
    // License management
    license: {
      activate: (licenseKey: string, token?: string) =>
        ipcRenderer.invoke("activate-license", licenseKey, token),
      getInfo: () => ipcRenderer.invoke("get-license-info"),
    },

    // AI helper functions
    fetchAvailableModels: (
      apiKey: string,
      providerType: string,
      baseUrl?: string
    ) =>
      ipcRenderer.invoke(
        "fetch-available-models",
        apiKey,
        providerType,
        baseUrl
      ),

    fetch(url: string, options: RequestInit = {}): Promise<Response> {
      return ipcRenderer.invoke("fetch", url, options).then((data: any) => {
        // Create a simple Response-like object
        return {
          ok: data.ok,
          status: data.status,
          statusText: data.statusText,
          headers: new Headers(data.headers),
          url: data.url,

          async text() {
            return new TextDecoder().decode(data.body)
          },

          async json() {
            const text = new TextDecoder().decode(data.body)
            return JSON.parse(text)
          },

          async blob() {
            const contentType =
              data.headers["content-type"] || "application/octet-stream"
            return new Blob([data.body], { type: contentType })
          },

          async arrayBuffer() {
            return data.body
          },
        } as Response
      })
    },

    /**
     * Show native context menu (only available in desktop Electron app)
     * @param items Menu items to display
     * @param event Optional mouse event to position the menu
     */
    showNativeMenu: async (
      items: Array<NativeMenuItem | null | undefined | false>,
      position?: { clientX: number; clientY: number }
    ): Promise<void> => {
      // Filter out null, undefined, and false items
      const filteredItems = items.filter(
        (item): item is NativeMenuItem => !!item
      )

      if (filteredItems.length === 0) {
        return
      }

      // Get position from position object
      let x: number | undefined
      let y: number | undefined

      if (position) {
        x = position.clientX
        y = position.clientY
      }

      try {
        await ipcRenderer.invoke("show-native-context-menu", {
          items: filteredItems,
          x,
          y,
        })
      } catch (error) {
        console.error("Error showing native context menu:", error)
        throw error
      }
    },
    AI: {
      generateText: async (config: {
        model: string
        prompt: string
        [key: string]: any
      }) => {
        console.log("preload generateText", config)
        const { model, ...restConfig } = config
        const reconstructedModel = await getModelByName(model)

        return generateText({
          ...restConfig,
          model: reconstructedModel,
        })
      },
      generateObject: async (config: {
        model: string
        prompt: string
        schema: any
        [key: string]: any
      }) => {
        console.log("preload generateObject", config)
        const { model, ...restConfig } = config
        const reconstructedModel = await getModelByName(model)

        return generateObject({
          ...restConfig,
          model: reconstructedModel,
        })
      },
    },
  })
}
main()
