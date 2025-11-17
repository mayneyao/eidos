"use client"

import type { IDirectoryEntry } from "@eidos.space/core/types/IExternalFileSystem"
import type { FileHandlerMeta, IExtension } from "@/packages/core/types/IExtension"
import { FileIcon, PencilLineIcon, Trash2Icon } from "lucide-react"
import React from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"

import {
  getFileExtension,
  useFileHandlers,
} from "@/hooks/use-file-handlers"
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

interface FileContextMenuProps {
  node: FileTreeNode
  children: React.ReactNode
  onRename?: (node: FileTreeNode) => void
  onDelete?: (node: FileTreeNode) => void
}

/**
 * Context menu for regular files (no metadata.nodeType)
 * Provides menu with rename, delete, and "Open with" options
 */
export const FileContextMenu = ({
  node,
  children,
  onRename,
  onDelete,
}: FileContextMenuProps) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const fileExtension = getFileExtension(node.path)
  const { handlers, isLoading: isLoadingHandlers } = useFileHandlers(fileExtension)

  const hasMultipleHandlers = handlers.length > 1

  const handleOpenWith = (handler: IExtension<FileHandlerMeta>) => {
    // Navigate to file handler page with handler ID in query parameter
    // This is a temporary selection, not saved as default handler
    navigate(`/file-handler?handler=${handler.id}#${node.path}`)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full">{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {/* Open with submenu (only show if multiple handlers available) */}
        {!isLoadingHandlers && hasMultipleHandlers && (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <FileIcon className="mr-2 h-4 w-4" />
                {t("file.menu.openWith", "Open with")}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {handlers.map((handler) => {
                  const meta = handler.meta as FileHandlerMeta
                  return (
                    <ContextMenuItem
                      key={handler.id}
                      onClick={() => handleOpenWith(handler)}
                    >
                      {meta.fileHandler.icon && (
                        <span className="mr-2">{meta.fileHandler.icon}</span>
                      )}
                      {meta.fileHandler.title || handler.name}
                    </ContextMenuItem>
                  )
                })}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
          </>
        )}

        {onRename && (
          <ContextMenuItem onClick={() => onRename(node)}>
            <PencilLineIcon className="mr-2 h-4 w-4" />
            {t("node.menu.rename", "Rename")}
          </ContextMenuItem>
        )}
        {onDelete && (
          <ContextMenuItem
            onClick={() => onDelete(node)}
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

