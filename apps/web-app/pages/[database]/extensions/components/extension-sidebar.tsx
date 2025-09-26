import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"
import { useAllExtensions } from "@/apps/web-app/hooks/use-all-extensions"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"

import { ExtensionSidebarHeader } from "./extension-sidebar-header"
import { ExtensionList } from "./extension-list"

interface ExtensionSidebarProps {
  className?: string
}

export const ExtensionSidebar = ({ className }: ExtensionSidebarProps) => {
  const { space } = useCurrentPathInfo()
  const { scriptId } = useParams()
  const { toast } = useToast()
  const navigate = useNavigate()
  const {
    extensions: allExtensions,
    deleteExtension,
    renameExtension,
    searchTerm,
  } = useAllExtensions()
  const [renamingExtension, setRenamingExtension] = useState<{
    id: string
    currentSlug: string
  } | null>(null)
  const [newSlug, setNewSlug] = useState("")
  const [isRenaming, setIsRenaming] = useState(false)

  // Handle extension deletion with navigation
  const handleDeleteExtension = async (id: string) => {
    const success = await deleteExtension(id)
    if (success) {
      // Navigate to extensions index page after successful deletion
      navigate(`/${space}/extensions`)
    } else {
      // Show error toast if deletion failed
      toast({
        title: "Failed to delete extension",
        description: "An error occurred while deleting the extension",
        variant: "destructive",
      })
    }
  }

  const handleRenameExtension = (extensionId: string, currentSlug: string) => {
    setRenamingExtension({ id: extensionId, currentSlug })
    setNewSlug(currentSlug)
  }

  const handleConfirmRename = async (updatedSlug?: string) => {
    const slugToUse = updatedSlug || newSlug
    if (!renamingExtension || !slugToUse.trim() || isRenaming) return

    setIsRenaming(true)
    const result = await renameExtension(renamingExtension.id, slugToUse.trim())

    if (result.success) {
      // Silent success - no toast notification for routine operations
      setRenamingExtension(null)
      setNewSlug("")
    } else {
      // Show toast only for errors
      toast({
        title: "Failed to rename extension",
        description: result.error,
        variant: "destructive",
      })
    }
    setIsRenaming(false)
  }

  const handleCancelRename = () => {
    setRenamingExtension(null)
    setNewSlug("")
    setIsRenaming(false)
  }


  return (
    <div
      className={cn(
        "w-full flex flex-col h-full",
        className
      )}
    >
      <ExtensionSidebarHeader />

      <div className="flex-1 min-h-0">
        <ExtensionList
          extensions={allExtensions}
          space={space}
          scriptId={scriptId}
          searchTerm={searchTerm}
          renamingExtension={renamingExtension}
          onRename={handleRenameExtension}
          onConfirmRename={handleConfirmRename}
          onCancelRename={handleCancelRename}
          onDelete={handleDeleteExtension}
        />
      </div>
    </div>
  )
}
