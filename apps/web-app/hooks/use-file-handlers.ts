import { useCallback, useEffect, useState } from "react"
import { useSqlite } from "./use-sqlite"
import type { IExtension, FileHandlerMeta} from "@/packages/core/types/IExtension";
import { BlockExtensionType } from "@/packages/core/types/IExtension"

// Cache for file handlers by extension
const handlersCache = new Map<string, IExtension<FileHandlerMeta>[]>()

// Cache for default handler IDs by extension
const defaultHandlerCache = new Map<string, string | null>()

/**
 * Hook to query file handlers that support a specific file extension
 * Uses cache to avoid redundant requests when switching between file types
 */
export const useFileHandlers = (fileExtension: string) => {
  const { sqlite } = useSqlite()
  const [handlers, setHandlers] = useState<IExtension<FileHandlerMeta>[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!sqlite || !fileExtension) {
      setHandlers([])
      setIsLoading(false)
      return
    }

    // Check cache first
    const cachedHandlers = handlersCache.get(fileExtension)
    if (cachedHandlers !== undefined) {
      setHandlers(cachedHandlers)
      setIsLoading(false)
      return
    }

    const loadHandlers = async () => {
      try {
        setIsLoading(true)
        // Get all extensions
        const allExtensions = await sqlite.extension.list()

        // Filter for file handler extensions that support this file extension
        const fileHandlers = allExtensions.filter((ext): ext is IExtension<FileHandlerMeta> => {
          if (ext.meta?.type !== BlockExtensionType.FileHandler) {
            return false
          }
          const meta = ext.meta as FileHandlerMeta
          return meta.fileHandler?.extensions?.includes(fileExtension) ?? false
        })

        // Update cache
        handlersCache.set(fileExtension, fileHandlers)
        setHandlers(fileHandlers)
      } catch (error) {
        console.error("Error loading file handlers:", error)
        setHandlers([])
        // Cache empty result to avoid repeated failed requests
        handlersCache.set(fileExtension, [])
      } finally {
        setIsLoading(false)
      }
    }

    loadHandlers()
  }, [sqlite, fileExtension])

  return { handlers, isLoading }
}

/**
 * Hook to manage default handler for a file extension
 * Uses cache to avoid redundant requests when switching between file types
 */
export const useDefaultHandler = (fileExtension: string) => {
  const { sqlite } = useSqlite()
  const [defaultHandlerId, setDefaultHandlerId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!sqlite || !fileExtension) {
      setDefaultHandlerId(null)
      setIsLoading(false)
      return
    }

    // Check cache first
    const cachedDefaultHandlerId = defaultHandlerCache.get(fileExtension)
    if (cachedDefaultHandlerId !== undefined) {
      setDefaultHandlerId(cachedDefaultHandlerId)
      setIsLoading(false)
      return
    }

    const loadDefaultHandler = async () => {
      try {
        setIsLoading(true)
        const key = `eidos:space:file:handler:default:${fileExtension}`
        const handlerId = await sqlite.kv.get(key, 'text')
        // Update cache
        defaultHandlerCache.set(fileExtension, handlerId)
        setDefaultHandlerId(handlerId)
      } catch (error) {
        console.error("Error loading default handler:", error)
        setDefaultHandlerId(null)
        // Cache null result to avoid repeated failed requests
        defaultHandlerCache.set(fileExtension, null)
      } finally {
        setIsLoading(false)
      }
    }

    loadDefaultHandler()
  }, [sqlite, fileExtension])

  const setDefaultHandler = useCallback(async (handlerId: string) => {
    if (!sqlite || !fileExtension) return

    try {
      const key = `eidos:space:file:handler:default:${fileExtension}`
      await sqlite.kv.put(key, handlerId)
      // Update cache
      defaultHandlerCache.set(fileExtension, handlerId)
      setDefaultHandlerId(handlerId)
    } catch (error) {
      console.error("Error setting default handler:", error)
    }
  }, [sqlite, fileExtension])

  const clearDefaultHandler = useCallback(async () => {
    if (!sqlite || !fileExtension) return

    try {
      const key = `eidos:space:file:handler:default:${fileExtension}`
      await sqlite.kv.delete(key)
      // Update cache
      defaultHandlerCache.set(fileExtension, null)
      setDefaultHandlerId(null)
    } catch (error) {
      console.error("Error clearing default handler:", error)
    }
  }, [sqlite, fileExtension])

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
  const parts = filePath.split('/')
  const fileName = parts[parts.length - 1]
  const dotIndex = fileName.lastIndexOf('.')

  if (dotIndex === -1 || dotIndex === 0) {
    return ''
  }

  return fileName.substring(dotIndex).toLowerCase()
}

