import { useMemo } from "react"
import { useLocation } from "react-router-dom"
import { getFileExtension } from "@/hooks/use-file-handlers"

/**
 * Hook to extract file path and related information from URL hash
 */
export function useFilePathFromHash() {
  const location = useLocation()

  const filePath = useMemo(() => {
    const hash = location.hash
    return hash.startsWith("#") ? hash.substring(1) : hash
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

