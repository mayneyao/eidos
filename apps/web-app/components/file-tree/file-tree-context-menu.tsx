"use client"

import React, { useState } from "react"
import type { IDirectoryEntry } from "@eidos.space/core/types/IExternalFileSystem"
import {
  ClipboardPasteIcon,
  CopyIcon,
  FileIcon,
  MessageSquareIcon,
  PencilLineIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
  FolderPlusIcon,
  FilePlus2Icon,
  FileSpreadsheetIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useFavBlocks } from "@/apps/web-app/hooks/use-fav-blocks"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
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
import { Button } from "@/components/ui/button"

interface FileTreeNode extends IDirectoryEntry {
  children?: FileTreeNode[]
}

interface FileTreeContextMenuProps {
  node: FileTreeNode
  children: React.ReactNode
  onRename?: (node: FileTreeNode) => void
  onDelete?: (node: FileTreeNode) => void
  onPin?: (node: FileTreeNode) => void
  onUnpin?: (node: FileTreeNode) => void
  onAddToChat?: (node: FileTreeNode) => void
  onCreateDoc?: (parentNode: FileTreeNode) => void
  onCreateTable?: (parentNode: FileTreeNode) => void
  onCreateFolder?: (parentNode: FileTreeNode) => void
  onCopySlug?: (node: FileTreeNode) => void
}

/**
 * Context menu for FileTree nodes
 * Provides different menu items based on node type (metadata.nodeType)
 */
export const FileTreeContextMenu = ({
  node,
  children,
  onRename,
  onDelete,
  onPin,
  onUnpin,
  onAddToChat,
  onCreateDoc,
  onCreateTable,
  onCreateFolder,
  onCopySlug,
}: FileTreeContextMenuProps) => {
  const { t } = useTranslation()
  const { isFavorite, toggleFavBlock } = useFavBlocks()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const nodeType = node.metadata?.nodeType
  const isPinned = node.metadata?.isPinned
  const isFolder = node.kind === "directory" || nodeType === "folder"
  const isExtension = nodeType === "extension"
  const isNode = nodeType && nodeType !== "extension"
  
  // Check if extension is pinned (only for block type extensions)
  const isExtensionPinned = isExtension && node.metadata?.nodeId && isFavorite(node.metadata.nodeId)

  const handleDelete = () => {
    if (isExtension) {
      // Extensions require confirmation
      setShowDeleteDialog(true)
    } else if (onDelete) {
      onDelete(node)
    }
  }

  const handleConfirmDelete = () => {
    if (onDelete) {
      onDelete(node)
    }
    setShowDeleteDialog(false)
  }

  // For regular files (no metadata), show minimal context menu
  if (!nodeType) {
    return (
      <ContextMenu>
        <ContextMenuTrigger className="w-full">{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {onRename && (
            <ContextMenuItem onClick={(e) => onRename(node, e)}>
              <PencilLineIcon className="mr-2 h-4 w-4" />
              {t("node.menu.rename", "Rename")}
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
    )
  }

  // For extensions, show extension-specific menu
  if (isExtension) {
    // Get extension type from metadata (stored in the virtual path)
    const extensionType = node.metadata?.extensionType || "script"
    const extensionIcon = node.metadata?.icon
    
    return (
      <>
        <ContextMenu>
          <ContextMenuTrigger className="w-full">{children}</ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            {/* Pin/Unpin for block type extensions */}
            {extensionType === "block" && node.metadata?.nodeId && (
              <ContextMenuItem
                onClick={() => {
                  toggleFavBlock({
                    id: node.metadata!.nodeId!,
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
              <ContextMenuItem onClick={(e) => onRename(node, e)}>
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
              <DialogTitle>{t("common.confirmDelete", "Confirm Delete")}</DialogTitle>
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

  // For nodes (table, doc, folder, etc.), show node-specific menu
  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full">{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {/* Basic operations */}
        {onDelete && (
          <ContextMenuItem
            onClick={handleDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2Icon className="mr-2 h-4 w-4" />
            {t("common.delete", "Delete")}
          </ContextMenuItem>
        )}

        {onRename && (
          <ContextMenuItem onClick={(e) => onRename(node, e)}>
            <PencilLineIcon className="mr-2 h-4 w-4" />
            {t("node.menu.rename", "Rename")}
          </ContextMenuItem>
        )}

        {/* Pin/Unpin */}
        {isPinned ? (
          onUnpin && (
            <ContextMenuItem onClick={() => onUnpin(node)}>
              <PinOffIcon className="mr-2 h-4 w-4" />
              {t("node.menu.unpin", "Unpin")}
            </ContextMenuItem>
          )
        ) : (
          onPin && (
            <ContextMenuItem onClick={() => onPin(node)}>
              <PinIcon className="mr-2 h-4 w-4" />
              {t("node.menu.pin", "Pin")}
            </ContextMenuItem>
          )
        )}

        {/* Add to Chat */}
        {onAddToChat && (
          <ContextMenuItem onClick={() => onAddToChat(node)}>
            <MessageSquareIcon className="mr-2 h-4 w-4" />
            {t("node.menu.addToChat", "Add to Chat")}
          </ContextMenuItem>
        )}

        {/* Create sub-items (only for folders) */}
        {isFolder && (onCreateDoc || onCreateTable || onCreateFolder) && (
          <>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <FolderPlusIcon className="mr-2 h-4 w-4" />
                {t("node.menu.new", "New")}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {onCreateDoc && (
                  <ContextMenuItem onClick={() => onCreateDoc(node)}>
                    <FileIcon className="mr-2 h-4 w-4" />
                    {t("node.menu.newDoc", "New Doc")}
                  </ContextMenuItem>
                )}
                {onCreateTable && (
                  <ContextMenuItem onClick={() => onCreateTable(node)}>
                    <FileSpreadsheetIcon className="mr-2 h-4 w-4" />
                    {t("node.menu.newTable", "New Table")}
                  </ContextMenuItem>
                )}
                {onCreateFolder && (
                  <ContextMenuItem onClick={() => onCreateFolder(node)}>
                    <FolderPlusIcon className="mr-2 h-4 w-4" />
                    {t("node.menu.newFolder", "New Folder")}
                  </ContextMenuItem>
                )}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

