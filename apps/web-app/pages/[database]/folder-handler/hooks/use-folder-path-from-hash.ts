import { useMemo } from "react"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { getFolderName } from "@/hooks/use-folder-handlers"

/**
 * Hook to extract folder path and related information from URL hash
 */
export function useFolderPathFromHash() {
  const { location } = useRouterAdapter()

  const folderPath = useMemo(() => {
    const hash = location.hash
    const rawPath = hash.startsWith("#") ? hash.substring(1) : hash
    // Decode URL-encoded characters (e.g., %20 -> space)
    return decodeURIComponent(rawPath)
  }, [location.hash])

  const folderName = useMemo(() => getFolderName(folderPath), [folderPath])

  return {
    folderPath,
    folderName,
  }
}
