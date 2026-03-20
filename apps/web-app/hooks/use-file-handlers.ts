import { useCallback, useEffect, useMemo } from "react"
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
 * Hook to manage default handler for a file extension.
 *
 * Derives `isLoading` and `defaultHandlerId` directly from the Zustand
 * `defaultHandlerCache` rather than mirroring them into local state.
 *
 * Why: local state lags one render frame behind — on the render where
 * `fileExtension` changes the stale (old extension) isLoading/defaultHandlerId
 * would be returned, causing the selection logic downstream to pick the wrong
 * handler.  The Zustand selector is always synchronously correct for the
 * *current* `fileExtension`, so there is never a stale frame:
 *
 *   undefined  →  not fetched yet  →  isLoading = true
 *   null       →  fetched, no default set  →  isLoading = false, defaultHandlerId = null
 *   string     →  fetched, has a default  →  isLoading = false, defaultHandlerId = the ID
 *
 * Same-extension switching: the cache value is unchanged → isLoading stays
 * false, defaultHandlerId stays the same → no loading flash.
 * Different-extension switching (uncached): cache value is immediately
 * `undefined` for the new extension → isLoading = true on the very first
 * render → selection effect waits correctly.
 */
export const useDefaultHandler = (fileExtension: string) => {
  const { sqlite } = useSqlite()
  const setDefaultHandlerCache = useFileHandlerStore(
    (state) => state.setDefaultHandler
  )
  const clearDefaultHandlerCache = useFileHandlerStore(
    (state) => state.clearDefaultHandlerCache
  )

  // Single source of truth: read directly from the Zustand cache.
  // undefined = not yet fetched (treat as loading)
  // null      = fetched, no default configured
  // string    = fetched, has a default handler ID
  const cachedValue = useFileHandlerStore(
    (state) => state.defaultHandlerCache[fileExtension]
  )

  const isCached = cachedValue !== undefined
  const defaultHandlerId = isCached ? cachedValue : null
  const isLoading = !isCached && !!fileExtension

  // Fetch from SQLite and populate the cache when not yet cached
  useEffect(() => {
    if (!sqlite || !fileExtension || isCached) return

    const loadDefaultHandler = async () => {
      try {
        const key = `eidos:space:file:handler:default:${fileExtension}`
        const handlerId = await sqlite.kv.get(key, "text")
        setDefaultHandlerCache(fileExtension, handlerId)
      } catch (error) {
        console.error("Error loading default handler:", error)
        // Cache null so we don't retry on every render
        setDefaultHandlerCache(fileExtension, null)
      }
    }

    loadDefaultHandler()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sqlite, fileExtension, isCached])

  const setDefaultHandler = useCallback(
    async (handlerId: string) => {
      if (!sqlite || !fileExtension) return

      try {
        const key = `eidos:space:file:handler:default:${fileExtension}`
        await sqlite.kv.put(key, handlerId)
        setDefaultHandlerCache(fileExtension, handlerId)
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
      clearDefaultHandlerCache(fileExtension)
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
