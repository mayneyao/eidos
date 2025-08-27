import { create } from "zustand"
import { EidosFileSystemManager } from "@/lib/storage/eidos-file-system"
import { isDesktopMode } from "@/lib/env"
import { useEffect } from 'react'

interface FileSystemState {
    efsManager: EidosFileSystemManager | null

    isLoading: boolean

    error: string | null

    currentPath: string[]

    fileListCache: Map<string, any[]>

    operationHistory: Array<{
        type: 'create' | 'delete' | 'rename' | 'move'
        path: string[]
        timestamp: number
        success: boolean
    }>
}

interface FileSystemActions {
    setEfsManager: (manager: EidosFileSystemManager) => void

    initializeFileSystem: () => Promise<void>

    setLoading: (loading: boolean) => void

    setError: (error: string | null) => void

    setCurrentPath: (path: string[]) => void

    navigateTo: (path: string[]) => void

    addOperationHistory: (operation: Omit<FileSystemState['operationHistory'][0], 'timestamp'>) => void

    clearOperationHistory: () => void

    clearFileListCache: () => void

    reset: () => void
}

type FileSystemStore = FileSystemState & FileSystemActions

const initialState: FileSystemState = {
    efsManager: null,
    isLoading: false,
    error: null,
    currentPath: [],
    fileListCache: new Map(),
    operationHistory: []
}

export const useFileSystemStore = create<FileSystemStore>((set, get) => ({
    ...initialState,

    setEfsManager: (manager) => set({ efsManager: manager }),

    initializeFileSystem: async () => {
        set({ isLoading: true, error: null })

        try {
            let manager: EidosFileSystemManager = new EidosFileSystemManager()

            if (isDesktopMode) {
                if (typeof window !== 'undefined' && window.eidos) {
                    manager = await window.eidos.getEfsManager()
                }
            } else {
                manager = new EidosFileSystemManager()
            }

            set({ efsManager: manager, isLoading: false })
        } catch (error) {
            set({
                error: error instanceof Error ? error.message : 'Failed to initialize file system',
                isLoading: false
            })
        }
    },

    setLoading: (loading) => set({ isLoading: loading }),

    setError: (error) => set({ error }),

    setCurrentPath: (path) => set({ currentPath: path }),

    navigateTo: (path) => set({ currentPath: path }),

    addOperationHistory: (operation) => {
        const history = get().operationHistory
        const newOperation = {
            ...operation,
            timestamp: Date.now()
        }

        const updatedHistory = [...history, newOperation].slice(-100)
        set({ operationHistory: updatedHistory })
    },

    clearOperationHistory: () => set({ operationHistory: [] }),

    clearFileListCache: () => set({ fileListCache: new Map() }),

    reset: () => set(initialState)
}))


export const useEidosFileSystemInitialized = () => {
    const { efsManager, initializeFileSystem, isLoading, error } = useFileSystemStore()
    useEffect(() => {
        if (!isLoading && !error && !efsManager) {
            initializeFileSystem()
        }
    }, [efsManager, isLoading, error, initializeFileSystem])

}

export const useEidosFileSystemManager = () => {
    const { efsManager, initializeFileSystem, isLoading, error } = useFileSystemStore()

    // useEidosFileSystemInitialized will call at layout.tsx, so we can use efsManager here
    return {
        efsManager: efsManager as EidosFileSystemManager,
        isLoading,
        error,
        initializeFileSystem
    }
}

export const useEfsManager = () => useFileSystemStore((state) => state.efsManager)
export const useFileSystemLoading = () => useFileSystemStore((state) => state.isLoading)
export const useFileSystemError = () => useFileSystemStore((state) => state.error)
export const useCurrentPath = () => useFileSystemStore((state) => state.currentPath)
export const useOperationHistory = () => useFileSystemStore((state) => state.operationHistory)