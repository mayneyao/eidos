import { useCallback, useEffect, useState } from "react"
import { useSqlite } from "./use-sqlite"
import type { IExtension, FileHandlerMeta} from "@/packages/core/types/IExtension";
import { BlockExtensionType } from "@/packages/core/types/IExtension"

/**
 * Hook to query file handlers that support a specific file extension
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

        setHandlers(fileHandlers)
      } catch (error) {
        console.error("Error loading file handlers:", error)
        setHandlers([])
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

    const loadDefaultHandler = async () => {
      try {
        setIsLoading(true)
        const key = `eidos:space:file:handler:default:${fileExtension}`
        const handlerId = await sqlite.kv.get(key, 'text')
        setDefaultHandlerId(handlerId)
      } catch (error) {
        console.error("Error loading default handler:", error)
        setDefaultHandlerId(null)
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

