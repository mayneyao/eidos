import { useCallback, useEffect, useMemo, useState } from "react"
import { useSqlite } from "./use-sqlite"
import type {
  IExtension,
  FolderHandlerMeta,
} from "@/packages/core/types/IExtension"
import { useFolderHandlerStore } from "@/apps/web-app/store/folder-handler-store"

/**
 * Check if a folder path matches a pattern
 * Supports wildcards: * matches any sequence of characters
 * Examples:
 * - "*\/photos" matches "~/photos", "@/work/photos"
 * - "~/projects/*" matches "~/projects/abc", "~/projects/xyz"
 * - "*" matches any path
 */
export function matchFolderPattern(
  folderPath: string,
  pattern: string
): boolean {
  // Normalize path (remove trailing slash for consistent matching)
  const normalizedPath = folderPath.replace(/\/$/, "")
  const normalizedPattern = pattern.replace(/\/$/, "")

  // Convert pattern to regex
  // Escape special regex characters except *
  const escapedPattern = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")

  const regex = new RegExp(`^${escapedPattern}$`)
  return regex.test(normalizedPath)
}

/**
 * Extract folder name from a folder path
 */
export function getFolderName(folderPath: string): string {
  const parts = folderPath.split("/").filter(Boolean)
  return parts[parts.length - 1] || ""
}

/**
 * Filter and sort folder handlers for a specific folder path
 */
export function filterFolderHandlers(
  folderPath: string,
  handlers: IExtension<FolderHandlerMeta>[]
): IExtension<FolderHandlerMeta>[] {
  if (!folderPath) return []

  const matched = handlers.filter((handler) => {
    const meta = handler.meta as FolderHandlerMeta
    const patterns = meta.folderHandler?.patterns || []
    return patterns.some((pattern) => matchFolderPattern(folderPath, pattern))
  })

  // Sort by priority (higher first), default priority is 0
  return matched.sort((a, b) => {
    const priorityA = (a.meta as FolderHandlerMeta).folderHandler?.priority ?? 0
    const priorityB = (b.meta as FolderHandlerMeta).folderHandler?.priority ?? 0
    return priorityB - priorityA
  })
}

/**
 * Hook to manage default handler for a folder path
 * Uses cache to avoid redundant requests when switching between folders
 */
export const useDefaultFolderHandler = (folderPath: string) => {
  const { sqlite } = useSqlite()
  const getDefaultHandler = useFolderHandlerStore(
    (state) => state.getDefaultHandler
  )
  const setDefaultHandlerCache = useFolderHandlerStore(
    (state) => state.setDefaultHandler
  )
  const clearDefaultHandlerCache = useFolderHandlerStore(
    (state) => state.clearDefaultHandlerCache
  )

  // Subscribe to cache changes for this folder path
  const cachedDefaultHandlerId = useFolderHandlerStore((state) => {
    return state.defaultHandlerCache[folderPath]
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
    if (!sqlite || !folderPath) {
      setDefaultHandlerId(null)
      setIsLoading(false)
      return
    }

    // Check cache first
    const cached = getDefaultHandler(folderPath)
    if (cached !== undefined) {
      setDefaultHandlerId(cached)
      setIsLoading(false)
      return
    }

    const loadDefaultHandler = async () => {
      try {
        setIsLoading(true)
        const key = `eidos:space:folder:handler:default:${folderPath}`
        const handlerId = await sqlite.kv.get(key, "text")
        // Update cache
        setDefaultHandlerCache(folderPath, handlerId)
        setDefaultHandlerId(handlerId)
      } catch (error) {
        console.error("Error loading default folder handler:", error)
        setDefaultHandlerId(null)
        // Cache null result to avoid repeated failed requests
        setDefaultHandlerCache(folderPath, null)
      } finally {
        setIsLoading(false)
      }
    }

    loadDefaultHandler()
  }, [sqlite, folderPath, getDefaultHandler, setDefaultHandlerCache])

  const setDefaultHandler = useCallback(
    async (handlerId: string) => {
      if (!sqlite || !folderPath) return

      try {
        const key = `eidos:space:folder:handler:default:${folderPath}`
        await sqlite.kv.put(key, handlerId)
        // Update cache in store - this will automatically notify all subscribers
        setDefaultHandlerCache(folderPath, handlerId)
        setDefaultHandlerId(handlerId)
      } catch (error) {
        console.error("Error setting default folder handler:", error)
      }
    },
    [sqlite, folderPath, setDefaultHandlerCache]
  )

  const clearDefaultHandler = useCallback(async () => {
    if (!sqlite || !folderPath) return

    try {
      const key = `eidos:space:folder:handler:default:${folderPath}`
      await sqlite.kv.delete(key)
      // Clear cache in store
      clearDefaultHandlerCache(folderPath)
      setDefaultHandlerId(null)
    } catch (error) {
      console.error("Error clearing default folder handler:", error)
    }
  }, [sqlite, folderPath, clearDefaultHandlerCache])

  return {
    defaultHandlerId,
    isLoading,
    setDefaultHandler,
    clearDefaultHandler,
  }
}
