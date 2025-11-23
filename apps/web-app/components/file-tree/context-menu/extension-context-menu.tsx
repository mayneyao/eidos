"use client"

import type { IDirectoryEntry } from "@eidos.space/core/types/IExternalFileSystem"
import {
  CopyIcon,
  FilesIcon,
  PencilLineIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react"
import React, { useState } from "react"
import { useTranslation } from "react-i18next"

import { useFavBlocks } from "@/apps/web-app/hooks/use-fav-blocks"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface FileTreeNode extends IDirectoryEntry {
  children?: FileTreeNode[]
}

interface ExtensionContextMenuProps {
  node: FileTreeNode
  children: React.ReactNode
  onRename?: (node: FileTreeNode) => void
  onDelete?: (node: FileTreeNode) => void
  onCopySlug?: (node: FileTreeNode) => void
  onCopy?: (node: FileTreeNode) => void
}

/**
 * Context menu specifically for extension nodes
 */
export const ExtensionContextMenu = ({
  node,
  children,
  onRename,
  onDelete,
  onCopySlug,
  onCopy,
}: ExtensionContextMenuProps) => {
  const { t } = useTranslation()
  const { isFavorite, toggleFavBlock } = useFavBlocks()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const extensionType = node.metadata?.extensionType || "script"
  const extensionIcon = node.metadata?.icon
  const nodeId = node.metadata?.nodeId

  // Check if extension is pinned (only for block type extensions)
  const isExtensionPinned =
    extensionType === "block" && nodeId && isFavorite(nodeId)

  const handleDelete = () => {
    // Extensions require confirmation
    setShowDeleteDialog(true)
  }

  const handleConfirmDelete = () => {
    if (onDelete) {
      onDelete(node)
    }
    setShowDeleteDialog(false)
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger className="w-full">{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {/* Pin/Unpin for block type extensions */}
          {extensionType === "block" && nodeId && (
            <ContextMenuItem
              onClick={() => {
                toggleFavBlock({
                  id: nodeId,
                  name: node.name,
                  icon: extensionIcon,
                })
              }}
            >
              {isExtensionPinned ? (
                <>
                  <PinOffIcon className="mr-2 h-4 w-4" />
                  {t("common.unpin", "Unpin")}
                </>
              ) : (
                <>
                  <PinIcon className="mr-2 h-4 w-4" />
                  {t("common.pin", "Pin")}
                </>
              )}
            </ContextMenuItem>
          )}
          {onRename && (
            <ContextMenuItem onClick={() => onRename(node)}>
              <PencilLineIcon className="mr-2 h-4 w-4" />
              {t("node.menu.rename", "Rename")}
            </ContextMenuItem>
          )}
          {onCopySlug && (
            <ContextMenuItem onClick={() => onCopySlug(node)}>
              <CopyIcon className="mr-2 h-4 w-4" />
              {t("extension.copySlug", "Copy Slug")}
            </ContextMenuItem>
          )}
          {onCopy && (
            <ContextMenuItem onClick={() => onCopy(node)}>
              <FilesIcon className="mr-2 h-4 w-4" />
              {t("extension.duplicate", "Duplicate")}
            </ContextMenuItem>
          )}
          {onDelete && (
            <ContextMenuItem
              onClick={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2Icon className="mr-2 h-4 w-4" />
              {t("common.delete", "Delete")}
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Delete confirmation dialog for extensions */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("common.confirmDelete", "Confirm Delete")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "extension.deleteWarning",
                "Are you sure you want to delete this extension? This action cannot be undone."
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              {t("common.delete", "Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

