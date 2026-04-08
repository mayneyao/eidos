import { contextBridge, ipcRenderer } from "electron"
import { createPreloadApiByNamespace } from "@eidos.space/electron-ipc"
import { getOriginPrivateDirectory } from "native-file-system-adapter"

// AI related
import { generateText, generateObject } from "ai"
import { getProvider } from "@/packages/ai/helper"
import { applyCode as _applyCode } from "@/packages/ai/generate"
import { installElectronFetchProxy } from "./lib/electron-fetch"
import { AppConfig } from "./config"
import { PlaygroundFile } from "./file-system/playground"
import { ApiAgentStatus } from "./server/api-agent"

// Install fetch proxy to bypass CORS in preload context
installElectronFetchProxy()

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

  if (!llmProvider) {
    throw new Error(`Provider ${provider} is not enabled`)
  }
  return { modelId, provider: llmProvider }
}

function main() {
  const initAI = () => {
    return {
      generateText: async (config: {
        model: string
        prompt: string
        [key: string]: any
      }) => {
        const { modelId, provider } = await getConfigByModel(config.model)
        const providerInstance = getProvider(provider)
        const result = await generateText({
          ...config,
          model: providerInstance(modelId),
        })
        return { text: result.text }
      },
      generateObject: async (config: {
        model: string
        prompt: string
        schema: any
        [key: string]: any
      }) => {
        const { modelId, provider } = await getConfigByModel(config.model)
        const providerInstance = getProvider(provider)
        const result = await generateObject({
          ...config,
          model: providerInstance(modelId),
        })
        return { object: result.object }
      },
      applyCode: async (config: {
        model: string
        originalCode: string
        updateSnippet: string
      }) => {
        const { modelId, provider } = await getConfigByModel(config.model)
        const providerInstance = getProvider(provider)
        return _applyCode({
          ...config,
          model: providerInstance(modelId),
        })
      },
    }
  }

  contextBridge.exposeInMainWorld("eidos", {
    platform: process.platform,
    arch: process.arch,
    chrome: process.versions.chrome,
    node: process.versions.node,
    getEfsManager: () => getOriginPrivateDirectory(),
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

    // ===== IPC Services (auto-discovered via registry) =====
    // Just specify namespace, methods are fetched automatically
    browserView: {
      ...createPreloadApiByNamespace("browser-view"),
      // Event listener for browser view updates (not an IPC method, uses send/on)
      onUpdate: (viewId: string, callback: (data: any) => void) => {
        const listener = (
          _event: Electron.IpcRendererEvent,
          id: string,
          data: any
        ) => {
          if (id === viewId) {
            callback(data)
          }
        }
        ipcRenderer.on("browser-view:update", listener)
        return () => ipcRenderer.removeListener("browser-view:update", listener)
      },
    },
    openData: createPreloadApiByNamespace("opendata"),
    // ======================================================

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

    showNativeMenu: (
      items: { id: string; label: string; type?: "normal" | "separator" }[],
      position?: { clientX: number; clientY: number }
    ) => ipcRenderer.invoke("show-native-menu", items, position),

    license: {
      activate: (licenseKey: string, token?: string | null) =>
        ipcRenderer.invoke("activate-license", licenseKey, token),
      getInfo: () => ipcRenderer.invoke("get-license-info"),
    },

    fetch: (url: string, options: RequestInit) =>
      ipcRenderer.invoke("electron-fetch", url, options),

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

    AI: initAI(),

    send: ipcRenderer.send,
    invoke: ipcRenderer.invoke,
    on: (channel: string, listener: IpcListener) => {
      const id = Math.random().toString(36).slice(2)
      const wrappedListener = (
        event: Electron.IpcRendererEvent,
        ...args: any[]
      ) => {
        listener(event, ...args)
      }
      ipcRenderer.on(channel, wrappedListener)
      return id
    },
    off: (channel: string, listenerId: string) => {
      // Note: electron's ipcRenderer doesn't support removing by ID
    },

    space: {
      getCurrent: () => ipcRenderer.invoke("space:get-current"),
      getById: (spaceId: string) =>
        ipcRenderer.invoke("space:get-by-id", spaceId),
    },

    terminal: {
      create: (options?: any) => ipcRenderer.invoke("terminal:create", options),
      write: (sessionId: string, data: string) =>
        ipcRenderer.invoke("terminal:write", sessionId, data),
      resize: (sessionId: string, cols: number, rows: number) =>
        ipcRenderer.invoke("terminal:resize", sessionId, cols, rows),
      kill: (sessionId: string) =>
        ipcRenderer.invoke("terminal:kill", sessionId),
      list: () => ipcRenderer.invoke("terminal:list"),
      getDefaultShell: () => ipcRenderer.invoke("terminal:get-default-shell"),
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

    cli: {
      isInstalled: () => ipcRenderer.invoke("cli:is-installed"),
      install: () => ipcRenderer.invoke("cli:install"),
      uninstall: () => ipcRenderer.invoke("cli:uninstall"),
      getPath: () => ipcRenderer.invoke("cli:get-path"),
    },
  })
}
main()
