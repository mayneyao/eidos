import { isDesktopMode } from "@/lib/env"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useToast } from "@/components/ui/use-toast"
import { useTranslation } from "react-i18next"

/**
 * Hook to show a file or folder in the system's file manager
 * Supports both ~/space paths and @/mounted paths
 */
export function useShowInFileManager() {
  const { space } = useCurrentPathInfo()
  const { sqlite } = useSqlite()

  const showInFileManager = async (filePath: string) => {
    if (!isDesktopMode) return

    try {
      const eidos = window.eidos
      if (!eidos) return

      let absolutePath = ""
      if (filePath.startsWith("~/")) {
        const spaceInfo = await eidos.invoke("get-current-space")
        if (spaceInfo && spaceInfo.path) {
          // Remove ~/ and join with space path
          const relativePath = filePath.substring(2)
          const root = spaceInfo.path.endsWith("/") ? spaceInfo.path : `${spaceInfo.path}/`
          absolutePath = `${root}${relativePath}`
        }
      } else if (filePath.startsWith("@/")) {
        // Mounted folder: @/mountName/... format
        const parts = filePath.substring(2).split("/")
        const mountName = parts[0]

        if (!mountName) {
          console.warn("Invalid mounted path: missing mount name")
          return
        }

        // Resolve mount path using sqlite.kv.get
        if (!sqlite) {
          console.error("Database not available")
          return
        }

        const mountKey = `eidos:space:files:mount:${mountName}`
        const mountPath = await sqlite.kv.get(mountKey, 'text')

        if (!mountPath) {
          console.error(`Mount not found: ${mountName}`)
          return
        }

        const relativePath = parts.slice(1).join("/")

        // Join mount path with relative path
        if (relativePath) {
          const root = mountPath.endsWith("/") ? mountPath : `${mountPath}/`
          absolutePath = `${root}${relativePath}`
        } else {
          absolutePath = mountPath
        }
      } else {
        console.warn("Unsupported path format for opening in file manager:", filePath)
        return
      }

      if (absolutePath) {
        await eidos.showInFileManager(absolutePath)
      }
    } catch (error) {
      console.error("Failed to show in file manager:", error)
      throw error // Re-throw to let caller handle error
    }
  }

  return { showInFileManager }
}

/**
 * Hook for open in file manager action with error handling and toast notifications
 */
export function useOpenInFileManagerAction() {
  const { showInFileManager } = useShowInFileManager()
  const { toast } = useToast()
  const { t } = useTranslation()

  const openInFileManager = async (filePath: string, showToastOnError = true) => {
    try {
      await showInFileManager(filePath)
    } catch (error) {
      console.error("Failed to open file in file manager:", error)
      if (showToastOnError) {
        toast({
          title: t("nav.dropdown.menu.openInFileManagerError", "Failed to open in file manager"),
          variant: "destructive"
        })
      }
      throw error
    }
  }

  return { openInFileManager }
}
