import { useCallback, useEffect, useMemo, useState } from "react"
import { useSqlite } from "./use-sqlite"
import type {
  IExtension,
  FileHandlerMeta,
} from "@/packages/core/types/IExtension"
import { useFileHandlerStore } from "@/apps/web-app/store/file-handler-store"
import { useAllFileHandlers } from "./use-all-file-handlers"

/**
 * Hook to query file handlers that support a specific file extension
 * Based on the responsive useAllFileHandlers hook
 */
export const useFileHandlers = (fileExtension: string) => {
  const { fileHandlers, loading } = useAllFileHandlers()

  // Filter handlers that support this file extension
  const handlers = useMemo(() => {
    if (!fileExtension) return []

    return fileHandlers.filter((handler) => {
      const meta = handler.meta as FileHandlerMeta
      return meta.fileHandler?.extensions?.includes(fileExtension) ?? false
    })
  }, [fileHandlers, fileExtension])

  return { handlers, isLoading: loading }
}

/**
 * Hook to manage default handler for a file extension
 * Uses cache to avoid redundant requests when switching between file types
 */
export const useDefaultHandler = (fileExtension: string) => {
  const { sqlite } = useSqlite()
  const getDefaultHandler = useFileHandlerStore(
    (state) => state.getDefaultHandler
  )
  const setDefaultHandlerCache = useFileHandlerStore(
    (state) => state.setDefaultHandler
  )
  const clearDefaultHandlerCache = useFileHandlerStore(
    (state) => state.clearDefaultHandlerCache
  )

  // Subscribe to cache changes for this file extension
  const cachedDefaultHandlerId = useFileHandlerStore((state) => {
    return state.defaultHandlerCache[fileExtension]
  })

  const [defaultHandlerId, setDefaultHandlerId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Sync local state with store cache when it changes
  useEffect(() => {
    if (cachedDefaultHandlerId !== undefined) {
      setDefaultHandlerId(cachedDefaultHandlerId)
      setIsLoading(false)
    }
  }, [cachedDefaultHandlerId])

  useEffect(() => {
    if (!sqlite || !fileExtension) {
      setDefaultHandlerId(null)
      setIsLoading(false)
      return
    }

    // Check cache first
    const cached = getDefaultHandler(fileExtension)
    if (cached !== undefined) {
      setDefaultHandlerId(cached)
      setIsLoading(false)
      return
    }

    const loadDefaultHandler = async () => {
      try {
        setIsLoading(true)
        const key = `eidos:space:file:handler:default:${fileExtension}`
        const handlerId = await sqlite.kv.get(key, "text")
        // Update cache
        setDefaultHandlerCache(fileExtension, handlerId)
        setDefaultHandlerId(handlerId)
      } catch (error) {
        console.error("Error loading default handler:", error)
        setDefaultHandlerId(null)
        // Cache null result to avoid repeated failed requests
        setDefaultHandlerCache(fileExtension, null)
      } finally {
        setIsLoading(false)
      }
    }

    loadDefaultHandler()
  }, [sqlite, fileExtension, getDefaultHandler, setDefaultHandlerCache])

  const setDefaultHandler = useCallback(
    async (handlerId: string) => {
      if (!sqlite || !fileExtension) return

      try {
        const key = `eidos:space:file:handler:default:${fileExtension}`
        await sqlite.kv.put(key, handlerId)
        // Update cache in store - this will automatically notify all subscribers
        setDefaultHandlerCache(fileExtension, handlerId)
        setDefaultHandlerId(handlerId)
      } catch (error) {
        console.error("Error setting default handler:", error)
      }
    },
    [sqlite, fileExtension, setDefaultHandlerCache]
  )

  const clearDefaultHandler = useCallback(async () => {
    if (!sqlite || !fileExtension) return

    try {
      const key = `eidos:space:file:handler:default:${fileExtension}`
      await sqlite.kv.delete(key)
      // Clear cache in store
      clearDefaultHandlerCache(fileExtension)
      setDefaultHandlerId(null)
    } catch (error) {
      console.error("Error clearing default handler:", error)
    }
  }, [sqlite, fileExtension, clearDefaultHandlerCache])

  return {
    defaultHandlerId,
    isLoading,
    setDefaultHandler,
    clearDefaultHandler,
  }
}

/**
 * Utility function to get file extension from a file path
 */
export const getFileExtension = (filePath: string): string => {
  const parts = filePath.split("/")
  const fileName = parts[parts.length - 1]
  const dotIndex = fileName.lastIndexOf(".")

  if (dotIndex === -1 || dotIndex === 0) {
    return ""
  }

  return fileName.substring(dotIndex).toLowerCase()
}
