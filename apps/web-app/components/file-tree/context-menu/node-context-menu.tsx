"use client"

import type { IDirectoryEntry } from "@eidos.space/core/types/IExternalFileSystem"
import {
  FileIcon,
  FileSpreadsheetIcon,
  FolderPlusIcon,
  MessageSquareIcon,
  PencilLineIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react"
import React from "react"
import { useTranslation } from "react-i18next"

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

interface FileTreeNode extends IDirectoryEntry {
  children?: FileTreeNode[]
}

interface NodeContextMenuProps {
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
}

/**
 * Context menu specifically for node types (table, doc, folder, etc.)
 */
export const NodeContextMenu = ({
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
}: NodeContextMenuProps) => {
  const { t } = useTranslation()

  const isPinned = node.metadata?.isPinned
  const isFolder = node.kind === "directory" || node.metadata?.nodeType === "folder"

  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full">{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {/* Basic operations */}
        {onDelete && (
          <ContextMenuItem
            onClick={() => onDelete(node)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2Icon className="mr-2 h-4 w-4" />
            {t("common.delete", "Delete")}
          </ContextMenuItem>
        )}

        {onRename && (
          <ContextMenuItem onClick={() => onRename(node)}>
            <PencilLineIcon className="mr-2 h-4 w-4" />
            {t("node.menu.rename", "Rename")}
          </ContextMenuItem>
        )}

        {/* Pin/Unpin */}
        {isPinned
          ? onUnpin && (
              <ContextMenuItem onClick={() => onUnpin(node)}>
                <PinOffIcon className="mr-2 h-4 w-4" />
                {t("node.menu.unpin", "Unpin")}
              </ContextMenuItem>
            )
          : onPin && (
              <ContextMenuItem onClick={() => onPin(node)}>
                <PinIcon className="mr-2 h-4 w-4" />
                {t("node.menu.pin", "Pin")}
              </ContextMenuItem>
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

