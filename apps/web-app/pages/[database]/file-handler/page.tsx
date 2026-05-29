import { useCallback } from "react"
import { CopyIcon, FileCodeIcon, FolderOpen, LinkIcon } from "lucide-react"

import { useRegisterTabContextMenuItem } from "@/hooks/use-tab-context-menu-registry"
import {
  useOpenInFileManagerAction,
  useResolveFilePath,
} from "@/hooks/use-show-in-file-manager"
import { useToast } from "@/components/ui/use-toast"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useTabTitle } from "@/apps/web-app/hooks/use-tab-title"

import { HandlerRenderer } from "./components/handler-renderer"
import { LoadingState } from "./components/loading-state"
import { NoFilePathState } from "./components/no-file-path-state"
import { NoHandlerState } from "./components/no-handler-state"
import { useFilePathFromHash } from "./hooks/use-file-path-from-hash"
import { useHandlerSelection } from "./hooks/use-handler-selection"

export function FileHandlerPage() {
  const { filePath, fileExtension, fileName } = useFilePathFromHash()
  useTabTitle(fileName)
  const { handlers, selectedHandler, isLoadingHandlers, isLoadingDefault } =
    useHandlerSelection(fileExtension)
  const { navigate } = useRouterAdapter()
  const { toast } = useToast()
  const { openInFileManager } = useOpenInFileManagerAction()
  const { resolveFilePath } = useResolveFilePath()

  const copyFilePath = useCallback(async () => {
    if (!filePath) return
    if (!navigator?.clipboard?.writeText) {
      toast({ title: "Cannot copy file path", variant: "destructive" })
      return
    }
    try {
      await navigator.clipboard.writeText(filePath)
      toast({ title: "Copied file path", description: filePath })
    } catch (error) {
      toast({
        title: "Failed to copy file path",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      })
    }
  }, [filePath, toast])

  const revealInFinder = useCallback(async () => {
    if (filePath) await openInFileManager(filePath)
  }, [filePath, openInFileManager])

  const copyPhysicalPath = useCallback(async () => {
    if (!filePath) return
    const physicalPath = await resolveFilePath(filePath)
    if (!physicalPath) {
      toast({
        title: "Cannot resolve physical path",
        description: "This path cannot be resolved to a physical location",
        variant: "destructive",
      })
      return
    }
    if (!navigator?.clipboard?.writeText) {
      toast({ title: "Cannot copy path", variant: "destructive" })
      return
    }
    try {
      await navigator.clipboard.writeText(physicalPath)
      toast({ title: "Copied physical path", description: physicalPath })
    } catch (error) {
      toast({
        title: "Failed to copy path",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      })
    }
  }, [filePath, resolveFilePath, toast])

  const viewHandler = useCallback(() => {
    if (selectedHandler) navigate(`/extensions/${selectedHandler.id}`)
  }, [selectedHandler, navigate])

  useRegisterTabContextMenuItem("/file-handler", {
    id: "copy-file-path",
    label: "Copy file path",
    Icon: CopyIcon,
    onClick: copyFilePath,
  })

  useRegisterTabContextMenuItem("/file-handler", {
    id: "reveal-in-finder",
    label: "Reveal in Finder",
    Icon: FolderOpen,
    onClick: revealInFinder,
  })

  useRegisterTabContextMenuItem("/file-handler", {
    id: "copy-physical-path",
    label: "Copy Physical Path",
    Icon: LinkIcon,
    onClick: copyPhysicalPath,
  })

  useRegisterTabContextMenuItem("/file-handler", {
    id: "view-handler",
    label: "View Handler",
    Icon: FileCodeIcon,
    onClick: viewHandler,
  })

  // No file path
  if (!filePath) {
    return <NoFilePathState />
  }

  // No handlers available
  if (handlers.length === 0) {
    return <NoHandlerState fileExtension={fileExtension} fileName={fileName} />
  }

  // Render the selected handler
  if (selectedHandler) {
    return (
      <div className="h-screen flex flex-col">
        <div className="flex-1 overflow-hidden">
          <HandlerRenderer handlerId={selectedHandler.id} filePath={filePath} />
        </div>
      </div>
    )
  }

  // This should not happen, but handle it gracefully
  return <LoadingState />
}
