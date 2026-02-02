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
        send: import('electron').IpcRenderer['send']
        invoke: import('electron').IpcRenderer['invoke']
        on: (channel: string, listener: IpcListener) => string | undefined
        off: (channel: string, listenerId: string) => void
        getEfsManager: () => Promise<import('@/lib/storage/eidos-file-system').EidosFileSystemManager>
        config: import('./config/index').ConfigManager
        selectFolder: () => Promise<string | undefined>
        showInFileManager: (path: string) => Promise<void>
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
        onWindowStateChange: (callback: (state: 'maximized' | 'restored') => void) => () => void
        initializePlayground: (space: string, blockId: string, files: PlaygroundFile[]) => Promise<string>
        getApiAgentStatus: () => Promise<import('./server/api-agent').ApiAgentStatus>
        onApiAgentStatusChanged: (callback: (status: import('./server/api-agent').ApiAgentStatus) => void) => () => void
        fetchAvailableModels: (apiKey: string, providerType: string, baseUrl?: string) => Promise<{ success: boolean, models?: any[], error?: string }>
        fetch: (url: string, options: RequestInit) => Promise<{ ok: boolean, status: number, statusText: string, headers: Record<string, string>, data: any, error?: string }>
        openUrl: (url: string) => Promise<void>
        AI: {
            generateText: typeof import('ai').generateText
            generateObject: typeof import('ai').generateObject
        }
        showNativeMenu: (items: NativeMenuItem[], position?: { clientX: number; clientY: number }) => Promise<void>
        on: (channel: string, listener: (...args: any[]) => void) => string | undefined
        off: (channel: string, listenerId: string) => void
        credentials: {
            setSyncCredentials: (credentials: SyncBucketCredentials, providerId: string = 'eidos.space') => Promise<void>
            getSyncCredentials: (providerId: string = 'eidos.space') => Promise<SyncBucketCredentials | null>
            clearSyncCredentials: (providerId: string = 'eidos.space') => Promise<void>
            hasSyncCredentials: (providerId: string = 'eidos.space') => Promise<boolean>
            testSyncConnection: (config: { endpoint: string; bucketName: string; region?: string; accessKeyId: string; secretAccessKey: string }) => Promise<{ success: boolean; message?: string; error?: string }>
        }
    }

}
