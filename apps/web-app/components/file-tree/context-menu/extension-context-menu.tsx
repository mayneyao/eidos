"use client"

import React, { useState } from "react"
import type { IDirectoryEntry } from "@eidos.space/core/types/IExternalFileSystem"
import {
  CopyIcon,
  ExternalLinkIcon,
  FileCodeIcon,
  FilesIcon,
  Globe2Icon,
  PencilLineIcon,
  PinIcon,
  PinOffIcon,
  SettingsIcon,
  Share2Icon,
  Trash2Icon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  NativeContextMenu as ContextMenu,
  NativeContextMenuContent as ContextMenuContent,
  NativeContextMenuItem as ContextMenuItem,
  NativeContextMenuSeparator as ContextMenuSeparator,
  NativeContextMenuTrigger as ContextMenuTrigger,
  NativeContextMenuShortcut,
} from "@/components/ui/native-context-menu"
import { useFavBlocks } from "@/apps/web-app/hooks/use-fav-blocks"

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
  onOpenInNewTab?: (node: FileTreeNode) => void
  onShare?: (node: FileTreeNode) => void
  onCopyCode?: (node: FileTreeNode) => void
  onOpenStandalone?: (node: FileTreeNode) => void
  onOpenDefaultBrowser?: (node: FileTreeNode) => void
  isMultiSelection?: boolean
  selectionCount?: number
  selectionHasDataview?: boolean
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
  onOpenInNewTab,
  onShare,
  onCopyCode,
  onOpenStandalone,
  onOpenDefaultBrowser,
  isMultiSelection = false,
  selectionCount = 1,
}: ExtensionContextMenuProps) => {
  const { t } = useTranslation()
  const { isFavorite, toggleFavBlock } = useFavBlocks()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const extensionType = node.metadata?.extensionType || "script"
  const extensionIcon = node.metadata?.icon
  const nodeId = node.metadata?.nodeId
  const isBlockExtension = extensionType === "block"

  const showCreateGroup = !isMultiSelection && Boolean(onCopy)
  const showOpenGroup =
    !isMultiSelection &&
    Boolean(
      onOpenInNewTab ||
      (isBlockExtension && onOpenStandalone) ||
      (isBlockExtension && onOpenDefaultBrowser)
    )
  const showMediumRiskGroup =
    !isMultiSelection &&
    Boolean(
      onShare ||
      onCopyCode ||
      (extensionType === "block" && nodeId) ||
      onCopySlug
    )

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
          {/* Create operations (low risk, high frequency) */}
          {showCreateGroup && onCopy && (
            <ContextMenuItem onClick={() => onCopy(node)}>
              <FilesIcon className="mr-2 h-4 w-4" />
              {t("extension.duplicate", "Duplicate")}
            </ContextMenuItem>
          )}

          {showCreateGroup && showOpenGroup && <ContextMenuSeparator />}

          {/* Open operations */}
          {showOpenGroup && (
            <>
              {!isMultiSelection && onOpenInNewTab && (
                <ContextMenuItem onClick={() => onOpenInNewTab(node)}>
                  <ExternalLinkIcon className="mr-2 h-4 w-4" />
                  {t("node.menu.openInNewTab", "Open in New Tab")}
                </ContextMenuItem>
              )}

              {!isMultiSelection && isBlockExtension && onOpenStandalone && (
                <ContextMenuItem onClick={() => onOpenStandalone(node)}>
                  <ExternalLinkIcon className="mr-2 h-4 w-4" />
                  {t("extension.previewInNewWindow", "Preview in New Window")}
                </ContextMenuItem>
              )}

              {!isMultiSelection &&
                isBlockExtension &&
                onOpenDefaultBrowser && (
                  <ContextMenuItem onClick={() => onOpenDefaultBrowser(node)}>
                    <Globe2Icon className="mr-2 h-4 w-4" />
                    {t(
                      "extension.previewInDefaultBrowser",
                      "Preview in Default Browser"
                    )}
                  </ContextMenuItem>
                )}
            </>
          )}

          {showOpenGroup && showMediumRiskGroup && <ContextMenuSeparator />}

          {/* Medium-risk operations */}
          {showMediumRiskGroup && (
            <>
              {!isMultiSelection && onCopySlug && (
                <ContextMenuItem onClick={() => onCopySlug(node)}>
                  <CopyIcon className="mr-2 h-4 w-4" />
                  {t("extension.copySlug", "Copy Slug")}
                </ContextMenuItem>
              )}

              {!isMultiSelection && onCopyCode && (
                <ContextMenuItem onClick={() => onCopyCode(node)}>
                  <FileCodeIcon className="mr-2 h-4 w-4" />
                  {t("extension.copyCode", "Copy Code")}
                </ContextMenuItem>
              )}

              {!isMultiSelection && extensionType === "block" && nodeId && (
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

              {!isMultiSelection && onShare && (
                <ContextMenuItem onClick={() => onShare(node)}>
                  <Share2Icon className="mr-2 h-4 w-4" />
                  {t("extension.share", "Share")}
                </ContextMenuItem>
              )}
            </>
          )}

          {/* Rename and delete operations */}
          {((!isMultiSelection && onRename) || onDelete) && (
            <>
              {/* Show separator if there are other actions above */}
              {!isMultiSelection &&
                (showCreateGroup || showOpenGroup || showMediumRiskGroup) && (
                  <ContextMenuSeparator />
                )}

              {!isMultiSelection && onRename && (
                <ContextMenuItem onClick={() => onRename(node)}>
                  <PencilLineIcon className="mr-2 h-4 w-4" />
                  <span className="flex-1">
                    {t("node.menu.rename", "Rename")}
                  </span>
                  <NativeContextMenuShortcut>F2</NativeContextMenuShortcut>
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
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Delete confirmation dialog for extensions */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isMultiSelection
                ? t("extension.confirmDeleteMultiple", "Delete selected items?")
                : node.metadata?.isVirtualFolder
                  ? t("extension.confirmDeleteFolder", "Delete folder?")
                  : t("common.confirmDelete", "Confirm Delete")}
            </DialogTitle>
            <DialogDescription>
              {isMultiSelection
                ? t(
                    "extension.deleteWarningMultiple",
                    "Are you sure you want to delete these items? This action cannot be undone and items cannot be recovered from Trash."
                  )
                : node.metadata?.isVirtualFolder
                  ? t(
                      "extension.deleteFolderWarning",
                      "Are you sure you want to delete this folder and all extensions inside (including subfolders)? This action cannot be undone and items cannot be recovered from Trash."
                    )
                  : t(
                      "extension.deleteWarning",
                      "Are you sure you want to delete this extension? This action cannot be undone and items cannot be recovered from Trash."
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
