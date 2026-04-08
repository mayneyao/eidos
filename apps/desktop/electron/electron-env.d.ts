// oxlint-disable import-type-annotations
// oxlint-disable consistent-type-imports
/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬ dist
     * │ ├─┬ electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │ ├── index.html
     * │ ├── ...other-static-files-from-public
     * │
     * ```
     */
    DIST: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`

interface Window {
  eidos: {
    send: import("electron").IpcRenderer["send"]
    invoke: import("electron").IpcRenderer["invoke"]
    on: (channel: string, listener: IpcListener) => string | undefined
    off: (channel: string, listenerId: string) => void
    getEfsManager: () => Promise<
      import("@/lib/storage/eidos-file-system").EidosFileSystemManager
    >
    config: {
      get: (key: string) => Promise<any>
      set: (key: string, value: any) => Promise<void>
    }
    selectFolder: () => Promise<string | undefined>
    showInFileManager: (
      path: string
    ) => Promise<{ success: boolean; error?: string }>
    checkIsDataFolderSet: () => Promise<boolean>
    reloadApp: () => Promise<void>
    minimizeWindow: () => void
    maximizeWindow: () => void
    unmaximizeWindow: () => void
    closeWindow: () => void
    // system info
    platform: string
    arch: string
    chrome: string
    node: string
    onWindowStateChange: (
      callback: (state: "maximized" | "restored") => void
    ) => () => void
    getApiAgentStatus: () => Promise<
      import("./server/api-agent").ApiAgentStatus
    >
    checkForUpdates: () => Promise<void>
    quitAndInstall: () => Promise<void>
    onApiAgentStatusChanged: (
      callback: (status: import("./server/api-agent").ApiAgentStatus) => void
    ) => () => void
    fetchAvailableModels: (
      apiKey: string,
      providerType: string,
      baseUrl?: string
    ) => Promise<{ success: boolean; models?: any[]; error?: string }>
    quitApp: () => Promise<void>
    fetch: (
      url: string,
      options: RequestInit
    ) => Promise<{
      ok: boolean
      status: number
      statusText: string
      headers: Record<string, string>
      data: any
      error?: string
    }>
    openUrl: (url: string) => Promise<{ success: boolean; error?: string }>
    browserView: import("@eidos.space/electron-ipc").ExtractIpcApi<
      typeof import("./window-manager/browser-view-manager").BrowserViewManager
    > & {
      // Event listener for browser view state updates
      onUpdate: (
        viewId: string,
        callback: (data: {
          type: "navigate" | "loading" | "rawdata-navigation"
          url?: string
          canGoBack?: boolean
          canGoForward?: boolean
          isLoading?: boolean
        }) => void
      ) => () => void
    }
    AI: {
      generateText: (config: {
        model: string
        prompt: string
        [key: string]: any
      }) => Promise<{ text: string }>
      generateObject: (config: {
        model: string
        prompt: string
        schema: any
        [key: string]: any
      }) => Promise<{ object: any }>
      applyCode: (config: {
        model: string
        originalCode: string
        updateSnippet: string
      }) => Promise<string>
    }
    showNativeMenu: (
      items: NativeMenuItem[],
      position?: { clientX: number; clientY: number }
    ) => Promise<void>
    contextMenu: import("@eidos.space/electron-ipc").ExtractIpcApi<
      typeof import("./services/context-menu-service").ContextMenuService
    >
    on: (
      channel: string,
      listener: (...args: any[]) => void
    ) => string | undefined
    off: (channel: string, listenerId: string) => void
    credentials: import("@eidos.space/electron-ipc").ExtractIpcApi<
      typeof import("./services/sync-service").SyncService
    >
    relay: import("@eidos.space/electron-ipc").ExtractIpcApi<
      typeof import("./services/relay-service").RelayService
    >
    license: import("@eidos.space/electron-ipc").ExtractIpcApi<
      typeof import("./services/license-service").LicenseService
    >
    space: import("@eidos.space/electron-ipc").ExtractIpcApi<
      typeof import("./services/data-space-service").DataSpaceService
    >
    spaceMgmt: import("@eidos.space/electron-ipc").ExtractIpcApi<
      typeof import("./services/space-management-service").SpaceManagementService
    >
    terminal: import("@eidos.space/electron-ipc").ExtractIpcApi<
      typeof import("./services/terminal-service").TerminalService
    > & {
      onData: (
        callback: (sessionId: string, data: string) => void
      ) => () => void
      onExit: (
        callback: (sessionId: string, exitCode: number, signal?: number) => void
      ) => () => void
    }
    cli: import("@eidos.space/electron-ipc").ExtractIpcApi<
      typeof import("./services/cli-service").CliService
    >
    openData: import("@eidos.space/electron-ipc").ExtractIpcApi<
      typeof import("./services/opendata-service").OpenDataService
    >
    pipeline: import("@eidos.space/electron-ipc").ExtractIpcApi<
      typeof import("./services/pipeline-service").PipelineService
    >
  }
}
