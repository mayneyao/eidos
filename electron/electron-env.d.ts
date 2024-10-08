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
        efsManager: import('@/lib/storage/eidos-file-system').EidosFileSystemManager
        spaceList: string[]
        spaceFileSystem: import('@/lib/storage/space').SpaceFileSystem
        openTabs: string[]
        config: import('./config/index').ConfigManager
        selectFolder: () => Promise<string | undefined>
        isDataFolderSet: boolean
        reloadApp: () => Promise<void>
    }
}