import { useCallback, useEffect, useState } from "react"
import { create } from "zustand"

import { useLastOpened } from "@/apps/web-app/pages/[database]/hook"
import { MsgType } from "@/lib/const"
import { getWorker } from "@/packages/core/sqlite/worker"
import { SpaceFileSystem } from "@/lib/storage/space"
import { uuidv7 } from "@/lib/utils"

import { isDesktopMode } from "@/lib/env"
import { useSqlite } from "./use-sqlite"
import { useSqliteStore } from "@/apps/web-app/store/sqlite-store"

// Space File System Store
interface SpaceFileSystemState {
  spaceFileSystem: SpaceFileSystem | null
  isLoading: boolean
  error: string | null
}

interface SpaceFileSystemActions {
  setSpaceFileSystem: (system: SpaceFileSystem | null) => void
  initializeSpaceFileSystem: () => Promise<void>
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

type SpaceFileSystemStore = SpaceFileSystemState & SpaceFileSystemActions

const initialSpaceState: SpaceFileSystemState = {
  spaceFileSystem: null,
  isLoading: false,
  error: null
}

export const useSpaceFileSystemStore = create<SpaceFileSystemStore>((set) => ({
  ...initialSpaceState,

  setSpaceFileSystem: (system) => set({ spaceFileSystem: system }),

  initializeSpaceFileSystem: async () => {
    set({ isLoading: true, error: null })

    try {
      let system: SpaceFileSystem | null = null

      if (isDesktopMode) {
        if (typeof window !== 'undefined' && window.eidos) {
          system = await window.eidos.getSpaceFileSystem()
        }
      } else {
        system = new SpaceFileSystem()
      }

      set({ spaceFileSystem: system, isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to initialize space file system',
        isLoading: false
      })
    }
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error: error }),

  reset: () => set(initialSpaceState)
}))

export const useSpaceFileSystem = () => {
  const { spaceFileSystem, initializeSpaceFileSystem, isLoading, error } = useSpaceFileSystemStore()

  useEffect(() => {
    if (!spaceFileSystem && !isLoading && !error) {
      initializeSpaceFileSystem()
    }
  }, [spaceFileSystem, isLoading, error, initializeSpaceFileSystem])

  return { spaceFileSystem, isLoading, error, initializeSpaceFileSystem }
}

export type SpaceInfo = {
  isSyncEnabled: boolean
  graftId?: string
}

export const useSpaceInfo = (spaceName: string) => {
  const { spaceFileSystem } = useSpaceFileSystem()
  const [spaceInfo, setSpaceInfo] = useState<SpaceInfo | null>(null)

  const getSpaceInfo = useCallback(async (spaceName: string) => {
    if (!spaceName) {
      setSpaceInfo(null)
      return
    }
    if (spaceFileSystem) {
      const info = await spaceFileSystem.getSpaceInfo(spaceName)
      setSpaceInfo(info)
    }
  }, [spaceName, spaceFileSystem])

  useEffect(() => {
    getSpaceInfo(spaceName)
  }, [getSpaceInfo, spaceName])

  return { getSpaceInfo, spaceInfo }
}

export const useSpace = () => {
  const { setSpaceList, spaceList } = useSqliteStore()
  const { sqlite } = useSqlite()
  const { setLastOpenedDatabase } = useLastOpened()
  const { spaceFileSystem } = useSpaceFileSystem()

  const updateSpaceList = useCallback(async () => {
    if (isDesktopMode && typeof window !== 'undefined' && window.eidos) {
      // In desktop mode, use IPC to get workspace list
      try {
        const spaces = await window.eidos.invoke('list-spaces')
        const spaceNames = spaces.map((space: any) => space.id)
        setSpaceList(spaceNames)
      } catch (error) {
        console.error('Failed to get spaces from Electron:', error)
        // Fallback to old method
        if (spaceFileSystem) {
          const spaceNames = await spaceFileSystem.list()
          setSpaceList(spaceNames)
        }
      }
    } else if (spaceFileSystem) {
      // In web mode, use existing method
      const spaceNames = await spaceFileSystem.list()
      setSpaceList(spaceNames)
    }
  }, [setSpaceList, spaceFileSystem])

  useEffect(() => {
    updateSpaceList()
  }, [updateSpaceList])

  const exportSpace = useCallback(async (spaceName: string) => {
    if (spaceFileSystem) {
      await spaceFileSystem.export(spaceName)
    }
  }, [spaceFileSystem])

  const deleteSpace = useCallback(
    async (spaceName: string) => {
      if (isDesktopMode && typeof window !== 'undefined' && window.eidos) {
        // In desktop mode, use IPC to delete workspace
        try {
          const result = await window.eidos.invoke('remove-space', spaceName)
          if (result.success) {
            setLastOpenedDatabase("")
            await updateSpaceList()
          } else {
            throw new Error('Failed to remove space')
          }
        } catch (error) {
          console.error("Error deleting space:", error)
          throw error
        }
      } else if (spaceFileSystem) {
        // In web mode, use existing method
        try {
          await spaceFileSystem.remove(spaceName)
          setLastOpenedDatabase("")

          await new Promise(resolve => setTimeout(resolve, 100))

          const spaceNames = await spaceFileSystem.list()
          if (spaceNames.includes(spaceName)) {
            console.warn(`Space ${spaceName} still exists after deletion attempt`)
          }
          setSpaceList(spaceNames)
        } catch (error) {
          console.error("Error deleting space:", error)
          throw error
        }
      }
    },
    [setLastOpenedDatabase, spaceFileSystem, setSpaceList, updateSpaceList]
  )

  const rebuildIndex = useCallback(async () => {
    await sqlite?.doc.rebuildIndex({
      recreateFtsTable: true
    })
  }, [sqlite])

  const createSpace = useCallback(async (spaceName: string, enableSync: boolean = false, volumeId?: string) => {
    if (isDesktopMode && typeof window !== 'undefined' && window.eidos) {
      // In desktop mode, use new IPC interface
      try {
        const result = await window.eidos.invoke('register-space', spaceName, spaceName)
        if (result.success) {
          await updateSpaceList()
          return result
        } else {
          throw new Error(result.error || 'Failed to create space')
        }
      } catch (error) {
        console.error("Error creating space:", error)
        throw error
      }
    } else {
      // In web mode, use existing method
      if (spaceFileSystem) {
        await spaceFileSystem.create(spaceName)
      }

      const msgId = uuidv7()
      const worker = getWorker()

      const channel = new MessageChannel()
      worker.postMessage(
        {
          type: MsgType.CreateSpace,
          data: {
            spaceName,
          },
          id: msgId,
        },
        [channel.port2]
      )
      return new Promise((resolve) => {
        channel.port1.onmessage = (e) => {
          if (e.data.id === msgId) {
            resolve(e.data.data)
          }
          // close the channel
          channel.port1.close()
        }
      })
    }
  }, [spaceFileSystem, updateSpaceList])

  return {
    spaceList,
    updateSpaceList,
    createSpace,
    exportSpace,
    deleteSpace,
    rebuildIndex,
  }
}

export const useSpaceFileSystemLoading = () => useSpaceFileSystemStore((state) => state.isLoading)
export const useSpaceFileSystemError = () => useSpaceFileSystemStore((state) => state.error)
