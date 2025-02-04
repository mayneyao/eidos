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
    eidos: import('electron').IpcRenderer & {
        on: (channel: string, listener: IpcListener) => string | undefined
        off: (channel: string, listenerId: string) => void
        efsManager: import('@/lib/storage/eidos-file-system').EidosFileSystemManager
        spaceList: string[]
        spaceFileSystem: import('@/lib/storage/space').SpaceFileSystem
        openTabs: string[]
        config: import('./config/index').ConfigManager
        selectFolder: () => Promise<string | undefined>
        openFolder: (folder: string) => Promise<void>
        isDataFolderSet: boolean
        reloadApp: () => Promise<void>
        // 窗口控制方法
        minimizeWindow: () => void
        maximizeWindow: () => void
        unmaximizeWindow: () => void
        closeWindow: () => void
        // 窗口状态事件
        onWindowStateChange: (callback: (state: 'maximized' | 'restored') => void) => () => void
        initializePlayground: (space: string, blockId: string, files: PlaygroundFile[]) => Promise<string>
        getApiAgentStatus: () => Promise<import('./server/api-agent').ApiAgentStatus>
        onApiAgentStatusChanged: (callback: (status: import('./server/api-agent').ApiAgentStatus) => void) => () => void
    }
}
