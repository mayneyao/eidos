import { useMemo } from "react"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { getFileExtension } from "@/hooks/use-file-handlers"

/**
 * Hook to extract file path and related information from URL hash
 */
export function useFilePathFromHash() {
  const { location } = useRouterAdapter()

  const filePath = useMemo(() => {
    const hash = location.hash
    const rawPath = hash.startsWith("#") ? hash.substring(1) : hash
    // Decode URL-encoded characters (e.g., %20 -> space)
    return decodeURIComponent(rawPath)
  }, [location.hash])

  const fileExtension = useMemo(
    () => getFileExtension(filePath),
    [filePath]
  )

  const fileName = useMemo(() => {
    const parts = filePath.split("/")
    return parts[parts.length - 1] || ""
  }, [filePath])

  return {
    filePath,
    fileExtension,
    fileName,
  }
}

