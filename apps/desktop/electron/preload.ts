import { contextBridge, ipcRenderer } from "electron"

import type { AppConfig } from "./modules/config/config-manager"
import { installElectronFetchProxy } from "./modules/network/fetch-proxy"
import { createPreloadApiByNamespace } from "@eidos.space/electron-ipc"

// AI related
import { applyCode as _applyCode } from "@/packages/ai/generate"
import { getProvider } from "@/packages/ai/helper"
import { generateObject, generateText } from "ai"

// Install fetch proxy to bypass CORS in preload context
// This allows AI SDK to make requests to external APIs without CORS restrictions
installElectronFetchProxy()

type IpcListener = (event: Electron.IpcRendererEvent, ...args: any[]) => void

const checkIsDataFolderSet = async () => {
  const dataFolder = await ipcRenderer.invoke("config:getConfig", "dataFolder")
  return !!dataFolder
}

const getConfigByModel = async (model: string) => {
  const aiConfig = await ipcRenderer.invoke("config:getAiConfig")

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
      apiVersion: llmProvider.apiVersion,
      name: llmProvider.name,
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
    apiVersion: modelConfig.apiVersion,
    name: modelConfig.name,
  })(modelConfig.modelId)
}

// this function must be a sync function, because it will be called in the main process, otherwise window.eidos will be undefined
function main() {
  // Ensure BrowserViews are cleaned up before the renderer reloads/unloads
  window.addEventListener("beforeunload", () => {
    ipcRenderer.send("browser.view:closeAll")
  })

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
      get: (key: keyof AppConfig) =>
        ipcRenderer.invoke("config:getConfig", key),
      set: (key: keyof AppConfig, value: any) =>
        ipcRenderer.invoke("config:setConfig", key, value),
    },
    checkIsDataFolderSet: checkIsDataFolderSet,
    selectFolder: () => ipcRenderer.invoke("file-system:selectFolder"),
    showInFileManager: (path: string) =>
      ipcRenderer.invoke("file-system:showInFileManager", path),
    openUrl: (url: string) => ipcRenderer.invoke("file-system:openUrl", url),
    reloadApp: () => ipcRenderer.invoke("app-lifecycle:reloadApp"),
    // Browser view namespace
    browser: {
      view: {
        ...createPreloadApiByNamespace("browser.view"),
        onUpdate: (
          viewId: string,
          callback: (data: {
            type: "loading" | "navigate" | "rawdata-navigation" | "title"
            isLoading?: boolean
            url?: string
            canGoBack?: boolean
            canGoForward?: boolean
            title?: string
            adapterPath?: string
          }) => void
        ) => {
          const listener = (
            _event: Electron.IpcRendererEvent,
            id: string,
            data: any
          ) => {
            if (id === viewId) callback(data)
          }
          ipcRenderer.on("browser.view:update", listener)
          return () => {
            ipcRenderer.removeListener("browser.view:update", listener)
          }
        },
        // Event listener for bounds update requests (after leaving fullscreen)
        onRequestBoundsUpdate: (viewId: string, callback: () => void) => {
          const listener = (_event: Electron.IpcRendererEvent, id: string) => {
            if (id === viewId) callback()
          }
          ipcRenderer.on("browser.view:requestBoundsUpdate", listener)
          return () => {
            ipcRenderer.removeListener(
              "browser.view:requestBoundsUpdate",
              listener
            )
          }
        },
        onNewTab: (
          callback: (data: {
            url: string
            frameName?: string
            features?: string
          }) => void
        ) => {
          const listener = (_event: Electron.IpcRendererEvent, data: any) => {
            callback(data)
          }
          ipcRenderer.on("browser.view:newTab", listener)
          return () => {
            ipcRenderer.removeListener("browser.view:newTab", listener)
          }
        },
        // Event listener for zoom level changes
        onZoomChanged: (callback: () => void) => {
          const listener = () => {
            callback()
          }
          ipcRenderer.on("browser.view:zoomChanged", listener)
          return () => {
            ipcRenderer.removeListener("browser.view:zoomChanged", listener)
          }
        },
        // Event listener for find in page results
        onFindInPageResult: (
          viewId: string,
          callback: (result: {
            requestId: number
            activeMatchOrdinal: number
            matches: number
          }) => void
        ) => {
          const listener = (
            _event: Electron.IpcRendererEvent,
            id: string,
            result: any
          ) => {
            if (id === viewId) callback(result)
          }
          ipcRenderer.on("browser.view:foundInPage", listener)
          return () => {
            ipcRenderer.removeListener("browser.view:foundInPage", listener)
          }
        },
      },
      find: {
        ...createPreloadApiByNamespace("browser.find"),
        // Event listener for find overlay updates
        onUpdate: (
          callback: (data: {
            findText?: string
            findMatches?: number
            findActiveMatch?: number
          }) => void
        ) => {
          const listener = (_event: Electron.IpcRendererEvent, data: any) =>
            callback(data)
          ipcRenderer.on("browser.find:update", listener)
          return () =>
            ipcRenderer.removeListener("browser.find:update", listener)
        },
      },
    },
    minimizeWindow: () => ipcRenderer.send("window-control", "minimize"),
    maximizeWindow: () => ipcRenderer.send("window-control", "maximize"),
    unmaximizeWindow: () => ipcRenderer.send("window-control", "unmaximize"),
    closeWindow: () => ipcRenderer.send("window-control", "close"),
    focusWindow: () => ipcRenderer.send("window-control", "focus"),

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

    checkForUpdates: () => ipcRenderer.invoke("app-lifecycle:checkForUpdates"),
    quitAndInstall: () => ipcRenderer.invoke("app-lifecycle:quitAndInstall"),

    // Credentials management (includes sync and relay operations)
    credentials: createPreloadApiByNamespace("sync"),
    relay: createPreloadApiByNamespace("relay"),
    contextMenu: createPreloadApiByNamespace("context-menu"),
    // License management
    license: createPreloadApiByNamespace("license"),
    space: createPreloadApiByNamespace("space"),
    spaceMgmt: createPreloadApiByNamespace("space-mgmt"),

    // AI helper functions
    fetchAvailableModels: (
      apiKey: string,
      providerType: string,
      baseUrl?: string
    ) =>
      ipcRenderer.invoke(
        "fetch:fetchAvailableModels",
        apiKey,
        providerType,
        baseUrl
      ),

    fetch(url: string, options: RequestInit = {}): Promise<Response> {
      return ipcRenderer
        .invoke("fetch:fetch", url, options)
        .then((data: any) => {
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
        await ipcRenderer.invoke("context-menu:showNativeContextMenu", {
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
      applyCode: async (config: {
        model: string
        originalCode: string
        updateSnippet: string
      }) => {
        console.log("preload applyCode", config)
        const { model, originalCode, updateSnippet } = config
        const reconstructedModel = await getModelByName(model)

        return _applyCode({
          originalCode,
          updateSnippet,
          model: reconstructedModel,
        })
      },
    },

    // Terminal integration (uses traditional naming, not migrated to service yet)
    terminal: {
      ...createPreloadApiByNamespace("terminal"),
      onData: (callback: (sessionId: string, data: string) => void) => {
        const listener = (
          _event: Electron.IpcRendererEvent,
          sessionId: string,
          data: string
        ) => callback(sessionId, data)
        ipcRenderer.on("terminal:data", listener)
        return () => ipcRenderer.removeListener("terminal:data", listener)
      },
      onExit: (
        callback: (sessionId: string, exitCode: number, signal?: number) => void
      ) => {
        const listener = (
          _event: Electron.IpcRendererEvent,
          sessionId: string,
          exitCode: number,
          signal?: number
        ) => callback(sessionId, exitCode, signal)
        ipcRenderer.on("terminal:exit", listener)
        return () => ipcRenderer.removeListener("terminal:exit", listener)
      },
    },

    // RawData service
    rawData: createPreloadApiByNamespace("rawdata"),

    // CLI installation
    cli: createPreloadApiByNamespace("cli"),
    // Market service
    market: createPreloadApiByNamespace("market"),
    // Agent channel status
    agentChannel: createPreloadApiByNamespace("agent-channel"),
  })
}
main()
